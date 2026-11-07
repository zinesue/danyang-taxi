import type { Plan, Place } from "../types";
export const STORAGE_KEY = "danyang-taxi-plan-v1";
const placeValid = (value: unknown): value is Place => {
  if (!value || typeof value !== "object") return false;
  const p = value as Place;
  return (
    typeof p.name === "string" &&
    p.name.length <= 200 &&
    Number.isFinite(p.lng) &&
    Number.isFinite(p.lat) &&
    p.lng >= -180 &&
    p.lng <= 180 &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    (p.addressEstimate === undefined || (
      !!p.addressEstimate &&
      Number.isInteger(p.addressEstimate.roadRecord) &&
      p.addressEstimate.roadRecord >= 0 &&
      Number.isFinite(p.addressEstimate.sectionMeters) &&
      p.addressEstimate.sectionMeters > 0
    ))
  );
};
export function parsePlan(json: string, graphVersion: string): Plan | null {
  try {
    const p = JSON.parse(json) as Plan;
    if (
      p.schema !== 1 ||
      p.graphVersion !== graphVersion ||
      !Number.isFinite(p.budget) ||
      p.budget < 0 ||
      p.budget > 1000000 ||
      !placeValid(p.start) ||
      !placeValid(p.end) ||
      !Array.isArray(p.visits) ||
      !p.visits.every(placeValid) ||
      typeof p.finished !== "boolean" ||
      typeof p.sameEnd !== "boolean" ||
      typeof p.options?.callFee !== "boolean" ||
      !Number.isFinite(p.options?.margin) ||
      p.options.margin < 0 ||
      p.options.margin > 100
    )
      return null;
    return p;
  } catch {
    return null;
  }
}
