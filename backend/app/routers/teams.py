from fastapi import APIRouter, HTTPException, UploadFile

from ..auth import CurrentUser, Session
from ..engine.snapshot import build_teams
from ..images import store_upload
from ..models import Team, User
from ..schemas import TeamPatch
from .deps import Engine

router = APIRouter(tags=["teams"])


def _check_can_edit(user: User, team_id: int) -> None:
    if user.role != "admin" and user.team_id != team_id:
        raise HTTPException(403, "You can only edit your own team")


@router.get("/teams")
async def list_teams(session: Session, _: CurrentUser, engine: Engine) -> list[dict]:
    return await build_teams(session, online=set(engine.ws.online_user_ids))


@router.get("/teams/{team_id}")
async def get_team(team_id: int, session: Session, _: CurrentUser, engine: Engine) -> dict:
    for t in await build_teams(session, online=set(engine.ws.online_user_ids)):
        if t["id"] == team_id:
            return t
    raise HTTPException(404, "Team not found")


@router.patch("/teams/{team_id}")
async def patch_team(team_id: int, body: TeamPatch, user: CurrentUser, session: Session, engine: Engine) -> dict:
    _check_can_edit(user, team_id)
    team = await session.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(team, field, value.strip() if isinstance(value, str) else value)
    await session.commit()
    await engine.notify_settings_changed()
    return {"ok": True}


@router.post("/teams/{team_id}/logo")
async def upload_logo(team_id: int, file: UploadFile, user: CurrentUser, session: Session, engine: Engine) -> dict:
    _check_can_edit(user, team_id)
    team = await session.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    image = await store_upload(session, file)
    team.logo_image_id = image.id
    await session.commit()
    await engine.notify_settings_changed()
    return {"ok": True, "logo_image_id": image.id}
