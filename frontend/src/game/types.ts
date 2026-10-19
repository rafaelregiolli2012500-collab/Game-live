import type { CharacterId, CombatSettings } from "@/lib/live";

export type { CharacterId };
/** Every sprite pose available for both fighters (one PNG per character per pose). */
export type Pose =
  | "idle" | "walk" | "crouch" | "jump"
  | "punch" | "hook" | "uppercut" | "kick" | "airkick" | "sweep" | "grab"
  | "charge" | "fireball"
  | "block" | "hurt" | "stun" | "knockdown" | "victory";
/** Moves from the reference movement sheet; "hadouken" is the gift-only special (never chosen by the AI). */
export type BasicMove = "jab" | "hook" | "uppercut" | "kick" | "sweep" | "airkick" | "grab" | "hadouken";
export type FighterState = "idle" | "walk" | "attack" | "block" | "dodge" | "hit" | "stun" | "grabbed" | "knockdown" | "victory";

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
  special: { damage: number; username: string } | null;
  ai: AiMemory;
}

export type HitOutcome = "hit" | "block" | "dodge";
export type DamageSource = "auto" | "gift" | "admin";

export interface CombatStats {
  jab: number;
  hook: number;
  uppercut: number;
  kick: number;
  sweep: number;
  airkick: number;
  grab: number;
  hadouken: number;
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
}

export interface HudSnapshot {
  hp: Record<CharacterId, number>;
  timeLeft: number;
  round: number;
  stats: CombatStats;
  /** Gift specials waiting + in flight. */
  specials: number;
  states: Record<CharacterId, FighterState>;
}

export interface EngineSettings extends CombatSettings {
  left: CharacterId;
  right: CharacterId;
}
