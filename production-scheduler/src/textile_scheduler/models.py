"""Pydantic models for scenario input and schedule output."""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Stage(str, Enum):
    """Production route stages in order."""

    SPINNING = "spinning"
    WEAVING = "weaving"
    DYEING = "dyeing"


class SchedulerType(str, Enum):
    """Scheduler algorithm identifier."""

    EDF = "edf"
    CP_SAT = "cpsat"


class SolverStatus(str, Enum):
    """OR-Tools solver termination status."""

    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    UNKNOWN = "UNKNOWN"
    MODEL_INVALID = "MODEL_INVALID"


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
    """Machine downtime window."""

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    from_minute: Annotated[int, Field(ge=0, alias="from")]
    to_minute: Annotated[int, Field(ge=0, alias="to")]
    reason: str | None = None

    @field_validator("to_minute")
    @classmethod
    def _end_after_start(cls, v: int, info) -> int:
        if "from_minute" in info.data and v <= info.data["from_minute"]:
            raise ValueError("to_minute must be greater than from_minute")
        return v


class Machine(BaseModel):
    """Machine definition with eligibility and downtime."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: Annotated[str, Field(min_length=1, pattern=r"^[A-Z0-9\-]+$")]
    stage: Stage
    rate_m_per_hour: Annotated[int, Field(gt=0, le=1000)]
    downtime: list[DowntimeWindow] = Field(default_factory=list)
    status: MachineStatus = MachineStatus.IDLE
    current_order: str | None = None
    progress_pct: Annotated[int, Field(ge=0, le=100)] = 0


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

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: Annotated[str, Field(min_length=1, pattern=r"^[A-Z0-9\-]+$")]
    buyer: str
    fabric: str
    colour: str
    metres: Annotated[int, Field(gt=0, le=100000)]
    due: Annotated[int, Field(ge=0)]
    priority_weight: Annotated[int, Field(ge=1, le=10)]
    yarn_ready: Annotated[int, Field(ge=0, alias="yarn_ready")]
    eligible: OrderEligibility

    @field_validator("eligible", mode="before")
    @classmethod
    def _normalize_eligibility(cls, v: dict | OrderEligibility) -> OrderEligibility:
        if isinstance(v, dict):
            return OrderEligibility(**v)
        return v


class FrozenOperation(BaseModel):
    """Pre-fixed operation that cannot be moved during re-plan."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    order: str
    stage: Stage
    machine: str
    start: Annotated[int, Field(ge=0)]
    end: Annotated[int, Field(ge=0)]

    @field_validator("end")
    @classmethod
    def _end_after_start(cls, v: int, info) -> int:
        if "start" in info.data and v <= info.data["start"]:
            raise ValueError("end must be greater than start")
        return v


class Scenario(BaseModel):
    """Complete scheduling scenario input."""

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    name: Annotated[str, Field(min_length=1)]
    synthetic: bool = True
    now: Annotated[int, Field(ge=0)] = 0
    horizon: Annotated[int, Field(gt=0, le=100000)] = 10080
    route: list[Stage] = Field(
        default_factory=lambda: [Stage.SPINNING, Stage.WEAVING, Stage.DYEING]
    )
    machines: list[Machine]
    orders: list[Order]
    frozen: list[FrozenOperation] = Field(default_factory=list)

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


class ScheduledOperation(BaseModel):
    """Single scheduled operation in the output plan."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    order: str
    stage: Stage
    machine: str
    start: Annotated[int, Field(ge=0)]
    end: Annotated[int, Field(ge=0)]

    @field_validator("end")
    @classmethod
    def _end_after_start(cls, v: int, info) -> int:
        if "start" in info.data and v <= info.data["start"]:
            raise ValueError("end must be greater than start")
        return v


class ValidationViolation(BaseModel):
    """Single validation rule violation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rule: Annotated[int, Field(ge=1, le=8)]
    message: str
    order: str | None = None
    machine: str | None = None
    stage: Stage | None = None


class ValidationResult(BaseModel):
    """Validation outcome."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    violations: list[ValidationViolation] = Field(default_factory=list)

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
    """Complete schedule output with validation and metrics."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    scenario: str
    scheduler: SchedulerType
    status: SolverStatus
    compute_seconds: Annotated[float, Field(ge=0)]
    validation: ValidationResult
    metrics: ScheduleMetrics
    operations: list[ScheduledOperation]


class DisruptionType(str, Enum):
    """Types of disruptions that trigger re-planning."""

    MACHINE_DOWN = "machine_down"
    YARN_DELAY = "yarn_delay"


class Disruption(BaseModel):
    """Disruption event for re-planning."""

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    type: DisruptionType
    now: Annotated[int, Field(ge=0)]
    machine: str | None = None
    from_minute: Annotated[int | None, Field(ge=0, alias="from")] = None
    to_minute: Annotated[int | None, Field(ge=0, alias="to")] = None
    order: str | None = None
    hours: Annotated[int | None, Field(gt=0, le=168)] = None

    @field_validator("from_minute", "to_minute", mode="before")
    @classmethod
    def _allow_none(cls, v):
        return v

    def model_post_init(self, __context) -> None:
        if self.type == DisruptionType.MACHINE_DOWN:
            if not self.machine:
                raise ValueError("machine_down requires machine")
            if self.from_minute is None or self.to_minute is None:
                raise ValueError("machine_down requires from and to")
        elif self.type == DisruptionType.YARN_DELAY:
            if not self.order:
                raise ValueError("yarn_delay requires order")
            if self.hours is None:
                raise ValueError("yarn_delay requires hours")
