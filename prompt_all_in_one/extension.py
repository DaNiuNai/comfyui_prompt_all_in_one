from __future__ import annotations

from comfy_api.latest import ComfyExtension, io
from typing_extensions import override

from .nodes import NegativePromptNode, PositivePromptNode
from .routes import register_routes


class PromptAllInOneExtension(ComfyExtension):
    @override
    async def on_load(self) -> None:
        register_routes()

    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [PositivePromptNode, NegativePromptNode]
