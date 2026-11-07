import { describe, it, expect } from "vitest";
import { Router } from "../src/lib/routing";
import { reachableRoads } from "../src/lib/reachability";
import { fare, options, graphOf, place } from "./fixtures";

describe("return-budget reachability", () => {
  it("requires two independent base fares, and handles the interior boundary", () => {
    const router = new Router(
      graphOf(
        [
          [0, 0],
          [10000, 0],
        ],
        [[0, 1]],
      ),
    );
    const current = router.snap(place(0))!;
    const result = reachableRoads(
      router,
      current,
      current,
      8000,
      fare,
      options,
    );
    expect(result.length).toBeCloseTo(1350, 3);
    expect(
      reachableRoads(router, current, current, 7999, fare, options).length,
    ).toBeLessThan(0.1);
  });
  it("finds feasible middle intervals even if both endpoints are unaffordable", () => {
    const router = new Router(
      graphOf(
        [
          [0, 0],
          [10000, 0],
        ],
        [[0, 1]],
      ),
    );
    const current = router.snap(place(4500))!,
      end = router.snap(place(5500))!;
    const result = reachableRoads(router, current, end, 8000, fare, options);
    expect(result.length).toBeCloseTo(1700, 2);
    expect(result.collection.features[0].properties!.from).toBeCloseTo(4150, 2);
  });
  it("agrees with exhaustive point queries on directed and bidirectional edges", () => {
    const router = new Router(
      graphOf(
        [
          [0, 0],
          [4000, 0],
          [4000, 3000],
          [0, 3000],
          [1500, 1500],
        ],
        [
          [0, 1, 1],
          [1, 2, 1],
          [2, 3],
          [3, 0, 1],
          [0, 4],
          [4, 2],
        ],
      ),
    );
    const current = router.pointOnEdge(0, 500),
      end = router.pointOnEdge(2, 1200);
    for (const budget of [8000, 12000, 20000, 40000]) {
      const result = reachableRoads(router, current, end, budget, fare, {
        margin: 10,
        callFee: true,
      });
      router.graph.edges.forEach((edge, id) => {
        for (let offset = 17; offset < edge.m; offset += 97) {
          const point = router.pointOnEdge(id, offset);
          const outward = router.route(current, point, fare, {
            margin: 10,
            callFee: true,
          });
          const homeward = router.route(point, end, fare, {
            margin: 10,
            callFee: true,
          });
          const actual =
            !!outward &&
            !!homeward &&
            outward.fare.total + homeward.fare.total <= budget;
          const shown = result.collection.features.some(
            (f) =>
              f.properties!.edge === id &&
              offset > f.properties!.from &&
              offset < f.properties!.to,
          );
          expect(shown, `budget=${budget}, edge=${id}, offset=${offset}`).toBe(
            actual,
          );
        }
      });
    }
  });
});
