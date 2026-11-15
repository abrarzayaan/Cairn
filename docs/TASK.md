# TASK: Cairn V1 build plan

How to use this file:
- Work top to bottom. Each milestone (M) ends with a demo you can show.
- Do not start a milestone until the previous "Done when" is true.
- Tick `[x]` when done. Estimates are for one developer working part-time, in days.
- Referenced IDs (FR-*, US-*) are in PRD.md. Rules are in RULES.md.

Legend: **P** = priority (M must, S should, C could)

---

## M0. Project setup

- [x] T0.1 Create repo, add the 6 docs into `docs/`, write a short README (M)
- [x] T0.2 Python project with `pyproject.toml`, pin dependencies (Django, FastAPI, uvicorn, gunicorn, psycopg, pydantic, django-allauth, markdown-it-py, nh3, selectolax, pygments, whitenoise, django-otp, pytest, pytest-django, ruff) (M)
- [x] T0.3 Django project `config/` with split settings (base/dev/prod), `.env` loading (M)
- [x] T0.4 Docker Compose for dev: Postgres 16 (+ Redis optional) (M)
- [x] T0.5 Enable Postgres extension `pg_trgm` via first migration (M)
- [x] T0.6 FastAPI app skeleton in `api/`, mounted at `/api` through `config/asgi.py`, `/api/v1/health` works (M)
- [x] T0.7 ruff config, pre-commit, GitHub Actions CI (lint + test + `makemigrations --check`) (M)
- [x] T0.8 pytest setup with a test DB and a sample test for the health endpoint (M)

**Done when:** `docker compose up` starts the app; `/` and `/api/v1/health` respond; CI is green.

---

## M1. Accounts and GitHub login

- [x] T1.1 Custom `User` model (github_id, username, bio, is_banned) created **before** first migration (M)
- [x] T1.2 Register a GitHub OAuth app (dev + prod callback URLs) (M)
- [x] T1.3 Configure django-allauth GitHub provider, scope `read:user`, tokens not stored (M)
- [x] T1.4 Custom adapter: key on GitHub numeric ID, create/sync username, block banned users (M)
- [x] T1.5 Login page and logout (POST) (M)
- [x] T1.6 Session cookie settings (Secure, HttpOnly, SameSite=Lax) in prod settings (M)
- [x] T1.7 Settings page: edit bio (280 chars) (M)
- [x] T1.8 Tests: first login creates user, username sync, banned user refused (M)

**Done when:** you can sign in with your real GitHub account locally and see your username in the top bar.

---

## M2. Notes core (CRUD + visibility)

- [x] T2.1 Models: `Note`, `Tag`, `NoteTag`, `NoteRevision`, `SlugHistory` + migrations, with indexes from ARCHITECTURE.md (M)
- [x] T2.2 `visible_notes_q(viewer)` function: the single source of the visibility rule (M)
- [x] T2.3 Services: `create_note`, `update_note`, `delete_note`, `get_visible_note`, slug generation and uniqueness (M)
- [x] T2.4 Revision creation on content change (M)
- [x] T2.5 Slug change → `SlugHistory` + redirect from old URL (S)
- [x] T2.6 API: `POST /notes`, `GET/PATCH/DELETE /notes/{id}`, `GET /notes/mine` with Pydantic schemas (M)
- [x] T2.7 Auth + CSRF dependency for FastAPI (session user, `X-CSRFToken`) (M)
- [x] T2.8 Basic note view page `/u/<user>/<slug>/` (plain text content for now) (M)
- [x] T2.9 Private note returns 404 to non-owner (M)
- [x] T2.10 Tests: ownership, visibility matrix for the note page and API, validation limits (M)

**Done when:** you can create, edit, delete a note through the API, toggle public/private, and another browser session gets 404 on the private one.

---

## M3. Markdown and linking

- [x] T3.1 Markdown renderer with markdown-it-py (tables, footnotes, task lists), raw HTML disabled (M)
- [x] T3.2 Wikilink inline rule with all syntaxes from FR-L1 (M)
- [x] T3.3 Image-as-link rule (no `<img>` ever) (M)
- [x] T3.4 Pygments highlighting with a custom restrained style (M)
- [x] T3.5 nh3 sanitizer allow-list; external links get `rel` and `target` (M)
- [x] T3.6 Link extraction on save → `note_links` rows (M)
- [x] T3.7 Link resolution rules + auto-resolve pending links on note create/rename (M)
- [x] T3.8 Render-time link states (ok / missing / private) with one batched query (M)
- [x] T3.9 Backlinks service (viewer-filtered) + API endpoint + display (M)
- [x] T3.10 Hover preview endpoint + JS module (S)
- [x] T3.11 `POST /render` for editor preview, rate limited (M)
- [x] T3.12 Tests: XSS payload corpus, wikilinks inside code blocks ignored, every link syntax, image rule, pending → resolved (M)

**Done when:** a note with `[[prereq:Scope]]` renders a link; creating "Scope" afterwards turns the link from missing to active; XSS corpus test passes.

---

## M4. Reading path

- [x] T4.1 `paths.py`: BFS collection with limits (depth 20, nodes 200) (M)
- [x] T4.2 Topological sort (Kahn) with alphabetical tie-break (M)
- [x] T4.3 Cycle detection + warning output (M)
- [x] T4.4 Placeholder nodes for private and missing targets, no expansion through private (M)
- [x] T4.5 "Read first" block on the note page (M)
- [x] T4.6 Path page `/u/<user>/<slug>/path/` + API endpoint (M)
- [x] T4.7 Tests: linear chain, diamond, cycle, missing, private in the middle, limits (M)

**Done when:** `Variables → Scope → Closures → Hooks` produces the right order and a private middle node does not leak.

---

## M5. Editor

- [x] T5.1 `frontend/` with esbuild; bundle CodeMirror 6 (markdown mode) to `static/js/editor.bundle.js` (M)
- [x] T5.2 Editor page layout from DESIGN.md 7.4 (M)
- [x] T5.3 Save with Ctrl/Cmd+S, "Saved HH:MM" status, unsaved warning (M)
- [x] T5.4 Metadata panel: title, slug, tags, visibility (M)
- [x] T5.5 Live "Links found" panel using API response (S)
- [x] T5.6 `[[` autocomplete from `/titles` (own notes) (S)
- [x] T5.7 Preview toggle using `/render` (M)
- [x] T5.8 Cycle warning line in editor (S)
- [x] T5.9 Keyboard shortcuts table from DESIGN.md (S)
- [x] T5.10 Revisions list + view old revision (owner) (S)

**Done when:** you can write a whole real note in the editor without touching the mouse.

---

## M6. Search

- [x] T6.1 Search service using weighted `search_vector` + trigram on titles + shared visibility function (M)
- [x] T6.2 `GET /search` API with filters (tag, author) and pagination (M)
- [x] T6.3 Cmd/Ctrl+K palette (vanilla JS, accessible dialog, keyboard navigation) (M)
- [x] T6.4 Full search page `/search/` (M)
- [x] T6.5 Tag pages `/tags/<tag>/` (S)
- [x] T6.6 Tests: private never appears for others, own private appears for owner, hidden/banned excluded, typo match (M)

**Done when:** typing 3 letters finds the note; a second account cannot find your private notes by any query.

---

## M7. Profile, home, and SEO

- [ ] T7.1 Profile page `/u/<username>/` with public notes, topic counts, bio, GitHub link (M)
- [ ] T7.2 Home page per DESIGN.md (recent public notes + topics) (M)
- [ ] T7.3 Meta tags, canonical URL, Open Graph (text only) for public notes (M)
- [ ] T7.4 `sitemap.xml` and `robots.txt` (public + not hidden only) (S)
- [ ] T7.5 404 and 500 pages (M)
- [ ] T7.6 Export all notes as ZIP of `.md` (S)
- [ ] T7.7 Account deletion with typed confirmation (M)

**Done when:** you can send your profile link to a friend and they can read your public notes while signed out.

---

## M8. Moderation and admin panel

- [x] T8.1 `Report` model + `POST /reports` + Report button/form on public notes (M)
- [x] T8.2 Django admin registration for User, Note, Report, Tag, NoteRevision with list/filter config (M)
- [x] T8.3 Admin actions: hide/unhide note (reason form), ban/unban user (reason form), delete note (M)
- [x] T8.4 Hidden note: 404 to others, notice to author (S)
- [x] T8.5 Banned user: sessions invalidated, public notes hidden from all surfaces (M)
- [x] T8.6 Secret admin path from env (M)
- [x] T8.7 TOTP 2FA for staff (django-otp) (M)
- [x] T8.8 Admin CSS tweak: site title, fonts (C)
- [x] T8.9 Tests: hidden/banned excluded from every surface, non-staff cannot reach admin (M)

**Done when:** you can report a note from a second account and hide it from the admin panel, and it disappears everywhere.

---

## M9. Frontend polish to match DESIGN.md

- [x] T9.1 `tokens.css` with all colors, fonts, spacing, light + dark (M)
- [x] T9.2 Self-host fonts (Plex Sans, Source Serif 4, Plex Mono, Bengali fallbacks) (M)
- [x] T9.3 Base layout: top bar, 3-column note layout, responsive rules (M)
- [x] T9.4 Components: buttons, inputs, tags, link-type markers, code block with copy, tables, blockquote (M)
- [x] T9.5 Theme toggle with cookie (no flash) (S)
- [x] T9.6 Empty states and inline error messages with the copy rules (M)
- [x] T9.7 Accessibility pass: skip link, focus rings, aria for palette, keyboard-only run-through (M)
- [x] T9.8 Contrast check, 200% zoom check, 360px check (M)
- [x] T9.9 Run the DESIGN.md section 14 checklist (M)

**Done when:** the "does this look AI-made?" test passes with a developer friend.

---

## M9B. Book-First Documentation Architecture & Redesign

### Phase 1: Backend (Categories, Books, Sequential Chapters, Unified Search)
- [x] TB.1 `Category` & `Book` models + `Note.book` / `Note.sequence` fields + migrations + preset categories (M)
- [x] TB.2 Visibility rules: `visible_books_q(viewer)` & `visible_notes_q(viewer)` enforce book-level privacy/moderation (M)
- [x] TB.3 Services & FastAPI routers: `/categories`, `/books` CRUD + `/books/by-slug/{u}/{b}` + `/books/{id}/reorder` (M)
- [x] TB.4 Update `/notes` create/update/detail to support `book_id`, `sequence`, book chapters list, and `prev_chapter` / `next_chapter` (M)
- [x] TB.5 Unified Search & Home/Profile feeds across Books, Chapters/Notes, Categories, and Developer Profiles (M)
- [x] TB.6 Register `Category` and `Book` in Django Admin + Hide/Unhide Book actions (S)
- [x] TB.7 Integration tests for Categories, Books, chapter sequencing/reordering, book-level privacy, and unified search (M)

### Phase 2: Frontend (Documentation-First Experience)
- [x] TF.1 Home Docs Hub (`/`) with Category explorer, Public Books library, and Personal Bookshelf (M)
- [x] TF.2 Book Context / Table of Contents page (`/u/<user>/books/<book>`) with sequential chapters, reorder controls, and Start Reading CTA (M)
- [x] TF.3 3-Column Documentation Reader (`/u/<user>/<slug>`) with Book Sequence Sidebar, "On this page" heading outline, and Prev/Next Chapter navigation (M)
- [x] TF.4 Organize-first Editor (`/new`, `.../edit`) with Category -> Book -> Sequence selector + inline `+ New Book` modal (M)
- [x] TF.5 Updated Developer Profile (`/u/<user>`) grouped by Category & Book + Unified Search (`Ctrl+K` & `/search`) (M)

---

## M9C. Personal Categories (Desk) & Publish-for-Search Flow

### Phase 1: Backend (User-Scoped Categories & Publish State)
- [x] TC.1 Schema & migration: add `Category.author` FK (`author + slug` and `author + lower(name)` unique constraints), migrate/clone existing global categories per book author, and seed starter categories per user (M)
- [x] TC.2 Schema & migration: add `is_published` (default `False`) + DB check constraint (`visibility = 'public' OR is_published = False`) and partial indexes on `Book` and `Note` (M)
- [x] TC.3 Update `visible_books_q` / `visible_notes_q` (profile + direct read) and add `published_books_q` / `published_notes_q` (global discovery: `public` + `is_published=True` + `ok` + unbanned) (M)
- [x] TC.4 Personal Category services & API: scope `GET /categories` (own desk or `?username=` visible desk categories), `POST /categories`, `PATCH /categories/{id}`, `DELETE /categories/{id}` with ownership checks (M)
- [x] TC.5 Update `Book` & `Note` services/schemas (`/books`, `/notes`) to support `is_published` toggle and enforce `private` → `is_published=False` automatically (M)
- [x] TC.6 Update Global Search, Home Hub, & Tag pages: use `published_*_q` for `scope=all` / home feeds / tags, keep `visible_*_q` for profile (`/u/<user>`) and `scope=mine`, and match developer profiles by **published topic/docs** as well as username/bio (M)
- [x] TC.7 Update Django Admin & `sitemap.xml` / `robots.txt` rules to reflect `is_published` and per-author categories (S)

### Phase 2: Frontend (Desk Categories, Publish Controls, Topic+Profile Search)
- [ ] TC.8 Editor (`NoteEditor.tsx`) & Book modal/settings: 3-state access control (`Private`, `Public (profile only)`, `Published (globally searchable)`) + inline `+ New Category` creation/management on personal desk (M)
- [ ] TC.9 Profile Desk (`/u/<user>`): display user's personal categories (only those with visible public/published books) as desk shelves, plus clear `Public` vs `Published` badges for owner (M)
- [ ] TC.10 Home Hub (`/`) & Search (`SearchPalette.tsx`, `/search`): show only **published** docs/books globally, remove global category filter (keep category filter in `scope=mine` / profile), and render matching author profiles alongside topic search results (M)

### Phase 3: Tests & Verification
- [ ] TC.11 Integration & security tests: personal category isolation (no cross-user edit/delete, private-only categories hidden on profile), `public` vs `published` leak matrix (unpublished public docs never appear in global search/home/tags/sitemap), and topic-based profile discovery in global search (M)

**Done when:** each user has their own personal categories on their desk; `Public` docs show only on their profile/direct link; `Published` docs appear in global search together with the author's profile.

---

## M10. Security hardening 

- [ ] T10.1 Complete SECURITY_CHECK.md, every "Required" item (M)
- [ ] T10.2 CSP, HSTS, other security headers (M)
- [ ] T10.3 Rate limiting (Redis) per ARCHITECTURE.md section 12 (M)
- [ ] T10.4 Private-leak test matrix in `tests/security/` runs in CI (M)
- [ ] T10.5 `pip-audit` and `npm audit` in CI (M)
- [ ] T10.6 Review of logs for note-content or token leakage (M)

**Done when:** SECURITY_CHECK.md Required items are all ticked.

---

## M11. Deploy and launch 

- [ ] T11.1 Production Dockerfile, Caddyfile, compose file (M)
- [ ] T11.2 VPS, domain, TLS, firewall (only 80/443/SSH-key) (M)
- [ ] T11.3 Production GitHub OAuth app and env secrets (M)
- [ ] T11.4 Run migrations as a release step (M)
- [ ] T11.5 Nightly backup + **tested restore** (M)
- [ ] T11.6 Health check + uptime monitor (S)
- [ ] T11.7 Sentry with PII scrubbing (S)
- [ ] T11.8 Seed content: write 30+ real linked notes across 3 topics, mix of public and private (M)
- [ ] T11.9 Terms and Privacy pages (short, plain language) (M)
- [ ] T11.10 README: what it is, screenshots, how to run, license (M)
- [ ] T11.11 Invite 5 developer friends, collect feedback (M)

**Done when:** a stranger can sign in with GitHub, write a note, make it public, and share the link.

---

## Estimate summary

| Milestone | Days |
|-----------|------|
| M0 Setup |  |
| M1 Accounts |  |
| M2 Notes core |  |
| M3 Markdown + links |  |
| M4 Reading path |  |
| M5 Editor |  |
| M6 Search |  |
| M7 Profile + SEO |  |
| M8 Moderation + admin |  |
| M9 Polish |  |
| M10 Security |  |
| M11 Launch |  |
| **Total** | **~** |

Part-time, that is roughly 2.5 to 4 months. The shortest useful version for yourself is **M0 to M6** (personal notebook with links, path, and search). Use it daily while you build the rest.

---

## Post-V1 backlog (do not start before V1 is live)

### Phase 3: consistency proof
- [ ] Activity heatmap and streak from revisions
- [ ] Mastery level per note (`note_progress` table)
- [ ] Profile stats

### Phase 4: revision and community
- [ ] Spaced repetition reminders
- [ ] Graph view (D3)
- [ ] Unlisted visibility
- [ ] Fork a public note
- [ ] Roadmap/template import (frontend, backend, DevOps)
- [ ] Sync notes with a GitHub repo (Markdown)

### Phase 5: help platform
- [ ] Anonymous alias mode
- [ ] Questions and answers with note links
- [ ] Ratings and reputation with anti-gaming rules
- [ ] Mentor mode

### Phase 6: growth
- [ ] AI quiz / flashcards from notes
- [ ] Teams and bootcamp workspaces
- [ ] Paid plans, custom domains
- [ ] Hiring layer (opt-in public profile for recruiters)
