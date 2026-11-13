# SECURITY_CHECK: Cairn

Use this as a living checklist. Review it at the end of every milestone and fully before launch.

Legend: **[R]** = required before launch, **[S]** = should, **[C]** = could.
Tick `[x]` only after you have verified it, not when you believe it is done.

---

## 1. Assets and threats

### What we protect
| Asset | Why it matters |
|-------|----------------|
| Private notes | Core promise of the product. A leak destroys trust. |
| User identity (GitHub ID, username) | Link to a real person's GitHub account |
| Sessions | Account takeover |
| Admin panel | Full control, can hide/ban/delete |
| Database and backups | All of the above in one place |
| Server and secrets | Everything |

### Main threats
| Threat | Example | Main defence |
|--------|---------|--------------|
| Private data leak | Search, backlinks, path, preview, sitemap reveal a private note | One visibility function + leak test matrix |
| XSS via Markdown | `<script>`, `javascript:` links, event handlers | No raw HTML, sanitizer, CSP |
| CSRF | Malicious site triggers delete on user's behalf | CSRF token + SameSite cookies |
| Broken access control | User edits another's note by changing an ID | Ownership check in services |
| Account takeover | Stolen session | Secure cookies, short sessions, no tokens in JS |
| Admin compromise | Weak staff password | Secret path, 2FA, few staff |
| Abuse / spam | Mass public notes with spam links | Rate limits, nofollow, reports, ban |
| Resource exhaustion | Huge notes, expensive path or search queries | Size limits, depth limits, rate limits |
| Supply chain | Malicious package | Pinned deps, audits, few deps |
| Injection | SQL injection | ORM, parameterized queries |

---

## 2. Authentication and sessions

- [ ] **[R]** GitHub OAuth is the only sign-in for normal users
- [ ] **[R]** OAuth `state` parameter is verified (allauth default; confirm not disabled)
- [ ] **[R]** Scope is `read:user` only; no email scope
- [ ] **[R]** GitHub access token is **not stored** (`SOCIALACCOUNT_STORE_TOKENS = False`)
- [ ] **[R]** Identity key is the numeric GitHub ID, not the username (usernames can be reassigned)
- [ ] **[R]** Banned users cannot sign in and existing sessions are deleted on ban
- [ ] **[R]** Session cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`
- [ ] **[R]** Session lifetime limited (14 days rolling) and rotated on login
- [ ] **[R]** Logout is POST-only and destroys the server-side session
- [ ] **[R]** No auth token or session id is ever stored in `localStorage`/`sessionStorage`
- [ ] **[S]** "Sign out everywhere" option in settings
- [ ] **[S]** Open redirect check: `next` parameter only allows same-site relative paths

## 3. Authorization (access control)

- [ ] **[R]** Every note read, write, delete goes through a service that checks ownership or visibility
- [ ] **[R]** Single function `visible_notes_q(viewer)` is used by every query that returns notes (pages, profile, backlinks, path, preview, export), and `published_notes_q()` / `published_books_q()` is used by every global discovery query (global search `scope=all`, home feed, tag pages, sitemap)
- [ ] **[R]** Personal `Category` records are strictly scoped to `author`; non-owners cannot edit/delete another user's categories, and categories with only `private` books are never exposed on `/u/<user>`
- [ ] **[R]** `private` notes/books can never have `is_published=True` (enforced in services and DB check constraint); switching `public/published → private` resets `is_published=False` and removes them from every surface immediately
- [ ] **[R]** Unpublished `public` notes/books never appear in global search (`scope=all`), home feed, tag pages, or `sitemap.xml`
- [ ] **[R]** Private and hidden notes return **404** for non-owners (never 403, never a different message)
- [ ] **[R]** Revision endpoints are owner-only
- [ ] **[R]** IDs in URLs/JSON are never trusted: always re-check the object belongs to the user
- [ ] **[R]** Admin-only actions are not reachable through the public API
- [ ] **[R]** Cross-author links only resolve to `public` + `ok` notes
- [ ] **[R]** Banned user's public notes disappear from all surfaces
- [ ] **[R]** Changing Public/Published → Private removes the note from search, profile, backlinks, previews, and sitemap immediately; unpublishing (`Published → Public`) removes it from global search, home feed, tag pages, and sitemap immediately

## 4. Private-leak test matrix (automated, in `tests/security/`)

Setup: users **A** (owner), **B** (other signed-in), **anon**. A has a private note `P`, a public note `Q` linking to `P` with `[[prereq:P]]`, and a public note `R` that `P` links to.

For each surface, assert that B and anon learn nothing about `P` (not title, not existence, not content, not count).

| Surface | A (owner) | B / anon expected |
|---------|-----------|-------------------|
| `GET /u/A/P/` | 200 | 404 |
| `GET /u/A/P/edit/` | 200 | 404 / redirect to login |
| `GET /u/A/P/path/` | 200 | 404 |
| `GET /api/v1/notes/{P}` | 200 | 404 |
| `GET /api/v1/notes/{P}/preview` | 200 | 404 |
| `GET /api/v1/notes/{P}/backlinks` | 200 | 404 |
| `GET /api/v1/notes/{P}/revisions` | 200 | 404 |
| `GET /api/v1/search?q=<title of P>` | contains P | does not contain P |
| `GET /api/v1/search?q=<word only in P content>` | contains P | does not contain P |
| Profile `/u/A/` | lists Q only | lists Q only (no P, no count including P) |
| Tag page of P's tag | shows own | does not show P |
| Backlinks on `R` | shows P | does not show P |
| Rendered `Q` | link to P active | shows "Private note", no title, no href to P |
| Reading path for `Q` | P expanded | P shown as "Private note", **not expanded**, nothing beyond it |
| `sitemap.xml` | n/a | no P |
| Export | includes P | n/a |
| Response timing / size for existing-private vs non-existent | n/a | indistinguishable (no oracle) |
| Public→Private flip of `Q` | n/a | Q disappears from all surfaces on next request |
| Hidden by moderator | author sees notice | 404 for everyone else |
| Banned author | n/a | all their notes gone from public surfaces |
| Public (unpublished) `Q` in global search / home / tags / sitemap | shown in `scope=mine` | excluded from `scope=all` global search, home feed, tag pages, and sitemap; still visible on `/u/A/` and `/u/A/Q/` |
| Personal category with only `P` (private) | visible in own desk | hidden from `/u/A/` and non-owner API calls (404 on edit/delete) |

- [ ] **[R]** Matrix implemented as parametrized pytest and runs on every PR

## 5. Input validation and injection

- [ ] **[R]** All API input validated with Pydantic (types, lengths, enums)
- [ ] **[R]** Title max 120, content max 100,000, bio max 280, tags max 5 x 30 chars, report details max 500, enforced on the server
- [ ] **[R]** Slug generated/validated against `[a-z0-9-]`, no path characters
- [ ] **[R]** Username and slug from URLs are looked up via ORM only
- [ ] **[R]** No raw SQL with string formatting (grep for `.raw(`, `.extra(`, `cursor.execute(f"`)
- [ ] **[R]** Search query goes through `websearch_to_tsquery` with bound parameters
- [ ] **[S]** Search query length capped (e.g. 100 chars)
- [ ] **[S]** Unicode normalization on usernames/slugs to avoid look-alike confusion

## 6. XSS and content safety

- [ ] **[R]** Markdown renderer has raw HTML **disabled**
- [ ] **[R]** Output sanitized with nh3 using an allow-list of tags and attributes
- [ ] **[R]** URL schemes allowed: `http`, `https`, `mailto`, `#anchor` only
- [ ] **[R]** Images are never embedded; `![](url)` becomes a text link
- [ ] **[R]** External links have `rel="noopener noreferrer nofollow ugc"` and `target="_blank"`
- [ ] **[R]** Wikilink rendering escapes the label and ref
- [ ] **[R]** Wikilinks inside code spans/blocks are not processed
- [ ] **[R]** Templates never use `|safe`/`mark_safe` except for renderer output
- [ ] **[R]** Frontend JS never uses `innerHTML` with user-controlled strings
- [ ] **[R]** XSS payload corpus test passes (list below)
- [ ] **[S]** Titles, tags, usernames, bios are escaped in every context (HTML, attribute, JS, URL, `<title>`, meta, JSON-LD)

XSS corpus (minimum):
```
<script>alert(1)</script>
<img src=x onerror=alert(1)>
[click](javascript:alert(1))
[click](JaVaScRiPt:alert(1))
[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)
![x](javascript:alert(1))
<svg onload=alert(1)>
<a href="x" onmouseover="alert(1)">x</a>
[[<script>alert(1)</script>]]
[[prereq:"><img src=x onerror=alert(1)>]]
```py with a stray "```" and html after it
<iframe src="//evil.example"></iframe>
```
Every payload must render as inert text or a safe link.

## 7. CSRF

- [ ] **[R]** Django CSRF middleware enabled for all HTML forms
- [ ] **[R]** FastAPI mutating endpoints verify `X-CSRFToken` against the cookie/session
- [ ] **[R]** No state-changing GET requests (logout, delete, hide are POST/DELETE)
- [ ] **[R]** `CSRF_TRUSTED_ORIGINS` set to the real origin only
- [ ] **[R]** CORS is **disabled** (API is same-origin)
- [ ] **[R]** Test: mutating API call without a token returns 403

## 8. Security headers and transport

- [ ] **[R]** HTTPS everywhere; HTTP redirects to HTTPS
- [ ] **[R]** `Strict-Transport-Security` (start with 1 week, move to 1 year after verifying)
- [ ] **[R]** `Content-Security-Policy` without `unsafe-inline` and without `unsafe-eval`:
  ```
  default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
  font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self';
  form-action 'self' https://github.com; frame-ancestors 'none'
  ```
  (`form-action` includes GitHub only if the OAuth redirect needs it)
- [ ] **[R]** `X-Content-Type-Options: nosniff`
- [ ] **[R]** `Referrer-Policy: strict-origin-when-cross-origin` (or `same-origin`)
- [ ] **[R]** `X-Frame-Options: DENY` / `frame-ancestors 'none'`
- [ ] **[R]** `Permissions-Policy` disabling camera, mic, geolocation, etc.
- [ ] **[S]** Check with securityheaders.com and Mozilla Observatory, target A or better
- [ ] **[S]** `Cache-Control: private, no-store` on authenticated pages and all API responses

## 9. Rate limiting and abuse

- [ ] **[R]** Limits from ARCHITECTURE.md section 12 implemented and tested (search, writes, render, reports, global per IP)
- [ ] **[R]** Per-user caps: max notes per user (e.g. 5,000), max revisions kept per note (100)
- [ ] **[R]** Request body size limit at proxy (e.g. 1 MB) and in app
- [ ] **[R]** Reading-path limits enforced (depth 20, nodes 200)
- [ ] **[R]** Pagination limits enforced (`limit <= 50`)
- [ ] **[S]** New-account limits: a very new account can have at most N public notes per day (spam brake)
- [ ] **[S]** Duplicate-report suppression (same user + note)
- [ ] **[S]** Expensive endpoints (`/render`) cached by content hash

## 10. Link and URL safety

- [ ] **[R]** The server never fetches user-provided URLs (no link previews, no image proxies in V1) so there is no SSRF surface
- [ ] **[R]** No automatic loading of remote images, scripts, or iframes from user content
- [ ] **[S]** Consider an interstitial or domain display for external links later (phishing)
- [ ] **[S]** Block obviously malicious domains via a small deny-list managed in admin

## 11. Admin panel

- [ ] **[R]** Admin path is secret, from env (`ADMIN_PATH`), not `/admin/`
- [ ] **[R]** Only `is_staff` users can enter; staff are created by command, never via OAuth
- [ ] **[R]** Staff login requires password + TOTP (django-otp)
- [ ] **[R]** Strong password policy for staff
- [ ] **[R]** Admin actions (hide, ban, delete) are logged in `django_admin_log`
- [ ] **[R]** Admin never shows or edits `content_md` of private notes unless handling a report about that note (and then only for public notes: reports exist only for public notes)
- [ ] **[S]** Admin access restricted by IP allow-list or VPN if feasible
- [ ] **[S]** Separate staff account from the personal developer account

## 12. Data protection and privacy

- [ ] **[R]** Minimal data: GitHub ID, username, bio, notes. No email, no IP storage beyond logs
- [ ] **[R]** Account deletion actually deletes notes, revisions, links, reports filed (verified by test)
- [ ] **[R]** Export includes everything the user owns
- [ ] **[R]** Logs never contain note content, session ids, OAuth codes, or tokens
- [ ] **[R]** Log retention limited (e.g. 14-30 days)
- [ ] **[R]** Privacy page says plainly: what is collected, what is public, what is private, how to delete
- [ ] **[R]** No third-party analytics or trackers
- [ ] **[R]** Backups are encrypted and access-restricted; deleted accounts disappear from backups within the retention window (stated in Privacy page)
- [ ] **[S]** Optional encryption at rest for `content_md` of private notes (field-level) as a later hardening step
- [ ] **[S]** Sentry configured with `send_default_pii = False` and body scrubbing

## 13. Database

- [ ] **[R]** App uses a least-privilege DB role (no superuser, no DDL at runtime; migrations use a separate role)
- [ ] **[R]** DB not exposed to the internet; only reachable from the app network
- [ ] **[R]** Strong, unique DB password from env
- [ ] **[R]** `CHECK` constraints for `visibility`, `moderation`, `link_type`
- [ ] **[R]** Nightly backup, tested restore documented
- [ ] **[S]** TLS between app and DB if they are on different hosts

## 14. Secrets and configuration

- [ ] **[R]** `SECRET_KEY` long, random, unique per environment, from env
- [ ] **[R]** `DEBUG=False` in production (verified by a test or startup check)
- [ ] **[R]** `ALLOWED_HOSTS` set to exact domains
- [ ] **[R]** No secrets in git history (run `gitleaks` or `trufflehog` once on the repo)
- [ ] **[R]** `.env` in `.gitignore`; `.env.example` has no real values
- [ ] **[R]** GitHub OAuth client secret rotated if ever exposed
- [ ] **[R]** `manage.py check --deploy` passes with no warnings
- [ ] **[S]** Secrets in the host's secret manager rather than plain files

## 15. Dependencies and supply chain

- [ ] **[R]** Versions pinned; lockfile committed
- [ ] **[R]** `pip-audit` and `npm audit` run in CI; high/critical findings block merge
- [ ] **[R]** Dependencies reviewed before adding (maintained, popular, necessary)
- [ ] **[R]** Frontend loads **no** third-party scripts or styles at runtime
- [ ] **[S]** Dependabot or Renovate enabled
- [ ] **[S]** Docker base image pinned by digest, rebuilt monthly

## 16. Server and deployment

- [ ] **[R]** Firewall: only 80, 443, and SSH
- [ ] **[R]** SSH key-only, root login disabled, fail2ban or equivalent
- [ ] **[R]** App runs as a non-root user in the container
- [ ] **[R]** Automatic security updates for the OS
- [ ] **[R]** Caddy/proxy sets body size limits and timeouts
- [ ] **[R]** Static files served with correct content types; user content is never served as a file
- [ ] **[S]** Read-only container filesystem where possible
- [ ] **[S]** Uptime monitoring and alerting

## 17. Logging, monitoring, incident response

- [ ] **[R]** Structured logs: request id, user id, path, status, duration
- [ ] **[R]** Alert on spikes of 4xx/5xx and rate-limit hits
- [ ] **[S]** Log admin actions and bans for audit
- [ ] **[R]** Written incident plan (one page):
  1. Contain: disable sign-in or the affected feature, rotate secrets
  2. Assess: what data, which users, since when
  3. Fix and deploy
  4. Notify affected users plainly and promptly
  5. Write a short post-mortem, add a regression test

## 18. Pre-launch security run

Do these once, manually, in order.

1. [ ] Run the full test suite including `tests/security`
2. [ ] Run `manage.py check --deploy`
3. [ ] Run `pip-audit`, `npm audit`, `gitleaks`
4. [ ] Test with two real accounts: try to read, edit, delete the other's private note by ID guessing and URL tampering
5. [ ] Paste every payload from the XSS corpus into a real note, view as owner and as another user
6. [ ] Try CSRF: submit a delete from a local HTML page while logged in
7. [ ] Check headers on securityheaders.com
8. [ ] Try to reach `/admin/` (must 404) and the secret admin path without 2FA (must fail)
9. [ ] Confirm banned user flow: ban from admin, verify session killed and notes hidden
10. [ ] Delete a test account, verify rows are gone
11. [ ] Restore a backup to a scratch database and open it
12. [ ] Confirm no secrets or note text appear in the last 1,000 log lines

## 19. Ongoing

- Monthly: dependency updates, `pip-audit`, review admin log, check backups restore
- On every release: security tests in CI, review of new endpoints against section 3 and 4
- Before adding a Future feature (anonymous alias, Q&A, ratings): do a new threat model first. Anonymity especially needs its own review of correlation risks (timing, writing style, GitHub ID linkage) and abuse controls.

## 20. Sign-off

| Check | Date | By |
|-------|------|----|
| All [R] items ticked | | |
| Leak matrix green in CI | | |
| Pre-launch run complete | | |
| Restore test complete | | |
