import { CANVAS_H, CANVAS_W } from "./assets";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  tx: number;
  ty: number;
  tzoom: number;
  shake: number;
  speed: number;
}

export const createCamera = (): Camera => ({ x: CANVAS_W / 2, y: CANVAS_H / 2, zoom: 1, tx: CANVAS_W / 2, ty: CANVAS_H / 2, tzoom: 1, shake: 0, speed: 5 });

export function focus(camera: Camera, x: number, y: number, zoom: number, speed = 5) {
  camera.tx = x;
  camera.ty = y;
  camera.tzoom = zoom;
  camera.speed = speed;
}

export const resetCamera = (camera: Camera, speed = 4) => focus(camera, CANVAS_W / 2, CANVAS_H / 2, 1, speed);
export const shake = (camera: Camera, amount: number) => { camera.shake = Math.max(camera.shake, amount); };

export function updateCamera(camera: Camera, dt: number) {
  const k = 1 - Math.exp(-camera.speed * dt);
  camera.zoom += (camera.tzoom - camera.zoom) * k;
  camera.x += (camera.tx - camera.x) * k;
  camera.y += (camera.ty - camera.y) * k;
  camera.shake = Math.max(0, camera.shake - dt * 30);
  const halfW = CANVAS_W / (2 * camera.zoom);
  const halfH = CANVAS_H / (2 * camera.zoom);
  camera.x = Math.max(halfW, Math.min(CANVAS_W - halfW, camera.x));
  camera.y = Math.max(halfH, Math.min(CANVAS_H - halfH, camera.y));
}

export function applyCamera(ctx: CanvasRenderingContext2D, camera: Camera) {
  const sx = (Math.random() - 0.5) * camera.shake;
  const sy = (Math.random() - 0.5) * camera.shake;
  ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x + sx, -camera.y + sy);
}
