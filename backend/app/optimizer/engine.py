from dataclasses import dataclass
from datetime import date, timedelta
from itertools import permutations
from typing import Literal

from app.models.optimize import (
    Location,
    OptimizeErrorResponse,
    OptimizeRequest,
    OptimizeResponse,
    OptimizeSuccessResponse,
    OptimizedDay,
    Place,
    RouteOption,
    RouteWarning,
)
from app.optimizer.conflict import find_reservation_conflict
from app.optimizer.constraints import SimulatedDay, simulate_day
from app.optimizer.day_splitter import DayCapacityError, split_places_by_day
from app.optimizer.scoring import (
    select_distinct_cost_days,
    select_objective_days,
    time_rank,
)


def _dates(request: OptimizeRequest) -> list[date]:
    settings = request.settings
    count = (settings.end_date - settings.start_date).days + 1
    return [settings.start_date + timedelta(days=offset) for offset in range(count)]


@dataclass(frozen=True)
class Track1Search:
    dates: list[date]
    buckets: list[list[Place]]
    per_day: list[list[SimulatedDay]]
    # Where each day begins and ends, so a middle day runs between accommodations.
    anchors: list[tuple[Location, Location]]
    time_bounds: list[tuple[int, int]]


def build_route_option(
    route_type: Literal["min_time", "min_cost"],
    label: str,
    dates: list[date],
    candidates: list[SimulatedDay],
    routing_source: Literal["provider", "estimated"] | None = None,
    warning: RouteWarning | None = None,
) -> RouteOption:
    days = [
        OptimizedDay(
            date=date,
            total_time=candidate.total_time,
            total_cost=candidate.total_cost,
            timeline=candidate.timeline,
        )
        for date, candidate in zip(dates, candidates, strict=True)
    ]
    return RouteOption(
        type=route_type,
        label=label,
        total_time=sum(day.total_time for day in days),
        total_cost=sum(day.total_cost for day in days),
        days=days,
        routing_source=routing_source,
        warning=warning,
    )


def run_track1_search(request: OptimizeRequest) -> Track1Search | OptimizeErrorResponse:
    dates = _dates(request)
    try:
        buckets = split_places_by_day(request.places, len(dates))
    except DayCapacityError as exc:
        return OptimizeErrorResponse(
            code="TOO_MANY_PLACES",
            message=str(exc),
        )

    for bucket in buckets:
        conflict = find_reservation_conflict(bucket, request.settings.transport_mode)
        if conflict:
            return OptimizeErrorResponse(
                code="TIME_CONFLICT",
                message=conflict.message,
                place_ids=list(conflict.place_ids),
            )

    anchors = request.settings.day_anchors()
    time_bounds = request.settings.day_time_bounds()
    per_day: list[list[SimulatedDay]] = []
    for bucket, day_anchors, bounds in zip(buckets, anchors, time_bounds, strict=True):
        ordered_places = sorted(bucket, key=lambda place: place.place_id)
        candidates = [
            result
            for order in permutations(ordered_places)
            if (result := simulate_day(order, request.settings, day_anchors, bounds)) is not None
        ]
        if not candidates:
            return OptimizeErrorResponse(
                code="NO_ROUTE",
                message="No feasible itinerary satisfies all current constraints.",
            )
        per_day.append(candidates)

    return Track1Search(
        dates=dates,
        buckets=buckets,
        per_day=per_day,
        anchors=anchors,
        time_bounds=time_bounds,
    )


def build_track1_response(search: Track1Search) -> OptimizeSuccessResponse:
    time_days = select_objective_days(search.per_day, time_rank)
    cost_days = select_distinct_cost_days(search.per_day, time_days)
    return OptimizeSuccessResponse(
        routes=[
            build_route_option("min_time", "Fastest Route", search.dates, time_days),
            build_route_option("min_cost", "Lowest-Cost Route", search.dates, cost_days),
        ]
    )


def optimize_trip(request: OptimizeRequest) -> OptimizeResponse:
    search = run_track1_search(request)
    if isinstance(search, OptimizeErrorResponse):
        return search
    return build_track1_response(search)
