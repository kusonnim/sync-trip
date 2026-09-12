import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../components/Screen';
import { patchRoom } from '../lib/roomStore';
import { TOP_N, SLOTS_PER_DAY } from '../lib/preference';
import { daysBetween } from '../lib/time';

export default function RoomLobby({ room, isHost }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
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

  async function start() {
    setStarting(true);
    setError('');
    try {
      await patchRoom(room.code, { status: 'collecting' });
    } catch {
      setError('방을 다음 단계로 넘기지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
      setStarting(false);
    }
  }

  // A trip of one has nobody to wait for, so the screen stops asking it to.
  const solo = room.headcount <= 1 && room.members.length <= 1;

  return (
    <Screen
      title={solo ? '혼자 떠나는 여행' : '팀원을 기다리는 중'}
      subtitle={room.title}
      back={{ label: '처음', onClick: () => navigate('/') }}
      footer={
        isHost ? (
          <button
            className="btn-primary"
            disabled={starting}
            onClick={start}
          >
            {starting
              ? '시작하는 중...'
              : solo || room.members.length >= room.headcount
              ? '희망지 입력 시작하기'
              : `${room.members.length}명으로 먼저 시작하기`}
          </button>
        ) : (
          <button className="btn-ghost" style={{ width: '100%' }} disabled>
            대표자가 시작하기를 누르면 넘어갑니다
          </button>
        )
      }
    >
      <div className="card" style={{ alignItems: 'center', gap: 14, padding: '24px 18px' }}>
        <div className="hint" style={{ fontWeight: 600 }}>방 코드</div>
        <div className="roomcode">{room.code}</div>
        <button className="btn-ghost" style={{ width: '100%' }} onClick={copy}>
          🔗 초대 링크 복사
        </button>
        {solo && <div className="hint">나중에 누가 합류해도 이 링크로 들어올 수 있어요.</div>}
        {copied && (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--good)' }}>링크를 복사했어요</div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">참여자</div>
          <div className="count">{room.members.length} / {room.headcount}명 입장</div>
        </div>
        <div className="chips">
          {room.members.map((m) => (
            <span className="chip" key={m.id}>{m.nickname}{m.isHost ? ' 👑' : ''}</span>
          ))}
        </div>
      </div>
      {error && <p className="tl-note" style={{ color: 'var(--accent)' }}>{error}</p>}

      <div className="card" style={{ gap: 10 }}>
        <div className="card-title">이렇게 진행됩니다</div>
        <p className="muted" style={{ lineHeight: 1.7 }}>
          1. {solo ? '가고 싶은 곳을 담고' : '각자 가고 싶은 곳을 담고'} 그중 {TOP_N}곳에 순위를 매깁니다.<br />
          2. 1순위 3점, 2순위 2점, 3순위 1점으로 합산합니다.<br />
          3. 점수가 높은 {SLOTS_PER_DAY * dayCount}곳만 남겨 두 가지 경로를 만들고, 투표로 하나를 확정합니다.
        </p>
      </div>
    </Screen>
  );
}
