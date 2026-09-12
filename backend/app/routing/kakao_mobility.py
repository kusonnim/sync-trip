import logging
from math import ceil, floor
from typing import Any

import httpx

from app.config import Settings
from app.models.optimize import Location
from app.routing.models import RoutedLeg, RoutingNoRoute
from app.services.errors import (
    MalformedProviderResponse,
    MissingProviderKey,
    ProviderAuthenticationError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)


logger = logging.getLogger(__name__)
KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions"


def _round_positive(value: float) -> int:
    return floor(value + 0.5)


def normalize_kakao_route(
    payload: Any,
    destination_name: str,
    car_cost_per_km_krw: int,
) -> RoutedLeg:
    if not isinstance(payload, dict) or not isinstance(payload.get("routes"), list):
        raise MalformedProviderResponse("Kakao Mobility")
    routes = payload["routes"]
    if not routes:
        raise RoutingNoRoute("Kakao Mobility found no driving route.")
    route = routes[0]
    if not isinstance(route, dict):
        raise MalformedProviderResponse("Kakao Mobility")
    result_code = route.get("result_code")
    if not isinstance(result_code, int):
        raise MalformedProviderResponse("Kakao Mobility")
    if result_code != 0:
        raise RoutingNoRoute("Kakao Mobility found no driving route.")
    summary = route.get("summary")
    if not isinstance(summary, dict):
        raise MalformedProviderResponse("Kakao Mobility")
    fare = summary.get("fare", {})
    if not isinstance(fare, dict):
        raise MalformedProviderResponse("Kakao Mobility")
    try:
        duration_seconds = int(summary["duration"])
        distance_meters = int(summary["distance"])
        toll = int(fare.get("toll", 0))
    except (KeyError, TypeError, ValueError) as exc:
        raise MalformedProviderResponse("Kakao Mobility") from exc
    if duration_seconds < 0 or distance_meters < 0 or toll < 0:
        raise MalformedProviderResponse("Kakao Mobility")

    distance_km = distance_meters / 1000
    operating_cost = _round_positive(distance_km * car_cost_per_km_krw)
    return RoutedLeg(
        duration_minutes=max(1, ceil(duration_seconds / 60)),
        cost=operating_cost + toll,
        distance_km=distance_km,
        instruction=f"Drive to {destination_name}",
        provider="kakao_mobility",
    )


class KakaoMobilityService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client

    async def route(self, origin: Location, destination: Location) -> RoutedLeg:
        secret = self._settings.kakao_rest_api_key
        if secret is None or not secret.get_secret_value():
            raise MissingProviderKey("Kakao Mobility")
        headers = {
            "Authorization": f"KakaoAK {secret.get_secret_value()}",
            "Content-Type": "application/json",
        }
        params = {
            "origin": f"{origin.lng},{origin.lat}",
            "destination": f"{destination.lng},{destination.lat}",
            "priority": "RECOMMEND",
            "summary": "true",
        }
        try:
            if self._client is not None:
                response = await self._client.get(
                    KAKAO_DIRECTIONS_URL,
                    headers=headers,
                    params=params,
                )
            else:
                async with httpx.AsyncClient(
                    timeout=self._settings.routing_timeout_seconds
                ) as client:
                    response = await client.get(
                        KAKAO_DIRECTIONS_URL,
                        headers=headers,
                        params=params,
                    )
        except httpx.TimeoutException as exc:
            logger.warning("Kakao Mobility request timed out")
            raise ProviderTimeoutError("Kakao Mobility") from exc
        except httpx.RequestError as exc:
            logger.warning("Kakao Mobility request failed: %s", type(exc).__name__)
            raise ProviderUnavailableError("Kakao Mobility") from exc

        if response.status_code in {401, 403}:
            raise ProviderAuthenticationError("Kakao Mobility")
        if response.status_code == 429:
            raise ProviderRateLimitError("Kakao Mobility")
        if response.status_code >= 400:
            logger.warning("Kakao Mobility returned HTTP %s", response.status_code)
            raise ProviderUnavailableError("Kakao Mobility")
        try:
            payload = response.json()
        except ValueError as exc:
            raise MalformedProviderResponse("Kakao Mobility") from exc
        return normalize_kakao_route(
            payload,
            destination.name,
            self._settings.car_cost_per_km_krw,
        )
