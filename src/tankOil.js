// Oil held in a tank: the loose oil's drops (src/oil.js) shut inside walls (chat H, 2026-10-04). SX's picks: the garage's tank
// (labs/graphics/sketches/garage-edits.html, G11: «вода в канистре ... должна быть физика такая, как у нашей капли с нефтью ...
// побольше ... посветлее») and the fuel droid R08B TANKER that carries its oil the same way (droids-v2.html, S2: «ты как в
// гараже в него можешь жидкость налить»). One module for both: the droid's (src/droids.js drawDroid) and the garage's (chat G).
//
// Look only: nothing here is read by the world, and it keeps no state on the world's objects (the droid's oil hangs off the
// drawing). Positions are px in the tank's own frame (its middle at 0, 0, unturned), at the size it is drawn.
//
//   createTankOil(box, { shape, units, seed })   the oil pooled in one drop in the middle (the drawing at rest)
//   splitTankOil(oil)                          thrown apart into three or four, as a knock splits a drop; they pool again
//   stepTankOil(oil, dt, ax, ay)               the tank's acceleration (px/s², its frame) shakes it: the oil lags behind
//   drawTankOil(r, oil, at)                    through the loose oil's field, on its half-cell grid, where `at.shows` lets it

import { CONFIG } from './config.js';
import { TAU, mulberry32 } from './util.js';
import { PALETTE } from './palette.js';
import { OIL_LOOK, oilRadius } from './oil.js';

// The loose oil's inks a step up the same blues (SX, G11: «ее посветлее»): the heart the garage's solar blue, the body the
// palette's blue the loose oil's heart is.
export const TANK_OIL = Object.freeze({ ...OIL_LOOK,
  heartCell: { ch: '█', ink: '#86B4D6' }, bodyCell: { ch: '▓', ink: PALETTE.blue }, darkCell: { ch: '▓', ink: '#2C5290' }, rimCell: { ch: '░', ink: PALETTE.blue } });
const LIGHT = (() => { const L = CONFIG.planet.light, n = Math.hypot(L.x, L.y); return { x: L.x / n, y: L.y / n }; })();

// `box` { x0, x1, y0, y1 }: the tank's inside; `shape` 'box' or 'round' (the ellipse in that box). `units` of oil, or about half the
// inside by default.
export function createTankOil(box, { shape = 'box', units = null, seed = 1 } = {}) {
  const area = (box.x1 - box.x0) * (box.y1 - box.y0) * (shape === 'round' ? Math.PI / 4 : 1);
  const O = CONFIG.asteroid.drops.oil;
  const R = Math.sqrt(0.5 * area / Math.PI) / 1.2;
  const u = units ?? O.unit * (R / O.radius) ** 2;
  return { box, shape, units: u, seed, rng: mulberry32(seed), t: 0, calm: 0,
    drops: [{ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, vx: 0, vy: 0, units: u, phase: 0, swell: 0 }] };
}

// Thrown apart: they fly apart for the loose oil's `settle` (as the world's drops do, src/oil.js poolOil), then pool back.
export function splitTankOil(oil) {
  const rng = oil.rng, b = oil.box;
  oil.calm = CONFIG.asteroid.drops.oil.settle;
  const n = 3 + Math.floor(rng() * 2), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  oil.drops = Array.from({ length: n }, (_, k) => {
    const a = rng() * TAU, v = 25 + rng() * 35;
    return { x: cx + (k / (n - 1) - 0.5) * (b.x1 - b.x0) * 0.6, y: cy + (rng() - 0.5) * (b.y1 - b.y0) * 0.4,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, units: oil.units / n, phase: k / n, swell: 0 };
  });
}

// One step: drops draw together, run into one and keep inside the walls (a box, or the ellipse of a round tank).
export function stepTankOil(oil, dt, ax = 0, ay = 0) {
  if (!oil || !(dt > 0)) return;
  oil.t += dt;
  const O = CONFIG.asteroid.drops.oil, b = oil.box, drops = oil.drops;
  const drag = Math.exp(-0.7 * dt);
  for (const q of drops) {
    q.vx -= ax * dt; q.vy -= ay * dt;
    q.vx *= drag; q.vy *= drag;
  }
  const calm = oil.calm > 0;
  oil.calm = Math.max(0, oil.calm - dt);
  if (!calm) for (let i = 0; i < drops.length; i++) for (let j = i + 1; j < drops.length; j++) {
    const a = drops[i], c = drops[j], gx = c.x - a.x, gy = c.y - a.y, dist = Math.hypot(gx, gy);
    if (dist >= O.reach || dist < 1e-6) continue;
    const f = (O.pull * (1 - dist / O.reach) * dt) / dist, m = a.units + c.units;
    a.vx += gx * f * (2 * c.units / m); a.vy += gy * f * (2 * c.units / m);
    c.vx -= gx * f * (2 * a.units / m); c.vy -= gy * f * (2 * a.units / m);
  }
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, hw = (b.x1 - b.x0) / 2, hh = (b.y1 - b.y0) / 2;
  for (const q of drops) {
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.swell = Math.max(0, q.swell - dt * 0.8);
    const r = oilRadius(q.units) * 0.7, rx = Math.max(1, hw - Math.min(r, hw * 0.8)), ry = Math.max(1, hh - Math.min(r, hh * 0.8));
    if (oil.shape === 'round') {
      const ux = (q.x - cx) / rx, uy = (q.y - cy) / ry, d = Math.hypot(ux, uy);
      if (d > 1) {
        q.x = cx + (ux / d) * rx; q.y = cy + (uy / d) * ry;
        const nx = ux / d, ny = uy / d, out = q.vx * nx + q.vy * ny;
        if (out > 0) { q.vx -= 1.25 * out * nx; q.vy -= 1.25 * out * ny; }
      }
    } else {
      if (q.x < cx - rx) { q.x = cx - rx; q.vx = Math.abs(q.vx) * 0.25; }
      if (q.x > cx + rx) { q.x = cx + rx; q.vx = -Math.abs(q.vx) * 0.25; }
      if (q.y < cy - ry) { q.y = cy - ry; q.vy = Math.abs(q.vy) * 0.25; }
      if (q.y > cy + ry) { q.y = cy + ry; q.vy = -Math.abs(q.vy) * 0.25; }
    }
  }
  if (!calm) for (let i = 0; i < drops.length; i++) {
    const a = drops[i];
    if (a.gone) continue;
    for (let j = i + 1; j < drops.length; j++) {
      const c = drops[j];
      if (c.gone || Math.hypot(c.x - a.x, c.y - a.y) > (oilRadius(a.units) + oilRadius(c.units)) * O.merge) continue;
      const m = a.units + c.units;
      a.x += ((c.x - a.x) * c.units) / m; a.y += ((c.y - a.y) * c.units) / m;
      a.vx = (a.vx * a.units + c.vx * c.units) / m; a.vy = (a.vy * a.units + c.vy * c.units) / m;
      a.units = m; a.swell = O.swell; c.gone = true;
    }
  }
  oil.drops = drops.filter((q) => !q.gone);
}

// What drawTankOil works in, kept from frame to frame (the oil is drawn every frame its tank is in view): the three sums of each cell of
// the box the drops reach, and the cells in the order they were first touched (a Map's order, which the drawing order follows). They
// were three Maps of boxed numbers made each call, ~45 KB of garbage a frame beside the droid R08B (2026-10-09). `stamp` says whether
// a cell was touched in this call, so none is cleared; the box is one a tank's own drops cannot overrun (CELLS_MOST holds a corrupt
// oil from making a gigantic one).
const CELLS_MOST = 1 << 20;
let sumField = new Float64Array(0), sumToward = new Float64Array(0), sumAway = new Float64Array(0);
let stamp = new Int32Array(0), order = new Int32Array(0), stampNow = 0;

// Drawn through the loose oil's own field (src/oil.js drawOil), on its half-cell grid in the tank's frame, at screen (at.x, at.y)
// turned by `at.angle`, its glyphs `at.scale` of a cell; `at.shows(x, y)` says whether a point of the frame is inside the tank
// where it can be seen (the drawing's tank cells, the part out of the stone).
export function drawTankOil(r, oil, { x: sx, y: sy, angle = 0, scale = 1, shows = () => true }) {
  if (!oil) return;
  const OL = TANK_OIL, uw = r.cellW * OL.cell * scale, uh = r.cellH * OL.cell * scale, t = oil.t;
  const lc = Math.cos(-angle), ls = Math.sin(-angle);
  const lightX = LIGHT.x * lc - LIGHT.y * ls, lightY = LIGHT.x * ls + LIGHT.y * lc;
  const drops = oil.drops;
  // The cells every drop's reach covers, as one box.
  let bi0 = Infinity, bi1 = -Infinity, bj0 = Infinity, bj1 = -Infinity;
  for (const d of drops) {
    const reach = oilRadius(d.units) * (1 + (d.swell || 0) * 0.5) * scale * 1.9;
    bi0 = Math.min(bi0, Math.floor((d.x - reach) / uw)); bi1 = Math.max(bi1, Math.floor((d.x + reach) / uw));
    bj0 = Math.min(bj0, Math.floor((d.y - reach) / uh)); bj1 = Math.max(bj1, Math.floor((d.y + reach) / uh));
  }
  const W = bi1 - bi0 + 1, area = W * (bj1 - bj0 + 1);
  if (!(area > 0 && area <= CELLS_MOST)) return;
  if (area > sumField.length) {
    sumField = new Float64Array(area); sumToward = new Float64Array(area); sumAway = new Float64Array(area);
    stamp = new Int32Array(area); order = new Int32Array(area); stampNow = 0;
  }
  stampNow++;
  let touched = 0;
  for (const d of drops) {
    const R = oilRadius(d.units) * (1 + (d.swell || 0) * 0.5) * scale, reach = R * 1.9, x0 = d.x, y0 = d.y;
    const ph = d.phase * TAU, w3 = 3 * ph + t * 1.7, w2 = -2 * ph - t * 1.1;
    const s3 = Math.sin(w3), c3 = Math.cos(w3), s2 = Math.sin(w2), c2 = Math.cos(w2);
    const lx = lightX * R * OL.shift, ly = lightY * R * OL.shift;
    const i0 = Math.floor((x0 - reach) / uw), i1 = Math.floor((x0 + reach) / uw);
    const j0 = Math.floor((y0 - reach) / uh), j1 = Math.floor((y0 + reach) / uh);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) * uw - x0, dy = (j + 0.5) * uh - y0, q = dx * dx + dy * dy;
      if (q > reach * reach) continue;
      const n = Math.sqrt(q) || 1, cc = dx / n, sn = dy / n;
      const sin3a = 3 * sn - 4 * sn ** 3, cos3a = 4 * cc ** 3 - 3 * cc, sin2a = 2 * sn * cc, cos2a = cc * cc - sn * sn;
      const wob = 1 + 0.14 * (sin3a * c3 + cos3a * s3) + 0.08 * (sin2a * c2 + cos2a * s2);
      const R2 = (R * wob) ** 2, cell = (j - bj0) * W + (i - bi0);
      if (stamp[cell] !== stampNow) { stamp[cell] = stampNow; order[touched++] = cell; sumField[cell] = 0; sumToward[cell] = 0; sumAway[cell] = 0; }
      sumField[cell] += R2 / (q + 1);
      sumToward[cell] += R2 / ((dx - lx) ** 2 + (dy - ly) ** 2 + 1);
      sumAway[cell] += R2 / ((dx + lx) ** 2 + (dy + ly) ** 2 + 1);
    }
  }
  const c = Math.cos(angle), s = Math.sin(angle), turned = Math.abs(angle) > 0.01;
  for (let n = 0; n < touched; n++) {
    const cell = order[n], f = sumField[cell];
    if (f < OL.rim) continue;
    const i = bi0 + (cell % W), j = bj0 + Math.floor(cell / W);
    const x = (i + 0.5) * uw, y = (j + 0.5) * uh;
    if (!shows(x, y)) continue;
    const lit = sumToward[cell], dark = sumAway[cell];
    const look = f < OL.body ? OL.rimCell : lit >= OL.heart ? OL.heartCell : dark > lit * OL.shade ? OL.darkCell : OL.bodyCell;
    const px = sx + x * c - y * s, py = sy + x * s + y * c;
    if (turned) r.glyphRot(look.ch, px, py, angle, look.ink, 1, OL.cell * scale);
    else r.glyph(look.ch, px, py, look.ink, 1, OL.cell * scale);
  }
}
