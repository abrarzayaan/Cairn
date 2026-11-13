import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
django_app = get_asgi_application()  # must run before importing models

from api.main import api_app  # FastAPI app; imports Django models safely now


async def application(scope, receive, send):
    if scope["type"] in ("http", "websocket") and scope["path"].startswith("/api"):
        await api_app(scope, receive, send)
    else:
        await django_app(scope, receive, send)
