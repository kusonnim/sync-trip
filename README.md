# SyncTrip

SyncTrip is a multi-user travel planner that combines ranked group preferences with business hours and reservation constraints. It produces a fastest itinerary and a lowest-cost itinerary, then lets the group vote on the final route.

## MVP Architecture

```text
React / Vite frontend
  ├─ Firebase Firestore: shared room state and realtime listeners
  └─ FastAPI backend
       ├─ Kakao Local and Google Places
       ├─ Track 1 bounded exhaustive optimization
       └─ Kakao Mobility or ODsay Track 2 refinement
```

The production frontend uses Firestore across browsers and devices. Rooms move deterministically through `setup → collecting → analyzing → voting → confirmed`. Members, places, rankings, route results, optimization errors, and one vote per member are persisted separately to avoid whole-room overwrites.

## Run Locally

For an entirely local demo, create `frontend/.env` with:

```dotenv
VITE_SYNC_MODE=mock
VITE_API_MODE=mock
```

Then run:

```bash
cd frontend
npm install
npm run dev
npm run check
npm run test:integration
npm run build
```

For the backend:

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
pytest
```

Copy the example environment files for real integration. Production should set `VITE_SYNC_MODE=firestore`, `VITE_API_MODE=backend`, `VITE_API_BASE`, and every `VITE_FIREBASE_*` value. Provider credentials remain backend-only.

## Deployment

- Frontend: deploy `frontend/` to Vercel. Its `vercel.json` preserves client-side routes on direct refresh.
- Backend: build [backend/Dockerfile](backend/Dockerfile), expose `$PORT`, and use `/health`. [render.yaml](render.yaml) is an optional Render blueprint; the container is provider-neutral.
- Firestore: deploy [firestore.rules](firestore.rules) for the selected Firebase project.
- CORS: set `CORS_ORIGINS=https://<frontend-domain>,http://localhost:5173` on the backend. Wildcards are rejected.

## Accountless Security Boundary

The MVP intentionally has no sign-in. A stable random browser-local member ID prevents names, email addresses, IP addresses, or fingerprinting from becoming identity. A random host token prevents accidental host actions in the UI and coordinates the optimizer, but it is client-side data and is not authentication.

Firestore rules restrict paths, document shapes, types, sizes, immutable room ownership fields, and destructive operations. They cannot securely establish host or member authority without Firebase Authentication or a trusted write backend. Anyone who knows a room code may be able to read or mutate room data. Do not use this accountless design for sensitive trips; add authentication before production use with untrusted participants.

## Documentation

- [PROJECT.md](PROJECT.md): canonical API and optimizer contract
- [docs/PRD.md](docs/PRD.md): product flow, data model, and MVP behavior
- [frontend/README.md](frontend/README.md): Firestore schema, runtime modes, and frontend verification
- [backend/README.md](backend/README.md): API, provider behavior, configuration, and deployment

## Remaining MVP Limitations

There are no accounts, maps, route polylines, result-image export, or full offline-first workflow. Route caching is process-local, day assignment is geographic, reservations cannot be pinned to a date, and `stay_time_max` does not allocate optional slack. Live Firebase, provider, and deployment behavior requires project credentials and must be verified separately from automated tests.
