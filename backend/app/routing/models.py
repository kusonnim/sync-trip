from dataclasses import dataclass


@dataclass(frozen=True)
class RoutedLeg:
    duration_minutes: int
    cost: int
    distance_km: float | None
    instruction: str
    provider: str
    cost_is_estimated: bool = False


class RoutingNoRoute(Exception):
    """The provider responded normally but found no usable route."""
