from collections.abc import Callable

from app.optimizer.constraints import SimulatedDay


def time_rank(candidate: SimulatedDay) -> tuple[int, int, tuple[str, ...]]:
    return candidate.total_time, candidate.total_cost, candidate.order


def cost_rank(candidate: SimulatedDay) -> tuple[int, int, tuple[str, ...]]:
    return candidate.total_cost, candidate.total_time, candidate.order


def select_objective_days(
    per_day: list[list[SimulatedDay]],
    rank: Callable[[SimulatedDay], tuple[int, int, tuple[str, ...]]],
) -> list[SimulatedDay]:
    return [min(candidates, key=rank) for candidates in per_day]


def route_signature(days: list[SimulatedDay]) -> tuple[tuple[str, ...], ...]:
    return tuple(day.order for day in days)


def select_distinct_cost_days(
    per_day: list[list[SimulatedDay]],
    time_days: list[SimulatedDay],
) -> list[SimulatedDay]:
    cost_days = select_objective_days(per_day, cost_rank)
    time_signature = route_signature(time_days)
    if route_signature(cost_days) != time_signature:
        return cost_days

    alternatives: list[list[SimulatedDay]] = []
    for day_index, candidates in enumerate(per_day):
        for candidate in candidates:
            if candidate.order == cost_days[day_index].order:
                continue
            option = list(cost_days)
            option[day_index] = candidate
            if route_signature(option) != time_signature:
                alternatives.append(option)

    if not alternatives:
        return cost_days
    return min(
        alternatives,
        key=lambda days: (
            sum(day.total_cost for day in days),
            sum(day.total_time for day in days),
            route_signature(days),
        ),
    )
