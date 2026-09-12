import pytest

from app.optimizer.estimator import (
    DETOUR_FACTOR,
    TRANSIT_BASE_FARE_KRW,
    TRANSIT_STEP_FARE_KRW,
    estimate_leg,
    haversine_km,
)
from tests.optimizer_helpers import place


def test_haversine_and_detour_distance_are_geographic():
    origin = place("a", lat=37.0, lng=127.0)
    destination = place("b", lat=38.0, lng=127.0)
    straight = haversine_km(origin, destination)
    estimate = estimate_leg(origin, destination, "car")
    assert straight == pytest.approx(111.2, rel=0.01)
    assert estimate.distance_km == pytest.approx(straight * DETOUR_FACTOR)


def test_car_estimator_uses_minimum_duration_and_charges_no_fare():
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


def test_transit_fare_within_the_base_distance_is_the_base_fare():
    origin = place("a", lat=37.0, lng=127.0)
    # Roughly 7.7 km of road once the detour factor is applied.
    near = place("b", lat=37.0533, lng=127.0)
    estimate = estimate_leg(origin, near, "transit")
    assert estimate.distance_km < 10
    assert estimate.cost == TRANSIT_BASE_FARE_KRW


def test_transit_fare_adds_one_surcharge_per_whole_step_beyond_the_base():
    origin = place("a", lat=37.0, lng=127.0)
    destination = place("b", lat=38.0, lng=127.0)
    estimate = estimate_leg(origin, destination, "transit")
    # About 144.6 km of road: 134.6 km past the base, which is 27 five-kilometre steps.
    assert estimate.distance_km == pytest.approx(144.6, rel=0.01)
    assert estimate.cost == TRANSIT_BASE_FARE_KRW + 27 * TRANSIT_STEP_FARE_KRW
