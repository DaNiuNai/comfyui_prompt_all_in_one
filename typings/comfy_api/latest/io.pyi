from typing import Any

class ComfyNode: ...

class Input:
    id: str

class Output:
    id: str
    def get_io_type(self) -> str: ...

class _StringInput(Input):
    def __init__(
        self,
        id: str,
        display_name: str | None = ...,
        optional: bool = ...,
        tooltip: str | None = ...,
        lazy: bool | None = ...,
        multiline: bool = ...,
        placeholder: str | None = ...,
        default: str | None = ...,
        dynamic_prompts: bool | None = ...,
        socketless: bool | None = ...,
        force_input: bool | None = ...,
        extra_dict: dict[str, Any] | None = ...,
        raw_link: bool | None = ...,
        advanced: bool | None = ...,
    ) -> None: ...

class _StringOutput(Output):
    def __init__(
        self,
        id: str | None = ...,
        display_name: str | None = ...,
        tooltip: str | None = ...,
        is_output_list: bool = ...,
    ) -> None: ...

class String:
    Input = _StringInput
    Output = _StringOutput

class Schema:
    node_id: str
    display_name: str | None
    inputs: list[Input]
    outputs: list[Output]
    def __init__(
        self,
        node_id: str,
        display_name: str | None = ...,
        category: str = ...,
        inputs: list[Input] = ...,
        outputs: list[Output] = ...,
        description: str = ...,
        search_aliases: list[str] = ...,
    ) -> None: ...

class NodeOutput:
    result: tuple[Any, ...] | None
    def __init__(self, *args: Any) -> None: ...
