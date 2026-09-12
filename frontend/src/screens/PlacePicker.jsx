import { useEffect, useState } from 'react';
import Screen from '../components/Screen';
import { searchPlaces, fetchPlaceHours } from '../lib/api';
import { addPlace, submitRanking, patchRoom, updatePlace } from '../lib/roomStore';
import { picksPerPerson } from '../lib/preference';
import { categoryLabel } from '../lib/categories';
import { daysBetween } from '../lib/time';

export default function PlacePicker({ room, me, isHost }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [ranking, setRanking] = useState(room.preferences[me.id] ?? []);
  const [editing, setEditing] = useState(null);

  const k = picksPerPerson(daysBetween(room.startDate, room.endDate), room.headcount);
  const submittedCount = room.members.filter((m) => m.submitted).length;

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchPlaces(query);
      if (alive) { setResults(found); setSearching(false); }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  function pick(place) {
    addPlace(room.code, place);
    setRanking((prev) => (prev.includes(place.id) || prev.length >= k ? prev : [...prev, place.id]));
    setQuery('');
    setResults([]);

    // Start with category defaults, then replace them when actual business hours arrive.
    // If the lookup fails, the defaults remain and itinerary creation can continue.
    fetchPlaceHours(place.name).then((hours) => {
      if (hours) updatePlace(room.code, place.id, { ...hours, hoursSource: 'google' });
    });
  }

  function toggleRank(placeId) {
    setRanking((prev) => {
      if (prev.includes(placeId)) return prev.filter((id) => id !== placeId);
      return prev.length >= k ? prev : [...prev, placeId];
    });
  }

  function move(placeId, delta) {
    setRanking((prev) => {
      const i = prev.indexOf(placeId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const placeById = Object.fromEntries(room.places.map((p) => [p.id, p]));
  const target = editing ? placeById[editing] : null;

  return (
    <Screen
      step={5}
      title="Choose Your Preferred Places"
      subtitle={`${ranking.length} / ${k} selected · ${submittedCount} members submitted`}
      footer={
        me.submitted && isHost ? (
          <button
            className="btn-accent"
            disabled={submittedCount < 2}
            onClick={() => patchRoom(room.code, { status: 'analyzing' })}
          >
            Combine Preferences and Build Routes ({submittedCount} submitted)
          </button>
        ) : (
          <button
            className="btn-primary"
            disabled={ranking.length === 0}
            onClick={() => submitRanking(room.code, me.id, ranking)}
          >
            {me.submitted ? 'Resubmit Ranking' : `Submit Ranking for ${ranking.length} Places`}
          </button>
        )
      }
    >
      <div className="card">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Search for Places</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a place you want to visit"
          />
        </label>
        {searching && <p className="tl-note" style={{ marginTop: 8 }}>Searching...</p>}
        {results.length > 0 && (
          <div className="list" style={{ marginTop: 10 }}>
            {results.map((p) => (
              <button key={p.id} className="item" style={{ textAlign: 'left' }} onClick={() => pick(p)}>
                <div className="grow">
                  <div className="name">{p.name}</div>
                  <div className="meta">{categoryLabel(p.category)} · {p.address}</div>
                </div>
                <span className="chip">Add</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">My Ranking ({ranking.length}/{k})</div>
        {ranking.length === 0 ? (
          <p className="empty-state">Search for and add places you want to visit.</p>
        ) : (
          <div className="list">
            {ranking.map((id, index) => (
              <div className="item" key={id}>
                <span className="rank-dot">{index + 1}</span>
                <div className="grow">
                  <div className="name">{placeById[id]?.name}</div>
                  <div className="meta">{categoryLabel(placeById[id]?.category)}</div>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => move(id, -1)} disabled={index === 0}>Up</button>
                <button className="btn-ghost btn-sm" onClick={() => move(id, 1)} disabled={index === ranking.length - 1}>Down</button>
                <button className="btn-ghost btn-sm" onClick={() => toggleRank(id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Places Added by the Group: {room.places.length}</div>
        <div className="list">
          {room.places.map((p) => (
            <div className="item" key={p.id}>
              <span className={ranking.includes(p.id) ? 'rank-dot' : 'rank-dot empty'}>
                {ranking.includes(p.id) ? ranking.indexOf(p.id) + 1 : '+'}
              </span>
              <div className="grow">
                <div className="name">{p.name}</div>
                <div className="meta">
                  {p.openTime}~{p.closeTime}
                  {p.fixedTime ? ` · ${p.fixedTime} reservation` : ''}
                  {p.isFixed ? ' · Required' : ''}
                </div>
              </div>
              {!ranking.includes(p.id) && (
                <button className="btn-ghost btn-sm" onClick={() => toggleRank(p.id)}>Add</button>
              )}
              {isHost && (
                <button className="btn-ghost btn-sm" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                  Hours
                </button>
              )}
            </div>
          ))}
          {room.places.length === 0 && <p className="empty-state">No one has added a place yet.</p>}
        </div>

        {target && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <div className="card-title">Set Times for {target.name}</div>
            <p className="tl-note" style={{ marginTop: -6 }}>
              These business hours are category defaults. Update them here if they differ or you have a reservation.
            </p>
            <div className="row">
              <label className="field">
                <span>Opens</span>
                <input
                  type="time"
                  value={target.openTime ?? ''}
                  onChange={(e) => updatePlace(room.code, editing, { openTime: e.target.value, hoursSource: 'manual' })}
                />
              </label>
              <label className="field">
                <span>Closes</span>
                <input
                  type="time"
                  value={target.closeTime ?? ''}
                  onChange={(e) => updatePlace(room.code, editing, { closeTime: e.target.value, hoursSource: 'manual' })}
                />
              </label>
            </div>
            <div className="row">
              <label className="field">
                <span>Reservation Time</span>
                <input
                  type="time"
                  value={target.fixedTime ?? ''}
                  onChange={(e) => updatePlace(room.code, editing, { fixedTime: e.target.value || null })}
                />
              </label>
              <label className="field">
                <span>Stay Duration (minutes)</span>
                <input
                  type="number"
                  step={10}
                  value={target.minStay ?? 60}
                  onChange={(e) => updatePlace(room.code, editing, { minStay: Number(e.target.value) })}
                />
              </label>
            </div>
            <button
              className="btn-ghost"
              style={{ width: '100%' }}
              onClick={() => updatePlace(room.code, editing, { isFixed: !target.isFixed })}
            >
              {target.isFixed ? 'Remove Required Status' : 'Mark as Required Place'}
            </button>
          </div>
        )}
      </div>
    </Screen>
  );
}
