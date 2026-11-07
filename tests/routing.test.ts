import { describe, it, expect } from "vitest";
import { Router } from "../src/lib/routing";
import { fare, options, graphOf, place, vertex } from "./fixtures";

describe("road routing and snapping", () => {
  it("connects to an edge interior and includes only the traveled portion", () => {
    const router = new Router(
      graphOf(
        [
          [0, 0],
          [1000, 0],
          [2000, 0],
        ],
        [
          [0, 1],
          [1, 2],
        ],
      ),
    );
    const a = router.snap(place(250, 20))!,
      b = router.snap(place(1750))!;
    expect(a.distanceToRoad).toBeCloseTo(20, 0);
    const result = router.route(a, b, fare, options)!;
    expect(result.distance).toBeCloseTo(1500, 2);
    expect(result.coordinates[0][0]).toBeCloseTo(place(250).lng, 7);
    expect(result.coordinates.at(-1)![0]).toBeCloseTo(place(1750).lng, 7);
  });
  it("handles two positions on the same edge without a detour", () => {
    const router = new Router(
      graphOf(
        [
          [0, 0],
          [10000, 0],
        ],
        [[0, 1]],
      ),
    );
    expect(
      router.route(
        router.snap(place(3000))!,
        router.snap(place(3500))!,
        fare,
        options,
      )!.distance,
    ).toBeCloseTo(500, 2);
  });
  it("uses shortest road distance instead of straight distance", () => {
    const router = new Router(
      graphOf(
        [
          [0, 0],
          [1000, 0],
          [1000, 1000],
          [0, 1000],
        ],
        [
          [0, 1],
          [1, 2],
          [2, 3],
        ],
      ),
    );
    expect(
      router.route(
        router.snap(place(0, 0))!,
        router.snap(place(0, 1000))!,
        fare,
        options,
      )!.distance,
    ).toBeCloseTo(3000, 2);
  });
  it("respects directed routes and reverse shortest-path costs", () => {
    const router = new Router(
      graphOf(
        [
          [0, 0],
          [1000, 0],
          [1000, 1000],
          [0, 1000],
        ],
        [
          [0, 1, 1],
          [1, 2, 1],
          [2, 3, 1],
          [3, 0, 1],
        ],
      ),
    );
    const a = router.snap(place(250))!,
      b = router.snap(place(750))!;
    expect(router.route(a, b, fare, options)!.distance).toBeCloseTo(500, 2);
    expect(router.route(b, a, fare, options)!.distance).toBeCloseTo(3500, 2);
    const reverse = router.tree(a, true);
    expect(reverse.distances[1]).toBeCloseTo(3250, 2);
  });
  it("returns no path when the return direction or connection is absent", () => {
    const router = new Router(
      graphOf(
        [
          [0, 0],
          [1000, 0],
          [2000, 0],
          [3000, 0],
        ],
        [
          [0, 1, 1],
          [2, 3],
        ],
      ),
    );
    expect(
      router.route(
        router.snap(place(750))!,
        router.snap(place(250))!,
        fare,
        options,
      ),
    ).toBeNull();
    expect(
      router.route(
        router.snap(place(250))!,
        router.snap(place(2500))!,
        fare,
        options,
      ),
    ).toBeNull();
    expect(router.snap(place(0, 1000))).toBeNull();
  });
  it("does not introduce junctions at interior geometric crossings", () => {
    const router = new Router(
      graphOf(
        [
          [-1000, 0],
          [1000, 0],
          [0, -1000],
          [0, 1000],
        ],
        [
          [0, 1],
          [2, 3],
        ],
      ),
    );
    expect(
      router.route(
        router.snap(place(-900))!,
        router.snap(place(0, 900))!,
        fare,
        options,
      ),
    ).toBeNull();
  });
  it("reconstructs the shorter end of a self-loop without drawing a long detour", () => {
    const graph = graphOf(
      [
        [0, 0],
        [-1000, 0],
      ],
      [[0, 1]],
    );
    graph.edges.push({
      a: 0,
      b: 0,
      m: 4000,
      dir: 0,
      name: 0,
      coords: [
        vertex(0, 0),
        vertex(1000, 0),
        vertex(1000, 1000),
        vertex(0, 1000),
        vertex(0, 0),
      ],
    });
    const router = new Router(graph);
    const result = router.route(
      router.pointOnEdge(1, 3500),
      router.pointOnEdge(0, 500),
      fare,
      options,
    )!;
    expect(result.distance).toBe(1000);
    expect(result.coordinates.every((c) => c[0] <= place(0).lng + 1e-7)).toBe(
      true,
    );
  });
});
