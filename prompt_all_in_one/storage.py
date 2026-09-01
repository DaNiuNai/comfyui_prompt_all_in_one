from __future__ import annotations

import json
import os
import tempfile
import threading
import time
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any

from .models import CollectionKind, Polarity, PromptRecord

SCHEMA_VERSION = 1
MAX_HISTORY = 100
MAX_FAVORITES = 1000

DEFAULT_SETTINGS: dict[str, Any] = {
    "schema_version": SCHEMA_VERSION,
    "language": "zh",
    "translate_provider": "myMemory_free",
    "source_language": "zh_CN",
    "target_language": "en_US",
    "auto_remove_space": True,
    "trailing_comma": False,
    "separator": ", ",
    "blacklist": [],
    "group_tags_translate": True,
    "group_tag_colors": {},
    "active_group": {},
    "hotkeys": {
        "click": "edit",
        "double_click": "disable",
        "right_click": "none",
    },
}

ALLOWED_SETTINGS = frozenset(DEFAULT_SETTINGS) - {"schema_version"}


class StorageError(RuntimeError):
    pass


class UserStorage:
    """Thread-safe JSON storage rooted inside one ComfyUI user directory."""

    _locks: dict[str, threading.RLock] = {}
    _locks_guard = threading.Lock()

    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        with self._locks_guard:
            self._lock = self._locks.setdefault(str(self.root), threading.RLock())

    def _path(self, name: str) -> Path:
        if not name or any(char not in "abcdefghijklmnopqrstuvwxyz_" for char in name):
            raise StorageError("Invalid storage name")
        path = (self.root / f"{name}.json").resolve()
        if path.parent != self.root:
            raise StorageError("Storage path escaped the user directory")
        return path

    def _read(self, name: str, default: Any) -> Any:
        path = self._path(name)
        with self._lock:
            if not path.exists():
                return deepcopy(default)
            try:
                with path.open("r", encoding="utf-8") as handle:
                    return json.load(handle)
            except (OSError, json.JSONDecodeError) as exc:
                raise StorageError(f"Could not read {name}") from exc

    def _write(self, name: str, value: Any) -> None:
        path = self._path(name)
        with self._lock:
            temporary_name: str | None = None
            try:
                with tempfile.NamedTemporaryFile(
                    "w",
                    encoding="utf-8",
                    dir=self.root,
                    prefix=f".{name}.",
                    suffix=".tmp",
                    delete=False,
                    newline="\n",
                ) as handle:
                    json.dump(value, handle, ensure_ascii=False, indent=2)
                    handle.write("\n")
                    handle.flush()
                    os.fsync(handle.fileno())
                    temporary_name = handle.name
                os.replace(temporary_name, path)
            except OSError as exc:
                if temporary_name:
                    try:
                        os.unlink(temporary_name)
                    except OSError:
                        pass
                raise StorageError(f"Could not write {name}") from exc

    def get_settings(self) -> dict[str, Any]:
        stored = self._read("settings", {})
        if not isinstance(stored, dict):
            stored = {}
        selected = {key: value for key, value in stored.items() if key in ALLOWED_SETTINGS}
        return DEFAULT_SETTINGS | selected

    def update_settings(self, updates: dict[str, Any]) -> dict[str, Any]:
        unknown = set(updates) - ALLOWED_SETTINGS
        if unknown:
            raise StorageError(f"Unknown settings: {', '.join(sorted(unknown))}")
        settings = self.get_settings() | deepcopy(updates)
        settings["schema_version"] = SCHEMA_VERSION
        self._write("settings", settings)
        return settings

    def get_credentials(self) -> dict[str, dict[str, str]]:
        credentials = self._read("credentials", {})
        if not isinstance(credentials, dict):
            return {}
        return {
            str(provider): {str(key): str(value) for key, value in config.items()}
            for provider, config in credentials.items()
            if isinstance(config, dict)
        }

    def set_credentials(self, provider: str, config: dict[str, str]) -> None:
        credentials = self.get_credentials()
        credentials[provider] = config
        self._write("credentials", credentials)

    def delete_credentials(self, provider: str) -> None:
        credentials = self.get_credentials()
        credentials.pop(provider, None)
        self._write("credentials", credentials)

    @staticmethod
    def mask_credentials(config: dict[str, str]) -> dict[str, str]:
        masked: dict[str, str] = {}
        for key, value in config.items():
            if not value:
                masked[key] = ""
            elif key in {"api_base", "model", "region", "host"}:
                masked[key] = value
            else:
                visible = value[:6]
                masked[key] = visible + "*" * max(4, len(value) - len(visible))
        return masked

    def masked_credentials(self) -> dict[str, dict[str, Any]]:
        return {
            provider: {"configured": bool(config), "values": self.mask_credentials(config)}
            for provider, config in self.get_credentials().items()
        }

    @staticmethod
    def _collection_name(kind: CollectionKind, polarity: Polarity) -> str:
        if kind not in ("history", "favorites") or polarity not in ("positive", "negative"):
            raise StorageError("Invalid collection")
        return f"{kind}_{polarity}"

    def list_records(self, kind: CollectionKind, polarity: Polarity) -> list[dict[str, Any]]:
        records = self._read(self._collection_name(kind, polarity), [])
        return records if isinstance(records, list) else []

    def add_record(
        self,
        kind: CollectionKind,
        polarity: Polarity,
        prompt: str,
        tags: list[str],
        name: str = "",
        *,
        created_at: int | None = None,
        source: str = "comfyui",
        import_key: str | None = None,
    ) -> dict[str, Any]:
        prompt = prompt.strip()
        if not prompt:
            raise StorageError("Prompt cannot be empty")
        records = self.list_records(kind, polarity)
        if kind == "history" and records and records[-1].get("prompt") == prompt:
            return records[-1]
        if import_key:
            existing = next((item for item in records if item.get("import_key") == import_key), None)
            if existing:
                return existing
        record = PromptRecord(
            id=str(uuid.uuid4()),
            polarity=polarity,
            name=name.strip()[:200],
            prompt=prompt,
            tags=[str(tag) for tag in tags if str(tag).strip()],
            created_at=created_at or int(time.time() * 1000),
            source=source,
            import_key=import_key,
        ).to_dict()
        records.append(record)
        limit = MAX_HISTORY if kind == "history" else MAX_FAVORITES
        records = records[-limit:]
        self._write(self._collection_name(kind, polarity), records)
        return record

    def update_record(
        self,
        kind: CollectionKind,
        polarity: Polarity,
        record_id: str,
        updates: dict[str, Any],
    ) -> dict[str, Any] | None:
        records = self.list_records(kind, polarity)
        for record in records:
            if record.get("id") != record_id:
                continue
            if "name" in updates:
                record["name"] = str(updates["name"]).strip()[:200]
            if "prompt" in updates and str(updates["prompt"]).strip():
                record["prompt"] = str(updates["prompt"]).strip()
            if "tags" in updates and isinstance(updates["tags"], list):
                record["tags"] = [str(tag) for tag in updates["tags"]]
            self._write(self._collection_name(kind, polarity), records)
            return record
        return None

    def delete_record(self, kind: CollectionKind, polarity: Polarity, record_id: str) -> bool:
        records = self.list_records(kind, polarity)
        filtered = [item for item in records if item.get("id") != record_id]
        if len(filtered) == len(records):
            return False
        self._write(self._collection_name(kind, polarity), filtered)
        return True

    def clear_records(self, kind: CollectionKind, polarity: Polarity) -> None:
        self._write(self._collection_name(kind, polarity), [])
