# SyncTrip Backend

Phase 1 provides the FastAPI foundation and the two place-information endpoints used by the existing frontend. Route optimization is intentionally not implemented yet.

## Requirements

- Python 3.11 or newer
- Kakao Developers REST API key for live place search
- Google Maps Platform API key with Places API (New) enabled for live business-hours lookup

The application can start and serve `/health` without provider keys. A provider endpoint returns a clear `503 PROVIDER_NOT_CONFIGURED` response until its key is configured.

## Setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

python -m pip install -r requirements.txt
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux
```

Fill in `.env`:

```dotenv
KAKAO_REST_API_KEY=your_backend_only_key
GOOGLE_PLACES_API_KEY=your_backend_only_key
CORS_ORIGINS=http://localhost:5173,https://your-app.vercel.app
```

Create the Kakao key in the [Kakao Developers console](https://developers.kakao.com/) and enable Places API (New) for the Google key in the [Google Maps Platform console](https://console.cloud.google.com/google/maps-apis/). Never add either key to the frontend or to a `VITE_` variable.

## Run Locally

```bash
cd backend
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`, with interactive documentation at `/docs`.

## Tests

```bash
cd backend
pytest
```

Automated tests mock both providers and never make live Kakao or Google requests.

## Endpoints

### `GET /health`

```json
{"status": "ok"}
```

### `GET /api/search?keyword=Seoul%20Forest`

Proxies the current Kakao Local keyword-search REST API and returns normalized SyncTrip places:

```json
{
  "status": "success",
  "data": [
    {
      "place_id": "kakao_12345",
      "name": "Seoul Forest",
      "address": "273 Ttukseom-ro, Seoul",
      "lat": 37.5443,
      "lng": 127.0374,
      "category": "attraction"
    }
  ]
}
```

Kakao coordinates are converted from strings to JSON numbers. Provider categories map to the stable SyncTrip values `restaurant`, `cafe`, `attraction`, `museum`, and `shopping`; unknown values fall back to `attraction`.

### `GET /api/place/details?name=Seoul%20Forest`

Uses Google Places API (New) Text Search with a field mask limited to regular opening hours:

```json
{
  "status": "success",
  "data": {
    "open_time": "09:00",
    "close_time": "18:00"
  }
}
```

If Google has no usable hours, the endpoint returns HTTP 200 with:

```json
{"status": "unavailable", "data": null}
```

The frontend already treats this as optional enrichment and keeps its category defaults.

### Business-Hours Normalization

The frontend contract supports one opening and closing time, while Google may return different weekday hours, split periods, overnight schedules, or 24-hour operation. Phase 1 applies this deterministic strategy:

1. Combine multiple same-day periods into an earliest-open/latest-close span.
2. Select the most common daily span across the regular week.
3. Break ties by earliest opening time, then earliest closing time.
4. Normalize a documented 24/7 period to `00:00–23:59`.
5. Ignore overnight periods because the current contract cannot represent them. Return `unavailable` if no same-day span remains.

Successful and unavailable results are cached in memory by normalized place name. Configure the TTL and maximum size with `GOOGLE_CACHE_TTL_SECONDS` and `GOOGLE_CACHE_MAX_ENTRIES`.

## Error Responses

Provider failures use a stable shape without raw provider bodies, traces, or credentials:

```json
{
  "status": "error",
  "code": "UPSTREAM_UNAVAILABLE",
  "message": "Kakao Local is temporarily unavailable."
}
```

Authentication failures, rate limits, timeouts, malformed responses, missing configuration, and invalid blank input have distinct error codes and appropriate HTTP status codes.

## Phase 1 Limitations

- `POST /api/optimize` is not implemented.
- No permutation optimization, day splitting, conflict diagnosis, Kakao Mobility, or ODsay integration is included.
- No Firestore, authentication, maps, or image export is included.
- Live provider behavior requires valid keys and provider-console configuration; automated tests validate adapters with mocked responses.

## Official Provider References

- [Kakao Local: Search place by keyword](https://developers.kakao.com/docs/en/local/dev-guide#search-by-keyword)
- [Google Places API (New): Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Google Places API (New): OpeningHours resource](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#OpeningHours)
