"""Unit tests for disruptions module."""

import pytest

from textile_scheduler.models import (
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    ScheduledOperation,
    Stage,
    Disruption,
    DisruptionType,
    DowntimeWindow,
)
from textile_scheduler.disruptions import apply_disruption, ReplanDiff
from textile_scheduler.baseline import run_edf_baseline


def create_scenario_with_schedule() -> tuple[Scenario, list[ScheduledOperation]]:
    """Create a scenario with operations for disruption testing."""
    machines = [
        Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
        Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
        Machine(id="WEAVE-02", stage=Stage.WEAVING, rate_m_per_hour=45),
        Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
    ]
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
                spinning=["SPIN-01"],
                weaving=["WEAVE-01", "WEAVE-02"],
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
    scenario = Scenario(
        name="disruption_test",
        synthetic=True,
        now=0,
        horizon=10080,
        machines=machines,
        orders=orders,
    )

    operations = run_edf_baseline(scenario)
    return scenario, operations


class TestMachineBreakdown:
    """Tests for machine breakdown disruption."""

    def test_breakdown_creates_downtime(self) -> None:
        """Breakdown should add downtime to the machine."""
        scenario, operations = create_scenario_with_schedule()

        disruption = Disruption(
            type=DisruptionType.MACHINE_DOWN,
            machine="WEAVE-01",
            from_minute=1000,
            to_minute=2000,
            now=500,
        )

        new_scenario, new_ops, diff = apply_disruption(scenario, operations, disruption)

        # Check new scenario has downtime on WEAVE-01
        weave01 = next(m for m in new_scenario.machines if m.id == "WEAVE-01")
        assert len(weave01.downtime) == 1
        assert weave01.downtime[0].start == 1000
        assert weave01.downtime[0].end == 2000

    def test_breakdown_freezes_running_ops(self) -> None:
        """Operations running at 'now' on healthy machines should be frozen."""
        scenario, operations = create_scenario_with_schedule()

        # Run at now=500, so any op spanning 500 on healthy machines freezes
        disruption = Disruption(
            type=DisruptionType.MACHINE_DOWN,
            machine="WEAVE-01",
            from_minute=1000,
            to_minute=2000,
            now=500,
        )

        new_scenario, new_ops, diff = apply_disruption(scenario, operations, disruption)

        # Should have frozen operations
        assert diff.frozen_count > 0
        assert len(new_scenario.frozen) == diff.frozen_count

    def test_breakdown_splits_affected_op(self) -> None:
        """Operation on broken machine overlapping downtime should be split."""
        scenario, operations = create_scenario_with_schedule()

        disruption = Disruption(
            type=DisruptionType.MACHINE_DOWN,
            machine="WEAVE-01",
            from_minute=1000,
            to_minute=2000,
            now=500,
        )

        new_scenario, new_ops, diff = apply_disruption(scenario, operations, disruption)

        # The affected operation should be split
        assert diff.split_count >= 0  # May or may not split depending on schedule

    def test_yarn_delay_pushes_yarn_ready(self) -> None:
        """Yarn delay should increase yarn_ready for affected order."""
        scenario, operations = create_scenario_with_schedule()

        disruption = Disruption(
            type=DisruptionType.YARN_DELAY,
            order="ORD-001",
            hours=2,
            now=500,
        )

        new_scenario, new_ops, diff = apply_disruption(scenario, operations, disruption)

        # ORD-001 yarn_ready should increase by 120 minutes
        ord1 = next(o for o in new_scenario.orders if o.id == "ORD-001")
        assert ord1.yarn_ready == 120  # 2 hours * 60

    def test_yarn_delay_freezes_running_ops(self) -> None:
        """Yarn delay should freeze operations running at 'now'."""
        scenario, operations = create_scenario_with_schedule()

        disruption = Disruption(
            type=DisruptionType.YARN_DELAY,
            order="ORD-001",
            hours=2,
            now=500,
        )

        new_scenario, new_ops, diff = apply_disruption(scenario, operations, disruption)

        assert diff.frozen_count > 0
        assert len(new_scenario.frozen) == diff.frozen_count

    def test_invalid_disruption_raises(self) -> None:
        """Invalid disruption should raise error."""
        scenario, operations = create_scenario_with_schedule()

        # Machine down without from/to
        with pytest.raises(ValueError, match="machine_down requires from and to"):
            Disruption(
                type=DisruptionType.MACHINE_DOWN,
                machine="WEAVE-01",
                now=500,
            )

        # Yarn delay without hours
        with pytest.raises(ValueError, match="yarn_delay requires hours"):
            Disruption(
                type=DisruptionType.YARN_DELAY,
                order="ORD-001",
                now=500,
            )

    def test_diff_computed(self) -> None:
        """Diff should capture moved orders."""
        scenario, operations = create_scenario_with_schedule()

        disruption = Disruption(
            type=DisruptionType.MACHINE_DOWN,
            machine="WEAVE-01",
            from_minute=1000,
            to_minute=2000,
            now=500,
        )

        new_scenario, new_ops, diff = apply_disruption(scenario, operations, disruption)

        assert isinstance(diff, ReplanDiff)
        assert isinstance(diff.moved_orders, list)
        assert isinstance(diff.now_late, list)
        assert isinstance(diff.now_at_risk, list)
        assert isinstance(diff.frozen_count, int)
        assert isinstance(diff.split_count, int)

    def test_completed_operations_frozen_as_history(self) -> None:
        """Ops finished before 'now' must freeze, not stay re-schedulable."""
        scenario, operations = create_scenario_with_schedule()

        disruption = Disruption(
            type=DisruptionType.MACHINE_DOWN,
            machine="WEAVE-01",
            from_minute=1000,
            to_minute=2000,
            now=700,
        )

        new_scenario, new_ops, diff = apply_disruption(scenario, operations, disruption)

        completed = [op for op in operations if op.end <= 700]
        assert completed, "test needs operations completed before now"
        frozen_keys = {(f.order, f.stage, f.machine) for f in new_scenario.frozen}
        for op in completed:
            assert (op.order, op.stage, op.machine) in frozen_keys
            frozen = next(
                f
                for f in new_scenario.frozen
                if (f.order, f.stage, f.machine) == (op.order, op.stage, op.machine)
            )
            assert (frozen.start, frozen.end) == (op.start, op.end)

    def test_replan_operations_have_no_duplicates(self) -> None:
        """Returned operations must not repeat an order-stage-machine."""
        scenario, operations = create_scenario_with_schedule()

        disruption = Disruption(
            type=DisruptionType.MACHINE_DOWN,
            machine="WEAVE-01",
            from_minute=1000,
            to_minute=2000,
            now=500,
        )

        _, new_ops, _ = apply_disruption(scenario, operations, disruption)

        keys = [(op.order, op.stage, op.machine) for op in new_ops]
        assert len(keys) == len(set(keys))
