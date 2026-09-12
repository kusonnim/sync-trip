import { durationText, won } from '../lib/time';
import { categoryLabel } from '../lib/categories';

// Render the timeline array from the PROJECT.md section 3 response as-is.
// Place and transit entries alternate; the first and last entries are the start and end locations.
function visitText(w) {
  return w.start === w.end ? w.start : `${w.start}-${w.end}`;
}

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
                {categoryLabel(item.category)} · {durationText(item.stay_duration)} 머무름
                {item.hard_constraint ? ` · ${visitText(item.hard_constraint)} 방문 지정` : ''}
                {item.wait_duration > 5 ? ` · 대기 ${durationText(item.wait_duration)}` : ''}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}
