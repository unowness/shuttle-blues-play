// The warning before a heavy hit (SX's 3B, 2026-10-04: the novice's losses are damage, not pay; chat F1): what the ship would meet
// if the pilot did nothing more, how hard, and whether it is still time to brake. Pure: it reads the world and changes nothing (the
// page asks once a frame and says it, labs/graphics/hit-warning.js). The rules and the numbers are FLIGHT.warn (src/flightConfig.js).
//
// The way ahead is flown as the ship would coast (with the brake's drag while the brake is held), pulled by gravity and pushed by a
// planet's orbit as the step does (World.gravityAt, World.orbitAccel), the rocks going on along their own way and the stations where
// they are; the first contact is weighed by the hull's own rule (World.impactDamage), a planet's by the speed the ship would be falling
// at when it crossed the orbit's line, as the contact rule does (src/contact.js).
import { CONFIG } from './config.js';
import { FLIGHT } from './flightConfig.js';
import { PLANE } from './topology.js';
import { hypot2 } from './util.js';

const W = FLIGHT.warn;

// The closing speed under which a blow on a thing of `kind` costs less than `heavy` points (the hull's rule, src/contact.js impactPoints,
// solved for the speed: `base` x (v / refSpeed) to `power`, rounded; the cube since 2026-10-08, so 468 u/s on a rock). A hull up in a jump is
// not weighed at all, and what it comes down on is weighed by the contact when it comes (CONFIG.hull.landing).
export function safeSpeed(kind, heavy = W.heavy) {
  const H = CONFIG.hull, base = H.base[kind] ?? H.base.rock;
  return H.refSpeed * ((heavy - 0.51) / base) ** (1 / H.power);
}

// How long before the contact a blow closing at `closing` u/s has to be said: the hand's time and the brake's to bring it under heavy,
// and one step of the way flown ahead (a blow is first seen up to a step late).
export function leadOf(ship, kind, closing) {
  const safe = safeSpeed(kind);
  return W.react + W.step + (closing > safe ? Math.log(closing / safe) / ship.params().damperDrag : 0);
}

// The way ahead, kept from call to call (x, y, vx, vy a step), and the rocks it can reach: the page asks every frame the ship flies,
// and until 2026-10-06 each of the way's 48 steps measured every rock of the sector (142 near YARD 3: 6,800 offsets made and dropped a
// frame, 0.16 ms of the frame in Chrome; the spikes on events, docs/playbook/rendering-performance.md).
let way = new Float64Array(0);
const near = [];
// The margin a rock is kept by when the way's box is measured against its own (u): a rock left out is one no step of the way comes
// within its radius and the hull's of, with room to spare for the last bit of a sum.
const REACH_SPARE = 1;

// The heavy blow ahead, or null: { kind, t (s to it), closing (u/s), damage (points), fatal, lead (s), x, y (where), id (the thing) }.
// `braking`: the brake is held (the way ahead is flown with it). Nothing while the ship cannot be hurt or is not the pilot's to fly.
export function heavyHitAhead(world, { braking = false } = {}) {
  const ship = world.ship;
  if (!ship.alive || world.docked || ship.airborne || world.home || ship.invuln > 0) return null;
  if (hypot2(ship.vx, ship.vy) < CONFIG.hull.touchSpeed) return null;
  const P = ship.params(), drag = braking ? P.damperDrag : P.drag, O = CONFIG.planet.orbit;
  const dt = W.step, n = Math.ceil(W.most / dt), r = ship.radius;
  // The way first, as the ship would coast: it does not depend on what it meets. Its box, for the rocks.
  if (way.length < 4 * n) way = new Float64Array(4 * n);
  let x = ship.x, y = ship.y, vx = ship.vx, vy = ship.vy, x0 = x, x1 = x, y0 = y, y1 = y;
  for (let i = 1; i <= n; i++) {
    const g = world.gravityAt(x, y), o = world.orbitAccel(x, y, vx, vy);
    vx += (g.x + o.ax) * dt; vy += (g.y + o.ay) * dt;
    const k = Math.max(0, 1 - drag * dt);
    vx *= k; vy *= k;
    x += vx * dt; y += vy * dt;
    const j = 4 * (i - 1);
    way[j] = x; way[j + 1] = y; way[j + 2] = vx; way[j + 3] = vy;
    if (x < x0) x0 = x; else if (x > x1) x1 = x;
    if (y < y0) y0 = y; else if (y > y1) y1 = y;
  }
  // The rocks whose own way over the same time comes near the ship's box (all of them where the sky wraps round: a box says nothing
  // there), in the world's order, so the first one met is the one it always was.
  near.length = 0;
  const box = world.topology?.mode === PLANE, t1 = dt, tn = n * dt;
  for (const a of world.asteroids) {
    if (box) {
      const reach = a.radius + r + REACH_SPARE, ax0 = a.x + a.vx * t1, axn = a.x + a.vx * tn, ay0 = a.y + a.vy * t1, ayn = a.y + a.vy * tn;
      if (Math.max(ax0, axn) + reach < x0 || Math.min(ax0, axn) - reach > x1 || Math.max(ay0, ayn) + reach < y0 || Math.min(ay0, ayn) - reach > y1) continue;
    }
    near.push(a);
  }
  // A planet's orbit crossed on the way: the inward speed it was crossed at (one the ship is already inside: the world's own record).
  const fall = new Map(world.orbitContact ?? []);
  const delta = world.delta.bind(world), topo = world.topology;
  for (let i = 1; i <= n; i++) {
    const j = 4 * (i - 1);
    x = way[j]; y = way[j + 1]; vx = way[j + 2]; vy = way[j + 3];
    const t = i * dt;
    let hit = null;
    for (const a of near) {
      const ax = a.x + a.vx * t, ay = a.y + a.vy * t, dx = topo.dx(x, ax), dy = topo.dy(y, ay), dist = hypot2(dx, dy);
      if (dist >= a.radius + r || dist < 1e-6) continue;
      const nx = dx / dist, ny = dy / dist, closing = -((vx - a.vx) * nx + (vy - a.vy) * ny);
      if (closing > 0) { hit = { kind: 'rock', closing, damage: world.rockDamage(closing), x: ax + nx * a.radius, y: ay + ny * a.radius, id: a }; break; }
    }
    if (!hit) {
      for (const st of world.stations) {
        if (st.id === world.leavingStation) continue;
        // Past the body's reach on either axis, no contact: not asked (Station.contact makes a delta and a turned point to say no).
        const far = st.far + r;
        if (Math.abs(topo.dx(x, st.x)) > far || Math.abs(topo.dy(y, st.y)) > far) continue;
        const c = st.contact(x, y, r, delta);
        if (!c) continue;
        const closing = -(vx * c.nx + vy * c.ny);
        if (closing > 0) { hit = { kind: 'station', closing, damage: world.impactDamage(closing, 'station'), x: c.px, y: c.py, id: st }; break; }
      }
    }
    if (!hit) {
      for (const p of world.planets) {
        const dx = topo.dx(x, p.x), dy = topo.dy(y, p.y), dist = hypot2(dx, dy);
        if (dist < 1e-6) continue;
        const nx = dx / dist, ny = dy / dist, inward = -(vx * nx + vy * ny);
        if (dist < p.radius + O.height && !fall.has(p)) fall.set(p, Math.max(0, inward));
        if (dist >= p.radius * 0.97) continue;
        const closing = Math.max(inward, fall.get(p) ?? 0);
        hit = { kind: 'planet', closing, damage: world.impactDamage(closing, 'planet'), x: p.x + nx * p.radius, y: p.y + ny * p.radius, id: p };
        break;
      }
    }
    if (!hit) continue;
    const fatal = hit.damage >= world.hull, lead = leadOf(ship, hit.kind, hit.closing);
    if ((hit.damage < W.heavy && !fatal) || t > lead) return null;
    return { ...hit, t, fatal, lead };
  }
  return null;
}
