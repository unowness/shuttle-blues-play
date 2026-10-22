import { tr } from './lang.js';

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// `text` cut to `cells` characters with an ellipsis (src/interface.js re-exports
// it: the windows and src/uiGrid.js both fit their lines). In the pilot's language: a line is fitted where it is laid out for the screen, so
// it is put into that language first (src/lang.js tr; in English the same string).
export const fitText = (text, cells) => {
  const chars = Array.from(String(tr(text)));
  return chars.length <= cells ? chars.join('') : chars.slice(0, Math.max(0, cells - 1)).join('') + '…';
};
export const lerp = (a, b, t) => a + (b - a) * t;
// An angle brought into [-PI, PI].
export const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Math.hypot(a, b) of two numbers, worked in the caller. V8 runs Math.hypot as a built-in call that boxes both numbers and its result,
// ~40 bytes of garbage a call, and the distances of a frame (every rock against the ship, the pirates against every rock, the
// shading of every rock's cell) asked it several thousand times (2026-10-09). This is V8's own sum for two numbers (src/builtins/math.tq:
// each over the larger, the squares added, the root times the larger), so the same double to the last bit in Chrome, held against
// Math.hypot by checks/steady-garbage.mjs; another engine's Math.hypot may differ from it in the last bit, and nothing the game
// decides rests on that bit. Zero, infinite and NaN go to the built-in, which has the answers (a distance of exactly 0 is rare).
export function hypot2(a, b) {
  const x = a < 0 ? -a : a, y = b < 0 ? -b : b, m = x > y ? x : y;
  if (!(m > 0 && m < Infinity)) return Math.hypot(a, b);
  const p = x / m, q = y / m;
  return Math.sqrt(p * p + q * q) * m;
}
// Quick, then slow: the cubic ease out of 0..1.
export const easeOut = (u) => 1 - (1 - u) ** 3;
// Quick, then slow, gentler than the cubic: the quadratic ease out of 0..1 (the danger taper's, src/ship.js).
export const easeOutQuad = (u) => { const k = 1 - u; return 1 - k * k; };
// Slow, quick, slow over 0..1, clamped to it.
export const smoothstep = (u) => { const k = clamp(u, 0, 1); return k * k * (3 - 2 * k); };
// A critically damped follow: `s.x` goes after `target` with its velocity `s.v` (units a second), at `omega` (1/s), without
// overshooting it, exact for any step; `maxRate` caps the velocity and so each step's travel (rate times `dt`). Changes `s` in place
// and returns it, so a follow kept in a thing's state makes nothing a frame (the rim's marks: src/rim.js).
export function followCritical(s, target, omega, dt, maxRate = Infinity) {
  if (!(dt > 0)) return s;
  const e = s.x - target, c = s.v + omega * e, decay = Math.exp(-omega * dt);
  let x = target + (e + c * dt) * decay, v = (c - omega * (e + c * dt)) * decay;
  const reach = maxRate * dt;
  if (x - s.x > reach) x = s.x + reach;
  else if (s.x - x > reach) x = s.x - reach;
  s.x = x;
  s.v = clamp(v, -maxRate, maxRate);
  return s;
}

// Perlin's smootherstep: 0 to 1 with no jolt at either end (its push, too, starts and ends at 0).
export const smootherstep = (u) => { const k = clamp(u, 0, 1); return k * k * k * (k * (6 * k - 15) + 10); };
// A string's characters as the screen counts them (a box glyph, an arrow is one).
export const glyphs = (s) => Array.from(String(s));
// How many glyphs (code points) a string holds, as glyphs(s).length says, without the array: a sign's caption is counted several times a frame.
export function glyphCount(s) {
  const text = String(s);
  let n = 0;
  for (let i = 0; i < text.length; i++, n++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) { const d = text.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) i++; }
  }
  return n;
}
// The middle of the pixel a coordinate falls in, where a 1 px line is crisp.
export const px = (v) => Math.round(v) + 0.5;
// The interface's boxes, { x, y, w, h } in px (chat H, 2026-10-04: six files had their own copy of the first). Whether (x, y) is in
// box `b`, its edges included; no box holds nothing.
export const inBox = (b, x, y) => !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
// A box's middle.
export const boxMiddle = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
// How much of box `b` lies inside `view` brought `m` px in from its edges, 0 to 1 (a window wholly on the screen is 1).
export function shownShare(view, b, m = 0) {
  const ix = Math.max(0, Math.min(b.x + b.w, view.x + view.w - m) - Math.max(b.x, view.x + m));
  const iy = Math.max(0, Math.min(b.y + b.h, view.y + view.h - m) - Math.max(b.y, view.y + m));
  return b.w > 0 && b.h > 0 ? (ix * iy) / (b.w * b.h) : 0;
}
// A number in [0, 1) from three integers, the same for the same three: the plates' and the deck's pieces' noise. These
// helpers had a copy in each file that used them until PLAN D2 (2026-10-04).
export function noise3(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// A draw in [a, b) from the stream `rng`. There is no bare rand() any more (PLAN D1, 2026-10-03): the one that read
// Math.random let a world's rocks, ship place and sparks escape its seed. Every draw names its stream (World.rng).
export const between = (rng, a, b) => a + rng() * (b - a);

// A fixed number in 0..1 for cell (x, y) of a drawing and a key `k`: a ruin is broken the same way on every frame and every visit
// (labs/graphics/world-art.js), and the boss comes apart in the same order every fight (labs/graphics/boss-art.js).
export function cellNoise(x, y, k) {
  let h = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(k, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A stable 32-bit number from a stable id (FNV-1a over its UTF-16 code units): the same id gives the same number on every visit and in
// every process. The one hash of an id; the rocks' outlines, the stations' float and drift, the runs, the caches' float, the broken NPC
// ships' cells and the world's named streams read it.
export function hashId(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Freezes `o` and every object and array under it, and returns it: what the page does to the tunables once the style has put its
// inks in (labs/graphics/main.js), so nothing writes one at run time; a write then throws, as a module's code is strict.
export function deepFreeze(o, seen = new Set()) {
  if (o === null || typeof o !== 'object' || seen.has(o)) return o;
  seen.add(o);
  Object.freeze(o);
  for (const v of Object.values(o)) deepFreeze(v, seen);
  return o;
}

// Deterministic RNG so a seeded field looks the same across reloads.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wrap v into [-size/2, size/2).
export function wrapCentered(v, size) {
  const half = size / 2;
  let x = (v + half) % size;
  if (x < 0) x += size;
  return x - half;
}

// Wrap v into [0, size).
export function wrapTo(v, size) {
  let x = v % size;
  if (x < 0) x += size;
  return x;
}

function hash3(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

// Value noise whose x axis wraps every `period` units. Used for planet
// longitude so the texture meets itself at the seam.
function wrapNoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const u = smooth(xf), v = smooth(yf);
  const a = hash3(x0, yi, seed),     b = hash3(x1, yi, seed);
  const c = hash3(x0, yi + 1, seed), d = hash3(x1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbmWrapped(x, y, period, seed, octaves = 3) {
  let sum = 0, amp = 0.5, norm = 0, p = period, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += amp * wrapNoise(fx, fy, p, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    fx *= 2; fy *= 2; p *= 2;
  }
  return sum / norm;
}

export function rampGlyph(ramp, t) {
  const i = clamp(Math.floor(t * ramp.length), 0, ramp.length - 1);
  return ramp[i];
}

// Mix two #rrggbb strings.
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

// WCAG relative luminance of a #rrggbb colour, 0 (black) to 1 (white).
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const linear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * linear((n >> 16) & 255) + 0.7152 * linear((n >> 8) & 255) + 0.0722 * linear(n & 255);
}

// WCAG contrast ratio of a colour on black, 1 to 21.
export function contrastOnBlack(hex) {
  return (luminance(hex) + 0.05) / 0.05;
}

// A colour dimmed towards black until it reads `ratio` to 1 on black; one that
// is already at or under it comes back as it is. Steps of tone are decided by
// contrast, not by a share of the colour: the same share is 14 to 1 for a pale
// mint and 7.3 to 1 for copper.
// Each answer is kept, by ratio and colour (the MODERN gauges ask it for every cube of every frame: 31 KB of garbage a frame, 2026-10-17);
// a long tail of colours never seen again empties the store.
const DIMMED = new Map();
let dimmedCount = 0;
export function dimToContrast(hex, ratio) {
  let byHex = DIMMED.get(ratio);
  const known = byHex?.get(hex);
  if (known !== undefined) return known;
  if (dimmedCount >= 512) { DIMMED.clear(); dimmedCount = 0; byHex = undefined; }
  if (!byHex) DIMMED.set(ratio, (byHex = new Map()));
  const dimmed = dimmedFresh(hex, ratio);
  byHex.set(hex, dimmed); dimmedCount++;
  return dimmed;
}
function dimmedFresh(hex, ratio) {
  if (contrastOnBlack(hex) <= ratio) return hex;
  let lo = 0, hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (contrastOnBlack(mixHex('#000000', hex, mid)) < ratio) lo = mid; else hi = mid;
  }
  return mixHex('#000000', hex, hi);
}
