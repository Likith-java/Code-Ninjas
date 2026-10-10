"""Unit tests for baseline (EDF) scheduler."""

import pytest

from textile_scheduler.models import (
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    Stage,
    DowntimeWindow,
    FrozenOperation,
)
from textile_scheduler.baseline import EDFScheduler, run_edf_baseline
from textile_scheduler.validator import validate_schedule
from textile_scheduler.models import Schedule, SchedulerType, SolverStatus, ValidationResult
from textile_scheduler.metrics import compute_metrics


def create_simple_scenario(
    *,
    now: int = 0,
    orders_override: list | None = None,
    machines_override: list | None = None,
    frozen_override: list | None = None,
) -> Scenario:
    """Create a simple feasible scenario with optional overrides."""
    machines = machines_override or [
        Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
        Machine(id="SPIN-02", stage=Stage.SPINNING, rate_m_per_hour=50),
        Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
        Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
    ]
    orders = orders_override or [
        Order(
            id="ORD-001",
            buyer="Buyer A",
            fabric="Cotton",
            colour="Blue",
            metres=1200,
            due=9000,
            priority_weight=3,
            yarn_ready=0,
            eligible=OrderEligibility(
                spinning=["SPIN-01", "SPIN-02"],
                weaving=["WEAVE-01"],
                dyeing=["DYE-01"],
            ),
        ),
        Order(
            id="ORD-002",
            buyer="Buyer B",
            fabric="Polyester",
            colour="Red",
            metres=600,
            due=6000,
            priority_weight=2,
            yarn_ready=0,
            eligible=OrderEligibility(
                spinning=["SPIN-01"],
                weaving=["WEAVE-01"],
                dyeing=["DYE-01"],
            ),
        ),
    ]
    return Scenario(
        name="simple",
        synthetic=True,
        now=now,
        horizon=10080,
        machines=machines,
        orders=orders,
        frozen=frozen_override or [],
    )


class TestEDFScheduler:
    """Tests for EDF baseline scheduler."""

    def test_simple_scenario_schedules(self) -> None:
        """Simple scenario should schedule all operations."""
        scenario = create_simple_scenario()
        operations = run_edf_baseline(scenario)

        # 2 orders * 3 stages = 6 operations
        assert len(operations) == 6

    def test_schedule_is_valid(self) -> None:
        """EDF schedule should pass validation."""
        scenario = create_simple_scenario()
        operations = run_edf_baseline(scenario)

        metrics = compute_metrics(scenario, operations)
        validation = validate_schedule(
            scenario,
            Schedule(
                scenario="simple",
                scheduler=SchedulerType.EDF,
                status=SolverStatus.FEASIBLE,
                compute_seconds=0.1,
                validation=ValidationResult(violations=[]),
                metrics=metrics,
                operations=operations,
            ),
        )

        assert validation.is_valid, f"Validation failed: {validation.violations}"

    def test_operations_have_correct_stages(self) -> None:
        """Each order should have all 3 stages."""
        scenario = create_simple_scenario()
        operations = run_edf_baseline(scenario)

        by_order: dict[str, list] = {}
        for op in operations:
            by_order.setdefault(op.order, []).append(op)

        for order_id, ops in by_order.items():
            stages = {op.stage for op in ops}
            assert stages == {Stage.SPINNING, Stage.WEAVING, Stage.DYEING}

    def test_order_by_deadline(self) -> None:
        """Orders should be scheduled by deadline (earliest first)."""
        scenario = create_simple_scenario()
        operations = run_edf_baseline(scenario)

        # ORD-002 has earlier deadline (3000) than ORD-001 (5000)
        # So ORD-002 should start first
        ord2_spin = next(
            op for op in operations if op.order == "ORD-002" and op.stage == Stage.SPINNING
        )
        ord1_spin = next(
            op for op in operations if op.order == "ORD-001" and op.stage == Stage.SPINNING
        )
        assert ord2_spin.start <= ord1_spin.start

    def test_no_machine_overlap(self) -> None:
        """No two operations should overlap on same machine."""
        scenario = create_simple_scenario()
        operations = run_edf_baseline(scenario)

        by_machine: dict[str, list] = {}
        for op in operations:
            by_machine.setdefault(op.machine, []).append(op)

        for machine_id, ops in by_machine.items():
            ops_sorted = sorted(ops, key=lambda o: o.start)
            for i in range(len(ops_sorted) - 1):
                assert ops_sorted[i].end <= ops_sorted[i + 1].start, (
                    f"Overlap on {machine_id}: {ops_sorted[i]} vs {ops_sorted[i + 1]}"
                )

    def test_respects_yarn_ready(self) -> None:
        """Operations should not start before yarn_ready."""
        # Create scenario with modified yarn_ready for ORD-001
        orders = [
            Order(
                id="ORD-001",
                buyer="Buyer A",
                fabric="Cotton",
                colour="Blue",
                metres=1200,
                due=9000,
                priority_weight=3,
                yarn_ready=1000,  # Modified
                eligible=OrderEligibility(
                    spinning=["SPIN-01", "SPIN-02"],
                    weaving=["WEAVE-01"],
                    dyeing=["DYE-01"],
                ),
            ),
            Order(
                id="ORD-002",
                buyer="Buyer B",
                fabric="Polyester",
                colour="Red",
                metres=600,
                due=6000,
                priority_weight=2,
                yarn_ready=0,
                eligible=OrderEligibility(
                    spinning=["SPIN-01"],
                    weaving=["WEAVE-01"],
                    dyeing=["DYE-01"],
                ),
            ),
        ]
        scenario = create_simple_scenario(orders_override=orders)
        operations = run_edf_baseline(scenario)
        ord1_spin = next(
            op for op in operations if op.order == "ORD-001" and op.stage == Stage.SPINNING
        )
        assert ord1_spin.start >= 1000

    def test_respects_now(self) -> None:
        """Operations should not start before scenario.now."""
        scenario = create_simple_scenario(now=500)
        operations = run_edf_baseline(scenario)
        for op in operations:
            assert op.start >= 500

    def test_frozen_operations_preserved(self) -> None:
        """Frozen operations should be preserved exactly."""
        frozen_ops = [
            FrozenOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=100, end=1300
            )
        ]
        scenario = create_simple_scenario(frozen_override=frozen_ops)
        operations = run_edf_baseline(scenario)
        frozen_op = next(
            op for op in operations if op.order == "ORD-001" and op.stage == Stage.SPINNING
        )
        assert frozen_op.start == 100
        assert frozen_op.end == 1300
        assert frozen_op.machine == "SPIN-01"

    def test_ineligible_machine_raises(self) -> None:
        """Order with no eligible machines should raise."""
        orders = [
            Order(
                id="ORD-001",
                buyer="Buyer A",
                fabric="Cotton",
                colour="Blue",
                metres=1200,
                due=9000,
                priority_weight=3,
                yarn_ready=0,
                eligible=OrderEligibility(
                    spinning=["NONEXISTENT"],
                    weaving=["WEAVE-01"],
                    dyeing=["DYE-01"],
                ),
            ),
            Order(
                id="ORD-002",
                buyer="Buyer B",
                fabric="Polyester",
                colour="Red",
                metres=600,
                due=6000,
                priority_weight=2,
                yarn_ready=0,
                eligible=OrderEligibility(
                    spinning=["SPIN-01"],
                    weaving=["WEAVE-01"],
                    dyeing=["DYE-01"],
                ),
            ),
        ]
        scenario = create_simple_scenario(orders_override=orders)

        with pytest.raises(RuntimeError, match="Failed to schedule"):
            run_edf_baseline(scenario)

    def test_downtime_respected(self) -> None:
        """Operations should not overlap machine downtime."""
        machines = [
            Machine(
                id="SPIN-01",
                stage=Stage.SPINNING,
                rate_m_per_hour=60,
                downtime=[DowntimeWindow(from_minute=0, to_minute=1000)],
            ),
            Machine(id="SPIN-02", stage=Stage.SPINNING, rate_m_per_hour=50),
            Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
            Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
        ]
        scenario = create_simple_scenario(machines_override=machines)
        operations = run_edf_baseline(scenario)
        for op in operations:
            if op.machine == "SPIN-01":
                # Should not overlap 0-1000
                assert op.start >= 1000 or op.end <= 0

    def test_scheduler_repr(self) -> None:
        """Test EDFScheduler can be instantiated directly."""
        scenario = create_simple_scenario()
        scheduler = EDFScheduler(scenario)
        operations = scheduler.solve()
        assert len(operations) == 6
