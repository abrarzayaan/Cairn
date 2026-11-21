# ARCHITECTURE: Cairn

Stack: **Next.js** (Frontend) + **FastAPI** (JSON API) + **Django** (ORM, Admin, Auth models) + **PostgreSQL**.

---

## 1. Key decisions

| # | Decision | Reason |
|---|----------|--------|
| D1 | Django owns models, migrations, admin panel, auth identity | Admin panel comes free; mature ORM and migrations |
| D2 | FastAPI owns the JSON API under `/api/v1` | Fast, typed schemas (Pydantic), powers Next.js editor, search, notes, previews |
| D3 | FastAPI is **mounted inside** the Django ASGI app, same backend process | One backend deployment, shared auth session cookie, zero CORS |
| D4 | FastAPI uses the **Django ORM** (no second ORM) | One source of truth for the database schema |
| D5 | Frontend is a modern **Next.js** App Router in `frontend/` | Next-level UI, SSR/RSC for SEO, client interactivity, modern component ecosystem |
| D6 | Modern styling with **Tailwind CSS** + design tokens + Lucide icons | Premium developer aesthetic, high performance, customizable |
| D7 | PostgreSQL full-text search + `pg_trgm` | No extra search server in V1 |
| D8 | Business logic in **service modules**, called by FastAPI routers and Django views | No duplicated rules, easy to test |
| D9 | Session cookie auth (Django sessions) shared with Next.js | Unified, secure, HTTP-only authentication |
| D10 | GitHub OAuth only; GitHub numeric ID is the identity key | Verified developers, no passwords |

## 2. System diagram

```
                     Browser
                        |
                     HTTPS
                        |
                +---------------+
                |     Caddy     |   TLS, gzip, security headers
                +-------+-------+
                        |
            +-----------+------------+
            |  gunicorn + uvicorn    |
            |  workers (ASGI)        |
            |                        |
            |  config.asgi           |
            |   |-- /api/*  -> FastAPI app (api/)         
            |   '-- /*      -> Django (pages, admin, auth)
            |                        |
            |  apps/*/services  <----+---- shared business logic
            +-----------+------------+
                        |
              +---------+---------+
              |                   |
        PostgreSQL 16        Redis (optional)
        (data + search)      (rate limits)
```

## 3. Request flows

### 3.1 Read a public note (`GET /u/rahim/closures`)
1. Django view calls `notes.services.get_visible_note(viewer, username, slug)`.
2. Service checks visibility; not allowed → `Http404`.
3. Loads `content_html` (pre-rendered at save time).
4. Resolves wikilink placeholders for this viewer in one batched query (resolved / missing / private).
5. Loads prerequisites ("Read first") and backlinks through services, filtered by viewer permission.
6. Template renders. Public, non-personalised responses may be cached; anything with a signed-in user is `Cache-Control: private`.

### 3.2 Save a note (`PATCH /api/v1/notes/{id}`)
1. FastAPI dependency loads the Django session user and verifies the CSRF header.
2. Router validates body with a Pydantic schema.
3. Calls `notes.services.update_note(user, note_id, data)` inside `transaction.atomic()`:
   - check ownership
   - update fields, slug history if slug changed
   - render Markdown → sanitized HTML, store `content_html`
   - parse links, replace `note_links` rows
   - resolve pending links pointing to this note's title/slug
   - create a `note_revisions` row if content changed
4. Returns updated note + detected links.

### 3.3 Search (`GET /api/v1/search?q=closure`)
1. Router calls `search.services.search_notes(viewer, q, filters)`.
2. For global discovery (`scope=all`), query uses `published_notes_q()` / `published_books_q()`: `(visibility = 'public' AND is_published = TRUE AND moderation = 'ok' AND NOT author.is_banned)`. Public-but-unpublished docs are excluded from global search.
3. For personal workspace (`scope=mine`), query filters by `author = viewer` (returns `private`, `public`, and `published`).
4. Global user/profile search matches `username`/`bio` **and** authors whose `published` books or notes match the searched topic.
5. Ranking: `ts_rank` on the weighted `search_vector` plus a trigram similarity boost on titles.
6. Returns max 8 (palette) or paginated (page).

### 3.4 Reading path (`GET /u/rahim/closures/path`)
See section 7.

## 4. Folder structure

```
cairn/
├── backend/
│   ├── manage.py
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── dev.py
│   │   │   ├── prod.py
│   │   │   └── test.py
│   │   ├── urls.py
│   │   ├── asgi.py              # mounts FastAPI at /api
│   │   └── wsgi.py
│   ├── apps/
│   │   ├── accounts/            # User model, admin, adapters, services
│   │   ├── notes/               # Note, Tag, NoteLink, NoteRevision, SlugHistory
│   │   ├── moderation/          # Report model, admin, services
│   │   └── core/
│   ├── api/                     # FastAPI (/api/v1)
│   │   ├── main.py
│   │   ├── deps.py              # auth, csrf, rate limiting
│   │   ├── routers/             # notes, search, users, reports, auth
│   │   └── schemas/             # Pydantic v2 schemas
│   └── tests/                   # unit, integration, security
├── frontend/                    # Next.js App Router (TypeScript, Tailwind, Lucide)
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── app/                     # Next.js routes (home, login, settings, note view, editor, search, path)
│   ├── components/              # UI components, CodeMirror editor, note layout, search palette
│   └── lib/                     # API client, types, auth utilities
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── Caddyfile
├── docs/                        # Specifications and checklists
├── .env.example
├── pyproject.toml
└── README.md
```

## 5. Django + FastAPI integration

`config/asgi.py`:

```python
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")
django_app = get_asgi_application()  # must run before importing models

from api.main import api_app  # FastAPI app; imports Django models safely now


async def application(scope, receive, send):
    if scope["type"] in ("http", "websocket") and scope["path"].startswith("/api/"):
        await api_app(scope, receive, send)
    else:
        await django_app(scope, receive, send)
```

Rules:
- FastAPI endpoints are plain `def` (not `async def`). FastAPI runs them in a threadpool, so the sync Django ORM is safe. Do not call the ORM from `async def` without `sync_to_async`.
- Auth dependency reads the `sessionid` cookie, loads the session with Django's session engine, and returns the `User` or `None`.
- Mutating endpoints (`POST/PATCH/DELETE`) require header `X-CSRFToken` matching Django's CSRF cookie. The dependency validates it.
- API docs (`/api/docs`) enabled only in dev.

## 6. Data model

Django models are the source of truth. SQL below is the target schema.

### 6.1 `users`

```sql
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  github_id     BIGINT UNIQUE NOT NULL,
  username      VARCHAR(39) UNIQUE NOT NULL,   -- GitHub login, lowercase compare
  bio           VARCHAR(280) NOT NULL DEFAULT '',
  is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
  banned_reason TEXT NOT NULL DEFAULT '',
  is_staff      BOOLEAN NOT NULL DEFAULT FALSE,
  is_superuser  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  password      VARCHAR(128) NOT NULL DEFAULT '', -- unusable for normal users; staff use it with TOTP
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));
```

Future-ready: `alias VARCHAR(40) NULL UNIQUE` can be added later for anonymous mode without breaking anything.

### 6.1.1 `categories` (Canonical global taxonomy) & `user_categories` (Lazy desk shelves)

```sql
-- Globally deduplicated canonical categories (zero duplicate strings across users)
CREATE TABLE categories (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  slug        VARCHAR(70) UNIQUE NOT NULL,
  description VARCHAR(200) NOT NULL DEFAULT '',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,  -- 8 shared default suggestions
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_lower_unique ON categories (lower(name));
CREATE INDEX categories_default_name_idx ON categories (is_default, name);

-- Lazy personal desk shelves (created only when a user adds/uses a category)
CREATE TABLE user_categories (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE PROTECT,
  description VARCHAR(200) NOT NULL DEFAULT '',
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id)
);
CREATE INDEX user_categories_user_idx ON user_categories (user_id, sort_order);
```

### 6.1.2 `books` (Documentation / Books)

```sql
CREATE TABLE books (
  id              BIGSERIAL PRIMARY KEY,
  author_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id     BIGINT NOT NULL REFERENCES categories(id) ON DELETE PROTECT,
  title           VARCHAR(120) NOT NULL,
  slug            VARCHAR(140) NOT NULL,
  description     VARCHAR(400) NOT NULL DEFAULT '',
  visibility      VARCHAR(10) NOT NULL DEFAULT 'private'
                  CHECK (visibility IN ('public','private')),
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  moderation      VARCHAR(10) NOT NULL DEFAULT 'ok'
                  CHECK (moderation IN ('ok','hidden')),
  moderation_note TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (author_id, slug),
  CHECK (visibility = 'public' OR is_published = FALSE)
);
CREATE INDEX books_author_idx ON books (author_id, updated_at DESC);
CREATE INDEX books_published_idx ON books (updated_at DESC)
  WHERE visibility = 'public' AND is_published = TRUE AND moderation = 'ok';
```

### 6.2 `notes` (Chapters & Standalone Docs)

```sql
CREATE TABLE notes (
  id              BIGSERIAL PRIMARY KEY,
  author_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id         BIGINT NULL REFERENCES books(id) ON DELETE SET NULL,
  sequence        INT NOT NULL DEFAULT 1,
  title           VARCHAR(120) NOT NULL,
  slug            VARCHAR(140) NOT NULL,
  content_md      TEXT NOT NULL DEFAULT '',
  content_html    TEXT NOT NULL DEFAULT '',        -- sanitized, with wikilink placeholders
  summary         VARCHAR(220) NOT NULL DEFAULT '',-- plain-text excerpt for previews/meta
  visibility      VARCHAR(10) NOT NULL DEFAULT 'private'
                  CHECK (visibility IN ('public','private')),
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  moderation      VARCHAR(10) NOT NULL DEFAULT 'ok'
                  CHECK (moderation IN ('ok','hidden')),
  moderation_note TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_vector   TSVECTOR GENERATED ALWAYS AS (
                    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
                    setweight(to_tsvector('simple', coalesce(content_md,'')), 'B')
                  ) STORED,
  UNIQUE (author_id, slug),
  CHECK (visibility = 'public' OR is_published = FALSE)
);
CREATE INDEX notes_search_idx    ON notes USING GIN (search_vector);
CREATE INDEX notes_title_trgm    ON notes USING GIN (title gin_trgm_ops);
CREATE INDEX notes_author_idx    ON notes (author_id, updated_at DESC);
CREATE INDEX notes_public_idx    ON notes (updated_at DESC)
  WHERE visibility = 'public' AND moderation = 'ok';
CREATE INDEX notes_published_idx ON notes (updated_at DESC)
  WHERE visibility = 'public' AND is_published = TRUE AND moderation = 'ok';
CREATE UNIQUE INDEX notes_author_title_lower_idx ON notes (author_id, lower(title));
```

Requires extensions: `pg_trgm`.

Future-ready: columns such as `mastery`, `next_review_at` live in a separate `note_progress` table later, not here.

### 6.3 `tags` and `note_tags`

```sql
CREATE TABLE tags (
  id    BIGSERIAL PRIMARY KEY,
  name  VARCHAR(30) UNIQUE NOT NULL            -- lowercase, a-z0-9-
);
CREATE TABLE note_tags (
  note_id BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  BIGINT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  position SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (note_id, tag_id)
);
CREATE INDEX note_tags_tag_idx ON note_tags (tag_id);
```

### 6.4 `note_links` (the knowledge graph)

```sql
CREATE TABLE note_links (
  id         BIGSERIAL PRIMARY KEY,
  source_id  BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_id  BIGINT REFERENCES notes(id) ON DELETE SET NULL,  -- NULL = pending/missing
  target_ref VARCHAR(200) NOT NULL,        -- raw text from [[...]] e.g. "Scope" or "sara/closures"
  link_type  VARCHAR(10) NOT NULL DEFAULT 'related'
             CHECK (link_type IN ('related','prereq','deep')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, target_ref, link_type)
);
CREATE INDEX note_links_target_idx ON note_links (target_id, link_type);
CREATE INDEX note_links_ref_idx    ON note_links (lower(target_ref)) WHERE target_id IS NULL;
```

- `source` → `target` with type `prereq` means: **source requires target** first.
- `ON DELETE SET NULL`: if a target is deleted, the link becomes "missing" again, and stays recoverable.

### 6.5 `note_revisions`

```sql
CREATE TABLE note_revisions (
  id         BIGSERIAL PRIMARY KEY,
  note_id    BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title      VARCHAR(120) NOT NULL,
  content_md TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX note_revisions_note_idx ON note_revisions (note_id, created_at DESC);
```

- Append-only (no update/delete through the app, except cascade on note delete).
- Limit: keep the latest 100 per note, prune older ones in a background command.
- Phase 3 heatmap reads `created_at` from this table (grouped by day, joined through notes.author_id).

### 6.6 `slug_history`

```sql
CREATE TABLE slug_history (
  id        BIGSERIAL PRIMARY KEY,
  note_id   BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  old_slug  VARCHAR(140) NOT NULL,
  author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (author_id, old_slug)
);
```

### 6.7 `reports`

```sql
CREATE TABLE reports (
  id          BIGSERIAL PRIMARY KEY,
  note_id     BIGINT REFERENCES notes(id) ON DELETE SET NULL,
  reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,  -- NULL if visitor; see below
  reason      VARCHAR(12) NOT NULL CHECK (reason IN ('spam','abuse','copyright','other')),
  details     VARCHAR(500) NOT NULL DEFAULT '',
  status      VARCHAR(10) NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','actioned','dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  handled_at  TIMESTAMPTZ
);
CREATE INDEX reports_status_idx ON reports (status, created_at);
```

V1: only signed-in users can report (reduces spam), so `reporter_id` is expected non-null.

### 6.8 Framework tables

`django_session`, `django_admin_log` (admin action audit), allauth tables (`socialaccount_*`), django-otp tables. Not redefined here.

### 6.9 ER overview

```
users 1---* notes 1---* note_revisions
              | *---* tags   (via note_tags)
              | 1---* note_links *---1 notes (target)
              | 1---* slug_history
              | 1---* reports *---1 users (reporter)
```

## 7. Core algorithms

### 7.1 Link syntax (parser)

Inside Markdown inline text, outside code spans/blocks:

```
[[Scope]]                 related, target by title/slug (same author)
[[prereq:Scope]]          prerequisite
[[deep:Event Loop]]       deep dive
[[Scope|how scope works]] custom label
[[sara/closures]]         another author's public note (username/slug)
```

Regex (simplified): `\[\[(?:(prereq|deep):)?([^\]\|]{1,200})(?:\|([^\]]{1,100}))?\]\]`

Parser returns `[(type, target_ref, label, span)]`. Done as a markdown-it inline rule so code blocks are skipped automatically.

### 7.2 Link resolution

For `target_ref`:
1. Contains `/` → `username/slug` → note with `author.username = username AND slug = slug AND visibility = public AND moderation = ok`. (Cross-author only to public notes.)
2. Else → author's note where `lower(title) = lower(ref)`; if none, `slug = slugify(ref)`.
3. Not found → `target_id = NULL` (pending).

On note create/rename/slug change: `UPDATE note_links SET target_id = :id WHERE target_id IS NULL AND lower(target_ref) IN (lower(:title), :slug) AND source.author_id = :author` (same-author refs only; cross-author refs resolve on the source's next save or by a periodic job).

### 7.3 Render-time link state

`content_html` stores placeholders: `<a class="wl" data-ref="Scope" data-type="prereq">Scope</a>`.
At view time, one batched query loads the page's `note_links` + target visibility, then a single HTML pass (selectolax) sets `href`, class `wl-ok | wl-missing | wl-private`, and replaces private text with "Private note". Reason: visibility can change after the note was saved, so it must be computed at view time, per viewer.

### 7.4 Reading path

Input: root note `R`, viewer `V`. Output: ordered nodes + warnings.

```
1. BFS from R along note_links where link_type = 'prereq' (source → target).
   - batch: load all edges for the current frontier in one query per level
   - limits: depth <= 20, nodes <= 200
2. For each discovered target:
   - if viewer can see it → real node, continue expanding
   - if not (private/hidden) → placeholder node "Private note", DO NOT expand
   - if target_id IS NULL (missing) → placeholder node "Not written yet"
3. Build a graph: edge A → B means "A requires B".
4. Topological sort (Kahn) so that required notes come first.
   Ties: alphabetical by title (deterministic).
5. If nodes remain after Kahn → cycle. Return the sorted part, plus warning
   "Cycle: A → B → A" (found with DFS on the leftover).
6. Output list with R last.
```

Complexity is trivial at this scale. If it ever becomes a bottleneck, use a recursive CTE.

### 7.5 Search query (sketch)

```sql
-- Global search (scope = 'all'): published documents only
SELECT n.id, n.title, n.slug, u.username, n.visibility, n.is_published,
       ts_rank(n.search_vector, q) * 2 + similarity(n.title, :raw) AS score
FROM notes n
JOIN users u ON u.id = n.author_id
LEFT JOIN books b ON b.id = n.book_id,
     websearch_to_tsquery('simple', :raw) q
WHERE (n.search_vector @@ q OR n.title % :raw)
  AND n.visibility = 'public'
  AND n.is_published = TRUE
  AND n.moderation = 'ok'
  AND NOT u.is_banned
  AND (b.id IS NULL OR (b.visibility = 'public' AND b.moderation = 'ok'))
ORDER BY score DESC, n.updated_at DESC
LIMIT :limit;
```

In code, visibility and discovery predicates live in shared functions:
- `visible_notes_q(viewer)` / `visible_books_q(viewer)` — direct read access, profile desk (`/u/<user>`), reading path, backlinks, and `scope=mine`.
- `published_notes_q()` / `published_books_q()` — global discovery surfaces (`scope=all` global search, home hub published feeds, tag pages, sitemap). Never rewrite these predicates elsewhere.

### 7.6 Markdown pipeline

```
content_md
  → markdown-it-py (html=False, typographer off)
       plugins: tables, footnotes, tasklists, wikilink rule, image-as-link rule
  → Pygments highlight for fenced code (server-side, custom style)
  → nh3 sanitize (allow-list tags/attrs, only http/https/mailto/#anchor URLs)
  → add rel="noopener noreferrer nofollow ugc" target="_blank" to external links
  → store as content_html
```

Image rule: `![alt](url)` → `<a class="ext-img" href="url">alt (image link)</a>`; never `<img>`.

## 8. API (FastAPI, `/api/v1`)

All JSON. Errors use `{ "error": { "code": "...", "message": "..." } }`.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/categories` | required (or `?username=`) | List personal categories with book counts (own desk, or another user's public/published categories) |
| POST | `/categories` | required | Create a personal category on the user's desk |
| PATCH | `/categories/{id}` | required (owner) | Rename or update personal category description |
| DELETE | `/categories/{id}` | required (owner) | Delete an empty personal category (or reassign books) |
| GET | `/books/mine` | required | List authenticated user's books |
| POST | `/books` | required | Create a new Book/Document under a personal Category (supports `visibility`, `is_published`) |
| GET | `/books/by-slug/{username}/{slug}` | optional | Book context / Table of Contents + ordered chapters |
| PATCH | `/books/{id}` | required (owner) | Update book title, category, description, visibility, `is_published` |
| DELETE | `/books/{id}` | required (owner) | Delete book (detaches or deletes chapters) |
| POST | `/books/{id}/reorder` | required (owner) | Reorder chapters (`note_ids` list) |
| GET | `/home` | optional | Recent **published** books/docs, global topics, and own personal desk/workspace |
| GET | `/users/{username}/profile` | optional | Developer desk: bio, personal categories, public & published books/notes |
| GET | `/search?q=&type=&category=&scope=&tag=&author=&limit=&offset=` | optional | Global search across **published** books/notes and matching author profiles (`scope=all`), or personal workspace (`scope=mine`) |
| GET | `/notes/mine` | required | Sidebar tree (id, title, slug, book, sequence, tag, visibility) |
| POST | `/notes` | required | Create note/chapter (supports `book_id`, `sequence`) |
| GET | `/notes/{id}` | required (owner) | Load for editor |
| PATCH | `/notes/{id}` | required (owner) | Save |
| DELETE | `/notes/{id}` | required (owner) | Delete |
| GET | `/notes/{id}/preview` | optional | Hover preview (title, summary, prereq count) |
| GET | `/notes/{id}/backlinks` | optional | Backlinks visible to viewer |
| GET | `/notes/{id}/path` | optional | Reading path |
| GET | `/notes/{id}/revisions` | required (owner) | Revision list |
| GET | `/notes/{id}/revisions/{rid}` | required (owner) | One revision |
| POST | `/render` | required | Markdown → HTML for editor preview (rate limited) |
| GET | `/titles?q=` | required | Autocomplete for `[[` (own titles only) |
| POST | `/reports` | required | Report a public note |
| GET | `/health` | none | Liveness |

Frontend (Next.js) routes:

| Path | View |
|------|------|
| `/` | Docs Hub & Workspace (Categories, Public Books, My Bookshelf) |
| `/login`, `/logout`, `/accounts/github/...` | GitHub OAuth |
| `/u/<username>/` | Developer Docs Profile (Books grouped by Category) |
| `/u/<username>/books/<book>/` | Book Context / Sequential Table of Contents |
| `/u/<username>/<slug>/` | Documentation Reader (Left Book TOC + Center Doc + Right "On this page") |
| `/u/<username>/<slug>/path/` | Reading path |
| `/u/<username>/<slug>/edit/` | Editor (owner) |
| `/new/` | New note |
| `/tags/<tag>/` | Public notes by tag |
| `/search/` | Full search page |
| `/settings/` | Bio, export, delete |
| `/sitemap.xml`, `/robots.txt` | SEO |
| `/<ADMIN_PATH>/` | Django admin (secret path from env) |

## 9. Admin panel (Django admin)

| Model | List | Filters | Actions |
|-------|------|---------|---------|
| User | username, github_id, is_banned, created_at, notes count | banned, staff, date | Ban, Unban |
| Note | title, author, visibility, moderation, updated_at | visibility, moderation, date | Hide, Unhide, Delete |
| Report | note, reason, status, reporter, created_at | status, reason | Mark actioned, Dismiss, Hide note + action |
| Tag | name, usage count | none | none |
| NoteRevision | read-only | none | none |

- Hide action requires a reason (intermediate admin form) saved to `moderation_note`.
- Ban action requires a reason, sets `is_banned`, invalidates sessions.
- Secret admin path from `ADMIN_PATH` env; staff login requires password **and** TOTP (django-otp).
- Admin changes appear in `django_admin_log` automatically.
- Staff accounts are created only with `manage.py createsuperuser`, never through OAuth.

## 10. Authentication details

- `django-allauth` with the GitHub provider.
- Scope: `read:user` only. `SOCIALACCOUNT_STORE_TOKENS = False`.
- Custom adapter:
  - identity = `uid` (GitHub numeric ID)
  - on first login: create user with `username = github login`
  - on later login: update username if changed and unique, else keep the old one
  - refuse login if `is_banned`
- Session: HTTP-only, `Secure`, `SameSite=Lax`, 14-day rolling expiry.
- Logout is POST-only.

## 11. Caching

- Public note HTML pages for anonymous visitors: `Cache-Control: public, max-age=60` plus `Vary: Cookie`. Short TTL so visibility changes take effect within a minute, and **purge on visibility change** (if a CDN is added later).
- Signed-in responses: `Cache-Control: private, no-store` on note pages.
- Static assets: hashed filenames by WhiteNoise, `max-age=1 year, immutable`.
- No Redis cache for page data in V1.

## 12. Rate limiting

Implemented in an API dependency and a Django middleware (Redis backend, fallback to in-memory for dev).

| Action | Limit |
|--------|-------|
| Search | 30 / minute / user or IP |
| Note write (create/update/delete) | 60 / minute / user |
| Markdown render preview | 30 / minute / user |
| Report | 5 / hour / user |
| Global per IP | 300 / minute |

## 13. Deployment

`docker/docker-compose.yml` services: `web` (gunicorn with uvicorn workers), `db` (postgres:16), `redis` (optional), `caddy`.

```
gunicorn config.asgi:application -k uvicorn.workers.UvicornWorker -w 3 -b 0.0.0.0:8000
```

- Static: WhiteNoise.
- Migrations run as a release step, not on every container start.
- Hosting: one small VPS is enough for V1.
- Backups: nightly `pg_dump` to off-server storage, retention 14 days, restore tested.
- CI (GitHub Actions): ruff, tests, `pip-audit`, migration check (`makemigrations --check`).

### Environment variables (`.env.example`)

```
DJANGO_SETTINGS_MODULE=config.settings.prod
SECRET_KEY=
DEBUG=false
ALLOWED_HOSTS=
CSRF_TRUSTED_ORIGINS=
DATABASE_URL=postgres://...
REDIS_URL=redis://redis:6379/0
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
ADMIN_PATH=change-me-long-random/
SENTRY_DSN=
```

## 14. Observability

- Structured JSON logs (request id, user id, path, status, duration). No note content in logs.
- `/api/v1/health` checks DB connectivity.
- Optional Sentry with PII scrubbing on.

## 15. Testing strategy

| Layer | Tool | What |
|-------|------|------|
| Unit | pytest | markdown rendering, link parsing, path algorithm, slugify |
| Service | pytest-django | visibility rules, link resolution, revisions |
| API | pytest + FastAPI TestClient | auth, CSRF, validation, rate limits |
| Security | pytest | private-leak matrix (see SECURITY_CHECK.md) |
| E2E | Playwright (few smoke tests) | login stub, write note, link, search, path |

Minimum: every function in `services/` has tests. The private-leak matrix must pass before every merge to main.

## 16. Extension points for the future

| Future feature | Where it plugs in |
|----------------|-------------------|
| Heatmap / streak | Query `note_revisions` grouped by day |
| Mastery / spaced repetition | New `note_progress(user_id, note_id, mastery, next_review_at)` |
| Unlisted visibility | Extend `visibility` CHECK, add to `visible_notes_q` |
| Alias / anonymous mode | Add `users.alias`; display layer picks alias vs username |
| Q&A and ratings | New `questions`, `answers`, `ratings` apps; reuse `Report` |
| Graph view | New endpoint over `note_links`, render with D3 |
| Forks | `notes.forked_from_id` nullable FK |
| AI | Separate service module, called from API only |
