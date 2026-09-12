from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    app_name: str = "SyncTrip API"
    kakao_rest_api_key: SecretStr | None = None
    google_places_api_key: SecretStr | None = None
    odsay_api_key: SecretStr | None = None
    odsay_referer: str | None = None
    cors_origins: str = "http://localhost:5173"
    provider_timeout_seconds: float = Field(default=8.0, gt=0, le=30)
    google_cache_ttl_seconds: int = Field(default=3600, ge=1)
    google_cache_max_entries: int = Field(default=256, ge=1)
    routing_timeout_seconds: float = Field(default=8.0, gt=0, le=30)
    routing_cache_ttl_seconds: int = Field(default=1800, ge=1)
    routing_cache_max_entries: int = Field(default=512, ge=1)
    track2_candidates_per_objective: int = Field(default=3, ge=1, le=10)
    car_cost_per_km_krw: int = Field(default=140, ge=0)

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def odsay_referer_origin(self) -> str | None:
        referer = (self.odsay_referer or "").strip().rstrip("/")
        if not referer:
            return None
        parsed = urlparse(referer)
        try:
            port = parsed.port
        except ValueError:
            return None
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.params
            or parsed.query
            or parsed.fragment
            or (port is not None and not 1 <= port <= 65535)
        ):
            return None
        return referer

    @model_validator(mode="after")
    def validate_cors_origins(self) -> "Settings":
        origins = self.allowed_origins
        if not origins:
            raise ValueError("CORS_ORIGINS must contain at least one origin")
        for origin in origins:
            if origin == "*":
                raise ValueError("CORS_ORIGINS cannot contain '*'")
            parsed = urlparse(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path not in {"", "/"}:
                raise ValueError(f"invalid CORS origin: {origin}")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
