# Cairn

Linked notes for developers. Write what you learn. Link what depends on what.

Cairn is a developer notebook where every note can link to the concepts it depends on (`[[prereq:Concept]]`), so any topic can be revised fast and any newcomer gets a clear, automatic reading order. Notes can be public or private.

## Architecture

- **Django**: Models, migrations, admin panel, session auth.
- **FastAPI**: Mounted inside the Django ASGI application under `/api/v1` for typed JSON APIs (editor, search, previews).
- **Next.js**: Modern App Router frontend in `frontend/` with TypeScript, Tailwind CSS, and Lucide icons.
- **PostgreSQL 16**: Relational storage, full-text search (`search_vector` with `simple` config), and trigram similarity (`pg_trgm`).

## Documentation

Full project specifications and technical rules are available in the `docs/` directory:
- [PRD.md](docs/PRD.md): Product requirements, user stories, and visibility matrix.
- [ARCHITECTURE.md](docs/ARCHITECTURE.md): System architecture, schema, APIs, and algorithms.
- [DESIGN.md](docs/DESIGN.md): Design tokens, typography, layouts, and components.
- [RULES.md](docs/RULES.md): Coding standards, security rules, and contributor guidelines.
- [SECURITY_CHECK.md](docs/SECURITY_CHECK.md): Security checklist and leak prevention tests.
- [TASK.md](docs/TASK.md): Step-by-step milestone execution plan.

## Development Setup

See `TASK.md` for current milestone progress.
