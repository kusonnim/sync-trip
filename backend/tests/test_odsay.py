import httpx
import pytest

from app.config import Settings
from app.routing.models import RoutingNoRoute
from app.routing.odsay import ODsayService, normalize_odsay_route
from app.services.errors import (
    MalformedProviderResponse,
    MissingProviderKey,
    ProviderAuthenticationError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from tests.optimizer_helpers import settings


ORIGIN = settings().start_location
DESTINATION = settings(end_location={"name": "Hotel", "lat": 37.56, "lng": 126.98}).end_location


def path(total_time=24, payment=1500, distance=8500):
    return {
        "info": {
            "totalTime": total_time,
            "payment": payment,
            "totalDistance": distance,
        },
        "subPath": [
            {"trafficType": 1, "lane": [{"name": "Line 2"}]},
            {"trafficType": 3},
            {"trafficType": 2, "lane": [{"busNo": "421"}]},
        ],
    }


def payload(paths=None):
    return {"result": {"path": [path()] if paths is None else paths}}


def test_odsay_success_chooses_fastest_and_normalizes_fields():
    leg = normalize_odsay_route(payload([path(40, 1200), path(24, 1500)]), ORIGIN, DESTINATION)
    assert leg.duration_minutes == 24
    assert leg.cost == 1500
    assert leg.distance_km == pytest.approx(8.5)
    assert leg.instruction == "Subway Line 2 → Bus 421"
    assert leg.provider == "odsay"


def test_odsay_missing_fare_uses_documented_estimate():
    route = path()
    del route["info"]["payment"]
    leg = normalize_odsay_route(payload([route]), ORIGIN, DESTINATION)
    assert leg.cost >= 1400
    assert leg.cost_is_estimated is True


def test_odsay_empty_path_is_a_no_route_result():
    with pytest.raises(RoutingNoRoute):
        normalize_odsay_route(payload([]), ORIGIN, DESTINATION)


@pytest.mark.anyio
async def test_odsay_request_coordinates_and_english_option(settings):
    captured = None

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured
        captured = request
        return httpx.Response(200, json=payload())

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await ODsayService(settings, client).route(ORIGIN, DESTINATION)
    assert captured is not None
    params = captured.url.params
    assert params["SX"] == str(ORIGIN.lng)
    assert params["SY"] == str(ORIGIN.lat)
    assert params["EX"] == str(DESTINATION.lng)
    assert params["EY"] == str(DESTINATION.lat)
    assert params["lang"] == "1"
    assert params["apiKey"] == "test-odsay-key"
    assert captured.headers["referer"] == "https://frontend.example.com"


@pytest.mark.parametrize("code", ["3", "4", "5", "6", "-98", "-99"])
def test_odsay_no_route_codes_are_not_provider_outages(code):
    with pytest.raises(RoutingNoRoute):
        normalize_odsay_route({"error": {"code": code, "msg": "No route"}}, ORIGIN, DESTINATION)


def test_odsay_auth_payload_is_not_silently_hidden():
    with pytest.raises(ProviderAuthenticationError):
        normalize_odsay_route(
            {"error": [{"code": "500", "message": "ApiKeyAuthFailed"}]},
            ORIGIN,
            DESTINATION,
        )


def test_odsay_unknown_provider_error_is_unavailable():
    with pytest.raises(ProviderUnavailableError):
        normalize_odsay_route(
            {"error": {"code": "500", "msg": "Internal provider failure"}},
            ORIGIN,
            DESTINATION,
        )


@pytest.mark.anyio
async def test_odsay_missing_configuration_is_explicit():
    missing = Settings(_env_file=None, cors_origins="http://localhost:5173")
    with pytest.raises(MissingProviderKey, match="ODsay"):
        await ODsayService(missing).route(ORIGIN, DESTINATION)


@pytest.mark.anyio
async def test_odsay_missing_referer_configuration_is_explicit():
    missing = Settings(
        _env_file=None,
        odsay_api_key="test-odsay-key",
        cors_origins="http://localhost:5173",
    )
    with pytest.raises(MissingProviderKey, match="ODsay Referer"):
        await ODsayService(missing).route(ORIGIN, DESTINATION)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "referer",
    ["sync-trip.example.com", "https://sync-trip.example.com/path", "https://sync-trip.example.com?q=1"],
)
async def test_odsay_invalid_referer_configuration_is_explicit(referer):
    invalid = Settings(
        _env_file=None,
        odsay_api_key="test-odsay-key",
        odsay_referer=referer,
        cors_origins="http://localhost:5173",
    )
    with pytest.raises(MissingProviderKey, match="ODsay Referer"):
        await ODsayService(invalid).route(ORIGIN, DESTINATION)


@pytest.mark.anyio
async def test_odsay_timeout_is_normalized(settings):
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("late", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderTimeoutError):
            await ODsayService(settings, client).route(ORIGIN, DESTINATION)


@pytest.mark.parametrize("bad_payload", [{}, {"result": {"path": "bad"}}, payload([{"info": {}}])])
def test_odsay_malformed_response_is_rejected(bad_payload):
    with pytest.raises(MalformedProviderResponse):
        normalize_odsay_route(bad_payload, ORIGIN, DESTINATION)
