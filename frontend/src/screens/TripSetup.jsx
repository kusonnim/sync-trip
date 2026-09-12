import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../components/Screen';
import { createRoom } from '../lib/roomStore';
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

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const dayCount = daysBetween(form.startDate, form.endDate);
  const ready = form.hostNickname.trim() && form.endDate >= form.startDate;

  function submit() {
    // Replace these placeholder coordinates when the backend Kakao Local search is connected.
    const room = createRoom({
      ...form,
      headcount: Number(form.headcount),
      origin: { name: form.originName, lat: 37.5547, lng: 126.9707 },
      destination: { name: form.destinationName, lat: 37.5547, lng: 126.9707 },
    });
    navigate(`/r/${room.code}`);
  }

  return (
    <Screen
      step={2}
      title="Trip Details"
      subtitle="The host sets these details first"
      footer={<button className="btn-primary" disabled={!ready} onClick={submit}>Create Trip Room</button>}
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
