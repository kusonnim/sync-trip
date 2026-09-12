# SyncTrip Frontend

The React/Vite frontend implements the ten-step group-planning flow and synchronizes production rooms through Firebase Firestore.

## Runtime Modes

Modes are explicit so production cannot silently become a local demo:

```dotenv
# Production
VITE_SYNC_MODE=firestore
VITE_API_MODE=backend
VITE_API_BASE=https://api.example.com

# Local/demo alternative
VITE_SYNC_MODE=mock
VITE_API_MODE=mock
```

`firestore` mode requires all `VITE_FIREBASE_*` values in `.env.example`. Firebase web configuration is intentionally public. Never place Kakao, Google Places, Kakao Mobility, or ODsay credentials in a `VITE_` variable.

## Shared Room Model

`src/lib/roomStore.js` keeps the screen-facing API stable and uses modular Firebase operations. The persisted paths are:

```text
rooms/{roomCode}
rooms/{roomCode}/members/{memberId}
rooms/{roomCode}/places/{placeId}
rooms/{roomCode}/preferences/{memberId}
rooms/{roomCode}/routes/current
rooms/{roomCode}/errors/current
rooms/{roomCode}/finalVotes/{memberId}
```

Firestore requires alternating collection/document path segments, so `current` is the document ID for the singleton routes and error artifacts. Subcollection writes prevent one participant from overwriting another's places, ranking, or vote. Server timestamps are used in Firestore mode.

Room subscriptions compose realtime snapshots for the room and its subcollections, emit only after the initial set is complete, and return one cleanup function that disposes every listener. Local storage is used only when `VITE_SYNC_MODE=mock`.

The browser receives one opaque random member ID stored locally and reuses it across rooms. Names are display-only. The creator also receives a per-room host token. The host claims a Firestore transaction lock and random run nonce before calling `/api/optimize`; a two-minute stale threshold permits recovery after an abandoned request. Results or structured errors are committed only if that nonce still owns the lock, then the room advances to voting.

The host token protects against accidental duplicate actions, not malicious users. It is readable client data, and the accountless Firestore rules cannot securely enforce host-only authority. Anyone with a room code falls within the MVP trust boundary.

## Backend Contract

`src/lib/api.js` is the camelCase-to-snake_case boundary:

- `GET /api/search?keyword=`
- `GET /api/place/details?name=`
- `POST /api/optimize`

Backend mode requires `VITE_API_BASE`. Mock mode uses `mockPlaces.js` and `mockOptimize.js`. Place-hours failures leave editable category defaults in place and show a concise warning. Network and synchronization actions expose loading, disabled, and failure states without provider payloads or stack traces.

## Screens

| Status | Screen | Step |
|---|---|---:|
| — | `Landing`, `TripSetup` | 1–2 |
| `setup` | `RoomLobby` / `JoinRoom` | 3–4 |
| `collecting` | `PlacePicker` | 5 |
| `analyzing` | `Analyzing` | 6 |
| `voting` | `Result` or conflict correction | 7–9 |
| `confirmed` | persisted winning `Result` | 10 |

## Verification

```bash
npm install
npm run check
npm run test:integration
npm run build
npm run lint
```

`test:integration` exercises both the local adapter and the production Firestore adapter through a deterministic mock of Firebase's modular SDK. It covers room creation/join, stable member registration, places, preferences, state changes, result/error persistence, vote replacement, confirmation, disposal of all seven listeners, duplicate optimization prevention, and the optimize request contract. It does not access a real Firebase project.

The remaining frontend non-goals are maps, route polylines, image export, authentication, and a full offline-first experience.
