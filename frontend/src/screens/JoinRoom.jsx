import { useState } from 'react';
import Screen from '../components/Screen';
import { joinRoom } from '../lib/roomStore';

export default function JoinRoom({ room, onJoined }) {
  const [nickname, setNickname] = useState('');
  return (
    <Screen
      step={4}
      title={room.title}
      subtitle={`Room Code ${room.code}`}
      footer={
        <button
          className="btn-accent"
          disabled={!nickname.trim()}
          onClick={() => onJoined(joinRoom(room.code, nickname.trim()))}
        >
          Join Room
        </button>
      }
    >
      <div className="card pad-lg">
        <div className="card-title">Enter Your Nickname</div>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g., Alex" />
        <p className="muted" style={{ marginBottom: 0 }}>
          No sign-in is required. Choose the name other members will see.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Members Already Here: {room.members.length}</div>
        <div className="chips">
          {room.members.map((m) => (
            <span className="chip gray" key={m.id}>{m.nickname}{m.isHost ? ' 👑' : ''}</span>
          ))}
        </div>
      </div>
    </Screen>
  );
}
