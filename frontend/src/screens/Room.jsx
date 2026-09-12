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
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [myId, setMyIdState] = useState(() => getMyId(code));

  useEffect(() => subscribe(code, (next) => { setRoom(next); setLoaded(true); setSyncError(''); }, () => { setLoaded(true); setSyncError('Room synchronization is unavailable. Check your connection.'); }), [code]);

  if (!loaded) {
    return <Screen title="Loading Room"><p className="muted">Connecting to the shared room...</p></Screen>;
  }

  if (syncError) {
    return <Screen title="Connection Problem"><p className="muted">{syncError}</p></Screen>;
  }

  if (!room) {
    return (
      <Screen title="Room Not Found">
        <p className="muted">Check the room code and invitation link, then try again.</p>
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
