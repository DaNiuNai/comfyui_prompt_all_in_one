from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

CATALOG_PATH = Path(__file__).with_name("data") / "translate_apis.json"


@lru_cache(maxsize=1)
def get_translate_apis() -> dict[str, Any]:
    with CATALOG_PATH.open("r", encoding="utf-8") as handle:
        catalog = cast(dict[str, Any], json.load(handle))
    for group in catalog.get("apis", []):
        group["children"] = [item for item in group.get("children", []) if item.get("key") != "mbart50"]
    return catalog


def get_provider(provider: str) -> dict[str, Any] | None:
    for group in get_translate_apis().get("apis", []):
        for item in group.get("children", []):
            if item.get("key") == provider:
                return cast(dict[str, Any], item)
    return None


def get_lang(key: str, replacements: dict[str, str] | None = None) -> str:
    messages = {
        "translate_api_not_support": "Translation provider is not supported",
        "translate_language_not_support": "The selected language is not supported by this provider",
        "is_required": "{0} is required",
        "no_response_from": "No response from {0}",
        "request_error": "Request to {0} failed",
        "response_is_empty": "Response from {0} is empty",
        "response_error": "Response from {0} is invalid",
    }
    message = messages.get(key, key)
    for placeholder, value in (replacements or {}).items():
        message = message.replace("{" + str(placeholder) + "}", str(value))
    return message


def public_provider_catalog() -> list[dict[str, Any]]:
    public: list[dict[str, Any]] = []
    for group in get_translate_apis().get("apis", []):
        for item in group.get("children", []):
            config = []
            for field in item.get("config", []) or []:
                config.append(
                    {
                        "key": field.get("key"),
                        "name": field.get("name", field.get("key")),
                        "type": field.get("type", "input"),
                        "default": field.get("default", ""),
                        "privacy": bool(field.get("privacy")),
                        "options": field.get("options", []),
                    }
                )
            public.append(
                {
                    "key": item.get("key"),
                    "name": item.get("name", item.get("key")),
                    "group": group.get("name", ""),
                    "free": item.get("type") == "translators" or item.get("key") == "myMemory_free",
                    "config": config,
                    "languages": sorted(item.get("support", {}).keys()),
                }
            )
    return public
