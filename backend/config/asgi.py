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
    if scope["type"] in ("http", "websocket") and scope["path"].startswith("/api"):
        await api_app(scope, receive, send)
    else:
        await django_app(scope, receive, send)
