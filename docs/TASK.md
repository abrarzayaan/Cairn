# TASK: Devbook V1 build plan

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

- [ ] T1.1 Custom `User` model (github_id, username, bio, is_banned) created **before** first migration (M)
- [ ] T1.2 Register a GitHub OAuth app (dev + prod callback URLs) (M)
- [ ] T1.3 Configure django-allauth GitHub provider, scope `read:user`, tokens not stored (M)
- [ ] T1.4 Custom adapter: key on GitHub numeric ID, create/sync username, block banned users (M)
- [ ] T1.5 Login page and logout (POST) (M)
- [ ] T1.6 Session cookie settings (Secure, HttpOnly, SameSite=Lax) in prod settings (M)
- [ ] T1.7 Settings page: edit bio (280 chars) (M)
- [ ] T1.8 Tests: first login creates user, username sync, banned user refused (M)

**Done when:** you can sign in with your real GitHub account locally and see your username in the top bar.

---

## M2. Notes core (CRUD + visibility)

- [ ] T2.1 Models: `Note`, `Tag`, `NoteTag`, `NoteRevision`, `SlugHistory` + migrations, with indexes from ARCHITECTURE.md (M)
- [ ] T2.2 `visible_notes_q(viewer)` function: the single source of the visibility rule (M)
- [ ] T2.3 Services: `create_note`, `update_note`, `delete_note`, `get_visible_note`, slug generation and uniqueness (M)
- [ ] T2.4 Revision creation on content change (M)
- [ ] T2.5 Slug change → `SlugHistory` + redirect from old URL (S)
- [ ] T2.6 API: `POST /notes`, `GET/PATCH/DELETE /notes/{id}`, `GET /notes/mine` with Pydantic schemas (M)
- [ ] T2.7 Auth + CSRF dependency for FastAPI (session user, `X-CSRFToken`) (M)
- [ ] T2.8 Basic note view page `/u/<user>/<slug>/` (plain text content for now) (M)
- [ ] T2.9 Private note returns 404 to non-owner (M)
- [ ] T2.10 Tests: ownership, visibility matrix for the note page and API, validation limits (M)

**Done when:** you can create, edit, delete a note through the API, toggle public/private, and another browser session gets 404 on the private one.

---

## M3. Markdown and linking

- [ ] T3.1 Markdown renderer with markdown-it-py (tables, footnotes, task lists), raw HTML disabled (M)
- [ ] T3.2 Wikilink inline rule with all syntaxes from FR-L1 (M)
- [ ] T3.3 Image-as-link rule (no `<img>` ever) (M)
- [ ] T3.4 Pygments highlighting with a custom restrained style (M)
- [ ] T3.5 nh3 sanitizer allow-list; external links get `rel` and `target` (M)
- [ ] T3.6 Link extraction on save → `note_links` rows (M)
- [ ] T3.7 Link resolution rules + auto-resolve pending links on note create/rename (M)
- [ ] T3.8 Render-time link states (ok / missing / private) with one batched query (M)
- [ ] T3.9 Backlinks service (viewer-filtered) + API endpoint + display (M)
- [ ] T3.10 Hover preview endpoint + JS module (S)
- [ ] T3.11 `POST /render` for editor preview, rate limited (M)
- [ ] T3.12 Tests: XSS payload corpus, wikilinks inside code blocks ignored, every link syntax, image rule, pending → resolved (M)

**Done when:** a note with `[[prereq:Scope]]` renders a link; creating "Scope" afterwards turns the link from missing to active; XSS corpus test passes.

---

## M4. Reading path

- [ ] T4.1 `paths.py`: BFS collection with limits (depth 20, nodes 200) (M)
- [ ] T4.2 Topological sort (Kahn) with alphabetical tie-break (M)
- [ ] T4.3 Cycle detection + warning output (M)
- [ ] T4.4 Placeholder nodes for private and missing targets, no expansion through private (M)
- [ ] T4.5 "Read first" block on the note page (M)
- [ ] T4.6 Path page `/u/<user>/<slug>/path/` + API endpoint (M)
- [ ] T4.7 Tests: linear chain, diamond, cycle, missing, private in the middle, limits (M)

**Done when:** `Variables → Scope → Closures → Hooks` produces the right order and a private middle node does not leak.

---

## M5. Editor

- [ ] T5.1 `frontend/` with esbuild; bundle CodeMirror 6 (markdown mode) to `static/js/editor.bundle.js` (M)
- [ ] T5.2 Editor page layout from DESIGN.md 7.4 (M)
- [ ] T5.3 Save with Ctrl/Cmd+S, "Saved HH:MM" status, unsaved warning (M)
- [ ] T5.4 Metadata panel: title, slug, tags, visibility (M)
- [ ] T5.5 Live "Links found" panel using API response (S)
- [ ] T5.6 `[[` autocomplete from `/titles` (own notes) (S)
- [ ] T5.7 Preview toggle using `/render` (M)
- [ ] T5.8 Cycle warning line in editor (S)
- [ ] T5.9 Keyboard shortcuts table from DESIGN.md (S)
- [ ] T5.10 Revisions list + view old revision (owner) (S)

**Done when:** you can write a whole real note in the editor without touching the mouse.

---

## M6. Search

- [ ] T6.1 Search service using weighted `search_vector` + trigram on titles + shared visibility function (M)
- [ ] T6.2 `GET /search` API with filters (tag, author) and pagination (M)
- [ ] T6.3 Cmd/Ctrl+K palette (vanilla JS, accessible dialog, keyboard navigation) (M)
- [ ] T6.4 Full search page `/search/` (M)
- [ ] T6.5 Tag pages `/tags/<tag>/` (S)
- [ ] T6.6 Tests: private never appears for others, own private appears for owner, hidden/banned excluded, typo match (M)

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

- [ ] T8.1 `Report` model + `POST /reports` + Report button/form on public notes (M)
- [ ] T8.2 Django admin registration for User, Note, Report, Tag, NoteRevision with list/filter config (M)
- [ ] T8.3 Admin actions: hide/unhide note (reason form), ban/unban user (reason form), delete note (M)
- [ ] T8.4 Hidden note: 404 to others, notice to author (S)
- [ ] T8.5 Banned user: sessions invalidated, public notes hidden from all surfaces (M)
- [ ] T8.6 Secret admin path from env (M)
- [ ] T8.7 TOTP 2FA for staff (django-otp) (M)
- [ ] T8.8 Admin CSS tweak: site title, fonts (C)
- [ ] T8.9 Tests: hidden/banned excluded from every surface, non-staff cannot reach admin (M)

**Done when:** you can report a note from a second account and hide it from the admin panel, and it disappears everywhere.

---

## M9. Frontend polish to match DESIGN.md

- [ ] T9.1 `tokens.css` with all colors, fonts, spacing, light + dark (M)
- [ ] T9.2 Self-host fonts (Plex Sans, Source Serif 4, Plex Mono, Bengali fallbacks) (M)
- [ ] T9.3 Base layout: top bar, 3-column note layout, responsive rules (M)
- [ ] T9.4 Components: buttons, inputs, tags, link-type markers, code block with copy, tables, blockquote (M)
- [ ] T9.5 Theme toggle with cookie (no flash) (S)
- [ ] T9.6 Empty states and inline error messages with the copy rules (M)
- [ ] T9.7 Accessibility pass: skip link, focus rings, aria for palette, keyboard-only run-through (M)
- [ ] T9.8 Contrast check, 200% zoom check, 360px check (M)
- [ ] T9.9 Run the DESIGN.md section 14 checklist (M)

**Done when:** the "does this look AI-made?" test passes with a developer friend.

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
