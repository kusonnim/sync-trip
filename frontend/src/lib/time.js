// Convert between 'HH:mm' strings and integer minutes. All algorithm calculations use minutes.

export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function durationText(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} hr ${rest} min` : `${h} hr`;
}

export function won(value) {
  return `₩${Math.round(value).toLocaleString('en-US')}`;
}

export function dateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function daysBetween(startISO, endISO) {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  const diff = Math.round((end - start) / 86400000);
  return Math.max(1, diff + 1);
}

// toISOString converts to UTC and can shift the date, so build the local value directly.
function toISODate(d) {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function listDates(startISO, count) {
  const out = [];
  const start = new Date(`${startISO}T00:00:00`);
  for (let i = 0; i < count; i += 1) {
    out.push(toISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  }
  return out;
}
