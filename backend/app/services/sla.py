"""SLA computation, status evaluation, and idempotent breach detection.

Design:
- sla_status_for() computes live status from complaint timestamps.
  Returns a rich dict with remaining_seconds for UI display.
- run_sla_check() persists SLAEvent records (idempotent via ON CONFLICT DO NOTHING)
  and escalates complaints on any breach.
- compute_sla_deadlines() looks up policy and returns UTC datetimes.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from sqlalchemy import and_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.complaint import Complaint, ComplaintStatus
from app.models.sla import SLAEvent, SLAPolicy

if TYPE_CHECKING:
    pass

# ── Timezone helper ────────────────────────────────────────────────────────────

def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


# ── SLA Status (single source of truth) ───────────────────────────────────────

def sla_status_for(
    complaint: Complaint,
    now: datetime | None = None,
) -> dict:
    """
    Returns:
    {
      "response": { "status": str, "remaining_seconds": float, "due_at": datetime|None },
      "resolve":  { "status": str, "remaining_seconds": float, "due_at": datetime|None },
      "overall":  str  (worst of response/resolve)
    }
    status values: ON_TRACK | NEAR_BREACH | BREACHED
    remaining_seconds < 0 means overdue (absolute value = seconds past due).
    """
    if now is None:
        now = datetime.now(timezone.utc)

    created = _utc(complaint.created_at)
    response_due = _utc(complaint.response_due_at)
    resolve_due = _utc(complaint.resolve_due_at)

    def _channel(
        due: datetime | None,
        satisfied_at: datetime | None,  # first_response_at or resolved_at
    ) -> dict:
        if due is None:
            return {"status": "ON_TRACK", "remaining_seconds": None, "due_at": None}

        remaining = (due - now).total_seconds()

        if satisfied_at is not None:
            # Already satisfied — no breach possible
            return {"status": "ON_TRACK", "remaining_seconds": remaining, "due_at": due}

        if remaining < 0:
            return {"status": "BREACHED", "remaining_seconds": remaining, "due_at": due}

        # Near-breach: >= 80 % of SLA window elapsed
        if created:
            total = (due - created).total_seconds()
            elapsed = (now - created).total_seconds()
            if total > 0 and elapsed / total >= 0.8:
                return {"status": "NEAR_BREACH", "remaining_seconds": remaining, "due_at": due}

        return {"status": "ON_TRACK", "remaining_seconds": remaining, "due_at": due}

    response = _channel(response_due, _utc(complaint.first_response_at))
    resolve = _channel(resolve_due, _utc(complaint.resolved_at))

    # Overall = worst of the two
    rank = {"ON_TRACK": 0, "NEAR_BREACH": 1, "BREACHED": 2}
    overall = max(response["status"], resolve["status"], key=lambda s: rank[s])

    return {"response": response, "resolve": resolve, "overall": overall}


# ── SLA Deadline Computation ───────────────────────────────────────────────────

async def compute_sla_deadlines(
    db: AsyncSession,
    department_id: int,
    category_id: int | None,
    priority: str,
    created_at: datetime | None = None,
) -> tuple[datetime | None, datetime | None]:
    """Return (response_due_at, resolve_due_at) based on matching SLA policy.

    Lookup order:
      1. department + category + priority  (exact)
      2. department + category=NULL + priority  (dept-level fallback)
    Returns (None, None) if no policy found — complaint is still created.
    """
    base = _utc(created_at) if created_at else datetime.now(timezone.utc)

    candidates = [category_id, None] if category_id else [None]
    for cat_id in candidates:
        result = await db.execute(
            select(SLAPolicy).where(
                and_(
                    SLAPolicy.department_id == department_id,
                    SLAPolicy.category_id == cat_id,
                    SLAPolicy.priority == priority,
                )
            )
        )
        policy = result.scalar_one_or_none()
        if policy:
            return (
                base + timedelta(hours=policy.response_hours),
                base + timedelta(hours=policy.resolve_hours),
            )
    return None, None


# ── Idempotent event writer ────────────────────────────────────────────────────

async def _write_event_idempotent(
    db: AsyncSession,
    complaint_id: int,
    event_type: str,
    triggered_at: datetime,
    meta: dict | None = None,
) -> bool:
    """Insert an SLAEvent; return True if a new row was inserted, False if it already existed."""
    try:
        # Try PostgreSQL dialect first (upsert)
        stmt = (
            pg_insert(SLAEvent)
            .values(
                complaint_id=complaint_id,
                event_type=event_type,
                triggered_at=triggered_at,
                meta_json=meta,
            )
            .on_conflict_do_nothing(index_elements=["complaint_id", "event_type"])
        )
        result = await db.execute(stmt)
        return result.rowcount > 0
    except Exception:
        # Fallback for SQLite (tests): query-before-insert
        existing = await db.execute(
            select(SLAEvent).where(
                and_(
                    SLAEvent.complaint_id == complaint_id,
                    SLAEvent.event_type == event_type,
                )
            )
        )
        if existing.scalar_one_or_none() is not None:
            return False
        db.add(
            SLAEvent(
                complaint_id=complaint_id,
                event_type=event_type,
                triggered_at=triggered_at,
                meta_json=meta,
            )
        )
        return True


# ── SLA Checker ────────────────────────────────────────────────────────────────

async def run_sla_check(db: AsyncSession, now: datetime | None = None) -> dict:
    """Scan all open complaints, write SLAEvents, escalate on breach.

    Returns:
      { checked, new_events, breached, near_breach, escalated }
    """
    if now is None:
        now = datetime.now(timezone.utc)

    # Fetch open complaints that have SLA deadlines set
    result = await db.execute(
        select(Complaint).where(
            Complaint.status.notin_([ComplaintStatus.CLOSED]),
        )
    )
    complaints = result.scalars().all()

    stats = {"checked": len(complaints), "new_events": 0, "breached": 0, "near_breach": 0, "escalated": 0}

    for c in complaints:
        sla = sla_status_for(c, now=now)

        # ── Response channel ──────────────────────────────────────────────────
        r_status = sla["response"]["status"]
        r_due = sla["response"]["due_at"]
        r_remaining = sla["response"]["remaining_seconds"]

        if r_status == "BREACHED":
            meta = {
                "due_at": r_due.isoformat() if r_due else None,
                "triggered_at": now.isoformat(),
                "overdue_seconds": abs(r_remaining) if r_remaining is not None else None,
            }
            inserted = await _write_event_idempotent(db, c.id, "RESPONSE_BREACH", now, meta)
            if inserted:
                stats["new_events"] += 1
                stats["breached"] += 1
                if not c.escalated_to_manager:
                    c.escalated_to_manager = True
                    stats["escalated"] += 1

        elif r_status == "NEAR_BREACH":
            inserted = await _write_event_idempotent(db, c.id, "RESPONSE_NEAR_BREACH", now, {
                "remaining_seconds": r_remaining,
            })
            if inserted:
                stats["new_events"] += 1
                stats["near_breach"] += 1

        # ── Resolve channel ───────────────────────────────────────────────────
        v_status = sla["resolve"]["status"]
        v_due = sla["resolve"]["due_at"]
        v_remaining = sla["resolve"]["remaining_seconds"]

        if v_status == "BREACHED":
            meta = {
                "due_at": v_due.isoformat() if v_due else None,
                "triggered_at": now.isoformat(),
                "overdue_seconds": abs(v_remaining) if v_remaining is not None else None,
            }
            inserted = await _write_event_idempotent(db, c.id, "RESOLVE_BREACH", now, meta)
            if inserted:
                stats["new_events"] += 1
                stats["breached"] += 1
                if not c.escalated_to_manager:
                    c.escalated_to_manager = True
                    stats["escalated"] += 1

        elif v_status == "NEAR_BREACH":
            inserted = await _write_event_idempotent(db, c.id, "RESOLVE_NEAR_BREACH", now, {
                "remaining_seconds": v_remaining,
            })
            if inserted:
                stats["new_events"] += 1
                stats["near_breach"] += 1

    await db.commit()
    return stats
