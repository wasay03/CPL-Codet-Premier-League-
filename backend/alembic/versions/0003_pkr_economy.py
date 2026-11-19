"""PKR economy: Rs 200M purse and IPL-style bid steps

Money stays in whole units of Rs 100,000; the UI shows millions. This moves an existing
database from the old defaults (1000 purse, flat per-tier steps) to a 2000 purse with
price slabs. It only touches a database that has not started its auction and still has the
old default purse with slabs off, so rules an admin already changed are left alone.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-19
"""
import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_PURSE, NEW_PURSE = 1000, 2000
NEW_SLABS = [{"from": 0, "step": 5}, {"from": 100, "step": 10}, {"from": 200, "step": 20}, {"from": 500, "step": 25}]
OLD_SLABS = NEW_SLABS[:3]


def _switch(old_purse: int, new_purse: int, slabs_on: bool, slabs: list, require_slabs_on: bool) -> None:
    bind = op.get_bind()
    untouched = bind.execute(
        sa.text(
            "SELECT 1 FROM settings s JOIN auction_state a ON a.id = 1 "
            "WHERE s.id = 1 AND NOT s.locked AND a.status = 'not_started' "
            "AND s.purse = :old AND s.slabs_enabled = :on"
        ),
        {"old": old_purse, "on": require_slabs_on},
    ).first()
    if not untouched:
        return
    bind.execute(
        sa.text("UPDATE settings SET purse = :p, slabs_enabled = :on, slabs = CAST(:slabs AS jsonb) WHERE id = 1"),
        {"p": new_purse, "on": slabs_on, "slabs": json.dumps(slabs)},
    )
    bind.execute(sa.text("UPDATE teams SET purse_remaining = :p"), {"p": new_purse})


def upgrade() -> None:
    _switch(OLD_PURSE, NEW_PURSE, True, NEW_SLABS, require_slabs_on=False)


def downgrade() -> None:
    _switch(NEW_PURSE, OLD_PURSE, False, OLD_SLABS, require_slabs_on=True)
