import type { Place } from '../types';

/** Main/sub numbers are basic numbers, not verified building addresses. */
export type BasicSection = [road: number, evenMain: number, evenSub: number,
  oddMain: number, oddSub: number, lng: number, lat: number,
  roadRecord: number, lengthM: number, sourceId: number];
export interface AddressData {
  schema: 1;
  version: string;
  graphVersion: string;
  roads: string[];
  sections: BasicSection[];
}
export interface SearchMatch {
  id: string;
  place: Place;
  detail: string;
}
export interface SearchResult {
  matches: SearchMatch[];
  message: string;
}

const compact = (text: string) => text.normalize('NFKC').replace(/[–—−]/g, '-').replace(/\s+/g, '');
const stripRegion = (text: string) => text
  .replace(/^(?:충청북도|충북)/, '')
  .replace(/^단양군/, '')
  .replace(/^(?:단양읍|매포읍|단성면|대강면|가곡면|영춘면|어상천면|적성면)/, '');

export class AddressSearchIndex {
  private numbers = new Map<string, number[]>();
  private roadIds = new Map<string, number>();
  constructor(private data: AddressData, private roadPlaces: Place[], graphVersion: string) {
    if (data.schema !== 1 || data.graphVersion !== graphVersion)
      throw new Error('주소 데이터와 도로 데이터의 버전이 다릅니다.');
    data.roads.forEach((name, index) => this.roadIds.set(compact(name), index));
    data.sections.forEach((row, index) => {
      for (const side of [1, 3]) {
        const key = `${row[0]}:${row[side]}:${row[side + 1]}`;
        const existing = this.numbers.get(key) ?? [];
        if (existing.at(-1) !== index) existing.push(index);
        this.numbers.set(key, existing);
      }
    });
  }

  search(input: string): SearchResult {
    const query = stripRegion(compact(input));
    if (!query) return { matches: [], message: '도로명과 건물번호를 입력해 주세요.' };
    // A road name can itself contain digits (e.g. 중앙1로).
    const numbered = query.match(/^(.+?(?:대로|로|길))(\d+)(?:-(\d+))?$/);
    if (numbered) {
      const roadId = this.roadIds.get(numbered[1]);
      const main = Number(numbered[2]), sub = Number(numbered[3] ?? 0);
      const ids = roadId === undefined ? [] : this.numbers.get(`${roadId}:${main}:${sub}`) ?? [];
      const matches = ids.map((index, i): SearchMatch => {
        const row = this.data.sections[index];
        const length = row[8] >= 1000 ? `${(row[8] / 1000).toFixed(1)}km` : `${Math.max(1, Math.round(row[8]))}m`;
        return {
          id: `section-${index}-${main}-${sub}`,
          place: { name: `단양군 ${this.data.roads[row[0]]} ${main}${sub ? `-${sub}` : ''}`,
            lng: row[5], lat: row[6], addressEstimate: { roadRecord: row[7], sectionMeters: row[8] } },
          detail: `${ids.length > 1 ? `후보 ${i + 1}/${ids.length} · ` : ''}약 ${length} 도로 구간의 추정 위치`,
        };
      });
      return { matches, message: matches.length
        ? ids.length > 1 ? '같은 번호의 구간이 여러 곳입니다. 선택 후 지도를 확인하세요.'
          : '도로상 추정 위치이며 건물 출입구와 다를 수 있어요.'
        : '일치하는 기초번호가 없습니다. 주소를 확인하거나 지도에서 선택해 주세요.' };
    }
    // Do not silently turn a mistyped address into a representative road point.
    if (/\d$|[-]|(?:대로|로|길)\d/.test(query))
      return { matches: [], message: '도로명과 번호를 확인해 주세요. 예: 삼봉로 123, 상선암길 52-8' };
    const matches = this.roadPlaces.filter(place => compact(place.name).includes(query)).slice(0, 8)
      .map(place => ({ id: `road-${place.name}`, place, detail: '도로 대표 위치 · 번호를 입력하면 더 자세히 검색' }));
    return { matches, message: matches.length ? '도로명 뒤에 건물번호를 입력해 보세요.'
      : '단양군 도로명주소를 입력해 주세요. 예: 삼봉로 123' };
  }
}
