from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models.functions import Lower


class UserManager(BaseUserManager):
    def create_user(self, username, github_id=None, password=None, **extra_fields):
        if not username:
            raise ValueError("The Username field must be set")
        user = self.model(username=username, github_id=github_id, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, username, github_id=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not github_id:
            # Generate a negative id for staff created via CLI if not provided
            github_id = -1
        return self.create_user(username, github_id=github_id, password=password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    github_id = models.BigIntegerField(unique=True, null=True, blank=True)
    username = models.CharField(max_length=39, unique=True)
    bio = models.CharField(max_length=280, default="", blank=True)
    is_banned = models.BooleanField(default=False)
    banned_reason = models.TextField(default="", blank=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "users"
        indexes = [
            models.Index(Lower("username"), name="users_username_lower_idx"),
        ]

    def __str__(self):
        return self.username
