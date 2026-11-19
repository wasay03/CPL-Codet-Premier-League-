import asyncio
import random
from datetime import timedelta

from sqlalchemy import select

from app.db import SessionLocal
from app.engine.auction import AuctionEngine
from app.engine.snapshot import now_utc
from app.models import Lot, User
from app.ws.manager import ConnectionManager

from .conftest import sql


async def admin_post(client, auth, path, **body):
    r = await client.post(f"/api/auction/{path}", json=body or None, headers=auth["admin"])
    assert r.status_code == 200, (path, r.text)
    return r.json()


async def bid(client, auth, owner, lot_id, amount):
    return await client.post("/api/auction/bid", json={"lot_id": lot_id, "amount": amount}, headers=auth[owner])


async def state(client, auth):
    return (await client.get("/api/auction/state", headers=auth["admin"])).json()


async def set_rules(client, auth, **changes):
    s = (await client.get("/api/settings", headers=auth["admin"])).json()
    s.update(changes)
    r = await client.put("/api/settings", json=s, headers=auth["admin"])
    assert r.status_code == 200, r.text


async def test_bid_sell_and_purse(client, auth):
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next", mode="order")
    assert lot["opening_price"] == 200
    lid = lot["lot_id"]
    assert (await bid(client, auth, "owner1", lid, 200)).status_code == 200
    r = await bid(client, auth, "owner1", lid, 220)
    assert r.json()["detail"] == "OWN_HIGH_BID"
    r = await bid(client, auth, "owner2", lid, 200)
    assert r.json()["detail"] == "STALE_AMOUNT"
    assert (await bid(client, auth, "owner2", lid, 220)).status_code == 200
    closed = await admin_post(client, auth, "hammer")
    assert closed["result"] == "sold" and closed["team_id"] == 2 and closed["price"] == 220
    snap = await state(client, auth)
    t2 = next(t for t in snap["teams"] if t["id"] == 2)
    assert t2["purse_remaining"] == 1780 and t2["squad_size"] == 1
    assert t2["squad"][0]["name"] == lot["player"]["name"]
    assert snap["lot"] is None
    r = await bid(client, auth, "owner1", lid, 240)
    assert r.json()["detail"] == "LOT_CLOSED"



async def test_ipl_style_bid_steps(client, auth):
    """Default slabs: +5 under 100, +10 to 200, +20 to 500, +25 above (units of Rs 100,000)."""
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")  # Platinum, opens at 200 (Rs 20M)
    amounts, owners = [], ["owner1", "owner2"]
    amount = lot["opening_price"]
    for i in range(18):
        r = await bid(client, auth, owners[i % 2], lot["lot_id"], amount)
        assert r.status_code == 200, r.text
        amounts.append(amount)
        amount = r.json()["next_bid"]
    steps = {b - a for a, b in zip(amounts, amounts[1:])}
    assert amounts[:3] == [200, 220, 240] and steps == {20, 25}
    assert all(b - a == 25 for a, b in zip(amounts, amounts[1:]) if a >= 500)

    csv = (await client.get("/api/export/results.csv", headers=auth["admin"])).text
    assert "price_rs_million" in csv and "Team One,200" in csv  # purse still Rs 200M before the sale
    await admin_post(client, auth, "hammer")
    csv = (await client.get("/api/export/results.csv", headers=auth["admin"])).text
    assert f",{amounts[-1] / 10:g}," in csv

async def test_bid_extends_clock(client, auth):
    await set_rules(client, auth, opening_timer_s=5, reset_timer_s=15)
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    ev = (await bid(client, auth, "owner1", lot["lot_id"], 200)).json()
    assert ev["ends_at"] - ev["server_now"] > 14000


async def test_race_three_identical_bids(client, auth, eng):
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    results = await asyncio.gather(*(bid(client, auth, o, lot["lot_id"], 200) for o in ("owner1", "owner2", "owner3")))
    codes = sorted(r.status_code for r in results)
    assert codes == [200, 409, 409]
    assert sorted(r.json().get("detail", "") for r in results if r.status_code == 409) == ["STALE_AMOUNT"] * 2
    rows = await sql("select count(*) from bids")
    assert rows[0][0] == 1


async def test_tier_quota_and_squad_rules(client, auth):
    await admin_post(client, auth, "start")
    for _ in range(2):
        lot = await admin_post(client, auth, "next")
        assert (await bid(client, auth, "owner1", lot["lot_id"], 200)).status_code == 200
        await admin_post(client, auth, "hammer")
    lot = await admin_post(client, auth, "next")
    r = await bid(client, auth, "owner1", lot["lot_id"], 200)
    assert r.json()["detail"] == "TIER_FULL"


async def test_over_max_bid(client, auth):
    await set_rules(client, auth, purse=300)
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    # 300 purse, reserve 6 * 10 = 60 -> max 240; 200 ok
    assert (await bid(client, auth, "owner1", lot["lot_id"], 200)).status_code == 200
    assert (await bid(client, auth, "owner2", lot["lot_id"], 220)).status_code == 200
    r = await bid(client, auth, "owner1", lot["lot_id"], 240)
    assert r.status_code == 200
    r = await bid(client, auth, "owner2", lot["lot_id"], 260)
    assert r.json()["detail"] == "OVER_MAX_BID"


async def test_pause_blocks_bids_and_resume(client, auth):
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    await admin_post(client, auth, "pause")
    r = await bid(client, auth, "owner1", lot["lot_id"], 200)
    assert r.json()["detail"] == "PAUSED"
    snap = await state(client, auth)
    assert snap["status"] == "paused" and snap["lot"]["paused_remaining_ms"] > 25000
    await admin_post(client, auth, "resume")
    assert (await bid(client, auth, "owner1", lot["lot_id"], 200)).status_code == 200


async def test_unsold_drops_a_tier(client, auth):
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    closed = await admin_post(client, auth, "hammer")
    assert closed["result"] == "unsold" and closed["dropped_to_tier_id"] == 2
    snap = await state(client, auth)
    diamond = snap["queues"]["2"]
    assert diamond[-1]["id"] == lot["player"]["id"] and diamond[-1]["drop_count"] == 1


async def test_drop_cascade_to_pool(client, auth):
    # One player, so each tier it drops into is the current category straight away.
    await sql("delete from players where id not in (select id from players order by id limit 1)")
    await admin_post(client, auth, "start")
    target = (await admin_post(client, auth, "next"))["player"]["id"]
    await admin_post(client, auth, "hammer")
    for _tier in range(4):
        lot = await admin_post(client, auth, "next", mode="pick", player_id=target)
        assert lot["opening_price"] == [100, 50, 25, 10][_tier]
        await admin_post(client, auth, "hammer")
    rows = await sql("select status, drop_count from players where id = :i", i=target)
    assert rows == [("unsold_pool", 4)]


async def test_random_stays_in_current_category(client, auth):
    await admin_post(client, auth, "start")
    snap = await state(client, auth)
    platinum = {p["id"] for p in snap["queues"]["1"]}
    assert snap["active_tier_id"] == 1
    picked = []
    for _ in range(len(platinum)):
        lot = await admin_post(client, auth, "next", mode="random")
        assert lot["tier_id"] == 1  # never Diamond, even with unsold Platinum players now waiting there
        assert (await state(client, auth))["active_tier_id"] == 1
        picked.append(lot["player"]["id"])
        await admin_post(client, auth, "hammer")  # unsold -> drops to Diamond
    assert set(picked) == platinum
    # Platinum is done: the auction moves on to Diamond, dropped players included.
    assert (await state(client, auth))["active_tier_id"] == 2
    assert (await admin_post(client, auth, "next", mode="random"))["tier_id"] == 2


async def test_pick_only_from_current_category(client, auth):
    await admin_post(client, auth, "start")
    snap = await state(client, auth)
    diamond_player = snap["queues"]["2"][0]["id"]
    platinum_player = snap["queues"]["1"][-1]["id"]
    r = await client.post("/api/auction/next", json={"mode": "pick", "player_id": diamond_player}, headers=auth["admin"])
    assert r.status_code == 409 and r.json()["code"] == "OTHER_CATEGORY"
    lot = await admin_post(client, auth, "next", mode="pick", player_id=platinum_player)
    assert lot["player"]["id"] == platinum_player


async def set_tier(client, auth, tier_id, **changes):
    s = (await client.get("/api/settings", headers=auth["admin"])).json()
    for t in s["tiers"]:
        if t["id"] == tier_id:
            t.update(changes)
    r = await client.put("/api/settings", json=s, headers=auth["admin"])
    assert r.status_code == 200, r.text


async def test_exhausted_tier_drops_remaining_players(client, auth):
    await set_tier(client, auth, 1, max_per_team=1)  # 3 Platinum slots, 6 Platinum players
    await admin_post(client, auth, "start")
    for owner in ("owner1", "owner2"):
        lot = await admin_post(client, auth, "next")
        assert (await bid(client, auth, owner, lot["lot_id"], 200)).status_code == 200
        await admin_post(client, auth, "hammer")
    snap = await state(client, auth)
    left = [p["id"] for p in snap["queues"]["1"]]
    assert len(left) == 4  # one slot still open -> nothing moves yet

    lot = await admin_post(client, auth, "next")
    assert (await bid(client, auth, "owner3", lot["lot_id"], 200)).status_code == 200
    await admin_post(client, auth, "hammer")
    snap = await state(client, auth)
    assert snap["queues"].get("1", []) == []
    still_queued = [i for i in left if i != lot["player"]["id"]]
    diamond_tail = [p["id"] for p in snap["queues"]["2"]][-len(still_queued):]
    assert diamond_tail == still_queued  # same order, at the back of Diamond
    assert all(p["drop_count"] == 1 for p in snap["queues"]["2"][-len(still_queued):])
    audit = (await client.get("/api/audit", headers=auth["admin"])).json()
    assert any(a["action"] == "tier_exhausted" for a in audit)

    # The next lot comes from Diamond at the Diamond base price.
    assert (await admin_post(client, auth, "next"))["opening_price"] == 100


async def test_exhausted_drop_cascades_past_closed_tiers(client, auth):
    await set_tier(client, auth, 2, max_per_team=0)  # Diamond can never sell
    await set_tier(client, auth, 1, max_per_team=0)  # nor Platinum
    await admin_post(client, auth, "start")
    snap = await state(client, auth)
    assert snap["queues"].get("1", []) == [] and snap["queues"].get("2", []) == []
    platinum = await sql("select drop_count from players where original_tier_id = 1")
    assert {r[0] for r in platinum} == {2}  # Platinum -> (Diamond) -> Gold
    assert (await admin_post(client, auth, "next"))["opening_price"] == 50


async def test_unsold_into_exhausted_tier_falls_through_to_pool(client, auth):
    await sql("delete from players where id not in (select id from players order by id limit 1)")
    for tier_id in (2, 3, 4, 5):
        await set_tier(client, auth, tier_id, max_per_team=0)
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    await admin_post(client, auth, "hammer")  # unsold -> Diamond, which is closed -> pool
    rows = await sql("select status, drop_count from players where id = :i", i=lot["player"]["id"])
    assert rows == [("unsold_pool", 4)]

async def test_timer_closes_lot(client, auth):
    await set_rules(client, auth, opening_timer_s=1, reset_timer_s=1)
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    await bid(client, auth, "owner3", lot["lot_id"], 200)
    for _ in range(40):
        await asyncio.sleep(0.1)
        if (await state(client, auth))["lot"] is None:
            break
    rows = await sql("select status, high_team_id from lots where id = :i", i=lot["lot_id"])
    assert rows == [("sold", 3)]


async def test_restart_recovery(client, auth, eng):
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    eng.timer.cancel_all()  # simulate the process dying mid-lot

    # Deadline still in the future -> a fresh engine resumes the timer.
    fresh = AuctionEngine(SessionLocal, ConnectionManager())
    await fresh.recover()
    assert lot["lot_id"] in fresh.timer.tasks
    fresh.timer.cancel_all()

    # Deadline passed while down -> closes at once.
    await sql("update lots set ends_at = now() - interval '5 seconds' where id = :i", i=lot["lot_id"])
    fresh = AuctionEngine(SessionLocal, ConnectionManager())
    await fresh.recover()
    await asyncio.sleep(0.5)
    rows = await sql("select status from lots where id = :i", i=lot["lot_id"])
    assert rows == [("unsold",)]


async def test_undo_last_sale(client, auth):
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    await bid(client, auth, "owner1", lot["lot_id"], 200)
    await admin_post(client, auth, "hammer")
    undone = await admin_post(client, auth, "undo-sale")
    assert undone["price"] == 200
    snap = await state(client, auth)
    assert snap["teams"][0]["purse_remaining"] == 2000 and snap["teams"][0]["squad_size"] == 0
    assert snap["queues"]["1"][0]["id"] == lot["player"]["id"]
    audit = (await client.get("/api/audit", headers=auth["admin"])).json()
    assert any(a["action"] == "undo_sale" for a in audit)


async def test_accelerated_round_and_finish(client, auth):
    # Shrink the pool so the main round empties quickly.
    await sql("delete from players where id not in (select id from players order by id limit 2)")
    await admin_post(client, auth, "start")
    first = await admin_post(client, auth, "next")
    while True:  # every player cascades to the pool unsold
        await admin_post(client, auth, "hammer")
        r = await client.post("/api/auction/next", json={"mode": "order"}, headers=auth["admin"])
        if r.status_code != 200:
            assert r.json()["code"] == "QUEUE_EMPTY"
            break
    snap = await state(client, auth)
    assert len(snap["unsold_pool"]) == 2 and snap["status"] == "running"

    r = await client.post("/api/auction/nominations", json={"player_ids": [first["player"]["id"]]},
                          headers=auth["owner2"])
    assert r.status_code == 200
    await admin_post(client, auth, "accelerated/start")
    lot = await admin_post(client, auth, "next")
    assert lot["round"] == "accelerated" and lot["opening_price"] == 10
    await bid(client, auth, "owner2", lot["lot_id"], 10)
    await admin_post(client, auth, "hammer")
    snap = await state(client, auth)
    assert snap["status"] == "finished"
    assert snap["teams"][1]["squad"][0]["id"] == first["player"]["id"]

    csv = await client.get("/api/export/results.csv", headers=auth["admin"])
    assert csv.status_code == 200 and first["player"]["name"] in csv.text


async def test_reset(client, auth):
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    await bid(client, auth, "owner1", lot["lot_id"], 200)
    await admin_post(client, auth, "hammer")
    r = await client.post("/api/auction/reset", json={"confirm": "nope"}, headers=auth["admin"])
    assert r.status_code == 422
    await admin_post(client, auth, "reset", confirm="RESET")
    snap = await state(client, auth)
    assert snap["status"] == "not_started" and not snap["settings"]["locked"]
    assert all(t["purse_remaining"] == 2000 for t in snap["teams"]) and snap["queued_count"] == 41
    assert (await sql("select count(*) from lots"))[0][0] == 0


async def test_full_simulated_auction(client, auth, eng):
    """Bots bid at random through every tier; invariants must hold at the end."""
    rng = random.Random(7)
    async with SessionLocal() as s:
        owners = (await s.scalars(select(User).where(User.role == "owner"))).all()
    await admin_post(client, auth, "start")
    while True:
        r = await client.post("/api/auction/next", json={"mode": "random"}, headers=auth["admin"])
        if r.status_code != 200:
            break
        lot_id, amount = r.json()["lot_id"], r.json()["opening_price"]
        for _ in range(rng.randint(0, 8)):
            ok, _reason, ev = await eng.place_bid(rng.choice(owners), lot_id, amount)
            if ok:
                amount = ev["next_bid"]
        await admin_post(client, auth, "hammer")
        if (await sql("select status from auction_state"))[0][0] == "finished":
            break

    snap = await state(client, auth)
    tiers = {t["id"]: t for t in snap["tiers"]}
    for team in snap["teams"]:
        assert team["purse_remaining"] >= 0
        assert team["squad_size"] <= 9
        for tier_id, n in team["tier_counts"].items():
            assert n <= tiers[int(tier_id)]["max_per_team"]
        assert team["purse_remaining"] + sum(p["sold_price"] for p in team["squad"]) == 2000
    async with SessionLocal() as s:
        open_lots = (await s.scalars(select(Lot).where(Lot.status == "open"))).all()
    assert not open_lots


async def test_extend(client, auth):
    await admin_post(client, auth, "start")
    await admin_post(client, auth, "next")
    before = (await state(client, auth))["lot"]["ends_at"]
    await admin_post(client, auth, "extend", seconds=10)
    after = (await state(client, auth))["lot"]["ends_at"]
    assert after - before >= 9900
    _ = now_utc() + timedelta(seconds=1)


async def test_expired_lot_closes_on_next_request_without_timer(client, auth, eng):
    """Serverless hosts kill background timers; any auction request must close an expired lot."""
    await set_rules(client, auth, opening_timer_s=1, reset_timer_s=1)
    await admin_post(client, auth, "start")
    lot = await admin_post(client, auth, "next")
    await bid(client, auth, "owner2", lot["lot_id"], 200)
    eng.timer.cancel_all()
    await asyncio.sleep(1.3)
    assert (await sql("select status from lots where id = :i", i=lot["lot_id"])) == [("open",)]
    snap = await state(client, auth)  # plain poll
    assert snap["lot"] is None
    assert (await sql("select status, high_team_id from lots where id = :i", i=lot["lot_id"])) == [("sold", 2)]
    # The admin can open the next lot straight away.
    assert (await client.post("/api/auction/next", headers=auth["admin"])).status_code == 200


async def test_engine_created_lazily_without_lifespan(fresh_data):
    """Some serverless runtimes skip the ASGI lifespan; routes must still get an engine."""
    import httpx

    from app.main import app

    app.state.__dict__.get("_state", {}).pop("engine", None)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/auth/login", json={"username": "admin", "password": "cpl-admin"})
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        assert (await c.get("/api/auction/state", headers=h)).status_code == 200
