"""Unit tests for shared time utilities."""

import pytest

from textile_scheduler.time_utils import (
    format_timestamp,
    hm_to_minutes,
    minutes_to_days,
    minutes_to_hm,
    parse_duration,
    shift_to_minutes,
)


class TestMinutesToHm:
    def test_zero(self) -> None:
        assert minutes_to_hm(0) == "0m"

    def test_minutes_only(self) -> None:
        assert minutes_to_hm(45) == "45m"

    def test_exact_hours(self) -> None:
        assert minutes_to_hm(120) == "2h"

    def test_hours_and_minutes(self) -> None:
        assert minutes_to_hm(135) == "2h 15m"

    def test_negative(self) -> None:
        assert minutes_to_hm(-90) == "-1h 30m"


class TestMinutesToDays:
    def test_exact(self) -> None:
        assert minutes_to_days(1440) == 1.0

    def test_fractional(self) -> None:
        assert minutes_to_days(720) == pytest.approx(0.5)


class TestHmToMinutes:
    def test_basic(self) -> None:
        assert hm_to_minutes(2, 30) == 150

    def test_zero(self) -> None:
        assert hm_to_minutes(0, 0) == 0

    def test_negative_rejected(self) -> None:
        with pytest.raises(ValueError):
            hm_to_minutes(-1, 0)
        with pytest.raises(ValueError):
            hm_to_minutes(0, -5)


class TestParseDuration:
    def test_hours(self) -> None:
        assert parse_duration("8h") == 480

    def test_minutes(self) -> None:
        assert parse_duration("30m") == 30

    def test_combined(self) -> None:
        assert parse_duration("1h 30m") == 90

    def test_case_and_whitespace(self) -> None:
        assert parse_duration("  2H 5M ") == 125

    def test_empty_rejected(self) -> None:
        with pytest.raises(ValueError):
            parse_duration("   ")

    def test_garbage_rejected(self) -> None:
        with pytest.raises(ValueError):
            parse_duration("tomorrow")


class TestFormatTimestamp:
    def test_midnight(self) -> None:
        assert format_timestamp(0) == "Day 1 00:00"

    def test_afternoon(self) -> None:
        assert format_timestamp(810) == "Day 1 13:30"

    def test_next_day(self) -> None:
        assert format_timestamp(1500) == "Day 2 01:00"


class TestShifts:
    def test_known_shifts(self) -> None:
        assert shift_to_minutes("shift1") == (480, 960)
        assert shift_to_minutes("shift2") == (960, 1440)
        assert shift_to_minutes("shift3") == (0, 480)

    def test_case_insensitive(self) -> None:
        assert shift_to_minutes("Shift1") == (480, 960)

    def test_unknown_rejected(self) -> None:
        with pytest.raises(ValueError, match="Unknown shift"):
            shift_to_minutes("nights")
