import pytest
from django.db import connection
from django.middleware.csrf import _mask_cipher_secret
from selectolax.parser import HTMLParser

from api.rate_limit import render_rate_limiter
from apps.accounts.models import User
from apps.notes.markdown import render_markdown
from apps.notes.models import NoteLink
from apps.notes.services.links import get_backlinks, resolve_wikilinks_html
from apps.notes.services.notes import create_note, update_note


@pytest.fixture
def alice(db):
    return User.objects.create_user(username="alice", github_id=201)


@pytest.fixture
def bob(db):
    return User.objects.create_user(username="bob", github_id=202)


def _csrf_pair():
    raw = "c" * 32
    return _mask_cipher_secret(raw), _mask_cipher_secret(raw)


def test_markdown_features_and_pygments():
    """Verify tables, task lists, footnotes, strikethrough, and Pygments highlighting."""
    md = (
        "| Col1 | Col2 |\n"
        "| --- | --- |\n"
        "| A | B |\n\n"
        "- [ ] Todo item\n"
        "- [x] Done item\n\n"
        "Here is a footnote[^1] and ~~strike~~.\n\n"
        "[^1]: Footnote explanation\n\n"
        "```python\n"
        "def hello():\n"
        "    return 'world'\n"
        "```\n"
    )
    html, links = render_markdown(md)
    assert links == []
    assert "<table>" in html
    assert "<th>Col1</th>" in html
    assert 'class="task-list-item"' in html
    assert 'type="checkbox"' in html
    assert "checked" in html
    assert "<s>strike</s>" in html
    assert 'href="#fn-1"' in html
    assert "Footnote explanation" in html
    assert '<span class="k">def</span>' in html


def test_xss_corpus_and_raw_html_disabled():
    """Ensure raw HTML is escaped and dangerous XSS payloads are neutralized in DOM."""
    payloads = [
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(1)>",
        "<svg onload=alert(1)>",
        '<iframe src="https://evil.example"></iframe>',
        "[evil](javascript:alert(1))",
        "[evil](data:text/html,<script>alert(1)</script>)",
        "[[<script>alert(1)</script>]]",
        "[[Target|<img src=x onerror=alert(1)>]]",
        "![xss](javascript:alert(1))",
    ]
    for payload in payloads:
        html, _ = render_markdown(payload)
        tree = HTMLParser(html)
        for tag in ("script", "img", "svg", "iframe", "object", "embed"):
            assert tree.css(tag) == []
        for node in tree.css("*"):
            for attr, val in node.attributes.items():
                assert not attr.lower().startswith("on")
                if attr.lower() == "href" and val:
                    assert not val.strip().lower().startswith(("javascript:", "data:"))


def test_image_as_link_rule_and_external_link_attrs():
    """Images never render <img> and external links get rel/target."""
    md = "![Architecture](https://example.com/arch.png)\n\n[Docs](https://docs.example.com)"
    html, _ = render_markdown(md)

    assert "<img" not in html
    assert 'class="ext-img"' in html
    assert "Architecture (image link)" in html
    assert 'href="https://example.com/arch.png"' in html
    assert 'target="_blank"' in html
    assert 'rel="noopener noreferrer nofollow ugc"' in html


def test_wikilink_syntaxes_and_code_blocks_ignored():
    """Test all FR-L1 syntaxes and ensure code blocks/inline code are ignored."""
    md = (
        "See [[Closures]] and [[Closures|JS Closures]] and "
        "[[prereq:Scope]] and [[deep:Event Loop|Deep Dive]] and "
        "[[bob/public-guide]].\n\n"
        "Inline code `[[IgnoredInline]]` should not link.\n\n"
        "```markdown\n"
        "[[IgnoredFenced]]\n"
        "[[prereq:IgnoredPrereq]]\n"
        "```\n"
    )
    html, links = render_markdown(md)

    assert ("Closures", "related") in links
    assert ("Scope", "prereq") in links
    assert ("Event Loop", "deep") in links
    assert ("bob/public-guide", "related") in links

    # Ignored in code
    refs_lower = {r.lower() for r, _ in links}
    assert "ignoredinline" not in refs_lower
    assert "ignoredfenced" not in refs_lower
    assert "ignoredprereq" not in refs_lower

    assert 'data-ref="Scope"' in html
    assert 'data-type="prereq"' in html
    assert ">JS Closures</a>" in html
    assert ">Deep Dive</a>" in html


@pytest.mark.django_db
def test_pending_to_resolved_links_and_visibility_states(alice, bob):
    """Test pending -> resolved on note create/rename, and ok/missing/private HTML states."""
    # Alice creates a note referencing Scope (doesn't exist yet), Secret (exists private), Missing (never exists)
    secret_note = create_note(
        author=alice,
        title="Secret",
        content_md="Private details",
        visibility="private",
    )
    main_note = create_note(
        author=alice,
        title="Closures",
        content_md="Requires [[prereq:Scope]], also [[Secret]] and [[MissingNote]].",
        visibility="public",
    )

    # Before Scope exists: Scope link is pending (target is None)
    scope_link = NoteLink.objects.get(source=main_note, target_ref="Scope", link_type="prereq")
    assert scope_link.target is None

    # Render for Bob: Scope is missing, Secret is private
    html_for_bob = resolve_wikilinks_html(main_note.content_html, main_note, bob)
    assert 'data-ref="Scope"' in html_for_bob
    assert 'data-state="missing"' in html_for_bob
    assert 'data-state="private"' in html_for_bob
    assert f'data-note-id="{secret_note.id}"' not in html_for_bob

    # Render for Alice (owner): Secret is ok
    html_for_alice = resolve_wikilinks_html(main_note.content_html, main_note, alice)
    assert 'data-state="ok"' in html_for_alice
    assert f'data-note-id="{secret_note.id}"' in html_for_alice

    # Now Alice creates "Scope" -> pending link auto-resolves!
    scope_note = create_note(
        author=alice,
        title="Scope",
        content_md="Lexical scope basics.",
        visibility="public",
    )
    scope_link.refresh_from_db()
    assert scope_link.target_id == scope_note.id

    # Now Bob sees Scope as ok!
    html_for_bob_after = resolve_wikilinks_html(main_note.content_html, main_note, bob)
    assert f'href="/u/alice/{scope_note.slug}"' in html_for_bob_after
    assert f'data-note-id="{scope_note.id}"' in html_for_bob_after

    # Test auto-resolve on rename: Alice adds [[Renamed Target]] then renames another note to it
    target_other = create_note(author=alice, title="Temp Name", content_md="Hi", visibility="public")
    ref_note = create_note(author=alice, title="Caller", content_md="Link to [[Renamed Target]]")
    pending = NoteLink.objects.get(source=ref_note, target_ref="Renamed Target")
    assert pending.target is None

    update_note(author=alice, note_id=target_other.id, title="Renamed Target")
    pending.refresh_from_db()
    assert pending.target_id == target_other.id


@pytest.mark.django_db
def test_backlinks_filtering(alice, bob):
    """Backlinks only include source notes visible to the viewer."""
    target = create_note(author=alice, title="Target Note", content_md="Target", visibility="public")
    pub_source = create_note(
        author=alice,
        title="Public Source",
        content_md="Links to [[Target Note]]",
        visibility="public",
    )
    priv_source = create_note(
        author=alice,
        title="Private Source",
        content_md="Secretly links to [[Target Note]]",
        visibility="private",
    )

    alice_bls = get_backlinks(target, alice)
    assert {b["id"] for b in alice_bls} == {pub_source.id, priv_source.id}

    bob_bls = get_backlinks(target, bob)
    assert {b["id"] for b in bob_bls} == {pub_source.id}


@pytest.mark.django_db(transaction=True)
def test_api_backlinks_preview_and_render_rate_limit(api_client, client, alice, bob):
    """Test /backlinks, /preview, and /render endpoints including auth, visibility, and rate limit."""
    render_rate_limiter.reset()

    pub_target = create_note(
        author=alice,
        title="Guide",
        content_md="Main guide summary text.\n\n[[prereq:Prereq1]]",
        visibility="public",
    )
    create_note(author=alice, title="Prereq1", content_md="P1", visibility="public")
    priv_note = create_note(
        author=alice,
        title="Private Diary",
        content_md="Top secret",
        visibility="private",
    )
    create_note(
        author=alice,
        title="Referrer",
        content_md="See [[Guide]]",
        visibility="public",
    )

    # Preview on public note works for anonymous viewer
    prev_res = api_client.get(f"/api/v1/notes/{pub_target.id}/preview")
    assert prev_res.status_code == 200
    assert prev_res.json()["title"] == "Guide"
    assert prev_res.json()["prereq_count"] == 1

    # Preview on private note returns 404 to anonymous/other
    assert api_client.get(f"/api/v1/notes/{priv_note.id}/preview").status_code == 404

    # Backlinks on public note
    bl_res = api_client.get(f"/api/v1/notes/{pub_target.id}/backlinks")
    assert bl_res.status_code == 200
    assert len(bl_res.json()) == 1
    assert bl_res.json()[0]["title"] == "Referrer"

    # /render requires auth + CSRF
    assert api_client.post("/api/v1/render", json={"content_md": "# Hi"}).status_code == 401

    client.force_login(bob)
    session_cookie = client.cookies["sessionid"].value
    connection.close()

    cookie_csrf, header_csrf = _csrf_pair()
    api_client.cookies.set("sessionid", session_cookie)
    api_client.cookies.set("csrftoken", cookie_csrf)
    headers = {"X-CSRFToken": header_csrf}

    render_res = api_client.post(
        "/api/v1/render",
        headers=headers,
        json={"content_md": "# Preview\n\n[[prereq:Scope]]"},
    )
    assert render_res.status_code == 200
    assert "<h1>Preview</h1>" in render_res.json()["html"]
    assert render_res.json()["links"] == [
        {"target_ref": "Scope", "link_type": "prereq", "status": "missing"}
    ]

    # Rate limit: 30/minute/user -> 31st request returns 429
    for _ in range(29):
        ok_res = api_client.post("/api/v1/render", headers=headers, json={"content_md": "ok"})
        assert ok_res.status_code == 200

    limited_res = api_client.post("/api/v1/render", headers=headers, json={"content_md": "limit"})
    assert limited_res.status_code == 429
