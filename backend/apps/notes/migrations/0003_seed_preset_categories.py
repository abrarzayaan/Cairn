from django.db import migrations

PRESET_CATEGORIES = [
    ("Backend", "backend", "APIs, servers, architecture, authentication, and backend engineering."),
    ("Frontend", "frontend", "UI engineering, React, Next.js, CSS, and browser internals."),
    ("Database", "database", "SQL, PostgreSQL, indexing, query tuning, and data modeling."),
    ("DevOps", "devops", "Containers, CI/CD, Linux, networking, and deployment."),
    ("Systems", "systems", "Operating systems, compilers, concurrency, and low-level programming."),
    ("CS Fundamentals", "cs-fundamentals", "Algorithms, data structures, networking, and computer science basics."),
    ("AI & ML", "ai-ml", "Machine learning, LLMs, embeddings, and applied AI engineering."),
    ("General", "general", "Developer workflows, tooling, debugging logs, and general notes."),
]


def seed_categories(apps, schema_editor):
    Category = apps.get_model("notes", "Category")
    for name, slug, description in PRESET_CATEGORIES:
        Category.objects.get_or_create(
            slug=slug,
            defaults={"name": name, "description": description},
        )


def unseed_categories(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("notes", "0002_category_note_sequence_book_note_book_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_categories, unseed_categories),
    ]

