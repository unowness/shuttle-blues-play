// The game's colour grade (SX, 2026-10-01, from the palette report: «вот как стоит переписать цвета в игре»;
// codex/reports/palette/PALETTE_HANDOFF_FOR_CLAUDE.md). SX chose, on the report's sliders: gamma 0.95, OKLCH
// lightness -0.5 points, chroma 95 %, hue -2.5 degrees. Exact black is never changed.
//
// It is applied once, at the end: every colour a frame is drawn in passes through `grade` as it is handed
// to the canvas (installGrade), after the roles, materials, paints and procedural mixes have resolved it
// from the colours written in the source, and before alpha and the CRT filter. The source keeps its own
// colours, so everything that compares them (the role and paint sets, the planets' ramps, dimToContrast,
// the checks) reads what it always did; the souvenirs' art is graded the same way, its inks handed to canvases of
// its own with the grade installed (src/souvenirArt.js). The transform is the report's, to the digit:
//
//   OKLCH: L - 0.005, C * 0.95, h - 2.5 deg, L clamped to [0, 1]
//   back to sRGB, clamped to the gamut, quantized to 8-bit HEX
//   each encoded channel / 255 raised to 1 / 0.95, rounded to 8-bit HEX
//
// checks/grade.mjs holds all 196 of the report's finite anchors to their final HEX.

export const GRADE = Object.freeze({ gamma: 0.95, lightness: -0.5, chroma: 95, hue: -2.5 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const encode = (values) => '#' + values.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

export function oklch(h) {
  const [r, g, b] = rgb(h).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  return [L, C, C < 0.0001 ? null : (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}

export function fromLch(L, C, H) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + lin.map((v) => {
    v = clamp(v, 0, 1);
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)).toString(16).padStart(2, '0');
  }).join('').toUpperCase();
}

// One six-digit HEX through the grade (upper case in, upper case out).
export function gradeHex(hex, p = GRADE) {
  const h = hex.toUpperCase();
  if (h === '#000000') return h;
  const [L, C, H] = oklch(h);
  const converted = fromLch(clamp(L + p.lightness / 100, 0, 1), C * p.chroma / 100, (H ?? 0) + p.hue);
  return encode(rgb(converted).map((c) => c ** (1 / p.gamma)));
}

const toHex2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

// The pilot's worn look (INTERFACE_LOOKS_HANDOFF.md, SX 2026-10-02: the interface colours as collectibles). `look` is a look's
// function of one HEX (src/looks.js hands it over, built from src/filmGrade.js; its `.keep` is the art
// treatment), or null: ORIGINAL, the grade above to the digit. `gradeHex` stays that grade and nothing else: the looks are
// made over it. Changing the look empties the caches below and moves `epoch`, which what holds graded pixels (a souvenir's
// art, the garage room's layers) reads to draw itself again.
let look = null;
let epoch = 0;
export const gradeEpoch = () => epoch;

// The kept layer: what a look only filters and never repaints (the notices and plates, the quest list, the pointers, the
// pilot's ship). Told apart by where it is drawn, not by its colours: the drawing code sets the layer round those calls
// (`keptDraw`), the renderer reads it for its glyph buckets' keys (a glyph is coloured when it is flushed, not when it is
// queued) and sets it again as it flushes them (src/renderer.js), and the grade reads it here for every colour handed to
// the canvas meanwhile. One canvas, one layer at a time: it lives here, not on a renderer, so a painter's own adapter
// of the renderer (inkRenderer) cannot lose it. Under ORIGINAL it changes nothing.
let kept = 0;
export const gradeKept = () => kept;
export function setGradeKept(on) { kept = on ? 1 : 0; }
// The layer on, and the one it found back after.
export function keepBegin() { const was = kept; kept = 1; return was; }
export function keepEnd(was) { kept = was; }
// `draw(...)` run in the kept layer.
export function keptDraw(draw) {
  return function inKeptLayer(...args) {
    const was = keepBegin();
    try { return draw.apply(this, args); } finally { keepEnd(was); }
  };
}

// The final layer (src/frames.js; SX, 2026-10-09, the windows' frames and rules in grays of their own): what is drawn in it is the ink
// to be seen already, and goes to the canvas as it is, whatever look is worn. `draw()` run in it, the layer put back after.
let final = 0;
export function finalDraw(draw) {
  const was = final;
  final = 1;
  try { return draw(); } finally { final = was; }
}
// Whether a look is worn (ORIGINAL wears none: the grade above, to the digit), and one ink as the worn look paints the interface.
export const lookWorn = () => look !== null;
// The worn look's function itself (null under ORIGINAL), for what it carries besides inks: src/frames.js reads its `frames` and `frameHue`.
export const wornLook = () => look;
export const wornInk = (hex) => (look ? look(hex) : gradeHex(hex));

const cache = new Map(), keptCache = new Map();
export function setGradeLook(fn) {
  look = typeof fn === 'function' ? fn : null;
  cache.clear(); keptCache.clear();
  epoch += 1;
}
const inkOf = (hex) => (look ? (kept ? look.keep ?? look : look)(hex) : gradeHex(hex));

// Any CSS colour the game hands the canvas: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(), graded with its
// alpha kept; anything else (a gradient, a pattern, a colour name) passes through as it is. Cached: a frame
// sets a few hundred colours out of a few hundred distinct ones.
export function grade(color) {
  if (typeof color !== 'string' || final) return color;
  const store = look && kept ? keptCache : cache;
  let out = store.get(color);
  if (out !== undefined) return out;
  out = color;
  const c = color.trim();
  let m;
  if ((m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c))) {
    let d = m[1];
    if (d.length <= 4) d = [...d].map((x) => x + x).join('');
    const g = inkOf('#' + d.slice(0, 6));
    out = d.length === 8 ? g + d.slice(6).toUpperCase() : g;
  } else if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i.exec(c))) {
    const g = inkOf('#' + [m[1], m[2], m[3]].map(Number).map(toHex2).join(''));
    const [r, gg, b] = rgb(g).map((v) => Math.round(v * 255));
    out = m[4] === undefined ? `rgb(${r}, ${gg}, ${b})` : `rgba(${r}, ${gg}, ${b}, ${m[4]})`;
  }
  if (store.size > 4096) store.clear();
  store.set(color, out);
  return out;
}

// Every colour set on this 2D context from now on is graded as it is set: fill, stroke and shadow. Reading
// the property back gives what the canvas holds (the graded colour), as a canvas always normalizes it. Once
// per context; the CRT filter's own veil is drawn on its own canvas and is not graded.
export function installGrade(ctx) {
  if (!ctx || ctx.__graded) return ctx;
  const proto = Object.getPrototypeOf(ctx);
  for (const key of ['fillStyle', 'strokeStyle', 'shadowColor']) {
    let owner = proto, desc = null;
    while (owner && !(desc = Object.getOwnPropertyDescriptor(owner, key))) owner = Object.getPrototypeOf(owner);
    if (!desc || !desc.set) continue;
    Object.defineProperty(ctx, key, {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, grade(v)); },
    });
  }
  Object.defineProperty(ctx, '__graded', { value: true });
  return ctx;
}

