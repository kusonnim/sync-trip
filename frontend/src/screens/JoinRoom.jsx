import { useState } from 'react';
import Screen from '../components/Screen';
import { joinRoom } from '../lib/roomStore';

export default function JoinRoom({ room, onJoined }) {
  const [nickname, setNickname] = useState('');
  return (
    <Screen
      title={room.title}
      subtitle={`방 코드 ${room.code}`}
      footer={
        <button
          className="btn-accent"
          disabled={!nickname.trim()}
          onClick={() => onJoined(joinRoom(room.code, nickname.trim()))}
        >
          참여하기
        </button>
      }
    >
      <div className="card" style={{ gap: 6 }}>
        <label className="field">
          <span>닉네임을 입력해 주세요</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="예: 지호" />
        </label>
        <p className="hint">로그인은 필요 없습니다. 팀원들에게 보일 이름만 정해 주세요.</p>
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
