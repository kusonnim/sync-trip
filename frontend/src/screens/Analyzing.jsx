import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../components/Screen';
import { optimize, buildOptimizeBody } from '../lib/api';
import { claimOptimization, finishOptimization, patchRoom, readRoom } from '../lib/roomStore';
import { scorePlaces, pickCandidates } from '../lib/preference';
import { daysBetween } from '../lib/time';

const STEPS = ['선호 점수 계산', '방문 후보 정리', '이동시간·비용 분석', '최적 경로 2안 생성'];

export default function Analyzing({ room, me, isHost }) {
  const navigate = useNavigate();
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const started = useRef(false);
  const snapshot = useRef(room);

  useEffect(() => {
    // Run the calculation once on the host's screen and write the result to the room,
    // which propagates it to everyone.
    if (!isHost || started.current) return;
    started.current = true;

    const ticker = setInterval(() => setDone((d) => Math.min(d + 1, STEPS.length - 1)), 500);

    (async () => {
      const currentRoom = snapshot.current;
      let optimizationRoom = currentRoom;
      let runId;
      try {
        runId = await claimOptimization(currentRoom.code, me.id);
        if (!runId) {
          clearInterval(ticker);
          setError('다른 대표자 탭에서 이미 계산 중입니다. 계산이 끝나면 이 방도 자동으로 넘어갑니다.');
          return;
        }
        optimizationRoom = await readRoom(currentRoom.code);
        if (!optimizationRoom) throw new Error('Room not found.');
      } catch {
        clearInterval(ticker);
        setError('계산 잠금을 얻거나 최신 방 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.');
        return;
      }
      const dayCount = daysBetween(optimizationRoom.startDate, optimizationRoom.endDate);
      const scored = scorePlaces(optimizationRoom.places, optimizationRoom.preferences);
      const candidates = pickCandidates(scored, dayCount);

      let result;
      try {
        result = await optimize(buildOptimizeBody(optimizationRoom, candidates));
      } catch {
        result = { status: 'error', code: 'REQUEST_FAILED', message: 'The optimization service is unavailable. Check the backend configuration and try again.', place_ids: [] };
      }

      clearInterval(ticker);
      setDone(STEPS.length);

      try { await finishOptimization(currentRoom.code, result, runId); }
      catch { setError('계산은 끝났지만 결과를 저장하지 못했습니다. 잠금이 만료된 뒤 새로고침해 다시 시도해 주세요.'); }
    })();

    return () => clearInterval(ticker);
  }, [isHost, me.id]);

  const dayCount = daysBetween(room.startDate, room.endDate);

  // Stepping back abandons this run. The result is written under a run id, so a
  // calculation still in flight cannot overwrite the room after we leave.
  async function backToPicking() {
    setLeaving(true); setError('');
    try { await patchRoom(room.code, { status: 'collecting', optimizationState: 'idle', optimizationOwner: null }); }
    catch { setError('희망지 화면으로 돌아가지 못했습니다. 다시 시도해 주세요.'); setLeaving(false); }
  }

  return (
    <Screen
      title="의견을 취합하고 있어요"
      subtitle="잠시만 기다려 주세요"
      back={
        isHost
          ? { label: '희망지', onClick: backToPicking, disabled: leaving }
          : { label: '처음', onClick: () => navigate('/') }
      }
    >
      <div className="card" style={{ gap: 14 }}>
        {STEPS.map((label, i) => (
          <div className={i < done ? 'progress-step done' : 'progress-step'} key={label}>
            <span className="tick">{i < done ? '✓' : i + 1}</span>
            <span className="label">{label}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">이번 계산에 쓰인 조건</div>
        <div className="chips">
          <span className="chip">{dayCount}일</span>
          <span className="chip">{room.members.filter((m) => m.submitted).length}명</span>
          <span className="chip">{room.transportMode === 'transit' ? '🚌 대중교통' : '🚗 자차'}</span>
          <span className="chip">{room.dailyStart} 시작</span>
          <span className="chip accent">{room.dailyEnd} 귀가 마감</span>
        </div>
      </div>
      {error && <p className="tl-note" style={{ color: 'var(--accent)' }}>{error}</p>}

      {!isHost && <p className="muted center">대표자 화면에서 계산이 끝나면 자동으로 넘어갑니다.</p>}
    </Screen>
  );
}
