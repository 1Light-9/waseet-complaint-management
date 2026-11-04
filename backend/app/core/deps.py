"""FastAPI dependencies: current user extraction and RBAC guards."""
import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import Role, User

bearer_scheme = HTTPBearer(auto_error=False)

_401 = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or missing authentication token",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Extract and validate the Bearer JWT; return the authenticated User."""
    if not credentials:
        raise _401
    try:
        payload = decode_access_token(credentials.credentials)
        user_id: str = payload.get("sub", "")
    except JWTError:
        raise _401

    result = await db.execute(
        select(User)
        .where(User.id == uuid.UUID(user_id))
        .options(
            selectinload(User.role).selectinload(Role.permissions),
            selectinload(User.department),
        )
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise _401
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(roles: list[str]):
    """Dependency factory: allow only users whose role.name is in `roles`."""
    async def _check(current_user: CurrentUser) -> User:
        if current_user.role.name not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role.name}' is not authorized for this action",
            )
        return current_user
    return Depends(_check)


def require_permissions(keys: list[str]):
    """Dependency factory: allow only users who have ALL listed permission keys."""
    async def _check(current_user: CurrentUser) -> User:
        user_perms = {p.key for p in current_user.role.permissions}
        missing = set(keys) - user_perms
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permissions: {', '.join(sorted(missing))}",
            )
        return current_user
    return Depends(_check)
