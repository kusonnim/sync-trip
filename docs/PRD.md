# SyncTrip PRD — Social-Voting Travel Route Optimization with Time Constraints

## Context

This product definition combines three source materials: the original planning document, handwritten notes, and the user-flow diagram. [PROJECT.md](../PROJECT.md) is the canonical source for API contracts and algorithm behavior; if this document differs, follow PROJECT.md.

The frontend supports the complete ten-step flow. The Phase 3 backend provides Kakao place search, Google business-hours lookup, Track 1 local optimization, and Track 2 live routing refinement. The frontend mock remains an offline development fallback.

**Problem:** Place links pile up in group chats without producing a finalized plan. Existing travel apps usually sort by distance and cannot account for constraints such as a 6:00 PM restaurant reservation or a museum closing at 5:00 PM.

**Product:** A mobile web application where members rank preferred places, the group preference score narrows the candidates, and the system creates a fastest route and a lowest-cost route that respect business hours and reservations. Members vote to confirm the final itinerary.

The following decisions resolve inconsistencies among the source materials:

| Topic | Decision |
|---|---|
| Preference collection | Each member submits a 1-to-n ranking; the app combines preference scores |
| Results | Show fastest and lowest-cost routes, then hold a member vote |
| Objectives | Optimize both time and cost |
| Trip length | Any number of days |
| Routing | ODsay for public transit and Kakao Mobility for driving |
| Place data | Kakao Local search plus Google Places business hours and manual overrides |
| Stack | React on Vercel, Firestore, and Python FastAPI |
| Development window | Nine hours |

---

## 1. User Flow and Screens

The ten user-flow steps are grouped into six screens. Numbers in parentheses refer to the diagram.

1. **Landing** (1) — Service introduction, Create a Trip action, and room-code entry.
2. **Trip details** (2) — Host only. Date range, daily start and end times, headcount, start and final destinations, transportation mode, and required places.
3. **Room creation and lobby** (3, 4) — Four-character room code and invitation link. Members join with nicknames, and the list updates in real time.
4. **Place preferences** (5) — Search for places and submit a ranked list. The submitted-member counter updates in real time.
5. **Optimization** (6) — Display progress for preference scoring, candidate selection, day assignment, and route optimization.
6. **Compare and confirm** (7, 8, 9, 10) — Show a fastest-route card and a lowest-cost-route card. Expanding a card reveals the daily timelines. Each member casts one vote; the host confirms the winner and receives a shareable link. Maps are not implemented.

Room state uses five values: `setup → collecting → analyzing → voting → confirmed`. Subscribing to Firestore's `status` field will synchronize screen transitions for every member.

### Picks per Person

The handwritten note says that input should increase with trip length and decrease with group size. Implement that rule as:

```text
Places available per day = 4
Total slots S = 4 × trip days
Picks per person k = clamp(ceil(S × 1.5 / headcount), 3, 10)
```

Required places are always included. Fill the remaining `S - requiredCount` slots with the highest preference scores. Use Borda scoring with `weight for rank r = k - r + 1`.

---

## 2. Data Model

The following is the target Firestore structure. `frontend/src/lib/roomStore.js` currently stores each room as one localStorage object, with arrays and objects standing in for subcollections. Migrating to Firestore should require changes only to that file's function bodies, not the screen components.

```text
rooms/{roomCode}                      // Four uppercase letters or digits
  status, title, hostToken
  startDate, endDate, dailyStart, dailyEnd
  headcount, transportMode            // 'car' | 'transit'
  origin {name, lat, lng}
  destination {name, lat, lng}
  createdAt

rooms/{roomCode}/members/{memberId}
  nickname, joinedAt, submitted

rooms/{roomCode}/places/{placeId}
  name, lat, lng, category, kakaoId, address
  isFixed                             // Whether this is a required place
  addedBy
  openTime, closeTime                 // 'HH:mm', Google Places or category defaults
  hoursSource                         // 'google' | 'default' | 'manual'
  fixedTime                           // Reservation time; hard constraint
  bestTime                            // Soft constraint
  minStay, maxStay                    // Minutes

rooms/{roomCode}/preferences/{memberId}
  ranking: [placeId, ...]             // Ordered from first choice

rooms/{roomCode}/routes                // Store the /api/optimize routes array as-is
  [{ type, label, total_time, total_cost, days: [{ date, timeline: [...] }] }]

rooms/{roomCode}/error                 // Present only when optimization fails
  { code, message, placeIds }

rooms/{roomCode}/finalVotes/{memberId}
  routeId
```

A `timeline` entry has the same shape as PROJECT.md section 4.3:

```json
{ "type": "transit", "mode": "transit", "instruction": "Line 2, Konkuk University → Seongsu",
  "time": "13:56 ~ 14:20", "duration": 24, "cost": 1500 }
{ "type": "place", "place_id": "p3", "name": "Seongsu Cafe", "category": "cafe",
  "time": "14:20 ~ 15:20", "stay_duration": 60, "wait_duration": 0 }
```

For security, keep Kakao, ODsay, and Google keys only on the FastAPI server. The frontend contains only Firebase web configuration. Never expose external API keys through Vite's `VITE_` prefix.

---

## 3. Backend API (FastAPI)

| Endpoint | Responsibility |
|---|---|
| `GET /api/search?keyword=` | Proxy Kakao Local keyword search and return names, coordinates, and categories |
| `GET /api/place/details?name=` | Fetch and cache Google Places business hours |
| `POST /api/optimize` | Accept settings and candidate places and return two route options |

PROJECT.md section 4.3 defines the exact request and response fields. Return both `min_time` and `min_cost`. If no solution exists, return `status: "error"`, `code: "TIME_CONFLICT"`, and the two conflicting places.

---

## 4. Optimization Algorithm

### 4.1 Day Assignment

Choose the most geographically separated places as seeds, one per trip day. Assign every remaining place to its nearest available seed with balanced bucket capacity, then optimize each day independently. Four places per day is the normal product target, while exhaustive search supports at most six. Inputs that cannot respect that limit are rejected explicitly, and candidates are never truncated or discarded. Assume the same start and end locations every day; lodging logic is out of scope.

Places with reservations cannot yet be pinned to a specific day. Assignment currently uses coordinates only.

### 4.2 Track 1 — Estimated Order Selection

A day contains at most six places, so exhaustively search up to 720 permutations. Estimate travel without calling external APIs:

```text
straight-line distance = haversine(i, j)
road distance          = straight-line distance × 1.3
driving                 = road distance / 40 km/h
public transit          = road distance / 22 km/h + 8-minute wait
```

Simulate each permutation from the configured start time. Field names match the PROJECT.md section 4.3 request body.

```text
arrive = previous_departure + travel(i, j)
start  = max(arrive, open_time, hard_constraint.start)
    Hard: reject if start falls outside hard_constraint
    Hard: require start + stay_time_min <= close_time
    Hard: restaurants must start during lunch (11:30–13:30)
          or dinner (17:30–19:30)
depart = start + stay_time_min // Phase 2 does not allocate optional extra stay time
final: require arrival at end_location <= end_deadline
```

Meal windows are validated by **start time**, not overlap, so a visit cannot qualify by touching only the end of the window.

Rank surviving permutations directly. `min_time` uses travel duration, then cost, then stable place order. `min_cost` uses estimated cost, then travel duration, then stable place order. No unexplained weighted scalar combines minutes and KRW.

Borda scores select the candidate set before `/api/optimize`. The sum of `preference_score` is constant across permutations of that set, so Phase 2 correctly excludes it from route-order ranking while preserving the field in the API contract.

If both objectives choose the same permutation, use the next-ranked valid `min_cost` permutation when one exists. If exactly one complete route is feasible, returning the same order for both entries is preferable to inventing or rejecting a route.

### 4.3 Track 2 — Precise Routing

Retain at most three Track 1 candidates per objective and day, then call live routing APIs only for legs in their deduplicated union. A five-place day has six legs. Cache successful shared legs for 30 minutes by directed origin coordinates, destination coordinates, and transportation mode. Neither provider accepts a departure time in the selected API, so it is not part of this cache key. Provider failures are never cached.

- Public transit: ODsay `searchPubTransPathT` for time, transfers, line names, and fares
- Driving: Kakao Mobility `directions` for distance, time, and tolls; cost is operating cost (`distance × ₩140/km`) plus tolls

Rebuild each precise timeline from scratch so changed arrival times also change waiting and feasibility. Revalidate business hours, reservations, meal windows, minimum stays, and the daily deadline. Rerank all refined survivors using precise time and cost. A provider no-route response advances to the next bounded candidate; if none survive, return `PRECISE_ROUTE_INFEASIBLE`.

ODsay's `payment` is the transit fare. When omitted, the Track 1 fare estimate is used with an `ESTIMATED_TRANSIT_FARE` warning. Temporary provider failures return Track 1 routes with `routing_source: "estimated"` and a visible `ROUTING_FALLBACK` warning. Missing keys and authentication failures are not silently hidden.

### 4.4 Conflict Diagnosis

Do not return a generic no-route message when no permutations survive. First examine every pair of places with fixed reservations:

```text
for each reservation pair in an allocated day:
    earlier, later = chronological_order(pair)
    if earlier.start + earlier.stay_time_min + travel(earlier, later) > later.end:
        return TIME_CONFLICT with both IDs in place_ids
```

Example: “The reservation at the Seongsu restaurant conflicts with the reservation at N Seoul Tower.” Closing-time, meal-window, and deadline failures without a specific reservation pair return structured `NO_ROUTE` errors.

This pairwise check is O(m²), much cheaper than permutation search, so run it **before** the search to catch obvious conflicts early.

---

## 5. External APIs and Cost

| API | Purpose | Cost |
|---|---|---|
| Kakao Local | Place search, coordinates, and category | Free |
| Kakao Mobility Directions | Driving routes, distance, and tolls | Within free allowance |
| ODsay | Public-transit routes, transfers, and fares | 1,000 free requests per day |
| Google Places | Business hours | **Billing account required; charges may apply above the allowance** |
| Firebase | Real-time synchronization | Free Spark plan |

Google Places is the only planned API that may incur direct charges. During development, use saved response fixtures. Before making live calls, state the expected request count and cost and obtain approval. Without approval, use category defaults and manual entry and report that fallback.

Category defaults when Google data is unavailable:

| Category | Business Hours | Default Stay |
|---|---|---:|
| Restaurant | 11:00–21:00 | 60 minutes |
| Cafe | 10:00–22:00 | 50 minutes |
| Attraction | 09:00–18:00 | 90 minutes |
| Museum | 10:00–18:00 | 80 minutes |
| Shopping | 10:30–21:00 | 70 minutes |

---

## 6. Remaining Work and Order

The frontend portion of the nine-hour build is complete. Remaining work is split into parallel tracks, ordered by priority:

| Priority | Work | Owner | Notes |
|---:|---|---|---|
| 1 | Connect deployed frontend and backend through `VITE_API_BASE` and provider credentials | Shared | Backend contract is ready |
| 2 | Firestore integration | Frontend | Replace only `roomStore.js` function bodies |
| 3 | Map markers and routes | Frontend | Above the cut line if time remains |
| 4 | Result-image export | Frontend | First feature to drop |

Firestore appears lower in this list, but it is required for a multi-device demo. A two-tab demo on one machine works with the current implementation, so choose the demo format before reprioritizing.

### Completed

- All ten interface steps: room creation, invitation code, nickname entry, place search and ranking, optimization, two-route comparison, voting, and confirmation
- Shared room-status subscription architecture
- Constraint-aware temporary frontend optimizer with 14 passing checks
- Preference scoring and candidate selection
- Conflict diagnosis and its UI
- FastAPI application with safe CORS, environment validation, and a health endpoint
- Kakao Local search proxy and cached Google Places business-hours lookup
- Phase 1 backend tests with mocked provider calls
- Phase 2 Track 1 backend optimizer and `POST /api/optimize`
- Deterministic day assignment, exhaustive permutation search, constraint simulation, and conflict diagnosis
- Phase 3 cached Kakao Mobility and ODsay adapters with bounded precise-candidate refinement

### Cut Line

**Must work:** room creation and entry, place search and ranking, two constraint-valid route options, daily timelines, final voting, and confirmation. The frontend and Phase 3 backend now meet this line; the temporary frontend engine remains available for an offline demo.

**Drop in this order if delayed:**

1. Result-image export
2. Map routes
3. Google Places hours; use category defaults and manual entry
4. Firestore; demonstrate with localStorage in one browser
5. Live provider routing; show explicitly marked Track 1 estimates instead

Dropping Track 2 removes the public-transit accuracy claim, so remove maps and image export first.

---

## 7. Verification

**Algorithm checks:** `npm run check` runs the original 14 frontend checks without external APIs. The backend pytest suite covers both optimizer tracks, mocked provider normalization, caching, call bounds, precise constraint revalidation, retry, and fallback without live provider calls.

1. A reserved place starts within its reservation window.
2. A permutation that cannot fit the minimum stay before closing is rejected with `NO_ROUTE`.
3. A restaurant starts only in a lunch or dinner window.
4. Conflicting 18:00 and 18:10 reservations return `TIME_CONFLICT` and both place names.
5. The two options use different orders, and `min_time` has the shorter travel time.
6. An N-day input produces N daily routes, each starting and ending at the configured locations.
7. Dates begin on the requested start date, guarding against UTC date shifts.
8. Picks per person and Borda scores match the section 1 formula.

**End-to-end demo:** Rehearse twice. Create a room on three phones, submit different rankings, and add an 18:00 reservation to confirm that two options appear. Then add a deliberately conflicting reservation and show the conflict notice. Conflict diagnosis is a central judging point and belongs in the demo script.

**Deployment:** Add the Vercel frontend origin to FastAPI CORS configuration in the first backend commit. CORS failures are common late in hackathons. The frontend already includes SPA rewrites in `vercel.json`.

---

## 8. Judging Pitch

“Existing apps sort places by distance. SyncTrip combines multiple travelers' preferences, applies reservation and closing times as hard constraints, and mathematically rejects impossible schedules. Querying every public-transit order would be slow, so its two-track architecture narrows the search with static estimates and calls live routing only for a bounded candidate set, balancing speed with accuracy. When a schedule is impossible, SyncTrip identifies the exact pair of places in conflict instead of returning a generic failure.”
