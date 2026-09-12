import httpx
import pytest

from app.services.errors import MalformedProviderResponse, ProviderAuthenticationError
from app.services.kakao_local import KakaoLocalService, map_kakao_category, normalize_kakao_response


def test_successful_kakao_normalization_uses_numbers_and_prefixed_id():
    result = normalize_kakao_response(
        {
            "documents": [
                {
                    "id": "26338954",
                    "place_name": "Example Cafe",
                    "road_address_name": "513 Yeongdong-daero",
                    "address_name": "Seoul",
                    "x": "127.059",
                    "y": "37.512",
                    "category_group_code": "CE7",
                    "category_name": "음식점 > 카페",
                }
            ]
        }
    )
    assert result[0].model_dump() == {
        "place_id": "kakao_26338954",
        "name": "Example Cafe",
        "address": "513 Yeongdong-daero",
        "lat": 37.512,
        "lng": 127.059,
        "category": "cafe",
    }


@pytest.mark.parametrize(
    ("code", "name", "expected"),
    [
        ("FD6", "", "restaurant"),
        ("CE7", "", "cafe"),
        ("CT1", "", "museum"),
        ("MT1", "", "shopping"),
        ("", "문화,예술 > 미술관", "museum"),
        ("", "unknown", "attraction"),
    ],
)
def test_kakao_category_mapping(code, name, expected):
    assert map_kakao_category(code, name) == expected


def test_malformed_kakao_response():
    with pytest.raises(MalformedProviderResponse):
        normalize_kakao_response({"documents": [{"id": "1"}]})


@pytest.mark.anyio
async def test_kakao_authentication_failure(settings):
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "unauthorized"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        service = KakaoLocalService(settings, client)
        with pytest.raises(ProviderAuthenticationError):
            await service.search("test")
