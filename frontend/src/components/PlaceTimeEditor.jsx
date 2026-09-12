import { useState } from 'react';
import { updatePlace } from '../lib/roomStore';
import { CATEGORY_DEFAULTS, categoryLabel } from '../lib/categories';
import TimeWheel from './TimeWheel';

const SOURCE_LABEL = {
  google: '영업시간은 지도 정보에서 가져왔어요.',
  default: '카테고리 기본값이에요. 실제와 다르면 고쳐 주세요.',
  manual: '직접 입력한 값이에요.',
};

// One editor serves both lists, so a ranked place can be edited too.
export default function PlaceTimeEditor({ code, place, onClose }) {
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({});
  if (!place) return null;

  const set = async (patch) => {
    setError('');
    setDraft((current) => ({ ...current, ...patch }));
    try { await updatePlace(code, place.id, patch); }
    catch {
      setDraft({});
      setError('시간 설정을 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
    }
  };
  const currentPlace = { ...place, ...draft };
  const window = currentPlace.visitWindow ?? null;

  // A start alone means that exact time. A start and an end mean anytime in between.
  function setWindow(key, value) {
    if (!value) {
      const other = key === 'start' ? window?.end : window?.start;
      set({ visitWindow: other ? { start: other, end: other } : null });
      return;
    }
    const next = { start: window?.start ?? value, end: window?.end ?? value, [key]: value };
    if (next.end < next.start) next.end = next.start;
    set({ visitWindow: next });
  }

  function resetHours() {
    const base = CATEGORY_DEFAULTS[place.category] ?? CATEGORY_DEFAULTS.attraction;
    set({ openTime: base.open, closeTime: base.close, hoursSource: 'default' });
  }

  return (
    <div className="place-editor">
      <div className="card-head">
        <div>
          <div className="card-title">시간 설정</div>
          <div className="meta">{place.name}</div>
        </div>
        <button type="button" className="link-btn" onClick={onClose}>닫기</button>
      </div>

      <div className="notice warn">
        {SOURCE_LABEL[currentPlace.hoursSource] ?? SOURCE_LABEL.default} ({categoryLabel(currentPlace.category)})
      </div>
      {error && <div className="notice error">{error}</div>}

      <div className="place-time-section">
        <div className="card-title">영업시간</div>
        <TimeWheel label="여는 시각" value={currentPlace.openTime ?? '09:00'}
          onChange={(value) => set({ openTime: value, hoursSource: 'manual' })} />
        <TimeWheel label="닫는 시각" value={currentPlace.closeTime ?? '18:00'}
          onChange={(value) => set({ closeTime: value, hoursSource: 'manual' })} />
      </div>

      <div className="place-time-section">
        <div className="card-title">방문 시각</div>
        {window ? (
          <>
            <TimeWheel label="이 시각부터" value={window.start}
              onChange={(value) => setWindow('start', value)} />
            <TimeWheel label="이 시각까지" value={window.end}
              onChange={(value) => setWindow('end', value)} />
          </>
        ) : (
          <button type="button" className="choice"
            onClick={() => set({ visitWindow: {
              start: currentPlace.openTime ?? '09:00',
              end: currentPlace.openTime ?? '09:00',
            } })}>
            방문 시각 지정하기
          </button>
        )}
        <p className="hint">
          방문 시각을 넣으면 알고리즘이 반드시 지킵니다. 시작과 끝이 같으면 그 시각 정각,
          다르면 그 사이 아무 때나로 봅니다.
        </p>
      </div>

      <label className="field">
        <span>머무는 시간 (분)</span>
        <input
          type="number"
          step={10}
          min={10}
          value={currentPlace.minStay ?? 60}
          onChange={(e) => set({ minStay: Math.max(10, Number(e.target.value) || 10) })}
        />
      </label>

      <div className="stack-8">
        <button
          className="choice"
          aria-pressed={!!currentPlace.isFixed}
          style={{ textAlign: 'left' }}
          onClick={() => set({ isFixed: !currentPlace.isFixed })}
        >
          {currentPlace.isFixed ? '✓ 필수로 방문하기' : '필수로 방문하기'}
        </button>
        {(currentPlace.hoursSource === 'manual' || window) && (
          <div className="item-actions">
            {currentPlace.hoursSource === 'manual' && (
              <button className="pill" onClick={resetHours}>기본 영업시간으로</button>
            )}
            {window && (
              <button className="pill" onClick={() => set({ visitWindow: null })}>방문 시각 해제</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
