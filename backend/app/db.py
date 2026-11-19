from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from .config import get_settings

_settings = get_settings()

engine = create_async_engine(
    _settings.async_database_url,
    pool_pre_ping=True,
    connect_args=_settings.db_connect_args,
    **({"poolclass": NullPool} if _settings.db_nullpool else {"pool_size": 10, "max_overflow": 5}),
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
