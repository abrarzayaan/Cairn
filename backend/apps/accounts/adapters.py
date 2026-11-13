from allauth.account.adapter import DefaultAccountAdapter
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.shortcuts import render

from apps.accounts.models import User


class CustomAccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        # Normal email/password signup is disabled
        return False


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        if sociallogin.account.provider != "github":
            return

        try:
            github_id = int(sociallogin.account.uid)
        except (ValueError, TypeError):
            github_id = None

        if github_id is None:
            return

        # 1. Look up existing user by numeric GitHub ID
        user = User.objects.filter(github_id=github_id).first()

        github_login = (
            sociallogin.account.extra_data.get("login")
            or sociallogin.account.extra_data.get("username")
            or ""
        ).strip()

        if user:
            # Block banned users
            if user.is_banned:
                response = render(
                    request,
                    "accounts/banned.html",
                    {"reason": user.banned_reason},
                    status=403,
                )
                raise ImmediateHttpResponse(response)

            # Sync username if changed and the new one is available
            if github_login and user.username.lower() != github_login.lower():
                is_taken = (
                    User.objects.filter(username__iexact=github_login).exclude(pk=user.pk).exists()
                )
                if not is_taken:
                    user.username = github_login
                    user.save(update_fields=["username", "updated_at"])

            if not sociallogin.is_existing:
                sociallogin.connect(request, user)

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)
        try:
            user.github_id = int(sociallogin.account.uid)
        except (ValueError, TypeError):
            pass

        github_login = (
            sociallogin.account.extra_data.get("login")
            or data.get("username")
            or f"user_{user.github_id}"
        ).strip()

        final_username = github_login
        counter = 1
        while User.objects.filter(username__iexact=final_username).exists():
            final_username = f"{github_login}_{counter}"
            counter += 1

        user.username = final_username
        return user
