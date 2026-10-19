import type { CharacterId, Pose } from "./types";

export const CANVAS_W = 960;
export const CANVAS_H = 540;
export const GROUND_Y = 478;

export const CHARACTERS: Record<CharacterId, { name: string; tagline: string; accent: string }> = {
  lula: { name: "LULA", tagline: "O VETERANO", accent: "#ff3b30" },
  flavio: { name: "FLÁVIO", tagline: "O HERDEIRO", accent: "#39ff88" },
};

export const POSES: Pose[] = ["idle", "walk", "crouch", "jump", "punch", "hook", "uppercut", "kick", "airkick", "sweep", "grab", "block", "hurt", "stun", "knockdown", "victory"];

/** Rendered height (canvas px) per pose — keeps both fighters at the same body scale across sprites. */
export const POSE_HEIGHT: Record<Pose, number> = {
  idle: 250, walk: 248, crouch: 188, jump: 196, punch: 250, hook: 250, uppercut: 286, kick: 244, airkick: 222,
  sweep: 168, grab: 246, block: 244, hurt: 236, stun: 250, knockdown: 96, victory: 252,
};

/**
 * Sprite origin: horizontal fraction of the image where the body centre sits (sprites face right).
 * Measured from head + feet of each PNG so switching poses never makes the body jump sideways.
 */
export const POSE_ANCHOR: Record<CharacterId, Record<Pose, number>> = {
  lula: { idle: 0.494, walk: 0.451, crouch: 0.525, jump: 0.477, punch: 0.398, hook: 0.393, uppercut: 0.572, kick: 0.348, airkick: 0.363, sweep: 0.35, grab: 0.445, block: 0.51, hurt: 0.573, stun: 0.546, knockdown: 0.5, victory: 0.446 },
  flavio: { idle: 0.474, walk: 0.396, crouch: 0.512, jump: 0.53, punch: 0.383, hook: 0.384, uppercut: 0.501, kick: 0.31, airkick: 0.323, sweep: 0.397, grab: 0.434, block: 0.516, hurt: 0.435, stun: 0.535, knockdown: 0.5, victory: 0.445 },
};

export const spritePath = (id: CharacterId, pose: Pose) => `/sprites/${id}_${pose}.png`;
export const portraitPath = (id: CharacterId) => spritePath(id, "idle");

export const FX_SPRITES = {
  stage: "/sprites/stage.jpg",
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
