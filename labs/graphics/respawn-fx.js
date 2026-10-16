// The ship's return after a wreck (SX, 2026-10-03: «перезагрузка с помощью серых символов, так же, как у нас окна некоторые
// открываются. Пробегающая, но очень серых, типа, чтобы прям ощущалось, знаешь, как легкая перерисовка. Типа, может, прям
// черные символы, не знаю. И как бы после этого, когда быстренько так прокатилась перезагрузка экрана, мы видим, как из фейда
// из маленького размера в более крупный в размер, который у нас на экране главный, вылетает кораблик из космоса ... снизу
// подплывает ... С таким отскоком он чуть вверх подлетает, типа, и обратно опускается. И сначала так easy in»).
//
// The screen is redrawn: the last frame before the return is kept (`keepFrame`), and a front sweeps across from a corner as
// the garage room's opens (labs/graphics/garage-room.js: 0.7 across, 0.3 down), each row ragged; ahead of it the old frame
// (the wreck, the broken deck), behind it the new one (the camera on the new place, the deck whole), at it a band of the
// rooms' flicker glyphs `01/:·_`, black over the new frame ('black', the game's since SX's word of 2026-10-04: «анимация ...
// смены экрана после смерти должна быть черными символами а не цветными»; the garage room's appear draws its sweep in the same
// glyphs, labs/graphics/garage-room.js; the first, very dark glyphs on black cells, and its `?reboot=gray` went on 2026-10-08). Then the ship
// comes up from `rise.from` px under its place, out of nothing over `rise.fade` s and from
// `rise.small` of its size, moving as a spring let go (still at first, then quicker: the ease in), past its place by a little
// and back (`zeta`, `peak`). It is drawn by itself over the world (drawRisingShip) while the world's is hidden; the pilot's
// hands are off the controls till it has come up (`hands`). It comes up mixed, its parts on each other's cells, and is put back while it
// cannot be hurt (labs/graphics/ship-scramble.js; SX, 2026-10-16: no blink after a wreck).
import { drawPilotShip, flownShipInks } from './world-art.js';
import { scramblePlan, assembled } from './ship-scramble.js';
import { createShipMotion, stepShipMotion } from './ship-motion.js';
import { noise3 as hash } from '../../src/util.js';
import { REBOOT } from './reboot.js';

export { REBOOT };
export function createRespawnFx() {
  return { at: null, shot: null, kept: false, corner: { sx: 1, sy: 1 }, seed: 0, motion: createShipMotion(7), motionAt: null,
    mixed: false, plan: null, scramble: { plan: null, u: 0 } };
}

// The canvas the frame is kept on, made at `canvas`'s size (its device px) if it is not yet, and its drawing buffer with it: the page
// makes it as the flight starts (main.js startFlight), not in the frame a first wreck's wait would ask for it (2026-10-06: a canvas
// the size of the screen made in flight is work the frame cannot spare, in Firefox a call to its GPU process too).
export function prepareFrame(fx, canvas) {
  if (typeof document === 'undefined' || !canvas) return null;
  if (!fx.shot || fx.shot.width !== canvas.width || fx.shot.height !== canvas.height) {
    fx.shot = document.createElement('canvas');
    fx.shot.width = canvas.width; fx.shot.height = canvas.height;
    fx.shot.getContext('2d').clearRect(0, 0, 1, 1);
  }
  return fx.shot.getContext('2d');
}

// The frame as it stands on `canvas` (its device px), for the sweep to show ahead of its front. Taken while the ship waits to come
// back, before the pointer is drawn: the page takes the last frame before the return (main.js flightFrame).
export function keepFrame(fx, canvas) {
  const ctx = prepareFrame(fx, canvas);
  if (!ctx) return;
  ctx.clearRect(0, 0, fx.shot.width, fx.shot.height);
  ctx.drawImage(canvas, 0, 0);
  fx.kept = true;
}

// The return begins at `now` (s): the sweep from a corner drawn at random.
export function startRespawn(fx, now, rng = Math.random) {
  fx.at = now;
  fx.corner = { sx: rng() < 0.5 ? 1 : -1, sy: rng() < 0.5 ? 1 : -1 };
  fx.seed = Math.floor(rng() * 1e6);
  fx.motion = createShipMotion(fx.seed & 0xffff);
  fx.motionAt = null;
  fx.mixed = true;
}

// The ship's mix after a return played (`fx.scramble`: its plan, from the drawing's idle pose and the return's seed, and `u`, how far it is put
// back), or null: no return played, or the ship whole again (its grace over), which ends it.
export function scrambleOf(fx, ship) {
  if (!fx.mixed || !ship?.alive || !(ship.invuln > 0) || !Number.isFinite(ship.invuln)) { fx.mixed = false; return null; }
  const model = ship.model, cells = (model.frames && model.frames[model.idleFrame]) || model.cells;
  if (!fx.plan || fx.plan.cells !== cells || fx.plan.seed !== fx.seed) fx.plan = scramblePlan(cells, fx.seed);
  fx.scramble.plan = fx.plan; fx.scramble.u = assembled(ship.invuln);
  return fx.scramble;
}

export const respawnLength = () => REBOOT.sweep * REBOOT.rise.start + REBOOT.rise.time;
const sinceRise = (fx, now) => now - fx.at - REBOOT.sweep * REBOOT.rise.start;
// Whether the return is still playing, whether the ship is still drawn by drawRisingShip, and whether the pilot's hands are off.
export const respawning = (fx, now) => fx.at !== null && now - fx.at < respawnLength();
export const handsOff = (fx, now) => respawning(fx, now) && sinceRise(fx, now) < REBOOT.rise.hands;

// The ship's rise at `now`: px under its place, its size's share and its ink's, or null once it stands there.
export function riseOf(fx, now) {
  if (!respawning(fx, now)) return null;
  const R = REBOOT.rise, e = sinceRise(fx, now);
  if (e <= 0) return { dy: R.from, scale: R.small, alpha: 0 };
  const z = R.zeta, root = Math.sqrt(1 - z * z), wd = Math.PI / R.peak, w = wd / root;
  const s = 1 - Math.exp(-z * w * e) * (Math.cos(wd * e) + (z / root) * Math.sin(wd * e));
  const f = Math.min(1, e / R.fade);
  return { dy: R.from * (1 - s), scale: R.small + (1 - R.small) * Math.min(1, s), alpha: f * f * (3 - 2 * f) };
}

// The sweep over the frame just drawn on `r` (the game's renderer): the kept frame ahead of the front, the flicker at it.
export function drawReboot(r, fx, now) {
  if (fx.at === null) return;
  const e = now - fx.at;
  if (e < 0 || e >= REBOOT.sweep) return;
  const ctx = r.ctx, W = r.width, H = r.height, cw = r.cellW, chH = r.cellH, dpr = r.dpr || 1;
  const rows = Math.ceil(H / chH), cols = Math.ceil(W / cw), { sx, sy } = fx.corner, lean = REBOOT.lean;
  const f = (e / REBOOT.sweep) * (1 + REBOOT.band + REBOOT.ragged);
  // Row j's front, as a share of the width from the corner's side.
  const front = (j, at) => {
    const v = sy > 0 ? (j + 0.5) / rows : 1 - (j + 0.5) / rows;
    return (at - (1 - lean) * v - (hash(j, fx.seed, 3) - 0.5) * REBOOT.ragged) / lean;
  };
  const px = (u) => (sx > 0 ? u * W : W - u * W);
  if (fx.shot && fx.kept) {
    ctx.save();
    ctx.beginPath();
    for (let j = 0; j < rows; j++) {
      const x = Math.max(0, Math.min(W, px(front(j, f)))), y = j * chH;
      if (sx > 0) ctx.rect(x, y, W - x, chH); else ctx.rect(0, y, x, chH);
    }
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(fx.shot, 0, 0);
    ctx.restore();
    void dpr;
  }
  const ink = REBOOT.ink, tick = Math.floor(e / REBOOT.tick), G = REBOOT.glyphs;
  for (let j = 0; j < rows; j++) {
    const u1 = front(j, f), u0 = front(j, f - REBOOT.band);
    let i0 = Math.floor(Math.max(0, Math.min(u0, u1)) * cols), i1 = Math.ceil(Math.min(1, Math.max(u0, u1)) * cols);
    if (i1 <= i0) continue;
    const y = j * chH;
    const left = sx > 0 ? i0 * cw : W - i1 * cw, width = (i1 - i0) * cw;
    for (let i = i0; i < i1; i++) {
      const g = G[Math.floor(hash(i, j, tick + fx.seed) * G.length)];
      const x = (sx > 0 ? i * cw : W - (i + 1) * cw) + cw / 2;
      r.glyphNow(g, x, y + chH / 2, ink, 1);
    }
  }
}

// The renderer drawing glyphs at once under the canvas's transform, its ink's alpha times `fade` (pause-toy.js's way).
function immediate(r, fade) {
  const now = Object.create(r);
  now.glyph = (ch, x, y, color, alpha = 1, size = 1) => r.glyphNow(ch, x, y, color, alpha * fade, size);
  now.glyphRot = (ch, x, y, angle, color, alpha = 1, size = 1) => {
    if (ch === ' ' || alpha * fade <= 0.02) return;
    const ctx = r.ctx;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); r.glyphNow(ch, 0, 0, color, alpha * fade, size); ctx.restore();
  };
  now.flush = () => {};
  return now;
}

// The ship coming up at its place `x`, `y` on the screen (the world's ship is hidden meanwhile), its engine lit as it rises.
export function drawRisingShip(r, fx, now, world, x, y, { reducedMotion = false } = {}) {
  const rise = riseOf(fx, now), ship = world?.ship;
  if (!rise || !ship || rise.alpha <= 0.01) return;
  const dt = fx.motionAt === null ? 0 : Math.min(0.1, Math.max(0, now - fx.motionAt));
  fx.motionAt = now;
  stepShipMotion(fx.motion, { thrust: rise.dy > 6, retro: false, turn: 0, brake: false, speed: 300 }, dt);
  const ctx = r.ctx, at = { x, y: y + rise.dy };
  ctx.save();
  ctx.translate(at.x, at.y); ctx.scale(rise.scale, rise.scale); ctx.translate(-at.x, -at.y);
  const proxy = Object.create(ship, { invuln: { value: 0 }, thrusting: { value: false }, retroing: { value: false } });
  const inks = flownShipInks(world);
  drawPilotShip(immediate(r, rise.alpha), proxy, at.x, at.y, fx.motion, inks.ink, inks.paint, { reducedMotion, scramble: scrambleOf(fx, ship) });
  ctx.restore();
}
