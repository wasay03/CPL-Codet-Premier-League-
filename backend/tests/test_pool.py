import asyncio

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import db
from app.config import get_settings
from app.engine.auction import AuctionEngine
from app.main import app
from app.ws.manager import ConnectionManager

from .conftest import login


@pytest.fixture
async def tight_pool(client):
    """Run the app on a 2-connection pool that fails fast, like a busy serverless instance."""
    eng = create_async_engine(
        get_settings().async_database_url, pool_size=2, max_overflow=0, pool_timeout=3,
        connect_args=get_settings().db_connect_args,
    )
    sm = async_sessionmaker(eng, expire_on_commit=False)

    async def tight_session():
        async with sm() as s:
            yield s

    app.dependency_overrides[db.get_session] = tight_session
    app.state.engine = AuctionEngine(sm, ConnectionManager())
    yield
    app.dependency_overrides.clear()
    await eng.dispose()


async def test_concurrent_requests_dont_exhaust_a_small_pool(client, tight_pool):
    admin, o1, o2, o3 = [await login(client, u) for u in ("admin", "owner1", "owner2", "owner3")]
    await client.post("/api/auction/start", headers=admin)
    lot = (await client.post("/api/auction/next", json={"mode": "order"}, headers=admin)).json()

    # Each request waits on the engine lock. If a waiting request kept its own connection, the
    # request holding the lock could never get one and they would all time out together.
    calls = [client.post("/api/auction/bid", json={"lot_id": lot["lot_id"], "amount": 200}, headers=h)
             for h in (o1, o2, o3)]
    calls += [client.get("/api/auction/state", headers=h) for h in (admin, o1, o2, o3)]
    results = await asyncio.wait_for(asyncio.gather(*calls), timeout=20)
    assert all(r.status_code in (200, 409) for r in results), [r.status_code for r in results]
    assert sum(r.status_code == 200 for r in results[:3]) == 1  # exactly one 200 bid wins
