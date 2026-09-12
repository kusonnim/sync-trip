from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .place import Category


def _minutes(value: str) -> int:
    try:
        parsed = datetime.strptime(value, "%H:%M")
    except ValueError as exc:
        raise ValueError("must use 24-hour HH:mm format") from exc
    return parsed.hour * 60 + parsed.minute


class Location(BaseModel):
    name: str = Field(min_length=1)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class HardConstraint(BaseModel):
    start: str
    end: str

    @model_validator(mode="after")
    def validate_window(self) -> "HardConstraint":
        if _minutes(self.end) < _minutes(self.start):
            raise ValueError("hard constraint end must be at or after start")
        return self


class Place(Location):
    place_id: str = Field(min_length=1)
    category: Category
    stay_time_min: int = Field(ge=0)
    stay_time_max: int = Field(ge=0)
    open_time: str
    close_time: str
    hard_constraint: HardConstraint | None = None
    preference_score: float = 0

    @model_validator(mode="after")
    def validate_place(self) -> "Place":
        _minutes(self.open_time)
        _minutes(self.close_time)
        if self.stay_time_max < self.stay_time_min:
            raise ValueError("stay_time_max must be at least stay_time_min")
        return self


class TripSettings(BaseModel):
    transport_mode: Literal["car", "transit"]
    start_date: date
    end_date: date
    start_location: Location
    end_location: Location
    start_time: str
    end_deadline: str

    @model_validator(mode="after")
    def validate_settings(self) -> "TripSettings":
        _minutes(self.start_time)
        _minutes(self.end_deadline)
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class OptimizeRequest(BaseModel):
    settings: TripSettings
    places: list[Place]
