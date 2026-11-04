"""Pydantic schemas for complaints."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Create ────────────────────────────────────────────────────────────────────

class ComplaintCreate(BaseModel):
    subject: str = Field(..., min_length=3, max_length=500)
    description: str = Field(..., min_length=10)
    department_id: int
    category_id: int
    priority: str = Field(default="MEDIUM", pattern="^(LOW|MEDIUM|HIGH|URGENT)$")


# ── Patch ─────────────────────────────────────────────────────────────────────

class ComplaintPatch(BaseModel):
    subject: str | None = Field(default=None, min_length=3, max_length=500)
    description: str | None = Field(default=None, min_length=10)
    status: str | None = Field(default=None, pattern="^(NEW|IN_PROGRESS|WAITING_USER|RESOLVED|CLOSED)$")
    priority: str | None = Field(default=None, pattern="^(LOW|MEDIUM|HIGH|URGENT)$")
    category_id: int | None = None
    department_id: int | None = None
    assignee_id: uuid.UUID | None = None
    escalated_to_manager: bool | None = None


# ── Close / Reopen ────────────────────────────────────────────────────────────

class ComplaintClose(BaseModel):
    csat_rating: int = Field(..., ge=1, le=5)
    csat_feedback: str | None = None


# ── Nested response pieces ────────────────────────────────────────────────────

class UserRef(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str

    model_config = {"from_attributes": True}


class DeptRef(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class CatRef(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class CommentOut(BaseModel):
    id: int
    author: UserRef
    is_internal: bool
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AttachmentOut(BaseModel):
    id: int
    filename: str
    mime_type: str
    storage_path: str
    uploaded_by: UserRef
    created_at: datetime

    model_config = {"from_attributes": True}


class HistoryOut(BaseModel):
    id: int
    action_type: str
    from_value: str | None
    to_value: str | None
    actor: UserRef | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── SLA schemas ───────────────────────────────────────────────────────────────

class SlaChannelDetail(BaseModel):
    status: str  # ON_TRACK | NEAR_BREACH | BREACHED
    remaining_seconds: Optional[float] = None
    due_at: Optional[datetime] = None


class SlaDetail(BaseModel):
    overall: str
    response: Optional[SlaChannelDetail] = None
    resolve: Optional[SlaChannelDetail] = None
    escalated_to_manager: bool = False


# ── Summary (list view) ───────────────────────────────────────────────────────

class ComplaintSummary(BaseModel):

    id: int
    subject: str
    status: str
    priority: str
    department: DeptRef
    category: CatRef
    requester: UserRef
    assignee: UserRef | None
    escalated_to_manager: bool
    response_due_at: datetime | None
    resolve_due_at: datetime | None
    first_response_at: datetime | None
    resolved_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    sla: Optional[SlaDetail] = None

    model_config = {"from_attributes": True}


class ComplaintListResponse(BaseModel):
    total: int
    items: list[ComplaintSummary]


# ── Detail (single complaint) ─────────────────────────────────────────────────

class ComplaintDetail(ComplaintSummary):
    description: str
    csat_rating: int | None
    csat_feedback: str | None
    comments: list[CommentOut] = []
    attachments: list[AttachmentOut] = []
    history: list[HistoryOut] = []
