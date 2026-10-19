/** Canvas renderer: world (camera space) + HUD overlays (screen space). */
import { CANVAS_H, CANVAS_W, CHARACTERS, FX_SPRITES, GROUND_Y, POSE_ANCHOR, POSE_HEIGHT, spritePath } from "./assets";
import { applyCamera, type Camera } from "./camera";
import { drawWorldEffects, type Effects } from "./effects";
import type { Fighter, Pose } from "./types";

export interface RenderState {
  fighters: Fighter[];
  camera: Camera;
  fx: Effects;
  timeLeft: number;
  round: number;
  time: number;
  banner: { text: string; sub: string; until: number } | null;
}

type Images = Record<string, HTMLImageElement>;
const ready = (img?: HTMLImageElement) => Boolean(img && img.complete && img.naturalWidth);

/** Draws a pose anchored at the body centre (feet on y) so pose switches never shift the body. */
function drawSprite(ctx: CanvasRenderingContext2D, images: Images, id: Fighter["id"], pose: Pose, x: number, y: number, facing: number, rot: number, squash: number, alpha = 1) {
  const img = images[spritePath(id, pose)];
  if (!ready(img)) return;
  const h = POSE_HEIGHT[pose] * squash;
  const w = (img.naturalWidth / img.naturalHeight) * POSE_HEIGHT[pose];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(rot * facing);
  ctx.scale(facing, 1);
  ctx.drawImage(img, -w * POSE_ANCHOR[id][pose], -h, w, h);
  ctx.restore();
}

function drawFighter(ctx: CanvasRenderingContext2D, images: Images, f: Fighter, time: number) {
  const x = f.x + f.ox * f.facing;
  const y = GROUND_Y + f.y + f.oy;
  const lift = Math.max(0, -(f.y + f.oy));
  ctx.fillStyle = `rgba(0,0,0,${0.38 * Math.max(0.35, 1 - lift / 260)})`;
  ctx.beginPath();
  ctx.ellipse(f.x, GROUND_Y + 4, (f.pose === "knockdown" ? 90 : 62) * Math.max(0.55, 1 - lift / 400), 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  if (f.move) { ctx.shadowColor = CHARACTERS[f.id].accent; ctx.shadowBlur = 14; }
  drawSprite(ctx, images, f.id, f.pose, x, y, f.facing, f.rot, f.squash);
  ctx.restore();
  if (f.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawSprite(ctx, images, f.id, f.pose, x, y, f.facing, f.rot, f.squash, Math.min(0.7, f.flash * 5));
    ctx.restore();
  }
  if (f.state === "stun") {
    for (let i = 0; i < 3; i += 1) {
      const a = time * 4 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = i % 2 ? "#ffe600" : "#ffffff";
      ctx.fillRect(x + Math.cos(a) * 34 - 4, y - 262 + Math.sin(a) * 9, 8, 8);
    }
  }
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center") {
  ctx.font = `900 ${size}px 'Space Grotesk', sans-serif`;
  ctx.textAlign = align;
  ctx.fillStyle = "#0a0b14";
  ctx.fillText(value, x + Math.max(2, size / 14), y + Math.max(2, size / 14));
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

export function render(ctx: CanvasRenderingContext2D, images: Images, s: RenderState) {
  ctx.save();
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  applyCamera(ctx, s.camera);
  const stage = images[FX_SPRITES.stage];
  if (ready(stage)) ctx.drawImage(stage, 0, 0, CANVAS_W, CANVAS_H);
  else { ctx.fillStyle = "#0d1020"; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }

  // Attacker drawn on top so an active limb never disappears behind the opponent.
  const ordered = [...s.fighters].sort((a, b) => (a.move ? 1 : 0) - (b.move ? 1 : 0));
  ordered.forEach((f) => drawFighter(ctx, images, f, s.time));
  drawWorldEffects(ctx, s.fx);
  ctx.restore();

  // ---------- screen space ----------
  if (s.fx.flash > 0) {
    ctx.fillStyle = s.fx.flashColor;
    ctx.globalAlpha = Math.min(0.55, s.fx.flash);
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
  }

  if (s.banner && s.time < s.banner.until) {
    ctx.fillStyle = "rgba(4,4,12,.6)";
    ctx.fillRect(0, CANVAS_H / 2 - 70, CANVAS_W, 140);
    text(ctx, s.banner.text, CANVAS_W / 2, CANVAS_H / 2 + 6, 56, "#ffe600");
    text(ctx, s.banner.sub, CANVAS_W / 2, CANVAS_H / 2 + 44, 20, "#ffffff");
  }

  ctx.fillStyle = "rgba(10,11,20,.85)";
  ctx.beginPath(); ctx.roundRect(CANVAS_W / 2 - 46, 14, 92, 46, 10); ctx.fill();
  ctx.font = "900 26px 'Geist Mono Variable', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = s.timeLeft < 15 ? "#ff3b30" : "#ffe600";
  ctx.fillText(String(Math.ceil(s.timeLeft)).padStart(3, "0"), CANVAS_W / 2, 47);
}
