import pytest
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app


def test_backend_can_start_without_provider_keys():
    settings = Settings(_env_file=None, cors_origins="http://localhost:5173")
    assert settings.kakao_rest_api_key is None
    assert settings.google_places_api_key is None
    assert settings.odsay_api_key is None
    assert settings.odsay_referer is None
    assert settings.track2_candidates_per_objective == 3
    assert settings.routing_cache_ttl_seconds == 1800
    assert create_app(settings).title == "SyncTrip API"


def test_multiple_cors_origins_are_parsed():
    settings = Settings(
        _env_file=None,
        cors_origins="http://localhost:5173, https://sync-trip.vercel.app/",
    )
    assert settings.allowed_origins == [
        "http://localhost:5173",
        "https://sync-trip.vercel.app",
    ]


def test_wildcard_cors_is_rejected():
    with pytest.raises(ValidationError, match="cannot contain"):
        Settings(_env_file=None, cors_origins="*")
