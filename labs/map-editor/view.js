// Map editor: the canvas. Draws the sectors and everything in them at true scale, and answers "what is under
// this pixel". It holds the camera (pan and zoom) and nothing else: the layout, the selection and any drag in
// progress are handed in on every draw, so a frame is a pure picture of them.
//
// Units: the MAP is in world units (u), sectors pulled GAP u apart; the SCREEN is CSS pixels. `k` is px per u.
//
// What an object looks like is two plain functions, `objectMetrics` (its size at a scale) and `paintObject` (its
// mark), which hold nothing and need no page: the game's map (labs/graphics/map-screen.js; SX, 2026-10-02: «прям
// версию из редактора») paints its planets, holes, stations and caches through them, so the editor and the game
// cannot draw the same thing two ways. The view below only adds what an editor needs on top (the selection, the
// differs-from-game dots, the NPC routes, the ruler).

import { PALETTE, ROLES } from '../../src/roles.js';
import { mixHex, mulberry32 } from '../../src/util.js';
import { styleOfProps } from './planetlook.js';
import { CONFIG } from '../../src/config.js';
import {
  SECTOR_SIZE, GAP, PITCH, OFFGRID_AIR, KINDS, RADII, SNAP_STEP, stationBody, sectorOrigins, sectorAtPoint,
  objectMapPos, objKey, isChanged, isPlaceChanged, FULL_SPEED, mapToGame, npcResolve,
} from './data.js';

const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
const TITLE_H = 20;           // the title strip above a sector, px (one text line of the page)
const MIN_K_FACTOR = 0.4;     // zoom out to this share of the fitted scale
const MAX_K = 0.9;            // zoom in to this many px per u

const pick = (read, fallback) => { try { return read() || fallback; } catch { return fallback; } };
export const INK = Object.freeze({
  structure: PALETTE.blue, text: PALETTE.white, text2: PALETTE.gray, quiet: ROLES.textQuiet,
  active: PALETTE.green, caution: PALETTE.orange, danger: PALETTE.red, amber: PALETTE.amber,
  souvenir: pick(() => CONFIG.cache.sparkColor, '#b6f5ee'),   // the caches' own light
  hole: pick(() => CONFIG.blackHole.color, '#b79bff'),
  black: PALETTE.black,
});

// One legend row per look. `variantOf` says which look an object wears.
export const LEGEND = Object.freeze([
  { v: 'planet', name: 'PLANET' },
  { v: 'hole', name: 'BLACK HOLE' },
  { v: 'station', name: 'STATION' },
  { v: 'ruin', name: 'RUIN' },
  { v: 'home', name: 'HOME' },
  { v: 'souvenir', name: 'SOUVENIR CACHE' },
  { v: 'paint', name: 'PAINT CACHE' },
  { v: 'sealed', name: 'SEALED CACHE' },
  { v: 'look', name: 'LOOK CACHE' },
  { v: 'signal', name: 'SIGNAL' },
  { v: 'sign', name: 'SIGN' },
  { v: 'stranger', name: 'LOST CARGO' },
  { v: 'traffic', name: 'TRAFFIC' },
  { v: 'npc', name: 'NPC SHIP' },
  { v: 'anchor', name: 'ROUTE END (DRAG)' },
  { v: 'marker', name: 'EVENT' },
]);

export function variantOf(o) {
  switch (o.kind) {
    case 'station': return o.props.stationKind === 'ruin' ? 'ruin' : o.props.stationKind === 'home' ? 'home' : 'station';
    case 'cache': return o.props.station ? 'sealed' : o.props.cacheKind === 'paint' ? 'paint' : 'souvenir';
    default: return o.kind;
  }
}
// A planet is a flat disc: its own hue, a third of the way up from black (the game's own dark end is a seventh,
// which on a small map reads as grey).
const planetFill = (tint) => mixHex('#000000', tint, 0.36);
const cacheInk = (o) => (o.props.cacheKind === 'paint' ? INK.amber : INK.souvenir);

// ----------------------------------------------------------------------- glyphs
// Small marks, drawn at a minimum pixel size so a 90 u signal is still findable. `s` is the half size in px.
export function glyph(ctx, variant, cx, cy, s, o = null) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  const line = (x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  switch (variant) {
    case 'planet': {
      const tint = o?.props?.tint;
      ctx.fillStyle = tint ? planetFill(tint) : '#242a31'; ctx.strokeStyle = tint || INK.text2;
      ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    }
    case 'hole': {
      ctx.strokeStyle = INK.hole; ctx.fillStyle = INK.black;
      ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    }
    case 'station': case 'ruin': case 'home': {
      const ink = variant === 'ruin' ? INK.caution : variant === 'home' ? INK.active : INK.text;
      ctx.strokeStyle = ink; ctx.fillStyle = INK.black;
      if (variant === 'ruin') ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.rect(cx - s, cy - s * 0.75, s * 2, s * 1.5); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      if (variant === 'home') { ctx.beginPath(); ctx.rect(cx - s * 0.35, cy - s * 0.25, s * 0.7, s * 0.5); ctx.stroke(); }
      if (variant === 'station') line(cx - s * 0.5, cy, cx + s * 0.5, cy);
      break;
    }
    // 'taken' is the game's map's (a cache that has been opened): the diamond hollow. The editor never asks for it.
    case 'souvenir': case 'paint': case 'sealed': case 'taken': {
      const ink = o ? cacheInk(o) : variant === 'paint' ? INK.amber : INK.souvenir;
      ctx.strokeStyle = ink; ctx.fillStyle = ink;
      ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy); ctx.closePath();
      if (variant === 'sealed') { ctx.stroke(); line(cx - s * 0.45, cy, cx + s * 0.45, cy); } else if (variant === 'taken') ctx.stroke(); else ctx.fill();
      break;
    }
    case 'look': {
      // A look's cache: the cache diamond hollow with a dot in it, in the interface's white (its own kind among the caches).
      ctx.strokeStyle = INK.text; ctx.fillStyle = INK.text;
      ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.2, s * 0.3), 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'signal': {
      ctx.strokeStyle = INK.active; ctx.fillStyle = INK.active;
      ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.2, s * 0.3), 0, Math.PI * 2); ctx.fill(); break;
    }
    case 'sign': {
      ctx.strokeStyle = INK.text2; ctx.fillStyle = INK.text2;
      line(cx - s * 0.5, cy + s, cx - s * 0.5, cy - s);
      ctx.fillRect(cx - s * 0.5, cy - s, s * 1.5, s * 1.1); break;
    }
    case 'stranger': {
      ctx.strokeStyle = INK.danger;
      ctx.beginPath(); ctx.rect(cx - s, cy - s, s * 2, s * 2); ctx.stroke();
      line(cx - s, cy - s, cx + s, cy + s); line(cx + s, cy - s, cx - s, cy + s); break;
    }
    case 'npc': {
      // A friendly ship: the traffic triangle, hollow.
      ctx.strokeStyle = INK.text;
      ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.85, cy + s * 0.8); ctx.lineTo(cx - s * 0.85, cy + s * 0.8); ctx.closePath(); ctx.stroke(); break;
    }
    case 'anchor': {
      // The end of a route that is a free point: a handle.
      ctx.strokeStyle = INK.text; ctx.fillStyle = INK.black;
      ctx.beginPath(); ctx.rect(cx - s, cy - s, s * 2, s * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK.text; ctx.fillRect(cx - 1, cy - 1, 2, 2); break;
    }
    case 'marker': {
      // A four-pointed star: something that happens, and is not in the game yet.
      ctx.fillStyle = INK.text;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 === 0 ? s : s * 0.38;
        ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); break;
    }
    case 'traffic': {
      ctx.fillStyle = INK.amber;
      ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.85, cy + s * 0.8); ctx.lineTo(cx - s * 0.85, cy + s * 0.8); ctx.closePath(); ctx.fill(); break;
    }
    default: break;
  }
  ctx.restore();
}

// ----------------------------------------------------------------------- one object, shared with the game's map
// The half-height of a station's box from which its letter is drawn in it.
const LETTER_HALF = 7;
// How big an object is drawn, in px, at `k` px per u: its true size, never under a floor that keeps it findable.
// `radius` is a planet's own (the view passes the one being moved on the slider). `lettered`: a station's box never under the size its
// letter needs (the game's map, whose whole-map scale is half the editor's since the world grew twice as wide, src/worldScale.js).
export function objectMetrics(o, k, radius = o.props.radius, { lettered = false } = {}) {
  switch (o.kind) {
    case 'planet': { const r = (radius || 200) * k; return { kind: 'disc', r: Math.max(r, 3), true: r }; }
    case 'hole': { const r = (o.props.disc || 220) * k; return { kind: 'disc', r: Math.max(r, 5), true: r }; }
    case 'station': {
      const [hw, hh] = stationBody(o.props.look);
      const least = lettered ? LETTER_HALF : 0;
      return { kind: 'box', hw: Math.max(hw * k, 6, least), hh: Math.max(hh * k, 4.5, least), true: hw * k };
    }
    case 'cache': case 'look': return { kind: 'glyph', s: 5 };
    case 'signal': return { kind: 'glyph', s: Math.max(4, RADII.signal * k) };
    case 'sign': return { kind: 'glyph', s: 5 };
    case 'stranger': return { kind: 'glyph', s: 4.5 };
    case 'marker': return { kind: 'glyph', s: 6.5 };
    case 'npc': return { kind: 'glyph', s: 5.5 };
    default: return { kind: 'glyph', s: 5.5 };
  }
}

// An object's mark at (x, y), `m` its objectMetrics. The ctx's font and baseline are the caller's (a station's letter).
// `k` px per u and `radius` the planet's own; `was` the radius the game has, drawn as a dotted limb while it differs (the
// editor's); `turn` (a hole only) a dash offset in px, which turns the ring: the game's map's small motion, off in the
// editor. NPC ships and traffic are the editor's alone (their routes need the layout) and are not drawn here.
export function paintObject(ctx, o, x, y, m, { k, radius = o.props.radius, was = null, turn = null } = {}) {
  const v = variantOf(o);
  ctx.lineWidth = 1;
  if (o.kind === 'planet') {
    // The disc at its true radius in the planet's hue; a second hue shows as the lower half (two-tone), a ring as its
    // ellipse at the true outer radius (tilted from the seed as the game's painter does), a moon as a dotted limb.
    const tint = o.props.tint || INK.text2;
    const style = styleOfProps(o.props), tint2 = o.props.tint2;
    ctx.strokeStyle = tint;
    if (style === 'split' && tint2) {
      ctx.fillStyle = planetFill(tint);
      ctx.beginPath(); ctx.arc(x, y, m.r, Math.PI, 2 * Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = planetFill(tint2);
      ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI); ctx.closePath(); ctx.fill();
    } else { ctx.fillStyle = planetFill(tint); ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill(); }
    if (style === 'cratered') ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Where the game has its edge, while the size differs: a thin dotted ring, so how much bigger (or smaller) it has become shows
    // against the sector and its neighbours.
    if (was && Math.abs(was - radius) > 0.5) {
      ctx.strokeStyle = INK.quiet; ctx.setLineDash([1, 3]);
      ctx.beginPath(); ctx.arc(x, y, was * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (style === 'ringed') {
      const S = CONFIG.planet.styles.ringed, rng = mulberry32((o.props.seed || 0) * 31 + 7);
      const tilt = (rng() * 2 - 1) * S.tilt, open = S.open[0] + (S.open[1] - S.open[0]) * rng();
      ctx.strokeStyle = tint2 || tint; ctx.setLineDash([2, 3]);
      const R = radius || 0;
      ctx.beginPath(); ctx.ellipse(x, y, R * S.outer * k, R * S.outer * open * k, tilt, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  } else if (o.kind === 'hole') {
    ctx.strokeStyle = INK.hole;
    if (turn !== null) { ctx.setLineDash([3, 3]); ctx.lineDashOffset = turn; }
    ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.stroke();
    if (turn !== null) { ctx.setLineDash([]); ctx.lineDashOffset = 0; }
    glyph(ctx, 'hole', x, y, Math.max(4, (o.props.horizon || 40) * k * 2.2));
  } else if (o.kind === 'station') {
    const ink = v === 'ruin' ? INK.caution : v === 'home' ? INK.active : INK.text;
    ctx.fillStyle = INK.black; ctx.strokeStyle = ink;
    ctx.setLineDash(v === 'ruin' ? [3, 2] : []);
    ctx.beginPath(); ctx.rect(Math.round(x - m.hw) + 0.5, Math.round(y - m.hh) + 0.5, Math.round(m.hw * 2), Math.round(m.hh * 2)); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    if (m.hh >= LETTER_HALF) {
      const letter = v === 'ruin' ? 'R' : v === 'home' ? 'H' : o.props.stationKind === 'garage' ? 'G' : 'F';
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.fillText(letter, Math.round(x), Math.round(y) + 1); ctx.textAlign = 'left';
    }
  } else glyph(ctx, v, x, y, m.s, o);
}

// ----------------------------------------------------------------------- the view
export class MapView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = { cx: 0, cy: 0, k: 0.03 };
    this.size = { w: 1, h: 1, dpr: 1 };
    this.fitK = 0.03;
    this.live = null;               // { key, radius }: a planet whose size is being moved, drawn at that radius meanwhile
    const css = getComputedStyle(document.body);
    this.fontFamily = css.fontFamily;
    this.fontSize = 11;
    this.font = `${this.fontSize}px ${this.fontFamily}`;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.size = { w: Math.max(1, r.width), h: Math.max(1, r.height), dpr };
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
  }

  toScreen(mx, my) { const v = this.view; return [(mx - v.cx) * v.k + this.size.w / 2, (my - v.cy) * v.k + this.size.h / 2]; }
  toMap(sx, sy) { const v = this.view; return [(sx - this.size.w / 2) / v.k + v.cx, (sy - this.size.h / 2) / v.k + v.cy]; }

  // Frame everything: every sector and the strip's note, with a margin.
  bounds(layout) {
    const org = sectorOrigins(layout.sectors);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of org.values()) { x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + W); y1 = Math.max(y1, o.y + H); }
    if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = W; y1 = H; }
    return { x0: x0 - GAP * 0.45, y0: y0 - GAP * 0.95, x1: x1 + GAP * 0.45, y1: y1 + GAP * 0.45 };
  }

  fit(layout) {
    const b = this.bounds(layout);
    const k = Math.min(this.size.w / (b.x1 - b.x0), this.size.h / (b.y1 - b.y0));
    this.fitK = k;
    this.view = { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, k };
  }

  // The same, but with the one-ring of empty cells round the grid in view (adding / moving a sector).
  fitWithRing(layout) {
    const grid = layout.sectors.filter((s) => !s.hidden);
    const cols = grid.map((s) => s.col), rows = grid.map((s) => s.row);
    const b = this.bounds(layout);
    const gx0 = (Math.min(...cols, 0) - 1) * PITCH - GAP * 0.45, gx1 = (Math.max(...cols, 0) + 1) * PITCH + W + GAP * 0.45;
    const gy0 = (Math.min(...rows, 0) - 1) * PITCH - GAP * 0.95, gy1 = (Math.max(...rows, 0) + 1) * PITCH + H + GAP * 0.45;
    const x0 = Math.min(b.x0, gx0), x1 = Math.max(b.x1, gx1), y0 = Math.min(b.y0, gy0), y1 = Math.max(b.y1, gy1);
    const k = Math.min(this.size.w / (x1 - x0), this.size.h / (y1 - y0));
    this.view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k };
  }

  zoomAt(sx, sy, factor) {
    const [mx, my] = this.toMap(sx, sy);
    const k = Math.min(MAX_K, Math.max(this.fitK * MIN_K_FACTOR, this.view.k * factor));
    this.view.k = k;
    // Keep the map point under the cursor where it was.
    this.view.cx = mx - (sx - this.size.w / 2) / k;
    this.view.cy = my - (sy - this.size.h / 2) / k;
  }

  panBy(dx, dy) { this.view.cx -= dx / this.view.k; this.view.cy -= dy / this.view.k; }

  // ------------------------------------------------------------------- sizes
  // A planet's radius as the map draws it: the one being moved on the slider, else its own.
  radiusOf(o) { return this.live && this.live.key === objKey(o) ? this.live.radius : o.props.radius; }

  // How big an object is drawn, in px: its true size, never under a floor that keeps it findable.
  metrics(o) { return objectMetrics(o, this.view.k, this.radiusOf(o)); }

  // ------------------------------------------------------------------- hit testing
  // Everything under (sx, sy), top-most first. `visible` is the set of layer ids that are on.
  hit(layout, visible, sx, sy, origins = sectorOrigins(layout.sectors)) {
    const out = [];
    for (let ki = KINDS.length - 1; ki >= 0; ki--) {
      const kind = KINDS[ki].id;
      if (!visible.has(kind)) continue;
      for (let i = layout.objects.length - 1; i >= 0; i--) {
        const o = layout.objects[i];
        if (o.kind !== kind || o.sector == null) continue;
        const p = objectMapPos(layout, origins, o);
        if (!p) continue;
        const [x, y] = this.toScreen(p.x, p.y);
        const m = this.metrics(o);
        const dx = sx - x, dy = sy - y;
        let inside;
        if (m.kind === 'disc') inside = Math.hypot(dx, dy) <= m.r + 2;
        else if (m.kind === 'box') inside = Math.abs(dx) <= m.hw + 3 && Math.abs(dy) <= m.hh + 3;
        else inside = Math.hypot(dx, dy) <= m.s + 4;
        if (inside) out.push(objKey(o));
      }
    }
    return out;
  }

  // The sector whose title strip is under the pointer.
  hitTitle(layout, sx, sy, origins = sectorOrigins(layout.sectors)) {
    for (const s of layout.sectors) {
      const o = origins.get(s.id);
      if (!o) continue;
      const [x, y] = this.toScreen(o.x, o.y);
      if (sx >= x && sx <= x + W * this.view.k && sy >= y - TITLE_H - 2 && sy <= y) return s.id;
    }
    return null;
  }

  // Objects whose centre is inside a screen rectangle.
  inBox(layout, visible, x0, y0, x1, y1, origins = sectorOrigins(layout.sectors)) {
    const lo = [Math.min(x0, x1), Math.min(y0, y1)], hi = [Math.max(x0, x1), Math.max(y0, y1)];
    const keys = [];
    for (const o of layout.objects) {
      if (o.sector == null || !visible.has(o.kind)) continue;
      const p = objectMapPos(layout, origins, o);
      if (!p) continue;
      const [x, y] = this.toScreen(p.x, p.y);
      if (x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1]) keys.push(objKey(o));
    }
    return keys;
  }

  // The empty grid cells round and between the sectors, where a sector may go.
  ghostCells(layout, exceptId = null) {
    const grid = layout.sectors.filter((s) => !s.hidden && s.id !== exceptId);
    if (!grid.length) return [{ col: 0, row: 0 }];
    const cols = grid.map((s) => s.col), rows = grid.map((s) => s.row);
    const out = [];
    for (let c = Math.min(...cols) - 1; c <= Math.max(...cols) + 1; c++) {
      for (let r = Math.min(...rows) - 1; r <= Math.max(...rows) + 1; r++) {
        if (!grid.some((s) => s.col === c && s.row === r)) out.push({ col: c, row: r });
      }
    }
    return out;
  }

  // The cell a map point is nearest to.
  cellAtMap(mx, my) { return { col: Math.round((mx - W / 2) / PITCH), row: Math.round((my - H / 2) / PITCH) }; }

  // ------------------------------------------------------------------- drawing
  draw(s) {
    const { ctx } = this;
    const { w, h, dpr } = this.size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = INK.black;
    ctx.fillRect(0, 0, w, h);
    ctx.font = this.font;
    ctx.textBaseline = 'middle';

    const { layout } = s;
    const origins = sectorOrigins(layout.sectors);
    const visible = s.layers;
    // The NPC ships' routes as the layout stands (and with a dragged anchor where the pointer is).
    const npcRes = new Map();
    for (const o of layout.objects) {
      if (o.kind !== 'npc' || o.sector == null || !visible.has('npc')) continue;
      const key = objKey(o);
      const drag = s.anchorDrag && s.anchorDrag.key === key ? { which: s.anchorDrag.which, x: s.anchorDrag.x, y: s.anchorDrag.y } : null;
      npcRes.set(key, npcResolve(layout, o, drag));
    }
    const npcPos = (o) => {
      const res = npcRes.get(objKey(o)), org = origins.get(o.sector);
      return res?.mid && org ? { x: org.x + res.mid[0] * W, y: org.y + res.mid[1] * H } : null;
    };
    const posOf = (o) => s.drag?.moves.get(objKey(o)) ?? (o.kind === 'npc' ? npcPos(o) : null) ?? objectMapPos(layout, origins, o);
    const scr = (p) => this.toScreen(p.x, p.y);
    const labels = [];

    this.drawSectors(s, origins);
    if (s.snap) this.drawSnap(s, origins);
    if (s.ghosts) this.drawGhosts(s);

    const objects = layout.objects.filter((o) => o.sector != null && visible.has(o.kind));
    // Links first: a sealed cache to its ruin, when either is selected.
    this.drawLinks(s, objects, posOf);
    // Radii under the marks.
    if (s.radii) for (const o of objects) { const p = posOf(o); if (p) this.drawRadii(o, scr(p)); }
    // The bodies, bottom layer first.
    for (const kind of KINDS) {
      for (const o of objects) {
        if (o.kind !== kind.id) continue;
        const p = posOf(o);
        if (!p) continue;
        const [x, y] = scr(p);
        if (x < -60 || y < -60 || x > w + 60 || y > h + 60) continue;
        const dragged = s.drag?.moves.has(objKey(o));
        this.drawObject(o, x, y, { dragged, refused: dragged && !s.drag.valid, delta: dragged ? s.drag.delta : null, npc: npcRes.get(objKey(o)), badAnchor: s.anchorDrag && s.anchorDrag.key === objKey(o) && !s.anchorDrag.valid }, origins);
        labels.push({ o, x, y });
      }
    }
    if (s.labels || s.selection.keys.size || s.hoverKey) this.drawLabels(s, labels);
    this.drawSelection(s, objects, posOf);
    if (s.box) this.drawBox(s.box);
    if (s.placing) this.drawPlacing(s.placing);
    if (s.ruler) this.drawRuler(s.ruler, layout, origins);
  }

  drawSectors(s, origins) {
    const { ctx } = this;
    const k = this.view.k;
    for (const sec of s.layout.sectors) {
      const o = origins.get(sec.id);
      if (!o) continue;
      const [x, y] = this.toScreen(o.x, o.y);
      const pw = W * k, ph = H * k;
      if (x > this.size.w + 4 || y - TITLE_H > this.size.h + 4 || x + pw < -4 || y + ph < -4) continue;
      const picked = s.selection.sectorId === sec.id || s.sectorDrag?.id === sec.id;
      const hover = s.hoverSector === sec.id;
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK.structure;
      ctx.setLineDash(sec.hidden ? [4, 4] : []);
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(pw), Math.round(ph));
      ctx.setLineDash([]);
      // Title strip: address and name at the left, its counts at the right, quiet.
      const title = `${sec.label} ${sec.name}`.trim();
      ctx.font = this.font;
      ctx.fillStyle = picked || hover ? INK.text : INK.text2;
      ctx.textAlign = 'left';
      const ty = Math.round(y) - TITLE_H / 2 - 2;
      ctx.fillText(title, Math.round(x), ty);
      if (picked) {
        const tw = ctx.measureText(title).width;
        ctx.fillStyle = INK.text; ctx.fillRect(Math.round(x), Math.round(y) - 3, Math.round(tw), 1);
      }
      // Its counts at the right, as many as fit beside the title: rocks and pirates, rocks, or nothing.
      const room = pw - ctx.measureText(title).width - 16;
      const counts = [`${sec.asteroids} ROCKS` + (sec.pirateRate != null ? `  PIRATES ${sec.pirateRate}/MIN` : ''), `${sec.asteroids} ROCKS`]
        .find((t) => ctx.measureText(t).width <= room);
      if (counts) {
        ctx.fillStyle = INK.quiet; ctx.textAlign = 'right';
        ctx.fillText(counts, Math.round(x + pw), ty);
        ctx.textAlign = 'left';
      }
      if (sec.note) { ctx.fillStyle = INK.amber; ctx.fillRect(Math.round(x + ctx.measureText(title).width) + 6, ty - 2, 4, 4); }
      if (sec.hidden) {
        // The off-grid sector says so: a dashed rule across the grid's width and a note beside it.
        const midY = y - (GAP + OFFGRID_AIR) * k / 2 + TITLE_H / 2;
        ctx.setLineDash([2, 5]); ctx.strokeStyle = INK.structure;
        ctx.beginPath(); ctx.moveTo(Math.round(this.toScreen(-GAP * 0.45, 0)[0]) + 0.5, Math.round(midY) + 0.5);
        ctx.lineTo(Math.round(x + pw) + 0.5, Math.round(midY) + 0.5); ctx.stroke(); ctx.setLineDash([]);
        // The note ends at this sector's right edge, so a corner legend at the left cannot cover it.
        ctx.fillStyle = INK.quiet; ctx.textAlign = 'right';
        ctx.fillText('OFF THE GRID: A BLACK HOLE IS THE WAY', Math.round(x + pw), Math.round(midY) - 11);
        ctx.textAlign = 'left';
      }
    }
    if (s.sectorDrag) {
      const { id } = s.sectorDrag;
      const src = origins.get(id);
      if (src) {
        const [x, y] = this.toScreen(src.x, src.y);
        ctx.setLineDash([3, 3]); ctx.strokeStyle = INK.text; ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(W * k), Math.round(H * k)); ctx.setLineDash([]);
      }
    }
  }

  // The snap grid, faint, only as fine as is readable: every 144 u, every 5th or every 10th.
  drawSnap(s, origins) {
    const { ctx } = this;
    const k = this.view.k;
    const base = SNAP_STEP * W * k;
    const mult = base >= 8 ? 1 : base * 5 >= 8 ? 5 : 10;
    const step = SNAP_STEP * mult;
    ctx.strokeStyle = INK.structure; ctx.globalAlpha = 0.28; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const sec of s.layout.sectors) {
      const o = origins.get(sec.id);
      if (!o) continue;
      const [x, y] = this.toScreen(o.x, o.y);
      const pw = W * k, ph = H * k;
      if (x > this.size.w || y > this.size.h || x + pw < 0 || y + ph < 0) continue;
      for (let f = step; f < 1 - 1e-6; f += step) {
        const px = Math.round(x + f * pw) + 0.5, py = Math.round(y + f * ph) + 0.5;
        ctx.moveTo(px, Math.round(y) + 1); ctx.lineTo(px, Math.round(y + ph));
        ctx.moveTo(Math.round(x) + 1, py); ctx.lineTo(Math.round(x + pw), py);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawGhosts(s) {
    const { ctx } = this;
    const k = this.view.k;
    ctx.lineWidth = 1;
    for (const c of s.ghosts.cells) {
      const x = c.col * PITCH, y = c.row * PITCH;
      const [sx, sy] = this.toScreen(x, y);
      const on = s.ghosts.active && s.ghosts.active.col === c.col && s.ghosts.active.row === c.row;
      ctx.setLineDash(on ? [] : [3, 5]);
      ctx.strokeStyle = on ? INK.text : INK.structure;
      ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.round(W * k), Math.round(H * k));
      ctx.setLineDash([]);
      ctx.fillStyle = on ? INK.text : INK.text2; ctx.textAlign = 'center';
      ctx.fillText('+', Math.round(sx + W * k / 2), Math.round(sy + H * k / 2));
      ctx.textAlign = 'left';
    }
  }

  drawLinks(s, objects, posOf) {
    const { ctx } = this;
    const sel = s.selection.keys;
    if (!sel.size) return;
    const byId = new Map(objects.map((o) => [o.id, o]));
    ctx.lineWidth = 1; ctx.strokeStyle = INK.caution; ctx.setLineDash([2, 3]);
    for (const o of objects) {
      if (o.kind !== 'cache' || !o.props.station) continue;
      const ruin = byId.get(o.props.station);
      if (!ruin) continue;
      if (!sel.has(objKey(o)) && !sel.has(objKey(ruin))) continue;
      const a = posOf(o), b = posOf(ruin);
      if (!a || !b) continue;
      const [x0, y0] = this.toScreen(a.x, a.y), [x1, y1] = this.toScreen(b.x, b.y);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    // A selected thing's way back to where the game has it.
    ctx.strokeStyle = INK.text2;
    for (const o of s.layout.objects) {
      if (!sel.has(objKey(o)) || o.sector == null || !o.game || !isPlaceChanged(o)) continue;
      const a = posOf(o), b = this.originalPos(s, o);
      if (!a || !b) continue;
      const [x0, y0] = this.toScreen(a.x, a.y), [x1, y1] = this.toScreen(b.x, b.y);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = INK.text2; ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([2, 3]);
    }
    ctx.setLineDash([]);
  }

  originalPos(s, o) {
    const origins = sectorOrigins(s.layout.sectors);
    const org = origins.get(o.game.sector);
    return org ? { x: org.x + o.game.x * W, y: org.y + o.game.y * H } : null;
  }

  drawRadii(o, [x, y]) {
    const { ctx } = this;
    const k = this.view.k;
    ctx.lineWidth = 1;
    const ring = (r, ink, dash) => {
      if (r * k < 2) return;
      ctx.strokeStyle = ink; ctx.setLineDash(dash); ctx.beginPath(); ctx.arc(x, y, r * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    };
    if (o.kind === 'planet') ring((this.radiusOf(o) || 0) + RADII.orbit, INK.text2, [2, 4]);
    else if (o.kind === 'hole') ring(o.props.disc || 0, INK.hole, [2, 3]);
    else if (o.kind === 'station') {
      ring(RADII.hull, INK.structure, [3, 3]);
      ring(RADII.menu, INK.active, [2, 4]);
      if (o.props.stationKind === 'ruin') ring(RADII.guardWake, INK.caution, [2, 4]);
      else ring(RADII.pirateFree, INK.danger, [1, 5]);
    } else if (o.kind === 'cache') ring(RADII.cache, cacheInk(o), [2, 3]);
    else if (o.kind === 'look') ring(RADII.cache, INK.text, [2, 3]);
    else if (o.kind === 'signal') ring(RADII.signal, INK.active, []);
  }

  drawObject(o, x, y, { dragged, refused, delta, npc, badAnchor }, origins) {
    const { ctx } = this;
    const m = this.metrics(o);
    ctx.lineWidth = 1;
    if (o.kind === 'npc') {
      this.drawNpc(o, x, y, m, npc, badAnchor, origins);
    } else if (o.kind === 'traffic') {
      this.drawPath(o, origins, delta);
      glyph(ctx, 'traffic', x, y, m.s, o);
    } else {
      paintObject(ctx, o, x, y, m, { k: this.view.k, radius: this.radiusOf(o), was: o.game?.look?.radius });
    }
    if (refused) {
      ctx.strokeStyle = INK.danger; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
    }
    // Two tiny flags: differs from the game (white), has a note (amber).
    const e = (m.kind === 'disc' ? m.r : m.kind === 'box' ? Math.max(m.hw, m.hh) : m.s) + 2;
    if (!dragged && isChanged(o)) { ctx.fillStyle = INK.text; ctx.fillRect(Math.round(x + e), Math.round(y - e) - 1, 3, 3); }
    if (o.note) { ctx.fillStyle = INK.amber; ctx.fillRect(Math.round(x + e), Math.round(y + e) - 2, 3, 3); }
  }

  // A craft's lane or orbit, from its (translated) path.
  drawPath(o, origins, delta) {
    const P = o.props.path;
    if (!P) return;
    const { ctx } = this;
    const org = origins.get(o.sector);
    if (!org) return;
    // While the craft is being dragged its path goes with it, by the same map distance.
    const to = (fx, fy) => this.toScreen(org.x + fx * W + (delta ? delta.dx : 0), org.y + fy * H + (delta ? delta.dy : 0));
    ctx.strokeStyle = INK.amber; ctx.globalAlpha = 0.5; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
    ctx.beginPath();
    if (P.kind === 'orbit') { const [cx, cy] = to(P.at[0], P.at[1]); ctx.arc(cx, cy, P.radius * W * this.view.k, 0, Math.PI * 2); } else {
      const [x0, y0] = to(P.from[0], P.from[1]), [x1, y1] = to(P.to[0], P.to[1]);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  // An NPC ship: its route (a lane or an orbit), the handles of the route's free ends, and the ship. A route with
  // no way (a station moved to another sector) says so with a red ring round the ship.
  drawNpc(o, x, y, m, res, badAnchor, origins) {
    const { ctx } = this;
    const org = origins.get(o.sector);
    ctx.lineWidth = 1;
    if (res?.path && org) {
      const P = res.path;
      const to = (fx, fy) => this.toScreen(org.x + fx * W, org.y + fy * H);
      ctx.strokeStyle = badAnchor ? INK.danger : INK.text2; ctx.globalAlpha = 0.65; ctx.setLineDash([2, 4]);
      ctx.beginPath();
      if (P.kind === 'orbit') { const [cx, cy] = to(P.at[0], P.at[1]); ctx.arc(cx, cy, P.radius * W * this.view.k, 0, Math.PI * 2); } else {
        const [x0, y0] = to(P.from[0], P.from[1]), [x1, y1] = to(P.to[0], P.to[1]);
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      for (const a of res.anchors) if (a.free) { const [ax, ay] = to(a.x, a.y); glyph(ctx, 'anchor', ax, ay, 4); }
    }
    glyph(ctx, 'npc', x, y, m.s, o);
    if (!res?.path) { ctx.strokeStyle = INK.danger; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); }
  }

  // The draggable end of a route under (sx, sy): { key, which } or null. Only a FREE end (an [x, y]) is a handle; a
  // station's or planet's end moves with that station or planet.
  hitAnchor(layout, visible, sx, sy, origins = sectorOrigins(layout.sectors)) {
    if (!visible.has('npc')) return null;
    for (const o of layout.objects) {
      if (o.kind !== 'npc' || o.sector == null) continue;
      const org = origins.get(o.sector);
      if (!org) continue;
      for (const a of npcResolve(layout, o).anchors) {
        if (!a.free) continue;
        const [ax, ay] = this.toScreen(org.x + a.x * W, org.y + a.y * H);
        if (Math.abs(sx - ax) <= 7 && Math.abs(sy - ay) <= 7) return { key: objKey(o), which: a.which };
      }
    }
    return null;
  }

  labelText(o) {
    if (o.kind === 'station' && o.props.stationKind === 'ruin') return `${o.label} ${o.props.cost} CR`;
    if (o.kind === 'stranger') return o.game && o.label === o.game.label ? `${o.label} CARGO` : o.label;
    if (o.kind === 'signal') return o.label.replace('SIGNAL ', '');
    return o.label;
  }

  // Labels, most important first; one that would land on a drawn label is skipped, so zooming in reveals more.
  // The selected and hovered always show, on an opaque backing.
  drawLabels(s, items) {
    const { ctx } = this;
    const order = { station: 0, marker: 0.5, planet: 1, hole: 2, cache: 3, look: 3, stranger: 4, traffic: 5, sign: 6, signal: 7 };
    const sel = s.selection.keys;
    const rank = (it) => (sel.has(objKey(it.o)) || objKey(it.o) === s.hoverKey ? -1 : order[it.o.kind] ?? 9);
    const sorted = [...items].sort((a, b) => rank(a) - rank(b));
    const placed = [];
    const hit = (r) => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    const lh = 14;
    ctx.textAlign = 'left';
    for (const it of sorted) {
      const forced = rank(it) < 0;
      if (!forced && !s.labels) continue;
      const text = this.labelText(it.o);
      const tw = Math.ceil(ctx.measureText(text).width);
      const m = this.metrics(it.o);
      let r;
      if (it.o.kind === 'planet') r = { x: Math.round(it.x - tw / 2), y: Math.round(it.y + m.r + 3), w: tw + 4, h: lh };
      else {
        const off = (m.kind === 'box' ? m.hw : m.kind === 'disc' ? m.r : m.s) + 5;
        r = { x: Math.round(it.x + off), y: Math.round(it.y - lh / 2), w: tw + 4, h: lh };
      }
      if (!forced && hit(r)) continue;
      placed.push(r);
      ctx.fillStyle = INK.black; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = forced ? INK.text : INK.text2;
      ctx.fillText(text, r.x + 2, r.y + lh / 2 + 0.5);
    }
  }

  drawSelection(s, objects, posOf) {
    const { ctx } = this;
    ctx.lineWidth = 1; ctx.strokeStyle = INK.text; ctx.setLineDash([]);
    const mark = (x, y, hw, hh) => {
      const c = 4;
      const x0 = Math.round(x - hw) - 3.5, x1 = Math.round(x + hw) + 3.5, y0 = Math.round(y - hh) - 3.5, y1 = Math.round(y + hh) + 3.5;
      ctx.beginPath();
      for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        ctx.moveTo(px + sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * c);
      }
      ctx.stroke();
    };
    for (const o of objects) {
      if (!s.selection.keys.has(objKey(o))) continue;
      const p = posOf(o);
      if (!p) continue;
      const [x, y] = this.toScreen(p.x, p.y);
      const m = this.metrics(o);
      if (m.kind === 'disc') mark(x, y, m.r, m.r);
      else if (m.kind === 'box') mark(x, y, m.hw, m.hh);
      else mark(x, y, m.s, m.s);
    }
  }

  // The object SX is about to place, following the pointer: refused (red ring) between sectors.
  drawPlacing(p) {
    const { ctx } = this;
    const v = p.kind === 'station' ? 'station' : p.kind === 'cache' ? 'souvenir' : p.kind;
    ctx.lineWidth = 1;
    if (p.kind === 'planet') {
      ctx.strokeStyle = INK.text; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(300 * this.view.k, 5), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    } else glyph(ctx, v, p.x, p.y, 8);
    if (!p.valid) { ctx.strokeStyle = INK.danger; ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.stroke(); }
  }

  drawBox(b) {
    const { ctx } = this;
    ctx.strokeStyle = INK.text; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.strokeRect(Math.min(b.x0, b.x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    ctx.setLineDash([]);
  }

  drawRuler(r, layout, origins) {
    const { ctx } = this;
    const [x0, y0] = this.toScreen(r.a.x, r.a.y), [x1, y1] = this.toScreen(r.b.x, r.b.y);
    ctx.strokeStyle = INK.amber; ctx.fillStyle = INK.amber; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    for (const [x, y] of [[x0, y0], [x1, y1]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
    const text = rulerText(r, layout, origins);
    ctx.font = this.font; ctx.textAlign = 'left';
    const tw = Math.ceil(ctx.measureText(text).width);
    const bx = Math.min(Math.max(Math.round((x0 + x1) / 2) + 8, 4), this.size.w - tw - 8), by = Math.min(Math.max(Math.round((y0 + y1) / 2) - 8, 4), this.size.h - 22);
    ctx.fillStyle = INK.black; ctx.fillRect(bx - 2, by, tw + 8, 16);
    ctx.strokeStyle = INK.amber; ctx.strokeRect(bx - 2 + 0.5, by + 0.5, tw + 7, 15);
    ctx.fillStyle = INK.amber; ctx.fillText(text, bx + 2, by + 8.5);
  }
}

// "7,240 U / 4.8 S", or why there is none. Distances are the game's: sectors touch, however far apart the map draws them.
export function rulerText(r, layout, origins) {
  const a = mapToGame(layout.sectors, origins, r.a.x, r.a.y), b = mapToGame(layout.sectors, origins, r.b.x, r.b.y);
  if (!a || !b) return '-';
  if (a.hidden || b.hidden) {
    if (a.hidden && b.hidden && a.hidden === b.hidden) {
      const d = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
      return `${Math.round(d).toLocaleString('en-US')} U / ${(d / FULL_SPEED).toFixed(1)} S`;
    }
    return 'OFF THE GRID: NO DISTANCE';
  }
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return `${Math.round(d).toLocaleString('en-US')} U / ${(d / FULL_SPEED).toFixed(1)} S`;
}

export { sectorAtPoint, TITLE_H };
