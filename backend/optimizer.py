"""Proxy module providing direct optimizer module access.

Allows `import optimizer` or `from optimizer import ...` to work directly.
"""
from app.models.optimize import (
    Category,
    HardConstraint,
    Location,
    OptimizeErrorResponse,
    OptimizeRequest,
    OptimizeResponse,
    OptimizeSuccessResponse,
    OptimizedDay,
    Place,
    PlaceTimelineEntry,
    RouteOption,
    RouteWarning,
    TimelineEntry,
    TransitTimelineEntry,
    TripSettings,
    time_to_minutes,
)
from app.optimizer.conflict import ReservationConflict, find_reservation_conflict
from app.optimizer.constraints import SimulatedDay, format_minutes, resolve_visit_start, simulate_day
from app.optimizer.day_splitter import DayCapacityError, split_places_by_day
from app.optimizer.engine import (
    Track1Search,
    build_route_option,
    build_track1_response,
    optimize_trip,
    run_track1_search,
)
from app.optimizer.estimator import TravelEstimate, estimate_leg, haversine_km
from app.optimizer.refine import optimize_trip_precise, refine_day
from app.optimizer.scoring import (
    cost_rank,
    route_signature,
    select_distinct_cost_days,
    select_objective_days,
    time_rank,
)

__all__ = [
    "Category",
    "DayCapacityError",
    "HardConstraint",
    "Location",
    "OptimizeErrorResponse",
    "OptimizeRequest",
    "OptimizeResponse",
    "OptimizeSuccessResponse",
    "OptimizedDay",
    "Place",
    "PlaceTimelineEntry",
    "ReservationConflict",
    "RouteOption",
    "RouteWarning",
    "SimulatedDay",
    "TimelineEntry",
    "Track1Search",
    "TransitTimelineEntry",
    "TravelEstimate",
    "TripSettings",
    "build_route_option",
    "build_track1_response",
    "cost_rank",
    "estimate_leg",
    "find_reservation_conflict",
    "format_minutes",
    "haversine_km",
    "optimize_trip",
    "optimize_trip_precise",
    "refine_day",
    "resolve_visit_start",
    "route_signature",
    "run_track1_search",
    "select_distinct_cost_days",
    "select_objective_days",
    "simulate_day",
    "split_places_by_day",
    "time_rank",
    "time_to_minutes",
]
