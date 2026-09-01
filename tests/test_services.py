from __future__ import annotations

import sys
from types import ModuleType
from typing import Any

import pytest

from prompt_all_in_one import services


def _translators_provider() -> dict[str, Any]:
    return {
        "type": "translators",
        "translator": "baidu",
        "support": {"zh_CN": "zh", "en_US": "en"},
    }


def test_translators_error_is_converted_to_service_error(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_translators = ModuleType("translators")

    def translate_text(*args: object, **kwargs: object) -> str:
        raise RuntimeError("upstream response did not contain translation data")

    fake_translators.translate_text = translate_text
    monkeypatch.setitem(sys.modules, "translators", fake_translators)
    monkeypatch.setattr(services, "get_provider", lambda provider: _translators_provider())

    with pytest.raises(services.ServiceError, match="upstream response did not contain translation data"):
        services._translate_sync(["你好"], "baidu", "zh_CN", "en_US", {})


def test_translators_success_preserves_batch_order(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_translators = ModuleType("translators")

    def translate_text(text: str, **kwargs: object) -> str:
        return f"translated:{text}"

    fake_translators.translate_text = translate_text
    monkeypatch.setitem(sys.modules, "translators", fake_translators)
    monkeypatch.setattr(services, "get_provider", lambda provider: _translators_provider())

    assert services._translate_sync(["一", "二"], "baidu", "zh_CN", "en_US", {}) == ["translated:一", "translated:二"]
