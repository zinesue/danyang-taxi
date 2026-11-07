import type {
  Edge,
  FareConfig,
  Graph,
  Place,
  Plan,
  Vertex,
} from "../src/types";
import config from "../public/data/fare-config.json";
export const fare = config as FareConfig;
export const options = { margin: 0, callFee: false };
export const vertex = (x: number, y = 0): Vertex => [
  x,
  y,
  128.36 + x / 88900,
  36.98 + y / 111000,
];
export function graphOf(
  points: [number, number][],
  lines: [number, number, number?][],
): Graph {
  const nodes = points.map((p) => vertex(...p));
  const edges: Edge[] = lines.map(([a, b, dir = 0], i) => ({
    a,
    b,
    dir: dir as Edge["dir"],
    m: Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]),
    name: i,
    coords: [nodes[a], nodes[b]],
  }));
  return {
    version: "test",
    crs: "EPSG:5179",
    nodes,
    edges,
    names: lines.map((_, i) => `도로 ${i}`),
  };
}
export const place = (x: number, y = 0): Place => {
  const v = vertex(x, y);
  return { name: `지점 ${x},${y}`, lng: v[2], lat: v[3] };
};
export const plan = (budget = 40000): Plan => ({
  schema: 1,
  graphVersion: "test",
  budget,
  options,
  start: place(0),
  end: place(0),
  sameEnd: true,
  visits: [],
  finished: false,
});
