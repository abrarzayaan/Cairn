import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import django.db.models.functions.text


def migrate_existing_categories_and_seed_starters(apps, schema_editor):
    Category = apps.get_model("notes", "Category")
    Book = apps.get_model("notes", "Book")
    User = apps.get_model("accounts", "User")

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

    # For each user, seed starter categories
    for user in User.objects.all():
        for name, slug, description in PRESET_CATEGORIES:
            Category.objects.get_or_create(
                author=user,
                slug=slug,
                defaults={"name": name, "description": description},
            )

    # Re-link existing books to their author's personal category
    for book in Book.objects.select_related("category", "author").all():
        old_cat = book.category
        if old_cat and getattr(old_cat, "author_id", None) != book.author_id:
            user_cat = Category.objects.filter(author=book.author, slug=old_cat.slug).first()
            if not user_cat:
                user_cat = Category.objects.create(
                    author=book.author,
                    name=old_cat.name,
                    slug=old_cat.slug,
                    description=old_cat.description,
                )
            book.category = user_cat
            book.save(update_fields=["category"])

    # Remove global categories that have no author
    Category.objects.filter(author__isnull=True).delete()


def reverse_migrate_categories(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("notes", "0003_seed_preset_categories"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Add author to Category as nullable first
        migrations.AddField(
            model_name="category",
            name="author",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="categories",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # 2. Add is_published to Book and Note
        migrations.AddField(
            model_name="book",
            name="is_published",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="note",
            name="is_published",
            field=models.BooleanField(default=False),
        ),
        # 3. Data migration: assign categories to authors and seed starters
        migrations.RunPython(
            migrate_existing_categories_and_seed_starters,
            reverse_migrate_categories,
        ),
        # 4. Make Category.author non-nullable
        migrations.AlterField(
            model_name="category",
            name="author",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="categories",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # 5. Remove unique constraints on name and slug alone
        migrations.AlterField(
            model_name="category",
            name="name",
            field=models.CharField(max_length=60),
        ),
        migrations.AlterField(
            model_name="category",
            name="slug",
            field=models.CharField(max_length=70),
        ),
        # 6. Add indexes and constraints on Category
        migrations.AddIndex(
            model_name="category",
            index=models.Index(fields=["author", "name"], name="categories_author_idx"),
        ),
        migrations.AddConstraint(
            model_name="category",
            constraint=models.UniqueConstraint(
                fields=("author", "slug"),
                name="categories_author_slug_unique",
            ),
        ),
        migrations.AddConstraint(
            model_name="category",
            constraint=models.UniqueConstraint(
                "author",
                django.db.models.functions.text.Lower("name"),
                name="categories_author_name_lower_idx",
            ),
        ),
        # 7. Add published indexes and constraints on Book
        migrations.AddIndex(
            model_name="book",
            index=models.Index(
                condition=models.Q(visibility="public", is_published=True, moderation="ok"),
                fields=["-updated_at"],
                name="books_published_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="book",
            constraint=models.CheckConstraint(
                condition=models.Q(visibility="public") | models.Q(is_published=False),
                name="books_published_requires_public_check",
            ),
        ),
        # 8. Add published indexes and constraints on Note
        migrations.AddIndex(
            model_name="note",
            index=models.Index(
                condition=models.Q(visibility="public", is_published=True, moderation="ok"),
                fields=["-updated_at"],
                name="notes_published_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="note",
            constraint=models.CheckConstraint(
                condition=models.Q(visibility="public") | models.Q(is_published=False),
                name="notes_published_requires_public_check",
            ),
        ),
    ]

