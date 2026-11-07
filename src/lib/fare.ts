import type { FareBreakdown, FareConfig, FareOptions } from "../types";

export const ZERO_DISTANCE_M = 0.01;

export function calculateFare(
  distance: number,
  config: FareConfig,
  options: FareOptions,
): FareBreakdown {
  if (!Number.isFinite(distance) || distance < 0)
    throw new Error("유효한 이동거리가 필요합니다.");
  if (
    !Number.isFinite(options.margin) ||
    options.margin < 0 ||
    options.margin > 100
  )
    throw new Error("여유율은 0~100% 범위여야 합니다.");
  if (distance <= ZERO_DISTANCE_M)
    return { base: 0, distance: 0, call: 0, reserve: 0, total: 0 };
  const near = Math.max(
    0,
    Math.min(distance, config.breakpoint) - config.baseDistance,
  );
  const far = Math.max(0, distance - config.breakpoint);
  // Conservative budgeting rule, not a claim to emulate the actual taximeter.
  const extra =
    Math.max(
      0,
      Math.ceil(near / config.nearUnit + far / config.farUnit - 1e-9),
    ) * config.increment;
  const call = options.callFee ? config.callFee : 0;
  const subtotal = config.baseFare + extra + call;
  const total =
    Math.ceil(
      (subtotal * (1 + options.margin / 100)) / config.increment - 1e-9,
    ) * config.increment;
  return {
    base: config.baseFare,
    distance: extra,
    call,
    reserve: total - subtotal,
    total,
  };
}

/** Exact discontinuity distances for the configured stepwise fare function. */
export function fareThresholds(
  maxDistance: number,
  config: FareConfig,
): number[] {
  if (!Number.isFinite(maxDistance) || maxDistance < 0) return [];
  const result = [ZERO_DISTANCE_M, config.baseDistance];
  const nearUnits = (config.breakpoint - config.baseDistance) / config.nearUnit;
  const maxUnits =
    maxDistance <= config.breakpoint
      ? Math.max(0, (maxDistance - config.baseDistance) / config.nearUnit)
      : nearUnits + (maxDistance - config.breakpoint) / config.farUnit;
  for (let unit = 1; unit <= Math.ceil(maxUnits); unit++) {
    const distance =
      unit <= nearUnits
        ? config.baseDistance + unit * config.nearUnit
        : config.breakpoint + (unit - nearUnits) * config.farUnit;
    if (distance <= maxDistance + 1e-6) result.push(distance);
  }
  return result.filter((d) => d <= maxDistance + 1e-6);
}
