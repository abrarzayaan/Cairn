import django.db.models.deletion
import django.db.models.functions.text
from django.conf import settings
from django.db import migrations, models

DEFAULT_CATEGORIES = [
    ("Backend", "backend", "APIs, servers, architecture, authentication, and backend engineering."),
    ("Frontend", "frontend", "UI engineering, React, Next.js, CSS, and browser internals."),
    ("Database", "database", "SQL, PostgreSQL, indexing, query tuning, and data modeling."),
    ("DevOps", "devops", "Containers, CI/CD, Linux, networking, and deployment."),
    ("Systems", "systems", "Operating systems, compilers, concurrency, and low-level programming."),
    ("CS Fundamentals", "cs-fundamentals", "Algorithms, data structures, networking, and computer science basics."),
    ("AI & ML", "ai-ml", "Machine learning, LLMs, embeddings, and applied AI engineering."),
    ("General", "general", "Developer workflows, tooling, debugging logs, and general notes."),
]
DEFAULT_SLUGS = {slug for _, slug, _ in DEFAULT_CATEGORIES}


def deduplicate_categories_and_build_shelves(apps, schema_editor):
    Category = apps.get_model("notes", "Category")
    UserCategory = apps.get_model("notes", "UserCategory")
    Book = apps.get_model("notes", "Book")

    # Group all existing per-user categories by canonical slug
    canonical_by_slug = {}
    all_cats = list(Category.objects.all().order_by("id"))

    for cat in all_cats:
        slug_key = cat.slug.strip().lower()
        canonical = canonical_by_slug.get(slug_key)
        if canonical is None:
            cat.slug = slug_key
            cat.is_default = slug_key in DEFAULT_SLUGS
            cat.save(update_fields=["slug", "is_default"])
            canonical_by_slug[slug_key] = cat
            canonical = cat

        # Re-link any books pointing to duplicate category rows
        if cat.id != canonical.id:
            Book.objects.filter(category_id=cat.id).update(category_id=canonical.id)

        # Lazily create UserCategory shelf ONLY if the user has books in it OR created a custom category
        author_id = getattr(cat, "author_id", None)
        if author_id is not None:
            has_books = Book.objects.filter(author_id=author_id, category_id=canonical.id).exists()
            is_custom = slug_key not in DEFAULT_SLUGS
            if has_books or is_custom:
                UserCategory.objects.get_or_create(
                    user_id=author_id,
                    category_id=canonical.id,
                    defaults={"description": cat.description or ""},
                )

        if cat.id != canonical.id:
            cat.delete()

    # Clear author on surviving canonical rows before removing the field
    Category.objects.update(author=None)

    # Ensure the 8 global default categories exist once (is_default=True)
    for name, slug, description in DEFAULT_CATEGORIES:
        cat, created = Category.objects.get_or_create(
            slug=slug,
            defaults={"name": name, "description": description, "is_default": True},
        )
        if not created and not cat.is_default:
            cat.is_default = True
            cat.save(update_fields=["is_default"])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("notes", "0004_user_scoped_categories_and_publish_state"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Create lazy personal shelf table user_categories
        migrations.CreateModel(
            name="UserCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("description", models.CharField(blank=True, default="", max_length=200)),
                ("sort_order", models.SmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "category",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="user_shelves",
                        to="notes.category",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="desk_categories",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "user_categories",
                "ordering": ["sort_order", "category__name"],
            },
        ),
        migrations.AddConstraint(
            model_name="usercategory",
            constraint=models.UniqueConstraint(
                fields=("user", "category"),
                name="user_categories_user_cat_unique",
            ),
        ),
        migrations.AddIndex(
            model_name="usercategory",
            index=models.Index(fields=["user", "sort_order"], name="user_categories_user_idx"),
        ),
        # 2. Prepare Category for global canonical deduplication
        migrations.AddField(
            model_name="category",
            name="is_default",
            field=models.BooleanField(default=False),
        ),
        migrations.RemoveConstraint(
            model_name="category",
            name="categories_author_slug_unique",
        ),
        migrations.RemoveConstraint(
            model_name="category",
            name="categories_author_name_lower_idx",
        ),
        migrations.RemoveIndex(
            model_name="category",
            name="categories_author_idx",
        ),
        migrations.AlterField(
            model_name="category",
            name="author",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="categories",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # 3. Deduplicate categories & build lazy user_categories shelves
        migrations.RunPython(
            deduplicate_categories_and_build_shelves,
            reverse_noop,
        ),
        # 4. Drop Category.author and enforce global uniqueness on slug & lower(name)
        migrations.RemoveField(
            model_name="category",
            name="author",
        ),
        migrations.AlterField(
            model_name="category",
            name="slug",
            field=models.CharField(max_length=70, unique=True),
        ),
        migrations.AddConstraint(
            model_name="category",
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower("name"),
                name="categories_name_lower_unique",
            ),
        ),
        migrations.AddIndex(
            model_name="category",
            index=models.Index(fields=["is_default", "name"], name="categories_default_name_idx"),
        ),
    ]
