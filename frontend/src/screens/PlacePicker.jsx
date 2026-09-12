import { useEffect, useState } from 'react';
import Screen from '../components/Screen';
import PlaceTimeEditor from '../components/PlaceTimeEditor';
import { searchPlaces, fetchPlaceHours } from '../lib/api';
import { addPlace, submitRanking, patchRoom, updatePlace, removePlace } from '../lib/roomStore';
import { TOP_N } from '../lib/preference';
import { categoryLabel } from '../lib/categories';
import { durationText } from '../lib/time';

function visitText(place) {
  const w = place.visitWindow;
  if (!w) return '';
  return w.start === w.end ? ` · ${w.start} 방문` : ` · ${w.start}~${w.end} 방문`;
}

function metaText(place) {
  return (
    `${categoryLabel(place.category)} · ${place.openTime}~${place.closeTime}` +
    `${place.hoursSource === 'manual' ? ' (직접)' : ''}` +
    `${visitText(place)}${place.isFixed ? ' · 필수' : ''}`
  );
}

export default function PlacePicker({ room, me, isHost }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [ranking, setRanking] = useState(room.preferences[me.id] ?? []);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [hoursWarning, setHoursWarning] = useState('');
  const [rankFull, setRankFull] = useState(false);

  const submittedCount = room.members.filter((m) => m.submitted).length;

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPlaces(query);
        if (alive) { setResults(found); setActionError(''); }
      } catch {
        if (alive) setActionError('장소 검색을 사용할 수 없습니다. 백엔드 연결을 확인하고 다시 시도해 주세요.');
      } finally {
        if (alive) setSearching(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  // Adding is unlimited. If the ranking still has room, the new place goes in too.
  async function add(place) {
    setActionError('');
    try {
      await addPlace(room.code, place);
    } catch {
      setActionError('장소를 담지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
      return;
    }
    setRanking((prev) => (prev.includes(place.id) || prev.length >= TOP_N ? prev : [...prev, place.id]));
    setQuery('');
    setResults([]);

    // Start with category defaults, then replace them when actual business hours arrive.
    // If the lookup fails, the defaults remain and itinerary creation can continue.
    fetchPlaceHours(place.name)
      .then((hours) => {
        if (hours) return updatePlace(room.code, place.id, { ...hours, hoursSource: 'google' });
        setHoursWarning('영업시간을 확인하지 못해 카테고리 기본값을 사용합니다. 대표자가 직접 수정할 수 있습니다.');
        return null;
      })
      .catch(() => setHoursWarning('영업시간을 확인하지 못해 카테고리 기본값을 사용합니다. 대표자가 직접 수정할 수 있습니다.'));
  }

  async function submit() {
    setSubmitting(true); setActionError('');
    try { await submitRanking(room.code, me.id, ranking); }
    catch { setActionError('순위를 동기화하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setSubmitting(false); }
  }

  async function analyze() {
    setSubmitting(true); setActionError('');
    try { await patchRoom(room.code, { status: 'analyzing', optimizationState: 'idle', optimizationOwner: null }); }
    catch { setActionError('경로 계산을 시작하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'); setSubmitting(false); }
  }

  async function discard(placeId) {
    setActionError('');
    try { await removePlace(room.code, placeId); }
    catch { setActionError('장소를 삭제하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'); }
  }

  function promote(placeId) {
    setRanking((prev) => {
      if (prev.length >= TOP_N) { setRankFull(true); return prev; }
      setRankFull(false);
      return [...prev, placeId];
    });
  }

  function demote(placeId) {
    setRankFull(false);
    setRanking((prev) => prev.filter((id) => id !== placeId));
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
  const pool = room.places.filter((p) => !ranking.includes(p.id));
  const toggleEditor = (id) => setEditing(editing === id ? null : id);

  return (
    <Screen
      title="가고 싶은 곳 고르기"
      subtitle={`${room.places.length}곳 담음 · 내 순위 ${ranking.length}/${TOP_N} · ${submittedCount}명 제출 완료`}
      footer={
        me.submitted && isHost ? (
          <button
            className="btn-accent"
            disabled={submittedCount < 1 || submitting}
            onClick={analyze}
          >
            {submitting ? '경로 만드는 중...' : `의견 취합하고 경로 만들기 (${submittedCount}명 제출)`}
          </button>
        ) : (
          <button
            className="btn-primary"
            disabled={ranking.length === 0 || submitting}
            onClick={submit}
          >
            {submitting ? '순위 저장 중...' : me.submitted ? '순위 다시 제출하기' : `${ranking.length}곳 순위 제출하기`}
          </button>
        )
      }
    >
      <div className="card">
        <div className="card-title">장소 검색</div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="가고 싶은 여행지를 검색하세요"
        />
        <p className="hint">담는 개수는 제한이 없고, 순위는 {TOP_N}곳까지만 매깁니다.</p>
        {searching && <p className="hint">찾는 중...</p>}
        {actionError && <p className="hint" style={{ color: 'var(--accent)' }}>{actionError}</p>}
        {hoursWarning && <p className="hint" style={{ color: 'var(--accent)' }}>{hoursWarning}</p>}
        {results.length > 0 && (
          <div className="list">
            {results.map((p) => (
              <div className="item" key={p.id}>
                <div className="grow">
                  <div className="name">{p.name}</div>
                  <div className="meta">{categoryLabel(p.category)} · {p.address}</div>
                </div>
                <button className="pill-filled" onClick={() => add(p)}>담기</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">내 순위</div>
        <div className="list">
          {ranking.map((id, index) => {
            const place = placeById[id];
            if (!place) return null;
            return (
              <div className="item item-stack" key={id}>
                <div className="item-head">
                  <span className="rank-dot">{index + 1}</span>
                  <div className="grow">
                    <div className="name">{place.name}</div>
                    <div className="meta">{metaText(place)}</div>
                  </div>
                  <div className="rank-label">{index + 1}순위</div>
                </div>
                <div className="item-actions">
                  <button className="pill" onClick={() => move(id, -1)} disabled={index === 0}>위로</button>
                  <button className="pill" onClick={() => move(id, 1)} disabled={index === ranking.length - 1}>아래로</button>
                  {isHost && <button className="pill" onClick={() => toggleEditor(id)}>시간</button>}
                  <button className="pill" onClick={() => demote(id)}>빼기</button>
                </div>
              </div>
            );
          })}
        </div>
        {ranking.length === 0 && (
          <p className="empty-state">아직 순위를 매긴 곳이 없어요. 아래 담은 곳에서 "순위에"를 눌러 주세요.</p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">담은 곳</div>
          <div className="count">{pool.length}곳</div>
        </div>
        <div className="list">
          {pool.map((p) => (
            <div className="item" key={p.id}>
              <div className="grow">
                <div className="name">{p.name}</div>
                <div className="meta">{metaText(p)} · {durationText(p.minStay ?? 60)} 체류</div>
              </div>
              <div className="item-actions">
                <button className="pill-filled" onClick={() => promote(p.id)}>순위에</button>
                {isHost && (
                  <>
                    <button className="pill" onClick={() => toggleEditor(p.id)}>시간</button>
                    <button className="pill" onClick={() => discard(p.id)}>삭제</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        {pool.length === 0 && (
          <p className="empty-state">
            {room.places.length === 0
              ? '아직 아무도 장소를 담지 않았습니다.'
              : '담은 곳이 모두 순위에 들어가 있습니다.'}
          </p>
        )}
        {rankFull && (
          <div className="notice error">순위는 {TOP_N}곳까지예요. 먼저 한 곳을 빼 주세요.</div>
        )}
      </div>

      {isHost && (
        <PlaceTimeEditor key={editing} code={room.code} place={placeById[editing]} onClose={() => setEditing(null)} />
      )}
    </Screen>
  );
}
