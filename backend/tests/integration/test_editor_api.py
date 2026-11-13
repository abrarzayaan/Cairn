import pytest
from django.db import connection

from apps.accounts.models import User
from apps.notes.services.notes import create_note, update_note


def _login_api_client(api_client, client, user):
    client.force_login(user)
    session_cookie = client.cookies["sessionid"].value
    connection.close()
    api_client.cookies.set("sessionid", session_cookie)


@pytest.mark.django_db(transaction=True)
def test_titles_autocomplete_own_notes_only(api_client, client):
    """GET /api/v1/titles returns only the authenticated user's own notes."""
    alice = User.objects.create_user(username="alice_ed", github_id=9001)
    bob = User.objects.create_user(username="bob_ed", github_id=9002)

    create_note(author=alice, title="Closures", content_md="A", visibility="public")
    create_note(author=alice, title="Closure Pitfalls", content_md="B", visibility="private")
    create_note(author=bob, title="Closures in Rust", content_md="C", visibility="public")

    # Unauthenticated -> 401
    assert api_client.get("/api/v1/titles?q=Clos").status_code == 401

    _login_api_client(api_client, client, alice)
    res = api_client.get("/api/v1/titles?q=clos")
    assert res.status_code == 200
    titles = [item["title"] for item in res.json()]
    assert "Closures" in titles
    assert "Closure Pitfalls" in titles
    assert "Closures in Rust" not in titles


@pytest.mark.django_db(transaction=True)
def test_editor_links_status_and_cycle_warnings(api_client, client):
    """Editor save and /render return link statuses and cycle warnings."""
    alice = User.objects.create_user(username="alice_links", github_id=9003)
    create_note(author=alice, title="Scope", content_md="S", visibility="public")
    create_note(author=alice, title="Memory", content_md="M", visibility="private")

    _login_api_client(api_client, client, alice)
    # Ensure csrftoken cookie is set via /auth/me
    me_res = api_client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    csrf = api_client.cookies.get("csrftoken")
    assert csrf

    # /render returns resolved, private, missing
    render_res = api_client.post(
        "/api/v1/render",
        json={
            "content_md": "[[prereq:Scope]] [[deep:Memory]] [[Hoisting]]",
        },
        headers={"X-CSRFToken": csrf},
    )
    assert render_res.status_code == 200
    links = render_res.json()["links"]
    status_by_ref = {link["target_ref"]: link["status"] for link in links}
    assert status_by_ref["Scope"] == "resolved"
    assert status_by_ref["Memory"] == "private"
    assert status_by_ref["Hoisting"] == "missing"

    # Create a cycle: Note A <-> Note B
    a_res = api_client.post(
        "/api/v1/notes",
        json={"title": "Cycle A", "content_md": "[[prereq:Cycle B]]", "visibility": "public"},
        headers={"X-CSRFToken": csrf},
    )
    assert a_res.status_code == 201
    b_res = api_client.post(
        "/api/v1/notes",
        json={"title": "Cycle B", "content_md": "[[prereq:Cycle A]]", "visibility": "public"},
        headers={"X-CSRFToken": csrf},
    )
    assert b_res.status_code == 201
    b_data = b_res.json()
    assert any("cycle" in w.lower() for w in b_data["cycle_warnings"])


@pytest.mark.django_db(transaction=True)
def test_revisions_endpoints_owner_only(api_client, client):
    """Revision list and detail endpoints are strictly owner-only."""
    alice = User.objects.create_user(username="alice_rev", github_id=9004)
    bob = User.objects.create_user(username="bob_rev", github_id=9005)

    note = create_note(author=alice, title="Rev Note", content_md="v1 content", visibility="public")
    update_note(author=alice, note_id=note.id, content_md="v2 content")

    # Anonymous -> 401
    assert api_client.get(f"/api/v1/notes/{note.id}/revisions").status_code == 401

    # Non-owner -> 404
    _login_api_client(api_client, client, bob)
    assert api_client.get(f"/api/v1/notes/{note.id}/revisions").status_code == 404

    # Owner -> 200 and can view individual revision
    _login_api_client(api_client, client, alice)
    list_res = api_client.get(f"/api/v1/notes/{note.id}/revisions")
    assert list_res.status_code == 200
    revs = list_res.json()
    assert len(revs) >= 2

    oldest_id = revs[-1]["id"]
    detail_res = api_client.get(f"/api/v1/notes/{note.id}/revisions/{oldest_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["content_md"] == "v1 content"

    # Bob cannot read the revision detail either
    _login_api_client(api_client, client, bob)
    assert api_client.get(f"/api/v1/notes/{note.id}/revisions/{oldest_id}").status_code == 404
