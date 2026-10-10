"""Custom exceptions for the textile scheduler."""

from __future__ import annotations


class SchedulerError(Exception):
    """Base exception for scheduler errors."""

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.details = details or {}


class ValidationError(SchedulerError):
    """Raised when schedule validation fails."""

    def __init__(self, violations: list[dict], message: str = "Schedule validation failed") -> None:
        super().__init__(message, {"violations": violations})
        self.violations = violations


class InfeasibleScenarioError(SchedulerError):
    """Raised when the scenario itself is infeasible (no valid schedule exists)."""

    def __init__(self, message: str, blocking_orders: list[str] | None = None) -> None:
        super().__init__(message, {"blocking_orders": blocking_orders or []})
        self.blocking_orders = blocking_orders or []


class SolverTimeoutError(SchedulerError):
    """Raised when solver exceeds time limit without finding a solution."""

    def __init__(self, time_limit_seconds: float, best_objective: float | None = None) -> None:
        msg = f"Solver timed out after {time_limit_seconds}s"
        if best_objective is not None:
            msg += f", best objective: {best_objective}"
        super().__init__(
            msg, {"time_limit_seconds": time_limit_seconds, "best_objective": best_objective}
        )


class SolverError(SchedulerError):
    """Raised when OR-Tools solver returns an error status."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"Solver error (status={status}): {message}", {"status": status})


class DisruptionError(SchedulerError):
    """Raised when disruption handling fails."""

    def __init__(self, message: str, disruption_type: str, details: dict | None = None) -> None:
        super().__init__(message, {"disruption_type": disruption_type, **(details or {})})


class DataError(SchedulerError):
    """Raised when input data is malformed or inconsistent."""

    pass
