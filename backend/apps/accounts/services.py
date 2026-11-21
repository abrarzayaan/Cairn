import io
import json
import zipfile

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.accounts.models import User
from apps.moderation.models import Report
from apps.moderation.services import invalidate_user_sessions
from apps.notes.models import Book, Category, Note


def update_user_bio(user: User, bio: str) -> User:
    """Update user biography. Enforces max 280 characters."""
    bio_clean = bio.strip()
    if len(bio_clean) > 280:
        raise ValidationError("Bio must be 280 characters or fewer.")

    user.bio = bio_clean
    user.save(update_fields=["bio", "updated_at"])
    return user


def _format_note_front_matter(note: Note) -> str:
    """Build YAML front matter for a single note Markdown export."""
    tags = [t.name for t in note.tags.all()]
    lines = [
        "---",
        f"title: {json.dumps(note.title, ensure_ascii=False)}",
        f"slug: {json.dumps(note.slug)}",
        f"visibility: {json.dumps(note.visibility)}",
        f"is_published: {'true' if note.is_published else 'false'}",
    ]
    if note.book:
        lines.append(f"book: {json.dumps(note.book.title, ensure_ascii=False)}")
        lines.append(f"book_slug: {json.dumps(note.book.slug)}")
        if note.book.category:
            lines.append(f"category: {json.dumps(note.book.category.name, ensure_ascii=False)}")
        lines.append(f"sequence: {note.sequence}")
    lines.append(f"tags: {json.dumps(tags, ensure_ascii=False)}")
    lines.append(f"created_at: {json.dumps(note.created_at.isoformat())}")
    lines.append(f"updated_at: {json.dumps(note.updated_at.isoformat())}")
    lines.append("---")
    return "\n".join(lines) + "\n\n" + (note.content_md or "")


def export_user_notes_zip(user: User) -> bytes:
    """Export all notes owned by `user` (private, public, published) as a Markdown ZIP."""
    notes = (
        Note.objects.filter(author=user)
        .select_related("book", "book__category")
        .prefetch_related("tags")
        .order_by("book_id", "sequence", "id")
    )

    buffer = io.BytesIO()
    used_paths: set[str] = set()

    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for note in notes:
            if note.book:
                base_path = f"books/{note.book.slug}/{note.sequence:02d}-{note.slug}.md"
            else:
                base_path = f"notes/{note.slug}.md"

            arcname = base_path
            counter = 2
            while arcname in used_paths:
                arcname = base_path[:-3] + f"-{counter}.md"
                counter += 1
            used_paths.add(arcname)

            zf.writestr(arcname, _format_note_front_matter(note))

    return buffer.getvalue()


@transaction.atomic
def delete_user_account(user: User, confirm_username: str) -> None:
    """Permanently delete a user and all owned data after exact username confirmation."""
    if (confirm_username or "").strip() != user.username:
        raise ValidationError("Username confirmation does not match.")

    invalidate_user_sessions(user)

    # Remove reports filed by the user (FK is SET_NULL, so delete explicitly per FR-A6)
    Report.objects.filter(reporter=user).delete()

    # Delete notes (cascades revisions, outgoing links, tags, slug history)
    Note.objects.filter(author=user).delete()

    # Delete books before categories because Book.category uses on_delete=PROTECT
    Book.objects.filter(author=user).delete()
    Category.objects.filter(author=user).delete()

    user.delete()
