import { CONFIG } from './config.js';
import { hasDistanceMark, markRuns, traceDistanceMark } from './distanceMark.js';
import { gradeKept, setGradeKept, gradeEpoch } from './grade.js';

// A bucket that has had nothing drawn into it for this many frames is dropped. The
// colour of a planet's shading, a fading spark, a blinking hull: each new colour
// or alpha is a bucket, and begin() and flush() walk every bucket ever made, so
// without this the walk grows for as long as the page stays open (measured
// 2026-09-30: 1.4 thousand buckets after half a minute of flight, 5.8 thousand
// after four minutes, the walk from 0.02 to 0.3 ms a frame).
export const BUCKET_IDLE_FRAMES = 900;

// Neighbouring cells of one bucket on one row are drawn as one string (flushRuns), when that is what the
// single draws would make bit for bit. Only dots, box drawing and blocks are batched, a bucket needs this
// many glyphs to be scanned for runs, and a run bridges at most this many empty cells with spaces.
const BATCH_MIN = 12;
const BATCH_GAP = 3;
const isBatchChar = (code) => code === 0xb7 || (code >= 0x2500 && code <= 0x259f);

// Which buckets draw in runs (SX, 2026-10-03: «C2 сразу делаем потому что плюс к производительности, туман условность не главная
// фишка игры»; PLAN C2, the code review's performance finding 1). Not all of them: `batchRuns` as a switch for the whole frame was
// put out on 2026-10-01 because SX's Firefox bench had the classic planets slower with it, and those are hundreds of buckets of one
// to three glyphs each, which a run cannot shorten. So a bucket decides for itself, from the frame before (`autoRuns`):
//   - it ASKS when it holds RUNS_ON_GLYPHS glyphs or more: the plain draw counts, on its way, how many strings its glyphs would
//     make (one glyph and the next on the same row, a few cells apart, are one string);
//   - it goes ON when those are at most 1 in RUNS_ON_SHARE of its glyphs, and then draws in runs;
//   - it stays on while it holds RUNS_OFF_GLYPHS or more and the strings it really drew (flushRuns says how many) are at most 1 in
//     RUNS_OFF_SHARE of them, else it goes OFF, and when it was the strings that did not pay (a font that will not advance one
//     cell a glyph, a ratio that moved) it is not asked again for RUNS_HOLD of its own big frames.
// The ways in and out do not meet (1/3 on, 1/2 off; 200 on, 100 off), so a bucket on the border keeps its way instead of changing
// it every frame. Measured on 2026-10-03 (a wrapper on flush counting each bucket's strings, real Chrome, 1800 px): the buckets of 200
// glyphs and more are the fog's shade (strings/glyphs 0.02), the fog's outline (0.43-0.44: stays off), a block planet's two or three
// shades (0.06-0.15), and none in open space; the banded planets (AMBERGRIS, FATHOM, DAMASK, ISOBAR) are 580-930 buckets of one to
// three glyphs, so none of them asks.
const RUNS_ON_GLYPHS = 200;
const RUNS_ON_SHARE = 3;
const RUNS_OFF_GLYPHS = 100;
const RUNS_OFF_SHARE = 2;
const RUNS_HOLD = 120;

// How many baked rows (glyphTile: a glyph in an ink, an alpha and a look) are kept, the least recently used given up first.
export const ROW_TILES = 64;

// How many cells right of the glyph before it (`d` apart) a glyph on the same row stands, if it is a whole number of cells from 1
// to `gap` and exact to a millionth of a pixel; 0 if not. The rule of a run, kept in one place for flushRuns and for the bucket
// that asks whether runs would pay.
function cellsApart(d, advance, gap) {
  const k = Math.round(d / advance);
  return k >= 1 && k <= gap && Math.abs(d - k * advance) <= 1e-6 ? k : 0;
}

// Whether `ch` may sit in a run of `table`'s font (Renderer.flushRuns): one character a run may hold, one cell wide alone and sixteen
// cells wide sixteen times, measured once a font and kept. A space fills a gap, so it is one too, or there are no gaps. (Until
// 2026-10-07 this and runPair were closures made anew for every bucket drawn in runs, about ninety a frame.)
function runChar(r, table, ctx, ch, advance) {
  let v = table.chars.get(ch);
  if (v === undefined) {
    v = ch.length === 1 && isBatchChar(ch.charCodeAt(0)) && r.advancesOneCell(ctx, ch, 1, advance)
      && r.advancesOneCell(ctx, ch.repeat(16), 16, advance);
    table.chars.set(ch, v);
  }
  return v;
}

// Two characters side by side must advance two cells too (no ligature between them).
function runPair(r, table, ctx, a, c, advance) {
  const key = a.charCodeAt(0) * 65536 + c.charCodeAt(0);
  let v = table.pairs.get(key);
  if (v === undefined) { v = r.advancesOneCell(ctx, a + c, 2, advance); table.pairs.set(key, v); }
  return v;
}

// How many run texts a renderer keeps (Renderer.flushRuns); all go at once when one more would pass this.
export const RUN_TEXTS = 4096;

// The text of the run of `chs` from `i` to `last`, each glyph `k` cells from the one before it with k - 1 spaces before it: the one
// kept under its `hash` and `length` when that one says the same letter for letter, else built and kept. A run's text was built a
// letter at a time every frame (`str += ch`, a new string a letter: about 36 KB of garbage a frame near the map's edge, 2026-10-07),
// though most runs are the frame before's (the fog's rows, a planet between its refreshes). The text is the same either way, so the
// canvas is asked the same.
function runText(kept, chs, xs, i, last, advance, gap, hash, length) {
  const key = (hash ^ Math.imul(length, 0x9e3779b1)) & 0x3fffffff;
  const known = kept.get(key);
  if (known !== undefined && known.length === length && sameRun(known, chs, xs, i, last, advance, gap)) return known;
  let str = chs[i];
  for (let j = i + 1; j <= last; j++) {
    const k = cellsApart(xs[j] - xs[j - 1], advance, gap);
    str += k === 1 ? chs[j] : ' '.repeat(k - 1) + chs[j];
  }
  if (kept.size >= RUN_TEXTS) kept.clear();
  kept.set(key, str);
  return str;
}

// Whether `text` is the run of `chs` from `i` to `last`, its gaps in spaces (runText).
function sameRun(text, chs, xs, i, last, advance, gap) {
  if (text.charCodeAt(0) !== chs[i].charCodeAt(0)) return false;
  let p = 1;
  for (let j = i + 1; j <= last; j++) {
    for (let s = cellsApart(xs[j] - xs[j - 1], advance, gap); s > 1; s--) if (text.charCodeAt(p++) !== 32) return false;
    if (text.charCodeAt(p++) !== chs[j].charCodeAt(0)) return false;
  }
  return p === text.length;
}

// The pixel ratio a canvas of `width` x `height` CSS pixels may have within `budget` device pixels: `dpr` itself
// when it fits (or there is no budget), else the ratio at which the canvas has just `budget` pixels.
function budgetedDpr(dpr, width, height, budget = Infinity) {
  return Math.min(dpr, Math.sqrt(budget / (width * height)));
}

// Glyph renderer on a 2D canvas.
//
// Everything in the game is drawn as a single character at a floating point
// screen position. Draws are queued into buckets keyed by colour, alpha and
// size, so the canvas state changes a few dozen times per frame instead of a
// few thousand.
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.pixelBudget = Infinity;
    this.buckets = new Map();       // bucket key string -> bucket, in the order they were made (the draw order)
    this.lookup = new Map();        // colour -> (alpha step, size step, turned) -> bucket: finds one without making its key
    this.last = null;               // the bucket the previous glyph went to: a run of one style is the rule
    // Draw runs of neighbouring cells as one string (see flushRuns). Off: in Firefox, SX's browser, the planet
    // frames it was meant to speed up got slower (SX's bench, 2026-10-01: sorrel 8 -> 19 ms, beryl 11 -> 16).
    this.batchRuns = false;
    // Each bucket decides for itself whether to draw in runs (see RUNS_ON_GLYPHS). `autoRuns = false` in the console puts the
    // game back to cell by cell everywhere; `batchRuns = true` makes every bucket of 12 glyphs and more draw in runs. (A stand-in
    // renderer built without the constructor has neither, and draws cell by cell as it did.)
    this.autoRuns = true;
    this.batchFonts = new Map();    // font -> what was measured of it, for the runs
    this.drawn = 0;
    // What the frame queued, for the lab's H (src/frameProfile.js): glyphs, of them turned, and rows. One object that the adapters made
    // with Object.create(renderer) share, so a glyph queued through one is counted here too (`drawn` is not: an adapter keeps its own).
    this.tally = { glyphs: 0, turned: 0, rows: 0 };
    // `text` and `fill` are the renderer's own from the start, so a painter that wraps one for a moment (labs/graphics/clicks.js
    // noteDuring, measure) sets a value and sets it back, never adds and deletes a property. The renderer is the prototype of every
    // adapter made with Object.create(renderer), and in V8 a prototype that changes its shape throws away the optimized code of
    // everything that reads through it: measured 2026-10-07, the labels' noteDuring each frame kept the starfield's draw and about a
    // hundred more from staying optimized (900 compiles in 10 s of flight), a garbage of boxed numbers every frame.
    this.text = this.text;
    this.fill = this.fill;
    // The camera's height (src/zoom.js, CONFIG.camera.zoom): the px a world unit is drawn at on this renderer (World.project reads it), the
    // interface's text in this renderer's units (1: its px), and the world's own view of it, whose units are the world's (made once, by
    // src/zoom.js worldLayer). Declared here, so setting them never changes the shape of a prototype every adapter reads through.
    this.zoom = 1;
    this.textScale = 1;
    this.worldLayer = null;
    this.resize();
  }

  // The most device pixels the canvas may have (Infinity: no limit). The CRT filter sets it while it is on, because
  // its two full-frame copies fall off a cliff above about 8.4 Mpx (src/crt.js); resize() lowers the pixel ratio to fit.
  setPixelBudget(pixels) {
    if (pixels === this.pixelBudget) return;
    this.pixelBudget = pixels;
    this.resize();
  }

  resize() {
    this.width = Math.max(320, window.innerWidth);
    this.height = Math.max(240, window.innerHeight);
    const dpr = budgetedDpr(Math.min(window.devicePixelRatio || 1, CONFIG.render.maxDpr), this.width, this.height, this.pixelBudget);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fontFamily = getComputedStyle(document.body).fontFamily;
    this.fontSize = CONFIG.render.fontSize;
    this.font = `${this.fontSize}px ${this.fontFamily}`;
    ctx.font = this.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this.cellW = ctx.measureText('M').width || this.fontSize * 0.6;
    this.batchFonts = new Map();
    this.cellH = this.fontSize * CONFIG.render.lineRatio;
    this.margin = Math.max(this.cellW, this.cellH) * 2;
    this.layout();
  }

  // The view is a safe flight/interaction area, not a crop. Space continues
  // behind separate cockpit instruments across the full canvas. Keeping the
  // camera centred here prevents the ship from disappearing under a module.
  layout() {
    const v = CONFIG.view;
    const clampBand = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));

    let strip = clampBand(this.height * v.topStripRatio, v.topStripMin, v.topStripMax);
    const cockpitFloor = this.height >= 650 ? v.cockpitMin : v.cockpitCompactMin;
    let cockpit = clampBand(this.height * v.cockpitRatio, cockpitFloor, v.cockpitMax);

    // A short window takes it out of the bands, never out of the sky. The
    // strip goes first: the delivery bearing survives in the flight area,
    // while the instruments are read on every flight.
    const over = strip + cockpit + v.worldMin - this.height;
    if (over > 0) {
      const fromStrip = Math.min(strip, over);
      strip -= fromStrip;
      cockpit = Math.max(0, cockpit - (over - fromStrip));
    }

    this.strip = { x: 0, y: 0, w: this.width, h: strip };
    this.view = { x: 0, y: strip, w: this.width, h: Math.max(1, this.height - strip - cockpit) };
    this.cockpit = { x: 0, y: this.view.y + this.view.h, w: this.width, h: cockpit };
    // Where the centred windows stand (src/uiGrid.js centredWindow): the flight view between the top strip and the cockpit, or the room
    // the page reports (`windowViewOf`: the whole screen under the MODERN interface, which draws no cockpit band; null under LEGACY).
    this.windowView = this.windowViewOf?.(this) ?? this.view;

    this.worldView = { x: 0, y: 0, w: this.width, h: this.height };
    this.cx = this.view.x + this.view.w / 2;
    this.cy = this.view.y + this.view.h / 2 + Math.min(v.shipDrop || 0, this.view.h / 10);
    // Where the ship stands, by the eye (SX, 2026-10-02: «позицию кораблика от центру ... нужна оптическая оценка ...
    // чтобы кораблик был посередине ... он явно выше фактической середины экрана, но он при этом должен быть где-то
    // ... от штурвала или от нижней панели до верха экрана как-то рассчитан»): `shipCentre` of the way from the screen's
    // top to the top of the helm's grip, the cockpit's highest point on the ship's own axis, which the page reports
    // (`panelTopOf`, labs/graphics/hud-layout.js). A fixed drop below the sky's middle put the ship at a different
    // place over the helm in every window. Without a helm (a compact cockpit), the old rule.
    const panelTop = this.panelTopOf?.(this);
    if (Number.isFinite(panelTop) && panelTop > this.view.y + 60) this.cy = Math.round(panelTop * v.shipCentre);
    // Under the MODERN interface no helm: the ship stands `modernMiddle` of the way down the screen, a share the page reports
    // (`shipMiddleOf`, null under LEGACY).
    const middle = this.shipMiddleOf?.(this);
    if (Number.isFinite(middle)) this.cy = Math.round(this.height * middle);
    // The sky is full bleed, including gaps between instruments. Account for
    // the off-centre camera when sizing its wrapped tile.
    this.diagonal = 2 * Math.hypot(Math.max(this.cx, this.width - this.cx),
      Math.max(this.cy, this.height - this.cy));
  }

  // Flat opaque fill. The one place a rectangle is painted, so the chrome
  // cannot acquire a gradient or a shadow by accident.
  fill(x, y, w, h, color, alpha = 1) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    if (alpha !== 1) ctx.globalAlpha = 1;       // (opaque: it was set to 1 above and nothing has touched it since)
  }

  begin() {
    const ctx = this.ctx;
    setGradeKept(0);                  // a frame that faulted inside a kept draw or a flush does not leave the layer on
    ctx.globalAlpha = 1;
    ctx.fillStyle = CONFIG.render.background;
    ctx.fillRect(0, 0, this.width, this.height);
    for (const b of this.buckets.values()) {
      if (b.n || b.rows || b.used) { b.n = 0; b.rows = 0; b.idle = 0; b.used = false; }
      else if (++b.idle > BUCKET_IDLE_FRAMES) {
        this.buckets.delete(b.key);
        b.styles.delete(b.style);
        if (this.last === b) this.last = null;
      }
    }
    this.drawn = 0;
    this.rowCells = 0;
    const tally = this.tally;
    if (tally) { tally.glyphs = 0; tally.turned = 0; tally.rows = 0; }
  }

  // Only the instrument bodies occlude space; world glyphs remain visible
  // in every gap. Interaction windows still use the safe `view` rectangle.
  onScreen(x, y, pad = 0) {
    const m = this.margin + pad;
    const v = this.worldView;
    return x > v.x - m && x < v.x + v.w + m && y > v.y - m && y < v.y + v.h + m;
  }

  // The bucket of one colour, alpha (in sixteenths) and size (in twentieths), turned or not, and in the layer drawn now
  // (src/grade.js: 1 while the kept layer is drawn, keptDraw). The layer is part of the
  // key because a glyph is coloured when it is flushed, not when it is queued: the look the grade wears does not
  // repaint the kept layer's colours (the notices, the quest list, the pointers, the pilot's ship), and the flush
  // has to know which bucket is which. Its key string is made only when a bucket is, never per glyph: the glyphs
  // arrive in their thousands a frame.
  bucket(color, alpha, size, rotated) {
    const aq = Math.round(alpha * 16), sq = Math.round(size * 20);
    const layer = gradeKept();
    const last = this.last;
    if (last && last.aq === aq && last.sq === sq && last.color === color && last.rotated === rotated && last.layer === layer) return last;
    const lookup = this.lookup || (this.lookup = new Map());
    let styles = lookup.get(color);
    if (styles === undefined) { styles = new Map(); lookup.set(color, styles); }
    const style = ((aq * 4096 + sq) * 2 + (rotated ? 1 : 0)) * 2 + layer;
    let b = styles.get(style);
    if (b === undefined) {
      const a = aq / 16, s = sq / 20;
      b = { key: `${color}|${a}|${s}|${rotated ? 1 : 0}${layer ? '|k' : ''}`, color, alpha: a, size: s, rotated, layer, aq, sq, styles, style,
        n: 0, chs: [], xs: new Float64Array(32), ys: new Float64Array(32), angs: rotated ? new Float64Array(32) : null, idle: 0,
        runs: false, hold: 0, rows: 0, row: null, used: false };
      this.buckets.set(b.key, b);
      styles.set(style, b);
    }
    this.last = b;
    return b;
  }

  // One queued glyph: its character and place in the bucket's parallel arrays (no object, no boxed number per glyph).
  push(b, ch, x, y) {
    const n = b.n;
    if (n === b.xs.length) {
      const xs = new Float64Array(n * 2), ys = new Float64Array(n * 2);
      xs.set(b.xs); ys.set(b.ys); b.xs = xs; b.ys = ys;
      if (b.angs) { const angs = new Float64Array(n * 2); angs.set(b.angs); b.angs = angs; }
    }
    b.chs[n] = ch; b.xs[n] = x; b.ys[n] = y;
    b.n = n + 1;
    const tally = this.tally;
    if (tally) { tally.glyphs++; if (b.rotated) tally.turned++; }
    return n;
  }

  glyph(ch, x, y, color, alpha = 1, size = 1) {
    if (ch === ' ' || alpha <= 0.02) return;
    if (!this.onScreen(x, y, size > 1 ? this.cellH * size : 0)) return;
    this.push(this.bucket(color, alpha, size, false), ch, x, y);
    this.drawn++;
  }

  // Same, but the glyph itself turns with the body. Line art ( / \ | _ ) and
  // the geometric glyphs used in hand-drawn ships keep their meaning.
  glyphRot(ch, x, y, angle, color, alpha = 1, size = 1) {
    if (ch === ' ' || alpha <= 0.02) return;
    if (!this.onScreen(x, y, size > 1 ? this.cellH * size : 0)) return;
    if (Math.abs(angle) < 0.004) return this.glyph(ch, x, y, color, alpha, size);
    const b = this.bucket(color, alpha, size, true);
    // push() first, then read b.angs: a push that fills the arrays replaces them, and
    // `b.angs[this.push(...)]` would write the angle into the old one (measured: one
    // glyph a doubling drawn unturned).
    const i = this.push(b, ch, x, y);
    b.angs[i] = angle;
    this.drawn++;
  }

  // `count` cells of one glyph side by side on a row, the first centred at (x, y): what `count` calls of glyph(ch, x + k * cellW,
  // y, color, alpha) would draw, laid as one rectangle of a baked row of that glyph (glyphTile) in that glyph's bucket, before its
  // single glyphs, instead of a fillText a cell (the fog's deep shade, src/world.js drawDeadEdges with `fogBand`: a few hundred
  // rectangles a frame in place of thousands of letters). The cells off the screen and its margin are left out as glyph() leaves
  // them. Not counted in `drawn` (its letters), but in `rowCells`.
  glyphRow(ch, x, y, count, color, alpha = 1) {
    if (ch === ' ' || alpha <= 0.02 || count < 1) return;
    const m = this.margin, v = this.worldView, cw = this.cellW;
    if (!(y > v.y - m && y < v.y + v.h + m)) return;
    const lo = Math.max(0, Math.floor((v.x - m - x) / cw) + 1), hi = Math.min(count - 1, Math.ceil((v.x + v.w + m - x) / cw) - 1);
    if (hi < lo) return;
    const b = this.bucket(color, alpha, 1, false);
    const k = b.rows;
    let row = b.row;
    if (!row || k === row.x.length) {
      const size = Math.max(16, k * 2), next = { x: new Float64Array(size), y: new Float64Array(size), n: new Int32Array(size), ch: [] };
      if (row) { next.x.set(row.x); next.y.set(row.y); next.n.set(row.n); next.ch = row.ch; }
      b.row = row = next;
    }
    row.x[k] = x + lo * cw; row.y[k] = y; row.n[k] = hi - lo + 1; row.ch[k] = ch;
    b.rows = k + 1;
    if (this.tally) this.tally.rows++;
    this.rowCells = (this.rowCells ?? 0) + hi - lo + 1;
  }

  // A row of `ch` baked once in the bucket's ink and alpha, as the canvas draws it (the same font through the same pixel ratio, the
  // colour through the grade of the bucket's layer), to be laid by glyphRow: `cells` cells a tile, so that `cells` cell widths in
  // device px are a whole number of px to within a fiftieth (the pattern repeats in whole px; a glyph's place is then off by that
  // at most, a tile on), each glyph with what it spills to the side and above and below, and its neighbours' spill at the ends.
  glyphTile(ch, b) {
    const dpr = this.dpr, cwd = this.cellW * dpr;
    const key = `${ch}|${b.color}|${b.alpha}|${b.layer}|${gradeEpoch()}|${this.font}|${cwd}|${dpr}`;
    const tiles = this.rowTiles ?? (this.rowTiles = new Map());
    let tile = tiles.get(key);
    // The most recently used last (a Map keeps the order things were put in): a tile asked for again goes to the end.
    if (tile) { tiles.delete(key); tiles.set(key, tile); return tile; }
    let cells = 1, best = Infinity;
    for (let k = 1; k <= 64; k++) {
      const err = Math.abs(k * cwd - Math.round(k * cwd));
      if (err < best - 1e-9) { best = err; cells = k; }
      if (err <= 0.02) break;
    }
    const ctx = this.ctx, m = ctx.measureText(ch);
    const up = Math.ceil((m.actualBoundingBoxAscent || this.cellH) * dpr) + 2, down = Math.ceil((m.actualBoundingBoxDescent || this.cellH) * dpr) + 2;
    const w = Math.round(cells * cwd), h = up + down;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    // Baked on the game's canvas itself and copied off it, on black, so the tile is the canvas's own text to the pixel: the same
    // letters drawn on a canvas of their own came out about 1.6 times as bright as on the game's (Chrome, measured 2026-10-07: every
    // fresh canvas, whatever its size, 18.3 against the game's 11.0 over a row of the fog's '░' at 0.25), and the fog's deep rows were
    // lighter patches in it (SX: «сделай дым однородного цвета как скраю»). A strip of the game's canvas at its top left is kept
    // aside (`bakeKeep`, one canvas kept), cleared (black: the canvas is opaque), the row drawn as flush draws a glyph, copied into
    // the tile, and the strip put back. The tile is laid by adding it (flushRows: 'lighter'), its black adding nothing.
    const x0 = Math.ceil(cwd) + 2, stripW = x0 + w + Math.ceil(cwd) + 2;
    const keep = this.bakeKeep ?? (this.bakeKeep = document.createElement('canvas'));
    if (keep.width < stripW || keep.height < h) { keep.width = Math.max(keep.width, stripW); keep.height = Math.max(keep.height, h); }
    const k2 = keep.getContext('2d');
    k2.clearRect(0, 0, stripW, h);
    k2.drawImage(ctx.canvas, 0, 0, stripW, h, 0, 0, stripW, h);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, stripW, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = this.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const was = gradeKept();
    setGradeKept(b.layer);
    ctx.fillStyle = b.color;
    setGradeKept(was);
    ctx.globalAlpha = b.alpha;
    for (let k = -1; k <= cells; k++) ctx.fillText(ch, (x0 + (k + 0.5) * cwd) / dpr, up / dpr);
    canvas.getContext('2d').drawImage(ctx.canvas, x0, 0, w, h, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(keep, 0, 0, stripW, h, 0, 0, stripW, h);
    ctx.restore();
    // At most ROW_TILES kept, the least recently used given up first (the effects audit of 2026-10-06, path #14). Until then all of
    // them went at once past 16: the fog, the clouds and the smoke ask for about ten (each glyph and alpha of each), so one more user
    // of rows would have baked every tile again every frame.
    if (tiles.size >= ROW_TILES) tiles.delete(tiles.keys().next().value);
    tile = { canvas, pattern: ctx.createPattern(canvas, 'repeat'), cwd, up, height: up + down };
    tiles.set(key, tile);
    return tile;
  }

  // The tiles of `ch` in `color` at each alpha of `alphas` baked now (glyphTile), so the first row laid in flight finds its tile made: a
  // canvas made mid-flight is a cost the frame cannot hide (docs/playbook/rendering-performance.md, the rule of rare events). The boot
  // plan asks it behind the title for the smoke's shade, every strength the fog, the clouds and the view's side smoke lay it at. No
  // bucket is made for it (glyphTile reads a bucket's colour, alpha in sixteenths and layer, given here as they): the buckets are
  // flushed in the order they were made, and one made at the boot would draw the smoke before what it was drawn after.
  warmRows(ch, color, alphas) {
    if (!this.ctx || typeof document === 'undefined') return 0;
    for (const a of alphas) this.glyphTile(ch, { color, alpha: Math.round(a * 16) / 16, layer: gradeKept() });
    return alphas.length;
  }

  // The bucket's rows (glyphRow), each one rectangle of its tile at whole device px: the tile's first glyph where the row's first is.
  flushRows(ctx, b) {
    const row = b.row, T = ctx.getTransform();
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';     // the tile is its glyphs on black (glyphTile)
    let tile = null, ch = null;
    for (let k = 0; k < b.rows; k++) {
      if (row.ch[k] !== ch) { ch = row.ch[k]; tile = this.glyphTile(ch, b); ctx.fillStyle = tile.pattern; }
      const x = T.a * row.x[k] + T.c * row.y[k] + T.e, y = T.b * row.x[k] + T.d * row.y[k] + T.f;
      const left = Math.round(x - tile.cwd / 2), top = Math.round(y - tile.up);
      ctx.setTransform(1, 0, 0, 1, left, top);
      ctx.fillRect(0, 0, Math.round(x - tile.cwd / 2 + row.n[k] * tile.cwd) - left, tile.height);
    }
    ctx.restore();
  }

  // What `draw` queues, drawn now over what the frame has drawn so far (the ship up in a jump over a menu: chat H, 2026-10-04). The
  // frame's one flush has put every bucket's glyphs on the canvas already, so the buckets are emptied, filled by `draw` alone, flushed
  // and emptied again; the next `begin` finds them as it finds any bucket used.
  drawOver(draw) {
    const empty = () => { for (const b of this.buckets.values()) { b.n = 0; b.rows = 0; } };
    empty();
    try { draw(); this.flush(); } finally { empty(); }
  }

  // What is queued so far drawn now, and the buckets emptied for what the frame queues after it, each kept as used this frame (`used`:
  // begin() does not count it idle). The sky goes so, on the screen as it is, before the world under its camera's scale (src/zoom.js).
  flushPart() {
    this.flush();
    for (const b of this.buckets.values()) if (b.n || b.rows) { b.n = 0; b.rows = 0; b.used = true; }
  }

  flush() {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const measures = typeof ctx.measureText === 'function';
    const forced = this.batchRuns && measures;
    const auto = !forced && this.autoRuns && measures;
    // The grade colours a bucket as the layer it was queued in (src/grade.js), and what it found is put back after.
    const layer = gradeKept();
    // What this loop has set on the context: nothing else writes to it between one bucket and the next (a rotated glyph's save and
    // restore, and a run's alignment, give back what the bucket set), so a bucket that wants what the one before it set sets
    // nothing (PLAN C2, 2026-10-03: in the flight scene 25 font sets and 7 alpha sets a frame were to the value held; a font string
    // is parsed at each assignment in Firefox). Nothing is known at the first bucket.
    let ink = null, inkLayer = -1, alpha = -1, size = 0, font = null;
    for (const b of this.buckets.values()) {
      const n = b.n;
      if (!n && !b.rows) continue;
      setGradeKept(b.layer);
      // A colour is the grade's of its layer, so it is the same one only on the same layer.
      if (b.color !== ink || b.layer !== inkLayer) { ctx.fillStyle = b.color; ink = b.color; inkLayer = b.layer; }
      if (b.alpha !== alpha) { ctx.globalAlpha = b.alpha; alpha = b.alpha; }
      if (b.size !== size) { font = b.size === 1 ? this.font : `${this.fontSize * b.size}px ${this.fontFamily}`; ctx.font = font; size = b.size; }
      // Its rows first (glyphRow; a save and a restore round them, so what was set above holds for its glyphs), then its glyphs.
      if (b.rows) { this.flushRows(ctx, b); if (!n) continue; }
      const chs = b.chs, xs = b.xs, ys = b.ys;
      if (b.rotated) {
        // Each turned glyph by one setTransform, the canvas's matrix times its place and its turn, and the matrix put back once after
        // the bucket (the effects audit of 2026-10-06, path #2): two calls a glyph in place of save, translate, rotate and restore
        // round its fillText (play-co/timestep #56). The same matrix to its last bits as the canvas would make of the four.
        const angs = b.angs, T = ctx.getTransform();
        const ta = T.a, tb = T.b, tc = T.c, td = T.d, te = T.e, tf = T.f;
        for (let i = 0; i < n; i++) {
          const x = xs[i], y = ys[i], cos = Math.cos(angs[i]), sin = Math.sin(angs[i]);
          ctx.setTransform(ta * cos + tc * sin, tb * cos + td * sin, tc * cos - ta * sin, td * cos - tb * sin, te + ta * x + tc * y, tf + tb * x + td * y);
          ctx.fillText(chs[i], 0, 0);
        }
        ctx.setTransform(ta, tb, tc, td, te, tf);
      } else if (forced ? n >= BATCH_MIN : auto && b.runs && n >= RUNS_OFF_GLYPHS) {
        const strings = this.flushRuns(ctx, b, font);
        if (auto && strings * RUNS_OFF_SHARE > n) { b.runs = false; b.hold = RUNS_HOLD; }
      } else if (auto && n >= RUNS_ON_GLYPHS && !b.hold) {
        this.flushCells(ctx, b);
      } else {
        if (auto) {
          if (b.runs) b.runs = false;                         // it had runs and fell below RUNS_OFF_GLYPHS
          else if (b.hold && n >= RUNS_ON_GLYPHS) b.hold--;   // it was told to wait: one of its big frames gone
        }
        for (let i = 0; i < n; i++) ctx.fillText(chs[i], xs[i], ys[i]);
      }
    }
    setGradeKept(layer);
    if (alpha !== 1) ctx.globalAlpha = 1;
    if (size !== 1) ctx.font = this.font;
  }

  // What was measured of a font at a cell width: which characters and pairs of them advance exactly one cell each
  // when drawn together, in the context's own font. A run is only ever made of what this says is safe, so a
  // font that ligates, kerns or falls back to a glyph of another width is drawn cell by cell as it always was.
  batchTable(font, advance) {
    let t = this.batchFonts.get(font);
    if (t === undefined || t.advance !== advance) {
      t = { advance, chars: new Map(), pairs: new Map(), space: undefined };
      this.batchFonts.set(font, t);
    }
    return t;
  }

  // Does `text` (n cells) advance n x `advance`? The epsilon is a thousandth of a cell a glyph.
  advancesOneCell(ctx, text, n, advance) {
    return Math.abs(ctx.measureText(text).width - n * advance) <= 0.001 * advance * n + 1e-6;
  }

  // The bucket drawn cell by cell, as it always was, and counting on its way how many strings flushRuns would make of it (the same
  // rule: a glyph that stands 1 to BATCH_GAP cells right of the one before on its row, both of a character a run may hold, joins
  // it). Whether runs would pay is decided from that count: the frame after, if it is at most 1 in RUNS_ON_SHARE of the glyphs. No
  // second pass and nothing allocated; the count is a few comparisons beside each fillText. It does not ask the font whether
  // the characters advance one cell (flushRuns does, and a bucket whose font will not is sent back by what it really drew).
  flushCells(ctx, b) {
    const n = b.n, chs = b.chs, xs = b.xs, ys = b.ys, advance = this.cellW * b.size;
    let strings = 0, runnable = false, py = NaN, px = 0;
    for (let i = 0; i < n; i++) {
      const ch = chs[i], x = xs[i], y = ys[i];
      ctx.fillText(ch, x, y);
      const may = ch.length === 1 && isBatchChar(ch.charCodeAt(0));
      if (!(may && runnable && y === py && cellsApart(x - px, advance, BATCH_GAP))) strings++;
      runnable = may; py = y; px = x;
    }
    b.runs = strings * RUNS_ON_SHARE <= n;
  }

  // Neighbouring cells of one bucket on one row, as one string, drawn left to right from the first cell's left edge
  // (a cell is drawn centred on its x; in a monospace font the two are one and the same place). The glyphs
  // arrive in the order they were queued, which for a planet or a station is row by row, so a run is found by
  // walking the bucket once. Kerning and ligatures are turned off where the context allows it, and what was
  // measured with them off is what is drawn with them off. Returns how many strings it drew (a lone glyph is one). `font`: the font
  // the flush set on the context for this bucket, the key of what was measured of it (read back from the context without it: the
  // context hands back a new string at each read, about ninety a frame).
  flushRuns(ctx, b, font = ctx.font) {
    const n = b.n, chs = b.chs, xs = b.xs, ys = b.ys;
    const advance = this.cellW * b.size;
    const table = this.batchTable(font, advance);
    const kerning = ctx.fontKerning, rendering = ctx.textRendering;
    if (kerning !== undefined) ctx.fontKerning = 'none';
    if (rendering !== undefined) ctx.textRendering = 'optimizeSpeed';
    if (table.space === undefined) table.space = this.advancesOneCell(ctx, ' ', 1, advance) && this.advancesOneCell(ctx, ' '.repeat(16), 16, advance);
    const gap = table.space ? BATCH_GAP : 1;
    const kept = this.runTexts ?? (this.runTexts = new Map());
    let i = 0, strings = 0;
    while (i < n) {
      const first = chs[i], y = ys[i];
      let j = i + 1;
      strings++;
      if (j < n && ys[j] === y && runChar(this, table, ctx, first, advance)) {
        // The run's text is not built as it is found: its letters and gaps go into a hash and a length, and the text is the one kept
        // from a frame before when that one says the same, letter for letter (runText).
        let prev = first, lastX = xs[i], last = i, hash = first.charCodeAt(0), length = 1;
        while (j < n && ys[j] === y && runChar(this, table, ctx, chs[j], advance)) {
          const k = cellsApart(xs[j] - lastX, advance, gap);
          if (k === 0) break;
          const ch = chs[j];
          if (k === 1) {
            if (!runPair(this, table, ctx, prev, ch, advance)) break;
          } else if (!runPair(this, table, ctx, prev, ' ', advance) || !runPair(this, table, ctx, ' ', ch, advance)) break;
          hash = (Math.imul(hash, 31) + k * 65536 + ch.charCodeAt(0)) | 0;
          length += k;
          prev = ch; lastX = xs[j]; last = j; j++;
        }
        if (last > i) {
          ctx.textAlign = 'left';
          ctx.fillText(runText(kept, chs, xs, i, last, advance, gap, hash, length), xs[i] - advance / 2, y);
          ctx.textAlign = 'center';
          i = last + 1;
          continue;
        }
      }
      ctx.fillText(first, xs[i], y);
      i++;
    }
    if (kerning !== undefined) ctx.fontKerning = kerning;
    if (rendering !== undefined) ctx.textRendering = rendering;
    return strings;
  }

  // A glyph drawn immediately, centred like `glyph` but bypassing the buckets.
  //
  // `glyph` only queues; the queue is emptied by `flush` and cleared by the
  // next `begin`. Anything queued AFTER flush is therefore discarded without
  // ever reaching the canvas. Overlay marks drawn on top of the world have to
  // come through here.
  glyphNow(ch, x, y, color, alpha = 1, size = 1) {
    if (ch === ' ' || alpha <= 0.02) return;
    const ctx = this.ctx;
    ctx.font = size === 1 ? this.font : `${this.fontSize * size}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillText(ch, x, y);
    if (alpha !== 1) ctx.globalAlpha = 1;
    if (size !== 1) ctx.font = this.font;
  }

  // HUD text, drawn immediately, left aligned. A distance's mark in it (src/distanceMark.js) is drawn as its lines.
  text(str, x, y, color, alpha = 1) {
    const ctx = this.ctx;
    ctx.font = this.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    if (hasDistanceMark(str)) this.markedText(str, x, y, color);
    else ctx.fillText(str, x, y);
    if (alpha !== 1) ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }

  // The capitals' ink in a text row drawn from its top (textBaseline 'top'), measured once per font.
  capInk() {
    if (this.capCache?.font === this.font) return this.capCache;
    let capTop = 1.4, capBottom = 11.97;
    try {
      const m = this.ctx.measureText('H');
      if (m.actualBoundingBoxDescent > 0) { capTop = -m.actualBoundingBoxAscent; capBottom = m.actualBoundingBoxDescent; }
    } catch { /* the measured defaults stand */ }
    this.capCache = { font: this.font, capTop, capBottom };
    return this.capCache;
  }

  // A string with a distance's mark: its text runs in the font, its marks as lines, cell by cell.
  markedText(str, x, y, color) {
    const ctx = this.ctx, { capTop, capBottom } = this.capInk();
    const marks = [];
    for (const run of markRuns(str)) {
      if (run.mark) marks.push(x + run.at * this.cellW);
      else ctx.fillText(run.text, x + run.at * this.cellW, y);
    }
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    ctx.beginPath();
    for (const mx of marks) traceDistanceMark(ctx, mx, y, this.cellW, capTop, capBottom);
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}
