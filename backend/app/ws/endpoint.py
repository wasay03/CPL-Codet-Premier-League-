import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..auth import user_from_token
from ..config import get_settings
from ..db import SessionLocal
from ..engine.snapshot import ms, now_utc
from ..models import User

router = APIRouter()
log = logging.getLogger(__name__)


async def _load_user(user_id: int) -> User | None:
    async with SessionLocal() as s:
        return await s.get(User, user_id)


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str | None = None) -> None:
    engine = ws.app.state.engine
    manager = engine.ws
    async with SessionLocal() as s:
        user = await user_from_token(s, token)
    await ws.accept()
    if not user or (user.must_change_password and get_settings().require_password_change):
        await ws.close(code=4401, reason="unauthorized")
        return

    came_online = await manager.connect(user.id, ws)
    try:
        if came_online:
            await engine.broadcast_presence()
        else:
            snap = await engine.snapshot()
            await manager.send_ws(ws, "state", snap["version"], snap)

        while True:
            text = await ws.receive_text()
            try:
                msg = json.loads(text)
                type_ = msg.get("type")
                data = msg.get("data") or {}
            except (ValueError, AttributeError):
                continue

            if type_ == "ping":
                await manager.send_ws(ws, "pong", 0, {"server_now": ms(now_utc())})
            elif type_ == "bid":
                fresh = await _load_user(user.id)  # team links can change mid-session
                try:
                    lot_id, amount = int(data["lot_id"]), int(data["amount"])
                except (KeyError, TypeError, ValueError):
                    await manager.send_ws(ws, "bid_rejected", 0, {"reason": "BAD_REQUEST"})
                    continue
                ok, reason, _ = await engine.place_bid(fresh, lot_id, amount)
                if not ok:
                    await manager.send_ws(ws, "bid_rejected", 0, {"reason": reason, "lot_id": lot_id, "amount": amount})
            elif type_ == "sync":
                snap = await engine.snapshot()
                await manager.send_ws(ws, "state", snap["version"], snap)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("websocket loop failed for user %s", user.id)
    finally:
        if await manager.disconnect(user.id, ws):
            try:
                await engine.broadcast_presence()
            except Exception:
                log.debug("presence broadcast failed", exc_info=True)
