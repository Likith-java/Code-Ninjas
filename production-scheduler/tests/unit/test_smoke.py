"""Smoke test for textile_scheduler package."""

import textile_scheduler
from textile_scheduler.models import Scenario, Machine, Order, OrderEligibility, Stage


def test_import() -> None:
    """Test that the package imports without side effects."""
    assert textile_scheduler.__version__ == "0.1.0"


def test_models_import() -> None:
    """Test that models can be imported and instantiated."""
    machine = Machine(
        id="TEST-01",
        stage=Stage.SPINNING,
        rate_m_per_hour=50,
    )
    assert machine.id == "TEST-01"
    assert machine.stage == Stage.SPINNING

    eligibility = OrderEligibility(spinning=["TEST-01"])
    order = Order(
        id="ORD-001",
        buyer="Test Buyer",
        fabric="Test Fabric",
        colour="Red",
        metres=1000,
        due=1440,
        priority_weight=1,
        yarn_ready=0,
        eligible=eligibility,
    )
    assert order.id == "ORD-001"

    scenario = Scenario(
        name="test",
        synthetic=True,
        machines=[machine],
        orders=[order],
    )
    assert scenario.name == "test"
    assert len(scenario.machines) == 1
    assert len(scenario.orders) == 1


def test_durations_import() -> None:
    """Test duration function works."""
    from textile_scheduler.durations import compute_duration

    dur = compute_duration(2400, 60)
    assert dur == 2400  # 2400m @ 60 m/hr = 40 hours = 2400 minutes


def test_validator_import() -> None:
    """Test validator can be imported."""
    from textile_scheduler.validator import ScheduleValidator

    # Just test import works
    assert ScheduleValidator is not None


def test_baseline_import() -> None:
    """Test baseline scheduler can be imported."""
    from textile_scheduler.baseline import EDFScheduler

    assert EDFScheduler is not None


def test_metrics_import() -> None:
    """Test metrics can be imported."""
    from textile_scheduler.metrics import compute_metrics

    assert compute_metrics is not None


def test_disruptions_import() -> None:
    """Test disruptions module can be imported."""
    from textile_scheduler.disruptions import apply_disruption

    assert apply_disruption is not None


def test_gantt_import() -> None:
    """Test gantt export can be imported."""
    from textile_scheduler.gantt import schedule_to_gantt

    assert schedule_to_gantt is not None


def test_cli_import() -> None:
    """Test CLI module can be imported."""
    from textile_scheduler.cli import main

    assert main is not None


def test_exceptions_import() -> None:
    """Test exceptions can be imported."""
    from textile_scheduler.exceptions import SchedulerError, ValidationError

    assert SchedulerError is not None
    assert ValidationError is not None
