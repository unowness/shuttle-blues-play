// The way in (SX, 2026-10-03: «напиши красивый плавный движок заезда в гараж и в станции»).
//
// One engine flies the ship in to its berth: a station's middle, or the home garage's berth (src/home.js), from where DOCK on its
// window's row finds it (World.dock; a click on a station from afar, World.flyIn and its dive, went on 2026-10-07: SX, «нет убери клик в
// станцию саму везде только по контекстной меню»). It is handed the way's points, in the station's own frame (so a drifting station takes its berth with it), the ship as it is
// (velocity, heading, push), and plans once:
//
//   the path   a curve through the points, a cubic Hermite piece between each two, each point passed halfway between its
//              two chords and each piece as near a circle's arc as its ends allow (no hooks). It leaves along the ship's
//              own course: a ship moving across the way or away from it swings round into it on an arc as wide as its
//              speed asks; one at rest sets off on the arc that comes into the first point the right way. The last run,
//              from the gate to the berth, is straight.
//   the speed  quintic pieces along the path, continuous to the push (no jolt anywhere): from the ship's own speed and
//              push, out to `cruise` at most and never pushed or braked harder than `accel`, slowed into each bend the
//              way would otherwise take too fast (`side` across, the nose's `wheel`), lined up at the gate at the gate's
//              speed; then the glide, which holds that speed a moment and settles to rest in the berth.
//   the nose   turned from where it pointed onto the path's heading while the ship is still slow (a ship at rest and
//              turned well away turns on the spot first), then along the path; at rest, the last run's heading exactly.
//
// `wayAt(plan, t)` is the ship's whole pose t seconds in. Nothing here draws or reads the world.

import { clamp, wrapPi, smootherstep as smoother } from './util.js';

export const WAY = Object.freeze({
  cruise: 420,         // u/s, the fastest on a long way
  accel: 240,          // u/s^2, the hardest push or braking along it
  gate: 200,           // u/s at the gate: the docking limit (CONFIG.station.dockSpeed), met lined up
  glide: 1.75,         // the last run takes `glide` x its length / the gate's speed: 1.67 holds the speed flat a moment
                       // before it eases off, 2.5 is the longest before it would back up
  burn: 30,            // u/s^2 of push (or of braking) the engine's flame (the retro's) shows from
  spool: 260,          // u/s^2 that is a full spool, for the helm's gauges and the engine's hum
  turn: [0.4, 2.0],    // s, the nose's first turn onto the path, by how far it has to go (a half turn takes the most);
                       // a ship at rest and turned more than 70 degrees away turns on the spot for half of it first
  swing: [90, 800],    // u, the arc a moving ship swings round into the way on, by its speed (v^2 / side within these)
  side: 220,           // u/s^2 across its way at most in a bend: it slows into a bend and opens up out of it
  wheel: 2.4,          // rad/s, the fastest its nose turns with a bend (the pilot's own stick turns 3.4 at most)
  apart: 90,           // u between two places the speed is slowed for
  knots: 6,            // places at most it slows for a bend
  arc: 0.6,            // rad, the most a ship at rest sets off away from the straight line to the way's first point
  // A station's way (src/docking.js wayIn): its gate stands this far outside the body (beyond the hull's radius), on the line from
  // its middle toward where the ship will be `lead` s on.
  gateAir: 50,
  lead: 1.2,
  step: 6,             // u between the path's samples
});

const unit = (x, y) => { const l = Math.hypot(x, y); return l > 1e-9 ? { x: x / l, y: y / l } : { x: 1, y: 0 }; };

// ----------------------------------------------------------------------------------------------------------- the speed

// A quintic from (s 0, speed v0, push a0) to (D, v1, a1) over T seconds: { s(t), v(t), a(t) }.
function quintic(D, v0, v1, T, a0 = 0, a1 = 0) {
  const T2 = T * T, T3 = T2 * T;
  const c2 = a0 / 2;
  const c3 = (20 * D - (8 * v1 + 12 * v0) * T - (3 * a0 - a1) * T2) / (2 * T3);
  const c4 = (-30 * D + (14 * v1 + 16 * v0) * T + (3 * a0 - 2 * a1) * T2) / (2 * T3 * T);
  const c5 = (12 * D - 6 * (v1 + v0) * T - (a0 - a1) * T2) / (2 * T3 * T2);
  return {
    T, D,
    s: (t) => ((((c5 * t + c4) * t + c3) * t + c2) * t + v0) * t,
    v: (t) => (((5 * c5 * t + 4 * c4) * t + 3 * c3) * t + 2 * c2) * t + v0,
    a: (t) => ((20 * c5 * t + 12 * c4) * t + 6 * c3) * t + 2 * c2,
  };
}

// How long a piece takes: the shortest time in which it never goes faster than `top` (or than its own ends, if they are
// faster), never pushes or brakes harder than `accel` and never backs up. Where none does, the one that comes nearest.
function pieceTime(D, v0, v1, a0, top, accel) {
  if (D <= 1e-6) return 1e-3;
  const ceiling = Math.max(top, v0, v1) * 1.001;
  let best = null;
  for (let T = 0.85 * D / Math.max(top, v0, v1, 1), k = 0; k < 160; k++, T *= 1.03) {
    const q = quintic(D, v0, v1, T, a0);
    let fast = 0, hard = 0, back = 0;
    for (let i = 0; i <= 48; i++) {
      const t = (T * i) / 48, v = q.v(t), a = Math.abs(q.a(t));
      fast = Math.max(fast, v - ceiling);
      hard = Math.max(hard, a - accel);
      back = Math.max(back, -v);
    }
    // A push the ship came in with is its own: only what the piece adds to it counts.
    if (Math.abs(a0) > accel) hard = Math.max(0, hard - (Math.abs(a0) - accel));
    if (fast <= 0 && hard <= 0 && back <= 0.5) return T;
    const miss = fast / Math.max(1, top) + hard / accel + back * 10;
    if (!best || miss < best.miss) best = { T, miss };
  }
  return best.T;
}

// ------------------------------------------------------------------------------------------------------------ the path

// The path through `pts`, leaving along `dir0`, straight from the gate (index `gate`, or -1) on, or else arriving along
// `endDir` (if given); sampled every WAY.step u: [{ x, y, s, h }] (s: the length along it, h: its heading, unwrapped), and the
// gate's length along it.
// The direction the path passes each point in (the first is the caller's): halfway between its two chords; along the last
// run from the gate on; at the berth, `endDir` if given (and there is no gate), else the last chord's.
function pointDirs(pts, dir0, gate, endDir) {
  const n = pts.length;
  const chordUnit = (i) => unit(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return pts.map((p, i) => {
    if (i === 0) return dir0;
    if (i === n - 1 && gate < 0 && endDir) return endDir;
    if (i === n - 1 || (gate >= 0 && i >= gate)) return chordUnit(Math.min(i, n - 2));
    const a = chordUnit(i - 1), b = chordUnit(i), m = { x: a.x + b.x, y: a.y + b.y };
    // A way that doubles back on itself turns square to it.
    return Math.hypot(m.x, m.y) > 1e-6 ? unit(m.x, m.y) : { x: -a.y, y: a.x };
  });
}

function buildPath(pts, dir0, gate, endDir = null) {
  const n = pts.length;
  const dirs = pointDirs(pts, dir0, gate, endDir);
  const table = [{ x: pts[0].x, y: pts[0].y, s: 0 }];
  let sGate = gate >= 0 ? 0 : -1;
  for (let i = 0; i < n - 1; i++) {
    if (i === gate) sGate = table[table.length - 1].s;
    const p = pts[i], q = pts[i + 1], len = Math.hypot(q.x - p.x, q.y - p.y);
    // Each piece as near a circle's arc as its two directions let it be: a Hermite's reach for an arc turning `turn` is
    // 2 tan(turn / 4) / sin(turn / 2) of its chord (1 for a straight run, 2 for a half turn).
    const turn = Math.acos(clamp(dirs[i].x * dirs[i + 1].x + dirs[i].y * dirs[i + 1].y, -1, 1));
    const reach = len * (turn < 1e-3 ? 1 : Math.min(2.2, (2 * Math.tan(turn / 4)) / Math.sin(turn / 2)));
    const m0 = { x: dirs[i].x * reach, y: dirs[i].y * reach }, m1 = { x: dirs[i + 1].x * reach, y: dirs[i + 1].y * reach };
    const k = Math.max(2, Math.ceil((len * 1.4) / WAY.step));
    for (let j = 1; j <= k; j++) {
      const u = j / k, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      const x = j === k ? q.x : h00 * p.x + h10 * m0.x + h01 * q.x + h11 * m1.x;
      const y = j === k ? q.y : h00 * p.y + h10 * m0.y + h01 * q.y + h11 * m1.y;
      const last = table[table.length - 1], d = Math.hypot(x - last.x, y - last.y);
      if (d < 1e-6) continue;
      table.push({ x, y, s: last.s + d });
    }
  }
  if (gate >= n - 1) sGate = table[table.length - 1].s;
  // Headings: along each sample's two neighbours, unwrapped so the nose never turns the long way round.
  for (let i = 0; i < table.length; i++) {
    const a = table[Math.max(0, i - 1)], b = table[Math.min(table.length - 1, i + 1)];
    const h = i === 0 ? Math.atan2(dir0.y, dir0.x) : i === table.length - 1 ? Math.atan2(dirs[n - 1].y, dirs[n - 1].x) : Math.atan2(b.y - a.y, b.x - a.x);
    table[i].h = i === 0 ? h : table[i - 1].h + wrapPi(h - table[i - 1].h);
  }
  return { table, sGate };
}

// The path's place and heading `s` along it.
function pathAt(plan, s) {
  const T = plan.table;
  if (s <= 0) return T[0];
  if (s >= plan.L) return T[T.length - 1];
  let lo = 0, hi = T.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid].s <= s) lo = mid; else hi = mid; }
  const a = T[lo], b = T[hi], k = (s - a.s) / (b.s - a.s || 1);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, h: a.h + (b.h - a.h) * k };
}

// ------------------------------------------------------------------------------------------------------------ the plan

// The fastest the path lets the ship go at each sample: through a bend no harder than `side` u/s^2 across its way, nor
// turning its nose faster than `wheel` rad/s. Bends are read over a few samples either side, so one kink does not count.
function bendLimits(table, side, wheel) {
  const n = table.length, k = new Array(n).fill(0), out = new Array(n);
  for (let i = 1; i < n - 1; i++) {
    const a = table[Math.max(0, i - 3)], b = table[Math.min(n - 1, i + 3)];
    k[i] = Math.abs(b.h - a.h) / Math.max(1e-6, b.s - a.s);
  }
  for (let i = 0; i < n; i++) out[i] = k[i] > 1e-6 ? Math.min(Math.sqrt(side / k[i]), wheel / k[i]) : Infinity;
  return out;
}

// The bend limit at `s` along the path: the lowest within `reach` u either side.
function limitAt(table, limits, s, reach = 30) {
  let lo = 0, hi = table.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (table[mid].s <= s) lo = mid; else hi = mid; }
  let m = Infinity;
  for (let i = lo; i >= 0 && table[i].s >= s - reach; i--) m = Math.min(m, limits[i]);
  for (let i = hi; i < table.length && table[i].s <= s + reach; i++) m = Math.min(m, limits[i]);
  return Math.min(m, limits[lo]);
}

// The way in. `points`: [{ x, y }], the ship's place first and the berth last, in the station's frame; `gate`: the index of
// the point the straight last run starts from (-1: none, the whole way ends at rest in one glide). `v`: the ship's velocity
// in that frame, `push`: its push along it (u/s^2, to carry a way planned again on the run), `angle`: its heading.
// `speeds` overrides WAY's numbers; `endDir` (a unit vector) is the heading a way without a gate arrives on (else its last chord's).
export function planWay({ points, gate = -1, v = { x: 0, y: 0 }, push = 0, angle = 0, speeds = {}, endDir = null }) {
  const S = { ...WAY, ...speeds };
  const speed = Math.hypot(v.x, v.y);
  let pts = points.map((p) => ({ x: p.x, y: p.y }));
  // A point too near the one before it says nothing the curve can show: dropped (never the berth, nor the gate).
  for (let i = pts.length - 2; i >= 1; i--) {
    if (i !== gate && Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) < 12) { pts.splice(i, 1); if (gate > i) gate--; }
  }
  // At the gate already: the way is the last run alone.
  if (gate > 0 && gate < pts.length - 1 && Math.hypot(pts[gate].x - pts[0].x, pts[gate].y - pts[0].y) < 12) { pts.splice(gate, 1); gate = -1; }
  if (gate >= pts.length - 1) gate = -1;
  // The ship's own course: exactly its velocity's once it moves; while it barely does, the way's: setting off on the arc
  // that comes into the first point on the direction the way passes it (the chord's mirror of it), no more than `arc` off
  // the chord.
  const chord = unit(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const into = pointDirs(pts, chord, gate, endDir)[1];
  const off = clamp(wrapPi(Math.atan2(chord.y, chord.x) - Math.atan2(into.y, into.x)), -S.arc, S.arc);
  const toWay = { x: Math.cos(Math.atan2(chord.y, chord.x) + off), y: Math.sin(Math.atan2(chord.y, chord.x) + off) };
  const w = smoother(speed / 40), vel = unit(v.x, v.y);
  const dir0 = speed > 1e-6 ? unit(vel.x * w + toWay.x * (1 - w), vel.y * w + toWay.y * (1 - w)) : toWay;
  // Moving across the way or away from it, it swings round into it first, on an arc as wide as its speed asks (v^2 / side):
  // through the point a quarter of that circle on (or as far as the way turns, if less), on the way's side.
  const turnAway = Math.acos(clamp(dir0.x * chord.x + dir0.y * chord.y, -1, 1));
  if (speed > 60 && turnAway > 0.5) {
    const r = clamp((speed * speed) / S.side, S.swing[0], S.swing[1]), phi = Math.min(turnAway, Math.PI / 2);
    const cross = dir0.x * chord.y - dir0.y * chord.x, side = cross >= 0 ? 1 : -1, nx = -dir0.y * side, ny = dir0.x * side;
    const ax = pts[0].x + r * (Math.sin(phi) * dir0.x + (1 - Math.cos(phi)) * nx), ay = pts[0].y + r * (Math.sin(phi) * dir0.y + (1 - Math.cos(phi)) * ny);
    pts.splice(1, 0, { x: ax, y: ay });
    if (gate >= 1) gate++;
  }
  const { table, sGate } = buildPath(pts, dir0, gate, endDir);
  const L = table[table.length - 1].s;
  const v0 = Math.max(0, speed * (vel.x * dir0.x + vel.y * dir0.y));
  const plan = { table, L, sGate: gate > 0 ? sGate : 0, points: pts, gate };

  // The speed's knots: the start, the gate (lined up at the gate's speed), the berth at rest; and where the way so planned
  // takes a bend faster than it allows, a knot at the bend's own limit, the worst first, up to `knots` of them.
  const limits = bendLimits(table, S.side, S.wheel);
  const glide = gate > 0 && sGate > 1;
  const knots = [{ s: 0, v: v0 }];
  if (glide) knots.push({ s: sGate, v: Math.min(S.gate, Math.sqrt(v0 * v0 + S.accel * sGate)) });
  knots.push({ s: L, v: 0 });
  const piecesOf = () => {
    const out = [];
    let t0 = 0;
    for (let i = 0; i < knots.length - 1; i++) {
      const a = knots[i], b = knots[i + 1], D = b.s - a.s, a0 = i === 0 ? push : 0;
      // The glide: as long as `glide` asks at the gate's speed; from a gate met slower (a bend just before it), it picks
      // up again on the straight, to the gate's speed at most.
      const T = glide && b.s === L ? (D > 1e-6 ? Math.max(pieceTime(D, a.v, 0, 0, Math.max(a.v, S.gate), S.accel),
        clamp(S.glide, 1.67, 2.45) * D / Math.max(1, a.v, S.gate)) : 1e-3)
        : pieceTime(D, a.v, b.v, a0, S.cruise, S.accel);
      out.push({ s0: a.s, t0, q: quintic(D, a.v, b.v, T, a0), glide: glide && b.s === L });
      t0 += T;
    }
    return out;
  };
  let pieces = piecesOf();
  for (let round = 0; round < S.knots; round++) {
    let worst = null;
    for (const p of pieces) {
      if (p.glide) continue;
      for (let i = 1; i < 48; i++) {
        const t = (p.q.T * i) / 48, s = p.s0 + p.q.s(t), v = p.q.v(t), lim = limitAt(table, limits, s);
        if (v > lim * 1.08 && (!worst || v / lim > worst.r)) worst = { s, r: v / lim, v: lim };
      }
    }
    if (!worst) break;
    const near = knots.find((k) => Math.abs(k.s - worst.s) < S.apart);
    if (near && near.s > 0 && near.s < L) near.v = Math.min(near.v, worst.v);
    else if (!near) knots.splice(knots.findIndex((k) => k.s > worst.s), 0, { s: worst.s, v: worst.v });
    else break;
    pieces = piecesOf();
  }
  plan.pieces = pieces;
  const t0 = pieces[pieces.length - 1].t0 + pieces[pieces.length - 1].q.T;
  // At rest and nose away from the way, it turns on the spot first and sets off as the turn ends. On the move the nose
  // takes its time (a quarter turn the longest), the path's own bends turning it as well.
  const h0 = table[0].h, from = h0 + wrapPi(angle - h0), far = Math.abs(from - h0);
  const turn = S.turn[0] + (S.turn[1] - S.turn[0]) * Math.min(1, far / (v0 < 30 ? Math.PI : Math.PI / 2));
  plan.wait = v0 < 30 && far > 1.2 ? turn * 0.5 : 0;
  plan.nose = { from, turn };
  plan.holdT = plan.wait + (glide ? pieces[pieces.length - 1].t0 : 0);
  plan.T = plan.wait + t0;
  plan.end = table[table.length - 1];
  plan.endAngle = wrapPi(plan.end.h);
  plan.burn = S.burn; plan.spoolAt = S.spool;
  return plan;
}

// How far along, how fast and how hard, t seconds in.
function along(plan, t) {
  const u = t - plan.wait;
  if (u <= 0) return { s: 0, v: plan.pieces[0].q.v(0), a: 0 };
  for (const p of plan.pieces) {
    if (u < p.t0 + p.q.T) { const k = u - p.t0; return { s: p.s0 + p.q.s(k), v: p.q.v(k), a: p.q.a(k) }; }
  }
  return { s: plan.L, v: 0, a: 0 };
}

function noseAt(plan, t, h) {
  const N = plan.nose, k = smoother(t / N.turn);
  return N.from + (h - N.from) * k;
}

// The ship's pose t seconds in, in the plan's frame: place, velocity, heading and its turn (rad/s), the push along the way
// (u/s^2), the burns it shows and their spools, and whether it is past the gate (`held`). Past the end: at rest in the
// berth, on the last run's heading exactly.
export function wayAt(plan, t) {
  if (t >= plan.T) {
    return { x: plan.end.x, y: plan.end.y, vx: 0, vy: 0, angle: plan.endAngle, angVel: 0, push: 0,
      thrust: false, retro: false, spool: 0, retroSpool: 0, done: true, held: true };
  }
  const m = along(plan, t), p = pathAt(plan, m.s);
  const h = noseAt(plan, t, p.h), e = 1 / 120;
  const h1 = noseAt(plan, t + e, pathAt(plan, along(plan, t + e).s).h);
  const tx = Math.cos(p.h), ty = Math.sin(p.h);
  return {
    x: p.x, y: p.y, vx: tx * m.v, vy: ty * m.v, angle: wrapPi(h), angVel: (h1 - h) / e, push: m.a,
    thrust: m.a > plan.burn, retro: m.a < -plan.burn,
    spool: m.a > plan.burn ? clamp(m.a / plan.spoolAt, 0.2, 1) : 0,
    retroSpool: m.a < -plan.burn ? clamp(-m.a / plan.spoolAt, 0.2, 1) : 0,
    done: false, held: t >= plan.holdT,
  };
}
