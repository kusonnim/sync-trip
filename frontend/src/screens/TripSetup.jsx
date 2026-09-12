import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../components/Screen';
import { createRoom } from '../lib/roomStore';
import { daysBetween } from '../lib/time';

const today = new Date().toISOString().slice(0, 10);

export default function TripSetup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    hostNickname: '',
    title: '우리 여행',
    startDate: today,
    endDate: today,
    dailyStart: '10:00',
    dailyEnd: '21:00',
    headcount: 4,
    transportMode: 'transit',
    originName: '서울역',
    destinationName: '서울역',
  });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const dayCount = daysBetween(form.startDate, form.endDate);
  const ready = form.hostNickname.trim() && form.endDate >= form.startDate;

  function submit() {
    // Origin and destination coordinates become real values once Kakao Local search is wired up.
    const room = createRoom({
      ...form,
      headcount: Number(form.headcount),
      origin: { name: form.originName, lat: 37.5547, lng: 126.9707 },
      destination: { name: form.destinationName, lat: 37.5547, lng: 126.9707 },
    });
    navigate(`/r/${room.code}`);
  }

  return (
    <Screen
      title="여행 기본정보"
      subtitle="대표자가 먼저 입력합니다"
      footer={<button className="btn-primary" disabled={!ready} onClick={submit}>여행방 만들기</button>}
    >
      <div className="card" style={{ gap: 14 }}>
        <label className="field">
          <span>닉네임</span>
          <input value={form.hostNickname} onChange={set('hostNickname')} placeholder="예: 민서" />
        </label>
        <label className="field">
          <span>여행 이름</span>
          <input value={form.title} onChange={set('title')} />
        </label>
      </div>

      <div className="card" style={{ gap: 14 }}>
        <div className="card-title">날짜와 시간</div>
        <div className="grid-2">
          <label className="field">
            <span>시작일</span>
            <input type="date" value={form.startDate} onChange={set('startDate')} />
          </label>
          <label className="field">
            <span>종료일</span>
            <input type="date" value={form.endDate} onChange={set('endDate')} min={form.startDate} />
          </label>
          <label className="field">
            <span>하루 시작</span>
            <input type="time" value={form.dailyStart} onChange={set('dailyStart')} />
          </label>
          <label className="field">
            <span>귀가 마감</span>
            <input type="time" value={form.dailyEnd} onChange={set('dailyEnd')} />
          </label>
        </div>
        <p className="hint">총 {dayCount}일 일정으로 계산됩니다.</p>
      </div>

      <div className="card" style={{ gap: 14 }}>
        <div className="card-title">인원과 이동수단</div>
        <label className="field">
          <span>인원</span>
          <input type="number" min={2} max={12} value={form.headcount} onChange={set('headcount')} />
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
        <div className="card-title">출발지와 도착지</div>
        <label className="field">
          <span>출발지</span>
          <input value={form.originName} onChange={set('originName')} />
        </label>
        <label className="field">
          <span>도착지</span>
          <input value={form.destinationName} onChange={set('destinationName')} />
        </label>
      </div>
    </Screen>
  );
}
