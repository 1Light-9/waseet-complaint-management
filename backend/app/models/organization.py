"""Organization models: Department and Category."""
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import IntBase


class Department(IntBase):

    """An internal department (e.g. IT, HR)."""

    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    # Relationships
    categories: Mapped[list["Category"]] = relationship(
        "Category", back_populates="department", cascade="all, delete-orphan"
    )
    users: Mapped[list["User"]] = relationship(  # noqa: F821
        "User", back_populates="department"
    )
    complaints: Mapped[list["Complaint"]] = relationship(  # noqa: F821
        "Complaint", back_populates="department"
    )
    sla_policies: Mapped[list["SLAPolicy"]] = relationship(  # noqa: F821
        "SLAPolicy", back_populates="department"
    )


class Category(IntBase):
    """A complaint category belonging to a department."""

    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    department_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("departments.id"), nullable=False
    )

    # Relationships
    department: Mapped["Department"] = relationship("Department", back_populates="categories")
    complaints: Mapped[list["Complaint"]] = relationship(  # noqa: F821
        "Complaint", back_populates="category"
    )
    sla_policies: Mapped[list["SLAPolicy"]] = relationship(  # noqa: F821
        "SLAPolicy", back_populates="category"
    )
