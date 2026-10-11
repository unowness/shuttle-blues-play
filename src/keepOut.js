// What is kept out of a station's menu reach, so the station's window and another thing's do not claim the ship at once (SX,
// 2026-10-07, after flying: «РАмки неплохо вокруг станций летают сейчас давай npc и дроиды а также грузы и сундуки, не будут сильно
// близко к станциям подлетать, нужно чтобы контекстные меню не мешали друг другу, то есть можно мягко окраничить их радиусу действия
// контекстного меню станции»). Softly, never a wall or a jump:
//   friendly ships   their paths go round it (src/npcFleet.js keeps every leg and corner KEEP_OUT from a station's place); a
//                    visitor out of O-08 passes a still ship by a line moved aside of it (src/traffic.js spawnVisitor)
//   droids           their stops lie outside it, and a ring push over its last `margin` bends their way round it, eases one inside
//                    out and holds one waiting for a pilot at its edge (src/droids.js)
//   loose cargo      the pilot's lost cargo and other pilots' ease straight out at `ease` u/s (driftLostCargo, below; since 2026-10-01
//                    with its own 200 u margin), the pilot's own place in the ledger with it, so the save keeps where it is
//   caches           none is laid inside one (src/cachePlaces.js); one knocked in eases out as cargo does, its laid place untouched
// Not kept out: the cargo the pilot tows (it is delivered at the station), the quests' ships (src/spots.js lays them 900 u and more
// off a station, and one a quest brings to a station stays there), the pirates. HOME is a station here as everywhere.
// Moved out of src/world.js with the lost cargo's drift (2026-10-07, refactor on touch); World.driftLostCargo() hands its world here.
// Nothing here makes an object or a closure in a step: one scratch offset, read at once.
import { CONFIG } from './config.js';
import { clamp, wrapCentered } from './util.js';
import { WRAP } from './topology.js';

// How far from station `st` things are kept: its menu's reach as its window keeps it (its interactRadius, 620 u, times
// CONFIG.interaction.exitTolerance, 1.18: the window goes past 731.6 u) and CONFIG.station.keepOut.margin (270): 1,001.6 u.
export const keepOutOf = (st) => st.interactRadius * CONFIG.interaction.exitTolerance + CONFIG.station.keepOut.margin;
// The same for a station of the catalogue, whose reach is CONFIG.station.interactRadius (every station's): what is laid or routed
// before a World stands.
export const KEEP_OUT = CONFIG.station.interactRadius * CONFIG.interaction.exitTolerance + CONFIG.station.keepOut.margin;

// The offset from station `st` to (x, y), the short way round on a torus as World.delta measures it, and its length: one scratch
// object, read before the next call.
const AT = { x: 0, y: 0, dist: 0 };
function offsetFrom(world, x, y, st) {
  let dx = x - st.x, dy = y - st.y;
  if (world.topology?.mode === WRAP) { dx = wrapCentered(dx, world.width); dy = wrapCentered(dy, world.height); }
  AT.x = dx; AT.y = dy; AT.dist = Math.hypot(dx, dy);
  return AT;
}

// The push out of station `st`'s keep-out at (x, y), into `out` ({ ux, uy, depth }): the way out (a unit vector) and how deep in the
// ring the push grows over (0 at the keep-out's edge or outside it, 1 a `margin` in or deeper). Returns the depth.
export function stationPush(world, x, y, st, out) {
  const at = offsetFrom(world, x, y, st), keep = keepOutOf(st);
  out.depth = at.dist >= keep ? 0 : clamp((keep - at.dist) / CONFIG.station.keepOut.margin, 0, 1);
  out.ux = at.dist > 1e-6 ? at.x / at.dist : 1; out.uy = at.dist > 1e-6 ? at.y / at.dist : 0;
  return out.depth;
}

// Whether (x, y) lies inside any station's keep-out in `world.stations`.
export function inKeepOut(world, x, y) {
  for (const st of world.stations) if (offsetFrom(world, x, y, st).dist < keepOutOf(st)) return true;
  return false;
}

// One step of a resting thing `c` ({ x, y }) eased out of station `st`'s keep-out: straight away from it at
// CONFIG.station.keepOut.ease u/s, to its edge and no farther, never into a planet's cushion, a hole or `stranded.edgeMargin` of the
// sector's edge (it waits there). Returns whether it moved.
function easeFrom(world, c, st, dt) {
  const at = offsetFrom(world, c.x, c.y, st), want = keepOutOf(st);
  if (at.dist >= want) return false;
  const ux = at.dist > 1e-6 ? at.x / at.dist : 1, uy = at.dist > 1e-6 ? at.y / at.dist : 0;
  const step = Math.min(want - at.dist, CONFIG.station.keepOut.ease * dt);
  const x = c.x + ux * step, y = c.y + uy * step;
  const edge = CONFIG.stranded.edgeMargin;
  if (world.insidePlanet(x, y, CONFIG.planet.orbit.height + 60) || world.consumedByHole(x, y, 400) ||
      x < edge || y < edge || x > world.width - edge || y > world.height - edge) return false;
  c.x = x; c.y = y;
  return true;
}

// Lost cargo lying where a station's menu reaches drifts out of it (SX, 2026-10-01: «Если груз потерян около
// станции пусть он отлетает от нее со временем, а то невозможно подобрать груз у станции пилот забирает груз
// со станции вместо потерянного»), out of its keep-out since 2026-10-07 (it went to the window's reach and 200 u), so a pilot coming
// from outside meets the cargo's menu alone. The pilot's own is moved in the ledger too, so the save keeps where it is.
export function driftLostCargo(world, dt) {
  for (const c of world.lostCargo) {
    for (const st of world.stations) {
      if (!easeFrom(world, c, st, dt)) continue;
      const record = !c.stranger && world.ledger.stranded.get(c.contractId);
      if (record) { record.x = c.x; record.y = c.y; }
    }
  }
}

// The caches of the sector (World.stepCaches moves them where they were knocked): one inside a station's keep-out eases out of it as
// lost cargo does. Only where it was knocked to, which is the sector's while the pilot is in it (a cache is laid out again on coming
// back): a cache whose laid place (its def's, the ledger's `placed`, saved) is inside one stays where it was laid, so an older save's
// cache is never moved off its place. None of SX's places is (the nearest stands 1,546 u off a station) and src/cachePlaces.js lays
// none there.
export function easeCaches(world, dt) {
  easeList(world, world.caches, dt);
  easeList(world, world.paintCaches, dt);
  easeList(world, world.lookCaches, dt);
}
function easeList(world, list, dt) {
  for (const c of list) {
    for (const st of world.stations) {
      if (offsetFrom(world, c.x, c.y, st).dist >= keepOutOf(st)) continue;
      if (c.def && offsetFrom(world, c.def.x * world.width, c.def.y * world.height, st).dist < keepOutOf(st)) continue;
      easeFrom(world, c, st, dt);
    }
  }
}
