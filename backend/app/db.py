from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from .config import get_settings

_settings = get_settings()

engine = create_async_engine(
    _settings.async_database_url,
    pool_pre_ping=True,
    connect_args=_settings.db_connect_args,
    **({"poolclass": NullPool} if _settings.use_nullpool else {"pool_size": 10, "max_overflow": 5}),
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def release_connection(session: AsyncSession) -> None:
    """End the session's read-only transaction so its pooled connection goes back to the pool.

    A request that waits on the auction engine's lock must not sit on a connection the lock holder
    needs, or a busy room exhausts the pool ("QueuePool limit reached"). With NullPool (serverless)
    there is no pool to exhaust, and releasing would just close the connection and force a reconnect
    on the next query, so it is skipped there.
    """
    bind = session.bind
    if bind is not None and not isinstance(bind.pool, NullPool):
        await session.commit()
