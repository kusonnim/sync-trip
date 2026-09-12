import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../lib/api';

/**
 * Search for a real place and keep its coordinates, rather than trusting a typed
 * name to be findable later. A chosen place shows as a chip; clearing it returns
 * to the search box.
 */
export default function PlaceSearchField({ label, value, placeholder, onPick, onClear, trailing }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    if (value || !query.trim()) { setResults([]); return undefined; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPlaces(query);
        if (alive) { setResults(found.slice(0, 6)); setError(''); }
      } catch {
        if (alive) setError('장소 검색을 사용할 수 없습니다. 연결을 확인해 주세요.');
      } finally {
        if (alive) setSearching(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, value]);

  // A result list left open over the rest of the form is in the way.
  useEffect(() => {
    function away(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setResults([]);
    }
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, []);

  function choose(place) {
    onPick({ name: place.name, lat: place.lat, lng: place.lng });
    setQuery('');
    setResults([]);
  }

  return (
    <div className="field place-field" ref={boxRef}>
      <span>{label}</span>
      {value ? (
        <div className="picked-place">
          <div className="grow">
            <div className="name">{value.name}</div>
          </div>
          <button type="button" className="pill" onClick={onClear}>바꾸기</button>
          {trailing}
        </div>
      ) : (
        <>
          <div className="place-field-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              aria-label={label}
            />
            {trailing}
          </div>
          {searching && <p className="hint">찾는 중...</p>}
          {error && <p className="hint" style={{ color: 'var(--accent)' }}>{error}</p>}
          {results.length > 0 && (
            <div className="list search-results">
              {results.map((place) => (
                <button type="button" className="item result" key={place.id} onClick={() => choose(place)}>
                  <div className="grow">
                    <div className="name">{place.name}</div>
                    <div className="meta">{place.address}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
