import re
from difflib import SequenceMatcher

from django.contrib.postgres.search import SearchQuery, SearchRank, TrigramSimilarity
from django.db import connection
from django.db.models import Count, F, Q

from apps.accounts.models import User
from apps.notes.models import Book, Note, NoteLink, Tag
from apps.notes.services.books import list_categories_with_counts
from apps.notes.services.notes import (
    published_books_q,
    published_notes_q,
    visible_books_q,
    visible_notes_q,
)


def _visible_chapter_q(viewer) -> Q:
    q = Q(notes__visibility="public", notes__moderation="ok", notes__author__is_banned=False)
    if viewer and getattr(viewer, "is_authenticated", False):
        q = q | Q(notes__author_id=viewer.id)
    return q


def _published_chapter_q() -> Q:
    return Q(
        notes__visibility="public",
        notes__is_published=True,
        notes__moderation="ok",
        notes__author__is_banned=False,
    )


def _serialize_book_hit(book: Book) -> dict:
    return {
        "id": book.id,
        "title": book.title,
        "slug": book.slug,
        "description": book.description,
        "visibility": book.visibility,
        "is_published": book.is_published,
        "moderation": book.moderation,
        "moderation_note": "",
        "author_username": book.author.username,
        "category": {
            "id": book.category.id,
            "name": book.category.name,
            "slug": book.category.slug,
            "description": book.category.description,
            "book_count": 0,
        },
        "chapter_count": getattr(book, "_chapter_count", 0),
        "created_at": book.created_at,
        "updated_at": book.updated_at,
    }


_WIKILINK_RE = re.compile(r"\[\[(?:(?:prereq|deep):)?([^\]\|]{1,200})(?:\|([^\]]{1,100}))?\]\]")


def _redact_private_wikilinks(note: Note, content_md: str, viewer) -> str:
    """Replace wikilinks pointing to notes the viewer cannot access with 'Private note'."""
    if not content_md or "[[" not in content_md:
        return content_md or ""
    if viewer and getattr(viewer, "is_authenticated", False) and viewer.id == note.author_id:
        return content_md

    hidden_refs = {
        ref.strip().lower()
        for ref in NoteLink.objects.filter(source=note, target__isnull=False)
        .exclude(target__in=Note.objects.filter(visible_notes_q(viewer)))
        .values_list("target_ref", flat=True)
    }
    if not hidden_refs:
        return content_md

    def _replace(match: re.Match) -> str:
        ref = match.group(1).strip().lower()
        if ref in hidden_refs:
            return "Private note"
        return match.group(0)

    return _WIKILINK_RE.sub(_replace, content_md)


def _build_snippet(content_md: str, query: str, max_len: int = 160) -> str:
    """Extract a plain-text snippet around the first query match, or the start of content."""
    clean = re.sub(r"\s+", " ", content_md or "").strip()
    if not clean:
        return ""
    if query:
        idx = clean.lower().find(query.lower())
        if idx != -1:
            start = max(0, idx - 40)
            end = min(len(clean), start + max_len)
            prefix = "..." if start > 0 else ""
            suffix = "..." if end < len(clean) else ""
            return f"{prefix}{clean[start:end].strip()}{suffix}"
    if len(clean) <= max_len:
        return clean
    return f"{clean[:max_len].rstrip()}..."


def _trigram_like_similarity(a: str, b: str) -> float:
    """Compute fuzzy similarity on strings and individual title words for SQLite fallback."""
    a_low = a.lower().strip()
    b_low = b.lower().strip()
    if not a_low or not b_low:
        return 0.0
    if b_low in a_low:
        return 0.95 if a_low.startswith(b_low) else 0.85

    best = SequenceMatcher(None, a_low, b_low).ratio()
    for word in re.findall(r"[a-z0-9]+", a_low):
        if len(word) >= 3:
            ratio = SequenceMatcher(None, word, b_low).ratio()
            if ratio > best:
                best = ratio
    return best


def _score_note_python(note: Note, query_text: str) -> float:
    """Weighted relevance score for non-PostgreSQL backends (SQLite dev/test)."""
    q_low = query_text.lower().strip()
    tokens = [t for t in re.findall(r"[a-z0-9_#-]+", q_low) if t]
    title_low = note.title.lower()
    body_low = (note.content_md or "").lower()
    tag_names = [t.name.lower() for t in note.tags.all()]

    score = 0.0

    # Exact / substring / prefix title match
    if title_low == q_low:
        score += 5.0
    elif title_low.startswith(q_low):
        score += 3.5
    elif q_low in title_low:
        score += 2.5

    # Fuzzy / typo match on title
    sim = _trigram_like_similarity(note.title, q_low)
    if sim >= 0.65:
        score += sim * 2.0

    # Token matches across title, tags, and body
    if tokens:
        matched_tokens = 0
        for tok in tokens:
            tok_hit = False
            if tok in title_low or _trigram_like_similarity(note.title, tok) >= 0.72:
                score += 1.2
                tok_hit = True
            if any(tok in tag for tag in tag_names):
                score += 0.8
                tok_hit = True
            if tok in body_low:
                score += 0.5
                tok_hit = True
            if tok_hit:
                matched_tokens += 1
        if matched_tokens == len(tokens):
            score += 0.8

    return score


def _serialize_search_hit(note: Note, query_text: str, viewer=None) -> dict:
    safe_md = _redact_private_wikilinks(note, note.content_md, viewer)
    return {
        "id": note.id,
        "title": note.title,
        "slug": note.slug,
        "author_username": note.author.username,
        "visibility": note.visibility,
        "is_published": note.is_published,
        "tags": [t.name for t in note.tags.all()],
        "snippet": _build_snippet(safe_md, query_text),
        "book_id": note.book_id,
        "book_title": note.book.title if note.book else None,
        "book_slug": note.book.slug if note.book else None,
        "category_name": note.book.category.name if note.book else None,
        "sequence": note.sequence,
        "updated_at": note.updated_at,
    }


def _search_books(
    viewer,
    query_text: str,
    *,
    category: str | None = None,
    author: str | None = None,
    scope: str = "all",
) -> list[dict]:
    if scope == "mine":
        if not (viewer and getattr(viewer, "is_authenticated", False)):
            return []
        qs = Book.objects.filter(author=viewer).select_related("author", "category")
    else:
        qs = Book.objects.filter(published_books_q()).select_related("author", "category")

    if category and category.strip():
        qs = qs.filter(category__slug=category.strip().lower())
    if author and author.strip():
        qs = qs.filter(author__username__iexact=author.strip().lstrip("@"))
    if query_text:
        qs = qs.filter(
            Q(title__icontains=query_text)
            | Q(description__icontains=query_text)
            | Q(category__name__icontains=query_text)
        )
    chapter_filter = _visible_chapter_q(viewer) if scope == "mine" else _published_chapter_q()
    qs = qs.annotate(
        _chapter_count=Count("notes", filter=chapter_filter, distinct=True)
    ).order_by("-updated_at", "-id")[:20]
    return [_serialize_book_hit(b) for b in qs]


def _search_categories(viewer, query_text: str, category: str | None = None, author: str | None = None) -> list[dict]:
    if author and author.strip():
        cats = list_categories_with_counts(viewer, username=author.strip().lstrip("@"))
    elif viewer and getattr(viewer, "is_authenticated", False):
        cats = list_categories_with_counts(viewer)
    else:
        cats = []

    if category and category.strip():
        cat_slug = category.strip().lower()
        cats = [c for c in cats if c["slug"] == cat_slug]
    if query_text:
        q_low = query_text.lower()
        cats = [
            c
            for c in cats
            if q_low in c["name"].lower()
            or q_low in c["slug"].lower()
            or q_low in c["description"].lower()
        ]
    return cats


def _search_users(query_text: str) -> list[dict]:
    qs = User.objects.filter(is_banned=False)
    if query_text:
        clean_q = query_text.lstrip("@").strip()
        book_match_q = Q(
            books__visibility="public",
            books__is_published=True,
            books__moderation="ok",
        ) & (
            Q(books__title__icontains=query_text)
            | Q(books__description__icontains=query_text)
        )
        note_match_q = Q(
            notes__visibility="public",
            notes__is_published=True,
            notes__moderation="ok",
        ) & (
            Q(notes__book__isnull=True)
            | Q(
                notes__book__visibility="public",
                notes__book__is_published=True,
                notes__book__moderation="ok",
            )
        ) & (
            Q(notes__title__icontains=query_text)
            | Q(notes__content_md__icontains=query_text)
            | Q(notes__tags__name__iexact=clean_q.lstrip("#"))
        )

        qs = qs.filter(
            Q(username__icontains=clean_q)
            | Q(bio__icontains=clean_q)
            | book_match_q
            | note_match_q
        ).distinct()

    qs = qs.annotate(
        published_book_count=Count(
            "books",
            filter=Q(books__visibility="public", books__is_published=True, books__moderation="ok"),
            distinct=True,
        ),
        published_note_count=Count(
            "notes",
            filter=Q(notes__visibility="public", notes__is_published=True, notes__moderation="ok")
            & (
                Q(notes__book__isnull=True)
                | Q(notes__book__visibility="public", notes__book__is_published=True, notes__book__moderation="ok")
            ),
            distinct=True,
        ),
        public_book_count=Count(
            "books",
            filter=Q(books__visibility="public", books__moderation="ok"),
            distinct=True,
        ),
        public_note_count=Count(
            "notes",
            filter=Q(notes__visibility="public", notes__moderation="ok")
            & (
                Q(notes__book__isnull=True)
                | Q(notes__book__visibility="public", notes__book__moderation="ok")
            ),
            distinct=True,
        ),
    ).order_by("-published_book_count", "-published_note_count", "-public_book_count", "username")[:15]
    return [
        {
            "username": u.username,
            "bio": u.bio,
            "published_book_count": u.published_book_count,
            "published_note_count": u.published_note_count,
            "public_book_count": u.public_book_count,
            "public_note_count": u.public_note_count,
        }
        for u in qs
    ]


def search_notes(
    viewer,
    q: str = "",
    *,
    tag: str | None = None,
    category: str | None = None,
    author: str | None = None,
    scope: str = "all",
    search_type: str = "all",
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """Search visible notes, books, categories, and developer profiles."""
    limit = max(1, min(limit, 50))
    offset = max(0, offset)
    query_text = (q or "").strip()

    books_out = (
        _search_books(viewer, query_text, category=category, author=author, scope=scope)
        if search_type in ("all", "books")
        else []
    )
    categories_out = (
        _search_categories(viewer, query_text, category=category, author=author)
        if search_type in ("all", "categories") and (query_text or search_type == "categories")
        else []
    )
    users_out = (
        _search_users(query_text)
        if search_type in ("all", "users") and scope != "mine" and (query_text or search_type == "users")
        else []
    )

    if search_type not in ("all", "notes"):
        return {
            "total": 0,
            "limit": limit,
            "offset": offset,
            "results": [],
            "books": books_out,
            "categories": categories_out,
            "users": users_out,
        }

    if scope == "mine":
        if not (viewer and getattr(viewer, "is_authenticated", False)):
            return {
                "total": 0,
                "limit": limit,
                "offset": offset,
                "results": [],
                "books": [],
                "categories": [],
                "users": [],
            }
        qs = Note.objects.filter(author=viewer)
    else:
        # Global search: ONLY published notes
        qs = Note.objects.filter(published_notes_q())

    qs = (
        qs.select_related("author", "book", "book__category")
        .prefetch_related("tags")
        .distinct()
    )

    if tag and tag.strip():
        clean_tag = tag.strip().lstrip("#").lower()
        qs = qs.filter(tags__name__iexact=clean_tag)

    if category and category.strip():
        qs = qs.filter(book__category__slug=category.strip().lower())

    if author and author.strip():
        clean_author = author.strip().lstrip("@")
        qs = qs.filter(author__username__iexact=clean_author)

    if not query_text:
        total = qs.count()
        items = list(qs.order_by("-updated_at", "-id")[offset : offset + limit])
        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "results": [_serialize_search_hit(n, "", viewer=viewer) for n in items],
            "books": books_out,
            "categories": categories_out,
            "users": users_out,
        }

    if connection.vendor == "postgresql":
        search_query = SearchQuery(query_text, search_type="websearch", config="simple")
        pg_qs = (
            qs.annotate(
                rank=SearchRank(F("search_vector"), search_query),
                sim=TrigramSimilarity("title", query_text),
            )
            .filter(Q(search_vector=search_query) | Q(sim__gte=0.2) | Q(title__icontains=query_text))
            .annotate(score=F("rank") * 2 + F("sim"))
            .order_by("-score", "-updated_at", "-id")
        )
        total = pg_qs.count()
        items = list(pg_qs[offset : offset + limit])
        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "results": [_serialize_search_hit(n, query_text, viewer=viewer) for n in items],
            "books": books_out,
            "categories": categories_out,
            "users": users_out,
        }

    # SQLite / fallback path
    scored: list[tuple[float, float, Note]] = []
    for note in qs.order_by("-updated_at", "-id"):
        score = _score_note_python(note, query_text)
        if score > 0:
            scored.append((score, note.updated_at.timestamp(), note))

    scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
    total = len(scored)
    page_items = [row[2] for row in scored[offset : offset + limit]]

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": [_serialize_search_hit(n, query_text, viewer=viewer) for n in page_items],
        "books": books_out,
        "categories": categories_out,
        "users": users_out,
    }


def _serialize_workspace_note(note: Note, viewer=None) -> dict:
    hit = _serialize_search_hit(note, "", viewer=viewer)
    hit["prereq_count"] = getattr(note, "_prereq_count", 0)
    return hit


def get_home_feed(viewer) -> dict:
    """Return recent published books/notes, viewer's desk categories, published topics, and viewer's workspace."""
    public_qs = (
        Note.objects.filter(published_notes_q())
        .select_related("author", "book", "book__category")
        .prefetch_related("tags")
        .annotate(
            _prereq_count=Count(
                "outgoing_links",
                filter=Q(outgoing_links__link_type="prereq"),
                distinct=True,
            )
        )
        .order_by("-updated_at", "-id")
    )
    recent_public = [_serialize_workspace_note(n, viewer=viewer) for n in public_qs[:12]]

    public_books_qs = (
        Book.objects.filter(published_books_q())
        .select_related("author", "category")
        .annotate(_chapter_count=Count("notes", filter=_published_chapter_q(), distinct=True))
        .order_by("-updated_at", "-id")
    )
    recent_books = [_serialize_book_hit(b) for b in public_books_qs[:12]]

    categories = list_categories_with_counts(viewer)

    topics_qs = (
        Tag.objects.filter(
            Q(notetag__note__visibility="public")
            & Q(notetag__note__is_published=True)
            & Q(notetag__note__moderation="ok")
            & Q(notetag__note__author__is_banned=False)
            & (
                Q(notetag__note__book__isnull=True)
                | Q(
                    notetag__note__book__visibility="public",
                    notetag__note__book__is_published=True,
                    notetag__note__book__moderation="ok",
                )
            )
        )
        .annotate(note_count=Count("notetag__note", distinct=True))
        .filter(note_count__gt=0)
        .order_by("-note_count", "name")[:18]
    )
    topics = [{"name": t.name, "count": t.note_count} for t in topics_qs]

    my_notes: list[dict] = []
    my_books: list[dict] = []
    stats = {"total": 0, "public": 0, "private": 0}
    book_stats = {"total": 0, "public": 0, "private": 0}
    if viewer and getattr(viewer, "is_authenticated", False):
        mine_qs = (
            Note.objects.filter(author=viewer)
            .select_related("author", "book", "book__category")
            .prefetch_related("tags")
            .annotate(
                _prereq_count=Count(
                    "outgoing_links",
                    filter=Q(outgoing_links__link_type="prereq"),
                    distinct=True,
                )
            )
            .order_by("-updated_at", "-id")
        )
        stats["total"] = mine_qs.count()
        stats["public"] = mine_qs.filter(visibility="public").count()
        stats["private"] = mine_qs.filter(visibility="private").count()
        my_notes = [_serialize_workspace_note(n) for n in mine_qs[:30]]

        my_books_qs = (
            Book.objects.filter(author=viewer)
            .select_related("author", "category")
            .annotate(_chapter_count=Count("notes", distinct=True))
            .order_by("-updated_at", "-id")
        )
        book_stats["total"] = my_books_qs.count()
        book_stats["public"] = my_books_qs.filter(visibility="public").count()
        book_stats["private"] = my_books_qs.filter(visibility="private").count()
        my_books = [_serialize_book_hit(b) for b in my_books_qs[:20]]

    return {
        "recent_public": recent_public,
        "recent_books": recent_books,
        "categories": categories,
        "topics": topics,
        "my_notes": my_notes,
        "my_books": my_books,
        "stats": stats,
        "book_stats": book_stats,
    }


def get_user_profile(viewer, username: str) -> dict | None:
    """Return public profile info, visible books, categories, topics, and notes."""
    try:
        profile_user = User.objects.get(username__iexact=username.strip(), is_banned=False)
    except User.DoesNotExist:
        return None

    books_qs = (
        Book.objects.filter(visible_books_q(viewer), author=profile_user)
        .select_related("author", "category")
        .annotate(_chapter_count=Count("notes", filter=_visible_chapter_q(viewer), distinct=True))
        .order_by("-updated_at", "-id")
    )
    books = [_serialize_book_hit(b) for b in books_qs]

    profile_categories = list_categories_with_counts(viewer, username=profile_user.username)

    notes_qs = (
        Note.objects.filter(visible_notes_q(viewer), author=profile_user)
        .select_related("author", "book", "book__category")
        .prefetch_related("tags")
        .annotate(
            _prereq_count=Count(
                "outgoing_links",
                filter=Q(outgoing_links__link_type="prereq"),
                distinct=True,
            )
        )
        .order_by("-updated_at", "-id")
    )
    notes = [_serialize_workspace_note(n, viewer=viewer) for n in notes_qs]

    topic_counts: dict[str, int] = {}
    for n in notes:
        for t in n["tags"]:
            topic_counts[t] = topic_counts.get(t, 0) + 1
    topics = [
        {"name": k, "count": v}
        for k, v in sorted(topic_counts.items(), key=lambda item: (-item[1], item[0]))
    ]

    return {
        "username": profile_user.username,
        "bio": profile_user.bio,
        "created_at": profile_user.created_at,
        "books": books,
        "categories": profile_categories,
        "notes": notes,
        "topics": topics,
        "is_self": bool(
            viewer
            and getattr(viewer, "is_authenticated", False)
            and viewer.id == profile_user.id
        ),
    }


def get_sitemap_entries() -> dict:
    """Return URL paths and timestamps for published, non-hidden notes and books."""
    notes_qs = (
        Note.objects.filter(published_notes_q())
        .select_related("author")
        .only("slug", "updated_at", "author__username")
        .order_by("-updated_at", "-id")
    )
    books_qs = (
        Book.objects.filter(published_books_q())
        .select_related("author")
        .only("slug", "updated_at", "author__username")
        .order_by("-updated_at", "-id")
    )

    notes = [
        {
            "path": f"/u/{n.author.username}/{n.slug}",
            "updated_at": n.updated_at,
        }
        for n in notes_qs
    ]
    books = [
        {
            "path": f"/u/{b.author.username}/books/{b.slug}",
            "updated_at": b.updated_at,
        }
        for b in books_qs
    ]
    return {"notes": notes, "books": books}
