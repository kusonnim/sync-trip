import { useState } from 'react';
import Screen from '../components/Screen';
import { joinRoom } from '../lib/roomStore';

export default function JoinRoom({ room, onJoined }) {
  const [nickname, setNickname] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  async function join() {
    setJoining(true);
    setError('');
    try {
      onJoined(await joinRoom(room.code, nickname.trim()));
    } catch {
      setError('방에 참여하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      setJoining(false);
    }
  }
  return (
    <Screen
      title={room.title}
      subtitle={`방 코드 ${room.code}`}
      footer={
        <button
          className="btn-accent"
          disabled={!nickname.trim() || joining}
          onClick={join}
        >
          {joining ? '참여하는 중...' : '참여하기'}
        </button>
      }
    >
      <div className="card" style={{ gap: 6 }}>
        <label className="field">
          <span>닉네임을 입력해 주세요</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="예: 지호" />
        </label>
        <p className="hint">로그인은 필요 없습니다. 팀원들에게 보일 이름만 정해 주세요.</p>
        {error && <p className="hint" style={{ color: 'var(--accent)' }}>{error}</p>}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">이미 들어온 사람</div>
          <div className="count">{room.members.length}명</div>
        </div>
        <div className="chips">
          {room.members.map((m) => (
            <span className="chip" key={m.id}>{m.nickname}{m.isHost ? ' 👑' : ''}</span>
          ))}
        </div>
      </div>
    </Screen>
  );
}
