import type { CharacterId, CombatSettings } from "@/lib/live";

export type { CharacterId };
/** Every sprite pose available for both fighters (one PNG per character per pose). */
export type Pose =
  | "idle" | "walk" | "crouch" | "jump"
  | "punch" | "hook" | "uppercut" | "kick" | "airkick" | "sweep" | "grab"
  | "charge" | "fireball" | "mudra"
  | "block" | "hurt" | "stun" | "knockdown" | "victory";
/** Basic attacks plus gift-only scripted moves (never selected by the AI). */
export type BasicMove = "jab" | "hook" | "uppercut" | "kick" | "sweep" | "airkick" | "grab" | "hadouken" | "shoryuken" | "ultra_hadouken";
export type GiftAttackKind = "hadouken" | "shoryuken" | "ultra_hadouken" | "fatality";
export type FighterState = "idle" | "walk" | "attack" | "block" | "dodge" | "hit" | "stun" | "grabbed" | "knockdown" | "victory" | "domain" | "frozen" | "special";

export interface AiMemory {
  cooldown: number;
  stance: "aggressive" | "guarded";
  stanceTimer: number;
  reactedTo: number;
  counterWindow: number;
  lastGrab: number;
  recentHits: number;
  seenMoves: BasicMove[];
  moveDir: -1 | 0 | 1;
  moveTimer: number;
  lastOutcome: HitOutcome | null;
}

export interface Boost { pct: number; left: number }

export interface Fighter {
  id: CharacterId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  state: FighterState;
  stateTime: number;
  stateDuration: number;
  move: BasicMove | null;
  moveTime: number;
  /** Per-special playback multiplier (2× for repeated gifts from the same sender). */
  moveSpeed: number;
  impactsDone: number;
  attackId: number;
  combo: BasicMove[];
  pose: Pose;
  ox: number;
  oy: number;
  rot: number;
  squash: number;
  flash: number;
  stunBuild: number;
  stunImmune: number;
  invuln: number;
  grabPartner: Fighter | null;
  /** Gift special in progress: damage carried by the energy ball once released. */
  special: { kind: GiftAttackKind; damage: number; username: string; speed: number } | null;
  /** Gift buffs (percent + seconds left); both reset when a new round starts. */
  dmgBoost: Boost;
  defBoost: Boost;
  /** 0..1 ice intensity while frozen inside an opponent's domain. */
  frozen: number;
  /** Plays the landing sample exactly once when a knockdown reaches the floor. */
  fallSoundPending: boolean;
  ai: AiMemory;
}

export type HitOutcome = "hit" | "block" | "dodge";
export type DamageSource = "auto" | "gift" | "admin" | "fatality";

export interface CombatStats {
  jab: number;
  hook: number;
  uppercut: number;
  kick: number;
  sweep: number;
  airkick: number;
  grab: number;
  hadouken: number;
  shoryuken: number;
  ultra_hadouken: number;
  invocadores: number;
  genkidama: number;
  fatalities: number;
  domains: number;
  throws: number;
  combos: number;
  stuns: number;
  knockdowns: number;
  blocks: number;
  dodges: number;
  counters: number;
}

export interface EngineCallbacks {
  onHud: (hud: HudSnapshot) => void;
  onRoundEnd: (winner: CharacterId | null, round: number) => void;
  onRoundStart: (round: number) => void;
  onFatalityComplete: (winner: CharacterId) => void;
  onSpecialComplete: (eventId: string) => void;
}

export interface HudSnapshot {
  hp: Record<CharacterId, number>;
  timeLeft: number;
  round: number;
  stats: CombatStats;
  /** Gift specials waiting + in flight. */
  specials: number;
  boosts: Record<CharacterId, { damage: number; damageLeft: number; defense: number; defenseLeft: number }>;
  /** Name of the active domain expansion, if any. */
  domain: string | null;
  states: Record<CharacterId, FighterState>;
}

export interface EngineSettings extends CombatSettings {
  left: CharacterId;
  right: CharacterId;
}
