import re
from html import escape
from urllib.parse import urlparse

from markdown_it import MarkdownIt
from markdown_it.rules_inline import StateInline
from markdown_it.token import Token

WIKILINK_PREFIXES = ("prereq:", "deep:")
FOOTNOTE_DEF_RE = re.compile(r"^\[\^([A-Za-z0-9_-]+)\]:\s*(.+)$")
FOOTNOTE_REF_RE = re.compile(r"^\[\^([A-Za-z0-9_-]+)\]")


def parse_wikilink_inner(raw: str) -> tuple[str, str, str] | None:
    """Parse raw inner text of [[...]] into (ref, link_type, label).

    Returns None if the syntax is invalid or empty.
    """
    text = raw.strip()
    if not text or "\n" in text:
        return None

    # Split optional display label: [[target|label]]
    if "|" in text:
        target_part, label_part = text.split("|", 1)
        target_part = target_part.strip()
        label = label_part.strip()
    else:
        target_part = text
        label = ""

    if not target_part:
        return None

    # Check link type prefix
    link_type = "related"
    lower_target = target_part.lower()
    for prefix in WIKILINK_PREFIXES:
        if lower_target.startswith(prefix):
            link_type = prefix[:-1]
            target_part = target_part[len(prefix) :].strip()
            break

    if not target_part or len(target_part) > 200:
        return None

    if not label:
        label = target_part

    return target_part, link_type, label


def wikilink_plugin(md: MarkdownIt) -> None:
    """Register [[...]] inline rule and renderer."""

    def wikilink_rule(state: StateInline, silent: bool) -> bool:
        pos = state.pos
        src = state.src
        max_pos = state.posMax

        if pos + 4 > max_pos or src[pos : pos + 2] != "[[":
            return False

        # Find closing ]] before newline
        close_pos = src.find("]]", pos + 2)
        if close_pos == -1 or close_pos >= max_pos:
            return False

        raw_inner = src[pos + 2 : close_pos]
        parsed = parse_wikilink_inner(raw_inner)
        if not parsed:
            return False

        if silent:
            state.pos = close_pos + 2
            return True

        ref, link_type, label = parsed

        token = state.push("wikilink", "a", 0)
        token.meta = {
            "ref": ref,
            "type": link_type,
            "label": label,
        }

        if isinstance(state.env, dict):
            links = state.env.setdefault("links", [])
            links.append((ref, link_type))

        state.pos = close_pos + 2
        return True

    def render_wikilink(self, tokens, idx, options, env):
        meta = tokens[idx].meta
        ref_esc = escape(meta["ref"], quote=True)
        type_esc = escape(meta["type"], quote=True)
        label_esc = escape(meta["label"], quote=False)
        return (
            f'<a class="wikilink" data-ref="{ref_esc}" '
            f'data-type="{type_esc}" href="#pending">{label_esc}</a>'
        )

    md.inline.ruler.before("link", "wikilink", wikilink_rule)
    md.add_render_rule("wikilink", render_wikilink)


def image_as_link_plugin(md: MarkdownIt) -> None:
    """Render ![alt](url) as a safe external link rather than an <img> tag."""

    def render_image_as_link(self, tokens, idx, options, env):
        token = tokens[idx]
        src = token.attrGet("src") or ""
        alt = token.content or ""

        # Extract alt text from child tokens if content is empty
        if not alt and token.children:
            alt = "".join(c.content for c in token.children if c.content)

        parsed = urlparse(src.strip())
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            label = escape(alt or "invalid image", quote=False)
            return f'<span class="ext-img-invalid">[{label} (blocked image)]</span>'

        href_esc = escape(src.strip(), quote=True)
        label_esc = escape(alt.strip() or src.strip(), quote=False)
        return (
            f'<a class="ext-img" href="{href_esc}" target="_blank" '
            f'rel="noopener noreferrer nofollow ugc">{label_esc} (image link)</a>'
        )

    md.add_render_rule("image", render_image_as_link)


def tasklist_plugin(md: MarkdownIt) -> None:
    """Convert [ ] and [x] list items into disabled task checkboxes."""

    def tasklist_core(state) -> None:
        tokens = state.tokens
        for i in range(2, len(tokens)):
            if tokens[i].type != "inline":
                continue
            if tokens[i - 1].type != "paragraph_open":
                continue
            if tokens[i - 2].type != "list_item_open":
                continue

            content = tokens[i].content
            if content.startswith("[ ] "):
                checked = False
                prefix_len = 4
            elif content.startswith("[x] ") or content.startswith("[X] "):
                checked = True
                prefix_len = 4
            else:
                continue

            # Mark list_item_open with task-list-item class
            li_token = tokens[i - 2]
            existing_cls = li_token.attrGet("class") or ""
            li_token.attrSet("class", f"{existing_cls} task-list-item".strip())

            # Strip "[ ] " / "[x] " from inline content and first text child
            tokens[i].content = content[prefix_len:]
            if tokens[i].children and tokens[i].children[0].type == "text":
                tokens[i].children[0].content = tokens[i].children[0].content[prefix_len:]

            checkbox = Token("html_inline", "", 0)
            checked_attr = ' checked="checked"' if checked else ""
            checkbox.content = f'<input type="checkbox" disabled="disabled"{checked_attr} /> '
            tokens[i].children.insert(0, checkbox)

    md.core.ruler.after("inline", "tasklist", tasklist_core)


def footnote_plugin(md: MarkdownIt) -> None:
    """Support [^id] footnote references and [^id]: definition blocks."""

    def footnote_block(state, start_line: int, end_line: int, silent: bool) -> bool:
        pos = state.bMarks[start_line] + state.tShift[start_line]
        max_pos = state.eMarks[start_line]
        line = state.src[pos:max_pos]

        match = FOOTNOTE_DEF_RE.match(line)
        if not match:
            return False

        if silent:
            return True

        fn_id = match.group(1)
        fn_text = match.group(2).strip()

        if isinstance(state.env, dict):
            defs = state.env.setdefault("footnote_defs", {})
            defs[fn_id] = fn_text

        state.line = start_line + 1
        return True

    def footnote_inline(state: StateInline, silent: bool) -> bool:
        pos = state.pos
        src = state.src
        if pos + 3 > state.posMax or src[pos : pos + 2] != "[^":
            return False

        match = FOOTNOTE_REF_RE.match(src[pos : state.posMax])
        if not match:
            return False

        fn_id = match.group(1)
        if isinstance(state.env, dict):
            defs = state.env.get("footnote_defs", {})
            if fn_id not in defs:
                return False

        if silent:
            state.pos += len(match.group(0))
            return True

        order = state.env.setdefault("footnote_order", [])
        if fn_id not in order:
            order.append(fn_id)
        num = order.index(fn_id) + 1

        token = state.push("footnote_ref", "", 0)
        token.meta = {"id": fn_id, "num": num}
        state.pos += len(match.group(0))
        return True

    def render_footnote_ref(self, tokens, idx, options, env):
        meta = tokens[idx].meta
        fn_id = escape(meta["id"], quote=True)
        num = meta["num"]
        return (
            f'<sup class="footnote-ref">'
            f'<a href="#fn-{fn_id}" id="fnref-{fn_id}">[{num}]</a>'
            f"</sup>"
        )

    def footnote_tail(state) -> None:
        if not isinstance(state.env, dict):
            return
        order = state.env.get("footnote_order", [])
        defs = state.env.get("footnote_defs", {})
        if not order:
            return

        items_html = []
        for fn_id in order:
            fn_id_esc = escape(fn_id, quote=True)
            text_esc = escape(defs.get(fn_id, ""), quote=False)
            items_html.append(
                f'<li id="fn-{fn_id_esc}">{text_esc} '
                f'<a href="#fnref-{fn_id_esc}" class="footnote-backref">↩</a></li>'
            )

        section = Token("html_block", "", 0)
        section.content = (
            '<section class="footnotes"><hr /><ol>'
            + "".join(items_html)
            + "</ol></section>\n"
        )
        state.tokens.append(section)

    md.block.ruler.before("reference", "footnote_def", footnote_block)
    md.inline.ruler.before("link", "footnote_ref", footnote_inline)
    md.add_render_rule("footnote_ref", render_footnote_ref)
    md.core.ruler.after("inline", "footnote_tail", footnote_tail)
