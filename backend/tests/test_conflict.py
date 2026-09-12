from app.optimizer.conflict import find_reservation_conflict
from tests.optimizer_helpers import place


def test_reservation_conflict_names_and_identifies_both_places():
    first = place(
        "a",
        name="Early Museum",
        stay_time_min=60,
        hard_constraint={"start": "18:00", "end": "18:00"},
    )
    second = place(
        "b",
        name="Late Tower",
        hard_constraint={"start": "18:10", "end": "18:10"},
    )
    conflict = find_reservation_conflict([first, second], "transit")
    assert conflict is not None
    assert conflict.place_ids == ("a", "b")
    assert "Early Museum" in conflict.message
    assert "Late Tower" in conflict.message


def test_conflict_uses_chronological_direction_not_input_order():
    later_input_first = place(
        "later",
        stay_time_min=1,
        hard_constraint={"start": "18:10", "end": "18:10"},
    )
    earlier_input_second = place(
        "earlier",
        stay_time_min=60,
        hard_constraint={"start": "18:00", "end": "18:00"},
    )
    conflict = find_reservation_conflict(
        [later_input_first, earlier_input_second],
        "transit",
    )
    assert conflict is not None
    assert conflict.place_ids == ("earlier", "later")
