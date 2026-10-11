import { UI, FLOAT } from './uiGrid.js';
import { wrapPi, clamp, lerp, smoothstep, followCritical } from './util.js';
import { withAlpha } from './hover.js';

// The rim: one ellipse that every mark pointing at something off the screen rides (SX, 2026-10-07: «представь что есть вот такой
// овал и метки аккуратно крутятся вдоль его границы слегка иногда отодвигаясь немного дальше, если корабль резко пролетает метку, то
// она ныряет с одной стороны и выныривает с другой ... пусть сразу работает для всех возможных меток»). Until then each kind of mark
// was clamped to a rectangle of its own, and where its place was taken it jumped to the next free slot round its anchor or along the
// screen's edge: the marks flew across the screen and sat in its corners.
//
// The ellipse is the play area's (rimOf): the HUD's columns' inner edge, as far in from each side (the wider of the two), the helmet's floor on
// top, the deck's top below, `air` in from each. A mark w x h rides the ellipse shrunk by its own half on each axis, so the whole mark
// stays inside the ellipse's box and an ellipse has no corner to sit in. Its place is the bearing of its thing from the ellipse's
// middle (the ship flies about there); marks closer than their widths are spread apart along the rim (`gap` between them); each
// breathes outward now and then (`breathe` px at most, a breath every `period` s, each mark at its own phase).
//
// Since SX flew it (2026-10-07: «метки плохо, они моргают, давай не скрывать их, а двигать по контуру который я нарисовал тогда, то
// есть они не задевают за углы, а плавно едут по овалу») a mark only glides: its angle follows its place on a critically damped spring
// (`omega`), never faster than `speed` px/s along the rim, and nothing else moves it: no notice, window or panel pushes it along or
// in off the oval (the interface is drawn over it, and an object's window too: labs/graphics/main.js). It comes in `come` s once its
// thing is in its list and goes in `go` s once it is out, shown at least `stay` s once it came, never turning back once it is going,
// and away at least `rest` s once gone: whatever its list does, no mark hides and comes back within two seconds. When the ship flies
// past its thing its place runs round the rim faster than the mark may: once it is more than `flip` ahead for `lag` s the mark dives,
// a fade and a shrink to `shrink` in `dive` s, stays under while its place runs faster than `calm` (`hold` s at most), and surfaces at
// its new place in `dive` s. A thing inside the ellipse is on the screen, and its mark goes to stand by it (`at`) in `inside` s, and
// back onto the rim as it leaves. Reduced motion: no spring, no breath, no dive, no fades.
export const RIM = Object.freeze({
  air: UI.air.inset,           // px from the column, the helmet's floor and the deck to the ellipse
  omega: 10,                   // 1/s: the spring a mark's angle follows its place on, critically damped (half way in 0.17 s, no overshoot)
  speed: 400,                  // px/s along the rim at most: no mark runs faster round the oval
  flip: (75 * Math.PI) / 180,  // its place this far round from the mark ...
  lag: 0.1,                    // ... for this many s on end: the mark dives and surfaces there
  calm: 400,                   // px/s: under, it surfaces once its place runs slower than this,
  hold: 0.4,                   // or after this many s under
  dive: 0.12,                  // s out, and as long back in
  shrink: 0.6,                 // the size a diving mark goes down to
  come: 0.6,                   // s: a mark comes in this fade once its thing is in its list,
  go: 0.6,                     // and goes in this one once it is out of it,
  stay: 1,                     // shown at least this many s once it came,
  rest: 2,                     // and away at least this many s once gone
  inside: 0.25,                // s: a pointer goes from the rim to its thing on the screen, and back
  breathe: FLOAT.plate,        // px outward at most (the float ladder's plate step)
  period: FLOAT.period[0],     // s round a breath
  gap: UI.vector.space,        // px between two marks along the rim
});

// The ellipse inset in the play area `area` ({ x0, y0, x1, y1 }): { cx, cy, a, b }.
export function rimOf(area) {
  const x0 = area.x0 + RIM.air, x1 = area.x1 - RIM.air, y0 = area.y0 + RIM.air, y1 = area.y1 - RIM.air;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, a: Math.max(1, (x1 - x0) / 2), b: Math.max(1, (y1 - y0) / 2) };
}

// The play area of a view with nothing round it: the view itself.
export const viewArea = (v) => ({ x0: v.x, y0: v.y, x1: v.x + v.w, y1: v.y + v.h });

// The semi-axes of the ellipse a mark w x h rides: the rim's shrunk by its half.
const axisA = (e, w) => Math.max(1, e.a - w / 2);
const axisB = (e, h) => Math.max(1, e.b - h / 2);

// Where a mark w x h stands on the rim at `angle` round its middle, `out` px further along the ray, written into `p` ({ x, y }).
export function rimPointInto(p, e, angle, w = 0, h = 0, out = 0) {
  const a = axisA(e, w), b = axisB(e, h), c = Math.cos(angle), s = Math.sin(angle);
  const rho = (a * b) / Math.sqrt(b * c * b * c + a * s * a * s) + out;
  p.x = e.cx + c * rho;
  p.y = e.cy + s * rho;
  return p;
}
export const rimPoint = (e, angle, w = 0, h = 0, out = 0) => rimPointInto({ x: 0, y: 0 }, e, angle, w, h, out);

// Whether a point is inside the ellipse a mark w x h rides.
const insideAt = (e, x, y, w, h) => ((x - e.cx) / axisA(e, w)) ** 2 + ((y - e.cy) / axisB(e, h)) ** 2 <= 1;
export const insideRim = (e, p, w = 0, h = 0) => insideAt(e, p.x, p.y, w, h);

// The rim's px per radian at `angle` for a mark w x h (how far its place runs as its angle turns), the tangent's unit put in TAN.
const TAN = { x: 0, y: 0 };
function rimRate(e, angle, w, h) {
  const a = axisA(e, w), b = axisB(e, h), c = Math.cos(angle), s = Math.sin(angle);
  const D = b * b * c * c + a * a * s * s, root = Math.sqrt(D), rho = (a * b) / root;
  const drho = (-a * b * (a * a - b * b) * s * c) / (D * root);
  const dx = drho * c - rho * s, dy = drho * s + rho * c, speed = Math.sqrt(dx * dx + dy * dy) || 1;
  TAN.x = dx / speed; TAN.y = dy / speed;
  return speed;
}

// How far apart on the rim, px, a mark w x h at angles `from` and `to` stands.
const P0 = { x: 0, y: 0 }, P1 = { x: 0, y: 0 };
function rimGap(e, from, to, w, h) {
  rimPointInto(P0, e, from, w, h);
  rimPointInto(P1, e, to, w, h);
  const dx = P1.x - P0.x, dy = P1.y - P0.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// The angle two marks p and q need between them about `phi`: their half extents along the rim's tangent there and the gap, over the
// rim's px per radian there.
function needAt(e, phi, p, q) {
  const w = (p.w + q.w) / 2, h = (p.h + q.h) / 2, speed = rimRate(e, phi, w, h);
  // The gap, and a breath's worth more (two marks may breathe out of step).
  return (Math.abs(TAN.x) * w + Math.abs(TAN.y) * h + RIM.gap + RIM.breathe) / speed;
}

// The marks `items` (their `want`, `w`, `h`) pushed apart round the rim, each pair closer than its need moved apart by halves, a few
// passes. Sorted in place by their wants (an insertion sort: a handful of marks, nothing made).
function spread(e, items) {
  const n = items.length;
  if (n < 2) return;
  for (let i = 0; i < n; i++) items[i].want = wrapPi(items[i].want);
  for (let i = 1; i < n; i++) {
    const it = items[i];
    let j = i - 1;
    for (; j >= 0 && items[j].want > it.want; j--) items[j + 1] = items[j];
    items[j + 1] = it;
  }
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const p = items[i], q = items[(i + 1) % n];
      const apart = q.want - p.want + (i === n - 1 ? 2 * Math.PI : 0);
      const need = needAt(e, p.want + apart / 2, p, q);
      if (apart < need - 1e-9) { const push = (need - apart) / 2; p.want -= push; q.want += push; moved = true; }
    }
    if (!moved) break;
  }
}

// A mark's state, every field declared once (its shape never changes): `wish` the last wish laid for it (what the page draws it by),
// `ang` its angle on the rim and the angle's speed (the spring's), `share` how far it has come (1) or gone (0), `age` s since it came,
// `gone`/`away` resting after it went and for how long, `inShare` how far it has gone over to its thing on the screen. What the page
// reads: `x`, `y`, `alpha`, `scale`, `inside`, `box`.
const markOf = (key) => ({
  key, wish: null, wished: false, w: 0, h: 0, seed: 0, hasAt: false, atX: 0, atY: 0,
  ang: { x: 0, v: 0 }, want: 0, bearing: 0, sweep: 0, phase: null, t: 0, lagged: 0,
  share: 0, age: 0, going: false, gone: true, away: Infinity, inShare: 0, inside: false,
  x: 0, y: 0, alpha: 0, scale: 1, box: { x: 0, y: 0, w: 0, h: 0 },
});

// The marks on the rim and their memory, by key: one per page. `place` lays this frame's wishes and returns where each stands.
export class Rim {
  constructor() { this.marks = new Map(); this.riding = []; }

  // `e` the ellipse (rimOf), `wishes` [{ key, angle, w, h, at? (the thing's point on the screen), seed? }], `dt` s since the last frame,
  // `time` s for the breath. Returns the marks by key (the Rim's own map, kept): each { x, y, alpha, scale, inside, box, phase, wish },
  // a mark resting after it went at alpha 0.
  place(e, wishes, dt, { time = 0, reducedMotion = false } = {}) {
    const step = dt > 0 ? dt : 0, still = step === 0;
    for (const m of this.marks.values()) m.wished = false;
    for (let i = 0; i < wishes.length; i++) {
      const wish = wishes[i];
      let m = this.marks.get(wish.key);
      if (!m) this.marks.set(wish.key, (m = markOf(wish.key)));
      // Gone not long ago: it rests its while first, whatever its list says.
      if (m.gone && m.away < RIM.rest) continue;
      m.wished = true; m.wish = wish; m.w = wish.w; m.h = wish.h; m.seed = wish.seed ?? 0;
      m.hasAt = !!wish.at;
      if (m.hasAt) { m.atX = wish.at.x; m.atY = wish.at.y; }
      const bearing = m.hasAt ? Math.atan2(m.atY - e.cy, m.atX - e.cx) : wish.angle;
      if (m.gone) {
        // It comes where its thing is, at rest on the rim (or by its thing on the screen); while the world stands, at once.
        m.gone = false; m.going = false; m.age = 0; m.share = still || reducedMotion ? 1 : 0;
        m.phase = null; m.t = 0; m.lagged = 0; m.ang.x = bearing; m.ang.v = 0; m.bearing = bearing;
        m.inShare = m.hasAt && insideAt(e, m.atX, m.atY, m.w, m.h) ? 1 : 0;
      }
      // How fast its place runs round the rim now, px/s.
      m.sweep = still ? 0 : rimGap(e, m.bearing, bearing, m.w, m.h) / step;
      m.bearing = bearing;
    }
    const riding = this.riding;
    riding.length = 0;
    for (const m of this.marks.values()) {
      if (m.gone) {
        m.away += step; m.alpha = 0;
        if (m.away >= RIM.rest) this.marks.delete(m.key);
        continue;
      }
      m.age += step;
      if (!m.wished) m.sweep = 0;
      // Out of its list: it goes once it has stood its `stay`, and once going it does not turn back.
      if (!m.wished && !m.going && (m.age >= RIM.stay || reducedMotion)) m.going = true;
      if (m.going) m.share = reducedMotion ? 0 : Math.max(0, m.share - step / RIM.go);
      else m.share = reducedMotion ? 1 : Math.min(1, m.share + step / RIM.come);
      if (m.going && m.share <= 0) { m.gone = true; m.away = 0; m.alpha = 0; continue; }
      m.inside = m.hasAt && insideAt(e, m.atX, m.atY, m.w, m.h);
      if (!m.inside) { m.want = m.bearing; riding.push(m); }
    }
    spread(e, riding);
    for (const m of this.marks.values()) {
      if (m.gone) continue;
      let k = 1;
      m.inShare = reducedMotion ? (m.inside ? 1 : 0) : clamp(m.inShare + (m.inside ? step : -step) / RIM.inside, 0, 1);
      if (m.inside) {
        // On the screen: its angle with its thing, so it leaves for the rim where it is; a dive ends there, up by its thing.
        m.ang.x = m.bearing; m.ang.v = 0; m.lagged = 0;
        if (m.phase === 'out' || m.phase === 'under') { m.phase = 'in'; m.t = 0; }
      } else {
        // Its place run far ahead of it (the ship passing its thing), and for long enough: it dives.
        const far = !reducedMotion && m.phase == null && Math.abs(wrapPi(m.want - m.ang.x)) > RIM.flip;
        m.lagged = far ? m.lagged + step : 0;
        if (m.lagged >= RIM.lag) { m.phase = 'out'; m.t = 0; m.lagged = 0; }
      }
      if (m.phase === 'out' || m.phase === 'under') {
        // Diving: out where it stood, then under until its place has calmed (or `hold` s at most), then up there.
        m.t += step;
        if (m.phase === 'out') {
          k = Math.max(0, 1 - m.t / RIM.dive);
          if (k <= 0) { m.phase = 'under'; m.t = 0; }
        } else k = 0;
        if (m.phase === 'under' && (m.sweep < RIM.calm || m.t >= RIM.hold)) { m.ang.x = m.want; m.ang.v = 0; m.phase = 'in'; m.t = 0; }
      } else {
        if (m.phase === 'in') { m.t += step; k = Math.min(1, m.t / RIM.dive); if (k >= 1) m.phase = null; }
        if (!m.inside) {
          // Gliding after its place: the spring, its speed capped to `speed` px/s along the rim where it stands.
          if (reducedMotion) { m.ang.x = m.want; m.ang.v = 0; }
          else followCritical(m.ang, m.ang.x + wrapPi(m.want - m.ang.x), RIM.omega, step, RIM.speed / rimRate(e, m.ang.x, m.w, m.h));
          m.ang.x = wrapPi(m.ang.x);
        }
      }
      const breath = reducedMotion ? 0 : RIM.breathe * Math.max(0, Math.sin((2 * Math.PI * time) / RIM.period + m.seed)) ** 2;
      rimPointInto(m, e, m.ang.x, m.w, m.h, breath);
      if (m.inShare > 0) { const u = smoothstep(m.inShare); m.x = lerp(m.x, m.atX, u); m.y = lerp(m.y, m.atY, u); }
      m.alpha = smoothstep(m.share) * k;
      m.scale = RIM.shrink + (1 - RIM.shrink) * k;
      m.box.x = m.x - m.w / 2; m.box.y = m.y - m.h / 2; m.box.w = m.w; m.box.h = m.h;
    }
    return this.marks;
  }
}

// `draw` under the canvas's alpha times `alpha` (src/hover.js withAlpha) and scaled `scale` about (x, y): a mark diving or surfacing.
export function drawDiving(ctx, { x, y, alpha = 1, scale = 1 }, draw) {
  if (alpha <= 0.01) return undefined;
  const scaled = scale < 0.999 && typeof ctx?.save === 'function' && typeof ctx.scale === 'function';
  if (scaled) { ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.translate(-x, -y); }
  try { return withAlpha(ctx, alpha, draw); } finally { if (scaled) ctx.restore(); }
}
