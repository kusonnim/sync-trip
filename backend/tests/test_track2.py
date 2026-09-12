import pytest

from app.optimizer.engine import optimize_trip
from app.optimizer.refine import optimize_trip_precise, refine_day
from app.routing.models import RoutedLeg
from app.routing.router import SAME_LOCATION_TOLERANCE_METERS, RoutingService
from app.services.errors import ProviderAuthenticationError, ProviderTimeoutError
from tests.optimizer_helpers import place, request, settings


class FakeRouting:
    def __init__(self, handler=None, candidates=3):
        self.candidates_per_objective = candidates
        self.calls = []
        self.handler = handler or self._default

    @staticmethod
    def _default(_origin, _destination, mode):
        return RoutedLeg(
            duration_minutes=5,
            cost=100 if mode == "car" else 1400,
            distance_km=1.0,
            instruction="Precise provider leg",
            provider="test",
        )

    async def route(self, origin, destination, mode):
        self.calls.append((origin.name, destination.name, mode))
        result = self.handler(origin, destination, mode)
        if isinstance(result, Exception):
            raise result
        return result


def visits(route):
    return [
        item.place_id
        for day in route.days
        for item in day.timeline
        if item.type == "place" and item.place_id is not None
    ]


def leg(minutes, cost=100, estimated=False):
    return RoutedLeg(
        duration_minutes=minutes,
        cost=cost,
        distance_km=1.0,
        instruction="Precise provider leg",
        provider="test",
        cost_is_estimated=estimated,
    )


def test_track1_exhaustive_search_makes_zero_provider_calls():
    routing = FakeRouting()
    result = optimize_trip(request([place("a"), place("b"), place("c")]))
    assert result.status == "success"
    assert routing.calls == []


@pytest.mark.anyio
async def test_track2_refines_only_bounded_top_candidates():
    routing = FakeRouting(candidates=3)
    places = [place(str(index)) for index in range(4)]
    result = await optimize_trip_precise(request(places), routing)
    assert result.status == "success"
    assert 0 < len(routing.calls) <= 2 * 3 * (len(places) + 1)


@pytest.mark.anyio
async def test_precise_route_rebuilds_timeline_with_provider_legs():
    routing = FakeRouting()
    result = await optimize_trip_precise(request([place("a")]), routing)
    assert result.status == "success"
    route = result.routes[0]
    transit = [item for item in route.days[0].timeline if item.type == "transit"]
    assert route.routing_source == "provider"
    assert [item.instruction for item in transit] == [
        "Precise provider leg",
        "Precise provider leg",
    ]
    assert [item.duration for item in transit] == [5, 5]


@pytest.mark.anyio
async def test_estimated_winner_can_fail_and_second_candidate_succeeds():
    def handler(origin, destination, _mode):
        if origin.name == "Seoul Station" and destination.name == "Place a":
            return leg(70)
        return leg(5)

    routing = FakeRouting(handler, candidates=2)
    places = [
        place("a", close_time="11:30", stay_time_min=30),
        place("b", stay_time_min=30),
    ]
    result = await optimize_trip_precise(request(places), routing)
    assert result.status == "success"
    assert visits(result.routes[0]) == ["b", "a"]


@pytest.mark.anyio
async def test_all_precise_candidates_can_be_infeasible():
    routing = FakeRouting(lambda _a, _b, _m: leg(600), candidates=2)
    result = await optimize_trip_precise(request([place("a"), place("b")]), routing)
    assert result.status == "error"
    assert result.code == "PRECISE_ROUTE_INFEASIBLE"


@pytest.mark.anyio
async def test_precise_travel_can_break_reservation_window():
    reserved = place(
        "a",
        hard_constraint={"start": "10:30", "end": "10:30"},
    )
    result = await refine_day((reserved,), request([reserved]), FakeRouting(lambda *_: leg(40)))
    assert result is None


@pytest.mark.anyio
async def test_precise_travel_can_break_business_closing_time():
    closing = place("a", close_time="10:50", stay_time_min=30)
    result = await refine_day((closing,), request([closing]), FakeRouting(lambda *_: leg(40)))
    assert result is None


@pytest.mark.anyio
async def test_precise_travel_can_break_restaurant_meal_window():
    restaurant = place(
        "a",
        category="restaurant",
        close_time="17:00",
        stay_time_min=30,
    )
    result = await refine_day(
        (restaurant,),
        request([restaurant]),
        FakeRouting(lambda *_: leg(240)),
    )
    assert result is None


@pytest.mark.anyio
async def test_precise_return_leg_can_break_daily_deadline():
    def handler(origin, destination, _mode):
        return leg(100 if destination.name == "Seoul Station" else 10)

    target = place("a")
    result = await refine_day(
        (target,),
        request([target], end_deadline="11:00"),
        FakeRouting(handler),
    )
    assert result is None


@pytest.mark.anyio
async def test_final_objectives_are_reranked_with_precise_time_and_cost():
    def handler(origin, destination, _mode):
        fast_order = (
            (origin.name == "Seoul Station" and destination.name == "Place b")
            or (origin.name == "Place b" and destination.name == "Place a")
            or (origin.name == "Place a" and destination.name == "Seoul Station")
        )
        return leg(5, 500) if fast_order else leg(20, 100)

    result = await optimize_trip_precise(
        request([place("a"), place("b")]),
        FakeRouting(handler, candidates=2),
    )
    assert result.status == "success"
    assert visits(result.routes[0]) == ["b", "a"]
    assert visits(result.routes[1]) == ["a", "b"]
    assert result.routes[0].total_time < result.routes[1].total_time
    assert result.routes[1].total_cost < result.routes[0].total_cost


@pytest.mark.anyio
async def test_transient_provider_failure_returns_marked_estimate():
    routing = FakeRouting(lambda *_: ProviderTimeoutError("ODsay"))
    result = await optimize_trip_precise(request([place("a")]), routing)
    assert result.status == "success"
    assert all(route.routing_source == "estimated" for route in result.routes)
    assert all(route.warning.code == "ROUTING_FALLBACK" for route in result.routes)
    assert all("Estimated" in route.days[0].timeline[1].instruction for route in result.routes)


@pytest.mark.anyio
async def test_authentication_failure_is_not_silently_fallbacked():
    routing = FakeRouting(lambda *_: ProviderAuthenticationError("ODsay"))
    with pytest.raises(ProviderAuthenticationError):
        await optimize_trip_precise(request([place("a")]), routing)


@pytest.mark.anyio
async def test_missing_transit_fare_emits_route_warning():
    routing = FakeRouting(lambda *_: leg(5, 1400, estimated=True))
    result = await optimize_trip_precise(request([place("a")]), routing)
    assert result.status == "success"
    assert all(route.warning.code == "ESTIMATED_TRANSIT_FARE" for route in result.routes)


@pytest.mark.anyio
async def test_multi_day_refinement_keeps_every_day():
    result = await optimize_trip_precise(
        request([place("a"), place("b")], end_date="2026-09-20"),
        FakeRouting(),
    )
    assert result.status == "success"
    assert all(len(route.days) == 2 for route in result.routes)
    assert all(route.routing_source == "provider" for route in result.routes)


@pytest.mark.anyio
async def test_only_one_precise_order_is_returned_for_both_options():
    def handler(origin, destination, _mode):
        if origin.name == "Seoul Station" and destination.name == "Place a":
            return leg(70)
        return leg(5)

    places = [
        place("a", close_time="11:30", stay_time_min=30),
        place("b", stay_time_min=30),
    ]
    result = await optimize_trip_precise(request(places), FakeRouting(handler, candidates=2))
    assert result.status == "success"
    assert visits(result.routes[0]) == visits(result.routes[1]) == ["b", "a"]


class CountingProvider:
    def __init__(self):
        self.calls = 0

    async def route(self, _origin, _destination):
        self.calls += 1
        return leg(12, 1500)


@pytest.mark.anyio
@pytest.mark.parametrize("mode", ["transit", "car"])
@pytest.mark.parametrize("latitude_offset", [0.0, 0.00005])
async def test_same_and_near_identical_legs_are_zero_without_provider_call(
    settings,
    mode,
    latitude_offset,
):
    provider = CountingProvider()
    routing = RoutingService(settings, kakao=provider, odsay=provider)
    origin = request([]).settings.start_location
    destination = origin.model_copy(
        update={"name": "Same physical place", "lat": origin.lat + latitude_offset}
    )

    result = await routing.route(origin, destination, mode)

    assert SAME_LOCATION_TOLERANCE_METERS == 10.0
    assert result == RoutedLeg(0, 0, 0.0, "Already at destination", "local")
    assert provider.calls == 0


@pytest.mark.anyio
@pytest.mark.parametrize("mode", ["transit", "car"])
async def test_leg_outside_same_location_tolerance_uses_provider(settings, mode):
    provider = CountingProvider()
    routing = RoutingService(settings, kakao=provider, odsay=provider)
    origin = request([]).settings.start_location
    destination = origin.model_copy(
        update={"name": "Nearby distinct place", "lat": origin.lat + 0.0002}
    )

    result = await routing.route(origin, destination, mode)

    assert result.duration_minutes == 12
    assert provider.calls == 1


@pytest.mark.anyio
async def test_precise_transit_keeps_visit_at_start_location_feasible(settings):
    provider = CountingProvider()
    routing = RoutingService(settings, odsay=provider)
    seoul_station_visit = place(
        "seoul-station",
        name="Seoul Station",
        lat=37.5547,
        lng=126.9707,
        stay_time_min=30,
    )
    korea_university = place(
        "korea-university",
        name="Korea University Seoul Campus",
        lat=37.5895,
        lng=127.0324,
        stay_time_min=30,
    )

    result = await optimize_trip_precise(
        request(
            [seoul_station_visit, korea_university],
            transport_mode="transit",
            start_time="10:00",
            end_deadline="21:00",
        ),
        routing,
    )

    assert result.status == "success"
    assert "seoul-station" in visits(result.routes[0])
    zero_legs = [
        item
        for item in result.routes[0].days[0].timeline
        if item.type == "transit" and item.duration == 0
    ]
    assert zero_legs
    assert all(item.cost == 0 for item in zero_legs)
    assert provider.calls > 0


@pytest.mark.anyio
async def test_shared_legs_hit_routing_service_cache(settings):
    provider = CountingProvider()
    routing = RoutingService(settings, odsay=provider)
    origin = request([]).settings.start_location
    destination = place("a", lng=127.0)
    await routing.route(origin, destination, "transit")
    await routing.route(origin, destination, "transit")
    assert provider.calls == 1


class FlakyProvider:
    def __init__(self):
        self.calls = 0

    async def route(self, _origin, _destination):
        self.calls += 1
        if self.calls == 1:
            raise ProviderTimeoutError("ODsay")
        return leg(12, 1500)


@pytest.mark.anyio
async def test_provider_failures_do_not_poison_routing_cache(settings):
    provider = FlakyProvider()
    routing = RoutingService(settings, odsay=provider)
    origin = request([]).settings.start_location
    destination = place("a", lng=127.0)
    with pytest.raises(ProviderTimeoutError):
        await routing.route(origin, destination, "transit")
    result = await routing.route(origin, destination, "transit")
    assert result.duration_minutes == 12
    assert provider.calls == 2
