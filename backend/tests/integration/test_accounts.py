import pytest
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.models import SocialAccount, SocialLogin
from django.core.exceptions import ValidationError
from django.test import RequestFactory
from django.urls import reverse

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

    with pytest.raises(ImmediateHttpResponse) as excinfo:
        adapter.pre_social_login(request, sociallogin)

    response = excinfo.value.response
    assert response.status_code == 403
    assert b"Terms of service violation" in response.content


@pytest.mark.django_db
def test_logout_post_only(client):
    """Logout endpoint only accepts POST requests."""
    user = User.objects.create_user(username="testuser", github_id=1001)
    client.force_login(user)

    # GET is rejected
    get_res = client.get(reverse("logout"))
    assert get_res.status_code == 405

    # POST succeeds and logs out
    post_res = client.post(reverse("logout"))
    assert post_res.status_code == 302
    assert post_res.url == "/"

    # Verify session is cleared
    home_res = client.get("/")
    assert not home_res.context["user"].is_authenticated


@pytest.mark.django_db
def test_settings_bio_update_and_limits(client):
    """Settings page updates bio up to 280 characters and rejects larger values."""
    user = User.objects.create_user(username="alice", github_id=1002)

    # Anonymous redirect
    anon_res = client.get(reverse("settings"))
    assert anon_res.status_code == 302
    assert "/login/" in anon_res.url

    # Authenticated get
    client.force_login(user)
    get_res = client.get(reverse("settings"))
    assert get_res.status_code == 200

    # Valid bio update
    post_res = client.post(
        reverse("settings"), {"action": "update_bio", "bio": "Writing backend systems."}
    )
    assert post_res.status_code == 302
    user.refresh_from_db()
    assert user.bio == "Writing backend systems."

    # Service rejects > 280 chars
    long_bio = "x" * 281
    with pytest.raises(ValidationError):
        update_user_bio(user, long_bio)
