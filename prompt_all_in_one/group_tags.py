from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

DATA_DIR = Path(__file__).with_name("data")


@lru_cache(maxsize=2)
def load_group_tags(language: str) -> list[dict[str, Any]]:
    filename = "zh_CN.yaml" if language == "zh" else "default.yaml"
    with (DATA_DIR / filename).open("r", encoding="utf-8") as handle:
        result = yaml.safe_load(handle)
    return result if isinstance(result, list) else []
