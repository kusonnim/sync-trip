# SyncTrip

A social, group-voting travel route optimizer with time-window constraints.

Each traveler ranks the places they want to visit. SyncTrip combines those preferences, narrows the candidates, and creates two day-by-day itineraries—a fastest route and a lowest-cost route—that respect business hours and reservation times. The group then votes on the final plan.

## Current Status

The frontend supports the complete ten-step flow. The Phase 1 FastAPI backend provides place search and business-hours lookup; route optimization remains on the temporary frontend engine until Phase 2 is complete.

| Area | Status |
|---|---|
| Ten-step frontend flow | Complete |
| Optimization engine | Temporary frontend implementation; all 14 constraint checks pass |
| Real-time room-state synchronization | Uses localStorage and synchronizes tabs in the same browser |
| Firestore | Not connected |
| FastAPI backend | Phase 1 complete: health, Kakao place search, and Google business-hours lookup |
| Live Kakao and Google place APIs | Available when backend keys are configured; automated tests use mocks |
| ODsay and Kakao Mobility | Not connected; routing uses frontend distance-based estimates |
| Map and result-image export | Not implemented |

## Run Locally

```bash
cd frontend
npm install
npm run dev     # Development server
npm run check   # Run 14 optimization constraint checks
npm run build   # Production build
```

Backend:

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
pytest
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
- Backend: Python FastAPI
- External APIs: Kakao Local for place search, Kakao Mobility for driving, ODsay for public transit, and Google Places for business hours

## Structure

```text
frontend/           React application (implemented)
  src/screens/      One file per screen
  src/components/   Timeline, route card, and conflict notice
  src/lib/          Optimizer, room store, and API client
  scripts/          Constraint-check scripts
backend/            FastAPI server with place APIs (Phase 1)
docs/               PRD and original reference material
```

## Backend Integration Order

The frontend already sends and receives data according to the contract in PROJECT.md section 4. Two integration points remain:

1. Set `VITE_API_BASE` in `frontend/.env` after Phase 2 is implemented to disable the temporary optimizer and call all backend APIs.
2. Replace the function bodies in `frontend/src/lib/roomStore.js` with Firestore calls. The screen components do not need to change.

## Key Management

Keep every external API key in backend environment variables. Only Firebase web configuration belongs in the frontend.
Never put an external API key in a Vite variable with the `VITE_` prefix because Vite embeds those values in the production bundle.
