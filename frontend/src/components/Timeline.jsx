import { durationText, won } from '../lib/time';
import { categoryLabel } from '../lib/categories';

// Render the timeline array from the PROJECT.md section 3 response as-is.
// Place and transit entries alternate; the first and last entries are the start and end locations.
export default function Timeline({ timeline }) {
  return (
    <div className="timeline">
      {timeline.map((item, i) =>
        item.type === 'transit' ? (
          <p className="tl-move" key={i}>
            {item.instruction} · {won(item.cost)}
            {item.duration ? ` · ${durationText(item.duration)}` : ''}
          </p>
        ) : (
          <div className="tl-stop" key={i}>
            <div className="tl-time">{item.time}</div>
            <div className="tl-name">{item.name}</div>
            {item.stay_duration != null && (
              <div className="tl-note">
                {categoryLabel(item.category)} · Stay for {durationText(item.stay_duration)}
                {item.hard_constraint ? ` · ${item.hard_constraint.start} reservation` : ''}
                {item.wait_duration > 5 ? ` · Wait ${item.wait_duration} min` : ''}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}
