import type { Metadata, Plan } from "../types";

export const BUDGET_MIN = 20000;
export const BUDGET_MAX = 160000;
export const BUDGET_STEP = 20000;
export const FIXED_MARGIN = 10;

export function isTestPlan(plan: Plan, metadata: Metadata): boolean {
  const origin = metadata.defaultStart;
  const samePlace = (place: Plan['start']) => place.name === origin.name &&
    place.lng === origin.lng && place.lat === origin.lat;
  return plan.budget >= BUDGET_MIN && plan.budget <= BUDGET_MAX &&
    plan.budget % BUDGET_STEP === 0 && samePlace(plan.start) && samePlace(plan.end) &&
    plan.sameEnd && plan.options.margin === FIXED_MARGIN && !plan.options.callFee;
}
