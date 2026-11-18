from typing import Literal

from pydantic import BaseModel, Field, field_validator

HEX = r"^#[0-9a-fA-F]{6}$"
PLAYER_ROLES = ("batter", "bowler", "all-rounder", "wicket-keeper")


class LoginIn(BaseModel):
    username: str
    password: str


class MeOut(BaseModel):
    id: int
    username: str
    role: str
    display_name: str
    avatar_image_id: int | None
    team_id: int | None
    must_change_password: bool


class LoginOut(BaseModel):
    token: str
    user: MeOut


class MePatch(BaseModel):
    display_name: str = Field(min_length=1, max_length=64)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class TeamPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    short_code: str | None = Field(None, min_length=1, max_length=6)
    color: str | None = Field(None, pattern=HEX)

    @field_validator("short_code")
    @classmethod
    def upper(cls, v: str | None) -> str | None:
        return v.upper() if v else v


class PlayerIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    tier_id: int
    role: Literal["batter", "bowler", "all-rounder", "wicket-keeper"] | None = None
    batting_style: str | None = Field(None, max_length=64)
    bowling_style: str | None = Field(None, max_length=64)
    note: str | None = Field(None, max_length=500)


class PlayerPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    tier_id: int | None = None
    role: Literal["batter", "bowler", "all-rounder", "wicket-keeper"] | None = None
    batting_style: str | None = Field(None, max_length=64)
    bowling_style: str | None = Field(None, max_length=64)
    note: str | None = Field(None, max_length=500)


class PlayerOrderIn(BaseModel):
    tier_id: int
    player_ids: list[int]


class TierIn(BaseModel):
    id: int
    name: str = Field(min_length=1, max_length=32)
    max_per_team: int = Field(ge=0, le=20)
    base_price: int = Field(ge=1, le=100000)
    bid_step: int = Field(ge=1, le=100000)


class Slab(BaseModel):
    from_: int = Field(alias="from", ge=0)
    step: int = Field(ge=1)

    model_config = {"populate_by_name": True}


class SettingsIn(BaseModel):
    purse: int = Field(ge=1, le=1_000_000)
    min_squad: int = Field(ge=0, le=50)
    max_squad: int = Field(ge=1, le=50)
    opening_timer_s: int = Field(ge=1, le=600)
    reset_timer_s: int = Field(ge=1, le=600)
    slabs_enabled: bool = False
    slabs: list[Slab] = []
    accelerated_enabled: bool = True
    tiers: list[TierIn] = []


class UserPatch(BaseModel):
    username: str | None = Field(None, min_length=2, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str | None = Field(None, min_length=1, max_length=64)
    password: str | None = Field(None, min_length=6, max_length=128)
    team_id: int | None = None
    clear_team: bool = False


class NextIn(BaseModel):
    mode: Literal["order", "random", "pick"] = "order"
    player_id: int | None = None


class ExtendIn(BaseModel):
    seconds: int = Field(10, ge=1, le=300)


class BidIn(BaseModel):
    lot_id: int
    amount: int


class NominationsIn(BaseModel):
    player_ids: list[int]


class ResetIn(BaseModel):
    confirm: str
