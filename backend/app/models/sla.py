"""SLA policy and event models."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sqlalchemy.dialects.postgresql import JSONB

from app.models.base import IntBase

META_JSON_TYPE = JSON().with_variant(JSONB, "postgresql")


class SLAPolicy(IntBase):
    """SLA response/resolution targets per department + category + priority."""

    __tablename__ = "sla_policies"

    department_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("departments.id"), nullable=False
    )
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=True
    )
    priority: Mapped[str] = mapped_column(String(20), nullable=False)
    response_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    resolve_hours: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    department: Mapped["Department"] = relationship(  # noqa: F821
        "Department", back_populates="sla_policies"
    )
    category: Mapped["Category | None"] = relationship(  # noqa: F821
        "Category", back_populates="sla_policies"
    )


class SLAEvent(IntBase):
    """An SLA-related event on a complaint (e.g. breach, warning)."""

    __tablename__ = "sla_events"
    __table_args__ = (
        UniqueConstraint("complaint_id", "event_type", name="uq_sla_events_complaint_event"),
    )

    complaint_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    meta_json: Mapped[dict | None] = mapped_column(META_JSON_TYPE, nullable=True)

    complaint: Mapped["Complaint"] = relationship(  # noqa: F821
        "Complaint", back_populates="sla_events"
    )
