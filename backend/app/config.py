from functools import lru_cache

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
    static_dir: str = "static"
    timezone: str = "Asia/Karachi"  # env TIMEZONE (TZ is reserved on Vercel)
    bid_rate_per_sec: int = 5

    @property
    def async_database_url(self) -> str:
        return to_async_url(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
