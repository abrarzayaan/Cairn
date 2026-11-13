# DESIGN: Devbook

The goal of this design: a developer opens it and thinks "someone who writes code built this", not "a template generated this". Calm, dense, readable, keyboard-first. Closer to a good documentation site or a well-made terminal tool than to a SaaS landing page.

Implementation: **handwritten CSS with custom properties. No Tailwind, no Bootstrap, no component library.** See RULES.md.

---

## 1. Principles

1. **Reading comes first.** The note is the product. Everything else stays out of its way.
2. **Dense but calm.** Compact spacing, clear hierarchy, nothing shouting.
3. **Looks hand-built.** Few colors, real typography, borders instead of shadows, specific copy.
4. **Keyboard first.** Every frequent action has a shortcut. The mouse is optional.
5. **Nothing decorative.** If an element does not help reading, writing, or finding, remove it.
6. **State is visible.** Public/private, missing links, and cycles are always visible, never hidden in a tooltip only.

## 2. What to avoid (the "AI template" tells)

Do not use any of these:

- Gradients (backgrounds, text, buttons, borders)
- Glow, neon, glassmorphism, blur backdrops
- Drop shadows deeper than none. Use 1px borders.
- Large rounded corners (`rounded-xl`, `2xl`) and pill buttons
- Purple, indigo, or "electric blue" accent colors
- Emoji as icons, or icons inside colored circles
- A centered hero with two buttons and a floating mockup
- A three-card "features" grid with icons
- Stock illustrations, abstract blobs, 3D shapes
- Marketing words: *supercharge, unlock, seamless, effortless, revolutionize, next-gen, empower*
- Animated counters, scroll animations, testimonial carousels
- Uniform 24px padding on everything
- Skeleton loaders everywhere (use them only if a load truly takes time)
- Toast notifications for routine actions (use inline text)

## 3. Visual identity

- **Wordmark:** `devbook` in the mono font, lowercase, weight 600. No logo mark in V1.
- **Feel:** a printed technical handbook. Warm paper background, ink-dark text, one rust accent.
- **Corners:** 3px on controls, 0 on content blocks. Nothing larger.
- **Lines:** 1px solid borders. Section breaks use a border, not extra whitespace.
- **Icons:** almost none. Use text labels. Where an icon is unavoidable (external link, copy), use a tiny inline SVG, 14px, `currentColor`, 1.5px stroke.

## 4. Color

Defined as CSS custom properties on `:root`. Dark values override under `[data-theme="dark"]`, and by `prefers-color-scheme` when no theme is set.

### Light

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#FBFAF7` | Page background (paper) |
| `--bg-subtle` | `#F3F1EB` | Code blocks, sidebars, hover rows |
| `--bg-inset` | `#ECE9E1` | Pressed state, inline code |
| `--border` | `#DDD9CF` | All lines |
| `--border-strong` | `#BDB8AB` | Input borders, focus context |
| `--text` | `#1C1B19` | Body text |
| `--text-muted` | `#6A665C` | Meta text, labels |
| `--accent` | `#B4492A` | Links, active item, focus ring |
| `--accent-bg` | `#F5E6DF` | Selection, highlighted row |
| `--ok` | `#2F6B3B` | Resolved / public |
| `--warn` | `#8F6200` | Cycle warning |
| `--danger` | `#A3281F` | Delete, errors |

### Dark

| Token | Value |
|-------|-------|
| `--bg` | `#161513` |
| `--bg-subtle` | `#1E1D1A` |
| `--bg-inset` | `#272521` |
| `--border` | `#34322D` |
| `--border-strong` | `#4B4841` |
| `--text` | `#E8E5DC` |
| `--text-muted` | `#9A9589` |
| `--accent` | `#E38460` |
| `--accent-bg` | `#33231D` |
| `--ok` | `#6DB27B` |
| `--warn` | `#D9A441` |
| `--danger` | `#E0675D` |

Rules:
- Text on `--bg` must meet 4.5:1 contrast. Verify after any change.
- Never convey meaning by color alone. Pair with a word or symbol.
- The accent is used for links, the active nav item, the focus ring, and selection. Not for big surfaces and not for buttons.

## 5. Typography

| Role | Font | Fallback |
|------|------|----------|
| UI, headings | **IBM Plex Sans** | `system-ui, sans-serif` |
| Reading body (note content) | **Source Serif 4** | `Georgia, serif` |
| Code, wordmark, tags, meta labels | **IBM Plex Mono** | `ui-monospace, Menlo, Consolas, monospace` |

- Fonts are **self-hosted** woff2 (no Google Fonts request: privacy and CSP).
- Subset to Latin plus Bengali if Bangla notes are expected. For Bengali glyphs add `"Noto Sans Bengali"` / `"Noto Serif Bengali"` self-hosted as fallbacks.
- `font-display: swap`.

### Scale (px)

| Token | Size / line height | Use |
|-------|--------------------|-----|
| `--fs-xs` | 12 / 16 | Meta, mono labels |
| `--fs-sm` | 13 / 18 | Sidebar, tags, table cells |
| `--fs-base` | 14 / 20 | UI text |
| `--fs-read` | 17 / 28 | Note body |
| `--fs-h3` | 18 / 26 | Note H3 |
| `--fs-h2` | 22 / 30 | Note H2 |
| `--fs-h1` | 30 / 38 | Note title |

- Headings: Plex Sans, weight 600, letter-spacing `-0.01em`.
- Note body: max width **68ch**.
- Inline code: mono 0.9em, `--bg-inset` background, 1px padding, no border.
- No all-caps headings. Small mono labels may be uppercase with letter-spacing `0.04em`.

## 6. Spacing and layout

- Base unit **4px**. Scale: 4, 8, 12, 16, 24, 32, 48.
- Top bar height **44px**, sticky, 1px bottom border.
- Page uses a documentation-style layout, not a centered marketing column.

### Note page (desktop, 1100px and up)

```
+--------------------------------------------------------------------------+
| devbook   [ Search notes...                    Ctrl K ]   New    @rahim  |
+--------------------------------------------------------------------------+
| rahim / notes        | Read first                       | On this page   |
|                      |  1. Variables                    |  What it is    |
| #javascript (12)     |  2. Scope                        |  Example       |
|   Variables          |  Full path ->                    |  Common bugs   |
|   Scope              | ---------------------------------|                |
|   Closures   <       |                                  | Linked from    |
|   Hoisting           | Closures            [public]     |  Hooks         |
| #react (7)           | updated 3 days ago  #javascript  |  Currying      |
|   Hooks              |                                  |                |
|   State              | A closure is a function that     |                |
|                      | remembers the variables around   |                |
|  240px               | it...   (68ch max)               |  220px         |
+----------------------+----------------------------------+----------------+
```

- Left column: the author's notes grouped by first tag. Own notes when it is your page, otherwise the author's public notes. Collapsible.
- Center: content, max 68ch.
- Right: "On this page" (headings) and "Linked from" (backlinks).
- Below 1100px the right column moves under the content. Below 760px the left column becomes a drawer opened by a text button `Notes`. "Read first" always stays on top of the content.

## 7. Pages

### 7.1 Home (signed out)

No hero. A short statement, a search box, and real content.

```
devbook

Linked notes for developers.
Write what you learn. Link what depends on what.

[ Sign in with GitHub ]

[ Search notes...                                    ]

Recently updated                    Topics
------------------------------      ------------------
Closures            rahim  2d       javascript   42
Event loop          rahim  3d       python       31
Big-O basics        sara   5d       sql          18
...                                 ...
```

- "Recently updated" is a plain list: title, author, relative date. Public notes only.
- Footer: one line. `About · Source · Terms · Privacy`.

### 7.2 Note view

See the layout above. Elements:

- **Title** (H1), then a meta line in mono: `public · updated 12 Nov 2026 · #javascript #scope`.
- **Visibility** shown as the word `public` or `private` in the meta line. Private is shown with the `--warn` color text.
- **Read first box** (only if the note has prerequisites). A bordered block, not a colored callout.
  - Ordered list of up to 5 notes, nearest prerequisite last.
  - `Full path ->` link opens the path page.
  - Missing prerequisite shows as muted with `(not written yet)`.
- **Body**: rendered Markdown.
- **Footer**: `Revisions (4) · Report · Copy link`. Edit/Delete only for the owner.

### 7.3 Reading path page

```
Path to: Closures

 1. Variables
 2. Functions
 3. Scope
 4. Closures                      <- you are here

Warnings
 - "Hoisting" is a private note and is not expanded.
```

Plain numbered list, mono numbers. Each item shows its author when it is not the same as the current note's author.

### 7.4 Editor

```
+--------------------------------------------------------------------------+
| < Closures                                  Saved 12:04     [Preview] Save |
+--------------------------------------------+-----------------------------+
|  # Closures                                | Title    [Closures        ] |
|                                            | Slug     [closures        ] |
|  A closure is a function that remembers    | Tags     [javascript scope] |
|  [[prereq:Scope]] ...                      | Visibility                  |
|                                            |  ( ) Private  (x) Public    |
|  (CodeMirror, mono, 15px)                  |                             |
|                                            | Links found (3)             |
|                                            |  prereq  Scope     resolved |
|                                            |  related Hoisting  missing  |
|                                            |  deep    Memory    private  |
+--------------------------------------------+-----------------------------+
```

- Editor is CodeMirror 6 with Markdown mode. Typing `[[` opens an autocomplete of the user's note titles; `prereq:` and `deep:` are suggested.
- `Preview` toggles the editor area to the rendered note (same typography as the real page).
- Save with Ctrl/Cmd+S. Status text `Saved 12:04` or `Unsaved changes`. No toasts.
- Leaving with unsaved changes asks the browser's native confirm.
- Cycle in prerequisites: inline warning line under "Links found" in `--warn`.

### 7.4.1 Editor shortcuts

| Key | Action |
|-----|--------|
| Ctrl/Cmd+S | Save |
| Ctrl/Cmd+K | Search |
| Ctrl/Cmd+Enter | Save and view |
| Ctrl/Cmd+P | Toggle preview |
| `[[` | Open link autocomplete |

### 7.5 Search palette

```
+--------------------------------------------------+
| > closure                                        |
+--------------------------------------------------+
|  Closures                 rahim  #javascript     |
|  Closures in loops        sara   #javascript     |
|  Memory model             you    private         |
|                                                  |
|  Enter open   Up/Down move   Esc close           |
+--------------------------------------------------+
```

- Centered modal, 560px wide, 1px border, no shadow, `--bg` background over a 40% black overlay.
- Results: title, author (`you` for own), first tag or `private`. Max 8. Matched characters shown in `--accent-bg`.
- Footer line shows keys in mono.

### 7.6 Profile

```
rahim                                   github.com/rahim
Frontend developer. Learning backend.   Joined Mar 2026

42 public notes   ·   12 topics

Topics:  #javascript 14   #react 9   #sql 7   #git 6

Notes
Closures                     #javascript    12 Nov 2026
Event loop                   #javascript    09 Nov 2026
...
```

- No avatar in V1 (text only). Username in mono.
- Notes list is a table-like list sorted by updated date; filter by tag via the topic row.
- Phase 3: a 53x7 grid of 10px squares (heatmap) between the counts and the topic row, 5 levels from `--bg-inset` to `--accent`.

### 7.7 Settings

Three sections stacked, each separated by a border: Profile (bio), Export data, Delete account. Delete requires typing the username.

### 7.8 Admin panel

Django admin. Light customization only: site title `devbook admin`, same fonts via an extra CSS file, list filters and actions as described in ARCHITECTURE.md. Do not rebuild the admin UI.

## 8. Components

### Buttons
- Height 32px, padding `0 12px`, 3px radius, 1px border `--border-strong`, `--bg` background.
- **Primary** = solid `--text` background with `--bg` text. Not the accent color.
- **Danger** = text `--danger`, border `--danger`; fills only on hover.
- Hover: `--bg-subtle`. Active: `--bg-inset`. No transitions longer than 80ms.

### Inputs
- Height 32px, 1px border `--border-strong`, 3px radius, `--bg`.
- Focus: 2px outline `--accent`, offset 1px. Never remove outlines.
- Label above the input in `--fs-sm`, `--text-muted`.

### Tags
- Rendered as mono text with a `#` prefix, no background, no pill: `#javascript`. Clickable, hover underline.

### Link types (in Markdown output)
| Type | Marker after the link | Style |
|------|-----------------------|-------|
| related | none | accent color, solid underline on hover |
| prereq | `req` in mono `--fs-xs` superscript | same as related |
| deep | `deep` in mono `--fs-xs` superscript | same as related |
| missing | none | `--text-muted`, dashed underline, title "Not written yet" |
| private | none | `--text-muted`, no underline, text replaced by "Private note" |

### Hover preview
- 320px wide, 1px border, `--bg`, 12px padding. Title, then ~200 chars, then `N prerequisites` if any.
- Appears after 250ms, hides on mouse leave or Esc. Not shown on touch devices.

### Code blocks
- `--bg-subtle`, 1px border, 0 radius, 14px mono, horizontal scroll. Language label top right in `--fs-xs`.
- `Copy` text button appears on hover/focus. Changes to `Copied` for 1.5s.
- Syntax colors: restrained palette from the existing tokens (accent for keywords, `--ok` for strings, `--text-muted` for comments). Generated with Pygments using a custom style.

### Callouts / blockquote
- Blockquote: 2px left border `--border-strong`, padding-left 16px, `--text-muted`. No background, no icon.

### Tables
- 1px horizontal borders only, header in Plex Sans 600, cell padding `6px 10px`, horizontal scroll wrapper on small screens.

### Empty states
One plain sentence and one action. Examples:
- No notes: `You have no notes yet. Write one.` with a primary `New note` button.
- No results: `Nothing matches "closur". Try fewer words.`

### Errors
Inline, near the field, in `--danger`, specific: `Title must be 120 characters or fewer.` Not "Something went wrong".

## 9. Copy tone

Plain, direct, lowercase where natural, no hype.

| Instead of | Write |
|------------|-------|
| Welcome back! 🎉 | (nothing) |
| Unlock your learning potential | Linked notes for developers. |
| Oops! Something went wrong | Could not save. Check your connection and try again. |
| Awesome! Your note was created | Saved 12:04 |
| Get started for free | Sign in with GitHub |

## 10. Motion

- Almost none. Allowed: 80ms background change on hover, instant modal open.
- Respect `prefers-reduced-motion` (nothing to disable if nothing moves).

## 11. Accessibility

- Semantic HTML: `header`, `nav`, `main`, `aside`, `article`, headings in order.
- Skip link `Skip to content` first in the tab order.
- Visible focus on every interactive element.
- Search palette: `role="dialog"`, `aria-modal`, focus trap, results `role="listbox"`.
- Link-type markers have `aria-label` ("prerequisite").
- Minimum click target 32px height on desktop, 40px on touch.
- Works at 200% zoom without horizontal scroll (except code and tables).

## 12. Responsive rules

| Width | Layout |
|-------|--------|
| 1100+ | 3 columns |
| 760-1099 | Left column + content; right column content stacked below |
| under 760 | Single column; drawer for notes list; search palette full width |

## 13. Dark mode

- Follow `prefers-color-scheme` by default; manual toggle in the footer and settings (`light / dark / system`), stored in a cookie so the server renders the right theme with no flash.

## 14. Definition of "design done"

- [ ] No item in section 2 appears anywhere
- [ ] All pages work at 360px, 768px, 1280px
- [ ] Light and dark pass contrast checks
- [ ] Whole app usable with keyboard only
- [ ] Reading a 2,000-word note feels like reading a book page, not a web app
- [ ] A developer friend, asked "does this look AI-made?", says no
