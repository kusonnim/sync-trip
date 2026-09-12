import { useEffect, useRef, useState } from 'react';
import Screen from '../components/Screen';
import { optimize, buildOptimizeBody } from '../lib/api';
import { patchRoom } from '../lib/roomStore';
import { picksPerPerson, scorePlaces, pickCandidates } from '../lib/preference';
import { daysBetween } from '../lib/time';

const STEPS = ['Calculating preference scores', 'Selecting candidate places', 'Analyzing travel time and cost', 'Building two optimized routes'];

export default function Analyzing({ room, isHost }) {
  const [done, setDone] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    // Run optimization once on the host screen, then write the result to the room for everyone.
    if (!isHost || started.current) return;
    started.current = true;

    const ticker = setInterval(() => setDone((d) => Math.min(d + 1, STEPS.length - 1)), 500);

    (async () => {
      const dayCount = daysBetween(room.startDate, room.endDate);
      const k = picksPerPerson(dayCount, room.headcount);
      const scored = scorePlaces(room.places, room.preferences, k);
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
        // Keep the UI alive on failure, identify the conflict, and return users to editing.
        patchRoom(room.code, {
          routes: [],
          error: { code: result.code, message: result.message, placeIds: result.place_ids ?? [] },
          status: 'voting',
        });
      }
    })();

    return () => clearInterval(ticker);
  }, [isHost, room]);

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

      {!isHost && <p className="muted center">This screen will advance when optimization finishes on the host's device.</p>}
    </Screen>
  );
}
