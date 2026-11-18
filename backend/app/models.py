from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Image(Base):
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(primary_key=True)
    content_type: Mapped[str] = mapped_column(String(64))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    short_code: Mapped[str] = mapped_column(String(6))
    color: Mapped[str] = mapped_column(String(9), default="#3b82f6")
    logo_image_id: Mapped[int | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"))
    purse_remaining: Mapped[int] = mapped_column(Integer)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16))  # admin | owner
    display_name: Mapped[str] = mapped_column(String(64))
    avatar_image_id: Mapped[int | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"))
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Tier(Base):
    __tablename__ = "tiers"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(String(32))
    rank: Mapped[int] = mapped_column(Integer, unique=True)  # 1 = Platinum … 5 = Emerging
    max_per_team: Mapped[int] = mapped_column(Integer)
    base_price: Mapped[int] = mapped_column(Integer)
    bid_step: Mapped[int] = mapped_column(Integer)


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    original_tier_id: Mapped[int] = mapped_column(ForeignKey("tiers.id"))
    current_tier_id: Mapped[int] = mapped_column(ForeignKey("tiers.id"))
    # queued | on_block | sold | unsold_pool
    status: Mapped[str] = mapped_column(String(16), default="queued")
    queue_pos: Mapped[int] = mapped_column(Integer, default=0)
    role: Mapped[str | None] = mapped_column(String(32))
    batting_style: Mapped[str | None] = mapped_column(String(64))
    bowling_style: Mapped[str | None] = mapped_column(String(64))
    photo_image_id: Mapped[int | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(Text)
    sold_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"))
    sold_price: Mapped[int | None] = mapped_column(Integer)
    drop_count: Mapped[int] = mapped_column(Integer, default=0)


class AuctionSettings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    purse: Mapped[int] = mapped_column(Integer, default=1000)
    min_squad: Mapped[int] = mapped_column(Integer, default=7)
    max_squad: Mapped[int] = mapped_column(Integer, default=9)
    opening_timer_s: Mapped[int] = mapped_column(Integer, default=30)
    reset_timer_s: Mapped[int] = mapped_column(Integer, default=15)
    slabs_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # [{"from": 0, "step": 5}, {"from": 100, "step": 10}, ...]
    slabs: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    accelerated_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)


class AuctionState(Base):
    __tablename__ = "auction_state"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    # not_started | running | paused | accelerated | finished
    status: Mapped[str] = mapped_column(String(16), default="not_started")
    # status to return to after a pause (running or accelerated)
    resume_status: Mapped[str | None] = mapped_column(String(16))
    current_tier_id: Mapped[int | None] = mapped_column(ForeignKey("tiers.id"))
    current_lot_id: Mapped[int | None] = mapped_column(
        ForeignKey("lots.id", ondelete="SET NULL", use_alter=True, name="fk_state_lot")
    )
    version: Mapped[int] = mapped_column(BigInteger, default=0)


class Lot(Base):
    __tablename__ = "lots"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"))
    tier_id: Mapped[int] = mapped_column(ForeignKey("tiers.id"))
    round: Mapped[str] = mapped_column(String(16), default="main")  # main | accelerated
    status: Mapped[str] = mapped_column(String(16), default="open")  # open|sold|unsold|cancelled
    opening_price: Mapped[int] = mapped_column(Integer)
    high_bid: Mapped[int | None] = mapped_column(Integer)
    high_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_remaining_ms: Mapped[int | None] = mapped_column(Integer)
    dropped_to_tier_id: Mapped[int | None] = mapped_column(ForeignKey("tiers.id"))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Bid(Base):
    __tablename__ = "bids"
    __table_args__ = (UniqueConstraint("lot_id", "amount", name="uq_bid_lot_amount"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    lot_id: Mapped[int] = mapped_column(ForeignKey("lots.id", ondelete="CASCADE"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    amount: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Nomination(Base):
    __tablename__ = "nominations"

    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(48))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
