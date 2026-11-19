"""Pure auction rule functions. No I/O — every function here is unit-tested directly."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field


@dataclass(frozen=True)
class TierRule:
    id: int
    rank: int
    max_per_team: int
    base_price: int
    bid_step: int
    name: str = ""


@dataclass(frozen=True)
class TeamPosition:
    id: int
    purse_remaining: int
    # tier_id -> players held in that tier
    tier_counts: Mapping[int, int] = field(default_factory=dict)

    @property
    def squad_size(self) -> int:
        return sum(self.tier_counts.values())


@dataclass(frozen=True)
class RuleConfig:
    min_squad: int
    max_squad: int
    slabs_enabled: bool = False
    slabs: Sequence[Mapping[str, int]] = ()


# Reason codes sent back to a bidder.
PAUSED = "PAUSED"
LOT_CLOSED = "LOT_CLOSED"
OWN_HIGH_BID = "OWN_HIGH_BID"
STALE_AMOUNT = "STALE_AMOUNT"
SQUAD_FULL = "SQUAD_FULL"
TIER_FULL = "TIER_FULL"
OVER_MAX_BID = "OVER_MAX_BID"
NOT_OWNER = "NOT_OWNER"
RATE_LIMITED = "RATE_LIMITED"


def slab_step(price: int, slabs: Sequence[Mapping[str, int]], fallback: int) -> int:
    """Step from the slab the current price falls in: the slab with the largest `from` ≤ price."""
    best: Mapping[str, int] | None = None
    for slab in slabs:
        if slab.get("from", 0) <= price and (best is None or slab.get("from", 0) > best.get("from", 0)):
            best = slab
    if best is None or int(best.get("step", 0)) <= 0:
        return fallback
    return int(best["step"])


def bid_step(high_bid: int, tier_step: int, cfg: RuleConfig) -> int:
    if cfg.slabs_enabled and cfg.slabs:
        return slab_step(high_bid, cfg.slabs, tier_step)
    return tier_step


def next_bid(opening_price: int, high_bid: int | None, tier_step: int, cfg: RuleConfig) -> int:
    """The opening bid is the lot's opening price; each later bid adds the step."""
    if high_bid is None:
        return opening_price
    return high_bid + bid_step(high_bid, tier_step, cfg)


def open_slots(team: TeamPosition, tiers: Sequence[TierRule]) -> dict[int, int]:
    return {t.id: max(0, t.max_per_team - team.tier_counts.get(t.id, 0)) for t in tiers}


def cheapest_open_base(team: TeamPosition, tiers: Sequence[TierRule]) -> int:
    """Lowest base price among tiers where the team still has a slot (0 if none)."""
    slots = open_slots(team, tiers)
    prices = [t.base_price for t in tiers if slots[t.id] > 0]
    return min(prices) if prices else 0


def reserve(team: TeamPosition, tiers: Sequence[TierRule], cfg: RuleConfig) -> int:
    """Purse the team must keep to still reach the minimum squad after buying one more player."""
    still_needed = max(0, cfg.min_squad - (team.squad_size + 1))
    return still_needed * cheapest_open_base(team, tiers)


def max_bid(team: TeamPosition, tiers: Sequence[TierRule], cfg: RuleConfig) -> int:
    return max(0, team.purse_remaining - reserve(team, tiers, cfg))


def bid_block_reason(
    team: TeamPosition,
    tier: TierRule,
    tiers: Sequence[TierRule],
    cfg: RuleConfig,
    amount: int,
    high_team_id: int | None,
) -> str | None:
    """Team-level checks for a bid of `amount` on a lot in `tier`. None means allowed.

    Order matches the engine: own high bid, squad cap, tier quota, purse reserve.
    """
    if high_team_id == team.id:
        return OWN_HIGH_BID
    if team.squad_size >= cfg.max_squad:
        return SQUAD_FULL
    if team.tier_counts.get(tier.id, 0) >= tier.max_per_team:
        return TIER_FULL
    if amount > max_bid(team, tiers, cfg):
        return OVER_MAX_BID
    return None


def can_any_team_bid(
    teams: Sequence[TeamPosition], tier: TierRule, tiers: Sequence[TierRule], cfg: RuleConfig, amount: int
) -> bool:
    return any(bid_block_reason(t, tier, tiers, cfg, amount, None) is None for t in teams)


def drop_tier(current: TierRule, tiers: Sequence[TierRule]) -> TierRule | None:
    """The next tier down by rank, or None when the player was already in the lowest tier."""
    lower = sorted((t for t in tiers if t.rank > current.rank), key=lambda t: t.rank)
    return lower[0] if lower else None


def tier_has_buyer(teams: Sequence[TeamPosition], tier: TierRule, cfg: RuleConfig) -> bool:
    """True while at least one team still has a slot in `tier` and room in its squad."""
    return any(
        t.tier_counts.get(tier.id, 0) < tier.max_per_team and t.squad_size < cfg.max_squad for t in teams
    )


def exhausted_tiers(teams: Sequence[TeamPosition], tiers: Sequence[TierRule], cfg: RuleConfig) -> set[int]:
    """Tiers no team can buy into any more: every team has hit that tier's quota or the squad cap."""
    if not teams:
        return set()
    return {t.id for t in tiers if not tier_has_buyer(teams, t, cfg)}


def drop_target(
    current: TierRule, tiers: Sequence[TierRule], exhausted: set[int]
) -> tuple[TierRule | None, int]:
    """Where a player in an exhausted tier lands: the first lower tier that still has a buyer.

    Returns (tier, tiers dropped). The tier is None when nothing below has an open slot
    (the player goes to the unsold pool).
    """
    lower = sorted((t for t in tiers if t.rank > current.rank), key=lambda t: t.rank)
    for steps, t in enumerate(lower, start=1):
        if t.id not in exhausted:
            return t, steps
    return None, len(lower)


def current_category(queued_tier_ids: Iterable[int], tiers: Sequence[TierRule]) -> TierRule | None:
    """The category being auctioned: the highest-ranked tier that still has players waiting.

    The auction runs category by category, so Next, Random and hand-picks all draw from this tier
    only. Unsold players drop into a lower tier and wait their turn there.
    """
    waiting = set(queued_tier_ids)
    open_tiers = sorted((t for t in tiers if t.id in waiting), key=lambda t: t.rank)
    return open_tiers[0] if open_tiers else None
