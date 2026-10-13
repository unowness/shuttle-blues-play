// The rock field of the sector the ship is in: where its rocks are placed, how they drift, where they are lost, and how the field
// is kept. Moved out of src/world.js as it was (chat W2, 2026-10-04, refactoring on touch: the field before it changes); the World
// keeps its methods (spawnAsteroids, stepAsteroids, cullAsteroids) as one-line doors to these, so every caller is unchanged. The one
// door that lays rocks, spawnAsteroids, lays none while the World's `autoRocks` is off (a quiet World, the constructor's `quiet`).
//
// A sector's rocks are a count, not places (src/sectors.js `asteroids`): spawned on the World's 'field' stream when the ship enters
// the sector, carried across a seam when they are near the ship (World.enterSector), and drawn only in the sector they belong to.
import { TAU, between, wrapTo } from './util.js';
import { PLANE, WRAP } from './topology.js';
import { mapAreasIn, MAP_PLACEMENT, sampleArea } from './mapContentConfig.js';

// The field's numbers (chat W2, 2026-10-04; SX, after flying: «мало камней мало астероидов ... очень много пустоты ... свободное
// место должно быть, но пустоту надо тоже заполнять ... астероидами»).
//   refillClear  a rock put back is at least this far from the ship (keepField below)
//   density      the sector's count is its layout's (src/sectors.js `rocks`, SX's number on his map) at `density` times the layout's
//                density: 3, measured (a rock in a 1512 x 860 view about half the flying time on the start's routes, where it was a
//                quarter; tools/start-dangers.mjs keeps most routes' lines clear); 4.5 since SX, 2026-10-06: «асероидов и нпс маловато»
//   drift        the field is laid in drifts, not one rock at a time: `size` rocks round a point, within `radius` u of it and `apart`
//                u clear of each other, `mix` the shares of big, middle and small, all going one way at `speed` u/s with up to
//                `jitter` of their own; so a drift holds together a long while, and the space between drifts stays open. Until
//                then every rock was a big one going its own way at 20 to 165 u/s. A drift put back went within `aim` rad of
//                the ship until 2026-10-07 (keepField: no more, so `aim` is read only by a caller that hands spawnRocks a point)
//   meet         rocks are solid to each other and to the stations' bodies (meetRocks; SX, 2026-10-07): two never closer than
//                their outlines and `gap` u (about a cell, so neither outline is drawn over the other), eased apart at `ease` of
//                the overlap a second, the speed that closes them traded by their masses (their radii squared) with `bounce`
//                of it given back; a station's body holds a rock out and turns it back the same way.
//                (SX, 2026-10-08, «астероидов как-то много, и они кучками ... Кучки какие-то большие»: `density` 4.5 -> 3.75, `size` [2, 5] -> [2, 3],
//                `radius` 480 -> 300, and `spread`: a drift's first rock is that far from every rock already out, relaxed after `patience` places
//                refused so a crowded sector keeps its count; the biggest cluster of J-05 is 6 to 7 rocks where it was 16: docs/decisions/2026-10.md)
//   edge         a rock is held off a dead edge by the ship's own rope (World.ropeAccel), measured from its far side, `reach` of its
//                radius out (meetRocks' bound of its outline), so its body never drifts into the fog past the line; and none is laid
//                within that of a dead edge (SX, 2026-10-07: «пусть астероиды туда не улетают, они как и главный корабль и все
//                остальное так же как и раньше отталкиваются оттуда»). A drift at 28 u/s sinks about 10 u past the line; the fog
//                starts 20 u past it (CONFIG.sector.boundary.fog `start`).
export const FIELD = Object.freeze({
  refillClear: 1900,
  density: 3.75,
  drift: Object.freeze({ size: [2, 3], radius: 300, spread: 450, patience: 40, apart: 60, speed: [8, 28], jitter: 6, mix: [0.35, 0.4, 0.25], aim: 0.6 }),
  meet: Object.freeze({ gap: 12, ease: 10, bounce: 0.5 }),
  edge: Object.freeze({ reach: 1.2 }),
});

const NO_EDGES = Object.freeze([]);
// How far the body of radius `r` at (x, y) reaches past `e`, a dead edge of the sector ({ axis, dir }: World.layEdges); under 0 inside.
const pastEdge = (world, e, x, y, r) => (e.axis === 'x' ? (e.dir < 0 ? -x : x - world.width) : (e.dir < 0 ? -y : y - world.height)) + r;
function pastDeadEdge(world, x, y, r) {
  if (world.topology.mode !== PLANE) return false;
  for (const e of world.deadEdges) if (pastEdge(world, e, x, y, r) > 0) return true;
  return false;
}

// `n` counts free-flying rocks; a moored one (none since the authored coins were cut, 2026-10-01) would not take a place in the field.
// Drifts are laid until there are `n`, every rock of one at least `clear` u from the ship; given `toward` (a point), each drift goes
// its way within `drift.aim` rad of it.
export function spawnRocks(world, n, clear = 700, toward = null) {
  const D = FIELD.drift, rng = world.rng('field');
  const areas = mapAreasIn('rock-field', world.sector.id, world.ledger?.restored?.size ?? 0);
  let free = world.asteroids.filter((a) => !a.moored).length, guard = 0, missed = 0;
  let draws = 0;
  while (free < n && guard++ < 2000) {
    // Only some candidate drifts favor the authored pocket. A bounded budget leaves
    // open water elsewhere and lets a crowded pocket fall back to the usual field.
    const preferred = areas.length && draws < MAP_PLACEMENT.fieldTries && draws % MAP_PLACEMENT.fieldEvery === 0;
    const p = preferred ? sampleArea(areas[draws % areas.length], rng, world.width, world.height) : null;
    draws++;
    const x = p ? p.x * world.width : between(rng, 0, world.width), y = p ? p.y * world.height : between(rng, 0, world.height);
    if (!world.clearance(x, y, 260)) continue;
    const d = world.delta(x, y, world.ship.x, world.ship.y);
    if (Math.hypot(d.x, d.y) < clear + D.radius) continue;
    // Drifts are laid apart: a drift's first rock is `spread` u clear of every rock already out, so two drifts do not run into one
    // cluster; after `patience` places refused for it (a crowded sector) the next is taken, and the count is kept. A place refused for
    // this is not a try of the guard's (2,000 a call, as before): `patience` bounds them.
    if (missed < D.patience && world.asteroids.some((o) => Math.hypot(o.x - x, o.y - y) < D.spread)) { missed++; guard--; continue; }
    missed = 0;
    const size = Math.min(n - free, Math.floor(between(rng, D.size[0], D.size[1] + 1)));
    const way = toward ? Math.atan2(toward.y - y, toward.x - x) + between(rng, -D.aim, D.aim) : between(rng, 0, TAU), speed = between(rng, D.speed[0], D.speed[1]);
    const drift = [];
    for (let tries = 0; drift.length < size && tries < 12 * size; tries++) {
      const a = between(rng, 0, TAU), out = drift.length ? D.radius * Math.sqrt(rng()) : 0;
      const px = x + Math.cos(a) * out, py = y + Math.sin(a) * out, pick = rng();
      const tier = pick < D.mix[0] ? 0 : pick < D.mix[0] + D.mix[1] ? 1 : 2;
      if (!world.clearance(px, py, 260)) continue;
      const rock = world.newRock(px, py, tier);
      if (pastDeadEdge(world, px, py, rock.radius * FIELD.edge.reach)) continue;
      if (drift.some((o) => Math.hypot(o.x - px, o.y - py) < o.radius + rock.radius + D.apart)) continue;
      // Clear of every rock already out too (2026-10-07: a drift could be laid over another, and they now meet).
      if (world.asteroids.some((o) => Math.hypot(o.x - px, o.y - py) < o.radius + rock.radius + D.apart)) continue;
      rock.vx = Math.cos(way) * speed + between(rng, -D.jitter, D.jitter);
      rock.vy = Math.sin(way) * speed + between(rng, -D.jitter, D.jitter);
      drift.push(rock);
    }
    world.asteroids.push(...drift);
    free += drift.length;
  }
}

export function stepRocks(world, dt) {
  const edges = (world.topology.mode === PLANE && world.deadEdges) || NO_EDGES, rope = world.constructor.ropeAccel, reach = FIELD.edge.reach;
  for (const a of world.asteroids) {
    if (a.moored) { a.update(dt); continue; }   // turns, never drifts
    const g = world.gravityAt(a.x, a.y);
    a.vx += g.x * dt * 0.35;
    a.vy += g.y * dt * 0.35;
    // The rope off each dead edge, on the rock's far side (FIELD.edge), as on the ship (World.stepBoundary).
    for (let k = 0; k < edges.length; k++) {
      const e = edges[k], depth = pastEdge(world, e, a.x, a.y, a.radius * reach);
      if (depth <= 0) continue;
      if (e.axis === 'x') a.vx += rope(depth, a.vx * e.dir) * e.dir * dt;
      else a.vy += rope(depth, a.vy * e.dir) * e.dir * dt;
    }
    a.update(dt);
    if (world.topology.mode === WRAP) {
      a.x = wrapTo(a.x, world.width);
      a.y = wrapTo(a.y, world.height);
    }
  }
  meetRocks(world, dt);
}

// The rocks meet (SX, 2026-10-07: «с астероидами что-то не то у них черная заливка появилась и они теперь могут пролетать друг над
// другом, так не нужно, пусть они будут по прежнему без заливки»; «дом гараж не должен быть прозрачным, сейчас на него залетают камни»).
// Since the field was laid in drifts three, then four and a half times as dense (2026-10-04, 2026-10-06), drifts crossed and their
// rocks passed through each other; the one in front hides the outline of the one behind where they overlap (labs/graphics/world-art.js
// rocksOver), so the front one read as filled black, flying over the other. And a rock drifted through HOME and the stations, which
// only the ship met. Now two rocks are held apart by their outlines along the line between them and bounce off each other by their
// masses, and a station's body (src/stations.js contact, its float's turn and drift included) holds a rock out and turns it back.
// About 10,000 pairs a step in a field of 142, each ruled out by its box first: no allocation.
export function meetRocks(world, dt) {
  const rocks = world.asteroids, n = rocks.length, M = FIELD.meet, wrap = world.topology.mode === WRAP;
  const ease = Math.min(1, M.ease * dt);
  for (let i = 0; i < n; i++) {
    const a = rocks[i], ra = a.radius * 1.2;
    for (let j = i + 1; j < n; j++) {
      const b = rocks[j], reach = ra + b.radius * 1.2 + M.gap;
      let dx = b.x - a.x, dy = b.y - a.y;
      if (wrap) { const d = world.delta(b.x, b.y, a.x, a.y); dx = d.x; dy = d.y; }
      if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
      let dist = Math.hypot(dx, dy);
      if (dist >= reach) continue;
      const th = dist > 1e-6 ? Math.atan2(dy, dx) : (i * 7 + j * 13) % 16 / 16 * TAU;
      const touch = a.radiusAt(th - a.angle) + b.radiusAt(th + Math.PI - b.angle) + M.gap;
      if (dist >= touch) continue;
      const nx = Math.cos(th), ny = Math.sin(th);
      // Their masses as their radii squared; a moored rock (none since 2026-10-01) does not move.
      const ma = a.moored ? Infinity : a.radius * a.radius, mb = b.moored ? Infinity : b.radius * b.radius;
      if (ma === Infinity && mb === Infinity) continue;
      const sa = ma === Infinity ? 0 : mb === Infinity ? 1 : mb / (ma + mb), sb = 1 - sa;
      const push = (touch - dist) * ease;
      a.x -= nx * push * sa; a.y -= ny * push * sa;
      b.x += nx * push * sb; b.y += ny * push * sb;
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing <= 0) continue;
      const k = closing * (1 + M.bounce);
      a.vx -= nx * k * sa; a.vy -= ny * k * sa;
      b.vx += nx * k * sb; b.vy += ny * k * sb;
    }
  }
  holdOutOfStations(world, rocks, null, M.bounce);
}

// Things that drift (rocks, loose coins and canisters, a broken body's hanging pieces) held out of the stations' bodies (src/stations.js
// contact: the box with its rounded corners, turned and moved by its float) and turned back off them with `bounce` of the speed that
// closed them, against the station's own motion. `radiusOf(thing)` its size (under 0: left alone), or null for each thing's own `radius` (the
// rocks'). `shell` (u, or Infinity): only a thing within it of the
// body's face is held out, so a broken station's own pieces, flung out from inside it, go their way. SX, 2026-10-07: «дом гараж не
// должен быть прозрачным, сейчас на него залетают камни и монеты, возможно и на все станции тоже».
// Every rock meets every station here at every step, and the few that are near enough to touch one are all that goes on to `pushOut`. The
// rocks' loop reads the size where it stands and, on the plane, takes the difference here, as meetRocks does: one loop that took the size
// by a function or by null merged a field's number with a call's result, and V8 boxed the size for every pair (~10 KB of garbage a frame in
// J-05, 2026-10-09, in Chrome's second compiler; the callers with a function keep the other loop).
export function holdOutOfStations(world, things, radiusOf, bounce, shell = Infinity) {
  const stations = world.stations;
  if (!stations.length || !things.length) return;
  const delta = world.delta.bind(world), topo = world.topology, plane = topo.mode === PLANE;
  for (const st of stations) {
    const far = Math.hypot(st.body.hx, st.body.hy);
    if (radiusOf === null) {
      for (const t of things) {
        const r = t.radius;
        if (r < 0) continue;
        let dx = t.x - st.x, dy = t.y - st.y;
        if (!plane) { dx = topo.dx(t.x, st.x); dy = topo.dy(t.y, st.y); }
        const reach = far + r;
        if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
        pushOut(delta, st, t, r, bounce, shell);
      }
      continue;
    }
    for (const t of things) {
      const r = radiusOf(t);
      if (r < 0) continue;
      const reach = far + r, d = delta(t.x, t.y, st.x, st.y);
      if (d.x > reach || d.x < -reach || d.y > reach || d.y < -reach) continue;
      pushOut(delta, st, t, r, bounce, shell);
    }
  }
}

// A thing within a station's reach: out of the body if it is in it, turned back off it if it was closing on it.
function pushOut(delta, st, t, r, bounce, shell) {
  const c = st.contact(t.x, t.y, r, delta);
  if (!c || c.inside || c.depth > shell) return;
  const closing = -((t.vx - st.vx) * c.nx + (t.vy - st.vy) * c.ny);
  if (shell !== Infinity && closing <= 0) return;
  t.x += c.nx * c.depth; t.y += c.ny * c.depth;
  if (closing > 0) { t.vx += c.nx * closing * (1 + bounce); t.vy += c.ny * closing * (1 + bounce); }
}

export function cullRocks(world) {
  for (let i = world.asteroids.length - 1; i >= 0; i--) {
    const a = world.asteroids[i];
    if (a.dead) { world.asteroids.splice(i, 1); continue; }
    if (world.consumedByHole(a.x, a.y, a.radius * 0.4)) {
      world.shred(a, 0.4);
      world.asteroids.splice(i, 1);
      continue;
    }
    // A free rock that meets a planet breaks up on it. Nothing is released:
    // only rocks broken by the pilot pay.
    if (!a.moored && world.insidePlanet(a.x, a.y, a.radius * 0.5)) {
      world.shred(a, 0.6);
      world.asteroids.splice(i, 1);
      continue;
    }
    // Rocks past a dead edge, or far past a live seam, are gone; the field
    // refills itself.
    if (world.topology.mode === PLANE &&
        world.beyondLimits(a.x, a.y, a.radius)) {
      world.asteroids.splice(i, 1);
    }
  }
}

// The field keeps its count (chat W2, 2026-10-04; SX, after flying: «нету ни астероидов»). A sector's rocks drift and are lost past
// its edges and seams (three in four of them), on its planets and in its holes; the field was refilled only when its last free rock
// was gone, so J-05's 56 were 9 to 15 ten minutes later and the void grew the longer a pilot stayed. Now what is lost is put back as
// a drift once a drift's worth is missing (the smallest, `drift.size[0]`), `refillClear` u or more from the ship: past what the
// widest window shows round it (2560 x 1600: a half diagonal of 1,509 u, the camera's lead of 220 and a big rock's 130), so none
// appears where the pilot is looking. Each such drift went toward where the ship was (within `drift.aim`) until 2026-10-07, so every
// drift put back closed on the pilot and the field gathered where the pilot kept to (SX: «все скапливается в одном месте»; measured
// over 20-30 minutes parked: a quarter of the sector's rocks within 2,500 u of the ship, where the area holds a sixth); now it goes
// its own way, as the drifts laid with the sector do, anywhere in the sector out of sight.
export function keepField(world) {
  let free = 0;
  for (const a of world.asteroids) if (!a.moored) free++;
  const n = world.sector.asteroids;
  if (free <= n - FIELD.drift.size[0] || (free === 0 && n > 0)) world.spawnAsteroids(n, FIELD.refillClear);
}
