import asyncio
import time

from app import passwords, security
from app.config import get_settings
from app.security import SlidingWindow, TokenBucket, client_ip


def scope(xff: str | None = None, cf: str | None = None, peer: str = "10.0.0.9") -> dict:
    headers = []
    if xff is not None:
        headers.append((b"x-forwarded-for", xff.encode()))
    if cf is not None:
        headers.append((b"cf-connecting-ip", cf.encode()))
    return {"headers": headers, "client": (peer, 1234)}


def test_client_ip_reads_only_trusted_proxy_entries(monkeypatch):
    s = get_settings()
    assert client_ip(scope()) == "10.0.0.9"
    # The client can prepend anything; Railway's entry is the last one.
    assert client_ip(scope("6.6.6.6, 203.0.113.7")) == "203.0.113.7"
    monkeypatch.setattr(s, "trusted_proxy_hops", 2)  # Cloudflare -> Railway
    assert client_ip(scope("6.6.6.6, 203.0.113.7, 172.68.1.1")) == "203.0.113.7"
    assert client_ip(scope("203.0.113.7")) == "203.0.113.7"
    # CF-Connecting-IP is ignored unless explicitly trusted.
    assert client_ip(scope("203.0.113.7", cf="1.2.3.4")) == "203.0.113.7"
    monkeypatch.setattr(s, "trust_cf_connecting_ip", True)
    assert client_ip(scope("203.0.113.7", cf="1.2.3.4")) == "1.2.3.4"


def test_token_bucket_and_window():
    b = TokenBucket(rate=1000, burst=2)
    assert b.take("a") is None and b.take("a") is None
    assert b.take("a") is not None and b.take("b") is None
    w = SlidingWindow(limit=2, window_s=60)
    w.add("k")
    assert w.blocked_for("k") is None
    w.add("k")
    assert w.blocked_for("k") > 50
    w.clear("k")
    assert w.blocked_for("k") is None


async def test_api_rate_limit_is_per_ip(client, auth):
    security.guards.api = TokenBucket(rate=0.01, burst=3)
    a = {**auth["owner1"], "X-Forwarded-For": "203.0.113.7"}
    for _ in range(3):
        assert (await client.get("/api/teams", headers=a)).status_code == 200
    r = await client.get("/api/teams", headers=a)
    assert r.status_code == 429 and int(r.headers["retry-after"]) >= 1
    assert (await client.get("/api/health", headers=a)).status_code == 200  # health checks are exempt
    other = {**auth["owner1"], "X-Forwarded-For": "198.51.100.2"}
    assert (await client.get("/api/teams", headers=other)).status_code == 200


async def login(client, username, password, ip):
    return await client.post("/api/auth/login", json={"username": username, "password": password},
                             headers={"X-Forwarded-For": ip})


async def test_failed_logins_lock_that_account_from_that_ip_only(client):
    for _ in range(5):
        assert (await login(client, "admin", "guess", "203.0.113.7")).status_code == 401
    r = await login(client, "admin", "cpl-admin", "203.0.113.7")
    assert r.status_code == 429 and "Try again in" in r.json()["detail"]
    # Other accounts on that network, and the real admin elsewhere, are unaffected.
    assert (await login(client, "owner1", "cpl-owner1", "203.0.113.7")).status_code == 200
    assert (await login(client, "admin", "cpl-admin", "198.51.100.2")).status_code == 200


async def test_login_attempts_capped_per_ip(client):
    security.guards.login_ip = SlidingWindow(limit=3, window_s=60)
    for _ in range(3):
        assert (await login(client, "nobody", "x", "203.0.113.7")).status_code == 401
    r = await login(client, "owner1", "cpl-owner1", "203.0.113.7")
    assert r.status_code == 429 and r.headers["retry-after"]


async def test_unknown_user_and_wrong_password_look_the_same(client):
    a = await login(client, "nobody", "x", "203.0.113.7")
    b = await login(client, "admin", "x", "203.0.113.8")
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


async def test_oversized_bodies_are_rejected(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_body_bytes", 1000)
    big = {"username": "admin", "password": "x" * 5000}
    r = await client.post("/api/auth/login", json=big)
    assert r.status_code == 413

    async def chunks():  # no Content-Length: the cap must count what actually arrives
        for _ in range(10):
            yield b"x" * 500

    r = await client.post("/api/auth/login", content=chunks(), headers={"content-type": "application/json"})
    assert r.status_code == 413
    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "cpl-admin"})).status_code == 200


async def test_password_check_does_not_block_the_event_loop(client, monkeypatch):
    def slow_verify(raw: str, hashed: str) -> bool:
        time.sleep(0.6)  # stands in for bcrypt's CPU time
        return False

    monkeypatch.setattr(passwords, "verify_password", slow_verify)
    pending = asyncio.create_task(login(client, "admin", "x", "203.0.113.7"))
    await asyncio.sleep(0.1)
    started = time.monotonic()
    assert (await client.get("/api/health")).status_code == 200
    assert time.monotonic() - started < 0.3  # the server kept serving while the password was checked
    assert (await pending).status_code == 401


async def test_api_docs_are_off_by_default(client):
    assert (await client.get("/docs")).status_code == 404
    assert (await client.get("/openapi.json")).status_code == 404
