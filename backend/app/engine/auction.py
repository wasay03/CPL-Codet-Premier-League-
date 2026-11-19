"""The auction engine: the only code that changes purses, squads, lots or player status.

Every mutation runs under one in-process asyncio lock (the app runs as a single replica) and inside
one database transaction that takes row locks on the state, lot and team rows. After commit the
engine broadcasts the specific event(s) followed by a fresh `state` snapshot to every socket.
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..models import AuctionSettings, AuctionState, AuditLog, Bid, Lot, Nomination, Player, Team, Tier, User
from ..ws.manager import ConnectionManager
from . import rules
from .snapshot import (
    build_snapshot,
    build_teams,
    load_tiers,
    ms,
    now_utc,
    player_dict,
    position,
    rule_config,
    tier_counts,
    tier_rule,
)
from .timer import LotTimer

log = logging.getLogger(__name__)

LIVE = ("running", "accelerated")
RESUME_MIN_MS = 3000


class AuctionError(Exception):
    def __init__(self, code: str, message: str | None = None, status: int = 409) -> None:
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        self.status = status


Events = list[tuple[str, Any]]


class AuctionEngine:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession], manager: ConnectionManager) -> None:
        self.sm = sessionmaker
        self.ws = manager
        self.lock = asyncio.Lock()
        self.timer = LotTimer(self)
        self._bid_times: dict[int, deque[float]] = defaultdict(deque)
        self.bid_rate_per_sec = 5

    # ------------------------------------------------------------------ helpers

    async def _state(self, s: AsyncSession) -> AuctionState:
        return (
            await s.execute(select(AuctionState).where(AuctionState.id == 1).with_for_update())
        ).scalar_one()

    async def _settings(self, s: AsyncSession) -> AuctionSettings:
        return (await s.execute(select(AuctionSettings).where(AuctionSettings.id == 1))).scalar_one()

    async def _lot(self, s: AsyncSession, lot_id: int) -> Lot | None:
        return (await s.execute(select(Lot).where(Lot.id == lot_id).with_for_update())).scalar_one_or_none()

    async def _open_lot(self, s: AsyncSession, state: AuctionState) -> Lot | None:
        if not state.current_lot_id:
            return None
        lot = await self._lot(s, state.current_lot_id)
        return lot if lot and lot.status == "open" else None

    def _audit(self, s: AsyncSession, user: User | None, action: str, payload: dict[str, Any] | None = None) -> None:
        s.add(AuditLog(actor_user_id=user.id if user else None, action=action, payload=payload or {}))

    async def snapshot(self) -> dict[str, Any]:
        async with self.sm() as s:
            return await build_snapshot(s, set(self.ws.online_user_ids))

    async def publish(self, events: Events) -> None:
        """Broadcast specific events, then the full snapshot, all at the snapshot's version."""
        if not self.ws.has_connections:
            return
        snap = await self.snapshot()
        v = snap["version"]
        for type_, data in events:
            await self.ws.broadcast(type_, v, data)
        await self.ws.broadcast("state", v, snap)

    async def _bump(self, state: AuctionState) -> None:
        state.version = (state.version or 0) + 1

    async def _queued_count(self, s: AsyncSession) -> int:
        return await s.scalar(select(func.count()).select_from(Player).where(Player.status == "queued")) or 0

    async def _pool_count(self, s: AsyncSession) -> int:
        return await s.scalar(select(func.count()).select_from(Player).where(Player.status == "unsold_pool")) or 0

    async def _all_teams_full(self, s: AsyncSession, settings: AuctionSettings) -> bool:
        counts = await tier_counts(s)
        teams = (await s.scalars(select(Team))).all()
        return all(sum(counts.get(t.id, {}).values()) >= settings.max_squad for t in teams)

    async def _drop_exhausted(
        self, s: AsyncSession, state: AuctionState, settings: AuctionSettings, tiers: list[Tier], user: User | None
    ) -> dict[str, Any] | None:
        """Send every queued player in a tier no team can buy into down to the next open tier.

        A tier is exhausted once every team has filled its quota there (or its squad). Its remaining
        players can never be sold, so they skip the block and drop at once, cascading past further
        exhausted tiers. With nowhere left to go (or in the accelerated round) they go to the pool.
        Returns a `tier_closed` event, or None when nothing moved.
        """
        teams = (await s.scalars(select(Team))).all()
        counts = await tier_counts(s)
        rule_tiers = [tier_rule(t) for t in tiers]
        dead = rules.exhausted_tiers([position(t, counts) for t in teams], rule_tiers, rule_config(settings))
        if not dead:
            return None
        queued = (
            await s.execute(
                select(Player)
                .where(Player.status == "queued", Player.current_tier_id.in_(dead))
                .order_by(Player.queue_pos, Player.id)
                .with_for_update()
            )
        ).scalars().all()
        if not queued:
            return None

        by_id = {t.id: t for t in rule_tiers}
        moves: list[dict[str, Any]] = []
        # Highest tier first, so players keep their relative order in the tier they land in.
        for p in sorted(queued, key=lambda p: (by_id[p.current_tier_id].rank, p.queue_pos, p.id)):
            from_tier = p.current_tier_id
            target, steps = rules.drop_target(by_id[from_tier], rule_tiers, dead)
            if state.status == "accelerated" or target is None:
                p.status = "unsold_pool"
                p.drop_count += steps
                to_tier = None
            else:
                p.current_tier_id = target.id
                p.drop_count += steps
                p.queue_pos = await self._back_pos(s, target.id)
                to_tier = target.id
            await s.flush()
            moves.append({"player_id": p.id, "player_name": p.name, "from_tier_id": from_tier, "to_tier_id": to_tier})
        await s.execute(delete(Nomination).where(Nomination.player_id.in_([m["player_id"] for m in moves])))
        self._audit(s, user, "tier_exhausted", {"tier_ids": sorted(dead), "moves": moves})
        return {"tier_ids": sorted(dead), "moves": moves}

    # ------------------------------------------------------------------ lifecycle

    async def tick(self, session: AsyncSession | None = None) -> None:
        """Close the current lot if its deadline has passed.

        On a long-running server the lot timer does this. On serverless hosts (Vercel) background
        tasks don't survive between requests, so every auction request calls this first instead.
        """
        query = (
            select(AuctionState.status, Lot.id, Lot.status, Lot.ends_at)
            .join(Lot, Lot.id == AuctionState.current_lot_id)
            .where(AuctionState.id == 1)
        )
        if session is not None:  # reuse the request's connection: one connection per request
            row = (await session.execute(query)).first()
        else:
            async with self.sm() as s:
                row = (await s.execute(query)).first()
        if row is None:
            return
        state_status, lot_id, lot_status, ends_at = row
        if state_status in LIVE and lot_status == "open" and ends_at and ends_at <= now_utc():
            await self.close_lot(lot_id, force=False)

    async def recover(self) -> None:
        """On startup, resume the timer of an open lot (or close it at once if its deadline passed)."""
        async with self.sm() as s:
            state = await s.get(AuctionState, 1)
            if not state or not state.current_lot_id or state.status not in LIVE:
                return
            lot = await s.get(Lot, state.current_lot_id)
            if lot and lot.status == "open" and lot.ends_at:
                log.info("recovering timer for lot %s", lot.id)
                self.timer.schedule(lot.id, lot.ends_at)

    async def shutdown(self) -> None:
        self.timer.cancel_all()

    async def start(self, user: User) -> None:
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                if state.status != "not_started":
                    raise AuctionError("ALREADY_STARTED", "The auction has already started")
                settings = await self._settings(s)
                settings.locked = True
                await s.execute(update(Team).values(purse_remaining=settings.purse))
                state.status = "running"
                state.resume_status = None
                events: Events = [("auction_status", {"status": "running"})]
                # A tier with a zero quota can never sell, so clear it before the first lot.
                if closed := await self._drop_exhausted(s, state, settings, await load_tiers(s), user):
                    events.append(("tier_closed", closed))
                await self._bump(state)
                self._audit(s, user, "auction_start")
            await self.publish(events)

    async def pause(self, user: User) -> None:
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                if state.status not in LIVE:
                    raise AuctionError("NOT_RUNNING", "The auction is not running")
                lot = await self._open_lot(s, state)
                seconds_left = None
                if lot and lot.ends_at:
                    remaining = max(0, int((lot.ends_at - now_utc()).total_seconds() * 1000))
                    lot.paused_remaining_ms = remaining
                    seconds_left = round(remaining / 1000, 1)
                    self.timer.cancel(lot.id)
                state.resume_status = state.status
                state.status = "paused"
                await self._bump(state)
                self._audit(s, user, "auction_pause", {"seconds_left": seconds_left})
            await self.publish([("auction_status", {"status": "paused", "seconds_left": seconds_left})])

    async def resume(self, user: User) -> None:
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                if state.status != "paused":
                    raise AuctionError("NOT_PAUSED", "The auction is not paused")
                state.status = state.resume_status or "running"
                state.resume_status = None
                lot = await self._open_lot(s, state)
                if lot:
                    remaining = max(lot.paused_remaining_ms or 0, RESUME_MIN_MS)
                    lot.ends_at = now_utc() + timedelta(milliseconds=remaining)
                    lot.paused_remaining_ms = None
                await self._bump(state)
                self._audit(s, user, "auction_resume")
                new_status = state.status
            if lot:
                self.timer.schedule(lot.id, lot.ends_at)
            await self.publish([("auction_status", {"status": new_status})])

    async def end(self, user: User) -> None:
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                if state.status in ("finished", "not_started"):
                    raise AuctionError("NOT_RUNNING", "The auction is not in progress")
                lot = await self._open_lot(s, state)
                if lot:
                    await self._cancel_lot(s, lot)
                state.current_lot_id = None
                state.status = "finished"
                state.resume_status = None
                await self._bump(state)
                self._audit(s, user, "auction_end")
            self.timer.cancel_all()
            await self.publish([("auction_status", {"status": "finished"})])

    async def _cancel_lot(self, s: AsyncSession, lot: Lot) -> None:
        """Abandon an open lot: bids stay in history, the player goes back to the front of the queue."""
        lot.status = "cancelled"
        lot.closed_at = now_utc()
        player = await s.get(Player, lot.player_id)
        if player and player.status == "on_block":
            player.status = "queued"
            player.queue_pos = await self._front_pos(s, player.current_tier_id)
        self.timer.cancel(lot.id)

    async def _front_pos(self, s: AsyncSession, tier_id: int) -> int:
        lo = await s.scalar(
            select(func.min(Player.queue_pos)).where(Player.current_tier_id == tier_id, Player.status == "queued")
        )
        return (lo if lo is not None else 0) - 1

    async def _back_pos(self, s: AsyncSession, tier_id: int) -> int:
        hi = await s.scalar(
            select(func.max(Player.queue_pos)).where(Player.current_tier_id == tier_id, Player.status == "queued")
        )
        return (hi if hi is not None else -1) + 1

    # ------------------------------------------------------------------ lots

    async def next_player(self, user: User, mode: str = "order", player_id: int | None = None) -> dict[str, Any]:
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                if state.status not in LIVE:
                    raise AuctionError("NOT_RUNNING", "Start or resume the auction first")
                if await self._open_lot(s, state):
                    raise AuctionError("LOT_OPEN", "A player is already on the block")
                settings = await self._settings(s)
                tiers = await load_tiers(s)

                # Category by category: every mode draws only from the current category.
                queued = (await s.scalars(select(Player).where(Player.status == "queued"))).all()
                if not queued:
                    raise AuctionError("QUEUE_EMPTY", self._queue_empty_message(state, settings))
                category = rules.current_category(
                    (p.current_tier_id for p in queued), [tier_rule(t) for t in tiers]
                )
                assert category is not None
                candidates = sorted(
                    (p for p in queued if p.current_tier_id == category.id), key=lambda p: (p.queue_pos, p.id)
                )
                if mode == "pick":
                    if player_id is None:
                        raise AuctionError("PLAYER_REQUIRED", "Pick a player", 422)
                    player = next((p for p in queued if p.id == player_id), None)
                    if player is None:
                        raise AuctionError("NOT_QUEUED", "That player is not waiting in a queue")
                    if player.current_tier_id != category.id:
                        raise AuctionError(
                            "OTHER_CATEGORY",
                            f"{category.name} is still running. Pick a player from the {category.name} queue.",
                        )
                elif mode == "random":
                    player = random.choice(candidates)
                else:
                    player = candidates[0]

                tier = next(t for t in tiers if t.id == player.current_tier_id)
                ends_at = now_utc() + timedelta(seconds=settings.opening_timer_s)
                lot = Lot(
                    player_id=player.id,
                    tier_id=tier.id,
                    round="accelerated" if state.status == "accelerated" else "main",
                    status="open",
                    opening_price=tier.base_price,
                    ends_at=ends_at,
                    opened_at=now_utc(),
                )
                s.add(lot)
                await s.flush()
                player.status = "on_block"
                state.current_lot_id = lot.id
                state.current_tier_id = tier.id
                await self._bump(state)
                event = {
                    "lot_id": lot.id,
                    "player": player_dict(player),
                    "tier_id": tier.id,
                    "round": lot.round,
                    "opening_price": lot.opening_price,
                    "ends_at": ms(ends_at),
                    "server_now": ms(now_utc()),
                }
            self.timer.schedule(lot.id, ends_at)
            await self.publish([("lot_opened", event)])
            return event

    def _queue_empty_message(self, state: AuctionState, settings: AuctionSettings) -> str:
        if state.status == "running" and settings.accelerated_enabled:
            return "Main round complete. Collect nominations and start the accelerated round, or end the auction."
        return "No players left in the queue. End the auction."

    async def place_bid(self, user: User, lot_id: int, amount: int) -> tuple[bool, str | None, dict | None]:
        """Returns (accepted, reason_code, event). Rejections are not broadcast."""
        if user.role != "owner" or user.team_id is None:
            return False, rules.NOT_OWNER, None
        if not self._rate_ok(user.id):
            return False, rules.RATE_LIMITED, None

        async with self.lock:
            try:
                async with self.sm() as s, s.begin():
                    state = await self._state(s)
                    lot = await self._lot(s, lot_id)
                    team = (
                        await s.execute(select(Team).where(Team.id == user.team_id).with_for_update())
                    ).scalar_one()
                    settings = await self._settings(s)
                    now = now_utc()

                    if state.status == "paused":
                        return False, rules.PAUSED, None
                    if state.status not in LIVE:
                        return False, rules.LOT_CLOSED, None
                    if not lot or lot.status != "open" or lot.ends_at is None or now >= lot.ends_at:
                        return False, rules.LOT_CLOSED, None
                    if lot.high_team_id == team.id:
                        return False, rules.OWN_HIGH_BID, None

                    tiers = await load_tiers(s)
                    tier = next(t for t in tiers if t.id == lot.tier_id)
                    cfg = rule_config(settings)
                    expected = rules.next_bid(lot.opening_price, lot.high_bid, tier.bid_step, cfg)
                    if amount != expected:
                        return False, rules.STALE_AMOUNT, None

                    pos = position(team, await tier_counts(s))
                    reason = rules.bid_block_reason(
                        pos, tier_rule(tier), [tier_rule(t) for t in tiers], cfg, amount, lot.high_team_id
                    )
                    if reason:
                        return False, reason, None

                    bid = Bid(lot_id=lot.id, team_id=team.id, user_id=user.id, amount=amount, created_at=now)
                    s.add(bid)
                    await s.flush()
                    lot.high_bid = amount
                    lot.high_team_id = team.id
                    # A bid resets the clock to reset_timer_s, but never shortens it.
                    lot.ends_at = max(lot.ends_at, now + timedelta(seconds=settings.reset_timer_s))
                    await self._bump(state)
                    event = {
                        "lot_id": lot.id,
                        "bid_id": bid.id,
                        "team_id": team.id,
                        "user_id": user.id,
                        "amount": amount,
                        "next_bid": rules.next_bid(lot.opening_price, amount, tier.bid_step, cfg),
                        "ends_at": ms(lot.ends_at),
                        "server_now": ms(now_utc()),
                    }
            except IntegrityError:
                return False, rules.STALE_AMOUNT, None
            await self.publish([("bid_placed", event)])
            return True, None, event

    def _rate_ok(self, user_id: int) -> bool:
        now = time.monotonic()
        q = self._bid_times[user_id]
        while q and now - q[0] > 1.0:
            q.popleft()
        if len(q) >= self.bid_rate_per_sec:
            return False
        q.append(now)
        return True

    async def close_lot(self, lot_id: int, force: bool = False, user: User | None = None) -> Any:
        """Close a lot. Returns the new deadline (datetime) if it moved, the close event if closed, else None."""
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                lot = await self._lot(s, lot_id)
                if not lot or lot.status != "open":
                    return None
                if not force:
                    if state.status == "paused":
                        return None
                    if lot.ends_at and now_utc() < lot.ends_at:
                        return lot.ends_at

                settings = await self._settings(s)
                tiers = await load_tiers(s)
                tier = next(t for t in tiers if t.id == lot.tier_id)
                player = (
                    await s.execute(select(Player).where(Player.id == lot.player_id).with_for_update())
                ).scalar_one()
                lot.closed_at = now_utc()
                lot.paused_remaining_ms = None
                event: dict[str, Any] = {"lot_id": lot.id, "player": None, "tier_id": tier.id, "round": lot.round}

                if lot.high_bid is not None and lot.high_team_id is not None:
                    team = (
                        await s.execute(select(Team).where(Team.id == lot.high_team_id).with_for_update())
                    ).scalar_one()
                    team.purse_remaining -= lot.high_bid
                    player.status = "sold"
                    player.sold_team_id = team.id
                    player.sold_price = lot.high_bid
                    player.current_tier_id = tier.id
                    lot.status = "sold"
                    event.update(result="sold", team_id=team.id, price=lot.high_bid)
                    self._audit(s, user, "sale", {"lot_id": lot.id, "player_id": player.id,
                                                  "team_id": team.id, "price": lot.high_bid,
                                                  "hammered": force})
                else:
                    lot.status = "unsold"
                    lower = rules.drop_tier(tier_rule(tier), [tier_rule(t) for t in tiers])
                    if lot.round == "accelerated" or lower is None:
                        player.status = "unsold_pool"
                        event.update(result="unsold", dropped_to_tier_id=None, to_pool=True)
                    else:
                        player.status = "queued"
                        player.current_tier_id = lower.id
                        player.drop_count += 1
                        player.queue_pos = await self._back_pos(s, lower.id)
                        lot.dropped_to_tier_id = lower.id
                        event.update(result="unsold", dropped_to_tier_id=lower.id, to_pool=False)
                    self._audit(s, user, "unsold", {"lot_id": lot.id, "player_id": player.id,
                                                    "dropped_to_tier_id": lot.dropped_to_tier_id})

                await s.execute(delete(Nomination).where(Nomination.player_id == player.id))
                await s.flush()
                event["player"] = player_dict(player)
                state.current_lot_id = None
                events: Events = [("lot_closed", event)]
                if closed := await self._drop_exhausted(s, state, settings, tiers, user):
                    events.append(("tier_closed", closed))

                if await self._should_finish(s, state, settings):
                    state.status = "finished"
                    state.resume_status = None
                    events.append(("auction_status", {"status": "finished"}))
                await self._bump(state)
                events.insert(1, ("teams_updated", await build_teams(s, settings, tiers)))
            self.timer.cancel(lot_id)
            await self.publish(events)
            return event

    async def _should_finish(self, s: AsyncSession, state: AuctionState, settings: AuctionSettings) -> bool:
        if await self._all_teams_full(s, settings):
            return True
        if await self._queued_count(s) > 0:
            return False
        if state.status == "accelerated":
            return True
        return not settings.accelerated_enabled or await self._pool_count(s) == 0

    async def hammer(self, user: User) -> dict[str, Any]:
        async with self.sm() as s:
            state = await s.get(AuctionState, 1)
            lot_id = state.current_lot_id if state else None
        if not lot_id:
            raise AuctionError("NO_LOT", "No player is on the block")
        result = await self.close_lot(lot_id, force=True, user=user)
        if not isinstance(result, dict):
            raise AuctionError("NO_LOT", "No player is on the block")
        return result

    async def extend(self, user: User, seconds: int) -> None:
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                lot = await self._open_lot(s, state)
                if not lot:
                    raise AuctionError("NO_LOT", "No player is on the block")
                if state.status == "paused":
                    lot.paused_remaining_ms = (lot.paused_remaining_ms or 0) + seconds * 1000
                else:
                    base = max(lot.ends_at or now_utc(), now_utc())
                    lot.ends_at = base + timedelta(seconds=seconds)
                await self._bump(state)
                self._audit(s, user, "extend", {"lot_id": lot.id, "seconds": seconds})
                event = {"lot_id": lot.id, "ends_at": ms(lot.ends_at), "server_now": ms(now_utc()),
                         "paused_remaining_ms": lot.paused_remaining_ms}
                running = state.status in LIVE
                ends_at, lid = lot.ends_at, lot.id
            if running and ends_at:
                self.timer.schedule(lid, ends_at)
            await self.publish([("lot_extended", event)])

    async def undo_sale(self, user: User) -> dict[str, Any]:
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                if await self._open_lot(s, state):
                    raise AuctionError("LOT_OPEN", "Close the current lot before undoing a sale")
                lot = (
                    await s.execute(
                        select(Lot).where(Lot.status == "sold").order_by(Lot.closed_at.desc(), Lot.id.desc())
                        .limit(1).with_for_update()
                    )
                ).scalar_one_or_none()
                if not lot:
                    raise AuctionError("NO_SALE", "There is no sale to undo")
                team = (await s.execute(select(Team).where(Team.id == lot.high_team_id).with_for_update())).scalar_one()
                player = (await s.execute(select(Player).where(Player.id == lot.player_id).with_for_update())).scalar_one()
                price = lot.high_bid or 0
                team.purse_remaining += price
                player.status = "queued"
                player.sold_team_id = None
                player.sold_price = None
                player.current_tier_id = lot.tier_id
                player.queue_pos = await self._front_pos(s, lot.tier_id)
                lot.status = "cancelled"
                if state.status == "finished":
                    state.status = "accelerated" if lot.round == "accelerated" else "running"
                await self._bump(state)
                self._audit(s, user, "undo_sale", {"lot_id": lot.id, "player_id": player.id,
                                                   "team_id": team.id, "price": price})
                event = {"lot_id": lot.id, "player_id": player.id, "player_name": player.name,
                         "team_id": team.id, "price": price}
            await self.publish([("sale_undone", event)])
            return event

    # ------------------------------------------------------------------ accelerated round

    async def nominate(self, user: User, player_ids: list[int]) -> None:
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                live = state.status in ("running", "paused") and (state.resume_status or "running") == "running"
                if not live:
                    raise AuctionError("NOMINATIONS_CLOSED", "Nominations are only open during the main round")
                ids = list(dict.fromkeys(player_ids))
                if ids:
                    pool_ids = set(
                        (await s.scalars(
                            select(Player.id).where(Player.id.in_(ids), Player.status == "unsold_pool")
                        )).all()
                    )
                    bad = [i for i in ids if i not in pool_ids]
                    if bad:
                        raise AuctionError("NOT_IN_POOL", "Only players in the unsold pool can be nominated", 422)
                await s.execute(delete(Nomination).where(Nomination.team_id == user.team_id))
                for pid in ids:
                    s.add(Nomination(team_id=user.team_id, player_id=pid))
                await self._bump(state)
            await self.publish([("nominations_updated", {"team_id": user.team_id, "player_ids": ids})])

    async def start_accelerated(self, user: User) -> None:
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                settings = await self._settings(s)
                if state.status != "running":
                    raise AuctionError("NOT_RUNNING", "The main round must be running")
                if not settings.accelerated_enabled:
                    raise AuctionError("DISABLED", "The accelerated round is switched off in the rules")
                if await self._open_lot(s, state):
                    raise AuctionError("LOT_OPEN", "A player is already on the block")
                if await self._queued_count(s):
                    raise AuctionError("MAIN_NOT_DONE", "Players are still waiting in the main round")
                noms = (await s.scalars(select(Nomination).order_by(Nomination.created_at))).all()
                ordered = list(dict.fromkeys(n.player_id for n in noms))
                if not ordered:
                    raise AuctionError("NO_NOMINATIONS", "No players have been nominated")
                lowest = (await s.scalars(select(Tier).order_by(Tier.rank.desc()).limit(1))).one()
                for i, pid in enumerate(ordered):
                    p = await s.get(Player, pid)
                    if p and p.status == "unsold_pool":
                        p.status = "queued"
                        p.current_tier_id = lowest.id
                        p.queue_pos = i
                await s.execute(delete(Nomination))
                state.status = "accelerated"
                await self._bump(state)
                self._audit(s, user, "accelerated_start", {"player_ids": ordered})
            await self.publish([("auction_status", {"status": "accelerated"})])

    # ------------------------------------------------------------------ reset

    async def reset(self, user: User) -> None:
        async with self.lock:
            self.timer.cancel_all()
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                settings = await self._settings(s)
                state.current_lot_id = None
                state.current_tier_id = None
                await s.flush()
                await s.execute(delete(Bid))
                await s.execute(delete(Nomination))
                await s.execute(delete(Lot))
                players = (await s.scalars(select(Player).order_by(Player.original_tier_id, Player.queue_pos))).all()
                pos: dict[int, int] = defaultdict(int)
                # Restore each player to their original tier, in the order they were added.
                for p in sorted(players, key=lambda p: (p.original_tier_id, p.id)):
                    p.status = "queued"
                    p.current_tier_id = p.original_tier_id
                    p.sold_team_id = None
                    p.sold_price = None
                    p.drop_count = 0
                    p.queue_pos = pos[p.original_tier_id]
                    pos[p.original_tier_id] += 1
                await s.execute(update(Team).values(purse_remaining=settings.purse))
                settings.locked = False
                state.status = "not_started"
                state.resume_status = None
                await self._bump(state)
                self._audit(s, user, "auction_reset")
            self._bid_times.clear()
            await self.publish([("auction_status", {"status": "not_started"}), ("settings_updated", {})])

    async def notify_settings_changed(self) -> None:
        """Called by REST routes after player/team/rule edits so every client refreshes."""
        async with self.lock:
            async with self.sm() as s, s.begin():
                state = await self._state(s)
                await self._bump(state)
            await self.publish([("settings_updated", {})])

    async def broadcast_presence(self) -> None:
        snap = await self.snapshot()
        await self.ws.broadcast("presence", snap["version"], {"online": snap["online"]})
        await self.ws.broadcast("state", snap["version"], snap)
