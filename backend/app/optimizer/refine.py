from app.models.optimize import (
    Location,
    OptimizeErrorResponse,
    OptimizeRequest,
    OptimizeResponse,
    OptimizeSuccessResponse,
    Place,
    RouteWarning,
    time_to_minutes,
)
from app.optimizer.constraints import (
    SimulatedDay,
    format_minutes,
    resolve_visit_start,
)
from app.optimizer.engine import (
    Track1Search,
    build_route_option,
    build_track1_response,
    run_track1_search,
)
from app.optimizer.scoring import (
    cost_rank,
    select_distinct_cost_days,
    select_objective_days,
    time_rank,
)
from app.routing.models import RoutingNoRoute
from app.routing.router import RoutingService
from app.services.errors import (
    MalformedProviderResponse,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)


TRANSIENT_ROUTING_ERRORS = (
    MalformedProviderResponse,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)


async def refine_day(
    order: tuple[Place, ...],
    request: OptimizeRequest,
    routing: RoutingService,
    anchors: tuple[Location, Location] | None = None,
) -> SimulatedDay | None:
    settings = request.settings
    origin, terminus = anchors if anchors else (settings.start_location, settings.end_location)
    cursor = time_to_minutes(settings.start_time)
    deadline = time_to_minutes(settings.end_deadline)
    previous = origin
    total_time = 0
    total_cost = 0
    has_estimated_cost = False
    timeline: list[dict] = [
        {
            "type": "place",
            "name": origin.name,
            "time": format_minutes(cursor),
        }
    ]

    for place in order:
        leg = await routing.route(previous, place, settings.transport_mode)
        arrival = cursor + leg.duration_minutes
        start = resolve_visit_start(place, arrival)
        if start is None:
            return None
        departure = start + place.stay_time_min
        timeline.extend(
            [
                {
                    "type": "transit",
                    "mode": settings.transport_mode,
                    "instruction": leg.instruction,
                    "time": f"{format_minutes(cursor)} ~ {format_minutes(arrival)}",
                    "duration": leg.duration_minutes,
                    "cost": leg.cost,
                },
                {
                    "type": "place",
                    "place_id": place.place_id,
                    "name": place.name,
                    "category": place.category,
                    "time": f"{format_minutes(start)} ~ {format_minutes(departure)}",
                    "stay_duration": place.stay_time_min,
                    "wait_duration": start - arrival,
                    "hard_constraint": (
                        place.hard_constraint.model_dump() if place.hard_constraint else None
                    ),
                },
            ]
        )
        cursor = departure
        previous = place
        total_time += leg.duration_minutes
        total_cost += leg.cost
        has_estimated_cost = has_estimated_cost or leg.cost_is_estimated

    final_leg = await routing.route(previous, terminus, settings.transport_mode)
    finish = cursor + final_leg.duration_minutes
    if finish > deadline:
        return None
    timeline.extend(
        [
            {
                "type": "transit",
                "mode": settings.transport_mode,
                "instruction": final_leg.instruction,
                "time": f"{format_minutes(cursor)} ~ {format_minutes(finish)}",
                "duration": final_leg.duration_minutes,
                "cost": final_leg.cost,
            },
            {
                "type": "place",
                "name": terminus.name,
                "time": format_minutes(finish),
            },
        ]
    )
    return SimulatedDay(
        order=tuple(place.place_id for place in order),
        timeline=timeline,
        total_time=total_time + final_leg.duration_minutes,
        total_cost=total_cost + final_leg.cost,
        has_estimated_cost=has_estimated_cost or final_leg.cost_is_estimated,
    )


def _fallback(search: Track1Search) -> OptimizeSuccessResponse:
    response = build_track1_response(search)
    warning = RouteWarning(
        code="ROUTING_FALLBACK",
        message="Live routing was unavailable. Travel times are estimated.",
    )
    for route in response.routes:
        route.routing_source = "estimated"
        route.warning = warning
    return response


async def optimize_trip_precise(
    request: OptimizeRequest,
    routing: RoutingService,
) -> OptimizeResponse:
    search = run_track1_search(request)
    if isinstance(search, OptimizeErrorResponse):
        return search

    try:
        precise_per_day: list[list[SimulatedDay]] = []
        limit = routing.candidates_per_objective
        for bucket, candidates, day_anchors in zip(
            search.buckets, search.per_day, search.anchors, strict=True
        ):
            time_candidates = sorted(candidates, key=time_rank)[:limit]
            cost_candidates = sorted(candidates, key=cost_rank)[:limit]
            selected = []
            seen_orders = set()
            for candidate in [*time_candidates, *cost_candidates]:
                if candidate.order not in seen_orders:
                    selected.append(candidate)
                    seen_orders.add(candidate.order)
            places_by_id = {place.place_id: place for place in bucket}
            refined: list[SimulatedDay] = []
            for candidate in selected:
                order = tuple(places_by_id[place_id] for place_id in candidate.order)
                try:
                    result = await refine_day(order, request, routing, day_anchors)
                except RoutingNoRoute:
                    continue
                if result is not None:
                    refined.append(result)
            if not refined:
                return OptimizeErrorResponse(
                    code="PRECISE_ROUTE_INFEASIBLE",
                    message="No precisely routed itinerary satisfies all current constraints.",
                )
            precise_per_day.append(refined)
    except TRANSIENT_ROUTING_ERRORS:
        return _fallback(search)

    time_days = select_objective_days(precise_per_day, time_rank)
    cost_days = select_distinct_cost_days(precise_per_day, time_days)

    def fare_warning(days: list[SimulatedDay]) -> RouteWarning | None:
        if not any(day.has_estimated_cost for day in days):
            return None
        return RouteWarning(
            code="ESTIMATED_TRANSIT_FARE",
            message="The routing provider omitted a fare for at least one leg; that fare is estimated.",
        )

    return OptimizeSuccessResponse(
        routes=[
            build_route_option(
                "min_time",
                "Fastest Route",
                search.dates,
                time_days,
                routing_source="provider",
                warning=fare_warning(time_days),
            ),
            build_route_option(
                "min_cost",
                "Lowest-Cost Route",
                search.dates,
                cost_days,
                routing_source="provider",
                warning=fare_warning(cost_days),
            ),
        ]
    )
