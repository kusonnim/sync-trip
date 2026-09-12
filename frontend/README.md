# SyncTrip Frontend

Built with React and Vite. The complete flow runs without a backend.

```bash
npm install
npm run dev     # Development server
npm run check   # Run 15 constraint checks
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

It enforces four constraints:

- Reject routes that fall outside a scheduled visit window.
- Reject routes that cannot fit the minimum stay before closing.
- Reject routes that start a restaurant outside lunch (11:30-13:30) or dinner (17:30-19:30).
- Reject routes that reach the final destination after the daily deadline.

Waiting time counts toward the objective alongside travel time, so an order that burns hours waiting for a reservation cannot win on travel time alone.

When no solution exists, `findConflicts` returns `TIME_CONFLICT` and identifies the two conflicting visits. Because it checks only pairs with a scheduled visit, it is much cheaper than permutation search.

## Not Yet Implemented

- Map display; the timeline is text-only.
- Result-image export; sharing currently uses links.
- Firestore; rooms cannot yet synchronize across devices.
- Live routing; travel time and fares use straight-line distance estimates.
- Best-time bonuses; only hard constraints such as reservations and business hours are enforced.

## Key Management

Do not add Kakao, ODsay, or Google keys to this application. Keep them in backend environment variables.
Values beginning with `VITE_` are embedded in the production bundle.

## Debug Mode

The demo tools stay hidden on the normal landing page. Append `?debug=1` to the URL to reveal a card
with them. The setting is remembered in the browser, so later visits need no query string.

| URL | Effect |
|---|---|
| `/?debug=1` | Turn on (remembered) |
| `/?debug=0` | Turn off |

The card holds three tools.

- **Create a Five-Member Demo Room** builds a room where five members have already submitted a top 3.
  You enter as the host, so only the build step remains.
- **Clear Every Room in This Browser** empties stored rooms.
- **Turn Off Debug Mode**

The demo room is defined in `src/lib/seed.js`. The five rankings overlap on purpose, which spreads the
Borda scores apart and makes the narrowing from seven places to four visible.

## Test the Full Flow Alone

Room data lives in this browser's localStorage, while identity lives in sessionStorage so each tab is
a different person. Open a second tab with Ctrl+T and paste the invite link to join as another member.
Duplicating a tab copies sessionStorage and keeps the same identity, so always open a fresh tab.

A host can also advance alone; the minimum-member gate was removed for testing.
