from typing import Annotated

from fastapi import Depends, FastAPI, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import SessionLocal, get_session
from ..engine.auction import AuctionEngine
from ..ws.manager import ConnectionManager


def engine_for(app: FastAPI) -> AuctionEngine:
    """The app's auction engine, created on first use if the lifespan hook didn't run (serverless)."""
    engine = getattr(app.state, "engine", None)
    if engine is None:
        engine = AuctionEngine(SessionLocal, ConnectionManager())
        engine.bid_rate_per_sec = get_settings().bid_rate_per_sec
        app.state.engine = engine
    return engine


def get_engine(request: Request) -> AuctionEngine:
    return engine_for(request.app)


async def tick(request: Request, session: Annotated[AsyncSession, Depends(get_session)]) -> None:
    """Run before every auction route: closes a lot whose clock already ran out."""
    await engine_for(request.app).tick(session)


Engine = Annotated[AuctionEngine, Depends(get_engine)]
