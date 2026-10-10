# Reliability audit (2026-10-10)

Scope: `src/textile_scheduler` (14 modules), `tests` (19 files), contracts
(`CONTRACT.md`, `INTERFACE.md`, `schemas/`, `fixtures/`). Existing behaviour
preserved except for demonstrated defects, all listed below.

## Results

- Dev environment: **308 passed, 4 skipped** (skips: 4 hypothesis infeasible draws).
- Clean environment (fresh venv, `pip install .[dev,optimizer]`): **308 passed,
  4 skipped**. No skips hide required coverage; every skipped test is either
  an infeasible random draw or documents its reason.
- `ruff check`: only the 8 deliberate `UP042` findings remain (kept: `StrEnum`
  would change `str()` output of stable enum values). `ruff format --check`:
  clean. `mypy`: clean except 35 `attr-defined` errors confined to
  `optimizer.py`, all false positives from OR-Tools shipping no usable type
  stubs (every flagged call is a real, tested CP-SAT API).
- Circular imports: none (all 14 modules import cleanly first, in every order
  tried). No database/UI/HTTP dependencies anywhere (`fastapi`, `flask`,
  `django`, `sqlalchemy`, `streamlit`, HTTP clients: zero matches).
- CLI verified live: pure-JSON stdout, diagnostics on stderr, exit `0`
  success / `1` malformed input / `2` infeasible-or-failed (with a JSON
  failure record emitted first).

## Requirement coverage

1. Time/duration units: `test_durations` (10), new `test_time_utils` (22).
2. Validator hard constraints: `test_validator` (11), `test_validator_rules` (31).
3. EDF: `test_edf` (17), `test_baseline` (11).
4. CP-SAT: `test_optimizer` (23), incl. new eligibility/yarn/availability/
   frozen/now tests and optimality-vs-EDF comparison at `OPTIMAL`.
5. CLI workflow: `test_cli` (10, incl. new `optimize`/`benchmark` runs),
   `test_full_pipeline` (5).
6. Properties: new `test_audit_properties` (6: validity, honest failure,
   determinism, downtime/yarn monotonicity, non-mutation) over
   valid-by-construction scenarios; CP-SAT excluded per-example (solver
   time) and pinned deterministically instead. No fixed-percentage
   assertions exist anywhere.
7. Regression: warm-start failure continues without hints
   (`test_optimize_infeasible_exit_code`); history freezing and hint
   deduplication covered by replan/integration tests.
8. Malformed/duplicate/unknown/empty-eligibility/windows/zero-duration/
   timeout: contract fixtures + `test_cli` + `R16` + `UNKNOWN` tests.
9. Infeasible models and `UNKNOWN`: `test_optimizer` status semantics.
10. Frozen/interrupted accounting: `test_replan` (16), `test_disruptions` (9).
11. Zero-late and zero-availability metrics: `test_benchmark`, new
    `test_audit` (10, incl. all loader warnings and the exception surface).
12. Invalid never published: `MODEL_INVALID` tests plus CLI exit-`2` tests.

## Defects found and fixed in this phase

- Dead `ScheduleValidator._known` helper removed.
- `optimize` CLI aborted when the optional EDF warm start failed; it now
  warns and continues without hints.
- Test-data incident: one assertion in `test_r06_duration_mismatch` was found
  corrupted in the working tree (`end=1000` → `end=1200`, which would neuter
  the test). Mechanism undetermined (not `ruff` semantics); corrected and
  verified green in both environments. Guard: full diff review before every
  commit, which is what caught it.

## Known limitations (unchanged behaviour, documented)

- No lockfile: `pyproject.toml` carries version ranges only. Verified on
  pydantic 2.12.5 and 2.14.0, pytest 9.0.2 and 9.1.1, OR-Tools 9.15.6755.
- `exceptions.py` is public surface not used by `src` (only import-tested).
- The EDF deadlock branch is unreachable by construction (chain precedence
  always leaves a ready operation); kept as defence.
- Benchmark wall-clock is excluded from determinism checks (logical
  operations compared instead).
- `scenarios/README.md` honesty notes still apply: no lot inventory model,
  tardiness is a soft cost, no improvement claims.

## Reproducible commands (from `production-scheduler/`)

```bash
pip install -e .[dev,optimizer]
python -m pytest tests -p no:cacheprovider
ruff check src tests scripts
ruff format --check src tests scripts
mypy src/textile_scheduler
python scripts/generate_schemas.py
textile-scheduler benchmark --out benchmark
```
