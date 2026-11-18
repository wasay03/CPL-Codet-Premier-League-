import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    """Registry of open sockets keyed by user id. One user may have several tabs open."""

    def __init__(self) -> None:
        self._sockets: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    @property
    def has_connections(self) -> bool:
        return any(self._sockets.values())

    @property
    def online_user_ids(self) -> list[int]:
        return sorted(uid for uid, socks in self._sockets.items() if socks)

    async def connect(self, user_id: int, ws: WebSocket) -> bool:
        """Register a socket. Returns True when the user just came online."""
        async with self._lock:
            was_online = bool(self._sockets.get(user_id))
            self._sockets[user_id].add(ws)
            return not was_online

    async def disconnect(self, user_id: int, ws: WebSocket) -> bool:
        """Unregister a socket. Returns True when the user just went offline."""
        async with self._lock:
            socks = self._sockets.get(user_id)
            if not socks:
                return False
            socks.discard(ws)
            if not socks:
                del self._sockets[user_id]
                return True
            return False

    async def _send(self, ws: WebSocket, text: str) -> None:
        try:
            await asyncio.wait_for(ws.send_text(text), timeout=2)
        except Exception:  # socket closed under us; the endpoint loop will clean up
            log.debug("send failed", exc_info=True)

    @staticmethod
    def encode(type_: str, version: int, data: Any) -> str:
        return json.dumps({"type": type_, "version": version, "data": data}, default=str)

    async def broadcast(self, type_: str, version: int, data: Any) -> None:
        text = self.encode(type_, version, data)
        targets = [ws for socks in list(self._sockets.values()) for ws in list(socks)]
        await asyncio.gather(*(self._send(ws, text) for ws in targets))

    async def send_user(self, user_id: int, type_: str, version: int, data: Any) -> None:
        text = self.encode(type_, version, data)
        await asyncio.gather(*(self._send(ws, text) for ws in list(self._sockets.get(user_id, ()))))

    async def send_ws(self, ws: WebSocket, type_: str, version: int, data: Any) -> None:
        await self._send(ws, self.encode(type_, version, data))
