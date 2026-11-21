from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.utils.text import slugify

from apps.notes.models import Book, Category, Note, UserCategory
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


def ensure_default_categories() -> list[Category]:
    """Ensure the 8 global default canonical categories exist once in `categories`."""
    cats = []
    for name, slug, description in PRESET_CATEGORIES:
        cat, created = Category.objects.get_or_create(
            slug=slug,
            defaults={"name": name, "description": description, "is_default": True},
        )
        if not created and not cat.is_default:
            cat.is_default = True
            cat.save(update_fields=["is_default"])
        cats.append(cat)
    return cats


def list_suggested_categories() -> list[dict]:
    """Return global default category suggestions (never exposes arbitrary private user categories)."""
    if not Category.objects.filter(is_default=True).exists():
        ensure_default_categories()
    qs = Category.objects.filter(is_default=True).order_by("name")
    return [
        {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "description": cat.description,
            "book_count": 0,
        }
        for cat in qs
    ]


def _get_or_create_canonical_category(name: str, description: str = "") -> Category:
    """Resolve or create a globally deduplicated Category row by slug / case-insensitive name."""
    clean_name = " ".join(name.strip().split())
    if not clean_name or len(clean_name) > 60:
        raise ValidationError("Category name is required and must be 60 characters or fewer.")

    slug = slugify(clean_name)[:70]
    if not slug:
        raise ValidationError("Category name must contain letters or numbers.")

    existing = Category.objects.filter(Q(slug=slug) | Q(name__iexact=clean_name)).first()
    if existing:
        return existing

    return Category.objects.create(
        name=clean_name,
        slug=slug,
        description=description.strip()[:200],
        is_default=False,
    )


@transaction.atomic
def create_category(author, name: str, description: str = "") -> Category:
    """Attach a canonical Category to the author's personal desk (creating the canonical row only if new)."""
    if not author or not author.is_authenticated:
        raise ValidationError("Authentication required to create a category.")

    clean_desc = description.strip()
    if len(clean_desc) > 200:
        raise ValidationError("Description must be 200 characters or fewer.")

    canonical = _get_or_create_canonical_category(name, description=clean_desc)

    if UserCategory.objects.filter(user=author, category=canonical).exists():
        raise ValidationError("A category with this name already exists on your desk.")

    UserCategory.objects.create(
        user=author,
        category=canonical,
        description=clean_desc,
    )
    # Attach desk description for serializer convenience without mutating global Category
    canonical.desk_description = clean_desc
    return canonical


@transaction.atomic
def update_category(
    author,
    category_id: int,
    name: str | None = None,
    description: str | None = None,
) -> Category:
    """Update a personal desk shelf. Renaming re-points author's shelf & books to a canonical Category."""
    shelf = (
        UserCategory.objects.select_related("category")
        .filter(user=author, category_id=category_id)
        .first()
    )
    if not shelf:
        raise Category.DoesNotExist("Category not found on your desk.")

    clean_desc = shelf.description
    if description is not None:
        clean_desc = description.strip()
        if len(clean_desc) > 200:
            raise ValidationError("Description must be 200 characters or fewer.")

    target_cat = shelf.category
    if name is not None:
        clean_name = " ".join(name.strip().split())
        if not clean_name or len(clean_name) > 60:
            raise ValidationError("Category name is required and must be 60 characters or fewer.")
        new_slug = slugify(clean_name)[:70]
        if not new_slug:
            raise ValidationError("Category name must contain letters or numbers.")

        if new_slug != shelf.category.slug:
            target_cat = _get_or_create_canonical_category(clean_name, description=clean_desc)
            if (
                UserCategory.objects.filter(user=author, category=target_cat)
                .exclude(id=shelf.id)
                .exists()
            ):
                raise ValidationError("A category with this name already exists on your desk.")
            # Re-point ONLY this author's books from the old category to the target canonical category
            Book.objects.filter(author=author, category_id=shelf.category_id).update(
                category=target_cat
            )
            shelf.category = target_cat

    shelf.description = clean_desc
    shelf.save(update_fields=["category", "description"])
    target_cat.desk_description = clean_desc
    return target_cat


@transaction.atomic
def delete_category(author, category_id: int) -> bool:
    """Remove an empty category shelf from the author's personal desk (shared canonical row stays intact)."""
    shelf = UserCategory.objects.filter(user=author, category_id=category_id).first()
    if not shelf:
        raise Category.DoesNotExist("Category not found on your desk.")

    if Book.objects.filter(author=author, category_id=category_id).exists():
        raise ValidationError(
            "Cannot delete category containing books. Reassign or delete its books first."
        )

    shelf.delete()
    return True


def list_categories_with_counts(viewer, username: str | None = None) -> list[dict]:
    """Return a user's personal desk shelves (`UserCategory`) with their visible book counts.

    - Starts cleanly empty for new users (zero forced starter rows).
    - Non-owners never see empty shelves or shelves containing only private/hidden books.
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

    book_filter = Q(category__books__author_id=target_user.id)
    if not is_owner:
        book_filter = book_filter & Q(
            category__books__visibility="public",
            category__books__moderation="ok",
        )

    qs = (
        UserCategory.objects.filter(user=target_user)
        .select_related("category")
        .annotate(
            book_count=Count("category__books", filter=book_filter, distinct=True),
        )
        .order_by("sort_order", "category__name")
    )

    # Non-owners must NEVER see empty shelves or shelves with only private books
    if not is_owner:
        qs = qs.filter(book_count__gt=0)

    return [
        {
            "id": shelf.category.id,
            "name": shelf.category.name,
            "slug": shelf.category.slug,
            "description": shelf.description or shelf.category.description,
            "book_count": shelf.book_count,
        }
        for shelf in qs
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


def _resolve_category_for_author(author, category_id: int | None) -> Category:
    """Resolve a category the author is allowed to assign a book to, and lazily link it to their desk.

    Allowed targets:
    - Any category already on `author`'s desk (`UserCategory`), OR
    - Any global default category (`is_default=True`).
    Arbitrary custom categories created by other users cannot be selected by raw ID.
    """
    if category_id is not None:
        category = (
            Category.objects.filter(
                Q(id=category_id)
                & (Q(is_default=True) | Q(user_shelves__user=author))
            )
            .distinct()
            .first()
        )
        if not category:
            raise ValidationError("Category not found on your desk.")
    else:
        ensure_default_categories()
        category = Category.objects.filter(slug="general").first()
        if not category:
            category = Category.objects.create(
                name="General", slug="general", is_default=True
            )

    UserCategory.objects.get_or_create(user=author, category=category)
    return category


@transaction.atomic
def create_book(
    author,
    title: str,
    category_id: int | None = None,
    description: str = "",
    visibility: str = "private",
    is_published: bool = False,
    custom_slug: str | None = None,
) -> Book:
    """Create a documentation book under a canonical category and lazily link it to author's desk."""
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
    category = _resolve_category_for_author(author, category_id)

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


@transaction.atomic
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
        book.category = _resolve_category_for_author(author, category_id)

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
