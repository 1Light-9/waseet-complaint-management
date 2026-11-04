"""Pydantic schemas for user list (admin endpoint)."""
from datetime import datetime

from pydantic import BaseModel


class UserListItem(BaseModel):
    id: str
    email: str
    full_name: str
    role_name: str
    department_name: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    total: int
    items: list[UserListItem]


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role_name: str
    department_id: int | None = None
    is_active: bool = True


class UserUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None
    role_name: str | None = None
    department_id: int | None = None
    is_active: bool | None = None
    password: str | None = None
