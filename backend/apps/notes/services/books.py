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


def ensure_starter_categories(user) -> list[Category]:
    """Seed starter personal categories for a user's desk if they have none."""
    if not user or not user.is_authenticated:
        return []
    cats = []
    for name, slug, description in PRESET_CATEGORIES:
        cat, _ = Category.objects.get_or_create(
            author=user,
            slug=slug,
            defaults={"name": name, "description": description},
        )
        cats.append(cat)
    return cats


def ensure_preset_categories() -> None:
    """Backwards-compatible helper: ensures starter categories exist for all existing users."""
    from apps.accounts.models import User
    for u in User.objects.all():
        ensure_starter_categories(u)


def create_category(author, name: str, description: str = "") -> Category:
    """Create a personal topic category scoped to the author's desk."""
    if not author or not author.is_authenticated:
        raise ValidationError("Authentication required to create a category.")

    clean_name = " ".join(name.strip().split())
    if not clean_name or len(clean_name) > 60:
        raise ValidationError("Category name is required and must be 60 characters or fewer.")

    clean_desc = description.strip()
    if len(clean_desc) > 200:
        raise ValidationError("Description must be 200 characters or fewer.")

    slug = slugify(clean_name)[:70]
    if not slug:
        raise ValidationError("Category name must contain letters or numbers.")

    if Category.objects.filter(author=author).filter(Q(name__iexact=clean_name) | Q(slug=slug)).exists():
        raise ValidationError("A category with this name already exists on your desk.")

    return Category.objects.create(
        author=author,
        name=clean_name,
        slug=slug,
        description=clean_desc,
    )


def update_category(
    author,
    category_id: int,
    name: str | None = None,
    description: str | None = None,
) -> Category:
    """Update a personal category owned by the author."""
    category = Category.objects.filter(id=category_id, author=author).first()
    if not category:
        raise ValidationError("Category not found on your desk.")

    if name is not None:
        clean_name = " ".join(name.strip().split())
        if not clean_name or len(clean_name) > 60:
            raise ValidationError("Category name is required and must be 60 characters or fewer.")
        slug = slugify(clean_name)[:70]
        if not slug:
            raise ValidationError("Category name must contain letters or numbers.")
        if (
            Category.objects.filter(author=author)
            .filter(Q(name__iexact=clean_name) | Q(slug=slug))
            .exclude(id=category.id)
            .exists()
        ):
            raise ValidationError("A category with this name already exists on your desk.")
        category.name = clean_name
        category.slug = slug

    if description is not None:
        clean_desc = description.strip()
        if len(clean_desc) > 200:
            raise ValidationError("Description must be 200 characters or fewer.")
        category.description = clean_desc

    category.save()
    return category


def delete_category(author, category_id: int) -> bool:
    """Delete a personal category if it contains no books."""
    category = Category.objects.filter(id=category_id, author=author).first()
    if not category:
        raise ValidationError("Category not found on your desk.")

    if category.books.exists():
        raise ValidationError("Cannot delete category containing books. Reassign or delete its books first.")

    category.delete()
    return True


def list_categories_with_counts(viewer, username: str | None = None) -> list[dict]:
    """Return personal categories with visible book counts.

    - If username provided: lists that user's visible categories (hiding private-only categories for others).
    - If no username: lists viewer's own desk categories (seeds starters if empty).
    """
    from apps.accounts.models import User

    target_user = None
    if username and username.strip():
        clean_username = username.strip().lstrip("@")
        target_user = User.objects.filter(username__iexact=clean_username, is_banned=False).first()
        if not target_user:
            return []
    elif viewer and viewer.is_authenticated:
        target_user = viewer
    else:
        return []

    is_owner = bool(viewer and viewer.is_authenticated and viewer.id == target_user.id)

    # Seed starter categories for own desk if none exist
    if is_owner and not Category.objects.filter(author=target_user).exists():
        ensure_starter_categories(target_user)

    visible_book_filter = Q(
        books__visibility="public",
        books__moderation="ok",
        books__author__is_banned=False,
    )
    if is_owner:
        visible_book_filter = visible_book_filter | Q(books__author_id=target_user.id)

    qs = Category.objects.filter(author=target_user).annotate(
        book_count=Count("books", filter=visible_book_filter, distinct=True),
    ).order_by("name")

    # Non-owners must NEVER see empty categories or categories with only private books
    if not is_owner:
        qs = qs.filter(book_count__gt=0)

    return [
        {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "description": cat.description,
            "book_count": cat.book_count,
        }
        for cat in qs
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
    is_published: bool = False,
    custom_slug: str | None = None,
) -> Book:
    """Create a documentation book under a personal category on author's desk."""
    clean_title = title.strip()
    if not clean_title or len(clean_title) > 120:
        raise ValidationError("Book title is required and must be 120 characters or fewer.")

    clean_desc = description.strip()
    if len(clean_desc) > 400:
        raise ValidationError("Description must be 400 characters or fewer.")

    if visibility not in ("public", "private"):
        raise ValidationError("Visibility must be 'public' or 'private'.")

    if visibility == "private" and is_published:
        raise ValidationError("Private books cannot be published.")

    resolved_published = is_published if visibility == "public" else False

    if category_id is not None:
        category = Category.objects.filter(id=category_id, author=author).first()
        if not category:
            raise ValidationError("Category not found on your desk.")
    else:
        category = Category.objects.filter(author=author, slug="general").first()
        if not category:
            ensure_starter_categories(author)
            category = Category.objects.filter(author=author, slug="general").first()
        if not category:
            category = Category.objects.create(author=author, name="General", slug="general")

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
        is_published=resolved_published,
    )


def update_book(
    author,
    book_id: int,
    title: str | None = None,
    category_id: int | None = None,
    description: str | None = None,
    visibility: str | None = None,
    is_published: bool | None = None,
    custom_slug: str | None = None,
) -> Book:
    """Update an owned book's metadata and publish state."""
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
        category = Category.objects.filter(id=category_id, author=author).first()
        if not category:
            raise ValidationError("Category not found on your desk.")
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

    if is_published is not None:
        if is_published and book.visibility != "public":
            raise ValidationError("Private books cannot be published.")
        book.is_published = bool(is_published)

    # Invariant: private books can NEVER be published
    if book.visibility == "private":
        book.is_published = False

    if custom_slug is not None:
        book.slug = generate_unique_book_slug(
            author,
            book.title,
            current_book_id=book.id,
            custom_slug=custom_slug,
        )

    book.save()
    return book
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

