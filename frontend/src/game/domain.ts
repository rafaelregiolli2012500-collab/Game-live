/**
 * Domain Expansion (top gift): mudra hand-sign → domain expands → opponent frozen →
 * super combo of punches, kicks and a hadouken finisher → domain collapses, opponent knocked down.
 * Lula: "Arena Sangrenta" (red sphere). Flávio: "Floresta Tropical" (Brazilian flag).
 */
import { GROUND_Y, SPECIAL_COLORS } from "./assets";
import { focus, resetCamera, shake } from "./camera";
import { knockDown, setState, type CombatContext } from "./combat";
import { applyDamage } from "./damage";
import { burst, flash, ring } from "./effects";
import type { Fighter, Pose } from "./types";

export const DOMAIN_DURATION = 6.6;
const DASH_AT = 1.9;
const FINISH_RELEASE = 4.95;
const FINISH_IMPACT = 5.3;

interface Strike { at: number; pose: Pose; oy?: number; done: boolean }
const COMBO: Omit<Strike, "done">[] = [
  { at: 2.15, pose: "punch" }, { at: 2.4, pose: "hook" }, { at: 2.68, pose: "kick" }, { at: 2.95, pose: "punch" },
  { at: 3.22, pose: "uppercut" }, { at: 3.52, pose: "sweep" }, { at: 3.82, pose: "kick" }, { at: 4.08, pose: "hook" },
  { at: 4.36, pose: "airkick", oy: -70 },
];

export interface Domain {
  attacker: Fighter;
  victim: Fighter;
  t: number;
  damage: number;
  strikes: Strike[];
  lastStrike: number;
  finished: boolean;
  /** Finisher energy ball position (world x), null when not in flight. */
  ballX: number | null;
  homeX: number;
  speed: number;
}

const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export function startDomain(attacker: Fighter, victim: Fighter, damage: number, speed = 1): Domain {
  [attacker, victim].forEach((f) => { f.combo = []; f.grabPartner = null; f.vx = 0; f.vy = 0; f.y = 0; f.special = null; });
  attacker.moveSpeed = speed;
  victim.moveSpeed = speed;
  setState(attacker, "domain");
  setState(victim, "frozen");
  attacker.facing = victim.x >= attacker.x ? 1 : -1;
  victim.facing = (attacker.facing === 1 ? -1 : 1) as 1 | -1;
  return { attacker, victim, t: 0, damage, strikes: COMBO.map((s) => ({ ...s, done: false })), lastStrike: -10, finished: false, ballX: null, homeX: attacker.x, speed };
}

/** 0..1 visual size of the domain (expansion → hold → collapse). */
export const domainScale = (d: Domain) => seg(d.t, 0.55, 1.6) * (1 - seg(d.t, 5.6, 6.25));

/** Advances the domain. Returns true when it is over. */
export function updateDomain(d: Domain, ctx: CombatContext, dt: number): boolean {
  const step = dt * d.speed;
  d.t += step;
  const { attacker: a, victim: v, t } = d;
  const colors = SPECIAL_COLORS[a.id].sparks;
  a.facing = v.x >= a.x ? 1 : -1;
  v.facing = (a.facing === 1 ? -1 : 1) as 1 | -1;
  a.rot = 0; a.squash = 1; a.ox = 0; a.oy = 0;
  v.rot = 0; v.squash = 1; v.oy = 0;

  // Camera: close on the hand sign, then frame the combo.
  if (t < DASH_AT) focus(ctx.camera, a.x, GROUND_Y - 170, 1.3, 5);
  else if (t < 5.6) focus(ctx.camera, (a.x + v.x) / 2, GROUND_Y - 150, 1.15, 5);
  else resetCamera(ctx.camera, 4);

  // Victim: frozen in ice once the domain closes around them; flinches on each blow.
  v.frozen = seg(t, 1.45, 1.75) * (1 - seg(t, 5.9, 6.2));
  const flinch = t - d.lastStrike < 0.14;
  v.pose = flinch ? "hurt" : "stun";
  v.ox = flinch ? -6 : 0;

  // Attacker timeline.
  if (t < DASH_AT) {
    a.pose = t < 0.15 ? "idle" : "mudra";
    a.squash = 1 - 0.015 * Math.sin(t * 22);
    if (t > 0.3 && t < 1.5 && Math.random() < 0.8) burst(ctx.fx, a.x + (Math.random() - 0.5) * 140, GROUND_Y - Math.random() * 240, colors, 2, 90, -240);
    if (t > 1.5 && t - step <= 1.5) { flash(ctx.fx, 0.5, colors[0]); shake(ctx.camera, 8); ctx.sound(1.8, a.id, "special-start", d.speed); }
  } else if (t < 4.6) {
    // Dash next to the frozen opponent, then chain the super combo.
    const target = v.x - a.facing * 96;
    a.x += (target - a.x) * Math.min(1, dt * 14);
    a.pose = t < DASH_AT + 0.2 ? "walk" : "idle";
    const per = Math.round((d.damage * 0.07) * 100) / 100;
    for (const s of d.strikes) {
      if (t >= s.at && t < s.at + 0.2) { a.pose = s.pose; a.ox = 12; a.oy = s.oy ?? 0; }
      if (s.done || t < s.at + 0.06) continue;
      s.done = true;
      d.lastStrike = t;
      const hy = GROUND_Y - (s.pose === "sweep" ? 40 : s.pose === "uppercut" ? 190 : 160);
      burst(ctx.fx, v.x - a.facing * 20, hy, colors, 14, 300);
      ring(ctx.fx, v.x - a.facing * 20, hy, colors[0], 1);
      shake(ctx.camera, 6);
      ctx.sound(1.1, a.id, "special-impact", d.speed);
      v.flash = 0.12;
      applyDamage(ctx.settings, { attacker: a, target: v, amount: per, source: "gift", outcome: "hit" });
    }
  } else if (t < FINISH_RELEASE) {
    // Hop back and charge the finisher.
    const back = d.homeX;
    const target = Math.abs(v.x - back) > 200 ? back : v.x - a.facing * 240;
    a.x += (Math.max(70, Math.min(890, target)) - a.x) * Math.min(1, dt * 10);
    a.pose = t < 4.72 ? "jump" : "charge";
    a.oy = t < 4.72 ? -30 * Math.sin(Math.PI * seg(t, 4.6, 4.72)) : 0;
  } else if (t < 5.7) {
    a.pose = t < 5.55 ? "fireball" : "idle";
    a.ox = t < 5.55 ? 10 : 0;
    if (d.ballX === null && !d.finished) { d.ballX = a.x + a.facing * 104; }
    if (d.ballX !== null) {
      d.ballX += a.facing * 900 * step;
      if (Math.random() < 0.9) burst(ctx.fx, d.ballX - a.facing * 30, GROUND_Y - 140, colors, 2, 80, 0);
      if (t >= FINISH_IMPACT || Math.sign(v.x - d.ballX) !== a.facing) {
        d.ballX = null;
        d.finished = true;
        d.lastStrike = t;
        const dealt = d.damage - Math.round(d.damage * 0.07 * d.strikes.length);
        applyDamage(ctx.settings, { attacker: a, target: v, amount: Math.max(1, dealt), source: "gift", outcome: "hit" });
        burst(ctx.fx, v.x, GROUND_Y - 140, colors, 36, 420);
        ring(ctx.fx, v.x, GROUND_Y - 140, colors[0], 2);
        flash(ctx.fx, 0.6, colors[0]);
        shake(ctx.camera, 14);
        ctx.sound(2, a.id, "special-impact", d.speed);
      }
    }
  } else {
    a.pose = "idle";
  }
  v.x = Math.max(70, Math.min(890, v.x));
  a.x = Math.max(70, Math.min(890, a.x));
  return d.t >= DOMAIN_DURATION;
}

export function endDomain(d: Domain, ctx: CombatContext) {
  d.victim.frozen = 0;
  setState(d.attacker, "idle");
  d.attacker.invuln = 0.4;
  d.attacker.ai.cooldown = 0.6;
  if (d.victim.hp > 0) knockDown(d.attacker, d.victim, ctx, 300, -480, 1.4);
  else setState(d.victim, "idle");
  resetCamera(ctx.camera);
}
