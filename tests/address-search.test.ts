import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { AddressSearchIndex, type AddressData } from '../src/lib/addressSearch';
import { Router } from '../src/lib/routing';
import { analyzePlan, confirmCandidate } from '../src/lib/planner';
import { parsePlan } from '../src/lib/storage';
import type { Graph, Metadata, Place, Plan } from '../src/types';
import { fare, graphOf, place } from './fixtures';

const data = JSON.parse(gunzipSync(readFileSync('public/data/address-index.json.gz')).toString()) as AddressData;
const graph = JSON.parse(gunzipSync(readFileSync('public/data/road-graph.json.gz')).toString()) as Graph;
const metadata = JSON.parse(readFileSync('public/data/network-metadata.json', 'utf8')) as Metadata;
const roads = JSON.parse(readFileSync('public/data/road-search.json', 'utf8')) as Place[];
const index = new AddressSearchIndex(data, roads, graph.version);

describe('offline approximate address search', () => {
  it('finds the same position with full region prefixes, spaces and full-width digits', () => {
    const direct = index.search('삼봉로 123');
    expect(direct.matches).toHaveLength(1);
    for (const text of ['충청북도 단양군 단양읍 삼봉로 123', '충북 단양군 삼봉로123', '삼봉로 １２３'])
      expect(index.search(text).matches).toEqual(direct.matches);
    expect(direct.matches[0].place.name).toBe('단양군 삼봉로 123');
    expect(direct.matches[0].place.addressEstimate!.sectionMeters).toBeGreaterThan(0);
    expect(direct.message).toContain('추정');
    expect(index.search('서울특별시 삼봉로 123').matches).toEqual([]);
  });
  it('matches main/sub numbers exactly, including digits in a road name', () => {
    expect(index.search('상선암길 52-8').matches.length).toBeGreaterThan(0);
    expect(index.search('상선암길 52 - 8').matches).toEqual(index.search('상선암길52-8').matches);
    expect(index.search('상선암길 52').matches.every(match => match.place.name === '단양군 상선암길 52')).toBe(true);
    const numberedRoad = data.sections.find(row => /\d/.test(data.roads[row[0]]))!;
    const text = `${data.roads[numberedRoad[0]]} ${numberedRoad[1]}${numberedRoad[2] ? `-${numberedRoad[2]}` : ''}`;
    expect(index.search(text).matches.length).toBeGreaterThan(0);
    expect(index.search('삼봉로 123').matches.every(match => match.place.name.endsWith(' 123'))).toBe(true);
  });
  it('never replaces missing or incomplete addresses with another number or representative point', () => {
    for (const text of ['삼봉로 999999', '상선암길 52-99999', '삼봉로 123-', '삼봉로 123abc', '없는도로 123'])
      expect(index.search(text).matches).toEqual([]);
    expect(index.search('삼봉로').matches[0].place.addressEstimate).toBeUndefined();
    expect(index.search('삼봉로').matches[0].detail).toContain('대표');
    expect(index.search('   ').matches).toEqual([]);
  });
  it('keeps multiple locations for the same basic number separate', () => {
    const result = index.search('용부원2길 30-2');
    expect(result.matches.length).toBeGreaterThan(1);
    expect(new Set(result.matches.map(match => match.id)).size).toBe(result.matches.length);
    expect(new Set(result.matches.map(match => `${match.place.lng},${match.place.lat}`)).size).toBeGreaterThan(1);
    expect(result.message).toContain('여러 곳');
    expect(result.matches.every(match => match.detail.includes('후보'))).toBe(true);
  });
  it('rejects an index from a different graph so source road IDs cannot drift', () => {
    expect(() => new AddressSearchIndex(data, roads, 'other-version')).toThrow();
  });
  it('exports finite, positive sections joined to the same named graph road', () => {
    const namesByRecord = new Map(graph.edges.map(edge => [edge.record, graph.names[edge.name]]));
    expect(data.sections.length).toBeGreaterThan(64000);
    for (const row of data.sections) {
      expect(row.every(Number.isFinite)).toBe(true);
      expect(row[8]).toBeGreaterThan(0);
      expect(namesByRecord.get(row[7])).toBe(data.roads[row[0]]);
    }
  });
  it('keeps the address and approximation label through routing, confirmation and saved plans', () => {
    const router = new Router(graph);
    const p: Plan = { schema: 1, graphVersion: graph.version, budget: 160000,
      options: { margin: 10, callFee: false }, start: metadata.defaultStart, end: metadata.defaultStart,
      sameEnd: true, visits: [], finished: false };
    const candidate = index.search('삼봉로 123').matches[0].place;
    const result = analyzePlan(router, p, candidate, fare);
    expect(result.candidate!.issue).toBeNull();
    expect(result.candidate!.affordable).toBe(true);
    const snap = result.candidate!.snap!;
    expect(graph.edges[snap.edge].record).toBe(candidate.addressEstimate!.roadRecord);
    expect(snap.distanceToRoad).toBeLessThan(2);
    const confirmed = confirmCandidate(p, result);
    expect(confirmed.visits[0].name).toBe(candidate.name);
    expect(confirmed.visits[0].addressEstimate).toEqual(candidate.addressEstimate);
    const restored = parsePlan(JSON.stringify(confirmed), graph.version)!;
    expect(restored).toEqual(confirmed);
    expect(analyzePlan(router, restored, null, fare).visits[0].addressEstimate).toEqual(candidate.addressEstimate);
    expect(parsePlan(JSON.stringify({ ...p, visits: [{ ...candidate, addressEstimate: { roadRecord: -1, sectionMeters: 20 } }] }), graph.version)).toBeNull();
  });
  it('does not jump to a closer unrelated road at a crossing or use it when the source road is absent', () => {
    const sample = graphOf([[0, 0], [1000, 0], [0, 30], [1000, 30]], [[0, 1], [2, 3]]);
    sample.edges[0].record = 10; sample.edges[1].record = 11;
    const router = new Router(sample);
    const candidate: Place = { ...place(500, 1), addressEstimate: { roadRecord: 11, sectionMeters: 20 } };
    expect(router.snap(candidate)!.edge).toBe(1);
    expect(router.snap({ ...candidate, addressEstimate: { roadRecord: 99, sectionMeters: 20 } })).toBeNull();
  });
});
