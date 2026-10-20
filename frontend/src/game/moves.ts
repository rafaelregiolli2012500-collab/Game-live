/**
 * Movement scripts based on the reference movement sheet (stance, walk, crouch, jump,
 * punches, kicks, sweep, throw, block, hit, knockdown/get-up, victory) — shared by both fighters.
 * Each animation is a keyframed clip: the pose switches on its key, offsets are eased between keys.
 * Nothing in this module touches HP — damage is handled by damage.ts.
 */
import type { BasicMove, Fighter, Pose } from "./types";

export interface MoveDef {
  duration: number;
  /** Times (s) at which contact is simulated. */
  impacts: number[];
  minRange: number;
  maxRange: number;
  blockable: boolean;
  damageKey: "common" | "combo";
  stun: number;
  /** A clean hit sends the target to the floor. */
  knockdown?: boolean;
}

export const MOVES: Record<BasicMove, MoveDef> = {
  jab: { duration: 0.36, impacts: [0.12], minRange: 0, maxRange: 135, blockable: true, damageKey: "common", stun: 0.12 },
  hook: { duration: 0.55, impacts: [0.24], minRange: 0, maxRange: 130, blockable: true, damageKey: "combo", stun: 0.4 },
  uppercut: { duration: 0.62, impacts: [0.2], minRange: 0, maxRange: 118, blockable: true, damageKey: "combo", stun: 0.5 },
  kick: { duration: 0.62, impacts: [0.24], minRange: 0, maxRange: 160, blockable: true, damageKey: "combo", stun: 0.35 },
  sweep: { duration: 0.74, impacts: [0.22], minRange: 0, maxRange: 165, blockable: true, damageKey: "common", stun: 0, knockdown: true },
  airkick: { duration: 0.95, impacts: [0.5], minRange: 0, maxRange: 150, blockable: true, damageKey: "combo", stun: 0.6 },
  grab: { duration: 1.55, impacts: [0.22], minRange: 0, maxRange: 128, blockable: false, damageKey: "common", stun: 0 },
  // Gift special: no melee contact — the energy ball (combat.updateProjectiles) carries the damage.
  hadouken: { duration: 0.9, impacts: [], minRange: 0, maxRange: 2000, blockable: false, damageKey: "combo", stun: 0 },
  // Gift special modelled on the five-frame reference: crouch → charge → rising fist → descent → landing.
  shoryuken: { duration: 1.16, impacts: [0.32], minRange: 0, maxRange: 165, blockable: false, damageKey: "combo", stun: 0, knockdown: true },
  // Giant projectile: long charge and full-map release; damage travels with the orb.
  ultra_hadouken: { duration: 4.7, impacts: [], minRange: 0, maxRange: 2000, blockable: false, damageKey: "combo", stun: 0 },
};

/** Moment (s) the hadouken energy ball leaves the hands. */
export const HADOUKEN_RELEASE = 0.36;
export const ULTRA_RELEASE = 4;

export const COMBOS: BasicMove[][] = [
  ["jab", "jab"],
  ["jab", "hook"],
  ["jab", "kick"],
  ["hook", "jab"],
  ["jab", "jab", "sweep"],
  ["jab", "hook", "uppercut"],
  ["jab", "jab", "hook", "kick"],
  ["hook", "jab", "hook", "sweep"],
];

/** Time window (s) in which the jump-in kick is airborne. */
export const AIRKICK_AIR: [number, number] = [0.12, 0.74];

interface Key { at: number; pose?: Pose; ox?: number; oy?: number; rot?: number; sy?: number }
interface Clip { duration: number; loop?: boolean; keys: Key[] }

const ease = (t: number) => t * t * (3 - 2 * t);

/** Samples a clip: pose = last key reached, offsets eased between neighbouring keys. */
function sample(clip: Clip, t: number, f: Fighter) {
  const time = clip.loop ? ((t % clip.duration) + clip.duration) % clip.duration : Math.min(t, clip.duration);
  const keys = clip.keys;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].at <= time) i += 1;
  for (let k = i; k >= 0; k -= 1) if (keys[k].pose) { f.pose = keys[k].pose!; break; }
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const k = b.at > a.at ? ease(Math.max(0, Math.min(1, (time - a.at) / (b.at - a.at)))) : 0;
  const lerp = (x = 0, y = 0) => x + (y - x) * k;
  f.ox = lerp(a.ox, b.ox);
  f.oy = lerp(a.oy, b.oy);
  f.rot = lerp(a.rot, b.rot);
  f.squash = lerp(a.sy ?? 1, b.sy ?? 1);
}

const MOVE_CLIPS: Record<BasicMove, Clip> = {
  // Light punch: short chamber → snap → retract.
  jab: { duration: 0.36, keys: [
    { at: 0, pose: "idle", ox: 0 }, { at: 0.06, ox: -5 }, { at: 0.08, pose: "punch", ox: 4 }, { at: 0.14, ox: 14 },
    { at: 0.24, ox: 10 }, { at: 0.26, pose: "idle", ox: 4 }, { at: 0.36, ox: 0 },
  ] },
  // Heavy punch: twist back, step through, hold, recover.
  hook: { duration: 0.55, keys: [
    { at: 0, pose: "idle", ox: 0, rot: 0 }, { at: 0.12, ox: -10, rot: -0.05 }, { at: 0.14, pose: "hook", ox: 4, rot: 0.02 },
    { at: 0.26, ox: 18, rot: 0.05 }, { at: 0.38, ox: 14, rot: 0.03 }, { at: 0.42, pose: "idle", ox: 6, rot: 0 }, { at: 0.55, ox: 0 },
  ] },
  // Crouching heavy punch (anti-air): dip → rising fist → back to crouch → stand.
  uppercut: { duration: 0.62, keys: [
    { at: 0, pose: "crouch", ox: 0, oy: 0 }, { at: 0.1, ox: 2, oy: 0, sy: 0.96 }, { at: 0.12, pose: "uppercut", ox: 6, oy: 0, sy: 1 },
    { at: 0.22, ox: 12, oy: -12 }, { at: 0.36, ox: 10, oy: -6 }, { at: 0.42, pose: "crouch", ox: 4, oy: 0 }, { at: 0.54, pose: "idle", ox: 0 }, { at: 0.62, ox: 0 },
  ] },
  // Standing roundhouse: lean back, leg out, hold, retract.
  kick: { duration: 0.62, keys: [
    { at: 0, pose: "idle", ox: 0, rot: 0 }, { at: 0.1, ox: -6, rot: -0.05 }, { at: 0.12, pose: "kick", ox: 0, rot: -0.03 },
    { at: 0.24, ox: 12, rot: 0 }, { at: 0.4, ox: 10 }, { at: 0.46, pose: "idle", ox: 4 }, { at: 0.62, ox: 0 },
  ] },
  // Crouching sweep: drop, leg slides along the floor, back to crouch, stand.
  sweep: { duration: 0.74, keys: [
    { at: 0, pose: "crouch", ox: 0 }, { at: 0.1, ox: -4, sy: 0.97 }, { at: 0.12, pose: "sweep", ox: 6, sy: 1 },
    { at: 0.26, ox: 20 }, { at: 0.46, ox: 16 }, { at: 0.5, pose: "crouch", ox: 6 }, { at: 0.64, pose: "idle", ox: 0 }, { at: 0.74, ox: 0 },
  ] },
  // Jump-in kick: pre-jump crouch → rise (tuck) → kick out on the way down → landing crouch.
  airkick: { duration: 0.95, keys: [
    { at: 0, pose: "crouch", oy: 0, sy: 1 }, { at: 0.1, oy: 0, sy: 0.94 }, { at: 0.12, pose: "jump", oy: 0, sy: 1 },
    { at: 0.28, oy: -118, rot: -0.04 }, { at: 0.34, pose: "airkick", oy: -132, rot: -0.06 }, { at: 0.52, oy: -96, rot: -0.04 },
    { at: 0.74, pose: "crouch", oy: 0, rot: 0, sy: 0.95 }, { at: 0.86, pose: "idle", sy: 1 }, { at: 0.95, oy: 0 },
  ] },
  // Throw: reach and seize, hold while landing body blows, heave over (heavy punch), recover.
  grab: { duration: 1.55, keys: [
    { at: 0, pose: "idle", ox: 0, rot: 0 }, { at: 0.06, pose: "grab", ox: 6 }, { at: 0.22, ox: 22 }, { at: 0.5, ox: 20, rot: 0.03 },
    { at: 0.75, ox: 22, rot: -0.02 }, { at: 1.0, ox: 20, rot: 0.03 }, { at: 1.05, pose: "hook", ox: 12, rot: -0.12 },
    { at: 1.3, pose: "idle", ox: 4, rot: 0 }, { at: 1.55, ox: 0 },
  ] },
  // Hadouken (reference sheet special): hands gather energy at the hip → thrust forward → hold → recover.
  hadouken: { duration: 0.9, keys: [
    { at: 0, pose: "idle", ox: 0 }, { at: 0.05, pose: "charge", ox: -4, sy: 1 }, { at: 0.3, ox: -10, sy: 0.98 },
    { at: 0.34, pose: "fireball", ox: 6, sy: 1 }, { at: 0.42, ox: 14 }, { at: 0.7, ox: 10 }, { at: 0.74, pose: "idle", ox: 4 }, { at: 0.9, ox: 0 },
  ] },
  // Five stages from the supplied Shoryuken sheet: deep setup, coiled rise, vertical impact, descent, stance.
  shoryuken: { duration: 1.16, keys: [
    { at: 0, pose: "crouch", ox: -4, oy: 0, sy: 0.94 },
    { at: 0.1, pose: "charge", ox: -8, oy: 0, sy: 0.98 },
    { at: 0.2, pose: "uppercut", ox: 10, oy: -18, sy: 1 },
    { at: 0.42, pose: "uppercut", ox: 24, oy: -142, rot: -0.04 },
    { at: 0.58, pose: "jump", ox: 30, oy: -178, rot: -0.02 },
    { at: 0.82, pose: "jump", ox: 24, oy: -70, rot: 0 },
    { at: 0.94, pose: "crouch", ox: 12, oy: 0, sy: 0.95 },
    { at: 1.04, pose: "idle", ox: 4, oy: 0, sy: 1 },
    { at: 1.16, ox: 0, oy: 0 },
  ] },
  ultra_hadouken: { duration: 4.7, keys: [
    { at: 0, pose: "crouch", ox: -4, sy: 0.95 }, { at: 0.08, pose: "charge", ox: -10, sy: 1 },
    { at: 0.6, pose: "charge", ox: -16, sy: 0.98 }, { at: 2.4, pose: "charge", ox: -22, sy: 1.02 },
    { at: 3.82, pose: "charge", ox: -26, sy: 0.97 }, { at: 3.96, pose: "fireball", ox: 8, sy: 1 },
    { at: 4.12, ox: 30 }, { at: 4.42, ox: 16 }, { at: 4.52, pose: "idle", ox: 5 }, { at: 4.7, ox: 0 },
  ] },
};

const IDLE: Clip = { duration: 0.96, loop: true, keys: [
  { at: 0, pose: "idle", oy: 0, sy: 1 }, { at: 0.48, oy: 3, sy: 0.988 }, { at: 0.96, oy: 0, sy: 1 },
] };
const WALK: Clip = { duration: 0.64, loop: true, keys: [
  { at: 0, pose: "walk", oy: 0 }, { at: 0.16, pose: "idle", oy: -4 }, { at: 0.32, pose: "walk", oy: 0 }, { at: 0.48, pose: "idle", oy: -4 }, { at: 0.64, oy: 0 },
] };
// Back-dash hop used for dodges.
const DODGE: Clip = { duration: 0.36, keys: [
  { at: 0, pose: "crouch", oy: 0 }, { at: 0.05, pose: "jump", oy: -10 }, { at: 0.16, oy: -34 }, { at: 0.28, pose: "crouch", oy: 0 }, { at: 0.36, pose: "idle", oy: 0 },
] };
const VICTORY: Clip = { duration: 1.2, loop: true, keys: [
  { at: 0, pose: "victory", oy: 0 }, { at: 0.6, oy: -6 }, { at: 1.2, oy: 0 },
] };

/** Sets pose + render offsets for a fighter performing a basic move. */
export function animateMove(f: Fighter) {
  if (!f.move) return;
  sample(MOVE_CLIPS[f.move], f.moveTime, f);
}

/** Visual state animation for non-attacking states. */
export function animateState(f: Fighter, time: number) {
  f.rot = 0;
  f.squash = 1;
  f.ox = 0;
  f.oy = 0;
  const phase = f.id === "lula" ? 0 : 0.37;
  switch (f.state) {
    case "idle": sample(IDLE, time + phase, f); break;
    case "walk": sample(WALK, time + phase, f); break;
    case "dodge": sample(DODGE, f.stateTime, f); break;
    case "victory": sample(VICTORY, time + phase, f); break;
    case "block": f.pose = "block"; f.ox = -4; f.squash = 0.99; break;
    case "hit": {
      const k = 1 - Math.min(1, f.stateTime / Math.max(0.01, f.stateDuration));
      f.pose = "hurt";
      f.ox = -10 * k;
      f.rot = -0.07 * k;
      break;
    }
    case "stun":
      f.pose = "stun";
      f.rot = Math.sin(time * 5) * 0.05;
      f.ox = Math.sin(time * 5) * 5;
      break;
    case "grabbed":
      f.pose = "hurt";
      f.ox = Math.sin(time * 40) * 2;
      break;
    case "knockdown":
      // Airborne: hurt pose tilting back → lying on the floor → crouch while getting up.
      if (f.y < -2) { f.pose = "hurt"; f.rot = -0.35 * Math.min(1, f.stateTime * 3); }
      else if (f.stateTime < f.stateDuration - 0.3) f.pose = "knockdown";
      else f.pose = "crouch";
      break;
    default:
      f.pose = "idle";
  }
}
