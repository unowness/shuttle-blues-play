// The garage's room in the game's cells (SX's pick B2 NIGHT of labs/graphics/sketches/garage-room-shades.html, 2026-10-01:
// «Вот этот гараж берем, это вторая версия. Когда в него докаешься, открывается вот эта иллюстрация»). The painted room
// (art and references/garage/interior-room-color-2026-10-01.webp) is read into cells as the souvenirs are: each cell's
// light picks a glyph and an ink on a ladder of the interface's blues, a hard edge inside a cell splits into quarter
// blocks, each thing keeps a hue of its own. The engine is the sheet's, copied here for the game (the sheet stays as
// SX's reference); what is added is drawing only some of the cells (`only`), so the still room is drawn once into a
// cache and only what lives (the panes' stars, the screen, the ship passing, the thing under the pointer) every frame.

import { mixHex } from '../../src/util.js';
import { PALETTE } from '../../src/roles.js';

const QUARTERS = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
const NEUTRAL = Object.freeze({ deep: '#2C5290', blue: PALETTE.blue, sky: mixHex(PALETTE.blue, PALETTE.white, 0.4),
  gray: PALETTE.gray, white: PALETTE.white });
// The planets' hues (souvenir-remake.js P), for the coloured parts: the visitor's red, the sun on the print, the books,
// the figure's green, the console's beige.
const HUES = Object.freeze({ red: '#D0898C', orange: '#C98A5E', yellow: '#D2A868', green: '#46AF7E', purple: '#A99BE0' });
const hueBand = (h) => (h < 16 || h >= 330 ? 'red' : h >= 270 ? 'purple' : h < 40 ? 'orange' : h < 70 ? 'yellow' : h < 160 ? 'green' : h < 200 ? 'cyan' : 'blue');

// The souvenirs' rule for a cell's glyph and ink (souvenir-remake.js look), unchanged.
function look(L, mask, hue) {
  if (hue) {
    L *= 0.9;
    const ink = L < 0.15 ? mixHex(hue, '#000000', 0.6) : L < 0.3 ? mixHex(hue, '#000000', 0.38) : L < 0.45 ? mixHex(hue, '#000000', 0.18)
      : L < 0.86 ? hue : L < 0.96 ? mixHex(hue, PALETTE.white, 0.4) : PALETTE.white;
    return { ch: mask !== 15 ? QUARTERS[mask] : L < 0.15 ? '▒' : L < 0.3 ? '▓' : '█', ink };
  }
  if (mask !== 15) {
    const ink = L < 0.22 ? NEUTRAL.deep : L < 0.45 ? NEUTRAL.blue : L < 0.62 ? NEUTRAL.sky : L < 0.92 ? NEUTRAL.gray : NEUTRAL.white;
    return { ch: QUARTERS[mask], ink };
  }
  if (L < 0.06) return { ch: ' ', ink: NEUTRAL.deep };
  if (L < 0.2) return { ch: '░', ink: NEUTRAL.deep };
  if (L < 0.36) return { ch: '▒', ink: NEUTRAL.blue };
  if (L < 0.5) return { ch: '▓', ink: NEUTRAL.blue };
  if (L < 0.64) return { ch: '▓', ink: NEUTRAL.sky };
  if (L < 0.78) return { ch: '█', ink: NEUTRAL.sky };
  if (L < 0.92) return { ch: '█', ink: NEUTRAL.gray };
  return { ch: '█', ink: NEUTRAL.white };
}

// The room's own ladder: the same glyphs and inks as the souvenirs, each pair at the light it really gives (the share
// of the cell the glyph covers, about a quarter for ░, a half for ▒, three quarters for ▓, all for █, times the ink's
// luminance), so a cell takes the pair whose light is nearest the picture's there. The souvenirs' ramp jumps from ░ in
// the deep blue straight to ▒ in the blue; a dark room lives in the steps between, so it has more of them.
const lum = (hex) => { const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const COVER = { '░': 0.25, '▒': 0.5, '▓': 0.75, '█': 1 };
const LADDER = [[' ', NEUTRAL.deep], ['░', NEUTRAL.deep], ['▒', NEUTRAL.deep], ['▓', NEUTRAL.deep], ['▒', NEUTRAL.blue],
  ['▓', NEUTRAL.blue], ['█', NEUTRAL.blue], ['▓', NEUTRAL.sky], ['█', NEUTRAL.sky], ['▓', NEUTRAL.white], ['█', NEUTRAL.white]]
  .map(([ch, ink]) => ({ ch, ink, Y: ch === ' ' ? 0 : COVER[ch] * lum(ink) }));
// A thing's own ladder in its hue (SX: «все-таки все разных цветов ... чтобы предметы отличались друг от друга»): the
// hue darkened three steps, itself, and lightened toward white, as the souvenirs' coloured parts are inked.
const ladders = new Map();
function ladderOf(hue) {
  if (!hue) return LADDER;
  if (!ladders.has(hue)) {
    const dark = (k) => mixHex(hue, '#000000', k);
    const pairs = [[' ', dark(0.6)], ['░', dark(0.6)], ['▒', dark(0.6)], ['▓', dark(0.38)], ['▒', hue], ['▓', dark(0.18)],
      ['▓', hue], ['█', hue], ['█', mixHex(hue, PALETTE.white, 0.4)]];
    ladders.set(hue, pairs.map(([ch, ink]) => ({ ch, ink, Y: ch === ' ' ? 0 : COVER[ch] * lum(ink) })));
  }
  return ladders.get(hue);
}
// The stone, the walls and the floor take a shorter ladder (every other step, the darkest kept): fewer kinds of glyph
// side by side, calmer fills; the things keep the whole ladder and their detail.
const CALM = [0, 1, 3, 4, 5, 7, 9, 10].map((k) => LADDER[k]);
// The pair nearest a light, measured on a curve close to the eye's (a cube root), so the dark steps are told apart.
function tone(Y, hue = null, calm = false) {
  const e = Math.cbrt(Math.max(0, Y)), ladder = calm && !hue ? CALM : ladderOf(hue);
  let best = ladder[0], d = Infinity;
  for (const p of ladder) { const dd = Math.abs(Math.cbrt(p.Y) - e); if (dd < d) { d = dd; best = p; } }
  return best;
}
const linear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

function lightness(r, g, b) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 0.008856 ? (116 * Math.cbrt(y) - 16) / 100 : 9.033 * y;
}
function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 1e-6) return { h: 0, s: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return { h, s };
}

// The variants: how many cells across, and whether a cell with a hard edge in it splits into quarters.
const VARIANTS = Object.freeze([
  { key: 'B1', name: 'SOUVENIR RULE', cols: 166, rule: 'souvenir', quarters: false,
    note: 'The souvenirs\' rule as it is, at the game\'s own cell: the light stretched to the picture\'s range, one shade glyph a cell. The room reads, but its night is gone: the ramp was made for objects in light.' },
  { key: 'B2', name: 'NIGHT', cols: 166, rule: 'tone', quarters: true,
    note: 'The same glyphs and inks, each cell the pair nearest the picture\'s own light there (a longer ladder in the dark, calmer where the picture is even), a hard edge inside a cell split into quarter blocks, and each thing in a hue of its own. The room keeps its dusk; the ship outside flies past.' },
  { key: 'B3', name: 'NIGHT, COARSE', cols: 110, rule: 'tone', quarters: true,
    note: 'B2 on cells half again as large: 110 across, chunkier, closer to the souvenirs\' grain.' },
]);

export const ROOM_VARIANT = VARIANTS.find((v) => v.key === 'B2');

// Reads the picture into `cols` cells across (rows from the cells, 0.62 as wide as tall), each with its light, its four quarters'
// light, its hue. Light is stretched to the picture's range (2 % to 99.5 %), then sharpened against its neighbours.
export function read(image, cols, { sharpen = 0.45 } = {}) {
  const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
  const rows = Math.round(cols * (ih / iw) * 0.62);
  const q = document.createElement('canvas'); q.width = cols * 2; q.height = rows * 2;
  const qc = q.getContext('2d', { willReadFrequently: true });
  qc.imageSmoothingEnabled = true; qc.imageSmoothingQuality = 'high';
  qc.drawImage(image, 0, 0, q.width, q.height);
  const d = qc.getImageData(0, 0, q.width, q.height).data;
  const cells = new Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let r = 0, g = 0, b = 0;
    const qY = [];
    const quarter = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([qx, qy]) => {
      const k = ((j * 2 + qy) * q.width + (i * 2 + qx)) * 4;
      r += d[k]; g += d[k + 1]; b += d[k + 2];
      qY.push(0.2126 * linear(d[k]) + 0.7152 * linear(d[k + 1]) + 0.0722 * linear(d[k + 2]));
      return lightness(d[k], d[k + 1], d[k + 2]);
    });
    r /= 4; g /= 4; b /= 4;
    const { h, s } = hsl(r, g, b);
    cells[j * cols + i] = { i, j, raw: lightness(r, g, b), quarter, qY, Y: qY.reduce((m, v) => m + v, 0) / 4, hue: h, sat: s };
  }
  const ls = cells.map((c) => c.raw).sort((x, y) => x - y);
  const lo = ls[Math.floor(ls.length * 0.02)], hi = ls[Math.floor(ls.length * 0.995)];
  const stretch = (v) => Math.min(1, Math.max(0, (v - lo) / Math.max(0.05, hi - lo)));
  for (const c of cells) { c.l = stretch(c.raw); c.q = c.quarter.map(stretch); }
  for (const c of cells) {
    let m = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const o = cells[(c.j + dj) * cols + (c.i + di)];
      if (o && c.i + di >= 0 && c.i + di < cols) { m += o.l; n++; }
    }
    c.L = Math.min(1, Math.max(0, c.l + sharpen * (c.l - (n ? m / n : c.l))));
    // A coloured part: saturated enough and not a blue (the ramp is blue already), in the planets' hue of its band.
    const band = hueBand(c.hue);
    c.tint = c.sat >= 0.3 && c.raw > 0.1 && band !== 'blue' && band !== 'cyan' ? HUES[band] : null;
  }
  // Calmer fills (SX: «немножко грязновато по заливкам»): where the picture is even, a cell takes its neighbours' mean
  // light, so two steps of the ladder do not flicker cell by cell; at an edge it keeps its own.
  for (const c of cells) {
    let m = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = c.i + di, jj = c.j + dj;
      if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
      m += cells[jj * cols + ii].Y; n++;
    }
    m /= n;
    c.Ys = Math.abs(Math.cbrt(c.Y) - Math.cbrt(m)) < 0.08 ? m : c.Y;
  }
  const s = { cols, rows, cells };
  // Each thing's hue on its own cells: those brighter than the region's border (the wall or floor round it).
  for (const p of PICKS) {
    if (!p.hue) continue;
    const inside = cells.filter((c) => inRect(c, s, p));
    const x0 = Math.min(...inside.map((c) => c.i)), x1 = Math.max(...inside.map((c) => c.i));
    const y0 = Math.min(...inside.map((c) => c.j)), y1 = Math.max(...inside.map((c) => c.j));
    const border = inside.filter((c) => c.i === x0 || c.i === x1 || c.j === y0 || c.j === y1).map((c) => c.raw).sort((a, b) => a - b);
    const ground = border[Math.floor(border.length / 2)] ?? 0;
    for (const c of inside) if (c.raw > ground + 0.05) { c.thing = p.name; if (!c.tint || p.over) c.tint = p.hue; }
  }
  // The ship outside the window flies (SX: «Самолет, который в окне виден, я бы делал пролетающим»): its cells lifted
  // out of the picture into a sprite, the window black behind it.
  const vis = PICKS.find((p) => p.name === 'VISITOR');
  s.sprite = [];
  for (const c of cells) {
    if (!inRect(c, s, vis) || c.raw < 0.035) continue;
    c.thing = null;
    s.sprite.push({ ...c }); c.erased = true;
  }
  return s;
}

// The things' own shapes, from SX's line drawing of the room (art and references/garage/interior-room-2026-10-01.webp,
// the painted room's own drawing, line for line, 1672 x 941 both). In a thing's region (a little wider than marked),
// a flood from the region's edge stops at the lines; what it never reaches is the thing, its outline included. A
// region's edge that is the picture's own edge is no way in (the ship runs off the picture's left and bottom). A cell
// is the thing's when `share` of it is. Returns, by name, the set of cell indexes (j * cols + i).
export function readShapes(image, s, names, opts = {}) {
  const { masks } = readMasks(image, s, names, null, opts);
  return new Map([...masks].map(([name, m]) => [name, m.cells]));
}
// The same, keeping each thing's pixel mask in the drawing (836 x 470) as well: by name, { mask, cells }. `regions` by name, where a
// region is not one of PICKS (the table's, labs/graphics/garage-room-scene.js).
export function readMasks(image, s, names, regions = null, { pad = 6, share = 0.45, light = 70 } = {}) {
  const w = 836, h = 470, cx = w / s.cols, cy = h / s.rows;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const line = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) line[k] = 0.2126 * d[k * 4] + 0.7152 * d[k * 4 + 1] + 0.0722 * d[k * 4 + 2] > light ? 1 : 0;
  // Lines a pixel thicker, so a hairline gap at this size does not let the flood in.
  const wall = line.slice();
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (line[y * w + x - 1] || line[y * w + x + 1] || line[(y - 1) * w + x] || line[(y + 1) * w + x]) wall[y * w + x] = 1;
  }
  const out = new Map();
  for (const name of names) {
    const p = regions?.[name] ?? PICKS.find((q) => q.name === name);
    const x0 = Math.max(0, Math.floor(p.x0 * w) - pad), x1 = Math.min(w - 1, Math.ceil(p.x1 * w) + pad);
    const y0 = Math.max(0, Math.floor(p.y0 * h) - pad), y1 = Math.min(h - 1, Math.ceil(p.y1 * h) + pad);
    const seen = new Uint8Array(w * h), queue = [];
    const seed = (x, y) => {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return;
      const k = y * w + x;
      if (!wall[k] && !seen[k]) { seen[k] = 1; queue.push(k); }
    };
    for (let x = x0; x <= x1; x++) { seed(x, y0); seed(x, y1); }
    for (let y = y0; y <= y1; y++) { seed(x0, y); seed(x1, y); }
    while (queue.length) {
      const k = queue.pop(), x = k % w, y = (k - x) / w;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const n = ny * w + nx;
        if (!seen[n] && !wall[n]) { seen[n] = 1; queue.push(n); }
      }
    }
    const mask = new Uint8Array(w * h);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!seen[y * w + x]) mask[y * w + x] = 1;
    const cells = new Set();
    for (const cell of s.cells) {
      const px0 = Math.floor(cell.i * cx), px1 = Math.floor((cell.i + 1) * cx), py0 = Math.floor(cell.j * cy), py1 = Math.floor((cell.j + 1) * cy);
      let n = 0, m = 0;
      for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) { m++; if (mask[y * w + x]) n++; }
      if (m && n / m >= share) cells.add(cell.j * s.cols + cell.i);
    }
    out.set(name, { mask, cells });
  }
  return { w, h, masks: out };
}

// The regions marked on the picture by hand, in its own measure (0..1 across and down): the panes (the stars
// twinkle), the screen (it flickers), and the things that can be picked, each with what it is.
const R = (x0, y0, x1, y1) => ({ x0: x0 / 1672, y0: y0 / 941, x1: x1 / 1672, y1: y1 / 941 });
export const PANES = [R(140, 190, 578, 515), R(585, 238, 868, 485)];
export const SCREEN = R(1003, 402, 1083, 460);
// Each thing's hue is one of the planets' or the palette's, none twice among the finds, so each reads apart.
export const PICKS = [
  { name: 'VISITOR', note: 'a ship passing outside', ...R(212, 315, 418, 372) },
  { name: 'CONSOLE', note: 'a find', hue: '#E6DDC8', ...R(864, 450, 926, 479) },
  { name: 'CARTRIDGE', note: 'a find', hue: '#B0B86C', ...R(998, 311, 1070, 334) },
  { name: 'MANGA', note: 'finds: three books', hue: '#D0898C', ...R(1076, 274, 1158, 334) },
  { name: 'PHOTO', note: 'a find', hue: '#86B4D6', ...R(1188, 238, 1322, 364) },
  { name: 'TELEVISION', note: 'a find; on it, the pilot\'s numbers', hue: '#D2A868', ...R(988, 386, 1140, 474) },
  { name: 'GAMEPAD', note: 'a find', hue: '#A99BE0', over: true, ...R(1115, 452, 1174, 482) },
  { name: 'RADIO', note: 'a find', hue: '#47C2BE', over: true, ...R(1188, 442, 1272, 479) },
  { name: 'FIGURE', note: 'a find', hue: '#46AF7E', over: true, ...R(1296, 390, 1412, 481) },
  { name: 'CRATE', note: 'spare parts: mend the hull', hue: '#C98A5E', over: true, ...R(1031, 533, 1167, 637) },
  { name: 'ARMCHAIR', note: 'sit: the pilot\'s card', hue: '#C79BC8', over: true, ...R(1148, 638, 1602, 936) },
  { name: 'SHIP', note: 'refuel, leave', ...R(0, 546, 792, 941) },
  // The filing cabinet left of the desk: the notes the reference ships leave (src/specials.js), read here.
  { name: 'CABINET', note: 'the notes the reference ships leave', ...R(790, 468, 930, 605) },
];
// The screen keeps a glow of its own, apart from the set's body.
const SCREEN_HUE = '#A6DED6';
export const inRect = (c, s, r) => {
  const u = (c.i + 0.5) / s.cols, v = (c.j + 0.5) / s.rows;
  return u >= r.x0 && u <= r.x1 && v >= r.y0 && v <= r.y1;
};

// The band of light that passes over the souvenirs (souvenir-remake.js band), here over the whole room and slower.
function band(c, s, t) {
  const u = ((c.i + 0.5) / s.cols) * 2 - 1, v = ((c.j + 0.5) / s.rows) * 2 - 1;
  const at = ((t * 0.12) % 3) - 1.5;
  return Math.exp(-(((u + v * 0.6) * 1.2 - at) ** 2) * 6) * 0.16;
}

// Draws the room's cells into ctx at (x, y), each cell `cw` by `ch` px with a font of `font`, at time t, with `focus`
// the picked region (its cells a step brighter, the interface's corner marks round it).
// `sky`: whether what lives in the panes (the extra stars, the visitor) is drawn too, for a caller drawing the room in
// layers (labs/graphics/garage-room.js), whose panes are a layer of their own. `gain(c)`: a cell's light multiplied, the
// layers' painting by depth.
export function drawRoom(ctx, s, v, { x = 0, y = 0, cw, ch, fontFamily, t = 0, focus = null, live = true, only = null, band: banded = live, marks = true, sky = true, gain = null }) {
  ctx.font = `${ch}px ${fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const buckets = new Map();
  const put = (ch0, ink, a, px, py) => {
    const key = ink + '|' + a;
    let b = buckets.get(key);
    if (!b) { b = { ink, a, items: [] }; buckets.set(key, b); }
    b.items.push(ch0, px, py);
  };
  const at = (i, j) => [x + (i + 0.5) * cw, y + (j + 0.5) * ch];
  const inPane = (i, j) => PANES.some((p) => { const u = (i + 0.5) / s.cols, w = (j + 0.5) / s.rows; return u >= p.x0 && u <= p.x1 && w >= p.y0 && w <= p.y1; });
  const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.1);
  const exposure = v.exposure ?? 1.25;
  // One cell by the tone rule: its light (and its quarters') through the ladder of its hue.
  const toneCell = (c, gain, px, py) => {
    const hue = inRect(c, s, SCREEN) && c.raw > 0.3 ? SCREEN_HUE : c.tint;
    if (v.quarters) {
      const qs = c.qY.map((q) => q * gain), hi = Math.max(...qs), lo = Math.min(...qs);
      if (Math.cbrt(hi) - Math.cbrt(lo) > 0.2) {
        const mid = (Math.cbrt(hi) + Math.cbrt(lo)) / 2;
        let mask = 0, yb = 0, nb = 0, yd = 0, nd = 0;
        qs.forEach((q, n) => { if (Math.cbrt(q) > mid) { mask |= 1 << n; yb += q; nb++; } else { yd += q; nd++; } });
        const under = tone(yd / nd, hue), over = tone(yb / nb, hue);
        if (under.ch !== ' ') put(under.ch, under.ink, 1, px, py);
        put(QUARTERS[mask], over.ink, 1, px, py);
        return;
      }
    }
    const g = tone((c.thing ? c.Y : c.Ys) * gain, hue, !c.thing);
    if (g.ch !== ' ') put(g.ch, g.ink, 1, px, py);
  };
  for (const c of s.cells) {
    if (only && !only(c)) continue;
    const [px, py] = at(c.i, c.j);
    if (c.erased) continue;
    let L = gain ? Math.min(1, c.L * gain(c)) : c.L;
    if (live) {
      if (banded) L = Math.min(1, L + band(c, s, t));
      // Stars: a bright cell in a pane breathes on its own beat, some going out between.
      if (c.l > 0.3 && inPane(c.i, c.j)) L *= Math.max(0, Math.sin(t * (0.7 + ((c.i * 7 + c.j * 13) % 5) * 0.3) + c.i * 1.7)) ** 1.5;
      if (inRect(c, s, SCREEN)) L = Math.min(1, L * flick + 0.18 * Math.max(0, Math.sin(c.j * 1.4 - t * 3)));
    }
    const lift = focus && inRect(c, s, focus) && (!focus.hue || c.thing === focus.name || focus.name === 'SHIP');
    if (lift) L = Math.min(1, L * 1.15 + 0.16);
    if (v.rule === 'tone') { toneCell(c, (c.L > 0.01 ? L / c.L : 1) * (lift ? 1.8 : 1) * exposure, px, py); continue; }
    if (v.quarters) {
      const hi = Math.max(...c.q), lo = Math.min(...c.q);
      if (hi - lo > 0.24) {
        const mid = (hi + lo) / 2;
        let mask = 0, lb = 0, nb = 0, ld = 0, nd = 0;
        c.q.forEach((qv, n) => { if (qv > mid) { mask |= 1 << n; lb += qv; nb++; } else { ld += qv; nd++; } });
        const under = look(Math.min(1, ld / nd), 15, c.tint), over = look(Math.min(1, lb / nb + (L - c.L)), mask, c.tint);
        if (under.ch !== ' ') put(under.ch, under.ink, 1, px, py);
        put(over.ch, over.ink, 1, px, py);
        continue;
      }
    }
    const g = look(L, 15, c.tint);
    if (g.ch !== ' ') put(g.ch, g.ink, 1, px, py);
  }
  if (live && sky) {
    // More stars, each its own blink: a dot or a small cross, white or the sky's blue.
    for (let k = 0; k < 46; k++) {
      const i = Math.floor(((k * 97) % 89) / 89 * s.cols), j = Math.floor(((k * 53) % 61) / 61 * s.rows);
      if (!inPane(i, j) || (only && !only({ i, j }))) continue;
      const a = Math.sin(t * (0.5 + (k % 7) * 0.17) + k * 2.3);
      if (a < 0.2) continue;
      const [px, py] = at(i, j);
      put(a > 0.85 && k % 3 === 0 ? '+' : '·', k % 2 ? PALETTE.white : NEUTRAL.sky, 1, px, py);
    }
    // The visitor crosses the window left to right and comes round again, seen only through the panes.
    const span = Math.round(s.cols * 0.5), dx = Math.floor((t * 3.2) % (span + 30)) - 22, bob = Math.round(Math.sin(t * 0.7) * 0.6);
    for (const c of s.sprite) {
      const i = c.i + dx, j = c.j + bob;
      if (!inPane(i, j)) continue;
      const [px, py] = at(i, j);
      toneCell(c, exposure * 2.4, px, py);
    }
  }
  for (const b of buckets.values()) {
    ctx.fillStyle = b.ink; ctx.globalAlpha = b.a;
    const it = b.items;
    for (let k = 0; k < it.length; k += 3) ctx.fillText(it[k], it[k + 1], it[k + 2]);
  }
  ctx.globalAlpha = 1;
  if (focus && marks) {
    const x0 = x + focus.x0 * s.cols * cw - cw, x1 = x + focus.x1 * s.cols * cw + cw;
    const y0 = y + focus.y0 * s.rows * ch - ch * 0.5, y1 = y + focus.y1 * s.rows * ch + ch * 0.5;
    ctx.fillStyle = PALETTE.white;
    [[x0, y0, '┌'], [x1, y0, '┐'], [x0, y1, '└'], [x1, y1, '┘']].forEach(([px, py, g]) => ctx.fillText(g, px, py));
  }
}
