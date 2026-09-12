# 🚀 SyncTrip: Social Voting & Time-Window Based Travel Route Optimization Service

## 1. Overview

* **Project Name:** SyncTrip
* **Development Purpose:** An MVP hackathon service that handles everything from collecting group travel destinations to automatically generating the most efficient travel route by reflecting **Hard Constraints** such as restaurant reservation times and business hours.
* **Core Differentiation:** Rather than simple distance-based sorting, it features a **"Time-Window" constraint-solving algorithm** ("Must arrive at Place X by a specific time") combined with customized **car/public transit timelines**.

---

## 2. Core Features

1. **Place Cart & Voting:** Team members collect desired locations and vote to select the top 5–7 places.
2. **Hybrid Constraint Settings:**
* Automatic fetching of basic business hours (or utilizing fallback mock DB for testing).
* The host can manually override/set **Hard Constraints** (e.g., "Dinner reservation at 6:00 PM").


3. **Time-Window Route Optimization Engine:**
* Set departure/arrival locations, departure time, and travel deadline.
* Reflect minimum/maximum stay times per location.
* Iterate through all permutations ($N!$, i.e., 120 combinations for 5 places), immediately drop routes violating reservation times, and derive the optimal route with the shortest travel time.


4. **Smart Error Handling (Conflict Alerts):** Instead of a generic crash when an impossible schedule is entered, it provides precise guidance such as: `"Conflict detected: Arrival at Place A overlaps with the reservation time of Place B. Please adjust your schedule."`

---

## 3. System Architecture & File Structure

Separated structure between the frontend and the algorithm computation backend.

```text
📦 SyncTrip
 ┣ 📂 frontend/ (React / Vanilla JS)
 ┃ ┣ 📂 src/
 ┃ ┃ ┣ 📜 App.jsx          # Main view and routing
 ┃ ┃ ┣ 📜 api.js           # Backend communication (Axios)
 ┃ ┃ ┗ 📜 index.css        # Mobile-optimized styles
 ┃ ┗ 📜 package.json
 ┃
 ┗ 📂 backend/ (Python FastAPI)
   ┣ 📂 app/
   ┃ ┣ 📜 main.py          # FastAPI app execution and CORS setup
   ┃ ┗ 📜 optimizer.py     # Two-Track routing & Hard Constraint filtering algorithm
   ┣ 📜 requirements.txt   # FastAPI, Uvicorn, Requests, etc.
   ┗ 📜 .env               # API Key storage

```

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
```json
{
  "settings": {
    "transport_mode": "transit", 
    "start_location": {"lat": 35.1, "lng": 129.0},
    "start_time": "10:00",
    "end_deadline": "21:00"
  },
  "places": [
    {
      "name": "Haedong Yonggungsa",
      "lat": 35.188,
      "lng": 129.223,
      "stay_time_min": 60,
      "stay_time_max": 90,
      "hard_constraint": null
    },
    {
      "name": "Target Restaurant",
      "lat": 35.101,
      "lng": 129.030,
      "stay_time_min": 60,
      "stay_time_max": 60,
      "hard_constraint": {"start": "18:00", "end": "20:00"}
    }
  ]
}

```


* **Response - On Success (JSON):**
```json
{
  "status": "success",
  "total_time": 240,
  "timeline": [
    { "type": "place", "name": "Starting Point", "time": "10:00" },
    { "type": "transit", "instruction": "Bus 1003 board (approx. 45 mins)", "time": "10:00 ~ 10:45" },
    { "type": "place", "name": "Haedong Yonggungsa", "time": "10:45 ~ 12:15", "stay_duration": 90 }
  ]
}

```


* **Response - On Failure (Time Conflict):**
```json
{
  "status": "error",
  "code": "TIME_CONFLICT",
  "message": "Physical travel is impossible due to the Target Restaurant schedule (18:00 reservation). Please adjust your times."
}

```



---

## 5. Algorithm Logic Summary (`optimizer.py` Skeleton)

1. **Two-Track Routing Strategy:**
* **Track 1 (Fast Permutation Calculation):** Use static average travel times to quickly evaluate all permutations (e.g., $120$ combinations for 5 places) in under 0.1 seconds to isolate the optimal order.
* **Track 2 (Precise Timeline Generation):** Run dynamic transit/car routing APIs sequentially only on the single winning route to construct accurate step-by-step timetables.


2. **Hard Constraint Validation:**
* Check if arrival happens later than a place's closing time.
* Check if arrival falls precisely within the user-defined reservation time (`hard_constraint`).
* Drop violating routes immediately using `continue`.


3. **Final Selection:** Serialize and return the single surviving route with the shortest total travel time.