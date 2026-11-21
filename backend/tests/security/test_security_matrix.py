import logging

import pytest
from django.db import connection
from selectolax.parser import HTMLParser

from api.rate_limit import (
    SlidingWindowRateLimiter,
    global_ip_rate_limiter,
    render_rate_limiter,
    report_rate_limiter,
    search_rate_limiter,
    write_rate_limiter,
)
from apps.accounts.models import User
from apps.moderation.services import ban_user, hide_note
from apps.notes.markdown import render_markdown
from apps.notes.services.books import create_book, create_category
from apps.notes.services.notes import create_note, update_note


def _login(api_client, django_client, user: User) -> str:
    django_client.force_login(user)
    session_cookie = django_client.cookies["sessionid"].value
    connection.close()
    api_client.cookies.set("sessionid", session_cookie)
    res = api_client.get("/api/v1/auth/me")
    assert res.status_code == 200
    return api_client.cookies.get("csrftoken") or ""


@pytest.fixture(autouse=True)
def _reset_limiters():
    """Ensure rate limit buckets are clean before every security test."""
    for limiter in (
        search_rate_limiter,
        write_rate_limiter,
        render_rate_limiter,
        report_rate_limiter,
        global_ip_rate_limiter,
    ):
        limiter.reset()


@pytest.fixture
def security_world():
    """Create users A (owner), B (other signed-in), and notes P (private), Q (public desk), R (published)."""
    alice = User.objects.create_user(username="sec_alice", github_id=8801)
    bob = User.objects.create_user(username="sec_bob", github_id=8802)

    priv_cat = create_category(alice, name="SecretVault")
    priv_book = create_book(
        alice,
        title="Secret Book",
        category_id=priv_cat.id,
        visibility="private",
        is_published=False,
    )

    # R: published public note
    note_r = create_note(
        alice,
        title="Public Target R",
        content_md="Public foundation note.",
        tags=["publictag"],
        visibility="public",
        is_published=True,
    )

    # P: private note inside private book, linking to R
    note_p = create_note(
        alice,
        title="UltraPrivateNoteP",
        content_md="Contains topsecret_canary_999 and links to [[Public Target R]].",
        tags=["secrettag"],
        visibility="private",
        is_published=False,
        book_id=priv_book.id,
        sequence=1,
    )

    # Q: public (unpublished desk-only) note linking to P as prerequisite
    note_q = create_note(
        alice,
        title="DeskNoteQ",
        content_md="Requires [[prereq:UltraPrivateNoteP]] before reading.",
        tags=["desktag"],
        visibility="public",
        is_published=False,
    )

    connection.close()
    return {
        "alice": alice,
        "bob": bob,
        "priv_cat": priv_cat,
        "priv_book": priv_book,
        "P": note_p,
        "Q": note_q,
        "R": note_r,
    }


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("viewer_role", ["anon", "bob"])
def test_private_leak_matrix(api_client, client, security_world, viewer_role):
    """SECURITY_CHECK.md section 4: Neither anon nor another user B learns anything about private note P."""
    alice = security_world["alice"]
    bob = security_world["bob"]
    note_p = security_world["P"]
    note_q = security_world["Q"]
    note_r = security_world["R"]
    priv_cat = security_world["priv_cat"]

    if viewer_role == "bob":
        _login(api_client, client, bob)
    else:
        api_client.cookies.clear()

    # 1. Direct note slug & ID endpoints must return 404 (or 401 on owner-only editor endpoint for anon)
    assert api_client.get(f"/api/v1/notes/by-slug/{alice.username}/{note_p.slug}").status_code == 404
    assert api_client.get(f"/api/v1/notes/by-slug/{alice.username}/{note_p.slug}/path").status_code == 404
    assert api_client.get(f"/api/v1/notes/{note_p.id}/path").status_code == 404
    assert api_client.get(f"/api/v1/notes/{note_p.id}/preview").status_code == 404
    assert api_client.get(f"/api/v1/notes/{note_p.id}/backlinks").status_code == 404

    expected_owner_only = 404 if viewer_role == "bob" else 401
    assert api_client.get(f"/api/v1/notes/{note_p.id}").status_code == expected_owner_only
    assert api_client.get(f"/api/v1/notes/{note_p.id}/revisions").status_code == expected_owner_only

    # 2. Search by title, unique content canary, and tag must not reveal P or unpublished Q
    for query in ("UltraPrivateNoteP", "topsecret_canary_999", "DeskNoteQ"):
        res = api_client.get("/api/v1/search", params={"q": query, "scope": "all"})
        assert res.status_code == 200
        body = res.text
        assert "UltraPrivateNoteP" not in body
        assert "topsecret_canary_999" not in body
        assert "DeskNoteQ" not in body

    tag_res = api_client.get("/api/v1/search", params={"tag": "secrettag", "scope": "all"})
    assert tag_res.status_code == 200
    assert tag_res.json()["total"] == 0

    # 3. Profile /u/alice must not include P, private book, or private-only category SecretVault
    prof_res = api_client.get(f"/api/v1/users/{alice.username}/profile")
    assert prof_res.status_code == 200
    prof_text = prof_res.text
    assert "UltraPrivateNoteP" not in prof_text
    assert "SecretVault" not in prof_text
    assert "Secret Book" not in prof_text
    # DeskNoteQ IS visible on profile (public desk), Public Target R IS visible
    assert "DeskNoteQ" in prof_text
    assert "Public Target R" in prof_text

    # 4. Backlinks on R must NOT reveal P
    bl_res = api_client.get(f"/api/v1/notes/{note_r.id}/backlinks")
    assert bl_res.status_code == 200
    assert "UltraPrivateNoteP" not in bl_res.text

    # 5. Rendered Q replaces link to P with "Private note" (no title, no href to P)
    q_res = api_client.get(f"/api/v1/notes/by-slug/{alice.username}/{note_q.slug}")
    assert q_res.status_code == 200
    q_data = q_res.json()
    assert "UltraPrivateNoteP" not in q_data["note"]["content_html"]
    assert note_p.slug not in q_data["note"]["content_html"]
    assert "Private note" in q_data["note"]["content_html"]

    # 6. Reading path for Q shows placeholder "Private note" and does NOT expand to R through P
    path_res = api_client.get(f"/api/v1/notes/by-slug/{alice.username}/{note_q.slug}/path")
    assert path_res.status_code == 200
    path_data = path_res.json()
    assert "UltraPrivateNoteP" not in path_res.text
    assert "Public Target R" not in path_res.text
    assert any(step["status"] == "private" and step["title"] == "Private note" for step in path_data["steps"])

    # 7. Sitemap contains ONLY published R (neither private P nor unpublished Q)
    sm_res = api_client.get("/api/v1/seo/sitemap")
    assert sm_res.status_code == 200
    sm_paths = {item["path"] for item in sm_res.json()["notes"]}
    assert f"/u/{alice.username}/{note_r.slug}" in sm_paths
    assert f"/u/{alice.username}/{note_p.slug}" not in sm_paths
    assert f"/u/{alice.username}/{note_q.slug}" not in sm_paths

    # 8. Non-owner cannot modify/delete Alice's personal category
    if viewer_role == "bob":
        csrf = api_client.cookies.get("csrftoken") or ""
        del_cat = api_client.delete(
            f"/api/v1/categories/{priv_cat.id}",
            headers={"X-CSRFToken": csrf},
        )
        assert del_cat.status_code == 404


@pytest.mark.django_db(transaction=True)
def test_visibility_flip_hidden_and_ban_take_effect_immediately(api_client, client, security_world):
    """SECURITY_CHECK.md section 4: Public->Private flip, moderator hide, and ban hide content immediately."""
    alice = security_world["alice"]
    note_q = security_world["Q"]
    note_r = security_world["R"]

    # Q is initially visible to anon
    assert api_client.get(f"/api/v1/notes/by-slug/{alice.username}/{note_q.slug}").status_code == 200

    # Flip Q -> private
    update_note(alice, note_q.id, visibility="private")
    connection.close()
    assert api_client.get(f"/api/v1/notes/by-slug/{alice.username}/{note_q.slug}").status_code == 404

    # Moderator hides R -> 404 to anon, visible with moderation_note to owner
    hide_note(note_r, "Spam content")
    connection.close()
    assert api_client.get(f"/api/v1/notes/by-slug/{alice.username}/{note_r.slug}").status_code == 404

    _login(api_client, client, alice)
    owner_r = api_client.get(f"/api/v1/notes/by-slug/{alice.username}/{note_r.slug}")
    assert owner_r.status_code == 200
    assert owner_r.json()["note"]["moderation"] == "hidden"
    assert owner_r.json()["note"]["moderation_note"] == "Spam content"

    # Ban Alice -> all public notes vanish for anon
    note_r.moderation = "ok"
    note_r.save(update_fields=["moderation"])
    ban_user(alice, "Abuse")
    connection.close()
    api_client.cookies.clear()
    assert api_client.get(f"/api/v1/notes/by-slug/{alice.username}/{note_r.slug}").status_code == 404
    assert api_client.get(f"/api/v1/users/{alice.username}/profile").status_code == 404


XSS_CORPUS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "![x](javascript:alert(1))",
    "<svg onload=alert(1)>",
    '<a href="x" onmouseover="alert(1)">x</a>',
    "[[<script>alert(1)</script>]]",
    '[[prereq:"><img src=x onerror=alert(1)>]]',
    "```py\nx = 1\n```\n<script>alert(2)</script>",
    '<iframe src="//evil.example"></iframe>',
]


@pytest.mark.parametrize("payload", XSS_CORPUS)
def test_xss_corpus_rendered_inert(payload):
    """SECURITY_CHECK.md section 6: Every XSS payload renders as inert text or safe link."""
    html, _ = render_markdown(payload)
    tree = HTMLParser(html)

    # 1. No dangerous tags anywhere in the parsed DOM
    for forbidden_tag in ("script", "iframe", "svg", "img", "object", "embed", "style"):
        assert tree.css(forbidden_tag) == [], f"Forbidden <{forbidden_tag}> found in {html}"

    # 2. No inline event handlers (on*) or unsafe URL schemes on any element
    for node in tree.css("*"):
        for attr_name, attr_val in (node.attributes or {}).items():
            name_low = attr_name.lower()
            val_low = (attr_val or "").strip().lower()
            assert not name_low.startswith("on"), f"Event handler {attr_name} found in {html}"
            if name_low in ("href", "src", "action"):
                assert not val_low.startswith("javascript:"), f"javascript: URL found in {html}"
                assert not val_low.startswith("data:"), f"data: URL found in {html}"
                assert not val_low.startswith("vbscript:"), f"vbscript: URL found in {html}"


@pytest.mark.django_db(transaction=True)
def test_csrf_required_on_mutating_endpoints(api_client, client):
    """SECURITY_CHECK.md section 7: Mutating API calls without X-CSRFToken return 403."""
    alice = User.objects.create_user(username="csrf_alice", github_id=8901)
    _login(api_client, client, alice)

    res = api_client.post(
        "/api/v1/notes",
        json={"title": "No CSRF", "content_md": "hello", "visibility": "private"},
    )
    assert res.status_code == 403
    assert res.json()["detail"]["error"]["code"] == "csrf_missing"


@pytest.mark.django_db(transaction=True)
def test_security_headers_and_no_secret_leak_in_logs(api_client, client, caplog):
    """SECURITY_CHECK.md section 8 & T10.6: Security headers present and logs never leak secrets/content."""
    alice = User.objects.create_user(username="log_alice", github_id=8902)
    csrf = _login(api_client, client, alice)
    secret_body = "SUPER_SECRET_NOTE_BODY_XYZ_777"

    with caplog.at_level(logging.INFO, logger="cairn.api"):
        res = api_client.post(
            "/api/v1/notes",
            json={"title": "Log Check", "content_md": secret_body, "visibility": "private"},
            headers={"X-CSRFToken": csrf},
        )

    assert res.status_code == 201
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "camera=()" in (res.headers.get("permissions-policy") or "")
    assert res.headers.get("cache-control") == "private, no-store"
    assert res.headers.get("x-request-id")

    combined_logs = "\n".join(record.getMessage() for record in caplog.records)
    assert secret_body not in combined_logs
    assert csrf not in combined_logs
    assert (api_client.cookies.get("sessionid") or "___") not in combined_logs


def test_rate_limiter_enforces_429():
    """T10.3: SlidingWindowRateLimiter raises HTTP 429 once limit is exceeded."""
    limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=60, namespace="test")
    limiter.check("user:1")
    limiter.check("user:1")
    limiter.check("user:1")

    with pytest.raises(Exception) as exc_info:
        limiter.check("user:1")
    assert getattr(exc_info.value, "status_code", None) == 429
