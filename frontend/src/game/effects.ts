/** Pixel-art particle / flash / trail effects (visual only). */
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; gravity: number }
export interface Ring { x: number; y: number; age: number; max: number; color: string; size: number }
export interface Trail { x: number; y: number; facing: 1 | -1; pose: string; id: string; rot: number; age: number }

export interface Effects {
  particles: Particle[];
  rings: Ring[];
  trails: Trail[];
  flash: number;
  flashColor: string;
  speedLines: number;
  enabled: boolean;
}

export const createEffects = (): Effects => ({ particles: [], rings: [], trails: [], flash: 0, flashColor: "#ffffff", speedLines: 0, enabled: true });

export function burst(fx: Effects, x: number, y: number, colors: string[], count: number, speed: number, gravity = 420) {
  if (!fx.enabled) count = Math.ceil(count / 4);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.65);
    fx.particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - speed * 0.25, life: 0, max: 0.35 + Math.random() * 0.45, size: 3 + Math.floor(Math.random() * 4), color: colors[i % colors.length], gravity });
  }
  if (fx.particles.length > 420) fx.particles.splice(0, fx.particles.length - 420);
}

export function ring(fx: Effects, x: number, y: number, color: string, size = 1) {
  fx.rings.push({ x, y, age: 0, max: 0.32, color, size });
}

export function flash(fx: Effects, amount: number, color = "#ffffff") {
  if (!fx.enabled) amount *= 0.35;
  fx.flash = Math.max(fx.flash, amount);
  fx.flashColor = color;
}

export function updateEffects(fx: Effects, dt: number) {
  fx.particles = fx.particles.filter((p) => {
    p.life += dt;
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    return p.life < p.max;
  });
  fx.rings = fx.rings.filter((r) => (r.age += dt) < r.max);
  fx.trails = fx.trails.filter((t) => (t.age += dt) < 0.22);
  fx.flash = Math.max(0, fx.flash - dt * 3.2);
  fx.speedLines = Math.max(0, fx.speedLines - dt);
}

export function drawWorldEffects(ctx: CanvasRenderingContext2D, fx: Effects) {
  fx.rings.forEach((r) => {
    const p = r.age / r.max;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 6 * r.size;
    for (let i = 0; i < 8; i += 1) {
      const a = (i * Math.PI) / 4;
      const inner = 14 * r.size;
      const outer = (36 + p * 52) * r.size;
      ctx.beginPath();
      ctx.moveTo(r.x + Math.cos(a) * inner, r.y + Math.sin(a) * inner);
      ctx.lineTo(r.x + Math.cos(a) * outer, r.y + Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.restore();
  });
  fx.particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  });
  ctx.globalAlpha = 1;
}
