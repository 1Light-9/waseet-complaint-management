"""Admin router: Admin-only endpoints."""
from fastapi import APIRouter, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from fastapi import Depends

from app.core.database import get_db
from app.core.deps import CurrentUser, require_roles
from app.core.security import hash_password
from app.models.complaint import Complaint, ComplaintAttachment, ComplaintComment, ComplaintHistory
from app.models.kb import Document
from app.models.organization import Category, Department
from app.models.user import Role, User
from app.schemas.user import UserCreate, UserListItem, UserListResponse, UserUpdate

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get(
    "/users",
    response_model=UserListResponse,
    dependencies=[require_roles(["Admin"])],
)
async def list_users(
    role: str | None = Query(default=None),
    department_id: int | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Return all users. Admin only."""
    stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .options(
            selectinload(User.role),
            selectinload(User.department),
        )
        .order_by(User.created_at)
    )
    if role:
        stmt = stmt.where(Role.name == role)
    if department_id:
        stmt = stmt.where(User.department_id == department_id)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)

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


from fastapi import HTTPException
from app.schemas.organization import (
    DepartmentCreate, DepartmentResponse, DepartmentUpdate,
    CategoryCreate, CategoryResponse, CategoryUpdate, RoleResponse
)


@router.post(
    "/users",
    response_model=UserListItem,
    dependencies=[require_roles(["Admin"])],
)
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create a new user (admin)."""
    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Validate role
    role_res = await db.execute(select(Role).where(Role.name == data.role_name))
    role = role_res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role name")

    # Validate Department
    if data.department_id is not None:
        dept_res = await db.execute(select(Department).where(Department.id == data.department_id))
        if not dept_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Invalid department ID")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role_id=role.id,
        department_id=data.department_id,
        is_active=data.is_active,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Reload relationships for response
    await db.refresh(user, ["role", "department"])

    return UserListItem(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role_name=user.role.name,
        department_name=user.department.name if user.department else None,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.patch(
    "/users/{user_id}",
    response_model=UserListItem,
    dependencies=[require_roles(["Admin"])],
)
async def update_user(user_id: str, data: UserUpdate, db: AsyncSession = Depends(get_db)):
    """Update user by ID."""
    result = await db.execute(
        select(User).options(selectinload(User.role), selectinload(User.department)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.email is not None:
        email = data.email.strip()
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")
        if email != user.email:
            existing = await db.execute(select(User).where(User.email == email))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Email already registered")
            user.email = email

    if data.full_name is not None:
        user.full_name = data.full_name

    if data.is_active is not None:
        user.is_active = data.is_active

    if data.password is not None:
        user.password_hash = hash_password(data.password)

    if data.role_name is not None:
        role_res = await db.execute(select(Role).where(Role.name == data.role_name))
        role = role_res.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=400, detail="Invalid role name")
        user.role_id = role.id

    if "department_id" in data.model_fields_set:
        if data.department_id is None or data.department_id == 0:
             user.department_id = None
        else:
            dept_res = await db.execute(select(Department).where(Department.id == data.department_id))
            if not dept_res.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Invalid department ID")
            user.department_id = data.department_id

    await db.commit()
    await db.refresh(user, ["role", "department"])

    return UserListItem(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role_name=user.role.name,
        department_name=user.department.name if user.department else None,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.delete(
    "/users/{user_id}",
    dependencies=[require_roles(["Admin"])],
)
async def delete_user(user_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Delete a user only when no historical records depend on them."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    linked_records = []
    checks = [
        ("complaints", select(Complaint.id).where(
            or_(Complaint.requester_id == user.id, Complaint.assignee_id == user.id)
        ).limit(1)),
        ("comments", select(ComplaintComment.id).where(ComplaintComment.author_id == user.id).limit(1)),
        ("attachments", select(ComplaintAttachment.id).where(ComplaintAttachment.uploaded_by_id == user.id).limit(1)),
        ("history entries", select(ComplaintHistory.id).where(ComplaintHistory.actor_id == user.id).limit(1)),
        ("documents", select(Document.id).where(Document.uploaded_by_id == user.id).limit(1)),
    ]
    for label, stmt in checks:
        related = await db.execute(stmt)
        if related.scalar_one_or_none() is not None:
            linked_records.append(label)

    if linked_records:
        raise HTTPException(
            status_code=400,
            detail=(
                "This user cannot be deleted because they are linked to existing "
                f"{', '.join(linked_records)}. Deactivate the account instead."
            ),
        )

    await db.delete(user)
    await db.commit()
    return {"message": "User deleted"}


# --- Departments ---
@router.get("/departments", response_model=list[DepartmentResponse], dependencies=[require_roles(["Admin"])])
async def list_admin_departments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).order_by(Department.name))
    return result.scalars().all()


@router.post("/departments", response_model=DepartmentResponse, dependencies=[require_roles(["Admin"])])
async def create_department(data: DepartmentCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Department).where(Department.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Department already exists")
    dept = Department(name=data.name)
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return dept


@router.patch("/departments/{dept_id}", response_model=DepartmentResponse, dependencies=[require_roles(["Admin"])])
async def update_department(dept_id: int, data: DepartmentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if data.name is not None:
        # Check uniqueness if name changed
        if data.name != dept.name:
            existing = await db.execute(select(Department).where(Department.name == data.name))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Department already exists")
        dept.name = data.name

    await db.commit()
    await db.refresh(dept)
    return dept


@router.delete("/departments/{dept_id}", dependencies=[require_roles(["Admin"])])
async def delete_department(dept_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Safety checks
    cats = await db.execute(select(Category).where(Category.department_id == dept_id))
    users = await db.execute(select(User).where(User.department_id == dept_id))
    complaints = await db.execute(select(Complaint).where(Complaint.department_id == dept_id))
    
    if cats.first() or users.first() or complaints.first():
        raise HTTPException(
            status_code=400, 
            detail="This department cannot be deleted because it is linked to users, categories, or complaints."
        )

    await db.delete(dept)
    await db.commit()
    return {"message": "Department deleted"}


# --- Categories ---
@router.get("/categories", response_model=list[CategoryResponse], dependencies=[require_roles(["Admin"])])
async def list_admin_categories(department_id: int | None = None, db: AsyncSession = Depends(get_db)):
    stmt = select(Category).order_by(Category.name)
    if department_id:
        stmt = stmt.where(Category.department_id == department_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/categories", response_model=CategoryResponse, dependencies=[require_roles(["Admin"])])
async def create_category(data: CategoryCreate, db: AsyncSession = Depends(get_db)):
    # Validate dept
    dept = await db.execute(select(Department).where(Department.id == data.department_id))
    if not dept.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Invalid department ID")
        
    existing = await db.execute(
        select(Category).where(Category.name == data.name, Category.department_id == data.department_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Category already exists in this department")
        
    cat = Category(name=data.name, department_id=data.department_id)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.patch("/categories/{cat_id}", response_model=CategoryResponse, dependencies=[require_roles(["Admin"])])
async def update_category(cat_id: int, data: CategoryUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.id == cat_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if data.department_id is not None:
        dept = await db.execute(select(Department).where(Department.id == data.department_id))
        if not dept.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Invalid department ID")
        cat.department_id = data.department_id

    if data.name is not None:
        # Check uniqueness in department
        if data.name != cat.name:
            existing = await db.execute(
                select(Category).where(Category.name == data.name, Category.department_id == cat.department_id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Category already exists in this department")
        cat.name = data.name

    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", dependencies=[require_roles(["Admin"])])
async def delete_category(cat_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.id == cat_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    # Safety checks
    complaints = await db.execute(select(Complaint).where(Complaint.category_id == cat_id))
    if complaints.first():
        raise HTTPException(
            status_code=400, 
            detail="This category cannot be deleted because it is linked to existing complaints."
        )

    await db.delete(cat)
    await db.commit()
    return {"message": "Category deleted"}


# --- Roles ---
@router.get("/roles", response_model=list[RoleResponse], dependencies=[require_roles(["Admin"])])
async def list_roles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Role).order_by(Role.id))
    return result.scalars().all()

