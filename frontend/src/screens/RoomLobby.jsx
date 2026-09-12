import { useState } from 'react';
import Screen from '../components/Screen';
import { patchRoom } from '../lib/roomStore';
import { picksPerPerson } from '../lib/preference';
import { daysBetween } from '../lib/time';

export default function RoomLobby({ room, isHost }) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const link = `${window.location.origin}/r/${room.code}`;
  const dayCount = daysBetween(room.startDate, room.endDate);
  const k = picksPerPerson(dayCount, room.headcount);

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
      setError('Could not advance the room. Check your connection and try again.');
      setStarting(false);
    }
  }

  return (
    <Screen
      step={3}
      title="Waiting for Members"
      subtitle={room.title}
      footer={
        isHost ? (
          <button
            className="btn-primary"
            disabled={room.members.length < 2 || starting}
            onClick={start}
          >
            {starting ? 'Starting...' : room.members.length < 2 ? 'Waiting for One More Member' : 'Start Adding Place Preferences'}
          </button>
        ) : (
          <button className="btn-ghost" style={{ width: '100%' }} disabled>
            The host will start the next step
          </button>
        )
      }
    >
      <div className="card pad-lg center">
        <div className="tl-note">Room Code</div>
        <div className="roomcode">{room.code}</div>
        <button className="btn-ghost" style={{ width: '100%' }} onClick={copy}>
          {copied ? 'Link Copied' : '🔗 Copy Invitation Link'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">
          Members: {room.members.length} / {room.headcount}
        </div>
        <div className="chips">
          {room.members.map((m) => (
            <span className="chip" key={m.id}>{m.nickname}{m.isHost ? ' 👑' : ''}</span>
          ))}
        </div>
      </div>
      {error && <p className="tl-note" style={{ color: 'var(--accent)' }}>{error}</p>}

      <div className="card">
        <div className="card-title">How It Works</div>
        <p className="muted" style={{ margin: 0 }}>
          Once everyone joins, each member ranks up to <strong>{k} places</strong>.
          {' '}That limit is based on a {dayCount}-day trip for {room.headcount} travelers.
          We combine the rankings, keep the highest-scoring places, and build a fastest route and a lowest-cost route.
        </p>
      </div>
    </Screen>
  );
}
