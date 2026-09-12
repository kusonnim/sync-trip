import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../components/Screen';
import { readRoom, resetLocalRooms } from '../lib/roomStore';
import { createSeededRoom } from '../lib/seed';
import { isDebug } from '../lib/debug';
import { SYNC_MODE } from '../lib/runtimeConfig';

export default function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const debug = SYNC_MODE === 'mock' && isDebug();

  async function enter() {
    const target = code.trim().toUpperCase();
    setJoining(true);
    setError('');
    try {
      if (!await readRoom(target)) {
        setError('그런 방이 없습니다. 코드를 다시 확인해 주세요.');
        return;
      }
      navigate(`/r/${target}`);
    } catch {
      setError('방을 조회할 수 없습니다. 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <Screen centered>
      <div style={{ padding: '56px 24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--brand)' }}>
            SyncTrip
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>같이 가는 여행, 동선까지 같이 정하기</div>
        </div>

        <div className="card pad-lg" style={{ gap: 14 }}>
          <p className="muted">
            각자 가고 싶은 곳에 순위를 매기면, 점수가 높은 곳을 골라 하루 단위 일정을 만들어 드려요.
          </p>
          <div className="chips">
            <span className="chip">투표로 장소 선정</span>
            <span className="chip">시간 제약 반영</span>
            <span className="chip">대중교통 노선까지</span>
          </div>
          <button className="btn-primary" onClick={() => navigate('/create')}>
            여행 만들기
          </button>
        </div>

        <div className="card pad-lg">
          <div className="card-title">초대받으셨나요?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
              placeholder="방 코드"
              maxLength={4}
              style={{ letterSpacing: '.24em', textTransform: 'uppercase' }}
            />
            <button className="btn-soft" style={{ flex: 'none' }} onClick={enter} disabled={code.length < 4 || joining}>
              {joining ? '확인 중...' : '입장'}
            </button>
          </div>
          {error && <p className="hint" style={{ color: 'var(--accent)' }}>{error}</p>}
        </div>

        {debug && (
          <div className="card pad-lg">
            <div className="card-title">디버그 도구</div>
            <p className="hint">
              5명이 각자 3곳씩 순위를 올려둔 방을 바로 만듭니다. 대표자로 들어갑니다.
            </p>
            <div className="stack-8">
              <button className="btn-ghost" onClick={() => navigate(`/r/${createSeededRoom().code}`)}>
                5명짜리 데모 방 만들기
              </button>
              <button className="btn-ghost" onClick={() => { resetLocalRooms(); window.location.reload(); }}>
                이 브라우저의 방 모두 지우기
              </button>
              <button className="btn-ghost" onClick={() => { window.location.search = '?debug=0'; }}>
                디버그 모드 끄기
              </button>
            </div>
          </div>
        )}
      </div>
    </Screen>
  );
}
