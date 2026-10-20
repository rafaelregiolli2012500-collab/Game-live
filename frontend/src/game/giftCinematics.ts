/** Scripted, gift-only cinematics that own both fighters while active. */
import { GROUND_Y, SPECIAL_COLORS } from "./assets";
import { focus, resetCamera, shake } from "./camera";
import { knockDown, setState, type CombatContext } from "./combat";
import { applyDamage } from "./damage";
import { burst, flash, ring } from "./effects";
import type { Fighter } from "./types";

export type GiftCinematicKind = "invocadores" | "genkidama";

export interface GiftCinematic {
  kind: GiftCinematicKind;
  attacker: Fighter;
  victim: Fighter;
  t: number;
  damage: number;
  dealt: number;
  speed: number;
  hitsDone: number;
  lastHit: number;
  voicePlayed: boolean;
  chargePlayed: boolean;
  impactDone: boolean;
}

const INVOCADORES_DURATION = 3.8;
const GENKIDAMA_DURATION = 5.2;
const INVOCADORES_HITS = [1.34, 1.72, 2.1, 2.56];
const INVOCADORES_WEIGHTS = [0.16, 0.18, 0.22, 0.44];
export const GENKIDAMA_IMPACT = 4.12;

export function startGiftCinematic(kind: GiftCinematicKind, attacker: Fighter, victim: Fighter, damage: number, speed: number): GiftCinematic {
  [attacker, victim].forEach((fighter) => {
    fighter.combo = [];
    fighter.grabPartner = null;
    fighter.vx = 0;
    fighter.vy = 0;
    fighter.y = 0;
    fighter.special = null;
  });
  attacker.moveSpeed = speed;
  victim.moveSpeed = speed;
  setState(attacker, "special");
  setState(victim, "frozen");
  attacker.facing = victim.x >= attacker.x ? 1 : -1;
  victim.facing = attacker.facing === 1 ? -1 : 1;
  return { kind, attacker, victim, t: 0, damage, dealt: 0, speed, hitsDone: 0, lastHit: -10, voicePlayed: false, chargePlayed: false, impactDone: false };
}

const crossed = (previous: number, current: number, point: number) => previous < point && current >= point;

function updateInvocadores(cinematic: GiftCinematic, ctx: CombatContext, previous: number, dt: number) {
  const { attacker, victim, t } = cinematic;
  focus(ctx.camera, (attacker.x + victim.x) / 2, GROUND_Y - 135, t < 0.72 ? 1.35 : 1.14, 6);
  attacker.pose = t < 0.28 ? "crouch" : t < 0.58 ? "punch" : t < 3.2 ? "mudra" : "idle";
  attacker.oy = 0;
  attacker.ox = t < 0.58 ? 12 * Math.sin(Math.min(1, t / 0.58) * Math.PI) : 0;
  if (crossed(previous, t, 0.05)) {
    cinematic.voicePlayed = true;
    ctx.sound(1.8, attacker.id, "special-start", cinematic.speed);
  }
  if (crossed(previous, t, 0.46)) {
    ring(ctx.fx, attacker.x + attacker.facing * 28, GROUND_Y - 8, "#f59e0b", 2.2);
    burst(ctx.fx, attacker.x + attacker.facing * 28, GROUND_Y - 8, ["#fbbf24", "#a16207", "#e7e5e4"], 34, 360, 700);
    if (ctx.fx.enabled) shake(ctx.camera, 10);
  }
  if (victim.state !== "knockdown") {
    victim.pose = t - cinematic.lastHit < 0.14 ? "hurt" : "stun";
    victim.ox = t - cinematic.lastHit < 0.14 ? -10 : 0;
  }
  while (cinematic.hitsDone < INVOCADORES_HITS.length && t >= INVOCADORES_HITS[cinematic.hitsDone]) {
    const index = cinematic.hitsDone;
    const finalHit = index === INVOCADORES_HITS.length - 1;
    const amount = finalHit ? Math.max(0, cinematic.damage - cinematic.dealt) : Math.max(1, Math.round(cinematic.damage * INVOCADORES_WEIGHTS[index]));
    cinematic.hitsDone += 1;
    cinematic.dealt += amount;
    cinematic.lastHit = t;
    victim.invuln = 0;
    applyDamage(ctx.settings, { attacker, target: victim, amount, source: "gift", outcome: "hit" });
    burst(ctx.fx, victim.x - attacker.facing * 20, GROUND_Y - (finalHit ? 35 : 145), ["#f97316", "#fbbf24", "#ffffff", "#57534e"], finalHit ? 56 : 24, finalHit ? 580 : 360, 650);
    ring(ctx.fx, victim.x, GROUND_Y - (finalHit ? 28 : 145), finalHit ? "#f97316" : "#fbbf24", finalHit ? 3 : 1.4);
    ctx.sound(finalHit ? 2.5 : 1.6, attacker.id, "special-impact", cinematic.speed);
    if (ctx.fx.enabled) shake(ctx.camera, finalHit ? 18 : 8);
    if (finalHit && victim.hp > 0) knockDown(attacker, victim, ctx, 430, -500, 1.7);
  }
  if (t > 3.25) resetCamera(ctx.camera, 5);
  void dt;
}

function updateGenkidama(cinematic: GiftCinematic, ctx: CombatContext, previous: number, dt: number) {
  const { attacker, victim, t } = cinematic;
  const lift = Math.max(0, Math.min(1, (t - 1.3) / 1.1)) * (1 - Math.max(0, Math.min(1, (t - 4.35) / 0.65)));
  attacker.pose = t < 0.45 ? "crouch" : t < 3.48 ? "charge" : t < 4.28 ? "fireball" : "victory";
  attacker.oy = -118 * lift;
  attacker.ox = 0;
  victim.pose = cinematic.impactDone ? "hurt" : "stun";
  if (t < 3.55) focus(ctx.camera, attacker.x, GROUND_Y - 205 + attacker.oy * 0.3, 1.4, 4.5);
  else if (t < 4.5) focus(ctx.camera, victim.x, GROUND_Y - 170, 1.22, 7);
  else resetCamera(ctx.camera, 4);
  if (crossed(previous, t, 0.05)) {
    cinematic.voicePlayed = true;
    ctx.sound(2.1, attacker.id, "special-start", cinematic.speed);
  }
  if (crossed(previous, t, 0.16)) {
    cinematic.chargePlayed = true;
    ctx.sound(2.4, attacker.id, "genkidama-charge", cinematic.speed);
  }
  if (t > 0.25 && t < GENKIDAMA_IMPACT && Math.random() < dt * 38) {
    const colors = ["#ffffff", "#67e8f9", "#38bdf8", "#1d4ed8"];
    burst(ctx.fx, attacker.x + (Math.random() - 0.5) * 430, GROUND_Y - 120 - Math.random() * 330, colors, 1, 120, -100);
  }
  if (!cinematic.impactDone && crossed(previous, t, GENKIDAMA_IMPACT)) {
    cinematic.impactDone = true;
    cinematic.dealt = cinematic.damage;
    victim.invuln = 0;
    ctx.sound(3, attacker.id, "genkidama-impact", cinematic.speed);
    applyDamage(ctx.settings, { attacker, target: victim, amount: cinematic.damage, source: "gift", outcome: "hit" });
    burst(ctx.fx, victim.x, GROUND_Y - 35, ["#ffffff", "#67e8f9", "#38bdf8", "#1e3a8a", "#57534e"], 110, 760, 820);
    ring(ctx.fx, victim.x, GROUND_Y - 24, "#ffffff", 5.2);
    ring(ctx.fx, victim.x, GROUND_Y - 24, "#38bdf8", 3.8);
    flash(ctx.fx, 1.25, "#bff6ff");
    if (ctx.fx.enabled) shake(ctx.camera, 30);
    if (victim.hp > 0) knockDown(attacker, victim, ctx, 520, -650, 2.1);
  }
}

/** Advances the cinematic. Returns true when the entire effect is finished. */
export function updateGiftCinematic(cinematic: GiftCinematic, ctx: CombatContext, dt: number): boolean {
  const previous = cinematic.t;
  cinematic.t += dt * cinematic.speed;
  const { attacker, victim } = cinematic;
  attacker.facing = victim.x >= attacker.x ? 1 : -1;
  victim.facing = attacker.facing === 1 ? -1 : 1;
  attacker.rot = 0;
  attacker.squash = 1;
  victim.rot = 0;
  victim.squash = 1;
  if (cinematic.kind === "invocadores") updateInvocadores(cinematic, ctx, previous, dt);
  else updateGenkidama(cinematic, ctx, previous, dt);
  return cinematic.t >= (cinematic.kind === "invocadores" ? INVOCADORES_DURATION : GENKIDAMA_DURATION);
}

export function endGiftCinematic(cinematic: GiftCinematic, ctx: CombatContext) {
  const { attacker, victim } = cinematic;
  attacker.oy = 0;
  attacker.ox = 0;
  setState(attacker, "idle");
  attacker.invuln = 0.45;
  attacker.ai.cooldown = 0.7;
  if (victim.state === "frozen") setState(victim, "idle");
  victim.frozen = 0;
  resetCamera(ctx.camera, 5);
}