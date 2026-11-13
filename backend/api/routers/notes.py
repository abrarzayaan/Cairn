from django.core.exceptions import ValidationError
from fastapi import APIRouter, Depends, HTTPException, status

from api.deps import get_current_user, require_user, verify_csrf
from api.schemas.notes import (
    BacklinkItem,
    NoteCreateIn,
    NoteDetailResponse,
    NoteListItem,
    NoteOut,
    NotePreviewOut,
    NoteRevisionDetail,
    NoteRevisionItem,
    NoteUpdateIn,
    PathNodeOut,
    ReadingPathOut,
    RenderLinkOut,
)
from apps.accounts.models import User
from apps.notes.models import Note, NoteLink, NoteRevision
from apps.notes.services.links import get_backlinks, resolve_wikilinks_html
from apps.notes.services.notes import (
    create_note,
    delete_note,
    get_visible_note,
    update_note,
    visible_notes_q,
)
from apps.notes.services.paths import build_reading_path, get_direct_prerequisites

router = APIRouter(prefix="/notes", tags=["notes"])


def _serialize_note(note: Note, include_editor_meta: bool = False) -> NoteOut:
    links_out: list[RenderLinkOut] = []
    cycle_warnings: list[str] = []
    if include_editor_meta:
        note_links = NoteLink.objects.filter(source=note).select_related("target").order_by("id")
        for link in note_links:
            if link.target is None:
                link_status = "missing"
            elif link.target.visibility == "private":
                link_status = "private"
            else:
                link_status = "resolved"
            links_out.append(
                RenderLinkOut(
                    target_ref=link.target_ref,
                    link_type=link.link_type,
                    status=link_status,
                )
            )
        path_data = build_reading_path(note, note.author)
        cycle_warnings = [w for w in path_data.get("warnings", []) if "cycle" in w.lower()]

    return NoteOut(
        id=note.id,
        title=note.title,
        slug=note.slug,
        content_md=note.content_md,
        content_html=note.content_html,
        visibility=note.visibility,
        moderation=note.moderation,
        tags=[t.name for t in note.tags.all()],
        author_username=note.author.username,
        created_at=note.created_at,
        updated_at=note.updated_at,
        links=links_out,
        cycle_warnings=cycle_warnings,
    )


@router.get("/mine", response_model=list[NoteListItem])
def list_my_notes(user: User = Depends(require_user)):
    """List notes authored by current user."""
    notes = Note.objects.filter(author=user).prefetch_related("tags").order_by("-updated_at")
    return [
        NoteListItem(
            id=n.id,
            title=n.title,
            slug=n.slug,
            visibility=n.visibility,
            tags=[t.name for t in n.tags.all()],
            updated_at=n.updated_at,
        )
        for n in notes
    ]


@router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def post_note(
    data: NoteCreateIn,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Create a new note."""
    try:
        note = create_note(
            author=user,
            title=data.title,
            content_md=data.content_md,
            tags=data.tags,
            visibility=data.visibility,
            custom_slug=data.slug,
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "validation_error", "message": str(exc)}},
        ) from exc
    return _serialize_note(note, include_editor_meta=True)


@router.get("/by-slug/{username}/{slug}", response_model=NoteDetailResponse)
def get_note_by_slug(
    username: str,
    slug: str,
    viewer: User | None = Depends(get_current_user),
):
    """Retrieve a visible note by username and slug. Returns 404 for private/missing."""
    note, redirected = get_visible_note(viewer, username, slug)
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Note not found"}},
        )
    serialized = _serialize_note(note)
    serialized.content_html = resolve_wikilinks_html(note.content_html, note, viewer)
    direct_prereqs = [PathNodeOut(**p) for p in get_direct_prerequisites(note, viewer)]
    return NoteDetailResponse(
        note=serialized,
        redirected=redirected,
        direct_prereqs=direct_prereqs,
    )


@router.get("/by-slug/{username}/{slug}/path", response_model=ReadingPathOut)
def get_note_reading_path_by_slug(
    username: str,
    slug: str,
    viewer: User | None = Depends(get_current_user),
):
    """Retrieve the topological reading path for a visible note by username and slug."""
    note, redirected = get_visible_note(viewer, username, slug)
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Note not found"}},
        )
    path_data = build_reading_path(note, viewer)
    return ReadingPathOut(
        root=PathNodeOut(**path_data["root"]),
        steps=[PathNodeOut(**s) for s in path_data["steps"]],
        warnings=path_data["warnings"],
        has_cycle=path_data["has_cycle"],
        redirected=redirected,
    )


@router.get("/{note_id}/path", response_model=ReadingPathOut)
def get_note_reading_path(
    note_id: int,
    viewer: User | None = Depends(get_current_user),
):
    """Retrieve the topological reading path for a visible note by ID."""
    note = (
        Note.objects.filter(visible_notes_q(viewer))
        .filter(id=note_id)
        .select_related("author")
        .first()
    )
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Note not found"}},
        )
    path_data = build_reading_path(note, viewer)
    return ReadingPathOut(
        root=PathNodeOut(**path_data["root"]),
        steps=[PathNodeOut(**s) for s in path_data["steps"]],
        warnings=path_data["warnings"],
        has_cycle=path_data["has_cycle"],
    )


@router.get("/{note_id}/backlinks", response_model=list[BacklinkItem])
def get_note_backlinks(
    note_id: int,
    viewer: User | None = Depends(get_current_user),
):
    """Return viewer-filtered backlinks pointing to this note."""
    note = Note.objects.filter(visible_notes_q(viewer)).filter(id=note_id).first()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Note not found"}},
        )
    return [BacklinkItem(**item) for item in get_backlinks(note, viewer)]


@router.get("/{note_id}/preview", response_model=NotePreviewOut)
def get_note_preview(
    note_id: int,
    viewer: User | None = Depends(get_current_user),
):
    """Return hover preview data for a visible note."""
    note = (
        Note.objects.filter(visible_notes_q(viewer))
        .filter(id=note_id)
        .select_related("author")
        .first()
    )
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Note not found"}},
        )

    prereq_count = NoteLink.objects.filter(
        source=note,
        link_type="prereq",
        target__in=Note.objects.filter(visible_notes_q(viewer)),
    ).count()

    return NotePreviewOut(
        id=note.id,
        title=note.title,
        slug=note.slug,
        author_username=note.author.username,
        summary=note.summary,
        prereq_count=prereq_count,
    )


@router.get("/{note_id}", response_model=NoteOut)
def get_note_for_edit(note_id: int, user: User = Depends(require_user)):
    """Retrieve own note by ID for editing. Returns 404 if not found or not owner."""
    try:
        note = (
            Note.objects.filter(id=note_id, author=user)
            .select_related("author")
            .prefetch_related("tags")
            .get()
        )
    except Note.DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Note not found"}},
        ) from None
    return _serialize_note(note, include_editor_meta=True)


@router.patch("/{note_id}", response_model=NoteOut)
def patch_note(
    note_id: int,
    data: NoteUpdateIn,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Update note fields. Only owner can update."""
    try:
        note = update_note(
            author=user,
            note_id=note_id,
            title=data.title,
            content_md=data.content_md,
            tags=data.tags,
            visibility=data.visibility,
            custom_slug=data.slug,
        )
    except Note.DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Note not found"}},
        ) from None
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "validation_error", "message": str(exc)}},
        ) from exc
    return _serialize_note(note, include_editor_meta=True)


@router.get("/{note_id}/revisions", response_model=list[NoteRevisionItem])
def list_note_revisions(note_id: int, user: User = Depends(require_user)):
    """List saved revisions for an owned note (newest first)."""
    if not Note.objects.filter(id=note_id, author=user).exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Note not found"}},
        )
    revisions = NoteRevision.objects.filter(note_id=note_id).order_by("-created_at", "-id")[:100]
    return [NoteRevisionItem(id=r.id, created_at=r.created_at) for r in revisions]


@router.get("/{note_id}/revisions/{revision_id}", response_model=NoteRevisionDetail)
def get_note_revision(note_id: int, revision_id: int, user: User = Depends(require_user)):
    """Retrieve a single revision's content for an owned note."""
    try:
        revision = (
            NoteRevision.objects.filter(id=revision_id, note_id=note_id, note__author=user).get()
        )
    except NoteRevision.DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Revision not found"}},
        ) from None
    return NoteRevisionDetail(
        id=revision.id,
        content_md=revision.content_md,
        created_at=revision.created_at,
    )


@router.delete("/{note_id}")
def remove_note(
    note_id: int,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Permanently delete note. Only owner can delete."""
    try:
        delete_note(author=user, note_id=note_id)
    except Note.DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Note not found"}},
        ) from None
    return {"ok": True}
