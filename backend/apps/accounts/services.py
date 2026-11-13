from django.core.exceptions import ValidationError

from apps.accounts.models import User


def update_user_bio(user: User, bio: str) -> User:
    """Update user biography. Enforces max 280 characters."""
    bio_clean = bio.strip()
    if len(bio_clean) > 280:
        raise ValidationError("Bio must be 280 characters or fewer.")

    user.bio = bio_clean
    user.save(update_fields=["bio", "updated_at"])
    return user
