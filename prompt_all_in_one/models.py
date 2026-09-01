from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

Polarity = Literal["positive", "negative"]
CollectionKind = Literal["history", "favorites"]


@dataclass(slots=True)
class PromptRecord:
    id: str
    polarity: Polarity
    name: str
    prompt: str
    tags: list[str]
    created_at: int
    source: str = "comfyui"
    import_key: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
