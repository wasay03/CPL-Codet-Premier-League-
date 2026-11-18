import csv
import io
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from ..auth import AdminUser, CurrentUser, OwnerUser, Session
from ..config import get_settings
from ..engine.snapshot import history, load_tiers
from ..models import AuditLog, Player, Team, User
from ..schemas import BidIn, ExtendIn, NextIn, NominationsIn, ResetIn
from .deps import Engine

router = APIRouter(prefix="", tags=["auction"])


@router.get("/auction/state")
async def state(_: CurrentUser, engine: Engine) -> dict:
    return await engine.snapshot()


@router.post("/auction/start")
async def start(user: AdminUser, engine: Engine) -> dict:
    await engine.start(user)
    return {"ok": True}


@router.post("/auction/pause")
async def pause(user: AdminUser, engine: Engine) -> dict:
    await engine.pause(user)
    return {"ok": True}


@router.post("/auction/resume")
async def resume(user: AdminUser, engine: Engine) -> dict:
    await engine.resume(user)
    return {"ok": True}


@router.post("/auction/end")
async def end(user: AdminUser, engine: Engine) -> dict:
    await engine.end(user)
    return {"ok": True}


@router.post("/auction/next")
async def next_player(user: AdminUser, engine: Engine, body: NextIn | None = None) -> dict:
    body = body or NextIn()
    return await engine.next_player(user, body.mode, body.player_id)


@router.post("/auction/hammer")
async def hammer(user: AdminUser, engine: Engine) -> dict:
    return await engine.hammer(user)


@router.post("/auction/extend")
async def extend(user: AdminUser, engine: Engine, body: ExtendIn | None = None) -> dict:
    body = body or ExtendIn()
    await engine.extend(user, body.seconds)
    return {"ok": True}


@router.post("/auction/undo-sale")
async def undo_sale(user: AdminUser, engine: Engine) -> dict:
    return await engine.undo_sale(user)


@router.post("/auction/bid")
async def bid(body: BidIn, user: CurrentUser, engine: Engine) -> dict:
    ok, reason, event = await engine.place_bid(user, body.lot_id, body.amount)
    if not ok:
        raise HTTPException(409, reason)
    return event


@router.post("/auction/nominations")
async def nominate(body: NominationsIn, user: OwnerUser, engine: Engine) -> dict:
    await engine.nominate(user, body.player_ids)
    return {"ok": True}


@router.post("/auction/accelerated/start")
async def start_accelerated(user: AdminUser, engine: Engine) -> dict:
    await engine.start_accelerated(user)
    return {"ok": True}


@router.post("/auction/reset")
async def reset(body: ResetIn, user: AdminUser, engine: Engine) -> dict:
    if body.confirm != "RESET":
        raise HTTPException(422, "Type RESET to confirm")
    await engine.reset(user)
    return {"ok": True}


@router.get("/auction/history")
async def get_history(_: CurrentUser, session: Session) -> list[dict]:
    return await history(session)


@router.get("/audit")
async def audit(_: AdminUser, session: Session, limit: int = 200) -> list[dict]:
    rows = (await session.execute(
        select(AuditLog, User.display_name)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .order_by(AuditLog.id.desc())
        .limit(min(limit, 1000))
    )).all()
    return [
        {"id": a.id, "action": a.action, "payload": a.payload, "actor": name or "system",
         "created_at": int(a.created_at.timestamp() * 1000)}
        for a, name in rows
    ]


@router.get("/export/results.csv")
async def export_results(_: AdminUser, session: Session) -> StreamingResponse:
    tz = ZoneInfo(get_settings().timezone)
    tiers = {t.id: t.name for t in await load_tiers(session)}
    teams = (await session.scalars(select(Team).order_by(Team.id))).all()
    players = (await session.scalars(select(Player).order_by(Player.sold_price.desc().nulls_last()))).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["team", "short_code", "player", "tier", "original_tier", "price", "drops"])
    for team in teams:
        for p in players:
            if p.status == "sold" and p.sold_team_id == team.id:
                w.writerow([team.name, team.short_code, p.name, tiers.get(p.current_tier_id),
                            tiers.get(p.original_tier_id), p.sold_price, p.drop_count])
    w.writerow([])
    w.writerow(["team", "purse_remaining"])
    for team in teams:
        w.writerow([team.name, team.purse_remaining])
    w.writerow([])
    w.writerow(["unsold"])
    for p in players:
        if p.status != "sold":
            w.writerow([p.name, tiers.get(p.current_tier_id)])
    w.writerow([])
    w.writerow(["exported_at", datetime.now(tz).strftime("%Y-%m-%d %H:%M %Z")])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="cpl-results.csv"'},
    )
