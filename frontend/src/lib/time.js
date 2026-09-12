// 'HH:mm' 문자열과 분 단위 정수 사이를 오간다. 알고리즘은 전부 분 단위로 계산한다.

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
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}시간 ${rest}분` : `${h}시간`;
}

export function won(value) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

export function dateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export function daysBetween(startISO, endISO) {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  const diff = Math.round((end - start) / 86400000);
  return Math.max(1, diff + 1);
}

// toISOString 은 UTC 로 바꾸므로 한국 시간에서는 하루가 당겨진다. 로컬 값으로 직접 만든다.
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
