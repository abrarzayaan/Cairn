from django.contrib import admin, messages
from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.db.models import Count
from django.shortcuts import render
from django_otp.admin import OTPAdminSite
from django_otp.plugins.otp_totp.models import TOTPDevice

from apps.accounts.models import User
from apps.moderation.models import Report
from apps.moderation.services import (
    ban_user,
    hide_book,
    hide_note,
    unban_user,
    unhide_book,
    unhide_note,
)
from apps.notes.models import Book, Category, Note, NoteRevision, Tag


class CairnAdminSite(OTPAdminSite):
    site_header = "Cairn Admin"
    site_title = "Cairn Admin"
    index_title = "Moderation & Administration"


cairn_admin_site = CairnAdminSite(name="admin")


def _log_admin_change(request, obj, message: str) -> None:
    LogEntry.objects.create(
        user_id=request.user.pk,
        content_type_id=ContentType.objects.get_for_model(obj).pk,
        object_id=str(obj.pk),
        object_repr=str(obj)[:200],
        action_flag=CHANGE,
        change_message=message,
    )


def _handle_reason_action(
    modeladmin,
    request,
    queryset,
    *,
    action_name: str,
    title: str,
    description: str,
    submit_label: str,
    on_apply,
):
    """Shared intermediate-form handler for admin actions that require a reason."""
    if request.POST.get("apply"):
        reason = (request.POST.get("reason") or "").strip()
        if not reason:
            modeladmin.message_user(
                request, "A reason is required.", level=messages.ERROR
            )
            return None
        count = on_apply(queryset, reason)
        modeladmin.message_user(
            request, f"Updated {count} item(s).", level=messages.SUCCESS
        )
        return None

    return render(
        request,
        "admin/moderation/reason_action.html",
        {
            **modeladmin.admin_site.each_context(request),
            "title": title,
            "description": description,
            "queryset": queryset,
            "action_name": action_name,
            "submit_label": submit_label,
            "action_checkbox_name": admin.helpers.ACTION_CHECKBOX_NAME,
        },
    )


class UserAdmin(admin.ModelAdmin):
    list_display = ("username", "github_id", "is_banned", "is_staff", "created_at", "notes_count")
    list_filter = ("is_banned", "is_staff", "created_at")
    search_fields = ("username", "github_id")
    readonly_fields = ("created_at", "last_login")
    actions = ("action_ban_users", "action_unban_users")

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_notes_count=Count("notes"))

    @admin.display(ordering="_notes_count", description="Notes")
    def notes_count(self, obj):
        return obj._notes_count

    @admin.action(description="Ban selected users (with reason)")
    def action_ban_users(self, request, queryset):
        def apply_ban(qs, reason):
            count = 0
            for user in qs:
                ban_user(user, reason)
                _log_admin_change(request, user, f"Banned user: {reason}")
                count += 1
            return count

        return _handle_reason_action(
            self,
            request,
            queryset,
            action_name="action_ban_users",
            title="Ban selected users",
            description="Banning will invalidate all active sessions and hide their public notes.",
            submit_label="Ban users",
            on_apply=apply_ban,
        )

    @admin.action(description="Unban selected users")
    def action_unban_users(self, request, queryset):
        count = 0
        for user in queryset:
            unban_user(user)
            _log_admin_change(request, user, "Unbanned user")
            count += 1
        self.message_user(request, f"Unbanned {count} user(s).", level=messages.SUCCESS)


class NoteAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "visibility", "moderation", "updated_at")
    list_filter = ("visibility", "moderation", "updated_at")
    search_fields = ("title", "slug", "author__username")
    readonly_fields = ("created_at", "updated_at")
    actions = ("action_hide_notes", "action_unhide_notes")

    def get_fields(self, request, obj=None):
        fields = [
            "author",
            "title",
            "slug",
            "visibility",
            "moderation",
            "moderation_note",
            "created_at",
            "updated_at",
        ]
        # Never expose private note content in admin (SECURITY_CHECK.md)
        if obj is None or obj.visibility == "public":
            fields.insert(3, "content_md")
        return fields

    @admin.action(description="Hide selected notes (with reason)")
    def action_hide_notes(self, request, queryset):
        def apply_hide(qs, reason):
            count = 0
            for note in qs:
                hide_note(note, reason)
                _log_admin_change(request, note, f"Hid note: {reason}")
                count += 1
            return count

        return _handle_reason_action(
            self,
            request,
            queryset,
            action_name="action_hide_notes",
            title="Hide selected notes",
            description="Hidden notes return 404 to everyone except the author.",
            submit_label="Hide notes",
            on_apply=apply_hide,
        )

    @admin.action(description="Unhide selected notes")
    def action_unhide_notes(self, request, queryset):
        count = 0
        for note in queryset:
            unhide_note(note)
            _log_admin_change(request, note, "Unhid note")
            count += 1
        self.message_user(request, f"Unhid {count} note(s).", level=messages.SUCCESS)


class ReportAdmin(admin.ModelAdmin):
    list_display = ("note", "reason", "status", "reporter", "created_at")
    list_filter = ("status", "reason", "created_at")
    search_fields = ("note__title", "reporter__username", "details")
    readonly_fields = ("created_at",)
    actions = ("action_mark_actioned", "action_dismiss", "action_hide_note_and_action")

    @admin.action(description="Mark selected reports as actioned")
    def action_mark_actioned(self, request, queryset):
        updated = queryset.update(status="actioned", reviewed_by=request.user)
        self.message_user(request, f"Marked {updated} report(s) actioned.")

    @admin.action(description="Dismiss selected reports")
    def action_dismiss(self, request, queryset):
        updated = queryset.update(status="dismissed", reviewed_by=request.user)
        self.message_user(request, f"Dismissed {updated} report(s).")

    @admin.action(description="Hide reported note and mark actioned (with reason)")
    def action_hide_note_and_action(self, request, queryset):
        def apply_hide_and_action(qs, reason):
            count = 0
            for report in qs.select_related("note"):
                if report.note:
                    hide_note(report.note, reason)
                    _log_admin_change(
                        request, report.note, f"Hid note via report #{report.id}: {reason}"
                    )
                report.status = "actioned"
                report.reviewed_by = request.user
                report.save(update_fields=["status", "reviewed_by"])
                _log_admin_change(request, report, f"Report actioned: {reason}")
                count += 1
            return count

        return _handle_reason_action(
            self,
            request,
            queryset,
            action_name="action_hide_note_and_action",
            title="Hide reported note(s) and mark actioned",
            description="Enter the moderation reason shown to the note author.",
            submit_label="Hide note & mark actioned",
            on_apply=apply_hide_and_action,
        )


class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "usage_count")
    search_fields = ("name",)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_usage_count=Count("notetag"))

    @admin.display(ordering="_usage_count", description="Notes")
    def usage_count(self, obj):
        return obj._usage_count


class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "books_count", "created_at")
    search_fields = ("name", "slug")
    readonly_fields = ("created_at",)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_books_count=Count("books"))

    @admin.display(ordering="_books_count", description="Books")
    def books_count(self, obj):
        return obj._books_count


class BookAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "author", "visibility", "moderation", "updated_at")
    list_filter = ("visibility", "moderation", "category", "updated_at")
    search_fields = ("title", "slug", "author__username", "category__name")
    readonly_fields = ("created_at", "updated_at")
    actions = ("action_hide_books", "action_unhide_books")

    def get_fields(self, request, obj=None):
        fields = [
            "author",
            "category",
            "title",
            "slug",
            "visibility",
            "moderation",
            "moderation_note",
            "created_at",
            "updated_at",
        ]
        # Never expose private book details in admin
        if obj is None or obj.visibility == "public":
            fields.insert(4, "description")
        return fields

    @admin.action(description="Hide selected books (with reason)")
    def action_hide_books(self, request, queryset):
        def apply_hide(qs, reason):
            count = 0
            for book in qs:
                hide_book(book, reason)
                _log_admin_change(request, book, f"Hid book: {reason}")
                count += 1
            return count

        return _handle_reason_action(
            self,
            request,
            queryset,
            action_name="action_hide_books",
            title="Hide selected books",
            description="Hidden books and all of their chapters return 404 to everyone except the author.",
            submit_label="Hide books",
            on_apply=apply_hide,
        )

    @admin.action(description="Unhide selected books")
    def action_unhide_books(self, request, queryset):
        count = 0
        for book in queryset:
            unhide_book(book)
            _log_admin_change(request, book, "Unhid book")
            count += 1
        self.message_user(request, f"Unhid {count} book(s).", level=messages.SUCCESS)


class NoteRevisionAdmin(admin.ModelAdmin):
    list_display = ("id", "note", "created_at")
    readonly_fields = ("note", "content_md", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


cairn_admin_site.register(User, UserAdmin)
cairn_admin_site.register(Category, CategoryAdmin)
cairn_admin_site.register(Book, BookAdmin)
cairn_admin_site.register(Note, NoteAdmin)
cairn_admin_site.register(Report, ReportAdmin)
cairn_admin_site.register(Tag, TagAdmin)
cairn_admin_site.register(NoteRevision, NoteRevisionAdmin)
cairn_admin_site.register(TOTPDevice)

