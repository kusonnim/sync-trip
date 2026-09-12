import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../components/Screen';
import DateRangePicker from '../components/DateRangePicker';
import PlaceSearchField from '../components/PlaceSearchField';
import TimeWheel from '../components/TimeWheel';
import WheelPicker from '../components/WheelPicker';
import { createRoom } from '../lib/roomStore';
import { daysBetween, dateLabel, toISODate } from '../lib/time';

const today = toISODate(new Date());
const HEADCOUNTS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}명` }));

export default function TripSetup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    hostNickname: '',
    title: '',
    startDate: today,
    endDate: today,
    dailyStart: '10:00',
    dailyEnd: '21:00',
    headcount: 2,
    transportMode: 'transit',
  });
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  // One accommodation to begin with. The + button adds another, up to one per night.
  const [stays, setStays] = useState([null]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const dayCount = daysBetween(form.startDate, form.endDate);
  const nights = dayCount - 1;

  // A trip that loses a night loses the accommodation that filled it.
  const visibleStays = useMemo(
    () => (nights === 0 ? [] : stays.slice(0, Math.max(1, Math.min(stays.length, nights)))),
    [stays, nights],
  );
  const filledStays = visibleStays.filter(Boolean);
  const staysReady = nights === 0 || filledStays.length === visibleStays.length;

  const ready =
    form.hostNickname.trim() &&
    form.endDate >= form.startDate &&
    origin &&
    destination &&
    staysReady;

  function setStay(index, place) {
    setStays((prev) => prev.map((item, i) => (i === index ? place : item)));
  }

  async function submit() {
    setCreating(true);
    setError('');
    try {
      const room = await createRoom({
        ...form,
        headcount: Number(form.headcount),
        origin,
        destination,
        accommodations: nights === 0 ? [] : filledStays,
      });
      navigate(`/r/${room.code}`);
    } catch (reason) {
      setError(reason?.message || '여행방을 만들지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Screen
      title="여행 기본정보"
      subtitle="대표자가 먼저 입력합니다"
      back={{ label: '처음', onClick: () => navigate('/'), disabled: creating }}
      footer={
        <button className="btn-primary" disabled={!ready || creating} onClick={submit}>
          {creating ? '여행방 만드는 중...' : '여행방 만들기'}
        </button>
      }
    >
      <div className="card" style={{ gap: 14 }}>
        <label className="field">
          <span>닉네임</span>
          <input value={form.hostNickname} onChange={set('hostNickname')} placeholder="ex) 민서" />
        </label>
        <label className="field">
          <span>여행 이름</span>
          <input value={form.title} onChange={set('title')} placeholder="ex) 부산 여행" />
        </label>
      </div>
      {error && <p className="tl-note" style={{ color: 'var(--accent)' }}>{error}</p>}

      <div className="card" style={{ gap: 14 }}>
        <div className="card-title">여행 날짜</div>
        <DateRangePicker
          start={form.startDate}
          end={form.endDate}
          today={today}
          onChange={({ start, end }) => setForm((prev) => ({ ...prev, startDate: start, endDate: end }))}
        />
        <p className="hint">
          {dateLabel(form.startDate)}
          {dayCount > 1 ? ` ~ ${dateLabel(form.endDate)}` : ''}
          {' · '}
          {dayCount === 1 ? '당일치기' : `${nights}박 ${dayCount}일`}
        </p>
      </div>

      <div className="card" style={{ gap: 14 }}>
        <div className="card-title">시각</div>
        <TimeWheel
          label="첫 날 여행지 도착 시각"
          value={form.dailyStart}
          onChange={(value) => setForm((prev) => ({ ...prev, dailyStart: value }))}
        />
        <TimeWheel
          label="마지막 날 귀가 시각"
          value={form.dailyEnd}
          onChange={(value) => setForm((prev) => ({ ...prev, dailyEnd: value }))}
        />
      </div>

      <div className="card" style={{ gap: 14 }}>
        <div className="card-title">인원과 이동수단</div>
        <div className="field">
          <span>인원</span>
          <div className="wheel-row single">
            <WheelPicker
              items={HEADCOUNTS}
              value={Number(form.headcount)}
              ariaLabel="인원"
              onChange={(value) => setForm((prev) => ({ ...prev, headcount: value }))}
            />
          </div>
        </div>
        <div className="choice-group">
          {[['transit', '🚌 대중교통'], ['car', '🚗 자차']].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="choice"
              aria-pressed={form.transportMode === value}
              onClick={() => setForm({ ...form, transportMode: value })}
            >
              {label}
            </button>
          ))}
        </div>
        {form.transportMode === 'car' && (
          <p className="hint">자차는 통행료만 비용으로 봅니다. 기름값은 계산하지 않습니다.</p>
        )}
      </div>

      <div className="card" style={{ gap: 14 }}>
        <div className="card-title">출발지와 도착지</div>
        <PlaceSearchField
          label="여행 출발지"
          value={origin}
          placeholder="ex) 서울역"
          onPick={setOrigin}
          onClear={() => setOrigin(null)}
        />
        <PlaceSearchField
          label="여행 마감지"
          value={destination}
          placeholder="ex) 서울역"
          onPick={setDestination}
          onClear={() => setDestination(null)}
        />
        <p className="hint">첫 날은 출발지에서 시작하고, 마지막 날은 마감지에서 끝납니다.</p>
      </div>

      {nights > 0 && (
        <div className="card" style={{ gap: 14 }}>
          <div className="card-head">
            <div className="card-title">숙소</div>
            <div className="count">{visibleStays.length}곳 / {nights}박</div>
          </div>
          {visibleStays.map((stay, index) => (
            <PlaceSearchField
              key={index}
              label={visibleStays.length === 1 ? '숙소' : `${index + 1}번째 밤 숙소`}
              value={stay}
              placeholder="ex) 명동 호텔"
              onPick={(place) => setStay(index, place)}
              onClear={() => setStay(index, null)}
              trailing={
                visibleStays.length > 1 ? (
                  <button
                    type="button"
                    className="pill"
                    onClick={() => setStays((prev) => prev.filter((_, i) => i !== index))}
                  >
                    빼기
                  </button>
                ) : null
              }
            />
          ))}
          {visibleStays.length < nights && (
            <button
              type="button"
              className="choice add-stay"
              onClick={() => setStays((prev) => [...prev, null])}
            >
              + 숙소 추가
            </button>
          )}
          <p className="hint">
            {visibleStays.length === 1
              ? '숙소 한 곳이면 모든 밤을 그곳에서 묵습니다. 중간 날은 숙소에서 출발해 숙소로 돌아옵니다.'
              : '적은 순서대로 하룻밤씩 배정됩니다.'}
          </p>
        </div>
      )}
    </Screen>
  );
}
