// Fuel lies loose as oil (SX, 2026-10-01): «Я бы делал пузыри какие с нефтью какие-то темно-синие», then
// «Сделай их типа угловатыми, шейдами просто ... яркий шейд и более разряженный шейд вокруг него. И не надо как
// бы пузыри ровно круглые делать», and «Попробуй еще сделать физику такую, что они разлетаются, как капельки, но
// космос, при столкновении, заставляет их типа собираться в одну кучку. Вот это будет круто работать». The
// sheets SX chose from are labs/graphics/sketches/oil-shades.html (and the three rounds before it).
//
// A fuel drop (World.drops, `kind: 'fuel'`) holds `units` of fuel. Its size follows them (its area holds the
// fuel), so drops that run together make one that is bigger. The physics (CONFIG.asteroid.drops.oil): a drop
// just thrown out flies apart with the scatter for `settle` s; after that, drops near each other draw together
// and two that touch become one, its fuel the sum, its momentum both of theirs.
//
// It is drawn on the cell grid in shade glyphs, never a round glyph or an outline: SX's pick, THREE STEPS, LIT
// (2026-10-01: «второй вариант ... надо все-таки сделать смещение блика в какую-то сторону ... в зависимости от
// того, где у нас источник света в игре»): a sparse shade at the rim, a dense shade inside, a solid heart moved
// toward the game's light (the planets' and the rocks' upper left), and the side away from it a step darker. Since
// 2026-10-08 the loose drops are two inks and no light (DROP_LOOK below); the tank's oil keeps the lit look.
// Its shape is a field: each drop adds its radius squared over its distance squared, its radius wobbling slowly
// round it, so two drops that near each other swell together before they touch and no drop is quite round. The grid is
// half the game's cell and stays put in the world: the drops move through it, as the rocks' and planets'
// shading does.

import { CONFIG } from './config.js';
import { TAU } from './util.js';
import { PALETTE } from './palette.js';
import { clearGroundPath } from './groundMath.js';

// The look (labs/graphics/sketches/oil-shades.js, THREE STEPS, LIT). Field levels: `rim` and over is the sparse
// shade, `body` (1, a lone drop's edge) and over the dense one; `heart` and over, read with the middles moved
// `shift` radii toward the light, is the solid heart; a cell whose field away from the light is `shade` times
// the field toward it is on the dark side. Inks: the palette's blue at the heart and two darker blues. (INDIGO, a
// darker violet, was tried the same evening on SX's «перекрасить ... в какой-то более темный синий» and taken back:
// «может, все-таки вернем старый цвет»; it and three others wait on labs/graphics/sketches/oil-shades.html.)
export const OIL_LOOK = Object.freeze({
  heartCell: { ch: '█', ink: PALETTE.blue },   // the palette's blue
  bodyCell: { ch: '▓', ink: '#2C5290' },
  darkCell: { ch: '▓', ink: '#1E3866' },
  rimCell: { ch: '░', ink: '#2C5290' },
  rim: 0.45, body: 1, heart: 2.2, shift: 0.45, shade: 1.25, cell: 0.5,
});

// The loose drops' own look since SX, 2026-10-08 («Капли для заправки должны выглядеть проще, они слишком 3д из за 3х цветов наверное,
// слишком объемными кажутся, надо на 1 цвет меньше и я думаю самые маленькие капли должны быть не больше монетки, возможно стоит сделать
// их темнее»): two inks, no light (a dense body and its solid middle in OIL_LOOK's body blue, the sparse rim a step darker), the bright
// heart and the side away from the light gone; drawn at `size` of their radius, so the smallest (a rock's two units, 54 u across before)
// is a loose coin's size (about 36 u). Only the drawing: the drops' reach, merging and bodies keep oilRadius. The tank's oil
// (src/tankOil.js) keeps OIL_LOOK.
export const DROP_LOOK = Object.freeze({
  heartCell: { ch: '█', ink: OIL_LOOK.bodyCell.ink },
  bodyCell: { ch: '▓', ink: OIL_LOOK.bodyCell.ink },
  rimCell: { ch: '░', ink: OIL_LOOK.darkCell.ink },
  size: 2 / 3,
});

// A drop's radius in u, by the fuel it holds.
export const oilRadius = (units) => {
  const O = CONFIG.asteroid.drops.oil;
  return O.radius * Math.sqrt(Math.max(0, units) / O.unit);
};

// Drops near each other draw together, and two that touch run into one (World.stepDrops calls it after they
// move). The heavier moves less. A merged drop keeps the younger one's age, so it lasts as long as it.
export function poolOil(world, dt) {
  const O = CONFIG.asteroid.drops.oil, drops = world.drops;
  const oil = [];
  for (const d of drops) if (d.kind === 'fuel' && d.age >= O.settle && !(d.delay > 0)) oil.push(d);
  if (oil.length < 2) return;
  for (let i = 0; i < oil.length; i++) {
    for (let j = i + 1; j < oil.length; j++) {
      const a = oil[i], b = oil[j];
      const g = world.delta(b.x, b.y, a.x, a.y), dist = Math.hypot(g.x, g.y);
      if (dist >= O.reach || dist < 1e-6 || !clearGroundPath(world, a, b)) continue;
      const f = (O.pull * (1 - dist / O.reach) * dt) / dist, m = a.units + b.units;
      a.vx += g.x * f * (2 * b.units / m); a.vy += g.y * f * (2 * b.units / m);
      b.vx -= g.x * f * (2 * a.units / m); b.vy -= g.y * f * (2 * a.units / m);
    }
  }
  for (let i = 0; i < oil.length; i++) {
    const a = oil[i];
    if (a.gone) continue;
    for (let j = i + 1; j < oil.length; j++) {
      const b = oil[j];
      if (b.gone) continue;
      const g = world.delta(b.x, b.y, a.x, a.y);
      if (Math.hypot(g.x, g.y) > (oilRadius(a.units) + oilRadius(b.units)) * O.merge) continue;
      if (!clearGroundPath(world, a, b)) continue;
      const m = a.units + b.units;
      a.x += (g.x * b.units) / m; a.y += (g.y * b.units) / m;
      a.vx = (a.vx * a.units + b.vx * b.units) / m; a.vy = (a.vy * a.units + b.vy * b.units) / m;
      a.units = m;
      a.age = Math.min(a.age, b.age);
      a.swell = O.swell;
      b.gone = true;
    }
  }
  for (let i = drops.length - 1; i >= 0; i--) if (drops[i].gone) drops.splice(i, 1);
}

// Every fuel drop in `drops`, drawn through the field (see above). `project(x, y)` puts a world point on the
// screen; the grid is anchored to the world, so it is the same cells whichever drop is drawn. `t` is the clock the
// wobble runs on. A drop in its last `fadeFrom` seconds shrinks away instead of fading.
export function drawOil(r, drops, project, t) {
  if (!drops.length) return;
  const L = OIL_LOOK, K = DROP_LOOK, D = CONFIG.asteroid.drops;
  const uw = r.cellW * L.cell, uh = r.cellH * L.cell;
  // One field (the light's two went with SX's two inks, 2026-10-08).
  const field = new Map();
  const add = (map, key, v) => map.set(key, (map.get(key) || 0) + v);
  let any = null;
  for (const d of drops) {
    const s = project(d.x, d.y);
    if (!s) continue;
    const left = D.life - d.age;
    const R = oilRadius(d.units) * K.size * (1 + (d.swell || 0) * 0.5) * Math.min(1, Math.max(0.15, left / D.fadeFrom));
    const reach = R * 1.9;
    if (!r.onScreen(s.x, s.y, reach)) continue;
    any = any || { ox: s.x - d.x, oy: s.y - d.y };
    // The wobble: two slow waves round the drop, from its own phase, worked out once a drop and a frame
    // (sin and cos of 2a and 3a come from the cell's direction, not from an angle).
    const ph = d.phase * TAU;
    const w3 = 3 * ph + t * 1.7, w2 = -2 * ph - t * 1.1;
    const s3 = Math.sin(w3), c3 = Math.cos(w3), s2 = Math.sin(w2), c2 = Math.cos(w2);
    const i0 = Math.floor((d.x - reach) / uw), i1 = Math.floor((d.x + reach) / uw);
    const j0 = Math.floor((d.y - reach) / uh), j1 = Math.floor((d.y + reach) / uh);
    for (let j = j0; j <= j1; j++) {
      const dy = (j + 0.5) * uh - d.y;
      for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) * uw - d.x;
        const q = dx * dx + dy * dy;
        if (q > reach * reach) continue;
        const n = Math.sqrt(q) || 1, c = dx / n, sn = dy / n;
        // sin(3a + w3) and sin(2a + w2), from cos a and sin a.
        const sin3a = 3 * sn - 4 * sn * sn * sn, cos3a = 4 * c * c * c - 3 * c;
        const sin2a = 2 * sn * c, cos2a = c * c - sn * sn;
        const wob = 1 + 0.14 * (sin3a * c3 + cos3a * s3) + 0.08 * (sin2a * c2 + cos2a * s2);
        const R2 = (R * wob) ** 2;
        const key = (j + 32768) * 65536 + (i + 32768);
        add(field, key, R2 / (q + 1));
      }
    }
  }
  if (!any) return;
  for (const [key, f] of field) {
    if (f < L.rim) continue;
    const i = (key % 65536) - 32768, j = Math.floor(key / 65536) - 32768;
    const look = f < L.body ? K.rimCell : f >= L.heart ? K.heartCell : K.bodyCell;
    r.glyph(look.ch, any.ox + (i + 0.5) * uw, any.oy + (j + 0.5) * uh, look.ink, 1, L.cell);
  }
}
