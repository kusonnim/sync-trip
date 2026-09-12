# 🚀 SyncTrip: Social Voting & Time-Window Based Travel Route Optimization Service

## 1. Overview

* **Project Name:** SyncTrip
* **Development Purpose:** An MVP hackathon service that handles everything from collecting group travel destinations to automatically generating the most efficient travel route by reflecting **Hard Constraints** such as restaurant reservation times and business hours.
* **Core Differentiation:** Rather than simple distance-based sorting, it features a **"Time-Window" constraint-solving algorithm** ("Must arrive at Place X by a specific time") combined with customized **car/public transit timelines**.

---

## 2. Core Features

1. **Place Cart & Ranked Voting:** Team members collect desired locations and each submits a personal 1~n ranking. Borda scores are summed to pick the candidates (4 slots per travel day, plus any place the host marked as required).
2. **Hybrid Constraint Settings:**
* Automatic fetching of basic business hours (or utilizing fallback mock DB for testing).
* The host can manually override/set **Hard Constraints** (e.g., "Dinner reservation at 6:00 PM").


3. **Time-Window Route Optimization Engine:**
* Set departure/arrival locations, the travel date range, the daily departure time, and the daily deadline.
* Reflect minimum/maximum stay times per location.
* Split candidates across the travel days by proximity, then optimize each day independently.
* Iterate through all permutations ($N!$, i.e., 120 combinations for 5 places) per day, immediately drop routes violating reservation times, and return **two options**: shortest travel time (`min_time`) and lowest transit cost (`min_cost`).


4. **Smart Error Handling (Conflict Alerts):** Instead of a generic crash when an impossible schedule is entered, it provides precise guidance such as: `"Conflict detected: Arrival at Place A overlaps with the reservation time of Place B. Please adjust your schedule."`

---

## 3. System Architecture & File Structure

Separated structure between the frontend and the algorithm computation backend.

**Build status:** the final MVP connects the React/Vite frontend to Supabase PostgreSQL and Realtime
for collaborative state, while FastAPI remains responsible for provider proxying and optimization.
Production uses explicit `supabase` and `backend` modes; an explicit `mock` mode remains available
for local demos. The backend provides Kakao Local search, Google Places business hours, Track 1
optimization, and bounded Track 2 refinement through Kakao Mobility or ODsay.

```text
📦 SyncTrip
 ┣ 📂 frontend/ (React + Vite)
 ┃ ┣ 📂 src/
 ┃ ┃ ┣ 📜 App.jsx            # Routing
 ┃ ┃ ┣ 📜 styles.css         # Mobile-optimized styles
 ┃ ┃ ┣ 📂 screens/           # One screen per step of the user flow
 ┃ ┃ ┃ ┗ 📜 Room.jsx         # Switches screens by room status
 ┃ ┃ ┣ 📂 components/        # Timeline, RouteCard, ConflictNotice
 ┃ ┃ ┗ 📂 lib/
 ┃ ┃   ┣ 📜 api.js           # Backend communication (fetch)
 ┃ ┃   ┣ 📜 roomStore.js     # Stable facade over Supabase or explicit local mock state
 ┃ ┃   ┣ 📜 supabaseRoomStore.js # PostgreSQL RPCs and one Realtime channel per room
 ┃ ┃   ┣ 📜 preference.js    # Borda scoring and candidate selection
 ┃ ┃   ┗ 📜 mockOptimize.js  # Explicit local/demo optimizer fallback
 ┃ ┣ 📂 scripts/
 ┃ ┃ ┗ 📜 check-optimizer.mjs # Constraint checks, run with `npm run check`
 ┃ ┗ 📜 package.json
 ┃
 ┗ 📂 backend/ (Python FastAPI) — production-configurable place APIs and two-track optimizer
   ┣ 📂 app/
   ┃ ┣ 📜 main.py          # FastAPI application and CORS setup
   ┃ ┣ 📂 api/             # Search, business-hours, and optimization routes
   ┃ ┣ 📂 models/          # Explicit API request and response models
   ┃ ┣ 📂 optimizer/       # Day splitting, estimation, constraints, scoring, conflicts
   ┃ ┣ 📂 routing/         # Cached Kakao Mobility and ODsay routing adapters
   ┃ ┗ 📂 services/        # Kakao Local and Google Places adapters
   ┣ 📜 requirements.txt   # FastAPI, Uvicorn, Requests, etc.
   ┗ 📜 .env               # API Key storage (never committed)

```

CORS: open the Vercel frontend origin on the FastAPI side before anything else. This is the single
most common thing to break late in a hackathon.

### Collaborative PostgreSQL Model

`rooms` uses an internal UUID primary key and a separate unique four-character code. Its child
tables are `room_members`, `room_places`, `room_preferences`, `room_routes`, `room_errors`, and
`room_final_votes`. Every child has a foreign key to `rooms(id)` with `ON DELETE CASCADE`.
Composite primary keys enforce one member, place, ranking, and final vote per relevant room key.
Nested optimizer routes and structured errors remain JSONB because their shape is already defined
by the API contract.

The browser keeps a stable random member ID and a per-room host token. PostgreSQL stores only the
host-token digest in a private, non-published table. All mutations use narrow RPCs; browser roles
have read-only table access for Realtime. `acquire_optimization_lock` atomically verifies the host,
uses database time for a two-minute stale threshold, and stores a UUID nonce. Completion/failure
RPCs require that same nonce, so an abandoned run cannot overwrite a recovered one.

One Supabase Realtime channel watches the seven room tables. Every room-scoped change coalesces into
one `get_room_snapshot` RPC, producing a coherent camelCase view for the existing screens. RLS is
enabled on every table, but the accountless design cannot prove ownership of a client-generated
member ID and read access needed for anonymous Realtime is not private. Supabase Auth or a trusted
persistence backend is required before storing sensitive data.

---

## 4. Internal API Specification

The 3 core endpoints for communication between the frontend and the Python FastAPI backend.

### ① Place Search Proxy (Hiding Kakao API Key)

* **[GET] `/api/search**`
* **Query Params:** `?keyword=Haedong Yonggungsa`
* **Response (JSON):**
```json
{
  "status": "success",
  "data": [
    {
      "place_id": "kakao_12345",
      "name": "Haedong Yonggungsa",
      "address": "Gijang-gun, Busan...",
      "lat": 35.188,
      "lng": 129.223
    }
  ]
}

```



### ② Business Hours Lookup (Google API or Test Mock Data)

* **[GET] `/api/place/details**`
* **Query Params:** `?name=Haedong Yonggungsa`
* **Response (JSON):**
```json
{
  "status": "success",
  "data": {
    "open_time": "09:00",
    "close_time": "18:00"
  }
}

```



### ③ Route Optimization Engine (Core Optimizer)

* **[POST] `/api/optimize**`
* **Request Body (JSON):**

`start_date` / `end_date` define the trip length. `start_time` and `end_deadline` are the daily
departure time and the daily "everyone goes home" deadline, applied to every day.
`end_location` may differ from `start_location`.

Business hours travel on the place object itself (`open_time` / `close_time`), so `hard_constraint`
means only a user-entered reservation window and is `null` for most places.
`preference_score` is the summed Borda score used to select candidates before optimization. It is
preserved in this contract but is not an order tiebreaker: every permutation contains the same
places, so its aggregate is constant.

```json
{
  "settings": {
    "transport_mode": "transit",
    "start_date": "2026-09-19",
    "end_date": "2026-09-20",
    "start_location": {"name": "Seoul Station", "lat": 37.554, "lng": 126.970},
    "end_location": {"name": "Seoul Station", "lat": 37.554, "lng": 126.970},
    "start_time": "10:00",
    "end_deadline": "21:00"
  },
  "places": [
    {
      "place_id": "kakao_12345",
      "name": "Haedong Yonggungsa",
      "category": "attraction",
      "lat": 35.188,
      "lng": 129.223,
      "stay_time_min": 60,
      "stay_time_max": 90,
      "open_time": "09:00",
      "close_time": "18:00",
      "hard_constraint": null,
      "preference_score": 12
    },
    {
      "place_id": "kakao_67890",
      "name": "Target Restaurant",
      "category": "restaurant",
      "lat": 35.101,
      "lng": 129.030,
      "stay_time_min": 60,
      "stay_time_max": 60,
      "open_time": "11:00",
      "close_time": "21:00",
      "hard_constraint": {"start": "18:00", "end": "18:00"},
      "preference_score": 9
    }
  ]
}

```


* **Response - On Success (JSON):**

Two routes over the same candidates, ordered `min_time` first. Each route holds one entry per
travel day, and each day holds the alternating place / transit timeline.
Phase 3 may also include backward-compatible `routing_source` and `warning` fields on each route.

```json
{
  "status": "success",
  "routes": [
    {
      "type": "min_time",
      "label": "Fastest Route",
      "total_time": 240,
      "total_cost": 8600,
      "routing_source": "provider",
      "days": [
        {
          "date": "2026-09-19",
          "total_time": 240,
          "total_cost": 8600,
          "timeline": [
            { "type": "place", "name": "Seoul Station", "time": "10:00" },
            { "type": "transit", "mode": "transit", "instruction": "Estimated transit leg", "time": "10:00 ~ 10:45", "duration": 45, "cost": 1500 },
            { "type": "place", "place_id": "kakao_12345", "name": "Haedong Yonggungsa", "category": "attraction", "time": "10:45 ~ 12:15", "stay_duration": 90, "wait_duration": 0 }
          ]
        }
      ]
    },
    {
      "type": "min_cost",
      "label": "Lowest-Cost Route",
      "total_time": 265,
      "total_cost": 7200,
      "days": []
    }
  ]
}

```


* **Response - On Failure (Time Conflict):**

Never return a bare "no route found". Name the two places that collide so the user knows what to fix.

```json
{
  "status": "error",
  "code": "TIME_CONFLICT",
  "message": "Physical travel is impossible due to the Target Restaurant schedule (18:00 reservation). Please adjust your times.",
  "place_ids": ["kakao_67890", "kakao_12345"]
}

```



---

## 5. Algorithm Logic Summary (Phase 3)

0. **Day Splitting (runs first):** Cluster every candidate by coordinate into as many groups as there are travel days, targeting the normal four places per day. Exhaustive search supports at most six places per day (`6! = 720`). Reject larger inputs explicitly; never truncate or discard candidates. Every day starts at `start_location` and ends at `end_location`.

1. **Two-Track Routing Strategy:**
* **Track 1 (Fast Permutation Calculation):** Use static average travel times to evaluate every permutation, up to 720 combinations for six places, and isolate the optimal orders.
* **Track 2 (Precise Timeline Generation):** Retain the top three Track 1 candidates per objective and day. Route only their legs through ODsay or Kakao Mobility, rebuild timelines, revalidate every constraint, and rerank using precise totals. Successful legs use a 30-minute in-memory cache keyed by directed coordinates and mode. No network call occurs during permutation search.


2. **Hard Constraint Validation:**
* Wait when arrival is before opening, then require the entire minimum stay to fit before `close_time`.
* Wait for an upcoming reservation when early, and require the actual visit start to remain within its window.
* Wait for restaurants until lunch (11:30–13:30) or dinner (17:30–19:30), and validate the visit start rather than interval overlap.
* Schedule exactly `stay_time_min`; `stay_time_max` remains a validated upper bound for future slack allocation.
* Check that returning to `end_location` lands before `end_deadline`.
* Drop violating routes immediately using `continue`.


3. **Final Selection:** Score the surviving permutations twice and return **two** routes.
* `min_time` — rank lexicographically by total travel minutes, then cost, then stable place order.
* `min_cost` — rank lexicographically by total estimated cost, then travel time, then stable place order.
* Borda preferences select candidates before this endpoint. Do not subtract the constant `sum(preference_score)` from permutation scores.
* If both objectives land on the same order, give `min_cost` the next-best valid distinct order. If only one valid route exists, return it in both entries.


4. **Conflict Diagnosis (before the permutation search):** Compare every pair of reserved places within each allocated day. Determine the chronologically earlier reservation first, then check its minimum stay plus travel against the later window end. Return `TIME_CONFLICT` naming both places when impossible. Other infeasibility returns `NO_ROUTE`.

5. **Track 2 Failure Policy:** A provider no-route result invalidates that precise candidate and advances to the next bounded candidate. If none survive, return `PRECISE_ROUTE_INFEASIBLE`. Timeouts, rate limits, malformed responses, and temporary upstream failures return the Track 1 routes with an explicit `ROUTING_FALLBACK` warning. Missing configuration and authentication errors remain visible service failures.

6. **Precise Cost Semantics:** ODsay's reported `payment` is the transit fare; when absent, use the Track 1 fare estimate and emit `ESTIMATED_TRANSIT_FARE`. Driving cost is estimated operating cost (`distance_km × CAR_COST_PER_KM_KRW`) plus Kakao's reported toll, without taxi fare.
