// The per-effect profiler behind the lab's H (the effects audit of 2026-10-06, path #1: reports/2026-10-06-effects-render-audit.md
// sections 5.2 and 7). Each draw of the world (the stars, the fog, the planets, the stations, the clouds, the rocks, the sparks, the
// ship, ...), the world's flush, each group of the interface and the screen filter is a section: its time, and the canvas calls it
// made, summed over a window of WINDOW_MS and given per frame. The H panel shows the costliest sections beside the frame's split.
//
// Why calls as well as time: SX plays in Firefox, whose accelerated canvas records the calls in the page and replays them in the GPU
// process, so a section's JS time under-counts what it costs (the replay shows in the H panel's OUTSIDE); and Firefox's clock steps by
// a millisecond, so a section's time is only true as a mean over many frames (a section that starts at a random place between two
// ticks is read as long as it truly is, on average). The counts are exact.
//
//   G  glyphs it queued for the world's flush (Renderer.glyph, glyphRot), of them
//   R  turned ones (glyphRot: a new angle is a glyph rasterised afresh, in Chrome and in Firefox),
//   W  rows of one glyph laid as one rectangle (Renderer.glyphRow, the fog's band, the clouds, the smoke),
//   T  fillText and strokeText calls on any canvas, F fill and fillRect, S stroke and strokeRect, D drawImage.
// The flush is where the world's queued glyphs reach the canvas: its G and R are the glyphs it drew, its T the fillText it made of
// them (fewer where a bucket draws runs).
//
// Off (the game, and the lab without H) a section mark is one test of a flag and nothing more: no clock read, no canvas touched. On,
// the 2D context's drawing methods are wrapped to count (on the prototypes, for every canvas: a souvenir's art redrawn in the shelf's
// group, the screen filter's buffers in the screen's) and put back when it goes off. Nothing here changes what is drawn.

export const WINDOW_MS = 2000;

const COUNTED = { fillText: 't', strokeText: 't', fill: 'f', fillRect: 'f', stroke: 's', strokeRect: 's', drawImage: 'd' };
const calls = { t: 0, f: 0, s: 0, d: 0 };
let wrapped = null;                  // [prototype, name, the method it had] while counting

function count(on) {
  if (on === !!wrapped) return;
  if (!on) {
    for (const [proto, name, native] of wrapped) proto[name] = native;
    wrapped = null;
    return;
  }
  wrapped = [];
  const protos = [globalThis.CanvasRenderingContext2D?.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean);
  for (const proto of protos) {
    for (const [name, kind] of Object.entries(COUNTED)) {
      const native = proto[name];
      if (typeof native !== 'function') continue;
      wrapped.push([proto, name, native]);
      proto[name] = function (...args) { calls[kind]++; return native.apply(this, args); };
    }
  }
}

// The window's sums, by section, and the last window's table (per frame).
const sums = new Map();
const blank = () => ({ ms: 0, g: 0, r: 0, w: 0, t: 0, f: 0, s: 0, d: 0 });
export const PROFILE = { on: false, renderer: null, table: [], frames: 0, windowMs: 0, totals: new Map(), totalFrames: 0 };

let open = null, t0 = 0, g0 = 0, r0 = 0, w0 = 0, t0c = 0, f0c = 0, s0c = 0, d0c = 0, windowStart = -1, windowFrames = 0;

// On with H, off without it; `renderer` is the world's, whose glyph counters the sections read.
export function setProfiling(on, renderer = null) {
  on = !!on;
  if (on === PROFILE.on) return;
  PROFILE.on = on;
  PROFILE.renderer = renderer;
  count(on);
  open = null;
  sums.clear();
  windowStart = -1; windowFrames = 0;
  PROFILE.table = [];
  PROFILE.totals = new Map(); PROFILE.totalFrames = 0;
}

function close(now) {
  const r = PROFILE.renderer;
  let s = sums.get(open);
  if (!s) { s = blank(); sums.set(open, s); }
  s.ms += now - t0;
  const q = r?.tally;
  if (q) { s.g += Math.max(0, q.glyphs - g0); s.r += Math.max(0, q.turned - r0); s.w += Math.max(0, q.rows - w0); }
  s.t += calls.t - t0c; s.f += calls.f - f0c; s.s += calls.s - s0c; s.d += calls.d - d0c;
}

// The section `name` starts here and the one before ends (null: none starts). A name may come back: its sums run on.
export function lap(name) {
  if (!PROFILE.on) return;
  const now = performance.now();
  if (open !== null) close(now);
  open = name;
  if (name === null) return;
  const q = PROFILE.renderer?.tally;
  t0 = now;
  g0 = q?.glyphs ?? 0; r0 = q?.turned ?? 0; w0 = q?.rows ?? 0;
  t0c = calls.t; f0c = calls.f; s0c = calls.s; d0c = calls.d;
}

// `fn` as the section `name`, its result handed back.
export function timed(name, fn) {
  if (!PROFILE.on) return fn();
  lap(name);
  try { return fn(); } finally { lap(null); }
}

// The glyphs the world's flush is about to draw (it queues none itself): counted from the buckets before it runs.
export function flushing(renderer) {
  if (!PROFILE.on) return;
  let g = 0, r = 0, w = 0;
  for (const b of renderer.buckets.values()) {
    g += b.n; w += b.rows;
    if (b.rotated) r += b.n;
  }
  lap('flush');
  let s = sums.get('flush');
  if (!s) { s = blank(); sums.set('flush', s); }
  s.g += g; s.r += r; s.w += w;
}

// The end of a flight frame, at the frame's time stamp (ms): a window of WINDOW_MS or more is made into the table, per frame.
export function frameDone(stamp) {
  if (!PROFILE.on) return;
  if (open !== null) lap(null);
  windowFrames++;
  PROFILE.totalFrames++;
  if (windowStart < 0) windowStart = stamp;
  if (stamp - windowStart < WINDOW_MS) return;
  const n = windowFrames;
  PROFILE.table = [...sums].map(([name, s]) => ({ name, ms: s.ms / n, g: s.g / n, r: s.r / n, w: s.w / n, t: s.t / n, f: s.f / n, s: s.s / n, d: s.d / n }))
    .sort((a, b) => b.ms - a.ms);
  PROFILE.frames = n;
  PROFILE.windowMs = stamp - windowStart;
  for (const [name, s] of sums) {
    const all = PROFILE.totals.get(name) ?? blank();
    for (const k of Object.keys(all)) all[k] += s[k];
    PROFILE.totals.set(name, all);
  }
  sums.clear();
  windowStart = stamp; windowFrames = 0;
}

// Every frame since the profiler went on, per frame and costliest first (the flight probe's `--fx`), the open window included.
export function profileTotals() {
  const all = new Map([...PROFILE.totals].map(([k, v]) => [k, { ...v }]));
  for (const [name, s] of sums) {
    const a = all.get(name) ?? blank();
    for (const k of Object.keys(a)) a[k] += s[k];
    all.set(name, a);
  }
  const n = Math.max(1, PROFILE.totalFrames);
  return [...all].map(([name, s]) => ({ name, ms: s.ms / n, g: s.g / n, r: s.r / n, w: s.w / n, t: s.t / n, f: s.f / n, s: s.s / n, d: s.d / n }))
    .sort((a, b) => b.ms - a.ms);
}
