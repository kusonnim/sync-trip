import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from threading import Lock
from typing import Literal

from app.models.optimize import Location
from app.routing.models import RoutedLeg


@dataclass(frozen=True)
class RoutingCacheKey:
    origin_lat: float
    origin_lng: float
    destination_lat: float
    destination_lng: float
    mode: Literal["car", "transit"]

    @classmethod
    def from_leg(
        cls,
        origin: Location,
        destination: Location,
        mode: Literal["car", "transit"],
    ) -> "RoutingCacheKey":
        return cls(
            origin_lat=round(origin.lat, 6),
            origin_lng=round(origin.lng, 6),
            destination_lat=round(destination.lat, 6),
            destination_lng=round(destination.lng, 6),
            mode=mode,
        )


class RoutingCache:
    def __init__(
        self,
        ttl_seconds: int,
        max_entries: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._clock = clock
        self._items: OrderedDict[RoutingCacheKey, tuple[float, RoutedLeg]] = OrderedDict()
        self._lock = Lock()

    def get(self, key: RoutingCacheKey) -> RoutedLeg | None:
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= self._clock():
                del self._items[key]
                return None
            self._items.move_to_end(key)
            return value

    def set(self, key: RoutingCacheKey, value: RoutedLeg) -> None:
        with self._lock:
            self._items[key] = (self._clock() + self._ttl_seconds, value)
            self._items.move_to_end(key)
            while len(self._items) > self._max_entries:
                self._items.popitem(last=False)
