from fastapi import APIRouter, Depends

from api.deps import require_user, verify_csrf
from api.rate_limit import render_rate_limiter
from api.schemas.notes import RenderIn, RenderLinkOut, RenderOut
from apps.accounts.models import User
from apps.notes.markdown import render_markdown

router = APIRouter(tags=["render"])


@router.post("/render", response_model=RenderOut)
def render_preview(
    data: RenderIn,
    user: User = Depends(require_user),
    _csrf: None = Depends(verify_csrf),
):
    """Render Markdown to sanitized HTML for live editor preview (rate limited)."""
    render_rate_limiter.check(f"render:{user.id}")
    html, links = render_markdown(data.content_md)
    return RenderOut(
        html=html,
        links=[RenderLinkOut(target_ref=ref, link_type=ltype) for ref, ltype in links],
    )

