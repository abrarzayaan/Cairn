# RULES: Cairn

These rules apply to every contributor, including AI coding assistants. If a rule here conflicts with a quick fix, the rule wins. If a rule is wrong, change this file in a separate commit and explain why.

Read first: PRD.md (what), ARCHITECTURE.md (how), DESIGN.md (look), SECURITY_CHECK.md (safety).

---

## 1. Golden rules

1. **Build only what the PRD says for V1.** No extra features, no "while I'm here" additions.
2. **Private means private.** Every query that returns notes goes through `visible_notes_q(viewer)`. No exceptions.
3. **Business logic lives in `services/`.** Views and routers only parse input, call a service, and shape output.
4. **No new dependency without a reason.** Ask first. Prefer the standard library and what is already installed.
5. **Small, reviewable changes.** One concern per commit and per pull request.
6. **If unsure, ask or leave a clear TODO with an issue.** Do not guess about security, data, or schema.
7. **Look hand-built.** Follow DESIGN.md section 2 (the "AI template" tells). If a UI change violates it, do not ship it.

## 2. Tech stack (use this, nothing else)

| Area | Use | Do not use |
|------|-----|------------|
| Language | Python 3.12+ (Backend), TypeScript / Node.js 20+ (Frontend) | Older Python / untyped JS |
| Backend API | FastAPI + Pydantic v2 (mounted in ASGI) | Django REST Framework, GraphQL |
| Backend Core / ORM | Django (ORM, Admin, Migrations, Auth models) | Flask, SQLAlchemy |
| Frontend | Next.js (App Router, React, TypeScript in `frontend/`) | Plain legacy SSR templates |
| Database | PostgreSQL 16 | SQLite in prod, MongoDB |
| Auth | GitHub OAuth (session-based) | Custom password auth for users, JWT in localStorage |
| Markdown | markdown-it-py + nh3 (backend) | `markdown2` with raw HTML, unsanitized output |
| CSS & UI | Tailwind CSS, modern accessible UI components | Bootstrap, jQuery, bloated kits |
| Editor | CodeMirror 6 | WYSIWYG rich text editors |
| Icons | Lucide icons / inline SVG | Emoji icons, heavy icon fonts |
| Search | Postgres FTS + pg_trgm | Elasticsearch/Meilisearch in V1 |
| Tests | pytest, pytest-django, Vitest / Playwright | unittest-only suites |
| Lint/format | ruff (backend), ESLint + Prettier (frontend) | Multiple competing formatters |
| Deploy | Docker, Caddy, gunicorn + uvicorn workers, Next.js | Serverless for the main app |

## 3. Architecture rules

- **Layering:** `views/routers → services → models`. Models contain data and simple helpers, not workflows.
- Django views and FastAPI routers must not import each other.
- Shared code goes in `services/` or `apps/core/`.
- FastAPI endpoints are **sync `def`**. Do not use the ORM inside `async def`.
- Every mutating API endpoint requires: authentication, CSRF header check, rate limit, Pydantic validation.
- Do not put secrets, URLs, or limits in code. Use settings/env.
- One function, one job. If a function needs a comment to explain its sections, split it.
- Avoid circular imports by keeping `models.py` free of service imports.

## 4. Python and Django rules

- Type hints on all public functions in `services/` and `api/`.
- Use `transaction.atomic()` for any operation that writes more than one row.
- Use `select_related` / `prefetch_related` on list pages. A page must not run N+1 queries (tests assert query counts on note view, profile, search).
- Use Django's QuerySet API. If raw SQL is truly needed, use parameters (`%s`), never f-strings.
- Never use `mark_safe` or `|safe` except on HTML produced by `markdown/renderer.py`, and only there.
- `DEBUG = False` by default; dev settings opt in.
- Timezone-aware datetimes only (`USE_TZ = True`). Store UTC.
- Do not catch bare `except:` or swallow exceptions silently. Catch specific errors and log.
- No business rules in templates. Templates format data, they do not decide permissions.
- Do not add signals for business logic. Call services explicitly.
- Names: `snake_case` functions, `PascalCase` classes, plural table names via Meta, singular model names.

## 5. FastAPI and API rules

- Prefix: `/api/v1`. Breaking changes need `/api/v2`.
- Request and response bodies are Pydantic models. No untyped dicts in or out.
- Error shape is always `{ "error": { "code": "...", "message": "..." } }`.
- Use proper status codes: 400 validation, 401 not signed in, 403 forbidden (own resources only), 404 for private/missing notes, 429 rate limited.
- **Private notes return 404 to non-owners**, never 403.
- Pagination on every list endpoint with a hard maximum (`limit <= 50`).
- No endpoint returns the whole `content_md` of other people's notes in list responses.
- Docs UI (`/api/docs`) only in dev.

## 6. Database rules

- Every schema change is a Django migration. Never edit the database by hand.
- Never edit an applied migration. Add a new one.
- Every foreign key has an index (Django adds it) and a deliberate `on_delete`.
- Any new column that can be filtered or sorted on a hot path gets an index in the same migration.
- Destructive migrations (drop/rename column) are done in two releases: add new → backfill → remove old.
- Update the schema in ARCHITECTURE.md in the same pull request.
- Use `CheckConstraint` for enums (`visibility`, `moderation`, `link_type`).
- Do not store derived data that cannot be rebuilt, and rebuildable derived data (`content_html`, `search_vector`, `note_links`) must have a management command to rebuild it.

## 7. Markdown and content rules

- Raw HTML in Markdown is **off**. Always.
- Images are **never** embedded: render as a link. No `<img>` from user content.
- Only `http`, `https`, `mailto` and `#anchor` URLs. Block `javascript:`, `data:`, `vbscript:`.
- External links always get `rel="noopener noreferrer nofollow ugc"` and `target="_blank"`.
- Sanitize **after** rendering, with an allow-list, not a deny-list.
- Content length limits are enforced on the server, not only in the browser.

## 8. Frontend rules

### HTML
- Semantic elements first (`nav`, `main`, `article`, `aside`, `button`, `a`). No `div` buttons.
- One `h1` per page; headings in order.
- Every form control has a `label`.

### CSS
- All colors, fonts, spacing come from tokens in `tokens.css`. No hard-coded hex values elsewhere.
- No utility-class frameworks. Name classes by meaning (`.note-meta`, `.path-list`), BEM-light.
- Borders, not shadows. Radius max 3px on controls.
- No gradients, blur, glow, or animation beyond 80ms hover changes.
- Mobile-first media queries using the breakpoints in DESIGN.md.
- Never `outline: none` without a visible replacement.

### JavaScript
- Vanilla ES modules, one file per feature (`palette.js`, `hover-preview.js`).
- No inline `<script>` or inline event handlers (CSP forbids them).
- No `innerHTML` with any user-controlled string. Use `textContent` or DOM APIs. The only HTML inserted from the server is already sanitized HTML from the render endpoint.
- No third-party scripts, analytics, or trackers.
- Never store auth tokens in `localStorage`/`sessionStorage`. Cookies only.
- Fetch calls send `X-CSRFToken` and handle errors with inline messages.

### Copy and UI
- Follow the tone table in DESIGN.md section 9.
- No emoji in UI text. No exclamation marks in system messages.
- Error messages say what happened and what to do.
- No lorem ipsum, no fake testimonials, no placeholder stats.

## 9. Security rules (short form, details in SECURITY_CHECK.md)

- Never log: note content, session ids, OAuth codes, CSRF tokens.
- Do not request more GitHub OAuth scope than `read:user`. Do not store GitHub tokens.
- Do not expose whether a private note exists (404 for all non-owners).
- Never trust client input: validate type, length, and ownership on the server.
- Do not add `CORS` allow-all. The API is same-origin; CORS stays off.
- No secrets in the repo, in logs, in Docker image layers, or in client JS.
- Never disable CSRF, auth, or rate limiting to make a test pass. Fix the test setup.

## 10. Testing rules

- Every function in `services/` has tests. Bug fix = a failing test first, then the fix.
- Required test groups:
  - `tests/unit`: markdown, link parsing, slugify, path algorithm
  - `tests/integration`: services and API with a real test database
  - `tests/security`: the **visibility matrix** and XSS corpus (must pass on every PR)
- Tests do not call the real GitHub API. Mock the OAuth provider.
- Tests are deterministic: no sleeps, no dependence on current date unless frozen.
- Query-count assertions on note view, profile, and search pages.

## 11. Git and workflow rules

- Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Commit style: Conventional Commits (`feat: add reading path service`).
- One logical change per commit. No "wip", no giant mixed commits.
- Pull request checklist:
  - [ ] Tests added or updated
  - [ ] `ruff check` and `ruff format` clean
  - [ ] Migrations included and `makemigrations --check` passes
  - [ ] Docs updated if behavior or schema changed
  - [ ] No new dependency (or reason stated)
  - [ ] Security tests pass
- `main` is always deployable. Never push broken migrations.
- Do not commit: `.env`, database dumps, real user data, `node_modules`, build output except the editor bundle.

## 12. Code style

- ruff defaults plus import sorting; line length 100.
- Comments explain **why**, not what. Delete comments that restate the code.
- No dead code, no commented-out code.
- Prefer clear names over short names. `visible_notes_q`, not `vq`.
- Functions under about 40 lines. Files under about 400 lines.
- Docstrings on services: one line for what, one for any non-obvious rule (especially permissions).

## 13. Dependencies

- Pin exact versions in `pyproject.toml` / lockfile. Upgrade deliberately.
- Before adding a package: is it maintained, widely used, and necessary? Note the reason in the PR.
- Run `pip-audit` and `npm audit` in CI; high severity findings block merge.
- Frontend build tooling is limited to esbuild for the editor bundle.

## 14. Instructions for AI coding assistants

If an AI tool writes code in this repo:

1. Read the six docs before starting a task. Cite the TASK id you are working on.
2. Do not invent features, endpoints, fields, or tables not in the docs. Ask instead.
3. Do not change the stack in section 2.
4. Do not add a dependency without asking.
5. Match existing patterns in the repo. Look at a neighbouring file first.
6. Never produce "demo-style" UI: no gradients, no cards-with-shadows, no emoji icons, no marketing copy.
7. Never weaken security (CSRF, auth, sanitization, visibility) to make code work.
8. Write or update tests in the same change.
9. Keep diffs small; do not reformat unrelated files.
10. When finished, state: what changed, what was not done, and any risk.

## 15. Things to avoid (checklist)

**Product**
- Building social features, Q&A, ratings, feeds, or AI in V1
- Adding image upload or embedding remote images
- Collecting email or analytics data in V1

**Code**
- Business logic in views, templates, or routers
- Raw SQL with string formatting
- ORM calls inside `async def`
- Queries that bypass `visible_notes_q`
- Signals for core workflows
- Catch-all exceptions, silent failures
- Global mutable state

**Frontend**
- Tailwind, Bootstrap, component kits
- Gradients, shadows, glow, glass, large radii
- Emoji icons, stock illustrations, hero sections
- Inline scripts or styles, CDN assets
- `innerHTML` with user data

**Security**
- Revealing private note existence (403 vs 404)
- Storing OAuth tokens
- Logging note content or sessions
- Disabling protections for convenience
- Predictable admin URL, staff without 2FA

**Process**
- Editing applied migrations
- Skipping tests for "small" changes
- Large unreviewable PRs
- Committing secrets or real data
