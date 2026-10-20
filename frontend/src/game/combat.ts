/**
 * Move progression + contact simulation + hit reactions.
 * Damage values are requested from damage.ts; this module never writes HP itself.
 */
import type { CombatSettings } from "@/lib/live";
import { GROUND_Y, SHORYUKEN_COLORS, SPECIAL_COLORS, ULTRA_COLORS } from "./assets";
import { focus, resetCamera, shake, type Camera } from "./camera";
import { applyDamage } from "./damage";
import { burst, flash, ring, type Effects } from "./effects";
import { AIRKICK_AIR, HADOUKEN_RELEASE, MOVES, ULTRA_RELEASE } from "./moves";

const SPECIAL_SPARKS = { lula: SPECIAL_COLORS.lula.sparks, flavio: SPECIAL_COLORS.flavio.sparks };
import type { BasicMove, CombatStats, Fighter, FighterState, HitOutcome } from "./types";

export interface Projectile {
  owner: Fighter;
  x: number;
  y: number;
  vx: number;
  age: number;
  damage: number;
  kind: "hadouken" | "ultra_hadouken" | "fatality";
  speed: number;
  hit: boolean;
}

export type SoundCue = "basic-punch" | "basic-kick" | "special-start" | "special-impact" | "hadouken-start" | "ultra-charge" | "ultra-wave" | "genkidama-charge" | "genkidama-impact" | "knockdown" | "gift-alert" | "victory";

export interface CombatContext {
  settings: CombatSettings;
  fx: Effects;
  camera: Camera;
  stats: CombatStats;
  time: number;
  sound: (power: number, fighter?: Fighter["id"], cue?: SoundCue, speed?: number) => void;
  onFatalityHit: (winner: Fighter["id"]) => void;
  projectiles: Projectile[];
}

let attackCounter = 0;

export function createFighter(id: Fighter["id"], x: number, hp: number, facing: 1 | -1 = 1): Fighter {
  return {
    id, x, y: 0, vx: 0, vy: 0, facing, hp, state: "idle", stateTime: 0, stateDuration: 0, move: null, moveTime: 0, moveSpeed: 1, impactsDone: 0, attackId: 0, combo: [],
    pose: "idle", ox: 0, oy: 0, rot: 0, squash: 1, flash: 0, stunBuild: 0, stunImmune: 0, invuln: 0, grabPartner: null, special: null, dmgBoost: { pct: 0, left: 0 }, defBoost: { pct: 0, left: 0 }, frozen: 0, fallSoundPending: false,
    ai: { cooldown: 0.6 + Math.random() * 0.6, stance: "aggressive", stanceTimer: 2, reactedTo: 0, counterWindow: 0, lastGrab: -10, recentHits: 0, seenMoves: [], moveDir: 0, moveTimer: 0, lastOutcome: null },
  };
}

export function setState(f: Fighter, state: FighterState, duration = 0) {
  f.state = state;
  f.stateTime = 0;
  f.stateDuration = duration;
  if (state !== "attack") f.move = null;
}

export const isFree = (f: Fighter) => f.state === "idle" || f.state === "walk";
export const isAirborne = (f: Fighter) => (f.move === "airkick" && f.moveTime > AIRKICK_AIR[0] && f.moveTime < AIRKICK_AIR[1]) || f.y < -2;
export const canBeGrabbed = (f: Fighter) => ["idle", "walk", "block", "attack", "hit"].includes(f.state) && !isAirborne(f) && f.invuln <= 0;

export function startMove(f: Fighter, move: BasicMove, ctx: CombatContext, speed = 1) {
  setState(f, "attack");
  f.move = move;
  f.moveTime = 0;
  f.moveSpeed = speed;
  f.impactsDone = 0;
  f.attackId = ++attackCounter;
  ctx.stats[move] += 1;
  if (move === "grab") f.ai.lastGrab = ctx.time;
}

function contactOutcome(target: Fighter, blockable: boolean): HitOutcome {
  if (target.state === "dodge" || target.invuln > 0) return "dodge";
  if (blockable && target.state === "block") return "block";
  return "hit";
}

function damageFor(move: BasicMove, s: CombatSettings) {
  return MOVES[move].damageKey === "combo" ? s.combo_damage : s.common_damage;
}

/** Visual + physical reaction to a contact. */
export function reactToContact(attacker: Fighter, target: Fighter, outcome: HitOutcome, power: number, stunValue: number, ctx: CombatContext, colors: string[], hitHeight = 150, cue: SoundCue = "basic-punch", speed = 1) {
  const hx = target.x - attacker.facing * 20;
  const hy = GROUND_Y - hitHeight;
  ctx.sound(outcome === "hit" ? power : 0.3, attacker.id, cue, speed);
  if (outcome === "dodge") {
    ctx.stats.dodges += 1;
    ring(ctx.fx, hx, hy, "#00f0ff", 0.6);
    return;
  }
  if (outcome === "block") {
    ctx.stats.blocks += 1;
    target.vx = attacker.facing * 110 * power;
    target.ai.counterWindow = 0.45;
    target.flash = 0.08;
    ring(ctx.fx, hx, hy, "#ffe600", 0.8);
    burst(ctx.fx, hx, hy, ["#ffe600", "#ffffff"], 8, 220);
    shake(ctx.camera, 4 * power);
    return;
  }
  target.combo = [];
  target.flash = 0.14;
  target.vx = attacker.facing * (150 + 110 * power);
  target.ai.recentHits += 1;
  ring(ctx.fx, hx, hy, colors[0], 0.8 + power * 0.4);
  burst(ctx.fx, hx, hy, colors, 10 + Math.round(power * 10), 260 + power * 120);
  shake(ctx.camera, 5 + power * 6);
  if (power > 1.2) flash(ctx.fx, 0.25 * power);
  const wasStunned = target.state === "stun";
  target.stunBuild += stunValue;
  if (!wasStunned && target.stunBuild >= 1 && target.stunImmune <= 0 && target.state !== "knockdown") {
    const duration = ctx.settings.stun_ms / 1000;
    setState(target, "stun", duration);
    target.stunImmune = duration + 3;
    target.stunBuild = 0;
    ctx.stats.stuns += 1;
  } else if (target.state !== "knockdown") {
    // A hit while stunned ends the stun (no infinite stun-lock).
    setState(target, "hit", power > 1 ? 0.4 : 0.28);
  }
}

/** Sends a fighter to the floor (lying → get-up handled by the engine + animateState). */
export function knockDown(attacker: Fighter, target: Fighter, ctx: CombatContext, vx: number, vy: number, duration = 1.35) {
  target.combo = [];
  target.grabPartner = null;
  setState(target, "knockdown", duration);
  target.vx = attacker.facing * vx;
  target.vy = vy;
  target.moveSpeed = attacker.moveSpeed;
  target.fallSoundPending = true;
  ctx.stats.knockdowns += 1;
  shake(ctx.camera, 9);
}

const HIT_HEIGHT: Record<BasicMove, number> = { jab: 165, hook: 160, uppercut: 190, kick: 185, sweep: 30, airkick: 175, grab: 150, hadouken: 140, shoryuken: 205, ultra_hadouken: 140 };
const POWER: Record<BasicMove, number> = { jab: 0.6, hook: 1, uppercut: 1.1, kick: 1, sweep: 0.8, airkick: 1, grab: 0.5, hadouken: 1.6, shoryuken: 2.2, ultra_hadouken: 2.6 };

/** Hand offsets (canvas px from body centre / feet) where the energy ball is released. */
export const FIREBALL_HAND = { dx: 104, dy: -140 };

/** Moves energy balls; a ball always connects with its target (gift damage is guaranteed). */
export function updateProjectiles(ctx: CombatContext, fighters: Fighter[], dt: number) {
  ctx.projectiles = ctx.projectiles.filter((p) => {
    const step = dt * p.speed;
    p.age += step;
    p.x += p.vx * step;
    const insideArena = p.x > -360 && p.x < 1320;
    if (p.hit) return insideArena;
    const target = fighters.find((f) => f !== p.owner);
    if (!target) return false;
    const isUltra = p.kind !== "hadouken";
    const radius = p.kind === "fatality" ? 112 : isUltra ? 72 : 30;
    const colors = isUltra ? ULTRA_COLORS[p.owner.id].sparks : SPECIAL_SPARKS[p.owner.id];
    if (Math.random() < (isUltra ? 0.95 : 0.7)) burst(ctx.fx, p.x - Math.sign(p.vx) * radius, p.y + (Math.random() - 0.5) * radius, colors, isUltra ? 3 : 1, isUltra ? 150 : 70, 0);
    if (Math.abs(target.x - p.x) < radius + 28 || Math.sign(target.x - p.x) !== Math.sign(p.vx)) {
      target.invuln = 0;
      if (target.state === "grabbed" && target.grabPartner) { target.grabPartner.grabPartner = null; target.grabPartner = null; }
      if (target.state === "knockdown") { target.flash = 0.2; ctx.sound(isUltra ? 2.6 : 1.6, p.owner.id, "special-impact", p.speed); }
      else reactToContact(p.owner, target, "hit", isUltra ? 2.6 : 1.6, 0.5, ctx, colors, GROUND_Y - p.y, "special-impact", p.speed);
      burst(ctx.fx, p.x, p.y, colors, isUltra ? 64 : 26, isUltra ? 620 : 380);
      ring(ctx.fx, p.x, p.y, colors[0], isUltra ? 2.8 : 1.6);
      flash(ctx.fx, isUltra ? 0.9 : 0.35, colors[0]);
      applyDamage(ctx.settings, { attacker: p.owner, target, amount: p.damage, source: p.kind === "fatality" ? "fatality" : "gift", outcome: "hit" });
      if (isUltra) knockDown(p.owner, target, ctx, 430, -540, 1.8);
      if (p.kind === "fatality") ctx.onFatalityHit(p.owner.id);
      p.hit = true;
      return isUltra && insideArena;
    }
    return insideArena;
  });
}

/** Advances a basic move; simulates contact at impact frames; chains combos. */
export function updateMove(f: Fighter, other: Fighter, ctx: CombatContext, dt: number) {
  if (f.state !== "attack" || !f.move) return;
  const def = MOVES[f.move];
  // Gift specials retain their authored cinematic timing; only ordinary combat follows the speed control.
  const scriptedGiftMove = f.move === "hadouken" || f.move === "shoryuken" || f.move === "ultra_hadouken";
  const step = dt * (scriptedGiftMove ? f.moveSpeed : ctx.settings.animation_speed);
  f.moveTime += step;
  const t = f.moveTime;

  // Footwork per move (small step-ins as in the reference sheet).
  if ((f.move === "jab" || f.move === "hook") && t > 0.08 && t < 0.22) f.x += f.facing * 55 * dt;
  if (f.move === "kick" && t > 0.1 && t < 0.24) f.x += f.facing * 30 * dt;
  if (f.move === "sweep" && t > 0.1 && t < 0.26) f.x += f.facing * 45 * dt;
  const projectileMove = f.move === "hadouken" || f.move === "ultra_hadouken";
  const releaseAt = f.move === "ultra_hadouken" ? ULTRA_RELEASE : HADOUKEN_RELEASE;
  // While charging, open space so every energy ball is seen crossing the arena.
  if (projectileMove && t < releaseAt) {
    const need = (f.move === "ultra_hadouken" ? 500 : 260) - Math.abs(other.x - f.x);
    if (need > 0) {
      const move = Math.min(need, 900 * dt * f.moveSpeed);
      const nx = Math.max(70, Math.min(890, f.x - f.facing * move));
      const rest = move - Math.abs(nx - f.x);
      f.x = nx;
      if (rest > 0 && other.state !== "grabbed") other.x = Math.max(70, Math.min(890, other.x + f.facing * rest));
    }
    if (f.move === "ultra_hadouken") focus(ctx.camera, f.x, GROUND_Y - 145, 1.45, 4.5);
  }
  if (projectileMove && f.special && t >= releaseAt && t - step < releaseAt) {
    const kind = f.special.kind === "fatality" ? "fatality" : f.move === "ultra_hadouken" ? "ultra_hadouken" : "hadouken";
    ctx.projectiles.push({ owner: f, x: f.x + f.facing * FIREBALL_HAND.dx, y: GROUND_Y + FIREBALL_HAND.dy, vx: f.facing * (kind === "hadouken" ? 520 : 760), age: 0, damage: f.special.damage, kind, speed: f.special.speed, hit: false });
    f.special = null;
    ctx.sound(kind === "hadouken" ? 1.4 : 2.6, f.id, kind === "hadouken" ? "hadouken-start" : "ultra-wave", f.moveSpeed);
    shake(ctx.camera, kind === "hadouken" ? 4 : 12);
    if (kind !== "hadouken") resetCamera(ctx.camera, 6);
  }
  if (f.move === "airkick") f.vx = t > AIRKICK_AIR[0] && t < AIRKICK_AIR[1] - 0.12 ? f.facing * 290 : 0;

  if (f.impactsDone < def.impacts.length && t >= def.impacts[f.impactsDone]) {
    f.impactsDone += 1;
    const distance = Math.abs(other.x - f.x);
    const reachesAir = f.move === "airkick" || f.move === "uppercut";
    if (f.move === "grab") {
      if (distance <= def.maxRange && canBeGrabbed(other) && Math.random() > ctx.settings.ai_skill * 0.18) {
        f.grabPartner = other;
        other.grabPartner = f;
        other.combo = [];
        setState(other, "grabbed");
      } else {
        f.combo = [];
        f.moveTime = Math.max(f.moveTime, def.duration - 0.35);
      }
    } else if (distance <= def.maxRange && other.state !== "knockdown" && !(isAirborne(other) && !reachesAir)) {
      const giftShoryuken = f.move === "shoryuken" && f.special?.kind === "shoryuken" ? f.special : null;
      if (giftShoryuken) other.invuln = 0;
      const outcome = giftShoryuken ? "hit" : contactOutcome(other, def.blockable);
      f.ai.lastOutcome = outcome;
      const antiAir = f.move === "uppercut" && isAirborne(other);
      if (outcome === "hit" && (def.knockdown || antiAir)) {
        // Sweep trips the target; an uppercut catches a jump-in out of the air.
        const hitColors = giftShoryuken ? SHORYUKEN_COLORS[f.id].sparks : ["#ff006e", "#ffffff", "#ffe600"];
        const basicCue: SoundCue = f.move === "kick" || f.move === "sweep" || f.move === "airkick" ? "basic-kick" : "basic-punch";
        ctx.sound(giftShoryuken ? 2.2 : 1, f.id, giftShoryuken ? "special-impact" : basicCue, giftShoryuken?.speed ?? 1);
        burst(ctx.fx, other.x - f.facing * 20, GROUND_Y - HIT_HEIGHT[f.move], hitColors, giftShoryuken ? 36 : 14, giftShoryuken ? 520 : 300);
        ring(ctx.fx, other.x - f.facing * 20, GROUND_Y - HIT_HEIGHT[f.move], hitColors[0], giftShoryuken ? 2.1 : 1.1);
        if (other.move === "airkick") { other.move = null; other.y = Math.min(other.y, other.oy); }
        knockDown(f, other, ctx, giftShoryuken ? 360 : antiAir ? 260 : 120, giftShoryuken ? -660 : antiAir ? -520 : -210, giftShoryuken ? 1.7 : 1.35);
      } else {
        const basicCue: SoundCue = f.move === "kick" || f.move === "sweep" || f.move === "airkick" ? "basic-kick" : "basic-punch";
        reactToContact(f, other, outcome, POWER[f.move], def.stun, ctx, ["#ff006e", "#ffffff", "#ffe600"], HIT_HEIGHT[f.move], basicCue);
      }
      applyDamage(ctx.settings, { attacker: f, target: other, amount: giftShoryuken?.damage ?? damageFor(f.move, ctx.settings), source: giftShoryuken ? "gift" : "auto", outcome });
      if (giftShoryuken) f.special = null;
    } else {
      f.ai.lastOutcome = null;
    }
  }

  // Coordinated grab sequence: pull → body blows → throw.
  if (f.move === "grab" && f.grabPartner) {
    const victim = f.grabPartner;
    if (t < 0.45) victim.x += (f.x + f.facing * 82 - victim.x) * Math.min(1, dt * 12);
    [0.55, 0.75, 0.95].forEach((at) => {
      if (t >= at && t - step < at) {
        reactToContact(f, victim, "hit", 0.5, 0, ctx, ["#ff9d1e", "#ffffff"]);
        setState(victim, "grabbed");
        victim.vx = 0;
        applyDamage(ctx.settings, { attacker: f, target: victim, amount: ctx.settings.common_damage, source: "auto", outcome: "hit" });
      }
    });
    if (t >= 1.12) {
      f.grabPartner = null;
      knockDown(f, victim, ctx, 360, -470, 1.45);
      ctx.stats.throws += 1;
      burst(ctx.fx, victim.x, GROUND_Y - 60, ["#ffffff", "#ff006e"], 14, 240);
      applyDamage(ctx.settings, { attacker: f, target: victim, amount: ctx.settings.combo_damage, source: "auto", outcome: "hit" });
    }
  }

  if (t >= def.duration) {
    const next = f.combo.shift();
    if (next && f.ai.lastOutcome !== "block" && Math.abs(other.x - f.x) < 170 && other.state !== "knockdown") {
      startMove(f, next, ctx);
      return;
    }
    f.combo = [];
    f.special = null;
    f.vx = 0;
    setState(f, "idle");
    f.ai.cooldown = Math.max(f.ai.cooldown, (f.ai.lastOutcome === "block" ? 0.45 : 0.18) + ctx.settings.recovery_ms / 2000);
  }
}
