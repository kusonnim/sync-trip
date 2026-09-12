from math import ceil

from app.models.optimize import Place
from app.optimizer.estimator import haversine_km


MAX_PLACES_PER_DAY = 6


class DayCapacityError(ValueError):
    pass


def split_places_by_day(
    places: list[Place],
    day_count: int,
    max_per_day: int = MAX_PLACES_PER_DAY,
) -> list[list[Place]]:
    if day_count < 1:
        raise ValueError("day_count must be positive")
    if len(places) > day_count * max_per_day:
        raise DayCapacityError(
            f"At most {max_per_day} places per day can be exhaustively optimized."
        )

    buckets: list[list[Place]] = [[] for _ in range(day_count)]
    if not places:
        return buckets

    ordered = sorted(places, key=lambda place: place.place_id)
    seed_count = min(day_count, len(ordered))
    seeds = [ordered[0]]
    while len(seeds) < seed_count:
        remaining = [place for place in ordered if place not in seeds]
        next_seed = min(
            remaining,
            key=lambda place: (
                -min(haversine_km(place, seed) for seed in seeds),
                place.place_id,
            ),
        )
        seeds.append(next_seed)

    for index, seed in enumerate(seeds):
        buckets[index].append(seed)

    balanced_capacity = ceil(len(ordered) / day_count)
    for place in (candidate for candidate in ordered if candidate not in seeds):
        available = [index for index in range(seed_count) if len(buckets[index]) < balanced_capacity]
        target = min(
            available,
            key=lambda index: (
                haversine_km(place, seeds[index]),
                len(buckets[index]),
                index,
            ),
        )
        buckets[target].append(place)

    return buckets
