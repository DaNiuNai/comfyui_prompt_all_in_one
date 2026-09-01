from __future__ import annotations

import asyncio
from importlib import import_module
from typing import Any, cast
from urllib.parse import urlparse

from .provider_support import get_provider

PROVIDER_CLASSES: dict[str, tuple[str, str]] = {
    "google": ("google_tanslator", "GoogleTranslator"),
    "microsoft": ("microsoft_translator", "MicrosoftTranslator"),
    "openai": ("openai_translator", "OpenaiTranslator"),
    "amazon": ("amazon_translator", "AmazonTranslator"),
    "deepl": ("deepl_translator", "DeeplTranslator"),
    "baidu": ("baidu_translator", "BaiduTranslator"),
    "alibaba": ("alibaba_translator", "AlibabaTranslator"),
    "yandex": ("yandex_translator", "YandexTranslator"),
    "youdao": ("youdao_translator", "YoudaoTranslator"),
    "tencent": ("tencent_translator", "TencentTranslator"),
    "myMemory_free": ("mymemory_translator", "MyMemoryTranslator"),
    "myMemory": ("mymemory_translator", "MyMemoryTranslator"),
    "niutrans": ("niutrans_translator", "NiutransTranslator"),
    "caiyun": ("caiyun_translator", "CaiyunTranslator"),
    "volcengine": ("volcengine_translator", "VolcengineTranslator"),
    "iflytekV1": ("iflytekV1_translator", "IflytekV1Translator"),
    "iflytekV2": ("iflytekV2_translator", "IflytekV2Translator"),
}


class ServiceError(RuntimeError):
    pass


def _translate_sync(texts: list[str], provider: str, from_lang: str, to_lang: str, credentials: dict[str, str]) -> list[str]:
    provider_item = get_provider(provider)
    if provider_item is None:
        raise ServiceError("Unknown translation provider")
    if provider_item.get("type") == "translators":
        try:
            import translators as ts
        except ImportError as exc:
            raise ServiceError("The translators dependency is not installed") from exc
        translator = provider_item.get("translator")
        source = provider_item.get("support", {}).get(from_lang, from_lang)
        target = provider_item.get("support", {}).get(to_lang, to_lang)
        results: list[str] = []
        for text in texts:
            result = ts.translate_text(
                text,
                translator=translator,
                from_language=source,
                to_language=target,
                timeout=30,
            )
            results.append(str(result))
        return results
    mapping = PROVIDER_CLASSES.get(provider)
    if mapping is None:
        raise ServiceError("Translation provider is not available")
    module_name, class_name = mapping
    try:
        module = import_module(f".legacy_translators.{module_name}", package=__package__)
        translator_class = getattr(module, class_name)
        translator = translator_class()
        translator.set_from_lang(from_lang)
        translator.set_to_lang(to_lang)
        translator.set_api_config(credentials)
        return [str(value) for value in translator.translate_batch(texts)]
    except ServiceError:
        raise
    except Exception as exc:
        message = str(exc).strip() or exc.__class__.__name__
        raise ServiceError(message[:500]) from exc


async def translate_texts(texts: list[str], provider: str, from_lang: str, to_lang: str, credentials: dict[str, str]) -> list[str]:
    if not texts or len(texts) > 100:
        raise ServiceError("Translate request must contain between 1 and 100 texts")
    if any(not isinstance(text, str) or len(text) > 20_000 for text in texts):
        raise ServiceError("Each translation text must be a string shorter than 20,000 characters")
    return await asyncio.wait_for(
        asyncio.to_thread(_translate_sync, texts, provider, from_lang, to_lang, credentials),
        timeout=90,
    )


def _validate_api_base(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        raise ServiceError("API base must be an HTTP(S) URL without embedded credentials")
    return value.rstrip("/")


def _generate_sync(messages: list[dict[str, str]], credentials: dict[str, str]) -> str:
    api_key = credentials.get("api_key", "").strip()
    if not api_key:
        raise ServiceError("API key is required")
    api_base = _validate_api_base(credentials.get("api_base", "https://api.openai.com/v1"))
    model = credentials.get("model", "gpt-4o-mini").strip() or "gpt-4o-mini"
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise ServiceError("The openai dependency is not installed") from exc
    try:
        client = OpenAI(base_url=api_base, api_key=api_key, timeout=60)
        completion = client.chat.completions.create(model=model, messages=cast(Any, messages))
        if not completion.choices or not completion.choices[0].message.content:
            raise ServiceError("The AI service returned no content")
        return completion.choices[0].message.content
    except ServiceError:
        raise
    except Exception as exc:
        message = str(exc).replace(api_key, "***")
        raise ServiceError(message[:500]) from exc


async def generate_prompt(messages: list[dict[str, str]], credentials: dict[str, str]) -> str:
    if not messages or len(messages) > 20:
        raise ServiceError("Messages must contain between 1 and 20 items")
    clean_messages: list[dict[str, str]] = []
    total_length = 0
    for item in messages:
        role = item.get("role")
        content = item.get("content")
        if role not in {"system", "user", "assistant"} or not isinstance(content, str):
            raise ServiceError("Invalid AI message")
        total_length += len(content)
        clean_messages.append({"role": role, "content": content})
    if total_length > 50_000:
        raise ServiceError("AI request is too large")
    return await asyncio.wait_for(asyncio.to_thread(_generate_sync, clean_messages, credentials), timeout=90)
