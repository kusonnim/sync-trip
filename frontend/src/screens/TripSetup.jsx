import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../components/Screen';
import { createRoom } from '../lib/roomStore';
import { searchPlaces } from '../lib/api';
import { daysBetween } from '../lib/time';

const today = new Date().toISOString().slice(0, 10);

export default function TripSetup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    hostNickname: '',
    title: 'Our Trip',
    startDate: today,
    endDate: today,
    dailyStart: '10:00',
    dailyEnd: '21:00',
    headcount: 4,
    transportMode: 'transit',
    originName: 'Seoul Station',
    destinationName: 'Seoul Station',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const dayCount = daysBetween(form.startDate, form.endDate);
  const ready = form.hostNickname.trim() && form.endDate >= form.startDate;

  async function submit() {
    setCreating(true);
    setError('');
    try {
      const originLookup = searchPlaces(form.originName);
      const destinationLookup = form.destinationName === form.originName ? originLookup : searchPlaces(form.destinationName);
      const [originMatches, destinationMatches] = await Promise.all([originLookup, destinationLookup]);
      if (!originMatches[0] || !destinationMatches[0]) {
        throw new Error('A start or end location could not be found. Use a more specific place name.');
      }
      const room = await createRoom({
        ...form,
        headcount: Number(form.headcount),
        origin: { name: originMatches[0].name, lat: originMatches[0].lat, lng: originMatches[0].lng },
        destination: { name: destinationMatches[0].name, lat: destinationMatches[0].lat, lng: destinationMatches[0].lng },
      });
      navigate(`/r/${room.code}`);
    } catch (reason) {
      setError(reason?.message || 'The room could not be created. Check your connection and try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Screen
      step={2}
      title="Trip Details"
      subtitle="The host sets these details first"
      footer={<button className="btn-primary" disabled={!ready || creating} onClick={submit}>{creating ? 'Creating Room...' : 'Create Trip Room'}</button>}
    >
      <div className="card">
        <label className="field">
          <span>Your Nickname</span>
          <input value={form.hostNickname} onChange={set('hostNickname')} placeholder="e.g., Jamie" />
        </label>
        <label className="field">
          <span>Trip Name</span>
          <input value={form.title} onChange={set('title')} />
        </label>
      </div>
      {error && <p className="tl-note" style={{ color: 'var(--accent)' }}>{error}</p>}

      <div className="card">
        <div className="card-title">Dates and Times</div>
        <div className="row">
          <label className="field">
            <span>Start Date</span>
            <input type="date" value={form.startDate} onChange={set('startDate')} />
          </label>
          <label className="field">
            <span>End Date</span>
            <input type="date" value={form.endDate} onChange={set('endDate')} min={form.startDate} />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>Daily Start Time</span>
            <input type="time" value={form.dailyStart} onChange={set('dailyStart')} />
          </label>
          <label className="field">
            <span>Daily Deadline</span>
            <input type="time" value={form.dailyEnd} onChange={set('dailyEnd')} />
          </label>
        </div>
        <p className="tl-note" style={{ margin: 0 }}>We will plan a {dayCount}-day itinerary.</p>
      </div>

      <div className="card">
        <div className="card-title">Group and Transportation</div>
        <label className="field">
          <span>Number of Travelers</span>
          <input type="number" min={2} max={12} value={form.headcount} onChange={set('headcount')} />
        </label>
        <label className="field">
          <span>Transportation</span>
          <div className="choice-group">
            {[['transit', '🚌 Public Transit'], ['car', '🚗 Car']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="choice"
                aria-pressed={form.transportMode === value}
                onClick={() => setForm({ ...form, transportMode: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="card">
        <div className="card-title">Start and End Locations</div>
        <div className="row">
          <label className="field">
            <span>Start Location</span>
            <input value={form.originName} onChange={set('originName')} />
          </label>
          <label className="field">
            <span>End Location</span>
            <input value={form.destinationName} onChange={set('destinationName')} />
          </label>
        </div>
      </div>
    </Screen>
  );
}
