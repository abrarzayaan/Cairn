from fastapi import APIRouter, Depends, Query

from api.deps import require_user, verify_csrf
from api.rate_limit import render_rate_limiter
from api.schemas.notes import RenderIn, RenderLinkOut, RenderOut, TitleSuggestionOut
from apps.accounts.models import User
from apps.notes.markdown import render_markdown
from apps.notes.models import Note
from apps.notes.services.links import get_link_status

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
        links=[
            RenderLinkOut(
                target_ref=ref,
                link_type=ltype,
                status=get_link_status(user, ref),
            )
            for ref, ltype in links
        ],
    )


@router.get("/titles", response_model=list[TitleSuggestionOut])
def list_own_titles(
    q: str = Query(default="", max_length=120),
    user: User = Depends(require_user),
):
    """Return the authenticated user's own note titles for [[ wikilink autocomplete."""
    qs = Note.objects.filter(author=user)
    if q.strip():
        qs = qs.filter(title__icontains=q.strip())
    notes = qs.order_by("-updated_at")[:20]
    return [
        TitleSuggestionOut(
            id=n.id,
            title=n.title,
            slug=n.slug,
            visibility=n.visibility,
        )
        for n in notes
    ]

