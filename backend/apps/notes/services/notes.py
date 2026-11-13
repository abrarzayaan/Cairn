import re
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max, Q
from django.utils.text import slugify
from selectolax.parser import HTMLParser

from apps.notes.markdown import render_markdown
from apps.notes.models import Book, Note, NoteRevision, NoteTag, SlugHistory, Tag

_UNSET: Any = object()


def _extract_summary(content_html: str) -> str:
    """Extract up to 200 chars of clean plain text from rendered HTML."""
    if not content_html:
        return ""
    text = HTMLParser(content_html).text(separator=" ", strip=True)
    collapsed = " ".join(text.split())
    return collapsed[:200]

TAG_REGEX = re.compile(r"^[a-z0-9-]+$")


def visible_books_q(viewer) -> Q:
    """Single source of truth for book visibility across all queries.

    A book is visible if:
    1. It is public, moderation is 'ok', and its author is not banned, OR
    2. The viewer is authenticated and is the author of the book.
    """
    public_q = Q(
        visibility="public",
        moderation="ok",
        author__is_banned=False,
    )
    if viewer and viewer.is_authenticated:
        return public_q | Q(author_id=viewer.id)
    return public_q


def visible_notes_q(viewer) -> Q:
    """Single source of truth for note visibility across all queries.

    A note is visible if:
    1. It is public, moderation is 'ok', its author is not banned, AND
       (if assigned to a book) that book is public and moderation is 'ok', OR
    2. The viewer is authenticated and is the author of the note.
    """
    public_q = Q(
        visibility="public",
        moderation="ok",
        author__is_banned=False,
    ) & (
        Q(book__isnull=True)
        | Q(book__visibility="public", book__moderation="ok")
    )
    if viewer and viewer.is_authenticated:
        return public_q | Q(author_id=viewer.id)
    return public_q


def normalize_tag(name: str) -> str:
    """Validate and normalize tag to lowercase a-z0-9-, max 30 chars."""
    cleaned = name.strip().lower()
    if cleaned.startswith("#"):
        cleaned = cleaned[1:]
    if not cleaned or len(cleaned) > 30 or not TAG_REGEX.match(cleaned):
        raise ValidationError(f"Invalid tag '{name}'. Tags must be a-z0-9- and max 30 characters.")
    return cleaned


def generate_unique_slug(
    author,
    title: str,
    current_note_id: int | None = None,
    custom_slug: str | None = None,
) -> str:
    """Generate a slug unique to the author, max 140 chars."""
    raw = custom_slug.strip() if custom_slug and custom_slug.strip() else title
    base = slugify(raw)[:130]
    if not base:
        base = "note"

    candidate = base
    counter = 1
    query = Note.objects.filter(author=author)
    if current_note_id:
        query = query.exclude(pk=current_note_id)

    while query.filter(slug=candidate).exists():
        suffix = f"-{counter}"
        candidate = f"{base[: 140 - len(suffix)]}{suffix}"
        counter += 1

    return candidate


def _sync_tags(note: Note, raw_tags: list[str]) -> None:
    """Validate up to 5 tags and assign them with positions."""
    if len(raw_tags) > 5:
        raise ValidationError("A note can have at most 5 tags.")

    cleaned_names = [normalize_tag(t) for t in raw_tags]
    # Remove duplicates while preserving order
    unique_names = list(dict.fromkeys(cleaned_names))

    # Clear existing tags
    NoteTag.objects.filter(note=note).delete()

    for idx, name in enumerate(unique_names):
        tag, _ = Tag.objects.get_or_create(name=name)
        NoteTag.objects.create(note=note, tag=tag, position=idx)


def create_note(
    author,
    title: str,
    content_md: str = "",
    tags: list[str] | None = None,
    visibility: str = "private",
    custom_slug: str | None = None,
    book_id: int | None = None,
    sequence: int | None = None,
) -> Note:
    """Create a new note with slug, optional book/sequence, and initial revision."""
    title_clean = title.strip()
    if not title_clean or len(title_clean) > 120:
        raise ValidationError("Title is required and must be 120 characters or fewer.")

    if len(content_md) > 100000:
        raise ValidationError("Content must be 100,000 characters or fewer.")

    if visibility not in ("public", "private"):
        raise ValidationError("Visibility must be 'public' or 'private'.")

    if sequence is not None and sequence < 1:
        raise ValidationError("Sequence must be 1 or greater.")

    book = None
    if book_id is not None:
        book = Book.objects.select_related("author", "category").filter(id=book_id, author=author).first()
        if not book:
            raise ValidationError("Book not found or not owned by you.")

    if Note.objects.filter(author=author, title__iexact=title_clean).exists():
        raise ValidationError("A note with this title already exists.")

    slug = generate_unique_slug(author, title_clean, custom_slug=custom_slug)
    content_html, extracted_links = render_markdown(content_md)
    summary = _extract_summary(content_html)

    with transaction.atomic():
        from apps.notes.services.links import resolve_pending_links_for, sync_note_links

        if sequence is not None:
            resolved_seq = sequence
        elif book is not None:
            max_seq = Note.objects.filter(book=book).aggregate(m=Max("sequence"))["m"] or 0
            resolved_seq = max_seq + 1
        else:
            resolved_seq = 1

        note = Note.objects.create(
            author=author,
            book=book,
            sequence=resolved_seq,
            title=title_clean,
            slug=slug,
            content_md=content_md,
            content_html=content_html,
            summary=summary,
            visibility=visibility,
        )

        if tags:
            _sync_tags(note, tags)

        if content_md:
            NoteRevision.objects.create(
                note=note,
                title=note.title,
                content_md=content_md,
            )

        sync_note_links(note, extracted_links)
        resolve_pending_links_for(note)

    return note


def update_note(
    author,
    note_id: int,
    title: str | None = None,
    content_md: str | None = None,
    tags: list[str] | None = None,
    visibility: str | None = None,
    custom_slug: str | None = None,
    book_id: Any = _UNSET,
    sequence: int | None = None,
) -> Note:
    """Update note fields, slug history if slug changes, and revision if content changes."""
    note = (
        Note.objects.select_for_update()
        .select_related("author", "book", "book__category")
        .get(id=note_id, author=author)
    )

    if sequence is not None and sequence < 1:
        raise ValidationError("Sequence must be 1 or greater.")

    with transaction.atomic():
        from apps.notes.services.links import resolve_pending_links_for, sync_note_links

        extracted_links = None
        if book_id is not _UNSET:
            if book_id is None:
                note.book = None
            else:
                target_book = (
                    Book.objects.select_related("author", "category")
                    .filter(id=book_id, author=author)
                    .first()
                )
                if not target_book:
                    raise ValidationError("Book not found or not owned by you.")
                book_changed = note.book_id != target_book.id
                note.book = target_book
                if book_changed and sequence is None:
                    max_seq = (
                        Note.objects.filter(book=target_book)
                        .exclude(id=note.id)
                        .aggregate(m=Max("sequence"))["m"]
                        or 0
                    )
                    note.sequence = max_seq + 1

        if sequence is not None:
            note.sequence = sequence

        if title is not None:
            title_clean = title.strip()
            if not title_clean or len(title_clean) > 120:
                raise ValidationError("Title is required and must be 120 characters or fewer.")
            if (
                Note.objects.filter(author=author, title__iexact=title_clean)
                .exclude(id=note.id)
                .exists()
            ):
                raise ValidationError("A note with this title already exists.")
            note.title = title_clean

        if custom_slug is not None or (title is not None and custom_slug is None and not note.slug):
            new_slug = generate_unique_slug(
                author,
                note.title,
                current_note_id=note.id,
                custom_slug=custom_slug,
            )
            if new_slug != note.slug:
                SlugHistory.objects.update_or_create(
                    author=author,
                    old_slug=note.slug,
                    defaults={"note": note},
                )
                note.slug = new_slug

        if visibility is not None:
            if visibility not in ("public", "private"):
                raise ValidationError("Visibility must be 'public' or 'private'.")
            note.visibility = visibility

        if content_md is not None:
            if len(content_md) > 100000:
                raise ValidationError("Content must be 100,000 characters or fewer.")
            if content_md != note.content_md or not note.content_html:
                if content_md != note.content_md:
                    NoteRevision.objects.create(
                        note=note,
                        title=note.title,
                        content_md=content_md,
                    )
                content_html, extracted_links = render_markdown(content_md)
                note.content_md = content_md
                note.content_html = content_html
                note.summary = _extract_summary(content_html)

        note.save()

        if extracted_links is not None:
            sync_note_links(note, extracted_links)

        if title is not None or custom_slug is not None or visibility is not None:
            resolve_pending_links_for(note)

        if tags is not None:
            _sync_tags(note, tags)

    return note


def delete_note(author, note_id: int) -> bool:
    """Permanently delete note owned by author."""
    note = Note.objects.get(id=note_id, author=author)
    note.delete()
    return True


def get_visible_note(viewer, username: str, slug: str) -> tuple[Note | None, bool]:
    """Retrieve note visible to viewer. Handles slug history redirect.

    Returns:
        (note, redirected) where redirected is True if matched an old slug.
    """
    # 1. Direct match on current slug
    note = (
        Note.objects.filter(visible_notes_q(viewer))
        .filter(author__username__iexact=username, slug=slug)
        .select_related("author", "book", "book__category")
        .prefetch_related("tags")
        .first()
    )
    if note:
        return note, False

    # 2. Check slug history
    history = (
        SlugHistory.objects.filter(author__username__iexact=username, old_slug=slug)
        .select_related("note", "note__author", "note__book", "note__book__category")
        .first()
    )
    if history and history.note:
        # Check if the target note is visible to viewer
        if Note.objects.filter(visible_notes_q(viewer)).filter(pk=history.note.pk).exists():
            return history.note, True

    return None, False
