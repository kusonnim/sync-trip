import logging
from typing import Any

import httpx

from app.config import Settings
from app.models.optimize import Location
from app.optimizer.estimator import estimate_leg
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
ODSAY_TRANSIT_URL = "https://api.odsay.com/v1/api/searchPubTransPathT"
NO_ROUTE_CODES = {"3", "4", "5", "6", "-98", "-99"}


def _error_details(error: Any) -> tuple[str, str]:
    if isinstance(error, list) and error:
        error = error[0]
    if not isinstance(error, dict):
        return "", ""
    return str(error.get("code", "")), str(error.get("message") or error.get("msg") or "")


def _instruction(path: dict) -> str:
    subpaths = path.get("subPath", [])
    if not isinstance(subpaths, list):
        raise MalformedProviderResponse("ODsay")
    labels: list[str] = []
    for subpath in subpaths:
        if not isinstance(subpath, dict):
            raise MalformedProviderResponse("ODsay")
        traffic_type = subpath.get("trafficType")
        if traffic_type not in {1, 2}:
            continue
        lanes = subpath.get("lane", [])
        if isinstance(lanes, dict):
            lanes = [lanes]
        if not isinstance(lanes, list):
            raise MalformedProviderResponse("ODsay")
        for lane in lanes:
            if not isinstance(lane, dict):
                raise MalformedProviderResponse("ODsay")
            raw = lane.get("name") if traffic_type == 1 else lane.get("busNo")
            if raw is None:
                continue
            value = str(raw).strip()
            if not value:
                continue
            label = f"Subway {value}" if traffic_type == 1 else f"Bus {value}"
            if label not in labels:
                labels.append(label)
    return " → ".join(labels) if labels else "Public transit route"


def normalize_odsay_route(payload: Any, origin: Location, destination: Location) -> RoutedLeg:
    if not isinstance(payload, dict):
        raise MalformedProviderResponse("ODsay")
    if "error" in payload:
        code, message = _error_details(payload["error"])
        if code in NO_ROUTE_CODES:
            raise RoutingNoRoute("ODsay found no public-transit route.")
        if "auth" in message.casefold() or "api key" in message.casefold():
            raise ProviderAuthenticationError("ODsay")
        raise ProviderUnavailableError("ODsay")

    result = payload.get("result")
    if not isinstance(result, dict) or not isinstance(result.get("path"), list):
        raise MalformedProviderResponse("ODsay")
    paths = result["path"]
    if not paths:
        raise RoutingNoRoute("ODsay found no public-transit route.")

    def rank(item: tuple[int, Any]) -> tuple[int, int, int]:
        index, path = item
        if not isinstance(path, dict) or not isinstance(path.get("info"), dict):
            raise MalformedProviderResponse("ODsay")
        info = path["info"]
        try:
            return int(info["totalTime"]), int(info.get("payment", 0)), index
        except (KeyError, TypeError, ValueError) as exc:
            raise MalformedProviderResponse("ODsay") from exc

    _, selected = min(enumerate(paths), key=rank)
    info = selected["info"]
    try:
        duration = int(info["totalTime"])
        payment_value = info.get("payment")
        distance_value = info.get("totalDistance")
        distance_km = float(distance_value) / 1000 if distance_value is not None else None
    except (KeyError, TypeError, ValueError) as exc:
        raise MalformedProviderResponse("ODsay") from exc
    if duration <= 0 or (distance_km is not None and distance_km < 0):
        raise MalformedProviderResponse("ODsay")
    if payment_value is None:
        cost = estimate_leg(origin, destination, "transit").cost
        estimated_cost = True
    else:
        try:
            cost = int(payment_value)
        except (TypeError, ValueError) as exc:
            raise MalformedProviderResponse("ODsay") from exc
        if cost < 0:
            raise MalformedProviderResponse("ODsay")
        estimated_cost = False

    return RoutedLeg(
        duration_minutes=duration,
        cost=cost,
        distance_km=distance_km,
        instruction=_instruction(selected),
        provider="odsay",
        cost_is_estimated=estimated_cost,
    )


class ODsayService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client

    async def route(self, origin: Location, destination: Location) -> RoutedLeg:
        secret = self._settings.odsay_api_key
        if secret is None or not secret.get_secret_value():
            raise MissingProviderKey("ODsay")
        referer = self._settings.odsay_referer_origin
        if referer is None:
            raise MissingProviderKey("ODsay Referer")
        headers = {"Referer": referer}
        params = {
            "apiKey": secret.get_secret_value(),
            "lang": 1,
            "output": "json",
            "SX": origin.lng,
            "SY": origin.lat,
            "EX": destination.lng,
            "EY": destination.lat,
            "OPT": 0,
            "SearchType": 0,
            "SearchPathType": 0,
        }
        try:
            if self._client is not None:
                response = await self._client.get(ODSAY_TRANSIT_URL, params=params, headers=headers)
            else:
                async with httpx.AsyncClient(
                    timeout=self._settings.routing_timeout_seconds
                ) as client:
                    response = await client.get(ODSAY_TRANSIT_URL, params=params, headers=headers)
        except httpx.TimeoutException as exc:
            logger.warning("ODsay request timed out")
            raise ProviderTimeoutError("ODsay") from exc
        except httpx.RequestError as exc:
            logger.warning("ODsay request failed: %s", type(exc).__name__)
            raise ProviderUnavailableError("ODsay") from exc

        if response.status_code in {401, 403}:
            raise ProviderAuthenticationError("ODsay")
        if response.status_code == 429:
            raise ProviderRateLimitError("ODsay")
        try:
            payload = response.json()
        except ValueError as exc:
            raise MalformedProviderResponse("ODsay") from exc
        if response.status_code >= 400 and "error" not in payload:
            logger.warning("ODsay returned HTTP %s", response.status_code)
            raise ProviderUnavailableError("ODsay")
        return normalize_odsay_route(payload, origin, destination)
