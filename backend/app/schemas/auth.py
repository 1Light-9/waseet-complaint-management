"""Pydantic schemas for auth endpoints."""
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RoleInfo(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class DepartmentInfo(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class UserMeResponse(BaseModel):
    id: str
    email: str
    full_name: str
    is_active: bool
    role: RoleInfo
    department: DepartmentInfo | None

    model_config = {"from_attributes": True}
