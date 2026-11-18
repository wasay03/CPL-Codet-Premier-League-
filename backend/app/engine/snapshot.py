"""Read-side helpers: derived team positions and the full room snapshot."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AuctionSettings, AuctionState, Bid, Lot, Nomination, Player, Team, Tier, User
from . import rules


def now_utc() -> datetime:
    return datetime.now(UTC)


def ms(dt: datetime | None) -> int | None:
    return int(dt.timestamp() * 1000) if dt else None


def tier_rule(t: Tier) -> rules.TierRule:
    return rules.TierRule(
        id=t.id, rank=t.rank, max_per_team=t.max_per_team, base_price=t.base_price, bid_step=t.bid_step, name=t.name
    )


def rule_config(s: AuctionSettings) -> rules.RuleConfig:
    return rules.RuleConfig(
        min_squad=s.min_squad, max_squad=s.max_squad, slabs_enabled=s.slabs_enabled, slabs=tuple(s.slabs or ())
    )


async def load_tiers(session: AsyncSession) -> list[Tier]:
    return list((await session.scalars(select(Tier).order_by(Tier.rank))).all())


async def tier_counts(session: AsyncSession) -> dict[int, dict[int, int]]:
    """team_id -> {tier_id: sold players in that tier}."""
    rows = await session.execute(
        select(Player.sold_team_id, Player.current_tier_id, func.count())
        .where(Player.status == "sold", Player.sold_team_id.is_not(None))
        .group_by(Player.sold_team_id, Player.current_tier_id)
    )
    out: dict[int, dict[int, int]] = defaultdict(dict)
    for team_id, tier_id, n in rows:
        out[team_id][tier_id] = n
    return out


def position(team: Team, counts: dict[int, dict[int, int]]) -> rules.TeamPosition:
    return rules.TeamPosition(id=team.id, purse_remaining=team.purse_remaining, tier_counts=counts.get(team.id, {}))


def player_dict(p: Player) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "tier_id": p.current_tier_id,
        "original_tier_id": p.original_tier_id,
        "status": p.status,
        "queue_pos": p.queue_pos,
        "role": p.role,
        "batting_style": p.batting_style,
        "bowling_style": p.bowling_style,
        "photo_image_id": p.photo_image_id,
        "note": p.note,
        "sold_team_id": p.sold_team_id,
        "sold_price": p.sold_price,
        "drop_count": p.drop_count,
    }


def tier_dict(t: Tier) -> dict[str, Any]:
    return {
        "id": t.id,
        "key": t.key,
        "name": t.name,
        "rank": t.rank,
        "max_per_team": t.max_per_team,
        "base_price": t.base_price,
        "bid_step": t.bid_step,
    }


def settings_dict(s: AuctionSettings) -> dict[str, Any]:
    return {
        "purse": s.purse,
        "min_squad": s.min_squad,
        "max_squad": s.max_squad,
        "opening_timer_s": s.opening_timer_s,
        "reset_timer_s": s.reset_timer_s,
        "slabs_enabled": s.slabs_enabled,
        "slabs": s.slabs or [],
        "accelerated_enabled": s.accelerated_enabled,
        "locked": s.locked,
    }


async def build_teams(
    session: AsyncSession,
    settings: AuctionSettings | None = None,
    tiers: list[Tier] | None = None,
    online: set[int] | None = None,
) -> list[dict[str, Any]]:
    settings = settings or await session.get(AuctionSettings, 1)
    tiers = tiers or await load_tiers(session)
    cfg = rule_config(settings)
    trules = [tier_rule(t) for t in tiers]
    counts = await tier_counts(session)
    teams = (await session.scalars(select(Team).order_by(Team.id))).all()
    sold = (
        await session.scalars(select(Player).where(Player.status == "sold").order_by(Player.sold_price.desc()))
    ).all()
    owners = (await session.scalars(select(User).where(User.role == "owner"))).all()
    online = online or set()

    out = []
    for team in teams:
        pos = position(team, counts)
        owner = next((u for u in owners if u.team_id == team.id), None)
        squad = [player_dict(p) for p in sold if p.sold_team_id == team.id]
        out.append(
            {
                "id": team.id,
                "name": team.name,
                "short_code": team.short_code,
                "color": team.color,
                "logo_image_id": team.logo_image_id,
                "purse_remaining": team.purse_remaining,
                "purse_spent": settings.purse - team.purse_remaining,
                "squad_size": pos.squad_size,
                "tier_counts": {str(k): v for k, v in pos.tier_counts.items()},
                "open_slots": {str(k): v for k, v in rules.open_slots(pos, trules).items()},
                "reserve": rules.reserve(pos, trules, cfg),
                "max_bid": rules.max_bid(pos, trules, cfg),
                "squad": squad,
                "owner": (
                    {
                        "id": owner.id,
                        "display_name": owner.display_name,
                        "avatar_image_id": owner.avatar_image_id,
                        "online": owner.id in online,
                    }
                    if owner
                    else None
                ),
            }
        )
    return out


async def lot_dict(session: AsyncSession, lot: Lot, settings: AuctionSettings, tiers: list[Tier]) -> dict[str, Any]:
    tier = next(t for t in tiers if t.id == lot.tier_id)
    player = await session.get(Player, lot.player_id)
    bids = (
        await session.scalars(select(Bid).where(Bid.lot_id == lot.id).order_by(Bid.amount.desc()).limit(20))
    ).all()
    bid_count = await session.scalar(select(func.count()).select_from(Bid).where(Bid.lot_id == lot.id))
    return {
        "id": lot.id,
        "player": player_dict(player) if player else None,
        "tier_id": lot.tier_id,
        "round": lot.round,
        "status": lot.status,
        "opening_price": lot.opening_price,
        "high_bid": lot.high_bid,
        "high_team_id": lot.high_team_id,
        "next_bid": rules.next_bid(lot.opening_price, lot.high_bid, tier.bid_step, rule_config(settings)),
        "ends_at": ms(lot.ends_at),
        "paused_remaining_ms": lot.paused_remaining_ms,
        "bid_count": bid_count or 0,
        "bids": [
            {"id": b.id, "team_id": b.team_id, "user_id": b.user_id, "amount": b.amount, "at": ms(b.created_at)}
            for b in bids
        ],
    }


def closed_lot_dict(lot: Lot, player: Player | None, bid_count: int) -> dict[str, Any]:
    return {
        "id": lot.id,
        "player_id": lot.player_id,
        "player_name": player.name if player else None,
        "tier_id": lot.tier_id,
        "round": lot.round,
        "status": lot.status,
        "opening_price": lot.opening_price,
        "price": lot.high_bid if lot.status == "sold" else None,
        "team_id": lot.high_team_id if lot.status == "sold" else None,
        "dropped_to_tier_id": lot.dropped_to_tier_id,
        "to_pool": lot.status == "unsold" and lot.dropped_to_tier_id is None,
        "bid_count": bid_count,
        "drop_count": player.drop_count if player else 0,
        "opened_at": ms(lot.opened_at),
        "closed_at": ms(lot.closed_at),
    }


async def history(session: AsyncSession, limit: int | None = None) -> list[dict[str, Any]]:
    bid_counts = select(Bid.lot_id, func.count().label("n")).group_by(Bid.lot_id).subquery()
    q = (
        select(Lot, Player, func.coalesce(bid_counts.c.n, 0))
        .join(Player, Player.id == Lot.player_id)
        .outerjoin(bid_counts, bid_counts.c.lot_id == Lot.id)
        .where(Lot.status != "open")
        .order_by(Lot.closed_at.desc().nulls_last(), Lot.id.desc())
    )
    if limit:
        q = q.limit(limit)
    return [closed_lot_dict(lot, p, n) for lot, p, n in (await session.execute(q)).all()]


async def build_snapshot(session: AsyncSession, online: set[int] | None = None) -> dict[str, Any]:
    settings = await session.get(AuctionSettings, 1, populate_existing=True)
    state = await session.get(AuctionState, 1, populate_existing=True)
    tiers = await load_tiers(session)
    players = (await session.scalars(select(Player).order_by(Player.current_tier_id, Player.queue_pos))).all()
    users = (await session.scalars(select(User).order_by(User.id))).all()
    online = online or set()

    lot = None
    if state.current_lot_id:
        lot_row = await session.get(Lot, state.current_lot_id, populate_existing=True)
        if lot_row and lot_row.status == "open":
            lot = await lot_dict(session, lot_row, settings, tiers)

    tier_rank = {t.id: t.rank for t in tiers}
    queues: dict[str, list[dict[str, Any]]] = {str(t.id): [] for t in tiers}
    pool = []
    for p in sorted(players, key=lambda p: (tier_rank.get(p.current_tier_id, 99), p.queue_pos, p.id)):
        if p.status == "queued":
            queues[str(p.current_tier_id)].append(player_dict(p))
        elif p.status == "unsold_pool":
            pool.append(player_dict(p))

    noms = (await session.scalars(select(Nomination).order_by(Nomination.created_at))).all()
    nominations: dict[str, list[int]] = defaultdict(list)
    for n in noms:
        nominations[str(n.team_id)].append(n.player_id)

    return {
        "server_now": ms(now_utc()),
        "version": state.version,
        "status": state.status,
        "resume_status": state.resume_status,
        "current_tier_id": state.current_tier_id,
        "settings": settings_dict(settings),
        "tiers": [tier_dict(t) for t in tiers],
        "teams": await build_teams(session, settings, tiers, online),
        "lot": lot,
        "queues": queues,
        "queued_count": sum(len(v) for v in queues.values()),
        "unsold_pool": pool,
        "nominations": dict(nominations),
        "recent": await history(session, limit=15),
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "display_name": u.display_name,
                "role": u.role,
                "team_id": u.team_id,
                "avatar_image_id": u.avatar_image_id,
                "online": u.id in online,
            }
            for u in users
        ],
        "online": sorted(online),
    }
