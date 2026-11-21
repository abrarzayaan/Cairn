from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: int
    username: str
    bio: str = ""


class AuthStatus(BaseModel):
    authenticated: bool
    user: UserOut | None = None


class UpdateBioIn(BaseModel):
    bio: str = Field(..., max_length=280)


class DeleteAccountIn(BaseModel):
    confirm_username: str = Field(..., min_length=1, max_length=64)
