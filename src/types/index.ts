import type { FeatureCollection, LineString } from "geojson";

export type Coordinate = [number, number];
/** Projected easting/northing (m), followed by longitude/latitude. */
export type Vertex = [number, number, number, number];
export interface Edge {
  a: number;
  b: number;
  m: number;
  dir: -1 | 0 | 1;
  name: number;
  coords: Vertex[];
  record?: number;
  component?: number;
  roadClass?: string;
}
export interface Graph {
  version: string;
  crs: string;
  nodes: Vertex[];
  edges: Edge[];
  names: string[];
}
export interface Place {
  name: string;
  lng: number;
  lat: number;
  /** Approximate source section; never a verified building entrance. */
  addressEstimate?: { roadRecord: number; sectionMeters: number };
}
export interface Snap extends Place {
  edge: number;
  offset: number;
  distanceToRoad: number;
  requested: Coordinate;
}
export interface FareConfig {
  baseFare: number;
  baseDistance: number;
  breakpoint: number;
  nearUnit: number;
  farUnit: number;
  increment: number;
  callFee: number;
  rounding: "ceil-combined-units";
  sourceUrl: string;
  effectiveDate: string;
  verification: string;
  note: string;
}
export interface FareOptions {
  margin: number;
  callFee: boolean;
}
export interface FareBreakdown {
  base: number;
  distance: number;
  call: number;
  reserve: number;
  total: number;
}
export interface Route {
  distance: number;
  coordinates: Coordinate[];
  fare: FareBreakdown;
}
export interface Plan {
  schema: 1;
  graphVersion: string;
  budget: number;
  options: FareOptions;
  start: Place;
  end: Place;
  sameEnd: boolean;
  visits: Place[];
  finished: boolean;
}
export interface CandidateResult {
  requested: Place;
  snap: Snap | null;
  outward: Route | null;
  homeward: Route | null;
  affordable: boolean;
  afterVisit: number | null;
  afterReturn: number | null;
  issue: "no-access" | "no-outward" | "no-return" | "same-position" | null;
}
export interface Analysis {
  start: Snap;
  end: Snap;
  current: Snap;
  visits: Snap[];
  confirmed: Route[];
  returnRoute: Route | null;
  /** Displayed budget always includes one return from the final confirmed visit. */
  budget: { visitCost: number; returnCost: number | null; remaining: number | null };
  /** Completed legs only; routing must not subtract the return reservation twice. */
  spent: number;
  remaining: number;
  totalDistance: number;
  rides: number;
  reachable: FeatureCollection<LineString>;
  reachableKm: number;
  candidate: CandidateResult | null;
  elapsedMs: number;
}
export interface Metadata {
  version: string;
  sourceRecords: number;
  nodes: number;
  edges: number;
  components: number;
  totalLengthKm: number;
  warnings: string[];
  bounds: [number, number, number, number];
  defaultStart: Place;
  graphSize: { bytes: number; storedBytes: number };
}
export type WorkerRequest =
  | { id: number; type: "init"; url: string; fare: FareConfig }
  | { id: number; type: "analyze"; plan: Plan; candidate: Place | null };
export type WorkerResponse =
  | { id: number; type: "ready" }
  | { id: number; type: "result"; analysis: Analysis }
  | { id: number; type: "error"; message: string };
