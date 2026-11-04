"""Reference-data router — departments and categories.

These endpoints are read-only and require only a valid JWT.
Any authenticated role (Requester, Agent, Manager, Admin) can call them.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.organization import Category, Department
from app.models.user import Role, User
from app.schemas.user import UserListItem, UserListResponse

router = APIRouter(prefix="", tags=["Reference Data"])


@router.get("/departments")
async def list_departments(
    _: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Return all departments ordered by name."""
    result = await db.execute(select(Department).order_by(Department.name))
    depts = result.scalars().all()
    return {
        "total": len(depts),
        "items": [{"id": d.id, "name": d.name} for d in depts],
    }


@router.get("/categories")
async def list_categories(
    _: CurrentUser,
    department_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Return categories, optionally filtered by department_id."""
    q = select(Category).order_by(Category.department_id, Category.name)
    if department_id is not None:
        q = q.where(Category.department_id == department_id)
    result = await db.execute(q)
    cats = result.scalars().all()
    return {
        "total": len(cats),
        "items": [
            {"id": c.id, "name": c.name, "department_id": c.department_id}
            for c in cats
        ],
    }


@router.get("/users/assignable", response_model=UserListResponse)
async def list_assignable_users(
    current_user: CurrentUser,
    department_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Return active agents for manager/admin assignment workflows."""
    if current_user.role.name not in {"Manager", "Admin"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    effective_department_id = department_id
    if current_user.role.name == "Manager":
        if not current_user.department_id:
            return UserListResponse(total=0, items=[])
        effective_department_id = current_user.department_id

    stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .options(selectinload(User.role), selectinload(User.department))
        .where(Role.name == "Agent", User.is_active == True)
        .order_by(User.full_name)
    )
    if effective_department_id is not None:
        stmt = stmt.where(User.department_id == effective_department_id)

    result = await db.execute(stmt)
    users = result.scalars().all()
    items = [
        UserListItem(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name,
            role_name=u.role.name,
            department_name=u.department.name if u.department else None,
            is_active=u.is_active,
            created_at=u.created_at,
        )
        for u in users
    ]
    return UserListResponse(total=len(items), items=items)
