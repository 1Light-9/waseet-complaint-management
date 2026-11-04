"""Auth router: POST /auth/login and GET /me."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.core.security import create_access_token, verify_password
from app.models.user import Role, User
from app.schemas.auth import LoginRequest, TokenResponse, UserMeResponse

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with email + password; returns a JWT access token."""
    result = await db.execute(
        select(User)
        .where(User.email == body.email)
        .options(
            selectinload(User.role).selectinload(Role.permissions),
            selectinload(User.department),
        )
    )
    user: User | None = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="البريد الإلكتروني أو كلمة المرور غير صحيحة",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled",
        )

    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserMeResponse, tags=["Auth"])
async def me(current_user: CurrentUser):
    """Return the currently authenticated user's profile."""
    return UserMeResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        role=current_user.role,
        department=current_user.department,
    )
