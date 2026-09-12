import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Screen from '../components/Screen';
import JoinRoom from './JoinRoom';
import RoomLobby from './RoomLobby';
import PlacePicker from './PlacePicker';
import Analyzing from './Analyzing';
import Result from './Result';
import { subscribe, getMyId, setMyId } from '../lib/roomStore';

// Route a room to the correct screen for its status.
// Everyone subscribes to the same status, so the host advances every member's screen together.
export default function Room() {
  const { code } = useParams();
  const navigate = useNavigate();
  // Personal exit. It leaves the shared room untouched, so anyone may use it.
  const toLanding = { label: '처음', onClick: () => navigate('/') };
  const [room, setRoom] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [myId, setMyIdState] = useState(() => getMyId(code));

  useEffect(() => subscribe(code, (next) => { setRoom(next); setLoaded(true); setSyncError(''); }, () => { setLoaded(true); setSyncError('방을 동기화할 수 없습니다. 연결을 확인해 주세요.'); }), [code]);

  if (!loaded) {
    return (
      <Screen title="방 불러오는 중" back={toLanding}>
        <p className="muted">공유 방에 연결하고 있습니다...</p>
      </Screen>
    );
  }

  if (syncError) {
    return (
      <Screen title="연결할 수 없어요" back={toLanding}>
        <div className="card"><p className="muted">{syncError}</p></div>
      </Screen>
    );
  }

  if (!room) {
    return (
      <Screen title="방을 찾을 수 없어요" subtitle="코드를 다시 확인해 주세요" back={toLanding}>
        <div className="card">
          <p className="muted">방 코드와 초대 링크를 확인한 뒤 다시 시도해 주세요.</p>
        </div>
      </Screen>
    );
  }

  const me = room.members.find((m) => m.id === myId);
  if (!me) {
    return (
      <JoinRoom
        room={room}
        onJoined={(id) => { setMyId(code, id); setMyIdState(id); }}
      />
    );
  }

  const isHost = me.isHost;
  const props = { room, me, isHost };

  switch (room.status) {
    case 'collecting':
      return <PlacePicker {...props} />;
    case 'analyzing':
      return <Analyzing {...props} />;
    case 'voting':
    case 'confirmed':
      return <Result {...props} />;
    default:
      return <RoomLobby {...props} />;
  }
}
