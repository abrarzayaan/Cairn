from django.db import transaction
from django.db.models import Q
from selectolax.parser import HTMLParser

from apps.notes.models import Note, NoteLink, SlugHistory
from apps.notes.services.notes import visible_notes_q


def resolve_target_note(source_author, target_ref: str) -> Note | None:
    """Resolve a wikilink reference string to a target Note, or None if pending.

    Resolution order (FR-L3):
    1. If ref contains '/', resolve 'username/slug' to a visible note of that user.
    2. Otherwise, resolve source_author's own note by title (case-insensitive).
    3. Fallback to source_author's own note by slug (case-insensitive).
    """
    ref = target_ref.strip()
    if not ref:
        return None

    if "/" in ref:
        username, slug = ref.split("/", 1)
        username = username.strip()
        slug = slug.strip()
        if not username or not slug:
            return None

        note = (
            Note.objects.filter(visible_notes_q(source_author))
            .filter(author__username__iexact=username, slug__iexact=slug)
            .first()
        )
        if note:
            return note

        history = (
            SlugHistory.objects.filter(author__username__iexact=username, old_slug__iexact=slug)
            .select_related("note")
            .first()
        )
        if history and history.note:
            if Note.objects.filter(visible_notes_q(source_author)).filter(pk=history.note.pk).exists():
                return history.note
        return None

    # Same-author resolution: title first (case-insensitive), then slug
    by_title = Note.objects.filter(author=source_author, title__iexact=ref).first()
    if by_title:
        return by_title

    return Note.objects.filter(author=source_author, slug__iexact=ref).first()


def get_link_status(viewer, target_ref: str) -> str:
    """Return 'resolved', 'private', or 'missing' for a wikilink target reference."""
    target = resolve_target_note(viewer, target_ref)
    if target is None:
        return "missing"
    if target.visibility == "private":
        return "private"
    return "resolved"


def sync_note_links(note: Note, extracted_links: list[tuple[str, str]]) -> None:
    """Replace NoteLink rows for `note` based on extracted (target_ref, link_type) tuples."""
    with transaction.atomic():
        NoteLink.objects.filter(source=note).delete()

        if not extracted_links:
            return

        # Batch resolve or resolve each unique ref
        resolved_cache: dict[str, Note | None] = {}
        links_to_create: list[NoteLink] = []

        for target_ref, link_type in extracted_links:
            ref_key = target_ref.lower()
            if ref_key not in resolved_cache:
                resolved_cache[ref_key] = resolve_target_note(note.author, target_ref)
            target_note = resolved_cache[ref_key]

            links_to_create.append(
                NoteLink(
                    source=note,
                    target=target_note,
                    target_ref=target_ref,
                    link_type=link_type,
                )
            )

        NoteLink.objects.bulk_create(links_to_create, ignore_conflicts=True)


def resolve_pending_links_for(note: Note) -> int:
    """Auto-resolve pending NoteLink rows that match a newly created or renamed note.

    Returns the number of NoteLink rows resolved.
    """
    # 1. Own-author pending links matching title or slug
    own_q = Q(
        target__isnull=True,
        source__author=note.author,
    ) & (Q(target_ref__iexact=note.title) | Q(target_ref__iexact=note.slug))

    # 2. Cross-author pending links matching username/slug (only if public & ok)
    is_public = (
        note.visibility == "public"
        and note.moderation == "ok"
        and not note.author.is_banned
    )
    if is_public:
        full_ref = f"{note.author.username}/{note.slug}"
        cross_q = Q(target__isnull=True, target_ref__iexact=full_ref)
        combined_q = own_q | cross_q
    else:
        combined_q = own_q

    return NoteLink.objects.filter(combined_q).update(target=note)


def resolve_wikilinks_html(content_html: str, source_note: Note, viewer) -> str:
    """Resolve wikilink placeholders in `content_html` for `viewer` in one batched query."""
    if not content_html or "wikilink" not in content_html:
        return content_html

    tree = HTMLParser(content_html)
    nodes = tree.css("a.wikilink")
    if not nodes:
        return content_html

    # Single batched query for all NoteLinks of source_note with their targets
    note_links = list(
        NoteLink.objects.filter(source=source_note).select_related("target", "target__author")
    )
    link_map: dict[tuple[str, str], NoteLink] = {
        (nl.target_ref.lower(), nl.link_type): nl for nl in note_links
    }

    target_ids = [nl.target_id for nl in note_links if nl.target_id is not None]
    if target_ids:
        visible_ids = set(
            Note.objects.filter(visible_notes_q(viewer))
            .filter(id__in=target_ids)
            .values_list("id", flat=True)
        )
    else:
        visible_ids = set()

    for node in nodes:
        ref = (node.attributes.get("data-ref") or "").strip()
        link_type = (node.attributes.get("data-type") or "related").strip()
        nl = link_map.get((ref.lower(), link_type))

        base_classes = ["wikilink"]
        if link_type in ("prereq", "deep"):
            base_classes.append(f"wikilink--{link_type}")

        if nl and nl.target_id is not None:
            if nl.target_id in visible_ids:
                base_classes.append("wikilink--ok")
                node.attrs["href"] = f"/u/{nl.target.author.username}/{nl.target.slug}"
                node.attrs["data-note-id"] = str(nl.target_id)
                node.attrs["data-state"] = "ok"
            else:
                base_classes.append("wikilink--private")
                node.attrs["href"] = "#private"
                node.attrs["data-state"] = "private"
                node.attrs["title"] = "Private note"
                if "data-note-id" in node.attrs:
                    del node.attrs["data-note-id"]
        else:
            base_classes.append("wikilink--missing")
            node.attrs["href"] = "#missing"
            node.attrs["data-state"] = "missing"
            node.attrs["title"] = "Missing note"

        node.attrs["class"] = " ".join(base_classes)

    body = tree.body
    return body.html[6:-7] if body and body.html.startswith("<body>") else tree.html


def get_backlinks(note: Note, viewer) -> list[dict]:
    """Return viewer-visible notes linking to `note`."""
    visible_sources = Note.objects.filter(visible_notes_q(viewer))
    links = (
        NoteLink.objects.filter(target=note, source__in=visible_sources)
        .select_related("source", "source__author")
        .order_by("source__title", "link_type")
    )

    seen_ids: set[int] = set()
    results: list[dict] = []
    for nl in links:
        if nl.source_id in seen_ids:
            continue
        seen_ids.add(nl.source_id)
        results.append(
            {
                "id": nl.source.id,
                "title": nl.source.title,
                "slug": nl.source.slug,
                "author_username": nl.source.author.username,
                "link_type": nl.link_type,
                "summary": nl.source.summary,
            }
        )
    return results

