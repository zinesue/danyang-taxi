import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Place } from '../types';
import { loadJson } from '../lib/data';
import { AddressSearchIndex, type AddressData, type SearchMatch } from '../lib/addressSearch';

export function AddressSearch({ places, graphVersion, onSelect }: {
  places: Place[]; graphVersion: string; onSelect: (place: Place) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<AddressSearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setIndex(null);
    loadJson<AddressData>(`${import.meta.env.BASE_URL}data/address-index.json.gz`)
      .then(data => {
        if (!cancelled) setIndex(new AddressSearchIndex(data, places, graphVersion));
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [places, graphVersion, retry]);
  const result = useMemo(() => index?.search(query), [index, query]);
  const matches = result?.matches ?? [];
  const expanded = open && !!query.trim();
  const select = (match: SearchMatch) => {
    onSelect(match.place);
    setQuery('');
    setOpen(false);
    setActive(-1);
    input.current?.blur();
  };
  return <div className="map-search address-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); }
  }}>
    <Search size={18} aria-hidden="true" />
    <input ref={input} aria-label="도로명주소 검색" placeholder="주소 검색 · 삼봉로 123"
      role="combobox" aria-autocomplete="list" aria-expanded={expanded}
      aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded && active >= 0 && matches[active] ? `${listId}-${active}` : undefined}
      autoComplete="off" maxLength={160} enterKeyHint="search" value={query}
      onFocus={() => setOpen(true)}
      onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { setOpen(false); setActive(-1); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          const next = !matches.length ? -1 : active < 0
            ? event.key === 'ArrowDown' ? 0 : matches.length - 1
            : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
          setActive(next);
          document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
        }
        if (event.key === 'Enter') {
          event.preventDefault(); setOpen(true);
          // Multiple matching segments require an explicit choice.
          if (active >= 0 && matches[active]) select(matches[active]);
          else if (matches.length === 1) select(matches[0]);
        }
      }} />
    {query && <button aria-label="검색어 지우기" onClick={() => {
      setQuery(''); setActive(-1); input.current?.focus();
    }}><X size={17} /></button>}
    {expanded && <div className="search-results">
      <p className="search-hint" role="status">{failed ? '주소 데이터를 불러오지 못했습니다. 지도 선택은 계속 사용할 수 있어요.'
        : !index ? '주소 데이터를 불러오는 중…' : result?.message}</p>
      {failed && <button className="search-retry" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button>}
      <div id={listId} role="listbox" aria-label="주소 검색 결과">
        {matches.map((match, i) => <button key={match.id} id={`${listId}-${i}`}
          role="option" aria-selected={i === active} onClick={() => select(match)}>
          <span>{match.place.name}<small>{match.detail}</small></span>
        </button>)}
      </div>
    </div>}
  </div>;
}
