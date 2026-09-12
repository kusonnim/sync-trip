# SyncTrip Frontend

Built with React and Vite. The complete flow runs without a backend.

```bash
npm install
npm run dev     # Development server
npm run check   # Run 14 constraint checks
npm run build   # Production build
```

## Screens

`src/screens/Room.jsx` subscribes to the room's `status` and renders the matching screen.
When the host advances a step, every member's screen advances with it.

| Status | Screen | User-flow Step |
|---|---|---|
| — | `Landing` | 1 |
| — | `TripSetup` | 2 |
| `setup` | `RoomLobby` (`JoinRoom` for first-time members) | 3, 4 |
| `collecting` | `PlacePicker` | 5 |
| `analyzing` | `Analyzing` | 6 |
| `voting` | `Result` (or a conflict notice on failure) | 7, 8, 9 |
| `confirmed` | Confirmed `Result` screen | 10 |

## Backend Integration Points

Both integrations currently use temporary implementations so the frontend can run independently. Replace only these areas when the backend is ready.

**1. Room state store — `src/lib/roomStore.js`**

The current implementation stores room state in localStorage and synchronizes tabs in the same browser.
To migrate to Firestore, replace the function bodies in this file; screen components can remain unchanged.

| Current | Firestore |
|---|---|
| `readRoom` | `getDoc(doc(db, 'rooms', code))` |
| `subscribe` | `onSnapshot(doc(db, 'rooms', code))` |
| `patchRoom` | `updateDoc(...)` |

**2. Backend calls — `src/lib/api.js`**

Setting `VITE_API_BASE` in `.env` automatically disables `USE_MOCK` and calls the real backend.

| Function | Backend Endpoint | Temporary Implementation |
|---|---|---|
| `searchPlaces` | `GET /api/search?keyword=` | 16 Seoul locations in `mockPlaces.js` |
| `fetchPlaceHours` | `GET /api/place/details?name=` | Returns null, leaving category defaults in place |
| `optimize` | `POST /api/optimize` | `mockOptimize.js` |

`fetchPlaceHours` runs when a place is added. The app adds the place with category defaults first and overwrites them when live business hours arrive, so itinerary creation continues even if the lookup fails.

## Temporary Optimization Engine

`src/lib/mockOptimize.js` follows the Track 1 rules in PROJECT.md section 5. It evaluates every permutation, rejects constraint violations, and selects a fastest route and a lowest-cost route with two different weight sets. It uses straight-line distance estimates instead of a live routing API.

Its request and response shapes exactly match the contract in PROJECT.md section 4.3, so connecting the backend does not require screen changes. `buildOptimizeBody` in `api.js` is the only place that converts camelCase UI state to the snake_case contract.

It enforces three constraints:

- Reject routes that arrive after a reservation time.
- Reject routes that cannot fit the minimum stay before closing.
- Reject routes that reach the final destination after the daily deadline.

When no solution exists, `findConflicts` returns `TIME_CONFLICT` and identifies the two conflicting reservations. Because it checks only reserved-place pairs, it is much cheaper than permutation search.

## Not Yet Implemented

- Map display; the timeline is text-only.
- Result-image export; sharing currently uses links.
- Firestore; rooms cannot yet synchronize across devices.
- Live routing; travel time and fares use straight-line distance estimates.
- Best-time bonuses; only hard constraints such as reservations and business hours are enforced.

## Key Management

Do not add Kakao, ODsay, or Google keys to this application. Keep them in backend environment variables.
Values beginning with `VITE_` are embedded in the production bundle.

## Test the Full Flow Alone

Room codes are stored in this browser's localStorage.
Open two tabs in the same browser, join one as the host and one as a member, and you can test real-time synchronization.
Run `localStorage.clear()` in the console to reset local data.
