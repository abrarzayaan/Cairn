import json
import logging
import time
import uuid

from django.conf import settings
from django.db import connection
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from api.rate_limit import global_ip_rate_limiter
from api.routers import books, notes, render, reports, search, users

logger = logging.getLogger("cairn.api")

MAX_REQUEST_BODY_BYTES = 1 * 1024 * 1024  # 1 MB per SECURITY_CHECK.md section 9

api_app = FastAPI(
    title="Cairn API",
    version="1.0.0",
    docs_url="/api/docs" if getattr(settings, "ENABLE_API_DOCS", False) else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if getattr(settings, "ENABLE_API_DOCS", False) else None,
)


@api_app.middleware("http")
async def security_and_logging_middleware(request: Request, call_next):
    """Enforce body size cap, global IP rate limit, security headers, and safe JSON logs."""
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    start = time.monotonic()

    # Enforce 1 MB max body size
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_REQUEST_BODY_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"error": {"code": "payload_too_large", "message": "Request body exceeds 1 MB limit."}},
        )

    # Enforce global per-IP rate limit (300/min)
    client_ip = request.client.host if request.client else "unknown"
    try:
        global_ip_rate_limiter.check(f"ip:{client_ip}")
    except Exception as exc:
        status_code = getattr(exc, "status_code", status.HTTP_429_TOO_MANY_REQUESTS)
        detail = getattr(
            exc,
            "detail",
            {"error": {"code": "rate_limited", "message": "Too many requests. Please slow down."}},
        )
        return JSONResponse(status_code=status_code, content=detail)

    response = await call_next(request)

    # Security & caching headers (SECURITY_CHECK.md section 8)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cache-Control", "private, no-store")
    response.headers["X-Request-ID"] = request_id

    duration_ms = round((time.monotonic() - start) * 1000, 2)
    # Never log note content, query secrets, cookies, session IDs, or CSRF tokens
    logger.info(
        json.dumps(
            {
                "event": "api_request",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            }
        )
    )
    return response


# Include routers
api_app.include_router(users.router, prefix="/api/v1")
api_app.include_router(books.router, prefix="/api/v1")
api_app.include_router(notes.router, prefix="/api/v1")
api_app.include_router(render.router, prefix="/api/v1")
api_app.include_router(search.router, prefix="/api/v1")
api_app.include_router(reports.router, prefix="/api/v1")


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
