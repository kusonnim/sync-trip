from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, model_validator

from .place import Category


def time_to_minutes(value: str) -> int:
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
        if time_to_minutes(self.end) < time_to_minutes(self.start):
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
        opening = time_to_minutes(self.open_time)
        closing = time_to_minutes(self.close_time)
        if self.stay_time_max < self.stay_time_min:
            raise ValueError("stay_time_max must be at least stay_time_min")
        if closing < opening:
            raise ValueError("close_time must be at or after open_time")
        return self


class TripSettings(BaseModel):
    transport_mode: Literal["car", "transit"]
    start_date: date
    end_date: date
    start_location: Location
    end_location: Location
    start_time: str
    end_deadline: str
    # Where the group sleeps. One entry covers every night; more entries are used
    # in order, one per night, so a trip can move between accommodations.
    accommodation: Location | None = None
    hotel: Location | None = None
    accommodations: list[Location] = Field(default_factory=list)

    @property
    def day_count(self) -> int:
        return (self.end_date - self.start_date).days + 1

    @property
    def night_count(self) -> int:
        return self.day_count - 1

    @model_validator(mode="before")
    @classmethod
    def populate_accommodations(cls, data: Any) -> Any:
        if isinstance(data, dict):
            acc = data.get("accommodation") or data.get("hotel")
            if acc is not None and not data.get("accommodations"):
                if isinstance(acc, list):
                    data["accommodations"] = acc
                else:
                    data["accommodations"] = [acc]
        return data

    def day_anchors(self) -> list[tuple[Location, Location]]:
        """Where each day begins and ends.

        The trip starts at ``start_location`` and finishes at ``end_location``.
        Every night in between is spent at an accommodation, so a day ends where
        the next one begins and no leg is invented between them.
        """
        nights = self.night_count
        if nights == 0:
            return [(self.start_location, self.end_location)]
        accommodations = self.accommodations
        if not accommodations and (self.accommodation or self.hotel):
            accommodations = [self.accommodation or self.hotel]
        if not accommodations:
            return [(self.start_location, self.end_location)] * self.day_count
        stays = [
            accommodations[min(night, len(accommodations) - 1)]
            for night in range(nights)
        ]
        anchors = [(self.start_location, stays[0])]
        anchors.extend((stays[night - 1], stays[night]) for night in range(1, nights))
        anchors.append((stays[-1], self.end_location))
        return anchors

    def day_time_bounds(self) -> list[tuple[int, int]]:
        """Per-day planning bounds for trip-level arrival and return times.

        On a multi-day trip, ``start_time`` belongs only to the first day and
        ``end_deadline`` only to the last. Interior day bounds span the day.
        """
        start = time_to_minutes(self.start_time)
        deadline = time_to_minutes(self.end_deadline)
        if self.day_count == 1:
            return [(start, deadline)]
        return [
            (start, 23 * 60 + 59),
            *[(0, 23 * 60 + 59)] * (self.day_count - 2),
            (0, deadline),
        ]

    @model_validator(mode="after")
    def validate_settings(self) -> "TripSettings":
        start = time_to_minutes(self.start_time)
        deadline = time_to_minutes(self.end_deadline)
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.day_count == 1 and deadline < start:
            raise ValueError("end_deadline must be at or after start_time")
        if (self.accommodation or self.hotel) and not self.accommodations:
            acc = self.accommodation or self.hotel
            self.accommodations = [acc]
        nights = self.night_count
        if nights == 0 and self.accommodations:
            raise ValueError("a single-day trip has no night to accommodate")
        if nights > 0 and not self.accommodations:
            raise ValueError("a multi-day trip needs at least one accommodation")
        if len(self.accommodations) > nights:
            raise ValueError(
                f"a {self.day_count}-day trip has {nights} night(s) to accommodate"
            )
        return self


class OptimizeRequest(BaseModel):
    settings: TripSettings
    places: list[Place]

    @model_validator(mode="after")
    def validate_unique_places(self) -> "OptimizeRequest":
        place_ids = [place.place_id for place in self.places]
        if len(place_ids) != len(set(place_ids)):
            raise ValueError("place_id values must be unique")
        return self


class TransitTimelineEntry(BaseModel):
    type: Literal["transit"] = "transit"
    mode: Literal["car", "transit"]
    instruction: str
    time: str
    duration: int = Field(ge=0)
    cost: int = Field(ge=0)


class PlaceTimelineEntry(BaseModel):
    type: Literal["place"] = "place"
    name: str
    time: str
    lat: float | None = None
    lng: float | None = None
    place_id: str | None = None
    category: Category | None = None
    stay_duration: int | None = Field(default=None, ge=0)
    wait_duration: int | None = Field(default=None, ge=0)
    hard_constraint: HardConstraint | None = None


TimelineEntry = Annotated[TransitTimelineEntry | PlaceTimelineEntry, Field(discriminator="type")]


class OptimizedDay(BaseModel):
    date: date
    total_time: int = Field(ge=0)
    total_cost: int = Field(ge=0)
    timeline: list[TimelineEntry]


class RouteWarning(BaseModel):
    code: Literal["ROUTING_FALLBACK", "ESTIMATED_TRANSIT_FARE"]
    message: str


class RouteOption(BaseModel):
    type: Literal["min_time", "min_cost"]
    label: str
    total_time: int = Field(ge=0)
    total_cost: int = Field(ge=0)
    days: list[OptimizedDay]
    routing_source: Literal["provider", "estimated"] | None = None
    warning: RouteWarning | None = None


class OptimizeSuccessResponse(BaseModel):
    status: Literal["success"] = "success"
    routes: list[RouteOption]


class OptimizeErrorResponse(BaseModel):
    status: Literal["error"] = "error"
    code: Literal[
        "TIME_CONFLICT",
        "NO_ROUTE",
        "TOO_MANY_PLACES",
        "PRECISE_ROUTE_INFEASIBLE",
    ]
    message: str
    place_ids: list[str] = Field(default_factory=list)


OptimizeResponse = OptimizeSuccessResponse | OptimizeErrorResponse
