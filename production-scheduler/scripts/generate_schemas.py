"""Regenerate the checked-in JSON Schemas from the Pydantic contracts.

Usage:
    python scripts/generate_schemas.py [--out schemas]
"""

from __future__ import annotations

import argparse
from pathlib import Path

from textile_scheduler.contracts import generate_schemas


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate public JSON Schemas.")
    parser.add_argument("--out", default="schemas", help="Output directory for schemas")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    written = generate_schemas(root / args.out)
    for stem, path in sorted(written.items()):
        print(f"wrote {path.relative_to(root)}")


if __name__ == "__main__":
    main()
