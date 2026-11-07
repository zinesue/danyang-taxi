import type { FeatureCollection, LineString } from "geojson";
import type { FareConfig, FareOptions, Snap } from "../types";
import { calculateFare, fareThresholds } from "./fare";
import { sliceEdge } from "./geometry";
import { Router } from "./routing";

interface DistanceFunction {
  slope: 1 | -1;
  intercept: number;
  lo: number;
  hi: number;
}
function lowerBound(values: number[], value: number) {
  let lo = 0,
    hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * A shortest distance along an edge is the minimum of a few affine functions.
 * Split at every fare discontinuity of those functions. The fare sum is constant
 * inside each resulting interval, so testing its midpoint is exact for this model.
 * This also finds feasible islands when both edge endpoints are unaffordable.
 */
export function reachableRoads(
  router: Router,
  current: Snap,
  end: Snap,
  budget: number,
  config: FareConfig,
  options: FareOptions,
) {
  const collection: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: [],
  };
  if (budget < 0) return { collection, length: 0 };
  const outward = router.tree(current),
    homeward = router.tree(end, true);
  let limit = config.baseDistance;
  while (
    calculateFare(limit, config, options).total <= budget &&
    limit < 2000000
  )
    limit *= 2;
  const thresholds = fareThresholds(limit, config).sort((a, b) => a - b);
  let length = 0;
  router.graph.edges.forEach((edge, id) => {
    const a: DistanceFunction[] = [],
      b: DistanceFunction[] = [];
    const add = (
      list: DistanceFunction[],
      slope: 1 | -1,
      intercept: number,
      lo = 0,
      hi = edge.m,
    ) => {
      if (Number.isFinite(intercept)) list.push({ slope, intercept, lo, hi });
    };
    if (edge.dir !== -1) {
      add(a, 1, outward.distances[edge.a]);
      add(b, -1, homeward.distances[edge.b] + edge.m);
    }
    if (edge.dir !== 1) {
      add(a, -1, outward.distances[edge.b] + edge.m);
      add(b, 1, homeward.distances[edge.a]);
    }
    if (current.edge === id) {
      if (edge.dir !== -1) add(a, 1, -current.offset, current.offset, edge.m);
      if (edge.dir !== 1) add(a, -1, current.offset, 0, current.offset);
    }
    if (end.edge === id) {
      if (edge.dir !== -1) add(b, -1, end.offset, 0, end.offset);
      if (edge.dir !== 1) add(b, 1, -end.offset, end.offset, edge.m);
    }
    if (!a.length || !b.length) return;
    const cuts = new Set<number>([0, edge.m]);
    for (const f of [...a, ...b]) {
      cuts.add(f.lo);
      cuts.add(f.hi);
      const d0 = f.slope * f.lo + f.intercept,
        d1 = f.slope * f.hi + f.intercept;
      const minimum = Math.max(0, Math.min(d0, d1)),
        maximum = Math.max(d0, d1);
      for (
        let i = lowerBound(thresholds, minimum - 1e-6);
        i < thresholds.length && thresholds[i] <= maximum + 1e-6;
        i++
      ) {
        const x = (thresholds[i] - f.intercept) / f.slope;
        if (x > f.lo && x < f.hi) cuts.add(x);
      }
    }
    const distance = (functions: DistanceFunction[], x: number) => {
      let best = Infinity;
      for (const f of functions)
        if (x >= f.lo - 1e-8 && x <= f.hi + 1e-8)
          best = Math.min(best, Math.max(0, f.slope * x + f.intercept));
      return best;
    };
    const sorted = [...cuts].sort((x, y) => x - y);
    const intervals: [number, number][] = [];
    for (let i = 1; i < sorted.length; i++) {
      const lo = sorted[i - 1],
        hi = sorted[i];
      if (hi - lo < 1e-5) continue;
      const x = (lo + hi) / 2,
        d1 = distance(a, x),
        d2 = distance(b, x);
      if (!Number.isFinite(d1 + d2) || d1 > limit || d2 > limit) continue;
      if (
        calculateFare(d1, config, options).total +
          calculateFare(d2, config, options).total <=
        budget
      ) {
        const last = intervals[intervals.length - 1];
        if (last && Math.abs(last[1] - lo) < 1e-6) last[1] = hi;
        else intervals.push([lo, hi]);
      }
    }
    for (const [lo, hi] of intervals) {
      length += hi - lo;
      collection.features.push({
        type: "Feature",
        properties: { edge: id, from: lo, to: hi },
        geometry: {
          type: "LineString",
          coordinates: sliceEdge(edge, router.offsets[id], lo, hi),
        },
      });
    }
  });
  return { collection, length };
}
