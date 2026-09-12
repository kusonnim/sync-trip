import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../components/Screen';
import RouteCard from '../components/RouteCard';
import ConflictNotice from '../components/ConflictNotice';
import { castVote, patchRoom } from '../lib/roomStore';
import { durationText, won } from '../lib/time';

export default function Result({ room, me, isHost }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(room.routes[0]?.type ?? null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState('');

  const confirmed = room.status === 'confirmed';
  const myVote = room.finalVotes[me.id];
  const votes = room.routes.map((r) => Object.values(room.finalVotes).filter((v) => v === r.type).length);
  const leaderIndex = votes.length ? votes.indexOf(Math.max(...votes)) : -1;
  const winner = room.routes.find((r) => r.type === room.confirmedRouteId) ?? room.routes[leaderIndex];
  const castCount = Object.keys(room.finalVotes).length;

  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${room.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  async function vote(type) {
    setSaving(true); setSyncError('');
    try { await castVote(room.code, me.id, type); }
    catch { setSyncError('투표를 동기화하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setSaving(false); }
  }

  async function confirm() {
    setSaving(true); setSyncError('');
    try { await patchRoom(room.code, { status: 'confirmed', confirmedRouteId: room.routes[leaderIndex].type }); }
    catch { setSyncError('최종 일정을 확정하지 못했습니다. 다시 시도해 주세요.'); setSaving(false); }
  }

  async function unconfirm() {
    setSaving(true); setSyncError('');
    try { await patchRoom(room.code, { status: 'voting', confirmedRouteId: null }); }
    catch { setSyncError('확정을 되돌리지 못했습니다. 다시 시도해 주세요.'); }
    finally { setSaving(false); }
  }

  async function returnToEditing() {
    setSaving(true); setSyncError('');
    try { await patchRoom(room.code, { status: 'collecting', optimizationState: 'idle' }); }
    catch { setSyncError('수정 화면으로 돌아가지 못했습니다. 다시 시도해 주세요.'); setSaving(false); }
  }

  // The calculation failed. Name the conflict and send the user back to the edit screen.
  if (room.error) {
    return (
      <Screen
        title="일정을 만들지 못했어요"
        subtitle="시간을 조정하면 다시 계산합니다"
        back={{ label: '처음', onClick: () => navigate('/') }}
        footer={
          <button
            className="btn-primary"
            disabled={saving}
            onClick={returnToEditing}
          >
            {saving ? '돌아가는 중...' : '장소와 시간 고치러 가기'}
          </button>
        }
      >
        <ConflictNotice error={room.error} places={room.places} />
        {syncError && <p className="hint" style={{ color: 'var(--accent)' }}>{syncError}</p>}
      </Screen>
    );
  }

  return (
    <Screen
      title={confirmed ? '이 일정으로 확정했어요' : '어느 일정으로 갈까요'}
      subtitle={`${castCount} / ${room.members.length}명 투표`}
      back={
        isHost
          ? confirmed
            ? { label: '투표', onClick: unconfirm, disabled: saving }
            : { label: '희망지', onClick: returnToEditing, disabled: saving }
          : { label: '처음', onClick: () => navigate('/') }
      }
      footer={
        confirmed ? (
          <button className="btn-good" onClick={share}>
            {copied ? '링크를 복사했어요' : '일정 링크 공유하기'}
          </button>
        ) : isHost ? (
          <button
            className="btn-primary"
            disabled={castCount === 0 || saving}
            onClick={confirm}
          >
            {saving ? '확정하는 중...' : '최다 득표안으로 확정하기'}
          </button>
        ) : (
          <button className="btn-ghost" style={{ width: '100%' }} disabled>
            대표자가 확정하면 일정이 나옵니다
          </button>
        )
      }
    >
      {confirmed && winner && (
        <div className="notice good">
          <span>{winner.label} 안으로 확정했어요</span>
          <span className="sub">
            이동 {durationText(winner.total_time)} · 요금 {won(winner.total_cost)}
          </span>
        </div>
      )}

      {!confirmed && (
        <p className="muted">
          {room.routes.length > 1
            ? '같은 후보로 목적이 다른 두 안을 만들었어요.'
            : '시간 제약이 빡빡해 가능한 일정이 하나뿐이에요.'}
        </p>
      )}

      {(confirmed && winner ? [winner] : room.routes).map((route) => (
        <RouteCard
          key={route.type}
          route={route}
          open={confirmed ? true : open === route.type}
          onToggle={() => setOpen(open === route.type ? null : route.type)}
          votes={confirmed ? undefined : votes[room.routes.indexOf(route)]}
          myVote={myVote}
          onVote={confirmed || saving ? undefined : vote}
        />
      ))}
      {syncError && <p className="hint" style={{ color: 'var(--accent)' }}>{syncError}</p>}
    </Screen>
  );
}
