from .base import *

DEBUG = True
SECRET_KEY = os.environ.get("SECRET_KEY", "django-insecure-dev-key-cairn-development-only")

# Use simple static files storage in dev to avoid manifest errors before collectstatic
STORAGES["staticfiles"] = {
    "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
}
WHITENOISE_USE_FINDERS = True

# Allow swagger / redoc docs in dev
ENABLE_API_DOCS = True

# Allow Cloudflare Quick Tunnels & local network testing in dev mode only
for _dev_host in (".trycloudflare.com", "0.0.0.0"):
    if _dev_host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_dev_host)

for _dev_origin in ("https://*.trycloudflare.com", "http://127.0.0.1:3000", "http://localhost:3000"):
    if _dev_origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_dev_origin)
