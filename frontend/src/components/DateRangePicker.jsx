import { useMemo, useState } from 'react';
import { toISODate } from '../lib/time';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function monthStart(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

// A leading run of blanks lines the first day up under its weekday, then one
// cell per day. Trailing blanks are unnecessary; the grid simply ends.
function monthCells(first) {
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const blanks = Array.from({ length: first.getDay() }, () => null);
  const days = Array.from(
    { length: daysInMonth },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1),
  );
  return [...blanks, ...days];
}

/**
 * One calendar for both ends of the trip. The first tap sets the first day and
 * clears the last; the next tap on or after it sets the last day. Tapping an
 * earlier day starts over from there rather than refusing the tap.
 */
export default function DateRangePicker({ start, end, today, onChange }) {
  const [month, setMonth] = useState(() => monthStart(start ?? today));
  const [awaitingEnd, setAwaitingEnd] = useState(false);

  const cells = useMemo(() => monthCells(month), [month]);
  const monthLabel = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
  // The trip cannot start in the past, and nothing before today is selectable.
  const floor = today;

  function pick(iso) {
    if (!awaitingEnd || !start || iso < start) {
      setAwaitingEnd(true);
      onChange({ start: iso, end: iso });
      return;
    }
    setAwaitingEnd(false);
    onChange({ start, end: iso });
  }

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button
          type="button"
          className="calendar-nav"
          aria-label="이전 달"
          onClick={() => setMonth(addMonths(month, -1))}
        >
          ‹
        </button>
        <div className="calendar-month">{monthLabel}</div>
        <button
          type="button"
          className="calendar-nav"
          aria-label="다음 달"
          onClick={() => setMonth(addMonths(month, 1))}
        >
          ›
        </button>
      </div>

      <div className="calendar-grid" role="grid" aria-label="여행 날짜">
        {WEEKDAYS.map((day) => (
          <div className="calendar-weekday" key={day}>{day}</div>
        ))}
        {cells.map((date, position) => {
          if (!date) return <div key={`blank-${position}`} />;
          const iso = toISODate(date);
          const disabled = iso < floor;
          const isStart = iso === start;
          const isEnd = iso === end;
          const inside = start && end && iso > start && iso < end;
          const classes = ['calendar-day'];
          if (isStart || isEnd) classes.push('picked');
          if (inside) classes.push('inside');
          if (isStart && end && end !== start) classes.push('range-start');
          if (isEnd && start && end !== start) classes.push('range-end');

          return (
            <button
              type="button"
              key={iso}
              className={classes.join(' ')}
              disabled={disabled}
              aria-pressed={isStart || isEnd}
              onClick={() => pick(iso)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <p className="hint">
        {awaitingEnd && start === end
          ? '마지막 날을 한 번 더 눌러 주세요. 당일치기면 그대로 두면 됩니다.'
          : '첫 날을 누르고 마지막 날을 누르면 그 사이가 모두 선택됩니다.'}
      </p>
    </div>
  );
}
