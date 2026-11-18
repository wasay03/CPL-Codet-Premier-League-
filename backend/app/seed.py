"""Seed data: tiers, teams, users, settings, auction state and the 41-player pool.

Called from the Alembic seed migration (sync connection) and from tests.
"""

from sqlalchemy import insert
from sqlalchemy.engine import Connection

from .config import get_settings
from .passwords import hash_password
from .models import AuctionSettings, AuctionState, Player, Team, Tier, User

DEFAULT_PURSE = 1000

TIERS = [
    # key, name, rank, max_per_team, base_price, bid_step
    ("platinum", "Platinum", 1, 2, 200, 20),
    ("diamond", "Diamond", 2, 2, 100, 10),
    ("gold", "Gold", 3, 2, 50, 5),
    ("silver", "Silver", 4, 2, 25, 5),
    ("emerging", "Emerging", 5, 1, 10, 2),
]

PLAYERS: dict[str, list[str]] = {
    "platinum": ["Rahim Khan", "Baqal", "Ahmed Raza", "Sanaullah", "Farzeen", "Hazim"],
    "diamond": ["Murtaza", "Muaz", "Yasir Jalal", "Areeb", "Rafey", "Wasay", "Zain"],
    "gold": [
        "Sarim", "Aashiq", "Mubashir Rao", "Zahid", "Hashmani (?)",
        "Yasir Raza", "Danial", "Danish", "Shahzaib",
    ],
    "silver": [
        "Ruh (?)", "Ayubi", "Abd (?)", "Aham Ali (?)", "Hassan",
        "Mudassir Rizwan", "Ammar", "Kaleem", "Anwar", "Kashif",
    ],
    "emerging": [
        "Nazeer", "Shaheer", "Hussam", "Jahanzaib", "Ali",
        "Bilal", "Sharjeel", "Wajahat", "Mudassir Naeem",
    ],
}

TEAMS = [
    ("Team One", "T1", "#e11d48"),
    ("Team Two", "T2", "#2563eb"),
    ("Team Three", "T3", "#16a34a"),
]

DEFAULT_SLABS = [
    {"from": 0, "step": 5},
    {"from": 100, "step": 10},
    {"from": 200, "step": 20},
]



def seed(conn: Connection) -> None:
    s = get_settings()

    tier_ids: dict[str, int] = {}
    for key, name, rank, max_per_team, base, step in TIERS:
        tier_ids[key] = conn.execute(
            insert(Tier)
            .values(key=key, name=name, rank=rank, max_per_team=max_per_team, base_price=base, bid_step=step)
            .returning(Tier.id)
        ).scalar_one()

    team_ids = [
        conn.execute(
            insert(Team)
            .values(name=name, short_code=code, color=color, purse_remaining=DEFAULT_PURSE)
            .returning(Team.id)
        ).scalar_one()
        for name, code, color in TEAMS
    ]

    users = [
        ("admin", "Auctioneer", "admin", None, s.admin_password),
        ("owner1", "Owner 1", "owner", team_ids[0], s.owner1_password),
        ("owner2", "Owner 2", "owner", team_ids[1], s.owner2_password),
        ("owner3", "Owner 3", "owner", team_ids[2], s.owner3_password),
    ]
    for username, display, role, team_id, pw in users:
        conn.execute(
            insert(User).values(
                username=username,
                display_name=display,
                role=role,
                team_id=team_id,
                password_hash=hash_password(pw),
                must_change_password=s.require_password_change,
            )
        )

    conn.execute(
        insert(AuctionSettings).values(
            id=1,
            purse=DEFAULT_PURSE,
            min_squad=7,
            max_squad=9,
            opening_timer_s=30,
            reset_timer_s=15,
            slabs_enabled=False,
            slabs=DEFAULT_SLABS,
            accelerated_enabled=True,
            locked=False,
        )
    )
    conn.execute(insert(AuctionState).values(id=1, status="not_started", version=0))

    for key, names in PLAYERS.items():
        for pos, name in enumerate(names):
            conn.execute(
                insert(Player).values(
                    name=name,
                    original_tier_id=tier_ids[key],
                    current_tier_id=tier_ids[key],
                    status="queued",
                    queue_pos=pos,
                    drop_count=0,
                )
            )
