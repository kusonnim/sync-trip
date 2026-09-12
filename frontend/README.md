# SyncTrip Frontend

The React/Vite frontend implements the ten-step planning flow. Production collaborative state lives in Supabase PostgreSQL and updates through Supabase Realtime; components continue to depend only on `src/lib/roomStore.js`.

## Configuration

Production:

```dotenv
VITE_SYNC_MODE=supabase
VITE_API_MODE=backend
VITE_API_BASE=https://api.example.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Local/demo:

```dotenv
VITE_SYNC_MODE=mock
VITE_API_MODE=mock
```

Production never silently falls back to mock mode. The publishable key is intended for browser clients and is constrained by database grants, RLS, and RPC validation. Never expose a service-role key or any Kakao, Google, or ODsay credential through Vite.

## Room Store

- `roomStore.js` is the stable screen-facing facade.
- `supabaseRoomStore.js` implements PostgreSQL RPCs and Realtime.
- `mockRoomStore.js` is the explicit local/demo implementation.
- `roomIdentity.js` owns the opaque browser member ID and per-room host token.
- `supabase.js` initializes one official `@supabase/supabase-js` client.

The SQL migration defines:

```text
rooms
room_members
room_places
room_preferences
room_routes
room_errors
room_final_votes
```

Each child table references `rooms(id)` with cascading deletion. Composite primary keys enforce one member, place, preference, or vote per room identity. Routes and errors store the nested optimizer payload as JSONB and record the optimization nonce.

## Realtime and Snapshots

One channel registers seven room-filtered Postgres Changes bindings. A change schedules a coalesced `get_room_snapshot` RPC, which reconstructs the entire camelCase UI model in one database statement. This avoids polling, duplicate channels, and mixed-version settings/place/preference reads. Disposing the store subscription clears pending refreshes and removes the channel.

The migration adds all seven tables to `supabase_realtime` and uses `replica identity full` so deletion events retain identifying fields. Normal Supabase reconnect behavior is used; the app does not implement a competing offline synchronization layer.

## Mutations and Optimization

Browser roles cannot directly insert, update, or delete collaborative rows. Narrow RPCs handle room creation, member upsert, places, ranking replacement, vote upsert, and host state transitions.

`acquire_optimization_lock` uses database time and an atomic conditional update. It rejects simultaneous owners and permits recovery after two minutes. `complete_optimization` and `fail_optimization` require the same host proof, owner, and UUID nonce. A stale request therefore cannot overwrite a recovered run.

Room codes retain the four-character alphabet and have a database `UNIQUE` constraint. The client retries a PostgreSQL `23505` collision with a new code.

## Security Boundary

This MVP intentionally does not use Supabase Auth. The host token is hashed in a private, non-published table and meaningfully protects host RPCs from accidental or code-only access. Member IDs remain client-generated and forgeable, and read policies needed for accountless Realtime do not make room data private from someone using the publishable key directly. Add authentication before handling sensitive data or untrusted participants.

The publishable key also permits anonymous room creation and member RPC calls, so a public deployment needs project-level rate limits or equivalent abuse controls even when the stored trip data is non-sensitive.

## Backend Contract

Backend mode requires `VITE_API_BASE` and uses:

- `GET /api/search?keyword=`
- `GET /api/place/details?name=`
- `POST /api/optimize`

`api.js` remains the single camelCase-to-snake_case contract boundary. Mock mode uses `mockPlaces.js` and `mockOptimize.js`.

## Verification

```bash
npm install
npm run check
npm run test:integration
npm run build
npm run lint
```

The integration script runs without a production project. It exercises the Supabase adapter through deterministic RPC and Realtime mocks, including room-code collision retry, member and vote upserts, coherent refresh, cleanup, simultaneous lock rejection, stale recovery, and stale-result rejection. It also audits the migration for tables, RLS, nonce checks, fixed function search paths, and Realtime publication.
