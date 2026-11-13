from django.contrib.sessions.backends.db import SessionStore
from fastapi import APIRouter, Cookie, Depends, Response

from api.deps import get_current_user, require_user
from api.schemas.users import AuthStatus, UpdateBioIn, UserOut
from apps.accounts.models import User
from apps.accounts.services import update_user_bio

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=AuthStatus)
def get_me(user: User | None = Depends(get_current_user)):
    if not user:
        return AuthStatus(authenticated=False, user=None)
    return AuthStatus(
        authenticated=True,
        user=UserOut(id=user.id, username=user.username, bio=user.bio),
    )


@router.post("/bio", response_model=UserOut)
def set_bio(data: UpdateBioIn, user: User = Depends(require_user)):
    updated = update_user_bio(user, data.bio)
    return UserOut(id=updated.id, username=updated.username, bio=updated.bio)


@router.post("/logout")
def logout(response: Response, sessionid: str | None = Cookie(None)):
    if sessionid:
        session = SessionStore(session_key=sessionid)
        session.flush()
    response.delete_cookie("sessionid")
    return {"ok": True}
