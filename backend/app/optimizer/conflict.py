from dataclasses import dataclass
from itertools import combinations
from typing import Literal

from app.models.optimize import Place, time_to_minutes
from app.optimizer.estimator import estimate_leg


@dataclass(frozen=True)
class ReservationConflict:
    place_ids: tuple[str, str]
    message: str


def find_reservation_conflict(
    places: list[Place],
    mode: Literal["car", "transit"],
) -> ReservationConflict | None:
    reserved = [place for place in places if place.hard_constraint is not None]
    for first, second in combinations(reserved, 2):
        assert first.hard_constraint is not None
        assert second.hard_constraint is not None
        earlier, later = sorted(
            (first, second),
            key=lambda place: (
                time_to_minutes(place.hard_constraint.start),
                place.place_id,
            ),
        )
        assert earlier.hard_constraint is not None
        assert later.hard_constraint is not None
        earlier_start = time_to_minutes(earlier.hard_constraint.start)
        later_end = time_to_minutes(later.hard_constraint.end)
        travel = estimate_leg(earlier, later, mode).minutes
        required = earlier.stay_time_min + travel
        if earlier_start + required > later_end:
            return ReservationConflict(
                place_ids=(earlier.place_id, later.place_id),
                message=(
                    f"The reservation at {earlier.name} conflicts with the reservation at "
                    f"{later.name}. The earlier stay and travel require {required} minutes. "
                    "Adjust the time for one of these places."
                ),
            )
    return None
