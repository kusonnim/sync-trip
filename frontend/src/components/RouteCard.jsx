import { durationText, won, dateLabel } from '../lib/time';
import Timeline from './Timeline';

const TONE = {
  min_time: { chip: 'chip', mark: 'Fastest Route' },
  min_cost: { chip: 'chip accent', mark: 'Lowest-Cost Route' },
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
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={tone.chip}>{route.label ?? tone.mark}</span>
        {votes !== undefined && <span className="chip gray">{votes} votes</span>}
        <button className="btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onToggle}>
          {open ? 'Hide Itinerary' : 'View Itinerary'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div>
          <div className="tl-note">Total Travel Time</div>
          <div style={{ fontWeight: 700 }}>{durationText(route.total_time)}</div>
        </div>
        <div>
          <div className="tl-note">Estimated Fare</div>
          <div style={{ fontWeight: 700 }}>{won(route.total_cost)}</div>
        </div>
        <div>
          <div className="tl-note">Places</div>
          <div style={{ fontWeight: 700 }}>{countPlaces(route)}</div>
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
          {myVote === route.type ? 'Voted for This Route' : 'Vote for This Route'}
        </button>
      )}
    </div>
  );
}
