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
      setError('Room not found. Please check the code and try again.');
      return;
    }
    navigate(`/r/${target}`);
  }

  return (
    <Screen title="SyncTrip" subtitle="Plan the trip and the route together">
      <div className="card pad-lg">
        <p className="muted" style={{ marginTop: 0 }}>
          Rank the places you want to visit, and we will build an efficient itinerary
          that respects business hours and reservation times.
        </p>
        <div className="chips" style={{ marginBottom: 16 }}>
          <span className="chip">Group-ranked places</span>
          <span className="chip accent">Time constraints included</span>
          <span className="chip gray">Transit routes included</span>
        </div>
        <button className="btn-primary" onClick={() => navigate('/create')}>
          Create a Trip
        </button>
      </div>

      <div className="card">
        <div className="card-title">Have an invitation?</div>
        <div className="row">
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
            placeholder="4-character room code"
            maxLength={4}
            style={{ letterSpacing: 4, fontWeight: 700 }}
          />
          <button className="btn-ghost" style={{ flex: 'none' }} onClick={enter} disabled={code.length < 4}>
            Join
          </button>
        </div>
        {error && <p className="tl-note" style={{ color: 'var(--accent)', marginTop: 8 }}>{error}</p>}
      </div>
    </Screen>
  );
}
