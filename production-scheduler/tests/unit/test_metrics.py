"""Unit tests for metrics module."""

import pytest

from textile_scheduler.models import (
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    ScheduledOperation,
    Stage,
)
from textile_scheduler.metrics import (
    compute_metrics,
    compute_order_details,
    compute_machine_utilisation,
)


def create_test_scenario_with_schedule() -> tuple[Scenario, list[ScheduledOperation]]:
    """Create a scenario with a known schedule for metrics testing."""
    machines = [
        Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
        Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
        Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
    ]
    orders = [
        Order(
            id="ORD-001",
            buyer="Buyer A",
            fabric="Cotton",
            colour="Blue",
            metres=2400,
            due=5000,
            priority_weight=3,
            yarn_ready=0,
            eligible=OrderEligibility(
                spinning=["SPIN-01"],
                weaving=["WEAVE-01"],
                dyeing=["DYE-01"],
            ),
        ),
        Order(
            id="ORD-002",
            buyer="Buyer B",
            fabric="Polyester",
            colour="Red",
            metres=1200,
            due=3000,
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
        name="metrics_test",
        synthetic=True,
        now=0,
        horizon=10080,
        machines=machines,
        orders=orders,
    )

    # ORD-001: spinning 0-2400, weaving 2400-6000, dyeing 6000-8400 (late by 3400)
    # ORD-002: spinning 2400-3600, weaving 3600-5400, dyeing 5400-7200 (late by 4200)
    operations = [
        ScheduledOperation(
            order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=2400
        ),
        ScheduledOperation(
            order="ORD-001", stage=Stage.WEAVING, machine="WEAVE-01", start=2400, end=6000
        ),
        ScheduledOperation(
            order="ORD-001", stage=Stage.DYEING, machine="DYE-01", start=6000, end=8400
        ),
        ScheduledOperation(
            order="ORD-002", stage=Stage.SPINNING, machine="SPIN-01", start=2400, end=3600
        ),
        ScheduledOperation(
            order="ORD-002", stage=Stage.WEAVING, machine="WEAVE-01", start=6000, end=9600
        ),  # wait for WEAVE-01
        ScheduledOperation(
            order="ORD-002", stage=Stage.DYEING, machine="DYE-01", start=9600, end=12000
        ),
    ]

    return scenario, operations


class TestMetrics:
    """Tests for metrics computation."""

    def test_weighted_tardiness(self) -> None:
        """Test weighted tardiness calculation."""
        scenario, operations = create_test_scenario_with_schedule()
        metrics = compute_metrics(scenario, operations)

        # ORD-001: completes at 8400, due 5000 -> 3400 min late = 2.36 days * 3 = 7.08
        # ORD-002: completes at 12000, due 3000 -> 9000 min late = 6.25 days * 2 = 12.5
        # Total = 19.58
        assert metrics.weighted_tardiness > 0
        # Check approximate value
        expected = (3400 / 1440) * 3 + (9000 / 1440) * 2
        assert abs(metrics.weighted_tardiness - expected) < 0.01

    def test_on_time_rate(self) -> None:
        """Test on-time rate calculation."""
        scenario, operations = create_test_scenario_with_schedule()
        metrics = compute_metrics(scenario, operations)

        # Both orders are late
        assert metrics.on_time_rate == 0.0

    def test_on_time_rate_all_on_time(self) -> None:
        """Test on-time rate when all orders on time."""
        machines = [
            Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
            Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
            Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
        ]
        orders = [
            Order(
                id="ORD-001",
                buyer="Buyer A",
                fabric="Cotton",
                colour="Blue",
                metres=100,
                due=10000,
                priority_weight=1,
                yarn_ready=0,
                eligible=OrderEligibility(
                    spinning=["SPIN-01"],
                    weaving=["WEAVE-01"],
                    dyeing=["DYE-01"],
                ),
            ),
        ]
        scenario = Scenario(
            name="on_time",
            synthetic=True,
            now=0,
            horizon=10080,
            machines=machines,
            orders=orders,
        )
        operations = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=100
            ),
            ScheduledOperation(
                order="ORD-001", stage=Stage.WEAVING, machine="WEAVE-01", start=100, end=250
            ),
            ScheduledOperation(
                order="ORD-001", stage=Stage.DYEING, machine="DYE-01", start=250, end=450
            ),
        ]
        metrics = compute_metrics(scenario, operations)
        assert metrics.on_time_rate == 1.0

    def test_utilisation(self) -> None:
        """Test machine utilisation calculation."""
        scenario, operations = create_test_scenario_with_schedule()
        metrics = compute_metrics(scenario, operations)

        # Total productive minutes across all machines
        # SPIN-01: 2400 + 1200 = 3600
        # WEAVE-01: 3600 + 3600 = 7200
        # DYE-01: 2400 + 2400 = 4800
        # Total productive = 15600
        # Available per machine = 10080 (no downtime)
        # Total available = 30240
        # Utilisation = 15600/30240 ≈ 0.516
        assert 0.5 < metrics.utilisation < 0.55

    def test_makespan(self) -> None:
        """Test makespan calculation."""
        scenario, operations = create_test_scenario_with_schedule()
        metrics = compute_metrics(scenario, operations)

        # Latest end is 12000 (ORD-002 dyeing)
        assert metrics.makespan == 12000

    def test_order_details(self) -> None:
        """Test per-order detail computation."""
        scenario, operations = create_test_scenario_with_schedule()
        details = compute_order_details(scenario, operations)

        assert len(details) == 2
        for d in details:
            assert "order_id" in d
            assert "tardiness_days" in d
            assert "on_time" in d
            assert "stages" in d

    def test_machine_utilisation_details(self) -> None:
        """Test per-machine utilisation details."""
        scenario, operations = create_test_scenario_with_schedule()
        details = compute_machine_utilisation(scenario, operations)

        assert len(details) == 3
        for d in details:
            assert "machine_id" in d
            assert "busy_minutes" in d
            assert "available_minutes" in d
            assert "utilisation" in d
            assert "operations" in d
