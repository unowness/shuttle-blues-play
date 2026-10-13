// Smoke clouds (chat W2, 2026-10-04; SX, after flying the world twice as wide: «добавь в мире облачка дыма, как по краям вселенной
// ... чтобы оно не напоминало астероид ... покрупнее ... через него просто пролететь ... с эффектом. Можно перепрыгнуть его, можно
// прыгнуть, не долететь до конца, и тогда корабль плюхается и оставляет за собой круг, а потом вылетает через него ... без прорези
// ... сверху плюхается в середину ... также с дымом, который по бокам»). In the game since SX's word of 2026-10-06 («почему-то нет
// облаков в космосе»), C3 FILL (the lab's `?clouds=off` went 2026-10-07); a world without `world.clouds` (a check's) has none.
//
// A cloud is a patch of the edge's fog out in the open, larger than any rock: a few round sections leaning on one another, slowly
// breathing, the whole wandering a slow loop round its place. It is drawn on the fog's cells (src/cloudDraw.js): the same cells and
// the same shade, in an ink of its own, and no outline (SX, 2026-10-04: with the fog's outline it read as a rock). Nothing in it is
// solid, and a hull goes through it as smoke parts (SX, 2026-10-04, after flying the splash's ring: «когда приземляешься не должен
// быть такой позорный эффект обручей вокруг, в дым когда попадаешь представь что оказываешься сверху над дымом а потом плюхаешься и
// разрезаешь его, то есть он по физике дыма себя ведет просто»): the fog's own way through (src/fogCells.js, the edge's `cone` and
// `jet`, CONFIG.sector.boundary.fog), a fat cone behind the hull with puffy sides that the smoke fills again from its far end, the
// exhaust blowing a widening stream in it, the smoke pushed aside heaped round the way:
//   flown through on the ground  the hull cuts it from where it goes in to where it comes out, a wisp at each, and the view's sides
//                                fill with its smoke while the hull is in it (`world.cloudSide`, 0..1, eased in and out);
//   jumped over                  the hull is up (src/trick.js `ship.airborne`), over the smoke: it cuts nothing;
//   a jump that falls short      the hull comes down onto the smoke from above and cuts on through it from where it touched, the
//                                side smoke with it. It was a splash: a ring of puffs and a hoop opened in the cloud round the hull.
//
// State on the world (each declared with its first value in World's constructor; none saved: a sector's clouds are drawn from the world's seed the first time it is entered, and kept, as its
// bodies are; they are where they were when the ship comes back):
//   world.clouds       null (none: a check's world), or the look the page sets: CLOUD_LOOKS.C3
//   world.cloudCache   Map sector id -> [cloud], cloud = { id, ax, ay, x, y, reach, parts: [{ dx, dy, r, period, phase }], wander }
//   world.inCloud      null, or { id, sectorId, since }: the hull on the ground inside one
//   world.cloudSide    0..1, how far the view's side smoke is in
//   world.cloudPuffs   [{ x, y, t, size, sectorId, cloudId }]: wisps where a hull went in and came out, smoke of their cloud (a look;
//                      kept `puff.life` s)
//   world.cloudWake    the puffs the hull and its exhaust leave in the clouds of the ship's sector (src/fogCells.js wakePuff: a look,
//                      on the world's clock and the world's counter, so one flight leaves the same way through), as World.fogWake;
//                      cloudWakeIn the sector they are in, cloudHullAt and cloudJetAt when the last was laid, cloudSerial their jitter's count
// Events: cloudEntered, cloudLeft, cloudSplash (src/events.js).
import { TAU, between, clamp } from './util.js';
import { CONFIG } from './config.js';
import { LAYOUT_SECTOR } from './worldScale.js';
import { PLANE } from './topology.js';
import { fogHash, stepWake, wakePuff, enginePower, jetPuff } from './fogCells.js';
import { contentAreas } from './mapContent.js';
import { MAP_PLACEMENT, sampleArea } from './mapContentConfig.js';

export const CLOUDS = Object.freeze({
  // How many in a sector of the layout's size (more in a wider one, at the same density), and how far apart and from things.
  perLayout: [2, 3],
  apart: 2600,                       // u between two clouds' middles
  // A cloud's sections: `parts` of them, each `radius` u (a big rock is 130), laid round its middle within `spread` of their radius.
  parts: [4, 7],
  radius: [150, 290],
  spread: 1.05,
  // Clear of what a pilot flies to or must not be hidden: a station's ring, a planet's orbit, a hole's disc, by this much more.
  clear: { station: 900, planet: 450, hole: 600, edge: 900 },
  // Its life: each section breathes by `breathe` of its radius over its own period; the whole goes round a loop of `wander` u.
  breathe: 0.06, breathePeriod: [7, 13],
  wander: [90, 220], wanderPeriod: [60, 110],
  // A wisp grows from `puff.from` to `puff.to` u over its `puff.life` s, thinning away as it does. (The splash's ring is gone: it was
  // `ring.r` 240 u opened round the hull where it came down, and six puffs round it.)
  puff: { from: 40, to: 150, life: 1.1 },
  // The view's side smoke: in over `side.in` s, out over `side.out` s.
  side: { in: 0.3, out: 0.8 },
});

// The look: the shade alone, no outline (SX, 2026-10-04: «дым слишком неотличим от камней ... дым брали без контура»).
// It was C1 FOG (the fog's outline and shade) or C2 OUTLINE (the outline alone), both an outline the rocks also wear.
export const CLOUD_LOOKS = Object.freeze({
  C3: Object.freeze({ code: 'C3', name: 'FILL' }),
});

// ------------------------------------------------------------------------------------------------------------ the clouds

// A sector's clouds, drawn the first time it is asked for from the world's 'clouds:<sector>' stream, then kept.
export function cloudsOf(world, sector) {
  const cache = world.cloudCache;
  let list = cache.get(sector.id);
  if (!list) cache.set(sector.id, (list = layClouds(world, sector)));
  return list;
}

function layClouds(world, sector) {
  const C = CLOUDS, rng = world.rng(`clouds:${sector.id}`);
  const W = world.width, H = world.height, scale = (W * H) / (LAYOUT_SECTOR * LAYOUT_SECTOR);
  const want = Math.round(between(rng, C.perLayout[0], C.perLayout[1] + 0.999) * Math.min(scale, 4)) | 0;
  const bodies = world.sectorBodies(sector);
  const blocked = [
    ...bodies.stations.map((s) => [s.x, s.y, (s.interactRadius ?? 600) + C.clear.station]),
    ...bodies.planets.map((p) => [p.x, p.y, p.radius + CONFIG.planet.orbit.height + C.clear.planet]),
    ...bodies.holes.map((h) => [h.x, h.y, (h.disc ?? 250) + C.clear.hole]),
  ];
  const out = [];
  const areas = contentAreas('cloud-field', world.ledger, { sectorId: sector.id });
  for (let tries = 0; out.length < want && tries < 400; tries++) {
    const n = Math.floor(between(rng, C.parts[0], C.parts[1] + 0.999));
    const parts = [];
    for (let k = 0; k < n; k++) {
      const r = between(rng, C.radius[0], C.radius[1]), a = between(rng, 0, TAU), d = k === 0 ? 0 : between(rng, 0.35, 1) * C.spread * r;
      // Leaning on the one before it, so the sections make one body.
      const base = k === 0 ? { dx: 0, dy: 0 } : parts[Math.floor(rng() * parts.length)];
      parts.push({ dx: base.dx + Math.cos(a) * d, dy: base.dy + Math.sin(a) * d, r, period: between(rng, C.breathePeriod[0], C.breathePeriod[1]), phase: between(rng, 0, TAU) });
    }
    const reach = Math.max(...parts.map((p) => Math.hypot(p.dx, p.dy) + p.r)) * (1 + C.breathe);
    const wander = { r: between(rng, C.wander[0], C.wander[1]), period: between(rng, C.wanderPeriod[0], C.wanderPeriod[1]), phase: between(rng, 0, TAU) };
    const room = reach + wander.r;
    // Prefer one cloud in the smoke pocket; all others retain the sector-wide spread.
    const p = areas.length && !out.length && tries < MAP_PLACEMENT.cloudTries ? sampleArea(areas[tries % areas.length], rng, W, H) : null;
    const ax = p ? p.x * W : between(rng, C.clear.edge + room, W - C.clear.edge - room);
    const ay = p ? p.y * H : between(rng, C.clear.edge + room, H - C.clear.edge - room);
    if (ax < C.clear.edge + room || ay < C.clear.edge + room || ax > W - C.clear.edge - room || ay > H - C.clear.edge - room) continue;
    if (blocked.some(([x, y, r]) => Math.hypot(ax - x, ay - y) < r + room)) continue;
    if (out.some((c) => Math.hypot(ax - c.ax, ay - c.ay) < C.apart + room)) continue;
    out.push({ id: `${sector.id}:cloud-${out.length}`, ax, ay, x: ax, y: ay, reach, parts, wander });
  }
  return out;
}

// Where a cloud is at `t` (its slow loop) and how big a section is then (its breath).
export function placeCloud(c, t) {
  const w = c.wander, a = (TAU * t) / w.period + w.phase;
  c.x = c.ax + Math.cos(a) * w.r;
  c.y = c.ay + Math.sin(a * 0.73) * w.r * 0.6;
  return c;
}
export const partRadius = (p, t) => p.r * (1 + CLOUDS.breathe * Math.sin((TAU * t) / p.period + p.phase));

// How deep (x, y) is in a cloud's body at `t`: 1 at a section's middle, 0 at its edge, below 0 outside (the drawing's field, without
// the fog's noise and the way through it).
export function depthIn(c, x, y, t) {
  let best = -Infinity;
  for (const p of c.parts) {
    const R = partRadius(p, t), d = Math.hypot(x - c.x - p.dx, y - c.y - p.dy);
    best = Math.max(best, 1 - d / R);
  }
  return best;
}

// The cloud of the ship's sector whose body (x, y) is in, or null. `inner` asks for that much of the way in (0: the outline).
export function cloudAt(world, x, y, inner = 0.08) {
  if (!world.clouds) return null;
  for (const c of cloudsOf(world, world.sector)) {
    if (Math.abs(x - c.x) > c.reach || Math.abs(y - c.y) > c.reach) continue;
    if (depthIn(c, x, y, world.time) > inner) return c;
  }
  return null;
}

// Whether (x, y) is within `reach` u of the body of a cloud of the ship's sector (the edges of its sections, at `t`).
export function nearCloud(world, x, y, reach) {
  if (!world.clouds) return false;
  for (const c of cloudsOf(world, world.sector)) {
    if (Math.abs(x - c.x) > c.reach + reach || Math.abs(y - c.y) > c.reach + reach) continue;
    for (const p of c.parts) if (Math.hypot(x - c.x - p.dx, y - c.y - p.dy) < partRadius(p, world.time) + reach) return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------------------------ the step

// One step of the clouds (World.step, after the ship's): their places, the hull going in and out on the ground, coming down onto one,
// and its way through them.
export function stepClouds(world, dt) {
  if (!world.clouds) { stepSides(world, dt, false); return; }
  const t = world.time, C = CLOUDS, ship = world.ship;
  for (const c of cloudsOf(world, world.sector)) placeCloud(c, t);
  world.cloudPuffs = world.cloudPuffs.filter((p) => t - p.t < C.puff.life);
  const was = world.inCloud && world.inCloud.sectorId === world.sector.id ? world.inCloud : null;
  const up = !!ship.airborne, landed = world.cloudWasUp && !up;
  world.cloudWasUp = up;
  const here = ship.alive && !up && !world.docked ? cloudAt(world, ship.x, ship.y) : null;
  const wisp = (cloudId) => world.cloudPuffs.push({ x: ship.x, y: ship.y, t, size: 1, sectorId: world.sector.id, cloudId });
  if (here && landed) {
    // Came down onto it from above: in it at once, cutting on through it from where it touched (the way through, below).
    world.emit('cloudSplash', { cloudId: here.id, sectorId: world.sector.id, x: ship.x, y: ship.y });
  } else if (here && (!was || was.id !== here.id)) {
    wisp(here.id);
    world.emit('cloudEntered', { cloudId: here.id, sectorId: world.sector.id, x: ship.x, y: ship.y });
  }
  if (was && (!here || here.id !== was.id) && !up) {
    wisp(was.id);
    world.emit('cloudLeft', { cloudId: was.id, sectorId: world.sector.id, x: ship.x, y: ship.y });
  }
  world.inCloud = here ? { id: here.id, sectorId: world.sector.id, since: was && was.id === here.id ? was.since : t } : null;
  stepSides(world, dt, !!here);
  stepWayThrough(world, dt, here);
}

// The view's side smoke (`world.cloudSide`, src/cloudDraw.js drawCloudSides): in over `side.in` s while the hull is on the ground in a
// cloud (`inCloud`) or in the fog past a dead edge, out over `side.out` s after. In the fog is past the front's middle depth: `front`
// of the way from the fog's `start` to its `full` (CONFIG.sector.boundary.fog; 155 u past the line, where the front's noise lays it
// 25 to 285 u). SX, 2026-10-07: «и когда в дым скраю влетаем тоже».
function stepSides(world, dt, inCloud) {
  const C = CLOUDS, on = inCloud || inEdgeFog(world);
  world.cloudSide = clamp(world.cloudSide + (on ? dt / C.side.in : -dt / C.side.out), 0, 1);
}
function inEdgeFog(world) {
  const ship = world.ship, F = CONFIG.sector.boundary.fog, edges = world.deadEdges;
  if (!ship.alive || ship.airborne || world.docked || !edges || world.topology.mode !== PLANE) return false;
  const from = F.start + F.front * (F.full - F.start);
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k], p = e.axis === 'x' ? ship.x : ship.y, size = e.axis === 'x' ? world.width : world.height;
    if ((e.dir < 0 ? -p : p - size) >= from) return true;
  }
  return false;
}

// The hull's way through the clouds, the fog's own (World.stepFogWake, CONFIG.sector.boundary.fog `cone` and `jet`): on the ground in
// a cloud, a puff at the hull every `cone.every` s; the engine (or the retro) running within `jet.reach` u of one, a puff out along
// the exhaust every `jet.every` s, flying on. Each a hole in the smoke that widens and closes (src/cloudDraw.js draws them). Up in a
// jump the hull lays none: it is over the smoke. Kept for the ship's sector only.
function stepWayThrough(world, dt, here) {
  const F = CONFIG.sector.boundary.fog, K = F.cone, J = F.jet, ship = world.ship, t = world.time;
  const wake = world.cloudWake;
  if (world.cloudWakeIn !== world.sector.id) { wake.length = 0; world.cloudWakeIn = world.sector.id; }
  stepWake(wake, dt, t, J.drag);
  if (!ship.alive || ship.airborne || world.docked) return;
  // Their jitter from a counter of their own, not the fog's: the same flight leaves the same way through either.
  const rnd = () => fogHash(++world.cloudSerial, 4271);
  if (here && t - world.cloudHullAt >= K.every) {
    world.cloudHullAt = t;
    wake.push(wakePuff(K, t, rnd, { x: ship.x, y: ship.y }));
  }
  const power = enginePower(ship, J);
  if (power > 0 && t - world.cloudJetAt >= J.every && (here || nearCloud(world, ship.x, ship.y, J.reach))) {
    world.cloudJetAt = t;
    wake.push(jetPuff(ship, J, t, rnd, power));
  }
}
