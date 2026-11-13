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

    # GET /me with session cookie
    api_client.cookies.set("sessionid", session_cookie)
    me_res = api_client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["authenticated"] is True
    assert me_res.json()["user"]["username"] == "charlie"

    # POST /api/v1/auth/bio
    bio_res = api_client.post("/api/v1/auth/bio", json={"bio": "Rust and Python enthusiast"})
    assert bio_res.status_code == 200
    assert bio_res.json()["bio"] == "Rust and Python enthusiast"

    user.refresh_from_db()
    assert user.bio == "Rust and Python enthusiast"

    # POST /api/v1/auth/logout
    logout_res = api_client.post("/api/v1/auth/logout")
    assert logout_res.status_code == 200
    assert logout_res.json()["ok"] is True
