import { CONFIG } from './config.js';

// An optional CRT filter over the finished frame (SX, 2026-09-24): a curved
// tube over the game's own colours. Reworked 2026-09-30 at SX's word ("CRT
// эффект все равно тормозной, убери шейдер, сделай прям на 5% больше изгиб и
// добавь виньетку"): no shader, no glow, no scanlines; the bend is stronger
// and a vignette darkens the edges of the tube. Then, the same day, «сделай
// изгиб сильнее и виньетку сделай аккуратный блик имитирующий стекло
// кинескопа»: a stronger bend again, and the faint light of the front glass.
// Then, the same day again: «При изогнутом экране не видно ни виньетки на
// интерфейсе, ни блика, найди решение чтобы сделать crt шейдер, но при этом
// игра все равно шла в 60 fps», and «мне надо во всех браузерах чтобы хорошо
// было». The vignette and the glass were simply too faint to see (a tenth of
// the light at the middle of an edge, #090909 over black at the glass's
// brightest); they are stronger now (CONFIG.crt).
//
// Why no WebGL shader, measured 2026-09-30 on the M1 Pro at 3024 x 1716 and
// larger, flying the game: a shader over a Canvas 2D game has to copy every
// finished frame into a texture, and only Chrome makes that copy on the GPU
// (0.1-0.2 ms). Safari takes 16-25 ms for it in every form tried (texImage2D
// or texSubImage2D, premultiplied or not, with or without colour conversion,
// through createImageBitmap) and ran the game at 30 fps; Firefox took 20 ms
// and ran it at 45-48. The strips below ran it at 60 in Safari (its ceiling),
// 120 in Firefox and 60 in Chrome, where uncapped they cost about the same as
// the shader did (0.7 ms a frame). The look a shader would give is kept: the
// bend is the same formula to a third of a pixel, and the tube, vignette and
// glass are the same per-pixel formulas, computed once into the veil instead
// of every frame (they are fixed to the glass, so every frame would compute
// the same picture). What only a per-frame shader could add (a glow that
// follows the picture) would cost those browsers the frame rate.
//
// The screens on V draw with what is here (src/filmGradeScreen.js Screen, src/display.js): the bend, the strips and the veil. The
// first filter class (CrtFilter) and its on/off preference went with PLAN D2 (2026-10-04): no screen had used them since the
// screens came. As it was drawn:
//
// Presentation only. The game still draws every frame in Canvas 2D exactly as
// before. With the filter on, that finished frame is redrawn twice, canvas to
// canvas and in thin strips, so it never leaves the 2D pipeline (no WebGL
// context, no texture upload, no read-back). Pass 1 squeezes every row of the
// frame sideways by its own factor; pass 2 squeezes every column of that
// result up and down by its own. A curve drawn this way is a stack of straight
// strips, so the strips are cut thin enough that neighbours differ by under a
// pixel at the picture's far edge (CONFIG.crt.stripStep) and no step shows.
// Over that lies the veil: one more canvas, static, that carries the black of
// the rounded corners and the vignette (the glass's faint light over them was
// removed at SX's word, 2026-09-30).
// It is painted once for a canvas size
// (again once a resized window has settled) and never per frame; the browser
// blends it, and it takes no pointer. Nothing the game computes reads any of
// this back. V toggles it, and the choice is a display preference of this
// browser kept apart from the save.

// ------------------------------------------------------------------- bend ---

// Where a point of the SCREEN samples the flat frame, both in coordinates
// running -1..1 across the canvas. The bend is drawn in two passes, so it is
// defined as two: a screen column shows the frame's rows spread out by the
// square of its own distance from the middle (y' = y (1 + bend x^2)), and a
// screen row shows the frame's columns spread by the square of the frame row
// it shows (x' = x (1 + bend y'^2)). Straight edges bow outward and the
// corners are drawn in, and the frame is shrunk by `inset` so a thin black
// margin runs round the whole tube. Both directions have a closed form, and
// the strips below apply exactly this.
export function screenToFrame(sx, sy, cfg = CONFIG.crt) {
  const g = 1 + cfg.inset;
  const y = sy * (1 + cfg.bend * sx * sx) * g;
  return { x: sx * (1 + cfg.bend * y * y) * g, y };
}

// The inverse: where the screen shows a point of the flat frame. For the few
// things drawn in HTML over the canvas (a toast, the name field), so they sit
// where their place is drawn.
export function frameToScreen(fx, fy, cfg = CONFIG.crt) {
  const g = 1 + cfg.inset;
  const x = fx / ((1 + cfg.bend * fy * fy) * g);
  return { x, y: fy / ((1 + cfg.bend * x * x) * g) };
}

// The same, in pixels of a canvas `width` x `height`.
export function projectToScreen(x, y, width, height, cfg = CONFIG.crt) {
  const s = frameToScreen((x / width) * 2 - 1, (y / height) * 2 - 1, cfg);
  return { x: ((s.x + 1) / 2) * width, y: ((s.y + 1) / 2) * height };
}

// And back: the point of the flat frame the screen shows at a pixel, for the pointer.
export function unprojectFromScreen(x, y, width, height, cfg = CONFIG.crt) {
  const f = screenToFrame((x / width) * 2 - 1, (y / height) * 2 - 1, cfg);
  return { x: ((f.x + 1) / 2) * width, y: ((f.y + 1) / 2) * height };
}

// ------------------------------------------------------------------ strips ---

// The factor a strip is drawn at along its length, at position t (-1..1 across
// the picture): the same function in both passes.
const squeeze = (t, cfg) => 1 / ((1 + cfg.bend * t * t) * (1 + cfg.inset));

// How one pass cuts the picture. `length` is how many pixels the strips are
// stacked over, `across` how long each strip runs. Each strip gets one factor,
// the middle of the range the true factor covers over its pixels, so the strip
// is wrong by at most half that range at its far end; a strip is only made as
// thick as keeps that range under `stripStep` there (half a pixel of error, and
// neighbours never more than `stripStep` apart). Near the middle the bend is
// flat and one strip covers hundreds of rows; at the edges strips are a few
// rows thick. The cut is the same above and below the middle. Returns parallel
// arrays, top to bottom: the start and end pixel of each strip and the factor
// it is drawn at.
export function planStrips(length, across, cfg = CONFIG.crt) {
  const half = length / 2, reach = across / 2;
  // The true factor over the pixels [a, b): greatest at the pixel nearest the
  // middle, least at the farthest.
  const spread = (a, b) => {
    const near = a < half && b > half ? 0 : Math.min(Math.abs(a - half), Math.abs(b - half));
    const far = Math.max(Math.abs(a - half), Math.abs(b - half));
    return [squeeze(near / half, cfg), squeeze(far / half, cfg)];
  };
  const fits = (a, b) => { const [hi, lo] = spread(a, b); return (hi - lo) * reach <= cfg.stripStep; };

  // The outer half, outermost strip first, as [start, end]; a strip that can
  // carry the whole middle ends the walk.
  const outer = [];
  let middle = null;
  let a = 0;
  while (a < length - a) {
    if (fits(a, length - a)) { middle = [a, length - a]; break; }
    let b = a + 1;
    while (b < Math.floor(half) && fits(a, b + 1)) b++;
    outer.push([a, b]);
    a = b;
  }

  const strips = [...outer, ...(middle ? [middle] : []), ...outer.map(([s, e]) => [length - e, length - s]).reverse()];
  const plan = { count: strips.length, start: new Int32Array(strips.length), end: new Int32Array(strips.length), scale: new Float64Array(strips.length) };
  strips.forEach(([s, e], k) => {
    const [hi, lo] = spread(s, e);
    plan.start[k] = s;
    plan.end[k] = e;
    plan.scale[k] = (hi + lo) / 2;
  });
  return plan;
}

// ------------------------------------------------------------------ veil ---

// The glass's light that stood here (2026-09-30, «аккуратный блик имитирующий
// стекло кинескопа») is gone at SX's word the same day: «Блик дисплея из шейдера
// убери он некрасиво реализован и только мешает». The research it rested on
// stays in reports/2026-09-30-crt-glass-reflection.md.

// How much light the vignette takes at a point of the flat frame (coordinates
// running -1..1), 0 to `vignette`. SX, 2026-09-30: «виньетка растянута прям от
// центра экрана, она должна начинаться где-то на 200 пикселях от края экрана,
// сейчас виньетка затемняет весь экран целиком». So it is measured from the
// edges, in CSS pixels, not from the middle: nothing is taken further than
// `vignetteReach` from every edge, and from there each edge darkens on its own,
// eased in (the square of how far into the band, so its start has no edge and
// most of it sits by the rim). Two edges meeting in a corner multiply their
// shade, so the corners are deepest, at `vignette`; the middle of an edge takes
// `edgeShade` (a quarter of the light at 0.45). `size` is the picture in CSS
// pixels; without it the frame is taken as 1512 x 900, SX's full screen.
const edgeShade = (cfg = CONFIG.crt) => 1 - Math.sqrt(1 - cfg.vignette);
const SCREEN = { w: 1512, h: 900 };
export function vignetteAt(fx, fy, cfg = CONFIG.crt, size = SCREEN) {
  const e = edgeShade(cfg);
  const rx = Math.min(1, cfg.vignetteReach / (size.w / 2)), ry = Math.min(1, cfg.vignetteReach / (size.h / 2));
  const band = (v, reach) => {
    const u = ((v < 0 ? -v : v) - (1 - reach)) / reach;
    return u <= 0 ? 0 : u >= 1 ? 1 : u * u;
  };
  return 1 - (1 - e * band(fx, rx)) * (1 - e * band(fy, ry));
}

// Fills `data` (RGBA, `width` x `height`) with the veil, which the browser lays
// over the picture: black at alpha 1 outside the tube and `vignetteAt` inside
// it. The tube is the flat frame's rounded rectangle seen through the bend, its
// edge about a pixel wide. Alpha is rounded with a fixed noise (interleaved
// gradient noise), so the slow ramp dithers instead of banding. Made for the size of
// the canvas, once; slow enough (tens of ms) that it is never run per frame.
export function paintVeil(width, height, data, cfg = CONFIG.crt, size = { w: width, h: height }) {
  const g = 1 + cfg.inset, bend = cfg.bend;
  const halfW = width / 2, halfH = height / 2;
  const radius = cfg.corner * Math.min(width, height);
  const innerW = halfW - radius, innerH = halfH - radius;
  // The vignette's bands, as vignetteAt has them: where each starts, in frame units.
  const shade = edgeShade(cfg);
  const rx = Math.min(1, cfg.vignetteReach / (size.w / 2)), ry = Math.min(1, cfg.vignetteReach / (size.h / 2));
  const startX = 1 - rx, startY = 1 - ry, perX = 1 / rx, perY = 1 / ry;
  const colX = new Float64Array(width), colG = new Float64Array(width);
  for (let i = 0; i < width; i++) {
    const sx = ((i + 0.5) / width) * 2 - 1;
    colX[i] = sx * g;
    colG[i] = (1 + bend * sx * sx) * g;
  }
  let at = 3;
  for (let j = 0; j < height; j++) {
    const sy = ((j + 0.5) / height) * 2 - 1;
    for (let i = 0; i < width; i++, at += 4) {
      const y = sy * colG[i];
      const x = colX[i] * (1 + bend * y * y);
      // Distance past the rounded rectangle's straight sides, in frame pixels.
      const qx = (x < 0 ? -x : x) * halfW - innerW, qy = (y < 0 ? -y : y) * halfH - innerH;
      let cover = 1;
      if (qx > 0 || qy > 0) {
        const d = qx > 0 && qy > 0 ? Math.sqrt(qx * qx + qy * qy) - radius : Math.max(qx, qy) - radius;
        cover = d <= -0.5 ? 1 : d >= 0.5 ? 0 : 0.5 - d;
      }
      let ux = ((x < 0 ? -x : x) - startX) * perX, uy = ((y < 0 ? -y : y) - startY) * perY;
      ux = ux < 0 ? 0 : ux > 1 ? 1 : ux;
      uy = uy < 0 ? 0 : uy > 1 ? 1 : uy;
      const vignette = 1 - (1 - shade * ux * ux) * (1 - shade * uy * uy);
      const alpha = 1 - cover * (1 - vignette);
      const f = 0.06711056 * i + 0.00583715 * j;
      let n = 52.9829189 * (f - Math.floor(f));
      n -= Math.floor(n);
      data[at] = Math.min(255, Math.floor(alpha * 255 + n));
    }
  }
}
