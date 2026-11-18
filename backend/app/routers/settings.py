from fastapi import APIRouter, HTTPException
from sqlalchemy import select, update

from ..auth import AdminUser, CurrentUser, Session
from ..engine.snapshot import load_tiers, settings_dict, tier_dict
from ..models import AuctionSettings, AuditLog, Team, Tier
from ..schemas import SettingsIn
from .deps import Engine

router = APIRouter(tags=["settings"])


async def _out(session) -> dict:
    s = await session.get(AuctionSettings, 1, populate_existing=True)
    return settings_dict(s) | {"tiers": [tier_dict(t) for t in await load_tiers(session)]}


@router.get("/settings")
async def get_settings(session: Session, _: CurrentUser) -> dict:
    return await _out(session)


@router.put("/settings")
async def put_settings(body: SettingsIn, user: AdminUser, session: Session, engine: Engine) -> dict:
    async with engine.lock:
        s = (await session.execute(select(AuctionSettings).where(AuctionSettings.id == 1).with_for_update())).scalar_one()
        if s.locked:
            raise HTTPException(409, "Rules are locked once the auction starts")
        if body.min_squad > body.max_squad:
            raise HTTPException(422, "Minimum squad can't be larger than the maximum")
        tiers = {t.id: t for t in (await session.scalars(select(Tier))).all()}
        for t in body.tiers:
            if t.id not in tiers:
                raise HTTPException(422, f"Unknown tier {t.id}")
        s.purse = body.purse
        s.min_squad = body.min_squad
        s.max_squad = body.max_squad
        s.opening_timer_s = body.opening_timer_s
        s.reset_timer_s = body.reset_timer_s
        s.slabs_enabled = body.slabs_enabled
        s.slabs = sorted(
            ({"from": sl.from_, "step": sl.step} for sl in body.slabs), key=lambda x: x["from"]
        )
        s.accelerated_enabled = body.accelerated_enabled
        for t in body.tiers:
            row = tiers[t.id]
            row.name, row.max_per_team, row.base_price, row.bid_step = (
                t.name.strip(), t.max_per_team, t.base_price, t.bid_step
            )
        await session.execute(update(Team).values(purse_remaining=body.purse))
        session.add(AuditLog(actor_user_id=user.id, action="rules_update", payload=body.model_dump(by_alias=True)))
        await session.commit()
    await engine.notify_settings_changed()
    return await _out(session)
