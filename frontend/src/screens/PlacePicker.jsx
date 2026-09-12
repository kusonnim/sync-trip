import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import Screen from '../components/Screen';
import PlaceTimeEditor from '../components/PlaceTimeEditor';
import PlaceDropList from '../components/PlaceDropList';
import SortablePlaceRow from '../components/SortablePlaceRow';
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
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // Both lists live in one state object so a drag between them is a single update.
  const [lists, setLists] = useState(() => ({ ranking: room.preferences[me.id] ?? [], pool: [] }));
  const { ranking } = lists;
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [hoursWarning, setHoursWarning] = useState('');
  const [rankFull, setRankFull] = useState(false);

  const submittedCount = room.members.filter((m) => m.submitted).length;

  // Teammates add and remove places while this screen is open, so reconcile both
  // lists with the shared cart: drop what disappeared, append what is new.
  useEffect(() => {
    const ids = room.places.map((p) => p.id);
    setLists((prev) => {
      const ranked = prev.ranking.filter((id) => ids.includes(id));
      const pooled = prev.pool.filter((id) => ids.includes(id));
      const known = new Set([...ranked, ...pooled]);
      const added = ids.filter((id) => !known.has(id));
      if (!added.length && ranked.length === prev.ranking.length && pooled.length === prev.pool.length) {
        return prev;
      }
      return { ranking: ranked, pool: [...pooled, ...added] };
    });
  }, [room.places]);

  const sensors = useSensors(
    // A small movement threshold keeps taps on the row buttons working.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // A short press before dragging leaves normal touch scrolling intact.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    setLists((prev) => {
      if (prev.ranking.includes(place.id) || prev.ranking.length >= TOP_N) return prev;
      return { ranking: [...prev.ranking, place.id], pool: prev.pool.filter((id) => id !== place.id) };
    });
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

  // Only the host may step the room back, because the status is shared by everyone.
  async function backToLobby() {
    setSubmitting(true); setActionError('');
    try { await patchRoom(room.code, { status: 'setup' }); }
    catch { setActionError('대기 화면으로 돌아가지 못했습니다. 다시 시도해 주세요.'); setSubmitting(false); }
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

  const listOf = (id) => {
    if (id === 'ranking' || id === 'pool') return id;
    if (lists.ranking.includes(id)) return 'ranking';
    if (lists.pool.includes(id)) return 'pool';
    return null;
  };

  // Moving across lists happens while dragging, so the row settles into place
  // under the pointer rather than jumping when it is released.
  function handleDragOver({ active, over }) {
    if (!over) return;
    const from = listOf(active.id);
    const to = listOf(over.id);
    if (!from || !to || from === to) return;

    if (to === 'ranking' && lists.ranking.length >= TOP_N) { setRankFull(true); return; }
    setRankFull(false);

    setLists((prev) => {
      const source = prev[from].filter((id) => id !== active.id);
      const target = [...prev[to]];
      const overIndex = target.indexOf(over.id);
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, active.id);
      return from === 'ranking'
        ? { ranking: source, pool: target }
        : { ranking: target, pool: source };
    });
  }

  function handleDragEnd({ active, over }) {
    if (!over) return;
    const from = listOf(active.id);
    if (!from || from !== listOf(over.id)) return;
    setLists((prev) => {
      const oldIndex = prev[from].indexOf(active.id);
      const newIndex = prev[from].indexOf(over.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      return { ...prev, [from]: arrayMove(prev[from], oldIndex, newIndex) };
    });
  }

  const placeById = useMemo(
    () => Object.fromEntries(room.places.map((p) => [p.id, p])),
    [room.places],
  );
  const pool = lists.pool.map((id) => placeById[id]).filter(Boolean);
  const toggleEditor = (id) => setEditing(editing === id ? null : id);

  return (
    <Screen
      title="가고 싶은 곳 고르기"
      back={
        isHost
          ? { label: '대기 화면', onClick: backToLobby, disabled: submitting }
          : { label: '처음', onClick: () => navigate('/') }
      }
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="card">
          <div className="card-head">
            <div className="card-title">내 순위</div>
            <div className="count">{ranking.length}/{TOP_N}곳</div>
          </div>
          <p className="hint">
            장소 칸을 끌어서 순서를 바꾸고, 아래 담은 곳과 서로 옮길 수 있어요.
          </p>
          <PlaceDropList
            id="ranking"
            items={ranking}
            empty="아래 담은 곳에서 가고 싶은 곳을 여기로 끌어 올려 주세요."
          >
            {ranking.map((id, index) => {
              const place = placeById[id];
              if (!place) return null;
              return (
                <SortablePlaceRow
                  key={id}
                  id={id}
                  rank={index + 1}
                  name={place.name}
                  meta={metaText(place)}
                  actions={
                    <>
                      <span className="rank-label">{index + 1}순위</span>
                      {isHost && (
                        <button className="pill" aria-expanded={editing === id} onClick={() => toggleEditor(id)}>
                          시간
                        </button>
                      )}
                    </>
                  }
                  expanded={
                    isHost && editing === id ? (
                      <PlaceTimeEditor
                        key={id}
                        code={room.code}
                        place={place}
                        onClose={() => setEditing(null)}
                      />
                    ) : null
                  }
                />
              );
            })}
          </PlaceDropList>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">담은 곳</div>
            <div className="count">{pool.length}곳</div>
          </div>
          <PlaceDropList
            id="pool"
            items={lists.pool}
            empty={
              room.places.length === 0
                ? '아직 아무도 장소를 담지 않았습니다.'
                : '담은 곳이 모두 순위에 들어가 있습니다.'
            }
          >
            {pool.map((place) => (
              <SortablePlaceRow
                key={place.id}
                id={place.id}
                name={place.name}
                meta={`${metaText(place)} · ${durationText(place.minStay ?? 60)} 체류`}
                actions={
                  isHost && (
                    <>
                      <button className="pill" aria-expanded={editing === place.id} onClick={() => toggleEditor(place.id)}>
                        시간
                      </button>
                      <button className="pill" onClick={() => discard(place.id)}>삭제</button>
                    </>
                  )
                }
                expanded={
                  isHost && editing === place.id ? (
                    <PlaceTimeEditor
                      key={place.id}
                      code={room.code}
                      place={place}
                      onClose={() => setEditing(null)}
                    />
                  ) : null
                }
              />
            ))}
          </PlaceDropList>
          {rankFull && (
            <div className="notice error">순위는 {TOP_N}곳까지예요. 먼저 한 곳을 아래로 내려 주세요.</div>
          )}
        </div>
      </DndContext>

    </Screen>
  );
}
