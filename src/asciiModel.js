import { CONFIG } from './config.js';

// Turns a hand-drawn ASCII ship (JSON) into something the renderer can draw.
//
// This module produces appearance only. Collision size, weapon reach and flight
// parameters come from src/chassis.js and are never derived from a model file.
//
// The loader is deliberately forgiving: it accepts several spellings for the
// same idea, because the model is authored by hand. See ships/SCHEMA.md for
// the canonical shape.

const ART_KEYS = ['art', 'rows', 'lines', 'ascii', 'sprite', 'shape', 'model', 'ship'];
const FLAME_KEYS = ['flame', 'thrust', 'exhaust', 'engine'];

function readArt(src) {
  if (!src) return null;
  if (typeof src === 'string') return src.replace(/\r/g, '').split('\n');
  if (Array.isArray(src) && src.every((r) => typeof r === 'string')) return src.slice();
  return null;
}

function findArt(obj, keys) {
  for (const k of keys) {
    if (obj[k] === undefined) continue;
    const direct = readArt(obj[k]);
    if (direct) return { rows: direct, holder: obj };
    if (obj[k] && typeof obj[k] === 'object') {
      const nested = findArt(obj[k], keys);
      if (nested) return nested;
      const inner = readArt(obj[k].art || obj[k].rows || obj[k].lines);
      if (inner) return { rows: inner, holder: obj[k] };
    }
  }
  return null;
}

// Explicit cell list: [{x, y, char, color}]
function readCells(list) {
  const out = [];
  for (const c of list) {
    if (!c) continue;
    const ch = c.char ?? c.ch ?? c.glyph ?? c.c;
    if (typeof ch !== 'string' || ch === '' || ch === ' ') continue;
    out.push({ x: Number(c.x) || 0, y: Number(c.y) || 0, ch: ch[0], color: c.color || c.fill || null });
  }
  return out;
}

function cellsFromRows(rows, empty) {
  const skip = new Set(empty.split(''));
  const out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (skip.has(ch)) continue;
      out.push({ x, y, ch, color: null });
    }
  });
  return out;
}

function normalizePalette(raw) {
  const map = new Map();
  if (!raw) return map;
  if (Array.isArray(raw)) {
    // [{ chars: "#=", color: "#aabbcc" }, ...]
    for (const e of raw) {
      const chars = e.chars ?? e.char ?? e.glyphs ?? '';
      for (const ch of String(chars)) map.set(ch, e.color || e.fill);
    }
  } else if (typeof raw === 'object') {
    // { "#": "#aabbcc", "=": "accent" }
    for (const [k, v] of Object.entries(raw)) {
      for (const ch of String(k)) map.set(ch, v);
    }
  }
  return map;
}

const NAMED = {
  hull: CONFIG.ship.colors.hull,
  accent: CONFIG.ship.colors.accent,
  flame: CONFIG.ship.colors.flame[0],
};

function resolveColor(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return fallback;
  if (value[0] === '#') return value;
  return NAMED[value] || fallback;
}


// --- frame-stack format ----------------------------------------------------
// { width, height, fps, active, palette: [{key, color}], frames: [
//     { glyphs: [rows], colors: [rows of palette keys], accent_mask: [rows] } ] }
// Frame `active` is the idle pose; the rest are an animation loop played while
// a direction key is held.

function isFrameStack(src) {
  return Array.isArray(src.frames) && src.frames.length > 0 &&
    src.frames.some((f) => f && (Array.isArray(f.glyphs) || typeof f.glyphs === 'string'));
}

function paletteFromList(list, src) {
  const map = new Map();
  if (Array.isArray(list)) {
    for (const e of list) {
      if (!e || typeof e.key !== 'string') continue;
      map.set(e.key, e.color);
    }
  }
  // The editor also writes these as loose top-level fields.
  const named = { b: src.body_color, a: src.accent_color, d: src.decoration_color, e: src.extra_color };
  for (const [k, v] of Object.entries(named)) if (v && !map.has(k)) map.set(k, v);
  return map;
}

function parseFrameStack(src, sourceName) {
  const palette = paletteFromList(src.palette, src);
  const bodyColor = src.body_color || CONFIG.ship.colors.hull;
  const accentColor = src.accent_color || CONFIG.ship.colors.accent;

  const frames = src.frames.map((f) => {
    const g = readArt(f.glyphs) || [];
    const c = readArt(f.colors) || [];
    const mask = readArt(f.accent_mask) || [];
    const cells = [];
    g.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === ' ' || ch === undefined) continue;
        const key = c[y] ? c[y][x] : undefined;
        // accent_mask is only consulted when the cell has no colour key of
        // its own; in practice the editor writes both and they agree.
        const flagged = mask[y] ? mask[y][x] && mask[y][x] !== ' ' : false;
        const color = (key && key !== ' ' && palette.get(key)) || (flagged ? accentColor : bodyColor);
        cells.push({ x, y, ch, color });
      }
    });
    return cells;
  }).filter((cells) => cells.length > 0);

  if (!frames.length) throw new Error('frame stack has no drawn cells');

  const idle = clampIndex(Number(src.active) || 0, frames.length);

  // The pivot comes from the idle pose only, so exhaust frames that reach
  // further down do not drag the centre of rotation with them.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of frames[idle]) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  const ax = minX + (maxX - minX) / 2;
  const ay = minY + (maxY - minY) / 2;

  const shift = (cells) => cells.map((c) => ({ x: c.x - ax, y: c.y - ay, ch: c.ch, color: c.color }));
  const shifted = frames.map(shift);

  const order = [];
  for (let i = 0; i < shifted.length; i++) if (i !== idle) order.push(i);

  return {
    name: src.name || src.id || sourceName,
    // The file's own id, which only names a row of a chassis's table (src/chassis.js LOOK_BODIES: a look's body); a drawing says nothing
    // about its size.
    id: typeof src.id === 'string' ? src.id : null,
    author: src.author || null,
    cells: shifted[idle],
    frames: shifted,
    idleFrame: idle,
    loop: order.length ? order : [idle],
    fps: Number(src.fps) > 0 ? Number(src.fps) : 12,
    flame: null,
    width: Number(src.width) || (maxX - minX + 1),
    height: Number(src.height) || (maxY - minY + 1),
    anchor: { x: ax, y: ay },
    baseRotation: headingRotation(src.heading ?? src.facing ?? 'up'),
    scale: Number(src.scale) > 0 ? Number(src.scale) : CONFIG.render.defaultShipScale,
    nozzles: readNozzles(src.nozzles, ax, ay),
  };
}

// Where a drawing's six nozzles are (labs/graphics/ship-motion.js NOZZLES), when its file says: `nozzles` { frontL: [col, row], ... } in
// the cells of its rows as written (fractions allowed), here made relative to the pivot as the cells are. Presentation only, like the
// drawing. Null when the file has none or any of the six is missing or not two finite numbers: the motion then finds them in the art
// (ship-motion.js nozzlesOf: SX's arcs and struts, or the drawing's corners).
const NOZZLE_NAMES = ['frontL', 'frontR', 'sideL', 'sideR', 'rearL', 'rearR'];
function readNozzles(raw, ax, ay) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const name of NOZZLE_NAMES) {
    const p = raw[name];
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) return null;
    out[name] = Object.freeze({ x: p[0] - ax, y: p[1] - ay });
  }
  return Object.freeze(out);
}

function clampIndex(i, n) { return (!Number.isFinite(i) || i < 0 || i >= n) ? 0 : Math.floor(i); }

function headingRotation(heading) {
  const h = String(heading).toLowerCase();
  return h === 'right' ? -Math.PI / 2 : h === 'left' ? Math.PI / 2 : h === 'down' ? Math.PI : 0;
}

export function normalizeModel(raw, sourceName = 'model') {
  const src = (raw && typeof raw === 'object') ? raw : {};
  if (isFrameStack(src)) return parseFrameStack(src, sourceName);
  const empty = typeof src.empty === 'string' ? src.empty : ' ';
  const palette = normalizePalette(src.colors ?? src.palette ?? src.paint);

  let cells;
  if (Array.isArray(src.cells)) {
    cells = readCells(src.cells);
  } else {
    const found = findArt(src, ART_KEYS) || (readArt(raw) ? { rows: readArt(raw), holder: src } : null);
    if (!found) throw new Error('no ASCII art found: expected "art" (array of strings) or "cells"');
    cells = cellsFromRows(found.rows, empty);
  }
  if (!cells.length) throw new Error('model is empty');

  // Bounding box in cell units.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;

  // Pivot. Default: centre of the bounding box.
  let ax = minX + (w - 1) / 2;
  let ay = minY + (h - 1) / 2;
  const anchor = src.anchor ?? src.pivot ?? src.origin;
  if (Array.isArray(anchor) && anchor.length >= 2) {
    ax = Number(anchor[0]); ay = Number(anchor[1]);
  } else if (anchor && typeof anchor === 'object') {
    if (anchor.x !== undefined) ax = Number(anchor.x);
    if (anchor.y !== undefined) ay = Number(anchor.y);
  }

  const hullColor = resolveColor(src.color ?? src.hullColor, CONFIG.ship.colors.hull);
  const out = cells.map((c) => ({
    x: c.x - ax,
    y: c.y - ay,
    ch: c.ch,
    color: resolveColor(c.color || palette.get(c.ch), hullColor),
  }));

  // Art drawn pointing right instead of up gets turned once at load.
  const baseRotation = headingRotation(src.heading ?? src.facing ?? 'up');

  // Flame is optional; drawn only while the main engine is on.
  let flame = null;
  const flameSrc = FLAME_KEYS.map((k) => src[k]).find((v) => v !== undefined);
  if (flameSrc !== undefined) {
    const rows = readArt(flameSrc) || readArt(flameSrc && flameSrc.art);
    if (rows) {
      const fCells = cellsFromRows(rows, empty);
      let fMinX = Infinity, fMaxX = -Infinity, fMinY = Infinity;
      for (const c of fCells) {
        if (c.x < fMinX) fMinX = c.x;
        if (c.x > fMaxX) fMaxX = c.x;
        if (c.y < fMinY) fMinY = c.y;
      }
      const off = (flameSrc && flameSrc.offset) || {};
      const ox = off.x !== undefined ? Number(off.x) : -(fMinX + (fMaxX - fMinX) / 2);
      const oy = off.y !== undefined ? Number(off.y) : (maxY - ay) + 1 - fMinY;
      flame = fCells.map((c) => ({ x: c.x + ox, y: c.y + oy, ch: c.ch }));
    }
  }

  return {
    name: src.name || sourceName,
    author: src.author || src.meta?.author || null,
    cells: out,
    frames: null,
    idleFrame: 0,
    loop: [0],
    fps: Number(src.fps) > 0 ? Number(src.fps) : 12,
    flame,
    width: w,
    height: h,
    anchor: { x: ax, y: ay },
    baseRotation,
    scale: Number(src.scale) > 0 ? Number(src.scale) : CONFIG.render.defaultShipScale,
  };
}

export async function loadModel(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  const name = url.split('/').pop().replace(/\.json$/i, '');
  return normalizeModel(json, name);
}

// Used when nothing is loaded yet. Replaced by the operator's own model.
export const PLACEHOLDER = {
  name: 'placeholder',
  art: [
    '   A   ',
    '  /#\\  ',
    ' /###\\ ',
    '/--o--\\',
    '|_/=\\_|',
    "  ' '  ",
  ],
  colors: {
    '#': '#e8edf2',
    'A': '#ffffff',
    'o': '#7fd1c8',
    '=': '#7fd1c8',
    "'": '#9aa3ad',
  },
  heading: 'up',
  flame: {
    art: [
      ' \\|/ ',
      '  v  ',
    ],
  },
};
