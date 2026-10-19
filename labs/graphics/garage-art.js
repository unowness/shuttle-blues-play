// The pilot's home garage, drawn (src/home.js has where it stands and how the ship docks in it).
//
// SX's pick, round three of labs/graphics/sketches/garage-setting.js, the S0 tile (2026-10-01: «Вот этот гараж берем»): an
// asteroid's lumpy rock swaying in its light, with a cube set into it whose corners stand out of the stone as plates with lamps, a
// dish seen from above on the stone's face, and the berth cut into the stone from below: the door in its back wall, the stop's four
// corner marks, the threshold with a lamp at each end, a crane, the bridge from the left wall and the hose from the right.
//
// Then SX's edits (labs/graphics/sketches/garage-edits.html, 2026-10-04: «на 10-15% перебор с детализацией ... закрас тени до сих пор
// не отображает рельеф ... бак с топливом по другому закрепленный, и тот что слева сделал бы стеклянную оранжерею»; his pick, «Берем
// вот такие»): H7 TETHERED + T6 SET IN with what every edit shares, built by chat G:
//   the stone shaded by the rocks' own relief (labs/graphics/art-tones.js ROCK_RELIEF: dents, knobs and grain, each the rocks' size
//   in cells, so no crescent), its outline at the rocks' strength (ROCK_EDGE);
//   less detail: the rivets beside the corner lamps, the warm plating in the cube's corners and the dish's bowl of shade gone;
//   the solar wing gone, and on the left a small glass greenhouse with plants, let out on a tether as cargo is towed, swinging on
//   it «как груз мотаться, как брелочек»: pulled softly to its place, held by its tether, its tether end turning late toward the
//   wall (HANG), so it swings with what the garage does (about 24° either way at the float's 8°);
//   the fuel tank set into the stone as the cube is, only its round end out, its oil the loose oil's drops (src/tankOil.js, chat
//   H's, the tanker droid's too: they wobble, lag behind as the garage moves, draw together and run into one), more of it and a
//   step lighter («Воды побольше ... ее посветлее»: 4.5 units, the loose oil's inks a step up); it shrinks as the hose fills a
//   ship and is thrown apart as the pump starts.
//
// A board of 64 x 29 cells, drawn at the stations' scale (LOOK_SCALE) through the same renderer the looks are. What does not change
// from frame to frame is made once: the stone (its outline, walls and shading) only when the rock has turned a step (`SWAY_STEP`),
// and the parts are drawn every frame over it. The greenhouse and the oil keep a state of their own beside the drawing (a look,
// never the world's), stepped by the world's time as they are drawn.

import { CONFIG } from '../../src/config.js';
import { TAU, fbmWrapped, mulberry32, lerp } from '../../src/util.js';
import { planetHue } from '../../src/sectors.js';
import { BOARD, NOTCH, BERTH, berthOf } from '../../src/home.js';
import { ROLES } from '../../src/roles.js';
import { planetTones, ROCK_SHADE, ROCK_LIT, SHADE_GAP, ROCK_EDGE, ROCK_RELIEF } from './art-tones.js';
import { Layer } from './station-art.js';
import { TANK_OIL, createTankOil, splitTankOil, stepTankOil, drawTankOil } from '../../src/tankOil.js';

const A = 0.6;                                           // a cell's width over its height, as the sketch's boards are
const MAT = ROLES.material, STR = ROLES.structure, HI = ROLES.highlight, DIM = ROLES.textHint, GO = ROLES.stationLit;   // the berth lit while docked: the green it had (SX, 2026-10-20, kept the stations)
const OIL = ROLES.structure;                             // the oil on the hose (src/oil.js)
const OIL_DEEP = '#2C5290';
const HUE = ROLES.brakeActive;                           // amber: the garage's warm light
// The plants' green: GREEN ROOM's, a planet the world already has (src/sectors.js), not a new ink.
const LEAF_HUE = '#72A843';

// The tones of the garage's two hues, made when first wanted: world-art.js (planetTones) is still being evaluated when
// this module is, through station-art.js.
let tones = null;
const TONE = () => (tones ||= { warm: planetTones(planetHue(HUE)), leaf: planetTones(planetHue(LEAF_HUE)) });

// Every ink the garage draws that is not one of the palette's roles: its two hues' tones, the oil's deep blue and the tank's oil
// (checks/graphics-lab.mjs holds the world's inks to the roles and these).
export function homeInks() {
  const t = TONE();
  return new Set([...Object.values(t.warm), ...Object.values(t.leaf), OIL_DEEP,
    ...[TANK_OIL.heartCell, TANK_OIL.bodyCell, TANK_OIL.darkCell, TANK_OIL.rimCell].map((c) => c.ink)]);
}

const EDGE = { '╵': 1, '╶': 2, '╷': 4, '╴': 8, '─': 10, '│': 5, '┌': 6, '┐': 12, '└': 3, '┘': 9,
  '├': 7, '┤': 13, '┬': 14, '┴': 11, '┼': 15 };
const GLYPH = Object.fromEntries(Object.entries(EDGE).map(([c, b]) => [b, c]));
const ROUND = { 6: '╭', 12: '╮', 3: '╰', 9: '╯' };
const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;
const STEPS = [[0, -1, UP, DOWN], [1, 0, RIGHT, LEFT], [0, 1, DOWN, UP], [-1, 0, LEFT, RIGHT]];

// A box of strokes into a layer, its corners round if asked.
function frame(D, x0, y0, w, h, ink, round = false) {
  const put = (x, y, b) => D.put(x, y, (round && ROUND[b]) || GLYPH[b], ink);
  for (let i = 0; i < w; i++) {
    const side = (i > 0 ? LEFT : 0) | (i < w - 1 ? RIGHT : 0), corner = i === 0 || i === w - 1;
    put(x0 + i, y0, side | (corner ? DOWN : 0));
    put(x0 + i, y0 + h - 1, side | (corner ? UP : 0));
  }
  for (let j = 1; j < h - 1; j++) { put(x0, y0 + j, UP | DOWN); put(x0 + w - 1, y0 + j, UP | DOWN); }
}

// ---- the rock ------------------------------------------------------------------------------------------

// The stone's outline, a radius for every direction in the rock's own measure (rows, across stretched so the box is
// square in it and its corners stand at the diagonals): a four-fold swell lifts the stone over the cube's sides and pulls
// it in at the corners (`four`), a few long waves make it lopsided. Every term is a cosine: nothing sharp.
function rock({ cx, cy, R, stretch, four = 0, waves = [] }) {
  const lumps = (th) => {
    let f = 1 + four * Math.cos(4 * th);
    for (const w of waves) f += w.a * Math.cos(w.n * th + w.ph);
    return f;
  };
  return { cx, cy, R, stretch, radius: (th) => R * lumps(th) };
}
const W1 = (n, a, ph) => ({ n, a, ph });
// The rock in its own measure: `u` across (stretched), `v` down, both in rows.
function rockPoint(k, x, y) {
  const u = (x - k.cx) * A / k.stretch, v = y - k.cy;
  return { u, v, d: Math.hypot(u, v) };
}
const LIGHT = (() => {
  const L = CONFIG.planet.light, n = Math.hypot(L.x, L.y, L.z);
  return { x: L.x / n, y: L.y / n, z: L.z / n };
})();

// The cube set into the stone, 37 cells by 19 rows (square in the stone's measure), and the parts round it.
const CUBE = { x0: 13, y0: 5, x1: 49, y1: 23 };
const PARTS = { caps: { w: 5, h: 3 }, dish: { x: 23, y: 12 } };
// The tank set into the stone (T6): its frame, of which the stone hides all but the round end.
const TANK = Object.freeze({ x0: 49, y0: 11, w: 13, h: 5 });
// The greenhouse at rest (H7): its middle, how far its tether's end is from it (cells across), the tether's end on the cube's
// left wall, its glass (a box with one mullion) and its plants.
const GH = Object.freeze({ cx: 3, cy: 22.5, attach: 3.5, anchor: Object.freeze({ x: 12.5, y: 22 }), w: 7, h: 4, plants: Object.freeze(['T,b y']) });
// How the greenhouse hangs: the pull to its place and the drag on it (1/s^2, 1/s), the turn of its tether end toward the wall and
// the drag on that (SX's G11: softer than at first, so at the float's 8° it still swings, about 24° either way, slowly).
export const HANG = Object.freeze({ pull: 0.08, drag: 0.05, turn: 0.7, turnDrag: 0.2, slack: 1.08 });
// The oil in the tank: 4.5 units (the loose oil's unit is CONFIG.asteroid.drops.oil.unit), down by `drawn` of it when the hose has
// filled a ship (it fills again as the ship leaves).
const TANK_FILL = Object.freeze({ units: 4.5, drawn: 0.35 });
// The stone's relief: the rocks' own (ROCK_RELIEF), its dents, knobs and grain the rocks' size in cells on a stone `scale` times a
// big rock's (more of them, each smaller in the stone's radii), from `seed`.
const RELIEF = Object.freeze({ seed: 7, scale: 1.6 });
const ROCK = rock({ cx: 31, cy: 14, R: 10.6, stretch: 1.2, four: 0.1, waves: [W1(2, 0.075, 1.6), W1(3, 0.03, 0.4)] });
// The rock turns a little either way over `period` seconds, the light the other way by `light` times that: the stone's
// outline moves like an asteroid's and the shaded side follows the light. The turn is taken in steps of SWAY_STEP rad
// (0.2 of a cell at the rim): the stone is remade only when the step changes. A garage that floats (src/float.js) turns whole
// instead, and its stone keeps still in it (`floatSway`).
const SWAY = { turn: 0.16, light: 1.4, period: 30 };
export const SWAY_STEP = 0.01;
const MIDX = (BOARD.W - 1) / 2, MIDY = (BOARD.H - 1) / 2;

// ---- the stone, made once a step ---------------------------------------------------------------------------

export function prepareHome() {
  const { W, H } = BOARD;
  const g = { W, H, SW: W + 2, SH: H + 2, rock: ROCK, D: new Layer(W, H), stoneKey: null, relief: reliefOf(RELIEF.seed, RELIEF.scale) };
  g.samples = new Uint8Array(g.SW * g.SH);
  g.cov = new Uint8Array(W * H);          // the stone covers the whole cell
  g.bits = new Uint8Array(W * H);         // the outline's and the walls' strokes (their bits join, ┌ ─ ┐)
  g.wall = new Uint8Array(W * H);
  g.stone = new Uint8Array(W * H);        // a stroke of the stone's own outline (not a wall, not the berth's metal)
  g.ink = new Array(W * H);
  g.outCh = new Array(W * H).fill(null);   // what the stone shows in a stroke's cell
  g.shadeCh = new Array(W * H).fill(null); // and in a cell inside it: the shading, before a part's room is taken out
  g.shadeAlpha = new Float64Array(W * H);
  g.keep = new Uint8Array(W * H);          // cells a part stands on this frame
  g.round = new Set(corners().map((c) => c.y * W + c.x));    // the cube's outer corners are rounded, as a flight case's are
  g.covered = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g.cov[y * W + x] === 1;
  return g;
}

// The cube's four corners in stepping order (TL, TR, BR, BL), each with the way into the box.
function corners() {
  const b = CUBE;
  return [{ x: b.x0, y: b.y0, sx: 1, sy: 1 }, { x: b.x1, y: b.y0, sx: -1, sy: 1 },
    { x: b.x1, y: b.y1, sx: -1, sy: -1 }, { x: b.x0, y: b.y1, sx: 1, sy: -1 }];
}
const inNotch = (x, y) => x > NOTCH.x0 && x < NOTCH.x1 && y > NOTCH.y0;

// The rock's turn at time t, in steps, and the light's direction for it.
export function swayAt(t) {
  const step = Math.round(SWAY.turn * Math.sin(TAU * t / SWAY.period) / SWAY_STEP);
  const turn = step * SWAY_STEP, w = -SWAY.light * turn, c = Math.cos(w), s = Math.sin(w);
  return { key: step, turn, light: { x: LIGHT.x * c - LIGHT.y * s, y: LIGHT.x * s + LIGHT.y * c, z: LIGHT.z } };
}
// A garage turned whole by `angle` (the float): its stone still in it, the sky's light turned back by the turn (in SWAY_STEP steps).
function floatSway(angle) {
  const step = Math.round(angle / SWAY_STEP), w = -step * SWAY_STEP, c = Math.cos(w), s = Math.sin(w);
  return { key: `f${step}`, turn: 0, light: { x: LIGHT.x * c - LIGHT.y * s, y: LIGHT.x * s + LIGHT.y * c, z: LIGHT.z } };
}

// A cell at least `cells` in from the outline, measured along its own direction as shadeAsteroid measures its gap.
function insideBy(k, x, y, turn, cells) {
  const p = rockPoint(k, x, y), edge = k.radius(Math.atan2(p.v, p.u) - turn);
  const ux = p.d > 1e-6 ? p.u / p.d : 0, uy = p.d > 1e-6 ? p.v / p.d : 0;
  return p.d <= edge - cells * Math.hypot(A / k.stretch * ux, uy);
}
// A wall or the berth's lining within a cell, in the cells the stone makes.
function nearLining(g, x, y) {
  const { W, H } = g;
  if (x >= NOTCH.x0 - 1 && x <= NOTCH.x1 + 1 && y >= NOTCH.y0 - 1) return true;
  for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
    if (xx >= 0 && yy >= 0 && xx < W && yy < H && g.wall[yy * W + xx]) return true;
  }
  return false;
}

// The rocks' relief made for the garage's stone (labs/graphics/world-art.js shadeAsteroid, ROCK_RELIEF): dents and knobs in the
// stone's own frame, so they turn with its outline, and the fine grain, each tilting the ball's light.
function reliefOf(seed, scale = 1, RR = ROCK_RELIEF) {
  const rng = mulberry32(seed);
  const n = Math.round((RR.bumps[0] + Math.floor(rng() * (RR.bumps[1] - RR.bumps[0] + 1))) * scale * scale);
  const bumps = [];
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, at = Math.sqrt(rng()) * 0.78;
    bumps.push({ x: Math.cos(a) * at, y: Math.sin(a) * at, s: lerp(RR.size[0], RR.size[1], rng()) / scale,
      h: (rng() < RR.knobs ? 1 : -1) * (0.6 + 0.4 * rng()) });
  }
  return { bumps, gx: rng() * 64, gy: rng() * 64, grain: RR.grain / scale };
}
function grainAt(x, y) {
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
  const h = (a, b) => {
    let q = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
    q = Math.imul(q ^ (q >>> 13), 1274126177) >>> 0;
    return ((q ^ (q >>> 16)) >>> 0) / 4294967296;
  };
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const p = h(i, j), q = h(i + 1, j), w = h(i, j + 1), z = h(i + 1, j + 1);
  return p + (q - p) * su + (w - p) * sv + (p - q - w + z) * su * sv;
}

// The stone's shading in a cell, the game's rocks' own light: a black gap of SHADE_GAP cells to the outline along its own direction,
// then one step, the rocks' ░, where the ball's light (kept at RR.ball of itself, pulled toward RR.level) and the relief's tilt and
// grain leave it under ROCK_LIT; none in the light.
function shadeAt(g, x, y, turn, light) {
  const k = g.rock;
  if (!insideBy(k, x, y, turn, SHADE_GAP) || nearLining(g, x, y)) return null;
  const p = rockPoint(k, x, y), edge = k.radius(Math.atan2(p.v, p.u) - turn);
  const ux = p.d > 1e-6 ? p.u / p.d : 0, uy = p.d > 1e-6 ? p.v / p.d : 0;
  const q = p.d / edge, z = Math.sqrt(Math.max(0, 1 - q * q));
  const ball = p.d > 1e-6 ? Math.max(0, ux * q * light.x + uy * q * light.y + z * light.z) : light.z;
  const RR = ROCK_RELIEF, { bumps, gx, gy, grain } = g.relief;
  let lit = RR.level + (ball - RR.level) * RR.ball;
  const ca = Math.cos(turn), sa = Math.sin(turn), kk = q / Math.max(p.d, 1e-6);
  const px = (p.u * ca + p.v * sa) * kk, py = (-p.u * sa + p.v * ca) * kk;
  const lx = light.x * ca + light.y * sa, ly = -light.x * sa + light.y * ca;
  let tilt = 0;
  for (const b of bumps) {
    const dx = (px - b.x) / b.s, dy = (py - b.y) / b.s, d2 = dx * dx + dy * dy;
    if (d2 >= 1) continue;
    tilt += b.h * 4 * (1 - d2) * (dx * lx + dy * ly) / b.s * 0.1;
  }
  lit += (tilt * RR.strength + (grainAt(px / grain + gx, py / grain + gy) - 0.5) * 2 * RR.grit) * (0.35 + 0.65 * z);
  return lit > ROCK_LIT ? null : ROCK_SHADE.half;
}

function buildStone(g, sway) {
  const { W, H, SW } = g, k = g.rock, { turn, light } = sway;
  // Sample cells: (i, j) has its middle at (i + 0.5, j + 0.5); stored with a border of one all round.
  const S = g.samples;
  for (let j = -1; j <= H; j++) for (let i = -1; i <= W; i++) {
    const x = i + 0.5, y = j + 0.5, p = rockPoint(k, x, y);
    S[(j + 1) * SW + i + 1] = p.d <= k.radius(Math.atan2(p.v, p.u) - turn) && !inNotch(x, y) ? 1 : 0;
  }
  const has = (i, j) => S[(j + 1) * SW + i + 1] === 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    g.cov[y * W + x] = has(x - 1, y - 1) && has(x, y - 1) && has(x - 1, y) && has(x, y) ? 1 : 0;
  }
  const covered = g.covered, bits = g.bits, wall = g.wall, ink = g.ink;
  bits.fill(0); wall.fill(0); g.stone.fill(0);
  // The outline: on the corners of the sample cells, which are the board's cells.
  const join = (x, y, b) => { if (x >= 0 && y >= 0 && x < W && y < H) bits[y * W + x] |= b; };
  for (let j = -1; j <= H; j++) for (let i = -1; i <= W; i++) {
    if (!has(i, j)) continue;
    if (!has(i, j - 1)) { join(i, j, RIGHT); join(i + 1, j, LEFT); }
    if (!has(i, j + 1)) { join(i, j + 1, RIGHT); join(i + 1, j + 1, LEFT); }
    if (!has(i - 1, j)) { join(i, j, DOWN); join(i, j + 1, UP); }
    if (!has(i + 1, j)) { join(i + 1, j, DOWN); join(i + 1, j + 1, UP); }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!bits[y * W + x]) continue;
    const p = rockPoint(k, x, y);
    const metal = (x === NOTCH.x0 || x === NOTCH.x1) && y >= NOTCH.y0 || y === NOTCH.y0 && x >= NOTCH.x0 && x <= NOTCH.x1;
    ink[y * W + x] = metal ? MAT : p.u * light.x + p.v * light.y > 0 ? MAT : STR;
    g.stone[y * W + x] = metal ? 0 : 1;
  }
  // The cube's walls where they are out of the stone, and never across the berth.
  const putWall = (x, y, w) => {
    if (x < 0 || y < 0 || x >= W || y >= H || covered(x, y) || inNotch(x, y)) return;
    wall[y * W + x] |= w;
  };
  const b = CUBE;
  for (let x = b.x0; x <= b.x1; x++) {
    const side = (x > b.x0 ? LEFT : 0) | (x < b.x1 ? RIGHT : 0);
    putWall(x, b.y0, side | (x === b.x0 || x === b.x1 ? DOWN : 0));
    putWall(x, b.y1, side | (x === b.x0 || x === b.x1 ? UP : 0));
  }
  for (let y = b.y0 + 1; y < b.y1; y++) { putWall(b.x0, y, UP | DOWN); putWall(b.x1, y, UP | DOWN); }
  // The corners' caps: a plate inside each corner, its inner edges joining the walls.
  for (const c of corners()) {
    const { w, h } = PARTS.caps, ix = c.x + c.sx * (w - 1), iy = c.y + c.sy * (h - 1);
    for (let kk = 1; kk < w; kk++) {
      const x = c.x + c.sx * kk;
      putWall(x, iy, (kk < w - 1 ? LEFT | RIGHT : 0) | (kk === w - 1 ? (c.sx > 0 ? LEFT : RIGHT) | (c.sy > 0 ? UP : DOWN) : 0) | (kk === 1 ? (c.sx > 0 ? LEFT : RIGHT) : 0));
    }
    for (let kk = 1; kk < h - 1; kk++) putWall(ix, c.y + c.sy * kk, UP | DOWN);
    putWall(c.x, iy, c.sx > 0 ? RIGHT : LEFT);
    putWall(ix, c.y, c.sy > 0 ? DOWN : UP);
  }
  // A wall stops where the stone covers its next cell, and joins the outline where they meet.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!wall[i]) continue;
    for (const [dx, dy, out, back] of STEPS) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) { wall[i] &= ~out; continue; }
      const j = yy * W + xx;
      if ((wall[i] & out) && !wall[j] && !bits[j]) wall[i] &= ~out;
      if (!(wall[i] & out) && ((bits[j] | wall[j]) & back)) wall[i] |= out;
    }
  }
  for (let i = 0; i < W * H; i++) if (wall[i]) { bits[i] |= wall[i]; ink[i] = MAT; g.stone[i] = 0; }
  // What the stone shows: a stroke's glyph (the stone's corners where the berth opens, and the cube's own, are round),
  // else, inside it, the shading.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    g.outCh[i] = null; g.shadeCh[i] = null;
    if (bits[i]) {
      const mouthCorner = y >= NOTCH.y0 + BERTH.mouth - 1 && (x >= NOTCH.x0 - 3 && x <= NOTCH.x0 + 1 || x >= NOTCH.x1 - 1 && x <= NOTCH.x1 + 3);
      g.outCh[i] = ((mouthCorner || g.round.has(i)) && ROUND[bits[i]]) || GLYPH[bits[i]];
    } else if (covered(x, y)) {
      const s = shadeAt(g, x, y, turn, light);
      if (s) { g.shadeCh[i] = s.ch; g.shadeAlpha[i] = s.alpha; }
    }
  }
  g.stoneKey = sway.key;
}

// ---- every cell the garage shows -----------------------------------------------------------------------------

// Every cell the board shows at time t with the docking state `st` (src/home.js dockState), as fn(x, y, ch, ink, alpha, moving):
// the parts, else the outline and walls, else the stone's shading; `moving` says the cell is a part's. `sway`: the stone's turn and
// light (swayAt(t), or floatSway when the whole garage turns). The greenhouse and the oil are drawn apart (drawHome).
export function homeCells(g, t, st, fn, sway = swayAt(t)) {
  const { W, H } = g;
  if (g.stoneKey !== sway.key) buildStone(g, sway);
  const D = g.D;
  D.clear();
  drawParts(g, D, t, st);
  for (let i = 0; i < W * H; i++) g.keep[i] = D.ch[i] !== null ? 1 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (D.ch[i] !== null) { if (D.ch[i] !== ' ') fn(x, y, D.ch[i], D.ink[i], D.al[i], true); continue; }
    if (g.outCh[i] !== null) { fn(x, y, g.outCh[i], g.ink[i], g.stone[i] ? ROCK_EDGE : 1, false); continue; }
    if (g.shadeCh[i] === null) continue;
    // A part's cell and the ring of cells round it keep the shading off.
    let near = false;
    for (let yy = y - 1; yy <= y + 1 && !near; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && g.keep[yy * W + xx]) { near = true; break; }
    }
    if (!near) fn(x, y, g.shadeCh[i], STR, g.shadeAlpha[i], false);
  }
}

// The stone's extent over a whole turn of its sway, in cells: the box the solid body is measured from.
export function stoneExtent(g = prepareHome()) {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let s = -Math.round(SWAY.turn / SWAY_STEP); s <= Math.round(SWAY.turn / SWAY_STEP); s++) {
    const sway = { key: s, turn: s * SWAY_STEP, light: LIGHT };
    buildStone(g, sway);
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      if (g.outCh[y * g.W + x] === null && g.cov[y * g.W + x] !== 1) continue;
      if (x >= CUBE.x0 && x <= CUBE.x1 && y >= CUBE.y0 && y <= CUBE.y1 && !g.cov[y * g.W + x] && !g.bits[y * g.W + x]) continue;
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
    }
  }
  g.stoneKey = null;
  return box;
}

// ---- the parts -----------------------------------------------------------------------------------------

function drawParts(g, D, t, st) {
  const covered = g.covered;
  berth(g, D, t, st);
  dish(g, D, t, st);
  tank(g, D, covered);
  capLamps(g, D, t, st, covered);
}

// Each cap is a plate across the corner. Three hold a lamp (the rivets beside them gone, SX's edits), the lamps stepping round
// the cube corner to corner as WHEEL's port lights step round its rim (green while a ship is in the berth); the fourth, over the
// room, is glass with the room's warm light under it.
function capLamps(g, D, t, st, covered) {
  const lit = Math.floor(t * 1.6) % 3, warm = TONE().warm;
  let n = 0;
  corners().forEach((c, k) => {
    const y = c.y + c.sy, cells = [1, 2, 3].map((i) => c.x + c.sx * i);
    if (k === 1) {
      cells.forEach((x, i) => {
        if (covered(x, y)) return;
        const v = fbmWrapped(x * 0.5 + t * 0.12, y * 0.8 + Math.sin(t * 0.27 + i) * 0.5, 12, 77, 3);
        D.put(x, y, v > 0.5 ? '▒' : '░', v > 0.5 ? warm.lit : warm.mid);
      });
      return;
    }
    const me = n++, x = cells[0];
    if (covered(x, y)) return;
    if (st.docked) D.put(x, y, 'o', GO);
    else D.put(x, y, me === lit ? 'o' : '·', me === lit ? HI : DIM);
  });
}

// The antenna, seen from above: a round satellite dish on the stone's face, away from its edge: its rim and the feed in the middle
// on a short Y of struts (its bowl of shade gone, SX's edits). While the pointer is on (G, `st.beacon`), rings leave it and the
// feed blinks faster.
function dish(g, D, t, st) {
  const { x: cx, y: cy } = PARTS.dish, rx = 3.2, ry = 2.9, warm = TONE().warm;
  // The rim on the corners of sample cells, as the stone's outline is, its corners rounded: a made thing.
  const has = (i, j) => (((i + 0.5) - cx) * A / rx) ** 2 + (((j + 0.5) - cy) / ry) ** 2 <= 1;
  const X0 = Math.floor(cx - rx / A) - 2, X1 = Math.ceil(cx + rx / A) + 2, Y0 = Math.floor(cy - ry) - 2, Y1 = Math.ceil(cy + ry) + 2;
  const rim = new Map(), add = (x, y, b) => rim.set(y * 1000 + x, (rim.get(y * 1000 + x) || 0) | b);
  for (let j = Y0; j <= Y1; j++) for (let i = X0; i <= X1; i++) {
    if (!has(i, j)) continue;
    if (!has(i, j - 1)) { add(i, j, RIGHT); add(i + 1, j, LEFT); }
    if (!has(i, j + 1)) { add(i, j + 1, RIGHT); add(i + 1, j + 1, LEFT); }
    if (!has(i - 1, j)) { add(i, j, DOWN); add(i, j + 1, UP); }
    if (!has(i + 1, j)) { add(i + 1, j, DOWN); add(i + 1, j + 1, UP); }
  }
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const b = rim.get(y * 1000 + x);
    if (b) D.put(x, y, ROUND[b] || GLYPH[b], MAT);
    else if (has(x - 1, y - 1) && has(x, y - 1) && has(x - 1, y) && has(x, y)) D.put(x, y, ' ', MAT);
  }
  // In the middle the little antenna: the feed on a short Y of struts.
  const fx = Math.round(cx), fy = Math.round(cy);
  D.put(fx - 1, fy - 1, '╲', MAT); D.put(fx + 1, fy - 1, '╱', MAT); D.put(fx, fy + 1, '│', MAT);
  const beacon = st.beacon === true;
  const beat = (t * (beacon ? 1.2 : 0.4)) % 1;
  D.put(fx, fy, beat < 0.15 ? '◆' : '◇', beat < 0.15 ? HI : warm.lit);
  if (!beacon) return;
  for (let k = 0; k < 2; k++) {
    const f = (t * 0.45 + k / 2) % 1, s = 1.15 + f * 0.6, alpha = 0.85 * (1 - f);
    const steps = Math.round(TAU * rx * s / 1.3);
    for (let i = 0; i < steps; i++) {
      const a = i / steps * TAU, x = Math.round(cx + Math.cos(a) * rx * s / A), y = Math.round(cy + Math.sin(a) * ry * s);
      if (D.at(x, y) === null) D.put(x, y, '·', warm.lit, alpha);
    }
  }
}

// The berth: the door in the back wall with the room's light at its seam, the marks of the place a ship stops at, the
// threshold with a lamp at each end, the crane on its rail, the bridge from the left wall, the hose from the right.
function berth(g, D, t, st) {
  const n = NOTCH, B = berthOf(), bx = Math.round(B.x), by = Math.round(B.y), mouth = n.y0 + BERTH.mouth, warm = TONE().warm;
  // The door: nothing while it is shut; opening, the back wall parts and the room's light falls out into the berth.
  const open = st.door, gap = open * 2.5;
  if (open > 0.02) for (let x = bx - 2; x <= bx + 2; x++) {
    const off = Math.abs(x - B.x);
    if (off >= gap) continue;
    D.put(x, n.y0, ' ', MAT);
    const f = 1 - off / (gap + 0.5);
    D.put(x, n.y0 + 1, f > 0.5 ? '▒' : '░', warm.lit, 0.35 + 0.5 * f * open);
  }
  // The place a ship stops: four corner marks round it, the interface's own focus marks; green while docked.
  const mx = 3, top = n.y0 + BERTH.top, bottom = n.y0 + BERTH.bottom, mark = st.docked ? GO : st.near > 0 ? HI : DIM;
  [[-mx, top, '┌'], [mx, top, '┐'], [-mx, bottom, '└'], [mx, bottom, '┘']].forEach(([dx, y, c]) => D.put(bx + dx, y, c, mark, st.near > 0 || st.docked ? 1 : 0.7));
  // The threshold across the mouth: a lamp at each end that blinks in turn (faster while a ship comes in, green while
  // one is in), and dots between that light inward, both sides to the middle, as it comes in.
  [n.x0 + 1, n.x1 - 1].forEach((x, k) => {
    const on = st.docked || Math.floor(t * (st.near > 0 ? 3 : 1.1)) % 2 === k;
    D.put(x, mouth, on ? 'o' : '·', st.docked ? GO : on ? HI : DIM);
  });
  const front = st.near > 0 && !st.docked ? (t * 1.8) % 1 : -1;
  for (let x = n.x0 + 3; x <= n.x1 - 3; x += 2) {
    const d = Math.abs(x - B.x) / (B.x - n.x0), lit = front >= 0 && Math.abs(1 - d - front) < 0.2;
    D.put(x, mouth, lit ? '•' : '·', st.docked ? GO : lit ? HI : DIM, lit || st.docked ? 1 : 0.8);
  }
  // The mending: while it runs, a short arm comes down out of the back wall to the ship's nose and sparks; at rest
  // there is nothing there.
  if (st.crane > 0.15) {
    D.put(bx, n.y0 + 1, st.crane > 0.6 ? '┃' : '╻', MAT);
    if (st.sparks) for (let k = 0; k < 4; k++) {
      const a = t * 11 + k * 1.7, r = 0.8 + 0.6 * ((t * 3 + k * 0.3) % 1);
      D.put(B.x + Math.cos(a) * r / A * 0.7, n.y0 + 2 + Math.abs(Math.sin(a)) * r * 0.6, k ? '·' : '*', k ? warm.lit : HI);
    }
  }
  // The bridge: out of the left wall at the ship's middle, a cell at a time, its clamp last.
  const shipHalf = 1.8, reach = Math.floor((B.x - shipHalf) - n.x0);
  const len = Math.round(st.bridge * reach);
  for (let k = 1; k <= len; k++) D.put(n.x0 + k, by, k === len && st.bridge > 0.98 ? '╡' : '═', k === len ? HI : MAT);
  if (len > 0) D.put(n.x0, by, '╞', MAT);
  // The hose: out of the right wall, its nozzle to the ship's flank; oil runs along it while it fills.
  const hy = by, hreach = Math.floor(n.x1 - (B.x + shipHalf)), hl = Math.round(st.hose * hreach);
  for (let k = 1; k <= hl; k++) {
    const x = n.x1 - k, drop = st.flow && ((Math.floor(k + t * 5) % 3) + 3) % 3 === 0;
    D.put(x, hy, k === hl ? '╸' : drop ? '•' : '─', drop ? OIL : MAT);
  }
  if (hl > 0) D.put(n.x1, hy, '┤', MAT);
}

// The fuel tank (T6): set into the stone as the cube is, only its round end standing out, the stone's outline in front of the rest;
// its inside left empty, where the oil shows (drawHome).
function tank(g, D, covered) {
  const { x0, y0, w, h } = TANK, ok = (x, y) => !covered(x, y) && !g.bits[y * g.W + x];
  const T = tankLayer();
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const c = T.at(x, y);
    if (c === null || !ok(x, y)) continue;
    const inner = x > x0 && x < x0 + w - 1 && y > y0 && y < y0 + h - 1;
    if (inner) D.put(x, y, ' ', MAT);
    else D.put(x, y, c, T.ink[T.index(x, y)], T.al[T.index(x, y)]);
  }
}
let tankCells = null;
function tankLayer() {
  if (tankCells) return tankCells;
  tankCells = new Layer(BOARD.W, BOARD.H);
  frame(tankCells, TANK.x0, TANK.y0, TANK.w, TANK.h, MAT, true);
  for (let y = TANK.y0 + 1; y < TANK.y0 + TANK.h - 1; y++) for (let x = TANK.x0 + 1; x < TANK.x0 + TANK.w - 1; x++) tankCells.put(x, y, ' ', MAT);
  return tankCells;
}

// ---- the greenhouse ----------------------------------------------------------------------------------------

// The plants: a stamp of rows read upward from the greenhouse's floor, each letter a plant's glyph and tone, in GREEN ROOM's green;
// light line glyphs, as the rest of the garage is drawn.
//   T Ψ a tall one   t ψ a young one   y ¥ one on a stake   b ☘ a low bush   f ⚘ a flower, in the garage's warm   , ' leaves   | a stem
const PLANT = {
  T: ['Ψ', 'lit'], t: ['ψ', 'mid'], y: ['¥', 'mid'], b: ['☘', 'mid'], f: ['⚘', 'warm'],
  ',': [',', 'rim'], "'": ["'", 'rim'], '|': ['│', 'rim'],
};
// The greenhouse's own cells from its middle (cells across and rows down): a glass box with round corners and one mullion, the
// plants on its floor, two glints on the glass.
let greenhouse = null;
function greenhouseCells() {
  if (greenhouse) return greenhouse;
  const leaf = TONE().leaf, warm = TONE().warm, W = GH.w + 2, H = GH.h + 2, D = new Layer(W, H);
  const x0 = 1, floor = GH.h, y0 = floor - GH.h + 1, x1 = x0 + GH.w - 1, mx = x0 + Math.floor(GH.w / 2);
  frame(D, x0, y0, GH.w, GH.h, MAT, true);
  D.put(mx, y0, '┬', MAT); D.put(mx, floor, '┴', MAT);
  for (let y = y0 + 1; y < floor; y++) D.put(mx, y, '│', MAT, 0.7);
  GH.plants.forEach((row, j) => [...row].forEach((c, i) => {
    const p = PLANT[c], x = x0 + 1 + i, y = floor - 1 - j;
    if (!p || D.at(x, y) !== null) return;
    D.put(x, y, p[0], p[1] === 'warm' ? warm.lit : leaf[p[1]], p[1] === 'rim' ? 0.85 : 1);
  }));
  for (const [x, y] of [[x0 + 1, y0 + 1], [x1 - 2, y0 + 1]]) if (D.at(x, y) === null) D.put(x, y, '╱', HI, 0.55);
  greenhouse = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = D.index(x, y);
    if (D.ch[i] !== null && D.ch[i] !== ' ') greenhouse.push({ x: x - (W - 1) / 2, y: y - (H - 1) / 2, ch: D.ch[i], ink: D.ink[i], al: D.al[i] });
  }
  return greenhouse;
}

// ---- what lives beside the drawing: the greenhouse on its tether, the oil in the tank -------------------------------------------

// The live parts are worked out in the px the board is drawn in at the stations' scale (a board cell `c` = { w, h }: the renderer's
// cell times CONFIG.home.scale), which are the world's units on the screen; the garage's `pose` { ox, oy, a } is how far it is off
// its place (u) and how far turned. A board point (cells) from the garage's place:
function boardAt(bx, by, pose, c) {
  const x = (bx - MIDX) * c.w, y = (by - MIDY) * c.h, cs = Math.cos(pose.a), sn = Math.sin(pose.a);
  return { x: pose.ox + x * cs - y * sn, y: pose.oy + x * sn + y * cs };
}
const REST_POSE = Object.freeze({ ox: 0, oy: 0, a: 0 });
// The part of the tank's inside that stands out of the stone at rest (the stone unturned), from the garage's middle: the oil keeps
// to it, so it is never lost behind the stone.
const tankBoxes = new Map();
function tankInside(c) {
  const key = `${c.w}x${c.h}`;
  if (tankBoxes.has(key)) return tankBoxes.get(key);
  const g = prepareHome();
  buildStone(g, { key: 'rest', turn: 0, light: LIGHT });
  let first = TANK.x0 + TANK.w - 2;
  for (let y = TANK.y0 + 1; y < TANK.y0 + TANK.h - 1; y++) for (let x = TANK.x0 + 1; x < TANK.x0 + TANK.w - 1; x++) {
    if (!g.covered(x, y) && !g.bits[y * g.W + x]) { first = Math.min(first, x); break; }
  }
  const box = { x0: (first - 0.5 - MIDX) * c.w, x1: (TANK.x0 + TANK.w - 1.5 - MIDX) * c.w,
    y0: (TANK.y0 + 0.5 - MIDY) * c.h, y1: (TANK.y0 + TANK.h - 1.5 - MIDY) * c.h };
  tankBoxes.set(key, box);
  return box;
}
const TANK_MID = Object.freeze({ x: TANK.x0 + (TANK.w - 1) / 2, y: TANK.y0 + (TANK.h - 1) / 2 });

// A garage's live parts at rest at `pose`, for a board cell `c`: the greenhouse hanging still at its place, turned to its tether, the
// oil in one drop.
export function createHomeLive(pose = REST_POSE, c = { w: 15, h: 24 }, seed = 3) {
  const home = boardAt(GH.cx, GH.cy, pose, c), anchor = boardAt(GH.anchor.x, GH.anchor.y, pose, c);
  const rest = boardAt(GH.cx, GH.cy, REST_POSE, c), restAnchor = boardAt(GH.anchor.x, GH.anchor.y, REST_POSE, c);
  const rope = Math.hypot(restAnchor.x - (rest.x + GH.attach * c.w), restAnchor.y - rest.y) * HANG.slack;
  const a = Math.atan2(anchor.y - home.y, anchor.x - home.x);
  return { c, at: null, rope, gh: { x: home.x, y: home.y, vx: 0, vy: 0, a, w: 0 },
    oil: createTankOil(tankInside(c), { units: TANK_FILL.units, seed }), tankAt: null, tankV: null, acc: { x: 0, y: 0 }, flow: false };
}
// Steps the live parts to the world's time `t` with the garage at `pose` and the docking state `st`: a step of no time, back in time
// or longer than a quarter of a second (a jump, a seam, the INFO panel's own clock) puts them at rest where the garage is.
export function stepHomeLive(live, pose, t, st) {
  const dt = live.at === null ? 0 : t - live.at;
  live.at = t;
  if (!(dt > 0) || dt > 0.25) {
    if (dt !== 0) Object.assign(live, createHomeLive(pose, live.c), { at: t });
    return;
  }
  const c = live.c;
  // The greenhouse: pulled gently toward its place, held by its tether, its tether end turning late to face the wall.
  const gh = live.gh, home = boardAt(GH.cx, GH.cy, pose, c), anchor = boardAt(GH.anchor.x, GH.anchor.y, pose, c);
  gh.vx += (HANG.pull * (home.x - gh.x) - HANG.drag * gh.vx) * dt; gh.vy += (HANG.pull * (home.y - gh.y) - HANG.drag * gh.vy) * dt;
  gh.x += gh.vx * dt; gh.y += gh.vy * dt;
  const ca = Math.cos(gh.a), sa = Math.sin(gh.a);
  const end = { x: gh.x + ca * GH.attach * c.w, y: gh.y + sa * GH.attach * c.w };
  const dx = anchor.x - end.x, dy = anchor.y - end.y, d = Math.hypot(dx, dy);
  if (d > live.rope) {
    const ux = dx / d, uy = dy / d, over = d - live.rope;
    gh.x += ux * over; gh.y += uy * over;
    const away = gh.vx * ux + gh.vy * uy;
    if (away < 0) { gh.vx -= away * ux; gh.vy -= away * uy; }
  }
  let want = Math.atan2(anchor.y - gh.y, anchor.x - gh.x) - gh.a;
  want = ((want + Math.PI) % TAU + TAU) % TAU - Math.PI;
  gh.w += (HANG.turn * want - HANG.turnDrag * gh.w) * dt; gh.a += gh.w * dt;
  // The oil: what the tank does shakes it (its middle's speeding up and turning, in the tank's own frame: the oil lags behind), the
  // hose drawing it down while it fills a ship, the pump's start throwing it apart.
  const at = boardAt(TANK_MID.x, TANK_MID.y, pose, c);
  if (live.tankAt) {
    const v = { x: (at.x - live.tankAt.x) / dt, y: (at.y - live.tankAt.y) / dt };
    if (live.tankV) {
      const k = 1 - Math.exp(-dt / 0.12);
      live.acc.x += ((v.x - live.tankV.x) / dt - live.acc.x) * k; live.acc.y += ((v.y - live.tankV.y) / dt - live.acc.y) * k;
    }
    live.tankV = v;
  }
  live.tankAt = at;
  const cs = Math.cos(-pose.a), sn = Math.sin(-pose.a);
  if (st?.flow && !live.flow) splitTankOil(live.oil);
  live.flow = !!st?.flow;
  const want2 = TANK_FILL.units * (1 - TANK_FILL.drawn * (st?.fuelled ?? 0)), have = live.oil.drops.reduce((n, q) => n + q.units, 0);
  if (have > 0 && Math.abs(want2 - have) > 1e-6) { const k = want2 / have; for (const q of live.oil.drops) q.units *= k; live.oil.units = want2; }
  stepTankOil(live.oil, dt, live.acc.x * cs - live.acc.y * sn, live.acc.x * sn + live.acc.y * cs);
}
// The live parts of every garage drawn in the world, by its station (a station seen across a seam is another instance, with its own).
const LIVE = new WeakMap();
export function homeLive(station) {
  let live = LIVE.get(station);
  if (!live) { live = { c: null }; LIVE.set(station, live); }
  return live;
}
let restLive = { c: null };

// ---- on a renderer -------------------------------------------------------------------------------------------

// The garage centred at (sx, sy), each cell `sc` times the game's glyph size, culled off the screen. `st` is the docking state
// (src/home.js homeDockState). `each`, when given, takes the place of the plain glyph for every cell, as each(x, y, px, py, ch,
// ink, alpha, moving): world-art.js draws a broken garage that way, as it does the looks (the oil is not drawn then: the tank is
// broken). `live` (homeLive), with the garage's `pose` off its place: the greenhouse and the oil stepped to `t` and drawn as they
// are; without it they rest. `angle`: the garage turned whole (the float, src/float.js), drawn in steps of CONFIG.float.step.
export function drawHome(r, sx, sy, g, st, t, sc, each = null, { live = null, pose = null } = {}) {
  const { W, H } = g, w = r.cellW * sc, h = r.cellH * sc;
  if (r.onScreen && !r.onScreen(sx, sy, Math.hypot(W * w, H * h) / 2)) return;
  const at = pose ?? REST_POSE;
  const step = (CONFIG.float.step * Math.PI) / 180, a = at.a && step ? Math.round(at.a / step) * step : at.a;
  const ca = Math.cos(a), sa = Math.sin(a);
  const put = (x, y, ch, ink, alpha, moving) => {
    const bx = (x - (W - 1) / 2) * w, by = (y - (H - 1) / 2) * h;
    const px = sx + bx * ca - by * sa, py = sy + bx * sa + by * ca;
    if (each) each(x, y, px, py, ch, ink, alpha, moving);
    else if (a) r.glyphRot(ch, px, py, a, ink, alpha, sc);
    else r.glyph(ch, px, py, ink, alpha, sc);
  };
  homeCells(g, t, st, put, a ? floatSway(a) : swayAt(t));
  // The live parts, from the garage's middle in the board's px at the stations' scale, drawn at the board's scale (`k`: a lift).
  const c = { w: r.cellW * CONFIG.home.scale, h: r.cellH * CONFIG.home.scale }, k = sc / CONFIG.home.scale;
  const fresh = (l) => { if (l.c?.w !== c.w || l.c?.h !== c.h) Object.assign(l, createHomeLive(at, c)); return l; };
  if (live) stepHomeLive(fresh(live), at, t, st); else live = fresh(restLive);
  if (!each) {
    // The oil where the tank's inside shows (out of the stone, this frame).
    const shows = (x, y) => {
      const cx = Math.round(x / (c.w * k) + MIDX), cy = Math.round(y / (c.h * k) + MIDY);
      return cx > TANK.x0 && cx < TANK.x0 + TANK.w - 1 && cy > TANK.y0 && cy < TANK.y0 + TANK.h - 1 && !g.covered(cx, cy) && !g.bits[cy * W + cx];
    };
    const oil = k === 1 ? live.oil : { ...live.oil, drops: live.oil.drops.map((q) => ({ ...q, x: q.x * k, y: q.y * k })) };
    drawTankOil(r, oil, { x: sx, y: sy, angle: a, scale: k, shows });
  }
  drawGreenhouse(r, live, sx - at.ox * k, sy - at.oy * k, at, a, sc, k, each);
}

// The greenhouse and its tether, as the game draws the towed cargo's (src/tow.js): dots from the tether's end to the wall, straight
// while it pulls and sagging to one side by what it has to spare; the box turned by its heading (in steps of a degree, so the
// browser keeps each turned glyph). (px, py): the garage's place on the screen.
function drawGreenhouse(r, live, px, py, pose, a, sc, k, each) {
  const c = live.c, gh = live.gh, ga = Math.round(gh.a / (Math.PI / 180)) * (Math.PI / 180), ca = Math.cos(ga), sa = Math.sin(ga);
  const anchor = boardAt(GH.anchor.x, GH.anchor.y, pose, c);
  const from = { x: px + (gh.x + Math.cos(gh.a) * GH.attach * c.w) * k, y: py + (gh.y + Math.sin(gh.a) * GH.attach * c.w) * k };
  const to = { x: px + anchor.x * k, y: py + anchor.y * k };
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
  const spare = Math.max(0, live.rope * k - len), sag = Math.min(spare * 0.5, 36 * k), side = (ca * dy - sa * dx) >= 0 ? 1 : -1;
  const mx = (from.x + to.x) / 2 + (len > 1 ? (-dy / len) * sag * side : 0), my = (from.y + to.y) / 2 + (len > 1 ? (dx / len) * sag * side : 0);
  const marks = Math.max(3, Math.min(8, Math.round(len / (18 * k))));
  const glyph = (ch, x, y, angle, ink, alpha, n) => {
    if (each) each(100 + n, 0, x, y, ch, ink, alpha, true);
    else if (angle) r.glyphRot(ch, x, y, angle, ink, alpha, sc);
    else r.glyph(ch, x, y, ink, alpha, sc);
  };
  for (let i = 1; i <= marks; i++) {
    const u = i / (marks + 1), q = 1 - u;
    glyph('·', q * q * from.x + 2 * q * u * mx + u * u * to.x, q * q * from.y + 2 * q * u * my + u * u * to.y, 0, MAT, 0.9, i);
  }
  const wall = boardAt(CUBE.x0, GH.anchor.y, pose, c);
  glyph('┤', px + wall.x * k, py + wall.y * k, a, MAT, 1, 20);
  const cw = r.cellW * sc, ch = r.cellH * sc;
  greenhouseCells().forEach((cell, n) => {
    const x = cell.x * cw, y = cell.y * ch;
    glyph(cell.ch, px + gh.x * k + x * ca - y * sa, py + gh.y * k + x * sa + y * ca, ga, cell.ink, cell.al, 30 + n);
  });
}
