from datetime import date

from app.models.optimize import OptimizeRequest, Place, TripSettings


SEOUL = {"name": "Seoul Station", "lat": 37.5547, "lng": 126.9707}
HOTEL = {"name": "Myeongdong Hotel", "lat": 37.5636, "lng": 126.9827}


def place(place_id: str, **overrides) -> Place:
    data = {
        "place_id": place_id,
        "name": f"Place {place_id}",
        "category": "attraction",
        "lat": 37.5547,
        "lng": 126.9707,
        "stay_time_min": 30,
        "stay_time_max": 60,
        "open_time": "09:00",
        "close_time": "22:00",
        "hard_constraint": None,
        "preference_score": 5,
    }
    data.update(overrides)
    return Place(**data)


def settings(**overrides) -> TripSettings:
    data = {
        "transport_mode": "transit",
        "start_date": "2026-09-19",
        "end_date": "2026-09-19",
        "start_location": SEOUL,
        "end_location": SEOUL,
        "start_time": "10:00",
        "end_deadline": "21:30",
    }
    data.update(overrides)
    # Every night needs an accommodation, so supply one unless a test names its own.
    if "accommodations" not in data and "accommodation" not in data and "hotel" not in data:
        nights = (date.fromisoformat(str(data["end_date"])) - date.fromisoformat(str(data["start_date"]))).days
        data["accommodations"] = [HOTEL] if nights > 0 else []
    return TripSettings(**data)


def request(places: list[Place], **setting_overrides) -> OptimizeRequest:
    return OptimizeRequest(settings=settings(**setting_overrides), places=places)


def visit_entries(route: dict) -> list[dict]:
    return [
        item
        for day in route["days"]
        for item in day["timeline"]
        if item["type"] == "place" and item.get("place_id")
    ]
