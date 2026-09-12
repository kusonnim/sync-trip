from typing import Literal

from pydantic import BaseModel, Field

from .common import SuccessResponse, UnavailableResponse


Category = Literal["restaurant", "cafe", "attraction", "museum", "shopping"]


class SearchPlace(BaseModel):
    place_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    address: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    category: Category


class PlaceHours(BaseModel):
    open_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    close_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class SearchResponse(SuccessResponse[list[SearchPlace]]):
    pass


class PlaceDetailsResponse(SuccessResponse[PlaceHours]):
    pass


class PlaceDetailsUnavailableResponse(UnavailableResponse):
    pass
