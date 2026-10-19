/**
 * Move progression + contact simulation + hit reactions.
 * Damage values are requested from damage.ts; this module never writes HP itself.
 */
import type { CombatSettings } from "@/lib/live";
import { GROUND_Y } from "./assets";
import { shake, type Camera } from "./camera";
import { applyDamage } from "./damage";
import { burst, flash, ring, type Effects } from "./effects";
import { AIRKICK_AIR, MOVES } from "./moves";
import type { BasicMove, CombatStats, Fighter, FighterState, HitOutcome } from "./types";

export interface CombatContext {
  settings: CombatSettings;
  fx: Effects;
  camera: Camera;
  stats: CombatStats;
  time: number;
  sound: (power: number) => void;
}

let attackCounter = 0;

export function createFighter(id: Fighter["id"], x: number, hp: number, facing: 1 | -1 = 1): Fighter {
  return {
    id, x, y: 0, vx: 0, vy: 0, facing, hp, state: "idle", stateTime: 0, stateDuration: 0, move: null, moveTime: 0, impactsDone: 0, attackId: 0, combo: [],
    pose: "idle", ox: 0, oy: 0, rot: 0, squash: 1, flash: 0, stunBuild: 0, stunImmune: 0, invuln: 0, grabPartner: null,
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

export function startMove(f: Fighter, move: BasicMove, ctx: CombatContext) {
  setState(f, "attack");
  f.move = move;
  f.moveTime = 0;
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
export function reactToContact(attacker: Fighter, target: Fighter, outcome: HitOutcome, power: number, stunValue: number, ctx: CombatContext, colors: string[], hitHeight = 150) {
  const hx = target.x - attacker.facing * 20;
  const hy = GROUND_Y - hitHeight;
  ctx.sound(outcome === "hit" ? power : 0.3);
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
  ctx.stats.knockdowns += 1;
  shake(ctx.camera, 9);
}

const HIT_HEIGHT: Record<BasicMove, number> = { jab: 165, hook: 160, uppercut: 190, kick: 185, sweep: 30, airkick: 175, grab: 150 };
const POWER: Record<BasicMove, number> = { jab: 0.6, hook: 1, uppercut: 1.1, kick: 1, sweep: 0.8, airkick: 1, grab: 0.5 };

/** Advances a basic move; simulates contact at impact frames; chains combos. */
export function updateMove(f: Fighter, other: Fighter, ctx: CombatContext, dt: number) {
  if (f.state !== "attack" || !f.move) return;
  const def = MOVES[f.move];
  const step = dt * ctx.settings.animation_speed;
  f.moveTime += step;
  const t = f.moveTime;

  // Footwork per move (small step-ins as in the reference sheet).
  if ((f.move === "jab" || f.move === "hook") && t > 0.08 && t < 0.22) f.x += f.facing * 55 * dt;
  if (f.move === "kick" && t > 0.1 && t < 0.24) f.x += f.facing * 30 * dt;
  if (f.move === "sweep" && t > 0.1 && t < 0.26) f.x += f.facing * 45 * dt;
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
      const outcome = contactOutcome(other, def.blockable);
      f.ai.lastOutcome = outcome;
      const antiAir = f.move === "uppercut" && isAirborne(other);
      if (outcome === "hit" && (def.knockdown || antiAir)) {
        // Sweep trips the target; an uppercut catches a jump-in out of the air.
        ctx.sound(1);
        burst(ctx.fx, other.x - f.facing * 20, GROUND_Y - HIT_HEIGHT[f.move], ["#ff006e", "#ffffff", "#ffe600"], 14, 300);
        ring(ctx.fx, other.x - f.facing * 20, GROUND_Y - HIT_HEIGHT[f.move], "#ff006e", 1.1);
        if (other.move === "airkick") { other.move = null; other.y = Math.min(other.y, other.oy); }
        knockDown(f, other, ctx, antiAir ? 260 : 120, antiAir ? -520 : -210);
      } else {
        reactToContact(f, other, outcome, POWER[f.move], def.stun, ctx, ["#ff006e", "#ffffff", "#ffe600"], HIT_HEIGHT[f.move]);
      }
      applyDamage(ctx.settings, { target: other, amount: damageFor(f.move, ctx.settings), source: "auto", outcome });
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
        applyDamage(ctx.settings, { target: victim, amount: ctx.settings.common_damage, source: "auto", outcome: "hit" });
      }
    });
    if (t >= 1.12) {
      f.grabPartner = null;
      knockDown(f, victim, ctx, 360, -470, 1.45);
      ctx.stats.throws += 1;
      burst(ctx.fx, victim.x, GROUND_Y - 60, ["#ffffff", "#ff006e"], 14, 240);
      applyDamage(ctx.settings, { target: victim, amount: ctx.settings.combo_damage, source: "auto", outcome: "hit" });
    }
  }

  if (t >= def.duration) {
    const next = f.combo.shift();
    if (next && f.ai.lastOutcome !== "block" && Math.abs(other.x - f.x) < 170 && other.state !== "knockdown") {
      startMove(f, next, ctx);
      return;
    }
    f.combo = [];
    f.vx = 0;
    setState(f, "idle");
    f.ai.cooldown = Math.max(f.ai.cooldown, (f.ai.lastOutcome === "block" ? 0.45 : 0.18) + ctx.settings.recovery_ms / 2000);
  }
}
