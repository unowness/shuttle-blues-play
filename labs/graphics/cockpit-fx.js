import { ROLES, PALETTE } from '../../src/roles.js';
import { BAR } from './cockpit-bar.js';
import { noise3 as hash } from '../../src/util.js';

// The cockpit wears the hull's damage (SX, 2026-10-01, in the lab: first «приборной панели ... синих [линий], которые
// состоят из немного подвижных линий с маленьким количеством разрывов ... когда корабль взрывается ... чтобы приборная
// панель тряслась, и от нее отлетали детали»; then «давай у панели будет просто состояние меняющееся каждые 20 хп ...
// есть совсем разбитая панель ... от 0 до 20 и так далее. И когда у тебя 100 хп, и до 80 хп у тебя совсем целая
// панель ... больше мотивации починить корабль»).
//
// The hull's share picks a level in steps of a fifth (`damageLevel`): 0 whole, from 80 % of the hull up; 1 under 80 %;
// 2 under 60 % (where a wreck brings the ship back, at half); 3 under 40 %; 4 under 20 %, all but broken.
//
// What the bars show (SX, 2026-10-01, on labs/graphics/sketches/cockpit-wear.html: «шейдинг ... движущимися линиями
// ... редкие ... по одной на грань ... когда корабль разворачивается или трясется, они ... едут по этой грани ... у
// боковых панелей, которые под углом, чуть меньше скорость ... У тех, которые горизонтальные, чуть быстрее ... В
// версии C неплохие разрывы ... хочу, чтобы еще и в собранном виде были вот такие блики разрывами ... совсем разбитая
// эта версия F с искорками. По средней разбитости это версия C»):
//   - glints, at every level: a break cut across the bar as C cut it, one to a corner (a slanted length and the level one
//     it turns into, `glintPaths`), riding the corner as one path, round the bend; each its own width, a few px or a
//     dozen, and each off the bars a good part of its round, so only a few show at once (SX, on the tries: «Многовато
//     бликов ... на один угол ... не стоит бликом добавлять точки ... чуть замедлить», then «опять их много, и некоторые
//     должны быть короткие, некоторые пошире ... крупнее бликов меньше»). They stand still while the ship does and move
//     as it turns or shakes, one light for the whole cockpit: `cockpitLight` is how far it has moved, in px of a level
//     length; a slanted length takes the move at `glintSpeed` of that, less the steeper it is;
//   - damage, at fixed places (`cockpitSpots`, fewer on the slanted lengths), `DAMAGE.damaged[level]` of them, the worse
//     level's added to the last's: dents in C's way (a short length pushed DAMAGE.dent px out of its line) while the
//     hull holds; from level 3 the oldest `DAMAGE.broken[level]` broken through, large, either a hole or a length
//     knocked out of its line, each by its own measure (`BREAKS`; SX: «больше поломанная ... слишком одинаковые ... всё
//     слишком мелкое ... сломы крупнее, сильнее. Вот такие под углом сломы не делай, делай просто смещение ... либо
//     дыры, либо смещение. И больше искр»);
//   - E's sparks from the damaged places from level 2 on, at more places and more often at each worse level (SX:
//     «Начинай искорки делать. Начиная с 40-60, но ... все чаще и чаще»).
// When the level worsens, the cockpit shakes (`SHAKE`, harder at a wreck) and the pieces of the places that broke
// through are flung up, turning, falling and fading. A repair mends them again.
//
// In the game and the lab since SX accepted it (2026-10-01: «Кабина отличная ... Все прям можно принимать»); the lab's
// drawer switches `wear` (the glints and the damage) and `shake` (the shake and the pieces) apart.
export const COCKPIT_FX = { wear: false, shake: false, now: 0, reducedMotion: false, jolt: 0, hullShare: 1 };
// `size` is a dent's length; a break is `breakScale` times its place's size. `slant` is how much less often a place falls
// on a slanted length than on a level one. Sparks by level: the share of the damaged places that throw them, how often
// (a cycle of so many seconds), and how many at a time.
export const DAMAGE = Object.freeze({ damaged: [0, 3, 6, 10, 16], broken: [0, 0, 0, 5, 16], spots: 20, size: [8, 18], dent: 3,
  breakScale: 2, shove: [4, 9], slant: 0.3, lateShoves: 0.8, lateHole: 1.2,
  // The corners by the helm, where a slanted length turns into the console's line: how many are knocked at each level
  // (SX: «пару сломов у V2 и V3 в районе штурвала еще. На углах»), how far from the corner the bar is cut (`reach`),
  // and how far the knocked corner is moved, across and down (`push`).
  corners: [0, 0, 1, 2, 2], corner: { reach: 14, short: 3, push: [[3, 7], [2, 5]] },
  // Earlier and stronger since SX, 2026-10-02 («идею с искрами нужно развить сейчас они появляются поздно и слабые на последней
  // стадии»; they began at the second level, three or six 2 px dots that went 9 px): from the first level, more and more often,
  // each spark a dot of 2 or 3 px thrown out and up and falling on `gravity`, white then amber then the caution orange, for
  // `shown` of its cycle; `speed` px/s.
  sparks: { share: [0, 0.25, 0.5, 0.75, 1], cycle: [null, [4, 7], [2.2, 3.8], [1.2, 2.2], [0.5, 1.1]], count: [0, 3, 5, 8, 12], shown: 0.32,
    speed: [40, 120], gravity: 260 } });
// A blow to the hull (SX, the same evening: «придай ей больше тряски при столкновениях, особенно сильных»): the cockpit is
// thrown `base` px and `perPoint` more for each hull point lost, at most `max`, dying away over `time` s plus `timePerPoint`
// for each point; and a burst of `burst` sparks plus `burstPerPoint` a point (at most `burstMax`) from the bars, for `burstLife` s.
const KNOCK = Object.freeze({ base: 2, perPoint: 1.1, max: 15, time: 0.45, timePerPoint: 0.04, rate: 37,
  burst: 4, burstPerPoint: 2, burstMax: 30, burstLife: 0.7 });
// A failing hull trembles (SX: «после 30 хп и ниже уже постепенно начинается потяска этой панели»): from `from` of the hull
// down, the cockpit shakes all the time, `start` px at once (on whole pixels, a twitch now and then) and up to `max` px at
// nothing left, growing as the `power` of how far below it is.
export const TREMOR = Object.freeze({ from: 0.3, start: 0.7, max: 4, power: 1.2 });
// A glint: one break across the bar (the break a shine leaves in an inked outline), `cuts` px long by its own number,
// cut parallel to the cockpit's depth lines (cockpit-frame.js DEPTH: 45 degrees, down and outward), so on the left half
// every glint leans one way and on the right half the mirror way, as the depth lines do (SX: «сделать их угловыми ...
// в одну сторону все», then «углы у бликов не соответствуют углам, которые мы нарисовали для объема ... должны быть
// такие же ... перспективу»). Kept `inset` px off a length's ends; `rest` the share of its round it spends off the
// bars, so fewer show at once.
// `travel` px of a level length per radian the ship turns; `plumb` is the share a plumb length would take, so a 2:1
// slant takes 0.55 + 0.45 x 0.447 = 0.75 of it. A shake moves the light `shake` px per px the cockpit is thrown, and
// a jolted hull (a blow) trembles it `jolt` px.
export const GLINT = Object.freeze({ cuts: [3, 6, 12], rest: 0.8, inset: 6, travel: 16, plumb: 0.55, shake: 3, jolt: 7 });
export const SHAKE = Object.freeze({ amount: 3, perLevel: 1.5, wreck: 8, time: 0.9, rate: 31, life: 1.6, gravity: 520, speed: [140, 380], spin: 5 });

// The level a hull of `hull` out of `max` shows.
export function damageLevel(hull, max) {
  const share = max > 0 ? hull / max : 1;
  return share >= 0.8 ? 0 : share >= 0.6 ? 1 : share >= 0.4 ? 2 : share >= 0.2 ? 3 : 4;
}

// The straight lengths of the bars (polylines): where each starts, its direction and how long it is.
export function barLengths(bars) {
  const lengths = [];
  bars.forEach((bar, b) => {
    for (let i = 0; i < bar.length - 1; i++) {
      const [ax, ay] = bar[i], [bx, by] = bar[i + 1], len = Math.hypot(bx - ax, by - ay);
      if (len >= 1) lengths.push({ index: lengths.length, bar: b, ax, ay, ux: (bx - ax) / len, uy: (by - ay) / len, len });
    }
  });
  return lengths;
}

// How fast a glint rides a length, for a light that moves 1 px along a level one: the steeper, the slower.
export const glintSpeed = (ux) => GLINT.plumb + (1 - GLINT.plumb) * Math.abs(ux);

// The paths the glints ride, one glint each: a bar's lengths two by two, each slanted length with the level one it
// turns into (a corner); the bars of one length (the console's pieces between the instruments) together as one.
export function glintPaths(lengths) {
  const paths = [], singles = [], byBar = new Map();
  for (const l of lengths) { if (!byBar.has(l.bar)) byBar.set(l.bar, []); byBar.get(l.bar).push(l); }
  for (const ls of byBar.values()) {
    if (ls.length === 1) singles.push(ls[0]);
    else for (let i = 0; i < ls.length; i += 2) paths.push(ls.slice(i, i + 2));
  }
  if (singles.length) paths.push(singles);
  return paths;
}
const level = (l) => Math.abs(l.ux) > 0.9;
// The depth lines' direction on the left half (down and to the left) and on the right half (down and to the right).
const DEPTH_LEFT = [-Math.SQRT1_2, Math.SQRT1_2], DEPTH_RIGHT = [Math.SQRT1_2, Math.SQRT1_2];

// Where the damage goes, worst level first to last: DAMAGE.spots places on the bars' straight lengths, each with the
// length's direction there and a size of DAMAGE.size px, as large as the length lets its break be, its break clear of
// the length's ends. Each console piece between the instruments (a bar of one length) has a place of its own, which
// gives way among the last (SX: «у штурвала ... нету сломов никаких в финале ... У штурвала тоже надо разбивать»); the
// rest are spread over the other lengths, fewer on a slanted one. `seed` lays them out (SX: «разбитость
// программируемой ... рандомная ... Чуть-чуть»): the same seed, the same places.
export function cockpitSpots(bars, seed = 0) {
  const lengths = barLengths(bars), key = (k) => k + seed * 7919;
  const perBar = new Map();
  for (const l of lengths) perBar.set(l.bar, (perBar.get(l.bar) ?? 0) + 1);
  const place = (k, l, at) => {
    const size = Math.min((l.len - 8) / DAMAGE.breakScale, DAMAGE.size[0] + hash(key(k), 7, 5) * (DAMAGE.size[1] - DAMAGE.size[0]));
    const half = (size * DAMAGE.breakScale) / 2, s = 4 + half + at * Math.max(0, l.len - 8 - 2 * half);
    return { id: key(k), length: l.index, s, x: l.ax + l.ux * s, y: l.ay + l.uy * s, ux: l.ux, uy: l.uy, size };
  };
  const alone = lengths.filter((l) => perBar.get(l.bar) === 1 && l.len >= 24);
  const spots = alone.map((l, j) => {
    const k = DAMAGE.spots - 1 - j;
    return { ...place(k, l, hash(key(k), 4, 4)), order: 0.42 + 0.25 * hash(key(k), 1, 9) };
  });
  const free = DAMAGE.spots - spots.length, clear = (DAMAGE.size[1] * DAMAGE.breakScale) / 2 + 4;
  // A slanted length takes fewer places than its room would give it.
  const weight = lengths.map((l) => (perBar.get(l.bar) === 1 ? 0 : Math.max(0, l.len - 2 * clear) * (level(l) ? 1 : DAMAGE.slant)));
  const total = weight.reduce((a, b) => a + b, 0);
  if (total) for (let k = 0; k < free; k++) {
    let d = ((k + hash(key(k), 3, 11) * 0.8) / free) * total, i = 0;
    while (i < lengths.length - 1 && d > weight[i]) { d -= weight[i]; i++; }
    spots.push({ ...place(k, lengths[i], weight[i] ? Math.min(1, d / weight[i]) : 0), order: hash(key(k), 1, 9) });
  }
  // The order they give way in: by each spot's own number, not along the bars, so damage is spread about.
  return spots.sort((a, b) => a.order - b.order);
}

const along = (s, d) => [s.x + s.ux * d, s.y + s.uy * d];
function seg(ctx, a, b, ink, width) { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.strokeStyle = ink; ctx.lineWidth = width; ctx.stroke(); }
// A piece of the bar cut out, `size` long about the spot (both lines stop, as C, E and F broke them).
function cut(ctx, s, size) { seg(ctx, along(s, -size / 2), along(s, size / 2), ROLES.backing, BAR.outer + 1); }
// A short length of hollow bar centred at (x, y) along (ux, uy).
function barPiece(ctx, x, y, ux, uy, length) {
  const a = [x - ux * length / 2, y - uy * length / 2], b = [x + ux * length / 2, y + uy * length / 2];
  seg(ctx, a, b, ROLES.structure, BAR.outer); seg(ctx, a, b, ROLES.backing, BAR.inner);
}

// The glints for a light at `light` px: one on each path, at its own place along it, cut where no damage is. A path is
// measured in the light's own px: a length takes len / glintSpeed of them, so the glint slows on the slant.
// `paths` (glintPaths(lengths)), when the caller has kept them with the lengths: the frame's bars stand while the deck does.
function drawGlints(ctx, lengths, damaged, light, paths = glintPaths(lengths)) {
  let lo = Infinity, hi = -Infinity;
  for (const l of lengths) {
    const x1 = l.ax + l.ux * l.len;
    lo = Math.min(lo, l.ax, x1); hi = Math.max(hi, l.ax, x1);
  }
  const middle = (lo + hi) / 2;
  paths.forEach((path, g) => {
    let spans = 0;
    for (const l of path) spans += l.len / glintSpeed(l.ux);
    const period = spans * (1 + GLINT.rest), width = GLINT.cuts[Math.floor(hash(g, 5, 1) * GLINT.cuts.length)];
    // Every glint rides with the light the same way across the screen: along its path, or against it where the path
    // runs right to left (the right side's mirror).
    const way = path[0].ux < -1e-6 ? -1 : 1;
    let at = (((hash(g, 13, 2) * period + way * light) % period) + period) % period;
    for (const l of path) {
      const span = l.len / glintSpeed(l.ux);
      if (at >= span) { at -= span; continue; }
      // The cut's two edges run on the slant: across the bar's half width `hw` they move `k` px along it for each px.
      const slant = l.ax + l.ux * l.len / 2 < middle ? DEPTH_LEFT : DEPTH_RIGHT;
      const nx = -l.uy, ny = l.ux, du = slant[0] * l.ux + slant[1] * l.uy, dn = slant[0] * nx + slant[1] * ny;
      if (Math.abs(dn) < 0.35) break;
      const mid = at * glintSpeed(l.ux), k = du / dn, hw = BAR.outer / 2 + 0.5, reach = width / 2 + hw * Math.abs(k);
      // Round a corner, and over a damaged place, the light finds nothing to shine on.
      if (mid - reach < GLINT.inset || mid + reach > l.len - GLINT.inset) break;
      let over = false;
      for (const s of damaged) {
        if (s.length === l.index && mid - reach < s.s + breakSize(s) / 2 + 2 && mid + reach > s.s - breakSize(s) / 2 - 2) { over = true; break; }
      }
      if (over) break;
      // The cut's four corners in order, along the length by t0 .. t3 and across it by -hw or hw.
      const t0 = mid - width / 2 - hw * k, t1 = mid + width / 2 - hw * k, t2 = mid + width / 2 + hw * k, t3 = mid - width / 2 + hw * k;
      ctx.beginPath();
      ctx.moveTo(l.ax + l.ux * t0 + nx * -hw, l.ay + l.uy * t0 + ny * -hw);
      ctx.lineTo(l.ax + l.ux * t1 + nx * -hw, l.ay + l.uy * t1 + ny * -hw);
      ctx.lineTo(l.ax + l.ux * t2 + nx * hw, l.ay + l.uy * t2 + ny * hw);
      ctx.lineTo(l.ax + l.ux * t3 + nx * hw, l.ay + l.uy * t3 + ny * hw);
      ctx.closePath(); ctx.fillStyle = ROLES.backing; ctx.fill();
      break;
    }
  });
}

// C BENT: the length dented where it took the blow, pushed out of its line, joined back by the break.
function drawDent(ctx, s) {
  cut(ctx, s, s.size + 2);
  const o = (hash(s.id, 9, 0) < 0.5 ? -1 : 1) * DAMAGE.dent, [x, y] = along(s, 0);
  barPiece(ctx, x - s.uy * o, y + s.ux * o, s.ux, s.uy, s.size);
}

// The ways a length breaks through (`breakOf`), each large (DAMAGE.breakScale times its place) and by its own measure:
//   hole   the length simply gone, its ends open (A);
//   shove  the length knocked out of its line: a piece of it, shorter than the gap it left, pushed DAMAGE.shove px aside
//          and slid toward one end, so a gap opens behind it (C's dent, stronger).
// The places that give way at the fourth step break either way by turns; those that give way only at the last are
// mostly shoves, their pieces nearly as long as their gaps, and their few holes smaller (SX, on the last step: «слишком
// большие дыры и мало сдвигов линий. Я бы сделал упор на сдвиги ... Предпоследняя хорошая»): `late` says which.
export const BREAKS = Object.freeze(['hole', 'shove']);
export const breakOf = (s, late = false) => (late ? (hash(s.id, 21, 3) < DAMAGE.lateShoves ? 'shove' : 'hole')
  : BREAKS[Math.floor(hash(s.id, 21, 3) * BREAKS.length)]);
const breakSize = (s, late = false) => s.size * (late && breakOf(s, true) === 'hole' ? DAMAGE.lateHole : DAMAGE.breakScale);
function drawBreak(ctx, s, late) {
  const size = breakSize(s, late);
  cut(ctx, s, size);
  if (breakOf(s, late) !== 'shove') return;
  const [o0, o1] = DAMAGE.shove, o = (hash(s.id, 9, 0) < 0.5 ? -1 : 1) * (o0 + hash(s.id, 10, 0) * (o1 - o0));
  const len = size * (late ? 0.78 + hash(s.id, 12, 0) * 0.14 : 0.55 + hash(s.id, 12, 0) * 0.35);
  const slide = (hash(s.id, 7, 0) < 0.5 ? -1 : 1) * (size - len) / 2;
  const [x, y] = along(s, slide);
  barPiece(ctx, x - s.uy * o, y + s.ux * o, s.ux, s.uy, len);
}

// A corner by the helm knocked out of true: the bar cut DAMAGE.corner.reach px either side of the turn, and the corner,
// a little shorter, put back DAMAGE.corner.push px off, across and down, its ends open. The corners are the side bars'
// last turns (where a slanted length meets the console's line); which goes first is the seed's.
function drawCorners(ctx, bars, level, seed) {
  const n = DAMAGE.corners[level] ?? 0;
  if (!n) return;
  const sides = bars.filter((bar) => bar.length >= 3).map((bar) => bar.slice(-3));
  const first = hash(seed, 31, 7) < 0.5 ? 0 : 1, { reach, short, push: [[x0, x1], [y0, y1]] } = DAMAGE.corner;
  const unit = (p, q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
  const path = (pts, ink, width) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.strokeStyle = ink; ctx.lineWidth = width; ctx.stroke(); };
  ctx.save(); ctx.lineJoin = 'miter'; ctx.miterLimit = 4; ctx.lineCap = 'butt';
  for (let k = 0; k < Math.min(n, sides.length); k++) {
    const [a, b, c] = sides[(first + k) % sides.length], u1 = unit(a, b), u2 = unit(b, c), key = seed * 7 + k;
    const along = (r) => [[b[0] - u1[0] * r, b[1] - u1[1] * r], b, [b[0] + u2[0] * r, b[1] + u2[1] * r]];
    path(along(reach), ROLES.backing, BAR.outer + 1);
    const dx = (hash(key, 1, 2) < 0.5 ? -1 : 1) * (x0 + hash(key, 3, 4) * (x1 - x0)), dy = y0 + hash(key, 5, 6) * (y1 - y0);
    const moved = along(reach - short).map(([x, y]) => [x + dx, y + dy]);
    path(moved, ROLES.structure, BAR.outer); path(moved, ROLES.backing, BAR.inner);
  }
  ctx.restore();
}

// E's sparks: now and then a few leap from one end of a damaged place, white then amber, and are gone; more places
// throw them, more often and more at a time, at each worse level from the second.
function drawSparks(ctx, s, t, level, broken, late) {
  const { share, cycle: cycles, count, shown } = DAMAGE.sparks;
  if (!cycles[level] || hash(s.id, 17, 5) >= share[level]) return;
  const [c0, c1] = cycles[level], cycle = c0 + hash(s.id, 5, 0) * (c1 - c0);
  const phase = ((t + hash(s.id, 2, 0) * cycle) % cycle) / cycle;
  if (phase > shown) return;
  const half = (broken ? breakSize(s, late) : s.size) / 2, end = along(s, (hash(s.id, 7, 0) < 0.5 ? 1 : -1) * half);
  sparkSpray(ctx, end, count[level], phase * cycle, shown * cycle, s.id * 31 + Math.floor(t / cycle));
}

// `n` sparks thrown from `at` `age` s ago, gone after `life` s: each out and up at its own speed and angle, falling, a 2 or
// 3 px dot white, then amber, then the caution orange, fading.
function sparkSpray(ctx, at, n, age, life, seed) {
  const { speed, gravity } = DAMAGE.sparks, q = age / life;
  if (q < 0 || q >= 1) return;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (hash(seed, i + 11, 7) - 0.5) * 2.6, v = speed[0] + hash(seed, i + 3, 9) * (speed[1] - speed[0]);
    const x = at[0] + Math.cos(a) * v * age, y = at[1] + Math.sin(a) * v * age + 0.5 * gravity * age * age;
    const size = hash(seed, i, 13) < 0.35 ? 3 : 2;
    ctx.globalAlpha = (1 - q) ** 0.7;
    ctx.fillStyle = q < 0.25 ? PALETTE.white : q < 0.6 ? PALETTE.amber : PALETTE.orange;
    ctx.fillRect(Math.round(x), Math.round(y), size, size);
  }
  ctx.globalAlpha = 1;
}

// Over the bars hollowBar drew whole: the glints and the damage of `level`. `spots` from cockpitSpots(bars); `t` the
// clock (s) the sparks keep; `light` how far the light has moved (cockpitLight); `motion` false holds the sparks back;
// `seed` the damage's layout (cockpitSeed), which picks the corner knocked first.
export function drawWear(ctx, bars, spots, level, { t = 0, light = 0, motion = true, seed = 0, lengths = null, paths = null } = {}) {
  const damaged = spots.slice(0, DAMAGE.damaged[level] ?? 0), broken = DAMAGE.broken[level] ?? 0;
  ctx.save(); ctx.lineCap = 'butt';
  drawGlints(ctx, lengths ?? barLengths(bars), damaged, light, paths ?? undefined);
  const fourth = DAMAGE.broken[3];
  damaged.forEach((s, k) => (k < broken ? drawBreak(ctx, s, k >= fourth) : drawDent(ctx, s)));
  drawCorners(ctx, bars, level, seed);
  if (motion) damaged.forEach((s, k) => drawSparks(ctx, s, t, level, k < broken, k >= fourth));
  // A blow's burst (knockCockpit): from the damaged places, or from any of the places the damage would take when none is yet.
  if (motion) for (const b of wear.bursts) {
    const from = damaged.length ? damaged : spots;
    if (!from.length) break;
    for (let i = 0; i < b.n; i += 3) {
      const s = from[Math.floor(hash(b.seed, i, 1) * from.length)];
      sparkSpray(ctx, along(s, (hash(b.seed, i, 2) - 0.5) * s.size), Math.min(3, b.n - i), t - b.at, KNOCK.burstLife, b.seed + i);
    }
  }
  ctx.restore();
}

// --------------------------------------------------------------------------------------------- the light ---

const light = { angle: null, travel: 0 };

// Once a frame: the ship's heading now. A turn to the right moves the light to the left over the cockpit, as a lamp
// that stays where it is outside; it never runs back by itself.
export function steerLight(angle) {
  if (light.angle !== null) {
    let d = angle - light.angle;
    d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    light.travel -= d * GLINT.travel;
  }
  light.angle = angle;
  return light.travel;
}

// Where the light stands at `now`: where the turns have taken it, thrown about by the cockpit's shake and trembling
// with a jolted hull.
export function cockpitLight(now) {
  const thrown = COCKPIT_FX.shake ? shakeOffset(now).x * GLINT.shake : 0;
  const trembling = COCKPIT_FX.reducedMotion ? 0 : Math.min(1, COCKPIT_FX.jolt) * Math.sin(now * 47) * GLINT.jolt;
  return light.travel + thrown + trembling;
}

// ------------------------------------------------------------------------------------------- getting worse ---

// `seed` lays the damage out (cockpitSpots): new on each page and each time the hull is mended whole.
const wear = { level: null, spots: [], spotsKey: '', barsOf: null, seedOf: null, shakeAt: null, shakeAmount: 0, pieces: [], piecesAt: null, seed: Math.floor(Math.random() * 1e5),
  knocks: [], bursts: [] };

// A blow to the hull of `amount` points at `now` (s, COCKPIT_FX.now's clock): the cockpit thrown by it and a burst of sparks.
export function knockCockpit(amount, now, rng = Math.random) {
  if (!(amount > 0)) return;
  wear.knocks = wear.knocks.filter((k) => now - k.at < k.time);
  wear.knocks.push({ at: now, amp: Math.min(KNOCK.max, KNOCK.base + KNOCK.perPoint * amount), time: KNOCK.time + KNOCK.timePerPoint * amount,
    phase: rng() * Math.PI * 2 });
  wear.bursts = wear.bursts.filter((b) => now - b.at < KNOCK.burstLife);
  wear.bursts.push({ at: now, n: Math.min(KNOCK.burstMax, Math.round(KNOCK.burst + KNOCK.burstPerPoint * amount)), seed: Math.floor(rng() * 1e6) });
}

// The bars as cockpit-frame.js drew them last, for the spots: laid out again only when the bars or the seed change.
// The frame's bars are kept while the deck stands (cockpit-frame.js frameOf), so the same bars asked again are not read again: only
// others are joined into a key.
export function noteBars(bars) {
  if (bars === wear.barsOf && wear.seed === wear.seedOf) return wear.spots;
  const key = `${wear.seed}|${bars.flat(2).join(',')}`;
  if (key !== wear.spotsKey) { wear.spotsKey = key; wear.spots = cockpitSpots(bars, wear.seed); }
  wear.barsOf = bars; wear.seedOf = wear.seed;
  return wear.spots;
}

// Once a frame: the hull's level now. A worse one shakes the cockpit (harder at a wreck) and flings off the pieces of
// the places it broke through; a better one mends them.
export function wearCockpit(level, now, { wrecked = false, rng = Math.random } = {}) {
  const was = wear.level;
  wear.level = level;
  // A hull mended whole wears its next damage in places of its own.
  if (level === 0 && was > 0) wear.seed = Math.floor(rng() * 1e5);
  // The first frame only learns where the hull stands: a page opened on a worn hull does not shake.
  if (was === null || level <= was) return level;
  wear.shakeAt = now;
  wear.shakeAmount = wrecked ? SHAKE.wreck : SHAKE.amount + SHAKE.perLevel * (level - was);
  const fresh = wear.spots.slice(DAMAGE.broken[was] ?? 0, DAMAGE.broken[level] ?? 0);
  wear.piecesAt = now;
  wear.pieces = fresh.map((s) => {
    const v = SHAKE.speed[0] + rng() * (SHAKE.speed[1] - SHAKE.speed[0]), up = -Math.PI / 2 + (rng() - 0.5) * 1.6;
    return { ...s, vx: Math.cos(up) * v, vy: Math.sin(up) * v, spin: (rng() * 2 - 1) * SHAKE.spin };
  });
  return level;
}
export const cockpitLevel = () => wear.level ?? 0;
export const cockpitSeed = () => wear.seed;

// How far the cockpit stands off its place at `now`: the shake of a worse level dying away, each blow's (knockCockpit), and
// the tremor of a failing hull (TREMOR, COCKPIT_FX.hullShare), added.
export function shakeOffset(now) {
  if (COCKPIT_FX.reducedMotion) return { x: 0, y: 0 };
  let x = 0, y = 0;
  if (wear.shakeAt !== null) {
    const e = now - wear.shakeAt;
    if (e < SHAKE.time) {
      const a = wear.shakeAmount * (1 - e / SHAKE.time) ** 2;
      x += Math.sin(e * SHAKE.rate) * a; y += Math.cos(e * SHAKE.rate * 1.37) * a * 0.6;
    }
  }
  for (const k of wear.knocks) {
    const e = now - k.at;
    if (e < 0 || e >= k.time) continue;
    const a = k.amp * (1 - e / k.time) ** 2;
    x += Math.sin(e * KNOCK.rate + k.phase) * a; y += Math.cos(e * KNOCK.rate * 1.21 + k.phase) * a * 0.7;
  }
  const share = COCKPIT_FX.hullShare ?? 1;
  if (share < TREMOR.from && share > 0) {
    const a = TREMOR.start + (TREMOR.max - TREMOR.start) * ((TREMOR.from - share) / TREMOR.from) ** TREMOR.power;
    x += (Math.sin(now * 23.1) * 0.6 + Math.sin(now * 41.7) * 0.4) * a;
    y += (Math.cos(now * 19.3) * 0.5 + Math.sin(now * 33.9) * 0.3) * a;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

// The pieces in flight at `now`, each a short length of hollow bar, turning, falling and fading.
export function drawPieces(ctx, now) {
  if (wear.piecesAt === null || COCKPIT_FX.reducedMotion) return;
  const e = now - wear.piecesAt;
  if (e > SHAKE.life) return;
  const alpha = Math.max(0, 1 - e / SHAKE.life);
  ctx.save(); ctx.lineCap = 'butt'; ctx.globalAlpha = alpha;
  for (const p of wear.pieces) {
    const x = p.x + p.vx * e, y = p.y + p.vy * e + 0.5 * SHAKE.gravity * e * e, a = Math.atan2(p.uy, p.ux) + p.spin * e;
    const c = Math.cos(a), s = Math.sin(a), half = p.size / 2;
    for (const [w, ink] of [[BAR.outer, ROLES.structure], [BAR.inner, ROLES.backing]]) {
      ctx.beginPath(); ctx.moveTo(x - c * half, y - s * half); ctx.lineTo(x + c * half, y + s * half);
      ctx.lineWidth = w; ctx.strokeStyle = ink; ctx.stroke();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the break ---

// The deck breaks at a wreck (SX, 2026-10-03: «нижняя панель она же уже разрушена сильно в этот момент. Чтобы она так
// чуть-чуть разрывалась ... это просто должен быть легкий эффект ... Может, чуть ее согнуть ... или еще как-то переломить в
// моменте»): it splits on a ragged line near the middle (`at` of the width, give or take `spread`; `jag` px either way at
// `steps` places down the deck's lower `depth` of the screen), and its halves bend about the screen's lower corners, the
// break sagging: at once by `bend` degrees, springing (`rate`, `damp`) to a kink of `keep`, the right half `drop` px lower and
// `gap` px off the left, till the ship comes back (mendCockpit). Still, at the kink, for reduced motion.
export const CRACK = Object.freeze({ at: 0.5, spread: 0.08, jag: 7, steps: 7, depth: 0.42, bend: 1.4, keep: 0.25, rate: 13, damp: 3.5,
  drop: 2, gap: 3 });
const crack = { at: null, x: 0.5, seed: 0 };

export function crackCockpit(now, rng = Math.random) {
  crack.at = now;
  crack.x = CRACK.at + (rng() * 2 - 1) * CRACK.spread;
  crack.seed = Math.floor(rng() * 1e5);
}
export function mendCockpit() { crack.at = null; }

// The break at `now`, or null: where it runs (x across the screen at each y, top to bottom) and how far the halves bend.
export function crackShape(now, width, height) {
  if (crack.at === null) return null;
  const e = Math.max(0, now - crack.at);
  const deg = COCKPIT_FX.reducedMotion ? CRACK.keep
    : CRACK.keep + (CRACK.bend - CRACK.keep) * Math.exp(-CRACK.damp * e) * Math.cos(CRACK.rate * e);
  const top = height * (1 - CRACK.depth), x0 = crack.x * width, path = [[x0, 0], [x0, top]];
  for (let k = 1; k <= CRACK.steps; k++) {
    path.push([x0 + (hash(k, crack.seed, 5) * 2 - 1) * CRACK.jag, top + (height - top) * (k / CRACK.steps)]);
  }
  path.push([path[path.length - 1][0], height + 40]);
  return { path, angle: (deg * Math.PI) / 180, drop: CRACK.drop, gap: CRACK.gap };
}

// ------------------------------------------------------------------------------------------- the rehearsal ---

// Every step of the damage drawn once before the flight, on a canvas nobody sees (labs/graphics/boot.js, the load's rehearsal):
// each level from the first to the last as a blow brings it (the shake, its burst of sparks, the pieces flung, the dents, the
// breaks, the knocked corners, the sparks of the damaged places), then the deck broken at a wreck. Until 2026-10-06 the first
// blow of a flight, and the first time each worse level was reached, ran this code for the first time in the frame it happened:
// compiled, laid out and its inks graded there (the effects audit's spikes on events, docs/playbook/rendering-performance.md).
// `draw()` draws the deck (and the helmet) as the page does; the page's own wear, blows, pieces and break are put back after as
// they were, so nothing the pilot sees changes. Its dice are its own: nothing is drawn from Math.random.
export function rehearseWear(ctx, width, height, draw) {
  const keptWear = { ...wear }, keptCrack = { ...crack }, keptFx = { ...COCKPIT_FX };
  const dice = () => 0.5;
  try {
    Object.assign(COCKPIT_FX, { wear: true, shake: true, reducedMotion: false, jolt: 1, hullShare: 0.1 });
    Object.assign(wear, { level: 0, knocks: [], bursts: [], pieces: [], shakeAt: null, piecesAt: null });
    for (let level = 1; level <= 4; level++) {
      const now = level, seen = now + 0.05;
      knockCockpit(20, now, dice);
      wearCockpit(level, now, { rng: dice, wrecked: level === 4 });
      COCKPIT_FX.now = seen;
      shakeOffset(seen);
      draw();
      drawPieces(ctx, seen);
    }
    crackCockpit(5, dice);
    COCKPIT_FX.now = 5.05;
    drawCracked(ctx, crackShape(5.05, width, height), width, height, draw);
  } finally {
    Object.assign(wear, keptWear); Object.assign(crack, keptCrack); Object.assign(COCKPIT_FX, keptFx);
  }
}

// `draw()` (the deck) twice, each half clipped on its side of the break and turned about its lower corner; returns the
// first half's answer (the deck's layout).
export function drawCracked(ctx, shape, width, height, draw) {
  let out;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.beginPath();
    const edge = side < 0 ? 0 : width + 40, shift = side < 0 ? 0 : shape.gap;
    ctx.moveTo(edge, -40);
    for (const [x, y] of shape.path) ctx.lineTo(x + shift, y);
    ctx.lineTo(edge, height + 40);
    ctx.closePath();
    ctx.clip();
    const pivot = side < 0 ? [0, height] : [width, height];
    ctx.translate(pivot[0], pivot[1] + (side > 0 ? shape.drop : 0));
    ctx.rotate(-side * shape.angle);
    ctx.translate(-pivot[0], -pivot[1]);
    const got = draw();
    if (side < 0) out = got;
    ctx.restore();
  }
  return out;
}
