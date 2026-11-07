import type {
  Coordinate,
  FareConfig,
  FareOptions,
  Graph,
  Place,
  Route,
  Snap,
} from "../types";
import { atOffset, cumulative, haversine, sliceEdge } from "./geometry";
import { calculateFare } from "./fare";

type Arc = { to: number; edge: number; cost: number };
export interface Tree {
  distances: Float64Array;
  parent: Int32Array;
  parentEdge: Int32Array;
  roots: Map<number, number>;
}
class Heap {
  private values: [number, number][] = [];
  push(node: number, value: number) {
    const item: [number, number] = [node, value];
    let index = this.values.length;
    this.values.push(item);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.values[parent][1] <= value) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = item;
  }
  pop(): [number, number] | undefined {
    const first = this.values[0],
      last = this.values.pop();
    if (!this.values.length || !last) return first;
    let index = 0;
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.values.length &&
        this.values[child + 1][1] < this.values[child][1]
      )
        child++;
      if (this.values[child][1] >= last[1]) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

export class Router {
  readonly offsets: number[][];
  private forward: Arc[][];
  private reverse: Arc[][];
  private grid = new Map<string, [number, number][]>();
  private cache = new Map<string, Tree>();
  private cellSize = 0.002;
  constructor(readonly graph: Graph) {
    this.forward = graph.nodes.map(() => []);
    this.reverse = graph.nodes.map(() => []);
    this.offsets = graph.edges.map(cumulative);
    graph.edges.forEach((edge, id) => {
      const arc = (from: number, to: number) => {
        this.forward[from].push({ to, edge: id, cost: edge.m });
        this.reverse[to].push({ to: from, edge: id, cost: edge.m });
      };
      if (edge.dir !== -1) arc(edge.a, edge.b);
      if (edge.dir !== 1) arc(edge.b, edge.a);
      for (let i = 1; i < edge.coords.length; i++) {
        const a = edge.coords[i - 1],
          b = edge.coords[i];
        for (
          let x = this.cell(Math.min(a[2], b[2]));
          x <= this.cell(Math.max(a[2], b[2]));
          x++
        ) {
          for (
            let y = this.cell(Math.min(a[3], b[3]));
            y <= this.cell(Math.max(a[3], b[3]));
            y++
          ) {
            const key = `${x},${y}`;
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key)!.push([id, i]);
          }
        }
      }
    });
  }
  private cell(n: number) {
    return Math.floor(n / this.cellSize);
  }
  snap(place: Place, maxDistance = 500): Snap | null {
    if (!Number.isFinite(place.lng) || !Number.isFinite(place.lat)) return null;
    const latRadius = maxDistance / 110000;
    const lonRadius =
      latRadius / Math.max(0.1, Math.cos((place.lat * Math.PI) / 180));
    const scale = Math.cos((place.lat * Math.PI) / 180);
    let best: Snap | null = null;
    const seen = new Set<string>();
    for (
      let x = this.cell(place.lng - lonRadius);
      x <= this.cell(place.lng + lonRadius);
      x++
    ) {
      for (
        let y = this.cell(place.lat - latRadius);
        y <= this.cell(place.lat + latRadius);
        y++
      ) {
        for (const [id, i] of this.grid.get(`${x},${y}`) ?? []) {
          const key = `${id}:${i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const edge = this.graph.edges[id],
            a = edge.coords[i - 1],
            b = edge.coords[i];
          // Address estimates must stay on their source road, including at
          // crossings; never silently substitute a nearby unrelated road.
          if (place.addressEstimate && edge.record !== place.addressEstimate.roadRecord) continue;
          const dx = (b[2] - a[2]) * scale,
            dy = b[3] - a[3];
          const t = Math.max(
            0,
            Math.min(
              1,
              ((place.lng - a[2]) * scale * dx + (place.lat - a[3]) * dy) /
                (dx * dx + dy * dy || 1),
            ),
          );
          const coordinate: Coordinate = [
            a[2] + t * (b[2] - a[2]),
            a[3] + t * (b[3] - a[3]),
          ];
          const distance = haversine([place.lng, place.lat], coordinate);
          if (
            distance <= maxDistance &&
            (!best || distance < best.distanceToRoad)
          ) {
            best = {
              name: place.name || this.graph.names[edge.name] || "선택한 지점",
              lng: coordinate[0],
              lat: coordinate[1],
              edge: id,
              offset:
                this.offsets[id][i - 1] +
                t * (this.offsets[id][i] - this.offsets[id][i - 1]),
              distanceToRoad: distance,
              requested: [place.lng, place.lat],
              ...(place.addressEstimate ? { addressEstimate: place.addressEstimate } : {}),
            };
          }
        }
      }
    }
    return best;
  }
  /** Access from a snap to graph nodes. Reverse=true means nodes -> snap. */
  connections(snap: Snap, reverse = false): [number, number, number][] {
    const e = this.graph.edges[snap.edge];
    const values: [number, number, number][] = [];
    if ((reverse ? e.dir !== -1 : e.dir !== 1) || snap.offset <= 1e-6)
      values.push([e.a, snap.offset, 0]);
    if ((reverse ? e.dir !== 1 : e.dir !== -1) || e.m - snap.offset <= 1e-6)
      values.push([e.b, e.m - snap.offset, e.m]);
    return values;
  }
  tree(snap: Snap, reverse = false): Tree {
    const key = `${snap.edge}:${snap.offset.toFixed(6)}:${reverse}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const count = this.graph.nodes.length;
    const distances = new Float64Array(count).fill(Infinity),
      parent = new Int32Array(count).fill(-1),
      parentEdge = new Int32Array(count).fill(-1);
    const roots = new Map<number, number>();
    const heap = new Heap();
    for (const [node, cost, offset] of this.connections(snap, reverse)) {
      if (cost < distances[node]) {
        distances[node] = cost;
        roots.set(node, offset);
        heap.push(node, cost);
      }
    }
    const adjacency = reverse ? this.reverse : this.forward;
    for (let item = heap.pop(); item; item = heap.pop()) {
      const [node, cost] = item;
      if (cost > distances[node]) continue;
      for (const arc of adjacency[node]) {
        const next = cost + arc.cost;
        if (next < distances[arc.to] - 1e-8) {
          distances[arc.to] = next;
          parent[arc.to] = node;
          parentEdge[arc.to] = arc.edge;
          roots.delete(arc.to);
          heap.push(arc.to, next);
        }
      }
    }
    const tree = { distances, parent, parentEdge, roots };
    this.cache.set(key, tree);
    if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
    return tree;
  }
  distanceTo(
    from: Snap,
    to: Snap,
    tree = this.tree(from),
  ): { distance: number; via: number; viaOffset: number; direct: boolean } {
    let distance = Infinity,
      via = -1,
      viaOffset = 0,
      direct = false;
    if (from.edge === to.edge) {
      const edge = this.graph.edges[from.edge],
        delta = to.offset - from.offset;
      if (
        Math.abs(delta) <= 1e-6 ||
        (delta >= 0 && edge.dir !== -1) ||
        (delta <= 0 && edge.dir !== 1)
      ) {
        distance = Math.abs(delta);
        direct = true;
      }
    }
    for (const [node, cost, offset] of this.connections(to, true)) {
      if (tree.distances[node] + cost < distance - 1e-7) {
        distance = tree.distances[node] + cost;
        via = node;
        viaOffset = offset;
        direct = false;
      }
    }
    return { distance, via, viaOffset, direct };
  }
  route(
    from: Snap,
    to: Snap,
    config: FareConfig,
    options: FareOptions,
  ): Route | null {
    const tree = this.tree(from),
      best = this.distanceTo(from, to, tree);
    if (!Number.isFinite(best.distance)) return null;
    let coordinates: Coordinate[];
    if (best.direct) {
      coordinates = sliceEdge(
        this.graph.edges[from.edge],
        this.offsets[from.edge],
        from.offset,
        to.offset,
      );
    } else {
      const chain: [number, number, number][] = [];
      let node = best.via;
      while (tree.parent[node] !== -1) {
        chain.push([tree.parentEdge[node], tree.parent[node], node]);
        node = tree.parent[node];
      }
      const startEdge = this.graph.edges[from.edge];
      coordinates = sliceEdge(
        startEdge,
        this.offsets[from.edge],
        from.offset,
        tree.roots.get(node)!,
      );
      for (const [id, u] of chain.reverse()) {
        const e = this.graph.edges[id];
        const part = sliceEdge(
          e,
          this.offsets[id],
          u === e.a ? 0 : e.m,
          u === e.a ? e.m : 0,
        );
        coordinates.push(...part.slice(1));
      }
      const endEdge = this.graph.edges[to.edge];
      coordinates.push(
        ...sliceEdge(
          endEdge,
          this.offsets[to.edge],
          best.viaOffset,
          to.offset,
        ).slice(1),
      );
    }
    return {
      distance: best.distance,
      coordinates,
      fare: calculateFare(best.distance, config, options),
    };
  }
  pointOnEdge(edgeId: number, offset: number): Snap {
    const edge = this.graph.edges[edgeId],
      coordinate = atOffset(edge, this.offsets[edgeId], offset);
    return {
      edge: edgeId,
      offset,
      distanceToRoad: 0,
      requested: coordinate,
      lng: coordinate[0],
      lat: coordinate[1],
      name: this.graph.names[edge.name],
    };
  }
}
