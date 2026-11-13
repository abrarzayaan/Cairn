from .base import *

DEBUG = True
SECRET_KEY = os.environ.get("SECRET_KEY", "django-insecure-dev-key-devbook-development-only")

# Use simple static files storage in dev to avoid manifest errors before collectstatic
STORAGES["staticfiles"] = {
    "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
}

# Allow swagger / redoc docs in dev
ENABLE_API_DOCS = True
