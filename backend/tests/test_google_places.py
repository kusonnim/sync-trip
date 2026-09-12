import httpx
import pytest

from app.services.errors import MalformedProviderResponse
from app.services.google_places import GooglePlacesService, normalize_cache_key, normalize_google_hours


def point(day: int, hour: int, minute: int = 0) -> dict:
    return {"day": day, "hour": hour, "minute": minute}


def test_google_hours_use_most_common_daily_span_and_merge_split_periods():
    result = normalize_google_hours(
        {
            "places": [
                {
                    "regularOpeningHours": {
                        "periods": [
                            {"open": point(1, 9), "close": point(1, 12)},
                            {"open": point(1, 13), "close": point(1, 18)},
                            {"open": point(2, 9), "close": point(2, 18)},
                            {"open": point(3, 10), "close": point(3, 17)},
                        ]
                    }
                }
            ]
        }
    )
    assert result is not None
    assert result.model_dump() == {"open_time": "09:00", "close_time": "18:00"}


def test_google_24_hour_normalization():
    result = normalize_google_hours(
        {
            "places": [
                {"regularOpeningHours": {"periods": [{"open": point(0, 0)}]}}
            ]
        }
    )
    assert result is not None
    assert result.model_dump() == {"open_time": "00:00", "close_time": "23:59"}


def test_missing_google_hours():
    assert normalize_google_hours({"places": [{"id": "place-id"}]}) is None
    assert normalize_google_hours({"places": []}) is None


def test_overnight_only_hours_are_unavailable():
    result = normalize_google_hours(
        {
            "places": [
                {
                    "regularOpeningHours": {
                        "periods": [
                            {"open": point(5, 22), "close": point(6, 2)}
                        ]
                    }
                }
            ]
        }
    )
    assert result is None


def test_malformed_google_response():
    with pytest.raises(MalformedProviderResponse):
        normalize_google_hours({"places": [{"regularOpeningHours": {"periods": "bad"}}]})


def test_cache_key_is_stable():
    assert normalize_cache_key("  SEOUL   Forest ") == normalize_cache_key("seoul forest")


@pytest.mark.anyio
async def test_google_results_are_cached_by_normalized_name(settings):
    calls = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            json={
                "places": [
                    {
                        "regularOpeningHours": {
                            "periods": [
                                {"open": point(1, 9), "close": point(1, 18)}
                            ]
                        }
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        service = GooglePlacesService(settings, client)
        first = await service.get_hours("Seoul Forest")
        second = await service.get_hours("  seoul   forest ")
    assert first == second
    assert calls == 1
