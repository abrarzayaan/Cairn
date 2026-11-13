from django.conf import settings
from django.urls import include, path

from apps.moderation.admin import cairn_admin_site

urlpatterns = [
    path(f"{settings.ADMIN_PATH}/", cairn_admin_site.urls),
    path("accounts/", include("allauth.urls")),
]
