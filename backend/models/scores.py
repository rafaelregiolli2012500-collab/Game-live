from datetime import datetime, timezone
from typing import Literal
import uuid

from pydantic import BaseModel, Field


class ScoreCreate(BaseModel):
    player_name: str = Field(min_length=1, max_length=16)
    score: int = Field(ge=0, le=999999)
    character: Literal["lula", "flavio"]
    mode: Literal["cpu", "2p", "training", "cpuvcpu", "live"]
    difficulty: Literal["rookie", "contender", "legend"]


class Score(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    player_name: str
    score: int
    character: Literal["lula", "flavio"]
    mode: Literal["cpu", "2p", "training", "cpuvcpu", "live"]
    difficulty: Literal["rookie", "contender", "legend"]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))