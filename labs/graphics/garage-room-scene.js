// The garage's room taken apart into its things, as SX picked it on labs/graphics/sketches/garage-interior.html (S5, 2026-10-04,
// the final PICK: «берем твое предложение только давай избавимся вообще от черного контура ... при ховере белого контура нет»):
// I3 BLUE EMBER, X3 LINE SCROLL, H2 GROW with the rest dimmed 10 %, no outline at all. The sketch is the reference; this is its PICK
// for the game, read from the same cells (garage-room-art.js read, B2 NIGHT) and drawn by the same painter (drawRoom):
//
//   the cut-outs   each thing's own cells (its shape from SX's line drawing of the room, the game's rule: garage-room-art.js
//                  readMasks), the table's among them, each on a layer of its own, nearest first claiming a cell, each ONE solid
//                  piece (SX, 2026-10-04: «предметы были выделены цельным куском, без летающих вокруг других наборов пикселей не
//                  сопряженных»): the largest edge-connected piece of what it claims, with the gaps it encloses; the cells cut off
//                  it are left to the next that claims them, or to the room (solidPiece);
//   the plate      the room with the things lifted out, each lifted cell filled from the cells round it (a harmonic fill of their
//                  light, no hue), so what shows behind a thing that moves is the room, never a black cut-out (SX: «чтобы аккуратно
//                  фон за ними выглядел ... вариант карты без предметов, а предметы с готовой картинки вырезать и положить на нее»);
//   I3 BLUE EMBER  the painter's inks swapped as its glyphs are drawn: a step of the room's ladder keeps its step and its light
//                  (OKLCH lightness), its hue and chroma come from a field over the room (the cave's stone, its walls, the floor, the
//                  cold light from the window, the warm light round the desk); a thing's step takes the same step of its new hue;
//   X3 LINE SCROLL each layer moves with the pointer by its depth (px at the room's edge; + against the pointer, - with it), the
//                  floor and the vault row by row (as the floors of Street Fighter II), each thing at the depth of its feet, the
//                  things on the table at the table's and a micro step of their own, the stars and the ship outside behind.
//
// Nothing here draws to the screen; labs/graphics/garage-room.js lays the layers.

import { PALETTE } from '../../src/roles.js';
import { oklch, fromLch } from '../../src/grade.js';
import { mixHex, clamp, lerp } from '../../src/util.js';
import { PICKS, PANES, SCREEN, inRect, readMasks } from './garage-room-art.js';

const DEG = Math.PI / 180;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- the things ----------------------------------------------------------------------------------------------------------------
// SX's order, near to far: the car, the armchair, the table and the cabinets (the filing cabinet, the crate), the things on them,
// each apart, then the wall's things (the shelf's and the print), the room, the ship passing, the stars.
export const ITEMS = Object.freeze(['TELEVISION', 'GAMEPAD', 'RADIO', 'FIGURE', 'CONSOLE', 'CARTRIDGE', 'MANGA', 'PHOTO']);
// What each thing stands on, and its own small step of depth there, px at the pointer's edge (SX: «предметы все отдельно, но с
// микро разницей по движению»).
const SUPPORT = Object.freeze({ TELEVISION: 'TABLE', GAMEPAD: 'TABLE', RADIO: 'TABLE', FIGURE: 'TABLE', CONSOLE: 'CABINET',
  CARTRIDGE: 'WALL', MANGA: 'WALL', PHOTO: 'WALL' });
const MICRO = Object.freeze({ TELEVISION: 0, GAMEPAD: 0.9, RADIO: 0.5, FIGURE: -0.4, CONSOLE: 0.45, CARTRIDGE: 0.4, MANGA: 0.15, PHOTO: -0.35 });
// Cut out, nearest first: a cell belongs to the first that claims it.
const CUTOUTS = Object.freeze(['SHIP', 'ARMCHAIR', ...ITEMS, 'CRATE', 'CABINET', 'TABLE']);
// What answers the pointer (the table does nothing, but moves on a layer all the same).
export const ACTIVE = Object.freeze(['SHIP', 'ARMCHAIR', 'CABINET', 'CRATE', ...ITEMS]);
// Drawn far to near.
export const ORDER = Object.freeze(['PHOTO', 'MANGA', 'CARTRIDGE', 'TABLE', 'CABINET', 'CRATE', 'CONSOLE', 'TELEVISION', 'FIGURE', 'RADIO', 'GAMEPAD', 'ARMCHAIR', 'SHIP']);
// The table, which the game did not mark (the picture's own px, 1672 x 941).
const R = (x0, y0, x1, y1) => ({ x0: x0 / 1672, y0: y0 / 941, x1: x1 / 1672, y1: y1 / 941 });
const REGIONS = Object.freeze({ ...Object.fromEntries(PICKS.map((p) => [p.name, p])), TABLE: R(930, 466, 1380, 650) });
// Cells a layer at the room's edge runs on past it, its edge cells repeated, so a lean never shows its end.
const BLEED = 4;

// The plate: the room's cells with every cut-out cell filled from its neighbours. Their light (on the eye's cube-root curve) is a
// harmonic fill of what surrounds them: rings from the edge inward, then relaxed; the panes and the black where the ship was lifted
// out of the window are no neighbours. A filled cell has no hue, no quarters, no thing: the calm ladder's fill.
function cleanPlate(s, holes) {
  const { cols, rows, cells } = s, n = cols * rows;
  const pane = new Uint8Array(n);
  for (const c of cells) if (PANES.some((p) => inRect(c, s, p)) || c.erased) pane[c.j * cols + c.i] = 1;
  const val = new Float32Array(n), valL = new Float32Array(n), known = new Uint8Array(n);
  for (const c of cells) {
    const k = c.j * cols + c.i;
    val[k] = Math.cbrt(c.Ys); valL[k] = c.L;
    known[k] = holes.has(k) || pane[k] ? 0 : 1;
  }
  const near = (k) => { const i = k % cols, j = (k - i) / cols, out = []; if (i > 0) out.push(k - 1); if (i < cols - 1) out.push(k + 1); if (j > 0) out.push(k - cols); if (j < rows - 1) out.push(k + cols); return out; };
  let todo = [...holes].filter((k) => !pane[k]);
  const filled = new Uint8Array(n);
  for (let ring = 0; ring < 200 && todo.length; ring++) {
    const now = [];
    for (const k of todo) {
      let a = 0, b = 0, m = 0;
      for (const q of near(k)) if (known[q] || filled[q] === 2) { a += val[q]; b += valL[q]; m++; }
      if (m) now.push([k, a / m, b / m]);
    }
    if (!now.length) break;
    for (const [k, a, b] of now) { val[k] = a; valL[k] = b; filled[k] = 2; }
    todo = todo.filter((k) => filled[k] !== 2);
  }
  const free = [...holes].filter((k) => !pane[k]);
  for (let it = 0; it < 160; it++) {
    for (const k of free) {
      let a = 0, b = 0, m = 0;
      for (const q of near(k)) if (!pane[q]) { a += val[q]; b += valL[q]; m++; }
      if (m) { val[k] = a / m; valL[k] = b / m; }
    }
  }
  return cells.map((c) => {
    const k = c.j * cols + c.i;
    if (!holes.has(k) || pane[k]) return c;
    const Y = val[k] ** 3;
    return { ...c, Y, Ys: Y, qY: [Y, Y, Y, Y], q: [valL[k], valL[k], valL[k], valL[k]], L: valL[k], l: valL[k], raw: 0, tint: null, thing: null, erased: false, filled: true };
  });
}

// The pieces of a set of cell indexes (`cols` a row), cells joined by an edge (not by a corner alone): arrays of indexes, largest first.
export function pieces(set, cols, rows) {
  const seen = new Set(), out = [];
  for (const start of set) {
    if (seen.has(start)) continue;
    const piece = [], stack = [start];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop(), i = k % cols, j = (k - i) / cols;
      piece.push(k);
      for (const [ni, nj] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
        const q = nj * cols + ni;
        if (ni >= 0 && nj >= 0 && ni < cols && nj < rows && set.has(q) && !seen.has(q)) { seen.add(q); stack.push(q); }
      }
    }
    out.push(piece);
  }
  return out.sort((a, b) => b.length - a.length || a[0] - b[0]);
}
// The cells of `set` no way out of its box reaches through cells outside it: the gaps it encloses.
export function enclosed(set, cols, rows) {
  let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity;
  for (const k of set) { const i = k % cols, j = (k - i) / cols; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
  if (!set.size) return [];
  const W = i1 - i0 + 3, H = j1 - j0 + 3, out = new Uint8Array(W * H), stack = [0];
  const at = (x, y) => (j0 - 1 + y) * cols + (i0 - 1 + x);
  out[0] = 1;
  while (stack.length) {
    const q = stack.pop(), x = q % W, y = (q - x) / W;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || out[ny * W + nx]) continue;
      const inside = nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1;
      if (inside && set.has(at(nx, ny))) continue;
      out[ny * W + nx] = 1; stack.push(ny * W + nx);
    }
  }
  const gaps = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!out[y * W + x] && !set.has(at(x, y))) gaps.push(at(x, y));
  return gaps;
}
// A cut-out as one solid piece: the largest piece of `claim`, with the gaps it encloses that `mayFill` gives it.
export function solidPiece(claim, cols, rows, mayFill = () => true) {
  const piece = new Set(pieces(claim, cols, rows)[0] ?? []);
  for (const k of enclosed(piece, cols, rows)) if (mayFill(k)) piece.add(k);
  return piece;
}

// Cells repeated past the room's edges, `B` deep, for a layer whose cells reach an edge.
function bleed(list, s, B = BLEED) {
  const { cols, rows } = s, at = new Map(list.map((c) => [c.j * cols + c.i, c])), out = [];
  for (const c of list) {
    const left = c.i === 0, right = c.i === cols - 1, top = c.j === 0, bottom = c.j === rows - 1;
    if (!left && !right && !top && !bottom) continue;
    for (let di = left ? -B : 0; di <= (right ? B : 0); di++) for (let dj = top ? -B : 0; dj <= (bottom ? B : 0); dj++) {
      if (!di && !dj) continue;
      const i = c.i + di, j = c.j + dj;
      if (i >= 0 && i < cols && j >= 0 && j < rows) continue;
      if (i >= 0 && i < cols && !at.has(clamp(j, 0, rows - 1) * cols + i)) continue;
      out.push({ ...c, i, j, bled: true });
    }
  }
  return out;
}
const boxOf = (list) => {
  let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity;
  for (const c of list) { i0 = Math.min(i0, c.i); i1 = Math.max(i1, c.i); j0 = Math.min(j0, c.j); j1 = Math.max(j1, c.j); }
  return { i0, j0, i1, j1 };
};

// The scene from the room's reading `s` (garage-room-art.js read) and SX's line drawing of it: { s, cols, rows, layers, contact }.
// `layers` by id: each thing's cut-out, PLATE (the room without them), PANES (the stars in the window) and VISITOR (the ship
// passing, drawn as it flies); a layer is { id, cells, own (its own cells' indexes), box (in cells, its bleed included), thingBox,
// backed (each cell black under its glyph), opaque }. `contact`: where each thing touches the floor (its lowest row, 0..1 down).
export function buildScene(s, drawing) {
  const { w, h, masks } = readMasks(drawing, s, CUTOUTS, REGIONS);
  const { cols, rows, cells } = s;
  const idx = (c) => c.j * cols + c.i;
  const skyCell = (c) => PANES.some((p) => inRect(c, s, p)) || c.erased;
  // Each cut-out's cells: its shape, and for a thing on the desk also its own lit cells (the painting's figure is wider than the
  // drawing's); of what no nearer one took, one solid piece (solidPiece).
  const owner = new Map();
  const free = (k) => !owner.has(k) && !skyCell(cells[k]);
  for (const name of CUTOUTS) {
    const set = new Set(masks.get(name).cells);
    if (ITEMS.includes(name) || name === 'CRATE') for (const c of cells) if (c.thing === name) set.add(idx(c));
    for (const k of solidPiece(new Set([...set].filter(free)), cols, rows, free)) owner.set(k, name);
  }
  const layerCells = new Map(CUTOUTS.map((n) => [n, []]));
  for (const [k, name] of owner) layerCells.get(name).push(cells[k]);
  const holes = new Set(owner.keys());
  const plate = cleanPlate(s, holes);
  // Where each stands: its lowest row (the car runs on past the frame: its stand's foot is lower than the picture's edge).
  const contact = {};
  for (const name of CUTOUTS) {
    const m = masks.get(name).mask;
    let low = 0;
    for (let y = h - 1; y >= 0 && !low; y--) for (let x = 0; x < w; x++) if (m[y * w + x]) { low = (y + 1) / h; break; }
    contact[name] = low;
  }
  contact.SHIP = 1.08;
  const layers = new Map();
  for (const name of CUTOUTS) {
    const own = layerCells.get(name);
    const list = [...own, ...bleed(own, s)];
    layers.set(name, { id: name, cells: list, own: new Set(own.map(idx)), box: boxOf(list), thingBox: boxOf(own), backed: true });
  }
  const plateCells = plate.filter((c) => !skyCell(c));
  const all = [...plateCells, ...bleed(plateCells, s)];
  layers.set('PLATE', { id: 'PLATE', cells: all, own: new Set(), box: boxOf(all), backed: true });
  const paneCells = cells.filter((c) => PANES.some((p) => inRect(c, s, p)));
  const pb = boxOf(paneCells), PB = 3;
  layers.set('PANES', { id: 'PANES', cells: paneCells, own: new Set(), box: { i0: pb.i0 - PB, j0: pb.j0 - PB, i1: pb.i1 + PB, j1: pb.j1 + PB }, backed: false, opaque: true });
  layers.set('VISITOR', { id: 'VISITOR', cells: [], own: new Set(), box: { i0: pb.i0 - 26, j0: pb.j0 - PB, i1: pb.i1 + 6, j1: pb.j1 + PB }, backed: false });
  const tv = layers.get('TELEVISION');
  tv.screen = tv.cells.filter((c) => !c.bled && inRect(c, s, SCREEN));
  return { s, cols, rows, layers, contact };
}

// The ship passing outside, as the painter flies it (its cells moved across and bobbing), as plain cells with the light the painter
// gives it (2.4 times the room's exposure), for a layer of its own between the stars and the room.
export function visitorCells(scene, t) {
  const { s } = scene, span = Math.round(s.cols * 0.5), dx = Math.floor((t * 3.2) % (span + 30)) - 22, bob = Math.round(Math.sin(t * 0.7) * 0.6);
  return s.sprite.map((c) => ({ ...c, i: c.i + dx, j: c.j + bob, qY: c.qY.map((q) => q * 2.4), Y: c.Y * 2.4, Ys: c.Ys * 2.4, thing: null }));
}

// ---- I3 BLUE EMBER ----------------------------------------------------------------------------------------------------------------
// The painter's inks (garage-room-art.js): the room's own ladder is four inks; a thing's is five steps of its hue (darkened three
// steps, itself, toward white); the planets' hues stand in for a saturated part that is no thing.
const NEUTRAL_INKS = ['#2C5290', PALETTE.blue, mixHex(PALETTE.blue, PALETTE.white, 0.4), PALETTE.white];
const NEUTRAL_K = new Map(NEUTRAL_INKS.map((ink, k) => [ink, k]));
const HUES = Object.freeze({ red: '#D0898C', orange: '#C98A5E', yellow: '#D2A868', green: '#46AF7E', purple: '#A99BE0' });
const SCREEN_HUE = '#A6DED6';
const derive = (hue) => [mixHex(hue, '#000000', 0.6), mixHex(hue, '#000000', 0.38), mixHex(hue, '#000000', 0.18), hue, mixHex(hue, PALETTE.white, 0.4)];
const HUE_K = new Map();
for (const base of new Set([...Object.values(HUES), ...PICKS.filter((p) => p.hue).map((p) => p.hue), SCREEN_HUE])) {
  derive(base).forEach((ink, k) => { if (!HUE_K.has(ink)) HUE_K.set(ink, []); HUE_K.get(ink).push({ base, k }); });
}
const BAND_OF = new Map(Object.entries(HUES).map(([name, hex]) => [hex, name]));
const THING_HUE = new Map(PICKS.filter((p) => p.hue).map((p) => [p.name, p.hue]));
const BASE_L = NEUTRAL_INKS.map((ink) => oklch(ink)[0]);
// A step's chroma as a share of the field's.
const RATIO = [1.15, 1, 0.72, 0.28];

// [hue°, chroma at the ladder's middle step, lightness added]: `stone` the cave's rock round the edges, `room` its walls, `floor`,
// `window` the light falling in from the panes, `lamp` the warm light round the desk and the monitor; `sky` the stars; `things`
// each thing's new hue (its light kept), `bands` the saturated parts that are no thing (the visitor's red, the sun on the print).
export const BLUE_EMBER = Object.freeze({ code: 'I3', name: 'BLUE EMBER',
  stone: [258, 0.06], room: [250, 0.08], floor: [246, 0.07, -0.01], window: [238, 0.1, 0.01], lamp: [48, 0.095, 0.025], sky: [245, 0.035],
  things: { CONSOLE: [86, 0.045], CARTRIDGE: [112, 0.07], MANGA: [16, 0.11], PHOTO: [232, 0.075], TELEVISION: [70, 0.1], GAMEPAD: [292, 0.08],
    RADIO: [190, 0.08], FIGURE: [152, 0.11], CRATE: [55, 0.09], ARMCHAIR: [330, 0.07] },
  bands: { red: [22, 0.13], orange: [52, 0.1], yellow: [80, 0.1], green: [152, 0.1], purple: [300, 0.08] },
  screen: [190, 0.075] });

const vec = ([H, C, dL = 0]) => ({ a: C * Math.cos(H * DEG), b: C * Math.sin(H * DEG), dL });
const gauss = (u, v, cu, cv, su, sv) => Math.exp(-(((u - cu) ** 2) / (2 * su * su) + ((v - cv) ** 2) / (2 * sv * sv)));
// The field's weights at a point of the room (0..1 across and down).
function fieldWeights(u, v) {
  const d = ((u - 0.53) / 0.37) ** 2 + ((v - 0.52) / 0.36) ** 2;
  const room = 1 - smooth(0.75, 1.3, d);
  return {
    stone: 1, room: 2 * room, floor: 2.5 * room * smooth(0.6, 0.72, v),
    window: 3.2 * (gauss(u, v, 0.27, 0.66, 0.15, 0.11) + 0.7 * gauss(u, v, 0.3, 0.43, 0.16, 0.11)),
    lamp: 6 * gauss(u, v, 0.66, 0.46, 0.12, 0.12),
  };
}
// The palette over a scene: `ink(src, idx, mode, thing)`, a painter's ink at a cell (its index, the thing it is part of) in `mode`
// ('room', 'sky' in the panes, 'visitor' the ship passing).
export function buildPalette(scene, spec = BLUE_EMBER) {
  const T = { stone: vec(spec.stone), room: vec(spec.room), floor: vec(spec.floor), window: vec(spec.window), lamp: vec(spec.lamp) };
  const { cols, rows } = scene;
  const field = new Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const wts = fieldWeights((i + 0.5) / cols, (j + 0.5) / rows);
    let a = 0, b = 0, dL = 0, m = 0;
    for (const key of Object.keys(T)) { const wt = wts[key]; a += wt * T[key].a; b += wt * T[key].b; dL += wt * T[key].dL; m += wt; }
    field[j * cols + i] = { a: a / m, b: b / m, dL: dL / m };
  }
  const sky = vec(spec.sky);
  const neutral = (k, f) => fromLch(clamp(BASE_L[k] + f.dL, 0, 1), Math.hypot(f.a, f.b) * RATIO[k], Math.atan2(f.b, f.a) / DEG);
  const hueBase = (orig, [H, C, dL = 0]) => fromLch(clamp(oklch(orig)[0] + dL, 0, 1), C, H);
  const things = new Map(Object.entries(spec.things).map(([name, hc]) => [name, hueBase(THING_HUE.get(name), hc)]));
  const bands = new Map(Object.entries(spec.bands).map(([name, hc]) => [name, hueBase(HUES[name], hc)]));
  const screen = hueBase(SCREEN_HUE, spec.screen);
  const memo = new Map();
  let unknown = 0;
  function ink(src, idx, mode, thing) {
    const key = `${src}|${mode}|${mode === 'room' ? idx : ''}|${thing ?? ''}`;
    let out = memo.get(key);
    if (out) return out;
    const k = NEUTRAL_K.get(src);
    if (k !== undefined) {
      out = neutral(k, mode === 'sky' ? sky : mode === 'visitor' ? T.window : field[idx]);
    } else {
      const list = HUE_K.get(src);
      if (!list) { out = src; unknown++; } else {
        const own = thing ? THING_HUE.get(thing) : null;
        const hit = list.find((e) => e.base === own) ?? list[0];
        let nb;
        if (own && hit.base === own && things.has(thing)) nb = things.get(thing);
        else if (hit.base === SCREEN_HUE) nb = screen;
        else if (BAND_OF.has(hit.base)) nb = bands.get(BAND_OF.get(hit.base));
        else nb = things.get(PICKS.find((p) => p.hue === hit.base)?.name) ?? hit.base;
        out = derive(nb)[hit.k];
      }
    }
    memo.set(key, out);
    return out;
  }
  ink.unknown = () => unknown;
  return { code: spec.code, ink };
}

// The painter's context with its inks swapped as it draws: drawRoom sets an ink for a bucket and draws the bucket's glyphs; each glyph
// is placed at its cell's middle, so its cell is known and the ink is taken for that cell. `geo`: { ox, oy, cw, ch, cols, rows,
// cells (the reading's, for the thing a cell is part of), mode }.
export class InkCtx {
  constructor(ctx, palette, geo) { this.ctx = ctx; this.p = palette; this.g = geo; this.src = '#000000'; }
  set font(v) { this.ctx.font = v; } get font() { return this.ctx.font; }
  set textAlign(v) { this.ctx.textAlign = v; }
  set textBaseline(v) { this.ctx.textBaseline = v; }
  set globalAlpha(v) { this.ctx.globalAlpha = v; } get globalAlpha() { return this.ctx.globalAlpha; }
  set fillStyle(v) { this.src = v; } get fillStyle() { return this.src; }
  fillText(ch, x, y) {
    const g = this.g, i = clamp(Math.round((x - g.ox) / g.cw - 0.5), 0, g.cols - 1), j = clamp(Math.round((y - g.oy) / g.ch - 0.5), 0, g.rows - 1);
    const idx = j * g.cols + i, thing = g.mode === 'room' ? g.cells[idx]?.thing ?? null : null;
    this.ctx.fillStyle = this.p.ink(this.src, idx, g.mode, thing);
    this.ctx.fillText(ch, x, y);
  }
}

// ---- X3 LINE SCROLL ---------------------------------------------------------------------------------------------------------------
// px a layer moves at the pointer's edge, across (up and down CONFIG.depth.vertical of it): positive against the pointer (before the
// plane that keeps still: the table and its things), negative with it (behind it). `rows`: the floor and the vault, [down, px] from
// the top of the room to its bottom; each thing at its feet's row.
export const LINE_SCROLL = Object.freeze({ code: 'X3', name: 'LINE SCROLL', rows: [[0, 9], [0.21, -3.5], [0.62, -3.5], [1, 14]],
  layers: Object.freeze({ BACKDROP: -10, PANES: -10, VISITOR: -7, WALL: -3.5 }), micro: 1 });
// The floor's depth at `v` down the room (0..1, past it on the last slope).
export function rowDepth(v, rows = LINE_SCROLL.rows) {
  if (v <= rows[0][0]) return rows[0][1];
  for (let k = 1; k < rows.length; k++) if (v <= rows[k][0]) return lerp(rows[k - 1][1], rows[k][1], (v - rows[k - 1][0]) / (rows[k][0] - rows[k - 1][0]));
  const [a, b] = rows.slice(-2);
  return b[1] + (b[1] - a[1]) * (v - b[0]) / (b[0] - a[0]);
}
// A layer's px at the edge.
export function layerDepth(id, scene, X = LINE_SCROLL) {
  if (id in X.layers) return X.layers[id];
  if (SUPPORT[id]) return layerDepth(SUPPORT[id], scene, X) + MICRO[id] * X.micro;
  if (id in scene.contact) return rowDepth(scene.contact[id], X.rows);
  return 0;
}
