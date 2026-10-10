"""Public JSON contracts: schema generation for stable input/output models.

The canonical input contract is :class:`Scenario` and the canonical output
contracts are :class:`Schedule` (success) and :class:`FailureResult`
(failure). Run ``python scripts/generate_schemas.py`` to regenerate the
checked-in ``schemas/*.schema.json`` files from these models.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel

from .models import CONTRACT_VERSION, FailureResult, Scenario, Schedule

#: Public input models keyed by schema file stem.
PUBLIC_INPUT_MODELS: dict[str, type[BaseModel]] = {
    "scenario": Scenario,
}

#: Public output models keyed by schema file stem.
PUBLIC_OUTPUT_MODELS: dict[str, type[BaseModel]] = {
    "schedule": Schedule,
    "failure": FailureResult,
}

SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema"


def generate_schemas(output_dir: str | Path) -> dict[str, Path]:
    """Generate JSON Schema files for the public contracts.

    Returns a mapping of schema stem to written file path.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    written: dict[str, Path] = {}
    for stem, model in {**PUBLIC_INPUT_MODELS, **PUBLIC_OUTPUT_MODELS}.items():
        schema = model.model_json_schema(mode="validation")
        schema["$schema"] = SCHEMA_DRAFT
        schema["$comment"] = f"textile-scheduler contract version {CONTRACT_VERSION}"
        path = out / f"{stem}.schema.json"
        path.write_text(json.dumps(schema, indent=2) + "\n")
        written[stem] = path
    return written
