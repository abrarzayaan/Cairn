import pytest
from django.db import connection

from api.rate_limit import search_rate_limiter
from apps.accounts.models import User
from apps.moderation.services import hide_book, unhide_book
from apps.notes.models import Book, Category, Note, UserCategory
from apps.notes.services.books import create_book, ensure_default_categories
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
    """Canonical categories deduplicate globally while UserCategory shelves stay lazy & isolated."""
    # Unauthenticated without username gets empty list
    res = api_client.get("/api/v1/categories")
    assert res.status_code == 200
    assert res.json() == []

    # Suggested defaults return the 8 shared global defaults
    sugg = api_client.get("/api/v1/categories/suggested")
    assert sugg.status_code == 200
    sugg_names = {c["name"] for c in sugg.json()}
    assert {"Backend", "Frontend", "Database", "DevOps", "General"}.issubset(sugg_names)

    # Unauthenticated cannot create category
    assert api_client.post("/api/v1/categories", json={"name": "Rust"}).status_code == 401

    user = User.objects.create_user(username="cat_dev", github_id=8101)
    headers = _auth_client(api_client, client, user)

    # New user starts with a CLEAN desk (zero forced starter rows in user_categories!)
    res_auth = api_client.get("/api/v1/categories", headers=headers)
    assert res_auth.status_code == 200
    assert res_auth.json() == []
    assert UserCategory.objects.filter(user=user).count() == 0

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

    # Custom user category must NEVER leak into global /categories/suggested
    sugg_after = api_client.get("/api/v1/categories/suggested").json()
    assert all(c["slug"] != "distributed-systems" for c in sugg_after)

    # Case-insensitive duplicate rejected on the same user's desk
    dup = api_client.post(
        "/api/v1/categories",
        json={"name": "distributed systems"},
        headers=headers,
    )
    assert dup.status_code == 400

    # Another user creating "Distributed Systems" REUSES the exact same canonical Category row!
    user2 = User.objects.create_user(username="user_two", github_id=8102)
    headers2 = _auth_client(api_client, client, user2)
    created2 = api_client.post(
        "/api/v1/categories",
        json={"name": "Distributed Systems"},
        headers=headers2,
    )
    assert created2.status_code == 201
    assert created2.json()["id"] == cat_id
    assert Category.objects.filter(slug="distributed-systems").count() == 1

    # User1 also adds a private shelf ("Rust") that User2 does NOT have
    headers = _auth_client(api_client, client, user)
    rust_res = api_client.post("/api/v1/categories", json={"name": "Rust"}, headers=headers)
    assert rust_res.status_code == 201
    rust_id = rust_res.json()["id"]

    # User2 cannot patch or delete User1's "Rust" shelf (returns 404 to prevent existence oracle)
    headers2 = _auth_client(api_client, client, user2)
    patch_forbidden = api_client.patch(
        f"/api/v1/categories/{rust_id}",
        json={"name": "Hacked Cat"},
        headers=headers2,
    )
    assert patch_forbidden.status_code == 404

    del_forbidden = api_client.delete(
        f"/api/v1/categories/{rust_id}",
        headers=headers2,
    )
    assert del_forbidden.status_code == 404

    # User1 renames their "Distributed Systems" shelf -> "Distributed Consensus"
    # This MUST NOT mutate User2's "Distributed Systems" shelf!
    headers = _auth_client(api_client, client, user)
    patched = api_client.patch(
        f"/api/v1/categories/{cat_id}",
        json={"name": "Distributed Consensus", "description": "Raft and Paxos"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Distributed Consensus"
    assert patched.json()["slug"] == "distributed-consensus"
    consensus_id = patched.json()["id"]

    # User2 still has "Distributed Systems" untouched
    assert UserCategory.objects.filter(user=user2, category__slug="distributed-systems").exists()

    # Renaming to existing name on own desk ("Rust") rejected
    dup_rename = api_client.patch(
        f"/api/v1/categories/{consensus_id}",
        json={"name": "Rust"},
        headers=headers,
    )
    assert dup_rename.status_code == 400

    # Picking global default "Backend" when creating a book lazily links "Backend" to User1's desk
    backend_cat = Category.objects.get(slug="backend", is_default=True)
    create_book(
        author=user,
        title="Sample Book",
        category_id=backend_cat.id,
        visibility="public",
    )
    connection.close()

    # Deleting shelf containing books is rejected
    del_with_books = api_client.delete(
        f"/api/v1/categories/{backend_cat.id}",
        headers=headers,
    )
    assert del_with_books.status_code == 400

    # Deleting empty shelf succeeds (and leaves canonical Category row intact)
    del_empty = api_client.delete(
        f"/api/v1/categories/{consensus_id}",
        headers=headers,
    )
    assert del_empty.status_code == 200
    assert Category.objects.filter(id=consensus_id).exists()

    # Querying desk categories via ?username=cat_dev by user2 only shows categories with visible books
    headers2 = _auth_client(api_client, client, user2)
    desk_public = api_client.get(f"/api/v1/categories?username={user.username}", headers=headers2)
    assert desk_public.status_code == 200
    public_cats = desk_public.json()
    assert len(public_cats) == 1
    assert public_cats[0]["slug"] == "backend"
    assert public_cats[0]["book_count"] == 1

    # Owner querying own desk sees only their active shelves ("Backend" + "Rust" = 2, zero clutter)
    headers = _auth_client(api_client, client, user)
    desk_owner = api_client.get(f"/api/v1/categories?username={user.username}", headers=headers)
    assert desk_owner.status_code == 200
    assert {c["slug"] for c in desk_owner.json()} == {"backend", "rust"}


@pytest.mark.django_db(transaction=True)
def test_book_crud_chapters_sequence_and_reorder(api_client, client):
    """Books support sequential chapters, prev/next navigation, reordering, and safe detach on delete."""
    user = User.objects.create_user(username="book_dev", github_id=8103, bio="Backend engineer")
    headers = _auth_client(api_client, client, user)

    # Pick canonical global default "Backend" directly (lazily links to user's desk!)
    ensure_default_categories()
    backend_cat = Category.objects.get(slug="backend")
    connection.close()
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
    ensure_default_categories()
    cat = Category.objects.get(slug="systems")

    priv_book = create_book(
        author=owner,
        category_id=cat.id,
        title="Secret Architecture Book",
        custom_slug="secret-arch",
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
    ensure_default_categories()
    db_cat = Category.objects.get(slug="database")

    book = create_book(
        author=dev,
        category_id=db_cat.id,
        title="Redis Cluster Guide",
        custom_slug="redis-cluster-guide",
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
