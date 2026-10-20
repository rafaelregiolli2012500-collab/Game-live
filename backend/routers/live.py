import asyncio
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status

from lib.db import db
from models.live import CombatSettings, DemoGiftCreate, GiftEvent, GiftRule, LiveConfig, LiveStatus

router = APIRouter()
GAME_ID = "main-arena"
CONFIG_ID = "default"

# Gift catalogue (editable in ADMIN). Every rule can be remapped without changing the combat loop.
DEFAULT_RULES: list[GiftRule] = [
    GiftRule(gift_id="rose", gift_name="Rosa", reference_value=1, action_name="Dano +10%", damage=0, animation_ms=1200, effect_intensity=1.0, target_character="opponent", special_move="damage_boost"),
    GiftRule(gift_id="heart", gift_name="Coração", reference_value=1, action_name="Defesa +10%", damage=0, animation_ms=1200, effect_intensity=1.0, target_character="opponent", special_move="defense_boost"),
    GiftRule(gift_id="donut", gift_name="Rosquinha", reference_value=30, action_name="Shoryuken", damage=45, animation_ms=1500, effect_intensity=1.4, special_move="shoryuken"),
    GiftRule(gift_id="lion", gift_name="Leão", reference_value=29999, action_name="Expansão de Domínio", damage=120, animation_ms=6500, effect_intensity=2.0, special_move="domain"),
    GiftRule(gift_id="universe", gift_name="Universo TikTok", reference_value=44999, action_name="Ultra Hadouken", damage=240, animation_ms=4800, effect_intensity=3.0, special_move="ultra_hadouken"),
]
RULES_VERSION = 7

_clients: dict[str, set[WebSocket]] = {}
_queues: dict[str, asyncio.Queue[GiftEvent]] = {}
_workers: dict[str, asyncio.Task[None]] = {}
_sequences: dict[str, int] = {}
_locks: dict[str, asyncio.Lock] = {}


async def get_config() -> LiveConfig:
    stored = await db.live_config.find_one({"id": CONFIG_ID})
    if stored and stored.get("rules_version", 1) >= RULES_VERSION:
        return LiveConfig(**stored)
    if stored:
        # Migration: v1 rules (old specials) are dropped; then any missing default gift is added.
        stored.pop("_id", None)
        # v1 rules (old specials) are dropped; default gifts replace any stored gift with the same id.
        default_ids = {rule.gift_id for rule in DEFAULT_RULES}
        kept = [r for r in stored.get("rules", []) if r.get("gift_id") not in default_ids] if stored.get("rules_version", 1) >= 2 else []
        rules = [rule.model_dump() for rule in DEFAULT_RULES] + kept
        combat = {**stored.get("combat", {}), "animation_speed": 0.85, "auto_attack_frequency": 1.12}
        config = LiveConfig(**{**stored, "rules": rules, "rules_version": RULES_VERSION, "combat": combat})
        await db.live_config.replace_one({"id": CONFIG_ID}, config.model_dump(), upsert=True)
        return config
    config = LiveConfig(id=CONFIG_ID, rules=DEFAULT_RULES, combat=CombatSettings())
    await db.live_config.replace_one({"id": CONFIG_ID}, config.model_dump(), upsert=True)
    return config


async def broadcast(game_id: str, message: dict) -> None:
    dead: list[WebSocket] = []
    for websocket in _clients.get(game_id, set()).copy():
        try:
            await websocket.send_json(message)
        except Exception:
            dead.append(websocket)
    for websocket in dead:
        _clients.get(game_id, set()).discard(websocket)


async def ensure_runtime(game_id: str) -> None:
    if game_id not in _queues:
        _queues[game_id] = asyncio.Queue(maxsize=300)
        _locks[game_id] = asyncio.Lock()
    worker = _workers.get(game_id)
    if worker is None or worker.done():
        _workers[game_id] = asyncio.create_task(process_queue(game_id))


async def process_queue(game_id: str) -> None:
    queue = _queues[game_id]
    while True:
        event = await queue.get()
        await db.live_events.update_one({"game_id": game_id, "event_id": event.event_id}, {"$set": {"status": "processing"}})
        await broadcast(game_id, {"type": "gift", "event": event.model_dump(mode="json")})
        await asyncio.sleep(min(1.25, max(0.05, event.animation_ms / 1000 * 0.25)))
        await db.live_events.update_one({"game_id": game_id, "event_id": event.event_id}, {"$set": {"status": "completed"}})
        queue.task_done()


def resolved_target(rule: GiftRule, beneficiary: str) -> str:
    if rule.target_character == "opponent":
        return "flavio" if beneficiary == "lula" else "lula"
    return rule.target_character


@router.get("/live/config", response_model=LiveConfig)
async def read_live_config() -> LiveConfig:
    return await get_config()


@router.put("/live/config", response_model=LiveConfig)
async def update_live_config(config: LiveConfig) -> LiveConfig:
    config.id = CONFIG_ID
    await db.live_config.replace_one({"id": CONFIG_ID}, config.model_dump(), upsert=True)
    return config


@router.get("/live/status", response_model=LiveStatus)
async def read_live_status() -> LiveStatus:
    config = await get_config()
    if config.integration_mode == "demo":
        return LiveStatus(state="demo", mode="demo", message="Modo DEMO ativo — sem conexão real com TikTok")
    return LiveStatus(state="disconnected", mode="live", message="Conector real não configurado; credenciais permanecem no backend")


@router.get("/live/events", response_model=list[GiftEvent])
async def read_live_events(game_id: str = GAME_ID) -> list[GiftEvent]:
    rows = await db.live_events.find({"game_id": game_id}).sort("sequence", -1).limit(50).to_list(50)
    return [GiftEvent(**row) for row in rows]


@router.get("/live/queue", response_model=list[GiftEvent])
async def read_live_queue(game_id: str = GAME_ID) -> list[GiftEvent]:
    rows = await db.live_events.find({"game_id": game_id, "status": {"$in": ["queued", "processing"]}}).sort("sequence", 1).to_list(300)
    return [GiftEvent(**row) for row in rows]


@router.post("/live/demo/gift", response_model=GiftEvent)
async def simulate_gift(payload: DemoGiftCreate, game_id: str = GAME_ID) -> GiftEvent:
    config = await get_config()
    if config.integration_mode != "demo":
        raise HTTPException(status_code=409, detail="Simulação disponível apenas no modo DEMO")
    rule = next((item for item in config.rules if item.gift_id == payload.gift_id and item.enabled), None)
    if rule is None:
        raise HTTPException(status_code=404, detail="Presente sem associação ativa")
    event_id = payload.event_id or f"demo-{uuid.uuid4()}"
    previous = await db.live_events.find_one({"game_id": game_id, "event_id": event_id})
    if previous:
        return GiftEvent(**previous)
    async with _locks.setdefault(game_id, asyncio.Lock()):
        previous = await db.live_events.find_one({"game_id": game_id, "event_id": event_id})
        if previous:
            return GiftEvent(**previous)
        last = _sequences.get(game_id)
        if last is None:
            row = await db.live_events.find_one({"game_id": game_id}, sort=[("sequence", -1)])
            last = int(row["sequence"]) if row else 0
        sequence = last + 1
        _sequences[game_id] = sequence
    event = GiftEvent(
        game_id=game_id,
        sequence=sequence,
        event_id=event_id,
        occurred_at=datetime.now(timezone.utc),
        username=payload.username,
        user_id=payload.user_id,
        gift_id=rule.gift_id,
        gift_name=rule.gift_name,
        quantity=payload.quantity,
        benefited_character=payload.benefited_character,
        target_character=resolved_target(rule, payload.benefited_character),
        action_name=rule.action_name,
        damage=rule.damage,
        animation_ms=rule.animation_ms,
        effect_intensity=rule.effect_intensity,
        repeat_policy=rule.repeat_policy,
        special_move=rule.special_move,
        reference_value=rule.reference_value,
        source="demo",
    )
    try:
        await db.live_events.insert_one(event.model_dump())
    except Exception as exc:
        if "duplicate" in str(exc).lower():
            previous = await db.live_events.find_one({"game_id": game_id, "event_id": event_id})
            if previous:
                return GiftEvent(**previous)
        raise
    await ensure_runtime(game_id)
    await _queues[game_id].put(event)
    return event


@router.websocket("/live/ws/{game_id}")
async def live_websocket(websocket: WebSocket, game_id: str, token: str | None = None) -> None:
    expected_token = os.environ.get("LIVE_WS_TOKEN")
    if expected_token and token != expected_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    config = await get_config()
    _clients.setdefault(game_id, set()).add(websocket)
    await ensure_runtime(game_id)
    state = "demo" if config.integration_mode == "demo" else "disconnected"
    message = "DEMO ONLY — aguardando presentes simulados" if state == "demo" else "TikTok real desconectado — conector pendente"
    await websocket.send_json({"type": "status", "state": state, "mode": config.integration_mode, "message": message})
    try:
        while True:
            incoming = await websocket.receive_text()
            if incoming == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        _clients.get(game_id, set()).discard(websocket)