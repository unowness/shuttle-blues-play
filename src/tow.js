// The towed cargo: a body on a tether (SX, 2026-10-01: «физику грузов, они должны одергивать и
// влиять на корабль, они должны сталкиваться с препятствиями, если ты грузом снес пирата ему
// наносится дамаг, когда ты тормозишь тяжелый груз может врезаться в твой корабль и задамажить
// его на 1-2»; «Груз задамажится сам при столкновении не может»).
//
// Until then the container was a follower eased toward a point behind the hull: it touched
// nothing and the load was a flat share of the engine. Now it has a mass (CONFIG.cargo.sizes,
// in ships) and a velocity, and the tether between it and the hull only pulls:
//
//   slack   the container coasts on its own drag, gravity, a planet's cushion and a dead
//           edge's current, as the hull does. A hull that brakes is overtaken by it.
//   taut    the stretch is taken out of both ends by their masses: the part of the closing
//           speed that would stretch it is removed, with a little snap back, and the hull
//           gets its share. That share is the tug a pilot feels: a load that runs out of
//           slack yanks the hull back and, pulling across it, turns it.
//
// The container's body is a capsule along its own heading (its pull end toward the hull). It
// meets rocks, planets' surfaces, pirates, droids and the hull itself, and gives back part of
// the closing speed; what it costs is the other side's: a pirate loses hit points, the hull
// one or two points, a rock and a droid are shoved. The container itself is never hurt; a
// station's body holds it out as it holds the hull (since 2026-10-01). A container that falls
// past a black hole's horizon takes the ship through with it.
//
// Nothing here reads artwork: the anchor, the body and the masses are CONFIG numbers in world
// units, like the chassis's.

import { CONFIG } from './config.js';
import { cargoLifted } from './trick.js';
import { TAU, clamp } from './util.js';
import { cargoOf, cargoSize } from './contracts.js';
import { stationDefById } from './sectors.js';

const SHIP_MASS = 1;

// The size record of the job in tow (CONFIG.cargo.sizes).
export const towSize = (world) => cargoOf(world.ledger.activeJob());

// A job's container body, { r, half } in u: its sending station's own cargo's (CONFIG.cargo.bodies, by the station's look), or the plain
// container's by its size. `reach` is the circle round it (what the one plane meets, src/groundPlane.js).
export function cargoBody(job) {
  const own = CONFIG.cargo.bodies[stationDefById(job?.from)?.look]?.[['small', 'medium', 'large'].indexOf(cargoSize(job))];
  if (own) return { r: own[0], half: own[1], reach: Math.max(own[0], own[1]) };
  const T = CONFIG.cargo.tow, k = cargoOf(job).scale;
  return { r: T.radius * k, half: T.half * k, reach: Math.max(T.radius, T.half) * k };
}
export const towBody = (world) => cargoBody(world.ledger.activeJob());

// The tether's length at rest, from the anchor to the container's middle: a bigger container
// hangs further back, as it always has (CONFIG.cargo.trailDistance).
export function restLength(size) {
  const C = CONFIG.cargo;
  return C.trailDistance * (1 + (size.scale - 1) * 0.6) - C.tow.anchor;
}

// Where the tether is made fast on the hull: `anchor` u behind the pivot.
export function anchorOf(ship) {
  const a = CONFIG.cargo.tow.anchor;
  return { x: ship.x - Math.cos(ship.angle) * a, y: ship.y - Math.sin(ship.angle) * a };
}

// A container at (x, y), still, its pull end toward the hull, on a tether no shorter than
// the distance to the anchor (it is reeled in from there).
export function makeTow(world, x, y, size = towSize(world)) {
  const ship = world.ship, at = anchorOf(ship);
  const d = world.delta(at.x, at.y, x, y);
  return {
    x, y, vx: 0, vy: 0,
    angle: Math.atan2(d.y, d.x), spin: 0,
    length: Math.max(restLength(size), Math.hypot(d.x, d.y)),
  };
}

// A container hanging straight behind the hull at rest, moving with it.
export function towBehind(world, size = towSize(world)) {
  const ship = world.ship, at = anchorOf(ship), L = restLength(size);
  const back = ship.angle + Math.PI;
  return {
    x: at.x + Math.cos(back) * L, y: at.y + Math.sin(back) * L,
    vx: ship.vx, vy: ship.vy, angle: ship.angle, spin: 0, length: L,
  };
}

// The container's capsule (its body, `cargoBody`): the segment between the centres of its two end caps, and their radius.
export function capsuleOf(tow, body) {
  const r = body.r;
  const h = Math.max(0, body.half - r);
  const ux = Math.cos(tow.angle), uy = Math.sin(tow.angle);
  return { ax: tow.x - ux * h, ay: tow.y - uy * h, bx: tow.x + ux * h, by: tow.y + uy * h, r, h };
}

// The point of the capsule's segment nearest to (px, py), in the world's own frame.
function nearestOn(world, cap, px, py) {
  const sx = cap.bx - cap.ax, sy = cap.by - cap.ay;
  const len2 = sx * sx + sy * sy;
  const d = world.delta(px, py, cap.ax, cap.ay);
  const t = len2 > 1e-9 ? clamp((d.x * sx + d.y * sy) / len2, 0, 1) : 0;
  return { x: cap.ax + sx * t, y: cap.ay + sy * t };
}

// The container's own turn from an impulse `dv` (u/s, on the container) at `at`: a rod's
// moment of inertia, so a blow at an end spins it and one at the middle does not.
function kick(tow, cap, at, dvx, dvy) {
  const lx = at.x - tow.x, ly = at.y - tow.y;
  const k2 = (cap.h * cap.h) / 3 + (cap.r * cap.r) / 2;
  tow.spin += (lx * dvy - ly * dvx) / Math.max(1, k2);
}

// One step of the towed cargo. The world calls it after the hull, the rocks and the pirates
// have moved, while a cargo is in tow and the ship is alive.
export function stepTow(world, dt) {
  const ship = world.ship, tow = world.cargo;
  const T = CONFIG.cargo.tow;
  const size = towSize(world);

  // Docked, it rides in the berth behind the hull: nothing moves it and nothing is hit.
  if (world.docked) { Object.assign(tow, towBehind(world, size)); return; }

  const m = size.mass;

  // What moves it on its own: gravity, a planet's cushion and a dead edge's current, the
  // same accelerations the hull feels, and its drag.
  const g = world.gravityAt(tow.x, tow.y);
  const o = world.orbitAccel(tow.x, tow.y, tow.vx, tow.vy);
  const b = world.topology.mode === 'plane' ? world.boundaryAccel(tow.x, tow.y, tow.vx, tow.vy) : { ax: 0, ay: 0 };
  tow.vx += (g.x + o.ax + b.ax) * dt;
  tow.vy += (g.y + o.ay + b.ay) * dt;
  const k = Math.max(0, 1 - T.drag * dt);
  tow.vx *= k; tow.vy *= k;
  tow.x += tow.vx * dt;
  tow.y += tow.vy * dt;

  // A tether let out further than it should be is reeled in.
  const rest = restLength(size);
  if (tow.length > rest) tow.length = Math.max(rest, tow.length - T.reel * dt);

  // The tether. It only pulls: shorter than its length it is slack and does nothing. Taut, it
  // stretches (SX, 2026-10-01: «Грузы должны чуть плавнее двигаться в космосе, сейчас ощущение что у
  // них вообще нет веса»): until then it was rigid, and a hull that pulled had its load moving with it
  // within the step. Now the pull grows with the stretch and with how fast the ends part, a spring of
  // `spring` rad/s damped at `damping` of critical, so a load takes a moment to follow, swings on and is
  // caught back: it is felt to have weight. Past `give` of its length it is rigid again, as before, so a
  // load never runs away from the hull; that catch, and a tether snapping taut, are what is heard.
  const at = anchorOf(ship);
  const d = world.delta(tow.x, tow.y, at.x, at.y);
  const dist = Math.hypot(d.x, d.y);
  let taut = false;
  if (dist > tow.length && dist > 1e-6) {
    taut = true;
    const nx = d.x / dist, ny = d.y / dist;
    // The anchor moves with the hull and swings with its turn.
    const rx = at.x - ship.x, ry = at.y - ship.y;
    const avx = ship.vx - ship.angVel * ry, avy = ship.vy + ship.angVel * rx;
    const inv = 1 / SHIP_MASS + 1 / m;
    let apart = (tow.vx - avx) * nx + (tow.vy - avy) * ny;
    const stretch = dist - tow.length;
    const w = T.spring, limit = tow.length * T.give;
    // The spring's share: an impulse on the pair by their masses, and only ever a pull.
    let j = Math.max(0, (w * w * stretch + 2 * T.damping * w * apart) * dt / inv);
    apart -= j * inv;
    // Past its give it is a rigid line again: the parting speed left is taken out at once, with a
    // little snap back, and the stretch beyond the give with it.
    let caught = 0;
    if (stretch > limit && apart > 0) {
      const e = apart > 30 ? T.snap : 0;
      caught = ((1 + e) * apart) / inv;
      j += caught;
    }
    if (j > 0) {
      tow.vx -= (nx * j) / m; tow.vy -= (ny * j) / m;
      const dv = j / SHIP_MASS;
      ship.vx += nx * dv; ship.vy += ny * dv;
      // Pulled at the tail, the hull turns: the arm from the pivot to the anchor across the pull.
      const arm = T.anchor || 1;
      ship.angVel += T.yaw * ((rx / arm) * ny - (ry / arm) * nx) * dv;
      world.towPull = Math.max(world.towPull || 0, dv);
    }
    // A hard snap is heard, at most every `snapCue.every` s: the catch at the give, or a slack tether
    // pulled taut by ends parting at `snapCue.speed` u/s or more.
    const snap = caught / SHIP_MASS >= T.snapCue.pull || (!tow.taut && apart + j * inv >= T.snapCue.speed);
    if (snap && world.time - world.tetherCueAt >= T.snapCue.every) {
      world.tetherCueAt = world.time;
      world.emit('tetherSnapped', { sectorId: world.sector.id, x: at.x, y: at.y, pull: Math.round(Math.max(caught / SHIP_MASS, T.snapCue.pull)) });
    }
    // Back onto the give: only the container moves, so the hull is never shoved into anything by
    // it; the tug above is how the hull feels the pull.
    if (stretch > limit) {
      tow.x -= nx * (stretch - limit);
      tow.y -= ny * (stretch - limit);
    }
  }
  tow.taut = taut;

  // The swing is damped (SX, 2026-10-01, late: «Грузы сейчас слишком активно летают вокруг ... как будто вообще
  // невесомые, крутятся»): the container's speed round the anchor, across the tether, is taken out at `swing` 1/s, as
  // a heavy load hangs back in a trailer's way instead of circling the hull. Only the container is slowed; the hull
  // still feels the pull through the tether above. Along the tether nothing changes.
  if (T.swing && dist > 1e-6) {
    const nx = d.x / dist, ny = d.y / dist;
    const rx = at.x - ship.x, ry = at.y - ship.y;
    const avx = ship.vx - ship.angVel * ry, avy = ship.vy + ship.angVel * rx;
    const across = (tow.vx - avx) * -ny + (tow.vy - avy) * nx;
    const k = Math.min(1, T.swing * dt);
    tow.vx -= -ny * across * k; tow.vy -= nx * across * k;
  }

  // The container's heading: toward the anchor while it pulls, tumbling on its own while slack.
  // A heavy load never turns faster than `maxSpin` rad/s, pulled round or tumbling (SX, 2026-10-01, late: «крутятся»).
  const top = T.maxSpin ?? Infinity;
  if (taut) {
    const want = Math.atan2(-d.y, -d.x);
    const diff = Math.atan2(Math.sin(want - tow.angle), Math.cos(want - tow.angle));
    const turn = clamp(diff * Math.min(1, T.align * dt), -top * dt, top * dt);
    tow.angle += turn;
    // A step of no time (the lab's scenes call updateCargo(0) to set a cargo in place) turns nothing and keeps the spin it
    // had: turn / 0 was a NaN that spread from the container to the hull through the tether (chat R, 2026-10-04).
    if (dt > 0) tow.spin = turn / dt;
  } else {
    tow.spin = clamp(tow.spin, -top, top);
    tow.angle += tow.spin * dt;
    tow.spin *= Math.max(0, 1 - T.spinDrag * dt);
  }
  if (tow.angle > Math.PI) tow.angle -= TAU;
  if (tow.angle < -Math.PI) tow.angle += TAU;

  collide(world, tow, size, towBody(world));
}

// What the container meets, in order: the hull, rocks, planets, pirates, droids, then a hole.
function collide(world, tow, size, body) {
  const T = CONFIG.cargo.tow, H = CONFIG.cargo.hit;
  const ship = world.ship;
  const m = size.mass;
  let cap = capsuleOf(tow, body);
  // In a jump (src/trick.js) the hull is over its load and meets it not, and the load, lifted after the hull with the tether's delay,
  // passes over rocks, stations, pirates and droids; a planet still sends it off. On the ground both are false: nothing changes.
  const lifted = world.stunts ? cargoLifted(world) : false;
  const apart = lifted || ship.airborne === true;

  // Two bodies apart along n (from the container to the other), the other of mass `other`
  // (Infinity for a thing that does not move). Returns the closing speed it had.
  const meet = (P, nx, ny, vx, vy, other, push, apply) => {
    const closing = (tow.vx - vx) * nx + (tow.vy - vy) * ny;
    tow.x -= nx * push; tow.y -= ny * push;
    if (closing <= 0) return 0;
    const inv = 1 / m + (Number.isFinite(other) ? 1 / other : 0);
    const j = ((1 + T.bounce) * closing) / inv;
    const dvx = (-nx * j) / m, dvy = (-ny * j) / m;
    tow.vx += dvx; tow.vy += dvy;
    kick(tow, cap, P, dvx, dvy);
    if (apply && Number.isFinite(other)) apply((nx * j) / other, (ny * j) / other);
    cap = capsuleOf(tow, body);
    return closing;
  };

  // The hull. Its tail reaches further back than its collider (the drawing is longer than the
  // circle the rocks meet), so its own load meets it at `shipReach`, and as much further out as the look worn adds to the body
  // (Ship.bodyExtra, src/chassis.js LOOK_BODIES: 0 for SX's ship and every hull without a look of its own).
  if (ship.alive && !apart) {
    const P = nearestOn(world, cap, ship.x, ship.y);
    const d = world.delta(ship.x, ship.y, P.x, P.y);
    const dist = Math.hypot(d.x, d.y), touch = cap.r + T.shipReach + ship.bodyExtra;
    if (dist < touch) {
      const nx = dist > 1e-6 ? d.x / dist : Math.cos(tow.angle), ny = dist > 1e-6 ? d.y / dist : Math.sin(tow.angle);
      const closing = meet(P, nx, ny, ship.vx, ship.vy, SHIP_MASS, touch - dist, (dvx, dvy) => { ship.vx += dvx; ship.vy += dvy; });
      if (closing > 0) {
        const blow = m * closing;
        const points = blow >= H.ship[1] ? H.shipPoints[1] : blow >= H.ship[0] ? H.shipPoints[0] : 0;
        const x = P.x + nx * cap.r, y = P.y + ny * cap.r;
        if (points) world.damageShip(points, 'cargo', { x, y });
        world.cargoBumped({ x, y, speed: closing, what: 'ship' });
        if (!ship.alive) return;
      }
    }
  }

  // Rocks: a moored one does not move, a free one is shoved by its mass (its area against the hull's).
  for (const a of lifted ? [] : world.asteroids) {
    const P = nearestOn(world, cap, a.x, a.y);
    const d = world.delta(P.x, P.y, a.x, a.y);
    const dist = Math.hypot(d.x, d.y);
    if (dist > a.radius + cap.r) continue;
    const touch = a.radiusAt(Math.atan2(d.y, d.x) - a.angle) + cap.r;
    if (dist >= touch) continue;
    // n from the container to the rock.
    const nx = dist > 1e-6 ? -d.x / dist : 1, ny = dist > 1e-6 ? -d.y / dist : 0;
    const mass = a.moored ? Infinity : (a.radius / CONFIG.cargo.tow.rockUnit) ** 2;
    const closing = meet(P, nx, ny, a.vx, a.vy, mass, touch - dist, (dvx, dvy) => { a.vx += dvx; a.vy += dvy; });
    if (closing > 0) world.cargoBumped({ x: P.x + nx * cap.r, y: P.y + ny * cap.r, speed: closing, what: 'rock' });
  }

  // Planets' surfaces: held out, and bounced off.
  for (const p of world.planets) {
    const P = nearestOn(world, cap, p.x, p.y);
    const d = world.delta(P.x, P.y, p.x, p.y);
    const dist = Math.hypot(d.x, d.y), touch = p.radius * 0.97 + cap.r;
    if (dist >= touch) continue;
    const nx = dist > 1e-6 ? -d.x / dist : 1, ny = dist > 1e-6 ? -d.y / dist : 0;
    const closing = meet(P, nx, ny, 0, 0, Infinity, touch - dist, null);
    if (closing > 0) world.cargoBumped({ x: P.x + nx * cap.r, y: P.y + ny * cap.r, speed: closing, what: 'planet' });
  }

  // Stations' bodies (CONFIG.station.bodies, solid since 2026-10-01): held out and bounced off, as from a
  // planet. The berth the ship has just left lets the container through with it. The capsule is tried at its
  // two ends and its middle.
  for (const st of lifted ? [] : world.stations) {
    if (st.id === world.leavingStation) continue;
    for (const k of [0, 0.5, 1]) {
      const P = { x: cap.ax + (cap.bx - cap.ax) * k, y: cap.ay + (cap.by - cap.ay) * k };
      const c = st.contact(P.x, P.y, cap.r, world.delta.bind(world));
      if (!c) continue;
      // n from the container into the station.
      const closing = meet(P, -c.nx, -c.ny, 0, 0, Infinity, c.depth, null);
      if (closing > 0) world.cargoBumped({ x: P.x - c.nx * cap.r, y: P.y - c.ny * cap.r, speed: closing, what: 'station' });
    }
  }

  // Pirates: knocked away by their mass, and hurt by the blow (CONFIG.cargo.hit.pirate).
  for (const p of lifted ? [] : [...world.pirates]) {
    if (!world.pirates.includes(p)) continue;
    const P = nearestOn(world, cap, p.x, p.y);
    const d = world.delta(p.x, p.y, P.x, P.y);
    const dist = Math.hypot(d.x, d.y), touch = cap.r + p.radius;
    if (dist >= touch) continue;
    const nx = dist > 1e-6 ? d.x / dist : 1, ny = dist > 1e-6 ? d.y / dist : 0;
    // The pirate is moved out of the container rather than the other way round: it is the
    // lighter thing in the way of a load.
    p.x += nx * (touch - dist); p.y += ny * (touch - dist);
    const closing = meet(P, nx, ny, p.vx, p.vy, H.pirate.mass, 0, (dvx, dvy) => { p.vx += dvx; p.vy += dvy; });
    if (closing <= 0 || (p.cargoGrace || 0) > 0) continue;
    p.cargoGrace = H.pirate.grace;
    const x = P.x + nx * cap.r, y = P.y + ny * cap.r;
    world.cargoBumped({ x, y, speed: closing, what: 'pirate' });
    if (closing < H.pirate.speed) continue;
    const amount = clamp(Math.round((m * closing) / H.pirate.per), 1, H.pirate.max);
    world.hurtPirate(p, 'cargo', { amount, x, y, aim: Math.atan2(-ny, -nx) });
  }

  // Droids (src/droids.js): shoved, never hurt.
  for (const dr of lifted ? [] : world.droids || []) {
    const P = nearestOn(world, cap, dr.x, dr.y);
    const d = world.delta(dr.x, dr.y, P.x, P.y);
    const dist = Math.hypot(d.x, d.y), touch = cap.r + CONFIG.droids.radius;
    if (dist >= touch) continue;
    const nx = dist > 1e-6 ? d.x / dist : 1, ny = dist > 1e-6 ? d.y / dist : 0;
    const closing = meet(P, nx, ny, dr.vx, dr.vy, CONFIG.droids.mass, touch - dist, (dvx, dvy) => { dr.vx += dvx; dr.vy += dvy; dr.spin += (dvx * ny - dvy * nx) * 0.02; });
    if (closing > 0) world.cargoBumped({ x: P.x + nx * cap.r, y: P.y + ny * cap.r, speed: closing, what: 'droid' });
  }

  // A black hole takes the container, and the ship with it.
  if (ship.alive && ship.holeGrace <= 0) {
    for (const h of world.holes) {
      const d = world.delta(tow.x, tow.y, h.x, h.y);
      if (Math.hypot(d.x, d.y) < h.horizon) { world.transitHole(h); return; }
    }
  }
}
