"""Complaint CRUD service — business logic."""
import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.workflow import validate_transition
from app.models.complaint import (
    Complaint,
    ComplaintAttachment,
    ComplaintComment,
    ComplaintHistory,
    ComplaintStatus,
)
from app.models.organization import Category, Department
from app.models.user import User
from app.schemas.complaint import ComplaintClose, ComplaintCreate, ComplaintPatch
from app.services.sla import compute_sla_deadlines

# ── helpers ───────────────────────────────────────────────────────────────────

AGENT_ROLES = {"Agent", "Manager", "Admin"}
MANAGER_ROLES = {"Manager", "Admin"}
ASSIGNABLE_ROLES = {"Agent"}

STATUS_SORT_ORDER = case(
    (Complaint.status == ComplaintStatus.NEW, 0),
    (Complaint.status == ComplaintStatus.IN_PROGRESS, 1),
    (Complaint.status == ComplaintStatus.WAITING_USER, 2),
    (Complaint.status == ComplaintStatus.RESOLVED, 3),
    (Complaint.status == ComplaintStatus.CLOSED, 4),
    else_=5,
)

PRIORITY_SORT_ORDER = case(
    (Complaint.priority == "URGENT", 0),
    (Complaint.priority == "HIGH", 1),
    (Complaint.priority == "MEDIUM", 2),
    (Complaint.priority == "LOW", 3),
    else_=4,
)


def _role(user: User) -> str:
    return user.role.name


def _complaint_options():
    return [
        selectinload(Complaint.requester).selectinload(User.role),
        selectinload(Complaint.assignee).selectinload(User.role),
        selectinload(Complaint.department),
        selectinload(Complaint.category),
        selectinload(Complaint.comments).selectinload(ComplaintComment.author),
        selectinload(Complaint.attachments).selectinload(ComplaintAttachment.uploaded_by),
        selectinload(Complaint.history).selectinload(ComplaintHistory.actor),
    ]


async def _get_or_404(db: AsyncSession, complaint_id: int) -> Complaint:
    result = await db.execute(
        select(Complaint).where(Complaint.id == complaint_id).options(*_complaint_options())
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="الشكوى غير موجودة")
    return c


async def _validate_department_category(
    db: AsyncSession,
    department_id: int,
    category_id: int,
) -> tuple[Department, Category]:
    department = await db.scalar(
        select(Department).where(Department.id == department_id)
    )
    if not department:
        raise HTTPException(status_code=400, detail="Invalid department")

    category = await db.scalar(
        select(Category).where(Category.id == category_id)
    )
    if not category:
        raise HTTPException(status_code=400, detail="Invalid category")
    if category.department_id != department_id:
        raise HTTPException(
            status_code=400,
            detail="Selected category does not belong to the selected department",
        )

    return department, category


async def _get_assignable_user(
    db: AsyncSession,
    assignee_id: uuid.UUID,
    department_id: int,
) -> User:
    assignee = await db.scalar(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.id == assignee_id)
    )
    if not assignee or not assignee.is_active:
        raise HTTPException(status_code=400, detail="Invalid assignee")
    if assignee.role.name not in ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail="Assignee must be an active agent")
    if assignee.department_id != department_id:
        raise HTTPException(
            status_code=400,
            detail="Assignee must belong to the same department as the complaint",
        )
    return assignee


def _assert_access(complaint: Complaint, user: User) -> None:
    role = _role(user)
    if role == "Requester" and complaint.requester_id != user.id:
        raise HTTPException(status_code=404, detail="الشكوى غير موجودة")
    if role == "Manager" and complaint.department_id != user.department_id:
        raise HTTPException(status_code=404, detail="الشكوى غير موجودة")
    if role == "Agent" and complaint.assignee_id != user.id:
        raise HTTPException(status_code=403, detail="هذه الشكوى غير مسندة لك")


async def _write_history(
    db: AsyncSession,
    complaint_id: int,
    actor_id: uuid.UUID | None,
    action_type: str,
    from_value: str | None = None,
    to_value: str | None = None,
) -> None:
    entry = ComplaintHistory(
        complaint_id=complaint_id,
        actor_id=actor_id,
        action_type=action_type,
        from_value=from_value,
        to_value=to_value,
    )
    db.add(entry)


# ── CREATE ────────────────────────────────────────────────────────────────────

async def create_complaint(db: AsyncSession, body: ComplaintCreate, user: User) -> Complaint:
    if _role(user) != "Requester":
        raise HTTPException(status_code=403, detail="Only Requesters can create complaints")

    await _validate_department_category(db, body.department_id, body.category_id)

    response_due, resolve_due = await compute_sla_deadlines(
        db, body.department_id, body.category_id, body.priority
    )

    c = Complaint(
        requester_id=user.id,
        department_id=body.department_id,
        category_id=body.category_id,
        subject=body.subject,
        description=body.description,
        priority=body.priority,
        status=ComplaintStatus.NEW,
        response_due_at=response_due,
        resolve_due_at=resolve_due,
    )
    db.add(c)
    await db.flush()

    await _write_history(db, c.id, user.id, "CREATED", to_value=body.subject)
    await db.commit()

    result = await db.execute(
        select(Complaint).where(Complaint.id == c.id).options(*_complaint_options())
    )
    return result.scalar_one()


# ── LIST ──────────────────────────────────────────────────────────────────────

async def list_complaints(
    db: AsyncSession,
    user: User,
    scope: str = "my",
    status_filter: str | None = None,
    department_id: int | None = None,
    category_id: int | None = None,
    priority: str | None = None,
    assignee_id: uuid.UUID | None = None,
    assignment: str | None = None,
    escalated: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[Complaint]:
    role = _role(user)
    q = select(Complaint).options(*_complaint_options())

    # Visibility by role
    if role == "Requester":
        q = q.where(Complaint.requester_id == user.id)
    elif role == "Agent":
        q = q.where(Complaint.assignee_id == user.id)
    elif role == "Manager":
        if not user.department_id:
            return []
        q = q.where(Complaint.department_id == user.department_id)
        if scope == "assigned":
            q = q.where(Complaint.assignee_id.is_not(None))
    elif role == "Admin" and scope == "assigned":
        q = q.where(Complaint.assignee_id.is_not(None))

    # Optional filters
    if status_filter:
        q = q.where(Complaint.status == status_filter)
    if department_id:
        q = q.where(Complaint.department_id == department_id)
    if category_id:
        q = q.where(Complaint.category_id == category_id)
    if priority:
        q = q.where(Complaint.priority == priority)
    if assignee_id:
        q = q.where(Complaint.assignee_id == assignee_id)
    if assignment == "assigned":
        q = q.where(Complaint.assignee_id.is_not(None))
    elif assignment == "unassigned":
        q = q.where(Complaint.assignee_id.is_(None))
    if escalated is not None:
        q = q.where(Complaint.escalated_to_manager == escalated)
    if date_from:
        q = q.where(
            Complaint.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        )
    if date_to:
        q = q.where(
            Complaint.created_at
            < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc)
        )

    if role in AGENT_ROLES or role == "Admin":
        q = q.order_by(
            Complaint.escalated_to_manager.desc(),
            STATUS_SORT_ORDER,
            PRIORITY_SORT_ORDER,
            Complaint.created_at.desc(),
        )
    else:
        q = q.order_by(Complaint.created_at.desc())
    result = await db.execute(q)
    return result.scalars().all()


# ── GET ONE ───────────────────────────────────────────────────────────────────

async def get_complaint(db: AsyncSession, complaint_id: int, user: User) -> Complaint:
    c = await _get_or_404(db, complaint_id)
    _assert_access(c, user)
    role = _role(user)
    if role == "Requester" and c.requester_id != user.id:
        raise HTTPException(status_code=404, detail="الشكوى غير موجودة")
    if role == "Manager" and c.department_id != user.department_id:
        raise HTTPException(status_code=404, detail="الشكوى غير موجودة")
    if role == "Agent" and c.assignee_id != user.id:
        raise HTTPException(status_code=404, detail="الشكوى غير موجودة")
    return c


# ── PATCH ─────────────────────────────────────────────────────────────────────

async def patch_complaint(
    db: AsyncSession, complaint_id: int, body: ComplaintPatch, user: User
) -> Complaint:
    role = _role(user)
    if role == "Requester":
        raise HTTPException(status_code=403, detail="لا يمكن لمقدم الطلب تعديل الشكاوى")

    c = await _get_or_404(db, complaint_id)
    _assert_access(c, user)

    next_department_id = (
        body.department_id
        if "department_id" in body.model_fields_set and body.department_id is not None
        else c.department_id
    )
    next_category_id = (
        body.category_id
        if "category_id" in body.model_fields_set and body.category_id is not None
        else c.category_id
    )
    next_priority = (
        body.priority
        if "priority" in body.model_fields_set and body.priority is not None
        else c.priority
    )
    routing_changed = (
        next_department_id != c.department_id
        or next_category_id != c.category_id
        or next_priority != c.priority
    )

    if routing_changed:
        await _validate_department_category(db, next_department_id, next_category_id)

    if "assignee_id" in body.model_fields_set and body.assignee_id is not None:
        await _get_assignable_user(db, body.assignee_id, next_department_id)

    if body.subject and body.subject != c.subject:
        if role != "Admin":
            raise HTTPException(status_code=403, detail="تعديل عنوان الشكوى متاح للأدمن فقط")
        await _write_history(db, c.id, user.id, "SUBJECT_CHANGED", c.subject, body.subject)
        c.subject = body.subject

    if body.description and body.description != c.description:
        if role != "Admin":
            raise HTTPException(status_code=403, detail="تعديل تفاصيل الشكوى متاح للأدمن فقط")
        await _write_history(db, c.id, user.id, "DESCRIPTION_CHANGED", None, None)
        c.description = body.description

    if body.status and body.status != c.status:
        if role != "Admin":
            validate_transition(c.status, body.status)
        # Agent can only move their assigned complaints
        if role == "Agent" and c.assignee_id != user.id:
            raise HTTPException(status_code=403, detail="هذه الشكوى غير مسندة لك")
        await _write_history(db, c.id, user.id, "STATUS_CHANGED", c.status, body.status)
        c.status = body.status
        if body.status == ComplaintStatus.NEW:
            c.first_response_at = None
            c.resolved_at = None
            c.closed_at = None
        elif body.status == ComplaintStatus.IN_PROGRESS:
            c.resolved_at = None
            c.closed_at = None
        elif body.status == ComplaintStatus.WAITING_USER:
            c.closed_at = None
        elif body.status == ComplaintStatus.RESOLVED:
            c.resolved_at = datetime.now(timezone.utc)
            c.closed_at = None
        elif body.status == ComplaintStatus.CLOSED:
            if c.resolved_at is None:
                c.resolved_at = datetime.now(timezone.utc)
            c.closed_at = datetime.now(timezone.utc)

    if body.priority and body.priority != c.priority:
        if role not in MANAGER_ROLES:
            raise HTTPException(status_code=403, detail="تغيير الأولوية متاح للمدير أو الأدمن فقط")
        await _write_history(db, c.id, user.id, "PRIORITY_CHANGED", c.priority, body.priority)
        c.priority = body.priority

    if "assignee_id" in body.model_fields_set and body.assignee_id != c.assignee_id:
        if role not in MANAGER_ROLES:
            raise HTTPException(status_code=403, detail="الإسناد متاح للمدير أو الأدمن فقط")
        old = str(c.assignee_id) if c.assignee_id else None
        to_value = str(body.assignee_id) if body.assignee_id else None
        await _write_history(db, c.id, user.id, "ASSIGNED", old, to_value)
        c.assignee_id = body.assignee_id

    if body.department_id and body.department_id != c.department_id:
        if role != "Admin":
            raise HTTPException(status_code=403, detail="تغيير القسم متاح للأدمن فقط")
        await _write_history(db, c.id, user.id, "DEPT_CHANGED", str(c.department_id), str(body.department_id))
        c.department_id = body.department_id

    if body.category_id and body.category_id != c.category_id:
        if role not in MANAGER_ROLES:
            raise HTTPException(status_code=403, detail="تغيير التصنيف متاح للمدير أو الأدمن فقط")
        await _write_history(db, c.id, user.id, "CATEGORY_CHANGED", str(c.category_id), str(body.category_id))
        c.category_id = body.category_id

    if body.escalated_to_manager is not None:
        if role not in MANAGER_ROLES:
            raise HTTPException(status_code=403, detail="تغيير التصعيد متاح للمدير أو الأدمن فقط")
        c.escalated_to_manager = body.escalated_to_manager

    if routing_changed:
        if c.assignee_id:
            await _get_assignable_user(db, c.assignee_id, c.department_id)
        response_due, resolve_due = await compute_sla_deadlines(
            db,
            c.department_id,
            c.category_id,
            c.priority,
            created_at=c.created_at,
        )
        c.response_due_at = response_due
        c.resolve_due_at = resolve_due

    await db.commit()
    return await _get_or_404(db, complaint_id)


# ── ADD COMMENT ───────────────────────────────────────────────────────────────

async def add_comment(
    db: AsyncSession,
    complaint_id: int,
    content: str,
    is_internal: bool,
    user: User,
) -> ComplaintComment:
    role = _role(user)
    c = await _get_or_404(db, complaint_id)
    _assert_access(c, user)

    # Visibility check
    if role == "Requester" and c.requester_id != user.id:
        raise HTTPException(status_code=404, detail="الشكوى غير موجودة")

    # Internal notes restricted
    if is_internal and role == "Requester":
        raise HTTPException(status_code=403, detail="لا يمكن لمقدم الطلب إضافة ملاحظات داخلية")

    comment = ComplaintComment(
        complaint_id=complaint_id,
        author_id=user.id,
        is_internal=is_internal,
        content=content,
    )
    db.add(comment)

    # First public response by agent/manager sets first_response_at
    if not is_internal and role in AGENT_ROLES and c.first_response_at is None:
        c.first_response_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(comment)

    # reload with author
    result = await db.execute(
        select(ComplaintComment)
        .where(ComplaintComment.id == comment.id)
        .options(selectinload(ComplaintComment.author))
    )
    return result.scalar_one()


# ── CLOSE ─────────────────────────────────────────────────────────────────────

async def close_complaint(
    db: AsyncSession, complaint_id: int, body: ComplaintClose, user: User
) -> Complaint:
    if _role(user) != "Requester":
        raise HTTPException(status_code=403, detail="Only Requesters can close complaints via CSAT")

    c = await _get_or_404(db, complaint_id)
    if c.requester_id != user.id:
        raise HTTPException(status_code=404, detail="الشكوى غير موجودة")
    if c.status != ComplaintStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Can only close RESOLVED complaints")

    await _write_history(db, c.id, user.id, "CLOSED", c.status, ComplaintStatus.CLOSED)
    c.status = ComplaintStatus.CLOSED
    c.closed_at = datetime.now(timezone.utc)
    c.csat_rating = body.csat_rating
    c.csat_feedback = body.csat_feedback

    await db.commit()
    return await _get_or_404(db, complaint_id)


# ── REOPEN ────────────────────────────────────────────────────────────────────

async def reopen_complaint(db: AsyncSession, complaint_id: int, user: User) -> Complaint:
    if _role(user) != "Requester":
        raise HTTPException(status_code=403, detail="Only Requesters can reopen complaints")

    c = await _get_or_404(db, complaint_id)
    if c.requester_id != user.id:
        raise HTTPException(status_code=404, detail="الشكوى غير موجودة")
    if c.status not in (ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED):
        raise HTTPException(status_code=400, detail="Can only reopen RESOLVED or CLOSED complaints")

    await _write_history(db, c.id, user.id, "REOPENED", c.status, ComplaintStatus.IN_PROGRESS)
    c.status = ComplaintStatus.IN_PROGRESS
    c.resolved_at = None
    c.closed_at = None

    await db.commit()
    return await _get_or_404(db, complaint_id)


# ── UPLOAD ATTACHMENT ─────────────────────────────────────────────────────────

async def save_attachment(
    db: AsyncSession,
    complaint_id: int,
    filename: str,
    mime_type: str,
    storage_path: str,
    user: User,
) -> ComplaintAttachment:
    c = await _get_or_404(db, complaint_id)
    _assert_access(c, user)
    role = _role(user)
    if role == "Requester" and c.requester_id != user.id:
        raise HTTPException(status_code=404, detail="الشكوى غير موجودة")

    att = ComplaintAttachment(
        complaint_id=complaint_id,
        uploaded_by_id=user.id,
        filename=filename,
        mime_type=mime_type,
        storage_path=storage_path,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)

    result = await db.execute(
        select(ComplaintAttachment)
        .where(ComplaintAttachment.id == att.id)
        .options(selectinload(ComplaintAttachment.uploaded_by))
    )
    return result.scalar_one()
