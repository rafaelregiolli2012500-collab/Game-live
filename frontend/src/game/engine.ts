/**
 * ArenaEngine — single requestAnimationFrame loop orchestrating:
 * AI (ai.ts) → move/contact (combat.ts) → damage (damage.ts) → camera → effects → render.
 * Gifts: triggerSpecial() applies boosts at once and queues hadoukens / domain expansions for the benefited fighter.
 */
import { BOOST_DURATION_SEC, BOOST_STEP, DAMAGE_BOOST_MAX, DEFENSE_BOOST_MAX, type CombatSettings, type GiftEvent } from "@/lib/live";
import { updateAi } from "./ai";
import { CHARACTERS, DOMAINS, loadImages } from "./assets";
import { createCamera, resetCamera, updateCamera } from "./camera";
import { createFighter, isAirborne, isFree, setState, startMove, updateMove, updateProjectiles, type CombatContext } from "./combat";
import { adminAdjust } from "./damage";
import { endDomain, startDomain, updateDomain, type Domain } from "./domain";
import { burst, createEffects, updateEffects } from "./effects";
import { animateMove, animateState } from "./moves";
import { render, type RenderState } from "./renderer";
import type { CharacterId, CombatStats, EngineCallbacks, Fighter, FighterState, HudSnapshot } from "./types";

const GRAVITY = 1500;
const ROUND_BREAK_SEC = 7;

export const emptyStats = (): CombatStats => ({ jab: 0, hook: 0, uppercut: 0, kick: 0, sweep: 0, airkick: 0, grab: 0, hadouken: 0, domains: 0, throws: 0, combos: 0, stuns: 0, knockdowns: 0, blocks: 0, dodges: 0, counters: 0 });

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
  private specials: { id: CharacterId; kind: "hadouken" | "domain"; damage: number; username: string }[] = [];
  private domain: Domain | null = null;

  private settings: CombatSettings;
  private left: CharacterId;
  private right: CharacterId;
  private callbacks: EngineCallbacks;

  private volume = 0.6;
  private audio: AudioContext | null = null;

  constructor(canvas: HTMLCanvasElement, settings: CombatSettings, left: CharacterId, right: CharacterId, callbacks: EngineCallbacks) {
    this.settings = settings;
    this.left = left;
    this.right = right;
    this.callbacks = callbacks;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.ctxCombat = { settings, fx: createEffects(), camera: createCamera(), stats: emptyStats(), time: 0, sound: (power) => this.playHit(power), projectiles: [] };
    this.resetRound();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() { cancelAnimationFrame(this.raf); void this.audio?.close(); }
  setVolume(volume: number) { this.volume = volume; }
  setPaused(paused: boolean) { this.paused = paused; }

  private playHit(power: number) {
    if (this.volume <= 0) return;
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
  triggerSpecial(event: GiftEvent) {
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
      this.playHit(0.8);
      return;
    }
    if (event.special_move !== "hadouken" && event.special_move !== "domain") return;
    const kind = event.special_move;
    const units = kind === "domain" ? 1 : event.repeat_policy === "group" ? 1 : Math.min(10, event.quantity);
    const damage = kind === "domain" || event.repeat_policy === "group" ? event.damage * event.quantity : event.damage;
    for (let i = 0; i < units; i += 1) this.specials.push({ id, kind, damage, username: event.username });
  }

  private processSpecials() {
    if (this.roundOverAt !== null || this.domain) return;
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
          this.domain = startDomain(f, victim, next.damage);
          this.ctxCombat.stats.domains += 1;
          this.banner = { text: DOMAINS[f.id].title, sub: DOMAINS[f.id].name, until: this.ctxCombat.time + 1.5 };
          return;
        }
        this.specials.splice(index, 1);
        f.special = { damage: next.damage, username: next.username };
      }
      // Fire (or re-fire if a previous attempt was interrupted before the release).
      f.combo = [];
      startMove(f, "hadouken", this.ctxCombat);
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
      if (f.y >= 0) { f.vy = 0; f.y = 0; }
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
    render(this.ctx, this.images, { domain: this.domain, fighters: this.fighters, camera: this.ctxCombat.camera, fx: this.ctxCombat.fx, projectiles: this.ctxCombat.projectiles, timeLeft: this.timeLeft, round: this.round, time: this.ctxCombat.time, banner: this.banner });
    if (now - this.hudAt > 100) {
      this.hudAt = now;
      const [a, b] = this.fighters;
      const states = { [a.id]: a.state, [b.id]: b.state } as Record<CharacterId, FighterState>;
      this.callbacks.onHud({
        hp: { [a.id]: a.hp, [b.id]: b.hp } as Record<CharacterId, number>,
        timeLeft: this.timeLeft, round: this.round, stats: { ...this.ctxCombat.stats }, states,
        specials: this.specials.length + this.ctxCombat.projectiles.length + this.fighters.filter((f) => f.special || f.move === "hadouken").length + (this.domain ? 1 : 0),
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
    if (this.domain && this.roundOverAt === null) {
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
      lockFacing(a, b);
      if (c.time - this.roundOverAt >= ROUND_BREAK_SEC) { this.round += 1; this.resetRound(); }
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
  }
}
