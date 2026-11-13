from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError
from django.db import transaction

from apps.accounts.models import User
from apps.moderation.models import Report
from apps.notes.models import Note

VALID_REPORT_REASONS = {"spam", "abuse", "copyright", "other"}


def create_report(
    *,
    reporter: User,
    note_id: int,
    reason: str,
    details: str = "",
) -> Report:
    """Create a moderation report against a public note."""
    clean_reason = (reason or "").strip().lower()
    if clean_reason not in VALID_REPORT_REASONS:
        raise ValidationError("Invalid report reason.")

    clean_details = (details or "").strip()
    if len(clean_details) > 500:
        raise ValidationError("Report details must be at most 500 characters.")

    note = Note.objects.select_related("author").get(
        pk=note_id,
        visibility="public",
        moderation="ok",
        author__is_banned=False,
    )

    if Report.objects.filter(note=note, reporter=reporter, status="open").exists():
        raise ValidationError("You have already reported this note.")

    return Report.objects.create(
        note=note,
        reporter=reporter,
        reason=clean_reason,
        details=clean_details,
    )


def hide_note(note: Note, reason: str) -> Note:
    """Hide a note from public surfaces with a moderation reason."""
    clean_reason = (reason or "").strip()
    if not clean_reason:
        raise ValidationError("A reason is required to hide a note.")
    note.moderation = "hidden"
    note.moderation_note = clean_reason
    note.save(update_fields=["moderation", "moderation_note"])
    return note


def unhide_note(note: Note) -> Note:
    """Restore a hidden note to 'ok'."""
    note.moderation = "ok"
    note.moderation_note = ""
    note.save(update_fields=["moderation", "moderation_note"])
    return note


def invalidate_user_sessions(user: User) -> int:
    """Delete all active Django sessions belonging to `user`."""
    target_id = str(user.pk)
    deleted = 0
    for session in Session.objects.iterator():
        try:
            data = session.get_decoded()
        except Exception:
            continue
        if str(data.get("_auth_user_id")) == target_id:
            session.delete()
            deleted += 1
    return deleted


@transaction.atomic
def ban_user(user: User, reason: str) -> User:
    """Ban a user with a reason and invalidate all of their active sessions."""
    clean_reason = (reason or "").strip()
    if not clean_reason:
        raise ValidationError("A reason is required to ban a user.")
    user.is_banned = True
    user.banned_reason = clean_reason
    user.save(update_fields=["is_banned", "banned_reason"])
    invalidate_user_sessions(user)
    return user


def unban_user(user: User) -> User:
    """Unban a previously banned user."""
    user.is_banned = False
    user.banned_reason = ""
    user.save(update_fields=["is_banned", "banned_reason"])
    return user

