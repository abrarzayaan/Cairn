from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from api.deps import get_current_user
from api.rate_limit import search_rate_limiter
from api.schemas.notes import BookSummaryOut, CategoryOut
from apps.accounts.models import User
from apps.search.services import get_home_feed, search_notes

router = APIRouter(tags=["search"])


class SearchHitOut(BaseModel):
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
    updated_at: datetime


class WorkspaceNoteOut(SearchHitOut):
    prereq_count: int = 0


class TopicCountOut(BaseModel):
    name: str
    count: int


class WorkspaceStatsOut(BaseModel):
    total: int
    public: int
    private: int


class UserSearchHitOut(BaseModel):
    username: str
    bio: str = ""
    public_book_count: int = 0
    public_note_count: int = 0


class HomeFeedOut(BaseModel):
    recent_public: list[WorkspaceNoteOut] = []
    recent_books: list[BookSummaryOut] = []
    categories: list[CategoryOut] = []
    topics: list[TopicCountOut] = []
    my_notes: list[WorkspaceNoteOut] = []
    my_books: list[BookSummaryOut] = []
    stats: WorkspaceStatsOut
    book_stats: WorkspaceStatsOut


class SearchResponseOut(BaseModel):
    total: int
    limit: int
    offset: int
    results: list[SearchHitOut] = []
    books: list[BookSummaryOut] = []
    categories: list[CategoryOut] = []
    users: list[UserSearchHitOut] = []


@router.get("/home", response_model=HomeFeedOut)
def home_feed_endpoint(viewer: User | None = Depends(get_current_user)):
    """Return recent public books/notes, categories, topics, and viewer's workspace."""
    return get_home_feed(viewer)


@router.get("/search", response_model=SearchResponseOut)
def search_endpoint(
    request: Request,
    q: str = Query(default="", max_length=200),
    scope: str = Query(default="all", pattern="^(all|mine)$"),
    type: str = Query(default="all", pattern="^(all|notes|books|categories|users)$"),
    category: str | None = Query(default=None, max_length=70),
    tag: str | None = Query(default=None, max_length=64),
    author: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    viewer: User | None = Depends(get_current_user),
):
    """Search visible notes, books, categories, and developer profiles."""
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"search:user:{viewer.id}" if viewer else f"search:ip:{client_ip}"
    search_rate_limiter.check(rate_key)

    return search_notes(
        viewer,
        q=q,
        tag=tag,
        category=category,
        author=author,
        scope=scope,
        search_type=type,
        limit=limit,
        offset=offset,
    )

