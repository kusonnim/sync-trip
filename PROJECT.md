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

**Build status:** the frontend exists and runs the whole flow on its own. The backend folder is not
written yet. Until it is, the frontend answers its own `/api/optimize` calls with a stand-in engine
(`src/lib/mockOptimize.js`) that speaks exactly the contract in section 4, so swapping in the real
backend is a one-line environment change (`VITE_API_BASE`).

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
 ┃ ┃   ┣ 📜 roomStore.js     # Room state + realtime sync (localStorage now, Firestore later)
 ┃ ┃   ┣ 📜 preference.js    # Borda scoring and candidate selection
 ┃ ┃   ┗ 📜 mockOptimize.js  # Stand-in optimizer until the backend is ready
 ┃ ┣ 📂 scripts/
 ┃ ┃ ┗ 📜 check-optimizer.mjs # Constraint checks, run with `npm run check`
 ┃ ┗ 📜 package.json
 ┃
 ┗ 📂 backend/ (Python FastAPI) — not written yet
   ┣ 📂 app/
   ┃ ┣ 📜 main.py          # FastAPI app execution and CORS setup
   ┃ ┗ 📜 optimizer.py     # Two-Track routing & Hard Constraint filtering algorithm
   ┣ 📜 requirements.txt   # FastAPI, Uvicorn, Requests, etc.
   ┗ 📜 .env               # API Key storage (never committed)

```

CORS: open the Vercel frontend origin on the FastAPI side before anything else. This is the single
most common thing to break late in a hackathon.

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
`preference_score` is the summed Borda score from the team's rankings; use it to break ties.

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

```json
{
  "status": "success",
  "routes": [
    {
      "type": "min_time",
      "label": "최소 시간",
      "total_time": 240,
      "total_cost": 8600,
      "days": [
        {
          "date": "2026-09-19",
          "total_time": 240,
          "total_cost": 8600,
          "timeline": [
            { "type": "place", "name": "Seoul Station", "time": "10:00" },
            { "type": "transit", "mode": "transit", "instruction": "Bus 1003 board", "time": "10:00 ~ 10:45", "duration": 45, "cost": 1500 },
            { "type": "place", "place_id": "kakao_12345", "name": "Haedong Yonggungsa", "category": "attraction", "time": "10:45 ~ 12:15", "stay_duration": 90, "wait_duration": 0 }
          ]
        }
      ]
    },
    {
      "type": "min_cost",
      "label": "최소 비용",
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

## 5. Algorithm Logic Summary (`optimizer.py` Skeleton)

0. **Day Splitting (runs first):** Cluster the candidate places by coordinate into as many groups as there are travel days, cap each group at 4 places, then run everything below once per day. Every day starts at `start_location` and ends at `end_location`.

1. **Two-Track Routing Strategy:**
* **Track 1 (Fast Permutation Calculation):** Use static average travel times to quickly evaluate all permutations (e.g., $120$ combinations for 5 places) in under 0.1 seconds to isolate the optimal orders.
* **Track 2 (Precise Timeline Generation):** Run dynamic transit/car routing APIs sequentially only on the winning routes to construct accurate step-by-step timetables. Cache by `(origin, destination, mode)` so the two options share calls on legs they have in common.


2. **Hard Constraint Validation:**
* Check if arrival happens later than a place's closing time, or if the minimum stay does not fit before `close_time`.
* Check if arrival falls within the user-defined reservation window (`hard_constraint`).
* Force restaurants into a lunch (11:30–13:30) or dinner (17:30–19:30) start.
* Check that returning to `end_location` lands before `end_deadline`.
* Drop violating routes immediately using `continue`.


3. **Final Selection:** Score the surviving permutations twice and return **two** routes.
* `min_time` — rank by total travel minutes.
* `min_cost` — rank by total transit cost, with travel time as a light tiebreaker.
* Subtract `preference_score` from both rankings so the team's favourites win ties.
* If both objectives land on the same order, give `min_cost` the next-best distinct order so the user always has two real choices.


4. **Conflict Diagnosis (before the permutation search):** Compare every pair of places that has a `hard_constraint`. If the gap between the two reservation times is smaller than the travel time plus the first place's minimum stay, return `TIME_CONFLICT` naming both places. This check is $O(m^2)$ and far cheaper than the search, so run it first.