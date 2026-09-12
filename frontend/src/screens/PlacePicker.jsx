import { useEffect, useState } from 'react';
import Screen from '../components/Screen';
import { searchPlaces, fetchPlaceHours } from '../lib/api';
import { addPlace, submitRanking, patchRoom, updatePlace } from '../lib/roomStore';
import { picksPerPerson } from '../lib/preference';
import { categoryLabel } from '../lib/categories';
import { daysBetween } from '../lib/time';

export default function PlacePicker({ room, me, isHost }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [ranking, setRanking] = useState(room.preferences[me.id] ?? []);
  const [editing, setEditing] = useState(null);

  const k = picksPerPerson(daysBetween(room.startDate, room.endDate), room.headcount);
  const submittedCount = room.members.filter((m) => m.submitted).length;

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

  function pick(place) {
    addPlace(room.code, place);
    setRanking((prev) => (prev.includes(place.id) || prev.length >= k ? prev : [...prev, place.id]));
    setQuery('');
    setResults([]);

    // 카테고리 기본값으로 먼저 담아두고, 실제 영업시간이 오면 덮어쓴다.
    // 못 받아도 기본값이 남으므로 일정 생성은 그대로 진행된다.
    fetchPlaceHours(place.name).then((hours) => {
      if (hours) updatePlace(room.code, place.id, { ...hours, hoursSource: 'google' });
    });
  }

  function toggleRank(placeId) {
    setRanking((prev) => {
      if (prev.includes(placeId)) return prev.filter((id) => id !== placeId);
      return prev.length >= k ? prev : [...prev, placeId];
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
  const target = editing ? placeById[editing] : null;

  return (
    <Screen
      step={5}
      title="가고 싶은 곳 고르기"
      subtitle={`${ranking.length} / ${k}곳 선택 · ${submittedCount}명 제출 완료`}
      footer={
        me.submitted && isHost ? (
          <button
            className="btn-accent"
            disabled={submittedCount < 2}
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
        {searching && <p className="tl-note" style={{ marginTop: 8 }}>찾는 중...</p>}
        {results.length > 0 && (
          <div className="list" style={{ marginTop: 10 }}>
            {results.map((p) => (
              <button key={p.id} className="item" style={{ textAlign: 'left' }} onClick={() => pick(p)}>
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
        <div className="card-title">내 순위 ({ranking.length}/{k})</div>
        {ranking.length === 0 ? (
          <p className="empty-state">검색해서 가고 싶은 곳을 담아 주세요.</p>
        ) : (
          <div className="list">
            {ranking.map((id, index) => (
              <div className="item" key={id}>
                <span className="rank-dot">{index + 1}</span>
                <div className="grow">
                  <div className="name">{placeById[id]?.name}</div>
                  <div className="meta">{categoryLabel(placeById[id]?.category)}</div>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => move(id, -1)} disabled={index === 0}>위로</button>
                <button className="btn-ghost btn-sm" onClick={() => move(id, 1)} disabled={index === ranking.length - 1}>아래로</button>
                <button className="btn-ghost btn-sm" onClick={() => toggleRank(id)}>빼기</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">팀 전체가 담은 곳 {room.places.length}개</div>
        <div className="list">
          {room.places.map((p) => (
            <div className="item" key={p.id}>
              <span className={ranking.includes(p.id) ? 'rank-dot' : 'rank-dot empty'}>
                {ranking.includes(p.id) ? ranking.indexOf(p.id) + 1 : '+'}
              </span>
              <div className="grow">
                <div className="name">{p.name}</div>
                <div className="meta">
                  {p.openTime}~{p.closeTime}
                  {p.fixedTime ? ` · ${p.fixedTime} 예약` : ''}
                  {p.isFixed ? ' · 필수' : ''}
                </div>
              </div>
              {!ranking.includes(p.id) && (
                <button className="btn-ghost btn-sm" onClick={() => toggleRank(p.id)}>담기</button>
              )}
              {isHost && (
                <button className="btn-ghost btn-sm" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                  시간
                </button>
              )}
            </div>
          ))}
          {room.places.length === 0 && <p className="empty-state">아직 아무도 장소를 담지 않았습니다.</p>}
        </div>

        {target && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <div className="card-title">{target.name} 시간 설정</div>
            <p className="tl-note" style={{ marginTop: -6 }}>
              영업시간은 카테고리 기본값입니다. 예약이 있거나 실제와 다르면 여기서 덮어쓰세요.
            </p>
            <div className="row">
              <label className="field">
                <span>영업 시작</span>
                <input
                  type="time"
                  value={target.openTime ?? ''}
                  onChange={(e) => updatePlace(room.code, editing, { openTime: e.target.value, hoursSource: 'manual' })}
                />
              </label>
              <label className="field">
                <span>영업 종료</span>
                <input
                  type="time"
                  value={target.closeTime ?? ''}
                  onChange={(e) => updatePlace(room.code, editing, { closeTime: e.target.value, hoursSource: 'manual' })}
                />
              </label>
            </div>
            <div className="row">
              <label className="field">
                <span>예약 시각</span>
                <input
                  type="time"
                  value={target.fixedTime ?? ''}
                  onChange={(e) => updatePlace(room.code, editing, { fixedTime: e.target.value || null })}
                />
              </label>
              <label className="field">
                <span>머무는 시간(분)</span>
                <input
                  type="number"
                  step={10}
                  value={target.minStay ?? 60}
                  onChange={(e) => updatePlace(room.code, editing, { minStay: Number(e.target.value) })}
                />
              </label>
            </div>
            <button
              className="btn-ghost"
              style={{ width: '100%' }}
              onClick={() => updatePlace(room.code, editing, { isFixed: !target.isFixed })}
            >
              {target.isFixed ? '필수 방문 해제' : '필수로 방문하기'}
            </button>
          </div>
        )}
      </div>
    </Screen>
  );
}
