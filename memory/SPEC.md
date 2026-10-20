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

## v6 — Ultra dispute, Shoryuken, giant Ultra and uploaded impact audio
- Every thank-you cutscene fully pauses timer, AI, combat animation and queued specials; its effect is queued only after the cutscene disappears, then the previous manual pause state is preserved.
- Persistent localStorage key `planalto-ultra-dispute`: each gift unit gives +1 to its benefited fighter (Lula = red team, Flávio = blue team shown with green fill). Scores persist across normal rounds. First to 20 triggers a priority `FATALITY DEFINITIVO`, guaranteed to reduce the rival to 0 HP; the dispute resets only when that Fatality connects.
- Top broadcast HUD has `ULTRA ESPECIAL — DISPUTA DE PRESENTES`, live `{score}/20` counters, green vs red bar and a blinking Fatality state.
- Gift catalogue rules_version 5: Rosquinha (`donut`) now triggers a 45-damage Shoryuken; Leão keeps Domain Expansion; Universo TikTok (`universe`, 44,999) triggers a 240-damage giant Ultra Hadouken. Both new specials are configurable in ADMIN.
- Shoryuken follows the supplied five-stage reference: crouch → charge → rising uppercut → aerial recovery → landing. Lula energy is red; Flávio energy is green/yellow. Ultra/Fatality uses an oversized full-arena projectile.
- Uploaded audio mapping: Flashbang/Faah alternate on heavy impacts; Lula meme plays for Lula specials; punch audio plays for normal impacts. Files are served locally from `/audio` and obey the existing volume/mute control.

## v7 — Slower combat and special-only heavy audio
- Ordinary move animation speed defaults to 0.85 (15% slower) and AI attack frequency to 1.12 (20% below the previous 1.4); scripted gift specials and Domain cinematics keep their original timing. Backend config migration `rules_version: 6` applies these values to existing arenas once.
- Audio cues are phase-specific: basic punch/kick contact uses only `punch.mp3`; `flashbang.mp3` and `faah.mp3` alternate only when a gift special actually deals damage; `lula-special.mp3` plays once at the start of Lula's special.

## v8 — Supplied Super Hadouken sprite, charge aura and strict gift pipeline
- Supplied assets are bundled as `/sprites/ultra_beam_sheet.png` and `/sprites/ultra_aura.png`. Ultra/Fatality uses a cropped large beam frame recoloured at render time (white core preserved): Lula red, Flávio green/yellow. The aura sprite surrounds only the charging/firing fighter and disappears after release.
- Gift processing is strictly serialized: cutscene 1 → complete effect/special 1 → cutscene 2 → complete effect/special 2. `ArenaEngine.onSpecialComplete(eventId)` advances the browser queue only when all repeated units, projectiles or Domain animation for that event are finished.
- Quantity >1 or consecutive gifts from the same username use 2× cutscene, special movement/projectile and audio playback while retaining the original quantity and damage per unit.
- Audio files are decoded into Web Audio buffers before impact where possible; scheduled playback starts on the exact release/impact frame and uses the same per-gift playback rate to avoid lag.

## v9 — Four-second Ultra cinematic, expanded sound design and background music
- Universo/Fatality now owns a four-second focused charge scene: opponent AI + round timer pause, camera zooms onto the attacker, supplied aura grows, `anime-powerup.mp3` plays during charge, then the enlarged supplied beam crosses beyond the entire arena with `strong-energy-wave.mp3`. Accelerated gift batches run movement/projectile/audio at 2×.
- Audio cues: normal Hadouken release = `surprised.mp3`; punches alternate `punch.mp3` / `multiple-punches.mp3`; kicks keep `punch.mp3`; `struggle-stand.mp3` fires on the exact frame a knocked-down fighter lands; special impacts retain alternating Flashbang/Faah.
- Every queued thank-you cutscene is preceded by a short synthesized two-note audio notification (no visual notification), scaled to the batch playback speed.
- Low-volume synthesized arcade/anime background music loops through Web Audio and follows the existing sound toggle and volume slider.
- Backend/default config `rules_version: 7`; Universo `animation_ms` is 4800 to reflect its longer cinematic.

## v10 — Invocadores, Genkidama and character voice rotation
- New configurable gift rules (`rules_version: 9`): 🔨 Martelo (`hammer`, 500) triggers **Invocação do Xande** for 150 damage; 🌠 Galáxia (`galaxy`, 1,000) triggers **Genkidama** for 300 damage. Both remain editable in ADMIN and participate in the strict cutscene → full special → next gift FIFO pipeline.
- Invocação do Xande (3.8s): the benefiting fighter kneels and slams the floor, Xande emerges, performs four heavy hammer strikes, and finishes with radial cracks, debris, tremor and knockdown. Its five local sprite frames are generated separately and normalized into `/sprites/invocador_hammer_sheet.png`, eliminating duplicate limbs and crop fragments.
- Genkidama (5.2s): focused charge, converging celestial particles, levitation, expanding cyan sphere, launch, energy-column impact, crater, radial shards and persistent surrounding destruction. Local effects sheet: `/sprites/genkidama_fx_sheet.png`, based on the supplied Genkidama sheet.
- Uploaded local audio: `/audio/genkidama-charge.mp3` during preparation, `/audio/genkidama-impact.mp3` on impact, `/audio/lula-special-alt.mp3` alternating with the previous Lula special line without immediate repeats, and `/audio/flavio-special.mp3` on every Flávio special. All obey mute, volume and 2× batch playback.
- Cinematics fully pause the round timer and both AIs, preserve the 9:16 LIVE HUD, use the existing damage/boost rules, and expose `Invocadores` / `Genkidamas` counters in ADMIN.
- Genkidama uses dedicated three-frame, body-normalized sheets (`lula_genkidama_sheet.png` / `flavio_genkidama_sheet.png`) for gathering, arms-raised and levitating poses; every frame is rendered at the same 250px body height as the standard fighters.
- The hammer invoker is rendered at fighter scale during attacks, with a pulsing yellow aura. The user-supplied justice-scales image is locally cleaned and composited as the full cinematic backdrop (`hammer_justice_backdrop.png`).
- Genkidama pose sheets are post-processed against each fighter's original skin palette so Lula and Flávio retain their normal in-game complexion during all three cinematic poses.

## v11 — Cutscene de vitória e colaboradores da rodada
- Quando uma rodada termina com vencedor, uma cutscene de 6 segundos cobre toda a composição vertical 9:16 (HUD, arena e barras), sem cobrir o cabeçalho/controles externos da página.
- A sobreposição usa a arte temática e o sprite de vitória do vencedor, informa round/nome e exibe todos os `@usuários` que enviaram presentes naquela rodada, sem duplicar nomes (comparação sem diferenciar maiúsculas/minúsculas) e mantendo a ordem do primeiro envio.
- A lista de colaboradores é isolada por rodada e zerada em `onRoundStart`; rodada sem presentes mostra “SEM COLABORADORES NESTA RODADA”. Empates não exibem cutscene de vencedor.
- Testids: `round-credits-cutscene`, `round-credits-winner-name`, `round-credits-users`, `round-credit-user-{n}` e `round-credits-empty`.

## v12 — Histórico infinito, áudio e clareza dos presentes
- O loop de rounds continua sem limite; cada vitória/derrota é registrada localmente em `planalto-round-history` e best-effort no Mongo via GET/POST `/api/live/results`. O identificador `session_id + round` torna o POST idempotente. ADMIN lista vencedor, derrotado e quantidade de presentes das rodadas recentes.
- Áudios locais novos: `gift-success.mp3` inicia cada cutscene de agradecimento; `victory.mp3` inicia a cutscene de vitória; `special-impact-3.mp3` entra na rotação sem repetição imediata com Flashbang/Faah nos danos fortes de especiais. Todos seguem volume, mudo e playback acelerado aplicável.
- Cada botão rápido de presente mostra o nome da especial/efeito logo abaixo; o select também combina “presente — ação”.
- Disputa: Lula permanece explicitamente vermelho e Flávio passa a ser identificado como TIME VERDE com preenchimento verde.
- Xande usa escala por quadro (preparação, elevação, balanço e impacto) para manter o corpo proporcional aos lutadores mesmo em poses largas/ajoelhadas.
- Nenhuma alteração TikFinity foi aplicada; integração real continua fora deste build conforme solicitação posterior do usuário.
