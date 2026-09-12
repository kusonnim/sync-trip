import pytest

from app.optimizer.estimator import DETOUR_FACTOR, estimate_leg, haversine_km
from tests.optimizer_helpers import place


def test_haversine_and_detour_distance_are_geographic():
    origin = place("a", lat=37.0, lng=127.0)
    destination = place("b", lat=38.0, lng=127.0)
    straight = haversine_km(origin, destination)
    estimate = estimate_leg(origin, destination, "car")
    assert straight == pytest.approx(111.2, rel=0.01)
    assert estimate.distance_km == pytest.approx(straight * DETOUR_FACTOR)


def test_car_estimator_uses_minimum_duration_and_distance_cost():
    origin = place("a")
    same_location = place("b")
    estimate = estimate_leg(origin, same_location, "car")
    assert estimate.minutes == 5
    assert estimate.cost == 0


def test_transit_estimator_includes_wait_and_base_fare():
    origin = place("a")
    same_location = place("b")
    estimate = estimate_leg(origin, same_location, "transit")
    assert estimate.minutes == 10
    assert estimate.cost == 1400
