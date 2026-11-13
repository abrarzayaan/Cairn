from datetime import datetime

from pydantic import BaseModel, Field


class NoteCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    content_md: str = Field(default="", max_length=100000)
    tags: list[str] = Field(default_factory=list, max_length=5)
    visibility: str = Field(default="private", pattern="^(public|private)$")
    slug: str | None = Field(default=None, max_length=140)


class NoteUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    content_md: str | None = Field(default=None, max_length=100000)
    tags: list[str] | None = Field(default=None, max_length=5)
    visibility: str | None = Field(default=None, pattern="^(public|private)$")
    slug: str | None = Field(default=None, max_length=140)


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
    tags: list[str] = []
    author_username: str
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
