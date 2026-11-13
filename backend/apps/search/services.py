import re
from difflib import SequenceMatcher

from django.contrib.postgres.search import SearchQuery, SearchRank, TrigramSimilarity
from django.db import connection
from django.db.models import Count, F, Q

from apps.accounts.models import User
from apps.notes.models import Book, Note, Tag
from apps.notes.services.books import list_categories_with_counts
from apps.notes.services.notes import visible_books_q, visible_notes_q


def _visible_chapter_q(viewer) -> Q:
    q = Q(notes__visibility="public", notes__moderation="ok", notes__author__is_banned=False)
    if viewer and getattr(viewer, "is_authenticated", False):
        q = q | Q(notes__author_id=viewer.id)
    return q


def _serialize_book_hit(book: Book) -> dict:
    return {
        "id": book.id,
        "title": book.title,
        "slug": book.slug,
        "description": book.description,
        "visibility": book.visibility,
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


def _serialize_search_hit(note: Note, query_text: str) -> dict:
    return {
        "id": note.id,
        "title": note.title,
        "slug": note.slug,
        "author_username": note.author.username,
        "visibility": note.visibility,
        "tags": [t.name for t in note.tags.all()],
        "snippet": _build_snippet(note.content_md, query_text),
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
    if scope == "mine" and not (viewer and getattr(viewer, "is_authenticated", False)):
        return []
    qs = Book.objects.filter(visible_books_q(viewer)).select_related("author", "category")
    if scope == "mine":
        qs = qs.filter(author=viewer)
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
    qs = qs.annotate(
        _chapter_count=Count("notes", filter=_visible_chapter_q(viewer), distinct=True)
    ).order_by("-updated_at", "-id")[:20]
    return [_serialize_book_hit(b) for b in qs]


def _search_categories(viewer, query_text: str, category: str | None = None) -> list[dict]:
    cats = list_categories_with_counts(viewer)
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
        clean_q = query_text.lstrip("@")
        qs = qs.filter(Q(username__icontains=clean_q) | Q(bio__icontains=clean_q))
    qs = qs.annotate(
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
    ).order_by("-public_book_count", "-public_note_count", "username")[:15]
    return [
        {
            "username": u.username,
            "bio": u.bio,
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
        _search_categories(viewer, query_text, category=category)
        if search_type in ("all", "categories") and scope != "mine" and (query_text or search_type == "categories")
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

    qs = (
        Note.objects.filter(visible_notes_q(viewer))
        .select_related("author", "book", "book__category")
        .prefetch_related("tags")
        .distinct()
    )

    if scope == "mine":
        if viewer and getattr(viewer, "is_authenticated", False):
            qs = qs.filter(author=viewer)
        else:
            return {
                "total": 0,
                "limit": limit,
                "offset": offset,
                "results": [],
                "books": [],
                "categories": [],
                "users": [],
            }

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
            "results": [_serialize_search_hit(n, "") for n in items],
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
            "results": [_serialize_search_hit(n, query_text) for n in items],
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
        "results": [_serialize_search_hit(n, query_text) for n in page_items],
        "books": books_out,
        "categories": categories_out,
        "users": users_out,
    }


def _serialize_workspace_note(note: Note) -> dict:
    hit = _serialize_search_hit(note, "")
    hit["prereq_count"] = getattr(note, "_prereq_count", 0)
    return hit


def get_home_feed(viewer) -> dict:
    """Return recent public books/notes, categories, topics, and viewer's workspace."""
    public_qs = (
        Note.objects.filter(visible_notes_q(None))
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
    recent_public = [_serialize_workspace_note(n) for n in public_qs[:12]]

    public_books_qs = (
        Book.objects.filter(visible_books_q(None))
        .select_related("author", "category")
        .annotate(_chapter_count=Count("notes", filter=_visible_chapter_q(None), distinct=True))
        .order_by("-updated_at", "-id")
    )
    recent_books = [_serialize_book_hit(b) for b in public_books_qs[:12]]

    categories = list_categories_with_counts(viewer)

    topics_qs = (
        Tag.objects.filter(
            Q(notetag__note__visibility="public")
            & Q(notetag__note__moderation="ok")
            & Q(notetag__note__author__is_banned=False)
            & (
                Q(notetag__note__book__isnull=True)
                | Q(notetag__note__book__visibility="public", notetag__note__book__moderation="ok")
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

    cat_map: dict[int, dict] = {}
    for b in books:
        cat = b["category"]
        if cat["id"] not in cat_map:
            cat_map[cat["id"]] = {**cat, "book_count": 0}
        cat_map[cat["id"]]["book_count"] += 1
    profile_categories = sorted(cat_map.values(), key=lambda c: (-c["book_count"], c["name"]))

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
    notes = [_serialize_workspace_note(n) for n in notes_qs]

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
