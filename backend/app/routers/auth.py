from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from ..auth import Session, create_token, verify_password
from ..models import User
from ..schemas import LoginIn, LoginOut, MeOut

router = APIRouter(tags=["auth"])


def me_out(u: User) -> MeOut:
    return MeOut(
        id=u.id,
        username=u.username,
        role=u.role,
        display_name=u.display_name,
        avatar_image_id=u.avatar_image_id,
        team_id=u.team_id,
        must_change_password=u.must_change_password,
    )


@router.post("/auth/login", response_model=LoginOut)
async def login(body: LoginIn, session: Session) -> LoginOut:
    user = (
        await session.scalars(select(User).where(func.lower(User.username) == body.username.strip().lower()))
    ).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong username or password")
    return LoginOut(token=create_token(user), user=me_out(user))
