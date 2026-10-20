# Brasil Fight Arena (ex-Combate no Planalto) — living spec

## What it does
Local, no-login arcade fighting game inspired by the uploaded pixel-art reference. The player chooses Lula or Flávio, selects a mode and difficulty, and can fight, train, watch CPU vs CPU, or play a two-player keyboard match.

## Data model
- `ScoreCreate`: player_name, score, character, mode, difficulty
- `Score`: ScoreCreate plus id and created_at
- Browser localStorage key `planalto-scores` is the primary local leaderboard; `planalto-player` and `planalto-sound` persist preferences.
- FastAPI exposes `/api/leaderboard` and `/api/scores` for best-effort shared persistence, while the game remains usable when the API is unavailable.

## Key flows
1. Start screen → choose mode, character, difficulty and skin → iniciar combate.
2. Gameplay canvas → keyboard or touch controls for movement, block, light/heavy/special/super attacks, pause and menu.
3. Match end → victory/defeat result → optional player name → save score locally and best-effort to API → rematch or menu.
4. Header leaderboard → view, sort and clear local high scores.

## Auth and roles
No authentication, accounts or roles. All play is local and available immediately.

## Assets
The public `/sprites` directory contains the reference stage, character sprites and impact/ultra art copied from `Jogo-tik-tom-main.zip`.
## TikTok LIVE layer (v2)
- Backend: `backend/models/live.py` (GiftRule, CombatSettings, LiveConfig, DemoGiftCreate, GiftEvent, LiveStatus) + `backend/routers/live.py`.
  Collections `live_config` (single doc id=default) and `live_events` (unique game_id+event_id, unique game_id+sequence). Game id `main-arena`.
- Endpoints: GET/PUT /api/live/config, GET /api/live/status, POST /api/live/demo/gift (demo only, 409 in live mode, 404 unknown/disabled gift, idempotent by event_id), GET /api/live/events, GET /api/live/queue, WS /api/live/ws/{game_id}.
- Real TikTok connector NOT implemented; live mode reports `disconnected`. See /app/docs/TIKTOK_LIVE.md.
- Frontend: `src/lib/live.ts` (TS mirrors), `src/hooks/useGiftSocket.ts` (reconnect + dedupe), `src/components/live/LiveAdminPanel.tsx`.
- Home.tsx: single rAF loop; gift queue (giftQueueRef) processed one gift action at a time; repeat_policy individual expands quantity into separate hits (max 25), group = one hit × quantity.
- Central damage function `applyDamage`: in combat_mode "live" only authorized (gift/admin) damage changes HP; "normal" lets AI/player hits damage. Block = damage × defense_reduction; dodge/invulnerability = 0 damage; outcome text shows ACERTOU/BLOQUEADO/ESQUIVADO. Without allow_finisher, gifts cannot drop HP below 1.
- AI: stance (aggressive/guarded), reacts once per incoming attack using distance, attack type, time-to-impact, own recovery, recent hits → block/dodge; counter-attack after a block.
- Layout: 9:16 stream composition — top bar (portraits, names, HP, wins, round, LIVE status, last special user), 16:9 canvas centered, bottom bar (last gift, sender, move, count, queue, goal, outcome, incentive). Backdrop `/sprites/arena_backdrop.jpg` (generated pixel art) or neon gradient.
- localStorage: planalto-wins, planalto-volume (+ previous keys).

## v3 — Movement sheet + specials removed
- Movement scripts (`frontend/src/game/moves.ts`) are keyframed clips modelled on the user's reference movement sheet (Street Fighter Alpha style): idle stance loop, walk cycle, back-dash hop, jab, heavy punch, crouching uppercut (anti-air), standing roundhouse kick, crouching sweep (knockdown), jump-in kick (airkick), throw, block, hit, stun, knockdown → lying → get-up, victory. Shared by both fighters.
- Sprites: `/sprites/{lula|flavio}_{pose}.png`, 16 poses each. Original art kept for idle/punch/hook/grab/stun/hurt/victory; original flying kick reused as `airkick`; new poses (walk, crouch, jump, uppercut, kick, sweep, block, knockdown) generated from each character's own art. `assets.ts` holds per-character POSE_HEIGHT (tuned so head/body scale is equal in every pose — sweep/crouch/jump/knockdown no longer shrink) + POSE_ANCHOR (body-centre origin per sprite so poses never jitter).
- ALL gift specials removed: cutscenes.ts/giftQueue.ts deleted, no special_style/hits/special_damage anywhere. Backend DEFAULT_RULES = [] and `rules_version: 2` migration wipes old stored gift rules on first read. Gifts that do arrive are only announced (caption + bottom bar). New gifts come in the next phase.
- Note: combat_mode "live" means only gift/admin damage changes HP; with no gifts the round ends by timer. Switch to "normal" in ADMIN for hits to deal damage.

## v4 — Rosa → Hadouken (gift special)
- Backend: `GiftRule.special_move` / `GiftEvent.special_move` ("none" | "hadouken"); DEFAULT_RULES = [Rosa (gift_id rose, damage 30, special_move hadouken)]; `rules_version: 3` migration adds missing default gifts (keeps v2 rules, drops v1).
- Frontend: Home.receiveGift → `engine.triggerSpecial(event)` (pending until arena opens). Engine queues one hadouken per unit (individual, max 10) or one summed (group); fires when the benefited fighter is free. Move `hadouken` (poses `charge` → `fireball`, sprites `{lula|flavio}_charge.png`/`_fireball.png`), ball released at 0.36s, attacker slides back to open space, ball always connects (gift damage via applyDamage source "gift").
- Colours: Lula RED, Flávio BLUE (`SPECIAL_COLORS` in assets.ts). AI never uses hadouken; AI does not react to it.
- ADMIN: rule row has ESPECIAL select (Nenhum/Hadouken); quick button `quick-gift-rose-button`; stats show Hadoukens.

## v5 — Boosts, Domain Expansion, thank-you cutscene
- Gift catalogue (backend DEFAULT_RULES, rules_version 4; editable in ADMIN): 🌹 Rosa (rose, 1) = damage_boost; 💗 Coração (heart, 1) = defense_boost; 🍩 Rosquinha (donut, 30) = hadouken (30 dmg); 🦁 Leão (lion, 29999) = domain (120 dmg).
- Boosts: +10% per gift unit to the benefited fighter; damage max +100%, defense max +50% (less damage taken). 2-minute timer, refreshed on each gift, reset at every new round (new fighters). Applied in damage.ts (attacker dmgBoost × target defBoost). Aura on the fighter (orange flame = damage, cyan shield = defense) + chips under the profile (`broadcast-{left|right}-damage-boost` / `-defense-boost`) with countdown.
- Domain (`game/domain.ts`, 6.6s cinematic, timer/AI paused): mudra pose → domain expands (Lula "ARENA SANGRENTA" red sphere + floor runes; Flávio "FLORESTA TROPICAL" Brazilian flag) → opponent frozen (ice tint + shards) → 9-hit super combo (punches/kicks/uppercut/sweep/airkick) → hadouken finisher → collapse → opponent knocked down.
- Thank-you cutscene for EVERY gift (`components/live/GiftCaptions.tsx`, testid `thanks-cutscene`): art `/sprites/thanks_lula.jpg` (red flag, white star) / `thanks_flavio.jpg` (Brazil flag), "OBRIGADO, @user!", gift + effect label. The gift effect fires when its cutscene ends (Home.applyGift).
