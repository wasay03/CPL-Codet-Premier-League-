import os
from functools import lru_cache
from typing import Any
from uuid import uuid4

from pydantic_settings import BaseSettings, SettingsConfigDict


def to_async_url(url: str) -> str:
    """Railway hands out postgres:// or postgresql:// URLs; SQLAlchemy async needs asyncpg."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url[len(prefix):]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://cpl:cpl@127.0.0.1:55450/cpl"
    jwt_secret: str = "dev-secret-change-me-dev-secret-change-me"
    jwt_ttl_hours: int = 12

    admin_password: str = "cpl-admin"
    owner1_password: str = "cpl-owner1"
    owner2_password: str = "cpl-owner2"
    owner3_password: str = "cpl-owner3"
    viewer_password: str = "cpl-viewer"

    require_password_change: bool = True
    db_nullpool: bool = False
    # Behind pgbouncer in transaction mode (Supabase "Transaction pooler", port 6543), a connection
    # can change between statements, so asyncpg must not cache or reuse prepared statements.
    # Switched on automatically for port 6543; set DB_PGBOUNCER=true for other poolers.
    db_pgbouncer: bool = False
    static_dir: str = "static"
    timezone: str = "Asia/Karachi"  # env TIMEZONE (TZ is reserved on Vercel)
    bid_rate_per_sec: int = 5

    # --- Abuse protection (see app/security.py). A real flood needs Cloudflare/the host's edge;
    # these stop a single script from overwhelming the one app process.
    # How many proxies sit in front of the app and append to X-Forwarded-For: Railway = 1,
    # Cloudflare -> Railway = 2. The client IP is read that many entries from the right.
    trusted_proxy_hops: int = 1
    # Use Cloudflare's CF-Connecting-IP header. Only enable once the origin is reachable via Cloudflare alone.
    trust_cf_connecting_ip: bool = False
    # Every /api request, per client IP (an office behind one IP shares this, so keep it generous).
    api_rate_per_sec: float = 30
    api_burst: int = 300
    max_body_bytes: int = 2 * 1024 * 1024  # uploads are capped at 1 MB; this covers multipart overhead
    # Login: attempts per IP per minute, and failures per (IP, username) before a temporary lock.
    login_attempts_per_min: int = 20
    login_failures_before_lock: int = 5
    login_lock_s: int = 300
    # Password checks run in worker threads; this many at once, so a login burst can't eat every CPU.
    bcrypt_concurrency: int = 2
    # Live connections (WebSocket).
    ws_max_per_user: int = 5  # tabs/devices per personal login
    ws_max_viewer: int = 200  # the shared viewer login
    ws_max_per_ip: int = 60
    ws_max_total: int = 800
    ws_msgs_per_sec: float = 10
    ws_msg_burst: int = 30
    # Interactive API docs at /docs. Off in production.
    api_docs: bool = False

    @property
    def async_database_url(self) -> str:
        return to_async_url(self.database_url)

    @property
    def use_nullpool(self) -> bool:
        """No app-side pool on serverless: each instance would otherwise keep its own pool of
        connections open. Vercel sets VERCEL=1 at runtime, so this needs no manual setting there."""
        return self.db_nullpool or os.environ.get("VERCEL") == "1"

    @property
    def transaction_pooler(self) -> bool:
        return self.db_pgbouncer or ":6543/" in self.database_url

    @property
    def db_connect_args(self) -> dict[str, Any]:
        if not self.transaction_pooler:
            return {}
        return {
            "statement_cache_size": 0,  # asyncpg's own cache
            "prepared_statement_cache_size": 0,  # SQLAlchemy's cache
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",  # never collide across clients
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
