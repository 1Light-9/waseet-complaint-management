"""Pydantic schemas for organization entities (Departments, Categories)."""
from pydantic import BaseModel


class DepartmentBase(BaseModel):
    name: str


class DepartmentCreate(DepartmentBase):
    description: str | None = None


class DepartmentResponse(DepartmentBase):
    id: int

    model_config = {"from_attributes": True}


class DepartmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CategoryBase(BaseModel):
    name: str
    department_id: int


class CategoryCreate(CategoryBase):
    description: str | None = None


class CategoryResponse(CategoryBase):
    id: int

    model_config = {"from_attributes": True}


class CategoryUpdate(BaseModel):
    name: str | None = None
    department_id: int | None = None
    description: str | None = None


class RoleResponse(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}
