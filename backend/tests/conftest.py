import os
import subprocess
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://cpl:cpl@127.0.0.1:55450/cpl_test")
os.environ["DB_NULLPOOL"] = "true"
os.environ["REQUIRE_PASSWORD_CHANGE"] = "false"
os.environ["BID_RATE_PER_SEC"] = "1000"
os.environ["BCRYPT_ROUNDS"] = "4"
os.environ["STATIC_DIR"] = "/nonexistent"

import httpx  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
TABLES = "bids, nominations, audit_log, lots, players, users, auction_state, settings, teams, tiers, images"
PASSWORDS = {"admin": "cpl-admin", "owner1": "cpl-owner1", "owner2": "cpl-owner2", "owner3": "cpl-owner3"}


@pytest.fixture(scope="session")
def migrated_db():
    env = os.environ.copy()
    run = lambda *a: subprocess.run([sys.executable, "-m", "alembic", *a], cwd=BACKEND, env=env, check=True,
                                    capture_output=True)
    run("downgrade", "base")
    run("upgrade", "head")
    yield


@pytest.fixture
async def fresh_data(migrated_db):
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
        await conn.run_sync(seed)
    yield


@pytest.fixture
async def client(fresh_data):
    # Each test runs on its own event loop; a fresh engine keeps its asyncio.Lock from being
    # bound to a previous test's loop (which raises once two calls contend for it).
    app.state.engine = None
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


@pytest.fixture
def eng(client):
    return app.state.engine


async def login(client: httpx.AsyncClient, username: str) -> dict:
    r = await client.post("/api/auth/login", json={"username": username, "password": PASSWORDS[username]})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
async def auth(client):
    return {u: await login(client, u) for u in PASSWORDS}


async def sql(query: str, **params):
    async with SessionLocal() as s:
        res = await s.execute(text(query), params)
        await s.commit()
        try:
            return res.all()
        except Exception:
            return None
