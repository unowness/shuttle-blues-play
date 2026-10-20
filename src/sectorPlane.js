// The sector plane (cut from src/world.js, PLAN D3's last pieces, 2026-10-17): a sector loaded and its bodies built once, the edges
// with no open sector beyond them (src/frontier.js), the neighbours drawn round it, the rope and the fog's wake at a dead edge, and a seam
// crossed. Each takes the world first; World keeps a one-line method of each name, because the page and the checks patch them on a world
// (`sectorBodies` in labs/graphics/world-art.js, `openNeighbour` in checks/fog-stream.mjs and fog-band.mjs) and src/field.js reads
// `World.ropeAccel`: so these call each other through the world, never directly.
import { suspendPirateCombat } from './pirateCombat.js';
import { CONFIG } from './config.js';
import { TAU, lerp, hashId } from './util.js';
import { Planet, BlackHole } from './bodies.js';
import { PLANE } from './topology.js';
import { neighbourOf, sectorTitle } from './sectors.js';
import { secretHoleBodies } from './secretHole.js';
import { sectorOpen } from './frontier.js';
import { buildStations } from './stations.js';
import { signalsIn } from './progression.js';
import { lookFindsIn } from './looks.js';
import { availableIn } from './rewards.js';
import { fogHash } from './worldDraw.js';
import { wakePuff, stepWake, enginePower, jetPuff } from './fogCells.js';
import { shiftVanishing } from './vanish.js';

// The four sides of the boss's smoke square as dead edges (edgeDepths): an axis and the way out.
const ARENA_EDGES = Object.freeze([['x', -1], ['x', 1], ['y', -1], ['y', 1]].map(([axis, dir]) => Object.freeze({ axis, dir, arena: true })));

export function loadSector(world, sector, { announce = true } = {}) {
  world.sector = sector;
  const bodies = world.sectorBodies(sector);
  world.planets = bodies.planets;
  world.holes = bodies.holes;
  world.stations = bodies.stations;
  world.buildProgressObjects(sector);
  world.layEdges(sector);
  world.rebuildAttractors();

  // Anything selected or docked belonged to the sector just left, and so did
  // any loose credits and any orbit the ship was touching. So did a fight
  // with pirates, unless the ship carried it across a seam (enterSector).
  world.selectedId = null;
  world.docked = null;
  world.home = null;
  world.berth = null;
  world.dockHeld = null;
  world.leavingStation = null;
  world.drops = [];
  suspendPirateCombat(world);
  world.pirates = [];
  world.vanishing = [];
  // A boss's fight is the sector's: loading another ends it (it waits whole for the next visit: src/boss.js).
  world.boss = null;
  world.bossArena = null;
  world.bossCrowd = [];
  world.droids = [];
  world.encounter = null;
  world.orbitContact.clear();
  world.hailed.clear();
  world.fogWake = [];

  const seen = (world.visits.get(sector.id) || 0) + 1;
  world.visits.set(sector.id, seen);
  if (announce) world.emit('sectorEntered', { sectorId: sector.id, label: sector.label, title: sectorTitle(sector), visit: seen });
}

// Edges with no sector beyond them, or a closed one (src/frontier.js): computed from the grid and the ledger, not listed,
// so adding a sector or opening one removes the boundary on that side by itself. With them the sectors drawn round this
// one and how far past each side things live. Laid by loadSector, and again when a restoration opens a sector beside the
// pilot (World.openFrontier), so the edge opens at once.
export function layEdges(world, sector = world.sector) {
  world.deadEdges = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    .filter(([dx, dy]) => !world.openNeighbour(sector, dx, dy))
    .map(([dx, dy]) => ({ axis: dx ? 'x' : 'y', dir: dx || dy }));
  world.neighbours = world.neighbourSectors(sector);
  const strip = CONFIG.sector.neighbourStrip;
  const open = (dx, dy) => (world.topology.mode === PLANE && world.openNeighbour(sector, dx, dy) ? strip : 0);
  world.reach = { west: open(-1, 0), east: open(1, 0), north: open(0, -1), south: open(0, 1) };
}

// The sector one step away when it is open to the pilot, else null: a closed sector (src/frontier.js; SX, 2026-10-02,
// «Руина открывает сектор») is a dead edge, with the rope and the fog, as the grid's own end is.
export function openNeighbour(world, sector, dx, dy) {
  const s = neighbourOf(sector, dx, dy);
  return s && sectorOpen(world.ledger, s) ? s : null;
}

// Planets, holes and stations of a sector, built once per session: the same
// instances are drawn from across a seam and used inside, so nothing about
// them (a planet's turn, a beacon's blink) resets when the ship crosses.
export function sectorBodies(world, sector) {
  let b = world.bodyCache.get(sector.id);
  if (!b) {
    // The turn each body starts at is drawn from its sector's own stream, so it does not depend on which sectors were built first.
    const sky = world.rng(`sky:${sector.id}`);
    b = {
      planets: (sector.planets || []).map((p) => new Planet({ ...p, x: p.x * world.width, y: p.y * world.height }, sky)),
      holes: [...(sector.holes || []).map((h) => new BlackHole({ ...h, x: h.x * world.width, y: h.y * world.height }, sky)), ...secretHoleBodies(world, sector)],
      stations: buildStations(sector, { width: world.width, height: world.height }, world.ledger),
    };
    world.bodyCache.set(sector.id, b);
  }
  return b;
}

// The up to eight sectors around this one, with the offset that places their
// sector-local coordinates in this sector's frame. None on a torus.
export function neighbourSectors(world, sector) {
  if (world.topology.mode !== PLANE) return [];
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const s = world.openNeighbour(sector, dx, dy);
      if (s) out.push({ sector: s, dx, dy, ox: dx * world.width, oy: dy * world.height });
    }
  }
  return out;
}

// True past a dead edge's fog (CONFIG.sector.boundary.limit, plus `pad`), or
// more than the neighbour strip past a live seam. What is just across a seam
// stays: the next sector is drawn there; what is in the fog stays too, until
// the rope brings it back or it drifts out past the limit.
export function beyondLimits(world, x, y, pad = 0) {
  if (world.topology.mode !== PLANE) return false;
  const R = world.reach, dead = CONFIG.sector.boundary.limit + pad;
  return x < -(R.west || dead) || x >= world.width + (R.east || dead) ||
    y < -(R.north || dead) || y >= world.height + (R.south || dead);
}

// Finds that can be opened and signals not yet heard, for this sector only. Opened
// ones, and finds still sealed behind a ruin, are simply not built: the ledger is
// the record, and the world is derived from it. (The three authored 25 CR coins on
// their moored rocks were cut on 2026-10-01, SX: «вот такие огромные гредитсы мы
// вырезаем»; coins come from rocks and pirates now, and nowhere else.)
export function buildProgressObjects(world, sector) {
  const W = world.width, H = world.height;
  world.buildFinds(sector);
  world.signals = signalsIn(sector.id)
    .filter((def) => !world.ledger.heard.has(def.id))
    .map((def) => ({
      id: def.id, def, x: def.x * W, y: def.y * H,
      interactRadius: CONFIG.signal.reach,
      discoverRadius: CONFIG.signal.discoverRadius,
    }));
  world.buildLostCargo(sector);
}

// The finds of this sector that can be opened (src/rewards.js), souvenirs and
// paints apart: each kind has its own drawing. Built again when one is opened
// and when a restoration here unlocks two.
// Each floats and turns (CONFIG.cache.float): its way and phase from its id. One already here keeps where it was
// knocked to and how it moves.
export function buildFinds(world, sector = world.sector) {
  const W = world.width, H = world.height, F = CONFIG.cache.float;
  const was = new Map([...world.caches, ...world.paintCaches, ...world.lookCaches].map((c) => [c.id, c]));
  const built = [...availableIn(sector.id, world.ledger), ...lookFindsIn(sector.id, world.pilot.looks)].map((def) => {
    const seed = hashId(def.id);
    const prev = was.get(def.id);
    return {
      id: def.id, def, x: prev ? prev.x : def.x * W, y: prev ? prev.y : def.y * H,
      vx: prev?.vx ?? 0, vy: prev?.vy ?? 0,
      paint: def.kind === 'paint' ? def.content : null,
      interactRadius: CONFIG.cache.interactRadius,
      discoverRadius: CONFIG.cache.discoverRadius,
      angle: prev?.angle ?? ((seed & 1023) / 1023) * TAU,
      spin: ((seed >> 10) & 1 ? 1 : -1) * lerp(F.spin[0], F.spin[1], ((seed >>> 11) & 1023) / 1023),
      whirl: prev?.whirl ?? 0,
      bobPhase: ((seed >>> 21) & 1023) / 1023 * TAU,
    };
  });
  world.caches = built.filter((c) => c.def.kind === 'souvenir');
  world.paintCaches = built.filter((c) => c.def.kind === 'paint');
  world.lookCaches = built.filter((c) => c.def.kind === 'look');
}

// A fresh asteroid field for the current sector, up to the sector's count.
export function spawnField(world, sector) {
  world.asteroids.length = 0;
  world.spawnAsteroids(sector.asteroids);
}

export function rebuildAttractors(world) {
  world.attractors = [
    ...world.holes.map((h) => ({ kind: 'hole', x: h.x, y: h.y, mass: h.mass, kill: h.horizon })),
    ...world.planets.map((p) => ({ kind: 'planet', x: p.x, y: p.y, mass: p.mass, kill: p.radius * 0.97,
      orbit: p.radius + CONFIG.planet.orbit.height })),
  ];
}

// A corner crossing is resolved as two explicit single-axis transitions, each
// validated against the grid on its own, so a diagonal exit cannot skip a
// sector or fire two entry events for the same one.
export function resolveTransitions(world) {
  if (world.topology.mode !== PLANE) return;
  const ship = world.ship;
  const slack = CONFIG.sector.seamSlack;
  for (let guard = 0; guard < 4; guard++) {
    const ex = ship.x < 0 ? -1 : ship.x >= world.width ? 1 : 0;
    const ey = ship.y < 0 ? -1 : ship.y >= world.height ? 1 : 0;
    if (!ex && !ey) return;
    let crossed = false;
    for (const [dx, dy] of [[ex, 0], [0, ey]]) {
      if (!dx && !dy) continue;
      const next = world.openNeighbour(world.sector, dx, dy);
      if (!next || next.id === world.sector.id) { world.holdAtLimit(dx, dy); continue; }
      // Past a live seam, but not yet by the slack: still this sector.
      const past = dx > 0 ? ship.x - world.width : dx < 0 ? -ship.x : dy > 0 ? ship.y - world.height : -ship.y;
      if (past < slack) continue;
      world.enterSector(next, dx, dy);
      crossed = true;
      break;
    }
    if (!crossed) return;
  }
}

// The backstop behind the rope. The rope is tuned so that a ship never gets
// near `limit` in flight (a full-speed dive goes some 400 u in); if one does
// (a teleport, a respawn, a future faster chassis) it is held AT the limit
// with its outward speed removed, and the rope takes it from there.
export function holdAtLimit(world, dx, dy) {
  const ship = world.ship, L = CONFIG.sector.boundary.limit;
  if (dx < 0 && ship.x < -L) { ship.x = -L; ship.vx = Math.max(0, ship.vx); }
  else if (dx > 0 && ship.x > world.width + L) { ship.x = world.width + L; ship.vx = Math.min(0, ship.vx); }
  if (dy < 0 && ship.y < -L) { ship.y = -L; ship.vy = Math.max(0, ship.vy); }
  else if (dy > 0 && ship.y > world.height + L) { ship.y = world.height + L; ship.vy = Math.min(0, ship.vy); }
}

// How far past each dead edge's line a point is, into the fog; 0 inside. In the boss's fight the four sides of its smoke's square are
// dead edges too (src/bossQuest.js world.bossArena; SX, 2026-10-14: «арена должна быть ограничена ... буквально нашим туманом, то есть
// отскакивать от них можно»): the same rope throws a hull back off them, a pirate and the cargo too (boundaryAccel).
export function edgeDepths(world, x, y) {
  const out = world.deadEdges.map((e) => {
    const p = e.axis === 'x' ? x : y;
    const size = e.axis === 'x' ? world.width : world.height;
    return { edge: e, depth: Math.max(0, e.dir < 0 ? -p : p - size) };
  });
  const A = world.bossArena;
  if (A) for (const e of ARENA_EDGES) {
    const p = e.axis === 'x' ? x - A.x : y - A.y;
    out.push({ edge: e, depth: Math.max(0, e.dir < 0 ? -A.half - p : p - A.half) });
  }
  return out;
}

// The rope's pull along an edge's outward normal on a body `depth` past the line moving out at `out` u/s
// (negative coming back): a spring that stiffens deep in, its give damped one way more than the other.
export function ropeAccel(depth, out) {
  const B = CONFIG.sector.boundary;
  if (depth <= 0) return 0;
  return -B.rope * B.rope * depth * (1 + (depth / B.stiffen) ** 2) - (out > 0 ? B.dampOut : B.dampBack) * out;
}

// The rope on the ship. Applied to velocity before the ship integrates, like gravity. A dive deeper than
// `soundDepth` reports itself once, as the rope throws the ship back ('boundaryBlocked'); leaving the fog ends it.
export function stepBoundary(world, dt) {
  if (world.topology.mode !== PLANE || (!world.deadEdges.length && !world.bossArena)) return;
  const ship = world.ship, B = CONFIG.sector.boundary;
  let deepest = 0, back = false;
  for (const { edge, depth } of world.edgeDepths(ship.x, ship.y)) {
    if (depth <= 0) continue;
    const key = edge.axis === 'x' ? 'vx' : 'vy';
    const out = ship[key] * edge.dir;          // positive while heading out
    ship[key] += ropeAccel(depth, out) * edge.dir * dt;
    deepest = Math.max(deepest, depth);
    if (ship[key] * edge.dir < 0) back = true;
  }
  world.stepFogWake(dt, deepest);
  const dive = world.ropeDive ?? (world.ropeDive = { deepest: 0, told: false });
  if (deepest <= 0) { dive.deepest = 0; dive.told = false; return; }
  dive.deepest = Math.max(dive.deepest, deepest);
  if (back && !dive.told && dive.deepest >= B.soundDepth) {
    dive.told = true;
    world.emit('boundaryBlocked', { sectorId: world.sector.id, label: world.sector.label, depth: Math.round(dive.deepest) });
  }
}

// The fog's puffs (presentation, kept here so it runs on the world's clock; drawDeadEdges draws them, CONFIG
// sector.boundary.fog `cone` and `jet` say how): the hull's while it is past the line, the exhaust's while it runs near
// the line. Each is { x, y, t, life, near, spread, rim, phase, size } and a jet's flies on { vx, vy }.
export function stepFogWake(world, dt, deepest) {
  const F = CONFIG.sector.boundary.fog, K = F.cone, J = F.jet, ship = world.ship, t = world.time, wake = world.fogWake;
  stepWake(wake, dt, t, J.drag);
  if (!ship.alive) return;
  // Their jitter from a counter, not the page's random: the same flight leaves the same puffs (src/fogCells.js wakePuff).
  const rnd = () => fogHash(++world.fogSerial, 9173);
  if (deepest > 0 && t - world.fogHullAt >= K.every) {
    world.fogHullAt = t;
    wake.push(wakePuff(K, t, rnd, { x: ship.x, y: ship.y }));
  }
  const power = enginePower(ship, J);
  if (power > 0 && t - world.fogJetAt >= J.every && world.nearDeadEdge(ship.x, ship.y, J.reach)) {
    world.fogJetAt = t;
    // The engine blows out of the hull's rear, the retro out of its nose (src/fogCells.js jetPuff).
    wake.push(jetPuff(ship, J, t, rnd, power));
  }
}

// Is (x, y) within `reach` u of a dead edge of this sector, on either side of its line?
export function nearDeadEdge(world, x, y, reach) {
  for (const e of world.deadEdges) {
    const p = e.axis === 'x' ? x : y, size = e.axis === 'x' ? world.width : world.height;
    if ((e.dir < 0 ? -p : p - size) > -reach) return true;
  }
  const A = world.bossArena;
  return !!A && (Math.abs(x - A.x) > A.half - reach || Math.abs(y - A.y) > A.half - reach);
}

// The same rope as an acceleration on any body, for craft that are not the
// ship (pirates, the towed cargo). It is stepBoundary's arithmetic without
// the ship or the sound, and checks/pirates.mjs holds the two equal.
export function boundaryAccel(world, x, y, vx, vy) {
  let ax = 0, ay = 0;
  if (world.topology.mode !== PLANE || (!world.deadEdges.length && !world.bossArena)) return { ax, ay };
  for (const { edge, depth } of world.edgeDepths(x, y)) {
    if (depth <= 0) continue;
    const out = (edge.axis === 'x' ? vx : vy) * edge.dir;
    const a = ropeAccel(depth, out);
    if (edge.axis === 'x') ax += a * edge.dir; else ay += a * edge.dir;
  }
  return { ax, ay };
}

// Crossing a seam changes coordinates, not the picture. Everything is moved
// by exactly one sector (no inset), so the ship, the camera, the follower,
// nearby rocks, shots, sparks and coins keep their places relative to each
// other and to the bodies drawn beyond the seam; the old sector becomes one
// of the neighbours drawn in place. Heading and velocity are untouched.
export function enterSector(world, next, dx, dy) {
  const ship = world.ship;
  const fromId = world.sector.id;
  const shiftX = -dx * world.width, shiftY = -dy * world.height;
  const near = CONFIG.sector.carryRange;
  const carried = world.asteroids.filter((a) => !a.moored &&
    Math.hypot(a.x - ship.x, a.y - ship.y) < near);
  const drops = world.drops, vanishing = world.vanishing;
  // Recovery cargo belongs to its NPC's sector; its squad returns there when the pilot crosses a seam.
  const pirates = world.pirates.filter((p) => p.post?.kind !== 'pester'), encounter = world.encounter;
  const roleSystems = world.pirateRoleSystems;
  // A droid close by crosses too (the one the pilot is flying to); the rest stay behind.
  const droids = world.droids.filter((d) => Math.hypot(d.x - ship.x, d.y - ship.y) < near);

  ship.x += shiftX; ship.y += shiftY;
  world.cam.x += shiftX; world.cam.y += shiftY;
  if (world.cargo) { world.cargo.x += shiftX; world.cargo.y += shiftY; }
  for (const a of carried) { a.x += shiftX; a.y += shiftY; }
  for (const b of world.bullets) { b.x += shiftX; b.y += shiftY; }
  for (const p of world.particles.items) { p.x += shiftX; p.y += shiftY; }
  for (const d of drops) { d.x += shiftX; d.y += shiftY; }
  shiftVanishing(world, shiftX, shiftY);
  // Pirates follow across a seam, or it would be a way out of the fight:
  // they move with everything else, and so does what they last saw of the ship.
  for (const p of pirates) {
    p.x += shiftX; p.y += shiftY;
    if (p.seen) { p.seen.x += shiftX; p.seen.y += shiftY; }
  }
  for (const d of droids) {
    d.x += shiftX; d.y += shiftY;
    for (const at of [...d.route, d.leaveTo]) if (at) { at.x += shiftX; at.y += shiftY; }
  }

  world.loadSector(next);
  world.drops = drops;
  world.vanishing = vanishing;
  // Carry hunting squads' depleted resources across the seam, but leave mines in the departed sector.
  world.pirateRoleSystems = new Map([...roleSystems].filter(([id]) => pirates.some((p) => p.mode !== 'guard' && p.roleSystemId === id)));
  for (const sys of world.pirateRoleSystems.values()) { sys.closed = false; sys.reason = null; sys.sectorId = next.id; }
  // A squad still circling its post (src/raids.js) stays there; one that is hunting follows.
  world.pirates = pirates.filter((p) => p.mode !== 'guard');
  world.droids = droids;
  world.encounter = encounter;
  if (world.encounter && !world.pirates.some((p) => p.mode !== 'guard' && p.mode !== 'leave')) world.endEncounter('lost');
  world.asteroids = [...carried];
  world.spawnAsteroids(next.asteroids, CONFIG.sector.spawnClear);
  world.emit('sectorLeft', { from: fromId, to: next.id });
}
