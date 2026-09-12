from app.optimizer.constraints import simulate_day
from tests.optimizer_helpers import place, settings


def visit(result):
    return next(item for item in result.timeline if item.get("place_id"))


def test_opening_time_allows_early_arrival_and_records_waiting():
    result = simulate_day((place("a", open_time="11:00"),), settings())
    assert result is not None
    assert visit(result)["time"].startswith("11:00")
    assert visit(result)["wait_duration"] == 50


def test_fixed_reservation_allows_early_arrival_and_waiting():
    reserved = place("a", hard_constraint={"start": "18:00", "end": "18:00"})
    result = simulate_day((reserved,), settings())
    assert result is not None
    assert visit(result)["time"].startswith("18:00")
    assert visit(result)["wait_duration"] == 470


def test_late_reservation_arrival_is_rejected():
    reserved = place("a", hard_constraint={"start": "10:00", "end": "10:05"})
    assert simulate_day((reserved,), settings()) is None


def test_visit_that_cannot_finish_before_closing_is_rejected():
    closing = place("a", close_time="10:30", stay_time_min=30, stay_time_max=60)
    assert simulate_day((closing,), settings()) is None


def test_restaurant_starts_during_lunch():
    restaurant = place("a", category="restaurant", stay_time_min=60)
    result = simulate_day((restaurant,), settings())
    assert result is not None
    assert visit(result)["time"].startswith("11:30")


def test_restaurant_can_start_during_dinner():
    restaurant = place(
        "a",
        category="restaurant",
        open_time="17:00",
        stay_time_min=60,
    )
    result = simulate_day((restaurant,), settings())
    assert result is not None
    assert visit(result)["time"].startswith("17:30")


def test_restaurant_waits_until_lunch_instead_of_failing():
    restaurant = place("a", category="restaurant", open_time="10:00", stay_time_min=30)
    result = simulate_day((restaurant,), settings())
    assert result is not None
    assert visit(result)["wait_duration"] == 80


def test_restaurant_waits_until_dinner_when_lunch_is_unavailable():
    restaurant = place("a", category="restaurant", open_time="14:00", stay_time_min=30)
    result = simulate_day((restaurant,), settings())
    assert result is not None
    assert visit(result)["time"].startswith("17:30")


def test_impossible_restaurant_meal_window_is_rejected():
    restaurant = place(
        "a",
        category="restaurant",
        close_time="11:20",
        stay_time_min=30,
    )
    assert simulate_day((restaurant,), settings()) is None


def test_daily_deadline_includes_return_to_end_location():
    destination = {"name": "Hotel", "lat": 37.5547, "lng": 126.9707}
    tight = settings(end_location=destination, end_deadline="10:49")
    assert simulate_day((place("a"),), tight) is None


def test_different_start_and_end_locations_appear_in_timeline():
    destination = {"name": "Hotel", "lat": 37.56, "lng": 126.98}
    result = simulate_day((place("a"),), settings(end_location=destination))
    assert result is not None
    assert result.timeline[0]["name"] == "Seoul Station"
    assert result.timeline[-1]["name"] == "Hotel"


def test_stay_duration_is_always_the_minimum_not_the_maximum():
    result = simulate_day((place("a", stay_time_min=25, stay_time_max=180),), settings())
    assert result is not None
    assert visit(result)["stay_duration"] == 25
