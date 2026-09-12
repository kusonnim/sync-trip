import logging
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.place_details import router as place_details_router
from app.api.optimize import router as optimize_router
from app.api.search import router as search_router
from app.config import Settings, get_settings
from app.models.common import ErrorResponse
from app.routing.router import build_routing_service
from app.services.errors import ProviderError


logger = logging.getLogger(__name__)


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or get_settings()
    application = FastAPI(title=config.app_name, version="0.4.0")
    application.state.routing_service = build_routing_service(config)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=config.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @application.exception_handler(ProviderError)
    async def provider_error_handler(_request: Request, exc: ProviderError) -> JSONResponse:
        if exc.status_code >= 500:
            logger.warning("Provider operation failed with code %s", exc.code)
        payload = ErrorResponse(code=exc.code, message=exc.public_message)
        return JSONResponse(status_code=exc.status_code, content=payload.model_dump())

    @application.exception_handler(Exception)
    async def unexpected_error_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unexpected application failure", exc_info=exc)
        payload = ErrorResponse(
            code="INTERNAL_ERROR",
            message="An unexpected internal error occurred.",
        )
        return JSONResponse(status_code=500, content=payload.model_dump())

    @application.get("/health", response_model=HealthResponse, tags=["health"])
    async def health() -> HealthResponse:
        return HealthResponse()

    application.include_router(search_router)
    application.include_router(place_details_router)
    application.include_router(optimize_router)
    return application


app = create_app()
