from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from api.deps import get_current_user
from api.rate_limit import search_rate_limiter
from apps.accounts.models import User
from apps.search.services import search_notes

router = APIRouter(tags=["search"])


class SearchHitOut(BaseModel):
    id: int
    title: str
    slug: str
    author_username: str
    visibility: str
    tags: list[str] = []
    snippet: str = ""
    updated_at: datetime


class SearchResponseOut(BaseModel):
    total: int
    limit: int
    offset: int
    results: list[SearchHitOut] = []


@router.get("/search", response_model=SearchResponseOut)
def search_endpoint(
    request: Request,
    q: str = Query(default="", max_length=200),
    scope: str = Query(default="all", pattern="^(all|mine)$"),
    tag: str | None = Query(default=None, max_length=64),
    author: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    viewer: User | None = Depends(get_current_user),
):
    """Search visible notes with optional tag, author, scope filters and pagination."""
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"search:user:{viewer.id}" if viewer else f"search:ip:{client_ip}"
    search_rate_limiter.check(rate_key)

    return search_notes(
        viewer,
        q=q,
        tag=tag,
        author=author,
        scope=scope,
        limit=limit,
        offset=offset,
    )

