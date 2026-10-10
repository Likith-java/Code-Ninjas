"""Unit tests for durations module."""

import pytest

from textile_scheduler.durations import compute_duration, compute_end_time
from textile_scheduler.models import Stage


class TestComputeDuration:
    """Tests for compute_duration function."""

    def test_basic_duration(self) -> None:
        """Test basic duration calculation."""
        # 2400m at 60 m/hr = 40 hours = 2400 minutes
        assert compute_duration(2400, 60) == 2400

    def test_duration_rounding_up(self) -> None:
        """Test that duration rounds up."""
        # 100m at 60 m/hr = 1.666... hours = 100 minutes exactly
        # 101m at 60 m/hr = 1.683... hours = 101 minutes (ceiling)
        assert compute_duration(100, 60) == 100
        assert compute_duration(101, 60) == 101  # ceil(101) = 101

    def test_small_values(self) -> None:
        """Test with small values."""
        # 1m at 1 m/hr = 60 minutes
        assert compute_duration(1, 1) == 60

    def test_exact_hours(self) -> None:
        """Test exact hour boundaries."""
        # 60m at 60 m/hr = 1 hour = 60 minutes
        assert compute_duration(60, 60) == 60
        # 120m at 60 m/hr = 2 hours = 120 minutes
        assert compute_duration(120, 60) == 120

    def test_various_rates(self) -> None:
        """Test various machine rates."""
        # 1000m at 50 m/hr = 20 hours = 1200 minutes
        assert compute_duration(1000, 50) == 1200
        # 1000m at 40 m/hr = 25 hours = 1500 minutes
        assert compute_duration(1000, 40) == 1500
        # 1000m at 30 m/hr = 33.33 hours = 2000 minutes
        assert compute_duration(1000, 30) == 2000

    def test_zero_metres_raises(self) -> None:
        """Test that zero metres raises ValueError."""
        with pytest.raises(ValueError, match="metres must be positive"):
            compute_duration(0, 60)

    def test_negative_metres_raises(self) -> None:
        """Test that negative metres raises ValueError."""
        with pytest.raises(ValueError, match="metres must be positive"):
            compute_duration(-100, 60)

    def test_zero_rate_raises(self) -> None:
        """Test that zero rate raises ValueError."""
        with pytest.raises(ValueError, match="rate_m_per_hour must be positive"):
            compute_duration(1000, 0)

    def test_negative_rate_raises(self) -> None:
        """Test that negative rate raises ValueError."""
        with pytest.raises(ValueError, match="rate_m_per_hour must be positive"):
            compute_duration(1000, -10)


class TestComputeEndTime:
    """Tests for compute_end_time function."""

    def test_basic_end_time(self) -> None:
        """Test basic end time calculation."""
        start = 100
        end = compute_end_time(start, 2400, 60)
        assert end == start + 2400  # 2400 minutes duration
