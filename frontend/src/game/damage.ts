/**
 * Central damage controller — the ONLY place allowed to change fighter HP.
 * Live rule: automatic (AI) attacks never reduce HP when combat_mode === "live".
 */
import type { CombatSettings } from "@/lib/live";
import type { DamageSource, Fighter, HitOutcome } from "./types";

export interface DamageRequest {
  target: Fighter;
  amount: number;
  source: DamageSource;
  outcome: HitOutcome;
  /** Who dealt it — their damage boost multiplies the amount. */
  attacker?: Fighter;
}

export function resolveDamage(settings: CombatSettings, req: DamageRequest): number {
  // The 20-gift Fatality is the only attack allowed to bypass boosts and the normal gift finisher guard.
  if (req.source === "fatality") return req.target.hp;
  if (req.outcome === "dodge") return 0;
  if (req.source === "auto" && settings.combat_mode === "live") return 0;
  let amount = Math.max(0, req.amount);
  // Gift buffs: attacker damage boost, target defense boost (both percent, capped by the engine).
  if (req.attacker) amount *= 1 + req.attacker.dmgBoost.pct / 100;
  amount *= 1 - req.target.defBoost.pct / 100;
  if (req.outcome === "block") amount = Math.max(req.amount > 0 ? 1 : 0, amount * settings.defense_reduction);
  amount = Math.round(amount);
  if (req.source === "gift" && !settings.allow_finisher) amount = Math.min(amount, Math.max(0, req.target.hp - 1));
  return amount;
}

export function applyDamage(settings: CombatSettings, req: DamageRequest): number {
  const amount = resolveDamage(settings, req);
  req.target.hp = Math.max(0, req.target.hp - amount);
  return amount;
}

/** Authorized admin command — heal or damage directly, clamped to [1, max_hp]. */
export function adminAdjust(settings: CombatSettings, target: Fighter, delta: number) {
  target.hp = Math.max(1, Math.min(settings.max_hp, target.hp + delta));
}
