"""Independent schedule validator.

Validates a candidate schedule against a validated scenario without importing
any solver code: this module imports only domain models and the shared,
deterministic duration utility. It never repairs schedules and never declares
scenarios (in)feasible -- it reports structural violations only.

Rules (stable codes):
  R01 MISSING_OPERATION      every required order-stage appears exactly once
  R02 DUPLICATE_OPERATION    no duplicate or unexpected operations
  R03 MACHINE_INELIGIBLE     machine eligible for the order and stage
  R04 STAGE_MISMATCH         machine supports the operation's stage
  R05 BAD_INTERVAL           start is earlier than end (schema-enforced, checked defensively)
  R06 DURATION_MISMATCH      duration matches the shared duration calculation
  R07 ROUTE_PRECEDENCE       spinning -> weaving -> dyeing (scenario route order)
  R08 MACHINE_OVERLAP        no overlap on one machine, half-open [start, end)
  R09 DOWNTIME_OVERLAP       no downtime or availability-horizon overlap
  R10 YARN_READY             no start before the order's yarn-ready time
  R11 START_BEFORE_NOW       no unfrozen start before scenario.now
  R12 BEYOND_HORIZON         no operation ends past the planning horizon
  R13 QUANTITY_MISMATCH      scheduled quantity matches the order quantity
  R14 UNRESOLVED_MANDATORY   success status with missing mandatory operations
  R15 FROZEN_CHANGED         frozen/completed operations unchanged in replans
  R16 UNKNOWN_REFERENCE      machine/order IDs resolve in the scenario
  R17 BAD_TIME_VALUE         times are valid integer minutes (schema-enforced, checked defensively)

Schema-enforcement notes: R05 and R17 cannot trigger through the public
models because Pydantic rejects non-integer, negative, or inverted times at
parse time; the checks below are defensive so the rules are never silently
skipped. Completed quantities in replans are tracked per frozen operation via
``FrozenOperation.quantity_metres``; there is no cumulative inventory model.
"""

from __future__ import annotations

from collections import defaultdict

from .durations import compute_duration
from .models import (
    Scenario,
    Schedule,
    ScheduledOperation,
    SolverStatus,
    Stage,
    ValidationResult,
    ValidationViolation,
)

SUCCESS_STATUSES = (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)


class ScheduleValidator:
    """Validates a schedule against its scenario, collecting every violation."""

    def __init__(self, scenario: Scenario) -> None:
        self.scenario = scenario
        self.machine_by_id = {m.id: m for m in scenario.machines}
        self.order_by_id = {o.id: o for o in scenario.orders}
        self.orders = {o.id: o for o in scenario.orders}
        self.route_index = {stage: idx for idx, stage in enumerate(scenario.route)}
        self.frozen = {(f.order, f.stage, f.machine): f for f in scenario.frozen}

    def validate(self, schedule: Schedule) -> ValidationResult:
        """Run all rules and return every discoverable violation."""
        operations = schedule.operations
        by_pair = self._index_by_pair(operations)

        violations: list[ValidationViolation] = []
        violations.extend(self._check_time_values(operations))  # R17
        violations.extend(self._check_references(operations))  # R16
        violations.extend(self._check_missing(by_pair, schedule))  # R01
        violations.extend(self._check_duplicates(by_pair))  # R02
        violations.extend(self._check_intervals(operations))  # R05
        violations.extend(self._check_eligibility(operations))  # R03
        violations.extend(self._check_stage_support(operations))  # R04
        violations.extend(self._check_durations(operations))  # R06
        violations.extend(self._check_quantities(operations))  # R13
        violations.extend(self._check_route_order(operations))  # R07
        violations.extend(self._check_machine_overlap(operations))  # R08
        violations.extend(self._check_downtime(operations))  # R09
        violations.extend(self._check_yarn_ready(operations))  # R10
        violations.extend(self._check_now(operations))  # R11
        violations.extend(self._check_horizon(operations))  # R12
        violations.extend(self._check_status_consistency(by_pair, schedule))  # R14
        violations.extend(self._check_frozen(operations))  # R15
        return ValidationResult(violations=violations)

    def _index_by_pair(
        self, operations: list[ScheduledOperation]
    ) -> dict[tuple[str, Stage], list[ScheduledOperation]]:
        by_pair: dict[tuple[str, Stage], list[ScheduledOperation]] = defaultdict(list)
        for op in operations:
            by_pair[(op.order, op.stage)].append(op)
        return by_pair

    def _violation(
        self,
        code: str,
        rule: int,
        message: str,
        op: ScheduledOperation | None = None,
    ) -> ValidationViolation:
        return ValidationViolation(
            code=code,
            rule=rule,
            message=message,
            order=op.order if op else None,
            machine=op.machine if op else None,
            stage=op.stage if op else None,
        )

    def _check_time_values(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R17: times are valid integer minutes (schema-enforced, defensive)."""
        violations = []
        for op in operations:
            for label, value in (("start", op.start), ("end", op.end)):
                if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                    violations.append(
                        self._violation(
                            "R17_BAD_TIME_VALUE",
                            17,
                            f"Invalid {label} for {op.order} on {op.machine}: {value!r}",
                            op,
                        )
                    )
        return violations

    def _check_references(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R16: operation order and machine IDs resolve in the scenario."""
        violations = []
        for op in operations:
            if op.order not in self.orders:
                violations.append(
                    self._violation(
                        "R16_UNKNOWN_REFERENCE",
                        16,
                        f"Order {op.order} not found in scenario",
                        op,
                    )
                )
            if op.machine not in self.machine_by_id:
                violations.append(
                    self._violation(
                        "R16_UNKNOWN_REFERENCE",
                        16,
                        f"Machine {op.machine} not found in scenario",
                        op,
                    )
                )
        return violations

    def _check_missing(
        self,
        by_pair: dict[tuple[str, Stage], list[ScheduledOperation]],
        schedule: Schedule,
    ) -> list[ValidationViolation]:
        """R01: every required order-stage operation appears (completeness)."""
        del schedule  # structural check, independent of claimed status
        violations = []
        for order in self.scenario.orders:
            for stage in self.scenario.route:
                if not by_pair.get((order.id, stage)):
                    violations.append(
                        ValidationViolation(
                            code="R01_MISSING_OPERATION",
                            rule=1,
                            message=(f"Missing operation for order {order.id} stage {stage.value}"),
                            order=order.id,
                            stage=stage,
                        )
                    )
        return violations

    def _check_duplicates(
        self, by_pair: dict[tuple[str, Stage], list[ScheduledOperation]]
    ) -> list[ValidationViolation]:
        """R02: no duplicate operations for one order-stage."""
        violations = []
        for (order_id, stage), ops in sorted(
            by_pair.items(), key=lambda kv: (kv[0][0], kv[0][1].value)
        ):
            if len(ops) > 1:
                violations.append(
                    ValidationViolation(
                        code="R02_DUPLICATE_OPERATION",
                        rule=2,
                        message=(
                            f"Duplicate operation for order {order_id} "
                            f"stage {stage.value}: {len(ops)} occurrences"
                        ),
                        order=order_id,
                        stage=stage,
                    )
                )
        return violations

    def _check_intervals(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R05: start is earlier than end (schema-enforced, defensive)."""
        violations = []
        for op in operations:
            if not op.start < op.end:
                violations.append(
                    self._violation(
                        "R05_BAD_INTERVAL",
                        5,
                        f"Operation for {op.order} on {op.machine} "
                        f"does not start before it ends "
                        f"({op.start}-{op.end})",
                        op,
                    )
                )
        return violations

    def _check_eligibility(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R03: machine is eligible for the order at that stage."""
        violations = []
        for op in operations:
            order = self.orders.get(op.order)
            machine = self.machine_by_id.get(op.machine)
            if order is None or machine is None:
                continue  # R16 already reported
            eligible = order.eligible.get_machines(op.stage)
            if op.machine not in eligible:
                violations.append(
                    self._violation(
                        "R03_MACHINE_INELIGIBLE",
                        3,
                        f"Machine {op.machine} not eligible for order {op.order} "
                        f"at {op.stage.value}. Eligible: {eligible}",
                        op,
                    )
                )
        return violations

    def _check_stage_support(
        self, operations: list[ScheduledOperation]
    ) -> list[ValidationViolation]:
        """R04: the assigned machine supports the operation's stage."""
        violations = []
        for op in operations:
            machine = self.machine_by_id.get(op.machine)
            if machine is None:
                continue  # R16 already reported
            if machine.stage != op.stage:
                violations.append(
                    self._violation(
                        "R04_STAGE_MISMATCH",
                        4,
                        f"Machine {op.machine} is for {machine.stage.value}, not {op.stage.value}",
                        op,
                    )
                )
        return violations

    def _check_durations(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R06: duration matches the shared calculation for machine and quantity."""
        violations = []
        for op in operations:
            order = self.orders.get(op.order)
            machine = self.machine_by_id.get(op.machine)
            if order is None or machine is None:
                continue  # R16 already reported
            quantity = op.quantity_metres if op.quantity_metres is not None else order.metres
            expected = compute_duration(quantity, machine.rate_m_per_hour)
            actual = op.end - op.start
            if actual != expected:
                violations.append(
                    self._violation(
                        "R06_DURATION_MISMATCH",
                        6,
                        f"Duration mismatch for {op.order} on {op.machine}: "
                        f"expected {expected}min, got {actual}min",
                        op,
                    )
                )
        return violations

    def _check_quantities(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R13: scheduled quantity matches the order's required quantity."""
        violations = []
        for op in operations:
            order = self.orders.get(op.order)
            if order is None:
                continue  # R16 already reported
            if op.quantity_metres is not None and op.quantity_metres != order.metres:
                violations.append(
                    self._violation(
                        "R13_QUANTITY_MISMATCH",
                        13,
                        f"Quantity mismatch for {op.order} on {op.machine}: "
                        f"expected {order.metres}m, got {op.quantity_metres}m",
                        op,
                    )
                )
        return violations

    def _check_route_order(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R07: operations for one order follow route precedence."""
        violations = []
        by_order: dict[str, list[ScheduledOperation]] = defaultdict(list)
        for op in operations:
            if op.order in self.orders:
                by_order[op.order].append(op)

        for order_id, ops in by_order.items():
            ops_sorted = sorted(ops, key=lambda o: o.start)
            for i in range(len(ops_sorted) - 1):
                curr = ops_sorted[i]
                nxt = ops_sorted[i + 1]
                curr_idx = self.route_index.get(curr.stage, -1)
                nxt_idx = self.route_index.get(nxt.stage, -1)
                if curr_idx >= nxt_idx:
                    violations.append(
                        self._violation(
                            "R07_ROUTE_PRECEDENCE",
                            7,
                            f"Route order violated for {order_id}: "
                            f"{curr.stage.value} (t={curr.start}) >= "
                            f"{nxt.stage.value} (t={nxt.start})",
                            curr,
                        )
                    )
                if nxt.start < curr.end:
                    violations.append(
                        self._violation(
                            "R07_ROUTE_PRECEDENCE",
                            7,
                            f"Stage overlap for {order_id}: "
                            f"{curr.stage.value} ends at {curr.end}, "
                            f"{nxt.stage.value} starts at {nxt.start}",
                            curr,
                        )
                    )
        return violations

    def _check_machine_overlap(
        self, operations: list[ScheduledOperation]
    ) -> list[ValidationViolation]:
        """R08: no two operations overlap on one machine (half-open [start, end))."""
        violations = []
        by_machine: dict[str, list[ScheduledOperation]] = defaultdict(list)
        for op in operations:
            by_machine[op.machine].append(op)

        for machine_id, ops in by_machine.items():
            ops_sorted = sorted(ops, key=lambda o: o.start)
            for i in range(len(ops_sorted) - 1):
                first, second = ops_sorted[i], ops_sorted[i + 1]
                # Half-open overlap: adjacent (end == start) is allowed.
                if first.start < second.end and second.start < first.end:
                    violations.append(
                        ValidationViolation(
                            code="R08_MACHINE_OVERLAP",
                            rule=8,
                            message=(
                                f"Machine overlap on {machine_id}: "
                                f"{first.order} ({first.start}-{first.end}) "
                                f"overlaps {second.order} "
                                f"({second.start}-{second.end})"
                            ),
                            machine=machine_id,
                            order=first.order,
                        )
                    )
        return violations

    def _check_downtime(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R09: no overlap with downtime windows or the availability horizon."""
        violations = []
        for op in operations:
            machine = self.machine_by_id.get(op.machine)
            if machine is None:
                continue  # R16 already reported
            for dt in machine.downtime:
                if op.start < dt.end and op.end > dt.start:
                    violations.append(
                        self._violation(
                            "R09_DOWNTIME_OVERLAP",
                            9,
                            f"Operation overlaps downtime on {op.machine}: "
                            f"op {op.start}-{op.end}, "
                            f"downtime {dt.start}-{dt.end}",
                            op,
                        )
                    )
            if machine.available_until is not None and op.end > machine.available_until:
                violations.append(
                    self._violation(
                        "R09_DOWNTIME_OVERLAP",
                        9,
                        f"Operation exceeds availability horizon on {op.machine}: "
                        f"op ends at {op.end}, "
                        f"available until {machine.available_until}",
                        op,
                    )
                )
        return violations

    def _check_yarn_ready(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R10: no unprovisioned operation starts before its yarn-ready time.

        Frozen operations are exempt like in R11: their material was
        provisioned when they started. The same holds for a later stage
        whose direct predecessor is frozen: it processes already-committed
        material, so a later yarn delay must not retroactively invalidate it.
        """
        violations = []
        frozen_pairs = {(order, stage) for order, stage, _ in self.frozen}
        for op in operations:
            if (op.order, op.stage, op.machine) in self.frozen:
                continue
            order = self.orders.get(op.order)
            if order is None:
                continue  # R16 already reported
            idx = self.route_index.get(op.stage, 0)
            if idx > 0:
                prev_stage = self.scenario.route[idx - 1]
                if (op.order, prev_stage) in frozen_pairs:
                    continue  # material provisioned by committed history
            if op.start < order.yarn_ready:
                violations.append(
                    self._violation(
                        "R10_YARN_READY",
                        10,
                        f"Operation starts before yarn-ready: {op.order} on "
                        f"{op.machine} starts at {op.start}, "
                        f"yarn_ready={order.yarn_ready}",
                        op,
                    )
                )
        return violations

    def _check_now(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R11: no unfrozen operation starts before scenario.now."""
        violations = []
        now = self.scenario.now
        for op in operations:
            if (op.order, op.stage, op.machine) in self.frozen:
                continue  # frozen operations belong to the past by design
            if op.start < now:
                violations.append(
                    self._violation(
                        "R11_START_BEFORE_NOW",
                        11,
                        f"Operation starts before now: {op.order} on {op.machine} "
                        f"starts at {op.start}, now={now}",
                        op,
                    )
                )
        return violations

    def _check_horizon(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R12: no operation ends past the planning horizon."""
        violations = []
        horizon = self.scenario.horizon
        for op in operations:
            if op.end > horizon:
                violations.append(
                    self._violation(
                        "R12_BEYOND_HORIZON",
                        12,
                        f"Operation exceeds horizon: {op.order} on {op.machine} "
                        f"ends at {op.end}, horizon={horizon}",
                        op,
                    )
                )
        return violations

    def _check_status_consistency(
        self,
        by_pair: dict[tuple[str, Stage], list[ScheduledOperation]],
        schedule: Schedule,
    ) -> list[ValidationViolation]:
        """R14: a successful status admits no unresolved mandatory operation."""
        if schedule.status not in SUCCESS_STATUSES:
            return []  # partial schedules are expected for other statuses
        violations = []
        for order in self.scenario.orders:
            for stage in self.scenario.route:
                if not by_pair.get((order.id, stage)):
                    violations.append(
                        ValidationViolation(
                            code="R14_UNRESOLVED_MANDATORY",
                            rule=14,
                            message=(
                                f"Schedule claims {schedule.status.value} but "
                                f"mandatory operation for order {order.id} "
                                f"stage {stage.value} is unresolved"
                            ),
                            order=order.id,
                            stage=stage,
                        )
                    )
        return violations

    def _check_frozen(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """R15: frozen/completed operations remain unchanged during replanning."""
        violations: list[ValidationViolation] = []
        if not self.frozen:
            return violations
        by_key = {(op.order, op.stage, op.machine): op for op in operations}
        for key, frozen in sorted(
            self.frozen.items(), key=lambda kv: (kv[0][0], kv[0][1].value, kv[0][2])
        ):
            op = by_key.get(key)
            if op is None:
                violations.append(
                    ValidationViolation(
                        code="R15_FROZEN_CHANGED",
                        rule=15,
                        message=(
                            f"Frozen operation missing: {frozen.order} "
                            f"{frozen.stage.value} on {frozen.machine}"
                        ),
                        order=frozen.order,
                        machine=frozen.machine,
                        stage=frozen.stage,
                    )
                )
                continue
            if op.start != frozen.start or op.end != frozen.end:
                violations.append(
                    self._violation(
                        "R15_FROZEN_CHANGED",
                        15,
                        f"Frozen operation changed: {frozen.order} "
                        f"{frozen.stage.value} on {frozen.machine}. "
                        f"Expected {frozen.start}-{frozen.end}, "
                        f"got {op.start}-{op.end}",
                        op,
                    )
                )
            if (
                frozen.quantity_metres is not None
                and op.quantity_metres is not None
                and op.quantity_metres != frozen.quantity_metres
            ):
                violations.append(
                    self._violation(
                        "R15_FROZEN_CHANGED",
                        15,
                        f"Frozen quantity changed: {frozen.order} "
                        f"{frozen.stage.value} on {frozen.machine}. "
                        f"Expected {frozen.quantity_metres}m, "
                        f"got {op.quantity_metres}m",
                        op,
                    )
                )
        return violations


def validate_schedule(scenario: Scenario, schedule: Schedule) -> ValidationResult:
    """Convenience function to validate a schedule."""
    validator = ScheduleValidator(scenario)
    return validator.validate(schedule)
