import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  const [room, setRoom] = useState(null);
  const [myId, setMyIdState] = useState(() => getMyId(code));

  useEffect(() => subscribe(code, setRoom), [code]);

  if (!room) {
    return (
      <Screen title="방을 찾을 수 없어요">
        <p className="muted">코드가 맞는지 확인해 주세요. 이 브라우저에서 만든 방만 열 수 있습니다.</p>
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
