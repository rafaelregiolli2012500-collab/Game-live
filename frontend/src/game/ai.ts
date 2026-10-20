/**
 * Fighter AI: decision making only (approach, retreat, attack choice, defense reaction).
 * It calls combat.startMove / setState; it never applies damage.
 */
import { canBeGrabbed, isAirborne, isFree, setState, startMove, type CombatContext } from "./combat";
import { COMBOS, MOVES } from "./moves";
import type { BasicMove, Fighter } from "./types";

const WALK_SPEED = 175;

function react(f: Fighter, o: Fighter, ctx: CombatContext) {
  if (!o.move || o.move === "hadouken" || o.move === "shoryuken" || o.move === "ultra_hadouken") return;
  const def = MOVES[o.move];
  const timeToImpact = (def.impacts[0] - o.moveTime) / ctx.settings.animation_speed;
  const recovering = f.state === "attack" && f.move !== null && f.moveTime > MOVES[f.move].impacts[MOVES[f.move].impacts.length - 1] + 0.06;
  if (!isFree(f) && !recovering && f.state !== "block") return;
  const reactionTime = 0.06 + (1 - ctx.settings.ai_skill) * 0.12 + Math.random() * 0.05;
  if (timeToImpact < reactionTime) return; // too late — gets surprised
  const distance = Math.abs(o.x - f.x);
  const projected = o.move === "airkick" ? distance - 160 : distance;
  if (projected > def.maxRange + 45) return; // will whiff anyway

  const history = f.ai.seenMoves;
  const repeats = history.filter((m) => m === o.move).length;
  history.push(o.move);
  if (history.length > 6) history.shift();
  let chance = 0.22 + ctx.settings.ai_skill * 0.55 + (f.ai.stance === "guarded" ? 0.12 : 0) - Math.min(0.25, f.ai.recentHits * 0.05) + (repeats >= 3 ? 0.15 : 0);
  if (f.state === "stun") chance = 0;
  if (Math.random() > chance) return; // imperfect defense

  // Anti-air: answer a jump-in with a rising uppercut timed for when it lands in range.
  if (o.move === "airkick" && isFree(f) && Math.random() < 0.35 + ctx.settings.ai_skill * 0.25 && timeToImpact > 0.18 && timeToImpact < 0.42) {
    startMove(f, "uppercut", ctx);
    f.moveTime = Math.max(0, 0.2 - timeToImpact);
    ctx.stats.counters += 1;
    return;
  }
  if (o.move === "grab" || (o.move === "airkick" && Math.random() < 0.4) || (o.move === "sweep" && Math.random() < 0.35) || (o.move === "hook" && Math.random() < 0.2) || (o.move === "jab" && Math.random() < 0.1)) {
    setState(f, "dodge", 0.36);
    f.vx = -f.facing * 430;
    f.invuln = 0.36;
  } else {
    setState(f, "block", timeToImpact + 0.24);
  }
}

function pickCombo(distance: number): BasicMove[] {
  const options = distance > 112 ? COMBOS.filter((combo) => combo[0] === "jab") : COMBOS;
  return [...options[Math.floor(Math.random() * options.length)]];
}

export function updateAi(f: Fighter, o: Fighter, ctx: CombatContext, dt: number) {
  const ai = f.ai;
  const s = ctx.settings;
  const distance = Math.abs(o.x - f.x);
  ai.cooldown -= dt;
  ai.counterWindow = Math.max(0, ai.counterWindow - dt);
  ai.recentHits = Math.max(0, ai.recentHits - dt * 0.3);
  ai.moveTimer -= dt;
  ai.stanceTimer -= dt;
  if (ai.stanceTimer <= 0) {
    ai.stanceTimer = 2 + Math.random() * 3;
    ai.stance = f.hp < o.hp - 40 || ai.recentHits > 1.5 || Math.random() < 0.3 ? "guarded" : "aggressive";
  }

  if (o.state === "attack" && o.attackId !== ai.reactedTo) {
    ai.reactedTo = o.attackId;
    react(f, o, ctx);
  }
  if (!isFree(f)) return;

  const toward = (o.x > f.x ? 1 : -1) as 1 | -1;
  if (ai.cooldown <= 0) {
    const pace = 1 / Math.max(0.2, s.auto_attack_frequency);
    const roll = Math.random();
    if (ai.counterWindow > 0 && distance < 155) {
      startMove(f, roll < 0.4 ? "hook" : roll < 0.7 ? "jab" : "sweep", ctx);
      f.combo = roll < 0.3 ? ["jab"] : [];
      ctx.stats.counters += 1;
      ai.counterWindow = 0;
      ai.cooldown = 0.3 * pace;
      return;
    }
    if (o.state === "stun" && distance < 150) {
      startMove(f, roll < 0.5 ? "hook" : "uppercut", ctx);
      ai.cooldown = 0.4 * pace;
      return;
    }
    if (o.state === "knockdown" || isAirborne(o)) {
      // Wait for the opponent to land / get up instead of whiffing on a body on the floor.
      ai.moveDir = 0;
      ai.moveTimer = 0.2;
      ai.cooldown = 0.2;
    } else if (distance > 260) {
      if (distance < 345 && roll < 0.35) startMove(f, "airkick", ctx);
      else { ai.moveDir = toward; ai.moveTimer = 0.35 + Math.random() * 0.3; }
      ai.cooldown = 0.35 * pace;
    } else if (distance > 140) {
      if (roll < 0.2) startMove(f, "airkick", ctx);
      else if (roll < 0.36 && distance < 170) startMove(f, roll < 0.28 ? "kick" : "sweep", ctx);
      else if (roll < 0.5) { ai.moveDir = 0; ai.moveTimer = 0.3 + Math.random() * 0.4; } // short pause / read
      else { ai.moveDir = toward; ai.moveTimer = 0.3 + Math.random() * 0.25; }
      ai.cooldown = (0.35 + Math.random() * 0.35) * pace;
    } else if (roll < 0.2 && ctx.time - ai.lastGrab > 4 && canBeGrabbed(o)) {
      startMove(f, "grab", ctx);
      ai.cooldown = 0.6 * pace;
    } else if (roll < 0.8 || ai.stance === "aggressive") {
      const combo = pickCombo(distance);
      if (combo.length >= 2) ctx.stats.combos += 1;
      startMove(f, combo.shift()!, ctx);
      f.combo = combo;
      ai.cooldown = (0.35 + Math.random() * 0.55) * pace;
    } else {
      ai.moveDir = (-toward) as -1 | 1;
      ai.moveTimer = 0.45;
      ai.cooldown = 0.6 * pace;
    }
    if (f.state === "attack") return;
  }

  let dir = ai.moveTimer > 0 ? ai.moveDir : 0;
  if (distance < 96) dir = (-toward) as -1 | 1;
  if (dir !== 0) {
    f.x += dir * WALK_SPEED * dt;
    if (f.state !== "walk") setState(f, "walk");
  } else if (f.state === "walk") setState(f, "idle");
}
