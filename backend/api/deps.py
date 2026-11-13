from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore
from fastapi import Cookie, Depends, HTTPException, status

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
