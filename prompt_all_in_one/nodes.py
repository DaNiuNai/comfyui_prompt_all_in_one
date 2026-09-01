from __future__ import annotations

from comfy_api.latest import io


class _PromptNode(io.ComfyNode):
    node_id = ""
    display_name = ""
    description = ""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=cls.node_id,
            display_name=cls.display_name,
            category="Prompt All in One",
            description=cls.description,
            search_aliases=["prompt", "提示词", "正向提示词", "负向提示词"],
            inputs=[
                io.String.Input(
                    "prompt",
                    display_name="Prompt",
                    default="",
                    multiline=True,
                    dynamic_prompts=True,
                    placeholder="Use Open Prompt Editor on this node to edit in the floating panel.",
                )
            ],
            outputs=[io.String.Output("prompt", display_name="STRING")],
        )

    @classmethod
    def execute(cls, prompt: str) -> io.NodeOutput:
        return io.NodeOutput(prompt)


class PositivePromptNode(_PromptNode):
    node_id = "PromptAllInOne_Positive"
    display_name = "Prompt All in One · Positive"
    description = "Build and manage a positive prompt in the floating Prompt All in One editor."


class NegativePromptNode(_PromptNode):
    node_id = "PromptAllInOne_Negative"
    display_name = "Prompt All in One · Negative"
    description = "Build and manage a negative prompt in the floating Prompt All in One editor."
