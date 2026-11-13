from django.conf import settings
from django.db import models


class Report(models.Model):
    REASON_CHOICES = [
        ("spam", "Spam"),
        ("abuse", "Abuse"),
        ("copyright", "Copyright"),
        ("other", "Other"),
    ]
    STATUS_CHOICES = [
        ("open", "Open"),
        ("actioned", "Actioned"),
        ("dismissed", "Dismissed"),
    ]

    note = models.ForeignKey(
        "notes.Note",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reports",
    )
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reports_filed",
    )
    reason = models.CharField(max_length=12, choices=REASON_CHOICES)
    details = models.CharField(max_length=500, blank=True, default="")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="open")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reports_reviewed",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reports"
        indexes = [
            models.Index(fields=["status", "-created_at"], name="reports_status_idx"),
        ]

    def __str__(self) -> str:
        note_title = self.note.title if self.note else "deleted note"
        return f"Report({self.reason}) on {note_title} [{self.status}]"

