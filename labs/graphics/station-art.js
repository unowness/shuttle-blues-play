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

// ---- 1. RING -----------------------------------------------------------------------------

// Reworked 2026-09-30 (SX: «переработай чуть чуть все таки это космические объекты а нарисованы так будто они
// на земле стоят»): the dock that stood under it like a plinth is gone; a mast and a lamp at each pole instead.
function ring() {
  const W = 41, H = 21, cx = 20, cy = 10, R = 3.9;
  return {
    key: 'ring', name: 'RING', hue: '#A99BE0', W, H,
    idea: 'A planet-shaded core hung inside a tilted habitat ring, a mast and a lamp at each pole: nothing under it to stand on.',
    moves: 'the core turns like a planet; three lights run round the ring; the two pole lamps blink in turn',
    build(L) {
      const oe = inEll(cx, cy, 12.2, 7.2), ie = inEll(cx, cy, 9.9, 4.5);
      const band = shape(W, H, (x, y) => oe(x, y) && !ie(x, y));
      const core = shape(W, H, inDisc(cx, cy, R));
      stroke(L, band, STR); stroke(L, core, MAT);
      // Two struts along the long axis and one above and below the core join it to the ring.
      for (const dir of [-1, 1]) {
        let x = cx + dir * 7;
        while (x > 0 && x < W - 1 && L.at(x, cy) === null) { L.edge(x, cy, 10, MAT); x += dir; }
        L.edge(x, cy, dir < 0 ? 8 : 2, MAT); L.edge(cx + dir * 6, cy, dir < 0 ? 2 : 8, MAT);
      }
      L.vline(cx, cy - 5, cy - 3, MAT); L.vline(cx, cy + 3, cy + 5, MAT);
      // The masts, the same length above and below the ring.
      L.vline(cx, 1, 3, MAT); L.vline(cx, H - 4, H - 2, MAT);
      return {
        core: core.inner,
        band: band.inner.map(([x, y]) => ({ x, y, phi: Math.atan2((y - cy) / 5.8, (x - cx) * A / 11), w: hash01(x, y, 1) })),
      };
    },
    frame(D, S, tone, t) {
      sphereFill(D, S.core, cx, cy, R, tone, 31, 0.07, t);
      const heads = [0, 1, 2].map((k) => t * 0.6 + k * TAU / 3);
      for (const c of S.band) {
        let d = 9;
        for (const h of heads) d = Math.min(d, (((h - c.phi) % TAU) + TAU) % TAU);
        if (d < 0.13) D.put(c.x, c.y, '•', HI);
        else if (d < 1.2) D.put(c.x, c.y, '·', tone.lit, 1 - d / 1.2 * 0.8);
        else if (c.w < 0.4) D.put(c.x, c.y, '·', tone.rim, 0.55);
      }
      const top = (t % 2.6) < 0.4, bottom = ((t + 1.3) % 2.6) < 0.4;
      D.put(cx, 0, top ? 'o' : '·', top ? HI : DIM);
      D.put(cx, H - 1, bottom ? 'o' : '·', bottom ? HI : DIM);
    },
  };
}

// ---- 2. SPINDLE --------------------------------------------------------------------------

function spindle() {
  const W = 42, H = 13, dcx = 28.5, dhw = 5.75;
  return {
    key: 'spindle', name: 'SPINDLE', hue: '#47C2BE', W, H,
    idea: 'One long spine with modules strung along it: reactor, tank, and a great turning drum for a home.',
    moves: 'the drum rolls (ribs and fill wrap round a cylinder); lights circulate on the rails; dock lights step',
    build(L) {
      L.box(0, 3, 7, 7, MAT); L.hline(0, 6, 5, MAT); L.hline(0, 6, 7, MAT);
      L.box(12, 3, 7, 7, MAT, true);
      L.box(22, 0, 14, 13, MAT, true);
      L.box(38, 3, 4, 7, MAT);
      for (const [a, b] of [[6, 12], [18, 22], [35, 38]]) { L.hline(a, b, 5, MAT); L.hline(a, b, 7, MAT); }
      L.put(9, 6, '┊', DIM); L.put(20, 6, '┊', DIM); L.put(36, 6, '┊', DIM);
      L.put(39, 6, '(', STR); L.put(40, 6, ')', STR);
      const cells = (x0, x1, ys) => ys.flatMap((y) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y]));
      return {
        reactor: cells(1, 5, [4, 6, 8]),
        tank: cells(13, 17, [4, 5, 6, 7, 8]),
        drum: cells(23, 34, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      };
    },
    frame(D, S, tone, t) {
      for (const [x, y] of S.reactor) ramp(D, x, y, fbmWrapped(x * 0.5 + t * 1.1, y * 0.6, 12, 5, 3) + 0.04, tone);
      for (const [x, y] of S.tank) ramp(D, x, y, fbmWrapped(x * 0.45, y * 0.5 - t * 0.25, 12, 9, 3) + Math.sin(t * 1.2 + x * 0.7) * 0.06, tone);
      const spin = t * 0.35;
      for (const [x, y] of S.drum) {
        const th = Math.asin(clamp((x - dcx) / dhw, -0.98, 0.98));
        const n = fbmWrapped(((th - spin) / TAU + 0.5) * 12, y * 0.55, 12, 23, 3);
        ramp(D, x, y, n + (Math.cos(th) - 0.55) * 0.3, tone);
      }
      for (let k = 0; k < 8; k++) {
        const a = spin + k * TAU / 8, c = Math.cos(a);
        if (c <= 0.08) continue;
        for (let y = 1; y <= 11; y++) D.put(dcx + Math.sin(a) * dhw, y, '│', MAT, 0.3 + 0.7 * c);
      }
      for (let k = 0; k < 3; k++) {
        const p = (t * 7 + k * 14) % 42, q = 41 - ((t * 7 + k * 14 + 7) % 42);
        for (const [a, b] of [[7, 11], [19, 21], [36, 37]]) {
          if (p >= a && p <= b) D.put(p, 5, '•', HI);
          if (q >= a && q <= b) D.put(q, 7, '•', HI);
        }
      }
      const step = Math.floor(t * 2) % 4;
      [[39, 4], [40, 4], [40, 8], [39, 8]].forEach(([x, y], k) => D.put(x, y, step === k ? '•' : '·', step === k ? HI : DIM));
    },
  };
}

// ---- 3. FOUNDRY --------------------------------------------------------------------------

// Reworked 2026-09-30 (SX: «все таки это космические объекты а нарисованы так будто они на земле стоят»): no
// slab under it and no smoke rising off stacks. A smelter adrift: ore comes in along a truss, heat leaves by
// radiators above and below, exhaust leaves by two nozzles to the side and spreads as it goes, never up.
function foundry() {
  const W = 42, H = 21, cy = 10;
  const NOZZLES = [[6, -1, 0], [12, 1, 0.5]];                         // top rail row, which way the plume opens, phase
  return {
    key: 'foundry', name: 'FOUNDRY', hue: '#C98A5E', W, H,
    idea: 'A smelter adrift: an ore bin, a truss feeding the furnace, radiator panels above and below, two nozzles venting to the side.',
    moves: 'ore rides the truss into the furnace; the mouth glows and pulses, the plating and the radiators warm with it; both nozzles vent straight out, the plumes spreading',
    build(L) {
      // The ore bin, three holds.
      L.box(0, 5, 7, 11, MAT); L.hline(0, 6, 8, MAT); L.hline(0, 6, 12, MAT);
      // The feed truss: two rails, a post every four columns, a cross in each bay.
      L.hline(6, 14, 8, MAT); L.hline(6, 14, 12, MAT); L.vline(10, 8, 12, MAT);
      for (const bx of [7, 11]) {
        L.put(bx, 9, '╲', MAT); L.put(bx + 2, 9, '╱', MAT); L.put(bx + 1, 10, '╳', MAT);
        L.put(bx, 11, '╱', MAT); L.put(bx + 2, 11, '╲', MAT);
      }
      // The furnace and its mouth.
      L.box(14, 5, 12, 11, MAT);
      L.box(16, 7, 8, 7, STR);
      // Radiator panels above and below, each on two stubs.
      L.box(15, 0, 10, 4, MAT); L.box(15, 17, 10, 4, MAT);
      for (const x of [17, 22]) { L.vline(x, 3, 5, MAT); L.vline(x, 15, 17, MAT); }
      // Two nozzles out of the far side, their bells open.
      for (const [ny] of NOZZLES) {
        L.hline(25, 29, ny, MAT); L.hline(25, 29, ny + 2, MAT);
        L.put(30, ny, '╱', MAT); L.put(30, ny + 2, '╲', MAT);
      }
      const mouthEdge = L.perimeter(16, 7, 8, 7).map(([x, y]) => [x, y, L.at(x, y)]);
      const mouth = [], plate = [], ore = [], fins = [], throat = [];
      for (let y = 8; y <= 12; y++) for (let x = 17; x <= 22; x++) mouth.push([x, y]);
      for (let y = 6; y <= 14; y++) for (let x = 15; x <= 24; x++) {
        if (x >= 16 && x <= 23 && y >= 7 && y <= 13) continue;
        if (L.at(x, y) === null) plate.push({ x, y, d: Math.max(0, 16 - x, x - 23, 7 - y, y - 13) });
      }
      for (const [y0, y1] of [[6, 7], [9, 11], [13, 14]]) for (let y = y0; y <= y1; y++) for (let x = 1; x <= 5; x++) ore.push([x, y]);
      for (const y of [1, 2, 18, 19]) for (let x = 16; x <= 23; x++) fins.push({ x, y, near: y === 2 || y === 18 });
      for (const [ny] of NOZZLES) for (let x = 26; x <= 29; x++) throat.push([x, ny + 1]);
      return { mouthEdge, mouth, plate, ore, fins, throat };
    },
    frame(D, S, tone, t) {
      const p = (0.42 + 0.58 * (0.5 + 0.5 * Math.sin(t * 1.5))) * (0.92 + 0.08 * Math.sin(t * 6.1));
      for (const [x, y, ch] of S.mouthEdge) D.put(x, y, ch, tint(STR, tone.lit, p * 0.9));
      for (const [x, y] of S.mouth) {
        const g = p * (0.5 + 0.8 * (fbmWrapped(x * 0.8 + t * 1.7, y * 0.9 - t * 1.1, 12, 17, 2) - 0.45));
        if (g > 0.85) D.put(x, y, '▒', tone.lit);
        else if (g > 0.68) D.put(x, y, '░', tone.lit);
        else if (g > 0.5) D.put(x, y, '░', tone.mid);
        else if (g > 0.3) D.put(x, y, '·', tone.mid);
      }
      for (const c of S.plate) {
        const heat = p * Math.max(0, 1 - c.d / 2.5) * 0.3;
        ramp(D, c.x, c.y, fbmWrapped(c.x * 0.6, c.y * 0.6 + t * 0.2, 12, 41, 3) + heat - 0.04, tone);
      }
      fill(D, S.ore, tone, t, { seed: 43, fx: 0.7, fy: 0.5, vx: 0.06, boost: -0.02 });
      // The radiators: a fin every other column, the row by the furnace warmer, all of them with its pulse.
      for (const f of S.fins) if (f.x % 2 === 0) D.put(f.x, f.y, '┊', tint(DIM, tone.lit, p * (f.near ? 0.8 : 0.45)));
      for (const [x, y] of S.throat) D.put(x, y, p > 0.7 ? '▒' : '░', tint(tone.mid, tone.lit, p));
      // Ore on the truss, three lumps riding into the furnace.
      for (let k = 0; k < 3; k++) D.put(7 + ((t * 1.4 + k * 2.4) % 7), cy, '▪', tone.lit);
      // The plumes: puffs leave each bell in a straight line and open away from each other as they spread,
      // the lower one the upper's mirror.
      for (const [ny, side, ph] of NOZZLES) {
        for (let k = 0; k < 8; k++) {
          const f = (t * 0.22 + k / 8 + ph) % 1;
          D.put(31 + f * 10, ny + 1 + side * (f * f * 2.4 + Math.sin(f * 7 + k * 2.1) * f * 0.8),
            f < 0.2 ? 'o' : f < 0.5 ? '°' : '·', f < 0.12 ? tint(tone.lit, DIM, f / 0.12) : DIM, (1 - f) * 0.9);
        }
      }
    },
  };
}

// ---- 4. GREENHOUSE -----------------------------------------------------------------------

// Reworked 2026-09-30 (SX: «все таки это космические объекты а нарисованы так будто они на земле стоят»): not a
// dome on a slab but a whole glass sphere, with a belt of docking bays round its middle and a lamp at each pole.
function greenhouse() {
  const W = 41, H = 19, cx = 20, cy = 9, R = 8.2;
  return {
    key: 'greenhouse', name: 'GREENHOUSE', hue: '#72A843', W, H,
    idea: 'A whole glass sphere with a belt of docking bays round its middle; each pane has its own weather.',
    moves: 'clouds drift under every pane at their own pace; two lights run out along the belt to the bays; the pole lamps blink in turn',
    build(L) {
      const globe = shape(W, H, inDisc(cx, cy, R));
      stroke(L, globe, MAT);
      // The belt across the middle, a bay at each end.
      L.hline(3, 37, cy - 1, MAT); L.hline(3, 37, cy + 1, MAT);
      L.box(0, cy - 2, 4, 5, MAT); L.box(37, cy - 2, 4, 5, MAT);
      const inner = new Set(globe.inner.map(([x, y]) => x + ',' + y)), taken = new Set();
      const inBelt = (y) => y >= cy - 1 && y <= cy + 1;
      // Mullions every five columns, and a dashed ring across each half.
      for (let k = -2; k <= 2; k++) for (let y = 0; y < H; y++) {
        const x = cx + k * 5;
        if (!inner.has(x + ',' + y) || inBelt(y) || L.at(x, y) !== null) continue;
        L.put(x, y, '│', STR, 0.9); taken.add(x + ',' + y);
      }
      for (const y of [cy - 5, cy + 5]) for (const [x, yy] of globe.inner) {
        if (yy === y && !taken.has(x + ',' + y) && L.at(x, y) === null) { L.put(x, y, '┄', STR, 0.5); taken.add(x + ',' + y); }
      }
      const panes = globe.inner.filter(([x, y]) => !taken.has(x + ',' + y) && !inBelt(y) && L.at(x, y) === null)
        .map(([x, y]) => [x, y, Math.floor((x - cx + 2.5) / 5) + (y > cy ? 7 : 0)]);
      const belt = [];
      for (let x = 4; x <= 36; x++) if (L.at(x, cy) === null) belt.push(x);
      return { panes, belt };
    },
    frame(D, S, tone, t) {
      for (const [x, y, p] of S.panes) {
        ramp(D, x, y, fbmWrapped(x * 0.34 + t * 0.22 + p * 4.1, y * 0.6 - t * 0.04 + p * 2.3, 12, 71, 3), tone, true);
      }
      for (const x of S.belt) if (x % 2 === 0) D.put(x, cy, '·', DIM);
      const f = (t * 0.32) % 1, dx = Math.round(f * 17);
      D.put(cx - dx, cy, '•', HI); D.put(cx + dx, cy, '•', HI);
      const docked = f > 0.88;
      for (const x of [1, 2, 38, 39]) D.put(x, cy, docked ? 'o' : '·', docked ? HI : DIM);
      const top = (t % 3) < 0.4, bottom = ((t + 1.5) % 3) < 0.4;
      D.put(cx, 0, top ? 'o' : '·', top ? HI : DIM);
      D.put(cx, H - 1, bottom ? 'o' : '·', bottom ? HI : DIM);
    },
  };
}

// ---- 5. BEACON ---------------------------------------------------------------------------

function beacon() {
  const W = 35, H = 22, lx = 17, ly = 4.5, reach = 9.5;
  return {
    key: 'beacon', name: 'BEACON', hue: '#A6DED6', W, H,
    idea: 'A lighthouse on a pad. It exists to be seen from far off, so most of its picture is the light.',
    moves: 'the beam sweeps round with a fading wake; the mast breathes a signal as the game\'s signals do; floodlights alternate',
    build(L) {
      L.box(14, 3, 7, 4, MAT); L.hline(13, 21, 7, MAT); L.vline(lx, 1, 3, MAT);
      // An A-frame: each leg steps one column out per row; two braces across.
      const xl = (y) => 15 - (y - 8), xr = (y) => 19 + (y - 8);
      for (let y = 8; y <= 16; y++) { L.put(xl(y), y, '╱', MAT); L.put(xr(y), y, '╲', MAT); }
      for (const y of [11, 14]) for (let x = xl(y) + 1; x < xr(y); x++) L.put(x, y, '─', MAT);
      L.box(6, 17, 23, 5, MAT);
      L.put(16, 5, '·', DIM); L.put(18, 5, '·', DIM);
      const pad = [];
      for (let y = 18; y <= 20; y++) for (let x = 7; x <= 27; x++) pad.push([x, y]);
      return { pad };
    },
    frame(D, S, tone, t) {
      fill(D, S.pad, tone, t, { seed: 91, fx: 0.4, fy: 0.9, vx: 0.2, boost: -0.06 });
      const theta = t * 0.8;
      // The beam is a line of glyphs along its own direction that thins to dots; behind it, a fading wake.
      const ray = (th, alpha, step) => {
        const cs = Math.cos(th), sn = Math.sin(th * 1) * 0.28, g = dirGlyph(cs, sn);
        for (let s = 0.14; s <= 1.001; s += step) {
          const x = Math.round(lx + cs * s * reach / A), y = Math.round(ly + sn * s * reach);
          if (x >= 13 && x <= 21 && y >= 1 && y <= 7) continue;
          D.put(x, y, s < 0.62 ? g : '·', s < 0.3 ? HI : tone.lit, alpha * (1 - 0.5 * s));
        }
      };
      for (const dir of [0, Math.PI]) {
        ray(theta + dir, 1, 0.045);
        for (let k = 1; k <= 6; k++) ray(theta + dir - k * 0.11, (1 - k / 7) * 0.5, 0.09);
      }
      const flash = Math.abs(Math.sin(theta)) > 0.85;
      D.put(lx, 4, flash ? '◆' : '◇', flash ? HI : tone.lit);
      D.put(lx, 0, '◦', tone.lit);
      for (let k = 0; k < 2; k++) {
        const f = (t * 0.55 + k * 0.5) % 1, gap = 0.9 + f * 2.2;
        D.put(lx - gap, 0, '(', tone.lit, 0.85 * (1 - f)); D.put(lx + gap, 0, ')', tone.lit, 0.85 * (1 - f));
      }
      const alt = Math.floor(t * 1.4) % 2 === 0;
      D.put(7, 16, 'o', alt ? HI : DIM); D.put(27, 16, 'o', alt ? DIM : HI);
    },
  };
}

// ---- 6. LATTICE --------------------------------------------------------------------------

function lattice() {
  const W = 41, H = 21, cx = 20, cy = 10;
  return {
    key: 'lattice', name: 'LATTICE', hue: '#C79BC8', W, H,
    idea: 'A cross of trusses around a hub: all struts and joints, with the fills kept to the tips and the hub.',
    moves: 'a wave of light runs out along the struts from the hub, joint by joint; the core pulses',
    build(L) {
      const fillCells = [];
      const flip = (c) => (c === '╲' ? '╱' : c === '╱' ? '╲' : c);
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? 0 : 24, x1 = side < 0 ? 16 : 40;
        L.hline(x0, x1, 8, MAT); L.hline(x0, x1, 12, MAT);
        for (let x = x0; x <= x1; x += 4) L.vline(x, 8, 12, MAT);
        for (let k = 0; k < 4; k++) {
          const bx = x0 + 4 * k + 1;
          if (k === (side < 0 ? 0 : 3)) { for (let y = 9; y <= 11; y++) for (let x = bx; x <= bx + 2; x++) fillCells.push([x, y]); continue; }
          L.put(bx, 9, '╲', MAT); L.put(bx + 2, 9, '╱', MAT); L.put(bx + 1, 10, '╳', MAT);
          L.put(bx, 11, '╱', MAT); L.put(bx + 2, 11, '╲', MAT);
        }
      }
      for (const [y0, y1, mirror] of [[0, 6, false], [14, 20, true]]) {
        const my = (y) => (mirror ? 20 - y : y);
        L.vline(17, y0, y1, MAT); L.vline(23, y0, y1, MAT);
        L.hline(17, 23, my(0), MAT); L.hline(17, 23, my(3), MAT);
        const put = (x, y, c) => L.put(x, my(y), mirror ? flip(c) : c, MAT);
        put(19, 4, '╱'); put(21, 4, '╲'); put(18, 5, '╱'); put(22, 5, '╲');
        for (let x = 18; x <= 22; x++) fillCells.push([x, my(1)], [x, my(2)]);
      }
      L.box(16, 6, 9, 9, MAT); L.box(18, 8, 5, 5, STR);
      for (let x = 17; x <= 23; x++) { fillCells.push([x, 7], [x, 13]); }
      for (let y = 8; y <= 12; y++) fillCells.push([17, y], [23, y]);
      // Every stroke of the arms, with its distance from the hub, so the wave can colour it.
      const arms = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = L.at(x, y);
        if (c === null) continue;
        const inArm = ((x <= 15 || x >= 25) && y >= 8 && y <= 12) || (x >= 17 && x <= 23 && (y <= 5 || y >= 15));
        if (inArm) arms.push({ x, y, c, d: Math.hypot((x - cx) * A, y - cy), node: '┼┬┴├┤┌┐└┘'.includes(c) });
      }
      return { arms, fill: fillCells.filter(([x, y]) => L.at(x, y) === null) };
    },
    frame(D, S, tone, t) {
      fill(D, S.fill, tone, t, { seed: 61, fx: 0.5, fy: 0.7, vx: 0.3, vy: 0.2, boost: 0.05 });
      const front = (t * 3.4) % 16;
      for (const a of S.arms) {
        const i = front >= a.d ? Math.max(0, 1 - (front - a.d) / 3.2) : 0;
        if (i < 0.1) continue;
        if (a.node && i > 0.72) D.put(a.x, a.y, '◆', HI);
        else D.put(a.x, a.y, a.c, tint(MAT, tone.lit, i));
      }
      const beat = 0.5 + 0.5 * Math.sin(t * 2.2);
      D.put(cx, cy, beat > 0.5 ? '◆' : '◇', beat > 0.5 ? HI : tone.lit);
    },
  };
}

// ---- 7. WHEEL ----------------------------------------------------------------------------

function wheel() {
  const W = 35, H = 21, cx = 17, cy = 10, spinRate = 0.16;
  return {
    key: 'wheel', name: 'WHEEL', hue: '#D0898C', W, H,
    idea: 'The classic turning wheel: a rim of cabins on six spokes round a still hub.',
    moves: 'spokes and cabins turn together and the rim\'s texture turns with them; port lights step round the rim',
    build(L) {
      const rim = shape(W, H, (x, y) => inDisc(cx, cy, 9.8)(x, y) && !inDisc(cx, cy, 6.6)(x, y));
      const hub = shape(W, H, inDisc(cx, cy, 2.5));
      stroke(L, rim, MAT); stroke(L, hub, MAT);
      return {
        rim: rim.inner.map(([x, y]) => ({ x, y, phi: Math.atan2(y - cy, (x - cx) * A), rho: Math.hypot((x - cx) * A, y - cy) })),
      };
    },
    frame(D, S, tone, t) {
      const w = t * spinRate;
      for (const c of S.rim) {
        ramp(D, c.x, c.y, fbmWrapped(((c.phi - w) / TAU + 0.5) * 12, (c.rho - 6.6) * 0.9, 12, 55, 3), tone, true);
      }
      for (let k = 0; k < 6; k++) {
        const a = w + k * TAU / 6, cs = Math.cos(a), sn = Math.sin(a), g = dirGlyph(cs, sn);
        const stepR = 1 / Math.max(Math.abs(cs) / A, Math.abs(sn));       // one cell along the long axis
        for (let r = 2.8; r <= 6.5; r += stepR) D.put(cx + cs * r / A, cy + sn * r, g, STR);
        D.put(cx + cs * 8.2 / A, cy + sn * 8.2, '▪', HI);
        D.put(cx + Math.cos(a + 0.09) * 8.2 / A, cy + Math.sin(a + 0.09) * 8.2, '·', tone.lit);
        D.put(cx + Math.cos(a - 0.09) * 8.2 / A, cy + Math.sin(a - 0.09) * 8.2, '·', tone.lit);
      }
      D.put(cx, cy, Math.floor(t * 2) % 2 ? '◆' : '◇', Math.floor(t * 2) % 2 ? HI : tone.lit);
      const step = Math.floor(t * 1.3) % 4;
      [[cx, 0], [34, cy], [cx, 20], [0, cy]].forEach(([x, y], k) => D.put(x, y, step === k ? 'o' : '·', step === k ? HI : DIM));
    },
  };
}

// ---- 8. HIVE -----------------------------------------------------------------------------

function hive() {
  const W = 35, H = 21, R = 3.35;
  const centers = [[17, 10], [29, 10], [23, 16], [11, 16], [5, 10], [11, 4], [23, 4]];
  const tour = [0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0], leg = 1.7;
  return {
    key: 'hive', name: 'HIVE', hue: '#D2A868', W, H,
    idea: 'Seven cells packed like a honeycomb; every cell is a small planet with its own weather.',
    moves: 'each cell breathes on its own beat (its land swells and lights up); a drone shuttles between cells',
    build(L) {
      const cells = centers.map(([cx, cy], k) => {
        const sh = shape(W, H, inDisc(cx, cy, R));
        stroke(L, sh, MAT);
        return { cx, cy, k, inner: sh.inner };
      });
      L.edge(23, 1, 1, MAT);
      centers.forEach(([x0, y0], i) => centers.forEach(([x1, y1], j) => {
        if (j <= i || Math.hypot((x1 - x0) * A, y1 - y0) > 7.6) return;
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
      D.put(23, 0, on ? 'o' : '·', on ? HI : DIM);
      const pos = (tt) => {
        const u = ((tt / leg) % tour.length + tour.length) % tour.length, i = Math.floor(u), f = smooth(u - i);
        const a = centers[tour[i]], b = centers[tour[(i + 1) % tour.length]];
        return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
      };
      [0.5, 0.25].forEach((back, k) => { const [x, y] = pos(t - back); D.put(x, y, '·', HI, 0.6 - k * 0.25); });
      const [dx, dy] = pos(t);
      D.put(dx, dy, '•', HI);
    },
  };
}

// ---- 9. DEPOT ----------------------------------------------------------------------------

function depot() {
  const W = 42, H = 19, xa = 17, xb = 33, half = 15;
  // A crate 7 x 5. Seated on the lower stack its bottom corners join that stack's walls; hanging, they are corners.
  const crate = (D, x, y, ink, tone, seed, t, seated) => {
    D.put(x, y, '┌', ink); D.put(x + 6, y, '┐', ink);
    D.put(x, y + 4, seated ? '├' : '└', ink); D.put(x + 6, y + 4, seated ? '┤' : '┘', ink);
    for (let i = 1; i < 6; i++) { D.put(x + i, y, '─', ink); D.put(x + i, y + 4, '─', ink); }
    for (let j = 1; j < 4; j++) { D.put(x, y + j, '│', ink); D.put(x + 6, y + j, '│', ink); }
    for (let j = 1; j < 4; j++) for (let i = 1; i < 6; i++) D.put(x + i, y + j, ' ', ink);
    for (let j = 1; j < 4; j++) for (let i = 1; i < 6; i++) ramp(D, x + i, y + j, fbmWrapped((x + i) * 0.5, (y + j) * 0.7 + t * 0.2, 12, seed, 3), tone);
  };
  return {
    key: 'depot', name: 'DEPOT', hue: '#B0B86C', W, H,
    idea: 'A cargo yard: stacked crates under a gantry crane, a belt along the floor.',
    moves: 'the crane lifts a crate from one stack and sets it on the other (and back); pods slide along the belt; crane lights alternate',
    build(L, tone) {
      L.box(0, 16, 42, 3, MAT);
      L.box(1, 1, 40, 3, MAT);
      for (const x0 of [1, 37]) { L.box(x0, 3, 4, 14, MAT); for (const y of [6, 9, 12]) L.hline(x0, x0 + 3, y, MAT); }
      for (let x = 2; x <= 39; x++) if (L.at(x, 2) === null) L.put(x, 2, '╌', DIM);
      for (const bx of [6, 14, 22, 30]) L.box(bx, 12, 7, 5, STR);
      L.box(22, 8, 7, 5, STR);
      const ground = [];
      for (const bx of [6, 14, 22, 30]) for (let j = 13; j <= 15; j++) for (let i = 1; i <= 5; i++) ground.push([bx + i, j]);
      for (let j = 9; j <= 11; j++) for (let i = 1; i <= 5; i++) ground.push([22 + i, j]);
      for (let x = 1; x < 41; x += 2) L.put(x, 17, '·', DIM);
      return { ground };
    },
    frame(D, S, tone, t) {
      fill(D, S.ground, tone, t, { seed: 19, fx: 0.5, fy: 0.7, vx: 0.05, boost: -0.02 });
      const k = Math.floor(t / half), s = t - k * half, from = k % 2 === 0 ? xa : xb, to = k % 2 === 0 ? xb : xa;
      const tx = lerp(from, to, smooth((s - 5) / 4));
      const hy = 4 + 3 * (smooth((s - 1) / 2) - smooth((s - 3) / 2) + smooth((s - 9) / 2) - smooth((s - 11) / 2));
      const carrying = s >= 3 && s < 11;
      const slotAt = (cx0) => cx0 - 3;
      for (const cx0 of [xa, xb]) {
        const here = carrying ? false : (s < 3 ? cx0 === from : cx0 === to);
        if (here) crate(D, slotAt(cx0), 8, STR, tone, cx0, t, true);
        else for (const [dx, c] of [[0, '┌'], [6, '┐']]) D.put(slotAt(cx0) + dx, 8, c, DIM);
      }
      if (carrying) crate(D, Math.round(tx) - 3, Math.round(hy) + 1, HI, tone, 7, t, false);
      const ty = Math.round(hy);
      for (let y = 4; y < ty; y++) D.put(tx, y, '│', MAT);
      D.put(tx, ty, '┴', HI);
      D.put(tx - 1, 2, '▐', HI); D.put(tx, 2, '▪', HI); D.put(tx + 1, 2, '▌', HI);
      for (let i = 0; i < 5; i++) {
        const px = (t * 2.2 + i * 9) % 42;
        if (px < 2 || px > 39) continue;
        D.put(px - 1, 17, '[', MAT); D.put(px, 17, '▪', tone.lit); D.put(px + 1, 17, ']', MAT);
      }
      const alt = Math.floor(t * 1.4) % 2 === 0;
      D.put(2, 0, 'o', alt ? HI : DIM); D.put(39, 0, 'o', alt ? DIM : HI);
    },
  };
}

// ---- 10. ARRAY ---------------------------------------------------------------------------

function array() {
  const W = 41, H = 19, px = 20, py = 4;
  const panels = [[0, 3], [8, 3], [26, 3], [34, 3]];
  return {
    key: 'array', name: 'ARRAY', hue: '#86B4D6', W, H,
    idea: 'A small bus between four solar panels, a radar dish on a mast, a dock underneath.',
    moves: 'the dish swings and pings; a glint crosses the panels one after another; dock lights step',
    build(L) {
      L.box(17, 7, 7, 7, MAT); L.box(18, 13, 5, 5, MAT);
      L.vline(px, 5, 7, MAT);
      const groups = [];
      panels.forEach(([x0, y0], pi) => {
        L.box(x0, y0, 7, 15, MAT);
        for (const y of [y0 + 5, y0 + 10]) L.hline(x0, x0 + 6, y, MAT);
        [[y0 + 1, y0 + 4], [y0 + 6, y0 + 9], [y0 + 11, y0 + 13]].forEach(([a, b], gi) => {
          const cells = [];
          for (let y = a; y <= b; y++) for (let x = x0 + 1; x <= x0 + 5; x++) cells.push([x, y]);
          groups.push({ cells, seed: 200 + pi * 7 + gi });
        });
      });
      L.hline(6, 8, 10, MAT); L.hline(14, 17, 10, MAT); L.hline(23, 26, 10, MAT); L.hline(32, 34, 10, MAT);
      return { groups };
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
      // The dish: a short line through the pivot, swinging; the ping runs out along its normal.
      // Five cells along the dish's own line, a feed point one cell out along its normal.
      const al = 0.9 * Math.sin(t * 0.7), cs = Math.cos(al), sn = Math.sin(al);
      const k = 1 / Math.max(Math.abs(cs) / A, Math.abs(sn));
      for (const m of [-2, -1, 0, 1, 2]) D.put(px + cs * k * m / A, py + sn * k * m, dirGlyph(cs, sn), HI);
      const nx = Math.sin(al), ny = -Math.cos(al), p0 = (t * 6) % 8;
      D.put(px + nx * 1.9 / A, py + ny * 1.9, '•', tone.lit);
      for (let s = 2.4; s <= 8; s += 0.55) {
        const a = Math.exp(-Math.abs(s - p0) * 0.7);
        D.put(px + nx * s / A, py + ny * s, '·', tone.lit, 0.15 + 0.85 * a);
      }
      D.put(px, 10, Math.floor(t * 2) % 2 ? '◆' : '◇', Math.floor(t * 2) % 2 ? HI : tone.lit);
      const step = Math.floor(t * 1.6) % 4;
      [19, 21].forEach((x, k) => D.put(x, 16, step === k ? '•' : '·', step === k ? HI : DIM));
    },
  };
}

// ---- 11. SPIRE ---------------------------------------------------------------------------

// Reworked 2026-09-30 (SX: «все таки это космические объекты а нарисованы так будто они на земле стоят»): the
// stepped tower stood on its widest tier like a building. Now it widens to its middle and narrows again, the same
// above and below, with a docking arm to each side of the middle and a mast at each tip.
function spire() {
  const W = 23, H = 22, cx = 11;
  const tiers = [[9, 2, 5, 4], [7, 5, 9, 4], [4, 8, 15, 6], [7, 13, 9, 4], [9, 16, 5, 4]];
  // The ledge lights, the middle's first, then outward to both tips.
  const ranks = [[[4, 8], [18, 8], [4, 13], [18, 13]], [[7, 5], [15, 5], [7, 16], [15, 16]], [[9, 2], [13, 2], [9, 19], [13, 19]]];
  return {
    key: 'spire', name: 'SPIRE', hue: '#A99BE0', W, H,
    idea: 'A spire with no bottom: tiers widening to the middle and narrowing again, a lift through its length, an arm to each side, a mast at each tip.',
    moves: 'a lift car runs the whole shaft; the ledge lights run out from the middle to both tips; the arms\' lights step; the tips breathe a signal in turn',
    build(L) {
      for (const [x, y, w, h] of tiers) L.box(x, y, w, h, MAT);
      L.box(0, 9, 5, 4, MAT); L.box(18, 9, 5, 4, MAT);
      L.vline(cx, 1, 2, MAT); L.vline(cx, H - 3, H - 2, MAT);
      const cells = [];
      for (const [x, y, w, h] of tiers) {
        for (let j = y + 1; j < y + h - 1; j++) for (let i = x + 1; i < x + w - 1; i++) {
          if (i >= 10 && i <= 12) { if (i !== 11 && L.at(i, j) === null) L.put(i, j, '┊', DIM); continue; }
          if (L.at(i, j) === null) cells.push([i, j]);
        }
      }
      return { cells };
    },
    frame(D, S, tone, t) {
      fill(D, S.cells, tone, t, { seed: 131, fx: 0.55, fy: 0.8, vx: 0.18, boost: -0.02 });
      const u = (t / 8) % 2, car = 3 + (u < 1 ? u : 2 - u) * 15;
      D.put(cx, car, '▪', HI);
      const rank = Math.floor(t * 2.2) % 5;
      ranks.forEach((cells, k) => cells.forEach(([x, y]) => D.put(x, y, rank === k ? 'o' : '·', rank === k ? HI : DIM)));
      const step = Math.floor(t * 1.6) % 3;
      for (const [x0, dir] of [[1, 1], [21, -1]]) for (let k = 0; k < 3; k++) {
        for (const y of [10, 11]) D.put(x0 + dir * k, y, step === k ? '•' : '·', step === k ? HI : DIM);
      }
      for (const [y, ph] of [[0, 0], [H - 1, 0.5]]) {
        D.put(cx, y, '◦', tone.lit);
        const f = (t * 0.55 + ph) % 1, gap = 0.9 + f * 2.2;
        D.put(cx - gap, y, '(', tone.lit, 0.85 * (1 - f)); D.put(cx + gap, y, ')', tone.lit, 0.85 * (1 - f));
      }
    },
  };
}

// ---- 12. ANCHOR --------------------------------------------------------------------------

function anchor() {
  const W = 27, H = 22, cx = 13, cyc = 15;
  const flukes = { 11: [3, 3], 12: [2, 4], 13: [1, 5], 14: [1, 5] };
  const inFluke = (x, y) => { for (const xx of [x, 26 - x]) { const r = flukes[y]; if (r && xx >= r[0] && xx <= r[1]) return true; } return false; };
  const lines = [[8, 2, 3, 6, 0], [18, 2, 23, 6, 2.1]];              // the two mooring lines: ring to stock end
  return {
    key: 'anchor', name: 'ANCHOR', hue: '#47C2BE', W, H,
    idea: 'A mooring station in the shape of an anchor: ring, lines, shank, and a curved crown of berths.',
    moves: 'both mooring lines sway; a light travels the crown from fluke to fluke; a lift rides the shank; berth lights alternate',
    build(L) {
      L.box(9, 0, 9, 4, MAT, true);
      L.box(11, 3, 5, 17, MAT); L.hline(4, 22, 8, MAT); L.box(2, 7, 3, 3, MAT); L.box(22, 7, 3, 3, MAT);
      for (const y of [12, 16]) L.hline(11, 15, y, MAT);
      const co = inEll(cx, cyc, 7.4, 6.2), ci = inEll(cx, cyc, 5.2, 3.6);
      const crown = shape(W, H, (x, y) => (y >= cyc && co(x, y) && !ci(x, y)) || inFluke(x, y));
      stroke(L, crown, STR);
      return {
        crown: crown.inner.map(([x, y]) => ({ x, y, phi: Math.atan2(y - cyc, (x - cx) * A), rho: Math.hypot((x - cx) * A, y - cyc) })),
        shank: [5, 6, 9, 10, 11, 13, 14, 15, 17, 18].flatMap((y) => [[12, y], [13, y], [14, y]]),
      };
    },
    frame(D, S, tone, t) {
      const head = Math.PI * (0.5 + 0.5 * Math.sin(t * 0.55));
      for (const c of S.crown) {
        const d = Math.abs(c.phi - head);
        if (d < 0.14) { D.put(c.x, c.y, '•', HI); continue; }
        if (d < 0.7) { D.put(c.x, c.y, '·', tone.lit, 1 - d / 0.7 * 0.8); continue; }
        ramp(D, c.x, c.y, fbmWrapped(c.phi / Math.PI * 6 + t * 0.4, c.rho * 0.8, 12, 151, 3), tone);
      }
      for (const [x, y] of S.shank) ramp(D, x, y, fbmWrapped(x * 0.7, y * 0.4 + t * 0.3, 12, 161, 3) - 0.04, tone);
      const u = (t / 5) % 2, lift = 5 + (u < 1 ? u : 2 - u) * 13;
      D.put(cx, lift, '▪', HI);
      // A mooring line is a dotted curve with a heavier link now and then; it sags and sways.
      for (const [x0, y0, x1, y1, ph] of lines) {
        for (let i = 1; i < 12; i++) {
          const s = i / 12, sag = Math.sin(Math.PI * s) * (1.1 + 0.5 * Math.sin(t * 1.1 + ph));
          D.put(lerp(x0, x1, s), lerp(y0, y1, s) + sag, i % 3 === 0 ? 'o' : '·', MAT, i % 3 === 0 ? 1 : 0.8);
        }
      }
      const alt = Math.floor(t * 1.4) % 2 === 0;
      D.put(3, 10, 'o', alt ? HI : DIM); D.put(23, 10, 'o', alt ? DIM : HI);
    },
  };
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

// Draws one station centred at (ox, oy), each cell `sc` times the game's glyph size.
export function paintStation(r, st, t, ox, oy, sc) {
  const { W, H } = st, w = r.cellW * sc, h = r.cellH * sc;
  stationCells(st, t, (x, y, c, ink, alpha) => r.glyph(c, ox + (x - (W - 1) / 2) * w, oy + (y - (H - 1) / 2) * h, ink, alpha, sc));
}

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
