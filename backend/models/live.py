from datetime import datetime, timezone
from typing import Literal
import uuid

from pydantic import BaseModel, Field

Character = Literal["lula", "flavio"]
IntegrationMode = Literal["demo", "live"]
CombatMode = Literal["live", "normal"]
TargetCharacter = Literal["opponent", "lula", "flavio"]
# Special moves a gift can trigger (from the reference movement sheets).
SpecialMove = Literal[
    "none",
    "hadouken",
    "shoryuken",
    "ultra_hadouken",
    "domain",
    "invocadores",
    "genkidama",
    "damage_boost",
    "defense_boost",
]


class GiftRule(BaseModel):
    gift_id: str
    gift_name: str
    reference_value: int = Field(ge=0, le=1000000)
    action_name: str
    damage: int = Field(ge=0, le=10000)
    animation_ms: int = Field(ge=100, le=15000)
    effect_intensity: float = Field(ge=0.1, le=3)
    target_character: TargetCharacter = "opponent"
    enabled: bool = True
    repeat_policy: Literal["individual", "group"] = "individual"
    special_move: SpecialMove = "none"


class CombatSettings(BaseModel):
    max_hp: int = Field(default=600, ge=100, le=5000)
    common_damage: int = Field(default=5, ge=0, le=200)
    combo_damage: int = Field(default=12, ge=0, le=500)
    defense_reduction: float = Field(default=0.25, ge=0, le=1)
    recovery_ms: int = Field(default=650, ge=50, le=5000)
    invulnerability_ms: int = Field(default=420, ge=0, le=5000)
    fight_duration_sec: int = Field(default=180, ge=30, le=900)
    animation_speed: float = Field(default=0.85, ge=0.5, le=2)
    auto_attack_frequency: float = Field(default=1.12, ge=0.2, le=8)
    combat_mode: CombatMode = "live"
    visual_intensity: float = Field(default=1, ge=0.2, le=3)
    collective_goal: int = Field(default=150, ge=1, le=100000)
    backdrop: Literal["brasilia", "neon"] = "brasilia"
    allow_finisher: bool = False
    stun_ms: int = Field(default=1100, ge=200, le=5000)
    caption_ms: int = Field(default=3200, ge=800, le=15000)
    camera_zoom: float = Field(default=1.6, ge=1, le=2.5)
    effects_enabled: bool = True
    slow_motion: bool = True
    ai_skill: float = Field(default=0.65, ge=0, le=1)
    queue_priority: Literal["fifo", "impact"] = "fifo"


class LiveConfig(BaseModel):
    id: str = "default"
    integration_mode: IntegrationMode = "demo"
    rules: list[GiftRule] = Field(default_factory=list)
    # Bumped for catalogue/settings migrations; v9 = Invocação do Xande naming/art.
    rules_version: int = 9
    combat: CombatSettings = Field(default_factory=CombatSettings)


class DemoGiftCreate(BaseModel):
    gift_id: str
    username: str = Field(min_length=1, max_length=32)
    quantity: int = Field(default=1, ge=1, le=999)
    benefited_character: Character
    event_id: str | None = Field(default=None, max_length=120)
    user_id: str | None = Field(default=None, max_length=120)


class GiftEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    game_id: str
    sequence: int = Field(ge=1)
    event_id: str
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    username: str
    user_id: str | None = None
    gift_id: str
    gift_name: str
    quantity: int = Field(ge=1)
    benefited_character: Character
    target_character: Character
    action_name: str
    damage: int = Field(ge=0)
    animation_ms: int = Field(ge=100)
    effect_intensity: float = Field(ge=0.1)
    repeat_policy: Literal["individual", "group"] = "individual"
    special_move: SpecialMove = "none"
    reference_value: int = Field(default=0, ge=0)
    source: Literal["demo", "provider"] = "demo"
    status: Literal["queued", "processing", "completed"] = "queued"


class LiveStatus(BaseModel):
    state: Literal["demo", "disconnected", "connected", "reconnecting", "error"]
    mode: IntegrationMode
    message: str