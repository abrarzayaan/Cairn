import re
from html import escape
from urllib.parse import urlparse

import nh3
from markdown_it import MarkdownIt
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import TextLexer, get_lexer_by_name
from pygments.util import ClassNotFound
from selectolax.parser import HTMLParser

from apps.notes.markdown.plugins import (
    footnote_plugin,
    image_as_link_plugin,
    tasklist_plugin,
    wikilink_plugin,
)
from apps.notes.markdown.pygments_style import CairnStyle

ALLOWED_TAGS = {
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "em",
    "del",
    "s",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "input",
    "a",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "hr",
    "sup",
    "sub",
    "section",
    "span",
    "div",
}

ALLOWED_ATTRIBUTES = {
    "a": {"href", "class", "data-ref", "data-type", "rel", "target", "id", "title"},
    "input": {"type", "checked", "disabled"},
    "span": {"class"},
    "div": {"class"},
    "pre": {"class"},
    "code": {"class"},
    "li": {"class", "id"},
    "sup": {"class", "id"},
    "section": {"class"},
    "th": {"align", "style"},
    "td": {"align", "style"},
}

ALLOWED_URL_SCHEMES = {"http", "https", "mailto"}

_FORMATTER = HtmlFormatter(style=CairnStyle, nowrap=True)
_LANG_RE = re.compile(r"^[a-zA-Z0-9_+-]+$")


def get_pygments_css() -> str:
    """Return CSS definitions for the custom Cairn Pygments style."""
    return _FORMATTER.get_style_defs(".prose-cairn pre")


def _highlight_code(code: str, lang: str, _attrs: str) -> str:
    """Highlight fenced code block with Pygments. Never raises on unknown langs."""
    clean_lang = (lang or "").strip().split()[0] if lang else ""
    if clean_lang and _LANG_RE.match(clean_lang):
        try:
            lexer = get_lexer_by_name(clean_lang, stripall=False)
        except ClassNotFound:
            lexer = TextLexer()
    else:
        lexer = TextLexer()

    try:
        return highlight(code, lexer, _FORMATTER)
    except Exception:
        return escape(code)


def _create_md() -> MarkdownIt:
    md = MarkdownIt(
        "commonmark",
        {
            "html": False,
            "typographer": False,
            "linkify": False,
            "breaks": False,
            "highlight": _highlight_code,
        },
    )
    md.enable("table")
    md.enable("strikethrough")
    md.use(wikilink_plugin)
    md.use(image_as_link_plugin)
    md.use(tasklist_plugin)
    md.use(footnote_plugin)
    return md


_MD_ENGINE = _create_md()


def _decorate_external_links(html: str) -> str:
    """Add rel and target attributes to external http/https links."""
    if not html:
        return html

    tree = HTMLParser(html)
    changed = False
    for node in tree.css("a"):
        cls = node.attributes.get("class") or ""
        if "wikilink" in cls.split():
            continue

        href = (node.attributes.get("href") or "").strip()
        if not href or href.startswith("#") or href.startswith("/"):
            continue

        parsed = urlparse(href)
        if parsed.scheme in ("http", "https"):
            node.attrs["rel"] = "noopener noreferrer nofollow ugc"
            node.attrs["target"] = "_blank"
            changed = True

    if not changed:
        return html

    body = tree.body
    return body.html[6:-7] if body and body.html.startswith("<body>") else tree.html


def render_markdown(content_md: str) -> tuple[str, list[tuple[str, str]]]:
    """Render Markdown to sanitized HTML and extract unique wikilinks.

    Returns:
        (sanitized_html, [(target_ref, link_type), ...])
    """
    if not content_md:
        return "", []

    env: dict = {}
    raw_html = _MD_ENGINE.render(content_md, env)

    # Sanitize with nh3 allow-list (link_rel=None so our decorator sets exact rel/target)
    cleaned_html = nh3.clean(
        raw_html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=ALLOWED_URL_SCHEMES,
        link_rel=None,
        strip_comments=True,
    )

    final_html = _decorate_external_links(cleaned_html)

    raw_links: list[tuple[str, str]] = env.get("links", [])
    # Deduplicate preserving order (case-insensitive ref match per link_type)
    seen: set[tuple[str, str]] = set()
    unique_links: list[tuple[str, str]] = []
    for ref, link_type in raw_links:
        key = (ref.lower(), link_type)
        if key not in seen:
            seen.add(key)
            unique_links.append((ref, link_type))

    return final_html, unique_links
