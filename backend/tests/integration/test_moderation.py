import pytest
from django.contrib.admin.models import LogEntry
from django.contrib.sessions.models import Session
from django.db import connection
from django_otp.plugins.otp_totp.models import TOTPDevice

from api.rate_limit import report_rate_limiter, search_rate_limiter
from apps.accounts.models import User
from apps.moderation.models import Report
from apps.moderation.services import ban_user, hide_note
from apps.notes.services.notes import create_note


def _login_api_client(api_client, client, user):
    client.force_login(user)
    session_cookie = client.cookies["sessionid"].value
    connection.close()
    api_client.cookies.set("sessionid", session_cookie)


@pytest.mark.django_db(transaction=True)
def test_report_submission_and_duplicate_suppression(api_client, client):
    """Authenticated user can report a public note once; private notes 404."""
    report_rate_limiter.reset()
    author = User.objects.create_user(username="mod_author", github_id=9201)
    reporter = User.objects.create_user(username="mod_reporter", github_id=9202)

    pub_note = create_note(author=author, title="Public Note", content_md="hi", visibility="public")
    priv_note = create_note(author=author, title="Private Note", content_md="secret", visibility="private")

    # Anonymous -> 401
    assert (
        api_client.post("/api/v1/reports", json={"note_id": pub_note.id, "reason": "spam"}).status_code
        == 401
    )

    _login_api_client(api_client, client, reporter)
    api_client.get("/api/v1/auth/me")
    csrf = api_client.cookies.get("csrftoken")
    headers = {"X-CSRFToken": csrf}

    # Private note -> 404
    res_priv = api_client.post(
        "/api/v1/reports",
        json={"note_id": priv_note.id, "reason": "spam"},
        headers=headers,
    )
    assert res_priv.status_code == 404

    # Public note -> 201
    res_pub = api_client.post(
        "/api/v1/reports",
        json={"note_id": pub_note.id, "reason": "spam", "details": "Spam links"},
        headers=headers,
    )
    assert res_pub.status_code == 201
    assert Report.objects.filter(note=pub_note, reporter=reporter, status="open").count() == 1

    # Duplicate open report -> 400
    res_dup = api_client.post(
        "/api/v1/reports",
        json={"note_id": pub_note.id, "reason": "abuse"},
        headers=headers,
    )
    assert res_dup.status_code == 400


@pytest.mark.django_db(transaction=True)
def test_hidden_note_excluded_everywhere_except_owner(api_client, client):
    """Hidden notes return 404 to non-owners and disappear from search/backlinks, while owner sees notice."""
    search_rate_limiter.reset()
    author = User.objects.create_user(username="hide_author", github_id=9203)
    other = User.objects.create_user(username="hide_other", github_id=9204)

    note = create_note(author=author, title="Hidden Target", content_md="Body", visibility="public")
    hide_note(note, "Contains spam")

    # Anonymous / other user -> 404 on note, path, preview, and excluded from search
    assert api_client.get(f"/api/v1/notes/by-slug/{author.username}/{note.slug}").status_code == 404
    assert api_client.get(f"/api/v1/notes/{note.id}/path").status_code == 404
    assert api_client.get(f"/api/v1/notes/{note.id}/preview").status_code == 404
    assert api_client.get("/api/v1/search?q=Hidden+Target").json()["total"] == 0

    _login_api_client(api_client, client, other)
    assert api_client.get(f"/api/v1/notes/by-slug/{author.username}/{note.slug}").status_code == 404

    # Author sees note with moderation='hidden' and moderation_note
    _login_api_client(api_client, client, author)
    owner_res = api_client.get(f"/api/v1/notes/by-slug/{author.username}/{note.slug}")
    assert owner_res.status_code == 200
    assert owner_res.json()["note"]["moderation"] == "hidden"
    assert owner_res.json()["note"]["moderation_note"] == "Contains spam"


@pytest.mark.django_db(transaction=True)
def test_banned_user_sessions_invalidated_and_notes_hidden(api_client, client):
    """Banning a user invalidates all sessions and hides all their public notes."""
    search_rate_limiter.reset()
    bad_user = User.objects.create_user(username="bad_user", github_id=9205)
    pub_note = create_note(author=bad_user, title="Bad Public Note", content_md="spam", visibility="public")

    _login_api_client(api_client, client, bad_user)
    assert api_client.get("/api/v1/auth/me").json()["authenticated"] is True
    assert Session.objects.count() >= 1

    ban_user(bad_user, "Repeated spam")
    connection.close()

    # Session invalidated + get_current_user rejects banned user
    assert Session.objects.count() == 0
    assert api_client.get("/api/v1/auth/me").json()["authenticated"] is False

    # Public notes disappear from all surfaces
    assert api_client.get(f"/api/v1/notes/by-slug/{bad_user.username}/{pub_note.slug}").status_code == 404
    assert api_client.get("/api/v1/search?q=Bad+Public+Note").json()["total"] == 0


@pytest.mark.django_db
def test_admin_access_secret_path_and_totp_required(client, settings):
    """Non-staff cannot reach admin, /admin/ 404s when custom path set, and staff require TOTP."""
    from importlib import reload

    from django.urls import clear_url_caches

    from config import urls as root_urls

    orig_admin_path = settings.ADMIN_PATH
    settings.ADMIN_PATH = "admin-secret-99"
    reload(root_urls)
    clear_url_caches()

    # Default /admin/ is 404
    assert client.get("/admin/", follow=False).status_code == 404

    normal_user = User.objects.create_user(username="normie", github_id=9206)
    staff_user = User.objects.create_user(
        username="staffer",
        github_id=9207,
        is_staff=True,
        is_superuser=True,
    )
    staff_user.set_password("strong-pass-123")
    staff_user.save()

    # Non-staff redirected to login
    client.force_login(normal_user)
    res_norm = client.get("/admin-secret-99/", follow=False)
    assert res_norm.status_code == 302
    assert "/login/" in res_norm["Location"]

    # Staff without OTP verification is also redirected to OTP login
    client.force_login(staff_user)
    res_unverified = client.get("/admin-secret-99/", follow=False)
    assert res_unverified.status_code == 302
    assert "/login/" in res_unverified["Location"]

    # Staff WITH verified OTP session can access admin and log actions
    device = TOTPDevice.objects.create(user=staff_user, name="default", confirmed=True)
    session = client.session
    session["otp_device_id"] = device.persistent_id
    session.save()

    res_ok = client.get("/admin-secret-99/", follow=False)
    assert res_ok.status_code == 200
    assert b"Cairn Admin" in res_ok.content

    # Test admin hide note action with intermediate reason form logs to django_admin_log
    target_author = User.objects.create_user(username="target_a", github_id=9208)
    target_note = create_note(author=target_author, title="Abusive", content_md="bad", visibility="public")
    action_res = client.post(
        "/admin-secret-99/notes/note/",
        data={
            "action": "action_hide_notes",
            "_selected_action": [str(target_note.id)],
            "apply": "1",
            "reason": "Abusive content",
        },
        follow=False,
    )
    assert action_res.status_code == 302
    target_note.refresh_from_db()
    assert target_note.moderation == "hidden"
    assert target_note.moderation_note == "Abusive content"
    assert LogEntry.objects.filter(object_id=str(target_note.id)).exists()

    # Restore default settings.ADMIN_PATH
    settings.ADMIN_PATH = orig_admin_path
    reload(root_urls)
    clear_url_caches()
