from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.deps import get_current_user, require_user, verify_csrf
from api.schemas.notes import (
    BookCreateIn,
    BookDetailOut,
    BookReorderIn,
    BookSummaryOut,
    BookUpdateIn,
    CategoryCreateIn,
    CategoryOut,
    CategoryUpdateIn,
    ChapterRefOut,
)
from apps.accounts.models import User
from apps.notes.models import Book, Category, Note
from apps.notes.services.books import (
    create_book,
    create_category,
    delete_book,
    delete_category,
    get_book_chapters,
    get_visible_book,
    list_categories_with_counts,
    reorder_book_chapters,
    update_book,
    update_category,
)
from apps.notes.services.notes import visible_books_q, visible_notes_q

router = APIRouter(tags=["books"])


def serialize_chapter_ref(note: Note) -> ChapterRefOut:
    """Serialize a note as a compact sequential chapter entry."""
    return ChapterRefOut(
        id=note.id,
        title=note.title,
        slug=note.slug,
        sequence=note.sequence,
        visibility=note.visibility,
        is_published=note.is_published,
        summary=note.summary,
        updated_at=note.updated_at,
    )


def serialize_book_summary(
    book: Book,
    viewer=None,
    include_moderation_note: bool = False,
    chapter_count: int | None = None,
) -> BookSummaryOut:
    """Serialize a Book with its Category and visible chapter count."""
    if chapter_count is None:
        annotated = getattr(book, "chapter_count", None)
        if annotated is not None:
            chapter_count = annotated
        else:
            chapter_count = (
                Note.objects.filter(visible_notes_q(viewer)).filter(book=book).count()
            )

    return BookSummaryOut(
        id=book.id,
        title=book.title,
        slug=book.slug,
        description=book.description,
        visibility=book.visibility,
        is_published=book.is_published,
        moderation=book.moderation,
        moderation_note=book.moderation_note if include_moderation_note else "",
        author_username=book.author.username,
        category=CategoryOut(
            id=book.category.id,
            name=book.category.name,
            slug=book.category.slug,
            description=book.category.description,
            book_count=0,
        ),
        chapter_count=chapter_count,
        created_at=book.created_at,
        updated_at=book.updated_at,
    )


def _visible_chapter_filter(viewer) -> Q:
    q = Q(notes__visibility="public", notes__moderation="ok", notes__author__is_banned=False)
    if viewer and viewer.is_authenticated:
        q = q | Q(notes__author_id=viewer.id)
    return q


@router.get("/categories", response_model=list[CategoryOut])
def get_categories(
    username: str | None = Query(default=None),
    viewer: User | None = Depends(get_current_user),
):
    """List personal categories with book counts (own desk or a user's desk)."""
    return [CategoryOut(**c) for c in list_categories_with_counts(viewer, username=username)]


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def post_category(
    data: CategoryCreateIn,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Create a personal topic category on the user's desk."""
    try:
        cat = create_category(author=user, name=data.name, description=data.description)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "validation_error", "message": str(exc)}},
        ) from exc
    return CategoryOut(
        id=cat.id,
        name=cat.name,
        slug=cat.slug,
        description=cat.description,
        book_count=0,
    )


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def patch_category(
    category_id: int,
    data: CategoryUpdateIn,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Update a personal category on the user's desk."""
    try:
        cat = update_category(
            author=user,
            category_id=category_id,
            name=data.name,
            description=data.description,
        )
    except Category.DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Category not found"}},
        ) from None
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "validation_error", "message": str(exc)}},
        ) from exc
    return CategoryOut(
        id=cat.id,
        name=cat.name,
        slug=cat.slug,
        description=cat.description,
        book_count=cat.books.count(),
    )


@router.delete("/categories/{category_id}")
def delete_category_endpoint(
    category_id: int,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Delete an empty personal category from the user's desk."""
    try:
        delete_category(author=user, category_id=category_id)
    except Category.DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Category not found"}},
        ) from None
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "validation_error", "message": str(exc)}},
        ) from exc
    return {"ok": True}


@router.get("/books/mine", response_model=list[BookSummaryOut])
def list_my_books(user: User = Depends(require_user)):
    """List all books authored by the current user."""
    books = (
        Book.objects.filter(author=user)
        .select_related("author", "category")
        .annotate(chapter_count=Count("notes", distinct=True))
        .order_by("-updated_at")
    )
    return [
        serialize_book_summary(b, viewer=user, include_moderation_note=True)
        for b in books
    ]


@router.get("/books", response_model=list[BookSummaryOut])
def list_books(
    category: str | None = Query(default=None),
    username: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    viewer: User | None = Depends(get_current_user),
):
    """List visible books, optionally filtered by category slug or author username."""
    qs = Book.objects.filter(visible_books_q(viewer)).select_related("author", "category")
    if category:
        qs = qs.filter(category__slug=category.strip().lower())
    if username:
        qs = qs.filter(author__username__iexact=username.strip())

    books = (
        qs.annotate(chapter_count=Count("notes", filter=_visible_chapter_filter(viewer), distinct=True))
        .order_by("-updated_at")[offset : offset + limit]
    )
    return [serialize_book_summary(b, viewer=viewer) for b in books]


@router.post("/books", response_model=BookSummaryOut, status_code=status.HTTP_201_CREATED)
def post_book(
    data: BookCreateIn,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Create a new documentation book."""
    try:
        book = create_book(
            author=user,
            title=data.title,
            category_id=data.category_id,
            description=data.description,
            visibility=data.visibility,
            is_published=data.is_published,
            custom_slug=data.slug,
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "validation_error", "message": str(exc)}},
        ) from exc
    return serialize_book_summary(book, viewer=user, include_moderation_note=True, chapter_count=0)


@router.get("/books/by-slug/{username}/{slug}", response_model=BookDetailOut)
def get_book_by_slug(
    username: str,
    slug: str,
    viewer: User | None = Depends(get_current_user),
):
    """Retrieve a visible book's metadata and ordered sequential chapters (Table of Contents)."""
    book = get_visible_book(viewer, username, slug)
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Book not found"}},
        )
    chapters = get_book_chapters(viewer, book)
    is_owner = viewer is not None and viewer.id == book.author_id
    return BookDetailOut(
        book=serialize_book_summary(
            book,
            viewer=viewer,
            include_moderation_note=is_owner,
            chapter_count=len(chapters),
        ),
        chapters=[serialize_chapter_ref(c) for c in chapters],
    )


@router.get("/books/{book_id}", response_model=BookSummaryOut)
def get_book_for_edit(book_id: int, user: User = Depends(require_user)):
    """Retrieve own book metadata by ID."""
    book = (
        Book.objects.filter(id=book_id, author=user)
        .select_related("author", "category")
        .annotate(chapter_count=Count("notes", distinct=True))
        .first()
    )
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Book not found"}},
        )
    return serialize_book_summary(book, viewer=user, include_moderation_note=True)


@router.patch("/books/{book_id}", response_model=BookSummaryOut)
def patch_book(
    book_id: int,
    data: BookUpdateIn,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Update an owned book."""
    try:
        book = update_book(
            author=user,
            book_id=book_id,
            title=data.title,
            category_id=data.category_id,
            description=data.description,
            visibility=data.visibility,
            is_published=data.is_published,
            custom_slug=data.slug,
        )
    except Book.DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Book not found"}},
        ) from None
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "validation_error", "message": str(exc)}},
        ) from exc
    return serialize_book_summary(book, viewer=user, include_moderation_note=True)


@router.delete("/books/{book_id}")
def remove_book(
    book_id: int,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Delete an owned book (notes are detached, not deleted)."""
    try:
        delete_book(author=user, book_id=book_id)
    except Book.DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Book not found"}},
        ) from None
    return {"ok": True}


@router.post("/books/{book_id}/reorder", response_model=list[ChapterRefOut])
def reorder_chapters(
    book_id: int,
    data: BookReorderIn,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Reorder sequential chapter numbers for an owned book."""
    try:
        chapters = reorder_book_chapters(
            author=user,
            book_id=book_id,
            ordered_note_ids=data.ordered_note_ids,
        )
    except Book.DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Book not found"}},
        ) from None
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "validation_error", "message": str(exc)}},
        ) from exc
    return [serialize_chapter_ref(c) for c in chapters]

