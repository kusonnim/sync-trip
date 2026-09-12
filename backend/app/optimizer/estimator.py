from dataclasses import dataclass
from math import asin, ceil, cos, floor, radians, sin, sqrt
from typing import Literal, Protocol


EARTH_RADIUS_KM = 6371.0
DETOUR_FACTOR = 1.3
CAR_SPEED_KMH = 40.0
TRANSIT_SPEED_KMH = 22.0
CAR_WAIT_MINUTES = 0
TRANSIT_WAIT_MINUTES = 8
MIN_CAR_MINUTES = 5
MIN_TRANSIT_MINUTES = 10
# One fare: a base that covers the first stretch, then a surcharge per whole step
# beyond it. The base distance is the threshold; the step is how far each 100 won buys.
TRANSIT_BASE_FARE_KRW = 1400
TRANSIT_BASE_DISTANCE_KM = 10.0
TRANSIT_STEP_DISTANCE_KM = 5.0
TRANSIT_STEP_FARE_KRW = 100


class Coordinate(Protocol):
    lat: float
    lng: float


@dataclass(frozen=True)
class TravelEstimate:
    distance_km: float
    minutes: int
    cost: int


def _round_positive(value: float) -> int:
    """Match JavaScript Math.round for the non-negative estimates used here."""
    return floor(value + 0.5)


def haversine_km(origin: Coordinate, destination: Coordinate) -> float:
    delta_lat = radians(destination.lat - origin.lat)
    delta_lng = radians(destination.lng - origin.lng)
    origin_lat = radians(origin.lat)
    destination_lat = radians(destination.lat)
    value = (
        sin(delta_lat / 2) ** 2
        + cos(origin_lat) * cos(destination_lat) * sin(delta_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * asin(sqrt(value))


def estimate_leg(
    origin: Coordinate,
    destination: Coordinate,
    mode: Literal["car", "transit"],
) -> TravelEstimate:
    road_km = haversine_km(origin, destination) * DETOUR_FACTOR
    if mode == "car":
        travel_minutes = _round_positive(road_km / CAR_SPEED_KMH * 60)
        minutes = max(MIN_CAR_MINUTES, travel_minutes + CAR_WAIT_MINUTES)
        # Driving cost is the toll alone, which only a routing provider knows.
        # Fuel and wear are the group's own car, not a fare the trip pays per leg.
        cost = 0
    elif mode == "transit":
        travel_minutes = _round_positive(road_km / TRANSIT_SPEED_KMH * 60)
        minutes = max(MIN_TRANSIT_MINUTES, travel_minutes + TRANSIT_WAIT_MINUTES)
        billable_km = max(0.0, road_km - TRANSIT_BASE_DISTANCE_KM)
        steps = ceil(billable_km / TRANSIT_STEP_DISTANCE_KM)
        cost = TRANSIT_BASE_FARE_KRW + steps * TRANSIT_STEP_FARE_KRW
    else:
        raise ValueError(f"Unsupported transport mode: {mode}")
    return TravelEstimate(distance_km=road_km, minutes=minutes, cost=cost)
