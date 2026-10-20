import { apiGet, apiPost, apiPut } from "@/lib/api";

export type CharacterId = "lula" | "flavio";
export type Mode = "cpu" | "2p" | "training" | "cpuvcpu";
export type Difficulty = "rookie" | "contender" | "legend";
export type IntegrationMode = "demo" | "live";
export type CombatMode = "live" | "normal";
export type TargetCharacter = "opponent" | CharacterId;
export type RepeatPolicy = "individual" | "group";
/** Special moves a gift can trigger (from the reference movement sheets). */
export type SpecialMove = "none" | "hadouken" | "shoryuken" | "ultra_hadouken" | "domain" | "invocadores" | "genkidama" | "damage_boost" | "defense_boost";

export interface GiftRule {
  gift_id: string;
  gift_name: string;
  reference_value: number;
  action_name: string;
  damage: number;
  animation_ms: number;
  effect_intensity: number;
  target_character: TargetCharacter;
  enabled: boolean;
  repeat_policy: RepeatPolicy;
  special_move: SpecialMove;
}

export interface CombatSettings {
  max_hp: number;
  common_damage: number;
  combo_damage: number;
  defense_reduction: number;
  recovery_ms: number;
  invulnerability_ms: number;
  fight_duration_sec: number;
  animation_speed: number;
  auto_attack_frequency: number;
  combat_mode: CombatMode;
  visual_intensity: number;
  collective_goal: number;
  backdrop: "brasilia" | "neon";
  allow_finisher: boolean;
  stun_ms: number;
  caption_ms: number;
  camera_zoom: number;
  effects_enabled: boolean;
  slow_motion: boolean;
  ai_skill: number;
  queue_priority: "fifo" | "impact";
}

export interface LiveConfig {
  id: string;
  integration_mode: IntegrationMode;
  rules: GiftRule[];
  rules_version: number;
  combat: CombatSettings;
}

export interface GiftEvent {
  id: string;
  game_id: string;
  sequence: number;
  event_id: string;
  occurred_at: string;
  username: string;
  user_id: string | null;
  gift_id: string;
  gift_name: string;
  quantity: number;
  benefited_character: CharacterId;
  target_character: CharacterId;
  action_name: string;
  damage: number;
  animation_ms: number;
  effect_intensity: number;
  repeat_policy: RepeatPolicy;
  special_move: SpecialMove;
  reference_value: number;
  source: "demo" | "provider";
  status: "queued" | "processing" | "completed";
}

export interface DemoGiftCreate {
  gift_id: string;
  username: string;
  quantity: number;
  benefited_character: CharacterId;
  event_id?: string;
  user_id?: string;
}

export interface LiveStatus {
  state: "demo" | "disconnected" | "connected" | "reconnecting" | "error";
  mode: IntegrationMode;
  message: string;
}

export interface RoundResultCreate {
  game_id: string;
  session_id: string;
  round: number;
  winner: CharacterId;
  loser: CharacterId;
  contributors: string[];
  gifts_count: number;
}

export interface RoundResult extends RoundResultCreate {
  id: string;
  created_at: string;
}

export interface GiftSocketStatus extends LiveStatus {
  type: "status";
}

export interface GiftSocketEvent {
  type: "gift";
  event: GiftEvent;
}

export type GiftSocketMessage = GiftSocketStatus | GiftSocketEvent;

export const fetchLiveConfig = () => apiGet<LiveConfig>("/live/config");
export const updateLiveConfig = (config: LiveConfig) => apiPut<LiveConfig>("/live/config", config);
export const sendDemoGift = (payload: DemoGiftCreate) => apiPost<GiftEvent>("/live/demo/gift", payload);
export const fetchLiveStatus = () => apiGet<LiveStatus>("/live/status");
export const fetchLiveEvents = () => apiGet<GiftEvent[]>("/live/events");
export const fetchLiveQueue = () => apiGet<GiftEvent[]>("/live/queue");
export const fetchRoundResults = () => apiGet<RoundResult[]>("/live/results");
export const saveRoundResult = (payload: RoundResultCreate) => apiPost<RoundResult>("/live/results", payload);

export const DEFAULT_LIVE_CONFIG: LiveConfig = {
  id: "default",
  integration_mode: "demo",
  rules_version: 9,
  combat: {
    max_hp: 600,
    common_damage: 5,
    combo_damage: 12,
    defense_reduction: 0.25,
    recovery_ms: 650,
    invulnerability_ms: 420,
    fight_duration_sec: 180,
    animation_speed: 0.85,
    auto_attack_frequency: 1.12,
    combat_mode: "live",
    visual_intensity: 1,
    collective_goal: 150,
    backdrop: "brasilia",
    allow_finisher: false,
    stun_ms: 1100,
    caption_ms: 3200,
    camera_zoom: 1.6,
    effects_enabled: true,
    slow_motion: true,
    ai_skill: 0.65,
    queue_priority: "fifo",
  },
  rules: [
    { gift_id: "rose", gift_name: "Rosa", reference_value: 1, action_name: "Dano +10%", damage: 0, animation_ms: 1200, effect_intensity: 1, target_character: "opponent", enabled: true, repeat_policy: "individual", special_move: "damage_boost" },
    { gift_id: "heart", gift_name: "Coração", reference_value: 1, action_name: "Defesa +10%", damage: 0, animation_ms: 1200, effect_intensity: 1, target_character: "opponent", enabled: true, repeat_policy: "individual", special_move: "defense_boost" },
    { gift_id: "donut", gift_name: "Rosquinha", reference_value: 30, action_name: "Shoryuken", damage: 45, animation_ms: 1500, effect_intensity: 1.4, target_character: "opponent", enabled: true, repeat_policy: "individual", special_move: "shoryuken" },
    { gift_id: "lion", gift_name: "Leão", reference_value: 29999, action_name: "Expansão de Domínio", damage: 120, animation_ms: 6500, effect_intensity: 2, target_character: "opponent", enabled: true, repeat_policy: "individual", special_move: "domain" },
    { gift_id: "universe", gift_name: "Universo TikTok", reference_value: 44999, action_name: "Ultra Hadouken", damage: 240, animation_ms: 4800, effect_intensity: 3, target_character: "opponent", enabled: true, repeat_policy: "individual", special_move: "ultra_hadouken" },
    { gift_id: "hammer", gift_name: "Martelo", reference_value: 500, action_name: "Invocação do Xande", damage: 150, animation_ms: 3800, effect_intensity: 2.2, target_character: "opponent", enabled: true, repeat_policy: "individual", special_move: "invocadores" },
    { gift_id: "galaxy", gift_name: "Galáxia", reference_value: 1000, action_name: "Genkidama", damage: 300, animation_ms: 5200, effect_intensity: 3, target_character: "opponent", enabled: true, repeat_policy: "individual", special_move: "genkidama" },
  ],
};

export const GIFT_ICONS: Record<string, string> = { rose: "🌹", heart: "💗", donut: "🍩", lion: "🦁", universe: "🌌", hammer: "🔨", galaxy: "🌠" };
export const SPECIAL_MOVES: { id: SpecialMove; label: string }[] = [
  { id: "none", label: "Nenhum" },
  { id: "damage_boost", label: "Dano +10%" },
  { id: "defense_boost", label: "Defesa +10%" },
  { id: "hadouken", label: "Hadouken" },
  { id: "shoryuken", label: "Shoryuken" },
  { id: "ultra_hadouken", label: "Ultra Hadouken" },
  { id: "domain", label: "Expansão de Domínio" },
  { id: "invocadores", label: "Invocação do Xande" },
  { id: "genkidama", label: "Genkidama" },
];

/** Boost rules: each gift unit adds 10%, capped so the fight stays long; lasts 2 minutes (resets every round). */
export const BOOST_STEP = 10;
export const DAMAGE_BOOST_MAX = 100;
export const DEFENSE_BOOST_MAX = 50;
export const BOOST_DURATION_SEC = 120;

/** Short effect label shown in the thank-you cutscene and HUD. */
export function giftEffectLabel(event: GiftEvent): string {
  const q = event.quantity;
  switch (event.special_move) {
    case "damage_boost": return `DANO +${Math.min(DAMAGE_BOOST_MAX, BOOST_STEP * q)}%`;
    case "defense_boost": return `DEFESA +${Math.min(DEFENSE_BOOST_MAX, BOOST_STEP * q)}%`;
    case "hadouken": return q > 1 ? `HADOUKEN x${Math.min(10, q)}` : "HADOUKEN";
    case "shoryuken": return q > 1 ? `SHORYUKEN x${Math.min(10, q)}` : "SHORYUKEN";
    case "ultra_hadouken": return q > 1 ? `ULTRA HADOUKEN x${Math.min(10, q)}` : "ULTRA HADOUKEN";
    case "domain": return "EXPANSÃO DE DOMÍNIO";
    case "invocadores": return q > 1 ? `INVOCAÇÃO DO XANDE x${Math.min(10, q)}` : "INVOCAÇÃO DO XANDE";
    case "genkidama": return q > 1 ? `GENKIDAMA x${Math.min(10, q)}` : "GENKIDAMA";
    default: return event.action_name.toUpperCase();
  }
}
export const giftIcon = (giftId: string) => GIFT_ICONS[giftId] ?? "🎁";
export const giftTier = (value: number) => (value >= 20000 ? 4 : value >= 1000 ? 3 : value >= 30 ? 2 : 1);
