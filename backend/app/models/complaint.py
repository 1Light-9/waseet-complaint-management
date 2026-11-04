"""Complaint model and all related sub-tables."""
import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import IntBase, UUIDBase


class ComplaintStatus(str, PyEnum):
    NEW = "NEW"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_USER = "WAITING_USER"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class ComplaintPriority(str, PyEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class Complaint(IntBase):
    """An internal complaint/ticket submitted by a requester."""

    __tablename__ = "complaints"

    requester_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    department_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("departments.id"), nullable=False, index=True
    )
    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=False
    )

    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(
        String(20), default=ComplaintPriority.MEDIUM, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default=ComplaintStatus.NEW, nullable=False, index=True
    )

    # Lifecycle timestamps
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # SLA columns (added in migration 0004)
    response_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolve_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    escalated_to_manager: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")

    # CSAT (set on close)
    csat_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    csat_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)


    # Relationships
    requester: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="submitted_complaints", foreign_keys=[requester_id]
    )
    assignee: Mapped["User | None"] = relationship(  # noqa: F821
        "User", back_populates="assigned_complaints", foreign_keys=[assignee_id]
    )
    department: Mapped["Department"] = relationship(  # noqa: F821
        "Department", back_populates="complaints"
    )
    category: Mapped["Category"] = relationship(  # noqa: F821
        "Category", back_populates="complaints"
    )
    comments: Mapped[list["ComplaintComment"]] = relationship(
        "ComplaintComment", back_populates="complaint", cascade="all, delete-orphan"
    )
    attachments: Mapped[list["ComplaintAttachment"]] = relationship(
        "ComplaintAttachment", back_populates="complaint", cascade="all, delete-orphan"
    )
    history: Mapped[list["ComplaintHistory"]] = relationship(
        "ComplaintHistory", back_populates="complaint", cascade="all, delete-orphan"
    )
    sla_events: Mapped[list["SLAEvent"]] = relationship(  # noqa: F821
        "SLAEvent", back_populates="complaint", cascade="all, delete-orphan"
    )


class ComplaintComment(IntBase):
    """A comment on a complaint (internal or visible to requester)."""

    __tablename__ = "complaint_comments"

    complaint_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    complaint: Mapped["Complaint"] = relationship("Complaint", back_populates="comments")
    author: Mapped["User"] = relationship("User", back_populates="comments")  # noqa: F821


class ComplaintAttachment(IntBase):
    """A file attachment on a complaint."""

    __tablename__ = "complaint_attachments"

    complaint_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)

    complaint: Mapped["Complaint"] = relationship("Complaint", back_populates="attachments")
    uploaded_by: Mapped["User"] = relationship("User", back_populates="attachments")  # noqa: F821


class ComplaintHistory(IntBase):
    """Immutable audit trail for every state change on a complaint."""

    __tablename__ = "complaint_history"

    complaint_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    from_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    to_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    complaint: Mapped["Complaint"] = relationship("Complaint", back_populates="history")
    actor: Mapped["User | None"] = relationship("User", back_populates="history_entries")  # noqa: F821
