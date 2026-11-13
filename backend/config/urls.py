from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path


def home_view(request):
    return HttpResponse("devbook")


urlpatterns = [
    path(f"{settings.ADMIN_PATH}/", admin.site.urls),
    path("accounts/", include("allauth.urls")),
    path("", home_view, name="home"),
]
