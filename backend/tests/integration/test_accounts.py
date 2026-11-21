import pytest
from allauth.socialaccount.models import SocialAccount, SocialLogin
from django.core.exceptions import PermissionDenied, ValidationError
from django.test import RequestFactory

from apps.accounts.adapters import CustomSocialAccountAdapter
from apps.accounts.models import User
from apps.accounts.services import update_user_bio


@pytest.fixture
def rf():
    return RequestFactory()


@pytest.fixture
def adapter():
    return CustomSocialAccountAdapter()


@pytest.mark.django_db
def test_first_login_creates_user(rf, adapter):
    """First-time GitHub login creates a user keyed by numeric GitHub ID."""
    request = rf.get("/")
    account = SocialAccount(
        uid="12345678",
        provider="github",
        extra_data={"login": "octocat"},
    )
    user = User()
    sociallogin = SocialLogin(account=account, user=user)

    adapter.populate_user(request, sociallogin, {})
    user.save()

    saved_user = User.objects.get(github_id=12345678)
    assert saved_user.username == "octocat"
    assert saved_user.github_id == 12345678
    assert not saved_user.is_banned


@pytest.mark.django_db
def test_first_login_disambiguates_conflicting_username(rf, adapter):
    """If a new user arrives with a username already taken, a numbered suffix is used."""
    User.objects.create_user(username="octocat", github_id=1111)

    request = rf.get("/")
    account = SocialAccount(
        uid="2222",
        provider="github",
        extra_data={"login": "octocat"},
    )
    user = User()
    sociallogin = SocialLogin(account=account, user=user)

    adapter.populate_user(request, sociallogin, {})
    user.save()

    saved_user = User.objects.get(github_id=2222)
    assert saved_user.username == "octocat_1"


@pytest.mark.django_db
def test_username_sync_on_subsequent_login(rf, adapter):
    """If username changed on GitHub and is free, it syncs on login."""
    user = User.objects.create_user(username="oldname", github_id=5555)

    request = rf.get("/")
    account = SocialAccount(
        uid="5555",
        provider="github",
        extra_data={"login": "newname"},
    )
    sociallogin = SocialLogin(account=account, user=user)

    adapter.pre_social_login(request, sociallogin)

    user.refresh_from_db()
    assert user.username == "newname"


@pytest.mark.django_db
def test_username_sync_retains_if_new_username_taken(rf, adapter):
    """If username changed on GitHub but the new username is already taken, keep old username."""
    User.objects.create_user(username="taken_name", github_id=1111)
    user = User.objects.create_user(username="my_current_name", github_id=2222)

    request = rf.get("/")
    account = SocialAccount(
        uid="2222",
        provider="github",
        extra_data={"login": "taken_name"},
    )
    sociallogin = SocialLogin(account=account, user=user)

    adapter.pre_social_login(request, sociallogin)

    user.refresh_from_db()
    assert user.username == "my_current_name"


@pytest.mark.django_db
def test_banned_user_login_refused(rf, adapter):
    """Banned users cannot log in (ImmediateHttpResponse with 403 returned)."""
    User.objects.create_user(
        username="banned_dev",
        github_id=9999,
        is_banned=True,
        banned_reason="Terms of service violation",
    )

    request = rf.get("/")
    account = SocialAccount(
        uid="9999",
        provider="github",
        extra_data={"login": "banned_dev"},
    )
    sociallogin = SocialLogin(account=account, user=User())

    with pytest.raises(PermissionDenied) as excinfo:
        adapter.pre_social_login(request, sociallogin)

    assert "Terms of service violation" in str(excinfo.value)


@pytest.mark.django_db
def test_settings_bio_service_and_limits():
    """Bio service updates bio up to 280 characters and rejects larger values."""
    user = User.objects.create_user(username="alice", github_id=1002)

    # Valid bio update
    updated = update_user_bio(user, "Writing backend systems.")
    assert updated.bio == "Writing backend systems."

    # Service rejects > 280 chars
    long_bio = "x" * 281
    with pytest.raises(ValidationError):
        update_user_bio(user, long_bio)


@pytest.mark.django_db
def test_auth_api_me_anonymous(api_client):
    """Anonymous request to /api/v1/auth/me returns unauthenticated status."""
    res = api_client.get("/api/v1/auth/me")
    assert res.status_code == 200
    data = res.json()
    assert not data["authenticated"]
    assert data["user"] is None


@pytest.mark.django_db(transaction=True)
def test_auth_api_flow_authenticated(api_client, client):
    """Authenticated user can query /me and update bio through the API."""
    user = User.objects.create_user(username="charlie", github_id=5001)
    client.force_login(user)
    session_cookie = client.cookies["sessionid"].value

    from django.db import connection

    connection.close()

    # GET /me with session cookie (also issues csrftoken cookie)
    api_client.cookies.set("sessionid", session_cookie)
    me_res = api_client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["authenticated"] is True
    assert me_res.json()["user"]["username"] == "charlie"
    csrf = api_client.cookies.get("csrftoken")

    # POST /api/v1/auth/bio (requires CSRF)
    assert api_client.post("/api/v1/auth/bio", json={"bio": "No CSRF"}).status_code == 403
    bio_res = api_client.post(
        "/api/v1/auth/bio",
        json={"bio": "Rust and Python enthusiast"},
        headers={"X-CSRFToken": csrf},
    )
    assert bio_res.status_code == 200
    assert bio_res.json()["bio"] == "Rust and Python enthusiast"

    user.refresh_from_db()
    assert user.bio == "Rust and Python enthusiast"

    # POST /api/v1/auth/logout
    logout_res = api_client.post("/api/v1/auth/logout")
    assert logout_res.status_code == 200
    assert logout_res.json()["ok"] is True


@pytest.mark.django_db
def test_social_signup_open_even_when_regular_signup_closed(rf, adapter):
    """GitHub OAuth signup succeeds even though CustomAccountAdapter closes normal signup."""
    from allauth.core import context
    from allauth.socialaccount.helpers import complete_social_login
    from django.contrib.auth.models import AnonymousUser
    from django.contrib.messages.middleware import MessageMiddleware
    from django.contrib.sessions.middleware import SessionMiddleware

    from apps.accounts.adapters import CustomAccountAdapter

    req = rf.get("/accounts/github/login/callback/")
    SessionMiddleware(lambda r: None).process_request(req)
    req.session.save()
    MessageMiddleware(lambda r: None).process_request(req)
    req.user = AnonymousUser()

    assert CustomAccountAdapter().is_open_for_signup(req) is False

    sl = SocialLogin(
        user=User(),
        account=SocialAccount(
            provider="github",
            uid="909090",
            extra_data={"login": "new_gh_user", "id": 909090},
        ),
    )
    adapter.populate_user(req, sl, {"username": "new_gh_user"})
    assert adapter.is_open_for_signup(req, sl) is True

    with context.request_context(req):
        res = complete_social_login(req, sl)

    assert res.status_code == 302
    assert User.objects.filter(github_id=909090, username="new_gh_user").exists()


@pytest.mark.django_db
def test_github_oauth_post_only_pkce_and_zero_scope(client, settings):
    """GitHub OAuth requires POST+CSRF (no Login CSRF), enables PKCE S256, and requests zero scope."""
    from urllib.parse import parse_qs, urlparse

    assert settings.SOCIALACCOUNT_LOGIN_ON_GET is False
    assert settings.SOCIALACCOUNT_STORE_TOKENS is False
    assert settings.SOCIALACCOUNT_PROVIDERS["github"]["SCOPE"] == []
    assert settings.SOCIALACCOUNT_PROVIDERS["github"]["OAUTH_PKCE_ENABLED"] is True

    # Ensure a test client_id is configured so allauth builds the authorize URL
    settings.SOCIALACCOUNT_PROVIDERS = {
        "github": {
            "SCOPE": [],
            "OAUTH_PKCE_ENABLED": True,
            "APP": {"client_id": "test-client-id", "secret": "test-secret", "key": ""},
        }
    }

    # GET must render styled Cairn confirmation page (200), NOT redirect directly to GitHub (blocks Login CSRF)
    get_res = client.get("/accounts/github/login/")
    assert get_res.status_code == 200
    assert "github.com/login/oauth/authorize" not in (get_res.headers.get("Location") or "")
    assert "/static/css/auth.css" in get_res.content.decode("utf-8")
    assert "Public profile only" in get_res.content.decode("utf-8")

    # Stylesheet itself must be served (200 text/css) via WhiteNoise
    css_res = client.get("/static/css/auth.css")
    assert css_res.status_code == 200
    assert "text/css" in (css_res.headers.get("Content-Type") or "")

    # POST initiates OAuth redirect with PKCE code_challenge & zero scope
    post_res = client.post("/accounts/github/login/")
    assert post_res.status_code == 302
    loc = post_res.headers["Location"]
    parsed = urlparse(loc)
    qs = parse_qs(parsed.query)
    assert parsed.netloc == "github.com"
    assert "code_challenge" in qs
    assert qs.get("code_challenge_method") == ["S256"]
    assert "repo" not in (qs.get("scope", [""])[0])
    assert "read:user" not in (qs.get("scope", [""])[0])


@pytest.mark.django_db(transaction=True)
def test_logout_all_devices_revokes_all_sessions(api_client, client):
    """POST /api/v1/auth/logout-all requires CSRF and invalidates all active sessions."""
    from django.contrib.sessions.models import Session
    from django.db import connection
    from django.test import Client

    user = User.objects.create_user(username="multi_dev", github_id=5099)

    # Create two separate active sessions for the same user
    client.force_login(user)
    s1 = client.cookies["sessionid"].value
    client2 = Client()
    client2.force_login(user)
    s2 = client2.cookies["sessionid"].value
    connection.close()

    assert Session.objects.filter(session_key__in=[s1, s2]).count() == 2

    api_client.cookies.set("sessionid", s1)
    me_res = api_client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    csrf = api_client.cookies.get("csrftoken")

    # Without CSRF -> 403
    assert api_client.post("/api/v1/auth/logout-all").status_code == 403

    # With CSRF -> 200 and both server-side sessions are deleted
    res = api_client.post("/api/v1/auth/logout-all", headers={"X-CSRFToken": csrf})
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert res.json()["revoked"] >= 2
    assert Session.objects.filter(session_key__in=[s1, s2]).count() == 0
