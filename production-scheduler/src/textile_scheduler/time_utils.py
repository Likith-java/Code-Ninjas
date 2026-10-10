"""Time conversion utilities for the scheduler.

All internal times are integer minutes from scenario start.
This module provides conversions for display and external interfaces.
"""

from __future__ import annotations


def minutes_to_hm(minutes: int) -> str:
    """Convert minutes to human-readable 'Xh Ym' format."""
    if minutes < 0:
        return f"-{minutes_to_hm(-minutes)}"
    hours = minutes // 60
    mins = minutes % 60
    if hours == 0:
        return f"{mins}m"
    if mins == 0:
        return f"{hours}h"
    return f"{hours}h {mins}m"


def minutes_to_days(minutes: int) -> float:
    """Convert minutes to fractional days."""
    return minutes / 1440.0


def hm_to_minutes(hours: int, minutes: int) -> int:
    """Convert hours and minutes to total minutes."""
    if hours < 0 or minutes < 0:
        raise ValueError("Hours and minutes must be non-negative")
    return hours * 60 + minutes


def parse_duration(text: str) -> int:
    """Parse duration strings like '8h', '30m', '1h 30m' into minutes."""
    text = text.strip().lower()
    if not text:
        raise ValueError("Empty duration string")

    total = 0
    parts = text.replace("h", "h ").replace("m", "m ").split()
    for part in parts:
        if part.endswith("h"):
            total += int(part[:-1]) * 60
        elif part.endswith("m"):
            total += int(part[:-1])
        else:
            raise ValueError(f"Invalid duration part: {part}")
    return total


def format_timestamp(minutes: int, base_day: int = 0) -> str:
    """Format minutes as 'Day N HH:MM' for display."""
    day = base_day + minutes // 1440
    mins_in_day = minutes % 1440
    hour = mins_in_day // 60
    minute = mins_in_day % 60
    return f"Day {day + 1} {hour:02d}:{minute:02d}"


def shift_to_minutes(shift_name: str) -> tuple[int, int]:
    """Convert shift name to (start_minute, end_minute) tuple.

    Standard shifts:
    - shift1: 08:00-16:00 (480-960)
    - shift2: 16:00-00:00 (960-1440)
    - shift3: 00:00-08:00 (0-480, 1440-1920)
    """
    shifts = {
        "shift1": (480, 960),
        "shift2": (960, 1440),
        "shift3": (0, 480),
    }
    key = shift_name.lower().replace(" ", "")
    if key not in shifts:
        raise ValueError(f"Unknown shift: {shift_name}. Known: {list(shifts.keys())}")
    return shifts[key]
