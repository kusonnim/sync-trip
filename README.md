# SyncTrip

SyncTrip is a multi-user travel planner that combines ranked group preferences with business hours and reservation constraints. It produces fastest and lowest-cost itineraries, then lets the group vote on the final route.

## Architecture

```text
Browser (React + Vite)
  ├─ Supabase
  │    ├─ PostgreSQL: collaborative room state
  │    ├─ Realtime: room-scoped change notifications
  │    └─ RLS + narrow RPCs: read policy and write invariants
  └─ FastAPI
       ├─ Kakao Local and Google Places
       ├─ Track 1 bounded exhaustive optimization
       └─ Kakao Mobility or ODsay Track 2 refinement
```

Rooms progress through `setup → collecting → analyzing → voting → confirmed`. Relational tables persist members, places, rankings, routes, errors, and one vote per member. The host acquires an atomic PostgreSQL optimization lock, calls FastAPI with one coherent room snapshot, and completes the run through a nonce-protected RPC.

The Korean mobile UI separates unlimited place suggestions from each member's top-three ranking. Anyone in the room can edit business hours, required stops, stay duration, and scheduled visit windows, or remove a place, before the group compares and votes on the generated routes. Only the host starts the optimization and moves the room between steps.

A trip may be taken alone or by up to twelve people. Setup takes the departure point, the arrival point, and where the group sleeps, each chosen by search so the coordinates are real. One accommodation covers every night, and more can be added, one per night. The first day leaves the departure point, the last day ends at the arrival point, and every day in between starts and ends at that night's accommodation.

## Supabase Setup

1. Create a Supabase project and copy its project URL and publishable key from the Connect dialog.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), authenticate, and apply the versioned migration:

   ```bash
   supabase link
   supabase db push
   ```

3. Copy `frontend/.env.example` to `frontend/.env` and set:

   ```dotenv
   VITE_SYNC_MODE=supabase
   VITE_API_MODE=backend
   VITE_API_BASE=https://api.example.com
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

Never put a secret or service-role key in a `VITE_` variable. The migration enables RLS and Realtime publication for every collaborative table.

## Run Locally

For a local demo without external persistence, use explicit mock modes:

```dotenv
VITE_SYNC_MODE=mock
VITE_API_MODE=mock
```

Frontend:

```bash
cd frontend
npm install
npm run dev
npm run check
npm run test:integration
npm run build
npm run lint
```

Backend:

```bash
cd backend
python -m pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
pytest
```

Provider keys and CORS configuration belong only in `backend/.env`. The backend can start and serve `/health` without provider credentials.

## Deployment

- Vercel: deploy `frontend/`; `vercel.json` handles direct SPA refreshes.
- Supabase: link the production project and run `supabase db push` before the frontend rollout.
- Render: use `render.yaml` or build `backend/Dockerfile`. Configure `CORS_ORIGINS=https://<frontend-domain>,http://localhost:5173`.

No project IDs, deployment credentials, or secrets are committed.

## Accountless Security Boundary

The MVP intentionally has no accounts or Supabase Auth. A random browser-local member ID is stable but forgeable, and display names are metadata only. The host token is kept in browser storage; PostgreSQL stores only its SHA-256 digest and requires it for host state changes and optimization writes.

RLS is enabled on all client-visible tables. Browser roles receive read-only table access for Realtime, while all mutations use narrowly scoped, schema-qualified RPCs with constraints and fixed `search_path`. This protects database invariants and keeps the host proof out of Realtime payloads, but it cannot prove which human owns a member ID. Accountless Realtime also means table rows readable to the publishable-key role are not private merely because the UI asks for a room code. Use Supabase Auth or a trusted persistence backend before storing sensitive trip information.

Anonymous room creation and member RPCs can also be automated by anyone holding the publishable key. Apply project-level rate limits or abuse controls for a public deployment; authentication is required for durable per-user authorization.

## Documentation

- [PROJECT.md](PROJECT.md): canonical API, relational state, and optimizer contract
- [docs/PRD.md](docs/PRD.md): product flow and final MVP behavior
- [frontend/README.md](frontend/README.md): runtime modes, room store, Realtime, and testing
- [backend/README.md](backend/README.md): API, providers, configuration, and deployment

## Remaining MVP Limitations

There are no user accounts, maps, route polylines, image export, or full offline-first workflow. Realtime reconnects normally, but writes made while the database is unavailable surface as errors rather than forming an offline queue. Route caching is process-local, day assignment is geographic, reservations cannot be pinned to a date, and `stay_time_max` does not allocate optional slack. Driving cost counts only tolls, so without a routing provider a driving itinerary has no cost to compare and the two route options differ by time alone. Live Supabase, provider, and deployment behavior requires credentials and separate verification.
