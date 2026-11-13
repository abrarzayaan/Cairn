import os
import sys
from pathlib import Path

from django.core.asgi import get_asgi_application

# Ensure backend directory is in sys.path so api and apps can be imported
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
django_app = get_asgi_application()  # must run before importing models

from api.main import api_app  # noqa: E402


async def application(scope, receive, send):
    if scope["type"] in ("http", "websocket"):
        path = scope.get("path", "")
        if path.startswith("/api"):
            await api_app(scope, receive, send)
            return

        # Ensure Django allauth and admin endpoints receive trailing slash without 301 bounce
        if not path.endswith("/") and (path.startswith("/accounts") or path.startswith("/admin-secret")):
            normalized_path = path + "/"
            scope["path"] = normalized_path
            if "raw_path" in scope:
                scope["raw_path"] = normalized_path.encode("utf-8")

    await django_app(scope, receive, send)
