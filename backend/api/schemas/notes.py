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


class NoteListItem(BaseModel):
    id: int
    title: str
    slug: str
    visibility: str
    tags: list[str] = []
    updated_at: datetime


class NoteDetailResponse(BaseModel):
    note: NoteOut
    redirected: bool = False


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


class RenderLinkOut(BaseModel):
    target_ref: str
    link_type: str


class RenderOut(BaseModel):
    html: str
    links: list[RenderLinkOut] = []
