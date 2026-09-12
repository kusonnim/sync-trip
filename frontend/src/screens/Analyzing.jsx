import { useEffect, useRef, useState } from 'react';
import Screen from '../components/Screen';
import { optimize, buildOptimizeBody } from '../lib/api';
import { patchRoom } from '../lib/roomStore';
import { scorePlaces, pickCandidates } from '../lib/preference';
import { daysBetween } from '../lib/time';

const STEPS = ['선호 점수 계산', '방문 후보 정리', '이동시간·비용 분석', '최적 경로 2안 생성'];

export default function Analyzing({ room, isHost }) {
  const [done, setDone] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    // Run the calculation once on the host's screen and write the result to the room,
    // which propagates it to everyone.
    if (!isHost || started.current) return;
    started.current = true;

    const ticker = setInterval(() => setDone((d) => Math.min(d + 1, STEPS.length - 1)), 500);

    (async () => {
      const dayCount = daysBetween(room.startDate, room.endDate);
      const scored = scorePlaces(room.places, room.preferences);
      const candidates = pickCandidates(scored, dayCount);

      let result;
      try {
        result = await optimize(buildOptimizeBody(room, candidates));
      } catch (e) {
        result = { status: 'error', code: 'REQUEST_FAILED', message: e.message, place_ids: [] };
      }

      clearInterval(ticker);
      setDone(STEPS.length);

      if (result.status === 'success') {
        patchRoom(room.code, { routes: result.routes, error: null, status: 'voting' });
      } else {
        // A failure must not kill the screen. Name the conflict and send the user back to edit.
        patchRoom(room.code, {
          routes: [],
          error: { code: result.code, message: result.message, placeIds: result.place_ids ?? [] },
          status: 'voting',
        });
      }
    })();

    return () => clearInterval(ticker);
  }, [isHost, room]);

  const dayCount = daysBetween(room.startDate, room.endDate);

  return (
    <Screen title="의견을 취합하고 있어요" subtitle="잠시만 기다려 주세요">
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

      {!isHost && <p className="muted center">대표자 화면에서 계산이 끝나면 자동으로 넘어갑니다.</p>}
    </Screen>
  );
}
