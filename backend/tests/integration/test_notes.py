import pytest
from django.core.exceptions import ValidationError
from django.db import connection
from django.middleware.csrf import _mask_cipher_secret
from django.test import Client

from apps.accounts.models import User
from apps.notes.models import Note
from apps.notes.services.notes import (
    create_note,
    delete_note,
    get_visible_note,
    update_note,
)


@pytest.fixture
def author(db):
    return User.objects.create_user(username="author_user", github_id=101)


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username="other_user", github_id=102)


@pytest.mark.django_db
def test_create_note_service(author):
    """Test note creation, unique slugs, tag normalization, and initial revision."""
    note1 = create_note(
        author=author,
        title="JavaScript Closures",
        content_md="A closure is a function...",
        tags=["JavaScript", "Scope", "web-dev"],
        visibility="private",
    )
    assert note1.slug == "javascript-closures"
    assert note1.visibility == "private"
    assert note1.revisions.count() == 1
    assert list(note1.tags.values_list("name", flat=True)) == ["javascript", "scope", "web-dev"]

    # Duplicate slug base by same author generates unique suffixed slug
    note2 = create_note(
        author=author,
        title="JavaScript Closures!",
        content_md="Another closure note",
    )
    assert note2.slug == "javascript-closures-1"

    # Same title raises ValidationError
    with pytest.raises(ValidationError):
        create_note(
            author=author,
            title="javascript closures",
            content_md="Duplicate title",
        )


@pytest.mark.django_db
def test_create_note_validation_limits(author):
    """Test validation limits for title, content length, and tags."""
    # Empty title
    with pytest.raises(ValidationError):
        create_note(author=author, title="")

    # Title > 120 chars
    with pytest.raises(ValidationError):
        create_note(author=author, title="a" * 121)

    # Content > 100,000 chars
    with pytest.raises(ValidationError):
        create_note(author=author, title="Long content", content_md="a" * 100001)

    # More than 5 tags
    with pytest.raises(ValidationError):
        create_note(author=author, title="Too many tags", tags=["t1", "t2", "t3", "t4", "t5", "t6"])

    # Invalid tag characters
    with pytest.raises(ValidationError):
        create_note(author=author, title="Invalid tag", tags=["invalid tag with space!"])


@pytest.mark.django_db
def test_update_note_revisions_and_slug_history(author, other_user):
    """Updating content creates a revision; updating slug creates SlugHistory; cannot edit other's note."""
    note = create_note(
        author=author,
        title="Event Loop",
        content_md="Initial content",
    )
    assert note.revisions.count() == 1

    # Content change creates a new revision
    updated = update_note(
        author=author,
        note_id=note.id,
        content_md="Updated content with microtasks",
    )
    assert updated.revisions.count() == 2

    # Slug change creates SlugHistory
    update_note(
        author=author,
        note_id=note.id,
        custom_slug="js-event-loop",
    )
    assert updated.slug_history.filter(old_slug="event-loop").exists()

    # Non-owner cannot update
    with pytest.raises(Note.DoesNotExist):
        update_note(
            author=other_user,
            note_id=note.id,
            title="Hacked title",
        )


@pytest.mark.django_db
def test_delete_note_ownership(author, other_user):
    """Author can delete their note; non-owner cannot."""
    note = create_note(author=author, title="To be deleted")
    with pytest.raises(Note.DoesNotExist):
        delete_note(author=other_user, note_id=note.id)

    assert delete_note(author=author, note_id=note.id) is True
    assert not Note.objects.filter(id=note.id).exists()


@pytest.mark.django_db
def test_visibility_matrix_core(author, other_user):
    """Verify that private notes return 404 (None) to non-owners and anonymous viewers."""
    private_note = create_note(author=author, title="Secret Strategy", visibility="private")
    public_note = create_note(author=author, title="Public Guide", visibility="public")

    # Author can see own private note
    note, _ = get_visible_note(author, author.username, private_note.slug)
    assert note is not None
    assert note.id == private_note.id

    # Other signed-in user CANNOT see author's private note (returns None -> 404)
    note_other, _ = get_visible_note(other_user, author.username, private_note.slug)
    assert note_other is None

    # Anonymous viewer CANNOT see private note
    note_anon, _ = get_visible_note(None, author.username, private_note.slug)
    assert note_anon is None

    # Anyone can see public note
    note_pub, _ = get_visible_note(None, author.username, public_note.slug)
    assert note_pub is not None
    assert note_pub.id == public_note.id

    # Banned author's public note is hidden from others
    author.is_banned = True
    author.save()
    note_banned, _ = get_visible_note(other_user, author.username, public_note.slug)
    assert note_banned is None


@pytest.mark.django_db
def test_slug_history_redirect(author, other_user):
    """Accessing a note via old slug returns (note, redirected=True)."""
    note = create_note(author=author, title="Original Slug", visibility="public")
    update_note(author=author, note_id=note.id, custom_slug="renamed-slug")

    # Accessing via old slug
    found, redirected = get_visible_note(other_user, author.username, "original-slug")
    assert found is not None
    assert found.slug == "renamed-slug"
    assert redirected is True


def _get_csrf_tokens():
    raw_secret = "a" * 32
    cookie_token = _mask_cipher_secret(raw_secret)
    header_token = _mask_cipher_secret(raw_secret)
    return cookie_token, header_token


@pytest.mark.django_db(transaction=True)
def test_api_notes_crud_and_csrf(api_client, client, author, other_user):
    """Test FastAPI /api/v1/notes CRUD with CSRF protection and ownership verification."""
    client.force_login(author)
    session_cookie = client.cookies["sessionid"].value
    connection.close()

    api_client.cookies.set("sessionid", session_cookie)
    cookie_csrf, header_csrf = _get_csrf_tokens()

    # 1. Mutating POST without CSRF returns 403
    forbidden_res = api_client.post("/api/v1/notes", json={"title": "No CSRF"})
    assert forbidden_res.status_code == 403

    # 2. Mutating POST with valid CSRF creates note
    api_client.cookies.set("csrftoken", cookie_csrf)
    headers = {"X-CSRFToken": header_csrf}

    create_res = api_client.post(
        "/api/v1/notes",
        headers=headers,
        json={"title": "API Created Note", "content_md": "Body content", "visibility": "private"},
    )
    assert create_res.status_code == 201
    created_id = create_res.json()["id"]

    # 3. GET /api/v1/notes/mine
    mine_res = api_client.get("/api/v1/notes/mine")
    assert mine_res.status_code == 200
    assert any(n["id"] == created_id for n in mine_res.json())

    # 4. GET /api/v1/notes/{id} by owner succeeds
    get_res = api_client.get(f"/api/v1/notes/{created_id}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "API Created Note"

    # 5. Non-owner GET /api/v1/notes/{id} returns 404
    other_client = Client()
    other_client.force_login(other_user)
    other_session = other_client.cookies["sessionid"].value
    connection.close()

    other_api_client = type(api_client)(api_client.app)
    other_api_client.cookies.set("sessionid", other_session)

    other_get = other_api_client.get(f"/api/v1/notes/{created_id}")
    assert other_get.status_code == 404

    # 6. Non-owner PATCH returns 404
    other_api_client.cookies.set("csrftoken", cookie_csrf)
    other_patch = other_api_client.patch(
        f"/api/v1/notes/{created_id}",
        headers=headers,
        json={"title": "Hacked"},
    )
    assert other_patch.status_code == 404

    # 7. Owner PATCH succeeds
    patch_res = api_client.patch(
        f"/api/v1/notes/{created_id}",
        headers=headers,
        json={"title": "API Updated Title"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["title"] == "API Updated Title"

    # 8. Owner DELETE succeeds
    del_res = api_client.delete(f"/api/v1/notes/{created_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True
