import { apiGet, apiPost, apiPut } from "@/lib/api";

export type CharacterId = "lula" | "flavio";
export type Mode = "cpu" | "2p" | "training" | "cpuvcpu";
export type Difficulty = "rookie" | "contender" | "legend";
export type IntegrationMode = "demo" | "live";
export type CombatMode = "live" | "normal";
export type TargetCharacter = "opponent" | CharacterId;
export type RepeatPolicy = "individual" | "group";

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

export const DEFAULT_LIVE_CONFIG: LiveConfig = {
  id: "default",
  integration_mode: "demo",
  rules_version: 2,
  combat: {
    max_hp: 600,
    common_damage: 5,
    combo_damage: 12,
    defense_reduction: 0.25,
    recovery_ms: 650,
    invulnerability_ms: 420,
    fight_duration_sec: 180,
    animation_speed: 1,
    auto_attack_frequency: 1.4,
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
  // Gift specials were removed; the new gifts are added in the next phase.
  rules: [],
};

export const GIFT_ICONS: Record<string, string> = {};
export const giftIcon = (giftId: string) => GIFT_ICONS[giftId] ?? "🎁";
export const giftTier = (value: number) => (value >= 20000 ? 4 : value >= 1000 ? 3 : value >= 30 ? 2 : 1);
