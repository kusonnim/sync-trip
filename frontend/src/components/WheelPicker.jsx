import { useEffect, useRef } from 'react';

// A column of values that scrolls under a fixed selection band, the way the
// iPhone clock sets an alarm. It sits on the page rather than opening a sheet,
// so the value is changed in the same place it is read.
//
// Scroll position is the source of truth. CSS scroll snapping does the settling,
// and the row resting in the band is reported once the scrolling stops.
export default function WheelPicker({ items, value, onChange, ariaLabel, itemHeight = 40 }) {
  const listRef = useRef(null);
  const settleTimer = useRef(null);
  // While the finger is mid-scroll the wheel must not be yanked back by a
  // re-render, so remember what we last told the parent.
  const reported = useRef(value);

  const index = Math.max(0, items.findIndex((item) => item.value === value));

  useEffect(() => {
    const list = listRef.current;
    if (!list || value === reported.current) return;
    reported.current = value;
    list.scrollTop = index * itemHeight;
  }, [value, index, itemHeight]);

  // Place the wheel on its starting value without animating in from the top.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = index * itemHeight;
    // Only on mount; later moves are handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const landed = Math.round(list.scrollTop / itemHeight);
      const item = items[Math.min(items.length - 1, Math.max(0, landed))];
      if (item && item.value !== reported.current) {
        reported.current = item.value;
        onChange(item.value);
      }
    }, 90);
  }

  // The keyboard moves one step at a time, which a scroll container alone cannot do.
  function handleKeyDown(event) {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = items[Math.min(items.length - 1, Math.max(0, index + step))];
    if (next && next.value !== value) {
      reported.current = next.value;
      onChange(next.value);
      if (listRef.current) listRef.current.scrollTop = items.indexOf(next) * itemHeight;
    }
  }

  return (
    <div className="wheel" style={{ '--wheel-item': `${itemHeight}px` }}>
      <div className="wheel-band" aria-hidden="true" />
      <div
        className="wheel-list"
        ref={listRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={items[index] ? `${ariaLabel}-${items[index].value}` : undefined}
        tabIndex={0}
      >
        {/* Padding rows let the first and last value reach the middle band. */}
        <div className="wheel-pad" aria-hidden="true" />
        {items.map((item, position) => (
          <div
            key={item.value}
            id={`${ariaLabel}-${item.value}`}
            role="option"
            aria-selected={position === index}
            className={position === index ? 'wheel-item selected' : 'wheel-item'}
            onClick={() => {
              reported.current = item.value;
              onChange(item.value);
              if (listRef.current) listRef.current.scrollTop = position * itemHeight;
            }}
          >
            {item.label}
          </div>
        ))}
        <div className="wheel-pad" aria-hidden="true" />
      </div>
    </div>
  );
}
