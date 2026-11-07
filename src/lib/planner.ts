import type {
  Analysis,
  CandidateResult,
  FareConfig,
  Place,
  Plan,
  Route,
  Snap,
} from "../types";
import { ZERO_DISTANCE_M } from "./fare";
import { reachableRoads } from "./reachability";
import { Router } from "./routing";

const areaCache = new WeakMap<
  Router,
  { key: string; value: ReturnType<typeof reachableRoads> }
>();

export function analyzePlan(
  router: Router,
  plan: Plan,
  candidate: Place | null,
  fare: FareConfig,
): Analysis {
  const timer = performance.now();
  const connect = (place: Place, label: string): Snap => {
    const snap = router.snap(place);
    if (!snap)
      throw new Error(
        `${label}에서 500m 이내 분석 도로를 찾을 수 없습니다. 지도에서 도로 가까운 위치를 선택해 주세요.`,
      );
    return snap;
  };
  const start = connect(plan.start, "출발지"),
    end = connect(plan.sameEnd ? plan.start : plan.end, "최종 도착지");
  const visits = plan.visits.map((place, i) =>
    connect(place, `${i + 1}번 방문지`),
  );
  const confirmed: Route[] = [];
  let current = start;
  for (const visit of visits) {
    const route = router.route(current, visit, fare, plan.options);
    if (!route)
      throw new Error(
        "저장된 방문지 사이에 연결된 경로가 없습니다. 마지막 방문지를 취소해 주세요.",
      );
    confirmed.push(route);
    current = visit;
  }
  let returnRoute = router.route(current, end, fare, plan.options);
  if (plan.finished) {
    if (!returnRoute)
      throw new Error("최종 도착지까지 연결된 경로가 없습니다.");
    confirmed.push(returnRoute);
    current = end;
    returnRoute = router.route(end, end, fare, plan.options);
  }
  const spent = confirmed.reduce((sum, route) => sum + route.fare.total, 0),
    remaining = plan.budget - spent;
  let result: CandidateResult | null = null;
  if (candidate && !plan.finished) {
    const snap = router.snap(candidate);
    const outward = snap
      ? router.route(current, snap, fare, plan.options)
      : null;
    const homeward = snap ? router.route(snap, end, fare, plan.options) : null;
    const afterVisit = outward ? remaining - outward.fare.total : null;
    const afterReturn =
      afterVisit !== null && homeward ? afterVisit - homeward.fare.total : null;
    result = {
      requested: candidate,
      snap,
      outward,
      homeward,
      affordable: afterReturn !== null && afterReturn >= 0,
      afterVisit,
      afterReturn,
      issue: !snap
        ? "no-access"
        : !outward
          ? "no-outward"
          : !homeward
            ? "no-return"
            : outward.distance <= ZERO_DISTANCE_M
              ? "same-position"
              : null,
    };
  }
  const areaKey = JSON.stringify([
    current.edge,
    current.offset,
    end.edge,
    end.offset,
    remaining,
    plan.options,
    fare,
  ]);
  const cached = areaCache.get(router);
  const reachable = plan.finished
    ? {
        collection: { type: "FeatureCollection" as const, features: [] },
        length: 0,
      }
    : cached?.key === areaKey
      ? cached.value
      : reachableRoads(router, current, end, remaining, fare, plan.options);
  if (!plan.finished && cached?.key !== areaKey)
    areaCache.set(router, { key: areaKey, value: reachable });
  return {
    start,
    end,
    current,
    visits,
    confirmed,
    returnRoute,
    spent,
    remaining,
    totalDistance: confirmed.reduce((sum, route) => sum + route.distance, 0),
    rides: confirmed.filter((route) => route.distance > ZERO_DISTANCE_M).length,
    reachable: reachable.collection,
    reachableKm: reachable.length / 1000,
    candidate: result,
    elapsedMs: performance.now() - timer,
  };
}

export function confirmCandidate(plan: Plan, analysis: Analysis): Plan {
  const candidate = analysis.candidate;
  if (
    plan.finished ||
    !candidate?.affordable ||
    !candidate.snap ||
    candidate.issue
  )
    return plan;
  // Persist the exact snapped position; do not charge the displayed return reserve yet.
  return {
    ...plan,
    visits: [
      ...plan.visits,
      {
        name: candidate.snap.name,
        lng: candidate.snap.lng,
        lat: candidate.snap.lat,
        ...(candidate.snap.addressEstimate ? { addressEstimate: candidate.snap.addressEstimate } : {}),
      },
    ],
  };
}
export function undoPlan(plan: Plan): Plan {
  return plan.finished
    ? { ...plan, finished: false }
    : { ...plan, visits: plan.visits.slice(0, -1) };
}
export function finishPlan(plan: Plan, analysis: Analysis): Plan {
  if (
    plan.finished ||
    !analysis.returnRoute ||
    analysis.returnRoute.fare.total > analysis.remaining
  )
    return plan;
  return { ...plan, finished: true };
}
