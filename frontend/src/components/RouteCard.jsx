import { durationText, won, dateLabel } from '../lib/time';
import Timeline from './Timeline';

const TONE = {
  min_time: { name: '최소 시간', tag: '추천', color: 'var(--brand)', tint: 'var(--brand-soft)' },
  min_cost: { name: '최소 비용', tag: '알뜰', color: 'var(--accent)', tint: 'var(--accent-soft)' },
};

function countPlaces(route) {
  // Exclude the first and last entries because they are the start and end locations.
  return route.days.reduce(
    (sum, day) => sum + day.timeline.filter((t) => t.type === 'place' && t.place_id).length,
    0,
  );
}

export default function RouteCard({ route, open, onToggle, votes, onVote, myVote }) {
  const tone = TONE[route.type] ?? TONE.min_time;
  const picked = myVote === route.type;

  return (
    <div className="card" style={{ gap: 14, borderColor: picked ? tone.color : 'var(--line)' }}>
      <div className="card-head" style={{ alignItems: 'center' }}>
        <div className="card-title" style={{ color: tone.color }}>{route.label ?? tone.name}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {votes !== undefined && <span className="chip gray">{votes}표</span>}
          <span className="tag" style={{ background: tone.tint, color: tone.color }}>{tone.tag}</span>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="label">이동 시간</span>
          <span className="value">{durationText(route.total_time)}</span>
        </div>
        <div className="stat">
          <span className="label">예상 요금</span>
          <span className="value">{won(route.total_cost)}</span>
        </div>
        <div className="stat">
          <span className="label">장소</span>
          <span className="value">{countPlaces(route)}곳</span>
        </div>
        {route.total_wait > 30 && (
          <div className="stat">
            <span className="label">대기</span>
            <span className="value warn">{durationText(route.total_wait)}</span>
          </div>
        )}
      </div>

      <button className="btn-outline" onClick={onToggle}>
        {open ? '일정 접기' : '일정 보기'}
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {route.days.map((day) => (
            <div key={day.date} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="card-title">{dateLabel(day.date)}</div>
              <Timeline timeline={day.timeline} />
            </div>
          ))}
        </div>
      )}

      {onVote && (
        <button
          style={{
            width: '100%',
            border: 0,
            background: picked ? tone.tint : tone.color,
            color: picked ? tone.color : '#fff',
          }}
          onClick={() => onVote(route.type)}
        >
          {picked ? '이 안에 투표함' : '이 안에 투표하기'}
        </button>
      )}
    </div>
  );
}
