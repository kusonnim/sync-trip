import { useState } from 'react';
import Screen from '../components/Screen';
import RouteCard from '../components/RouteCard';
import ConflictNotice from '../components/ConflictNotice';
import { castVote, patchRoom } from '../lib/roomStore';
import { durationText, won } from '../lib/time';

export default function Result({ room, me, isHost }) {
  const [open, setOpen] = useState(room.routes[0]?.type ?? null);
  const [copied, setCopied] = useState(false);

  const confirmed = room.status === 'confirmed';
  const myVote = room.finalVotes[me.id];
  const votes = room.routes.map((r) => Object.values(room.finalVotes).filter((v) => v === r.type).length);
  const leaderIndex = votes.length ? votes.indexOf(Math.max(...votes)) : -1;
  const winner = room.routes.find((r) => r.type === room.confirmedRouteId) ?? room.routes[leaderIndex];

  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${room.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  // On failure, identify the conflict and return users to the editing screen.
  if (room.error) {
    return (
      <Screen step={7} title="We Couldn't Build an Itinerary" subtitle="Adjust the times and try again">
        <ConflictNotice error={room.error} places={room.places} />
        <div className="bottom-bar">
          <button
            className="btn-primary"
            onClick={() => patchRoom(room.code, { status: 'collecting', error: null })}
          >
            Edit Places and Times
          </button>
        </div>
      </Screen>
    );
  }

  if (confirmed && winner) {
    return (
      <Screen step={10} title="Your Itinerary Is Confirmed" subtitle={room.title}>
        <div className="notice" style={{ background: '#eaf7f0', color: '#1d7048' }}>
          <strong>{winner.label} selected.</strong>
          <div style={{ marginTop: 4 }}>
            Total travel time: {durationText(winner.total_time)} · Estimated fare: {won(winner.total_cost)}
          </div>
        </div>
        <RouteCard route={winner} open onToggle={() => {}} />
        <div className="bottom-bar">
          <button className="btn-primary" onClick={share}>
            {copied ? 'Link Copied' : 'Share Itinerary Link'}
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      step={9}
      title="Which Itinerary Should We Choose?"
      subtitle={`${Object.keys(room.finalVotes).length} / ${room.members.length} members voted`}
      footer={
        isHost ? (
          <button
            className="btn-accent"
            disabled={Object.keys(room.finalVotes).length === 0}
            onClick={() =>
              patchRoom(room.code, {
                status: 'confirmed',
                confirmedRouteId: room.routes[leaderIndex].type,
              })
            }
          >
            Confirm the Most Popular Route
          </button>
        ) : (
          <button className="btn-ghost" style={{ width: '100%' }} disabled>
            The itinerary will appear when the host confirms it
          </button>
        )
      }
    >
      <p className="muted">
        We built two routes with different goals from the same candidates. Both respect business hours and reservations.
      </p>
      {room.routes.map((route, i) => (
        <RouteCard
          key={route.type}
          route={route}
          open={open === route.type}
          onToggle={() => setOpen(open === route.type ? null : route.type)}
          votes={votes[i]}
          myVote={myVote}
          onVote={(type) => castVote(room.code, me.id, type)}
        />
      ))}
    </Screen>
  );
}
