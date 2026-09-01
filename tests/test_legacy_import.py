from __future__ import annotations

import json
from pathlib import Path

import pytest

from prompt_all_in_one.legacy_import import import_legacy, parse_import_file
from prompt_all_in_one.storage import UserStorage


def test_import_maps_legacy_categories_and_is_idempotent(tmp_path: Path) -> None:
    storage = UserStorage(tmp_path)
    value = [
        {
            "id": "legacy-id",
            "time": 1_700_000_000,
            "name": "portrait",
            "tags": ["masterpiece", {"en": "portrait"}],
            "prompt": "masterpiece, portrait",
        }
    ]
    files = [("history.txt2img.json", value)]

    preview = import_legacy(storage, files, commit=False)
    first = import_legacy(storage, files, commit=True)
    second = import_legacy(storage, files, commit=True)

    assert preview.accepted == 1
    assert first.accepted == 1
    assert second.skipped == 1
    record = storage.list_records("history", "positive")[0]
    assert record["source"] == "legacy:txt2img"
    assert record["created_at"] == 1_700_000_000_000
    assert record["tags"] == ["masterpiece", "portrait"]


def test_import_accepts_only_allowlisted_utf8_json() -> None:
    name, value = parse_import_file(
        "nested/history.txt2img_neg.json",
        json.dumps([{"prompt": "bad anatomy"}]).encode("utf-8"),
    )

    assert name == "history.txt2img_neg.json"
    assert value[0]["prompt"] == "bad anatomy"
    with pytest.raises(ValueError, match="Unsupported"):
        parse_import_file("credentials.json", b"{}")
    with pytest.raises(ValueError, match="UTF-8 JSON"):
        parse_import_file("history.txt2img.json", b"not-json")


def test_imports_only_non_sensitive_settings(tmp_path: Path) -> None:
    storage = UserStorage(tmp_path)
    files = [
        ("languageCode.json", "zh_CN"),
        ("blacklist.json", {"blurry": True, "keep": False}),
        (
            "groupTagsActive-txt2img_prompt.json",
            {"groupTagsActive": "人物", "subGroupTagsActive": "对象"},
        ),
    ]

    result = import_legacy(storage, files, commit=True)

    assert result.settings == 3
    assert storage.get_settings()["language"] == "zh"
    assert storage.get_settings()["blacklist"] == ["blurry"]
    assert storage.get_settings()["active_group"]["groupTagsActive-txt2img_prompt"] == {
        "groupTagsActive": "人物",
        "subGroupTagsActive": "对象",
    }
    assert storage.get_credentials() == {}


def test_import_normalizes_legacy_hotkeys(tmp_path: Path) -> None:
    storage = UserStorage(tmp_path)

    result = import_legacy(
        storage,
        [
            (
                "hotkey.json",
                {"click": "edit", "dblClick": "disable", "rightClick": "extend"},
            )
        ],
        commit=True,
    )

    assert result.settings == 1
    assert storage.get_settings()["hotkeys"] == {
        "click": "edit",
        "double_click": "disable",
        "right_click": "extend",
        "hover": "extend",
    }
