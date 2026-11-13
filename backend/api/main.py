from django.conf import settings
from django.db import connection
from fastapi import FastAPI, status
from fastapi.responses import JSONResponse

api_app = FastAPI(
    title="Devbook API",
    version="1.0.0",
    docs_url="/api/docs" if getattr(settings, "ENABLE_API_DOCS", False) else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if getattr(settings, "ENABLE_API_DOCS", False) else None,
)


@api_app.get("/api/v1/health")
def health_check():
    db_ok = True
    try:
        connection.ensure_connection()
    except Exception:
        db_ok = False

    if not db_ok:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "error", "db": "disconnected"},
        )
    return {"status": "ok", "db": "ok"}
