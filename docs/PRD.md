# SyncTrip PRD — Social-Voting Travel Route Optimization with Time Constraints

## Context

This product definition combines three source materials: the original planning document, handwritten notes, and the user-flow diagram. [PROJECT.md](../PROJECT.md) is the canonical source for API contracts and algorithm behavior; if this document differs, follow PROJECT.md.

The frontend currently supports the complete ten-step flow without a backend. A temporary frontend engine returns responses in the same shape as the backend contract.

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

### Adding and Ranking Are Separate

There is no limit on how many places a member may add, and the cart is shared with the whole group.
From that cart each member ranks a **top 3**. Adding says "here is an option"; ranking says
"I want to go here", and merging the two blurs the signal.

```text
First choice 3 points, second 2, third 1  (Borda)
A place that was only added and never ranked scores 0
```

Required places are always included. Fill the remaining `4 × trip days - requiredCount` slots with
the highest preference scores. A zero-score place can still take a leftover slot.

An earlier version derived picks per person from the handwritten note
("more days, more picks; more people, fewer picks"), but that formula capped how many places a member
could add at all, which read as a bug. Adding is now unlimited and the ranking is fixed at 3.

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
  visitWindow                         // { start, end } scheduled visit; hard constraint
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

Choose the most geographically separated places as seeds, one per trip day. Assign every remaining place to its nearest seed without exceeding four places per day, then optimize each day independently. Assume the same start and end locations every day; lodging logic is out of scope.

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
depart = start + stay          // Use stay_time_min; extend toward stay_time_max when possible
final: require arrival at end_location <= end_deadline
```

Meal windows are validated by **start time**, not overlap, so a visit cannot qualify by touching only the end of the window.

Score surviving permutations with:

```text
J = wt × total travel minutes + wc × total cost − wp × sum(preference_score)
```

`preference_score` is the group's Borda total. Its weight is 3 and breaks ties in favor of group preferences. Best-time bonuses are not yet implemented.

| Route | wt | wc | Goal |
|---|---:|---:|---|
| `min_time` | 1.0 | 0.0 | Minimum travel time |
| `min_cost` | 0.2 | 0.1 | Minimum cost |

If both objectives choose the same permutation, use the next-ranked permutation so the group always receives two distinct options. Searching 720 permutations across three days takes less than 0.1 seconds in Python.

### 4.3 Track 2 — Precise Routing

Call live routing APIs only for legs in the selected permutations. A five-place day has six legs. Cache shared legs between the two route options by `(origin coordinates, destination coordinates, transportation mode)`. A three-day trip should require roughly 20–40 calls.

- Public transit: ODsay `searchPubTransPathT` for time, transfers, line names, and fares
- Driving: Kakao Mobility `directions` for distance, time, and tolls; estimate fuel as `distance × ₩140/km`

If live travel time breaks a constraint that the estimate satisfied, add a `warning` flag to the route card and retry once with the next-ranked permutation. Do not recalculate indefinitely.

Track 2 belongs in the backend and is not implemented. The current timeline uses Track 1 estimates.

### 4.4 Conflict Diagnosis

Do not return a generic no-route message when no permutations survive. First examine every pair of places with fixed reservations:

```text
for i, j in pairs of places with hard_constraint:
    if |start_j − start_i| < travel(i, j) + stay_time_min_i:
        return TIME_CONFLICT with both IDs in place_ids
```

Example: “The 18:00 reservation at the Seongsu restaurant conflicts with the 18:10 reservation at N Seoul Tower. Travel requires 32 minutes. Adjust one reservation.” Diagnose closing-time and deadline failures similarly.

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

**How business hours get filled.** Category defaults go in the moment a place is added.
`/api/place/details` is then called and overwrites them with real hours. If that lookup fails or
returns nothing, the defaults remain so itinerary creation never stalls. A value the host edits by
hand wins over both and sets `hoursSource` to `manual`. The screen shows which source produced the
value on display.

**Scheduled visits.** A place with a reservation or a must-arrive hour carries a `visitWindow`.
A start alone means that exact time; a start and an end mean anytime in between. The value passes
straight through as the contract's `hard_constraint`, and any order that violates it is dropped.

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
| 1 | FastAPI skeleton, CORS, and `/api/optimize` stub | Backend | Create the stub first so the frontend can connect |
| 2 | Kakao Local proxy at `/api/search` | Backend | Replaces the 16 mock places immediately |
| 3 | Python optimizer: Track 1 and conflict diagnosis | Backend | Match the temporary frontend engine |
| 4 | Connect frontend and backend through `VITE_API_BASE` | Shared | Minimum viable live demo |
| 5 | Track 2 live routing with ODsay and Kakao Mobility | Backend | Adds line names to the timeline |
| 6 | Firestore integration | Frontend | Replace only `roomStore.js` function bodies |
| 7 | Google Places hours at `/api/place/details` | Backend | Requires cost approval before live calls |
| 8 | Map markers and routes | Frontend | Above the cut line if time remains |
| 9 | Result-image export | Frontend | First feature to drop |

Firestore appears lower in this list, but it is required for a multi-device demo. A two-tab demo on one machine works with the current implementation, so choose the demo format before reprioritizing.

### Completed

- All ten interface steps: room creation, invitation code, nickname entry, place search and ranking, optimization, two-route comparison, voting, and confirmation
- Shared room-status subscription architecture
- Constraint-aware temporary frontend optimizer with 14 passing checks
- Preference scoring and candidate selection
- Conflict diagnosis and its UI

### Cut Line

**Must work:** room creation and entry, place search and ranking, two constraint-valid route options, daily timelines, final voting, and confirmation. **The current frontend already meets this line.** The temporary engine can support the demo if the backend is late.

**Drop in this order if delayed:**

1. Result-image export
2. Map routes
3. Google Places hours; use category defaults and manual entry
4. Firestore; demonstrate with localStorage in one browser
5. Track 2 live routing; show Track 1 estimates without line details

Dropping Track 2 removes the public-transit accuracy claim, so remove maps and image export first.

---

## 7. Verification

**Algorithm checks:** `npm run check` runs 14 checks without external APIs, and all currently pass. When the backend engine is implemented, run equivalent Python checks. The script is `frontend/scripts/check-optimizer.mjs`.

1. A reserved place starts within its reservation window.
2. A permutation that cannot fit the minimum stay before closing is rejected with `NO_ROUTE`.
3. A restaurant starts only in a lunch or dinner window.
4. Conflicting 18:00 and 18:10 reservations return `TIME_CONFLICT` and both place names.
5. The two options use different orders, and `min_time` has the shorter travel time.
6. An N-day input produces N daily routes, each starting and ending at the configured locations.
7. Dates begin on the requested start date, guarding against UTC date shifts.
8. Borda scores sum to 3/2/1, an unranked place scores 0, and entries past the top 3 are ignored.

**End-to-end demo:** Rehearse twice. Create a room on three phones, submit different rankings, and add an 18:00 reservation to confirm that two options appear. Then add a deliberately conflicting reservation and show the conflict notice. Conflict diagnosis is a central judging point and belongs in the demo script.

**Deployment:** Add the Vercel frontend origin to FastAPI CORS configuration in the first backend commit. CORS failures are common late in hackathons. The frontend already includes SPA rewrites in `vercel.json`.

---

## 8. Judging Pitch

“Existing apps sort places by distance. SyncTrip combines multiple travelers' preferences, applies reservation and closing times as hard constraints, and mathematically rejects impossible schedules. Querying every public-transit order would be slow, so its two-track architecture selects the order with static estimates and calls the live routing API only for the winning routes, balancing speed with accuracy. When a schedule is impossible, SyncTrip identifies the exact pair of places in conflict instead of returning a generic failure.”
