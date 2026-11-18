"""seed tiers, teams, users, settings, auction state and the 41 players

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-18
"""
from collections.abc import Sequence

from alembic import op

from app.seed import seed

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    seed(op.get_bind())


def downgrade() -> None:
    for table in ("bids", "nominations", "audit_log"):
        op.execute(f"DELETE FROM {table}")
    op.execute("UPDATE auction_state SET current_lot_id = NULL")
    for table in ("lots", "players", "users", "auction_state", "settings", "teams", "tiers", "images"):
        op.execute(f"DELETE FROM {table}")
