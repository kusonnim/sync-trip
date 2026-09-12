import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../components/Screen';
import { readRoom } from '../lib/roomStore';

export default function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function enter() {
    const target = code.trim().toUpperCase();
    if (!readRoom(target)) {
      setError('그런 방이 없습니다. 코드를 다시 확인해 주세요.');
      return;
    }
    navigate(`/r/${target}`);
  }

  return (
    <Screen title="SyncTrip" subtitle="같이 가는 여행, 동선까지 같이 정하기">
      <div className="card pad-lg">
        <p className="muted" style={{ marginTop: 0 }}>
          각자 가고 싶은 곳을 순위로 내면, 영업시간과 예약 시각을 지키면서
          가장 덜 돌아다니는 일정을 만들어 드립니다.
        </p>
        <div className="chips" style={{ marginBottom: 16 }}>
          <span className="chip">투표로 장소 선정</span>
          <span className="chip accent">시간 제약 반영</span>
          <span className="chip gray">대중교통 노선까지</span>
        </div>
        <button className="btn-primary" onClick={() => navigate('/create')}>
          여행 만들기
        </button>
      </div>

      <div className="card">
        <div className="card-title">초대받으셨나요?</div>
        <div className="row">
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
            placeholder="방 코드 4자리"
            maxLength={4}
            style={{ letterSpacing: 4, fontWeight: 700 }}
          />
          <button className="btn-ghost" style={{ flex: 'none' }} onClick={enter} disabled={code.length < 4}>
            입장
          </button>
        </div>
        {error && <p className="tl-note" style={{ color: 'var(--accent)', marginTop: 8 }}>{error}</p>}
      </div>
    </Screen>
  );
}
