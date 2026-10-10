"""Typed domain models and JSON contracts for the textile production scheduler.

Contract version: 1 (see ``CONTRACT_VERSION``).

Design notes
------------
- All times are integer minutes relative to ``Scenario.start`` (when set) or
  relative to minute 0. Durations are computed ONLY by
  :func:`textile_scheduler.durations.compute_duration` as
  ``ceil(quantity_metres / rate_m_per_hour * 60)``.
- Models are frozen Pydantic models with ``extra="forbid"``: unknown fields
  are rejected so the external JSON format stays explicit and stable.
- Canonical JSON keys are the field names below. ``validation_alias`` entries
  accept a small set of legacy spellings (``name`` for ``scenario_id``,
  ``synthetic`` for ``synthetic_data``, ``from``/``to`` for downtime
  ``start``/``end``) so files written against contract 0 parse unchanged.
- The model layer is independent of persistence and HTTP frameworks: it only
  depends on Pydantic and the standard library.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated
from uuid import uuid4

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

CONTRACT_VERSION = "1"


class Stage(str, Enum):
    """Production route stages in order."""

    SPINNING = "spinning"
    WEAVING = "weaving"
    DYEING = "dyeing"


#: Default three-stage route required by the domain.
DEFAULT_ROUTE: list[Stage] = [Stage.SPINNING, Stage.WEAVING, Stage.DYEING]


class SchedulerType(str, Enum):
    """Scheduler/solver algorithm identifier (solver name vocabulary)."""

    EDF = "edf"
    CP_SAT = "cpsat"


class SolverStatus(str, Enum):
    """Solver termination status (stable vocabulary, never fabricated)."""

    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    UNKNOWN = "UNKNOWN"
    MODEL_INVALID = "MODEL_INVALID"


class ValidationStatus(str, Enum):
    """Independent validation outcome derived from the violation list."""

    VALID = "valid"
    INVALID = "invalid"


class Severity(str, Enum):
    """Violation severity."""

    ERROR = "error"
    WARNING = "warning"


class MachineStatus(str, Enum):
    """Runtime machine state."""

    IDLE = "idle"
    RUNNING = "running"
    DOWN = "down"
    MAINTENANCE = "maintenance"


class Priority(str, Enum):
    """Order priority levels."""

    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class DowntimeWindow(BaseModel):
    """Machine downtime window with start, end, and reason.

    Canonical keys are ``start``/``end``. The legacy spellings ``from``,
    ``to``, ``from_minute`` and ``to_minute`` are accepted on input.
    """

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    start: Annotated[
        int, Field(ge=0, validation_alias=AliasChoices("start", "from", "from_minute"))
    ]
    end: Annotated[int, Field(ge=0, validation_alias=AliasChoices("end", "to", "to_minute"))]
    reason: str | None = None

    @field_validator("end")
    @classmethod
    def _end_after_start(cls, v: int, info) -> int:
        if "start" in info.data and v <= info.data["start"]:
            raise ValueError("end must be greater than start")
        return v


class Machine(BaseModel):
    """Machine definition with stage, rate, downtime, and availability."""

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    id: Annotated[str, Field(min_length=1, pattern=r"^[A-Z0-9\-]+$")]
    stage: Stage
    rate_m_per_hour: Annotated[int, Field(gt=0, le=1000)]
    downtime: list[DowntimeWindow] = Field(default_factory=list)
    available_until: Annotated[int | None, Field(ge=0)] = None
    status: MachineStatus = MachineStatus.IDLE
    current_order: str | None = None
    progress_pct: Annotated[int, Field(ge=0, le=100)] = 0

    @field_validator("downtime")
    @classmethod
    def _downtime_must_not_overlap(cls, v: list[DowntimeWindow]) -> list[DowntimeWindow]:
        ordered = sorted(v, key=lambda w: (w.start, w.end))
        for first, second in zip(ordered, ordered[1:]):
            if second.start < first.end:
                raise ValueError(
                    f"downtime windows overlap: {first.start}-{first.end} "
                    f"and {second.start}-{second.end}"
                )
        return v


class OrderEligibility(BaseModel):
    """Eligible machines per stage for an order."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    spinning: list[str] = Field(default_factory=list)
    weaving: list[str] = Field(default_factory=list)
    dyeing: list[str] = Field(default_factory=list)

    def get_machines(self, stage: Stage) -> list[str]:
        return getattr(self, stage.value)


class Order(BaseModel):
    """Production order with routing and timing constraints."""

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    id: Annotated[str, Field(min_length=1, pattern=r"^[A-Z0-9\-]+$")]
    buyer: str | None = None
    fabric: str | None = None
    colour: str | None = None
    metres: Annotated[
        int,
        Field(
            gt=0,
            le=100000,
            validation_alias=AliasChoices("metres", "quantity_metres", "quantity"),
        ),
    ]
    ordered_at: Annotated[
        int,
        Field(
            ge=0,
            validation_alias=AliasChoices("ordered_at", "order_time", "order_timestamp"),
        ),
    ] = 0
    due: Annotated[int, Field(ge=0, validation_alias=AliasChoices("due", "due_time"))]
    priority_weight: Annotated[int, Field(ge=1, le=10)]
    yarn_ready: Annotated[
        int, Field(ge=0, validation_alias=AliasChoices("yarn_ready", "yarn_ready_time"))
    ] = 0
    eligible: OrderEligibility

    @field_validator("eligible", mode="before")
    @classmethod
    def _normalize_eligibility(cls, v: dict | OrderEligibility) -> OrderEligibility:
        if isinstance(v, dict):
            return OrderEligibility(**v)
        return v


class FrozenOperation(BaseModel):
    """Pre-fixed operation that cannot be moved during re-plan.

    ``quantity_metres`` optionally records the completed quantity for a
    partially finished operation; the validator checks it against the
    schedule when both are present. There is no cumulative inventory model:
    this field tracks per-operation progress only.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    order: str
    stage: Stage
    machine: str
    start: Annotated[int, Field(ge=0)]
    end: Annotated[int, Field(ge=0)]
    quantity_metres: Annotated[int | None, Field(gt=0, le=100000)] = None

    @field_validator("end")
    @classmethod
    def _end_after_start(cls, v: int, info) -> int:
        if "start" in info.data and v <= info.data["start"]:
            raise ValueError("end must be greater than start")
        return v


class Scenario(BaseModel):
    """Complete scheduling scenario input (public contract)."""

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    scenario_id: Annotated[
        str, Field(min_length=1, validation_alias=AliasChoices("scenario_id", "name"))
    ]
    description: str = ""
    synthetic_data: bool = Field(
        default=True, validation_alias=AliasChoices("synthetic_data", "synthetic")
    )
    start: Annotated[
        datetime | None,
        Field(validation_alias=AliasChoices("start", "start_time", "scenario_start")),
    ] = None
    now: Annotated[int, Field(ge=0)] = 0
    horizon: Annotated[
        int,
        Field(gt=0, le=100000, validation_alias=AliasChoices("horizon", "planning_horizon")),
    ] = 10080
    route: list[Stage] = Field(default_factory=lambda: list(DEFAULT_ROUTE))
    machines: list[Machine]
    orders: list[Order]
    frozen: list[FrozenOperation] = Field(default_factory=list)

    @field_validator("route")
    @classmethod
    def _route_must_be_usable(cls, v: list[Stage]) -> list[Stage]:
        if not v:
            raise ValueError("route must list at least one stage")
        if len(set(v)) != len(v):
            raise ValueError("route stages must be unique")
        return v

    @field_validator("orders")
    @classmethod
    def _unique_order_ids(cls, v: list[Order]) -> list[Order]:
        ids = [o.id for o in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate order IDs found")
        return v

    @field_validator("machines")
    @classmethod
    def _unique_machine_ids(cls, v: list[Machine]) -> list[Machine]:
        ids = [m.id for m in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate machine IDs found")
        return v

    @field_validator("frozen")
    @classmethod
    def _frozen_refs_exist(cls, v: list[FrozenOperation], info) -> list[FrozenOperation]:
        if not info.data:
            return v
        order_ids = {o.id for o in info.data.get("orders", [])}
        machine_ids = {m.id for m in info.data.get("machines", [])}
        for f in v:
            if f.order not in order_ids:
                raise ValueError(f"Frozen operation references unknown order: {f.order}")
            if f.machine not in machine_ids:
                raise ValueError(f"Frozen operation references unknown machine: {f.machine}")
        return v

    @property
    def is_default_route(self) -> bool:
        """Whether the scenario uses the required three-stage route."""
        return list(self.route) == list(DEFAULT_ROUTE)


class ScheduledOperation(BaseModel):
    """Single scheduled operation in the output plan.

    ``duration`` is filled from ``end - start`` when omitted and is rejected
    when it contradicts ``end - start``. ``quantity_metres`` echoes the
    order quantity processed by this operation when known.
    """

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    order: str
    stage: Stage
    machine: str
    start: Annotated[int, Field(ge=0)]
    end: Annotated[int, Field(ge=0)]
    duration: Annotated[int | None, Field(gt=0)] = None
    quantity_metres: Annotated[int | None, Field(gt=0, le=100000)] = None

    @field_validator("end")
    @classmethod
    def _end_after_start(cls, v: int, info) -> int:
        if "start" in info.data and v <= info.data["start"]:
            raise ValueError("end must be greater than start")
        return v

    @model_validator(mode="after")
    def _fill_or_check_duration(self) -> ScheduledOperation:
        actual = self.end - self.start
        if self.duration is None:
            object.__setattr__(self, "duration", actual)
        elif self.duration != actual:
            raise ValueError(f"duration {self.duration} contradicts start/end ({actual} minutes)")
        return self


class ValidationViolation(BaseModel):
    """Single validation rule violation.

    ``code`` is the stable contract identifier (e.g. ``R06_DURATION_MISMATCH``);
    ``rule`` is the numeric rule order 1-17 kept for readability.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: Annotated[str, Field(min_length=1)]
    rule: Annotated[int, Field(ge=1, le=17)]
    severity: Severity = Severity.ERROR
    message: str
    order: str | None = None
    machine: str | None = None
    stage: Stage | None = None


class ValidationResult(BaseModel):
    """Independent validation outcome: status derived from the violation list."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    status: ValidationStatus = ValidationStatus.VALID
    violations: list[ValidationViolation] = Field(default_factory=list)

    @model_validator(mode="after")
    def _derive_status(self) -> ValidationResult:
        object.__setattr__(
            self,
            "status",
            ValidationStatus.INVALID if self.violations else ValidationStatus.VALID,
        )
        return self

    @property
    def is_valid(self) -> bool:
        return len(self.violations) == 0


class ScheduleMetrics(BaseModel):
    """Key performance metrics for a schedule."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    weighted_tardiness: Annotated[float, Field(ge=0)] = 0.0
    on_time_rate: Annotated[float, Field(ge=0, le=1)] = 1.0
    utilisation: Annotated[float, Field(ge=0, le=1)] = 0.0
    makespan: Annotated[int, Field(ge=0)] = 0


class Schedule(BaseModel):
    """Complete schedule output with validation and metrics (public contract)."""

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    id: str = Field(default_factory=lambda: uuid4().hex[:12])
    scenario_id: Annotated[
        str, Field(min_length=1, validation_alias=AliasChoices("scenario_id", "scenario"))
    ]
    solver: SchedulerType = Field(
        validation_alias=AliasChoices("solver", "scheduler", "solver_name")
    )
    status: SolverStatus
    compute_seconds: Annotated[
        float,
        Field(
            ge=0,
            validation_alias=AliasChoices(
                "compute_seconds", "solve_time_seconds", "wall_clock_seconds"
            ),
        ),
    ]
    validation: ValidationResult
    metrics: ScheduleMetrics
    operations: list[ScheduledOperation]
    warnings: list[str] = Field(default_factory=list)
    diagnostics: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class FailureResult(BaseModel):
    """Machine-readable failure result when no schedule can be produced."""

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    scenario_id: str | None = None
    solver: SchedulerType | None = None
    status: SolverStatus = SolverStatus.MODEL_INVALID
    error: Annotated[str, Field(min_length=1)]
    details: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class DisruptionType(str, Enum):
    """Types of disruptions that trigger re-planning."""

    MACHINE_DOWN = "machine_down"
    YARN_DELAY = "yarn_delay"


class Disruption(BaseModel):
    """Disruption event for re-planning.

    Machine breakdowns carry an optional human-readable reason used for the
    downtime window. Yarn delays carry either ``delay_minutes`` (canonical)
    or ``hours`` (legacy). Lot-level tracking is not modeled: delays apply
    at order level only.
    """

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    type: DisruptionType
    now: Annotated[int, Field(ge=0)]
    machine: str | None = None
    from_minute: Annotated[int | None, Field(ge=0, alias="from")] = None
    to_minute: Annotated[int | None, Field(ge=0, alias="to")] = None
    reason: str | None = None
    order: str | None = None
    hours: Annotated[int | None, Field(gt=0, le=168)] = None
    delay_minutes: Annotated[
        int | None,
        Field(
            gt=0,
            le=10080,
            validation_alias=AliasChoices("delay_minutes", "minutes", "delay"),
        ),
    ] = None

    @field_validator("from_minute", "to_minute", mode="before")
    @classmethod
    def _allow_none(cls, v):
        return v

    @property
    def delay_total_minutes(self) -> int:
        """Effective yarn delay in minutes (canonical field wins)."""
        if self.delay_minutes is not None:
            return self.delay_minutes
        return (self.hours or 0) * 60

    def model_post_init(self, __context) -> None:
        if self.type == DisruptionType.MACHINE_DOWN:
            if not self.machine:
                raise ValueError("machine_down requires machine")
            if self.from_minute is None or self.to_minute is None:
                raise ValueError("machine_down requires from and to")
        elif self.type == DisruptionType.YARN_DELAY:
            if not self.order:
                raise ValueError("yarn_delay requires order")
            if self.hours is None and self.delay_minutes is None:
                raise ValueError("yarn_delay requires hours or delay_minutes")
