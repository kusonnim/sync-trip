import { useEffect, useState } from 'react';
import Screen from '../components/Screen';
import PlaceTimeEditor from '../components/PlaceTimeEditor';
import { searchPlaces, fetchPlaceHours } from '../lib/api';
import { addPlace, submitRanking, patchRoom, updatePlace, removePlace } from '../lib/roomStore';
import { TOP_N } from '../lib/preference';
import { categoryLabel } from '../lib/categories';

const RANK_LABEL = ['1순위', '2순위', '3순위'];

function visitText(place) {
  const w = place.visitWindow;
  if (!w) return '';
  return w.start === w.end ? ` · ${w.start} 방문` : ` · ${w.start}~${w.end} 방문`;
}

function PlaceMeta({ place }) {
  return (
    <div className="meta">
      {place.openTime}~{place.closeTime}
      {place.hoursSource === 'manual' ? ' (직접)' : ''}
      {visitText(place)}
      {place.isFixed ? ' · 필수' : ''}
    </div>
  );
}

export default function PlacePicker({ room, me, isHost }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [ranking, setRanking] = useState(room.preferences[me.id] ?? []);
  const [editing, setEditing] = useState(null);

  const submittedCount = room.members.filter((m) => m.submitted).length;
  const full = ranking.length >= TOP_N;

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchPlaces(query);
      if (alive) { setResults(found); setSearching(false); }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  // Adding is unlimited. If the ranking still has room, the new place goes in too.
  function add(place) {
    addPlace(room.code, place);
    setRanking((prev) => (prev.includes(place.id) || prev.length >= TOP_N ? prev : [...prev, place.id]));
    setQuery('');
    setResults([]);

    // Start with category defaults, then replace them when actual business hours arrive.
    // If the lookup fails, the defaults remain and itinerary creation can continue.
    fetchPlaceHours(place.name).then((hours) => {
      if (hours) updatePlace(room.code, place.id, { ...hours, hoursSource: 'google' });
    });
  }

  function toggleRank(placeId) {
    setRanking((prev) => {
      if (prev.includes(placeId)) return prev.filter((id) => id !== placeId);
      return prev.length >= TOP_N ? prev : [...prev, placeId];
    });
  }

  function move(placeId, delta) {
    setRanking((prev) => {
      const i = prev.indexOf(placeId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const placeById = Object.fromEntries(room.places.map((p) => [p.id, p]));
  const added = room.places.filter((p) => !ranking.includes(p.id));
  const toggleEditor = (id) => setEditing(editing === id ? null : id);

  return (
    <Screen
      step={5}
      title="가고 싶은 곳 고르기"
      subtitle={`담은 곳 ${room.places.length}개 · 내 순위 ${ranking.length}/${TOP_N} · ${submittedCount}명 제출`}
      footer={
        me.submitted && isHost ? (
          <button
            className="btn-accent"
            disabled={submittedCount < 1}
            onClick={() => patchRoom(room.code, { status: 'analyzing' })}
          >
            의견 취합하고 경로 만들기 ({submittedCount}명 제출)
          </button>
        ) : (
          <button
            className="btn-primary"
            disabled={ranking.length === 0}
            onClick={() => submitRanking(room.code, me.id, ranking)}
          >
            {me.submitted ? '순위 다시 제출하기' : `${ranking.length}곳 순위 제출하기`}
          </button>
        )
      }
    >
      <div className="card">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>장소 검색</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="가고 싶은 여행지를 검색하세요"
          />
        </label>
        <p className="tl-note" style={{ marginTop: 8, marginBottom: 0 }}>
          장소는 몇 개든 담을 수 있습니다. 그중에서 {TOP_N}순위까지만 고르면 됩니다.
        </p>
        {searching && <p className="tl-note" style={{ marginTop: 8 }}>찾는 중...</p>}
        {results.length > 0 && (
          <div className="list" style={{ marginTop: 10 }}>
            {results.map((p) => (
              <button key={p.id} className="item" style={{ textAlign: 'left' }} onClick={() => add(p)}>
                <div className="grow">
                  <div className="name">{p.name}</div>
                  <div className="meta">{categoryLabel(p.category)} · {p.address}</div>
                </div>
                <span className="chip">담기</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">내 순위 ({ranking.length}/{TOP_N})</div>
        {ranking.length === 0 ? (
          <p className="empty-state">담은 곳에서 가장 가고 싶은 {TOP_N}곳을 골라 주세요.</p>
        ) : (
          <div className="list">
            {ranking.map((id, index) => {
              const place = placeById[id];
              if (!place) return null;
              return (
                <div className="item" key={id}>
                  <span className="rank-dot">{index + 1}</span>
                  <div className="grow">
                    <div className="name">{place.name}</div>
                    <PlaceMeta place={place} />
                    <div className="tl-note">{RANK_LABEL[index]}</div>
                  </div>
                  <div className="item-actions">
                    <button className="btn-ghost btn-sm" onClick={() => move(id, -1)} disabled={index === 0}>위로</button>
                    <button className="btn-ghost btn-sm" onClick={() => move(id, 1)} disabled={index === ranking.length - 1}>아래로</button>
                    {isHost && (
                      <button className="btn-ghost btn-sm" onClick={() => toggleEditor(id)}>시간</button>
                    )}
                    <button className="btn-ghost btn-sm" onClick={() => toggleRank(id)}>빼기</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">담은 곳 {added.length}개</div>
        {full && added.length > 0 && (
          <p className="tl-note" style={{ marginTop: -6 }}>
            순위가 다 찼습니다. 바꾸려면 위에서 하나를 빼고 다시 고르세요.
          </p>
        )}
        <div className="list">
          {added.map((p) => (
            <div className="item" key={p.id}>
              <span className="rank-dot empty">+</span>
              <div className="grow">
                <div className="name">{p.name}</div>
                <PlaceMeta place={p} />
              </div>
              <div className="item-actions">
                <button className="btn-ghost btn-sm" onClick={() => toggleRank(p.id)} disabled={full}>
                  순위에
                </button>
                {isHost && (
                  <>
                    <button className="btn-ghost btn-sm" onClick={() => toggleEditor(p.id)}>시간</button>
                    <button className="btn-ghost btn-sm" onClick={() => removePlace(room.code, p.id)}>삭제</button>
                  </>
                )}
              </div>
            </div>
          ))}
          {added.length === 0 && (
            <p className="empty-state">
              {room.places.length === 0
                ? '아직 아무도 장소를 담지 않았습니다.'
                : '담은 곳이 모두 순위에 들어가 있습니다.'}
            </p>
          )}
        </div>
      </div>

      {isHost && (
        <PlaceTimeEditor code={room.code} place={placeById[editing]} onClose={() => setEditing(null)} />
      )}
    </Screen>
  );
}
