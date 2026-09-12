import { updatePlace } from '../lib/roomStore';
import { CATEGORY_DEFAULTS, categoryLabel } from '../lib/categories';

const SOURCE_LABEL = {
  google: '구글에서 가져온 값입니다.',
  default: '카테고리 기본값입니다. 실제와 다르면 고쳐 주세요.',
  manual: '직접 입력한 값입니다.',
};

// One editor serves both lists, so a ranked place can be edited too.
export default function PlaceTimeEditor({ code, place, onClose }) {
  if (!place) return null;

  const set = (patch) => updatePlace(code, place.id, patch);
  const window = place.visitWindow ?? null;

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
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 2 }}>{place.name} 시간 설정</div>
          <div className="tl-note">{categoryLabel(place.category)}</div>
        </div>
        <button className="btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
      </div>

      <div className="notice warn" style={{ marginBottom: 12 }}>
        {SOURCE_LABEL[place.hoursSource] ?? SOURCE_LABEL.default}
      </div>

      <div className="row">
        <label className="field">
          <span>영업 시작</span>
          <input
            type="time"
            value={place.openTime ?? ''}
            onChange={(e) => set({ openTime: e.target.value, hoursSource: 'manual' })}
          />
        </label>
        <label className="field">
          <span>영업 종료</span>
          <input
            type="time"
            value={place.closeTime ?? ''}
            onChange={(e) => set({ closeTime: e.target.value, hoursSource: 'manual' })}
          />
        </label>
      </div>

      {place.hoursSource === 'manual' && (
        <button className="btn-ghost btn-sm" style={{ width: '100%', marginBottom: 14 }} onClick={resetHours}>
          기본 영업시간으로 되돌리기
        </button>
      )}

      <div className="card-title" style={{ marginTop: 6 }}>방문 시간 지정</div>
      <p className="tl-note" style={{ marginTop: -8 }}>
        예약이 있거나 꼭 이 시간에 가야 하면 넣으세요. 알고리즘이 반드시 지킵니다.
        시작만 넣으면 그 시각 정각, 끝까지 넣으면 그 사이 아무 때나로 봅니다.
      </p>
      <div className="row">
        <label className="field">
          <span>이 시각부터</span>
          <input type="time" value={window?.start ?? ''} onChange={(e) => setWindow('start', e.target.value)} />
        </label>
        <label className="field">
          <span>이 시각까지</span>
          <input type="time" value={window?.end ?? ''} onChange={(e) => setWindow('end', e.target.value)} />
        </label>
      </div>
      {window && (
        <button
          className="btn-ghost btn-sm"
          style={{ width: '100%', marginBottom: 14 }}
          onClick={() => set({ visitWindow: null })}
        >
          방문 시간 지정 해제
        </button>
      )}

      <label className="field">
        <span>머무는 시간(분)</span>
        <input
          type="number"
          step={10}
          min={10}
          value={place.minStay ?? 60}
          onChange={(e) => set({ minStay: Math.max(10, Number(e.target.value) || 10) })}
        />
      </label>

      <button
        className={place.isFixed ? 'btn-primary' : 'btn-ghost'}
        style={{ width: '100%' }}
        onClick={() => set({ isFixed: !place.isFixed })}
      >
        {place.isFixed ? '필수 방문으로 지정됨' : '필수로 방문하기'}
      </button>
    </div>
  );
}
