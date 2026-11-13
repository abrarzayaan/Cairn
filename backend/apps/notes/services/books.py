from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.utils.text import slugify

from apps.notes.models import Book, Category, Note
from apps.notes.services.notes import visible_books_q, visible_notes_q

PRESET_CATEGORIES = [
    ("Backend", "backend", "APIs, servers, architecture, authentication, and backend engineering."),
    ("Frontend", "frontend", "UI engineering, React, Next.js, CSS, and browser internals."),
    ("Database", "database", "SQL, PostgreSQL, indexing, query tuning, and data modeling."),
    ("DevOps", "devops", "Containers, CI/CD, Linux, networking, and deployment."),
    ("Systems", "systems", "Operating systems, compilers, concurrency, and low-level programming."),
    ("CS Fundamentals", "cs-fundamentals", "Algorithms, data structures, networking, and computer science basics."),
    ("AI & ML", "ai-ml", "Machine learning, LLMs, embeddings, and applied AI engineering."),
    ("General", "general", "Developer workflows, tooling, debugging logs, and general notes."),
]


def ensure_preset_categories() -> None:
    """Seed preset topic categories idempotently if missing."""
    for name, slug, description in PRESET_CATEGORIES:
        Category.objects.get_or_create(
            slug=slug,
            defaults={"name": name, "description": description},
        )


def create_category(name: str, description: str = "") -> Category:
    """Create a topic category with a unique slug, or raise ValidationError on conflict."""
    clean_name = " ".join(name.strip().split())
    if not clean_name or len(clean_name) > 60:
        raise ValidationError("Category name is required and must be 60 characters or fewer.")

    clean_desc = description.strip()
    if len(clean_desc) > 200:
        raise ValidationError("Description must be 200 characters or fewer.")

    slug = slugify(clean_name)[:70]
    if not slug:
        raise ValidationError("Category name must contain letters or numbers.")

    if Category.objects.filter(Q(name__iexact=clean_name) | Q(slug=slug)).exists():
        raise ValidationError("A category with this name already exists.")

    return Category.objects.create(
        name=clean_name,
        slug=slug,
        description=clean_desc,
    )


def list_categories_with_counts(viewer) -> list[dict]:
    """Return all categories ordered by name with visible book counts."""
    if not Category.objects.exists():
        ensure_preset_categories()

    visible_book_filter = Q(books__visibility="public", books__moderation="ok", books__author__is_banned=False)
    if viewer and viewer.is_authenticated:
        visible_book_filter = visible_book_filter | Q(books__author_id=viewer.id)

    categories = Category.objects.annotate(
        book_count=Count("books", filter=visible_book_filter, distinct=True),
    ).order_by("name")

    return [
        {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "description": cat.description,
            "book_count": cat.book_count,
        }
        for cat in categories
    ]


def generate_unique_book_slug(
    author,
    title: str,
    current_book_id: int | None = None,
    custom_slug: str | None = None,
) -> str:
    """Generate a unique slug for a book scoped to its author."""
    if custom_slug is not None and custom_slug.strip():
        base = slugify(custom_slug)[:130]
        if not base:
            raise ValidationError("Slug must contain letters or numbers.")
    else:
        base = slugify(title)[:130] or "book"

    candidate = base
    suffix = 2
    while True:
        qs = Book.objects.filter(author=author, slug=candidate)
        if current_book_id is not None:
            qs = qs.exclude(id=current_book_id)
        if not qs.exists():
            return candidate
        candidate = f"{base[:120]}-{suffix}"
        suffix += 1


def create_book(
    author,
    title: str,
    category_id: int | None = None,
    description: str = "",
    visibility: str = "private",
    custom_slug: str | None = None,
) -> Book:
    """Create a documentation book under a category."""
    clean_title = title.strip()
    if not clean_title or len(clean_title) > 120:
        raise ValidationError("Book title is required and must be 120 characters or fewer.")

    clean_desc = description.strip()
    if len(clean_desc) > 400:
        raise ValidationError("Description must be 400 characters or fewer.")

    if visibility not in ("public", "private"):
        raise ValidationError("Visibility must be 'public' or 'private'.")

    if category_id is not None:
        category = Category.objects.filter(id=category_id).first()
        if not category:
            raise ValidationError("Category not found.")
    else:
        category = Category.objects.filter(slug="general").first()
        if not category:
            ensure_preset_categories()
            category = Category.objects.filter(slug="general").first()
        if not category:
            raise ValidationError("Category is required.")

    if Book.objects.filter(author=author, title__iexact=clean_title).exists():
        raise ValidationError("You already have a book with this title.")

    slug = generate_unique_book_slug(author, clean_title, custom_slug=custom_slug)
    return Book.objects.create(
        author=author,
        category=category,
        title=clean_title,
        slug=slug,
        description=clean_desc,
        visibility=visibility,
    )


def update_book(
    author,
    book_id: int,
    title: str | None = None,
    category_id: int | None = None,
    description: str | None = None,
    visibility: str | None = None,
    custom_slug: str | None = None,
) -> Book:
    """Update an owned book's metadata."""
    book = Book.objects.select_related("author", "category").get(id=book_id, author=author)

    if title is not None:
        clean_title = title.strip()
        if not clean_title or len(clean_title) > 120:
            raise ValidationError("Book title is required and must be 120 characters or fewer.")
        if (
            Book.objects.filter(author=author, title__iexact=clean_title)
            .exclude(id=book.id)
            .exists()
        ):
            raise ValidationError("You already have a book with this title.")
        book.title = clean_title

    if category_id is not None:
        category = Category.objects.filter(id=category_id).first()
        if not category:
            raise ValidationError("Category not found.")
        book.category = category

    if description is not None:
        clean_desc = description.strip()
        if len(clean_desc) > 400:
            raise ValidationError("Description must be 400 characters or fewer.")
        book.description = clean_desc

    if visibility is not None:
        if visibility not in ("public", "private"):
            raise ValidationError("Visibility must be 'public' or 'private'.")
        book.visibility = visibility

    if custom_slug is not None:
        book.slug = generate_unique_book_slug(
            author,
            book.title,
            current_book_id=book.id,
            custom_slug=custom_slug,
        )

    book.save()
    return book


def delete_book(author, book_id: int) -> bool:
    """Delete an owned book (its chapters stay intact with book=None via SET_NULL)."""
    book = Book.objects.get(id=book_id, author=author)
    book.delete()
    return True


def get_visible_book(viewer, username: str, slug: str) -> Book | None:
    """Resolve a visible book by author username and book slug."""
    return (
        Book.objects.filter(visible_books_q(viewer))
        .filter(author__username__iexact=username, slug=slug)
        .select_related("author", "category")
        .first()
    )


def get_book_chapters(viewer, book: Book) -> list[Note]:
    """Return ordered chapters in a book that are visible to viewer."""
    return list(
        Note.objects.filter(visible_notes_q(viewer))
        .filter(book=book)
        .select_related("author")
        .prefetch_related("tags")
        .order_by("sequence", "created_at", "id")
    )


def reorder_book_chapters(author, book_id: int, ordered_note_ids: list[int]) -> list[Note]:
    """Re-number sequential chapter order (1..N) for notes inside an owned book."""
    book = Book.objects.get(id=book_id, author=author)

    with transaction.atomic():
        notes = list(
            Note.objects.select_for_update()
            .filter(book=book, author=author)
            .order_by("sequence", "created_at", "id")
        )
        notes_by_id = {note.id: note for note in notes}

        seen: set[int] = set()
        ordered: list[Note] = []
        for note_id in ordered_note_ids:
            if note_id in seen:
                raise ValidationError("Duplicate note IDs in reorder list.")
            if note_id not in notes_by_id:
                raise ValidationError(f"Note {note_id} does not belong to this book.")
            seen.add(note_id)
            ordered.append(notes_by_id[note_id])

        # Append any book notes omitted from ordered_note_ids, preserving relative order
        for note in notes:
            if note.id not in seen:
                ordered.append(note)

        for index, note in enumerate(ordered, start=1):
            if note.sequence != index:
                note.sequence = index
                note.save(update_fields=["sequence"])

    return ordered

