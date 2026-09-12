import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../components/Screen';
import { createRoom } from '../lib/roomStore';
import { searchPlaces } from '../lib/api';
import { daysBetween } from '../lib/time';

const today = new Date().toISOString().slice(0, 10);

export default function TripSetup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    hostNickname: '',
    title: '',
    startDate: today,
    endDate: today,
    dailyStart: '10:00',
    dailyEnd: '21:00',
    headcount: '',
    transportMode: 'transit',
    originName: '',
    destinationName: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const dayCount = daysBetween(form.startDate, form.endDate);
  const headcount = Number(form.headcount);
  const ready = form.hostNickname.trim() && form.endDate >= form.startDate && headcount >= 2;

  async function submit() {
    setCreating(true);
    setError('');
    try {
      const originLookup = searchPlaces(form.originName);
      const destinationLookup = form.destinationName === form.originName ? originLookup : searchPlaces(form.destinationName);
      const [originMatches, destinationMatches] = await Promise.all([originLookup, destinationLookup]);
      if (!originMatches[0] || !destinationMatches[0]) {
        throw new Error('출발지나 도착지를 찾지 못했습니다. 더 구체적인 장소 이름을 입력해 주세요.');
      }
      const room = await createRoom({
        ...form,
        headcount,
        origin: { name: originMatches[0].name, lat: originMatches[0].lat, lng: originMatches[0].lng },
        destination: { name: destinationMatches[0].name, lat: destinationMatches[0].lat, lng: destinationMatches[0].lng },
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
      footer={<button className="btn-primary" disabled={!ready || creating} onClick={submit}>{creating ? '여행방 만드는 중...' : '여행방 만들기'}</button>}
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
        <div className="card-title">날짜와 시각</div>
        <div className="grid-2">
          <label className="field">
            <span>첫 날</span>
            <input type="date" value={form.startDate} onChange={set('startDate')} />
          </label>
          <label className="field">
            <span>마지막 날</span>
            <input type="date" value={form.endDate} onChange={set('endDate')} min={form.startDate} />
          </label>
          <label className="field">
            <span>첫 날 여행지 도착 시각</span>
            <input type="time" value={form.dailyStart} onChange={set('dailyStart')} />
          </label>
          <label className="field">
            <span>마지막 날 귀가 시각</span>
            <input type="time" value={form.dailyEnd} onChange={set('dailyEnd')} />
          </label>
        </div>
        <p className="hint">
          {dayCount === 1 ? '당일치기' : `${dayCount - 1}박 ${dayCount}일`} 일정! 총 {dayCount}일로 계산됩니다.
        </p>
      </div>

      <div className="card" style={{ gap: 14 }}>
        <div className="card-title">인원과 이동수단</div>
        <label className="field">
          <span>인원</span>
          <input type="number" min={2} max={12} value={form.headcount} onChange={set('headcount')} placeholder="ex) 5" />
        </label>
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
      </div>

      <div className="card" style={{ gap: 14 }}>
        <div className="card-title">일정 시작, 마감 장소</div>
        <label className="field">
          <span>일정 시작 장소</span>
          <input value={form.originName} onChange={set('originName')} placeholder="ex) 서울역" />
        </label>
        <label className="field">
          <span>일정 마감 장소</span>
          <input value={form.destinationName} onChange={set('destinationName')} placeholder="ex) 서울역" />
        </label>
      </div>
    </Screen>
  );
}
