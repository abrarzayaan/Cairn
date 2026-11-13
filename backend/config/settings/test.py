import os

from .dev import *

# Default to in-memory SQLite for tests unless explicit postgres test env
if os.environ.get("USE_POSTGRES_TEST") != "1":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
