from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.models.place import PlaceDetailsResponse, PlaceDetailsUnavailableResponse
from app.services.errors import ClientInputError
from app.services.google_places import GooglePlacesService, get_google_places_service


router = APIRouter(prefix="/api/place", tags=["places"])


@router.get(
    "/details",
    response_model=PlaceDetailsResponse | PlaceDetailsUnavailableResponse,
)
async def place_details(
    name: Annotated[str, Query(min_length=1)],
    service: Annotated[GooglePlacesService, Depends(get_google_places_service)],
) -> PlaceDetailsResponse | PlaceDetailsUnavailableResponse:
    clean_name = name.strip()
    if not clean_name:
        raise ClientInputError("name must not be blank")
    hours = await service.get_hours(clean_name)
    if hours is None:
        return PlaceDetailsUnavailableResponse()
    return PlaceDetailsResponse(data=hours)
