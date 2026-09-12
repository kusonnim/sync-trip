# SyncTrip

A social, group-voting travel route optimizer with time-window constraints.

Each traveler ranks the places they want to visit. SyncTrip combines those preferences, narrows the candidates, and creates two day-by-day itineraries—a fastest route and a lowest-cost route—that respect business hours and reservation times. The group then votes on the final plan.

## Current Status

The frontend supports the full ten-step flow without a backend. The backend has not been implemented yet.

| Area | Status |
|---|---|
| Ten-step frontend flow | Complete |
| Optimization engine | Temporary frontend implementation; all 14 constraint checks pass |
| Real-time room-state synchronization | Uses localStorage and synchronizes tabs in the same browser |
| Firestore | Not connected |
| FastAPI backend | Not implemented |
| Live Kakao, ODsay, and Google APIs | Not connected; uses mock data and distance-based estimates |
| Map and result-image export | Not implemented |

## Run Locally

```bash
cd frontend
npm install
npm run dev     # Development server
npm run check   # Run 14 optimization constraint checks
npm run build   # Production build
```

## Documentation

| File | Description |
|---|---|
| [PROJECT.md](PROJECT.md) | Canonical team contract for the API and optimization algorithm |
| [docs/PRD.md](docs/PRD.md) | Product requirements, flow, data model, implementation order, and validation |
| [frontend/README.md](frontend/README.md) | Frontend architecture and backend integration points |
| [docs/reference/planning-document.txt](docs/reference/planning-document.txt) | Original planning document |
| [docs/reference/input-output-notes.jpg](docs/reference/input-output-notes.jpg) | Handwritten input/output notes |
| [docs/reference/user-flow.png](docs/reference/user-flow.png) | Ten-step user flow |

## Stack

- Frontend: React + Vite, deployed with Vercel
- Real-time synchronization: Firebase Firestore (planned)
- Backend: Python FastAPI (planned)
- External APIs: Kakao Local for place search, Kakao Mobility for driving, ODsay for public transit, and Google Places for business hours

## Structure

```text
frontend/           React application (implemented)
  src/screens/      One file per screen
  src/components/   Timeline, route card, and conflict notice
  src/lib/          Optimizer, room store, and API client
  scripts/          Constraint-check scripts
backend/            FastAPI server and optimizer (not implemented)
docs/               PRD and original reference material
```

## Backend Integration Order

The frontend already sends and receives data according to the contract in PROJECT.md section 4. Only two integration points need to change when the backend is ready:

1. Set `VITE_API_BASE` in `frontend/.env` to disable the temporary engine and call the backend.
2. Replace the function bodies in `frontend/src/lib/roomStore.js` with Firestore calls. The screen components do not need to change.

## Key Management

Keep every external API key in backend environment variables. Only Firebase web configuration belongs in the frontend.
Never put an external API key in a Vite variable with the `VITE_` prefix because Vite embeds those values in the production bundle.
