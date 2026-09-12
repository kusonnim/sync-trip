from typing import Literal

from fastapi import Request

from app.config import Settings
from app.models.optimize import Location
from app.optimizer.estimator import haversine_km
from app.routing.cache import RoutingCache, RoutingCacheKey
from app.routing.kakao_mobility import KakaoMobilityService
from app.routing.models import RoutedLeg
from app.routing.odsay import ODsayService


# Ten meters absorbs minor geocoder/provider jitter while keeping nearby distinct stops separate.
SAME_LOCATION_TOLERANCE_METERS = 10.0


class RoutingService:
    def __init__(
        self,
        settings: Settings,
        kakao: KakaoMobilityService | None = None,
        odsay: ODsayService | None = None,
        cache: RoutingCache | None = None,
        same_location_tolerance_meters: float = SAME_LOCATION_TOLERANCE_METERS,
    ) -> None:
        if same_location_tolerance_meters < 0:
            raise ValueError("same-location tolerance cannot be negative")
        self.candidates_per_objective = settings.track2_candidates_per_objective
        self._kakao = kakao or KakaoMobilityService(settings)
        self._odsay = odsay or ODsayService(settings)
        self._cache = cache or RoutingCache(
            settings.routing_cache_ttl_seconds,
            settings.routing_cache_max_entries,
        )
        self._same_location_tolerance_meters = same_location_tolerance_meters

    async def route(
        self,
        origin: Location,
        destination: Location,
        mode: Literal["car", "transit"],
    ) -> RoutedLeg:
        if haversine_km(origin, destination) * 1000 <= self._same_location_tolerance_meters:
            return RoutedLeg(
                duration_minutes=0,
                cost=0,
                distance_km=0.0,
                instruction="Already at destination",
                provider="local",
            )
        key = RoutingCacheKey.from_leg(origin, destination, mode)
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        result = (
            await self._kakao.route(origin, destination)
            if mode == "car"
            else await self._odsay.route(origin, destination)
        )
        self._cache.set(key, result)
        return result


def build_routing_service(settings: Settings) -> RoutingService:
    return RoutingService(settings)


def get_routing_service(request: Request) -> RoutingService:
    return request.app.state.routing_service
