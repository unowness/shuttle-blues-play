// The station looks (SX, 2026-09-30, from the twelve on labs/graphics/sketches/stations.html: «Станции очень
// крутые берем», then «hive очень крутой его тоже берем»: all twelve). The game draws them through
// world-art.js drawStation by a station's `look` (src/sectors.js); the sheet draws the same makers.
// RING, FOUNDRY, GREENHOUSE and SPIRE were reworked the same day («1 4 11 3 переработай чуть чуть все таки это
// космические объекты а нарисованы так будто они на земле стоят»): nothing stands on a floor, masts and lamps
// come in pairs, smoke never rises.
//
// A station is a small board of cells. The static layer is built once from box-drawing strokes that merge
// where they meet (the way world-art.js `board()` does it); the dynamic layer is redrawn every frame and
// holds what moves and the fills that drift. Fills are the planets' own recipe: fbmWrapped noise picks the
// glyph, one authored hue gives the tones (`planetHue`, `planetTones`), and nothing is a solid block.
//
// Boards are authored on cells 0.6 wide by 1 tall (the game's are 0.62 x 1.0 em): a "unit" below is one row.

import { CONFIG } from '../../src/config.js';
import { TAU, clamp, lerp, mixHex, fbmWrapped, smoothstep as smooth } from '../../src/util.js';
import { planetHue } from '../../src/sectors.js';
import { ROLES } from '../../src/roles.js';
import { planetTones } from './art-tones.js';

const A = 0.6;
const MAT = ROLES.material, STR = ROLES.structure, HI = ROLES.highlight, DIM = ROLES.textHint;

// ---- the cell layers ---------------------------------------------------------------------

const EDGE = { '╵': 1, '╶': 2, '╷': 4, '╴': 8, '─': 10, '│': 5, '┌': 6, '┐': 12, '└': 3, '┘': 9,
  '├': 7, '┤': 13, '┬': 14, '┴': 11, '┼': 15, '╭': 6, '╮': 12, '╰': 3, '╯': 9 };
const GLYPH = Object.fromEntries(Object.entries(EDGE).filter(([c]) => !'╭╮╰╯'.includes(c)).map(([c, b]) => [b, c]));
const ROUND = { 6: '╭', 12: '╮', 3: '╰', 9: '╯' };

export class Layer {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.ch = new Array(w * h).fill(null);
    this.ink = new Array(w * h).fill(null);
    this.al = new Float32Array(w * h);
  }
  index(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? y * this.w + x : -1; }
  at(x, y) { const i = this.index(x, y); return i < 0 ? null : this.ch[i]; }
  clear() { this.ch.fill(null); }
  // A plain write; a cell outside the board is dropped, since moving parts wander off the edge.
  put(x, y, ch, ink, alpha = 1) {
    const i = this.index(Math.round(x), Math.round(y));
    if (i < 0) return;
    this.ch[i] = ch; this.ink[i] = ink; this.al[i] = alpha;
  }
  // A stroke: box-drawing bits (up 1, right 2, down 4, left 8) merge with what is already there.
  edge(x, y, bits, ink, round = false) {
    const i = this.index(x, y);
    if (i < 0) return;
    const merged = (EDGE[this.ch[i]] || 0) | bits;
    this.ch[i] = round && merged === bits && ROUND[merged] ? ROUND[merged] : GLYPH[merged];
    this.ink[i] = ink; this.al[i] = 1;
  }
  hline(x0, x1, y, ink) {
    for (let x = x0; x <= x1; x++) this.edge(x, y, ((x > x0 ? 8 : 0) | (x < x1 ? 2 : 0)) || 10, ink);
  }
  vline(x, y0, y1, ink) {
    for (let y = y0; y <= y1; y++) this.edge(x, y, ((y > y0 ? 1 : 0) | (y < y1 ? 4 : 0)) || 5, ink);
  }
  box(x, y, w, h, ink, round = false) {
    for (let i = 0; i < w; i++) {
      const side = (i > 0 ? 8 : 0) | (i < w - 1 ? 2 : 0), corner = i === 0 || i === w - 1;
      this.edge(x + i, y, side | (corner ? 4 : 0), ink, round);
      this.edge(x + i, y + h - 1, side | (corner ? 1 : 0), ink, round);
    }
    for (let j = 1; j < h - 1; j++) { this.edge(x, y + j, 5, ink); this.edge(x + w - 1, y + j, 5, ink); }
  }
  perimeter(x, y, w, h) {
    const out = [];
    for (let i = 0; i < w; i++) { out.push([x + i, y]); out.push([x + i, y + h - 1]); }
    for (let j = 1; j < h - 1; j++) { out.push([x, y + j]); out.push([x + w - 1, y + j]); }
    return out;
  }
}

// A mask of cells from a predicate. Its outline is the cells of the mask that have an open side, drawn as the
// box glyph that runs along that side (a stepped outline, like the asteroids'); the rest are its inside.
function shape(w, h, pred) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (pred(x, y)) m[y * w + x] = 1;
  const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  const edge = [], inner = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!has(x, y)) continue;
    const up = !has(x, y - 1), right = !has(x + 1, y), down = !has(x, y + 1), left = !has(x - 1, y);
    let bits = 0;
    if (up || right || down || left) {
      if (up && left) bits = 6; else if (up && right) bits = 12;
      else if (down && left) bits = 3; else if (down && right) bits = 9;
      else if (up || down) bits = 10; else bits = 5;
    } else if (!has(x - 1, y - 1)) bits = 9;
    else if (!has(x + 1, y - 1)) bits = 3;
    else if (!has(x - 1, y + 1)) bits = 12;
    else if (!has(x + 1, y + 1)) bits = 6;
    if (bits) edge.push([x, y, bits]); else inner.push([x, y]);
  }
  return { has, edge, inner };
}
const inDisc = (cx, cy, R) => (x, y) => ((x - cx) * A) ** 2 + (y - cy) ** 2 <= R * R;
const inEll = (cx, cy, a, b) => (x, y) => ((x - cx) * A / a) ** 2 + ((y - cy) / b) ** 2 <= 1;
function stroke(L, sh, ink, skip) { for (const [x, y, bits] of sh.edge) if (!skip || !skip(x, y)) L.edge(x, y, bits, ink); }

// ---- small helpers -----------------------------------------------------------------------

function hash01(x, y, k = 0) {
  let h = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(k, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// A colour mixed in a few steps only: the Renderer keeps one bucket per colour, so a smooth fade would make hundreds.
const mixed = new Map();
function tint(a, b, f, steps = 8) {
  const s = Math.round(clamp(f, 0, 1) * steps), key = a + b + s;
  let c = mixed.get(key);
  if (!c) { c = mixHex(a, b, s / steps); mixed.set(key, c); }
  return c;
}
// The glyph that reads as a line along (cs, sn) on a cell 0.6 wide and 1 tall.
function dirGlyph(cs, sn) {
  const m = Math.abs(sn) * A / (Math.abs(cs) || 1e-6);
  if (m < 0.4) return '─';
  if (m > 2.6) return '│';
  return cs * sn > 0 ? '╲' : '╱';
}

// The planets' fill in station clothes: a value from noise picks the glyph, and the tones come from the one hue.
// Sparse on purpose: about half the cells stay empty, the densest is a half-block, and it is never a solid.
const CUT = [0.48, 0.56, 0.64];
function ramp(D, x, y, v, tone, peak = false) {
  if (v >= CUT[2]) D.put(x, y, peak ? '▒' : '░', peak ? tone.mid : tone.lit);
  else if (v >= CUT[1]) D.put(x, y, '░', tone.mid);
  else if (v >= CUT[0]) D.put(x, y, '·', tone.rim, 0.75);
}
function fill(D, cells, tone, t, o) {
  const { seed, fx = 0.3, fy = 0.5, vx = 0, vy = 0, ox = 0, oy = 0, boost = 0, peak = false } = o;
  for (const c of cells) {
    ramp(D, c[0], c[1], fbmWrapped(c[0] * fx + t * vx + ox, c[1] * fy + t * vy + oy, 12, seed, 3) + boost, tone, peak);
  }
}
// The planets' sphere, exactly as drawPlanet shades it (light from CONFIG.planet.light, land from noise on
// longitude and latitude), on the given cells; `spin` turns it, `bias` lifts the land.
function sphereFill(D, cells, cx, cy, R, tone, seed, spin, t, bias = 0, airy = false) {
  const Lt = CONFIG.planet.light;
  for (const [x, y] of cells) {
    const u = (x - cx) * A / R, v = (y - cy) / R, d = u * u + v * v;
    if (d > 1) continue;
    const z = Math.sqrt(1 - d), lat = Math.asin(v), lon = Math.atan2(u, z) + spin * t;
    const land = fbmWrapped(lon / TAU * 12, (lat / Math.PI + 0.5) * 6, 12, seed, 3) + bias;
    const light = u * Lt.x + v * Lt.y + z * Lt.z;
    if (airy) {
      if (light < 0.1) continue;
      if (land > 0.57) D.put(x, y, '░', light > 0.5 ? tone.lit : tone.mid);
      else if (land > 0.5) D.put(x, y, '·', tone.rim, 0.8);
      continue;
    }
    if (light < 0.1) { if (land > 0.54) D.put(x, y, '░', tone.shadow); }
    else if (land > 0.55) D.put(x, y, '▒', light > 0.55 ? tone.lit : tone.mid);
    else if (land > 0.48) D.put(x, y, '░', tone.mid);
    else if (y % 3 === 0) D.put(x, y, '·', tone.mid);
  }
}

// ---- the docking standard ------------------------------------------------------------------------------------------------------

// Two kinds of dock (SX, 2026-10-15; labs/graphics/sketches/station-round4.html, his word «Внеси правки в игру»; the rule in full in
// docs/station-art.md section 4):
//
//   the PAD, inside the station's drawing, where the pilot's own ships stand nose up (SX: «на всех площадках, кроме тех, которых я прям
//   отметил ... должна быть скорее тоже вертикальная площадка»; HOIST's right platform, the one he marked, holds the ship nose to the
//   left). Its inside is the largest own ship plus one cell on every side («внутренние корабли нужно мерить ... по блэкхавку ... чтобы у
//   него вокруг него было пространство там на одну клетку»): BLACKBIRD draws 125 x 135 px nose up, 8.31 x 5.54 cells of a station (15.07
//   x 24.38 px at LOOK_SCALE), so 9 x 6, and 11 x 8 with the margin: 13 x 10 with its frame. Stripes in the margin across the nose and
//   the tail, lamps up the margins beside it; its lamps are the station's light, never the interface's green, its marks never the
//   structure blue («зеленые лампы я бы сделал другими, и не синию разметку»).
//
//   the EXTERNAL DOCK, out of the station's side, at every station («у каждой станции должен быть внешний док»), where a reference ship
//   always docks («корабль отсылка точно не должен вставать на станцию. Он внешним доком всегда соединяется») and every ship at a station
//   with no pad: COMMONS's module (SX: «хороший док»), a boom with no ticks («можно палки верстикальные не ставить на полоску»), a small
//   module with an eye whose two outer corners are its claws («этот прямоугольник и клешни сделай меньше ... клешни не надо рисовать
//   ... сплошной палкой ... Можно просто уголки»). The ship hangs nose up beside it («во внешних стыковках корабль должен быть носом
//   вверх, вертикально»). It reaches every reference ship: SWORDFISH II is 11.32 cells across, DELOREAN 8.31 rows tall.
//
// A look's `docks` say where each is in its own cells: `pad` the ship's middle on the pad and its heading ({ x, y, angle }, the game's
// angle: -PI/2 is nose up), `ext` the external dock's root and side (`buildDock`). The frame reads the docking's step from
// `S.dockState` (`{ pad, ext, ship }`, each a step or null, `ship` the docked ship's cells), which the drawing sets before a frame from
// the world (src/docking.js dockState); at rest every dock is idle. The simulation keeps where a dock is as a table of numbers
// (CONFIG.station.docks), never read from here; checks/station-docks.mjs holds the table to these drawings.

export const PAD = Object.freeze({ cols: 11, rows: 8, W: 13, H: 10 });
export const LARGEST = Object.freeze({ own: { cols: 9, rows: 6 }, reference: { cols: 12, rows: 9 } });
const ease = (u) => { const c = clamp(u, 0, 1); return c * c * (3 - 2 * c); };
const IDLE = Object.freeze({ name: 'idle', u: 0, e: 0, open: 0, grip: 0, present: false });
export const dockPhase = (S, which) => S.dockState?.[which] ?? IDLE;

// A lamp by the docking's step, in the station's own light, never green (SX, 2026-10-15: «зеленые лампы я бы сделал другими»): dark
// at rest, blinking while the dock gets ready or closes, steady while a ship is in. Never the highlight's white either: the game turns a
// docked station's highlights green (labs/graphics/world-art.js drawLook).
export function dockLamp(D, x, y, ph, t, tone, k = 0) {
  if (ph.present) D.put(x, y, 'o', tone.lit);
  else if (ph.name === 'ready' || ph.name === 'close') { const on = Math.floor(t * 6 + k) % 2 === 0; D.put(x, y, on ? 'o' : '·', on ? tone.lit : DIM); }
  else D.put(x, y, '·', DIM);
}

// A pad with its frame's top left corner at (x0, y0): 13 x 10, the ship's middle at (x0 + 6, y0 + 4.5). `nose` 'up' (the rule) or
// 'left' / 'right' (a pad lying on its side). `h` rows tall where its middle must fall on a row: 11 puts it on a station's axis (HOIST's,
// SX, 2026-10-15: «выровняй площадки по Y»), its inside a row more than the 11 x 8. Its frame, stripes and rivets are built once; its
// lamps live in `padFrame`.
export function buildPad(L, x0, y0, tone, { nose = 'up', h = PAD.H } = {}) {
  L.box(x0, y0, PAD.W, h, MAT);
  const upright = nose === 'up';
  if (upright) for (let x = x0 + 1; x <= x0 + PAD.W - 2; x++) for (const y of [y0 + 1, y0 + h - 2]) { if ((x - x0) % 4 < 2) L.put(x, y, '╱', tone.mid, 0.9); }
  else for (let y = y0 + 1; y <= y0 + h - 2; y++) for (const x of [x0 + 1, x0 + PAD.W - 2]) { if ((y - y0) % 3 < 2) L.put(x, y, '╱', tone.mid, 0.9); }
  for (let y = y0 + 3; y <= y0 + h - 4; y += 2) for (let x = x0 + 3; x <= x0 + PAD.W - 4; x += 2) L.put(x, y, '·', DIM, 0.55);
  const lamps = upright ? [x0 + 1, x0 + PAD.W - 2].map((x) => Array.from({ length: h - 4 }, (_, i) => [x, y0 + h - 3 - i]))
    : [y0 + 1, y0 + h - 2].map((y) => Array.from({ length: PAD.W - 4 }, (_, i) => [nose === 'left' ? x0 + PAD.W - 3 - i : x0 + 2 + i, y]));
  return { x0, y0, lamps, mid: { x: x0 + (PAD.W - 1) / 2, y: y0 + (h - 1) / 2 }, angle: upright ? -Math.PI / 2 : nose === 'left' ? Math.PI : 0 };
}
// Where a pad built at (x0, y0) holds a ship: for a look's `docks.pad`, known before the look is built.
export const padAt = (x0, y0, nose = 'up', h = PAD.H) => ({ x: x0 + (PAD.W - 1) / 2, y: y0 + (h - 1) / 2, angle: nose === 'up' ? -Math.PI / 2 : nose === 'left' ? Math.PI : 0 });
// The pad's lamps: dark at rest; while it gets ready a light runs up each margin toward the nose; held, the two at each end steady.
export function padFrame(D, P, tone, t, ph) {
  for (const row of P.lamps) {
    const n = row.length, run = ph.name === 'ready' || ph.name === 'rise' ? Math.floor(t * 9) % (n + 2) : -1;
    row.forEach(([x, y], i) => {
      if (ph.present && (i === 0 || i === n - 1)) D.put(x, y, 'o', tone.lit);
      else if (run === i) D.put(x, y, '•', tone.lit);
      else D.put(x, y, '·', ph.name === 'ready' ? tone.mid : DIM, 0.8);
    });
  }
}

// An external dock out of the station at (x0, y), toward `dir` (+1 right, -1 left): a boom of `len` cells at full stretch and a module 5
// x 3 at its end, its corners round, whose two outer corners are its claws: they open as the dock gets ready and reach one cell out to
// close round the ship's side.
// `style`, each station's own module on the one pattern (SX: «У каждой станции должна быть своя похожая стыковка»): 'eye' COMMONS's,
// 'round' rounded corners and a ring for an eye, 'spreader' a container spreader's twist-lock, 'lattice' a crossed bay, 'cell' a
// honeycomb cell, 'dish' a small dish on its top.
export function buildDock(x0, y, dir, { len = 4, style = 'eye' } = {}) {
  return { x0, y, dir, len, mw: 5, style };
}
// Where a ship of `cols` cells across hangs at external dock E: its middle one cell past the clamped corners, nose up.
export function extDock(E, cols = LARGEST.reference.cols) {
  const face = E.x0 + E.dir * (1 + E.len + E.mw);
  return { x: face + E.dir * (1 + (cols - 1) / 2 + 0.5), y: E.y, angle: -Math.PI / 2 };
}
// The cells a dock and its ship reach out of (x0, y): what a board must hold past the station's own edge.
export const dockReach = (E, cols = LARGEST.reference.cols) => 1 + E.len + E.mw + 1 + 1 + cols + 1;

export function dockFrame(D, E, tone, t, ph) {
  const { x0, y, dir, len, mw } = E, ink = tint(MAT, tone.mid, 0.45);
  const at = (i) => x0 + dir * i;
  const n = Math.round(len * ease(ph.open));
  for (let i = 1; i <= n; i++) D.put(at(i), y, '═', ink);
  // The box, five cells by three, its corners round, everything inside it on its middle column (SX, 2026-10-15, his pick M0 on
  // labs/graphics/sketches/station-modules.html: «вот такой но со скругленными углами как m1»).
  const mx = (i) => at(1 + n + i), outer = mw - 1, mid = outer / 2;
  const style = E.style || 'eye', near = dir > 0 ? ['╭', '╰'] : ['╮', '╯'], far = dir > 0 ? ['╮', '╯'] : ['╭', '╰'];
  D.put(mx(0), y - 1, near[0], ink); D.put(mx(0), y + 1, near[1], ink); D.put(mx(0), y, dir > 0 ? '┤' : '├', ink);
  for (let i = 1; i < outer; i++) { D.put(mx(i), y - 1, '─', ink); D.put(mx(i), y + 1, '─', ink); }
  // The claws, its two outer corners: shut at rest, opened out as the dock gets ready, reached one cell out and closed round a ship.
  const opening = ph.name === 'ready' || ph.name === 'rise' || ph.name === 'close' || ph.name === 'dive';
  if (ph.present && ph.grip > 0.5) {
    D.put(mx(outer), y - 1, '─', ink); D.put(mx(outer), y + 1, '─', ink);
    D.put(mx(outer + 1), y - 1, far[0], ink); D.put(mx(outer + 1), y + 1, far[1], ink);
    D.put(mx(outer), y, '│', ink, 0.6);
  } else if (opening && ph.open > 0.4) {
    D.put(mx(outer), y - 1, dir > 0 ? '╱' : '╲', ink); D.put(mx(outer), y + 1, dir > 0 ? '╲' : '╱', ink);
  } else {
    D.put(mx(outer), y - 1, far[0], ink); D.put(mx(outer), y + 1, far[1], ink); D.put(mx(outer), y, '│', ink);
  }
  // Inside: an eye in the middle that scans while the dock gets ready and settles on the ship, the station's own mark either side of it.
  const eye = ph.present ? 'o' : '│╱─╲'[Math.floor(t * 8) % 4], eyeInk = ph.present || ph.name === 'ready' ? tone.lit : tone.mid;
  const mark = { eye: ['░', ink], round: ['·', ink], spreader: ['▪', tone.mid], lattice: ['╳', ink], cell: ['░', tone.mid], dish: ['░', ink] }[style] || ['░', ink];
  D.put(mx(mid), y, style === 'round' && !ph.present ? '○' : style === 'cell' && !ph.present ? '◇' : eye, eyeInk);
  for (let i = 1; i < outer; i++) if (i !== mid) D.put(mx(i), y, mark[0], mark[1], 0.8);
  if (style === 'dish') {
    D.put(mx(mid - 1), y - 2, dir > 0 ? '╲' : '╱', ink); D.put(mx(mid), y - 2, '_', ink); D.put(mx(mid + 1), y - 2, dir > 0 ? '╱' : '╲', ink);
    if (ph.name === 'ready') D.put(mx(mid), y - 3, Math.floor(t * 6) % 2 ? '·' : '•', tone.lit);
  }
  // Its lamp on the top edge's middle, a bold dot (SX, 2026-10-15: «верхний кружочек сделать не символом О, а символ жирная точка посередине»).
  if (ph.present) D.put(mx(mid), y - 1, '•', tone.lit);
  else if (ph.name === 'ready' || ph.name === 'close') { const on = Math.floor(t * 6) % 2 === 0; D.put(mx(mid), y - 1, on ? '•' : '·', on ? tone.lit : DIM); }
}

// A layer seen `dx` cells to the right: a look drawn into a wider board, its cells moved over to leave room on its left.
function shifted(layer, dx) {
  if (!dx) return layer;
  const p = Object.create(layer);
  p.index = (x, y) => layer.index(x + dx, y);
  return p;
}
// A look with an external dock added at `at` (its own cells) toward `dir`: the board grown by as much as the dock and its ship reach past
// the look's edge, the look moved over if the dock is on its left; its own box (`core`) and middle (`origin`) kept.
function withDock(def, { at, dir = 1, len = 4, style = 'eye' }) {
  const reach = dockReach({ len, mw: 5 }), dx = dir < 0 ? Math.max(0, reach - at.x) : 0;
  const W = dir < 0 ? def.W + dx : Math.max(def.W, at.x + reach + 1);
  const E = buildDock(at.x + dx, at.y, dir, { len, style });
  const core = def.core ? { ...def.core, x0: def.core.x0 + dx } : { x0: dx, y0: 0, W: def.W, H: def.H };
  return {
    ...def, W, core,
    origin: { x: core.x0 + (core.W - 1) / 2, y: core.y0 + (core.H - 1) / 2 },
    docks: { pad: def.docks?.pad ? { ...def.docks.pad, x: def.docks.pad.x + dx } : null, ext: E },
    build(L, tone) { return def.build(shifted(L, dx), tone) || {}; },
    frame(D, S, tone, t) {
      def.frame(shifted(D, dx), S, tone, t);
      dockFrame(D, E, tone, t, dockPhase(S, 'ext'));
    },
  };
}

// ---- 1. RING: COMMONS -----------------------------------------------------------------------------------------------------------

// Reworked 2026-09-30 (SX: «переработай чуть чуть все таки это космические объекты а нарисованы так будто они на земле стоят»): no
// plinth, a mast and a lamp at each pole. Then every length 1.45 times (SX, 2026-10-15: «хороший очень, но крупнее нужно»; his pick S09B
// on labs/graphics/sketches/station-redraws.html), more cells on a bigger board, never a bigger glyph. No pad: every ship docks at its
// grey-violet module («не нужна площадка, можно выводить стыковочный модуль серо фиолетовый, анимируй его интересно»).
function ring() {
  const k = 1.45, R = 3.9 * k, oa = 12.2 * k, ob = 7.2 * k, ia = 9.9 * k, ib = 4.5 * k;
  const cx = Math.round(oa / A), cy = Math.round(ob + 2.8), W = 2 * cx + 1, H = 2 * cy + 1;
  const coreX = Math.floor(R / A), coreY = Math.floor(R), bandY = Math.floor(ib) + 1, top = Math.ceil(cy - ob);
  return withDock({
    key: 'ring', name: 'RING', hue: '#A99BE0', W, H,
    idea: 'A planet-shaded core hung inside a tilted habitat ring, a mast and a lamp at each pole: nothing under it to stand on.',
    moves: 'the core turns like a planet; three lights run round the ring; the two pole lamps blink in turn; the dock\'s module slides out for a ship',
    build(L) {
      const oe = inEll(cx, cy, oa, ob), ie = inEll(cx, cy, ia, ib);
      const band = shape(W, H, (x, y) => oe(x, y) && !ie(x, y));
      const core = shape(W, H, inDisc(cx, cy, R));
      stroke(L, band, STR); stroke(L, core, MAT);
      for (const dir of [-1, 1]) {
        let x = cx + dir * (coreX + 1);
        while (x > 0 && x < W - 1 && L.at(x, cy) === null) { L.edge(x, cy, 10, MAT); x += dir; }
        L.edge(x, cy, dir < 0 ? 8 : 2, MAT); L.edge(cx + dir * coreX, cy, dir < 0 ? 2 : 8, MAT);
      }
      L.vline(cx, cy - bandY, cy - coreY, MAT); L.vline(cx, cy + coreY, cy + bandY, MAT);
      L.vline(cx, 1, top, MAT); L.vline(cx, H - 1 - top, H - 2, MAT);
      return {
        core: core.inner,
        band: band.inner.map(([x, y]) => ({ x, y, phi: Math.atan2((y - cy) / (5.8 * k), (x - cx) * A / (11 * k)), w: hash01(x, y, 1) })),
      };
    },
    frame(D, S, tone, t) {
      sphereFill(D, S.core, cx, cy, R, tone, 31, 0.07, t);
      const heads = [0, 1, 2].map((s) => t * 0.6 + s * TAU / 3);
      for (const c of S.band) {
        let d = 9;
        for (const h of heads) d = Math.min(d, (((h - c.phi) % TAU) + TAU) % TAU);
        if (d < 0.13) D.put(c.x, c.y, '•', HI);
        else if (d < 1.2) D.put(c.x, c.y, '·', tone.lit, 1 - d / 1.2 * 0.8);
        else if (c.w < 0.4) D.put(c.x, c.y, '·', tone.rim, 0.55);
      }
      const top0 = (t % 2.6) < 0.4, bottom = ((t + 1.3) % 2.6) < 0.4;
      D.put(cx, 0, top0 ? 'o' : '·', top0 ? HI : DIM);
      D.put(cx, H - 1, bottom ? 'o' : '·', bottom ? HI : DIM);
    },
  }, { at: { x: W - 1, y: cy }, dir: 1, len: 4, style: 'eye' });
}

// ---- 6. LATTICE: YARD 3 ----------------------------------------------------------------------------------------------------------

// A cross of trusses round a hub (2026-09-30). Its hub widened, a pod on a stalk above and below each horizontal arm, each vertical arm's
// tip crossed (SX, 2026-10-15: «расширить центр может усложнить немного ветки», his pick S08A); the pad in the hub's very middle («чтобы
// по центру была площадка для корабля», then «крупновата площадка и не хватает ей детализации»: the pad of the rule, its stripes and
// lamps); the external dock off the right arm's tip. Round 5 (SX on round 4: «все хорошо я бы немного детализации добавилв выступающие
// части»; his pick S08F, «хорошо»): its outer parts worked: each pod's stalk braced to its arm, a lit port in the pod and a mast with a light
// out of its outer side, a hatch on each vertical arm's tip.
function lattice() {
  const W = 57, H = 24, cx = 28, cy = 12, hw = 10, top = cy - 5, bot = cy + 4;
  const flip = (c) => (c === '╲' ? '╱' : c === '╱' ? '╲' : c);
  return withDock({
    key: 'lattice', name: 'LATTICE', hue: '#C79BC8', W, H,
    docks: { pad: padAt(cx - 6, top) },
    idea: 'A cross of trusses round a hub that holds the pad between two bays: pods hung off the arms, the vertical arms\' tips crossed.',
    moves: 'a wave of light runs out along the struts from the hub, joint by joint; the pods\' lamps answer the wave; the pad\'s lamps answer a docking',
    build(L, tone) {
      const fillCells = [], lamps = [], pods = [];
      const bay = (bx, y0) => { L.put(bx, y0 + 1, '╲', MAT); L.put(bx + 2, y0 + 1, '╱', MAT); L.put(bx + 1, y0 + 2, '╳', MAT); L.put(bx, y0 + 3, '╱', MAT); L.put(bx + 2, y0 + 3, '╲', MAT); };
      for (const side of [-1, 1]) {
        const posts = side < 0 ? [0, 4, 8, 12, 16] : [W - 17, W - 13, W - 9, W - 5, W - 1];
        const a = side < 0 ? 0 : cx + hw, b = side < 0 ? cx - hw : W - 1;
        L.hline(a, b, cy - 2, MAT); L.hline(a, b, cy + 2, MAT);
        for (const x of posts) L.vline(x, cy - 2, cy + 2, MAT);
        for (let k = 0; k < 4; k++) {
          const bx = posts[k] + 1, tip = side < 0 ? k === 0 : k === 3;
          if (tip) { for (let y = cy - 1; y <= cy + 1; y++) for (let x = bx; x <= bx + 2; x++) fillCells.push([x, y]); continue; }
          bay(bx, cy - 2);
        }
        const px = side < 0 ? 8 : W - 9;
        for (const dir of [-1, 1]) {
          const py = cy + dir * 7;
          L.vline(px, Math.min(cy + dir * 2, cy + dir * 6), Math.max(cy + dir * 2, cy + dir * 6), MAT);
          L.box(px - 2, dir < 0 ? cy - 8 : cy + 6, 5, 3, MAT);
          for (let x = px - 1; x <= px + 1; x++) if (x !== px) fillCells.push([x, py]);
          lamps.push([px - 3, py], [px + 3, py]);
          // The stalk braced to the arm, a triangle at its foot; a mast out of the pod's outer side.
          L.put(px - 1, cy + dir * 3, dir < 0 ? '╱' : '╲', MAT); L.put(px + 1, cy + dir * 3, dir < 0 ? '╲' : '╱', MAT);
          L.edge(px, py + dir, dir < 0 ? 1 : 4, MAT); L.put(px, py + dir * 2, '│', MAT);
          pods.push({ x: px, y: py, dir });
        }
      }
      for (const dir of [-1, 1]) {
        const y0 = dir < 0 ? 0 : H - 1, y1 = dir < 0 ? top : bot, my = (y) => (dir < 0 ? y : H - 1 - y), put = (x, y, c) => L.put(x, my(y), dir > 0 ? flip(c) : c, MAT);
        L.vline(cx - 3, Math.min(y0, y1), Math.max(y0, y1), MAT); L.vline(cx + 3, Math.min(y0, y1), Math.max(y0, y1), MAT);
        L.hline(cx - 3, cx + 3, my(0), MAT); L.hline(cx - 3, cx + 3, my(3), MAT);
        for (let y = 1; y <= 2; y++) for (let x = cx - 2; x <= cx + 2; x++) fillCells.push([x, my(y)]);
        put(cx - 2, 4, '╲'); put(cx + 2, 4, '╱'); put(cx - 1, 5, '╲'); put(cx + 1, 5, '╱'); put(cx, 6, '╳');
        L.hline(cx - 7, cx + 7, my(1), MAT);
        L.put(cx, my(1), '╪', MAT);
        lamps.push([cx - 8, my(1)], [cx + 8, my(1)]);
      }
      L.box(cx - hw, top, hw * 2 + 1, bot - top + 1, MAT);
      const P = buildPad(L, cx - 6, top, tone);
      for (let y = top + 1; y < bot; y++) for (let x = cx - hw + 1; x < cx - 6; x++) { fillCells.push([x, y]); fillCells.push([2 * cx - x, y]); }
      const arms = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = L.at(x, y);
        if (c === null || (Math.abs(x - cx) <= hw && y >= top && y <= bot)) continue;
        arms.push({ x, y, c, d: Math.hypot((x - cx) * A, y - cy), node: '┼┬┴├┤┌┐└┘'.includes(c) });
      }
      return { P, arms, pods, lamps: lamps.map(([x, y]) => ({ x, y, d: Math.hypot((x - cx) * A, y - cy) })), fill: fillCells.filter(([x, y]) => L.at(x, y) === null) };
    },
    frame(D, S, tone, t) {
      fill(D, S.fill, tone, t, { seed: 61, fx: 0.5, fy: 0.7, vx: 0.3, vy: 0.2, boost: 0.05 });
      const front = (t * 3.4) % 20;
      for (const a of S.arms) {
        const i = front >= a.d ? Math.max(0, 1 - (front - a.d) / 3.2) : 0;
        if (i < 0.1) continue;
        if (a.node && i > 0.72) D.put(a.x, a.y, '◆', HI); else D.put(a.x, a.y, a.c, tint(MAT, tone.lit, i));
      }
      for (const l of S.lamps) { const on = front >= l.d && front - l.d < 1.2; D.put(l.x, l.y, on ? 'o' : '·', on ? HI : DIM); }
      // Each pod's port lit by turns, its mast's light blinking slower.
      S.pods.forEach((p, i) => {
        const on = Math.floor(t * 1.2 + i * 0.7) % 3 === 0, tip = Math.floor(t * 0.8 + i) % 4 === 0;
        D.put(p.x, p.y, on ? '▪' : '·', on ? tone.lit : DIM);
        D.put(p.x, p.y + p.dir * 3, tip ? '•' : '·', tip ? tone.lit : DIM);
      });
      padFrame(D, S.P, tone, t, dockPhase(S, 'pad'));
    },
  }, { at: { x: W - 1, y: cy }, dir: 1, len: 4, style: 'lattice' });
}

// ---- 7. WHEEL: DRY DOCK ----------------------------------------------------------------------------------------------------------

// The classic turning wheel (2026-09-30), every radius 1.45 times on a bigger board (SX, 2026-10-15: «Надо увеличить размер именно арта а
// не скейлить», his pick S01B, «тут хороший пример все ок»). The still hub is the pad, grown to hold the largest own ship nose up with a
// cell all round («носом к верху»): an 11 x 8 inside a disc, its corners inside; the external dock off the rim.
function wheel() {
  const k = 1.45, Ro = 9.8 * k, Ri = 6.6 * k, Rc = 8.2 * k, spinRate = 0.16;
  const Rh = Math.hypot((PAD.cols / 2) * A, PAD.rows / 2) + 0.35;
  const cx = Math.ceil(Ro / A), cy = Math.ceil(Ro), W = 2 * cx + 1, H = 2 * cy + 1;
  const hubLamps = [[cx - Math.floor((Rh - 0.5) / A), cy], [cx + Math.floor((Rh - 0.5) / A), cy], [cx, cy - Math.floor(Rh - 0.5)], [cx, cy + Math.floor(Rh - 0.5)]];
  return withDock({
    key: 'wheel', name: 'WHEEL', hue: '#D0898C', W, H,
    docks: { pad: { x: cx, y: cy, angle: -Math.PI / 2 } },
    idea: 'The classic turning wheel: a rim of cabins on six spokes round a still hub, the hub the pad.',
    moves: 'spokes and cabins turn together round the still hub and the rim\'s texture turns with them; port lights step round the rim; the hub\'s lamps answer a docking',
    build(L) {
      const rim = shape(W, H, (x, y) => inDisc(cx, cy, Ro)(x, y) && !inDisc(cx, cy, Ri)(x, y));
      const hub = shape(W, H, inDisc(cx, cy, Rh));
      stroke(L, rim, MAT); stroke(L, hub, MAT);
      for (const [x, y] of hub.inner) {
        const dy = y - cy, r = Math.hypot((x - cx) * A, dy);
        if (Math.abs(dy) === PAD.rows / 2 && Math.abs(x - cx) <= PAD.cols / 2 && (x - cx + 20) % 4 < 2) L.put(x, y, '╱', MAT, 0.55);
        else if (r > Rh - 1.1 && (x + y) % 2 === 0) L.put(x, y, '·', DIM, 0.6);
      }
      return { rim: rim.inner.map(([x, y]) => ({ x, y, phi: Math.atan2(y - cy, (x - cx) * A), rho: Math.hypot((x - cx) * A, y - cy) })) };
    },
    frame(D, S, tone, t) {
      const w = t * spinRate, around = Math.round(12 * k), pad = dockPhase(S, 'pad');
      for (const c of S.rim) ramp(D, c.x, c.y, fbmWrapped(((c.phi - w) / TAU + 0.5) * around, (c.rho - Ri) * 0.9, around, 55, 3), tone, true);
      for (let s = 0; s < 6; s++) {
        const a = w + s * TAU / 6, cs = Math.cos(a), sn = Math.sin(a), g = dirGlyph(cs, sn);
        const stepR = 1 / Math.max(Math.abs(cs) / A, Math.abs(sn));
        for (let r = Rh + 0.4; r <= Ri - 0.1; r += stepR) D.put(cx + cs * r / A, cy + sn * r, g, STR);
        D.put(cx + cs * Rc / A, cy + sn * Rc, '▪', HI);
        for (let j = 1; j <= 2; j++) for (const side of [-1, 1]) { const b = a + side * j * 0.74 / Rc; D.put(cx + Math.cos(b) * Rc / A, cy + Math.sin(b) * Rc, '·', tone.lit); }
      }
      hubLamps.forEach(([x, y], i) => dockLamp(D, x, y, pad, t, tone, i));
      const step = Math.floor(t * 1.3) % 4, open = dockPhase(S, 'ext').open > 0.05;
      [[cx, 0], [W - 1, cy], [cx, H - 1], [0, cy]].forEach(([x, y], s) => { if (s !== 1 || !open) D.put(x, y, step === s ? 'o' : '·', step === s ? HI : DIM); });
    },
  }, { at: { x: W - 2, y: cy }, dir: 1, len: 4, style: 'round' });
}

// ---- 8. HIVE: APIARY -------------------------------------------------------------------------------------------------------------

// Seven cells packed like a honeycomb, each a small planet with its own weather (SX, 2026-09-30: «hive очень крутой»). A fifth bigger,
// its cells round on the screen (SX, 2026-10-15: «Надо чуть увеличить», «более квадратные соты то есть круглые, ближе к 1:1»: a cell's
// rows a little taller than its columns are wide, so it is as tall as it is wide in pixels); the external dock out of the right cell.
function hive() {
  const ra = 4.0, rb = 4.45, cx = 21, cy = 13, R = (ra + rb) / 2;
  const centers = [[0, 0], [14, 0], [7, 8], [-7, 8], [-14, 0], [-7, -8], [7, -8]].map(([dx, dy]) => [cx + dx, cy + dy]);
  const H = 2 * cy + 1, W = cx + 14 + Math.ceil(ra / A) + 1;
  const tour = [0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0], leg = 1.7;
  return withDock({
    key: 'hive', name: 'HIVE', hue: '#D2A868', W, H,
    idea: 'Seven cells packed like a honeycomb; every cell is a small planet with its own weather.',
    moves: 'each cell breathes on its own beat (its land swells and lights up); a drone shuttles between cells; the dock\'s cell slides out for a ship',
    build(L) {
      const cells = centers.map(([x, y], i) => {
        const sh = shape(W, H, inEll(x, y, ra, rb));
        stroke(L, sh, MAT);
        return { cx: x, cy: y, k: i, inner: sh.inner };
      });
      L.edge(centers[6][0], 1, 1, MAT);
      centers.forEach(([x0, y0], i) => centers.forEach(([x1, y1], j) => {
        if (j <= i || Math.hypot((x1 - x0) * A, y1 - y0) > 9.6) return;
        const mx = Math.round((x0 + x1) / 2), my = Math.round((y0 + y1) / 2);
        if (L.at(mx, my) === null) L.put(mx, my, dirGlyph((x1 - x0) * A, y1 - y0), MAT);
      }));
      return { cells };
    },
    frame(D, S, tone, t) {
      for (const c of S.cells) {
        const act = 0.5 + 0.5 * Math.sin(t * 0.7 + c.k * 1.9);
        sphereFill(D, c.inner, c.cx, c.cy, R, tone, 100 + c.k * 13, 0.04 + c.k * 0.01, t, (act - 0.5) * 0.16, true);
        if (act > 0.8) D.put(c.cx, c.cy, '◇', HI);
      }
      const on = (t % 2.8) < 0.4;
      D.put(centers[6][0], 0, on ? 'o' : '·', on ? HI : DIM);
      const pos = (tt) => {
        const u = ((tt / leg) % tour.length + tour.length) % tour.length, i = Math.floor(u), f = smooth(u - i);
        const a = centers[tour[i]], b = centers[tour[(i + 1) % tour.length]];
        return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
      };
      [0.5, 0.25].forEach((back, i) => { const [x, y] = pos(t - back); D.put(x, y, '·', HI, 0.6 - i * 0.25); });
      const [dx, dy] = pos(t);
      D.put(dx, dy, '•', HI);
    },
  }, { at: { x: W - 2, y: cy }, dir: 1, len: 3, style: 'cell' });
}

// ---- 9. DEPOT: DEPOT 7 -----------------------------------------------------------------------------------------------------------

// A cargo yard (2026-09-30), wider to five stacks under a longer gantry, two rows taller so the crane lifts higher, boxed thrusters on
// both towers and under the belt (SX, 2026-10-15: «расширить надо и немного вверх и вниз добавить по бокам и снизу небольшие двигатели,
// не скейлить», his pick S06B PODS); its dock COMMONS's, out of the lower right pod («Common как пример»).
function depot() {
  const OX = 6, CW = 53, W = OX * 2 + CW, H = 27, belt = 20, base = 16, lift = 12, half = 15;
  const stacks = [7, 15, 23, 31, 39].map((x) => OX + x);
  const xa = stacks[1] + 3, xb = stacks[3] + 3;
  const towers = [OX, OX + CW - 4];
  const sideRows = [8, 15], bottom = [OX + 10, OX + 26, OX + 42];
  const crate = (D, x, y, ink, tone, seed, t, seated) => {
    D.put(x, y, '┌', ink); D.put(x + 6, y, '┐', ink);
    D.put(x, y + 4, seated ? '├' : '└', ink); D.put(x + 6, y + 4, seated ? '┤' : '┘', ink);
    for (let i = 1; i < 6; i++) { D.put(x + i, y, '─', ink); D.put(x + i, y + 4, '─', ink); }
    for (let j = 1; j < 4; j++) { D.put(x, y + j, '│', ink); D.put(x + 6, y + j, '│', ink); }
    for (let j = 1; j < 4; j++) for (let i = 1; i < 6; i++) D.put(x + i, y + j, ' ', ink);
    for (let j = 1; j < 4; j++) for (let i = 1; i < 6; i++) ramp(D, x + i, y + j, fbmWrapped((x + i) * 0.5, (y + j) * 0.7 + t * 0.2, 12, seed, 3), tone);
  };
  return withDock({
    key: 'depot', name: 'DEPOT', hue: '#B0B86C', W, H,
    idea: 'A cargo yard: five stacks of crates under a gantry crane, a belt along their foot, small thrusters on both towers and under the belt.',
    moves: 'the crane lifts a crate from one stack and sets it on the other (and back); pods slide along the belt; the thrusters burn steady, flickering; crane lights alternate',
    build(L) {
      L.box(OX - 1, belt, CW + 2, 3, MAT);
      L.box(OX, 1, CW, 3, MAT);
      for (const x0 of towers) { L.box(x0, 3, 4, belt - 2, MAT); for (const y of [7, 11, 15]) L.hline(x0, x0 + 3, y, MAT); }
      for (let x = OX + 1; x <= OX + CW - 2; x++) if (L.at(x, 2) === null) L.put(x, 2, '╌', DIM);
      for (const bx of stacks) L.box(bx, base, 7, 5, STR);
      L.box(stacks[2], lift, 7, 5, STR);
      const ground = [];
      for (const bx of stacks) for (let j = base + 1; j <= base + 3; j++) for (let i = 1; i <= 5; i++) ground.push([bx + i, j]);
      for (let j = lift + 1; j <= lift + 3; j++) for (let i = 1; i <= 5; i++) ground.push([stacks[2] + i, j]);
      for (let x = OX; x < OX + CW; x += 2) L.put(x, belt + 1, '·', DIM);
      const throats = [];
      for (const ny of sideRows) for (const side of [-1, 1]) {
        const wall = side < 0 ? OX : OX + CW - 1, out = wall + side * 2;
        L.box(side < 0 ? out - 1 : wall, ny, 3, 3, MAT);
        throats.push({ x: out + side, y: ny + 1, dx: side, dy: 0 });
      }
      for (const x of bottom) { L.box(x - 1, belt + 2, 3, 3, MAT); throats.push({ x, y: belt + 5, dx: 0, dy: 1 }); }
      return { ground, throats };
    },
    frame(D, S, tone, t) {
      fill(D, S.ground, tone, t, { seed: 19, fx: 0.5, fy: 0.7, vx: 0.05, boost: -0.02 });
      const k = Math.floor(t / half), s = t - k * half, from = k % 2 === 0 ? xa : xb, to = k % 2 === 0 ? xb : xa;
      const tx = lerp(from, to, smooth((s - 5) / 4));
      const hy = 4 + (lift - 5) * (smooth((s - 1) / 2) - smooth((s - 3) / 2) + smooth((s - 9) / 2) - smooth((s - 11) / 2));
      const carrying = s >= 3 && s < 11;
      for (const cx0 of [xa, xb]) {
        const here = carrying ? false : (s < 3 ? cx0 === from : cx0 === to);
        if (here) crate(D, cx0 - 3, lift, STR, tone, cx0, t, true);
        else for (const [dx, c] of [[0, '┌'], [6, '┐']]) D.put(cx0 - 3 + dx, lift, c, DIM);
      }
      if (carrying) crate(D, Math.round(tx) - 3, Math.round(hy) + 1, HI, tone, 7, t, false);
      const ty = Math.round(hy);
      for (let y = 4; y < ty; y++) D.put(tx, y, '│', MAT);
      D.put(tx, ty, '┴', HI);
      D.put(tx - 1, 2, '▐', HI); D.put(tx, 2, '▪', HI); D.put(tx + 1, 2, '▌', HI);
      for (let i = 0; i < 6; i++) {
        const px = OX + (t * 2.2 + i * 9) % CW;
        if (px < OX + 1 || px > OX + CW - 2) continue;
        D.put(px - 1, belt + 1, '[', MAT); D.put(px, belt + 1, '▪', tone.lit); D.put(px + 1, belt + 1, ']', MAT);
      }
      const docking = dockPhase(S, 'ext').open > 0.05;
      S.throats.forEach((e, i) => {
        if (docking && e.dx > 0 && e.y === sideRows[1] + 1) return;     // the dock's own pod holds its fire while it works
        const f = 0.5 + 0.5 * Math.sin(t * 9 + i * 1.7);
        D.put(e.x - e.dx, e.y - e.dy, '▪', tint(tone.mid, tone.lit, f));
        D.put(e.x, e.y, f > 0.5 ? '▒' : '░', tint(tone.mid, HI, f * 0.6));
        D.put(e.x + e.dx, e.y + e.dy, '·', tone.lit, 0.4 + 0.4 * f);
      });
      const alt = Math.floor(t * 1.4) % 2 === 0;
      D.put(OX + 1, 0, 'o', alt ? HI : DIM); D.put(OX + CW - 2, 0, 'o', alt ? DIM : HI);
    },
  }, { at: { x: OX + CW + 1, y: sideRows[1] + 1 }, dir: 1, len: 3, style: 'spreader' });
}

// ---- 10. ARRAY: RELAY 12 ---------------------------------------------------------------------------------------------------------

// A small bus between four solar panels, a radar dish on a mast (2026-09-30; SX, 2026-10-15: «норм», «тут нормально»), its dock COMMONS's
// out of the right panel, for every ship. Round 5 (SX on round 4: «нормальноно, простоват по сравнению с остальными»; his pick S03F with
// «Надо верхнюю антенну такой же длины как нижнюю»): worked as a relay, its form kept: each panel the cells of a solar array, two by
// three; the power they make running along the booms into the bus; fins on the bus and a core that breathes; under it a second mast with
// a dish that answers the top one, both masts three cells clear.
function array() {
  const W = 41, H = 25, px = 20, by = 7, row = 10;
  const panels = [[0, 3], [8, 3], [26, 3], [34, 3]];
  return withDock({
    key: 'array', name: 'ARRAY', hue: '#86B4D6', W, H,
    idea: 'A relay: a bus between four solar arrays, a dish on a mast over it and a second under it answering, power running in along the booms.',
    moves: 'the dishes swing and ping in turn; a glint crosses the arrays; power runs in along the booms; the core breathes; dock lights step',
    build(L) {
      L.box(17, by, 7, 7, MAT); L.box(18, by + 6, 5, 5, MAT);
      // Fins on the bus's shoulders; the two masts.
      for (const y of [by + 1, by + 5]) { L.hline(16, 17, y, MAT); L.hline(23, 24, y, MAT); }
      L.vline(px, 4, by, MAT); L.vline(px, by + 10, by + 13, MAT);
      const groups = [];
      panels.forEach(([x0, y0], pi) => {
        L.box(x0, y0, 7, 15, MAT);
        for (const y of [y0 + 5, y0 + 10]) L.hline(x0, x0 + 6, y, MAT);
        L.vline(x0 + 3, y0, y0 + 14, MAT);
        [[y0 + 1, y0 + 4], [y0 + 6, y0 + 9], [y0 + 11, y0 + 13]].forEach(([a, b], gi) => {
          for (const [c0, c1] of [[x0 + 1, x0 + 2], [x0 + 4, x0 + 5]]) {
            const cells = [];
            for (let y = a; y <= b; y++) for (let x = c0; x <= c1; x++) cells.push([x, y]);
            groups.push({ cells, seed: 200 + pi * 7 + gi * 2 + (c0 > x0 + 2 ? 1 : 0) });
          }
        });
      });
      L.hline(6, 8, row, MAT); L.hline(14, 17, row, MAT); L.hline(23, 26, row, MAT); L.hline(32, 34, row, MAT);
      return { groups, booms: [[[7, row], [15, row], [16, row]], [[33, row], [25, row], [24, row]]] };
    },
    frame(D, S, tone, t) {
      const g = (t * 9) % 84 - 14;
      for (const grp of S.groups) {
        for (const [x, y] of grp.cells) {
          const v = fbmWrapped(x * 0.5 + t * 0.12, y * 0.35 - t * 0.05, 12, grp.seed, 3);
          if (Math.abs(x + y - g) < 0.6) D.put(x, y, '╱', HI);
          else if (Math.abs(x + y - g + 1.5) < 0.6) D.put(x, y, '·', HI, 0.6);
          else ramp(D, x, y, v, tone);
        }
      }
      // Power along the booms, into the bus, a pulse each side in turn.
      S.booms.forEach((cells, side) => {
        const p = (t * 4 + side * 3.5) % (cells.length + 4);
        cells.forEach(([x, y], i) => { if (Math.abs(i - p) < 0.6) D.put(x, y, '═', tone.lit); });
      });
      // The core breathes.
      const br = 0.5 + 0.5 * Math.sin(t * 1.3);
      D.put(px, by + 3, br > 0.5 ? '◆' : '◇', tint(MAT, tone.lit, br));
      for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) D.put(px + dx, by + 3 + dy, '·', tone.rim, 0.4 + 0.5 * br);
      // The dishes swing and ping, the one under answering the one over.
      for (const [my, up, phase] of [[3, 1, 0], [by + 14, -1, Math.PI]]) {
        const al = 0.9 * Math.sin(t * 0.7 + phase), cs = Math.cos(al), sn = Math.sin(al), k = 1 / Math.max(Math.abs(cs) / A, Math.abs(sn));
        for (const m of [-2, -1, 0, 1, 2]) D.put(px + cs * k * m / A, my + sn * k * m, dirGlyph(cs, sn), HI);
        const nx = Math.sin(al) * up, ny = -Math.cos(al) * up, p0 = (t * 6 + phase * 3) % 8;
        D.put(px + nx * 1.9 / A, my + ny * 1.9, '•', tone.lit);
        for (let s = 2.4; s <= 7; s += 0.55) D.put(px + nx * s / A, my + ny * s, '·', tone.lit, 0.15 + 0.85 * Math.exp(-Math.abs(s - p0) * 0.7));
      }
      const step = Math.floor(t * 1.6) % 4;
      [19, 21].forEach((x, i) => D.put(x, by + 9, step === i ? '•' : '·', step === i ? HI : DIM));
    },
  }, { at: { x: W - 1, y: row }, dir: 1, len: 4, style: 'dish' });
}

// ---- 11. SPIRE: HOIST ------------------------------------------------------------------------------------------------------------

// A spire with no bottom (2026-09-30: tiers widening to the middle and narrowing again, a mast at each tip), a third bigger and symmetric,
// a platform each side as big as a pad (SX, 2026-10-15: «тут нужно станцию побольше но в тех же пропорциях и симетричная, одна из
// платформ слева или справа должна стать посадочной площадкой»): the right one the pad, the ship on it nose to the left («хорошаая
// площадка ... носом в левую сторону корабль стоит»); the external dock out of the left one. Round 5 (SX on round 4: «чуть простоват по
// сравнению с остальными выровняй площадки по Y, та что слева прямоугольник тоже надо по центру, я бы нарисовал коннектор с основным
// телом поинтереснее и может сделал бы вид что это какое-то пространство живое тоже»; his pick S02G, «этот»): both platforms 11 rows,
// their middles on the spire's axis; four cells of joint between each platform and the body, a corrugated tube; the left platform a deck
// people live on, three cabins over a corridor and three under it, people walking the corridor and through the tube.
function spire() {
  const cx = 27, my = 13, W = 55, H = 27, ph = 11, py0 = my - 5, lx0 = 0, rx0 = cx + 15;
  const tiers = [[cx - 3, 2, 7, 5], [cx - 6, 6, 13, 5], [cx - 10, 10, 21, 7], [cx - 6, 16, 13, 5], [cx - 3, 20, 7, 5]];
  const ranks = [[[cx - 10, 10], [cx + 10, 10], [cx - 10, 16], [cx + 10, 16]], [[cx - 6, 6], [cx + 6, 6], [cx - 6, 20], [cx + 6, 20]],
    [[cx - 3, 2], [cx + 3, 2], [cx - 3, 24], [cx + 3, 24]]];
  const joints = [[lx0 + PAD.W, cx - 11], [cx + 11, rx0 - 1]];
  const cabins = [];
  for (const [y0, y1] of [[py0 + 1, my - 3], [my + 3, py0 + ph - 2]]) for (const x0 of [lx0 + 1, lx0 + 5, lx0 + 9]) cabins.push({ x0, y0, y1 });
  return withDock({
    key: 'spire', name: 'SPIRE', hue: '#A99BE0', W, H,
    docks: { pad: padAt(rx0, py0, 'left', ph) },
    idea: 'A spire with no bottom, a platform each side on its axis: the right the pad, the left a deck people live on, each joined by a corrugated tube.',
    moves: 'a lift car runs the shaft; ledge lights run out to the tips; cabin windows light and go dark; people walk the deck and through the tube; the pad answers a docking',
    build(L, tone) {
      for (const [x, y, w, h] of tiers) L.box(x, y, w, h, MAT);
      L.vline(cx, 1, 2, MAT); L.vline(cx, H - 3, H - 2, MAT);
      // The deck: its frame, the corridor's two walls across it, the cabins' walls over and under.
      L.box(lx0, py0, PAD.W, ph, MAT);
      L.hline(lx0, lx0 + PAD.W - 1, my - 2, MAT); L.hline(lx0, lx0 + PAD.W - 1, my + 2, MAT);
      for (const x of [lx0 + 4, lx0 + 8]) { L.vline(x, py0, my - 2, MAT); L.vline(x, my + 2, py0 + ph - 1, MAT); }
      const P = buildPad(L, rx0, py0, tone, { nose: 'left', h: ph });
      // The tubes: corrugated walls joined into the platform and the body; people through the left one, the pad's pulse through the right.
      const walk = [], pulse = [];
      joints.forEach(([a, b], side) => {
        for (let x = a; x <= b; x++) { L.put(x, my - 1, (x - a) % 2 ? '╲' : '╱', MAT); L.put(x, my + 1, (x - a) % 2 ? '╱' : '╲', MAT); }
        L.edge(a - 1, my - 1, 2, MAT); L.edge(a - 1, my + 1, 2, MAT); L.edge(b + 1, my - 1, 8, MAT); L.edge(b + 1, my + 1, 8, MAT);
        for (let x = a; x <= b; x++) (side ? pulse : walk).push([x, my]);
      });
      const cells = [];
      for (const [x, y, w, h] of tiers) for (let j = y + 1; j < y + h - 1; j++) for (let i = x + 1; i < x + w - 1; i++) {
        if (i >= cx - 1 && i <= cx + 1) { if (i !== cx && L.at(i, j) === null) L.put(i, j, '┊', DIM); continue; }
        if (L.at(i, j) === null) cells.push([i, j]);
      }
      return { cells, P, walk, pulse };
    },
    frame(D, S, tone, t) {
      fill(D, S.cells, tone, t, { seed: 131, fx: 0.55, fy: 0.8, vx: 0.18, boost: -0.02 });
      const u = (t / 9) % 2; D.put(cx, 3 + (u < 1 ? u : 2 - u) * (H - 7), '▪', HI);
      const rank = Math.floor(t * 2.2) % 5;
      ranks.forEach((cells, k) => cells.forEach(([x, y]) => D.put(x, y, rank === k ? 'o' : '·', rank === k ? HI : DIM)));
      // The cabins: two windows each, lit and dark on an hour of their own (a few seconds of the game's), never all at once.
      cabins.forEach((c, i) => {
        for (const [k, x] of [[0, c.x0], [1, c.x0 + 2]]) {
          const y = k === 0 ? c.y0 : c.y1, on = hash01(i, Math.floor((t + i * 1.7 + k * 3.1) / 4.3), 7 + k) < 0.62;
          D.put(x, y, on ? '▪' : '·', on ? tone.lit : DIM, on ? 1 : 0.6);
        }
      });
      // The corridor: three walkers each way at their own pace, through the deck and on along the tube to the body.
      const path = [...Array.from({ length: PAD.W - 2 }, (_, i) => [lx0 + 1 + i, my]), ...S.walk];
      for (let k = 0; k < 3; k++) {
        const n = path.length, s = (t * (0.9 + 0.35 * k) + k * 5.3) % (2 * n), i = Math.floor(s < n ? s : 2 * n - 1 - s);
        const [x, y] = path[Math.max(0, Math.min(n - 1, i))];
        D.put(x, y, '•', tone.lit);
      }
      // The pad's tube carries the station's pulse to the pad, a light at a time.
      const m = S.pulse.length + 3, p = ((Math.floor(t * 3) % m) + m) % m;
      if (p < S.pulse.length) D.put(S.pulse[p][0], S.pulse[p][1], '•', tone.lit);
      padFrame(D, S.P, tone, t, dockPhase(S, 'pad'));
      for (const [y, q] of [[0, 0], [H - 1, 0.5]]) {
        D.put(cx, y, '◦', tone.lit);
        const f = (t * 0.55 + q) % 1, gap = 0.9 + f * 2.2;
        D.put(cx - gap, y, '(', tone.lit, 0.85 * (1 - f)); D.put(cx + gap, y, ')', tone.lit, 0.85 * (1 - f));
      }
    },
  }, { at: { x: lx0, y: my }, dir: -1, len: 4, style: 'eye' });
}

// ---- 2-5, 12: HALCYON, FOUNDRY 2, SPOOL 8, PHAROS, WHARF 9, by the illustrator ---------------------------------------------------
//
// Redrawn by the illustrator agent (.claude/agents/scifi-illustrator.md, docs/station-art.md) over SX's rounds of 2026-10-15 on
// labs/graphics/sketches/station-round4.html and station-round5.html, his notes on each verbatim in docs/station-art.md section 3; in the
// game since round 6. On round 5:
// SX: «В целом уже очень близко к правде, поэтому правь точечно»; for all of them: «Избегай в артах пересечения контурных линий это
// некрасиво (относится ко всем)», «проследи, чтобы они все как бы проходили от станции, не было до них пробела никакого», «в модулях либо
// должна быть симметрия, либо полная асимметрия, да, но надо, чтобы все ровно стояло». Their helpers are the block that follows. Every
// external dock goes through withDock (sideways), its root joined to the station's drawn edge.

// ---- the helpers the five share --------------------------------------------------------------------------------------------------

// The light falls from the upper left, as on the planets: 1 on a mass's upper left, 0 on its lower right (u, v: 0..1 across and down it).
function lightAcross(u, v) { return clamp(1 - 0.55 * u - 0.45 * v, 0, 1); }
// Whether a lamp blinking with `period` s is on at `t` (on for `on` s from `phase`).
function blinkOn(t, period, on = 0.4, phase = 0) { return ((t + phase) % period + period) % period < on; }
function lampAt(D, x, y, on, ink = HI) { D.put(x, y, on ? 'o' : '·', on ? ink : DIM); }
// A pad with rounded corners, `h` rows tall (odd, so its middle is a row and the pad sits on its station's axis), its marks few: a short
// stripe at each end of the nose and tail margins, three lamps up each side margin (padFrame runs them), no rivets. 11 x 8 clear inside.
function roundPad(L, x0, y0, tone, { h = 11, frame = true } = {}) {
  if (frame) L.box(x0, y0, PAD.W, h, MAT, true);
  for (const y of [y0 + 1, y0 + h - 2]) for (const x of [x0 + 2, x0 + 3, x0 + PAD.W - 4, x0 + PAD.W - 3]) L.put(x, y, '╱', tone.mid, 0.9);
  const mid = y0 + (h - 1) / 2, rows = [y0 + h - 3, mid, y0 + 2];
  return { x0, y0, h, lamps: [x0 + 1, x0 + PAD.W - 2].map((x) => rows.map((y) => [x, y])), mid: { x: x0 + (PAD.W - 1) / 2, y: mid }, angle: -Math.PI / 2 };
}
function roundPadAt(x0, y0, h = 11) { return { x: x0 + (PAD.W - 1) / 2, y: y0 + (h - 1) / 2, angle: -Math.PI / 2 }; }
// A dock's root on a station's drawn edge: the edge's stroke grows a stub toward the dock (SX: «не было до них пробела никакого»).
function rimStub(L, x, y, dir) { L.edge(x, y, dir > 0 ? 2 : 8, L.ink[L.index(x, y)] || MAT); }
// A numeral stencilled on a deck, three cells by five rows of box strokes (Foss's covers), its top left at (x, y).
const STENCIL_SEGMENTS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function stencilNumber(D, x, y, n, ink, alpha = 1) {
  const on = STENCIL_SEGMENTS[n] || '', E = (dx, dy, bits) => { D.edge(x + dx, y + dy, bits, ink); const i = D.index(x + dx, y + dy); if (i >= 0) D.al[i] = alpha; };
  if (on.includes('a')) { E(0, 0, 2); E(1, 0, 10); E(2, 0, 8); }
  if (on.includes('g')) { E(0, 2, 2); E(1, 2, 10); E(2, 2, 8); }
  if (on.includes('d')) { E(0, 4, 2); E(1, 4, 10); E(2, 4, 8); }
  if (on.includes('f')) { E(0, 0, 4); E(0, 1, 5); E(0, 2, 1); }
  if (on.includes('b')) { E(2, 0, 4); E(2, 1, 5); E(2, 2, 1); }
  if (on.includes('e')) { E(0, 2, 4); E(0, 3, 5); E(0, 4, 1); }
  if (on.includes('c')) { E(2, 2, 4); E(2, 3, 5); E(2, 4, 1); }
}
// A lighthouse's beam, as BEACON sweeps it: a line of glyphs along its own direction that thins to dots, a fading wake behind.
function beamSweep(D, lx, ly, theta, reach, tone, keepOut) {
  const ray = (th, alpha, step) => {
    const cs = Math.cos(th), sn = Math.sin(th) * 0.28, g = dirGlyph(cs, sn);
    for (let s = 0.12; s <= 1.001; s += step) {
      const x = Math.round(lx + cs * s * reach / A), y = Math.round(ly + sn * s * reach);
      if (keepOut(x, y)) continue;
      D.put(x, y, s < 0.72 ? g : '·', s < 0.5 ? HI : tone.lit, alpha * (1 - 0.45 * s));
    }
  };
  for (const dir of [0, Math.PI]) { ray(theta + dir, 1, 0.04); for (let k = 1; k <= 6; k++) ray(theta + dir - k * 0.11, (1 - k / 7) * 0.5, 0.08); }
}

// ---- greenhouse: S04 HALCYON (S04-I3 as SX took it; its trusses braced without crossing, its dock's root on the glass) ---------------

function greenhouse() {
  const Wc = 45, H = 27, cx = 22, cy = 13, R = 13, BAND = 9.5, RIBS = 8, turnRate = 0.045;
  const M = { x0: 10, y0: 7, w: 25, h: 13 }, Mx1 = 34, My1 = 19, DIV = cx, WIN = { x0: 13, y0: 9, w: 7, h: 4 }, GRILLE = { x0: 13, y0: 14, w: 7, h: 4 };
  const keep = (x, y) => x >= M.x0 - 1 && x <= Mx1 + 1 && y >= M.y0 - 1 && y <= My1 + 1;
  return withDock({
    key: 'greenhouse', name: 'GREENHOUSE', hue: '#72A843', W: Wc, H,
    docks: { pad: { x: 28, y: cy, angle: -Math.PI / 2 } },
    idea: 'A glass disc whose garden is a wheel of eight beds turning round a still metal module on four trusses; the module two equal halves, the window and a grille on the left, the pad on the right, all on one grid.',
    moves: 'the garden wheel turns, its ribs and beds together; a sheen glides across the module now and then; someone passes the window; the pad answers a docking',
    build(L, tone) {
      const disc = shape(Wc, H, inDisc(cx, cy, R));
      stroke(L, disc, MAT);
      const wall = shape(Wc, H, inDisc(cx, cy, BAND - 0.35));
      const onWall = new Set(wall.edge.map(([x, y]) => x + ',' + y));
      const reach = (x, dir) => { let k = x; while (!onWall.has(k + ',' + (cy - 1)) && k > 0 && k < Wc - 1) k += dir; return k; };
      const reachY = (y, dir) => { let k = y; while (!onWall.has((cx - 2) + ',' + k) && k > 0 && k < H - 1) k += dir; return k; };
      // The trusses: two rails and their braces leaning one way, then the other, never crossing; the far truss of each pair the near
      // one's mirror.
      for (const [a, b] of [[reach(M.x0, -1), M.x0], [Mx1, reach(Mx1, 1)]]) {
        L.hline(a, b, cy - 1, MAT); L.hline(a, b, cy + 1, MAT);
        for (let x = a + 2, k = a > cx ? 1 : 0; x < b - 1; x += 3, k++) L.put(x, cy, k % 2 ? '╱' : '╲', MAT, 0.8);
      }
      for (const [a, b] of [[reachY(M.y0, -1), M.y0], [My1, reachY(My1, 1)]]) {
        L.vline(cx - 2, a, b, MAT); L.vline(cx + 2, a, b, MAT);
        for (let y = a + 1, k = a > cy ? 1 : 0; y < b; y += 2, k++) L.put(cx, y, k % 2 ? '╱' : '╲', MAT, 0.8);
      }
      stroke(L, wall, MAT, keep);
      L.box(M.x0, M.y0, M.w, M.h, MAT, true);
      L.vline(DIV, M.y0, My1, MAT);
      L.box(WIN.x0, WIN.y0, WIN.w, WIN.h, STR, true);
      L.box(GRILLE.x0, GRILLE.y0, GRILLE.w, GRILLE.h, MAT, true);
      for (let x = GRILLE.x0 + 1; x < GRILLE.x0 + GRILLE.w - 1; x++) for (let y = GRILLE.y0 + 1; y < GRILLE.y0 + GRILLE.h - 1; y++) L.put(x, y, '─', DIM, 0.6);
      const P = roundPad(L, DIV, cy - 5, tone, { h: 11, frame: false });
      const plate = [];
      for (let y = M.y0 + 1; y < My1; y++) for (let x = M.x0 + 1; x < DIV; x++) if (L.at(x, y) === null && !(x > WIN.x0 && x < WIN.x0 + WIN.w - 1 && y > WIN.y0 && y < WIN.y0 + WIN.h - 1)) plate.push([x, y]);
      const rim = [];
      for (let x = M.x0; x <= Mx1; x++) rim.push([x, M.y0, L.at(x, M.y0)]);
      for (let y = M.y0 + 1; y <= My1; y++) rim.push([M.x0, y, L.at(M.x0, y)]);
      const garden = [];
      for (const [x, y] of disc.inner) {
        if (keep(x, y) || L.at(x, y) !== null) continue;
        const rho = Math.hypot((x - cx) * A, y - cy), phi = Math.atan2(y - cy, (x - cx) * A);
        if (rho > R - 1.0) { if ((x + y) % 2 === 0) L.put(x, y, '·', STR, 0.45); continue; }
        if (rho >= BAND) garden.push({ x, y, rho, phi, l: lightAcross(0.5 + (x - cx) * A / (2 * R), 0.5 + (y - cy) / (2 * R)) });
      }
      rimStub(L, Wc - 2, cy, 1);
      return { P, plate, rim, garden, room: { x0: WIN.x0 + 1, x1: WIN.x0 + WIN.w - 2, y0: WIN.y0 + 1, y1: WIN.y0 + WIN.h - 2 } };
    },
    frame(D, S, tone, t) {
      const turn = t * turnRate, seg = TAU / RIBS;
      for (const c of S.garden) {
        const a = ((c.phi - turn) % TAU + TAU) % TAU, k = Math.floor(a / seg), f = a / seg - k;
        if (f < 0.07 || f > 0.93) { D.put(c.x, c.y, dirGlyph(Math.cos(c.phi), Math.sin(c.phi)), STR, 0.85); continue; }
        const kind = k % 4, n = fbmWrapped(a / TAU * 40, c.rho * 0.7, 40, 700 + kind, 3), v = n + (c.l - 0.5) * 0.24 + 0.08;
        const slot = hash01(Math.round(a / TAU * 64), Math.round(c.rho * 1.5), 8 + kind), row = Math.round((c.rho - BAND) * 1.5) % 2 === 0;
        if (kind === 0 && slot < 0.2) { D.put(c.x, c.y, '♣', c.l > 0.5 ? tone.lit : tone.mid); continue; }
        if (kind === 1 && slot < 0.16) { D.put(c.x, c.y, '✿', tone.lit, 0.95); continue; }
        if (kind === 2 && row) { D.put(c.x, c.y, slot < 0.45 ? 'ψ' : ',', c.l > 0.45 ? tone.lit : tone.mid, 0.9); continue; }
        if (kind === 3 && slot < 0.14) { D.put(c.x, c.y, '✿', HI, 0.85); continue; }
        if (v >= 0.6) D.put(c.x, c.y, '▒', c.l > 0.55 ? tone.mid : tone.shadow);
        else if (v >= 0.48) D.put(c.x, c.y, '░', c.l > 0.45 ? tone.mid : tone.shadow);
        else D.put(c.x, c.y, '░', tone.shadow, 0.7);
      }
      const sh = ((t * 3.6) % 34) - 4;
      for (const [x, y] of S.plate) { const d = (x - M.x0) * A + (y - M.y0) * 0.9 - sh; if (Math.abs(d) < 0.45) D.put(x, y, '╱', HI, 0.9); else if (Math.abs(d) < 1.1) D.put(x, y, '╱', tint(MAT, HI, 0.4), 0.45); }
      for (const [x, y, ch] of S.rim) if (ch) D.put(x, y, ch, tint(MAT, HI, 0.55));
      const { x0, x1, y0, y1 } = S.room;
      for (let x = x0; x <= x1; x++) { D.put(x, y0, '·', tint(HI, MAT, 0.5), 0.6); D.put(x, y1, (x - x0) % 2 ? ',' : 'ψ', tone.lit); }
      D.put(x0 + Math.round((0.5 + 0.5 * Math.sin(t * 0.45)) * (x1 - x0)), y0, '▪', HI);
      padFrame(D, S.P, tone, t, dockPhase(S, 'pad'));
      lampAt(D, cx, 0, blinkOn(t, 3)); lampAt(D, cx, H - 1, blinkOn(t, 3, 0.4, 1.5));
    },
  }, { at: { x: Wc - 2, y: cy }, dir: 1, len: 4, style: 'round' });
}

// ---- foundry: S07 FOUNDRY 2 (S07-I2 as SX took it; its ore truss braced as a zigzag, not crossed; its dock's root on the bin) ----------

function foundry() {
  const Wc = 54, H = 27, cx = 25, cy = 13, Rs = 6.4, rIn = 8.3, rOut = 11.0, MO = { x0: cx - 4, y0: cy - 2, w: 9, h: 5 };
  const BIN = { x0: 0, y0: 8, w: 7, h: 11 }, PX = cx + 14, PY = cy - 5, COL = { x0: cx + 10, y0: cy - 3, w: 5, h: 7 };
  const ARCS = [[-146, -50], [50, 146]].map(([a, b]) => [a * Math.PI / 180, b * Math.PI / 180]);
  const PINS = [-120, -70, 70, 120].map((d) => d * Math.PI / 180);
  const pulse = (t) => (0.42 + 0.58 * (0.5 + 0.5 * Math.sin(t * 1.5))) * (0.92 + 0.08 * Math.sin(t * 6.1));
  const inArc = (o) => (x, y) => {
    const r = Math.hypot((x - cx) * A, y - cy), a = Math.atan2(y - cy, (x - cx) * A);
    return r >= rIn + o && r <= rOut + o && ARCS.some(([a0, a1]) => a >= a0 && a <= a1);
  };
  return withDock({
    key: 'foundry', name: 'FOUNDRY', hue: '#C98A5E', W: Wc, H,
    docks: { pad: roundPadAt(PX, PY) },
    idea: 'A round crucible between two radiator arcs on pins: ore comes in on a truss from the left, the heat leaves through the arcs and vents from their tips, the castings ride a flange out to the pad on the crucible\'s axis.',
    moves: 'the mouth glows and breathes; with each breath the arcs ride out on their pins and a wave of heat runs along their fins to the tips, which puff; ore rides the truss in; castings ride the flange out to the pad, cooling; the pad answers a docking',
    build(L, tone) {
      const shell = shape(Wc, H, inDisc(cx, cy, Rs));
      stroke(L, shell, MAT);
      const mouthEdge = L.perimeter(MO.x0, MO.y0, MO.w, MO.h).map(([x, y]) => {
        const top = y === MO.y0, bot = y === MO.y0 + MO.h - 1, lft = x === MO.x0, rgt = x === MO.x0 + MO.w - 1;
        return [x, y, top && lft ? '╭' : top && rgt ? '╮' : bot && lft ? '╰' : bot && rgt ? '╯' : top || bot ? '─' : '│'];
      });
      L.box(BIN.x0, BIN.y0, BIN.w, BIN.h, MAT); L.hline(BIN.x0, BIN.x0 + BIN.w - 1, BIN.y0 + 3, MAT); L.hline(BIN.x0, BIN.x0 + BIN.w - 1, BIN.y0 + 7, MAT);
      // The ore truss: two rails, a post every four columns, in each bay one brace from corner to corner, leaning one way then the other.
      const tx0 = BIN.x0 + BIN.w - 1, tx1 = shell.edge.filter(([, y]) => y === cy - 2).reduce((m, [x]) => Math.min(m, x), 99);
      L.hline(tx0, tx1, cy - 2, MAT); L.hline(tx0, tx1, cy + 2, MAT);
      for (let x = tx0 + 4; x < tx1; x += 4) L.vline(x, cy - 2, cy + 2, MAT);
      for (let b = tx0 + 1, k = 0; b + 2 < tx1; b += 4, k++) {
        if (L.at(b + 1, cy) !== null) continue;
        for (let i = 0; i < 3; i++) L.put(b + i, k % 2 ? cy + 1 - i : cy - 1 + i, k % 2 ? '╱' : '╲', MAT);
      }
      L.box(COL.x0, COL.y0, COL.w, COL.h, MAT);
      const P = roundPad(L, PX, PY, tone, { h: 11 });
      const collar = [];
      for (let y = COL.y0 + 1; y < COL.y0 + COL.h - 1; y++) for (let x = COL.x0 + 1; x < COL.x0 + COL.w - 1; x++) if (L.at(x, y) === null && !shell.has(x, y)) collar.push([x, y]);
      const arcs = [0, 1].map((o) => {
        const cells = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < Wc; x++) {
          if (!inArc(o)(x, y)) continue;
          const r = Math.hypot((x - cx) * A, y - cy), a = Math.atan2(y - cy, (x - cx) * A);
          cells.push({ x, y, u: ARCS.map(([a0, a1]) => (a - a0) / (a1 - a0)).find((v) => v >= 0 && v <= 1), r: (r - rIn - o) / (rOut - rIn), g: dirGlyph(Math.cos(a), Math.sin(a)) });
        }
        return cells;
      });
      const vents = [-50, 50].map((d) => { const a = d * Math.PI / 180; return { a, x: cx + Math.cos(a) * (rIn + rOut) / 2 / A, y: cy + Math.sin(a) * (rIn + rOut) / 2 }; });
      const molten = [], plate = [];
      for (const [x, y] of shell.inner) {
        const inMouth = x > MO.x0 && x < MO.x0 + MO.w - 1 && y > MO.y0 && y < MO.y0 + MO.h - 1;
        const onMouth = x >= MO.x0 && x <= MO.x0 + MO.w - 1 && y >= MO.y0 && y <= MO.y0 + MO.h - 1;
        const d = Math.max(0, MO.x0 - x, x - (MO.x0 + MO.w - 1), MO.y0 - y, y - (MO.y0 + MO.h - 1));
        if (inMouth) molten.push([x, y]);
        else if (!onMouth && L.at(x, y) === null) plate.push({ x, y, d, l: lightAcross(0.5 + (x - cx) * A / (2 * Rs), 0.5 + (y - cy) / (2 * Rs)) });
      }
      const ore = [];
      for (const [a, b] of [[1, 2], [4, 6], [8, 9]]) for (let y = BIN.y0 + a; y <= BIN.y0 + b; y++) for (let x = BIN.x0 + 1; x < BIN.x0 + BIN.w - 1; x++) ore.push([x, y]);
      rimStub(L, 0, cy, -1);
      return { P, arcs, vents, molten, plate, mouthEdge, ore, tx0, tx1, collar };
    },
    frame(D, S, tone, t) {
      const p = pulse(t), o = p > 0.72 ? 1 : 0, wave = (t * 0.45) % 1.6 - 0.3;
      for (const f of S.arcs[o]) {
        const heat = clamp(p * (0.4 + 0.8 * Math.max(0, 1 - Math.abs(f.u - wave) / 0.2)) * (1 - 0.35 * f.r), 0, 1);
        D.put(f.x, f.y, f.g, tint(tone.shadow, tone.lit, 0.35 + 0.65 * heat), 0.7 + 0.3 * heat);
      }
      for (const a of PINS) {
        const cs = Math.cos(a), sn = Math.sin(a), g = dirGlyph(cs, sn);
        for (let r = Rs + 0.5; r <= rIn + o - 0.4; r += 0.5) D.put(cx + cs * r / A, cy + sn * r, g, MAT);
      }
      for (const [x, y, ch] of S.mouthEdge) D.put(x, y, ch, tint(STR, tone.lit, p * 0.9));
      for (const [x, y] of S.molten) {
        const g = p * (0.5 + 0.8 * (fbmWrapped(x * 0.8 + t * 1.7, y * 0.9 - t * 1.1, 12, 17, 2) - 0.45));
        if (g > 0.85) D.put(x, y, '▒', tone.lit); else if (g > 0.66) D.put(x, y, '░', tone.lit);
        else if (g > 0.48) D.put(x, y, '░', tone.mid); else if (g > 0.3) D.put(x, y, '·', tone.mid);
      }
      for (const c of S.plate) ramp(D, c.x, c.y, fbmWrapped(c.x * 0.6, c.y * 0.7 + t * 0.15, 12, 41, 3) + p * Math.max(0, 1 - c.d / 3) * 0.3 + (c.l - 0.5) * 0.2 - 0.03, tone);
      for (const [k, v] of S.vents.entries()) {
        const cs = Math.cos(v.a), sn = Math.sin(v.a), bx = v.x + cs * (o + 1.4) / A, by = v.y + sn * (o + 1.4);
        D.put(bx, by, p > 0.7 ? '▒' : '░', tint(tone.mid, tone.lit, p));
        for (let n = 0; n < 7; n++) {
          const f = (t * 0.24 + n / 7 + k * 0.5) % 1, d = 1.6 + f * 7.5, side = Math.sin(f * 6 + n * 2.1) * f * 0.9;
          D.put(bx + (cs * d - sn * side) / A, by + sn * d + cs * side, f < 0.2 ? 'o' : f < 0.5 ? '°' : '·', f < 0.12 ? tint(tone.lit, DIM, f / 0.12) : DIM, (1 - f) * 0.9);
        }
      }
      fill(D, S.ore, tone, t, { seed: 43, fx: 0.7, fy: 0.5, vx: 0.06, boost: -0.02 });
      for (let k = 0; k < 3; k++) { const x = S.tx0 + 1 + ((t * 1.4 + k * 2.6) % (S.tx1 - S.tx0 - 1)); D.put(x, cy, '▪', tone.lit); }
      for (const [x, y] of S.collar) if (y !== cy) D.put(x, y, '░', tint(tone.shadow, tone.mid, 0.4 + 0.4 * p), 0.8);
      const ride = (t * 0.9) % 1, rx = Math.round(COL.x0 + 1 + ride * (COL.w - 3));
      for (let x = COL.x0 + 1; x < COL.x0 + COL.w - 1; x++) D.put(x, cy, x === rx ? '▪' : '·', x === rx ? tint(tone.lit, tone.mid, ride) : tone.shadow, x === rx ? 1 : 0.7);
      const pad = dockPhase(S, 'pad');
      padFrame(D, S.P, tone, t, pad);
      if (!pad.present) stencilNumber(D, PX + 5, cy - 2, '2', tone.mid, 0.7);
    },
  }, { at: { x: 0, y: cy }, dir: -1, len: 4, style: 'spreader' });
}

// ---- spindle: S10 SPOOL 8 (S10-I1, the one SX liked, with round 4's asks: the pad on the reel's axle row, held by a light mount; the
// external dock apart from it, out of the reel's lower left, sideways). Nothing on the station crosses anything else, and nothing hangs
// apart from it: the tether runs out of the flange's edge into the sheave and down into the pod, one line. -------------------------------

function spindle() {
  const Wc = 60, H = 27, cx = 33, cy = 12, R = 11.2, rWin0 = 3.6, rWin1 = 8.4, rLip = 9.7;
  const PX = 0, PY = cy - 5, MILL = { x0: 53, y0: cy - 6, w: 7, h: 5 }, MX = 56, MY = cy - 4, SHEAVE = { x: 56, y: cy + 1 }, DOCKY = cy + 10;
  const spinOf = (t) => 2.6 * Math.sin(t * 0.11);
  const isWindow = (r, a) => r > rWin0 && r < rWin1 && (((a / (TAU / 4)) % 1) + 1) % 1 < 0.62;
  const flangeEdgeAt = (y, side) => { const dx = Math.sqrt(Math.max(0, R * R - (y - cy) ** 2)) / A; return side < 0 ? Math.ceil(cx - dx) : Math.floor(cx + dx); };
  // The dock's lug: the flange's row on the dock's line carried out under the row above it, so that the dock's module, drawn in, stands
  // clear of the flange's step instead of sitting on its outline.
  const dockX = flangeEdgeAt(DOCKY - 1, -1), lugX1 = flangeEdgeAt(DOCKY, -1) - 1;
  const onFlange = (x, y) => inDisc(cx, cy, R)(x, y) || (y === DOCKY && x >= dockX && x <= lugX1);
  return withDock({
    key: 'spindle', name: 'SPINDLE', hue: '#47C2BE', W: Wc, H,
    docks: { pad: roundPadAt(PX, PY) },
    idea: 'A tether reel seen face on: a flange with four windows showing the wound tether; the pad on its axle row, held by two light rails; on the right a mill drives it and the tether runs out of the flange over a sheave down to a pod; the external dock out of a lug on its lower left.',
    moves: 'the reel turns one way and back, the tether in its windows rolling with it; the tether pays out and winds in with it, a light running along it, the pod going down and up; the mill spins with the reel; the pad answers a docking',
    build(L, tone) {
      const flange = shape(Wc, H, onFlange);
      stroke(L, flange, MAT);
      const disc = flange.inner.map(([x, y]) => ({ x, y, r: Math.hypot((x - cx) * A, y - cy), a: Math.atan2(y - cy, (x - cx) * A), l: lightAcross(0.5 + (x - cx) * A / (2 * R), 0.5 + (y - cy) / (2 * R)), n: hash01(x, y, 3) }));
      const P = roundPad(L, PX, PY, tone, { h: 11 });
      // The mount: two thin rails from the pad's side to the reel's rim, each ending on it.
      for (const y of [cy - 2, cy + 2]) L.hline(PX + PAD.W - 1, Math.min(...flange.edge.filter(([, ey]) => ey === y).map(([ex]) => ex)), y, MAT);
      // The mill on the reel's right at its upper middle, a cell clear of the flange, its shaft into the rim: two rails, each from the
      // flange's own edge on its row; the sheave's arm out of the middle of its foot.
      L.box(MILL.x0, MILL.y0, MILL.w, MILL.h, MAT, true);
      const rightEdge = (y) => Math.max(...flange.edge.filter(([, ey]) => ey === y).map(([x]) => x));
      for (const y of [MY - 1, MY + 1]) L.hline(rightEdge(y), MILL.x0, y, MAT);
      L.vline(SHEAVE.x, MILL.y0 + MILL.h - 1, SHEAVE.y - 1, MAT);
      rimStub(L, dockX, DOCKY, -1);
      // Where the tether leaves the flange: its right edge on the sheave's row.
      const tetherX = Math.max(...flange.edge.filter(([, y]) => y === SHEAVE.y).map(([x]) => x));
      return { P, disc, tetherX };
    },
    frame(D, S, tone, t) {
      const spin = spinOf(t), turning = Math.abs(Math.cos(t * 0.11));
      const win = [];
      for (const c of S.disc) {
        const a = c.a - spin;
        if (isWindow(c.r, a)) { win.push(c); continue; }
        if (c.r < 1.5) continue;
        if (c.r >= rLip) {
          const mark = Math.abs(((((a / (TAU / 12)) % 1) + 1) % 1) - 0.5) < 0.1;
          if (mark) D.put(c.x, c.y, '•', tone.lit, 0.85); else D.put(c.x, c.y, c.l > 0.55 ? '▒' : '░', c.l > 0.55 ? tone.mid : tone.shadow);
          continue;
        }
        const v = c.l + (c.n - 0.5) * 0.2;
        if (v > 0.62) D.put(c.x, c.y, '░', tone.mid); else if (v > 0.38) D.put(c.x, c.y, '░', tone.shadow); else if (c.n > 0.45) D.put(c.x, c.y, '·', tone.rim, 0.6);
      }
      const inWin = new Set(win.map((c) => c.x + ',' + c.y));
      for (const c of win) {
        const up = inWin.has(c.x + ',' + (c.y - 1)), dn = inWin.has(c.x + ',' + (c.y + 1)), lf = inWin.has((c.x - 1) + ',' + c.y), rt = inWin.has((c.x + 1) + ',' + c.y);
        if (!(up && dn && lf && rt)) {
          let bits = 0;
          if (!up && !lf) bits = 6; else if (!up && !rt) bits = 12; else if (!dn && !lf) bits = 3; else if (!dn && !rt) bits = 9; else if (!up || !dn) bits = 10; else bits = 5;
          D.edge(c.x, c.y, bits, MAT, true);
          continue;
        }
        const lit = Math.floor((c.r - rWin0) * 1.6) % 2 === 0;
        D.put(c.x, c.y, dirGlyph(-Math.sin(c.a), Math.cos(c.a)), lit ? (c.l > 0.45 ? HI : tone.lit) : tone.mid, lit ? 0.9 : 0.75);
      }
      D.put(cx, cy, '◆', HI);
      for (const k of [0, 1, 2, 3]) { const a = spin + k * TAU / 4; D.put(cx + Math.cos(a) * 1.15 / A, cy + Math.sin(a) * 1.15, '·', tone.lit); }
      // The mill, its blades spinning as the reel turns.
      const blades = t * (1.2 + 4 * turning);
      for (let x = MILL.x0 + 1; x < MILL.x0 + MILL.w - 1; x++) for (let y = MILL.y0 + 1; y < MILL.y0 + MILL.h - 1; y++) D.put(x, y, ' ', DIM);
      for (let k = 0; k < 4; k++) { const a = blades + k * TAU / 4, cs = Math.cos(a), sn = Math.sin(a); D.put(MX + cs * 0.95 / A, MY + sn * 0.95, dirGlyph(cs, sn), tone.lit); }
      D.put(MX, MY, '◦', HI);
      // The tether out of the flange's right edge into the sheave and down to the pod, one unbroken line: paid out as the reel turns one
      // way, wound in as it turns back, a light running along it as it goes; the pod rides on its end.
      const drop = 3.8 + spin * 0.46, by = SHEAVE.y + Math.round(drop) + 1;
      const tether = [];
      for (let x = S.tetherX; x < SHEAVE.x; x++) tether.push([x, SHEAVE.y, x === S.tetherX ? '╶' : '─']);
      for (let y = SHEAVE.y + 1; y < by; y++) tether.push([SHEAVE.x, y, '│']);
      tether.forEach(([x, y, g], i) => { const lit = i > 0 && (((i - spin * 6) % 4) + 4) % 4 < 1; D.put(x, y, g, lit ? tone.lit : tone.mid, lit ? 1 : 0.85); });
      D.put(SHEAVE.x, SHEAVE.y, 'O', tone.lit);
      const bx = SHEAVE.x;
      for (let i = -2; i <= 2; i++) { D.put(bx + i, by, i === -2 ? '╭' : i === 2 ? '╮' : i === 0 ? '┴' : '─', MAT); D.put(bx + i, by + 2, i === -2 ? '╰' : i === 2 ? '╯' : '─', MAT); }
      D.put(bx - 2, by + 1, '│', MAT); D.put(bx + 2, by + 1, '│', MAT);
      D.put(bx - 1, by + 1, '░', tone.mid); D.put(bx, by + 1, '▪', tone.lit); D.put(bx + 1, by + 1, '░', tone.mid);
      padFrame(D, S.P, tone, t, dockPhase(S, 'pad'));
    },
  }, { at: { x: dockX, y: DOCKY }, dir: -1, len: 4, style: 'round' });
}

// ---- beacon: S11 PHAROS (S11-I3 CRADLE as SX took it, with what he marked: the lantern and the keel joined to the lens, no line crossing
// another (the lantern glazed with upright mullions, a solid collar for the X truss), the pad's frame closed where it meets the cradle,
// the cradle slimmer, nothing hanging in the air) ---------------------------------------------------------------------------------

function beacon() {
  const H = 27, cx = 14, cy = 13, a = 14, side = 4, ch = 4, b = a - ch, top = cy - side - ch, bot = cy + side + ch, panels = 4;
  const PX = cx + a + 4, PY = cy - 5, CRx1 = PX + PAD.W + 2, Wc = CRx1 + 1;     // the collar four cells, the cradle's back two
  const halfAt = (y) => a - Math.max(0, Math.abs(y - cy) - side);
  const inLens = (x, y) => Math.abs(y - cy) <= side + ch && Math.abs(x - cx) <= halfAt(y);
  return withDock({
    key: 'beacon', name: 'BEACON', hue: '#A6DED6', W: Wc, H,
    docks: { pad: roundPadAt(PX, PY) },
    idea: 'The lighthouse\'s lens with its lantern above and its keel below; on its right, on a collar out of its equator, the pad held in the jaws of a counterweight as tall as the lens.',
    moves: 'the belt turns, its bullseyes passing; the prism rings shade and glint; the beam sweeps; the lantern flashes with it; light runs through the collar to the cradle; the pad answers a docking',
    build(L, tone) {
      // The lens: an octagon of straight lines, its sides upright, its corners cut one cell a row.
      L.hline(cx - b, cx + b, top, MAT); L.hline(cx - b, cx + b, bot, MAT);
      L.vline(cx - a, cy - side, cy + side, MAT); L.vline(cx + a, cy - side, cy + side, MAT);
      for (let i = 1; i < ch; i++) { L.put(cx - b - i, top + i, '╱', MAT); L.put(cx + b + i, top + i, '╲', MAT); L.put(cx - b - i, bot - i, '╲', MAT); L.put(cx + b + i, bot - i, '╱', MAT); }
      // The lantern standing on the lens's top edge, its cap rounded, its glass between upright mullions; the keel hung from the bottom
      // edge, its mast and lamp under it.
      L.box(cx - 5, 1, 11, top, MAT, true);
      for (const x of [cx - 3, cx + 3]) L.vline(x, 1, top, MAT);
      L.box(cx - 4, bot, 9, 3, MAT, true); L.vline(cx, bot + 2, H - 2, MAT); L.edge(cx, H - 1, 1, MAT);
      // The collar out of the lens's equator to the pad, and the cradle round the pad: one line down its left side, the pad's frame
      // closed, the cradle's mass above, behind and below it.
      L.box(cx + a, cy - 3, PX - cx - a + 1, 7, MAT);
      L.box(PX, top, CRx1 - PX + 1, bot - top + 1, MAT, true);
      const P = roundPad(L, PX, PY, tone, { h: 11 });
      const collar = [];
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx + a + 1; x < PX; x++) collar.push([x, y]);
      const mass = [];
      for (let y = top + 1; y < bot; y++) for (let x = PX + 1; x < CRx1; x++) {
        if (x <= PX + PAD.W - 1 && y >= PY && y <= PY + 10) continue;
        if (L.at(x, y) === null) mass.push({ x, y, l: lightAcross((x - PX) / (CRx1 - PX), (y - top) / (bot - top)) });
      }
      const lantern = [];
      for (let y = 2; y < top; y++) for (let x = cx - 4; x <= cx + 4; x++) if (L.at(x, y) === null) lantern.push([x, y]);
      const fins = [];
      for (let x = cx - 3; x <= cx + 3; x++) fins.push([x, bot + 1]);
      const prisms = [], belt = [];
      for (let y = top + 1; y < bot; y++) for (let x = cx - a + 1; x <= cx + a - 1; x++) {
        if (Math.abs(x - cx) >= halfAt(y) || L.at(x, y) !== null) continue;
        const dy = y - cy, u = (x - cx) / halfAt(y);
        if (Math.abs(dy) === 3) { L.put(x, y, '─', MAT, 0.85); continue; }
        if (Math.abs(dy) < 3) belt.push({ x, y, u, n: hash01(x, y, 5) });
        else prisms.push({ x, y, u, solid: Math.abs(dy) % 2 === 0 });
      }
      rimStub(L, cx - a, cy, -1);
      return { P, collar, mass, lantern, fins, prisms, belt };
    },
    frame(D, S, tone, t) {
      const spin = t * 0.5, theta = spin * 2, flash = Math.abs(Math.sin(theta)) > 0.85;
      // The lantern: its lamp in the middle, pulsing with the beam's flash, its glass lit faintly; the vent light on its cap.
      for (const [x, y] of S.lantern) {
        if (y === 3 && Math.abs(x - cx) <= 1) D.put(x, y, x === cx ? (flash ? '◆' : '◇') : '·', flash ? HI : tone.lit);
        else if ((x + y) % 2 === 0) D.put(x, y, '·', tone.rim, flash ? 0.6 : 0.3);
      }
      D.put(cx, 1, flash ? '●' : '◦', flash ? HI : tone.lit);
      const glintAt = Math.sin(theta);
      for (const p of S.prisms) {
        const facing = Math.sqrt(Math.max(0, 1 - p.u * p.u)), lit = facing * (0.8 - 0.3 * p.u);
        if (Math.abs(p.u - glintAt) < 0.12 && Math.cos(theta) > 0) D.put(p.x, p.y, '─', HI, 0.9);
        else if (p.solid) D.put(p.x, p.y, '─', tint(STR, tone.lit, lit * 0.7), 0.35 + 0.5 * lit);
        else D.put(p.x, p.y, lit > 0.6 ? '▒' : '░', lit > 0.45 ? tone.mid : tone.rim, 0.25 + 0.6 * lit);
      }
      for (const c of S.belt) { const facing = Math.sqrt(Math.max(0, 1 - c.u * c.u)); if (c.n < 0.25 + 0.35 * facing) D.put(c.x, c.y, '·', tone.rim, 0.25 + 0.4 * facing); }
      const hw = (a - 1) * 0.95;
      for (let pn = 0; pn < panels * 2; pn++) {
        const an = spin + pn * Math.PI / panels, c = Math.cos(an);
        if (c <= 0.05) continue;
        const x = cx + Math.sin(an) * hw;
        if (pn % 2 === 1) { for (let y = cy - 2; y <= cy + 2; y++) D.put(x, y, '│', STR, 0.3 + 0.6 * c); continue; }
        for (const [r, rh, al] of [[3.4, 2, 0.55], [1.7, 1, 0.85]]) {
          const rw = Math.max(1, Math.round(r * c));
          for (let y = cy - rh; y <= cy + rh; y++) {
            const e = Math.abs(y - cy) === rh;
            D.put(x - rw, y, e ? (y < cy ? '╭' : '╰') : '│', tone.lit, al * (0.3 + 0.7 * c));
            D.put(x + rw, y, e ? (y < cy ? '╮' : '╯') : '│', tone.lit, al * (0.3 + 0.7 * c));
            if (e) for (let i = -rw + 1; i <= rw - 1; i++) D.put(x + i, y, '─', tone.lit, al * (0.3 + 0.7 * c));
          }
        }
        D.put(x, cy, c > 0.92 ? '◆' : '◇', c > 0.92 ? HI : tone.lit);
      }
      // The beam sweeps the left half of the sky; the lantern and keel, the dock's line and a ship held there stand in its way.
      const held = dockPhase(S, 'ext').present ? 5 : 1;
      beamSweep(D, cx, cy, theta, 26, tone, (x, y) => inLens(x, y) || x >= cx + a || (Math.abs(x - cx) <= 6 && (y < top || y > bot)) || (x < cx - a && Math.abs(y - cy) <= held));
      // The collar: plating, a light running through it into the cradle; the cradle: heavy plates lit from the upper left.
      const run = (t * 0.7) % 1, rx = Math.round(cx + a + 1 + run * (PX - cx - a - 2));
      for (const [x, y] of S.collar) D.put(x, y, y === cy && x === rx ? '•' : '░', y === cy && x === rx ? HI : tint(tone.shadow, tone.mid, 0.5), y === cy && x === rx ? 1 : 0.7);
      for (const m of S.mass) D.put(m.x, m.y, m.l > 0.62 ? '▒' : '░', m.l > 0.42 ? tone.mid : tone.shadow, 0.85);
      const k = Math.floor(t * 4) % S.fins.length;
      S.fins.forEach(([x, y], i) => { if (i % 2 === 0) D.put(x, y, '┊', Math.abs(i - k) < 2 ? tone.lit : DIM); });
      lampAt(D, cx, H - 1, blinkOn(t, 2.4, 0.4, 1.2));
      padFrame(D, S.P, tone, t, dockPhase(S, 'pad'));
    },
  }, { at: { x: cx - a, y: cy }, dir: -1, len: 4, style: 'eye' });
}

// ---- anchor: S13 WHARF 9 (S13-I3 HORSESHOE as SX took it: «берем, можно еще какой-то висящий модуль сделать типо капсулы с водой
// мотающейся на цепочке»; its dock's root now on the rim's drawn edge) ------------------------------------------------------------

function anchor() {
  const H = 27, cy = 13, Ro = 12.4, Ri = 8.2, cx = 27, GAP = 0.6, mid = (Ro + Ri) / 2;
  const PX = cx - 6, PY = cy - 5;
  const angleOf = (x, y) => Math.atan2(y - cy, (x - cx) * A);
  const inRim = (x, y) => { const r = Math.hypot((x - cx) * A, y - cy); return r >= Ri && r <= Ro && Math.abs(angleOf(x, y) + Math.PI / 2) > GAP; };
  const tips = [-Math.PI / 2 - GAP, -Math.PI / 2 + GAP].map((a) => ({ a, side: a < -Math.PI / 2 ? -1 : 1, x: cx + Math.cos(a) * mid / A, y: cy + Math.sin(a) * mid }));
  const FL = 4;
  const inFluke = (x, y) => tips.some((f) => { const r = Math.round(f.y) + 1 - y; if (r < 0 || r > FL) return false; const c = f.x + f.side * r * 0.8; return Math.abs(x - c) <= (FL - r) * 1.15 + 0.2; });
  const rimEdgeAt = (y, side) => { const dx = Math.sqrt(Math.max(0, Ro * Ro - (y - cy) ** 2)) / A; return side < 0 ? Math.ceil(cx - dx) : Math.floor(cx + dx); };
  const DY = cy + 4, DAVIT = { x0: rimEdgeAt(DY, -1) - 3, x1: rimEdgeAt(DY, -1) };     // the capsule's davit, off the rim's lower left
  const Wc = rimEdgeAt(cy, 1) + 1;
  return withDock({
    key: 'anchor', name: 'ANCHOR', hue: '#47C2BE', W: Wc, H,
    docks: { pad: roundPadAt(PX, PY) },
    idea: 'A wheel opened at the top into a horseshoe: its rim the habitat, its hub the pad on the axis, held by three spokes and the mast that runs up through the opening to a small ring; its two tips lit flukes; a capsule of water swings on a chain from a davit off its lower left.',
    moves: 'the rim\'s windows light along it, a wave going round from tip to tip; the flukes\' lamps answer each other; a light climbs the mast to the ring; the water capsule swings on its chain, its water sloshing against the swing; the pad answers a docking',
    build(L, tone) {
      const rim = shape(Wc, H, (x, y) => inRim(x, y) || inFluke(x, y));
      stroke(L, rim, MAT, (x, y) => !inFluke(x, y) && Math.hypot((x - cx) * A, y - cy) < mid);
      const P = roundPad(L, PX, PY, tone, { h: 11 });
      // The hub's three spokes, left, right and down, each out of the pad's frame (its side or foot taking the joint) to the rim; the
      // mast is the fourth. The two slanted spokes of S13-I3 are gone: a slanted line never meets a frame's corner in these cells.
      L.edge(PX, cy, 8, MAT); L.edge(PX + PAD.W - 1, cy, 2, MAT); L.edge(cx, PY + 10, 4, MAT);
      for (const d of [0, 90, 180]) {
        const a = d * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), g = dirGlyph(cs, sn);
        for (let r = 2; r <= Ri + 0.2; r += 0.3) {
          const x = Math.round(cx + cs * r / A), y = Math.round(cy + sn * r);
          if (x >= PX && x < PX + PAD.W && y >= PY && y < PY + 11) continue;
          if (inRim(x, y) || L.at(x, y) !== null) continue;
          L.put(x, y, g, STR, 0.9);
        }
      }
      L.vline(cx, 2, PY, MAT); L.box(cx - 2, 0, 5, 3, MAT, true);
      // The davit: a short arm out of the rim's lower left, its end turned down for the chain.
      L.hline(DAVIT.x0, DAVIT.x1, DY, MAT); L.edge(DAVIT.x0, DY, 4, MAT);
      const cells = [];
      for (const [x, y] of [...rim.inner, ...rim.edge.map(([ex, ey]) => [ex, ey])]) {
        if (L.at(x, y) !== null) continue;
        cells.push({ x, y, a: angleOf(x, y), r: Math.hypot((x - cx) * A, y - cy), l: lightAcross(0.5 + (x - cx) * A / (2 * Ro), 0.5 + (y - cy) / (2 * Ro)), n: hash01(x, y, 21), fluke: inFluke(x, y) && !inRim(x, y) });
      }
      rimStub(L, Wc - 1, cy, 1);
      return { P, cells };
    },
    frame(D, S, tone, t) {
      const span = 2 * Math.PI - 2 * GAP, wave = ((t * 0.16) % 1.4) - 0.2, alt = Math.floor(t * 1.4) % 2 === 0;
      for (const c of S.cells) {
        if (c.fluke) { const left = c.x < cx; D.put(c.x, c.y, left === alt ? '▒' : '░', left === alt ? tone.lit : tone.mid); continue; }
        const u = (((c.a + Math.PI / 2) % TAU + TAU) % TAU - GAP) / span;
        if (Math.abs(c.r - mid) < 0.5) {
          const near = Math.abs(u - wave) < 0.05, on = near || (Math.floor(u * 40) + Math.floor(t * 0.6)) % 3 === 0;
          D.put(c.x, c.y, on ? '▪' : '·', near ? HI : on ? tone.lit : tone.rim, on ? 1 : 0.75);
          continue;
        }
        const v = c.l + (c.n - 0.5) * 0.25 + (c.r > mid ? 0.08 : -0.04);
        if (v > 0.62) D.put(c.x, c.y, '▒', tone.mid); else if (v > 0.4) D.put(c.x, c.y, '░', tone.mid); else if (v > 0.2) D.put(c.x, c.y, '░', tone.shadow); else D.put(c.x, c.y, '·', tone.rim, 0.6);
      }
      for (const f of tips) D.put(Math.round(f.x + f.side * FL * 0.8), Math.round(f.y) + 1 - FL, (f.side < 0) === alt ? '◆' : '◇', (f.side < 0) === alt ? HI : tone.lit);
      const m = (t * 0.8) % 1;
      D.put(cx, Math.round(lerp(PY - 1, 1, m)), '•', HI, 1 - m * 0.4);
      // The water capsule: two links of chain from the davit's hook, the upper under the hook, the lower and the capsule swung a cell
      // either way at the swing's ends, the chain leaning with them; the water in it sloshing against the swing.
      const sw = Math.sin(t * 0.8), x0 = DAVIT.x0, s = sw > 0.55 ? 1 : sw < -0.55 ? -1 : 0;
      D.put(x0, DY + 1, 'o', MAT); D.put(x0 + s, DY + 2, 'o', MAT);
      const bx = x0 + s, by = DY + 3, lean = Math.sin(t * 0.8 - 0.9);
      for (let i = -3; i <= 3; i++) {
        D.put(bx + i, by, i === -3 ? '╭' : i === 3 ? '╮' : i === 0 ? '┴' : '─', STR);
        D.put(bx + i, by + 3, i === -3 ? '╰' : i === 3 ? '╯' : '─', STR);
      }
      for (const y of [by + 1, by + 2]) { D.put(bx - 3, y, '│', STR); D.put(bx + 3, y, '│', STR); }
      for (let i = -2; i <= 2; i++) {
        D.put(bx + i, by + 2, '≈', tone.lit, 0.9);
        if (i * lean < 0.4) D.put(bx + i, by + 1, '~', tone.mid, 0.85);
      }
      if (blinkOn(t, 3.1, 0.5)) D.put(bx + 2, by + 1, '╱', HI, 0.7);
      padFrame(D, S.P, tone, t, dockPhase(S, 'pad'));
    },
  }, { at: { x: Wc - 1, y: cy }, dir: 1, len: 4, style: 'round' });
}

// ---- the set, and how a station is put on a canvas ------------------------------------------

export const STATION_MAKERS = [ring, spindle, foundry, greenhouse, beacon, lattice, wheel, hive, depot, array, spire, anchor];
export const MAX_CELLS = { w: 42, h: 22 };

export function prepare(make) {
  const def = make();
  const tone = planetTones(planetHue(def.hue));
  const layer = new Layer(def.W, def.H);
  const S = def.build(layer, tone) || {};
  return { ...def, tone, layer, S, dyn: new Layer(def.W, def.H) };
}

// Every cell a station shows at time `t`, as `fn(x, y, ch, ink, alpha, moving)`: the dynamic layer wins over the
// static one where both have a cell (a blank dynamic cell erases); `moving` says the cell is the dynamic layer's.
export function stationCells(st, t, fn) {
  const { W, H, layer: L, dyn: D } = st;
  D.clear();
  st.frame(D, st.S, st.tone, t);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (D.ch[i] !== null) { if (D.ch[i] !== ' ') fn(x, y, D.ch[i], D.ink[i], D.al[i], true); continue; }
    if (L.ch[i] !== null) fn(x, y, L.ch[i], L.ink[i], L.al[i], false);
  }
}

// Draws one station centred at (ox, oy), each cell `sc` times the game's glyph size: its board's middle there (the sketch pages' way;
// the game draws a look about its own middle, `lookOrigin`, world-art.js drawLook).
export function paintStation(r, st, t, ox, oy, sc) {
  const { W, H } = st, w = r.cellW * sc, h = r.cellH * sc;
  stationCells(st, t, (x, y, c, ink, alpha) => r.glyph(c, ox + (x - (W - 1) / 2) * w, oy + (y - (H - 1) / 2) * h, ink, alpha, sc));
}
// The cell of a look's board that stands at the station's own place: the middle of the station itself, its dock and its docked ship
// beside it (a look without a dock: its board's middle).
export const lookOrigin = (st) => st.origin ?? { x: (st.W - 1) / 2, y: (st.H - 1) / 2 };

// ---- in the game ---------------------------------------------------------------------------

// A station's look by its key (src/sectors.js `look`), prepared once and shared by every station wearing it.
// The game draws them at LOOK_SCALE: 1.3, the scale its garage was drawn at, until SX found the stations too small
// (2026-10-01: «Станции реально слишком маленькие»); half again since, with their bodies (CONFIG.station.bodies).
// Then half of that growth back (SX, the same night: «посмотри, насколько ты увеличил станции в прошлый раз. И ровно в
// половину от этого уменьши их снова, потому что они сейчас большие, никогда не помещаются в экран»): a quarter over
// the garage's 1.3, with their bodies.
export const LOOK_SCALE = 1.625;
export const LOOKS = Object.freeze(Object.fromEntries(STATION_MAKERS.map((make) => [make().key, make])));
// Every ink a look draws besides the roles: its hue's tones, the quiet gray of its unlit lamps, and the few
// mixes `tint` has made between those (checks/graphics-lab.mjs holds the world's inks to these).
export function lookInks() {
  const inks = new Set([DIM, ...mixed.values()]);
  for (const make of Object.values(LOOKS)) for (const c of Object.values(planetTones(planetHue(make().hue)))) inks.add(c);
  return inks;
}
const prepared = new Map();
export function stationLook(key) {
  if (!LOOKS[key]) return null;
  if (!prepared.has(key)) prepared.set(key, prepare(LOOKS[key]));
  return prepared.get(key);
}

// The board's parts, for the sketch pages that draw new looks by the same rules (labs/graphics/sketches/station-redraws.js).
export { A as CELL_ASPECT, MAT, STR, HI, DIM, shape, inDisc, inEll, stroke, hash01, tint, dirGlyph, ramp, fill, sphereFill, withDock };
