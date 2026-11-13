import pytest
from django.db import connection

from api.rate_limit import search_rate_limiter
from apps.accounts.models import User
from apps.notes.services.notes import create_note
from apps.search.services import search_notes


def _login_api_client(api_client, client, user):
    client.force_login(user)
    session_cookie = client.cookies["sessionid"].value
    connection.close()
    api_client.cookies.set("sessionid", session_cookie)


@pytest.mark.django_db
def test_search_visibility_private_hidden_banned():
    """Private notes never leak to others; hidden and banned notes are excluded."""
    alice = User.objects.create_user(username="alice_s", github_id=9101)
    bob = User.objects.create_user(username="bob_s", github_id=9102)
    banned = User.objects.create_user(username="banned_s", github_id=9103, is_banned=True)

    create_note(
        author=alice,
        title="Public Closures",
        content_md="Lexical scope in JS",
        tags=["javascript"],
        visibility="public",
    )
    create_note(
        author=alice,
        title="Secret Closure Diary",
        content_md="secret_token_xyz",
        tags=["secret"],
        visibility="private",
    )
    hidden_note = create_note(
        author=alice,
        title="Hidden Closure",
        content_md="hidden_xyz",
        visibility="public",
    )
    hidden_note.moderation = "hidden"
    hidden_note.save(update_fields=["moderation"])

    create_note(
        author=banned,
        title="Banned Closure",
        content_md="banned_xyz",
        visibility="public",
    )

    # Anonymous viewer only sees Public Closures
    anon_res = search_notes(None, q="Closure")
    anon_titles = [r["title"] for r in anon_res["results"]]
    assert anon_titles == ["Public Closures"]

    # Bob cannot find Alice's private note by title, body, or tag
    bob_title_res = search_notes(bob, q="Secret Closure Diary")
    assert all(r["title"] != "Secret Closure Diary" for r in bob_title_res["results"])
    assert search_notes(bob, q="Secret Diary")["total"] == 0
    assert search_notes(bob, q="secret_token_xyz")["total"] == 0
    assert search_notes(bob, q="", tag="secret")["total"] == 0

    # Alice DOES see her own private note, while banned author's note is excluded
    alice_res = search_notes(alice, q="Closure")
    alice_titles = {r["title"] for r in alice_res["results"]}
    assert "Public Closures" in alice_titles
    assert "Secret Closure Diary" in alice_titles
    assert "Banned Closure" not in alice_titles


@pytest.mark.django_db
def test_search_typo_match_and_ranking():
    """Typo queries match note titles and rank title matches above body matches."""
    alice = User.objects.create_user(username="alice_typo", github_id=9104)
    create_note(
        author=alice,
        title="Unrelated Topic",
        content_md="Mentions closures once in the body.",
        visibility="public",
    )
    create_note(
        author=alice,
        title="Closures",
        content_md="Remembering lexical environments.",
        visibility="public",
    )

    # Typo query "closurs" matches "Closures"
    typo_res = search_notes(None, q="closurs")
    assert typo_res["total"] >= 1
    assert typo_res["results"][0]["title"] == "Closures"


@pytest.mark.django_db(transaction=True)
def test_search_api_filters_and_pagination(api_client, client):
    """GET /api/v1/search supports tag, author, scope, and pagination."""
    search_rate_limiter.reset()
    alice = User.objects.create_user(username="alice_api_s", github_id=9105)
    bob = User.objects.create_user(username="bob_api_s", github_id=9106)

    for i in range(5):
        create_note(
            author=alice,
            title=f"Python Tip {i}",
            content_md="Useful python note",
            tags=["python"],
            visibility="public",
        )
    create_note(
        author=alice,
        title="Alice Private Python",
        content_md="Private python",
        tags=["python"],
        visibility="private",
    )
    create_note(
        author=bob,
        title="Bob Python Note",
        content_md="Bob note",
        tags=["python"],
        visibility="public",
    )

    # Anonymous pagination with tag & author filter
    page1 = api_client.get("/api/v1/search?q=Python&tag=python&author=alice_api_s&limit=2&offset=0")
    assert page1.status_code == 200
    d1 = page1.json()
    assert d1["total"] == 5
    assert len(d1["results"]) == 2

    page2 = api_client.get("/api/v1/search?q=Python&tag=python&author=alice_api_s&limit=2&offset=2")
    assert page2.status_code == 200
    assert len(page2.json()["results"]) == 2

    # Logged-in Alice with scope=mine sees her 6 python notes (5 public + 1 private)
    _login_api_client(api_client, client, alice)
    mine_res = api_client.get("/api/v1/search?q=Python&scope=mine")
    assert mine_res.status_code == 200
    assert mine_res.json()["total"] == 6


@pytest.mark.django_db(transaction=True)
def test_home_feed_and_profile_visibility(api_client, client):
    """Home feed and profile endpoints never leak private notes to others."""
    alice = User.objects.create_user(username="alice_prof", github_id=9110, bio="Builder")
    bob = User.objects.create_user(username="bob_prof", github_id=9111)

    create_note(
        author=alice,
        title="Alice Public Guide",
        content_md="Public content",
        tags=["guide"],
        visibility="public",
    )
    create_note(
        author=alice,
        title="Alice Secret Note",
        content_md="Private content",
        tags=["secret-tag"],
        visibility="private",
    )

    # Anonymous home feed only shows public note and public tags
    anon_home = api_client.get("/api/v1/home")
    assert anon_home.status_code == 200
    home_data = anon_home.json()
    assert [n["title"] for n in home_data["recent_public"]] == ["Alice Public Guide"]
    assert [t["name"] for t in home_data["topics"]] == ["guide"]
    assert home_data["my_notes"] == []

    # Bob viewing Alice's profile only sees Alice's public note
    _login_api_client(api_client, client, bob)
    bob_prof = api_client.get("/api/v1/users/alice_prof/profile")
    assert bob_prof.status_code == 200
    assert bob_prof.json()["is_self"] is False
    assert [n["title"] for n in bob_prof.json()["notes"]] == ["Alice Public Guide"]

    # Alice viewing her own profile and home sees both
    _login_api_client(api_client, client, alice)
    alice_home = api_client.get("/api/v1/home")
    assert alice_home.status_code == 200
    assert alice_home.json()["stats"] == {"total": 2, "public": 1, "private": 1}
    alice_prof = api_client.get("/api/v1/users/alice_prof/profile")
    assert alice_prof.status_code == 200
    assert alice_prof.json()["is_self"] is True
    assert len(alice_prof.json()["notes"]) == 2
