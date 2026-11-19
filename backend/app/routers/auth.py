from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import func, select

from .. import security
from ..auth import Session, create_token
from ..passwords import check_password
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
async def login(body: LoginIn, request: Request, session: Session) -> LoginOut:
    guards = security.guards
    ip = security.client_ip(request.scope)
    username = body.username.strip().lower()

    # Every attempt from one IP counts, so a script can't hammer the (slow, CPU-heavy) password check.
    if (wait := guards.login_ip.blocked_for(ip)) is not None:
        raise _too_many("Too many login attempts. Try again", wait)
    guards.login_ip.add(ip)
    # Failures are counted per IP *and* username: someone guessing the admin password gets locked
    # out, but can't lock the real admin out from a different network.
    pair = f"{ip}|{username}"
    if (wait := guards.login_failures.blocked_for(pair)) is not None:
        raise _too_many("Too many wrong passwords for this account. Try again", wait)

    user = (await session.scalars(select(User).where(func.lower(User.username) == username))).first()
    if not await check_password(body.password, user.password_hash if user else None):
        guards.login_failures.add(pair)
        raise HTTPException(401, "Wrong username or password")
    guards.login_failures.clear(pair)
    return LoginOut(token=create_token(user), user=me_out(user))


def _too_many(message: str, wait: float) -> HTTPException:
    after = security.retry_after(wait)
    when = f"in {after} seconds" if int(after) < 120 else f"in {round(int(after) / 60)} minutes"
    return HTTPException(429, f"{message} {when}.", headers={"Retry-After": after})
