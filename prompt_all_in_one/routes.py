from __future__ import annotations

import asyncio
from typing import Any, cast

import folder_paths
from aiohttp import web
from aiohttp.multipart import BodyPartReader
from server import PromptServer

from .group_tags import load_group_tags
from .legacy_import import MAX_IMPORT_FILES, MAX_IMPORT_FILE_SIZE, import_legacy, parse_import_file
from .models import CollectionKind, Polarity
from .provider_support import public_provider_catalog
from .services import ServiceError, generate_prompt, translate_texts
from .storage import StorageError, UserStorage

API_PREFIX = "/prompt_all_in_one/v1"
_registered = False


def _json(data: Any, status: int = 200) -> web.Response:
    return web.json_response({"success": status < 400, "data": data}, status=status)


def _error(message: str, status: int = 400) -> web.Response:
    return web.json_response({"success": False, "error": {"message": message}}, status=status)


def _storage(request: web.Request) -> UserStorage:
    path = PromptServer.instance.user_manager.get_request_user_filepath(request, "prompt_all_in_one", type="userdata", create_dir=True)
    if not path:
        raise StorageError("Unable to resolve the ComfyUI user directory")
    return UserStorage(path)


async def _body(request: web.Request) -> dict[str, Any]:
    try:
        value = await request.json()
    except Exception as exc:
        raise StorageError("Request body must be valid JSON") from exc
    if not isinstance(value, dict):
        raise StorageError("Request body must be a JSON object")
    return value


async def _read_import_part(part: BodyPartReader) -> bytes:
    chunks: list[bytes] = []
    size = 0
    while True:
        chunk = await part.read_chunk(size=64 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_IMPORT_FILE_SIZE:
            raise StorageError("Legacy file is too large")
        chunks.append(chunk)
    return b"".join(chunks)


def _collection_params(request: web.Request) -> tuple[CollectionKind, Polarity]:
    kind = request.match_info["kind"]
    polarity = request.match_info["polarity"]
    if kind not in {"history", "favorites"} or polarity not in {"positive", "negative"}:
        raise StorageError("Unknown collection")
    return cast(CollectionKind, kind), cast(Polarity, polarity)


def _model_index() -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for model_type in ("checkpoints", "loras", "embeddings"):
        try:
            result[model_type] = folder_paths.get_filename_list(model_type)
        except Exception:
            result[model_type] = []
    return result


def register_routes() -> None:
    global _registered
    if _registered:
        return
    routes = PromptServer.instance.routes

    @routes.get(f"{API_PREFIX}/bootstrap")
    async def bootstrap(request: web.Request) -> web.Response:
        try:
            storage = _storage(request)
            settings = await asyncio.to_thread(storage.get_settings)
            language = settings.get("language", "zh")
            payload = {
                "settings": settings,
                "credentials": await asyncio.to_thread(storage.masked_credentials),
                "providers": public_provider_catalog(),
                "group_tags": load_group_tags(language),
                "models": _model_index(),
                "collections": {
                    kind: {polarity: await asyncio.to_thread(storage.list_records, kind, polarity) for polarity in ("positive", "negative")}
                    for kind in ("history", "favorites")
                },
            }
            return _json(payload)
        except (StorageError, KeyError) as exc:
            return _error(str(exc), 400)

    @routes.put(f"{API_PREFIX}/settings")
    async def update_settings(request: web.Request) -> web.Response:
        try:
            body = await _body(request)
            updates = body.get("settings")
            if not isinstance(updates, dict):
                raise StorageError("settings must be an object")
            settings = await asyncio.to_thread(_storage(request).update_settings, updates)
            return _json(settings)
        except StorageError as exc:
            return _error(str(exc))

    @routes.put(f"{API_PREFIX}/credentials/{{provider}}")
    async def update_credentials(request: web.Request) -> web.Response:
        try:
            provider = request.match_info["provider"]
            if provider not in {item["key"] for item in public_provider_catalog()} | {"openai_ai"}:
                raise StorageError("Unknown service")
            body = await _body(request)
            config = body.get("config")
            if not isinstance(config, dict) or any(not isinstance(value, str) for value in config.values()):
                raise StorageError("config must contain string values")
            if len(config) > 12 or any(len(value) > 2048 for value in config.values()):
                raise StorageError("Service configuration is too large")
            storage = _storage(request)
            existing = storage.get_credentials().get(provider, {})
            provider_definition = next((item for item in public_provider_catalog() if item["key"] == provider), None)
            private_keys = {field["key"] for field in (provider_definition or {}).get("config", []) if field.get("privacy")}
            if provider == "openai_ai":
                private_keys.add("api_key")
            merged = dict(config)
            for key in private_keys:
                value = merged.get(key, "")
                if (not value or "*" in value) and existing.get(key):
                    merged[key] = existing[key]
            await asyncio.to_thread(storage.set_credentials, provider, merged)
            return _json({"provider": provider, "values": storage.mask_credentials(merged)})
        except StorageError as exc:
            return _error(str(exc))

    @routes.delete(f"{API_PREFIX}/credentials/{{provider}}")
    async def delete_credentials(request: web.Request) -> web.Response:
        try:
            await asyncio.to_thread(_storage(request).delete_credentials, request.match_info["provider"])
            return _json({"deleted": True})
        except StorageError as exc:
            return _error(str(exc))

    @routes.get(f"{API_PREFIX}/collections/{{kind}}/{{polarity}}")
    async def list_collection(request: web.Request) -> web.Response:
        try:
            kind, polarity = _collection_params(request)
            return _json(await asyncio.to_thread(_storage(request).list_records, kind, polarity))
        except StorageError as exc:
            return _error(str(exc))

    @routes.post(f"{API_PREFIX}/collections/{{kind}}/{{polarity}}")
    async def add_collection(request: web.Request) -> web.Response:
        try:
            kind, polarity = _collection_params(request)
            body = await _body(request)
            prompt = body.get("prompt")
            tags = body.get("tags", [])
            if not isinstance(prompt, str) or len(prompt) > 100_000 or not isinstance(tags, list):
                raise StorageError("Invalid prompt record")
            record = await asyncio.to_thread(
                _storage(request).add_record,
                kind,
                polarity,
                prompt,
                [str(tag) for tag in tags[:2000]],
                str(body.get("name", "")),
            )
            return _json(record, 201)
        except StorageError as exc:
            return _error(str(exc))

    @routes.patch(f"{API_PREFIX}/collections/{{kind}}/{{polarity}}/{{record_id}}")
    async def patch_collection(request: web.Request) -> web.Response:
        try:
            kind, polarity = _collection_params(request)
            record = await asyncio.to_thread(
                _storage(request).update_record,
                kind,
                polarity,
                request.match_info["record_id"],
                await _body(request),
            )
            return _json(record) if record else _error("Record not found", 404)
        except StorageError as exc:
            return _error(str(exc))

    @routes.delete(f"{API_PREFIX}/collections/{{kind}}/{{polarity}}/{{record_id}}")
    async def delete_collection(request: web.Request) -> web.Response:
        try:
            kind, polarity = _collection_params(request)
            deleted = await asyncio.to_thread(_storage(request).delete_record, kind, polarity, request.match_info["record_id"])
            return _json({"deleted": deleted}) if deleted else _error("Record not found", 404)
        except StorageError as exc:
            return _error(str(exc))

    @routes.delete(f"{API_PREFIX}/collections/{{kind}}/{{polarity}}")
    async def clear_collection(request: web.Request) -> web.Response:
        try:
            kind, polarity = _collection_params(request)
            await asyncio.to_thread(_storage(request).clear_records, kind, polarity)
            return _json({"deleted": True})
        except StorageError as exc:
            return _error(str(exc))

    @routes.post(f"{API_PREFIX}/translate")
    async def translate(request: web.Request) -> web.Response:
        try:
            body = await _body(request)
            texts = body.get("texts")
            provider = body.get("provider")
            if not isinstance(texts, list) or not isinstance(provider, str):
                raise StorageError("texts and provider are required")
            if not 1 <= len(texts) <= 100:
                raise StorageError("texts must contain between 1 and 100 items")
            credentials = _storage(request).get_credentials().get(provider, {})
            translated = await translate_texts(
                texts,
                provider,
                str(body.get("from_lang", "auto")),
                str(body.get("to_lang", "en_US")),
                credentials,
            )
            return _json({"texts": translated})
        except StorageError as exc:
            return _error(str(exc))
        except asyncio.TimeoutError:
            return _error("Translation timed out", 504)
        except ServiceError as exc:
            return _error(str(exc), 502)

    @routes.post(f"{API_PREFIX}/ai/generate")
    async def ai_generate(request: web.Request) -> web.Response:
        try:
            body = await _body(request)
            messages = body.get("messages")
            if not isinstance(messages, list):
                raise StorageError("messages is required")
            if not 1 <= len(messages) <= 20:
                raise StorageError("messages must contain between 1 and 20 items")
            credentials = _storage(request).get_credentials().get("openai_ai", {})
            content = await generate_prompt(messages, credentials)
            return _json({"content": content})
        except StorageError as exc:
            return _error(str(exc))
        except asyncio.TimeoutError:
            return _error("AI request timed out", 504)
        except ServiceError as exc:
            return _error(str(exc), 502)

    @routes.get(f"{API_PREFIX}/models")
    async def models(_: web.Request) -> web.Response:
        return _json(_model_index())

    @routes.post(f"{API_PREFIX}/import")
    async def import_data(request: web.Request) -> web.Response:
        try:
            reader = await request.multipart()
            mode = "preview"
            files: list[tuple[str, Any]] = []
            async for part in reader:
                if not isinstance(part, BodyPartReader):
                    continue
                if part.name == "mode":
                    mode = (await part.text()).strip()
                    continue
                if part.name != "files" or not part.filename:
                    continue
                if len(files) >= MAX_IMPORT_FILES:
                    raise StorageError("Too many import files")
                content = await _read_import_part(part)
                files.append(parse_import_file(part.filename, content))
            if mode not in {"preview", "commit"} or not files:
                raise StorageError("Import requires files and a valid mode")
            result = await asyncio.to_thread(import_legacy, _storage(request), files, commit=mode == "commit")
            return _json(result.to_dict())
        except (StorageError, ValueError, KeyError) as exc:
            return _error(str(exc))

    _registered = True
