from datetime import datetime, timezone
from typing import Literal
import uuid

from pydantic import BaseModel, Field


Character = Literal["lula", "flavio"]


class RoundResultCreate(BaseModel):
    game_id: str = Field(default="main-arena", min_length=1, max_length=80)
    session_id: str = Field(min_length=1, max_length=120)
    round: int = Field(ge=1)
    winner: Character
    loser: Character
    contributors: list[str] = Field(default_factory=list, max_length=500)
    gifts_count: int = Field(default=0, ge=0)


class RoundResult(RoundResultCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))