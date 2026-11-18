from typing import Annotated

from fastapi import Depends, Request

from ..engine.auction import AuctionEngine


def get_engine(request: Request) -> AuctionEngine:
    return request.app.state.engine


Engine = Annotated[AuctionEngine, Depends(get_engine)]
