import { durationText, won, dateLabel } from '../lib/time';
import Timeline from './Timeline';

const TONE = {
  min_time: { chip: 'chip', mark: '최소 시간' },
  min_cost: { chip: 'chip accent', mark: '최소 비용' },
};

function countPlaces(route) {
  // 첫 항목과 마지막 항목은 출발지와 도착지라 방문지에서 뺀다.
  return route.days.reduce(
    (sum, day) => sum + day.timeline.filter((t) => t.type === 'place' && t.place_id).length,
    0,
  );
}

export default function RouteCard({ route, open, onToggle, votes, onVote, myVote }) {
  const tone = TONE[route.type] ?? TONE.min_time;
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={tone.chip}>{route.label ?? tone.mark}</span>
        {votes !== undefined && <span className="chip gray">{votes}표</span>}
        <button className="btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onToggle}>
          {open ? '접기' : '일정 보기'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div>
          <div className="tl-note">총 이동</div>
          <div style={{ fontWeight: 700 }}>{durationText(route.total_time)}</div>
        </div>
        <div>
          <div className="tl-note">예상 교통비</div>
          <div style={{ fontWeight: 700 }}>{won(route.total_cost)}</div>
        </div>
        <div>
          <div className="tl-note">방문</div>
          <div style={{ fontWeight: 700 }}>{countPlaces(route)}곳</div>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          {route.days.map((day) => (
            <div key={day.date} style={{ marginBottom: 18 }}>
              <div className="card-title">{dateLabel(day.date)}</div>
              <Timeline timeline={day.timeline} />
            </div>
          ))}
        </div>
      )}

      {onVote && (
        <button
          className={myVote === route.type ? 'btn-primary' : 'btn-ghost'}
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => onVote(route.type)}
        >
          {myVote === route.type ? '이 안에 투표함' : '이 안에 투표하기'}
        </button>
      )}
    </div>
  );
}
