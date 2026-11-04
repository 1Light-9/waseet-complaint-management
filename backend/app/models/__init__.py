"""Models package — import all models here so Alembic can discover them."""
from app.models.base import Base, IntBase, UUIDBase  # noqa: F401

# Organization
from app.models.organization import Department, Category  # noqa: F401

# RBAC
from app.models.user import Permission, Role, RolePermission, User  # noqa: F401

# Complaints
from app.models.complaint import (  # noqa: F401
    Complaint,
    ComplaintStatus,
    ComplaintPriority,
    ComplaintComment,
    ComplaintAttachment,
    ComplaintHistory,
)

# SLA
from app.models.sla import SLAPolicy, SLAEvent  # noqa: F401

# Knowledge Base / AI
from app.models.kb import Document, DocumentChunk  # noqa: F401

__all__ = [
    "Base", "IntBase", "UUIDBase",
    "Department", "Category",
    "Permission", "Role", "RolePermission", "User",
    "Complaint", "ComplaintStatus", "ComplaintPriority",
    "ComplaintComment", "ComplaintAttachment", "ComplaintHistory",
    "SLAPolicy", "SLAEvent",
    "Document", "DocumentChunk",
]
