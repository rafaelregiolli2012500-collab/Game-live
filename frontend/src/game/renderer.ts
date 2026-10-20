/** Canvas renderer: world (camera space) + HUD overlays (screen space). */
import { CANVAS_H, CANVAS_W, CHARACTERS, FX_SPRITES, GROUND_Y, POSE_ANCHOR, POSE_HEIGHT, SHORYUKEN_COLORS, SPECIAL_COLORS, ULTRA_COLORS, spritePath } from "./assets";
import type { Projectile } from "./combat";
import { domainScale, type Domain } from "./domain";
import { HADOUKEN_RELEASE, ULTRA_RELEASE } from "./moves";
import { applyCamera, type Camera } from "./camera";
import { drawWorldEffects, type Effects } from "./effects";
import { GENKIDAMA_IMPACT, type GiftCinematic } from "./giftCinematics";
import type { Fighter, Pose } from "./types";

export interface RenderState {
  domain: Domain | null;
  cinematic: GiftCinematic | null;
  fighters: Fighter[];
  camera: Camera;
  fx: Effects;
  projectiles: Projectile[];
  timeLeft: number;
  round: number;
  time: number;
  banner: { text: string; sub: string; until: number } | null;
}

type Images = Record<string, HTMLImageElement>;
const ready = (img?: HTMLImageElement) => Boolean(img && img.complete && img.naturalWidth);

/** Draws a pose anchored at the body centre (feet on y) so pose switches never shift the body. */
function drawSprite(ctx: CanvasRenderingContext2D, images: Images, id: Fighter["id"], pose: Pose, x: number, y: number, facing: number, rot: number, squash: number, alpha = 1, filter = "none") {
  const img = images[spritePath(id, pose)];
  if (!ready(img)) return;
  const h = POSE_HEIGHT[id][pose] * squash;
  const w = (img.naturalWidth / img.naturalHeight) * POSE_HEIGHT[id][pose];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = filter;
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
  drawUltraAura(ctx, images, f, x, y, time);
  drawAura(ctx, f, x, y, time);
  if (f.move === "shoryuken") drawShoryuken(ctx, f, x, y, time);
  ctx.save();
  if (f.move || f.state === "domain") { ctx.shadowColor = CHARACTERS[f.id].accent; ctx.shadowBlur = 14; }
  // Frozen inside a domain: icy blue tint.
  const ice = f.frozen > 0 ? `saturate(${1 - 0.7 * f.frozen}) brightness(${1 + 0.35 * f.frozen}) hue-rotate(${-20 * f.frozen}deg)` : "none";
  drawSprite(ctx, images, f.id, f.pose, x, y, f.facing, f.rot, f.squash, 1, ice);
  ctx.restore();
  if (f.frozen > 0) drawIce(ctx, x, y, f.frozen);
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

/** Supplied pixel aura, visible only while the Ultra/Fatality is charging and leaving the hands. */
function drawUltraAura(ctx: CanvasRenderingContext2D, images: Images, f: Fighter, x: number, y: number, time: number) {
  if (f.move !== "ultra_hadouken" || f.moveTime > ULTRA_RELEASE + 0.08) return;
  const img = images[FX_SPRITES.ultraAura];
  if (!ready(img)) return;
  const pulse = 1 + Math.sin(time * 18) * 0.045;
  const charge = Math.min(1, f.moveTime / ULTRA_RELEASE);
  const w = (155 + charge * 130) * pulse;
  const h = (220 + charge * 150) * pulse;
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.globalCompositeOperation = "lighter";
  // Source aura is magenta: +60° reaches red, +180° reaches green while preserving its yellow highlights.
  ctx.filter = f.id === "lula" ? "hue-rotate(60deg) saturate(1.65)" : "hue-rotate(180deg) saturate(1.7) brightness(1.08)";
  ctx.shadowColor = f.id === "lula" ? "#ff2d1a" : "#39ff14";
  ctx.shadowBlur = 24;
  ctx.drawImage(img, x - w / 2, y - h + 8, w, h);
  ctx.restore();
}

/** Vertical flame/trail around the five-stage Shoryuken movement. */
function drawShoryuken(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, time: number) {
  const c = SHORYUKEN_COLORS[f.id];
  const rise = Math.min(1, f.moveTime / 0.42);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(x, y, x, y - 250);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.45, c.outer);
  g.addColorStop(1, c.mid);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x - f.facing * 12, y - 92 * rise, 42 + rise * 18, 88 + rise * 92, -0.12 * f.facing, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i += 1) {
    const yy = y - ((time * 260 + i * 37) % 250);
    ctx.fillStyle = c.sparks[i % c.sparks.length];
    ctx.fillRect(Math.round(x + Math.sin(i * 4.7) * 34), Math.round(yy), 5 + (i % 3), 5 + (i % 3));
  }
  ctx.restore();
}

/** Gift boost auras: fiery orange for damage, cyan shield for defense. */
function drawAura(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, time: number) {
  if (f.dmgBoost.pct <= 0 && f.defBoost.pct <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (f.dmgBoost.pct > 0) {
    const k = 0.55 + 0.45 * Math.min(1, f.dmgBoost.pct / 50);
    for (let i = 0; i < 3; i += 1) {
      const pulse = 1 + Math.sin(time * 9 + i * 2.1) * 0.06;
      const g = ctx.createRadialGradient(x, y - 120, 10, x, y - 120, 150 * pulse);
      g.addColorStop(0, `rgba(255,200,60,${0.32 * k})`);
      g.addColorStop(0.55, `rgba(255,90,20,${0.3 * k})`);
      g.addColorStop(1, "rgba(255,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(time * 6 + i) * 4, y - 125 - i * 6, 82 * pulse, 150 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (f.defBoost.pct > 0) {
    const pulse = 1 + Math.sin(time * 4) * 0.04;
    ctx.strokeStyle = `rgba(0,240,255,${0.5 + 0.25 * Math.sin(time * 6)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(x, y - 125, 92 * pulse, 148 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    const g = ctx.createRadialGradient(x, y - 125, 60, x, y - 125, 150);
    g.addColorStop(0, "rgba(0,240,255,0)");
    g.addColorStop(1, "rgba(0,200,255,0.18)");
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.restore();
}

/** Ice shards around a frozen fighter. */
function drawIce(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
  const shards: [number, number, number][] = [[-52, -40, 34], [48, -60, 40], [-40, -150, 28], [44, -175, 30], [-8, -235, 22], [10, -20, 26]];
  ctx.save();
  ctx.globalAlpha = 0.75 * k;
  ctx.fillStyle = "rgba(190,240,255,0.55)";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  shards.forEach(([dx, dy, size]) => {
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy - size);
    ctx.lineTo(x + dx + size * 0.45, y + dy);
    ctx.lineTo(x + dx, y + dy + size * 0.5);
    ctx.lineTo(x + dx - size * 0.45, y + dy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

/** Domain backgrounds: Lula = red sphere "Arena Sangrenta", Flávio = Brazilian flag "Floresta Tropical". */
function drawDomain(ctx: CanvasRenderingContext2D, d: Domain, time: number) {
  const k = domainScale(d);
  if (k <= 0) return;
  const cx = d.attacker.x;
  const cy = GROUND_Y - 120;
  const radius = 40 + k * 1150;
  ctx.save();
  if (d.attacker.id === "lula") {
    ctx.fillStyle = `rgba(40,0,0,${0.62 * k})`;
    ctx.fillRect(-60, -60, CANVAS_W + 120, CANVAS_H + 120);
    const g = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
    g.addColorStop(0, "rgba(255,40,40,0.08)");
    g.addColorStop(0.8, "rgba(255,30,30,0.28)");
    g.addColorStop(1, "rgba(255,60,60,0.55)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,80,80,0.9)";
    ctx.lineWidth = 8;
    ctx.stroke();
    // Rune circle on the floor.
    ctx.strokeStyle = `rgba(255,50,50,${0.85 * k})`;
    ctx.lineWidth = 3;
    for (const [rx, ry] of [[190, 34], [140, 24]] as const) { ctx.beginPath(); ctx.ellipse(cx, GROUND_Y + 4, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -time * 60;
    ctx.beginPath(); ctx.ellipse(cx, GROUND_Y + 4, 165, 29, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
    // Green field with a subtle pixel checker.
    ctx.fillStyle = "#009c3b";
    ctx.fillRect(-60, -60, CANVAS_W + 120, CANVAS_H + 120);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let yy = -48; yy < CANVAS_H + 48; yy += 24) for (let xx = -48 + ((yy / 24) % 2) * 24; xx < CANVAS_W + 48; xx += 48) ctx.fillRect(xx, yy, 24, 24);
    ctx.fillStyle = "#ffdf00";
    ctx.beginPath(); ctx.moveTo(CANVAS_W / 2, 40); ctx.lineTo(CANVAS_W - 70, CANVAS_H / 2 - 10); ctx.lineTo(CANVAS_W / 2, CANVAS_H - 60); ctx.lineTo(70, CANVAS_H / 2 - 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#002776";
    ctx.beginPath(); ctx.arc(CANVAS_W / 2, CANVAS_H / 2 - 10, 150, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(CANVAS_W / 2, CANVAS_H / 2 - 10, 150, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.arc(CANVAS_W / 2 + 40, CANVAS_H / 2 + 330, 380, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
    ctx.fillStyle = "#ffffff";
    [[-80, 40], [-40, 70], [10, 55], [60, 80], [95, 30], [-100, 90], [30, 105], [-20, 120], [75, 120]].forEach(([dx, dy]) => ctx.fillRect(CANVAS_W / 2 + dx, CANVAS_H / 2 - 10 + dy, 5, 5));
    ctx.restore();
    ctx.fillStyle = `rgba(0,0,0,${0.25 * (1 - k)})`;
    ctx.fillRect(-60, -60, CANVAS_W + 120, CANVAS_H + 120);
  }
  ctx.restore();
  if (d.attacker.id !== "lula") {
    ctx.save();
    ctx.strokeStyle = `rgba(57,255,136,${0.9 * k})`;
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

/** Glowing energy orb (hadouken) in the fighter's colour; `stretch` elongates it into a flame. */
function drawOrb(ctx: CanvasRenderingContext2D, id: Fighter["id"], x: number, y: number, radius: number, facing: number, stretch: number, time: number, ultra = false) {
  const c = ultra ? ULTRA_COLORS[id] : SPECIAL_COLORS[id];
  const flicker = 1 + Math.sin(time * 40) * 0.08;
  const r = radius * flicker;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  // Flame tail behind the ball.
  if (stretch > 0) {
    const tail = ctx.createLinearGradient(-r * (1 + stretch * 2.2), 0, r * 0.4, 0);
    tail.addColorStop(0, "rgba(0,0,0,0)");
    tail.addColorStop(1, c.outer);
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.ellipse(-r * stretch * 1.1, 0, r * (1 + stretch * 1.2), r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(r * 0.25, 0, r * 0.1, 0, 0, r * 1.5);
  g.addColorStop(0, c.core);
  g.addColorStop(0.35, c.mid);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.core;
  ctx.beginPath();
  ctx.ellipse(r * 0.2, 0, r * 0.5, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Large supplied beam frame; its blue shell is recoloured while its white core stays white. */
function drawUltraBeam(ctx: CanvasRenderingContext2D, images: Images, p: Projectile, time: number) {
  const img = images[FX_SPRITES.ultraBeam];
  if (!ready(img)) {
    drawOrb(ctx, p.owner.id, p.x, p.y, p.kind === "fatality" ? 112 : 72, Math.sign(p.vx), 1.8, time, true);
    return;
  }
  const fatality = p.kind === "fatality";
  const pulse = 1 + Math.sin((time + p.age) * 30) * 0.035;
  const w = (fatality ? 680 : 500) * pulse;
  const h = (fatality ? 248 : 188) * pulse;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(Math.sign(p.vx), 1);
  ctx.globalCompositeOperation = "lighter";
  ctx.filter = p.owner.id === "lula" ? "hue-rotate(120deg) saturate(1.7)" : "hue-rotate(-120deg) saturate(1.8) brightness(1.08)";
  ctx.shadowColor = p.owner.id === "lula" ? "#ff2d1a" : "#39ff14";
  ctx.shadowBlur = fatality ? 42 : 28;
  // Cropped from the clean long-beam frame in the supplied 631×1024 spritesheet.
  ctx.drawImage(img, 12, 351, 306, 126, -w * 0.48, -h / 2, w, h);
  ctx.restore();
}

/** Energy gathering between the hands while charging the hadouken. */
function drawCharge(ctx: CanvasRenderingContext2D, f: Fighter, time: number) {
  if (f.move !== "hadouken" && f.move !== "ultra_hadouken") return;
  const ultra = f.move === "ultra_hadouken";
  const release = ultra ? ULTRA_RELEASE : HADOUKEN_RELEASE;
  if (f.moveTime > release + 0.04) return;
  const k = Math.min(1, f.moveTime / release);
  const releasing = f.pose === "fireball";
  const dx = releasing ? 104 : 46;
  const dy = releasing ? -140 : -100;
  drawOrb(ctx, f.id, f.x + (f.ox + dx) * f.facing, GROUND_Y + f.y + f.oy + dy, (ultra ? 18 : 8) + (ultra ? 46 : 16) * k, f.facing, 0, time, ultra);
}

function drawSheetFrame(ctx: CanvasRenderingContext2D, image: HTMLImageElement, frame: number, cellW: number, cellH: number, x: number, y: number, width: number, height: number, facing = 1) {
  if (!ready(image)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.drawImage(image, frame * cellW, 0, cellW, cellH, -width / 2, -height, width, height);
  ctx.restore();
}

/** Supplied-reference cinematics: summoned hammer warrior and destructive Genkidama. */
function drawCinematicBackdrop(ctx: CanvasRenderingContext2D, images: Images, cinematic: GiftCinematic) {
  const { kind, t } = cinematic;
  ctx.save();
  if (kind === "invocadores") {
    const glow = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 40, CANVAS_W / 2, CANVAS_H / 2, 520);
    glow.addColorStop(0, "rgba(120,70,0,.58)");
    glow.addColorStop(0.55, "rgba(35,18,0,.78)");
    glow.addColorStop(1, "rgba(4,4,10,.9)");
    ctx.fillStyle = glow;
    ctx.fillRect(-100, -100, CANVAS_W + 200, CANVAS_H + 200);
    const justice = images[FX_SPRITES.hammerJustice];
    if (ready(justice)) {
      const pulse = 1 + Math.sin(t * 4) * 0.025;
      const width = 570 * pulse;
      const height = (justice.naturalHeight / justice.naturalWidth) * width;
      ctx.globalAlpha = 0.28;
      ctx.globalCompositeOperation = "lighter";
      ctx.filter = "saturate(1.5) brightness(.9)";
      ctx.shadowColor = "#facc15";
      ctx.shadowBlur = 34;
      ctx.drawImage(justice, CANVAS_W / 2 - width / 2, CANVAS_H / 2 - height / 2 - 12, width, height);
    }
  } else {
    ctx.fillStyle = `rgba(0,8,34,${Math.min(0.58, t * 0.22)})`;
    ctx.fillRect(-100, -100, CANVAS_W + 200, CANVAS_H + 200);
  }
  ctx.restore();
}

/** Supplied-reference cinematics: summoned hammer warrior and destructive Genkidama. */
function drawGiftCinematic(ctx: CanvasRenderingContext2D, images: Images, cinematic: GiftCinematic, time: number) {
  const { attacker, victim, kind, t } = cinematic;

  if (kind === "invocadores") {
    if (t < 0.45 || t > 3.58) return;
    const frame = t < 0.72 ? 0 : t < 1.16 ? 1 : t < 1.5 ? 2 : t < 2.42 ? 3 : 4;
    const xandeHeights = [310, 300, 330, 380, 420] as const;
    const xandeHeight = xandeHeights[frame];
    const summonX = victim.x - attacker.facing * 112;
    const sheet = images[FX_SPRITES.invocadorHammer];
    if (t > 1.04 && t < 3.02) {
      const pulse = 1 + Math.sin(time * 17) * 0.06;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const aura = ctx.createRadialGradient(summonX, GROUND_Y - 125, 18, summonX, GROUND_Y - 125, 145 * pulse);
      aura.addColorStop(0, "rgba(255,255,220,.52)");
      aura.addColorStop(0.3, "rgba(250,204,21,.48)");
      aura.addColorStop(0.72, "rgba(245,158,11,.22)");
      aura.addColorStop(1, "rgba(245,158,11,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.ellipse(summonX, GROUND_Y - 125, 112 * pulse, 164 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(253,224,71,${0.58 + Math.sin(time * 20) * 0.18})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(summonX, GROUND_Y - 125, 92 * pulse, 145 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = "#f59e0b";
    ctx.shadowBlur = t < 0.9 ? 30 : 16;
    drawSheetFrame(ctx, sheet, frame, 256, 320, summonX, GROUND_Y + 5, xandeHeight * 0.8, xandeHeight, attacker.facing);
    ctx.restore();
    if (t > 0.46) {
      ctx.save();
      ctx.strokeStyle = `rgba(251,146,60,${Math.max(0, 0.78 - (t - 0.46) * 0.12)})`;
      ctx.lineWidth = 4;
      for (let index = -3; index <= 3; index += 1) {
        ctx.beginPath();
        ctx.moveTo(summonX, GROUND_Y);
        ctx.lineTo(summonX + index * 54, GROUND_Y + 12 + Math.abs(index) * 3);
        ctx.stroke();
      }
      ctx.restore();
    }
    return;
  }

  const sheet = images[FX_SPRITES.genkidamaFx];
  const fighterSheet = images[attacker.id === "lula" ? FX_SPRITES.genkidamaLula : FX_SPRITES.genkidamaFlavio];
  const fighterFrame = t < 1.1 ? 0 : t < 1.85 ? 1 : 2;
  drawSheetFrame(ctx, fighterSheet, fighterFrame, 256, 320, attacker.x, GROUND_Y + attacker.oy, 200, 250, attacker.facing);
  if (t < 3.55) {
    const charge = Math.min(1, t / 3.35);
    const frame = charge < 0.35 ? 0 : 1;
    const size = 74 + charge * 280;
    const pulse = 1 + Math.sin(time * 18) * 0.045;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 35 + charge * 42;
    const orbSize = size * pulse;
    const gathering = t < 1.1;
    const orbCenterX = gathering ? attacker.x + attacker.facing * 78 : attacker.x;
    const orbCenterY = gathering ? GROUND_Y + attacker.oy - 148 : GROUND_Y + attacker.oy - 245 - charge * 48;
    drawSheetFrame(ctx, sheet, frame, 320, 320, orbCenterX, orbCenterY + orbSize / 2, orbSize, orbSize, 1);
    ctx.restore();
  } else if (t < GENKIDAMA_IMPACT) {
    const launch = Math.min(1, (t - 3.55) / (GENKIDAMA_IMPACT - 3.55));
    const x = attacker.x + (victim.x - attacker.x) * launch;
    const y = 80 + Math.sin(launch * Math.PI) * -75;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = "#7dd3fc";
    ctx.shadowBlur = 58;
    drawSheetFrame(ctx, sheet, 1, 320, 320, x, y + 165, 330, 330, 1);
    if (launch > 0.62) drawSheetFrame(ctx, sheet, 2, 320, 320, victim.x, GROUND_Y + 15, 310, 455, 1);
    ctx.restore();
  } else {
    const settle = Math.min(1, (t - GENKIDAMA_IMPACT) / 1.05);
    ctx.save();
    ctx.globalAlpha = 1 - settle * 0.3;
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 30 * (1 - settle);
    drawSheetFrame(ctx, sheet, 3, 320, 320, victim.x, GROUND_Y + 18, 410 + settle * 70, 238 + settle * 24, 1);
    ctx.restore();
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

  if (s.domain) drawDomain(ctx, s.domain, s.time);
  if (s.cinematic) drawCinematicBackdrop(ctx, images, s.cinematic);
  // Attacker drawn on top so an active limb never disappears behind the opponent.
  const ordered = [...s.fighters].sort((a, b) => (a.move ? 1 : 0) - (b.move ? 1 : 0));
  ordered.forEach((f) => {
    if (s.cinematic?.kind === "genkidama" && f === s.cinematic.attacker) return;
    drawFighter(ctx, images, f, s.time);
  });
  if (s.cinematic) drawGiftCinematic(ctx, images, s.cinematic, s.time);
  s.fighters.forEach((f) => drawCharge(ctx, f, s.time));
  if (s.domain && s.domain.ballX !== null) drawOrb(ctx, s.domain.attacker.id, s.domain.ballX, GROUND_Y - 140, 44, s.domain.attacker.facing, 1, s.time);
  if (s.domain && s.domain.attacker.pose === "charge") drawOrb(ctx, s.domain.attacker.id, s.domain.attacker.x + 46 * s.domain.attacker.facing, GROUND_Y - 100, 24, s.domain.attacker.facing, 0, s.time);
  s.projectiles.forEach((p) => {
    if (p.kind === "hadouken") drawOrb(ctx, p.owner.id, p.x, p.y, 30, Math.sign(p.vx), Math.min(1, p.age * 6), s.time + p.age);
    else drawUltraBeam(ctx, images, p, s.time);
  });
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
