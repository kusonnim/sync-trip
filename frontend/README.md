# SyncTrip Frontend

The React/Vite frontend implements the complete planning flow. Production collaborative state lives in Supabase PostgreSQL and updates through Supabase Realtime; screens depend only on `src/lib/roomStore.js`.

## Configuration

Production:

```dotenv
VITE_SYNC_MODE=supabase
VITE_API_MODE=backend
VITE_API_BASE=https://api.example.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Local demo:

```dotenv
VITE_SYNC_MODE=mock
VITE_API_MODE=mock
```

Production never silently falls back to mock mode. Never expose a service-role key or Kakao, Google, or ODsay credential through Vite.

## Screens and Product Flow

`src/screens/Room.jsx` subscribes to room state and renders the corresponding screen:

| Status | Screen | Behavior |
|---|---|---|
| — | `Landing` | Create a trip or enter a four-character room code |
| — | `TripSetup` | Resolve start/end coordinates and create a room |
| `setup` | `RoomLobby` / `JoinRoom` | Invite and join participants |
| `collecting` | `PlacePicker` | Add unlimited suggestions and rank a top three |
| `analyzing` | `Analyzing` | Host-only, lock-protected optimization |
| `voting` | `Result` | Compare fastest/lowest-cost routes and cast one vote |
| `confirmed` | `Result` | Show and share the confirmed itinerary |

The latest UI separates adding places from ranking, supports required places, editable business hours, minimum stays, and scheduled visit windows, and shows route warnings, wait time, day timelines, and responsive voting/confirmation states.

## Room Store

- `roomStore.js` is the stable screen-facing facade.
- `supabaseRoomStore.js` implements PostgreSQL RPCs and Realtime.
- `mockRoomStore.js` is the explicit local/demo implementation.
- `roomIdentity.js` keeps each room's opaque member ID in session storage so fresh tabs can represent different participants, while per-room host tokens remain stable in local storage.
- `supabase.js` initializes one official `@supabase/supabase-js` client.

The versioned migrations define `rooms`, `room_members`, `room_places`, `room_preferences`, `room_routes`, `room_errors`, and `room_final_votes`. Child tables reference `rooms(id)` with cascading deletion. Composite primary keys enforce one member, place, preference, or vote per room identity. Route payloads, errors, and visit windows retain their existing JSON shapes in JSONB.

## Realtime and Snapshots

One channel registers seven room-filtered Postgres Changes bindings. A change schedules a coalesced `get_room_snapshot` RPC, which reconstructs the camelCase UI model in one database statement. Disposing the subscription clears pending refreshes and removes the channel.

The migrations add all seven collaborative tables to `supabase_realtime` and use `replica identity full`. Normal Supabase reconnect behavior is used; writes made while offline surface errors instead of entering a separate browser queue.

## Mutations and Optimization

Browser roles cannot directly insert, update, or delete collaborative rows. Narrow RPCs handle room creation, member upsert, places, ranking replacement, vote replacement, and host state transitions.

`acquire_optimization_lock` uses database time and an atomic conditional update. It rejects simultaneous owners and permits recovery after two minutes. Completion and failure require the same host proof, owner, and UUID nonce, so stale runs cannot overwrite recovered runs.

Room codes have a database `UNIQUE` constraint. The client retries PostgreSQL error `23505` with a new code.

## Backend Contract

Backend mode requires `VITE_API_BASE` and uses:

- `GET /api/search?keyword=`
- `GET /api/place/details?name=`
- `POST /api/optimize`

`api.js` is the camelCase-to-snake_case boundary. Scheduled UI visits become the backend `hard_constraint` window. Mock mode uses `mockPlaces.js` and `mockOptimize.js`; it is never an implicit production fallback.

## Debug Mode

In explicit mock sync mode, append `?debug=1` to reveal local demo tools. The seeded five-member room demonstrates overlapping top-three rankings and candidate narrowing. `?debug=0` disables the tools. Seed data is deliberately unavailable in Supabase mode because production writes must use validated RPCs.

## Security Boundary

This MVP does not use Supabase Auth. The host token is hashed in a private, non-published table. Member IDs remain client-generated and forgeable, and the read policies required for accountless Realtime do not make room data private from someone using the publishable key directly.

Anonymous room/member RPCs can be automated. A public deployment needs project-level rate limits or equivalent abuse controls, and authentication is required for durable per-user authorization or sensitive trip data.

## Verification

```bash
npm install
npm run test:integration
npm run check
npm run build
npm run lint
```

The integration script exercises the Supabase adapter with deterministic RPC and Realtime mocks, including code-collision retry, member/ranking/vote replacement, visit-window persistence, coherent refresh, subscription cleanup, simultaneous lock rejection, stale recovery, and stale-result rejection. It also statically audits migrations for tables, RLS, grants, nonce checks, fixed function search paths, and Realtime publication.

## Remaining Limitations

Maps, route polylines, result-image export, full offline-first writes, and authenticated ownership are not implemented. Live Supabase, provider, and deployment behavior requires credentials and separate verification.
