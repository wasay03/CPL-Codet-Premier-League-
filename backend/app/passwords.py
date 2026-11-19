import asyncio
import os
import threading
from functools import lru_cache

import bcrypt

_ROUNDS = int(os.environ.get("BCRYPT_ROUNDS", "12"))


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt(_ROUNDS)).decode()


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode(), hashed.encode())
    except ValueError:
        return False


# bcrypt is deliberately slow (~0.25 s of CPU). Running it on the event loop would stall every
# bid, timer and socket while it works, so request handlers use these async versions, which run
# it in a worker thread. A semaphore caps how many run at once so a login burst can't take all CPUs.


@lru_cache
def _slots() -> threading.BoundedSemaphore:
    from .config import get_settings

    return threading.BoundedSemaphore(max(1, get_settings().bcrypt_concurrency))


@lru_cache
def _decoy_hash() -> str:
    return hash_password("decoy-password-for-unknown-users")


def _verify_limited(raw: str, hashed: str | None) -> bool:
    with _slots():
        return verify_password(raw, hashed if hashed is not None else _decoy_hash())


def _hash_limited(raw: str) -> str:
    with _slots():
        return hash_password(raw)


async def check_password(raw: str, hashed: str | None) -> bool:
    """Verify off the event loop. With no hash (unknown user) it still does a full check against a
    decoy and fails, so response timing doesn't reveal which usernames exist."""
    ok = await asyncio.to_thread(_verify_limited, raw, hashed)
    return ok and hashed is not None


async def hash_password_async(raw: str) -> str:
    return await asyncio.to_thread(_hash_limited, raw)
