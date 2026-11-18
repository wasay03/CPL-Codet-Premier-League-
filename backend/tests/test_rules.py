import pytest

from app.engine import rules
from app.engine.rules import RuleConfig, TeamPosition, TierRule

TIERS = [
    TierRule(1, 1, 2, 200, 20, "Platinum"),
    TierRule(2, 2, 2, 100, 10, "Diamond"),
    TierRule(3, 3, 2, 50, 5, "Gold"),
    TierRule(4, 4, 2, 25, 5, "Silver"),
    TierRule(5, 5, 1, 10, 2, "Emerging"),
]
CFG = RuleConfig(min_squad=7, max_squad=9)
SLABS = RuleConfig(7, 9, True, ({"from": 0, "step": 5}, {"from": 100, "step": 10}, {"from": 200, "step": 20}))


@pytest.mark.parametrize(
    "opening,high,step,cfg,expected",
    [
        (200, None, 20, CFG, 200),
        (200, 200, 20, CFG, 220),
        (10, 30, 2, CFG, 32),
        (25, 95, 5, SLABS, 100),
        (25, 100, 5, SLABS, 110),
        (25, 250, 5, SLABS, 270),
        (25, None, 5, SLABS, 25),
    ],
)
def test_next_bid(opening, high, step, cfg, expected):
    assert rules.next_bid(opening, high, step, cfg) == expected


def test_slab_fallback_when_no_slab_matches():
    assert rules.slab_step(5, [{"from": 10, "step": 3}], 7) == 7


@pytest.mark.parametrize(
    "counts,purse,expected_reserve",
    [
        ({}, 1000, 6 * 10),  # needs 6 more after this one, cheapest open is Emerging (10)
        ({5: 1}, 1000, 5 * 25),  # Emerging full -> cheapest open is Silver
        ({1: 2, 2: 2, 3: 2, 4: 2, 5: 1}, 0, 0),  # full squad
        ({1: 2, 2: 2, 3: 2}, 300, 0),  # 6 players: buying a 7th reaches the minimum
        ({1: 2, 2: 2}, 400, 2 * 10),
    ],
)
def test_reserve(counts, purse, expected_reserve):
    team = TeamPosition(1, purse, counts)
    assert rules.reserve(team, TIERS, CFG) == expected_reserve
    assert rules.max_bid(team, TIERS, CFG) == max(0, purse - expected_reserve)


def test_cheapest_open_base_none_left():
    full = TeamPosition(1, 0, {1: 2, 2: 2, 3: 2, 4: 2, 5: 1})
    assert rules.cheapest_open_base(full, TIERS) == 0
    assert rules.open_slots(full, TIERS) == {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}


def test_block_reasons_in_order():
    plat = TIERS[0]
    t = TeamPosition(1, 1000, {})
    assert rules.bid_block_reason(t, plat, TIERS, CFG, 200, high_team_id=1) == rules.OWN_HIGH_BID
    full = TeamPosition(1, 1000, {1: 2, 2: 2, 3: 2, 4: 2, 5: 1})
    assert rules.bid_block_reason(full, plat, TIERS, CFG, 200, None) == rules.SQUAD_FULL
    plat_full = TeamPosition(1, 1000, {1: 2})
    assert rules.bid_block_reason(plat_full, plat, TIERS, CFG, 200, None) == rules.TIER_FULL
    poor = TeamPosition(1, 250, {})
    # reserve 60 -> max bid 190
    assert rules.bid_block_reason(poor, plat, TIERS, CFG, 200, None) == rules.OVER_MAX_BID
    assert rules.bid_block_reason(t, plat, TIERS, CFG, 200, 2) is None


def test_squad_cap_respects_custom_max():
    cfg = RuleConfig(min_squad=2, max_squad=3)
    t = TeamPosition(1, 1000, {3: 2, 4: 1})
    assert rules.bid_block_reason(t, TIERS[4], TIERS, cfg, 10, None) == rules.SQUAD_FULL


def test_drop_tier_cascade():
    seen = []
    tier = TIERS[0]
    while (tier := rules.drop_tier(tier, TIERS)) is not None:
        seen.append(tier.name)
    assert seen == ["Diamond", "Gold", "Silver", "Emerging"]


def test_full_squad_at_base_costs_760():
    cost = sum(t.base_price * t.max_per_team for t in TIERS)
    assert cost == 760
