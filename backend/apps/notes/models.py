from django.conf import settings
from django.contrib.postgres.search import SearchVectorField
from django.db import models
from django.db.models.functions import Lower


class Tag(models.Model):
    name = models.CharField(max_length=30, unique=True)  # lowercase, a-z0-9-

    class Meta:
        db_table = "tags"

    def __str__(self):
        return f"#{self.name}"


class Category(models.Model):
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="categories",
    )
    name = models.CharField(max_length=60)
    slug = models.CharField(max_length=70)
    description = models.CharField(max_length=200, default="", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "categories"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["author", "slug"],
                name="categories_author_slug_unique",
            ),
            models.UniqueConstraint(
                "author",
                Lower("name"),
                name="categories_author_name_lower_idx",
            ),
        ]
        indexes = [
            models.Index(fields=["author", "name"], name="categories_author_idx"),
        ]

    def __str__(self):
        return f"{self.name} (@{self.author.username})"


class Book(models.Model):
    VISIBILITY_CHOICES = [
        ("public", "Public"),
        ("private", "Private"),
    ]
    MODERATION_CHOICES = [
        ("ok", "OK"),
        ("hidden", "Hidden"),
    ]

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="books",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="books",
    )
    title = models.CharField(max_length=120)
    slug = models.CharField(max_length=140)
    description = models.CharField(max_length=400, default="", blank=True)
    visibility = models.CharField(
        max_length=10,
        default="private",
        choices=VISIBILITY_CHOICES,
    )
    is_published = models.BooleanField(default=False)
    moderation = models.CharField(
        max_length=10,
        default="ok",
        choices=MODERATION_CHOICES,
    )
    moderation_note = models.TextField(default="", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "books"
        constraints = [
            models.UniqueConstraint(
                fields=["author", "slug"],
                name="books_author_slug_unique",
            ),
            models.CheckConstraint(
                condition=models.Q(visibility__in=["public", "private"]),
                name="books_visibility_check",
            ),
            models.CheckConstraint(
                condition=models.Q(visibility="public") | models.Q(is_published=False),
                name="books_published_requires_public_check",
            ),
            models.CheckConstraint(
                condition=models.Q(moderation__in=["ok", "hidden"]),
                name="books_moderation_check",
            ),
        ]
        indexes = [
            models.Index(fields=["author", "-updated_at"], name="books_author_idx"),
            models.Index(fields=["category", "-updated_at"], name="books_category_idx"),
            models.Index(
                fields=["-updated_at"],
                name="books_published_idx",
                condition=models.Q(visibility="public", is_published=True, moderation="ok"),
            ),
        ]

    def __str__(self):
        return f"{self.title} (@{self.author.username})"


class Note(models.Model):
    VISIBILITY_CHOICES = [
        ("public", "Public"),
        ("private", "Private"),
    ]
    MODERATION_CHOICES = [
        ("ok", "OK"),
        ("hidden", "Hidden"),
    ]

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    book = models.ForeignKey(
        Book,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notes",
    )
    sequence = models.PositiveIntegerField(default=1)
    title = models.CharField(max_length=120)
    slug = models.CharField(max_length=140)
    content_md = models.TextField(default="", blank=True)
    content_html = models.TextField(default="", blank=True)
    summary = models.CharField(max_length=220, default="", blank=True)
    visibility = models.CharField(
        max_length=10,
        default="private",
        choices=VISIBILITY_CHOICES,
    )
    is_published = models.BooleanField(default=False)
    moderation = models.CharField(
        max_length=10,
        default="ok",
        choices=MODERATION_CHOICES,
    )
    moderation_note = models.TextField(default="", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    search_vector = SearchVectorField(null=True, blank=True)

    tags = models.ManyToManyField(
        Tag,
        through="NoteTag",
        related_name="notes",
        blank=True,
    )

    class Meta:
        db_table = "notes"
        constraints = [
            models.UniqueConstraint(
                fields=["author", "slug"],
                name="notes_author_slug_unique",
            ),
            models.UniqueConstraint(
                "author",
                Lower("title"),
                name="notes_author_title_lower_idx",
            ),
            models.CheckConstraint(
                condition=models.Q(visibility__in=["public", "private"]),
                name="notes_visibility_check",
            ),
            models.CheckConstraint(
                condition=models.Q(visibility="public") | models.Q(is_published=False),
                name="notes_published_requires_public_check",
            ),
            models.CheckConstraint(
                condition=models.Q(moderation__in=["ok", "hidden"]),
                name="notes_moderation_check",
            ),
        ]
        indexes = [
            models.Index(fields=["author", "-updated_at"], name="notes_author_idx"),
            models.Index(fields=["book", "sequence", "id"], name="notes_book_seq_idx"),
            models.Index(
                fields=["-updated_at"],
                name="notes_public_idx",
                condition=models.Q(visibility="public", moderation="ok"),
            ),
            models.Index(
                fields=["-updated_at"],
                name="notes_published_idx",
                condition=models.Q(visibility="public", is_published=True, moderation="ok"),
            ),
        ]

    def __str__(self):
        return f"{self.title} by @{self.author.username}"


class NoteTag(models.Model):
    note = models.ForeignKey(Note, on_delete=models.CASCADE)
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "note_tags"
        unique_together = (("note", "tag"),)
        indexes = [
            models.Index(fields=["tag"], name="note_tags_tag_idx"),
        ]


class NoteLink(models.Model):
    TYPE_CHOICES = [
        ("related", "Related"),
        ("prereq", "Prerequisite"),
        ("deep", "Deep Dive"),
    ]

    source = models.ForeignKey(
        Note,
        on_delete=models.CASCADE,
        related_name="outgoing_links",
    )
    target = models.ForeignKey(
        Note,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incoming_links",
    )
    target_ref = models.CharField(max_length=200)
    link_type = models.CharField(
        max_length=10,
        default="related",
        choices=TYPE_CHOICES,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "note_links"
        constraints = [
            models.UniqueConstraint(
                fields=["source", "target_ref", "link_type"],
                name="note_links_unique",
            ),
            models.CheckConstraint(
                condition=models.Q(link_type__in=["related", "prereq", "deep"]),
                name="note_links_type_check",
            ),
        ]
        indexes = [
            models.Index(fields=["target", "link_type"], name="note_links_target_idx"),
        ]

    def __str__(self):
        return f"{self.source.slug} -> {self.target_ref} ({self.link_type})"


class NoteRevision(models.Model):
    note = models.ForeignKey(
        Note,
        on_delete=models.CASCADE,
        related_name="revisions",
    )
    title = models.CharField(max_length=120)
    content_md = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "note_revisions"
        indexes = [
            models.Index(fields=["note", "-created_at"], name="note_revisions_note_idx"),
        ]

    def __str__(self):
        return f"Revision of {self.note.slug} at {self.created_at}"


class SlugHistory(models.Model):
    note = models.ForeignKey(
        Note,
        on_delete=models.CASCADE,
        related_name="slug_history",
    )
    old_slug = models.CharField(max_length=140)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="slug_history",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "slug_history"
        constraints = [
            models.UniqueConstraint(
                fields=["author", "old_slug"],
                name="slug_history_author_old_slug",
            ),
        ]

    def __str__(self):
        return f"{self.author.username}/{self.old_slug} -> {self.note.slug}"
