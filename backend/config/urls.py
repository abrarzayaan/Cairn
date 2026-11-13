from django.conf import settings
from django.contrib import admin
from django.shortcuts import render
from django.urls import include, path


def home_view(request):
    return render(request, "home.html")


urlpatterns = [
    path(f"{settings.ADMIN_PATH}/", admin.site.urls),
    path("", include("apps.accounts.urls")),
    path("accounts/", include("allauth.urls")),
    path("", home_view, name="home"),
]
