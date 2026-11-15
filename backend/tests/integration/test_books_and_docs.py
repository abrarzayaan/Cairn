import pytest
from django.db import connection

from api.rate_limit import search_rate_limiter
from apps.accounts.models import User
from apps.moderation.services import hide_book, unhide_book
from apps.notes.models import Book, Category, Note
from apps.notes.services.books import ensure_starter_categories
from apps.notes.services.notes import create_note


def _auth_client(api_client, client, user) -> dict[str, str]:
    client.force_login(user)
    session_cookie = client.cookies["sessionid"].value
    connection.close()
    api_client.cookies.set("sessionid", session_cookie)
    api_client.get("/api/v1/auth/me")
    csrf = api_client.cookies.get("csrftoken")
    return {"X-CSRFToken": csrf}


@pytest.mark.django_db(transaction=True)
def test_categories_seeded_and_custom_creation(api_client, client):
    """Personal categories are seeded per-user desk and support CRUD with ownership isolation."""
    # Unauthenticated without username gets empty list
    res = api_client.get("/api/v1/categories")
    assert res.status_code == 200
    assert res.json() == []

    # Unauthenticated cannot create category
    assert api_client.post("/api/v1/categories", json={"name": "Rust"}).status_code == 401

    user = User.objects.create_user(username="cat_dev", github_id=8101)
    headers = _auth_client(api_client, client, user)

    # First call by authenticated user auto-seeds starter categories for their desk
    res_auth = api_client.get("/api/v1/categories", headers=headers)
    assert res_auth.status_code == 200
    names = {c["name"] for c in res_auth.json()}
    assert {"Backend", "Frontend", "Database", "DevOps", "General"}.issubset(names)

    # Create custom category on own desk
    created = api_client.post(
        "/api/v1/categories",
        json={"name": "Distributed Systems", "description": "Consensus & replication"},
        headers=headers,
    )
    assert created.status_code == 201
    created_cat = created.json()
    assert created_cat["slug"] == "distributed-systems"
    cat_id = created_cat["id"]

    # Case-insensitive duplicate rejected on the same user's desk
    dup = api_client.post(
        "/api/v1/categories",
        json={"name": "distributed systems"},
        headers=headers,
    )
    assert dup.status_code == 400

    # Another user can create a category with the same name on their own desk without conflict
    user2 = User.objects.create_user(username="user_two", github_id=8102)
    headers2 = _auth_client(api_client, client, user2)
    created2 = api_client.post(
        "/api/v1/categories",
        json={"name": "Distributed Systems"},
        headers=headers2,
    )
    assert created2.status_code == 201
    assert created2.json()["slug"] == "distributed-systems"

    # User2 cannot patch User's category
    patch_forbidden = api_client.patch(
        f"/api/v1/categories/{cat_id}",
        json={"name": "Hacked Cat"},
        headers=headers2,
    )
    assert patch_forbidden.status_code == 400

    # Switch back to user: user can patch their own category
    headers = _auth_client(api_client, client, user)
    patched = api_client.patch(
        f"/api/v1/categories/{cat_id}",
        json={"name": "Distributed Consensus", "description": "Raft and Paxos"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Distributed Consensus"
    assert patched.json()["slug"] == "distributed-consensus"

    # Renaming to existing name on own desk rejected
    dup_rename = api_client.patch(
        f"/api/v1/categories/{cat_id}",
        json={"name": "Backend"},
        headers=headers,
    )
    assert dup_rename.status_code == 400

    # User2 cannot delete User's category
    headers2 = _auth_client(api_client, client, user2)
    del_forbidden = api_client.delete(
        f"/api/v1/categories/{cat_id}",
        headers=headers2,
    )
    assert del_forbidden.status_code == 400

    # Deleting category containing books is rejected
    headers = _auth_client(api_client, client, user)
    backend_cat = Category.objects.get(author=user, slug="backend")
    Book.objects.create(
        author=user,
        category=backend_cat,
        title="Sample Book",
        slug="sample-book",
        visibility="public",
    )
    del_with_books = api_client.delete(
        f"/api/v1/categories/{backend_cat.id}",
        headers=headers,
    )
    assert del_with_books.status_code == 400

    # Deleting empty category succeeds
    del_empty = api_client.delete(
        f"/api/v1/categories/{cat_id}",
        headers=headers,
    )
    assert del_empty.status_code == 200

    # Querying desk categories via ?username=cat_dev by user2 only shows categories with visible books
    headers2 = _auth_client(api_client, client, user2)
    desk_public = api_client.get(f"/api/v1/categories?username={user.username}", headers=headers2)
    assert desk_public.status_code == 200
    public_cats = desk_public.json()
    assert len(public_cats) == 1
    assert public_cats[0]["slug"] == "backend"
    assert public_cats[0]["book_count"] == 1

    # Owner querying own desk categories sees all remaining categories (8 starters - 0 deleted + custom was deleted = 8)
    headers = _auth_client(api_client, client, user)
    desk_owner = api_client.get(f"/api/v1/categories?username={user.username}", headers=headers)
    assert desk_owner.status_code == 200
    assert len(desk_owner.json()) == 8


@pytest.mark.django_db(transaction=True)
def test_book_crud_chapters_sequence_and_reorder(api_client, client):
    """Books support sequential chapters, prev/next navigation, reordering, and safe detach on delete."""
    user = User.objects.create_user(username="book_dev", github_id=8103, bio="Backend engineer")
    headers = _auth_client(api_client, client, user)

    # Seed starter categories for user
    ensure_starter_categories(user)
    backend_cat = Category.objects.get(author=user, slug="backend")
    book_res = api_client.post(
        "/api/v1/books",
        json={
            "title": "PostgreSQL Internals",
            "category_id": backend_cat.id,
            "description": "Deep dive into MVCC, WAL, and indexing.",
            "visibility": "public",
            "is_published": True,
        },
        headers=headers,
    )
    assert book_res.status_code == 201
    book_data = book_res.json()
    book_id = book_data["id"]
    assert book_data["slug"] == "postgresql-internals"
    assert book_data["category"]["slug"] == "backend"
    assert book_data["is_published"] is True

    # Create 3 chapters without explicit sequence -> auto 1, 2, 3
    ch1 = api_client.post(
        "/api/v1/notes",
        json={"title": "Page Layout", "content_md": "# Pages", "visibility": "public", "is_published": True, "book_id": book_id},
        headers=headers,
    )
    ch2 = api_client.post(
        "/api/v1/notes",
        json={"title": "MVCC & Tuples", "content_md": "# MVCC", "visibility": "public", "is_published": True, "book_id": book_id},
        headers=headers,
    )
    ch3 = api_client.post(
        "/api/v1/notes",
        json={"title": "Write-Ahead Log", "content_md": "# WAL", "visibility": "public", "is_published": True, "book_id": book_id},
        headers=headers,
    )
    assert ch1.status_code == 201 and ch1.json()["sequence"] == 1
    assert ch2.status_code == 201 and ch2.json()["sequence"] == 2
    assert ch3.status_code == 201 and ch3.json()["sequence"] == 3

    # Middle chapter detail returns full ordered TOC + prev/next pointers
    detail = api_client.get(f"/api/v1/notes/by-slug/{user.username}/{ch2.json()['slug']}")
    assert detail.status_code == 200
    d_json = detail.json()
    assert [c["title"] for c in d_json["chapters"]] == [
        "Page Layout",
        "MVCC & Tuples",
        "Write-Ahead Log",
    ]
    assert d_json["prev_chapter"]["slug"] == ch1.json()["slug"]
    assert d_json["next_chapter"]["slug"] == ch3.json()["slug"]
    assert d_json["note"]["book"]["slug"] == "postgresql-internals"

    # Reorder: WAL (ch3) -> Page Layout (ch1) -> MVCC (ch2)
    reorder_res = api_client.post(
        f"/api/v1/books/{book_id}/reorder",
        json={"ordered_note_ids": [ch3.json()["id"], ch1.json()["id"], ch2.json()["id"]]},
        headers=headers,
    )
    assert reorder_res.status_code == 200
    assert [(c["title"], c["sequence"]) for c in reorder_res.json()] == [
        ("Write-Ahead Log", 1),
        ("Page Layout", 2),
        ("MVCC & Tuples", 3),
    ]

    # Book context / TOC page endpoint reflects new sequence
    toc_res = api_client.get(f"/api/v1/books/by-slug/{user.username}/postgresql-internals")
    assert toc_res.status_code == 200
    assert [c["title"] for c in toc_res.json()["chapters"]] == [
        "Write-Ahead Log",
        "Page Layout",
        "MVCC & Tuples",
    ]

    # Deleting book keeps notes intact with book=None
    del_res = api_client.delete(f"/api/v1/books/{book_id}", headers=headers)
    assert del_res.status_code == 200
    assert not Book.objects.filter(id=book_id).exists()
    n1 = Note.objects.get(id=ch1.json()["id"])
    assert n1.book_id is None


@pytest.mark.django_db(transaction=True)
def test_private_book_hides_public_chapters_everywhere(api_client, client):
    """Private books keep chapters hidden; public but unpublished books stay off global search."""
    search_rate_limiter.reset()
    owner = User.objects.create_user(username="priv_owner", github_id=8104)
    stranger = User.objects.create_user(username="priv_stranger", github_id=8105)
    ensure_starter_categories(owner)
    cat = Category.objects.get(author=owner, slug="systems")

    priv_book = Book.objects.create(
        author=owner,
        category=cat,
        title="Secret Architecture Book",
        slug="secret-arch",
        visibility="private",
        is_published=False,
    )
    chapter = create_note(
        author=owner,
        title="Internal Token Exchange",
        content_md="Secret token exchange details",
        tags=["security"],
        visibility="public",
        is_published=False,
        book_id=priv_book.id,
        sequence=1,
    )
    priv_chapter = create_note(
        author=owner,
        title="Draft Keys",
        content_md="Draft only",
        visibility="private",
        is_published=False,
        book_id=priv_book.id,
        sequence=2,
    )

    # Stranger sees 404 on book, chapter note, and path; excluded from search, home, and profile
    _auth_client(api_client, client, stranger)
    assert api_client.get(f"/api/v1/books/by-slug/{owner.username}/{priv_book.slug}").status_code == 404
    assert api_client.get(f"/api/v1/notes/by-slug/{owner.username}/{chapter.slug}").status_code == 404
    assert api_client.get(f"/api/v1/notes/by-slug/{owner.username}/{chapter.slug}/path").status_code == 404

    search_res = api_client.get("/api/v1/search?q=Internal").json()
    assert search_res["results"] == []
    assert search_res["books"] == []

    home_res = api_client.get("/api/v1/home").json()
    assert all(b["slug"] != priv_book.slug for b in home_res["recent_books"])
    assert all(n["slug"] != chapter.slug for n in home_res["recent_public"])

    prof_res = api_client.get(f"/api/v1/users/{owner.username}/profile").json()
    assert prof_res["books"] == []
    assert prof_res["notes"] == []

    # Owner still sees their own private book and both chapters
    _auth_client(api_client, client, owner)
    owner_toc = api_client.get(f"/api/v1/books/by-slug/{owner.username}/{priv_book.slug}")
    assert owner_toc.status_code == 200
    assert len(owner_toc.json()["chapters"]) == 2
    assert api_client.get(f"/api/v1/notes/by-slug/{owner.username}/{chapter.slug}").status_code == 200

    # Flip book to public, but KEEP unpublished (is_published=False)
    priv_book.visibility = "public"
    priv_book.save(update_fields=["visibility"])

    # Stranger sees public book and chapter on profile and direct link
    _auth_client(api_client, client, stranger)
    pub_toc = api_client.get(f"/api/v1/books/by-slug/{owner.username}/{priv_book.slug}")
    assert pub_toc.status_code == 200
    assert [c["slug"] for c in pub_toc.json()["chapters"]] == [chapter.slug]
    assert api_client.get(f"/api/v1/notes/by-slug/{owner.username}/{priv_chapter.slug}").status_code == 404

    prof_pub = api_client.get(f"/api/v1/users/{owner.username}/profile").json()
    assert len(prof_pub["books"]) == 1
    assert prof_pub["books"][0]["slug"] == priv_book.slug

    # BUT unpublished doc is STILL excluded from global search and home feed!
    search_unpub = api_client.get("/api/v1/search?q=Internal").json()
    assert search_unpub["results"] == []
    assert search_unpub["books"] == []

    # Once published, it appears in global search and discovers author's profile
    priv_book.is_published = True
    priv_book.save(update_fields=["is_published"])
    chapter.is_published = True
    chapter.save(update_fields=["is_published"])

    # Chapter search finds the note and discovers author
    search_pub = api_client.get("/api/v1/search?q=Internal").json()
    assert len(search_pub["results"]) == 1
    assert search_pub["results"][0]["slug"] == chapter.slug
    assert any(u["username"] == owner.username for u in search_pub["users"])

    # Book search finds the published book
    search_book = api_client.get("/api/v1/search?q=Architecture").json()
    assert len(search_book["books"]) == 1
    assert search_book["books"][0]["slug"] == priv_book.slug


@pytest.mark.django_db(transaction=True)
def test_unified_search_and_book_moderation(api_client, client):
    """Unified search finds published books, chapters, and discovers authors by topic; moderation hides properly."""
    search_rate_limiter.reset()
    dev = User.objects.create_user(username="redis_guru", github_id=8106, bio="Distributed cache docs")
    other = User.objects.create_user(username="reader_one", github_id=8107)
    ensure_starter_categories(dev)
    db_cat = Category.objects.get(author=dev, slug="database")

    book = Book.objects.create(
        author=dev,
        category=db_cat,
        title="Redis Cluster Guide",
        slug="redis-cluster-guide",
        description="Sharding and failover patterns",
        visibility="public",
        is_published=True,
    )
    ch = create_note(
        author=dev,
        title="Redis Hash Slots",
        content_md="16384 hash slots across master nodes.",
        visibility="public",
        is_published=True,
        book_id=book.id,
    )

    # Unified search matches published book, note, and author profile
    res_all = api_client.get("/api/v1/search?q=redis").json()
    assert len(res_all["books"]) == 1
    assert res_all["books"][0]["slug"] == "redis-cluster-guide"
    assert res_all["books"][0]["chapter_count"] == 1
    assert len(res_all["results"]) == 1
    assert res_all["results"][0]["book_slug"] == "redis-cluster-guide"
    assert any(u["username"] == "redis_guru" for u in res_all["users"])

    # Category-scoped search
    cat_search = api_client.get("/api/v1/search?q=redis&category=database").json()
    assert len(cat_search["books"]) == 1
    cat_miss = api_client.get("/api/v1/search?q=redis&category=frontend").json()
    assert cat_miss["books"] == []
    assert cat_miss["results"] == []

    # Category search scoped to author's desk
    cats_author = api_client.get(f"/api/v1/search?q=database&type=categories&author={dev.username}").json()
    assert any(c["slug"] == "database" for c in cats_author["categories"])
    assert cats_author["books"] == []
    assert cats_author["results"] == []

    # Moderation hide_book hides both book and its chapter from non-owners
    hide_book(book, "Spam link in description")
    _auth_client(api_client, client, other)
    assert api_client.get(f"/api/v1/books/by-slug/{dev.username}/{book.slug}").status_code == 404
    assert api_client.get(f"/api/v1/notes/by-slug/{dev.username}/{ch.slug}").status_code == 404

    # Owner still sees hidden book with moderation_note
    _auth_client(api_client, client, dev)
    owner_book = api_client.get(f"/api/v1/books/by-slug/{dev.username}/{book.slug}")
    assert owner_book.status_code == 200
    assert owner_book.json()["book"]["moderation"] == "hidden"
    assert owner_book.json()["book"]["moderation_note"] == "Spam link in description"

    # Unhide restores public visibility
    unhide_book(book)
    _auth_client(api_client, client, other)
    assert api_client.get(f"/api/v1/books/by-slug/{dev.username}/{book.slug}").status_code == 200
