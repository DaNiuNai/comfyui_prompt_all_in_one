from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import PurePath
from typing import Any

from .models import CollectionKind, Polarity
from .storage import UserStorage

MAX_IMPORT_FILES = 64
MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024

LEGACY_COLLECTIONS: dict[str, tuple[CollectionKind, Polarity, str]] = {
    "history.txt2img.json": ("history", "positive", "txt2img"),
    "history.img2img.json": ("history", "positive", "img2img"),
    "history.txt2img_neg.json": ("history", "negative", "txt2img_neg"),
    "history.img2img_neg.json": ("history", "negative", "img2img_neg"),
    "favorite.txt2img.json": ("favorites", "positive", "txt2img"),
    "favorite.img2img.json": ("favorites", "positive", "img2img"),
    "favorite.txt2img_neg.json": ("favorites", "negative", "txt2img_neg"),
    "favorite.img2img_neg.json": ("favorites", "negative", "img2img_neg"),
}

LEGACY_SETTINGS: dict[str, str] = {
    "languageCode.json": "language",
    "autoRemoveSpace.json": "auto_remove_space",
    "autoRemoveLastComma.json": "trailing_comma",
    "blacklist.json": "blacklist",
    "groupTagsColor.json": "group_tag_colors",
    "hotkey.json": "hotkeys",
}

ALLOWED_FILES = frozenset(LEGACY_COLLECTIONS) | frozenset(LEGACY_SETTINGS)


@dataclass(slots=True)
class ImportResult:
    accepted: int = 0
    skipped: int = 0
    invalid: int = 0
    settings: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "accepted": self.accepted,
            "skipped": self.skipped,
            "invalid": self.invalid,
            "settings": self.settings,
        }


def parse_import_file(filename: str, content: bytes) -> tuple[str, Any]:
    safe_name = PurePath(filename.replace("\\", "/")).name
    is_group_state = safe_name.startswith("groupTagsActive-") and safe_name.endswith(".json")
    if safe_name not in ALLOWED_FILES and not is_group_state:
        raise ValueError("Unsupported legacy file")
    if len(content) > MAX_IMPORT_FILE_SIZE:
        raise ValueError("Legacy file is too large")
    try:
        return safe_name, json.loads(content.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Legacy file is not valid UTF-8 JSON") from exc


def _normalize_tags(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    tags: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            tags.append(item.strip())
        elif isinstance(item, dict):
            for key in ("tag", "en", "text", "value", "local"):
                candidate = item.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    tags.append(candidate.strip())
                    break
    return tags


def _import_key(filename: str, item: dict[str, Any]) -> str:
    identity = f"{filename}:{item.get('id', '')}:{item.get('time', '')}:{item.get('prompt', '')}"
    return "legacy:" + hashlib.sha256(identity.encode("utf-8")).hexdigest()


def _normalize_setting(name: str, value: Any) -> Any:
    key = LEGACY_SETTINGS[name]
    if key == "language":
        return "zh" if str(value).lower().startswith("zh") else "en"
    if key == "trailing_comma":
        return not bool(value)
    if key == "blacklist":
        if isinstance(value, dict):
            return [str(item) for item, enabled in value.items() if enabled]
        if isinstance(value, list):
            return [str(item) for item in value]
        return []
    return value


def import_legacy(storage: UserStorage, files: list[tuple[str, Any]], *, commit: bool) -> ImportResult:
    result = ImportResult()
    setting_updates: dict[str, Any] = {}
    for filename, value in files:
        collection = LEGACY_COLLECTIONS.get(filename)
        if collection:
            if not isinstance(value, list):
                result.invalid += 1
                continue
            kind, polarity, source = collection
            existing_keys = {item.get("import_key") for item in storage.list_records(kind, polarity) if item.get("import_key")}
            for item in value:
                if not isinstance(item, dict) or not isinstance(item.get("prompt"), str) or not item["prompt"].strip():
                    result.invalid += 1
                    continue
                import_key = _import_key(filename, item)
                if import_key in existing_keys:
                    result.skipped += 1
                    continue
                result.accepted += 1
                if commit:
                    timestamp = item.get("time")
                    created_at = int(timestamp * 1000) if isinstance(timestamp, (int, float)) else None
                    storage.add_record(
                        kind,
                        polarity,
                        item["prompt"],
                        _normalize_tags(item.get("tags")),
                        str(item.get("name", "")),
                        created_at=created_at,
                        source=f"legacy:{source}",
                        import_key=import_key,
                    )
                    existing_keys.add(import_key)
            continue
        if filename in LEGACY_SETTINGS:
            setting_updates[LEGACY_SETTINGS[filename]] = _normalize_setting(filename, value)
            result.settings += 1
        elif filename.startswith("groupTagsActive-"):
            active_group = setting_updates.setdefault("active_group", storage.get_settings()["active_group"])
            if isinstance(active_group, dict):
                active_group[filename.removesuffix(".json")] = value
                result.settings += 1
    if commit and setting_updates:
        storage.update_settings(setting_updates)
    return result
