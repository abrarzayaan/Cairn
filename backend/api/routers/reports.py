from datetime import datetime

from django.core.exceptions import ValidationError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from api.deps import require_user, verify_csrf
from api.rate_limit import report_rate_limiter
from apps.accounts.models import User
from apps.moderation.services import create_report
from apps.notes.models import Note

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportCreateIn(BaseModel):
    note_id: int
    reason: str = Field(..., pattern="^(spam|abuse|copyright|other)$")
    details: str = Field(default="", max_length=500)


class ReportOut(BaseModel):
    id: int
    note_id: int | None
    reason: str
    status: str
    created_at: datetime


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def submit_report(
    data: ReportCreateIn,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Submit a moderation report for a public note."""
    report_rate_limiter.check(f"report:{user.id}")
    try:
        report = create_report(
            reporter=user,
            note_id=data.note_id,
            reason=data.reason,
            details=data.details,
        )
    except Note.DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Note not found"}},
        ) from None
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "validation_error", "message": exc.message}},
        ) from exc

    return ReportOut(
        id=report.id,
        note_id=report.note_id,
        reason=report.reason,
        status=report.status,
        created_at=report.created_at,
    )

