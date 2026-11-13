import pytest

from apps.accounts.models import User
from apps.notes.services.notes import create_note
from apps.notes.services.paths import build_reading_path, get_direct_prerequisites


@pytest.fixture
def author(db):
    return User.objects.create_user(username="path_author", github_id=301)


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username="path_viewer", github_id=302)


@pytest.mark.django_db
def test_reading_path_linear_chain(author, other_user):
    """Variables -> Scope -> Closures -> Hooks produces exact topological order."""
    create_note(author=author, title="Variables", content_md="Base vars", visibility="public")
    create_note(
        author=author,
        title="Scope",
        content_md="Needs [[prereq:Variables]]",
        visibility="public",
    )
    create_note(
        author=author,
        title="Closures",
        content_md="Needs [[prereq:Scope]]",
        visibility="public",
    )
    hooks = create_note(
        author=author,
        title="Hooks",
        content_md="Needs [[prereq:Closures]]",
        visibility="public",
    )

    result = build_reading_path(hooks, other_user)
    assert result["has_cycle"] is False
    assert result["warnings"] == []
    assert [s["title"] for s in result["steps"]] == [
        "Variables",
        "Scope",
        "Closures",
        "Hooks",
    ]
    assert result["steps"][-1]["is_root"] is True


@pytest.mark.django_db
def test_reading_path_diamond_and_alphabetical_tie_break(author, other_user):
    """Diamond dependency graph breaks ties alphabetically by title."""
    create_note(author=author, title="Base", content_md="Foundation", visibility="public")
    create_note(
        author=author,
        title="Zebra",
        content_md="Needs [[prereq:Base]]",
        visibility="public",
    )
    create_note(
        author=author,
        title="Alpha",
        content_md="Needs [[prereq:Base]]",
        visibility="public",
    )
    top = create_note(
        author=author,
        title="Top",
        content_md="Needs [[prereq:Zebra]] and [[prereq:Alpha]]",
        visibility="public",
    )

    result = build_reading_path(top, other_user)
    assert result["has_cycle"] is False
    assert [s["title"] for s in result["steps"]] == ["Base", "Alpha", "Zebra", "Top"]


@pytest.mark.django_db
def test_reading_path_cycle_detection(author):
    """Cycles are detected, reported as warnings, and non-cycle prerequisites still sort."""
    create_note(author=author, title="Foundation", content_md="Base", visibility="public")
    a = create_note(
        author=author,
        title="Node A",
        content_md="Needs [[prereq:Foundation]] and [[prereq:Node B]]",
        visibility="public",
    )
    create_note(
        author=author,
        title="Node B",
        content_md="Needs [[prereq:Node A]]",
        visibility="public",
    )

    result = build_reading_path(a, author)
    assert result["has_cycle"] is True
    assert any("Cycle detected:" in w for w in result["warnings"])
    assert [s["title"] for s in result["steps"]] == ["Foundation"]


@pytest.mark.django_db
def test_reading_path_missing_and_private_middle_no_leak(author, other_user):
    """Missing targets become placeholders; private middle node hides title and stops expansion."""
    create_note(
        author=author,
        title="Hidden Leaf",
        content_md="Behind private node",
        visibility="public",
    )
    create_note(
        author=author,
        title="Secret Middle",
        content_md="Needs [[prereq:Hidden Leaf]]",
        visibility="private",
    )
    top = create_note(
        author=author,
        title="Public Top",
        content_md="Needs [[prereq:Secret Middle]] and [[prereq:Unwritten Concept]]",
        visibility="public",
    )

    # Non-owner view: Secret Middle is anonymized and Hidden Leaf is NOT expanded
    viewer_res = build_reading_path(top, other_user)
    titles = [s["title"] for s in viewer_res["steps"]]
    assert "Hidden Leaf" not in titles
    assert "Secret Middle" not in titles
    assert "Private note" in titles
    assert "Unwritten Concept" in titles
    assert titles[-1] == "Public Top"

    priv_node = next(s for s in viewer_res["steps"] if s["status"] == "private")
    assert priv_node["slug"] is None
    assert priv_node["author_username"] is None

    missing_node = next(s for s in viewer_res["steps"] if s["status"] == "missing")
    assert missing_node["title"] == "Unwritten Concept"

    # Owner view: sees everything including Hidden Leaf and Secret Middle
    owner_res = build_reading_path(top, author)
    owner_titles = [s["title"] for s in owner_res["steps"]]
    assert owner_titles == ["Hidden Leaf", "Secret Middle", "Unwritten Concept", "Public Top"]


@pytest.mark.django_db
def test_reading_path_limits_depth_and_nodes(author):
    """Verify max_depth and max_nodes truncation limits produce warnings."""
    create_note(author=author, title="Step 1", content_md="1", visibility="public")
    create_note(author=author, title="Step 2", content_md="[[prereq:Step 1]]", visibility="public")
    create_note(author=author, title="Step 3", content_md="[[prereq:Step 2]]", visibility="public")
    step4 = create_note(
        author=author, title="Step 4", content_md="[[prereq:Step 3]]", visibility="public"
    )

    depth_limited = build_reading_path(step4, author, max_depth=2, max_nodes=200)
    assert any("limit" in w.lower() for w in depth_limited["warnings"])
    assert [s["title"] for s in depth_limited["steps"]] == ["Step 2", "Step 3", "Step 4"]

    node_limited = build_reading_path(step4, author, max_depth=20, max_nodes=2)
    assert any("limit" in w.lower() for w in node_limited["warnings"])
    assert len(node_limited["steps"]) == 2


@pytest.mark.django_db(transaction=True)
def test_reading_path_api_endpoints(api_client, author, other_user):
    """Test /notes/{id}/path, /notes/by-slug/{u}/{s}/path, and direct_prereqs on note detail."""
    base = create_note(author=author, title="Base Concept", content_md="Base", visibility="public")
    priv = create_note(author=author, title="Private Prereq", content_md="Priv", visibility="private")
    top = create_note(
        author=author,
        title="Main Note",
        content_md="[[prereq:Base Concept]] [[prereq:Private Prereq]]",
        visibility="public",
    )

    # Direct prerequisites helper
    direct = get_direct_prerequisites(top, other_user)
    assert len(direct) == 2
    assert direct[0]["title"] == "Base Concept"
    assert direct[1]["status"] == "private"
    assert direct[1]["title"] == "Private note"

    # Detail endpoint includes direct_prereqs
    detail_res = api_client.get(f"/api/v1/notes/by-slug/{author.username}/{top.slug}")
    assert detail_res.status_code == 200
    assert len(detail_res.json()["direct_prereqs"]) == 2

    # Path by ID and by slug
    path_res = api_client.get(f"/api/v1/notes/{top.id}/path")
    assert path_res.status_code == 200
    assert [s["title"] for s in path_res.json()["steps"]] == [
        "Base Concept",
        "Private note",
        "Main Note",
    ]

    slug_path_res = api_client.get(f"/api/v1/notes/by-slug/{author.username}/{top.slug}/path")
    assert slug_path_res.status_code == 200
    assert slug_path_res.json()["root"]["id"] == top.id

    # Private root returns 404 to anonymous viewer
    assert api_client.get(f"/api/v1/notes/{priv.id}/path").status_code == 404
    assert api_client.get(f"/api/v1/notes/by-slug/{author.username}/{priv.slug}/path").status_code == 404
    assert base.id is not None
