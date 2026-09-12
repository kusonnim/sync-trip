from app.models.place import PlaceHours, SearchPlace
from app.services.errors import ProviderUnavailableError
from app.services.google_places import get_google_places_service
from app.services.kakao_local import get_kakao_local_service


class FakeKakao:
    async def search(self, keyword: str) -> list[SearchPlace]:
        assert keyword == "Seoul Forest"
        return [
            SearchPlace(
                place_id="kakao_12345",
                name="Seoul Forest",
                address="273 Ttukseom-ro, Seoul",
                lat=37.5443,
                lng=127.0374,
                category="attraction",
            )
        ]


class FailingKakao:
    async def search(self, _keyword: str):
        raise ProviderUnavailableError("Kakao Local")


class FakeGoogle:
    def __init__(self, hours: PlaceHours | None) -> None:
        self.hours = hours

    async def get_hours(self, name: str) -> PlaceHours | None:
        assert name == "Seoul Forest"
        return self.hours


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_search_contract(client, app):
    app.dependency_overrides[get_kakao_local_service] = lambda: FakeKakao()
    response = client.get("/api/search", params={"keyword": "Seoul Forest"})
    assert response.status_code == 200
    assert response.json() == {
        "status": "success",
        "data": [
            {
                "place_id": "kakao_12345",
                "name": "Seoul Forest",
                "address": "273 Ttukseom-ro, Seoul",
                "lat": 37.5443,
                "lng": 127.0374,
                "category": "attraction",
            }
        ],
    }


def test_blank_search_keyword(client):
    response = client.get("/api/search", params={"keyword": "   "})
    assert response.status_code == 422
    assert response.json() == {
        "status": "error",
        "code": "INVALID_REQUEST",
        "message": "keyword must not be blank",
    }


def test_upstream_kakao_failure_is_safe(client, app):
    app.dependency_overrides[get_kakao_local_service] = lambda: FailingKakao()
    response = client.get("/api/search", params={"keyword": "Seoul Forest"})
    assert response.status_code == 502
    assert response.json() == {
        "status": "error",
        "code": "UPSTREAM_UNAVAILABLE",
        "message": "Kakao Local is temporarily unavailable.",
    }


def test_place_hours_contract(client, app):
    app.dependency_overrides[get_google_places_service] = lambda: FakeGoogle(
        PlaceHours(open_time="09:00", close_time="18:00")
    )
    response = client.get("/api/place/details", params={"name": "Seoul Forest"})
    assert response.status_code == 200
    assert response.json() == {
        "status": "success",
        "data": {"open_time": "09:00", "close_time": "18:00"},
    }


def test_missing_place_hours_are_optional(client, app):
    app.dependency_overrides[get_google_places_service] = lambda: FakeGoogle(None)
    response = client.get("/api/place/details", params={"name": "Seoul Forest"})
    assert response.status_code == 200
    assert response.json() == {"status": "unavailable", "data": None}


def test_cors_uses_configured_origin(client):
    response = client.options(
        "/api/search?keyword=test",
        headers={
            "Origin": "https://sync-trip.vercel.app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://sync-trip.vercel.app"
    assert response.headers["access-control-allow-credentials"] == "true"
