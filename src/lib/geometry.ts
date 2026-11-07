import type { Coordinate, Edge, Vertex } from "../types";

export function segmentLength(a: Vertex, b: Vertex): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
export function cumulative(edge: Edge): number[] {
  const values = [0];
  for (let i = 1; i < edge.coords.length; i++)
    values.push(
      values[i - 1] + segmentLength(edge.coords[i - 1], edge.coords[i]),
    );
  // Use the same exported edge length for routing, snapping and slicing.
  const scale = edge.m / values[values.length - 1];
  return values.map((v) => v * scale);
}
export function atOffset(
  edge: Edge,
  offsets: number[],
  position: number,
): Coordinate {
  const offset = Math.max(0, Math.min(edge.m, position));
  for (let i = 1; i < offsets.length; i++) {
    if (offset <= offsets[i] || i === offsets.length - 1) {
      const t = (offset - offsets[i - 1]) / (offsets[i] - offsets[i - 1] || 1);
      const a = edge.coords[i - 1],
        b = edge.coords[i];
      return [a[2] + t * (b[2] - a[2]), a[3] + t * (b[3] - a[3])];
    }
  }
  return edge.coords[0].slice(2) as Coordinate;
}
export function sliceEdge(
  edge: Edge,
  offsets: number[],
  start: number,
  end: number,
): Coordinate[] {
  if (start > end) return sliceEdge(edge, offsets, end, start).reverse();
  const coordinates: Coordinate[] = [atOffset(edge, offsets, start)];
  for (let i = 1; i < offsets.length - 1; i++) {
    if (offsets[i] > start + 1e-6 && offsets[i] < end - 1e-6)
      coordinates.push(edge.coords[i].slice(2) as Coordinate);
  }
  coordinates.push(atOffset(edge, offsets, end));
  return coordinates;
}
export function haversine(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad,
    dLon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
}
