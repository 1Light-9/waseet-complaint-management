"""User, Role, and Permission models with full RBAC."""
import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import IntBase, UUIDBase


class Permission(IntBase):
    """A granular permission key (e.g. 'complaints:create', 'users:manage')."""

    __tablename__ = "permissions"

    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relationships
    roles: Mapped[list["Role"]] = relationship(
        "Role", secondary="role_permissions", back_populates="permissions"
    )


class Role(IntBase):
    """System role: Requester, Agent, Manager, Admin."""

    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relationships
    permissions: Mapped[list["Permission"]] = relationship(
        "Permission", secondary="role_permissions", back_populates="roles"
    )
    users: Mapped[list["User"]] = relationship("User", back_populates="role")


class RolePermission(IntBase):
    """Many-to-many join table: role ↔ permission."""

    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id"),)

    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    permission_id: Mapped[int] = mapped_column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)


class User(UUIDBase):
    """Internal system user with RBAC role and optional department."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")

    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), nullable=False)
    department_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("departments.id"), nullable=True
    )

    # Relationships
    role: Mapped["Role"] = relationship("Role", back_populates="users")
    department: Mapped["Department | None"] = relationship(  # noqa: F821
        "Department", back_populates="users"
    )
    submitted_complaints: Mapped[list["Complaint"]] = relationship(  # noqa: F821
        "Complaint", back_populates="requester", foreign_keys="Complaint.requester_id"
    )
    assigned_complaints: Mapped[list["Complaint"]] = relationship(  # noqa: F821
        "Complaint", back_populates="assignee", foreign_keys="Complaint.assignee_id"
    )
    comments: Mapped[list["ComplaintComment"]] = relationship(  # noqa: F821
        "ComplaintComment", back_populates="author"
    )
    attachments: Mapped[list["ComplaintAttachment"]] = relationship(  # noqa: F821
        "ComplaintAttachment", back_populates="uploaded_by"
    )
    history_entries: Mapped[list["ComplaintHistory"]] = relationship(  # noqa: F821
        "ComplaintHistory", back_populates="actor"
    )
    uploaded_documents: Mapped[list["Document"]] = relationship(  # noqa: F821
        "Document", back_populates="uploaded_by"
    )
