from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore
from django.middleware.csrf import (
    CSRF_TOKEN_LENGTH,
    _check_token_format,
    _does_token_match,
    _unmask_cipher_token,
)
from fastapi import Cookie, Depends, HTTPException, Request, status

User = get_user_model()


def get_current_user(sessionid: str | None = Cookie(None)) -> User | None:
    """Dependency that extracts the authenticated User from the Django sessionid cookie."""
    if not sessionid:
        return None
    session = SessionStore(session_key=sessionid)
    user_id = session.get("_auth_user_id")
    if not user_id:
        return None
    try:
        user = User.objects.get(pk=user_id)
        if user.is_banned or not user.is_active:
            return None
        return user
    except User.DoesNotExist:
        return None


def require_user(current_user: User | None = Depends(get_current_user)) -> User:
    """Dependency that requires an authenticated user."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "unauthorized", "message": "Sign in required"}},
        )
    return current_user


def verify_csrf(request: Request, csrftoken: str | None = Cookie(None)):
    """Verifies X-CSRFToken header against Django's csrftoken cookie on mutating requests."""
    header_token = request.headers.get("x-csrftoken") or request.headers.get("X-CSRFToken")
    if not header_token or not csrftoken:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "csrf_missing", "message": "CSRF token missing"}},
        )
    try:
        _check_token_format(header_token)
        _check_token_format(csrftoken)
        secret = (
            _unmask_cipher_token(csrftoken) if len(csrftoken) == CSRF_TOKEN_LENGTH else csrftoken
        )
        if not _does_token_match(header_token, secret):
            raise ValueError
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "csrf_mismatch", "message": "CSRF token mismatch"}},
        ) from None
