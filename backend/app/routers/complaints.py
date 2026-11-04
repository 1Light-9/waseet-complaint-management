"""Complaints router — full CRUD with RBAC + attachments + comments."""
import os
import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.complaint import (
    ComplaintClose,
    ComplaintCreate,
    ComplaintListResponse,
    ComplaintPatch,
    AttachmentOut,
    CommentOut,
    SlaDetail,
    SlaChannelDetail,
)
from app.schemas.comment import CommentCreate
from app.services import complaints as svc
from app.services.sla import sla_status_for

router = APIRouter(prefix="/complaints", tags=["Complaints"])

BACKEND_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BACKEND_DIR / "uploads")))
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _build_sla(complaint, current_user: User) -> dict:
    """Build SLA dict; requester only sees overall + escalated_to_manager."""
    raw = sla_status_for(complaint)
    role = current_user.role.name

    if role == "Requester":
        return {
            "overall": raw["overall"],
            "escalated_to_manager": complaint.escalated_to_manager,
            "response": None,
            "resolve": None,
        }
    return {
        "overall": raw["overall"],
        "escalated_to_manager": complaint.escalated_to_manager,
        "response": raw["response"],
        "resolve": raw["resolve"],
    }


def _enrich(complaint, current_user: User) -> dict:
    """Serialize complaint + inject sla field; filter internal comments for requesters."""
    from app.schemas.complaint import ComplaintDetail  # local import to avoid circular

    data = ComplaintDetail.model_validate(complaint).model_dump()

    # Filter internal comments for requesters
    if current_user.role.name == "Requester":
        data["comments"] = [c for c in data["comments"] if not c["is_internal"]]

    data["sla"] = _build_sla(complaint, current_user)
    return data


def _enrich_summary(complaint, current_user: User) -> dict:
    from app.schemas.complaint import ComplaintSummary
    data = ComplaintSummary.model_validate(complaint).model_dump()
    data["sla"] = _build_sla(complaint, current_user)
    return data


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_complaint(
    body: ComplaintCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await svc.create_complaint(db, body, current_user)
    return _enrich(c, current_user)


@router.get("", response_model=ComplaintListResponse)
async def list_complaints(
    scope: str = Query(default="my", pattern="^(my|assigned|department|all)$"),
    status: str | None = Query(default=None),
    department_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    priority: str | None = Query(default=None),
    assignee_id: uuid.UUID | None = Query(default=None),
    assignment: str | None = Query(default=None, pattern="^(assigned|unassigned)$"),
    escalated: bool | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = await svc.list_complaints(
        db,
        current_user,
        scope,
        status,
        department_id,
        category_id,
        priority,
        assignee_id,
        assignment,
        escalated,
        date_from,
        date_to,
    )
    summaries = [_enrich_summary(c, current_user) for c in items]
    return {"total": len(summaries), "items": summaries}


@router.get("/{complaint_id}")
async def get_complaint(
    complaint_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await svc.get_complaint(db, complaint_id, current_user)
    return _enrich(c, current_user)


@router.patch("/{complaint_id}")
async def patch_complaint(
    complaint_id: int,
    body: ComplaintPatch,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await svc.patch_complaint(db, complaint_id, body, current_user)
    return _enrich(c, current_user)


@router.post("/{complaint_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    complaint_id: int,
    body: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await svc.add_comment(db, complaint_id, body.content, body.is_internal, current_user)
    return CommentOut.model_validate(comment)


@router.post("/{complaint_id}/attachments", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    complaint_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{file.filename}"
    dest = UPLOAD_DIR / str(complaint_id) / safe_name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)

    att = await svc.save_attachment(
        db,
        complaint_id,
        filename=file.filename,
        mime_type=file.content_type or "application/octet-stream",
        storage_path=str(dest),
        user=current_user,
    )
    return AttachmentOut.model_validate(att)


@router.post("/{complaint_id}/close", status_code=status.HTTP_200_OK)
async def close_complaint(
    complaint_id: int,
    body: ComplaintClose,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await svc.close_complaint(db, complaint_id, body, current_user)
    return _enrich(c, current_user)


@router.post("/{complaint_id}/reopen", status_code=status.HTTP_200_OK)
async def reopen_complaint(
    complaint_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await svc.reopen_complaint(db, complaint_id, current_user)
    return _enrich(c, current_user)
