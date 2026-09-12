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

  // The calculation failed. Name the conflict and send the user back to the edit screen.
  if (room.error) {
    return (
      <Screen step={7} title="일정을 만들지 못했어요" subtitle="시간을 조정하면 다시 계산합니다">
        <ConflictNotice error={room.error} places={room.places} />
        <div className="bottom-bar">
          <button
            className="btn-primary"
            onClick={() => patchRoom(room.code, { status: 'collecting', error: null })}
          >
            장소와 시간 고치러 가기
          </button>
        </div>
      </Screen>
    );
  }

  if (confirmed && winner) {
    return (
      <Screen step={10} title="여행 일정이 확정됐습니다" subtitle={room.title}>
        <div className="notice" style={{ background: '#eaf7f0', color: '#1d7048' }}>
          <strong>{winner.label} 안으로 확정했습니다.</strong>
          <div style={{ marginTop: 4 }}>
            총 이동 {durationText(winner.total_time)} · 교통비 {won(winner.total_cost)}
          </div>
        </div>
        <RouteCard route={winner} open onToggle={() => {}} />
        <div className="bottom-bar">
          <button className="btn-primary" onClick={share}>
            {copied ? '링크를 복사했어요' : '일정 링크 공유하기'}
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      step={9}
      title="어느 일정으로 갈까요"
      subtitle={`${Object.keys(room.finalVotes).length} / ${room.members.length}명 투표`}
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
            최다 득표안으로 확정하기
          </button>
        ) : (
          <button className="btn-ghost" style={{ width: '100%' }} disabled>
            대표자가 확정하면 일정이 나옵니다
          </button>
        )
      }
    >
      <p className="muted">
        {room.routes.length > 1
          ? '같은 후보로 목적이 다른 두 안을 만들었습니다. 둘 다 영업시간과 지정한 방문 시간을 지킵니다.'
          : '시간 제약이 빡빡해 가능한 일정이 하나뿐입니다. 이 안은 영업시간과 지정한 방문 시간을 모두 지킵니다.'}
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
