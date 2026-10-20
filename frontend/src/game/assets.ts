import type { CharacterId, Pose } from "./types";

export const CANVAS_W = 960;
export const CANVAS_H = 540;
export const GROUND_Y = 478;

export const CHARACTERS: Record<CharacterId, { name: string; tagline: string; accent: string }> = {
  lula: { name: "LULA", tagline: "O VETERANO", accent: "#ff3b30" },
  flavio: { name: "FLÁVIO", tagline: "O HERDEIRO", accent: "#39ff88" },
};

export const POSES: Pose[] = ["idle", "walk", "crouch", "jump", "punch", "hook", "uppercut", "kick", "airkick", "sweep", "grab", "charge", "fireball", "mudra", "block", "hurt", "stun", "knockdown", "victory"];

/**
 * Rendered height (canvas px) per character + pose, tuned so the head/body scale is identical in
 * every movement (crouch, sweep, jump, knockdown…) — only the silhouette changes, never the size.
 */
export const POSE_HEIGHT: Record<CharacterId, Record<Pose, number>> = {
  lula: { idle: 250, walk: 250, crouch: 222, jump: 228, punch: 250, hook: 252, uppercut: 286, kick: 248, airkick: 240, sweep: 226, grab: 250, charge: 238, fireball: 228, mudra: 230, block: 250, hurt: 245, stun: 250, knockdown: 88, victory: 258 },
  flavio: { idle: 250, walk: 256, crouch: 222, jump: 228, punch: 250, hook: 252, uppercut: 268, kick: 250, airkick: 240, sweep: 225, grab: 252, charge: 240, fireball: 240, mudra: 236, block: 256, hurt: 250, stun: 252, knockdown: 86, victory: 254 },
};

/**
 * Sprite origin: horizontal fraction of the image where the body centre sits (sprites face right).
 * Measured from head + feet of each PNG so switching poses never makes the body jump sideways.
 */
export const POSE_ANCHOR: Record<CharacterId, Record<Pose, number>> = {
  lula: { idle: 0.494, walk: 0.451, crouch: 0.525, jump: 0.477, punch: 0.398, hook: 0.393, uppercut: 0.572, kick: 0.348, airkick: 0.363, sweep: 0.35, grab: 0.445, charge: 0.543, fireball: 0.485, mudra: 0.512, block: 0.51, hurt: 0.573, stun: 0.546, knockdown: 0.5, victory: 0.446 },
  flavio: { idle: 0.474, walk: 0.396, crouch: 0.512, jump: 0.53, punch: 0.383, hook: 0.384, uppercut: 0.501, kick: 0.31, airkick: 0.323, sweep: 0.397, grab: 0.434, charge: 0.54, fireball: 0.483, mudra: 0.481, block: 0.516, hurt: 0.435, stun: 0.535, knockdown: 0.5, victory: 0.445 },
};

/** Hadouken energy colours — Lula red, Flávio blue (like the reference sheet). */
export const SPECIAL_COLORS: Record<CharacterId, { core: string; mid: string; outer: string; sparks: string[] }> = {
  lula: { core: "#fff4e6", mid: "#ff2d1a", outer: "rgba(255,40,0,0.45)", sparks: ["#ff2d1a", "#ff8a3d", "#ffe0c0"] },
  flavio: { core: "#eef8ff", mid: "#3aa0ff", outer: "rgba(90,70,255,0.45)", sparks: ["#3aa0ff", "#8f7bff", "#d9f1ff"] },
};

/** Shoryuken colours requested for each fighter: Lula red, Flávio green and yellow. */
export const SHORYUKEN_COLORS: Record<CharacterId, { core: string; mid: string; outer: string; sparks: string[] }> = {
  lula: { core: "#fff4e6", mid: "#ff2d1a", outer: "rgba(255,35,20,0.48)", sparks: ["#ff2d1a", "#ff8a3d", "#fff4e6"] },
  flavio: { core: "#fffbd1", mid: "#39ff14", outer: "rgba(57,255,20,0.48)", sparks: ["#39ff14", "#ffe600", "#ffffff"] },
};

/** Giant Ultra/Fatality projectile palette. */
export const ULTRA_COLORS = SHORYUKEN_COLORS;

export const SOUND_FILES = {
  flashbang: "/audio/flashbang.mp3",
  faah: "/audio/faah.mp3",
  lulaSpecial: "/audio/lula-special.mp3",
  punch: "/audio/punch.mp3",
  multiplePunches: "/audio/multiple-punches.mp3",
  strongEnergyWave: "/audio/strong-energy-wave.mp3",
  animePowerup: "/audio/anime-powerup.mp3",
  surprised: "/audio/surprised.mp3",
  struggleStand: "/audio/struggle-stand.mp3",
  genkidamaCharge: "/audio/genkidama-charge.mp3",
  genkidamaImpact: "/audio/genkidama-impact.mp3",
  lulaSpecialAlt: "/audio/lula-special-alt.mp3",
  flavioSpecial: "/audio/flavio-special.mp3",
  specialImpactThree: "/audio/special-impact-3.mp3",
  victory: "/audio/victory.mp3",
  giftSuccess: "/audio/gift-success.mp3",
} as const;

/** Domain expansion per fighter (from the user's domain catalogue). */
export const DOMAINS: Record<CharacterId, { title: string; name: string }> = {
  lula: { title: "EXPANSÃO DE DOMÍNIO", name: "ARENA SANGRENTA" },
  flavio: { title: "EXPANSÃO DE DOMÍNIO", name: "FLORESTA TROPICAL" },
};

/** Thank-you cutscene art: Lula with the red flag + white star, Flávio with the Brazilian flag. */
export const thanksPath = (id: CharacterId) => `/sprites/thanks_${id}.jpg`;

export const spritePath = (id: CharacterId, pose: Pose) => `/sprites/${id}_${pose}.png`;
export const portraitPath = (id: CharacterId) => spritePath(id, "idle");

export const FX_SPRITES = {
  stage: "/sprites/stage.jpg",
  ultraBeam: "/sprites/ultra_beam_sheet.png",
  ultraAura: "/sprites/ultra_aura.png",
  invocadorHammer: "/sprites/invocador_hammer_sheet.png",
  genkidamaFx: "/sprites/genkidama_fx_sheet.png",
  genkidamaLula: "/sprites/lula_genkidama_sheet.png",
  genkidamaFlavio: "/sprites/flavio_genkidama_sheet.png",
  hammerJustice: "/sprites/hammer_justice_backdrop.png",
} as const;

export function loadImages(): Record<string, HTMLImageElement> {
  const sources = new Set<string>(Object.values(FX_SPRITES));
  (Object.keys(CHARACTERS) as CharacterId[]).forEach((id) => POSES.forEach((pose) => sources.add(spritePath(id, pose))));
  const images: Record<string, HTMLImageElement> = {};
  sources.forEach((src) => {
    const image = new Image();
    image.src = src;
    images[src] = image;
  });
  return images;
}
