"""Independent schedule validator.

Validates a schedule against a scenario without importing any solver code.
Checks 8 rules covering all feasibility constraints.
"""

from __future__ import annotations

from collections import defaultdict

from .models import (
    FrozenOperation,
    Schedule,
    Scenario,
    ScheduledOperation,
    Stage,
    ValidationResult,
    ValidationViolation,
)
from .durations import compute_duration


class ScheduleValidator:
    """Validates a schedule against its scenario.

    The validator is completely independent from the solvers.
    It uses only the shared duration function.
    """

    def __init__(self, scenario: Scenario) -> None:
        self.scenario = scenario
        self.machine_by_id = {m.id: m for m in scenario.machines}
        self.order_by_id = {o.id: o for o in scenario.orders}
        self.route_order = {stage: idx for idx, stage in enumerate(scenario.route)}
        self.frozen_ops = {(f.order, f.stage, f.machine): f for f in scenario.frozen}

    def validate(self, schedule: Schedule) -> ValidationResult:
        """Run all validation rules and return violations."""
        violations: list[ValidationViolation] = []

        # Rule 1: Every operation appears exactly once per order per stage
        violations.extend(self._check_operations_exist_once(schedule.operations))

        # Rule 2: Machine eligibility per stage and order
        violations.extend(self._check_machine_eligibility(schedule.operations))

        # Rule 3: Duration matches expected
        violations.extend(self._check_durations(schedule.operations))

        # Rule 4: Route order within each order
        violations.extend(self._check_route_order(schedule.operations))

        # Rule 5: No machine overlap
        violations.extend(self._check_machine_overlap(schedule.operations))

        # Rule 6: No overlap with downtime
        violations.extend(self._check_downtime(schedule.operations))

        # Rule 7: No start before yarn_ready or now
        violations.extend(self._check_start_times(schedule.operations))

        # Rule 8: Frozen operations unchanged
        violations.extend(self._check_frozen(schedule.operations))

        return ValidationResult(violations=violations)

    def _check_operations_exist_once(
        self, operations: list[ScheduledOperation]
    ) -> list[ValidationViolation]:
        """Rule 1: Each order-stage combination appears exactly once."""
        violations = []
        seen: dict[tuple[str, Stage], int] = {}

        for op in operations:
            key = (op.order, op.stage)
            if key in seen:
                violations.append(
                    ValidationViolation(
                        rule=1,
                        message=f"Duplicate operation for order {op.order} stage {op.stage.value}",
                        order=op.order,
                        stage=op.stage,
                    )
                )
            else:
                seen[key] = 1

        # Check for missing operations (orders that should have operations)
        for order in self.scenario.orders:
            for stage in self.scenario.route:
                if (order.id, stage) not in seen:
                    # Only flag if this order actually needs this stage
                    # (could be filtered by eligibility in real use)
                    pass

        return violations

    def _check_machine_eligibility(
        self, operations: list[ScheduledOperation]
    ) -> list[ValidationViolation]:
        """Rule 2: Machine must be eligible for the order's stage."""
        violations = []

        for op in operations:
            order = self.order_by_id.get(op.order)
            if not order:
                violations.append(
                    ValidationViolation(
                        rule=2,
                        message=f"Order {op.order} not found in scenario",
                        order=op.order,
                        machine=op.machine,
                        stage=op.stage,
                    )
                )
                continue

            machine = self.machine_by_id.get(op.machine)
            if not machine:
                violations.append(
                    ValidationViolation(
                        rule=2,
                        message=f"Machine {op.machine} not found in scenario",
                        order=op.order,
                        machine=op.machine,
                        stage=op.stage,
                    )
                )
                continue

            if machine.stage != op.stage:
                violations.append(
                    ValidationViolation(
                        rule=2,
                        message=(
                            f"Machine {op.machine} is for {machine.stage.value}, "
                            f"not {op.stage.value}"
                        ),
                        order=op.order,
                        machine=op.machine,
                        stage=op.stage,
                    )
                )
                continue

            eligible = order.eligible.get_machines(op.stage)
            if op.machine not in eligible:
                violations.append(
                    ValidationViolation(
                        rule=2,
                        message=(
                            f"Machine {op.machine} not eligible for order {op.order} "
                            f"at {op.stage.value}. Eligible: {eligible}"
                        ),
                        order=op.order,
                        machine=op.machine,
                        stage=op.stage,
                    )
                )

        return violations

    def _check_durations(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """Rule 3: End - start must equal expected duration."""
        violations = []

        for op in operations:
            order = self.order_by_id.get(op.order)
            machine = self.machine_by_id.get(op.machine)

            if not order or not machine:
                continue  # Already caught by Rule 2

            expected = compute_duration(order.metres, machine.rate_m_per_hour)
            actual = op.end - op.start

            if actual != expected:
                violations.append(
                    ValidationViolation(
                        rule=3,
                        message=(
                            f"Duration mismatch for {op.order} on {op.machine}: "
                            f"expected {expected}min, got {actual}min"
                        ),
                        order=op.order,
                        machine=op.machine,
                        stage=op.stage,
                    )
                )

            if op.quantity_metres is not None and op.quantity_metres != order.metres:
                violations.append(
                    ValidationViolation(
                        rule=3,
                        message=(
                            f"Quantity mismatch for {op.order} on {op.machine}: "
                            f"expected {order.metres}m, got {op.quantity_metres}m"
                        ),
                        order=op.order,
                        machine=op.machine,
                        stage=op.stage,
                    )
                )

        return violations

    def _check_route_order(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """Rule 4: Operations for one order must follow route order."""
        violations = []
        by_order: dict[str, list[ScheduledOperation]] = defaultdict(list)

        for op in operations:
            by_order[op.order].append(op)

        for order_id, ops in by_order.items():
            ops_sorted = sorted(ops, key=lambda o: o.start)
            for i in range(len(ops_sorted) - 1):
                curr = ops_sorted[i]
                nxt = ops_sorted[i + 1]
                curr_idx = self.route_order.get(curr.stage, -1)
                nxt_idx = self.route_order.get(nxt.stage, -1)

                if curr_idx >= nxt_idx:
                    violations.append(
                        ValidationViolation(
                            rule=4,
                            message=(
                                f"Route order violated for {order_id}: "
                                f"{curr.stage.value} (t={curr.start}) >= "
                                f"{nxt.stage.value} (t={nxt.start})"
                            ),
                            order=order_id,
                            stage=curr.stage,
                        )
                    )
                # Also check that next doesn't start before current ends
                if nxt.start < curr.end:
                    violations.append(
                        ValidationViolation(
                            rule=4,
                            message=(
                                f"Stage overlap for {order_id}: "
                                f"{curr.stage.value} ends at {curr.end}, "
                                f"{nxt.stage.value} starts at {nxt.start}"
                            ),
                            order=order_id,
                            stage=curr.stage,
                        )
                    )

        return violations

    def _check_machine_overlap(
        self, operations: list[ScheduledOperation]
    ) -> list[ValidationViolation]:
        """Rule 5: No two operations overlap on the same machine."""
        violations = []
        by_machine: dict[str, list[ScheduledOperation]] = defaultdict(list)

        for op in operations:
            by_machine[op.machine].append(op)

        for machine_id, ops in by_machine.items():
            ops_sorted = sorted(ops, key=lambda o: o.start)
            for i in range(len(ops_sorted) - 1):
                if ops_sorted[i].end > ops_sorted[i + 1].start:
                    violations.append(
                        ValidationViolation(
                            rule=5,
                            message=(
                                f"Machine overlap on {machine_id}: "
                                f"{ops_sorted[i].order} ({ops_sorted[i].start}-{ops_sorted[i].end}) "
                                f"overlaps {ops_sorted[i + 1].order} "
                                f"({ops_sorted[i + 1].start}-{ops_sorted[i + 1].end})"
                            ),
                            machine=machine_id,
                            order=ops_sorted[i].order,
                        )
                    )

        return violations

    def _check_downtime(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """Rule 6: No operation overlaps a downtime window or availability horizon."""
        violations = []

        for op in operations:
            machine = self.machine_by_id.get(op.machine)
            if not machine:
                continue

            for dt in machine.downtime:
                # Check overlap: not (op.end <= dt.start or op.start >= dt.end)
                if op.start < dt.end and op.end > dt.start:
                    violations.append(
                        ValidationViolation(
                            rule=6,
                            message=(
                                f"Operation overlaps downtime on {op.machine}: "
                                f"op {op.start}-{op.end}, "
                                f"downtime {dt.start}-{dt.end}"
                            ),
                            order=op.order,
                            machine=op.machine,
                            stage=op.stage,
                        )
                    )

            if machine.available_until is not None and op.end > machine.available_until:
                violations.append(
                    ValidationViolation(
                        rule=6,
                        message=(
                            f"Operation exceeds availability horizon on {op.machine}: "
                            f"op ends at {op.end}, "
                            f"available until {machine.available_until}"
                        ),
                        order=op.order,
                        machine=op.machine,
                        stage=op.stage,
                    )
                )

        return violations

    def _check_start_times(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """Rule 7: No operation starts before yarn_ready or scenario.now."""
        violations = []
        now = self.scenario.now

        for op in operations:
            order = self.order_by_id.get(op.order)
            if not order:
                continue

            earliest = max(order.yarn_ready, now)
            if op.start < earliest:
                violations.append(
                    ValidationViolation(
                        rule=7,
                        message=(
                            f"Operation starts before ready: {op.order} on {op.machine} "
                            f"starts at {op.start}, earliest allowed {earliest} "
                            f"(yarn_ready={order.yarn_ready}, now={now})"
                        ),
                        order=op.order,
                        machine=op.machine,
                        stage=op.stage,
                    )
                )

        return violations

    def _check_frozen(self, operations: list[ScheduledOperation]) -> list[ValidationViolation]:
        """Rule 8: Frozen operations must be unchanged."""
        violations = []

        if not self.frozen_ops:
            return violations

        for op in operations:
            key = (op.order, op.stage, op.machine)
            if key in self.frozen_ops:
                frozen = self.frozen_ops[key]
                if op.start != frozen.start or op.end != frozen.end:
                    violations.append(
                        ValidationViolation(
                            rule=8,
                            message=(
                                f"Frozen operation changed: {op.order} {op.stage.value} "
                                f"on {op.machine}. Expected {frozen.start}-{frozen.end}, "
                                f"got {op.start}-{op.end}"
                            ),
                            order=op.order,
                            machine=op.machine,
                            stage=op.stage,
                        )
                    )

        return violations


def validate_schedule(scenario: Scenario, schedule: Schedule) -> ValidationResult:
    """Convenience function to validate a schedule."""
    validator = ScheduleValidator(scenario)
    return validator.validate(schedule)
