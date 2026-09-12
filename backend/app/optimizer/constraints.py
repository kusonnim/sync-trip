from dataclasses import dataclass

from app.models.optimize import Location, Place, TripSettings, time_to_minutes
from app.optimizer.estimator import estimate_leg


LUNCH_WINDOW = (time_to_minutes("11:30"), time_to_minutes("13:30"))
DINNER_WINDOW = (time_to_minutes("17:30"), time_to_minutes("19:30"))
MEAL_WINDOWS = (LUNCH_WINDOW, DINNER_WINDOW)


@dataclass(frozen=True)
class SimulatedDay:
    order: tuple[str, ...]
    timeline: list[dict]
    total_time: int
    total_cost: int
    has_estimated_cost: bool = False


def format_minutes(value: int) -> str:
    return f"{value // 60:02d}:{value % 60:02d}"


def resolve_visit_start(place: Place, arrival: int) -> int | None:
    opening = time_to_minutes(place.open_time)
    closing = time_to_minutes(place.close_time)
    reservation_start = (
        time_to_minutes(place.hard_constraint.start) if place.hard_constraint else 0
    )
    reservation_end = (
        time_to_minutes(place.hard_constraint.end) if place.hard_constraint else closing
    )
    earliest = max(arrival, opening, reservation_start)
    latest = min(closing - place.stay_time_min, reservation_end)

    if place.category != "restaurant":
        return earliest if earliest <= latest else None

    for meal_start, meal_end in MEAL_WINDOWS:
        candidate = max(earliest, meal_start)
        if candidate <= meal_end and candidate <= latest:
            return candidate
    return None


def simulate_day(
    order: tuple[Place, ...],
    settings: TripSettings,
    anchors: tuple[Location, Location] | None = None,
) -> SimulatedDay | None:
    """Walk one day in order. `anchors` is where that day begins and ends, which
    is the accommodation on every day but the first and the last."""
    origin, terminus = anchors if anchors else (settings.start_location, settings.end_location)
    mode = settings.transport_mode
    cursor = time_to_minutes(settings.start_time)
    deadline = time_to_minutes(settings.end_deadline)
    previous = origin
    total_time = 0
    total_cost = 0
    timeline: list[dict] = [
        {
            "type": "place",
            "name": origin.name,
            "time": format_minutes(cursor),
        }
    ]

    for place in order:
        travel = estimate_leg(previous, place, mode)
        arrival = cursor + travel.minutes
        start = resolve_visit_start(place, arrival)
        if start is None:
            return None
        departure = start + place.stay_time_min
        instruction = "Estimated transit leg" if mode == "transit" else "Estimated driving leg"
        timeline.extend(
            [
                {
                    "type": "transit",
                    "mode": mode,
                    "instruction": instruction,
                    "time": f"{format_minutes(cursor)} ~ {format_minutes(arrival)}",
                    "duration": travel.minutes,
                    "cost": travel.cost,
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
        total_time += travel.minutes
        total_cost += travel.cost

    final_travel = estimate_leg(previous, terminus, mode)
    finish = cursor + final_travel.minutes
    if finish > deadline:
        return None
    instruction = "Estimated transit leg" if mode == "transit" else "Estimated driving leg"
    timeline.extend(
        [
            {
                "type": "transit",
                "mode": mode,
                "instruction": instruction,
                "time": f"{format_minutes(cursor)} ~ {format_minutes(finish)}",
                "duration": final_travel.minutes,
                "cost": final_travel.cost,
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
        total_time=total_time + final_travel.minutes,
        total_cost=total_cost + final_travel.cost,
    )
