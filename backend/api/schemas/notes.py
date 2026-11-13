from datetime import datetime

from pydantic import BaseModel, Field


class CategoryOut(BaseModel):
    id: int
    name: str
    slug: str
    description: str = ""
    book_count: int = 0


class CategoryCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    description: str = Field(default="", max_length=200)


class BookCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    category_id: int | None = None
    description: str = Field(default="", max_length=400)
    visibility: str = Field(default="private", pattern="^(public|private)$")
    slug: str | None = Field(default=None, max_length=140)


class BookUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    category_id: int | None = None
    description: str | None = Field(default=None, max_length=400)
    visibility: str | None = Field(default=None, pattern="^(public|private)$")
    slug: str | None = Field(default=None, max_length=140)


class BookReorderIn(BaseModel):
    ordered_note_ids: list[int] = Field(..., min_length=1)


class BookSummaryOut(BaseModel):
    id: int
    title: str
    slug: str
    description: str = ""
    visibility: str
    moderation: str = "ok"
    moderation_note: str = ""
    author_username: str
    category: CategoryOut
    chapter_count: int = 0
    created_at: datetime
    updated_at: datetime


class ChapterRefOut(BaseModel):
    id: int
    title: str
    slug: str
    sequence: int
    visibility: str
    summary: str = ""
    updated_at: datetime


class BookDetailOut(BaseModel):
    book: BookSummaryOut
    chapters: list[ChapterRefOut] = []


class NoteCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    content_md: str = Field(default="", max_length=100000)
    tags: list[str] = Field(default_factory=list, max_length=5)
    visibility: str = Field(default="private", pattern="^(public|private)$")
    slug: str | None = Field(default=None, max_length=140)
    book_id: int | None = None
    sequence: int | None = Field(default=None, ge=1)


class NoteUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    content_md: str | None = Field(default=None, max_length=100000)
    tags: list[str] | None = Field(default=None, max_length=5)
    visibility: str | None = Field(default=None, pattern="^(public|private)$")
    slug: str | None = Field(default=None, max_length=140)
    book_id: int | None = None
    sequence: int | None = Field(default=None, ge=1)


class RenderLinkOut(BaseModel):
    target_ref: str
    link_type: str
    status: str = "missing"  # resolved | missing | private


class NoteOut(BaseModel):
    id: int
    title: str
    slug: str
    content_md: str
    content_html: str = ""
    visibility: str
    moderation: str
    moderation_note: str = ""
    tags: list[str] = []
    author_username: str
    book: BookSummaryOut | None = None
    sequence: int = 1
    created_at: datetime
    updated_at: datetime
    links: list[RenderLinkOut] = []
    cycle_warnings: list[str] = []


class NoteListItem(BaseModel):
    id: int
    title: str
    slug: str
    visibility: str
    tags: list[str] = []
    book_id: int | None = None
    book_title: str | None = None
    book_slug: str | None = None
    category_name: str | None = None
    sequence: int = 1
    updated_at: datetime


class PathNodeOut(BaseModel):
    key: str
    id: int | None = None
    title: str
    slug: str | None = None
    author_username: str | None = None
    status: str  # ok | missing | private
    depth: int
    is_root: bool = False


class ReadingPathOut(BaseModel):
    root: PathNodeOut
    steps: list[PathNodeOut] = []
    warnings: list[str] = []
    has_cycle: bool = False
    redirected: bool = False


class NoteDetailResponse(BaseModel):
    note: NoteOut
    redirected: bool = False
    direct_prereqs: list[PathNodeOut] = []
    chapters: list[ChapterRefOut] = []
    prev_chapter: ChapterRefOut | None = None
    next_chapter: ChapterRefOut | None = None


class BacklinkItem(BaseModel):
    id: int
    title: str
    slug: str
    author_username: str
    link_type: str
    summary: str = ""


class NotePreviewOut(BaseModel):
    id: int
    title: str
    slug: str
    author_username: str
    summary: str
    prereq_count: int


class RenderIn(BaseModel):
    content_md: str = Field(default="", max_length=100000)


class RenderOut(BaseModel):
    html: str
    links: list[RenderLinkOut] = []


class TitleSuggestionOut(BaseModel):
    id: int
    title: str
    slug: str
    visibility: str


class NoteRevisionItem(BaseModel):
    id: int
    created_at: datetime


class NoteRevisionDetail(BaseModel):
    id: int
    content_md: str
    created_at: datetime
