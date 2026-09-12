from typing import Literal

from fastapi import Request

from app.config import Settings
from app.models.optimize import Location
from app.routing.cache import RoutingCache, RoutingCacheKey
from app.routing.kakao_mobility import KakaoMobilityService
from app.routing.models import RoutedLeg
from app.routing.odsay import ODsayService


class RoutingService:
    def __init__(
        self,
        settings: Settings,
        kakao: KakaoMobilityService | None = None,
        odsay: ODsayService | None = None,
        cache: RoutingCache | None = None,
    ) -> None:
        self.candidates_per_objective = settings.track2_candidates_per_objective
        self._kakao = kakao or KakaoMobilityService(settings)
        self._odsay = odsay or ODsayService(settings)
        self._cache = cache or RoutingCache(
            settings.routing_cache_ttl_seconds,
            settings.routing_cache_max_entries,
        )

    async def route(
        self,
        origin: Location,
        destination: Location,
        mode: Literal["car", "transit"],
    ) -> RoutedLeg:
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
