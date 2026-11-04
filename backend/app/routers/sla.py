"""SLA router — manual check trigger."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import User
from app.services.sla import run_sla_check

router = APIRouter(prefix="/sla", tags=["SLA"])


@router.get("/check")
async def check_sla(
    db: AsyncSession = Depends(get_db),
    _: User = require_roles(["Manager", "Admin"]),
):
    """
    Manually trigger SLA check across all open complaints.
    Writes SLAEvent records idempotently (ON CONFLICT DO NOTHING).
    Returns:
      { checked, new_events, breached, near_breach, escalated }
    """
    stats = await run_sla_check(db)
    return {"status": "ok", "stats": stats}
