from collections.abc import Callable
from typing import Any, TypeVar

from aiohttp import web

_F = TypeVar("_F", bound=Callable[..., Any])

class Routes:
    def get(self, path: str) -> Callable[[_F], _F]: ...
    def post(self, path: str) -> Callable[[_F], _F]: ...
    def put(self, path: str) -> Callable[[_F], _F]: ...
    def patch(self, path: str) -> Callable[[_F], _F]: ...
    def delete(self, path: str) -> Callable[[_F], _F]: ...

class UserManager:
    def get_request_user_filepath(
        self,
        request: web.Request,
        file: str | None,
        type: str = ...,
        create_dir: bool = ...,
    ) -> str | None: ...

class PromptServer:
    instance: PromptServer
    routes: Routes
    user_manager: UserManager
    app: web.Application
