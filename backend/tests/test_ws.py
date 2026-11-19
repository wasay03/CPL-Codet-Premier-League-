import asyncio
import json
import socket
import threading
import time

import httpx
import pytest
import uvicorn
import websockets

from app.main import app

from .conftest import PASSWORDS


@pytest.fixture
def live_server(fresh_data):
    from app.security import reset_guards

    reset_guards()
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    yield f"127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=5)


def token(base: str, username: str) -> str:
    r = httpx.post(f"http://{base}/api/auth/login", json={"username": username, "password": PASSWORDS[username]})
    return r.json()["token"]


async def recv_until(ws, type_: str, timeout: float = 5.0, where=lambda d: True) -> dict:
    deadline = asyncio.get_running_loop().time() + timeout
    while True:
        msg = json.loads(await asyncio.wait_for(ws.recv(), deadline - asyncio.get_running_loop().time()))
        if msg["type"] == type_ and where(msg["data"]):
            return msg


async def test_bad_token_closes_4401(live_server):
    async with websockets.connect(f"ws://{live_server}/ws?token=garbage") as ws:
        with pytest.raises(websockets.ConnectionClosed) as exc:
            await ws.recv()
    assert exc.value.rcvd.code == 4401


async def test_live_bid_round_trip(live_server):
    base = live_server
    admin = {"Authorization": f"Bearer {token(base, 'admin')}"}
    t1, t2 = token(base, "owner1"), token(base, "owner2")

    tv = token(base, "viewer")
    async with (
        websockets.connect(f"ws://{base}/ws?token={t1}") as ws1,
        websockets.connect(f"ws://{base}/ws?token={t2}") as ws2,
        websockets.connect(f"ws://{base}/ws?token={tv}") as wsv,
    ):
        first = await recv_until(ws1, "state")
        assert first["data"]["status"] == "not_started"

        await ws1.send(json.dumps({"type": "ping", "data": {}}))
        pong = await recv_until(ws1, "pong")
        assert abs(pong["data"]["server_now"] - time.time() * 1000) < 5000

        async with httpx.AsyncClient(base_url=f"http://{base}") as c:
            await c.post("/api/auction/start", headers=admin)
            await c.post("/api/auction/next", json={"mode": "order"}, headers=admin)
        opened = await recv_until(ws2, "lot_opened")
        lot_id = opened["data"]["lot_id"]

        await ws1.send(json.dumps({"type": "bid", "data": {"lot_id": lot_id, "amount": 200}}))
        placed = await recv_until(ws2, "bid_placed")
        assert placed["data"]["team_id"] == 1 and placed["data"]["next_bid"] == 220

        # The viewer watches the same live events but cannot bid over the socket.
        seen = await recv_until(wsv, "bid_placed")
        assert seen["data"]["amount"] == 200
        await wsv.send(json.dumps({"type": "bid", "data": {"lot_id": lot_id, "amount": 220}}))
        rejected = await recv_until(wsv, "bid_rejected")
        assert rejected["data"]["reason"] == "NOT_OWNER"

        # Stale amount goes back to the bidder only.
        await ws2.send(json.dumps({"type": "bid", "data": {"lot_id": lot_id, "amount": 200}}))
        rejected = await recv_until(ws2, "bid_rejected")
        assert rejected["data"]["reason"] == "STALE_AMOUNT"

        snap = await recv_until(ws1, "state", where=lambda d: d["lot"] and d["lot"]["high_bid"])
        assert snap["data"]["lot"]["high_team_id"] == 1
        assert set(snap["data"]["online"]) >= {2, 3}


async def closed_with(ws) -> int:
    with pytest.raises(websockets.ConnectionClosed) as exc:
        for _ in range(100):
            await asyncio.wait_for(ws.recv(), 5)
    return exc.value.rcvd.code


async def test_ws_connection_caps(live_server, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "ws_max_per_user", 2)
    monkeypatch.setattr(get_settings(), "ws_max_viewer", 3)
    t1, tv = token(live_server, "owner1"), token(live_server, "viewer")
    url = f"ws://{live_server}/ws?token="
    async with websockets.connect(url + t1) as a, websockets.connect(url + t1) as b:
        await recv_until(a, "state")
        await recv_until(b, "state")
        async with websockets.connect(url + t1) as c:
            assert await closed_with(c) == 4429
        # The shared viewer login has its own, larger allowance.
        async with (
            websockets.connect(url + tv) as v1,
            websockets.connect(url + tv) as v2,
            websockets.connect(url + tv) as v3,
        ):
            for v in (v1, v2, v3):
                await recv_until(v, "state")


async def test_ws_message_flood_is_cut_off(live_server, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "ws_msg_burst", 5)
    monkeypatch.setattr(get_settings(), "ws_msgs_per_sec", 0.01)
    async with websockets.connect(f"ws://{live_server}/ws?token={token(live_server, 'owner1')}") as ws:
        await recv_until(ws, "state")
        for _ in range(10):
            await ws.send(json.dumps({"type": "ping", "data": {}}))
        assert await closed_with(ws) == 4429
