"""Deterministic synthetic scenario generator (fixed seed).

Generates four representative scenarios sharing one base load:

- feasible_load.json: every order routable, schedulable within the horizon
  (deadline misses allowed: tardiness is a soft cost, not infeasibility).
- weaving_breakdown.json: base + a loom breakdown on WEAVE-03 (1200-2400).
- late_yarn_lot.json: base + yarn for LOT-Y2 (ORD-007, ORD-008) delayed 1440 min.
- infeasible_load.json: base + ORD-012 left with no eligible dyeing machine,
  so no valid schedule exists (explicit infeasibility, not a bad schedule).

Reproducibility: every generated value comes from ``random.Random(SEED)``;
IDs are fixed strings. Re-running this script byte-reproduces the files.

Yarn honesty note: ``yarn_ready`` times are staggered release times modelling
competing lot arrivals. No cumulative yarn inventory is modelled, so nothing
here enforces stock quantities -- the scheduler only enforces per-order
release times.

Usage:
    python scripts/generate_scenarios.py [--out scenarios]
"""

from __future__ import annotations

import argparse
import copy
import json
import random
from pathlib import Path

SEED = 20260105
START = "2026-01-05T06:00:00"
HORIZON = 10080  # 7 days in minutes
NOW = 0

MACHINES: list[tuple[str, str, int]] = [
    ("SPIN-01", "spinning", 60),
    ("SPIN-02", "spinning", 55),
    ("SPIN-03", "spinning", 50),
    ("WEAVE-01", "weaving", 45),
    ("WEAVE-02", "weaving", 42),
    ("WEAVE-03", "weaving", 40),
    ("WEAVE-04", "weaving", 38),
    ("WEAVE-05", "weaving", 35),
    ("DYE-01", "dyeing", 34),
    ("DYE-02", "dyeing", 30),
]

QUANTITIES = [300, 400, 500, 600, 800, 1000]
DUES = [3600, 4800, 5760, 6480, 7200, 8640, 9600, 10080]
YARN_READY = [0, 240, 480, 720, 960, 1200, 1440]
FABRICS = ["cotton twill", "linen", "polyester", "denim", "cambric", "poplin"]
COLOURS = ["navy", "natural", "red", "black", "white", "olive"]
BUYERS = ["Buyer A", "Buyer B", "Buyer C", "Buyer D"]

# Orders whose yarn arrives late in late_yarn_lot.json (competing LOT-Y2 pair).
LATE_YARN_ORDERS = ("ORD-007", "ORD-008")
LATE_YARN_DELAY = 1440

# Order left without dyeing eligibility in infeasible_load.json.
INFEASIBLE_ORDER = "ORD-012"

# Weaving breakdown window in weaving_breakdown.json (day 2, 20:00-16:00+1d).
BREAKDOWN_MACHINE = "WEAVE-03"
BREAKDOWN_START = 1200
BREAKDOWN_END = 2400


def _machine_ids(stage: str) -> list[str]:
    return [mid for mid, st, _ in MACHINES if st == stage]


def build_base(rng: random.Random) -> dict:
    """Build the shared base scenario as a JSON-able dict."""
    machines = []
    for mid, stage, rate in MACHINES:
        entry: dict = {"id": mid, "stage": stage, "rate_m_per_hour": rate}
        if mid == "WEAVE-05":
            entry["downtime"] = [{"start": 9500, "end": 9560, "reason": "planned maintenance"}]
        else:
            entry["downtime"] = []
        machines.append(entry)

    orders = []
    for i in range(1, 13):
        oid = f"ORD-{i:03d}"
        spinning = sorted(rng.sample(_machine_ids("spinning"), rng.choice([2, 3])))
        weaving = sorted(rng.sample(_machine_ids("weaving"), rng.choice([2, 3])))
        dyeing = sorted(rng.sample(_machine_ids("dyeing"), rng.choice([1, 2])))
        orders.append(
            {
                "id": oid,
                "buyer": rng.choice(BUYERS),
                "fabric": rng.choice(FABRICS),
                "colour": rng.choice(COLOURS),
                "metres": rng.choice(QUANTITIES),
                "ordered_at": 0,
                "due": rng.choice(DUES),
                "priority_weight": rng.randint(1, 5),
                "yarn_ready": rng.choice(YARN_READY),
                "eligible": {
                    "spinning": spinning,
                    "weaving": weaving,
                    "dyeing": dyeing,
                },
            }
        )

    return {
        "scenario_id": "feasible-load",
        "description": (
            "Base 12-order load: 3 spinning, 5 weaving, 2 dyeing machines. "
            "All orders routable; deadlines are soft costs."
        ),
        "synthetic_data": True,
        "start": START,
        "now": NOW,
        "horizon": HORIZON,
        "route": ["spinning", "weaving", "dyeing"],
        "machines": machines,
        "orders": orders,
        "frozen": [],
    }


def build_breakdown(base: dict) -> dict:
    """Base + a specific weaving-machine downtime event."""
    scenario = copy.deepcopy(base)
    scenario["scenario_id"] = "weaving-breakdown"
    scenario["description"] = (
        "Base load plus loom breakdown: WEAVE-03 down 1200-2400 "
        "(day 2, 20:00 through day 3, 16:00)."
    )
    for machine in scenario["machines"]:
        if machine["id"] == BREAKDOWN_MACHINE:
            machine["downtime"].append(
                {
                    "start": BREAKDOWN_START,
                    "end": BREAKDOWN_END,
                    "reason": "loom breakdown WEAVE-03",
                }
            )
            machine["downtime"].sort(key=lambda w: w["start"])
    return scenario


def build_late_yarn(base: dict) -> dict:
    """Base + delayed yarn for the LOT-Y2 pair (ORD-007, ORD-008)."""
    scenario = copy.deepcopy(base)
    scenario["scenario_id"] = "late-yarn-lot"
    scenario["description"] = (
        "Base load with late yarn lot LOT-Y2: ORD-007 and ORD-008 "
        f"yarn_ready delayed by {LATE_YARN_DELAY} minutes."
    )
    for order in scenario["orders"]:
        if order["id"] in LATE_YARN_ORDERS:
            order["yarn_ready"] += LATE_YARN_DELAY
    return scenario


def build_infeasible(base: dict) -> dict:
    """Base + ORD-012 with no eligible dyeing machine (explicitly infeasible)."""
    scenario = copy.deepcopy(base)
    scenario["scenario_id"] = "infeasible-load"
    scenario["description"] = (
        f"Base load with {INFEASIBLE_ORDER} left without any eligible dyeing "
        "machine, so no valid schedule exists within the horizon. Deadline "
        "misses elsewhere remain soft costs; only the missing route is infeasible."
    )
    for order in scenario["orders"]:
        if order["id"] == INFEASIBLE_ORDER:
            order["eligible"]["dyeing"] = []
    return scenario


def build_all() -> dict[str, dict]:
    """Build all four scenarios deterministically."""
    rng = random.Random(SEED)
    base = build_base(rng)
    return {
        "feasible_load": base,
        "weaving_breakdown": build_breakdown(base),
        "late_yarn_lot": build_late_yarn(base),
        "infeasible_load": build_infeasible(base),
    }


def write_all(output_dir: str | Path) -> dict[str, Path]:
    """Write all four scenarios, returning stem -> path."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    written = {}
    for stem, scenario in build_all().items():
        path = out / f"{stem}.json"
        path.write_text(json.dumps(scenario, indent=2) + "\n")
        written[stem] = path
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic scenarios.")
    parser.add_argument("--out", default="scenarios", help="Output directory")
    parser.add_argument("--seed", type=int, default=SEED, help="Fixed RNG seed")
    args = parser.parse_args()

    if args.seed != SEED:
        print(f"WARNING: non-canonical seed {args.seed} (canonical: {SEED})")

    root = Path(__file__).resolve().parent.parent
    written = write_all(root / args.out)
    for stem, path in sorted(written.items()):
        scenario = json.loads(path.read_text())
        print(
            f"wrote {path.relative_to(root)}: "
            f"{len(scenario['orders'])} orders, "
            f"{len(scenario['machines'])} machines, "
            f"horizon {scenario['horizon']}"
        )


if __name__ == "__main__":
    main()
