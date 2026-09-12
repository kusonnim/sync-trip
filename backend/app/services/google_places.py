import logging
import time
import unicodedata
from collections import Counter, OrderedDict
from functools import lru_cache
from threading import Lock
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.models.place import PlaceHours

from .errors import (
    MalformedProviderResponse,
    MissingProviderKey,
    ProviderAuthenticationError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)


logger = logging.getLogger(__name__)
GOOGLE_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"


class TTLCache:
    def __init__(self, ttl_seconds: int, max_entries: int) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._items: OrderedDict[str, tuple[float, PlaceHours | None]] = OrderedDict()
        self._lock = Lock()

    def get(self, key: str) -> tuple[bool, PlaceHours | None]:
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return False, None
            expires_at, value = item
            if expires_at <= time.monotonic():
                del self._items[key]
                return False, None
            self._items.move_to_end(key)
            return True, value

    def set(self, key: str, value: PlaceHours | None) -> None:
        with self._lock:
            self._items[key] = (time.monotonic() + self._ttl_seconds, value)
            self._items.move_to_end(key)
            while len(self._items) > self._max_entries:
                self._items.popitem(last=False)


def normalize_cache_key(name: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", name).casefold().split())


def _point(point: Any) -> tuple[int, int]:
    if not isinstance(point, dict):
        raise MalformedProviderResponse("Google Places")
    day = point.get("day")
    hour = point.get("hour", 0)
    minute = point.get("minute", 0)
    if (
        isinstance(day, bool)
        or isinstance(hour, bool)
        or isinstance(minute, bool)
        or not isinstance(day, int)
        or not isinstance(hour, int)
        or not isinstance(minute, int)
        or not 0 <= day <= 6
        or not 0 <= hour <= 23
        or not 0 <= minute <= 59
    ):
        raise MalformedProviderResponse("Google Places")
    return day, hour * 60 + minute


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def normalize_google_hours(payload: Any) -> PlaceHours | None:
    if not isinstance(payload, dict):
        raise MalformedProviderResponse("Google Places")
    places = payload.get("places", [])
    if not isinstance(places, list):
        raise MalformedProviderResponse("Google Places")
    if not places:
        return None
    place = places[0]
    if not isinstance(place, dict):
        raise MalformedProviderResponse("Google Places")
    hours = place.get("regularOpeningHours")
    if hours is None:
        return None
    if not isinstance(hours, dict):
        raise MalformedProviderResponse("Google Places")
    periods = hours.get("periods")
    if periods is None or periods == []:
        return None
    if not isinstance(periods, list):
        raise MalformedProviderResponse("Google Places")

    daily_intervals: dict[int, list[tuple[int, int]]] = {}
    for period in periods:
        if not isinstance(period, dict):
            raise MalformedProviderResponse("Google Places")
        open_day, open_minutes = _point(period.get("open"))
        close = period.get("close")
        if close is None:
            if len(periods) == 1 and open_day == 0 and open_minutes == 0:
                return PlaceHours(open_time="00:00", close_time="23:59")
            continue
        close_day, close_minutes = _point(close)
        # The current contract cannot represent overnight spans.
        if close_day != open_day or close_minutes <= open_minutes:
            continue
        daily_intervals.setdefault(open_day, []).append((open_minutes, close_minutes))

    daily_spans = [
        (min(start for start, _ in intervals), max(end for _, end in intervals))
        for intervals in daily_intervals.values()
    ]
    if not daily_spans:
        return None

    counts = Counter(daily_spans)
    open_minutes, close_minutes = sorted(
        counts,
        key=lambda span: (-counts[span], span[0], span[1]),
    )[0]
    return PlaceHours(open_time=_hhmm(open_minutes), close_time=_hhmm(close_minutes))


class GooglePlacesService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client
        self._cache = TTLCache(
            settings.google_cache_ttl_seconds,
            settings.google_cache_max_entries,
        )

    async def get_hours(self, name: str) -> PlaceHours | None:
        key = normalize_cache_key(name)
        hit, cached = self._cache.get(key)
        if hit:
            return cached

        secret = self._settings.google_places_api_key
        if secret is None or not secret.get_secret_value():
            raise MissingProviderKey("Google Places")

        headers = {
            "X-Goog-Api-Key": secret.get_secret_value(),
            "X-Goog-FieldMask": "places.regularOpeningHours",
        }
        body = {"textQuery": name, "languageCode": "en", "pageSize": 1}
        try:
            if self._client is not None:
                response = await self._client.post(GOOGLE_TEXT_SEARCH_URL, headers=headers, json=body)
            else:
                async with httpx.AsyncClient(timeout=self._settings.provider_timeout_seconds) as client:
                    response = await client.post(GOOGLE_TEXT_SEARCH_URL, headers=headers, json=body)
        except httpx.TimeoutException as exc:
            logger.warning("Google Places request timed out")
            raise ProviderTimeoutError("Google Places") from exc
        except httpx.RequestError as exc:
            logger.warning("Google Places request failed: %s", type(exc).__name__)
            raise ProviderUnavailableError("Google Places") from exc

        if response.status_code in {401, 403}:
            raise ProviderAuthenticationError("Google Places")
        if response.status_code == 429:
            raise ProviderRateLimitError("Google Places")
        if response.status_code >= 400:
            logger.warning("Google Places returned HTTP %s", response.status_code)
            raise ProviderUnavailableError("Google Places")
        try:
            payload = response.json()
        except ValueError as exc:
            raise MalformedProviderResponse("Google Places") from exc

        result = normalize_google_hours(payload)
        self._cache.set(key, result)
        return result


@lru_cache
def get_google_places_service() -> GooglePlacesService:
    return GooglePlacesService(get_settings())
