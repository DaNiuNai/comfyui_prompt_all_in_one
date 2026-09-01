from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace
from typing import Any


class FakeComfyNode:
    pass


class FakeInput:
    def __init__(self, identifier: str, **_: Any) -> None:
        self.id = identifier


class FakeOutput:
    def __init__(self, identifier: str, **_: Any) -> None:
        self.id = identifier

    def get_io_type(self) -> str:
        return "STRING"


class FakeSchema:
    def __init__(self, **values: Any) -> None:
        self.__dict__.update(values)


class FakeNodeOutput:
    def __init__(self, *values: Any) -> None:
        self.result = values


fake_comfy_api = ModuleType("comfy_api")
fake_latest = ModuleType("comfy_api.latest")
fake_latest.io = SimpleNamespace(
    ComfyNode=FakeComfyNode,
    String=SimpleNamespace(Input=FakeInput, Output=FakeOutput),
    Schema=FakeSchema,
    NodeOutput=FakeNodeOutput,
)
fake_comfy_api.latest = fake_latest
sys.modules.setdefault("comfy_api", fake_comfy_api)
sys.modules.setdefault("comfy_api.latest", fake_latest)

from prompt_all_in_one.nodes import NegativePromptNode, PositivePromptNode  # noqa: E402


def test_prompt_nodes_have_stable_distinct_ids() -> None:
    positive = PositivePromptNode.define_schema()
    negative = NegativePromptNode.define_schema()

    assert positive.node_id == "PromptAllInOne_Positive"
    assert negative.node_id == "PromptAllInOne_Negative"
    assert positive.node_id != negative.node_id
    assert positive.outputs[0].get_io_type() == "STRING"
    assert negative.outputs[0].get_io_type() == "STRING"


def test_prompt_nodes_return_text_unchanged() -> None:
    prompt = "masterpiece, (portrait:1.2), <lora:style:0.8>"

    assert PositivePromptNode.execute(prompt).result == (prompt,)
    assert NegativePromptNode.execute(prompt).result == (prompt,)
