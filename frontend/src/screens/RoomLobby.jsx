import { useState } from 'react';
import Screen from '../components/Screen';
import { patchRoom } from '../lib/roomStore';
import { TOP_N, SLOTS_PER_DAY } from '../lib/preference';
import { daysBetween } from '../lib/time';

export default function RoomLobby({ room, isHost }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/r/${room.code}`;
  const dayCount = daysBetween(room.startDate, room.endDate);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Screen
      step={3}
      title="팀원을 기다리는 중"
      subtitle={room.title}
      footer={
        isHost ? (
          <button
            className="btn-primary"
            onClick={() => patchRoom(room.code, { status: 'collecting' })}
          >
            {room.members.length < room.headcount
              ? `${room.members.length}명으로 먼저 시작하기`
              : '희망지 입력 시작하기'}
          </button>
        ) : (
          <button className="btn-ghost" style={{ width: '100%' }} disabled>
            대표자가 시작하기를 누르면 넘어갑니다
          </button>
        )
      }
    >
      <div className="card pad-lg center">
        <div className="tl-note">방 코드</div>
        <div className="roomcode">{room.code}</div>
        <button className="btn-ghost" style={{ width: '100%' }} onClick={copy}>
          {copied ? '링크를 복사했어요' : '🔗 초대 링크 복사'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">
          참여자 {room.members.length}명 / {room.headcount}명
        </div>
        <div className="chips">
          {room.members.map((m) => (
            <span className="chip" key={m.id}>{m.nickname}{m.isHost ? ' 👑' : ''}</span>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">이렇게 진행됩니다</div>
        <p className="muted" style={{ margin: 0 }}>
          모두 모이면 가고 싶은 곳을 <strong>얼마든지</strong> 담고, 그중에서
          각자 <strong>{TOP_N}순위</strong>까지 고릅니다.
          순위를 모아 점수가 높은 {SLOTS_PER_DAY * dayCount}곳만 남기고,
          최소 시간과 최소 비용 두 가지 일정을 만들어 드립니다.
        </p>
      </div>
    </Screen>
  );
}
