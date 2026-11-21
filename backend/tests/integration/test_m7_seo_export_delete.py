import io
import zipfile

import pytest

from apps.accounts.models import User
from apps.moderation.models import Report
from apps.moderation.services import ban_user, create_report, hide_book, hide_note
from apps.notes.models import (
    Book,
    Note,
    NoteLink,
    NoteRevision,
    SlugHistory,
    UserCategory,
)
from apps.notes.services.books import create_book, create_category
from apps.notes.services.notes import create_note, update_note


def _login_api_client(api_client, django_client, user: User) -> str:
    """Log user into Django test client and transfer session + CSRF cookie to FastAPI TestClient."""
    from django.db import connection

    django_client.force_login(user)
    session_cookie = django_client.cookies["sessionid"].value
    connection.close()
    api_client.cookies.set("sessionid", session_cookie)
    me_res = api_client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    csrf_token = api_client.cookies.get("csrftoken")
    assert csrf_token
    return csrf_token


@pytest.mark.django_db(transaction=True)
def test_sitemap_includes_only_published_non_hidden_unbanned_content(api_client):
    """T7.4: /api/v1/seo/sitemap returns only published, non-hidden, unbanned books & notes."""
    alice = User.objects.create_user(username="alice_seo", github_id=7101)
    banned = User.objects.create_user(username="banned_seo", github_id=7102)

    cat_a = create_category(alice, name="Backend")
    cat_b = create_category(banned, name="BannedCat")

    # Published book + published chapter (SHOULD appear)
    pub_book = create_book(
        alice,
        title="Published Book",
        category_id=cat_a.id,
        visibility="public",
        is_published=True,
    )
    pub_chapter = create_note(
        alice,
        title="Published Chapter",
        content_md="Hello world",
        visibility="public",
        is_published=True,
        book_id=pub_book.id,
        sequence=1,
    )

    # Standalone published note (SHOULD appear)
    pub_standalone = create_note(
        alice,
        title="Published Standalone",
        content_md="Standalone doc",
        visibility="public",
        is_published=True,
    )

    # Public-only (unpublished) book & note (MUST NOT appear)
    desk_book = create_book(
        alice,
        title="Desk Only Book",
        category_id=cat_a.id,
        visibility="public",
        is_published=False,
    )
    create_note(
        alice,
        title="Desk Only Note",
        content_md="Profile only",
        visibility="public",
        is_published=False,
    )

    # Private book & note (MUST NOT appear)
    priv_book = create_book(
        alice,
        title="Private Book",
        category_id=cat_a.id,
        visibility="private",
        is_published=False,
    )
    create_note(
        alice,
        title="Private Note",
        content_md="Secret",
        visibility="private",
        is_published=False,
    )

    # Hidden published book & note (MUST NOT appear)
    hidden_book = create_book(
        alice,
        title="Hidden Book",
        category_id=cat_a.id,
        visibility="public",
        is_published=True,
    )
    hide_book(hidden_book, "Moderation test")

    hidden_note = create_note(
        alice,
        title="Hidden Note",
        content_md="Hidden content",
        visibility="public",
        is_published=True,
    )
    hide_note(hidden_note, "Moderation test")

    # Banned user's published book & note (MUST NOT appear)
    banned_book = create_book(
        banned,
        title="Banned Book",
        category_id=cat_b.id,
        visibility="public",
        is_published=True,
    )
    create_note(
        banned,
        title="Banned Note",
        content_md="From banned user",
        visibility="public",
        is_published=True,
        book_id=banned_book.id,
    )
    ban_user(banned, "Spam")

    from django.db import connection

    connection.close()

    res = api_client.get("/api/v1/seo/sitemap")
    assert res.status_code == 200
    data = res.json()

    note_paths = {item["path"] for item in data["notes"]}
    book_paths = {item["path"] for item in data["books"]}

    assert book_paths == {f"/u/{alice.username}/books/{pub_book.slug}"}
    assert note_paths == {
        f"/u/{alice.username}/{pub_chapter.slug}",
        f"/u/{alice.username}/{pub_standalone.slug}",
    }
    assert f"/u/{alice.username}/books/{desk_book.slug}" not in book_paths
    assert f"/u/{alice.username}/books/{priv_book.slug}" not in book_paths


@pytest.mark.django_db(transaction=True)
def test_export_notes_zip_requires_auth_and_exports_all_own_notes(api_client, client):
    """T7.6: GET /api/v1/auth/export returns ZIP of all own notes with front matter."""
    # Unauthenticated request rejected
    anon_res = api_client.get("/api/v1/auth/export")
    assert anon_res.status_code == 401

    alice = User.objects.create_user(username="alice_exp", github_id=7201)
    bob = User.objects.create_user(username="bob_exp", github_id=7202)

    cat = create_category(alice, name="Systems")
    book = create_book(
        alice,
        title="OS Internals",
        category_id=cat.id,
        visibility="public",
        is_published=True,
    )
    create_note(
        alice,
        title="Virtual Memory",
        content_md="# Virtual Memory\nPages and frames.",
        tags=["os", "memory"],
        visibility="public",
        is_published=True,
        book_id=book.id,
        sequence=1,
    )
    create_note(
        alice,
        title="Private Scratchpad",
        content_md="Secret draft thoughts.",
        tags=["draft"],
        visibility="private",
        is_published=False,
    )
    # Bob's note must NOT appear in Alice's export
    create_note(
        bob,
        title="Bob Public Note",
        content_md="Not Alice's note.",
        visibility="public",
        is_published=True,
    )

    _login_api_client(api_client, client, alice)
    res = api_client.get("/api/v1/auth/export")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/zip"
    assert f'cairn-{alice.username}-export.zip' in res.headers["content-disposition"]

    with zipfile.ZipFile(io.BytesIO(res.content), "r") as zf:
        names = set(zf.namelist())
        assert "books/os-internals/01-virtual-memory.md" in names
        assert "notes/private-scratchpad.md" in names
        assert len(names) == 2

        vm_md = zf.read("books/os-internals/01-virtual-memory.md").decode("utf-8")
        assert 'title: "Virtual Memory"' in vm_md
        assert 'visibility: "public"' in vm_md
        assert "is_published: true" in vm_md
        assert 'book: "OS Internals"' in vm_md
        assert "sequence: 1" in vm_md
        assert '["os", "memory"]' in vm_md
        assert "# Virtual Memory\nPages and frames." in vm_md

        priv_md = zf.read("notes/private-scratchpad.md").decode("utf-8")
        assert 'visibility: "private"' in priv_md
        assert "Secret draft thoughts." in priv_md


@pytest.mark.django_db(transaction=True)
def test_delete_account_with_confirmation_removes_all_owned_data(api_client, client):
    """T7.7: POST /api/v1/auth/delete-account removes user, books, categories, notes, revisions, links, reports."""
    alice = User.objects.create_user(username="alice_del", github_id=7301)
    bob = User.objects.create_user(username="bob_del", github_id=7302)

    cat = create_category(alice, name="Algorithms")
    book = create_book(
        alice,
        title="Graph Theory",
        category_id=cat.id,
        visibility="public",
        is_published=True,
    )
    note_a = create_note(
        alice,
        title="BFS",
        content_md="Links to [[DFS]]",
        visibility="public",
        is_published=True,
        book_id=book.id,
        sequence=1,
    )
    # Trigger a revision and slug history entry
    update_note(alice, note_a.id, content_md="Updated [[DFS]]", custom_slug="bfs-traversal")

    # Bob has a public note that links to Alice's note, and Alice reports Bob's note
    bob_note = create_note(
        bob,
        title="Bob Guide",
        content_md=f"See [[{alice.username}/bfs-traversal]]",
        visibility="public",
        is_published=True,
    )
    report = create_report(
        reporter=alice,
        note_id=bob_note.id,
        reason="other",
        details="Test report filed by Alice",
    )

    csrf = _login_api_client(api_client, client, alice)

    # Missing CSRF rejected
    no_csrf_res = api_client.post(
        "/api/v1/auth/delete-account",
        json={"confirm_username": alice.username},
    )
    assert no_csrf_res.status_code == 403

    # Wrong username confirmation rejected
    bad_confirm_res = api_client.post(
        "/api/v1/auth/delete-account",
        json={"confirm_username": "wrong_name"},
        headers={"X-CSRFToken": csrf},
    )
    assert bad_confirm_res.status_code == 400
    assert User.objects.filter(id=alice.id).exists()

    # Exact username confirmation succeeds
    ok_res = api_client.post(
        "/api/v1/auth/delete-account",
        json={"confirm_username": alice.username},
        headers={"X-CSRFToken": csrf},
    )
    assert ok_res.status_code == 200
    assert ok_res.json() == {"ok": True}

    # Verify all of Alice's data is permanently gone (canonical Category stays intact)
    assert not User.objects.filter(id=alice.id).exists()
    assert not UserCategory.objects.filter(user_id=alice.id).exists()
    assert not Book.objects.filter(author_id=alice.id).exists()
    assert not Note.objects.filter(author_id=alice.id).exists()
    assert not NoteRevision.objects.filter(note_id=note_a.id).exists()
    assert not SlugHistory.objects.filter(author_id=alice.id).exists()
    assert not Report.objects.filter(id=report.id).exists()

    # Bob's data remains intact, and Bob's link to Alice's deleted note gracefully became pending (target=None)
    assert User.objects.filter(id=bob.id).exists()
    assert Note.objects.filter(id=bob_note.id).exists()
    bob_link = NoteLink.objects.get(source_id=bob_note.id)
    assert bob_link.target_id is None
