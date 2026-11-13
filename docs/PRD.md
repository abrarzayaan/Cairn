# PRD: Cairn

Status: Draft v1
Scope of this document: **V1 only**. Anything not listed in V1 is in "Future" and must not be built yet.

---

## 1. One-line summary

A developer documentation and book platform where every developer organizes their technical docs into Books/Documents under their own personal Categories (their "desk"), with chapters ordered in a clear sequence and cross-linked with wikilinks. Books and notes can be Private, Public (visible on their profile), or Published (discoverable in global search).

## 2. Problem

1. **Revision is slow.** When a developer needs to quickly re-learn a topic, their notes are scattered across Notion pages, text files, bookmarks, and videos. Search is weak and context is missing.
2. **Concept gaps.** Teachers and tutorials explain a topic assuming the reader already knows the underlying concepts. If one concept is unclear, the whole topic stays unclear, and the learner does not know which concept is missing.
3. **No order.** Notes are flat. A new reader does not know where to start or what comes next.
4. **Learning is invisible.** A developer who studies consistently has no good way to show it. GitHub shows code, not learning.

## 3. Product vision

> A documentation-first knowledge book platform for developers: organize your desk with personal categories and books, order chapters in a clean learning sequence, link concepts, keep drafts private, share on your profile, or publish to global discovery.

## 4. Goals (V1)

| # | Goal | How we know |
|---|------|-------------|
| G1 | Fast revision: find any note in seconds | Search opens a note in under 3 keystrokes after typing |
| G2 | Concept chain: any term can lead to its own note | Notes with at least one link / total notes |
| G3 | Automatic reading order from prerequisite links | Path page works on a real dataset (author's own notes) |
| G4 | Public notes act as a learning portfolio | Public profile exists and is shareable |
| G5 | Private by default, safe by design | Zero private-content leaks in the security test suite |

## 5. Non-goals (V1)

These are deliberately out. Do not build them.

- Anonymous accounts / aliases
- Questions and answers, comments, replies
- Star ratings, reputation, badges
- Follow, feed, likes, notifications
- Image upload (text only)
- Spaced repetition, mastery levels
- AI features
- Teams, paid plans, payments
- Mobile app
- Real-time collaboration

## 6. Users

**Primary: the learner-developer.** Student or working developer (beginner to mid-level), uses GitHub daily, writes notes in Markdown, wants to revise before interviews or when switching stacks.

**Secondary: the reader.** Anyone who lands on a public note from a link or search. May not have an account. Wants to read, follow links, and see the reading order.

**Admin.** The project owner (and later moderators). Handles reports and abuse.

## 7. User stories

### Accounts
- **US-01** As a developer, I can sign in with GitHub so I do not manage another password.
- **US-02** As a user, I can sign out.
- **US-03** As a user, I can delete my account and all my notes.
- **US-04** As a user, I can export all my notes as Markdown files.

### Writing
- **US-10** As a user, I can create a note with a title and Markdown content.
- **US-11** As a user, I can edit and delete my notes.
- **US-12** As a user, I can mark a book or note as Private, Public (profile-only), or Published (globally searchable). New items are Private.
- **US-13** As a user, I can add up to 5 tags to a note.
- **US-14** As a user, I can see the previous versions of a note and their timestamps.

### Linking
- **US-20** As a user, I can write `[[Note Title]]` to link to another note.
- **US-21** As a user, I can mark a link as `prereq:`, `related` (default), or `deep:`.
- **US-22** As a user, I can link to a note that does not exist yet, and the link becomes active when I create it.
- **US-23** As a reader, I can hover a link to see a short preview.
- **US-24** As a reader, I can see which notes link to the current note (backlinks).
- **US-25** As a reader, I can open "Reading path" for a note and see an ordered list of prerequisites to read first.

### Finding
- **US-30** As a user, I can press Cmd/Ctrl+K and search my own notes/books (`scope=mine`) and globally **published** books, notes, and profiles (`scope=all`).
- **US-31** As a user, I can filter search by tag and by author (and by personal category within my workspace or a user's profile).
- **US-32** As a user, when I search a topic globally, I see both published documents on that topic and the profiles of authors who published them.

### Public profile
- **US-40** As a visitor, I can open `/u/<github-username>` (their "desk") and see that developer's personal categories, public and published books/notes, and tags.
- **US-41** As a user, I can write a short bio.

### Safety
- **US-50** As a reader, I can report a public note.
- **US-51** As an admin, I can review reports, hide a note, and ban a user.

## 8. Functional requirements

Priority: **M** = must (V1 blocker), **S** = should (V1 if time), **C** = could (cut first).

### 8.1 Accounts and auth

| ID | Requirement | Pri |
|----|-------------|-----|
| FR-A1 | Sign in only with GitHub OAuth. No email/password for normal users. | M |
| FR-A2 | On first login create the user keyed by GitHub numeric ID. Store GitHub username (as `username`). | M |
| FR-A3 | On each login, sync `username` if GitHub username changed and the new one is free. | M |
| FR-A4 | Request the minimum OAuth scope (`read:user`). Do not store the GitHub access token. | M |
| FR-A5 | Banned users cannot sign in and their public notes are hidden. | M |
| FR-A6 | Account deletion permanently removes user, notes, revisions, links, reports they filed. Requires typing the username to confirm. | M |
| FR-A7 | Export: ZIP of `.md` files with front matter (title, tags, visibility, dates). | S |

### 8.2 Notes

| ID | Requirement | Pri |
|----|-------------|-----|
| FR-N1 | Title required, 1 to 120 characters. | M |
| FR-N2 | Slug generated from the title, unique per author, editable. | M |
| FR-N3 | Content is Markdown, max 100,000 characters. | M |
| FR-N4 | Visibility & Publish: `visibility` is `public` or `private` (default `private`); `is_published` is boolean (default `false`). Only `public` items can be `published`; switching to `private` forces `is_published = false`. | M |
| FR-N5 | Up to 5 tags, lowercase, `a-z0-9-`, max 30 chars each. | M |
| FR-N6 | Every save that changes content creates a revision with timestamp. | M |
| FR-N7 | Changing the slug keeps old URLs working through redirects. | S |
| FR-N8 | Delete is permanent after a confirm step. | M |
| FR-N9 | Markdown supports: headings, lists, task lists, tables, code blocks with highlighting, blockquotes, footnotes, inline code, links. | M |
| FR-N10 | Raw HTML in Markdown is not allowed (escaped). | M |
| FR-N11 | Images are never embedded. `![alt](url)` renders as a link: `alt (image link)`. Opens in a new tab on click. Only `http` and `https`. | M |

### 8.3 Linking

| ID | Requirement | Pri |
|----|-------------|-----|
| FR-L1 | Link syntax: `[[Title]]`, `[[Title\|label]]`, `[[prereq:Title]]`, `[[deep:Title]]`, `[[username/slug]]` for other authors' public notes. | M |
| FR-L2 | Links are parsed on save and stored as rows (source, target, type). | M |
| FR-L3 | Resolution order for `[[Title]]`: author's own note by title (case-insensitive), then by slug. | M |
| FR-L4 | Unresolved links are stored as pending and show as "missing". They auto-resolve when a matching note is created or renamed. | M |
| FR-L5 | Rendered link states: resolved, missing, private (viewer cannot access). | M |
| FR-L6 | Backlinks show only sources the viewer is allowed to see. | M |
| FR-L7 | Hover preview (title + first ~200 chars) only for notes the viewer can see. | S |
| FR-L8 | The editor shows detected links with their type and status. | S |
| FR-L9 | The editor warns if a prerequisite link creates a cycle. | S |

### 8.4 Reading path

| ID | Requirement | Pri |
|----|-------------|-----|
| FR-R1 | Note page shows "Read first": direct prerequisites. | M |
| FR-R2 | `/u/<user>/<slug>/path` shows the full ordered list: prerequisites first, current note last. | M |
| FR-R3 | Order is a topological sort of prerequisite links. Ties sorted by title. | M |
| FR-R4 | Cycles are detected and shown as a warning; the page still renders the rest. | M |
| FR-R5 | Path never reveals titles or existence of notes the viewer cannot access. They appear as "Private note" and the traversal does not continue through them. | M |
| FR-R6 | Limits: depth 20, nodes 200. | M |

### 8.5 Search

| ID | Requirement | Pri |
|----|-------------|-----|
| FR-S1 | Cmd/Ctrl+K opens a search palette on every page. | M |
| FR-S2 | Global search (`scope=all`) searches only **published** books and chapters/notes (`visibility=public` AND `is_published=true`) plus developer profiles matching either username/bio or those published topics. Title matches rank higher. | M |
| FR-S3 | Signed-in users (`scope=mine`) see all of their own books and notes (`private`, `public`, and `published`), clearly labeled with their state. | M |
| FR-S4 | Typo tolerance on titles (trigram similarity). | S |
| FR-S5 | Full results page `/search?q=` with type (`books`, `notes`, `users`), tag, and author filters. | M |
| FR-S6 | Keyboard: arrows to move, Enter to open, Esc to close. | M |

### 8.5.1 Books, Personal Categories, and Sequential Docs

| ID | Requirement | Pri |
|----|-------------|-----|
| FR-B1 | Categories are **user-scoped** (not global). Each user creates and manages their own personal categories (with starter categories seeded for new accounts) to organize books on their desk. | M |
| FR-B2 | Each Book has a Context / Table of Contents page (`/u/<user>/books/<book>`) listing chapters in explicit sequence. | M |
| FR-B3 | When creating a note/chapter, the author chooses their personal Category, Book, and chapter sequence position (or creates a new Category / Book inline). | M |
| FR-B4 | Owners can reorder chapters within a Book (`sequence`). | M |
| FR-B5 | Documentation reader displays the Book's sequential chapter sidebar, "On this page" heading outline, and Previous / Next chapter navigation. | M |
| FR-B6 | A private or hidden Book hides all of its chapters from non-owners (404 everywhere). A `public` (unpublished) Book/Note is accessible on the author's profile and direct URL, but excluded from Global Search and Home feeds. | M |

### 8.6 Profile

| ID | Requirement | Pri |
|----|-------------|-----|
| FR-P1 | `/u/<username>` acts as the developer's desk: lists their personal categories (containing visible public/published books), public and published books/notes, updated dates, and tag counts. | M |
| FR-P2 | Bio: plain text, max 280 characters. | M |
| FR-P3 | Link to the user's GitHub profile. | M |
| FR-P4 | Activity heatmap and streak (from revision timestamps). | C (Phase 3) |

### 8.7 Moderation and admin

| ID | Requirement | Pri |
|----|-------------|-----|
| FR-M1 | Report button on public notes: reason (spam, abuse, copyright, other) + optional text (max 500). | M |
| FR-M2 | Django admin panel at a non-default secret path, staff only, with 2FA (TOTP). | M |
| FR-M3 | Admin can: list/filter reports, hide a note (with reason), unhide, ban/unban a user, delete a note. | M |
| FR-M4 | All admin actions are logged (who, what, when). | M |
| FR-M5 | A note hidden by moderators shows the author a notice with the reason. | S |

### 8.8 General

| ID | Requirement | Pri |
|----|-------------|-----|
| FR-G1 | Public note pages are server-rendered with title, meta description, canonical URL. | M |
| FR-G2 | `sitemap.xml` and `robots.txt` list only `published` (`visibility=public` + `is_published=true`), non-hidden notes and books. | S |
| FR-G3 | Light and dark theme following system setting, with manual toggle. | S |
| FR-G4 | Fully usable on a phone screen (reading). Editing works but is not optimised. | M |
| FR-G5 | Custom 404 and 500 pages. | M |

## 9. Visibility & Publish rules (the important table)

A note or book has two access dimensions: `visibility` (`private` | `public`) and `is_published` (`false` | `true`, only allowed when `public`). Together they decide who can see **the item and where it is discovered**.

| Surface | Published (`public` + `is_published=true`) | Public (`public` + `is_published=false`, profile only) | Private (`private`) |
|---------|----------------------------------------------|--------------------------------------------------------|---------------------|
| Note / Book page | Anyone | Anyone | Owner only (others get 404) |
| Global search & Home Hub feeds | Anyone (document + matching author profile) | Owner only (`scope=mine`); hidden from global search/home | Owner only (`scope=mine`) |
| Author profile page (`/u/<user>/`) | Listed under owner's personal category | Listed under owner's personal category | Never listed |
| Tag pages (`/tags/<tag>/`) | Included | Never included | Never included |
| Backlinks on other notes | Shown | Shown (on accessible public notes) | Never shown to others |
| Link from a public note to it | Normal link | Normal link | Shown as "Private note" to others |
| Reading path | Included | Included | Placeholder only, not expanded |
| Hover preview | Allowed | Allowed | Owner only |
| Sitemap | Included | Never | Never |
| Revisions | Owner only | Owner only | Owner only |

Private notes return **404, not 403**, to non-owners so existence is not revealed.

Unpublishing (`Published → Public`) removes the item from global search, home feeds, tag pages, and sitemap immediately, while keeping it visible on the author's profile and direct URL. Changing `Public/Published → Private` takes effect immediately everywhere, including cached pages, and automatically resets `is_published = false`.

## 10. Non-functional requirements

| Area | Requirement |
|------|-------------|
| Performance | Note page server time p95 under 300 ms. Search p95 under 150 ms with 100k notes. |
| Accessibility | WCAG 2.1 AA. Fully keyboard operable. |
| Browsers | Last 2 versions of Chrome, Firefox, Safari, Edge. |
| Privacy | Store only: GitHub ID, username, bio, notes. No email in V1. No third-party trackers or analytics scripts. |
| Reliability | Daily database backups, restore tested once before launch. |
| Data ownership | User can export everything and delete everything. |
| Security | See SECURITY_CHECK.md. All items marked required must pass before launch. |
| Maintainability | Business logic lives in service modules with tests (see RULES.md). |

## 11. Success metrics

Early stage, so small and honest:

- Notes written by the owner during build (target 50+) to prove the product to itself
- Share of notes with at least 1 link (target above 60%)
- Share of notes with at least 1 prerequisite link (target above 25%)
- Weekly active writers
- Search-to-open rate (a search that ends in opening a note)
- Number of public profiles with 5+ public notes

## 12. Cold start plan

The creator fills the platform with their own notes (30+ across 3 topics, fully linked) before any invite. A new visitor must land on a real, rich handbook, not an empty tool.

## 13. Future (not V1)

Ordered roughly by priority.

1. Heatmap, streak, mastery level per note
2. Graph view
3. Spaced repetition reminders
4. Unlisted visibility
5. Fork a public note into your own notes
6. Anonymous alias mode
7. Q&A and mentoring, rating
8. AI quiz and path suggestions
9. Teams / bootcamp workspaces, paid plans

The data model must leave room for these (see ARCHITECTURE.md) but nothing here is built in V1.

## 14. Open questions

| # | Question | Default if undecided |
|---|----------|----------------------|
| 1 | Final product name and domain | Cairn |
| 2 | Open source license | MIT for code; content stays owned by authors |
| 3 | Content license for public notes | Author keeps copyright; platform gets display license |
| 4 | Do cross-author links need the other author's consent? | No. Public notes may be linked by anyone |
| 5 | Should Bangla / mixed-language content be searched? | Yes, use the `simple` text search config |
