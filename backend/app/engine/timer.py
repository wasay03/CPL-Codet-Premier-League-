"""One asyncio task per open lot. It sleeps until `ends_at`, then asks the engine to close the lot.

If a bid or extension moved the deadline, `close_lot` hands back the new `ends_at` and the task
sleeps again. A task only ever wakes early, never late, because deadlines only move forward.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import TYPE_CHECKING

from .snapshot import now_utc

if TYPE_CHECKING:
    from .auction import AuctionEngine

log = logging.getLogger(__name__)


class LotTimer:
    def __init__(self, engine: AuctionEngine) -> None:
        self.engine = engine
        self.tasks: dict[int, asyncio.Task] = {}

    def schedule(self, lot_id: int, ends_at: datetime) -> None:
        self.cancel(lot_id)
        self.tasks[lot_id] = asyncio.create_task(self._run(lot_id, ends_at), name=f"lot-timer-{lot_id}")

    def cancel(self, lot_id: int) -> None:
        task = self.tasks.pop(lot_id, None)
        if task and task is not asyncio.current_task() and not task.done():
            task.cancel()

    def cancel_all(self) -> None:
        for lot_id in list(self.tasks):
            self.cancel(lot_id)

    async def _run(self, lot_id: int, ends_at: datetime) -> None:
        me = asyncio.current_task()
        try:
            while True:
                delay = (ends_at - now_utc()).total_seconds()
                if delay > 0:
                    await asyncio.sleep(delay)
                moved = await self.engine.close_lot(lot_id, force=False)
                if not isinstance(moved, datetime):
                    return
                ends_at = moved
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception("lot timer %s crashed", lot_id)
        finally:
            if self.tasks.get(lot_id) is me:
                del self.tasks[lot_id]
