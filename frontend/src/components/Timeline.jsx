import { durationText, won } from '../lib/time';
import { categoryLabel } from '../lib/categories';

// PROJECT.md ③ 응답의 timeline 배열을 그대로 그린다.
// place 와 transit 이 번갈아 들어오고, 첫 항목과 마지막 항목은 출발지와 도착지다.
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
                {item.hard_constraint ? ` · ${item.hard_constraint.start} 예약` : ''}
                {item.wait_duration > 5 ? ` · 대기 ${item.wait_duration}분` : ''}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}
