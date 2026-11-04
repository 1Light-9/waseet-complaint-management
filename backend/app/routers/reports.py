"""Reports router — KPI aggregates for the Dashboard.

GET /reports/overview  → Manager / Admin / Agent
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import func, select, case, select, extract
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.complaint import Complaint, ComplaintStatus
from app.models.organization import Department, Category

router = APIRouter(prefix="/reports", tags=["Reports"])


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _avg_minutes(pairs: list[tuple[datetime | None, datetime | None]]) -> float:
    values: list[float] = []
    for end_at, start_at in pairs:
        end_utc = _to_utc(end_at)
        start_utc = _to_utc(start_at)
        if end_utc is None or start_utc is None:
            continue
        values.append((end_utc - start_utc).total_seconds() / 60)

    if not values:
        return 0

    return sum(values) / len(values)


@router.get("/overview")
async def overview(
    current_user: CurrentUser,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
):
    """Return KPI aggregates scoped to the current user's role."""
    role = current_user.role.name
    now = datetime.now(timezone.utc)

    # 1) Single source of truth for scope filtration
    scope_name = "all"
    scope_filters = []
    
    if days > 0:
        start_date = now - timedelta(days=days)
        scope_filters.append(Complaint.created_at >= start_date)

    if role == "Requester":
        scope_filters.append(Complaint.requester_id == current_user.id)
        scope_name = "my"
    elif role == "Agent":
        scope_filters.append(Complaint.assignee_id == current_user.id)
        scope_name = "assigned"
    elif role == "Manager" and current_user.department_id:
        scope_filters.append(Complaint.department_id == current_user.department_id)
        scope_name = "department"

    def apply_scope(stmt):
        for f in scope_filters:
            stmt = stmt.where(f)
        return stmt

    # Status distribution
    status_q = apply_scope(
        select(Complaint.status, func.count(Complaint.id).label("count"))
        .group_by(Complaint.status)
    )
    status_r = await db.execute(status_q)
    status_counts = {row[0].value if hasattr(row[0], 'value') else str(row[0]): row[1] for row in status_r.all()}
    
    total = sum(status_counts.values())
    closed_count = status_counts.get("RESOLVED", 0) + status_counts.get("CLOSED", 0)
    open_count = total - closed_count

    # SLA and Escalation
    sla_stats_q = apply_scope(select(
        func.count(Complaint.id).label("total"),
        func.sum(case((Complaint.escalated_to_manager == True, 1), else_=0)).label("escalated"),
        # Breached if response_due_at < now AND not responded
        func.sum(case((
            (Complaint.response_due_at < now) & 
            (Complaint.first_response_at.is_(None)) & 
            (Complaint.status.not_in(["RESOLVED", "CLOSED"])), 1), else_=0)
        ).label("breached")
    ))
    sla_r = await db.execute(sla_stats_q)
    sla_row = sla_r.first()
    escalated = int(sla_row.escalated or 0) if sla_row else 0
    breached = int(sla_row.breached or 0) if sla_row else 0
    
    compliance_pct = 100
    if total > 0:
        compliance_pct = round(((total - breached) / total) * 100, 1)

    # Department breakdown (admin/manager only)
    dept_breakdown: list[dict] = []
    if scope_name in ("all", "department"):
        dept_q = apply_scope(
            select(Department.name, func.count(Complaint.id).label("count"))
            .join(Department, Complaint.department_id == Department.id)
            .group_by(Department.id, Department.name)
            .order_by(Department.name)
        )
        r = await db.execute(dept_q)
        dept_breakdown = [{"department": row[0], "count": row[1]} for row in r.all()]

    # Priority breakdown
    priority_q = apply_scope(
        select(Complaint.priority, func.count(Complaint.id).label("count"))
        .group_by(Complaint.priority)
    )
    r = await db.execute(priority_q)
    priority_breakdown = [{"priority": row[0].value if hasattr(row[0], 'value') else str(row[0]), "count": row[1]} for row in r.all()]
    
    # Top Categories
    cat_q = apply_scope(
        select(Category.name, func.count(Complaint.id).label("count"))
        .join(Category, Complaint.category_id == Category.id)
        .group_by(Category.id, Category.name)
        .order_by(func.count(Complaint.id).desc())
        .limit(5)
    )
    r = await db.execute(cat_q)
    top_categories = [{"category": row[0], "count": row[1]} for row in r.all()]

    # Recent complaints
    recent_q = apply_scope(
        select(Complaint)
        .options(selectinload(Complaint.department), selectinload(Complaint.category))
        .order_by(Complaint.created_at.desc())
        .limit(10)
    )
    result = await db.execute(recent_q)
    recent_items = []
    for c in result.scalars().all():
        is_breached = False
        if c.response_due_at and not c.first_response_at and c.response_due_at < now and c.status not in (ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED):
            is_breached = True
            
        recent_items.append({
            "id": c.id,
            "subject": c.subject,
            "status": c.status.value if hasattr(c.status, 'value') else str(c.status),
            "priority": c.priority.value if hasattr(c.priority, 'value') else str(c.priority),
            "department": c.department.name if c.department else "-",
            "category": c.category.name if c.category else "-",
            "created_at": c.created_at.isoformat(),
            "sla_overall": "BREACHED" if is_breached else "ON_TRACK"
        })

    # Averages (only appropriate for Internal staff viewing metrics)
    avg_resp_val = 0
    avg_res_val = 0
    if scope_name in ("all", "department", "assigned"):
        avg_q = apply_scope(
            select(
                Complaint.created_at,
                Complaint.first_response_at,
                Complaint.resolved_at,
            )
        )
        avg_rows = (await db.execute(avg_q)).all()

        avg_resp_val = _avg_minutes(
            [(row.first_response_at, row.created_at) for row in avg_rows]
        )
        avg_res_val = _avg_minutes(
            [(row.resolved_at, row.created_at) for row in avg_rows]
        )

    data = {
        "scope": scope_name,
        "range_days": days,
        "totals": {
            "total": total,
            "open": open_count,
            "closed": closed_count
        },
        "by_status": [{"status": k, "count": v} for k, v in status_counts.items()],
        "by_priority": priority_breakdown,
        "top_categories": top_categories,
        "sla": {
            "on_track": total - breached,
            "near_breach": 0,
            "breached": breached,
            "escalated": escalated,
            "compliance_pct": compliance_pct
        },
        "recent": recent_items
    }
    
    if scope_name in ("all", "department"):
        data["by_department"] = dept_breakdown
        
    if scope_name in ("all", "department", "assigned"):
        data["time_metrics"] = {
            "avg_first_response_minutes": round(avg_resp_val, 1) if avg_resp_val else 0,
            "avg_resolution_minutes": round(avg_res_val, 1) if avg_res_val else 0
        }

    return data

