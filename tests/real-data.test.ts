import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, it, expect } from "vitest";
import type { Graph, Metadata, Place, Plan } from "../src/types";
import { Router } from "../src/lib/routing";
import {
  analyzePlan,
  confirmCandidate,
  finishPlan,
  undoPlan,
} from "../src/lib/planner";
import { fare } from "./fixtures";
import { isTestPlan } from "../src/lib/testConfig";

const graph = JSON.parse(
  gunzipSync(readFileSync("public/data/road-graph.json.gz")).toString(),
) as Graph;
const metadata = JSON.parse(
  readFileSync("public/data/network-metadata.json", "utf8"),
) as Metadata;
const names = JSON.parse(
  readFileSync("public/data/road-search.json", "utf8"),
) as Place[];
const initialized = performance.now();
const router = new Router(graph);
const initializationMs = performance.now() - initialized;
const makePlan = (budget: number): Plan => ({
  schema: 1,
  graphVersion: graph.version,
  budget,
  options: { margin: 10, callFee: false },
  start: metadata.defaultStart,
  end: metadata.defaultStart,
  sameEnd: true,
  visits: [],
  finished: false,
});

describe("supplied Danyang SHP data", () => {
  it("preserves geometry endpoints and sane lengths in the exported graph", () => {
    expect(graph.edges.length).toBeGreaterThan(5000);
    for (const edge of graph.edges) {
      expect(edge.coords[0]).toEqual(graph.nodes[edge.a]);
      expect(edge.coords.at(-1)).toEqual(graph.nodes[edge.b]);
      expect(edge.m).toBeGreaterThan(0);
      expect(edge.coords.every((point) => point.every(Number.isFinite))).toBe(
        true,
      );
    }
  });
  it.each([20000, 40000, 60000, 80000, 100000, 120000, 140000, 160000])(
    "computes real-road reachable segments on budget %i",
    (budget) => {
      const result = analyzePlan(router, makePlan(budget), null, fare);
      expect(result.returnRoute!.fare.total).toBe(0);
      expect(result.reachable.features.length).toBeGreaterThan(20);
      expect(result.reachableKm).toBeGreaterThan(1);
      // Sample green interiors and compare to independent shortest route queries.
      const selected = result.reachable.features.filter(
        (_, i) =>
          i % Math.max(1, Math.floor(result.reachable.features.length / 25)) ===
          0,
      );
      for (const segment of selected) {
        const p = segment.properties!;
        const snap = router.pointOnEdge(p.edge, (p.from + p.to) / 2);
        const go = router.route(
          result.current,
          snap,
          fare,
          makePlan(budget).options,
        )!;
        const back = router.route(
          snap,
          result.end,
          fare,
          makePlan(budget).options,
        )!;
        expect(go.fare.total + back.fare.total).toBeLessThanOrEqual(budget);
      }
      console.log(
        JSON.stringify({
          budget,
          reachableKm: +result.reachableKm.toFixed(1),
          analysisMs: +result.elapsedMs.toFixed(1),
          initializationMs: +initializationMs.toFixed(1),
        }),
      );
    },
  );
  it("repairs the diagnosed small gaps and fixes the origin on Sonogil", () => {
    expect(metadata.defaultStart.name).toBe("소노길");
    expect(router.snap(metadata.defaultStart)?.name).toBe("소노길");
    for (const [first, second] of [[30, 1961], [824, 2568], [2330, 289]]) {
      const a = graph.edges.filter(edge => edge.record === first);
      const b = graph.edges.filter(edge => edge.record === second);
      const endpoints = new Set(a.flatMap(edge => [edge.a, edge.b]));
      // One source record can contain separate multipart roads. Check the
      // repaired junction itself, without inventing links to unrelated parts.
      expect(b.some(edge => edge.component === 0 &&
        (endpoints.has(edge.a) || endpoints.has(edge.b)))).toBe(true);
    }
  });
  it("rejects saved settings that could restore disabled controls", () => {
    const p = makePlan(40000);
    expect(isTestPlan(p, metadata)).toBe(true);
    for (const budget of [0, 30000, 180000])
      expect(isTestPlan({ ...p, budget }, metadata)).toBe(false);
    expect(isTestPlan({ ...p, sameEnd: false }, metadata)).toBe(false);
    expect(isTestPlan({ ...p, start: { ...p.start, lng: p.start.lng + 0.01 } }, metadata)).toBe(false);
    expect(isTestPlan({ ...p, end: { ...p.end, lat: p.end.lat + 0.01 } }, metadata)).toBe(false);
    expect(isTestPlan({ ...p, options: { margin: 0, callFee: false } }, metadata)).toBe(false);
    expect(isTestPlan({ ...p, options: { margin: 10, callFee: true } }, metadata)).toBe(false);
  });
  it("completes a real multi-stop plan, restores undo, and caches repeated queries", () => {
    let p = makePlan(80000);
    const nearby = names
      .filter(
        (n) => Math.hypot(n.lng - p.start.lng, n.lat - p.start.lat) < 0.025,
      )
      .slice(0, 4);
    expect(nearby.length).toBeGreaterThan(1);
    for (const candidate of nearby) {
      const result = analyzePlan(router, p, candidate, fare);
      if (result.candidate?.affordable && !result.candidate.issue)
        p = confirmCandidate(p, result);
    }
    expect(p.visits.length).toBeGreaterThan(1);
    const prior = analyzePlan(router, p, null, fare);
    const again = analyzePlan(router, p, names[0], fare);
    expect(again.reachable).toBe(prior.reachable);
    const finished = finishPlan(p, prior);
    expect(finished.finished).toBe(true);
    expect(
      analyzePlan(router, finished, null, fare).remaining,
    ).toBeGreaterThanOrEqual(0);
    expect(undoPlan(finished)).toEqual(p);
  });
  it("reports an isolated source component as unreachable instead of connecting across a gap", () => {
    const id = graph.edges.findIndex((e) => e.component === 1);
    const point = router.pointOnEdge(id, graph.edges[id].m / 2);
    const result = analyzePlan(router, makePlan(80000), point, fare);
    expect(result.candidate!.issue).toBe("no-outward");
  });
});
