import pytest
from pydantic import ValidationError

from app.models.optimize import HardConstraint, Location, OptimizeRequest, Place, TripSettings


def valid_settings() -> dict:
    return {
        "transport_mode": "transit",
        "start_date": "2026-09-19",
        "end_date": "2026-09-20",
        "start_location": {"name": "Seoul Station", "lat": 37.554, "lng": 126.970},
        "end_location": {"name": "Seoul Station", "lat": 37.554, "lng": 126.970},
        "start_time": "10:00",
        "end_deadline": "21:00",
        "accommodations": [{"name": "Myeongdong Hotel", "lat": 37.563, "lng": 126.982}],
    }


def valid_place() -> dict:
    return {
        "place_id": "kakao_12345",
        "name": "Seoul Forest",
        "category": "attraction",
        "lat": 37.544,
        "lng": 127.037,
        "stay_time_min": 60,
        "stay_time_max": 90,
        "open_time": "09:00",
        "close_time": "18:00",
        "hard_constraint": None,
        "preference_score": 12,
    }


def test_optimize_contract_models_accept_frontend_shape():
    request = OptimizeRequest(settings=valid_settings(), places=[valid_place()])
    assert request.settings.transport_mode == "transit"
    assert request.places[0].place_id == "kakao_12345"


def test_location_ranges():
    with pytest.raises(ValidationError):
        Location(name="Bad", lat=91, lng=127)


def test_stay_max_must_not_be_less_than_min():
    data = valid_place()
    data["stay_time_min"] = 90
    data["stay_time_max"] = 60
    with pytest.raises(ValidationError, match="stay_time_max"):
        Place(**data)


def test_time_format_is_validated():
    data = valid_settings()
    data["start_time"] = "25:00"
    with pytest.raises(ValidationError, match="HH:mm"):
        TripSettings(**data)


def test_end_date_must_not_precede_start_date():
    data = valid_settings()
    data["end_date"] = "2026-09-18"
    with pytest.raises(ValidationError, match="end_date"):
        TripSettings(**data)


def test_transport_mode_and_category_are_stable_values():
    settings = valid_settings()
    settings["transport_mode"] = "walking"
    with pytest.raises(ValidationError):
        TripSettings(**settings)
    place = valid_place()
    place["category"] = "park"
    with pytest.raises(ValidationError):
        Place(**place)


def test_hard_constraint_window_order():
    with pytest.raises(ValidationError, match="hard constraint end"):
        HardConstraint(start="18:00", end="17:00")


def test_duplicate_place_ids_are_rejected():
    with pytest.raises(ValidationError, match="place_id values must be unique"):
        OptimizeRequest(
            settings=valid_settings(),
            places=[valid_place(), valid_place()],
        )


def test_deadline_before_start_is_rejected():
    data = valid_settings()
    data["end_deadline"] = "09:59"
    with pytest.raises(ValidationError, match="end_deadline"):
        TripSettings(**data)


def test_closing_before_opening_is_rejected():
    data = valid_place()
    data["open_time"] = "18:00"
    data["close_time"] = "17:00"
    with pytest.raises(ValidationError, match="close_time"):
        Place(**data)


def test_single_day_trip_rejects_an_accommodation():
    data = valid_settings()
    data["end_date"] = "2026-09-19"
    with pytest.raises(ValidationError, match="no night"):
        TripSettings(**data)


def test_multi_day_trip_requires_an_accommodation():
    data = valid_settings()
    data["accommodations"] = []
    with pytest.raises(ValidationError, match="at least one accommodation"):
        TripSettings(**data)


def test_accommodations_cannot_outnumber_the_nights():
    data = valid_settings()
    data["accommodations"] = [
        {"name": "First", "lat": 37.56, "lng": 126.98},
        {"name": "Second", "lat": 37.57, "lng": 126.99},
    ]
    with pytest.raises(ValidationError, match="night"):
        TripSettings(**data)


def test_a_single_accommodation_covers_every_night():
    data = valid_settings()
    data["end_date"] = "2026-09-22"
    anchors = TripSettings(**data).day_anchors()
    assert [start.name for start, _ in anchors] == [
        "Seoul Station", "Myeongdong Hotel", "Myeongdong Hotel", "Myeongdong Hotel",
    ]
    assert [end.name for _, end in anchors] == [
        "Myeongdong Hotel", "Myeongdong Hotel", "Myeongdong Hotel", "Seoul Station",
    ]


def test_each_accommodation_takes_its_own_night_in_order():
    data = valid_settings()
    data["end_date"] = "2026-09-21"
    data["accommodations"] = [
        {"name": "First", "lat": 37.56, "lng": 126.98},
        {"name": "Second", "lat": 37.57, "lng": 126.99},
    ]
    anchors = TripSettings(**data).day_anchors()
    assert [(start.name, end.name) for start, end in anchors] == [
        ("Seoul Station", "First"),
        ("First", "Second"),
        ("Second", "Seoul Station"),
    ]


def test_a_single_day_trip_runs_from_start_to_end_location():
    data = valid_settings()
    data["end_date"] = "2026-09-19"
    data["accommodations"] = []
    anchors = TripSettings(**data).day_anchors()
    assert [(start.name, end.name) for start, end in anchors] == [
        ("Seoul Station", "Seoul Station"),
    ]
