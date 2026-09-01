from __future__ import annotations

from typing import Any

WEB_DIRECTORY = "./dist"


async def comfy_entrypoint() -> Any:
    from .prompt_all_in_one.extension import PromptAllInOneExtension

    return PromptAllInOneExtension()


__all__ = ["WEB_DIRECTORY", "comfy_entrypoint"]
