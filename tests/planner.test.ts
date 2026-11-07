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
  });
  it("charges only the outgoing ride on confirmation and restores it on undo", () => {
    const p = plan(),
      r = router(),
      before = analyzePlan(r, p, place(1000), fare);
    const confirmed = confirmCandidate(p, before),
      after = analyzePlan(r, confirmed, null, fare);
    expect(after.spent).toBe(4000);
    expect(after.remaining).toBe(36000);
    expect(after.returnRoute!.fare.total).toBe(4000);
    const undone = analyzePlan(r, undoPlan(confirmed), null, fare);
    expect(undone.spent).toBe(0);
    expect(undone.current.lng).toBeCloseTo(p.start.lng, 7);
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
      p = finishPlan(p, analyzePlan(r, p, null, fare));
      const finished = analyzePlan(r, p, null, fare);
      expect(p.finished).toBe(true);
      expect(finished.rides).toBe(4);
      expect(finished.remaining).toBeGreaterThanOrEqual(0);
      expect(undoPlan(p).finished).toBe(false);
      expect(undoPlan(p).visits).toHaveLength(3);
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
  });
  it("restores saved state and rejects incompatible/corrupt plans", () => {
    const p = { ...plan(), visits: [place(500)] };
    expect(parsePlan(JSON.stringify(p), "test")).toEqual(p);
    expect(parsePlan(JSON.stringify(p), "new-graph")).toBeNull();
    expect(parsePlan("{broken", "test")).toBeNull();
    expect(parsePlan(JSON.stringify({ ...p, budget: -1 }), "test")).toBeNull();
  });
});
