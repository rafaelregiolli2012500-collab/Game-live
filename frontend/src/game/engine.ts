/**
 * ArenaEngine — single requestAnimationFrame loop orchestrating:
 * AI (ai.ts) → move/contact (combat.ts) → damage (damage.ts) → camera → effects → render.
 * Gifts: triggerSpecial() applies boosts at once and queues hadoukens / domain expansions for the benefited fighter.
 */
import { BOOST_DURATION_SEC, BOOST_STEP, DAMAGE_BOOST_MAX, DEFENSE_BOOST_MAX, type CombatSettings, type GiftEvent } from "@/lib/live";
import { updateAi } from "./ai";
import { CHARACTERS, DOMAINS, SOUND_FILES, loadImages } from "./assets";
import { createCamera, resetCamera, updateCamera } from "./camera";
import { createFighter, isAirborne, isFree, setState, startMove, updateMove, updateProjectiles, type CombatContext, type SoundCue } from "./combat";
import { adminAdjust } from "./damage";
import { endDomain, startDomain, updateDomain, type Domain } from "./domain";
import { burst, createEffects, updateEffects } from "./effects";
import { endGiftCinematic, startGiftCinematic, updateGiftCinematic, type GiftCinematic, type GiftCinematicKind } from "./giftCinematics";
import { animateMove, animateState } from "./moves";
import { render, type RenderState } from "./renderer";
import type { CharacterId, CombatStats, EngineCallbacks, Fighter, FighterState, GiftAttackKind, HudSnapshot } from "./types";

const GRAVITY = 1500;
const ROUND_BREAK_SEC = 7;

export const emptyStats = (): CombatStats => ({ jab: 0, hook: 0, uppercut: 0, kick: 0, sweep: 0, airkick: 0, grab: 0, hadouken: 0, shoryuken: 0, ultra_hadouken: 0, invocadores: 0, genkidama: 0, fatalities: 0, domains: 0, throws: 0, combos: 0, stuns: 0, knockdowns: 0, blocks: 0, dodges: 0, counters: 0 });

/** Force both fighters to face each other (never show their backs). */
function lockFacing(a: Fighter, b: Fighter) {
  a.facing = b.x >= a.x ? 1 : -1;
  b.facing = (a.facing === 1 ? -1 : 1) as 1 | -1;
}

export class ArenaEngine {
  private ctx: CanvasRenderingContext2D;
  private images = loadImages();
  private fighters: Fighter[] = [];
  private ctxCombat: CombatContext;
  private raf = 0;
  private last = performance.now();
  private hudAt = 0;
  private timeLeft = 0;
  private round = 1;
  private paused = false;
  private roundOverAt: number | null = null;
  private banner: RenderState["banner"] = null;
  /** Gift specials waiting for their fighter to be free. */
  private specials: { id: CharacterId; kind: GiftAttackKind | GiftCinematicKind | "domain"; damage: number; username: string; speed: number }[] = [];
  private domain: Domain | null = null;
  private cinematic: GiftCinematic | null = null;
  private activeBatchId: string | null = null;

  private settings: CombatSettings;
  private left: CharacterId;
  private right: CharacterId;
  private callbacks: EngineCallbacks;

  private volume = 0.6;
  private audio: AudioContext | null = null;
  private audioBuffers = new Map<string, AudioBuffer>();
  private bufferSources = new Set<AudioBufferSourceNode>();
  private clips = new Set<HTMLAudioElement>();
  private strongSound = 0;
  private punchSound = 0;
  private lulaVoice = Math.random() < 0.5 ? 0 : 1;
  private musicTimer: number | null = null;
  private musicOscillators: OscillatorNode[] = [];
  private musicGain: GainNode | null = null;
  private musicStep = 0;

  constructor(canvas: HTMLCanvasElement, settings: CombatSettings, left: CharacterId, right: CharacterId, callbacks: EngineCallbacks) {
    this.settings = settings;
    this.left = left;
    this.right = right;
    this.callbacks = callbacks;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.ctxCombat = { settings, fx: createEffects(), camera: createCamera(), stats: emptyStats(), time: 0, sound: (power, fighter, cue, speed) => this.playHit(power, fighter, cue, speed), onFatalityHit: (winner) => this.callbacks.onFatalityComplete(winner), projectiles: [] };
    this.resetRound();
    void this.preloadAudio();
    this.startMusic();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() { cancelAnimationFrame(this.raf); this.stopMusic(); this.clips.forEach((clip) => clip.pause()); this.clips.clear(); this.bufferSources.forEach((source) => { try { source.stop(); } catch { /* already stopped */ } }); this.bufferSources.clear(); void this.audio?.close(); }
  setVolume(volume: number) { this.volume = volume; if (volume > 0) { this.startMusic(); if (this.musicGain) this.musicGain.gain.value = volume * 0.026; } else this.stopMusic(); }
  setPaused(paused: boolean) { this.paused = paused; }
  notifyGift(speed = 1) { this.playHit(0.4, undefined, "gift-alert", speed); }
  notifyVictory() { this.playHit(1, undefined, "victory", 1); }

  private ensureAudio() {
    this.audio ??= new AudioContext();
    return this.audio;
  }

  private async preloadAudio() {
    try {
      const audio = this.ensureAudio();
      await Promise.all(Object.values(SOUND_FILES).map(async (source) => {
        if (this.audioBuffers.has(source)) return;
        const response = await fetch(source);
        if (!response.ok) return;
        this.audioBuffers.set(source, await audio.decodeAudioData(await response.arrayBuffer()));
      }));
    } catch { /* HTMLAudio fallback remains available */ }
  }

  private playHit(power: number, fighter?: CharacterId, cue: SoundCue = "basic-punch", speed = 1) {
    if (this.volume <= 0) return;
    if (cue === "gift-alert") { this.playClip(SOUND_FILES.giftSuccess, this.volume * 0.72, 2200, speed, power); return; }
    if (cue === "victory") { this.playClip(SOUND_FILES.victory, this.volume * 0.9, 4800, 1, power); return; }
    if (cue === "ultra-charge") { this.playClip(SOUND_FILES.animePowerup, this.volume * 0.72, 4300, speed, power); return; }
    if (cue === "ultra-wave") { this.playClip(SOUND_FILES.strongEnergyWave, this.volume * 0.9, 3500, speed, power); return; }
    if (cue === "genkidama-charge") { this.playClip(SOUND_FILES.genkidamaCharge, this.volume * 0.82, 4400, speed, power); return; }
    if (cue === "genkidama-impact") { this.playClip(SOUND_FILES.genkidamaImpact, this.volume, 2800, speed, power); return; }
    if (cue === "hadouken-start") { this.playClip(SOUND_FILES.surprised, this.volume * 0.72, 1800, speed, power); return; }
    if (cue === "knockdown") { this.playClip(SOUND_FILES.struggleStand, this.volume * 0.62, 1500, speed, power); return; }
    if (cue === "special-start") {
      if (fighter === "lula") {
        const choices = [SOUND_FILES.lulaSpecial, SOUND_FILES.lulaSpecialAlt] as const;
        this.playClip(choices[this.lulaVoice], this.volume * 0.9, 5200, speed, power);
        this.lulaVoice = this.lulaVoice === 0 ? 1 : 0;
      } else if (fighter === "flavio") {
        this.playClip(SOUND_FILES.flavioSpecial, this.volume * 0.9, 5200, speed, power);
      }
      return;
    }
    if (cue === "special-impact") {
      const impacts = [SOUND_FILES.flashbang, SOUND_FILES.faah, SOUND_FILES.specialImpactThree] as const;
      this.playClip(impacts[this.strongSound++ % impacts.length], this.volume * 0.72, 1800, speed, power);
      return;
    }
    if (cue === "basic-punch") {
      const source = [SOUND_FILES.punch, SOUND_FILES.multiplePunches][this.punchSound++ % 2];
      this.playClip(source, this.volume * 0.55, source === SOUND_FILES.punch ? 650 : 950, 1, power);
      return;
    }
    // Kicks keep the single punch/impact sample; only punches alternate.
    this.playClip(SOUND_FILES.punch, this.volume * 0.55, 650, 1, power);
  }

  private startMusic() {
    if (this.volume <= 0 || this.musicTimer !== null) return;
    try {
      const audio = this.ensureAudio();
      void audio.resume();
      const gain = audio.createGain();
      gain.gain.value = this.volume * 0.026;
      gain.connect(audio.destination);
      const bass = audio.createOscillator();
      const lead = audio.createOscillator();
      bass.type = "square";
      lead.type = "triangle";
      bass.connect(gain);
      lead.connect(gain);
      bass.start();
      lead.start();
      this.musicGain = gain;
      this.musicOscillators = [bass, lead];
      const bassNotes = [82.41, 82.41, 98, 110, 82.41, 123.47, 110, 98];
      const leadNotes = [329.63, 392, 440, 392, 493.88, 440, 392, 329.63];
      const tick = () => {
        const now = audio.currentTime;
        const index = this.musicStep++ % bassNotes.length;
        bass.frequency.setTargetAtTime(bassNotes[index], now, 0.018);
        lead.frequency.setTargetAtTime(leadNotes[index], now, 0.018);
      };
      tick();
      this.musicTimer = window.setInterval(tick, 280);
    } catch { /* music unavailable */ }
  }

  private stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.musicOscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* already stopped */ } });
    this.musicOscillators = [];
    this.musicGain?.disconnect();
    this.musicGain = null;
  }

  private playClip(source: string, volume: number, stopAfter: number, speed: number, fallbackPower?: number) {
    const audio = this.ensureAudio();
    const buffer = this.audioBuffers.get(source);
    if (buffer) {
      try {
        const node = audio.createBufferSource();
        const gain = audio.createGain();
        node.buffer = buffer;
        node.playbackRate.value = speed;
        gain.gain.value = Math.min(1, volume);
        node.connect(gain).connect(audio.destination);
        this.bufferSources.add(node);
        node.onended = () => this.bufferSources.delete(node);
        void audio.resume();
        node.start(audio.currentTime);
        node.stop(audio.currentTime + Math.min(buffer.duration / speed, stopAfter / 1000 / speed));
        return;
      } catch { /* HTMLAudio fallback below */ }
    }
    try {
      const clip = new Audio(source);
      clip.volume = Math.min(1, volume);
      clip.playbackRate = speed;
      this.clips.add(clip);
      const cleanup = () => { clip.pause(); this.clips.delete(clip); };
      clip.addEventListener("ended", cleanup, { once: true });
      window.setTimeout(cleanup, stopAfter / speed);
      void clip.play().catch(() => { if (fallbackPower !== undefined) this.playSynth(fallbackPower); });
      return;
    } catch { /* use generated fallback below */ }
    if (fallbackPower !== undefined) this.playSynth(fallbackPower);
  }

  private playSynth(power: number) {
    try {
      this.audio ??= new AudioContext();
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.type = "square";
      osc.frequency.value = 110 + power * 70;
      gain.gain.setValueAtTime(this.volume * 0.12, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + 0.14);
      osc.connect(gain).connect(this.audio.destination);
      osc.start();
      osc.stop(this.audio.currentTime + 0.15);
    } catch { /* audio unavailable */ }
  }

  setSettings(settings: CombatSettings) {
    this.settings = settings;
    this.ctxCombat.settings = settings;
    this.ctxCombat.fx.enabled = settings.effects_enabled;
    this.fighters.forEach((f) => { f.hp = Math.min(f.hp, settings.max_hp); });
  }

  setFighters(left: CharacterId, right: CharacterId) {
    this.left = left;
    this.right = right;
    this.resetRound();
  }

  adjustHp(id: CharacterId, delta: number) {
    const f = this.fighters.find((item) => item.id === id);
    if (f) adminAdjust(this.settings, f, delta);
  }

  restartRound() { this.resetRound(); }

  /**
   * Applies a gift to the benefited fighter. Boosts: +10% per unit (damage max +100%, defense max +50%),
   * timer refreshed to 2 minutes, reset on the next round. Specials: "individual" = one per unit (max 10), "group" = one summed.
   */
  triggerSpecial(event: GiftEvent, speed = 1) {
    const playback = Math.max(1, Math.min(2, speed));
    this.activeBatchId = event.id;
    const id = event.benefited_character;
    const f = this.fighters.find((item) => item.id === id);
    if (event.special_move === "damage_boost" || event.special_move === "defense_boost") {
      if (!f) return;
      const dmg = event.special_move === "damage_boost";
      const boost = dmg ? f.dmgBoost : f.defBoost;
      boost.pct = Math.min(dmg ? DAMAGE_BOOST_MAX : DEFENSE_BOOST_MAX, boost.pct + BOOST_STEP * event.quantity);
      boost.left = BOOST_DURATION_SEC;
      f.flash = 0.25;
      const colors = dmg ? ["#ff9d1e", "#ff3b30", "#ffe600"] : ["#00f0ff", "#9fe8ff", "#ffffff"];
      burst(this.ctxCombat.fx, f.x, 478 - 120, colors, 30, 260, -200);
      this.completeActiveBatch();
      return;
    }
    if (event.special_move !== "hadouken" && event.special_move !== "shoryuken" && event.special_move !== "ultra_hadouken" && event.special_move !== "domain" && event.special_move !== "invocadores" && event.special_move !== "genkidama") { this.completeActiveBatch(); return; }
    const kind = event.special_move;
    const units = kind === "domain" ? 1 : event.repeat_policy === "group" ? 1 : Math.min(10, event.quantity);
    const damage = kind === "domain" || event.repeat_policy === "group" ? event.damage * event.quantity : event.damage;
    for (let i = 0; i < units; i += 1) this.specials.push({ id, kind, damage, username: event.username, speed: playback });
  }

  /** Priority attack earned by reaching 20 gifts; it cancels the current exchange and always KOs. */
  triggerFatality(id: CharacterId, username: string, eventId: string, speed = 1) {
    this.activeBatchId = eventId;
    this.specials = [];
    this.ctxCombat.projectiles = [];
    if (this.cinematic) endGiftCinematic(this.cinematic, this.ctxCombat);
    this.cinematic = null;
    if (this.domain) this.domain.victim.frozen = 0;
    this.domain = null;
    this.fighters.forEach((fighter) => { fighter.special = null; fighter.combo = []; fighter.grabPartner = null; setState(fighter, "idle"); });
    this.ctxCombat.stats.fatalities += 1;
    this.specials.unshift({ id, kind: "fatality", damage: this.settings.max_hp, username, speed: Math.max(1, Math.min(2, speed)) });
    this.banner = { text: "FATALITY DEFINITIVO", sub: `${CHARACTERS[id].name} DOMINOU A DISPUTA`, until: this.ctxCombat.time + 3 };
  }

  private processSpecials() {
    if (this.roundOverAt !== null || this.domain || this.cinematic || this.ctxCombat.projectiles.length) return;
    for (const f of this.fighters) {
      if (!isFree(f) || f.y < 0) continue;
      if (!f.special) {
        const index = this.specials.findIndex((item) => item.id === f.id);
        if (index < 0) continue;
        const next = this.specials[index];
        if (next.kind === "domain") {
          const victim = this.fighters.find((item) => item !== f)!;
          // Wait until the opponent is standing and no energy ball is in flight.
          if (victim.state === "knockdown" || victim.state === "grabbed" || victim.y < 0 || this.ctxCombat.projectiles.length) continue;
          this.specials.splice(index, 1);
          this.domain = startDomain(f, victim, next.damage, next.speed);
          this.ctxCombat.stats.domains += 1;
          this.banner = { text: DOMAINS[f.id].title, sub: DOMAINS[f.id].name, until: this.ctxCombat.time + 1.5 };
          return;
        }
        if (next.kind === "invocadores" || next.kind === "genkidama") {
          const victim = this.fighters.find((item) => item !== f)!;
          if (victim.state === "knockdown" || victim.state === "grabbed" || victim.y < 0) continue;
          this.specials.splice(index, 1);
          this.cinematic = startGiftCinematic(next.kind, f, victim, next.damage, next.speed);
          this.ctxCombat.stats[next.kind] += 1;
          this.banner = { text: next.kind === "genkidama" ? "GENKIDAMA" : "INVOCAÇÃO DO XANDE", sub: `@${next.username} ATIVOU A ESPECIAL`, until: this.ctxCombat.time + 1.35 };
          return;
        }
        this.specials.splice(index, 1);
        const victim = this.fighters.find((item) => item !== f)!;
        if (next.kind === "shoryuken") {
          if (!isFree(victim) || victim.y < 0 || this.ctxCombat.projectiles.length) { this.specials.splice(index, 0, next); continue; }
          f.x = Math.max(90, Math.min(870, victim.x - f.facing * 108));
        }
        if (next.kind === "ultra_hadouken" || next.kind === "fatality") {
          victim.combo = [];
          victim.grabPartner = null;
          setState(victim, "idle");
        }
        f.special = { kind: next.kind, damage: next.damage, username: next.username, speed: next.speed };
      }
      // Start the scripted gift move (or re-fire if an attempt was interrupted before release).
      f.combo = [];
      const move = f.special.kind === "shoryuken" ? "shoryuken" : f.special.kind === "hadouken" ? "hadouken" : "ultra_hadouken";
      this.playHit(move === "ultra_hadouken" ? 2.2 : 1.8, f.id, "special-start", f.special.speed);
      if (move === "ultra_hadouken") this.playHit(2.2, f.id, "ultra-charge", f.special.speed);
      startMove(f, move, this.ctxCombat, f.special.speed);
      f.invuln = 0.5;
    }
  }

  private resetRound() {
    // Left faces right (1), right faces left (-1) — they always start looking at each other.
    this.fighters = [
      createFighter(this.left, 300, this.settings.max_hp, 1),
      createFighter(this.right, 660, this.settings.max_hp, -1),
    ];
    this.timeLeft = this.settings.fight_duration_sec;
    this.roundOverAt = null;
    this.ctxCombat.projectiles = [];
    this.domain = null;
    this.cinematic = null;
    resetCamera(this.ctxCombat.camera, 8);
    this.banner = { text: `ROUND ${String(this.round).padStart(2, "0")}`, sub: "LUTEM!", until: this.ctxCombat.time + 1.6 };
    this.callbacks.onRoundStart(this.round);
  }

  private endRound(winner: Fighter | null) {
    if (this.roundOverAt !== null) return;
    this.roundOverAt = this.ctxCombat.time;
    if (this.domain) { this.domain.victim.frozen = 0; this.domain = null; }
    resetCamera(this.ctxCombat.camera);
    this.fighters.forEach((f) => {
      f.combo = [];
      f.grabPartner = null;
      // A knocked-down loser stays on the floor; everyone else returns to stance / victory.
      if (f === winner) setState(f, "victory");
      else if (f.state !== "knockdown") setState(f, "idle");
      else f.stateDuration = ROUND_BREAK_SEC + 1;
    });
    lockFacing(this.fighters[0], this.fighters[1]);
    this.banner = { text: winner ? `${CHARACTERS[winner.id].name} VENCE!` : "EMPATE!", sub: "PRÓXIMA RODADA EM INSTANTES", until: this.ctxCombat.time + ROUND_BREAK_SEC };
    this.callbacks.onRoundEnd(winner?.id ?? null, this.round);
  }

  /** Push-box: grounded bodies never overlap (throws and jump-ins are allowed to cross). */
  private separate(a: Fighter, b: Fighter) {
    if (a.grabPartner || isAirborne(a) || isAirborne(b) || a.state === "knockdown" || b.state === "knockdown") return;
    const gap = Math.abs(b.x - a.x);
    const min = 92;
    if (gap >= min) return;
    const dir = b.x >= a.x ? 1 : -1;
    const push = (min - gap) / 2;
    a.x = Math.max(70, Math.min(890, a.x - dir * push));
    b.x = Math.max(70, Math.min(890, b.x + dir * push));
  }

  /** Counts boosts down; spawns rising aura sparks while active. */
  private tickBoosts(f: Fighter, dt: number) {
    for (const boost of [f.dmgBoost, f.defBoost]) {
      if (boost.pct <= 0) continue;
      boost.left -= dt;
      if (boost.left <= 0) { boost.pct = 0; boost.left = 0; }
    }
    if (f.dmgBoost.pct > 0 && Math.random() < dt * 14) burst(this.ctxCombat.fx, f.x + (Math.random() - 0.5) * 90, 478 - Math.random() * 200, ["#ff9d1e", "#ff3b30", "#ffe600"], 1, 40, -320);
    if (f.defBoost.pct > 0 && Math.random() < dt * 8) burst(this.ctxCombat.fx, f.x + (Math.random() - 0.5) * 110, 478 - Math.random() * 220, ["#00f0ff", "#ffffff"], 1, 30, -120);
  }

  private physics(f: Fighter, dt: number) {
    if (f.y < 0 || f.vy !== 0) {
      f.vy += GRAVITY * dt;
      f.y = Math.min(0, f.y + f.vy * dt);
      if (f.y >= 0) {
        f.vy = 0;
        f.y = 0;
        if (f.fallSoundPending) { f.fallSoundPending = false; this.playHit(0.9, f.id, "knockdown", f.moveSpeed); }
      }
    }
    f.x += f.vx * dt;
    if (f.y >= 0 && f.move !== "airkick") f.vx *= Math.exp(-7 * dt);
    f.x = Math.max(70, Math.min(890, f.x));
  }

  private updateFighter(f: Fighter, other: Fighter, dt: number) {
    f.stateTime += dt;
    f.invuln = Math.max(0, f.invuln - dt);
    f.flash = Math.max(0, f.flash - dt);
    f.stunImmune = Math.max(0, f.stunImmune - dt);
    f.stunBuild = Math.max(0, f.stunBuild - dt * 0.12);
    if (["hit", "stun", "block", "dodge"].includes(f.state) && f.stateDuration > 0 && f.stateTime >= f.stateDuration) setState(f, "idle");
    if (f.state === "dodge" && f.stateTime > 0.2) f.vx *= 0.8;
    if (f.state === "knockdown" && f.stateTime >= f.stateDuration && f.y >= 0) { setState(f, "idle"); f.invuln = 0.7; }
    if (f.state === "grabbed" && !f.grabPartner) setState(f, "idle");
    if (this.roundOverAt === null) {
      updateAi(f, other, this.ctxCombat, dt);
      updateMove(f, other, this.ctxCombat, dt);
    }
    this.physics(f, dt);
    if (f.state === "attack") animateMove(f);
    else animateState(f, this.ctxCombat.time);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.step(dt);
    render(this.ctx, this.images, { domain: this.domain, cinematic: this.cinematic, fighters: this.fighters, camera: this.ctxCombat.camera, fx: this.ctxCombat.fx, projectiles: this.ctxCombat.projectiles, timeLeft: this.timeLeft, round: this.round, time: this.ctxCombat.time, banner: this.banner });
    if (now - this.hudAt > 100) {
      this.hudAt = now;
      const [a, b] = this.fighters;
      const states = { [a.id]: a.state, [b.id]: b.state } as Record<CharacterId, FighterState>;
      this.callbacks.onHud({
        hp: { [a.id]: a.hp, [b.id]: b.hp } as Record<CharacterId, number>,
        timeLeft: this.timeLeft, round: this.round, stats: { ...this.ctxCombat.stats }, states,
        specials: this.specials.length + this.ctxCombat.projectiles.length + this.fighters.filter((f) => f.special || f.move === "hadouken" || f.move === "shoryuken" || f.move === "ultra_hadouken").length + (this.domain ? 1 : 0) + (this.cinematic ? 1 : 0),
        boosts: Object.fromEntries(this.fighters.map((f) => [f.id, { damage: f.dmgBoost.pct, damageLeft: f.dmgBoost.left, defense: f.defBoost.pct, defenseLeft: f.defBoost.left }])) as HudSnapshot["boosts"],
        domain: this.domain ? DOMAINS[this.domain.attacker.id].name : null,
      });
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private step(dt: number) {
    const c = this.ctxCombat;
    c.time += dt;
    const [a, b] = this.fighters;
    this.fighters.forEach((f) => this.tickBoosts(f, dt));
    if (this.cinematic && this.roundOverAt === null) {
      const cinematic = this.cinematic;
      this.fighters.forEach((fighter) => { fighter.flash = Math.max(0, fighter.flash - dt); });
      if (updateGiftCinematic(cinematic, c, dt)) {
        this.cinematic = null;
        endGiftCinematic(cinematic, c);
      }
      if (this.fighters.some((fighter) => fighter.hp <= 0) && !this.cinematic) {
        const knockedOut = this.fighters.find((fighter) => fighter.hp <= 0)!;
        this.endRound(this.fighters.find((fighter) => fighter !== knockedOut)!);
      }
    } else if (this.domain && this.roundOverAt === null) {
      // Cinematic: the domain owns both fighters; round timer, AI and energy balls are paused.
      const d = this.domain;
      this.fighters.forEach((f) => { f.flash = Math.max(0, f.flash - dt); });
      if (updateDomain(d, c, dt)) { this.domain = null; endDomain(d, c); }
      if (this.fighters.some((f) => f.hp <= 0) && !this.domain) {
        const ko = this.fighters.find((f) => f.hp <= 0)!;
        this.endRound(this.fighters.find((f) => f !== ko)!);
      }
    } else if (this.roundOverAt !== null) {
      this.fighters.forEach((f) => { f.stateTime += dt; this.physics(f, dt); animateState(f, c.time); });
      if (c.projectiles.length) updateProjectiles(c, this.fighters, dt);
      lockFacing(a, b);
      if (c.time - this.roundOverAt >= ROUND_BREAK_SEC) { this.round += 1; this.resetRound(); }
    } else if (this.fighters.some((fighter) => fighter.move === "ultra_hadouken")) {
      // Four-second cinematic charge: timer and opponent AI pause while the attacker powers up.
      const attacker = this.fighters.find((fighter) => fighter.move === "ultra_hadouken")!;
      const victim = this.fighters.find((fighter) => fighter !== attacker)!;
      this.updateFighter(attacker, victim, dt);
      victim.stateTime += dt;
      victim.flash = Math.max(0, victim.flash - dt);
      this.physics(victim, dt);
      if (victim.state !== "knockdown") animateState(victim, c.time);
      else animateState(victim, c.time);
      updateProjectiles(c, this.fighters, dt);
      lockFacing(a, b);
      const ko = this.fighters.find((fighter) => fighter.hp <= 0);
      if (ko) this.endRound(this.fighters.find((fighter) => fighter !== ko)!);
    } else {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      lockFacing(a, b);
      this.updateFighter(a, b, dt);
      this.updateFighter(b, a, dt);
      this.separate(a, b);
      this.processSpecials();
      updateProjectiles(c, this.fighters, dt);
      // Final facing lock after both fighters moved — crossing never leaves them back to back.
      lockFacing(a, b);
      const ko = this.fighters.find((f) => f.hp <= 0);
      if (ko) this.endRound(this.fighters.find((f) => f !== ko)!);
      else if (this.timeLeft <= 0) this.endRound(a.hp === b.hp ? null : a.hp > b.hp ? a : b);
    }
    updateCamera(c.camera, dt);
    updateEffects(c.fx, dt);
    this.maybeCompleteActiveBatch();
  }

  private maybeCompleteActiveBatch() {
    if (!this.activeBatchId || this.specials.length || this.ctxCombat.projectiles.length || this.domain || this.cinematic) return;
    const giftMoveActive = this.fighters.some((fighter) => fighter.move === "hadouken" || fighter.move === "shoryuken" || fighter.move === "ultra_hadouken" || fighter.special);
    if (!giftMoveActive) this.completeActiveBatch();
  }

  private completeActiveBatch() {
    if (!this.activeBatchId) return;
    const eventId = this.activeBatchId;
    this.activeBatchId = null;
    this.callbacks.onSpecialComplete(eventId);
  }
}
