// The souvenirs' art (SX, 2026-10-01: the picked set of labs/graphics/sketches/souvenir-set.html, «Все прям можно
// принимать»): each souvenir read into a grid of game cells from its photograph or its drawing, every cell a shade glyph
// or a quarter block in the blue-gray ramp or in the hue its scheme gave it, a half-cell outline round most, a band of
// light crossing it now and then, and a few that move (the tape's reels, the figure's breath). The cells are baked by
// tools/bake-souvenir-art.mjs into src/souvenirArt.generated.js, so every browser draws the same; this draws them.
//
// Drawn over the interface (the shelf, the pilot card), each souvenir into a canvas of its own with the page's colour
// grade (src/grade.js), redrawn only when its frame or the band has moved, so a shelf costs a copy each a frame. Under
// reduced motion (ART_MOTION.on false) the band holds still, away, and a moving one stays on its first frame.

import { SOUVENIR_ART } from './souvenirArt.generated.js';
import { installGrade, gradeEpoch } from './grade.js';
import { mixHex } from './util.js';
import { PALETTE } from './palette.js';

export const ART_MOTION = { on: true };
// A moving souvenir's frame lasts `frame` s; the band of light moves `fps` times a second.
const ART_TIME = Object.freeze({ frame: 0.12, fps: 10 });

const WHITE = PALETTE.white;
const NEUTRAL = Object.freeze({ deep: '#2C5290', blue: PALETTE.blue, sky: mixHex(PALETTE.blue, WHITE, 0.4), gray: PALETTE.gray, white: WHITE });
const OUTLINE = '#0E1830';
const QUARTERS = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
// The half block laid over a whole cell's open side, for the outline: left, right, top, bottom.
const HALVES = ['▌', '▐', '▀', '▄'];

// A cell's glyph and ink at light `L` (0..1), with the quarters it fills (`mask`, 15 for all), in `hue` or, without
// one, the blue-gray ramp.
export function artCell(L, mask, hue) {
  if (hue) {
    L *= 0.9;   // a coloured part's lit side is held a tenth under the top
    // A coloured part holds its hue through the middle tones; only its brightest cells lighten, and white is the glint.
    const ink = L < 0.15 ? mixHex(hue, '#000000', 0.6) : L < 0.3 ? mixHex(hue, '#000000', 0.38) : L < 0.45 ? mixHex(hue, '#000000', 0.18)
      : L < 0.86 ? hue : L < 0.96 ? mixHex(hue, WHITE, 0.4) : WHITE;
    return { ch: mask !== 15 ? QUARTERS[mask] : L < 0.15 ? '▒' : L < 0.3 ? '▓' : '█', ink };
  }
  if (mask !== 15) {
    const ink = L < 0.22 ? NEUTRAL.deep : L < 0.45 ? NEUTRAL.blue : L < 0.62 ? NEUTRAL.sky : L < 0.92 ? NEUTRAL.gray : NEUTRAL.white;
    return { ch: QUARTERS[mask], ink };
  }
  if (L < 0.2) return { ch: '░', ink: NEUTRAL.deep };
  if (L < 0.36) return { ch: '▒', ink: NEUTRAL.blue };
  if (L < 0.5) return { ch: '▓', ink: NEUTRAL.blue };
  if (L < 0.64) return { ch: '▓', ink: NEUTRAL.sky };
  if (L < 0.78) return { ch: '█', ink: NEUTRAL.sky };
  if (L < 0.92) return { ch: '█', ink: NEUTRAL.gray };
  return { ch: '█', ink: NEUTRAL.white };
}

// A souvenir's cells, decoded once: { cols, rows, outline, lit, band, frames: [[{ i, j, mask, edge, open, L, hue }]] }.
// `edge` 2 is a bare cell: drawn in its own colour to the edge, without the outline (the figure's tail, 2026-10-01).
const BARE = 2;
const decoded = new Map();
export function artOf(id) {
  if (decoded.has(id)) return decoded.get(id);
  const raw = SOUVENIR_ART[id];
  if (!raw) return null;
  const n = (s, k) => parseInt(s.slice(k, k + 2), 36);
  const frames = raw.frames.map((run) => {
    const cells = [];
    for (let k = 0; k < run.length; k += 6) {
      const at = n(run, k), shape = n(run, k + 2), tone = n(run, k + 4), hue = tone >> 6;
      cells.push({ i: at % raw.cols, j: Math.floor(at / raw.cols), mask: shape & 15, edge: ((shape >> 4) & 3) - 1,
        open: (shape >> 6) & 15, L: (tone & 63) / 63, hue: hue ? raw.hues[hue - 1] : null });
    }
    return cells;
  });
  const art = { ...raw, frames };
  decoded.set(id, art);
  return art;
}

// Whether a souvenir has its art.
export const hasArt = (id) => !!SOUVENIR_ART[id];

// The band of light at a cell: it crosses the grid on a slant once in about nine seconds, each souvenir from its own
// moment (`phase`), lifting what it passes by up to a quarter.
function band(c, t, phase, cols, rows) {
  const u = ((c.i + 0.5) / cols) * 2 - 1, v = ((c.j + 0.5) / rows) * 2 - 1;
  const at = ((t * 0.35 + phase) % 3) - 1.5;
  return Math.exp(-(((u + v * 0.6) * 1.2 - at) ** 2) * 6) * 0.25;
}
const phaseOf = (id) => ([...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7) / 997) * 3;

// Draws souvenir `id` in the square with its top left at (x, y), `size` CSS px across, at `alpha`; false when it has
// no art (or there is no page to draw it on). `t` is the page's clock in seconds.
const cache = new Map();
// `whole`: the cells on whole device pixels (wholeCells), the art set at (x, y) plus its offset with no scaling: the charm's (SX,
// 2026-10-09: «заскейли ... сувениры на цепочке ... чтобы не портилась пиксельная сетка»). (x, y) must be on whole device pixels.
export function drawSouvenirArt(r, id, x, y, size, alpha = 1, t = performance.now() / 1000, whole = false) {
  const art = artOf(id);
  if (!art || !r.ctx?.drawImage || typeof document === 'undefined') return false;
  const dpr = r.dpr || 1, moving = ART_MOTION.on && Number.isFinite(t), n = art.frames.length;
  const f = moving && n > 1 ? ((Math.floor(t / ART_TIME.frame) % n) + n) % n : 0, tick = moving ? Math.floor(t * ART_TIME.fps) : -1;
  const fit = whole ? wholeCells(r, art, size) : null;
  const key = `${id}|${size}|${dpr}${whole ? '|whole' : ''}`;
  let entry = cache.get(key);
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = fit ? fit.w : Math.ceil(size * dpr); canvas.height = fit ? fit.h : Math.ceil(size * dpr);
    entry = { canvas, ctx: installGrade(canvas.getContext('2d')), at: null };
    cache.set(key, entry);
  }
  // The worn look moves the epoch (src/grade.js): the art is drawn again in the new look's inks even when it holds still.
  const at = `${f}|${tick}|${gradeEpoch()}`;
  if (entry.at !== at) {
    entry.at = at;
    const cells = fit ? { cw: fit.cw, ch: fit.ch, top: 0, font: fit.font, size: Math.max(fit.w, fit.h) / dpr } : cellsOf(r, art, size);
    // Held still (reduced motion, or no clock), there is no band: the frame is drawn whole, once.
    if (moving) shineOver(art, id, entry, f, tick, cells, dpr);
    else paintCells(entry.ctx, art, art.frames[f], () => 0, cells, dpr, true);
  }
  const { ctx } = r;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (fit) ctx.drawImage(entry.canvas, x + fit.left, y + fit.top, fit.w / dpr, fit.h / dpr);
  else ctx.drawImage(entry.canvas, x, y, size, size);
  ctx.restore();
  return true;
}

// A souvenir's cells near a square `size` CSS px across with every cell a whole number of device pixels wide and high (as wide as the
// square allows, one pixel more where that is under 92 % of it; its height by the font's cell, rounded), the art centred in the square on whole device pixels: its cell (`cw`,
// `ch`) and offset (`left`, `top`, which may be under 0 where the rows run past the square) in CSS px, its size `w` x `h` in device
// pixels, the font whose em is a cell's height. A 90 px square drew a cell 5, 3.75 or 2.81 px wide and the glyphs split unevenly.
export function wholeCells(r, art, size) {
  const dpr = r.dpr || 1;
  // The widest cell the square holds, or one pixel wider where that falls under 92 % of it (at 1.5x a 32-cell art would be 85 px).
  let cwD = Math.max(1, Math.floor((size * dpr) / art.cols));
  if (art.cols * cwD < 0.92 * size * dpr) cwD += 1;
  const chD = Math.max(1, Math.round((cwD * r.cellH) / r.cellW));
  const leftD = Math.floor((size * dpr - art.cols * cwD) / 2), topD = Math.floor((size * dpr - art.rows * chD) / 2);
  return { cw: cwD / dpr, ch: chD / dpr, left: leftD / dpr, top: topD / dpr, w: art.cols * cwD, h: art.rows * chD,
    font: `${(r.fontSize * chD) / (r.cellH * dpr)}px ${r.fontFamily}` };
}

// A souvenir's cells in a square `size` CSS px across: a cell's width and height, the art's top, the font, the square.
function cellsOf(r, art, size) {
  const cw = size / art.cols, k = cw / r.cellW, ch = r.cellH * k;
  return { cw, ch, top: (size - art.rows * ch) / 2, font: `${r.fontSize * k}px ${r.fontFamily}`, size };
}

// The art's base and its band of light apart (the effects audit of 2026-10-06, path #11; a lab switch until SX compared it by eye
// and took it into the game, 2026-10-07): each frame of a souvenir is drawn once without the band onto a base canvas of its own, and
// at every tick of the band the base is copied and only the cells the band changes (another glyph or ink) are drawn again over it,
// each on its own cleared cell: tens of glyphs a tick in place of the whole art's hundreds. A band cell's square is cleared before
// its glyph, so a neighbour's few pixels spilling into it (a glyph a hair wider than its cell) are not under it there.
function shineOver(art, id, entry, f, tick, cells, dpr) {
  const baseKey = `${f}|${gradeEpoch()}|${cells.font}`;
  entry.bases ??= new Map();
  let base = entry.bases.get(baseKey);
  if (!base) {
    if (entry.bases.size > art.frames.length + 1) entry.bases.clear();
    const canvas = document.createElement('canvas');
    canvas.width = entry.canvas.width; canvas.height = entry.canvas.height;
    base = { canvas, ctx: installGrade(canvas.getContext('2d')) };
    paintCells(base.ctx, art, art.frames[f], () => 0, cells, dpr, true);
    entry.bases.set(baseKey, base);
  }
  const { ctx } = entry;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
  ctx.drawImage(base.canvas, 0, 0);
  const now = tick / ART_TIME.fps, phase = phaseOf(id);
  const lifted = art.frames[f].filter((c) => {
    if (c.edge !== 0) return false;
    const lift = band(c, now, phase, art.cols, art.rows) * art.band;
    if (lift <= 0) return false;
    const a = cellLook(art, c, 0), b = cellLook(art, c, lift);
    return a.ch !== b.ch || a.ink !== b.ink;
  });
  paintCells(ctx, art, lifted, (c) => band(c, now, phase, art.cols, art.rows) * art.band, cells, dpr, false);
}

// A cell's glyph and the ink it is drawn in, at `lift` of the band.
function cellLook(art, c, lift) {
  const lit = Math.min(1, c.L + lift);
  const g = artCell(c.hue && art.lit ? Math.max(lit, art.lit) : lit, c.mask, c.hue);
  return { ch: g.ch, ink: art.outline && c.mask !== 15 && c.edge !== BARE ? OUTLINE : g.ink };
}

// `list`'s cells drawn at `liftOf` each, in the square `cells` (cellsOf); `whole` clears the canvas first, else each cell's own square.
// The outline: a part-filled cell is the contour itself; a whole one takes a half block on its open sides.
function paintCells(ctx, art, list, liftOf, { cw, ch, top, font, size }, dpr, whole) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (whole) ctx.clearRect(0, 0, size, size);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const c of list) {
    const g = cellLook(art, c, liftOf(c));
    const px = (c.i + 0.5) * cw, py = top + (c.j + 0.5) * ch;
    if (!whole) ctx.clearRect(c.i * cw, top + c.j * ch, cw, ch);
    ctx.fillStyle = g.ink;
    ctx.fillText(g.ch, px, py);
    if (art.outline && c.open) {
      ctx.fillStyle = OUTLINE;
      for (let s = 0; s < 4; s++) if (c.open & (1 << s)) ctx.fillText(HALVES[s], px, py);
    }
  }
}
