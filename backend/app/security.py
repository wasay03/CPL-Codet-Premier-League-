"""Abuse protection that runs inside the app: client IPs, rate limits and request-size caps.

Everything here is in memory, which is enough because the app runs as a single process.
It is a second line of defence: a proper flood has to be absorbed in front of the app
(Cloudflare or the host's edge), but these limits stop one script from freezing the auction.
"""

from __future__ import annotations

import json
import math
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable, MutableMapping
from dataclasses import dataclass, field
from typing import Any

from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

_MAX_KEYS = 20_000  # forget idle keys beyond this so a spray of fake IPs can't exhaust memory


# ---------------------------------------------------------------------------------- client IP


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or ():
        if key == name:
            return value.decode("latin-1")
    return None


def client_ip(scope: Scope) -> str:
    """The caller's IP, read only from headers our own proxies set, so it can't be spoofed.

    - TRUST_CF_CONNECTING_IP=true: use Cloudflare's CF-Connecting-IP (only safe once the
      origin accepts traffic from Cloudflare alone).
    - Otherwise: X-Forwarded-For, counting TRUSTED_PROXY_HOPS entries from the right. Each
      proxy appends the address it saw, so anything further left was written by the client.
      Railway alone = 1 hop; Cloudflare in front of Railway = 2.
    - No proxy header (local dev, tests): the socket's peer address.
    """
    s = get_settings()
    if s.trust_cf_connecting_ip and (cf := _header(scope, b"cf-connecting-ip")):
        return cf.strip()
    xff = _header(scope, b"x-forwarded-for")
    if xff and s.trusted_proxy_hops > 0:
        hops = [h.strip() for h in xff.split(",") if h.strip()]
        if hops:
            return hops[-min(s.trusted_proxy_hops, len(hops))]
    client = scope.get("client")
    return client[0] if client else "unknown"


# ---------------------------------------------------------------------------------- limiters


class TokenBucket:
    """`rate` requests per second on average, with bursts up to `burst`, per key."""

    def __init__(self, rate: float, burst: int) -> None:
        self.rate, self.burst = rate, burst
        self._state: dict[str, tuple[float, float]] = {}

    def take(self, key: str) -> float | None:
        """Spend one token. Returns None when allowed, else seconds until a token is free."""
        now = time.monotonic()
        tokens, last = self._state.get(key, (float(self.burst), now))
        tokens = min(float(self.burst), tokens + (now - last) * self.rate)
        if tokens < 1:
            self._state[key] = (tokens, now)
            return (1 - tokens) / self.rate
        self._state[key] = (tokens - 1, now)
        if len(self._state) > _MAX_KEYS:
            self._prune(now)
        return None

    def _prune(self, now: float) -> None:
        full_after = self.burst / self.rate
        for k, (_, last) in list(self._state.items()):
            if now - last > full_after:
                del self._state[k]


class SlidingWindow:
    """At most `limit` events per `window_s` seconds, per key."""

    def __init__(self, limit: int, window_s: float) -> None:
        self.limit, self.window_s = limit, window_s
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def _trim(self, key: str, now: float) -> deque[float]:
        q = self._events[key]
        while q and now - q[0] > self.window_s:
            q.popleft()
        return q

    def blocked_for(self, key: str) -> float | None:
        """Seconds until `key` may act again, or None if it is under the limit."""
        now = time.monotonic()
        q = self._trim(key, now)
        if len(q) < self.limit:
            if not q:
                del self._events[key]
            return None
        return self.window_s - (now - q[0])

    def add(self, key: str) -> None:
        now = time.monotonic()
        self._trim(key, now).append(now)
        if len(self._events) > _MAX_KEYS:
            for k in [k for k, q in self._events.items() if not q or now - q[-1] > self.window_s]:
                del self._events[k]

    def clear(self, key: str) -> None:
        self._events.pop(key, None)


@dataclass
class Guards:
    """Every limiter the app uses. Replaced wholesale by `reset_guards()` (tests, settings)."""

    api: TokenBucket
    login_ip: SlidingWindow
    login_failures: SlidingWindow
    ws_ip_counts: dict[str, int] = field(default_factory=lambda: defaultdict(int))

    @classmethod
    def from_settings(cls) -> Guards:
        s = get_settings()
        return cls(
            api=TokenBucket(s.api_rate_per_sec, s.api_burst),
            login_ip=SlidingWindow(s.login_attempts_per_min, 60),
            login_failures=SlidingWindow(s.login_failures_before_lock, s.login_lock_s),
        )


guards = Guards.from_settings()


def reset_guards() -> None:
    global guards
    guards = Guards.from_settings()


def retry_after(seconds: float) -> str:
    return str(max(1, math.ceil(seconds)))


# ---------------------------------------------------------------------------------- middleware


async def _reject(send: Send, status: int, detail: str, headers: list[tuple[bytes, bytes]] | None = None) -> None:
    body = json.dumps({"detail": detail}).encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()),
                    *(headers or [])],
    })
    await send({"type": "http.response.body", "body": body})


class _BodyTooLarge(StarletteHTTPException):
    """Raised mid-read. FastAPI re-raises HTTP exceptions from body parsing, so this becomes a 413."""

    def __init__(self) -> None:
        super().__init__(413, "Request is too large")


class GuardMiddleware:
    """Per-IP request rate limit and a request-body size cap for every /api route."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/api/") or scope["path"] == "/api/health":
            await self.app(scope, receive, send)
            return

        wait = guards.api.take(client_ip(scope))
        if wait is not None:
            await _reject(send, 429, "Too many requests. Slow down and try again.",
                          [(b"retry-after", retry_after(wait).encode())])
            return

        limit = get_settings().max_body_bytes
        length = _header(scope, b"content-length")
        if length and length.isdigit() and int(length) > limit:
            await _reject(send, 413, "Request is too large")
            return

        # Content-Length can be absent (chunked) or wrong, so also count what actually arrives.
        received = 0
        started = False

        async def counted_receive() -> Message:
            nonlocal received
            msg = await receive()
            if msg["type"] == "http.request":
                received += len(msg.get("body", b""))
                if received > limit:
                    raise _BodyTooLarge
            return msg

        async def tracked_send(msg: Message) -> None:
            nonlocal started
            if msg["type"] == "http.response.start":
                started = True
            await send(msg)

        try:
            await self.app(scope, counted_receive, tracked_send)
        except _BodyTooLarge:
            if not started:
                await _reject(send, 413, "Request is too large")
