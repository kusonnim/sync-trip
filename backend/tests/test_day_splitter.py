import pytest

from app.optimizer.day_splitter import DayCapacityError, split_places_by_day
from tests.optimizer_helpers import place


def bucket_ids(buckets):
    return [[item.place_id for item in bucket] for bucket in buckets]


def test_day_splitting_is_deterministic():
    places = [
        place("d", lat=37.8),
        place("b", lat=37.2),
        place("a", lat=37.0),
        place("c", lat=37.5),
    ]
    assert bucket_ids(split_places_by_day(places, 2)) == bucket_ids(
        split_places_by_day(places, 2)
    )


def test_day_splitting_never_loses_or_duplicates_candidates():
    places = [place(str(index), lat=37 + index / 100) for index in range(9)]
    allocated = [item.place_id for bucket in split_places_by_day(places, 3) for item in bucket]
    assert sorted(allocated) == sorted(item.place_id for item in places)
    assert len(allocated) == len(set(allocated))


def test_empty_days_are_retained_when_places_are_fewer_than_days():
    buckets = split_places_by_day([place("a")], 3)
    assert len(buckets) == 3
    assert [len(bucket) for bucket in buckets] == [1, 0, 0]


def test_more_than_six_places_per_day_is_rejected_without_truncation():
    with pytest.raises(DayCapacityError, match="At most 6"):
        split_places_by_day([place(str(index)) for index in range(7)], 1)
