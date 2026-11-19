from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_session, release_connection
from .models import User
from .passwords import hash_password, verify_password  # noqa: F401

_bearer = HTTPBearer(auto_error=False)


def create_token(user: User) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "team_id": user.team_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=s.jwt_ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


async def user_from_token(session: AsyncSession, token: str | None) -> User | None:
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        return None
    return await session.get(User, user_id)


async def _current_user_any(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    user = await user_from_token(session, creds.credentials if creds else None)
    # Hand the pooled connection back before the route possibly waits on the engine lock.
    # The user stays loaded (expire_on_commit=False).
    await release_connection(session)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user


async def current_user_pw_ok(user: Annotated[User, Depends(_current_user_any)]) -> User:
    """Any logged-in user, even one who still has to change the first-login password."""
    return user


async def current_user(user: Annotated[User, Depends(_current_user_any)]) -> User:
    if user.must_change_password and get_settings().require_password_change:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "PASSWORD_CHANGE_REQUIRED")
    return user


async def require_admin(user: Annotated[User, Depends(current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user


async def require_owner(user: Annotated[User, Depends(current_user)]) -> User:
    if user.role != "owner" or user.team_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Team owners only")
    return user


async def require_self_editor(user: Annotated[User, Depends(current_user_pw_ok)]) -> User:
    """The viewer login is shared by spectators, so only the admin may change its name, photo or password."""
    if user.role == "viewer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The viewer account is managed by the admin")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
CurrentUserPwOk = Annotated[User, Depends(current_user_pw_ok)]
AdminUser = Annotated[User, Depends(require_admin)]
OwnerUser = Annotated[User, Depends(require_owner)]
SelfEditor = Annotated[User, Depends(require_self_editor)]
Session = Annotated[AsyncSession, Depends(get_session)]
