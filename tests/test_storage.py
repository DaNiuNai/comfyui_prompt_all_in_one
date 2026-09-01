from __future__ import annotations

import json
from pathlib import Path

import pytest

from prompt_all_in_one.storage import MAX_HISTORY, StorageError, UserStorage


def test_settings_are_allowlisted_and_persisted(tmp_path: Path) -> None:
    storage = UserStorage(tmp_path / "user-a")

    settings = storage.update_settings({"language": "en", "blacklist": ["blurry"]})

    assert settings["language"] == "en"
    assert UserStorage(tmp_path / "user-a").get_settings()["blacklist"] == ["blurry"]
    with pytest.raises(StorageError, match="Unknown settings"):
        storage.update_settings({"api_key": "must-not-be-a-setting"})


def test_history_deduplicates_adjacent_prompts_and_enforces_limit(tmp_path: Path) -> None:
    storage = UserStorage(tmp_path)
    first = storage.add_record("history", "positive", "same prompt", ["same prompt"])
    duplicate = storage.add_record("history", "positive", "same prompt", ["same prompt"])

    assert duplicate["id"] == first["id"]

    for index in range(MAX_HISTORY + 5):
        storage.add_record("history", "positive", f"prompt {index}", [f"prompt {index}"])

    records = storage.list_records("history", "positive")
    assert len(records) == MAX_HISTORY
    assert records[-1]["prompt"] == f"prompt {MAX_HISTORY + 4}"


def test_credentials_are_masked_without_changing_safe_fields(tmp_path: Path) -> None:
    storage = UserStorage(tmp_path)
    storage.set_credentials(
        "openai_ai",
        {
            "api_key": "secret-value-123",
            "api_base": "https://example.test/v1",
            "model": "test-model",
        },
    )

    masked = storage.masked_credentials()["openai_ai"]
    assert masked["configured"] is True
    assert masked["values"]["api_key"].startswith("secret")
    assert "value-123" not in masked["values"]["api_key"]
    assert masked["values"]["api_base"] == "https://example.test/v1"


def test_writes_are_valid_json_and_leave_no_temporary_files(tmp_path: Path) -> None:
    storage = UserStorage(tmp_path)
    storage.update_settings({"language": "zh"})

    with (tmp_path / "settings.json").open("r", encoding="utf-8") as handle:
        assert json.load(handle)["language"] == "zh"
    assert not list(tmp_path.glob("*.tmp"))
