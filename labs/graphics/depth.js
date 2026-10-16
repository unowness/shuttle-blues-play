// The mouse leans the world (SX, 2026-10-02: «когда мышкой в открытом мире кружишь ты управляешь паралаксом, который из всех
// слоев мира состоит, чтобы получалось такое объемное изображение»). The numbers are CONFIG.depth's; what leans how is said
// there. The world reads the lean in px (World.lean) and slides its stars and bodies by it; the dust in front is drawn here.
//
// What makes it read as volume rather than a picture sliding (the usual mouse parallax and the "3D photo" both work so):
// - One plane does not move: the ship's, which is also everything played on. The eye goes round it, so what is behind
//   slides with the pointer and what is in front against it. Two directions at once read as depth; layers that all
//   slide one way by different amounts read as cut-out cards.
// - Many depths, not three: each star has its own within its layer (CONFIG.starfield.lookSpread), the planets one between
//   the stars and the ship, the dust its own in front.
// - Not 1:1 with the hand: the lean follows its aim on a damped spring (weight, a little swing, no jitter), the pointer
//   near the ship leans little and the window's edge eases off instead of stopping.
// - Small: the far stars move at most `reach` of the window's shorter side, and the interface never moves.
// - Gone when the pointer leaves the window and for reduced motion. Kept under a pop-up since SX's word of 2026-10-16 («параллакс окна
//   относительно фона»): the window still, the world leaning behind it (labs/graphics/flight-frame.js); gone there until then.
//
// The player sets three (SX, 2026-10-02: «в меню геймплея должна быть настройка паралакса сила реакции дальность слоев и
// количество движения в целом»), under the pause's GAMEPLAY SETTINGS, ten steps each, the fifth as CONFIG.depth has it:
// - REACTION, how quickly the lean follows the pointer: the spring's rate, n / 5 of `omega` (its swing kept);
// - LAYERS, how far apart the layers stand: each behind the flight's plane leans its `look` to the power n / 5 (the far
//   stars keep the whole reach, the nearer ones fall toward the plane as it grows and toward the far ones as it shrinks),
//   the dust before it n / 5 of its `look`, and each star's own depth in its layer n / 5 of its spread (src/starfield.js);
// - AMOUNT, how far everything leans: n / 5 of `reach`; 0 is no lean at all.
import { CONFIG } from '../../src/config.js';
import { mulberry32, wrapCentered } from '../../src/util.js';
import { leanLook, leanDepth } from '../../src/starfield.js';
import { readGameplay, writeGameplay } from './gameplay-settings.js';

export const LEAN_STEPS = 10;
const LEAN_START = 5;
export const LEAN_SETTINGS = Object.freeze([
  { id: 'reaction', label: 'RESPONSE', mute: false },
  { id: 'layers', label: 'DEPTH', mute: false },
  { id: 'amount', label: 'MOTION', mute: true },
]);
const fitStep = (n, least) => (Number.isFinite(n) ? Math.max(least, Math.min(LEAN_STEPS, Math.round(n))) : LEAN_START);

export function createLean(settings = {}) {
  return { aim: { x: 0, y: 0 }, at: { x: 0, y: 0 }, v: { x: 0, y: 0 }, px: { x: 0, y: 0, layers: 1 }, inside: false,
    settings: Object.fromEntries(LEAN_SETTINGS.map((s) => [s.id, fitStep(settings[s.id], s.mute ? 0 : 1)])) };
}

// The steps kept in this browser ({ reaction, layers, amount }), and one of them set and kept.
export function readLeanSettings(store) {
  return readGameplay(store).lean ?? {};
}
export function setLeanSetting(lean, id, step, store) {
  const def = LEAN_SETTINGS.find((s) => s.id === id);
  if (!def) return;
  lean.settings[id] = fitStep(step, def.mute ? 0 : 1);
  writeGameplay({ lean: { ...lean.settings } }, store);
}

// -1..1 to -1..1: half straight, half smoothstep, so the pointer near the ship leans little and the edge is soft.
const ease = (u) => {
  const a = Math.min(1, Math.abs(u));
  return Math.sign(u) * (0.5 * a + 0.5 * a * a * (3 - 2 * a));
};

// The pointer at (x, y) in the frame's px: -1..1 each way, from the ship's place (r.cx, r.cy) to the window's edge.
export function aimLean(lean, r, x, y) {
  const ux = x < r.cx ? (x - r.cx) / Math.max(1, r.cx) : (x - r.cx) / Math.max(1, r.width - r.cx);
  const uy = y < r.cy ? (y - r.cy) / Math.max(1, r.cy) : (y - r.cy) / Math.max(1, r.height - r.cy);
  lean.aim.x = ease(ux);
  lean.aim.y = ease(uy);
  lean.inside = true;
}

export function leaveLean(lean) { lean.inside = false; }

// One frame of `dt` s. `calm`: back to the middle on the spring (a pop-up open, the pointer gone); `still`: at the middle
// at once (reduced motion). Returns the lean in px at the far stars.
export function stepLean(lean, dt, r, { calm = false, still = false } = {}) {
  const D = CONFIG.depth, set = lean.settings ?? {};
  const k = (id) => (set[id] ?? LEAN_START) / LEAN_START;
  lean.px.layers = k('layers');
  if (still || !D || !k('amount')) {
    lean.at.x = lean.at.y = lean.v.x = lean.v.y = lean.px.x = lean.px.y = 0;
    return lean.px;
  }
  const aimX = calm || !lean.inside ? 0 : lean.aim.x, aimY = calm || !lean.inside ? 0 : lean.aim.y;
  const w = D.omega * k('reaction'), z = D.zeta;
  // In slices of 1/120 s, so a slow frame does not throw the spring.
  for (let left = Math.min(dt, 0.1); left > 1e-6;) {
    const h = Math.min(left, 1 / 120);
    lean.v.x += (w * w * (aimX - lean.at.x) - 2 * z * w * lean.v.x) * h;
    lean.v.y += (w * w * (aimY - lean.at.y) - 2 * z * w * lean.v.y) * h;
    lean.at.x += lean.v.x * h;
    lean.at.y += lean.v.y * h;
    left -= h;
  }
  const reach = D.reach * k('amount') * Math.min(r.width, r.height);
  lean.px.x = lean.at.x * reach;
  lean.px.y = lean.at.y * reach * D.vertical;
  return lean.px;
}

// The dust in front of the flight's plane (CONFIG.depth.dust): a few specks in the sky's own wrapped tile, running past
// faster than the rocks as the camera moves and leaning against the pointer. Drawn at once, after the world's glyphs
// are flushed, so it is over the ship and under the interface.
let dust = null;
function makeDust(D) {
  const rng = mulberry32(20261002);
  const spread = CONFIG.starfield.lookSpread ?? 0;
  return Array.from({ length: D.count }, () => ({
    nx: rng() - 0.5,
    ny: rng() - 0.5,
    ch: D.glyphs[(rng() * D.glyphs.length) | 0],
    size: D.size[0] + rng() * (D.size[1] - D.size[0]),
    alpha: D.alpha[0] + rng() * (D.alpha[1] - D.alpha[0]),
    depth: 1 + (rng() - 0.5) * spread,
  }));
}

export function drawDust(r, world, lean, ink) {
  const D = CONFIG.depth?.dust;
  if (!D?.count) return;
  if (!dust || dust.length !== D.count) dust = makeDust(D);
  const cam = world.skyCamera();
  const tile = r.diagonal * CONFIG.starfield.tileScale;
  const look = leanLook(D.look, lean?.layers), lx = (lean?.x ?? 0) * look, ly = (lean?.y ?? 0) * look;
  for (const s of dust) {
    const depth = leanDepth(s.depth, lean?.layers);
    const x = r.cx + wrapCentered(s.nx * tile - cam.x * D.parallax, tile) + lx * depth;
    const y = r.cy + wrapCentered(s.ny * tile - cam.y * D.parallax, tile) + ly * depth;
    if (!r.onScreen(x, y)) continue;
    r.glyphNow(s.ch, x, y, ink, s.alpha, s.size);
  }
}
