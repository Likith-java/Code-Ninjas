"""Single shared duration function for all schedulers and validator.

Duration = ceil(metres / rate_m_per_hour * 60) minutes.
This is the ONLY place this calculation lives.
"""

from __future__ import annotations

from math import ceil


def compute_duration(metres: int, rate_m_per_hour: int) -> int:
    """Compute operation duration in integer minutes.

    Args:
        metres: Total metres to process (positive integer)
        rate_m_per_hour: Machine rate in metres per hour (positive integer)

    Returns:
        Duration in minutes, rounded up to the next integer minute.

    Raises:
        ValueError: If inputs are not positive integers.
    """
    if metres <= 0:
        raise ValueError(f"metres must be positive, got {metres}")
    if rate_m_per_hour <= 0:
        raise ValueError(f"rate_m_per_hour must be positive, got {rate_m_per_hour}")

    # ceil(metres / rate * 60) = ceil(metres * 60 / rate)
    return ceil(metres * 60 / rate_m_per_hour)


def compute_end_time(start: int, metres: int, rate_m_per_hour: int) -> int:
    """Compute end time given start, metres, and rate."""
    return start + compute_duration(metres, rate_m_per_hour)
