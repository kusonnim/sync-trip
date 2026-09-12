from datetime import date, timedelta
from itertools import permutations
from typing import Literal

from app.models.optimize import (
    OptimizeErrorResponse,
    OptimizeRequest,
    OptimizeResponse,
    OptimizeSuccessResponse,
    OptimizedDay,
    RouteOption,
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


def _route_option(
    route_type: Literal["min_time", "min_cost"],
    label: str,
    dates: list[date],
    candidates: list[SimulatedDay],
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
    )


def optimize_trip(request: OptimizeRequest) -> OptimizeResponse:
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

    per_day: list[list[SimulatedDay]] = []
    for bucket in buckets:
        ordered_places = sorted(bucket, key=lambda place: place.place_id)
        candidates = [
            result
            for order in permutations(ordered_places)
            if (result := simulate_day(order, request.settings)) is not None
        ]
        if not candidates:
            return OptimizeErrorResponse(
                code="NO_ROUTE",
                message="No feasible itinerary satisfies all current constraints.",
            )
        per_day.append(candidates)

    time_days = select_objective_days(per_day, time_rank)
    cost_days = select_distinct_cost_days(per_day, time_days)
    return OptimizeSuccessResponse(
        routes=[
            _route_option("min_time", "Fastest Route", dates, time_days),
            _route_option("min_cost", "Lowest-Cost Route", dates, cost_days),
        ]
    )
