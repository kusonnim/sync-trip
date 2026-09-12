import { durationText, won } from '../lib/time';
import { categoryLabel } from '../lib/categories';

function visitText(w) {
  return w.start === w.end ? w.start : `${w.start}~${w.end}`;
}

// Render the timeline array from the PROJECT.md section 3 response as-is.
// Place and transit entries alternate; the first and last entries are the start and end locations.
export default function Timeline({ timeline }) {
  return (
    <div className="timeline">
      {timeline.map((item, i) => {
        const isStop = item.type === 'place';
        const last = i === timeline.length - 1;
        return (
          <div className="tl-row" key={i}>
            <div className="tl-rail">
              <span className={isStop ? 'dot' : 'dot faint'} />
              {!last && <span className="line" />}
            </div>
            <div className="tl-body">
              {isStop ? (
                <>
                  <div className="tl-head">
                    <span className="tl-time">{item.time}</span>
                    <span className="tl-name">{item.name}</span>
                  </div>
                  {item.stay_duration != null && (
                    <div className="tl-note">
                      {categoryLabel(item.category)} · {durationText(item.stay_duration)} 체류
                    </div>
                  )}
                  {item.hard_constraint && (
                    <div className="tl-flag">지정 방문 {visitText(item.hard_constraint)} 반영</div>
                  )}
                  {item.wait_duration > 5 && (
                    <div className="tl-flag">{durationText(item.wait_duration)} 대기</div>
                  )}
                </>
              ) : (
                <div className="tl-leg">
                  {item.instruction}
                  {item.cost > 0 ? ` · ${item.mode === 'car' ? '통행료 ' : ''}${won(item.cost)}` : ''}
                  {' · '}
                  {durationText(item.duration)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
