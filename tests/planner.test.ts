import { describe, it, expect } from "vitest";
import { Router } from "../src/lib/routing";
import {
  analyzePlan,
  confirmCandidate,
  finishPlan,
  undoPlan,
} from "../src/lib/planner";
import { parsePlan } from "../src/lib/storage";
import { fare, graphOf, place, plan } from "./fixtures";

const router = () =>
  new Router(
    graphOf(
      [
        [0, 0],
        [15000, 0],
        [15000, 1000],
        [0, 1000],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
    ),
  );
describe("planning state", () => {
  it("queries and replaces candidates without changing the confirmed budget or plan", () => {
    const p = plan(),
      r = router();
    analyzePlan(r, p, place(1000), fare);
    const analysis = analyzePlan(r, p, place(2000), fare);
    expect(p.visits).toHaveLength(0);
    expect(analysis.spent).toBe(0);
    expect(analysis.remaining).toBe(40000);
    expect(analysis.budget).toEqual({ visitCost: 0, returnCost: 0, remaining: 40000 });
  });
  it("reserves the return in the displayed balance while keeping routing funds separate", () => {
    const p = plan(),
      r = router(),
      before = analyzePlan(r, p, place(1000), fare);
    const confirmed = confirmCandidate(p, before),
      after = analyzePlan(r, confirmed, null, fare);
    expect(after.spent).toBe(4000);
    expect(after.remaining).toBe(36000);
    expect(after.returnRoute!.fare.total).toBe(4000);
    expect(after.budget).toEqual({ visitCost: 4000, returnCost: 4000, remaining: 32000 });
    expect(after.budget.remaining).toBe(before.candidate!.afterReturn);
    const undone = analyzePlan(r, undoPlan(confirmed), null, fare);
    expect(undone.spent).toBe(0);
    expect(undone.current.lng).toBeCloseTo(p.start.lng, 7);
    expect(undone.budget).toEqual({ visitCost: 0, returnCost: 0, remaining: 40000 });
  });
  it("replaces the previous return reservation when another visit is confirmed", () => {
    const r = router();
    const first = confirmCandidate(plan(60000), analyzePlan(r, plan(60000), place(1000), fare));
    const before = analyzePlan(r, first, null, fare);
    const preview = analyzePlan(r, first, place(6000), fare);
    expect(preview.budget).toEqual(before.budget);
    const next = confirmCandidate(first, preview);
    const after = analyzePlan(r, next, null, fare);
    expect(after.budget.returnCost).not.toBe(before.budget.returnCost);
    expect(after.budget.visitCost).toBe(before.budget.visitCost + preview.candidate!.outward!.fare.total);
    expect(after.budget.returnCost).toBe(preview.candidate!.homeward!.fare.total);
    expect(after.budget.remaining).toBe(preview.candidate!.afterReturn);
    expect(analyzePlan(r, undoPlan(next), null, fare).budget).toEqual(before.budget);
  });
  it("can spend reserved return funds on a visit back to the origin without charging twice", () => {
    const r = router(), p = plan(20000);
    const first = confirmCandidate(p, analyzePlan(r, p, place(6000), fare));
    const preview = analyzePlan(r, first, p.start, fare);
    expect(preview.candidate!.outward!.fare.total).toBeGreaterThan(preview.budget.remaining!);
    expect(preview.candidate!.affordable).toBe(true);
    const next = confirmCandidate(first, preview);
    expect(next.visits).toHaveLength(2);
    const after = analyzePlan(r, next, null, fare);
    expect(after.budget.returnCost).toBe(0);
    expect(after.budget.remaining).toBe(preview.candidate!.afterReturn);
    expect(after.budget.remaining).toBe(preview.budget.remaining);
  });
  it("shows a deficit and blocks completion when a smaller budget cannot cover the return", () => {
    const r = router(), p = plan(60000);
    const confirmed = confirmCandidate(p, analyzePlan(r, p, place(14000), fare));
    const reduced = { ...confirmed, budget: 20000 };
    const analysis = analyzePlan(r, reduced, null, fare);
    expect(analysis.remaining).toBeGreaterThanOrEqual(0);
    expect(analysis.budget.remaining).toBeLessThan(0);
    expect(finishPlan(reduced, analysis)).toBe(reduced);
  });
  it("does not present a missing return route as free or allow completion", () => {
    const r = new Router(graphOf([[0, 0], [10000, 0]], [[0, 1, 1]]));
    const restored = { ...plan(), visits: [place(2000)] };
    const analysis = analyzePlan(r, restored, null, fare);
    expect(analysis.budget.visitCost).toBeGreaterThan(0);
    expect(analysis.budget.returnCost).toBeNull();
    expect(analysis.budget.remaining).toBeNull();
    expect(finishPlan(restored, analysis)).toBe(restored);
  });
  it("blocks over-budget visits but still returns both routes", () => {
    const p = plan(20000),
      result = analyzePlan(router(), p, place(14000), fare);
    expect(result.candidate!.outward).not.toBeNull();
    expect(result.candidate!.homeward).not.toBeNull();
    expect(result.candidate!.affordable).toBe(false);
    expect(confirmCandidate(p, result)).toBe(p);
  });
  it("handles no return path, off-road locations and repeated selection", () => {
    const r = new Router(
        graphOf(
          [
            [0, 0],
            [10000, 0],
          ],
          [[0, 1, 1]],
        ),
      ),
      p = plan();
    expect(analyzePlan(r, p, place(2000), fare).candidate!.issue).toBe(
      "no-return",
    );
    expect(analyzePlan(r, p, place(1000, 2000), fare).candidate!.issue).toBe(
      "no-access",
    );
    const same = analyzePlan(r, p, place(0), fare);
    expect(same.candidate!.issue).toBe("same-position");
    expect(confirmCandidate(p, same)).toBe(p);
  });
  it.each([20000, 40000, 60000, 80000])(
    "supports a complete multi-stop day on budget %i",
    (budget) => {
      const r = router();
      let p = plan(budget);
      for (const x of [500, 1000, 1500])
        p = confirmCandidate(p, analyzePlan(r, p, place(x), fare));
      expect(p.visits).toHaveLength(3);
      const beforeFinish = analyzePlan(r, p, null, fare);
      p = finishPlan(p, beforeFinish);
      const finished = analyzePlan(r, p, null, fare);
      expect(p.finished).toBe(true);
      expect(finished.rides).toBe(4);
      expect(finished.remaining).toBeGreaterThanOrEqual(0);
      expect(finished.budget).toEqual(beforeFinish.budget);
      expect(finished.confirmed[p.visits.length].fare.total).toBe(finished.budget.returnCost);
      expect(finished.spent).toBe(finished.budget.visitCost + finished.budget.returnCost!);
      expect(finished.remaining).toBe(finished.budget.remaining);
      expect(undoPlan(p).finished).toBe(false);
      expect(undoPlan(p).visits).toHaveLength(3);
      expect(analyzePlan(r, undoPlan(p), null, fare).budget).toEqual(beforeFinish.budget);
      const restored = parsePlan(JSON.stringify(p), "test")!;
      expect(analyzePlan(r, restored, null, fare).budget).toEqual(beforeFinish.budget);
    },
  );
  it("allows a distinct end and does not charge a zero-distance final leg", () => {
    const r = router();
    let p = { ...plan(), sameEnd: false, end: place(1000) };
    p = confirmCandidate(p, analyzePlan(r, p, place(1000), fare));
    const result = analyzePlan(
      r,
      finishPlan(p, analyzePlan(r, p, null, fare)),
      null,
      fare,
    );
    expect(result.spent).toBe(4000);
    expect(result.rides).toBe(1);
    expect(result.budget).toEqual({ visitCost: 4000, returnCost: 0, remaining: 36000 });
  });
  it("restores saved state and rejects incompatible/corrupt plans", () => {
    const p = { ...plan(), visits: [place(500)] };
    expect(parsePlan(JSON.stringify(p), "test")).toEqual(p);
    expect(parsePlan(JSON.stringify(p), "new-graph")).toBeNull();
    expect(parsePlan("{broken", "test")).toBeNull();
    expect(parsePlan(JSON.stringify({ ...p, budget: -1 }), "test")).toBeNull();
  });
});
