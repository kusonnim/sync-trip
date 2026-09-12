import { useMemo } from 'react';
import WheelPicker from './WheelPicker';

const pad = (n) => String(n).padStart(2, '0');

// Hour and minute side by side, both scrolling in place. Minutes move in steps
// because a trip is not planned to the minute and a 60-row wheel is a chore.
export default function TimeWheel({ label, value, onChange, minuteStep = 10 }) {
  const [hour, minute] = (value ?? '00:00').split(':').map(Number);

  const hours = useMemo(
    () => Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${pad(h)}시` })),
    [],
  );
  const minutes = useMemo(
    () => Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => {
      const m = i * minuteStep;
      return { value: m, label: `${pad(m)}분` };
    }),
    [minuteStep],
  );

  // A stored value between two steps still has to land on a row, so round it down.
  const snappedMinute = minutes.reduce(
    (best, item) => (item.value <= minute && item.value > best ? item.value : best),
    0,
  );

  return (
    <div className="field">
      <span>{label}</span>
      <div className="wheel-row">
        <WheelPicker
          items={hours}
          value={hour}
          ariaLabel={`${label} 시`}
          onChange={(next) => onChange(`${pad(next)}:${pad(snappedMinute)}`)}
        />
        <WheelPicker
          items={minutes}
          value={snappedMinute}
          ariaLabel={`${label} 분`}
          onChange={(next) => onChange(`${pad(hour)}:${pad(next)}`)}
        />
      </div>
    </div>
  );
}
