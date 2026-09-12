import httpx
import pytest

from app.config import Settings
from app.routing.kakao_mobility import KakaoMobilityService, normalize_kakao_route
from app.services.errors import (
    MalformedProviderResponse,
    ProviderAuthenticationError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)
from tests.optimizer_helpers import settings


ORIGIN = settings().start_location
DESTINATION = settings(end_location={"name": "Hotel", "lat": 37.56, "lng": 126.98}).end_location


def payload(duration=3494, distance=19032, toll=2000):
    return {
        "routes": [
            {
                "result_code": 0,
                "summary": {
                    "duration": duration,
                    "distance": distance,
                    "fare": {"taxi": 22000, "toll": toll},
                },
            }
        ]
    }


def test_kakao_success_normalizes_duration_distance_operating_cost_and_toll():
    leg = normalize_kakao_route(payload(), "Hotel", 140)
    assert leg.duration_minutes == 59
    assert leg.distance_km == pytest.approx(19.032)
    assert leg.cost == 4664
    assert leg.instruction == "Drive to Hotel"
    assert leg.provider == "kakao_mobility"


@pytest.mark.anyio
async def test_kakao_request_uses_longitude_latitude_and_recommended_summary(settings):
    captured = None

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured
        captured = request
        return httpx.Response(200, json=payload())

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await KakaoMobilityService(settings, client).route(ORIGIN, DESTINATION)
    assert captured is not None
    assert captured.url.params["origin"] == f"{ORIGIN.lng},{ORIGIN.lat}"
    assert captured.url.params["destination"] == f"{DESTINATION.lng},{DESTINATION.lat}"
    assert captured.url.params["priority"] == "RECOMMEND"
    assert captured.url.params["summary"] == "true"
    assert captured.headers["Authorization"] == "KakaoAK test-kakao-key"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("status", "error_type"),
    [(401, ProviderAuthenticationError), (403, ProviderAuthenticationError), (429, ProviderRateLimitError)],
)
async def test_kakao_http_failures_are_safe(settings, status, error_type):
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"message": "private upstream detail"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(error_type, match="Kakao Mobility"):
            await KakaoMobilityService(settings, client).route(ORIGIN, DESTINATION)


@pytest.mark.anyio
async def test_kakao_timeout_is_normalized(settings):
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("late", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderTimeoutError):
            await KakaoMobilityService(settings, client).route(ORIGIN, DESTINATION)


@pytest.mark.parametrize(
    "bad_payload",
    [{}, {"routes": [{}]}, {"routes": [{"result_code": 0, "summary": {"duration": "bad"}}]}],
)
def test_kakao_malformed_response_is_rejected(bad_payload):
    with pytest.raises(MalformedProviderResponse):
        normalize_kakao_route(bad_payload, "Hotel", 140)
