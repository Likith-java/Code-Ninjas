"""CP-SAT optimizer using Google OR-Tools.

Only imported when the 'optimizer' extra is installed (lazy import inside
the optimizer class). The domain contract and validator rules are never
modified or weakened to accommodate this model.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

from .durations import compute_duration
from .metrics import compute_metrics
from .models import (
    Scenario,
    Schedule,
    ScheduledOperation,
    SchedulerType,
    SolverStatus,
    Stage,
    ValidationResult,
)
from .validator import validate_schedule

if TYPE_CHECKING:
    from ortools.sat.python import cp_model

#: Default solver time limit in seconds.
DEFAULT_TIME_LIMIT_SECONDS = 10.0


@dataclass(frozen=True)
class SolverConfig:
    """Reproducible solver configuration."""

    time_limit_seconds: float = DEFAULT_TIME_LIMIT_SECONDS
    num_workers: int = 8
    random_seed: int = 42


def lexicographic_coefficient(scenario: Scenario) -> int:
    """Secondary-objective coefficient with a rigorous dominance bound.

    The objective is ``K * primary + secondary`` where primary is the
    priority-weighted tardiness (minutes) and secondary is the sum of order
    completion times. The secondary term ranges over ``[0, n * horizon]``,
    so any ``K > n * horizon`` guarantees a primary difference of even one
    minute always outweighs the entire secondary swing. ``K = n * horizon +
    1`` is therefore an exact single-stage lexicographic encoding: the
    secondary term is a pure tie-breaker and can never dominate the primary
    objective for any scenario this model supports.
    """
    return len(scenario.orders) * scenario.horizon + 1


def objective_terms(completions: dict[str, int], scenario: Scenario) -> tuple[int, int, int]:
    """Pure objective math (no solver): (primary, secondary, total).

    ``primary`` is priority-weighted tardiness with
    ``tardiness_i = max(0, completion_i - due_i)``; ``secondary`` is the sum
    of completion times; ``total = K * primary + secondary``. Orders missing
    from ``completions`` are skipped (partial plans must never be reported
    as complete; see :func:`optimize`).
    """
    orders = {o.id: o for o in scenario.orders}
    primary = 0
    secondary = 0
    for order_id, completion in completions.items():
        order = orders.get(order_id)
        if order is None:
            continue
        primary += max(0, completion - order.due) * order.priority_weight
        secondary += completion
    total = lexicographic_coefficient(scenario) * primary + secondary
    return primary, secondary, total


class CPSATOptimizer:
    """CP-SAT based optimizer for production scheduling.

    Model per order-stage operation: integer start/end variables, one Boolean
    assignment variable per eligible machine, and one optional interval per
    machine carrying that machine's own duration from the shared utility
    (``end == start + duration`` enforced when the machine is chosen).
    Exactly one machine is assigned per required operation; every mandatory
    operation appears in the model so none can silently disappear.
    """

    def __init__(
        self,
        scenario: Scenario,
        time_limit_seconds: float = DEFAULT_TIME_LIMIT_SECONDS,
        random_seed: int = 42,
        warm_start_ops: list[ScheduledOperation] | None = None,
        num_workers: int = 8,
    ) -> None:
        self.scenario = scenario
        self.config = SolverConfig(
            time_limit_seconds=time_limit_seconds,
            num_workers=num_workers,
            random_seed=random_seed,
        )
        self.warm_start_ops = warm_start_ops or []

        self.machine_by_id = {m.id: m for m in scenario.machines}
        self.order_by_id = {o.id: o for o in scenario.orders}
        self.route_order = {stage: idx for idx, stage in enumerate(scenario.route)}
        self.frozen_keys = {(f.order, f.stage, f.machine) for f in scenario.frozen}

        self._model: cp_model.CpModel | None = None
        self._solver: cp_model.CpSolver | None = None
        self._variables: dict = {}

    def _import_ortools(self) -> None:
        """Lazy import OR-Tools only when needed."""
        try:
            from ortools.sat.python import cp_model

            self.cp_model = cp_model
        except ImportError as e:
            raise RuntimeError(
                "OR-Tools not installed. Install with: pip install -e .[optimizer]"
            ) from e

    def build_model(self) -> None:
        """Build the CP-SAT model."""
        self._import_ortools()
        self._model = self.cp_model.CpModel()
        self._create_variables()
        self._add_constraints()
        self._set_objective()
        if self.warm_start_ops:
            self._add_warm_start()

    def _create_variables(self) -> None:
        """Create decision variables for each possible operation."""
        model = self._model
        assert model is not None

        # For each order-stage, decide the machine (from the eligible set),
        # the start time, and the end time (start + machine-specific duration).
        interval_vars: dict[tuple[str, Stage, str], tuple] = {}
        uncovered: list[str] = []

        for order in self.scenario.orders:
            for stage in self.scenario.route:
                eligible_machines = order.eligible.get_machines(stage)
                known_machines = [mid for mid in eligible_machines if mid in self.machine_by_id]
                if not known_machines:
                    # No mandatory operation may disappear from the model:
                    # an order-stage with no available machine makes the
                    # model explicitly infeasible instead of dropping the op.
                    uncovered.append(f"{order.id}/{stage.value}")
                    continue

                intervals = []
                machine_literals = []

                for machine_id in eligible_machines:
                    machine = self.machine_by_id.get(machine_id)
                    if machine is None:
                        continue  # unknown IDs are unavailable; see uncovered below
                    duration = compute_duration(order.metres, machine.rate_m_per_hour)
                    if machine.available_until is None:
                        latest_end = self.scenario.horizon
                    else:
                        latest_end = min(self.scenario.horizon, machine.available_until)

                    # Start variable (0 to horizon)
                    start_var = model.NewIntVar(
                        0, self.scenario.horizon, f"start_{order.id}_{stage.value}_{machine_id}"
                    )
                    end_var = model.NewIntVar(
                        0, latest_end, f"end_{order.id}_{stage.value}_{machine_id}"
                    )

                    # Presence literal for this machine
                    presence = model.NewBoolVar(f"pres_{order.id}_{stage.value}_{machine_id}")

                    # Interval variable (optional)
                    interval = model.NewOptionalIntervalVar(
                        start_var,
                        duration,
                        end_var,
                        presence,
                        f"interval_{order.id}_{stage.value}_{machine_id}",
                    )

                    # Link start + duration = end when present
                    model.Add(start_var + duration == end_var).OnlyEnforceIf(presence)

                    intervals.append(interval)
                    machine_literals.append(presence)

                    interval_vars[(order.id, stage, machine_id)] = (
                        start_var,
                        end_var,
                        presence,
                        duration,
                        interval,
                    )

                # Exactly one machine must be selected
                if machine_literals:
                    model.Add(sum(machine_literals) == 1)

        if uncovered:
            # Explicit infeasibility: these mandatory operations have no
            # available machine, so no valid schedule can exist.
            impossible = model.NewBoolVar("uncovered_mandatory_operation")
            model.Add(impossible == 1)
            model.Add(impossible == 0)

        self._variables = interval_vars

    def _add_constraints(self) -> None:
        """Add all scheduling constraints."""
        model = self._model
        assert model is not None

        # 1. Route order: stages within an order must be sequential
        for order in self.scenario.orders:
            for i, stage in enumerate(self.scenario.route[:-1]):
                next_stage = self.scenario.route[i + 1]
                for m1 in order.eligible.get_machines(stage):
                    for m2 in order.eligible.get_machines(next_stage):
                        if (order.id, stage, m1) in self._variables and (
                            order.id,
                            next_stage,
                            m2,
                        ) in self._variables:
                            _, end1, pres1, _, _ = self._variables[(order.id, stage, m1)]
                            start2, _, pres2, _, _ = self._variables[(order.id, next_stage, m2)]
                            # If both present, end1 <= start2
                            model.Add(end1 <= start2).OnlyEnforceIf([pres1, pres2])

        # 2. Machine capacity: no overlap on same machine
        machine_intervals: dict[str, list] = {}
        for (order_id, stage, machine_id), (_, _, presence, _, interval) in self._variables.items():
            if machine_id not in machine_intervals:
                machine_intervals[machine_id] = []
            machine_intervals[machine_id].append((interval, presence))

        for machine_id, intervals in machine_intervals.items():
            if len(intervals) > 1:
                model.AddNoOverlap([iv for iv, _ in intervals])

        # 3. Downtime constraints: processing and downtime never overlap
        for machine_id, intervals in machine_intervals.items():
            machine = self.machine_by_id[machine_id]
            for dt in machine.downtime:
                for interval, presence in intervals:
                    # interval.end <= dt.start OR interval.start >= dt.end
                    start_var = interval.start_expr()
                    end_var = interval.end_expr()
                    # Use reification
                    before = model.NewBoolVar(f"before_{machine_id}_{dt.start}")
                    after = model.NewBoolVar(f"after_{machine_id}_{dt.end}")
                    model.Add(end_var <= dt.start).OnlyEnforceIf(before)
                    model.Add(start_var >= dt.end).OnlyEnforceIf(after)
                    model.Add(before + after >= 1).OnlyEnforceIf(presence)

        # 4. Yarn ready for the first operation of each order.
        # Frozen operations keep their exact scheduled times (rule 5) and
        # are exempt here, mirroring validator rule R11: frozen work belongs
        # to the past by design.
        for order in self.scenario.orders:
            first_stage = self.scenario.route[0]
            for machine_id in order.eligible.get_machines(first_stage):
                key = (order.id, first_stage, machine_id)
                if key in self._variables and key not in self.frozen_keys:
                    start_var, _, presence, _, _ = self._variables[key]
                    earliest = max(order.yarn_ready, self.scenario.now)
                    model.Add(start_var >= earliest).OnlyEnforceIf(presence)

        # 5. Frozen operations keep their exact interval
        for frozen in self.scenario.frozen:
            key = (frozen.order, frozen.stage, frozen.machine)
            if key in self._variables:
                start_var, end_var, presence, _, _ = self._variables[key]
                model.Add(start_var == frozen.start).OnlyEnforceIf(presence)
                model.Add(end_var == frozen.end).OnlyEnforceIf(presence)
                model.Add(presence == 1)

        # 6. Every unfrozen operation starts at or after scenario.now
        for (order_id, stage, machine_id), (
            start_var,
            _,
            presence,
            _,
            _,
        ) in self._variables.items():
            if (order_id, stage, machine_id) in self.frozen_keys:
                continue
            model.Add(start_var >= self.scenario.now).OnlyEnforceIf(presence)

    def _set_objective(self) -> None:
        """Minimize priority-weighted tardiness, tie-broken by completions sum.

        The coefficient ``K = n_orders * horizon + 1`` rigorously exceeds any
        possible secondary swing (see :func:`lexicographic_coefficient`), so
        this single linear objective is an exact lexicographic encoding.
        """
        model = self._model
        assert model is not None

        horizon = self.scenario.horizon
        orders = self.scenario.orders
        n_orders = len(orders)
        max_weight = max((o.priority_weight for o in orders), default=1)

        tardiness_terms = []
        completion_terms = []

        for order in orders:
            last_stage = self.scenario.route[-1]
            completion_vars = []
            completion_presences = []

            for machine_id in order.eligible.get_machines(last_stage):
                if (order.id, last_stage, machine_id) in self._variables:
                    _, end_var, presence, _, _ = self._variables[(order.id, last_stage, machine_id)]
                    completion_vars.append(end_var)
                    completion_presences.append(presence)

            if not completion_vars:
                continue

            # Completion time for this order (when its last stage ends)
            order_completion = model.NewIntVar(0, horizon, f"completion_{order.id}")

            # Link completion to the selected machine's end time
            for end_var, presence in zip(completion_vars, completion_presences):
                model.Add(order_completion == end_var).OnlyEnforceIf(presence)

            # Tardiness = max(0, completion - due)
            tardiness = model.NewIntVar(0, horizon, f"tardiness_{order.id}")
            model.AddMaxEquality(tardiness, [order_completion - order.due, 0])

            # Weighted tardiness (integer coefficients)
            weighted = model.NewIntVar(0, horizon * max_weight, f"wtard_{order.id}")
            model.AddMultiplicationEquality(weighted, [tardiness, order.priority_weight])
            tardiness_terms.append(weighted)
            completion_terms.append(order_completion)

        total_tardiness = model.NewIntVar(
            0, horizon * max_weight * max(n_orders, 1), "total_tardiness"
        )
        model.Add(total_tardiness == sum(tardiness_terms))

        total_completion = model.NewIntVar(0, horizon * n_orders, "total_completion")
        model.Add(total_completion == sum(completion_terms))

        coefficient = lexicographic_coefficient(self.scenario)
        model.Minimize(coefficient * total_tardiness + total_completion)

    def _add_warm_start(self) -> None:
        """Add solution hints from the validated EDF schedule.

        Hints guide the search only: they neither guarantee a solution nor
        that the solver starts no worse than the hint. Hints are deduplicated
        by operation key (last occurrence wins, so frozen state prevails):
        repeating AddHint on one variable can invalidate the model in some
        OR-Tools versions.
        """
        assert self._model is not None
        hinted: dict[tuple[str, Stage, str], ScheduledOperation] = {}
        for op in self.warm_start_ops:
            hinted[(op.order, op.stage, op.machine)] = op
        for key, op in hinted.items():
            if key in self._variables:
                start_var, end_var, presence, _, _ = self._variables[key]
                self._model.AddHint(start_var, op.start)
                self._model.AddHint(end_var, op.end)
                self._model.AddHint(presence, 1)

    def solve(self) -> tuple[SolverStatus, list[ScheduledOperation], float]:
        """Solve the model, returning status, operations, and wall-clock time.

        Operations are returned only for OPTIMAL/FEASIBLE outcomes; every
        other outcome yields no assignments (never a partial or fabricated
        plan).
        """
        self._import_ortools()
        assert self._model is not None

        self._solver = self.cp_model.CpSolver()
        self._solver.parameters.max_time_in_seconds = self.config.time_limit_seconds
        self._solver.parameters.random_seed = self.config.random_seed
        self._solver.parameters.num_search_workers = self.config.num_workers
        self._solver.parameters.log_search_progress = False

        start_time = time.perf_counter()
        status = self._solver.Solve(self._model)
        solve_time = time.perf_counter() - start_time

        # Map OR-Tools status to our enum
        status_map = {
            self.cp_model.OPTIMAL: SolverStatus.OPTIMAL,
            self.cp_model.FEASIBLE: SolverStatus.FEASIBLE,
            self.cp_model.INFEASIBLE: SolverStatus.INFEASIBLE,
            self.cp_model.MODEL_INVALID: SolverStatus.MODEL_INVALID,
            self.cp_model.UNKNOWN: SolverStatus.UNKNOWN,
        }

        solver_status = status_map.get(status, SolverStatus.UNKNOWN)

        if solver_status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE):
            operations = self._extract_solution()
            return solver_status, operations, solve_time

        return solver_status, [], solve_time

    def _extract_solution(self) -> list[ScheduledOperation]:
        """Extract scheduled operations from solver solution."""
        assert self._solver is not None
        operations = []

        for (order_id, stage, machine_id), (
            start_var,
            end_var,
            presence,
            duration,
            _,
        ) in self._variables.items():
            if self._solver.Value(presence):
                start = self._solver.Value(start_var)
                end = self._solver.Value(end_var)
                order_obj = self.order_by_id.get(order_id)
                operations.append(
                    ScheduledOperation(
                        order=order_id,
                        stage=stage,
                        machine=machine_id,
                        start=start,
                        end=end,
                        quantity_metres=order_obj.metres if order_obj else None,
                    )
                )

        return operations


def run_cpsat_optimizer(
    scenario: Scenario,
    time_limit_seconds: float = DEFAULT_TIME_LIMIT_SECONDS,
    random_seed: int = 42,
    warm_start_ops: list[ScheduledOperation] | None = None,
    num_workers: int = 8,
) -> tuple[SolverStatus, list[ScheduledOperation], float]:
    """Run CP-SAT, returning (status, operations, wall-clock seconds)."""
    optimizer = CPSATOptimizer(
        scenario=scenario,
        time_limit_seconds=time_limit_seconds,
        random_seed=random_seed,
        warm_start_ops=warm_start_ops,
        num_workers=num_workers,
    )
    optimizer.build_model()
    return optimizer.solve()


def optimize(
    scenario: Scenario,
    time_limit_seconds: float = DEFAULT_TIME_LIMIT_SECONDS,
    random_seed: int = 42,
    warm_start_ops: list[ScheduledOperation] | None = None,
    num_workers: int = 8,
) -> Schedule:
    """Run CP-SAT and return a structured, validated schedule result.

    The independent validator gates success: OPTIMAL/FEASIBLE output that is
    incomplete or invalid is demoted to MODEL_INVALID and never published as
    successful. Timeouts without a feasible solution (UNKNOWN) and proven
    infeasibility (INFEASIBLE) return no operations -- never a partial plan
    presented as complete -- with the limitation explained in warnings.
    """
    status, operations, wall_time = run_cpsat_optimizer(
        scenario=scenario,
        time_limit_seconds=time_limit_seconds,
        random_seed=random_seed,
        warm_start_ops=warm_start_ops,
        num_workers=num_workers,
    )

    metrics = compute_metrics(scenario, operations)
    draft = Schedule(
        scenario_id=scenario.scenario_id,
        solver=SchedulerType.CP_SAT,
        status=status,
        compute_seconds=wall_time,
        validation=ValidationResult(violations=[]),
        metrics=metrics,
        operations=operations,
    )
    validation = validate_schedule(scenario, draft)

    warnings: list[str] = []
    if status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE):
        if not validation.is_valid:
            status = SolverStatus.MODEL_INVALID
            warnings.append(
                "Solver output failed independent validation; not published as successful."
            )
    elif status == SolverStatus.INFEASIBLE:
        warnings.append("Model proved infeasible under its hard constraints; no schedule exists.")
    elif status == SolverStatus.UNKNOWN:
        warnings.append(
            "Solver ended without a definitive conclusion "
            "(e.g. timeout before any feasible solution); "
            "no partial plan is returned."
        )
    elif status == SolverStatus.MODEL_INVALID:
        warnings.append("Solver reported the model itself invalid.")

    return Schedule(
        scenario_id=scenario.scenario_id,
        solver=SchedulerType.CP_SAT,
        status=status,
        compute_seconds=wall_time,
        validation=validation,
        metrics=metrics,
        operations=operations,
        warnings=warnings,
    )
