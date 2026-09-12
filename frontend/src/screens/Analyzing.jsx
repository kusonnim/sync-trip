import { useEffect, useRef, useState } from 'react';
import Screen from '../components/Screen';
import { optimize, buildOptimizeBody } from '../lib/api';
import { claimOptimization, finishOptimization } from '../lib/roomStore';
import { picksPerPerson, scorePlaces, pickCandidates } from '../lib/preference';
import { daysBetween } from '../lib/time';

const STEPS = ['Calculating preference scores', 'Selecting candidate places', 'Analyzing travel time and cost', 'Building two optimized routes'];

export default function Analyzing({ room, me, isHost }) {
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');
  const started = useRef(false);
  const snapshot = useRef(room);

  useEffect(() => {
    // Run optimization once on the host screen, then write the result to the room for everyone.
    if (!isHost || started.current) return;
    started.current = true;

    const ticker = setInterval(() => setDone((d) => Math.min(d + 1, STEPS.length - 1)), 500);

    (async () => {
      const currentRoom = snapshot.current;
      let runId;
      try {
        runId = await claimOptimization(currentRoom.code, me.id);
        if (!runId) {
          setError('Optimization is already running in another host tab. This room will advance when it finishes.');
          return;
        }
      } catch {
        setError('Could not acquire the optimization lock. Refresh to retry if the host disconnected.');
        return;
      }
      const dayCount = daysBetween(currentRoom.startDate, currentRoom.endDate);
      const k = picksPerPerson(dayCount, currentRoom.headcount);
      const scored = scorePlaces(currentRoom.places, currentRoom.preferences, k);
      const candidates = pickCandidates(scored, dayCount);

      let result;
      try {
        result = await optimize(buildOptimizeBody(currentRoom, candidates));
      } catch {
        result = { status: 'error', code: 'REQUEST_FAILED', message: 'The optimization service is unavailable. Check the backend configuration and try again.', place_ids: [] };
      }

      clearInterval(ticker);
      setDone(STEPS.length);

      try { await finishOptimization(currentRoom.code, result, runId); }
      catch { setError('Optimization finished, but the shared result could not be saved. Refresh to retry after the lock expires.'); }
    })();

    return () => clearInterval(ticker);
  }, [isHost, me.id]);

  return (
    <Screen step={6} title="Optimizing Your Trip" subtitle="Please wait a moment">
      <div className="card pad-lg">
        {STEPS.map((label, i) => (
          <div className={i < done ? 'progress-step done' : 'progress-step'} key={label}>
            <span className="tick">✓</span>
            {label}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Optimization Settings</div>
        <div className="chips">
          <span className="chip gray">{daysBetween(room.startDate, room.endDate)} days</span>
          <span className="chip gray">{room.members.filter((m) => m.submitted).length} submitted</span>
          <span className="chip gray">{room.places.length} candidates</span>
          <span className="chip">{room.transportMode === 'transit' ? 'Public Transit' : 'Car'}</span>
          <span className="chip accent">{room.dailyEnd} deadline</span>
        </div>
      </div>
      {error && <p className="tl-note" style={{ color: 'var(--accent)' }}>{error}</p>}

      {!isHost && <p className="muted center">This screen will advance when optimization finishes on the host's device.</p>}
    </Screen>
  );
}
