import re
from difflib import SequenceMatcher

from django.contrib.postgres.search import SearchQuery, SearchRank, TrigramSimilarity
from django.db import connection
from django.db.models import F, Q

from apps.notes.models import Note
from apps.notes.services.notes import visible_notes_q


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
        "updated_at": note.updated_at,
    }


def search_notes(
    viewer,
    q: str = "",
    *,
    tag: str | None = None,
    author: str | None = None,
    scope: str = "all",
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """Search visible notes with optional tag/author/scope filters and pagination."""
    limit = max(1, min(limit, 50))
    offset = max(0, offset)
    query_text = (q or "").strip()

    qs = (
        Note.objects.filter(visible_notes_q(viewer))
        .select_related("author")
        .prefetch_related("tags")
        .distinct()
    )

    if scope == "mine":
        if viewer and getattr(viewer, "is_authenticated", False):
            qs = qs.filter(author=viewer)
        else:
            return {"total": 0, "limit": limit, "offset": offset, "results": []}

    if tag and tag.strip():
        clean_tag = tag.strip().lstrip("#").lower()
        qs = qs.filter(tags__name__iexact=clean_tag)

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
    }
