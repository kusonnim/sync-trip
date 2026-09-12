import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.routing.models import RoutedLeg
from app.routing.router import get_routing_service


class FakeRoutingService:
    candidates_per_objective = 3

    async def route(self, _origin, _destination, mode):
        return RoutedLeg(
            duration_minutes=10 if mode == "transit" else 5,
            cost=1400 if mode == "transit" else 100,
            distance_km=1.0,
            instruction="Provider route",
            provider="test",
        )


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        kakao_rest_api_key="test-kakao-key",
        google_places_api_key="test-google-key",
        odsay_api_key="test-odsay-key",
        odsay_referer="https://frontend.example.com",
        cors_origins="http://localhost:5173,https://sync-trip.vercel.app",
    )


@pytest.fixture
def app(settings: Settings):
    application = create_app(settings)
    application.dependency_overrides[get_routing_service] = lambda: FakeRoutingService()
    return application


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client
