import logging
from functools import lru_cache
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.models.place import Category, SearchPlace

from .errors import (
    MalformedProviderResponse,
    MissingProviderKey,
    ProviderAuthenticationError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)


logger = logging.getLogger(__name__)
KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

_CATEGORY_CODES: dict[str, Category] = {
    "FD6": "restaurant",
    "CE7": "cafe",
    "AT4": "attraction",
    "CT1": "museum",
    "MT1": "shopping",
    "CS2": "shopping",
}

_CATEGORY_TERMS: tuple[tuple[tuple[str, ...], Category], ...] = (
    (("음식점", "restaurant"), "restaurant"),
    (("카페", "coffee", "cafe"), "cafe"),
    (("박물관", "미술관", "전시", "공연", "museum", "gallery"), "museum"),
    (("쇼핑", "시장", "백화점", "마트", "shopping", "market"), "shopping"),
)


def map_kakao_category(code: str, name: str) -> Category:
    if code in _CATEGORY_CODES:
        return _CATEGORY_CODES[code]
    normalized = name.casefold()
    for terms, category in _CATEGORY_TERMS:
        if any(term in normalized for term in terms):
            return category
    return "attraction"


def normalize_kakao_response(payload: Any) -> list[SearchPlace]:
    if not isinstance(payload, dict) or not isinstance(payload.get("documents"), list):
        raise MalformedProviderResponse("Kakao Local")

    places: list[SearchPlace] = []
    for document in payload["documents"]:
        if not isinstance(document, dict):
            raise MalformedProviderResponse("Kakao Local")
        try:
            provider_id = str(document["id"]).strip()
            name = str(document["place_name"]).strip()
            lat = float(document["y"])
            lng = float(document["x"])
        except (KeyError, TypeError, ValueError) as exc:
            raise MalformedProviderResponse("Kakao Local") from exc
        if not provider_id or not name:
            raise MalformedProviderResponse("Kakao Local")

        places.append(
            SearchPlace(
                place_id=f"kakao_{provider_id}",
                name=name,
                address=str(document.get("road_address_name") or document.get("address_name") or ""),
                lat=lat,
                lng=lng,
                category=map_kakao_category(
                    str(document.get("category_group_code") or ""),
                    str(document.get("category_name") or ""),
                ),
            )
        )
    return places


class KakaoLocalService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client

    async def search(self, keyword: str) -> list[SearchPlace]:
        secret = self._settings.kakao_rest_api_key
        if secret is None or not secret.get_secret_value():
            raise MissingProviderKey("Kakao Local")

        headers = {"Authorization": f"KakaoAK {secret.get_secret_value()}"}
        params = {"query": keyword, "size": 15}
        try:
            if self._client is not None:
                response = await self._client.get(KAKAO_KEYWORD_URL, headers=headers, params=params)
            else:
                async with httpx.AsyncClient(timeout=self._settings.provider_timeout_seconds) as client:
                    response = await client.get(KAKAO_KEYWORD_URL, headers=headers, params=params)
        except httpx.TimeoutException as exc:
            logger.warning("Kakao Local request timed out")
            raise ProviderTimeoutError("Kakao Local") from exc
        except httpx.RequestError as exc:
            logger.warning("Kakao Local request failed: %s", type(exc).__name__)
            raise ProviderUnavailableError("Kakao Local") from exc

        if response.status_code in {401, 403}:
            raise ProviderAuthenticationError("Kakao Local")
        if response.status_code == 429:
            raise ProviderRateLimitError("Kakao Local")
        if response.status_code >= 400:
            logger.warning("Kakao Local returned HTTP %s", response.status_code)
            raise ProviderUnavailableError("Kakao Local")
        try:
            payload = response.json()
        except ValueError as exc:
            raise MalformedProviderResponse("Kakao Local") from exc
        return normalize_kakao_response(payload)


@lru_cache
def get_kakao_local_service() -> KakaoLocalService:
    return KakaoLocalService(get_settings())
