from app.routing.cache import RoutingCache, RoutingCacheKey
from app.routing.models import RoutedLeg
from tests.optimizer_helpers import place, settings


def test_routing_cache_uses_mode_direction_and_coordinates():
    cache = RoutingCache(ttl_seconds=30, max_entries=4)
    origin = settings().start_location
    destination = place("a", lat=37.6, lng=127.0)
    key = RoutingCacheKey.from_leg(origin, destination, "transit")
    reverse = RoutingCacheKey.from_leg(destination, origin, "transit")
    car = RoutingCacheKey.from_leg(origin, destination, "car")
    leg = RoutedLeg(10, 1400, 1.0, "Transit", "test")
    cache.set(key, leg)
    assert cache.get(key) == leg
    assert cache.get(reverse) is None
    assert cache.get(car) is None


def test_routing_cache_expires_and_evicts_lru_entries():
    now = [0.0]
    cache = RoutingCache(ttl_seconds=10, max_entries=1, clock=lambda: now[0])
    origin = settings().start_location
    first = RoutingCacheKey.from_leg(origin, place("a"), "car")
    second = RoutingCacheKey.from_leg(origin, place("b", lng=127.1), "car")
    leg = RoutedLeg(5, 100, 1.0, "Drive", "test")
    cache.set(first, leg)
    cache.set(second, leg)
    assert cache.get(first) is None
    assert cache.get(second) == leg
    now[0] = 11
    assert cache.get(second) is None
