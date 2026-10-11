// What the hull meets in open space: a hole's horizon, rocks, droids, stations, the NPC ships and the planets' surfaces. Moved out
// of World.resolveHits as it was (chat F1, 2026-10-04, the roadmap's refactoring piece: one contact() out of src/world.js; the code
// review's finding 11, five copies of one reaction to a touch); World.resolveHits calls shipContacts at the same place, after the
// shots, and the golden master (tools/golden.mjs) holds the move to the same frames and the same world.
//
// Every blow takes the same course: the hull is held out of the thing, pays World.impactDamage by the thing's kind (World.damageShip,
// which honours invulnerability and the grace second), and, still whole, bounces off it by the closing speed and the bump's
// restitution with sparks where it met (contact below). A rock's bump is World.bumpShip (it pushes a free rock too and has its own
// sparks); an NPC is struck before it is bounced off (its sparks are drawn at the hull's speed as it struck).
import { CONFIG } from './config.js';
import { clamp, hypot2 } from './util.js';
import { knockDroid } from './droids.js';
import { landedNow } from './trick.js';

// What a blow closing at `closing` u/s costs the hull, in points (CONFIG.hull; SX, 2026-10-01: «высокая скорость является
// множителем для дамага», 2026-10-08 the cube): nothing under `touchSpeed`; otherwise the kind's `base` points at `refSpeed`, times
// (closing / refSpeed) to `power`, rounded, never under one; a light thing (`light.kinds`: a droid, a pirate, a cache) always between
// `light.min` and `light.max`. `landed`: the hull came down on the thing from a jump, so the blow is `landing.mult` times as heavy
// (never a planet's: a jump bounces off one, src/trick.js bouncePlanets). Pure: World.impactDamage, the warning before a heavy hit
// (src/hitWarning.js) and the economy simulator (tools/quest-economy-sim.mjs) all read this one rule.
export function impactPoints(closing, kind = 'rock', landed = false) {
  const H = CONFIG.hull;
  if (!(closing >= H.touchSpeed)) return 0;
  const base = H.base[kind] ?? H.base.rock;
  const points = Math.max(1, Math.round(base * (closing / H.refSpeed) ** H.power));
  const felt = H.light.kinds.includes(kind) ? clamp(points, H.light.min, H.light.max) : points;
  return landed && kind !== 'planet' ? Math.round(felt * H.landing.mult) : felt;
}

// The speed a blow closing at `closing` u/s gives back along the normal: the closing speed taken away and the bump's restitution
// of it given back (a fixed thing: a rock, a station's body, a planet's surface; a droid and a ship have `knockRestitution`).
export const rebound = (closing) => closing * (1 + CONFIG.asteroid.bump.restitution);

// The hull's bounce off a solid thing along (nx, ny), the normal out of it: `back` u/s, the whole rebound unless the thing takes a
// share; then its sparks and the event the sound listens for (World.shipSparks, `what` the thing).
export function contact(world, nx, ny, closing, what, back = rebound(closing)) {
  const ship = world.ship;
  ship.vx += nx * back; ship.vy += ny * back;
  world.shipSparks(nx, ny, closing, what);
}

// Everything the ship touches this step, in this order; a hole's passage or a wreck ends it.
export function shipContacts(world) {
  const ship = world.ship;
  // Up in a jump (src/trick.js) the hull passes over everything smaller than a planet, and a planet is the jump's own pinball
  // (bouncePlanets): of what follows only a hole's horizon still takes it. On the ground `up` is false and nothing changes.
  const up = ship.airborne === true;
  // The step a jump came down in (src/trick.js land runs before this, in the ship's own step): what the hull overlaps now it has
  // landed ON, and strikes with all the speed it has on it, not the part along the way out, at `landing.mult` times the blow
  // (SX, 2026-10-08: «повышенный дамаг ... если ты во время прыжка приземлился сверху на предмет. Кроме черной дыры»). The hole above
  // takes the ship first and returns; a planet is never under a landing (the jump bounced off it).
  const landed = !up && landedNow(world);
  const speedOn = (vx = 0, vy = 0) => hypot2(ship.vx - vx, ship.vy - vy);
  // The way from the ship to a thing, an axis at a time (Topology.dx), and its length by hypot2: this runs every step over every rock, and
  // an {x, y} and a Math.hypot's boxed numbers for each were ~14 KB of garbage a frame in J-05 (2026-10-09).
  const topo = world.topology;

  // A black hole is a passage, not damage, so invulnerability does not
  // matter; a ship just thrown out of one is not taken again for a moment.
  if (ship.alive && !world.docked && ship.holeGrace <= 0) {
    for (const h of world.holes) {
      if (hypot2(topo.dx(ship.x, h.x), topo.dy(ship.y, h.y)) < h.horizon) { world.transitHole(h); return; }
    }
  }

  // Rocks are solid. Every contact is a bump (World.bumpShip): the hull
  // takes World.rockDamage(closing) points first -- nothing below
  // touchSpeed, the existing 1-point bump up to the SAFE step, a taper past
  // it -- and only reaching 0 wrecks the ship, through the same flow as a
  // planet (World.damageShip). A rock is never broken by ship contact, only
  // by being shot.
  if (ship.alive && !world.docked && !up) {
    for (let ai = world.asteroids.length - 1; ai >= 0; ai--) {
      const a = world.asteroids[ai];
      const dx = topo.dx(ship.x, a.x), dy = topo.dy(ship.y, a.y);
      const dist = hypot2(dx, dy);
      if (dist > a.radius + ship.radius) continue;
      const theta = Math.atan2(dy, dx) - a.angle;
      const touch = a.radiusAt(theta) + ship.radius;
      if (dist > touch) continue;
      const nx = dist > 1e-6 ? dx / dist : 1, ny = dist > 1e-6 ? dy / dist : 0;
      const closing = -((ship.vx - a.vx) * nx + (ship.vy - a.vy) * ny);
      world.damageShip(landed ? world.impactDamage(Math.max(closing, speedOn(a.vx, a.vy)), 'rock', true) : world.rockDamage(closing), 'asteroid',
        { obstacle: { x: a.x, y: a.y, r: a.radius }, ...(landed ? { landed } : null) });
      if (!ship.alive) return;
      world.bumpShip(a, nx, ny, closing, touch);
    }
  }

  // Droids are solid (src/droids.js): the hull pays the droid's base by the same speed rule
  // as a rock's, and the two are knocked apart by their masses.
  if (ship.alive && !world.docked && !up) {
    const D = CONFIG.droids;
    for (const dr of world.droids) {
      const dx = topo.dx(ship.x, dr.x), dy = topo.dy(ship.y, dr.y);
      const dist = hypot2(dx, dy), touch = ship.radius + D.radius;
      if (dist >= touch) continue;
      const nx = dist > 1e-6 ? dx / dist : 1, ny = dist > 1e-6 ? dy / dist : 0;
      const closing = -((ship.vx - dr.vx) * nx + (ship.vy - dr.vy) * ny);
      ship.x = dr.x + nx * touch; ship.y = dr.y + ny * touch;
      const struck = landed ? Math.max(closing, speedOn(dr.vx, dr.vy)) : closing;
      if (struck <= 0) continue;
      world.damageShip(world.impactDamage(struck, 'droid', landed), 'droid', landed ? { landed } : {});
      if (!ship.alive) return;
      if (closing <= 0) continue;
      // Knocked apart by their masses: the hull keeps the share the droid's mass leaves it.
      const j = (1 + CONFIG.asteroid.bump.knockRestitution) * closing / (1 + 1 / D.mass);
      contact(world, nx, ny, closing, 'droid', j);
      knockDroid(dr, -nx * j / D.mass, -ny * j / D.mass, nx, ny);
    }
  }

  // Stations are solid (CONFIG.station.bodies; SX, 2026-10-01): the hull is held out of a body, pays the
  // station's base by the speed rule (a light one: a station is built to be bumped) and bounces off. A
  // wreck against a working station breaks it (World.breakStation). The berth just left does not hold
  // the ship until it is clear of it.
  if (ship.alive && !world.docked && !up) {
    const delta = world.delta.bind(world);
    for (const st of world.stations) {
      const c = st.contact(ship.x, ship.y, ship.radius, delta);
      if (st.id === world.leavingStation) { if (!c) world.leavingStation = null; continue; }
      if (!c) continue;
      ship.x += c.nx * c.depth; ship.y += c.ny * c.depth;
      const closing = -(ship.vx * c.nx + ship.vy * c.ny);
      const struck = landed ? Math.max(closing, speedOn()) : closing;
      if (struck <= 0) continue;
      // The station remembers a hard blow on its hull (CONFIG.station.wear): the share of it lost goes by the speed it was struck at,
      // and at `wear.breaks` it breaks as a wreck against it breaks it. Not while the hull is untouchable (src/world.js damageShip).
      if (ship.invuln <= 0) { world.wearStation(st, struck); world.damageShip(world.impactDamage(struck, 'station', landed), 'station', { stationId: st.id, ...(landed ? { landed } : null) }); }
      if (!ship.alive) { if (world.lastWreckCause === 'station' && closing >= CONFIG.station.breakSpeed) world.breakStation(st); return; }
      if (closing > 0) contact(world, c.nx, c.ny, closing, 'station');
    }
  }

  // The NPC ships are solid (src/npcFleet.js Fleet.contacts; SX, 2026-10-02: «в корабли npc можно врезатсья и если ты на большой
  // скорости влетел то оба корабля могут взорваться»): the hull is held out of one and bounces off it as off a station, and a blow
  // costs both the hull rule's points (base `npc`), the NPC's out of its own hull. Fast enough, both break: the NPC comes apart in
  // its glyphs and its paint ('npcDown'), and the pilot's ship is wrecked by the usual flow.
  if (ship.alive && !world.docked && !up) {
    for (const hit of world.fleet.contacts(world)) {
      ship.x += hit.nx * hit.depth; ship.y += hit.ny * hit.depth;
      const closing = -((ship.vx - hit.vx) * hit.nx + (ship.vy - hit.vy) * hit.ny);
      const struck = landed ? Math.max(closing, speedOn(hit.vx, hit.vy)) : closing;
      if (struck <= 0) continue;
      const blow = world.impactDamage(struck, 'npc', landed);
      // A blow that wrecks the pilot breaks the NPC too (SX, 2026-10-03: «надо как бы что они вдвоем взрывались»).
      const fatal = blow > 0 && ship.invuln <= 0 && !(world.hullGrace > 0) && blow >= world.hull;
      const pieces = blow > 0 ? world.fleet.hurt(world, hit.walker, fatal ? Infinity : blow) : null;
      if (pieces) {
        world.wreckDebris(hit.x, hit.y, pieces, hit.vx, hit.vy);
        world.emit('npcDown', { code: hit.code, label: hit.label, x: hit.x, y: hit.y, sectorId: world.sector.id, speed: Math.round(closing) });
      }
      if (ship.invuln <= 0) world.damageShip(blow, 'npc', { npc: hit.code, ...(landed ? { landed } : null) });
      if (!ship.alive) return;
      world.shipSparks(hit.nx, hit.ny, struck, 'npc');
      if (pieces) continue;                    // nothing left to bounce off
      world.fleet.rammed(world, hit, struck);  // it swears, and may turn on the pilot (src/npcFleet.js; SX, 2026-10-08)
      if (closing <= 0) continue;              // nothing to bounce (a landing on a ship moving away)
      // As heavy as the pilot's (CONFIG.traffic.npcSolid.knock): it is knocked off its path with `share` of the closing
      // speed, turned by where it was struck, and the pilot keeps the rest of the bounce.
      // (Its sparks go before the bounce, at the hull's speed as it struck: so it has always been drawn.)
      const K = CONFIG.traffic.npcSolid.knock, back = closing * (1 + CONFIG.asteroid.bump.knockRestitution);
      const at = { x: ship.x - hit.nx * ship.radius - hit.x, y: ship.y - hit.ny * ship.radius - hit.y };
      world.fleet.knock(world, hit.walker, -hit.nx * closing * K.share, -hit.ny * closing * K.share, at);
      ship.vx += hit.nx * (back - closing * K.share); ship.vy += hit.ny * (back - closing * K.share);
    }
  }

  // A planet's surface: the orbit above it decided whether the ship got this far, and what
  // reaching it costs is the speed the ship was falling at when it crossed the orbit line,
  // or the speed it arrives at if that is more (World.impactDamage, a planet's base; it
  // wrecked outright until 2026-10-01). The cushion takes most of a fall's speed before the
  // surface (a straight fall at 1000 u/s arrives at about 220), so the blow is the fall's,
  // not what is left of it: any fall fast enough to get through wrecks a whole hull, and a
  // hull pressed down slowly under thrust loses a point or two. It is held at the surface
  // and bounces off, and a bounce inside the orbit falls again from rest.
  if (ship.alive && !world.docked && !up) {
    for (const p of world.planets) {
      const dx = topo.dx(ship.x, p.x), dy = topo.dy(ship.y, p.y);
      const dist = hypot2(dx, dy), surface = p.radius * 0.97;
      if (dist >= surface || dist < 1e-6) continue;
      const nx = dx / dist, ny = dy / dist;
      const closing = -(ship.vx * nx + ship.vy * ny);
      const fall = Math.max(closing, world.orbitContact.get(p) || 0);
      if (ship.invuln <= 0) world.damageShip(world.impactDamage(fall, 'planet'), 'planet');
      if (world.orbitContact.has(p)) world.orbitContact.set(p, 0);
      if (!ship.alive) return;
      ship.x = p.x + nx * surface; ship.y = p.y + ny * surface;
      if (closing > 0) {
        contact(world, nx, ny, closing, 'planet');
        if (closing >= CONFIG.hull.touchSpeed) world.spillCoins(ship.x - nx * ship.radius, ship.y - ny * ship.radius);
      }
    }
  }
}
