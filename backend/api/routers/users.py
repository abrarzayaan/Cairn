from datetime import datetime

from django.contrib.sessions.backends.db import SessionStore
from django.middleware.csrf import _get_new_csrf_string, _mask_cipher_secret
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel

from api.deps import get_current_user, require_user
from api.schemas.notes import BookSummaryOut, CategoryOut
from api.schemas.users import AuthStatus, UpdateBioIn, UserOut
from apps.accounts.models import User
from apps.accounts.services import update_user_bio
from apps.search.services import get_user_profile

router = APIRouter(tags=["auth"])


class ProfileNoteOut(BaseModel):
    id: int
    title: str
    slug: str
    author_username: str
    visibility: str
    tags: list[str] = []
    snippet: str = ""
    book_id: int | None = None
    book_title: str | None = None
    book_slug: str | None = None
    category_name: str | None = None
    sequence: int = 1
    prereq_count: int = 0
    updated_at: datetime


class ProfileTopicOut(BaseModel):
    name: str
    count: int


class UserProfileOut(BaseModel):
    username: str
    bio: str
    created_at: datetime
    books: list[BookSummaryOut] = []
    categories: list[CategoryOut] = []
    notes: list[ProfileNoteOut] = []
    topics: list[ProfileTopicOut] = []
    is_self: bool = False


@router.get("/auth/me", response_model=AuthStatus)
def get_me(
    response: Response,
    user: User | None = Depends(get_current_user),
    csrftoken: str | None = Cookie(None),
):
    if not csrftoken:
        token = _mask_cipher_secret(_get_new_csrf_string())
        response.set_cookie(
            "csrftoken",
            token,
            httponly=False,
            samesite="lax",
            path="/",
        )
    if not user:
        return AuthStatus(authenticated=False, user=None)
    return AuthStatus(
        authenticated=True,
        user=UserOut(id=user.id, username=user.username, bio=user.bio),
    )


@router.post("/auth/bio", response_model=UserOut)
def set_bio(data: UpdateBioIn, user: User = Depends(require_user)):
    updated = update_user_bio(user, data.bio)
    return UserOut(id=updated.id, username=updated.username, bio=updated.bio)


@router.post("/auth/logout")
def logout(response: Response, sessionid: str | None = Cookie(None)):
    if sessionid:
        session = SessionStore(session_key=sessionid)
        session.flush()
    response.delete_cookie("sessionid")
    return {"ok": True}


@router.get("/users/{username}/profile", response_model=UserProfileOut)
def user_profile(username: str, viewer: User | None = Depends(get_current_user)):
    """Retrieve a user's public profile and visible notes."""
    profile = get_user_profile(viewer, username)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "User not found"}},
        )
    return profile
