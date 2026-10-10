"""CP-SAT optimizer using Google OR-Tools.

Only imported when the 'optimizer' extra is installed.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

from .models import (
    Machine,
    Order,
    Scenario,
    ScheduledOperation,
    SolverStatus,
    Stage,
)
from .durations import compute_duration

if TYPE_CHECKING:
    from ortools.sat.python import cp_model


class CPSATOptimizer:
    """CP-SAT based optimizer for production scheduling.

    Minimizes priority-weighted tardiness with secondary objective
    of minimizing makespan (pulling work earlier).
    """

    def __init__(
        self,
        scenario: Scenario,
        time_limit_seconds: float = 30.0,
        random_seed: int = 42,
        warm_start_ops: list[ScheduledOperation] | None = None,
    ) -> None:
        self.scenario = scenario
        self.time_limit = time_limit_seconds
        self.random_seed = random_seed
        self.warm_start_ops = warm_start_ops or []

        self.machine_by_id = {m.id: m for m in scenario.machines}
        self.order_by_id = {o.id: o for o in scenario.orders}
        self.route_order = {stage: idx for idx, stage in enumerate(scenario.route)}

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

        # For each order-stage, we need to decide:
        # - which machine (from eligible set)
        # - start time
        # - end time (start + duration)

        # We'll create interval variables per order-stage-machine combination
        # and use a boolean to select exactly one machine

        interval_vars: dict[tuple[str, Stage, str], tuple] = {}

        for order in self.scenario.orders:
            for stage in self.scenario.route:
                eligible_machines = order.eligible.get_machines(stage)
                if not eligible_machines:
                    continue

                # Create alternative intervals for each machine
                intervals = []
                machine_literals = []

                for machine_id in eligible_machines:
                    machine = self.machine_by_id[machine_id]
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
                model.Add(sum(machine_literals) == 1)

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

        # 3. Downtime constraints
        for machine_id, intervals in machine_intervals.items():
            machine = self.machine_by_id[machine_id]
            for dt in machine.downtime:
                for interval, presence in intervals:
                    # interval must not overlap downtime
                    # interval.end <= dt.from OR interval.start >= dt.to
                    start_var = interval.start_expr()
                    end_var = interval.end_expr()
                    # Use reification
                    before = model.NewBoolVar(f"before_{machine_id}_{dt.start}")
                    after = model.NewBoolVar(f"after_{machine_id}_{dt.end}")
                    model.Add(end_var <= dt.start).OnlyEnforceIf(before)
                    model.Add(start_var >= dt.end).OnlyEnforceIf(after)
                    model.Add(before + after >= 1).OnlyEnforceIf(presence)

        # 4. Yarn ready and now constraints
        for order in self.scenario.orders:
            first_stage = self.scenario.route[0]
            for machine_id in order.eligible.get_machines(first_stage):
                if (order.id, first_stage, machine_id) in self._variables:
                    start_var, _, presence, _, _ = self._variables[
                        (order.id, first_stage, machine_id)
                    ]
                    earliest = max(order.yarn_ready, self.scenario.now)
                    model.Add(start_var >= earliest).OnlyEnforceIf(presence)

        # 5. Frozen operations
        for frozen in self.scenario.frozen:
            key = (frozen.order, frozen.stage, frozen.machine)
            if key in self._variables:
                start_var, end_var, presence, _, _ = self._variables[key]
                model.Add(start_var == frozen.start).OnlyEnforceIf(presence)
                model.Add(end_var == frozen.end).OnlyEnforceIf(presence)
                model.Add(presence == 1)

    def _set_objective(self) -> None:
        """Set the optimization objective: minimize weighted tardiness + makespan."""
        model = self._model
        assert model is not None

        tardiness_terms = []
        makespan_var = model.NewIntVar(0, self.scenario.horizon, "makespan")

        for order in self.scenario.orders:
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
            # We need to select the completion time based on which machine was chosen
            # Use a temporary variable
            order_completion = model.NewIntVar(0, self.scenario.horizon, f"completion_{order.id}")

            # Link completion to the selected machine's end time
            for end_var, presence in zip(completion_vars, completion_presences):
                model.Add(order_completion == end_var).OnlyEnforceIf(presence)

            # Tardiness = max(0, completion - due)
            tardiness = model.NewIntVar(0, self.scenario.horizon, f"tardiness_{order.id}")
            model.AddMaxEquality(tardiness, [order_completion - order.due, 0])

            # Weighted tardiness
            weighted = model.NewIntVar(0, self.scenario.horizon * 10, f"wtard_{order.id}")
            model.AddMultiplicationEquality(weighted, [tardiness, order.priority_weight])
            tardiness_terms.append(weighted)

            # Track makespan
            model.Add(makespan_var >= order_completion)

        # Primary: minimize sum of weighted tardiness
        # Secondary: minimize makespan (small weight to break ties)
        total_tardiness = model.NewIntVar(0, self.scenario.horizon * 100, "total_tardiness")
        model.Add(total_tardiness == sum(tardiness_terms))

        # Lexicographic: tardiness * large_constant + makespan
        LARGE = 10000
        objective = model.NewIntVar(0, self.scenario.horizon * 100 * LARGE, "objective")
        model.AddMultiplicationEquality(objective, [total_tardiness, LARGE])
        model.Add(objective >= sum(tardiness_terms) * LARGE + makespan_var)

        model.Minimize(objective)

    def _add_warm_start(self) -> None:
        """Add warm start hints from EDF baseline."""
        # OR-Tools CP-SAT doesn't have direct warm-start API in Python
        # but we can add hints
        for op in self.warm_start_ops:
            key = (op.order, op.stage, op.machine)
            if key in self._variables:
                start_var, end_var, presence, _, _ = self._variables[key]
                self._model.AddHint(start_var, op.start)
                self._model.AddHint(end_var, op.end)
                self._model.AddHint(presence, 1)

    def solve(self) -> tuple[SolverStatus, list[ScheduledOperation], float]:
        """Solve the model and return status, operations, and solve time."""
        self._import_ortools()
        assert self._model is not None

        self._solver = self.cp_model.CpSolver()
        self._solver.parameters.max_time_in_seconds = self.time_limit
        self._solver.parameters.random_seed = self.random_seed
        self._solver.parameters.num_search_workers = 8
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
    time_limit_seconds: float = 30.0,
    random_seed: int = 42,
    warm_start_ops: list[ScheduledOperation] | None = None,
) -> tuple[SolverStatus, list[ScheduledOperation], float]:
    """Convenience function to run CP-SAT optimizer."""
    optimizer = CPSATOptimizer(
        scenario=scenario,
        time_limit_seconds=time_limit_seconds,
        random_seed=random_seed,
        warm_start_ops=warm_start_ops,
    )
    optimizer.build_model()
    return optimizer.solve()
