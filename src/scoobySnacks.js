import { CONFIG } from './config.js';
import { clamp, TAU } from './util.js';

// The MYSTERY MACHINE's run (src/specialQuests.js `scooby`; SX, 2026-10-21: «появляются такого же типа же, как монетки, только в другом
// стиле, скуби-снеки. И появляется счетчик, сколько ты собрал. И квест надо собрать какое-то определенное количество ... они такой
// полоской, да, как будто трассы выложены по карте ... когда ты их забираешь, звук такой хрустящий, типа хрк, не как у монет»; his picks
// on labs/graphics/sketches/scooby-van.html: K1 LINE, «давай надо собрать 75 минимум из 100», «Таймер на весь квест»): the trails of
// snacks laid in the sector where the van was met, a snack's drawing, and the smoke out of the van's two pipes («чтобы у него и из левой, и
// из правой трубы дым валил, когда он едет»). The rules of the run (what is taken, the clock) are the handler's; here the geometry and
// the looks.

const C = () => CONFIG.quests.special.scooby;

// ---- the trails ----------------------------------------------------------------------------------------------------------

// A trail is a curve through its points (a Catmull-Rom spline), a snack every `gap` u along it, `count` of them from its start: each
// { x, y, angle } in the sector's units, `angle` the curve's heading there. Fewer than `count` when the curve is too short.
export function sampleTrail(points, gap, count) {
  const P = (i) => points[clamp(i, 0, points.length - 1)];
  const line = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      line.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  line.push({ x: points.at(-1)[0], y: points.at(-1)[1] });
  const out = [];
  let run = 0, next = 0;
  for (let i = 1; i < line.length && out.length < count; i++) {
    const a = line[i - 1], b = line[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    while (next <= run + len && out.length < count) {
      const u = len > 0 ? (next - run) / len : 0;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, angle: Math.atan2(b.y - a.y, b.x - a.x) });
      next += gap;
    }
    run += len;
  }
  return out;
}

// The trails of a run, laid in the pilot's sector (`world`'s, where the van stands at `site`): `trails` of them, each a walk of `legs`
// legs `leg` u long turning up to `turn` rad at each bend, its snacks (sampleTrail) clear of every planet, hole and station by `clear` u
// (World.clearance), inside the sector's `edge` margin, `apart` u from the other trails and from the van. Its points as fractions of the
// sector, as the plan keeps them; null when the sector has no room for them all.
export function layTrails(world, site, rng) {
  const c = C(), W = world.width, H = world.height, laid = [];
  const inside = (p) => p.x > c.edge * W && p.x < (1 - c.edge) * W && p.y > c.edge * H && p.y < (1 - c.edge) * H;
  const apart = (p) => laid.every((t) => t.snacks.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= c.apart))
    && Math.hypot(site.x - p.x, site.y - p.y) >= c.apart;
  for (let k = 0; k < c.trails; k++) {
    let found = null;
    for (let tries = 0; tries < c.tries && !found; tries++) {
      let x = (c.edge + rng() * (1 - 2 * c.edge)) * W, y = (c.edge + rng() * (1 - 2 * c.edge)) * H, a = rng() * TAU;
      const points = [[x, y]];
      for (let i = 0; i < c.legs; i++) {
        a += (rng() * 2 - 1) * c.turn;
        x += Math.cos(a) * c.leg; y += Math.sin(a) * c.leg;
        points.push([x, y]);
      }
      const snacks = sampleTrail(points, c.gap, c.per);
      if (snacks.length === c.per && snacks.every((p) => inside(p) && apart(p) && world.clearance(p.x, p.y, c.clear))) found = { points, snacks };
    }
    if (!found) return null;
    laid.push(found);
  }
  return laid.map((t) => t.points.map(([x, y]) => [x / W, y / H]));
}

// A plan's trails (fractions of a sector) as snacks in a sector `W` x `H` u: [{ x, y, angle, trail }], the trails one after another.
export function snacksOf(trails, W, H) {
  const c = C();
  return trails.flatMap((points, trail) => sampleTrail(points.map(([fx, fy]) => [fx * W, fy * H]), c.gap, c.per).map((p) => ({ ...p, trail })));
}

// How far a pilot flies to take `count` snacks (whole trails), from the van's place: to the nearer end of the nearest trail not run,
// along it, and on to the next, until the trails run hold `count`. The run's clock is this at the run's pace (CONFIG.quests.special.scooby
// `speed`) and its `slack`.
export function trailWay(from, snacks, count = snacks.length) {
  const trails = [...new Set(snacks.map((s) => s.trail))].map((t) => snacks.filter((s) => s.trail === t));
  const length = (list) => list.reduce((n, p, i) => n + (i ? Math.hypot(p.x - list[i - 1].x, p.y - list[i - 1].y) : 0), 0);
  let at = from, way = 0, run = 0;
  while (trails.length && run < count) {
    let best = 0, flip = false, near = Infinity;
    trails.forEach((t, i) => {
      for (const [end, rev] of [[t[0], false], [t.at(-1), true]]) {
        const d = Math.hypot(end.x - at.x, end.y - at.y);
        if (d < near) { near = d; best = i; flip = rev; }
      }
    });
    const t = trails.splice(best, 1)[0];
    way += near + length(t);
    run += t.length;
    at = flip ? t[0] : t.at(-1);
  }
  return way;
}

// ---- the snack's drawing ---------------------------------------------------------------------------------------------------

// SX's K1 LINE: a bone outlined in the loose coin's thin strokes (sprites/credit.json's family), four round knobs, in a biscuit's browns
// and not the coin's gold, turning in place as if tossed (each its own phase along its trail).
const SNACK = Object.freeze({
  glyphs: ['╭╮    ╭╮', '╰┼────┼╯', '╭┼────┼╮', '╰╯    ╰╯'],
  inks: ['aa    aa', 'abbbbbba', 'abbbbbba', 'aa    aa'],
});
const SNACK_CELLS = (() => {
  const h = SNACK.glyphs.length, w = SNACK.glyphs[0].length, out = [];
  SNACK.glyphs.forEach((row, j) => Array.from(row).forEach((ch, i) => {
    if (ch !== ' ') out.push({ x: i - (w - 1) / 2, y: j - (h - 1) / 2, ch, key: SNACK.inks[j][i] });
  }));
  return Object.freeze(out);
})();
// What a snack breaks into when it is taken: its knobs and crumbs, in its own inks (`raw`: drawn as they are, src/particles.js). No stroke
// of its outline: two corners flying apart read as the focus box's corners.
export function snackBits() {
  const a = C().art;
  return [['o', a.knob], ['o', a.knob], ['∘', a.knob], [',', a.body], ['·', a.knob], ['\'', a.body], ['.', a.body], [',', a.knob]]
    .map(([ch, color]) => ({ ch, color, raw: true }));
}

// One snack at (sx, sy) on the screen, turned by `angle`, `alpha` its fade.
export function drawSnack(r, sx, sy, angle, alpha = 1) {
  const a = C().art, s = a.scale, w = r.cellW * s, h = r.cellH * s, ca = Math.cos(angle), sa = Math.sin(angle);
  for (const c of SNACK_CELLS) {
    const lx = c.x * w, ly = c.y * h;
    r.glyphRot(c.ch, sx + lx * ca - ly * sa, sy + lx * sa + ly * ca, angle, c.key === 'a' ? a.knob : a.body, alpha, s);
  }
}
export const snackSpin = (t, i) => t * C().art.spin + i * 0.7;

// ---- the van's smoke ------------------------------------------------------------------------------------------------------

// A number in [0, 1) from two counters, the same every time: the puffs' scatter, which nothing in the simulation reads (no stream of the
// world's chance is spent on a look).
const hash = (a, b) => {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

// The van's pipes: the cells of its drawing that are '"', in cells about its pivot.
export const pipesOf = (model) => (model.frames?.length > 1 ? model.frames[model.idleFrame] : model.cells).filter((c) => c.ch === '"');

// A step of the smoke `q` ({ puffs, due, n }): the puffs drift and slow; while the van moves (its drive on, or faster than `moving` u/s),
// a puff out of each pipe every `every` s (half as often coasting), thrown back off it with a scatter. `cell` the drawing's cell in u.
export function stepSmoke(q, ship, pipes, cell, dt) {
  const S = C().smoke, k = Math.max(0, 1 - S.drag * dt);
  for (const p of q.puffs) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= k; p.vy *= k; }
  q.puffs = q.puffs.filter((p) => p.age < S.life);
  const speed = Math.hypot(ship.vx, ship.vy), on = ship.alive && (ship.thrusting || speed > S.moving);
  if (!on || !pipes.length) { q.due = 0; return; }
  const every = ship.thrusting ? S.every : S.every * 2;
  const a = ship.facing, ca = Math.cos(a), sa = Math.sin(a), back = ship.angle + Math.PI;
  for (q.due -= dt; q.due <= 0; q.due += every, q.n++) {
    pipes.forEach((c, i) => {
      const lx = c.x * cell.w, ly = (c.y + 0.5) * cell.h, turn = back + (hash(q.n, i) - 0.5) * 2 * S.scatter, v = S.speed * (0.7 + 0.6 * hash(i, q.n));
      q.puffs.push({ x: ship.x + lx * ca - ly * sa, y: ship.y + lx * sa + ly * ca,
        vx: ship.vx * S.carry + Math.cos(turn) * v, vy: ship.vy * S.carry + Math.sin(turn) * v, age: 0 });
    });
  }
  if (q.puffs.length > S.max) q.puffs.splice(0, q.puffs.length - S.max);
}

// The puffs, each through `glyphs` as it ages, growing and thinning out. `project` the world's (x, y) to the screen.
export function drawSmoke(r, q, project) {
  const S = C().smoke;
  for (const p of q.puffs) {
    const u = p.age / S.life, g = S.glyphs[Math.min(S.glyphs.length - 1, Math.floor(u * S.glyphs.length))], at = project(p.x, p.y);
    r.glyph(g, at.x, at.y, S.ink, S.alpha * (1 - u) * (1 - u * 0.4), 1 + u * S.grow);
  }
}
