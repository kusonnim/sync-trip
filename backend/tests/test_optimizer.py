from app.optimizer.engine import optimize_trip
from tests.optimizer_helpers import place, request


def response_dict(response):
    return response.model_dump(mode="json", exclude_none=True)


def route_visits(route):
    return [
        item["place_id"]
        for day in route["days"]
        for item in day["timeline"]
        if item["type"] == "place" and "place_id" in item
    ]


def test_single_day_route_has_two_frontend_compatible_options():
    result = response_dict(optimize_trip(request([place("a"), place("b")])))
    assert result["status"] == "success"
    assert [route["type"] for route in result["routes"]] == ["min_time", "min_cost"]
    assert all(len(route["days"]) == 1 for route in result["routes"])


def test_multi_day_route_has_chronological_dates_and_aggregate_totals():
    result = response_dict(
        optimize_trip(
            request(
                [place("a"), place("b"), place("c"), place("d")],
                end_date="2026-09-20",
            )
        )
    )
    route = result["routes"][0]
    assert [day["date"] for day in route["days"]] == ["2026-09-19", "2026-09-20"]
    assert route["total_time"] == sum(day["total_time"] for day in route["days"])
    assert route["total_cost"] == sum(day["total_cost"] for day in route["days"])


def test_every_candidate_appears_exactly_once_in_each_route():
    places = [place(str(index), lat=37 + index / 100) for index in range(5)]
    result = response_dict(optimize_trip(request(places, end_date="2026-09-20")))
    for route in result["routes"]:
        assert sorted(route_visits(route)) == ["0", "1", "2", "3", "4"]


def test_six_places_can_be_exhaustively_searched():
    places = [
        place(str(index), stay_time_min=1, stay_time_max=1)
        for index in range(6)
    ]
    result = optimize_trip(request(places, end_deadline="23:59"))
    assert result.status == "success"


def test_seven_places_on_one_day_returns_explicit_capacity_error():
    result = optimize_trip(request([place(str(index)) for index in range(7)]))
    assert result.status == "error"
    assert result.code == "TOO_MANY_PLACES"
    assert "6 places per day" in result.message


def test_min_time_and_min_cost_use_lexicographic_objectives():
    places = [
        place("a", lat=37.56, lng=126.98),
        place("b", lat=37.58, lng=127.02),
        place("c", lat=37.50, lng=127.01),
    ]
    result = response_dict(optimize_trip(request(places)))
    fastest, cheapest = result["routes"]
    assert fastest["total_time"] <= cheapest["total_time"]
    assert cheapest["total_cost"] <= fastest["total_cost"]


def test_only_feasible_order_is_used_for_both_options():
    places = [
        place("a", close_time="10:45", stay_time_min=10, stay_time_max=10),
        place("b", stay_time_min=20, stay_time_max=20),
    ]
    result = response_dict(optimize_trip(request(places)))
    assert result["status"] == "success"
    assert route_visits(result["routes"][0]) == ["a", "b"]
    assert route_visits(result["routes"][1]) == ["a", "b"]


def test_two_feasible_orders_produce_distinct_choices_when_objectives_match():
    result = response_dict(optimize_trip(request([place("a"), place("b")])))
    orders = [tuple(route_visits(route)) for route in result["routes"]]
    assert orders == [("a", "b"), ("b", "a")]


def test_reservation_conflict_returns_structured_error():
    places = [
        place(
            "a",
            name="Museum",
            stay_time_min=60,
            hard_constraint={"start": "18:00", "end": "18:00"},
        ),
        place(
            "b",
            name="Tower",
            hard_constraint={"start": "18:10", "end": "18:10"},
        ),
    ]
    result = optimize_trip(request(places))
    assert result.status == "error"
    assert result.code == "TIME_CONFLICT"
    assert result.place_ids == ["a", "b"]


def test_generic_infeasibility_returns_no_route():
    impossible = place("a", open_time="20:00", close_time="20:20", stay_time_min=30)
    result = optimize_trip(request([impossible]))
    assert result.status == "error"
    assert result.code == "NO_ROUTE"
    assert result.place_ids == []


def test_stay_time_max_cannot_make_a_too_long_minimum_feasible():
    impossible = place(
        "a",
        open_time="10:00",
        close_time="10:30",
        stay_time_min=40,
        stay_time_max=120,
    )
    result = optimize_trip(request([impossible]))
    assert result.status == "error"
    assert result.code == "NO_ROUTE"


def test_preference_score_sum_does_not_change_permutation_order():
    base = [place("a", preference_score=0), place("b", preference_score=100)]
    changed = [place("a", preference_score=999), place("b", preference_score=-50)]
    first = response_dict(optimize_trip(request(base)))
    second = response_dict(optimize_trip(request(changed)))
    assert [route_visits(route) for route in first["routes"]] == [
        route_visits(route) for route in second["routes"]
    ]


def test_empty_days_still_have_start_transit_and_end_timeline():
    result = response_dict(
        optimize_trip(request([place("a")], end_date="2026-09-20"))
    )
    empty_day = result["routes"][0]["days"][1]
    assert [item["type"] for item in empty_day["timeline"]] == [
        "place",
        "transit",
        "place",
    ]


def _terminal_names(day: dict) -> tuple[str, str]:
    stops = [item for item in day["timeline"] if item["type"] == "place"]
    return stops[0]["name"], stops[-1]["name"]


def _terminal_coords(day: dict) -> tuple[tuple[float, float], tuple[float, float]]:
    stops = [item for item in day["timeline"] if item["type"] == "place"]
    return (stops[0]["lat"], stops[0]["lng"]), (stops[-1]["lat"], stops[-1]["lng"])


def test_a_middle_day_starts_and_ends_at_the_accommodation():
    result = response_dict(
        optimize_trip(
            request(
                [place(str(index), lat=37 + index / 100) for index in range(6)],
                end_date="2026-09-21",
            )
        )
    )
    days = result["routes"][0]["days"]
    assert _terminal_names(days[0]) == ("Seoul Station", "Myeongdong Hotel")
    assert _terminal_names(days[1]) == ("Myeongdong Hotel", "Myeongdong Hotel")
    assert _terminal_names(days[2]) == ("Myeongdong Hotel", "Seoul Station")
    assert _terminal_coords(days[0]) == ((37.5547, 126.9707), (37.5636, 126.9827))
    assert _terminal_coords(days[1]) == ((37.5636, 126.9827), (37.5636, 126.9827))
    assert _terminal_coords(days[2]) == ((37.5636, 126.9827), (37.5547, 126.9707))


def test_multiple_intermediate_days_all_start_and_end_at_accommodation():
    hotel = {"name": "Grand Hotel", "lat": 37.52, "lng": 126.92}
    result = response_dict(
        optimize_trip(
            request(
                [place(str(index), lat=37.50 + index / 100) for index in range(6)],
                end_date="2026-09-22",
                accommodations=[hotel],
            )
        )
    )
    days = result["routes"][0]["days"]
    assert len(days) == 4
    # Day 1: start_location -> hotel
    assert _terminal_names(days[0]) == ("Seoul Station", "Grand Hotel")
    assert _terminal_coords(days[0]) == ((37.5547, 126.9707), (37.52, 126.92))
    # Intermediate days (Day 2 and Day 3): hotel -> hotel
    for intermediate_day in (days[1], days[2]):
        assert _terminal_names(intermediate_day) == ("Grand Hotel", "Grand Hotel")
        assert _terminal_coords(intermediate_day) == ((37.52, 126.92), (37.52, 126.92))
    # Final day (Day 4): hotel -> end_location
    assert _terminal_names(days[3]) == ("Grand Hotel", "Seoul Station")
    assert _terminal_coords(days[3]) == ((37.52, 126.92), (37.5547, 126.9707))


def test_accommodation_singular_and_hotel_aliases_anchor_intermediate_days():
    boutique = {"name": "Boutique Stay", "lat": 37.51, "lng": 126.91}
    result = response_dict(
        optimize_trip(
            request(
                [place("1"), place("2"), place("3")],
                end_date="2026-09-21",
                accommodation=boutique,
            )
        )
    )
    days = result["routes"][0]["days"]
    assert len(days) == 3
    assert _terminal_names(days[1]) == ("Boutique Stay", "Boutique Stay")
    assert _terminal_coords(days[1]) == ((37.51, 126.91), (37.51, 126.91))


def test_each_accommodation_anchors_its_own_night():
    result = response_dict(
        optimize_trip(
            request(
                [place(str(index), lat=37 + index / 100) for index in range(6)],
                end_date="2026-09-21",
                accommodations=[
                    {"name": "First Hotel", "lat": 37.56, "lng": 126.98},
                    {"name": "Second Hotel", "lat": 37.57, "lng": 126.99},
                ],
            )
        )
    )
    days = result["routes"][0]["days"]
    assert _terminal_names(days[0]) == ("Seoul Station", "First Hotel")
    assert _terminal_names(days[1]) == ("First Hotel", "Second Hotel")
    assert _terminal_names(days[2]) == ("Second Hotel", "Seoul Station")


def test_driving_legs_cost_nothing_without_a_provider_toll():
    result = response_dict(
        optimize_trip(
            request(
                [place("a", lat=37.50), place("b", lat=37.60)],
                transport_mode="car",
            )
        )
    )
    for route in result["routes"]:
        assert route["total_cost"] == 0
        for day in route["days"]:
            for item in day["timeline"]:
                if item["type"] == "transit":
                    assert item["cost"] == 0
