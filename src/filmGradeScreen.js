// The screens of the film-grade editor (src/filmGrade.js SCREENS), drawn over the running game in
// the editor's stage. Canvas 2D only, like the game's own filters (src/crt.js says why not WebGL), and no colour of
// their own: no CSS filter, no lifted black, no hue moved (SX, 2026-10-02: «за цвет у нас цветовые гаммы решают ...
// Нужны как бы именно текстуры и эффекты»). Each frame the game's finished canvas goes through three steps:
//
//   1. the screen's texture on the flat frame: LCD pixels, grid and lag, VHS softness, bleed, swaying and torn lines,
//      head noise and snow (the CRT's scanlines and glow come after the bend instead, bentCrt);
//   2. the bend: the two passes of thin strips of src/crt.js, the same formula, at CURVE of the tube of 2026-09-30;
//   3. the veil: the tube's rounded black corners and the vignette, src/crt.js paintVeil, painted again only when its
//      numbers or the size change.
//
// Lengths in the settings are CSS px; everything here is in the canvas's device px.
//
// The game's display (src/display.js) draws through this class too, so it is one drawing for the editor and the game:
// `options.target` is a canvas already in the page to draw on (the game's #crt) instead of one made here, `zIndex` its
// layer (the veil lies one above), and `seed` starts the screen's own stream of random numbers (the VHS's wobble, tear
// and snow), so a screen never draws from Math.random, the simulation's. `release()` gives the buffers back.

import { planStrips, paintVeil } from './crt.js';
import { CONFIG } from './config.js';

// The tube of 2026-09-30, which CURVE 100 % is: the game's own numbers, not a copy of them.
const TUBE = { bend: CONFIG.crt.bend, inset: CONFIG.crt.inset, stripStep: CONFIG.crt.stripStep, vignetteReach: CONFIG.crt.vignetteReach };

// mulberry32: a small seeded stream of 0..1.
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(doc, w, h) {
  const c = doc.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { alpha: false });
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  return { canvas: c, ctx };
}

// The margins of a bend's plan with each strip's partly covered edge pixel, as rects [x, y, w, h] for the two canvases: `mid` takes
// the rows, squeezed across round the middle, `out` the columns of `mid`, squeezed down. A strip drawn from `a` for `n` pixels at a
// fraction covers [a, a + n) whole only inside [ceil(a), floor(a + n)); the rest of its line is margin or edge. Built once a plan;
// a Path2D in the browser (one fill), the rects themselves where there is none (Node's checks).
function bendMargins(plan, w, h) {
  const side = (strips, length, across, rect) => {
    const out = [];
    for (let k = 0; k < strips.count; k++) {
      const s = strips.start[k], n = strips.end[k] - s, wide = across * strips.scale[k], a = (across - wide) / 2;
      const head = Math.ceil(a), tail = Math.floor(a + wide);
      if (head > 0) out.push(rect(s, n, 0, head));
      if (tail < across) out.push(rect(s, n, tail, across - tail));
    }
    return out;
  };
  const rects = {
    mid: side(plan.rows, h, w, (y, deep, x, wide) => [x, y, wide, deep]),
    out: side(plan.cols, w, h, (x, wide, y, deep) => [x, y, wide, deep]),
  };
  if (typeof Path2D !== 'function') return rects;
  const path = (list) => { const p = new Path2D(); for (const [x, y, rw, rh] of list) p.rect(x, y, rw, rh); return p; };
  return { mid: path(rects.mid), out: path(rects.out) };
}
function fillMargins(ctx, margins) {
  ctx.fillStyle = '#000000';
  if (Array.isArray(margins)) { for (const [x, y, w, h] of margins) ctx.fillRect(x, y, w, h); return; }
  ctx.fill(margins);
}

export class Screen {
  constructor(source, doc = document, { target = null, zIndex = 5, seed = 20261002 } = {}) {
    this.source = source;
    this.doc = doc;
    this.target = target;
    this.zIndex = zIndex;
    this.rand = stream(seed);
    this.mode = 'crt';
    this.p = {};
    this.w = this.h = 0;
    this.out = null; this.veil = null;
    this.work = {};
    this.plan = null; this.planKey = '';
    this.veilKey = ''; this.veilWanted = ''; this.veilAsked = 0;
    this.patterns = {};
    this.fresh = true;
    this.make();
  }

  make() {
    const fixed = { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none' };
    this.out = this.target ? { canvas: this.target, ctx: this.target.getContext('2d', { alpha: false }) } : canvas(this.doc, 1, 1);
    this.out.canvas.setAttribute?.('aria-hidden', 'true');
    Object.assign(this.out.canvas.style, fixed, { zIndex: String(this.zIndex) });
    const veil = this.doc.createElement('canvas');
    veil.setAttribute?.('aria-hidden', 'true');
    Object.assign(veil.style, fixed, { zIndex: String(this.zIndex + 1) });
    this.veil = { canvas: veil, ctx: veil.getContext('2d') };
    if (this.target) this.target.after(veil);
    else this.doc.body.append(this.out.canvas, veil);
  }

  set(mode, params) {
    if (mode !== this.mode) { this.fresh = true; this.release(); }
    this.mode = mode;
    this.p = { ...params };
  }

  // Gives the memory back: the working buffers (a screen needs only some of them, and a frame-sized one is tens of MB),
  // the patterns, and the two canvases shrunk to nothing. Whatever is needed is made again by the next frame.
  release() {
    this.work = {};
    this.patterns = {};
    this.plan = null; this.planKey = '';
    this.veilKey = ''; this.veilWanted = '';
    this.w = this.h = 0;
    this.out.canvas.width = this.out.canvas.height = 0;
    this.veil.canvas.width = this.veil.canvas.height = 0;
    if (this.lines) { this.lines.canvas.width = this.lines.canvas.height = 0; this.lines.key = ''; }
  }

  // A working canvas of the frame's size (or another), made once and resized with the frame.
  buf(name, w = this.w, h = this.h) {
    let b = this.work[name];
    if (!b) b = this.work[name] = canvas(this.doc, w, h);
    if (b.canvas.width !== w || b.canvas.height !== h) { b.canvas.width = w; b.canvas.height = h; b.ctx.fillStyle = '#000000'; }
    return b;
  }

  tube() {
    const k = (this.p.curve ?? 100) / 100;
    return { ...TUBE, bend: TUBE.bend * k, inset: TUBE.inset * Math.min(1, k),
      corner: (this.p.corner ?? 2.5) / 100, vignette: (this.p.vignette ?? 42) / 100 };
  }

  render(t) {
    const src = this.source, w = src.width, h = src.height;
    const flat = this.mode === 'flat', shown = flat ? 'none' : 'block';
    // Written when it changes, not every frame (a style written is the page's to restyle).
    if (this.out.canvas.style.display !== shown) this.out.canvas.style.display = shown;
    if (this.veil.canvas.style.display !== shown) this.veil.canvas.style.display = shown;
    if (flat) this.showLines(false);
    if (flat || !w || !h) return;
    if (w !== this.w || h !== this.h) { this.w = w; this.h = h; this.out.canvas.width = w; this.out.canvas.height = h; this.fresh = true; }
    this.dpr = w / (src.clientWidth || w);

    // The CRT, the base (any other name draws it too), lays its texture after the bend, not before it (bentCrt).
    const crt = this.mode !== 'lcd' && this.mode !== 'vhs';
    if (crt) this.bentCrt(src);
    else this.bend(this.mode === 'lcd' ? this.lcd(src) : this.vhs(src, t));
    this.showLines(crt);
    this.paintVeil();
    this.fresh = false;
  }

  // The CRT's texture laid after the bend (the effects audit of 2026-10-06, path #10; a lab switch until SX compared it by eye and
  // took it into the game, 2026-10-07). The frame is bent straight from the game's canvas (no copy into `a` first); the glow is taken
  // from the bent frame, down to a sixth and back up over it; and the scanlines, which never move, are bent once onto a layer of
  // their own that the browser lays over the picture under the veil (`lines`, painted again only for a new size or new numbers). The
  // texture before the bend took 8 full-frame passes; this takes 4 (with the margins filled once, path #3). The glow is the bent
  // picture's, so it follows the tube's curve (the flat frame's, then bent with it, was the same within a pixel or two at the
  // corners); the lines are bent from a flat stripe pattern rather than darkening the frame before its bend, so their edges are
  // resampled once alone (the same stripes, a shade apart at the edges of the tube where the strips stretch them).
  bentCrt(src) {
    const scan = (this.p.scan ?? 0) / 100, glow = (this.p.glow ?? 0) / 100;
    this.bend(src);
    if (glow) {
      const ctx = this.out.ctx;
      const bw = Math.max(1, Math.round(this.w / 6)), bh = Math.max(1, Math.round(this.h / 6));
      const b = this.buf('glow', bw, bh);
      b.ctx.imageSmoothingEnabled = true;
      b.ctx.drawImage(this.out.canvas, 0, 0, this.w, this.h, 0, 0, bw, bh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = glow * 0.5;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(b.canvas, 0, 0, bw, bh, 0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    this.paintLines(scan);
  }

  // The scanlines bent once onto `lines`: the flat stripes of `rows` cut into the same two passes of strips as the picture.
  paintLines(scan) {
    const cfg = this.tube();
    const period = Math.max(3, Math.round(3 * this.dpr));
    const key = `${this.w}|${this.h}|${cfg.bend}|${cfg.inset}|${scan}|${period}`;
    if (!this.lines) {
      const lines = this.doc.createElement('canvas');
      lines.setAttribute?.('aria-hidden', 'true');
      Object.assign(lines.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: String(this.zIndex) });
      // Over the picture and under the veil: the same layer as the picture, after it.
      if (this.target) this.target.after(lines); else this.out.canvas.after?.(lines);
      this.lines = { canvas: lines, ctx: lines.getContext('2d'), key: '' };
    }
    const L = this.lines;
    if (L.key === key) return;
    L.key = key;
    const { w, h } = this;
    L.canvas.width = w; L.canvas.height = h;
    if (!scan) return;
    const flat = this.doc.createElement('canvas');
    flat.width = w; flat.height = h;
    const f = flat.getContext('2d');
    f.fillStyle = this.rows(f, period, Math.max(1, Math.round(period / 2)), scan * 0.6);
    f.fillRect(0, 0, w, h);
    if (cfg.bend <= 0) { L.ctx.drawImage(flat, 0, 0); return; }
    const mid = this.doc.createElement('canvas');
    mid.width = w; mid.height = h;
    const m = mid.getContext('2d');
    m.imageSmoothingEnabled = true; L.ctx.imageSmoothingEnabled = true;
    const rows = planStrips(h, w, cfg), cols = planStrips(w, h, cfg);
    for (let k = 0; k < rows.count; k++) {
      const y = rows.start[k], deep = rows.end[k] - y, wide = w * rows.scale[k];
      m.drawImage(flat, 0, y, w, deep, (w - wide) / 2, y, wide, deep);
    }
    for (let k = 0; k < cols.count; k++) {
      const x = cols.start[k], wide = cols.end[k] - x, deep = h * cols.scale[k];
      L.ctx.drawImage(mid, x, 0, wide, h, x, (h - deep) / 2, wide, deep);
    }
  }

  // The scanlines' layer shown only while it is what the CRT draws.
  showLines(on) {
    if (!this.lines) return;
    const shown = on ? 'block' : 'none';
    if (this.lines.canvas.style.display !== shown) this.lines.canvas.style.display = shown;
    if (!on && this.lines.canvas.width) { this.lines.canvas.width = this.lines.canvas.height = 0; this.lines.key = ''; }
  }

  // ------------------------------------------------------------- textures ---

  // A pattern of rows: `dark` device px of black at `alpha` every `period`.
  rows(ctx, period, dark, alpha) {
    const key = `rows|${period}|${dark}|${alpha.toFixed(3)}`;
    if (this.patterns.rows?.key !== key) {
      const tile = this.doc.createElement('canvas');
      tile.width = 4; tile.height = period;
      const c = tile.getContext('2d');
      c.fillStyle = `rgba(0,0,0,${alpha})`;
      c.fillRect(0, period - dark, 4, dark);
      this.patterns.rows = { key, tile, pattern: null, ctx: null };
    }
    const r = this.patterns.rows;
    if (r.ctx !== ctx) { r.pattern = ctx.createPattern(r.tile, 'repeat'); r.ctx = ctx; }
    return r.pattern;
  }

  lcd(src) {
    const px = Math.max(1, Math.round((this.p.pixel ?? 3) * this.dpr));
    const grid = (this.p.grid ?? 40) / 100, lag = (this.p.lag ?? 45) / 100;
    const bw = Math.ceil(this.w / px), bh = Math.ceil(this.h / px);
    // Each panel pixel the average of what it covers.
    const small = this.buf('small', bw, bh);
    small.ctx.imageSmoothingEnabled = true;
    small.ctx.imageSmoothingQuality = 'high';
    small.ctx.drawImage(src, 0, 0, this.w, this.h, 0, 0, this.w / px, this.h / px);
    // The panel's slow response: the new frame laid over the last at 1 - lag.
    const acc = this.buf('lag');
    acc.ctx.imageSmoothingEnabled = false;
    acc.ctx.globalAlpha = this.fresh ? 1 : 1 - lag;
    acc.ctx.drawImage(small.canvas, 0, 0, bw, bh, 0, 0, bw * px, bh * px);
    acc.ctx.globalAlpha = 1;
    if (!grid || px < 2) return acc.canvas;
    // The dark lines between pixels.
    const a = this.buf('a');
    a.ctx.drawImage(acc.canvas, 0, 0);
    const key = `grid|${px}|${grid.toFixed(3)}`;
    if (this.patterns.grid?.key !== key || this.patterns.grid.ctx !== a.ctx) {
      const tile = this.doc.createElement('canvas');
      tile.width = tile.height = px;
      const c = tile.getContext('2d');
      const line = Math.max(1, Math.round(px * 0.22));
      c.fillStyle = `rgba(0,0,0,${grid})`;
      c.fillRect(px - line, 0, line, px);
      c.fillRect(0, px - line, px - line, line);
      this.patterns.grid = { key, ctx: a.ctx, pattern: a.ctx.createPattern(tile, 'repeat') };
    }
    a.ctx.fillStyle = this.patterns.grid.pattern;
    a.ctx.fillRect(0, 0, this.w, this.h);
    a.ctx.fillStyle = '#000000';
    return a.canvas;
  }

  snow(ctx) {
    if (!this.patterns.snow) {
      const tile = this.doc.createElement('canvas');
      tile.width = tile.height = 256;
      const c = tile.getContext('2d');
      const img = c.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const lit = this.rand() < 0.012 ? 120 + this.rand() * 135 : 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = lit;
        img.data[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      this.patterns.snow = { tile, ctx: null, pattern: null };
    }
    const s = this.patterns.snow;
    if (s.ctx !== ctx) { s.pattern = ctx.createPattern(s.tile, 'repeat'); s.ctx = ctx; }
    return s.pattern;
  }

  vhs(src, t) {
    const { w, h, dpr } = this;
    const soft = (this.p.soft ?? 35) / 100, bleed = (this.p.bleed ?? 2.5) * dpr;
    const wobble = (this.p.wobble ?? 0.75) * dpr, tracking = (this.p.tracking ?? 45) / 100, noise = (this.p.noise ?? 20) / 100;
    const a = this.buf('a');
    // The tape's softness along the lines: through a narrower copy and back.
    a.ctx.imageSmoothingEnabled = true;
    if (soft > 0) {
      const f = 1 + soft * 3, bw = Math.max(1, Math.round(w / f));
      const narrow = this.buf('narrow', bw, h);
      narrow.ctx.imageSmoothingEnabled = true;
      narrow.ctx.drawImage(src, 0, 0, w, h, 0, 0, bw, h);
      a.ctx.drawImage(narrow.canvas, 0, 0, bw, h, 0, 0, w, h);
    } else a.ctx.drawImage(src, 0, 0);
    // Red runs right: the red alone, laid back over the green and blue `bleed` px over. Black stays black.
    if (bleed > 0) {
      const red = this.buf('red');
      red.ctx.drawImage(a.canvas, 0, 0);
      red.ctx.globalCompositeOperation = 'multiply';
      red.ctx.fillStyle = '#FF0000';
      red.ctx.fillRect(0, 0, w, h);
      red.ctx.globalCompositeOperation = 'source-over';
      red.ctx.fillStyle = '#000000';
      a.ctx.globalCompositeOperation = 'multiply';
      a.ctx.fillStyle = '#00FFFF';
      a.ctx.fillRect(0, 0, w, h);
      a.ctx.globalCompositeOperation = 'lighter';
      a.ctx.drawImage(red.canvas, bleed, 0);
      a.ctx.globalCompositeOperation = 'source-over';
      a.ctx.fillStyle = '#000000';
    }
    // The lines: every slice shifted by its own sway, more inside the tracking band as it rolls down, and the head
    // switching's few lines at the bottom pulled right. Slices that do not move are drawn together.
    const out = this.buf('vhs');
    const slice = Math.max(2, Math.round(2 * dpr));
    const bandH = (34 + 60 * tracking) * dpr, roll = 8.5;
    const bandTop = (((t / roll) % 1) * (h + bandH * 2)) - bandH;
    const headH = 7 * dpr;
    const jump = tracking > 0 && (t % 6.3) < 0.09 ? Math.round(3 * tracking * dpr) : 0;
    out.ctx.fillRect(0, 0, w, h);
    let runStart = 0, runShift = null;
    const flush = (end) => {
      if (runShift === null || end <= runStart) return;
      out.ctx.drawImage(a.canvas, 0, runStart, w, end - runStart, runShift, runStart + jump, w, end - runStart);
    };
    for (let y = 0; y < h; y += slice) {
      let dx = 0;
      if (wobble) dx += wobble * (0.6 * Math.sin(y * 0.018 / dpr + t * 6.1) * (0.55 + 0.45 * Math.sin(t * 0.83)) + 0.4 * (this.rand() * 2 - 1));
      if (tracking && y >= bandTop && y < bandTop + bandH) {
        const u = (y - bandTop) / bandH, env = Math.sin(Math.PI * u);
        dx += tracking * 26 * dpr * env * (0.55 * Math.sin(u * 19 + t * 31) + 0.45 * (this.rand() * 2 - 1));
      }
      if (tracking && y >= h - headH) dx += (5 + 10 * tracking) * dpr * ((y - (h - headH)) / headH) + this.rand() * 2 * dpr;
      const shift = Math.round(dx * 2) / 2;
      if (shift !== runShift) { flush(y); runStart = y; runShift = shift; }
    }
    flush(h);
    // Snow: sparse dots added, thicker in the band.
    if (noise > 0 || tracking > 0) {
      const ox = Math.floor(this.rand() * 256), oy = Math.floor(this.rand() * 256);
      out.ctx.save();
      out.ctx.globalCompositeOperation = 'lighter';
      out.ctx.translate(-ox, -oy);
      out.ctx.fillStyle = this.snow(out.ctx);
      if (noise > 0) { out.ctx.globalAlpha = noise * 0.55; out.ctx.fillRect(ox, oy, w, h); }
      if (tracking > 0) { out.ctx.globalAlpha = Math.min(1, tracking * 0.9); out.ctx.fillRect(ox, oy + Math.max(0, bandTop), w, bandH); }
      out.ctx.restore();
      out.ctx.fillStyle = '#000000';
    }
    return out.canvas;
  }

  // ---------------------------------------------------------------- bend ---

  bend(image) {
    const { w, h } = this, ctx = this.out.ctx, cfg = this.tube();
    if (cfg.bend <= 0) {
      ctx.drawImage(image, 0, 0);
      return;
    }
    const key = `${w}|${h}|${cfg.bend}|${cfg.inset}`;
    if (this.planKey !== key) {
      this.plan = { rows: planStrips(h, w, cfg), cols: planStrips(w, h, cfg) };
      this.plan.margins = bendMargins(this.plan, w, h);
      this.planKey = key;
    }
    const mid = this.buf('mid');
    mid.ctx.imageSmoothingEnabled = true;
    mid.ctx.imageSmoothingQuality = 'low';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    const { rows, cols, margins } = this.plan;
    // The two canvases' black margins, round the strips: the whole canvas once for a size and a plan (a canvas made or resized,
    // a bend of 0 that drew the whole frame on `out`), and every frame only the margins with each strip's edge pixel, one fill a
    // canvas (bendMargins). A strip lands at a fraction of a pixel and its edge pixel is only partly covered, so it mixes with what
    // that pixel held: black when the canvas was filled every frame; the last frame's, which piled bright lines into frozen streaks
    // along the screen's edges (SX, 2026-10-07: «остаются артефакты на экране с какими-то замершими пикселями»), when the margins
    // were filled once only (the effects audit of 2026-10-06, path #3, until this). The picture is the full fill's, pixel for pixel;
    // the fill covers the margins, not two whole frames.
    const black = `${key}|${mid.canvas.width}x${mid.canvas.height}|${this.out.canvas.width}x${this.out.canvas.height}`;
    const fill = this.blackKey !== black || this.blackMid !== mid.canvas || this.blackOut !== this.out.canvas;
    if (fill) { this.blackKey = black; this.blackMid = mid.canvas; this.blackOut = this.out.canvas; }
    if (fill) mid.ctx.fillRect(0, 0, w, h);
    else fillMargins(mid.ctx, margins.mid);
    for (let k = 0; k < rows.count; k++) {
      const y = rows.start[k], deep = rows.end[k] - y, wide = w * rows.scale[k];
      mid.ctx.drawImage(image, 0, y, w, deep, (w - wide) / 2, y, wide, deep);
    }
    ctx.fillStyle = '#000000';
    if (fill) ctx.fillRect(0, 0, w, h);
    else fillMargins(ctx, margins.out);
    for (let k = 0; k < cols.count; k++) {
      const x = cols.start[k], wide = cols.end[k] - x, deep = h * cols.scale[k];
      ctx.drawImage(mid.canvas, x, 0, wide, h, x, (h - deep) / 2, wide, deep);
    }
  }

  // The tube's corners and vignette, at half the resolution (the browser stretches it), painted again only once its
  // numbers have held still a moment, so a slider being dragged does not repaint it every frame.
  paintVeil() {
    const cfg = this.tube();
    const key = `${this.w}|${this.h}|${cfg.bend}|${cfg.inset}|${cfg.corner}|${cfg.vignette}`;
    if (key === this.veilKey) return;
    const now = performance.now();
    if (key !== this.veilWanted) { this.veilWanted = key; this.veilAsked = now; if (this.veilKey) return; }
    if (this.veilKey && now - this.veilAsked < 150) return;
    const vw = Math.max(1, Math.round(this.w / 2)), vh = Math.max(1, Math.round(this.h / 2));
    const { canvas: c, ctx } = this.veil;
    c.width = vw; c.height = vh;
    const img = ctx.createImageData(vw, vh);
    paintVeil(vw, vh, img.data, cfg, { w: this.source.clientWidth || this.w, h: this.source.clientHeight || this.h });
    ctx.putImageData(img, 0, 0);
    this.veilKey = key;
  }
}
