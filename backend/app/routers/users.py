from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from ..auth import AdminUser, Session
from ..passwords import hash_password_async
from ..models import AuditLog, Team, User
from ..schemas import UserPatch
from .auth import me_out
from .deps import Engine

router = APIRouter(tags=["users"])


@router.get("/users")
async def list_users(_: AdminUser, session: Session) -> list[dict]:
    users = (await session.scalars(select(User).order_by(User.id))).all()
    return [me_out(u).model_dump() for u in users]


@router.patch("/users/{user_id}")
async def patch_user(user_id: int, body: UserPatch, admin: AdminUser, session: Session, engine: Engine) -> dict:
    u = await session.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    changes: dict = {}
    if body.username and body.username.lower() != u.username.lower():
        taken = await session.scalar(
            select(func.count()).select_from(User).where(func.lower(User.username) == body.username.lower())
        )
        if taken:
            raise HTTPException(409, "That username is taken")
        u.username = body.username
        changes["username"] = body.username
    if body.display_name:
        u.display_name = body.display_name.strip()
        changes["display_name"] = u.display_name
    if body.password:
        u.password_hash = await hash_password_async(body.password)
        # Personal logins must pick their own password; the shared viewer login keeps the admin's.
        u.must_change_password = u.role != "viewer"
        changes["password_reset"] = True
    if body.clear_team or body.team_id is not None:
        if u.role != "owner":
            raise HTTPException(422, "Only owners are linked to a team")
        new_team = None if body.clear_team else body.team_id
        if new_team is not None:
            if not await session.get(Team, new_team):
                raise HTTPException(422, "Unknown team")
            # Swap: whoever owned that team takes this user's old team.
            other = (await session.scalars(
                select(User).where(User.team_id == new_team, User.id != u.id, User.role == "owner")
            )).first()
            if other:
                other.team_id = u.team_id
        u.team_id = new_team
        changes["team_id"] = new_team
    session.add(AuditLog(actor_user_id=admin.id, action="user_update", payload={"user_id": u.id, **changes}))
    await session.commit()
    await engine.notify_settings_changed()
    return me_out(u).model_dump()
