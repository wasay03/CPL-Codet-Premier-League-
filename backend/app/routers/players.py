import csv
import io

from fastapi import APIRouter, HTTPException, UploadFile
from sqlalchemy import func, select

from ..auth import AdminUser, CurrentUser, Session
from ..engine.snapshot import player_dict
from ..images import store_upload
from ..models import AuctionState, AuditLog, Lot, Player, Tier
from ..schemas import PLAYER_ROLES, PlayerIn, PlayerOrderIn, PlayerPatch
from .deps import Engine

router = APIRouter(tags=["players"])


async def _tier(session, tier_id: int) -> Tier:
    tier = await session.get(Tier, tier_id)
    if not tier:
        raise HTTPException(422, "Unknown tier")
    return tier


async def _back_pos(session, tier_id: int) -> int:
    hi = await session.scalar(select(func.max(Player.queue_pos)).where(Player.current_tier_id == tier_id))
    return (hi if hi is not None else -1) + 1


async def _started(session) -> bool:
    state = await session.get(AuctionState, 1)
    return state is not None and state.status != "not_started"


@router.get("/players")
async def list_players(
    session: Session, _: CurrentUser, tier: int | None = None, status: str | None = None
) -> list[dict]:
    q = select(Player).join(Tier, Tier.id == Player.current_tier_id).order_by(Tier.rank, Player.queue_pos, Player.id)
    if tier is not None:
        q = q.where(Player.current_tier_id == tier)
    if status:
        q = q.where(Player.status == status)
    return [player_dict(p) for p in (await session.scalars(q)).all()]


@router.post("/players", status_code=201)
async def create_player(body: PlayerIn, user: AdminUser, session: Session, engine: Engine) -> dict:
    await _tier(session, body.tier_id)
    p = Player(
        name=body.name.strip(),
        original_tier_id=body.tier_id,
        current_tier_id=body.tier_id,
        status="queued",
        queue_pos=await _back_pos(session, body.tier_id),
        role=body.role,
        batting_style=body.batting_style,
        bowling_style=body.bowling_style,
        note=body.note,
        drop_count=0,
    )
    session.add(p)
    await session.flush()
    session.add(AuditLog(actor_user_id=user.id, action="player_add", payload={"player_id": p.id, "name": p.name}))
    await session.commit()
    await engine.notify_settings_changed()
    return player_dict(p)


@router.patch("/players/{player_id}")
async def patch_player(player_id: int, body: PlayerPatch, user: AdminUser, session: Session, engine: Engine) -> dict:
    async with engine.lock:
        p = await session.get(Player, player_id)
        if not p:
            raise HTTPException(404, "Player not found")
        data = body.model_dump(exclude_unset=True)
        tier_id = data.pop("tier_id", None)
        for field, value in data.items():
            setattr(p, field, value.strip() if isinstance(value, str) else value)
        if tier_id is not None and tier_id != p.current_tier_id:
            if p.status in ("on_block", "sold"):
                raise HTTPException(409, "A player on the block or already sold can't change tier")
            await _tier(session, tier_id)
            p.current_tier_id = tier_id
            if not await _started(session):
                p.original_tier_id = tier_id
            if p.status == "queued":
                p.queue_pos = await _back_pos(session, tier_id)
            session.add(AuditLog(actor_user_id=user.id, action="player_tier",
                                 payload={"player_id": p.id, "tier_id": tier_id}))
        await session.commit()
    await engine.notify_settings_changed()
    return player_dict(p)


@router.delete("/players/{player_id}", status_code=204)
async def delete_player(player_id: int, user: AdminUser, session: Session, engine: Engine) -> None:
    async with engine.lock:
        p = await session.get(Player, player_id)
        if not p:
            raise HTTPException(404, "Player not found")
        lots = await session.scalar(select(func.count()).select_from(Lot).where(Lot.player_id == p.id))
        if p.status in ("on_block", "sold") or lots:
            raise HTTPException(409, "This player has already been auctioned; reset the auction first")
        session.add(AuditLog(actor_user_id=user.id, action="player_delete", payload={"player_id": p.id, "name": p.name}))
        await session.delete(p)
        await session.commit()
    await engine.notify_settings_changed()


@router.post("/players/{player_id}/photo")
async def upload_photo(player_id: int, file: UploadFile, _: AdminUser, session: Session, engine: Engine) -> dict:
    p = await session.get(Player, player_id)
    if not p:
        raise HTTPException(404, "Player not found")
    image = await store_upload(session, file)
    p.photo_image_id = image.id
    await session.commit()
    await engine.notify_settings_changed()
    return player_dict(p)


@router.post("/players/import")
async def import_players(file: UploadFile, user: AdminUser, session: Session, engine: Engine) -> dict:
    """CSV with a header row: name, tier (key or name), optional role, batting_style, bowling_style, note."""
    raw = (await file.read(256 * 1024)).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames or not {"name", "tier"} <= {f.strip().lower() for f in reader.fieldnames}:
        raise HTTPException(422, "The CSV needs a header row with at least: name, tier")
    tiers = (await session.scalars(select(Tier))).all()
    lookup = {t.key.lower(): t for t in tiers} | {t.name.lower(): t for t in tiers}
    added, errors = 0, []
    next_pos: dict[int, int] = {}
    for i, row in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        name, tier = row.get("name", ""), lookup.get(row.get("tier", "").lower())
        if not name or not tier:
            errors.append(f"Row {i}: needs a name and a valid tier")
            continue
        role = row.get("role", "").lower() or None
        if role and role not in PLAYER_ROLES:
            role = None
        if tier.id not in next_pos:
            next_pos[tier.id] = await _back_pos(session, tier.id)
        session.add(Player(
            name=name[:64], original_tier_id=tier.id, current_tier_id=tier.id, status="queued",
            queue_pos=next_pos[tier.id], role=role, batting_style=row.get("batting_style") or None,
            bowling_style=row.get("bowling_style") or None, note=row.get("note") or None, drop_count=0,
        ))
        next_pos[tier.id] += 1
        added += 1
    session.add(AuditLog(actor_user_id=user.id, action="player_import", payload={"added": added}))
    await session.commit()
    await engine.notify_settings_changed()
    return {"added": added, "errors": errors}


@router.put("/players/order")
async def set_order(body: PlayerOrderIn, _: AdminUser, session: Session, engine: Engine) -> dict:
    async with engine.lock:
        players = {
            p.id: p
            for p in (await session.scalars(
                select(Player).where(Player.current_tier_id == body.tier_id, Player.id.in_(body.player_ids))
            )).all()
        }
        for pos, pid in enumerate(body.player_ids):
            if pid in players:
                players[pid].queue_pos = pos
        await session.commit()
    await engine.notify_settings_changed()
    return {"ok": True}
