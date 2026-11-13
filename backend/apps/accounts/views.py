from django.contrib import messages
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.http import HttpResponseNotAllowed
from django.shortcuts import redirect, render

from apps.accounts.services import update_user_bio


def login_view(request):
    """Sign-in page."""
    if request.user.is_authenticated:
        return redirect("/")
    return render(request, "accounts/login.html")


def logout_view(request):
    """POST-only logout endpoint."""
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    logout(request)
    return redirect("/")


@login_required(login_url="/login/")
def settings_view(request):
    """User account settings (bio editing, etc.)."""
    error = None
    if request.method == "POST":
        action = request.POST.get("action", "update_bio")
        if action == "update_bio":
            bio = request.POST.get("bio", "")
            try:
                update_user_bio(request.user, bio)
                messages.success(request, "Saved")
                return redirect("/settings/")
            except ValidationError as exc:
                error = exc.message

    return render(
        request,
        "accounts/settings.html",
        {
            "user": request.user,
            "error": error,
        },
    )
