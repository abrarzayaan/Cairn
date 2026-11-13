from django.contrib import admin, messages

from apps.accounts.models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("username", "github_id", "is_banned", "is_staff", "created_at")
    list_filter = ("is_banned", "is_staff", "created_at")
    search_fields = ("username", "github_id")
    actions = ["ban_users", "unban_users"]

    @admin.action(description="Ban selected users")
    def ban_users(self, request, queryset):
        count = queryset.update(is_banned=True)
        self.message_user(request, f"{count} user(s) banned.", messages.WARNING)

    @admin.action(description="Unban selected users")
    def unban_users(self, request, queryset):
        count = queryset.update(is_banned=False, banned_reason="")
        self.message_user(request, f"{count} user(s) unbanned.", messages.SUCCESS)
