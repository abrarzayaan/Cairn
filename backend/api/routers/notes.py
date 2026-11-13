from django.core.exceptions import ValidationError
from fastapi import APIRouter, Depends, HTTPException, status

from api.deps import get_current_user, require_user, verify_csrf
from api.schemas.notes import (
    NoteCreateIn,
    NoteDetailResponse,
    NoteListItem,
    NoteOut,
    NoteUpdateIn,
)
from apps.accounts.models import User
from apps.notes.models import Note
from apps.notes.services.notes import (
    create_note,
    delete_note,
    get_visible_note,
    update_note,
)

router = APIRouter(prefix="/notes", tags=["notes"])


def _serialize_note(note: Note) -> NoteOut:
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
    return _serialize_note(note)


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
    return NoteDetailResponse(note=_serialize_note(note), redirected=redirected)


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
    return _serialize_note(note)


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
    return _serialize_note(note)


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
