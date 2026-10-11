import { CONFIG } from './config.js';
import { contractById, parTime } from './contracts.js';
import { sectorById, stationDefById } from './sectors.js';
import { findDef, isAvailable, findTitle, placedFind } from './rewards.js';
import { WRAP } from './topology.js';
import { sectorOpen } from './frontier.js';
import { withCourse } from './course.js';

// A live presentation of where the cargo business points, never saved route
// state. While cargo is carried it points at the destination station; otherwise, after a
// wreck, back at the cargo, where it came to rest (a wreck that strands cargo drops a
// station's mark, so the newest thing to go back for is what it leads to).
//
// A find a restored station marked (src/rewards.js, the ledger's `marked`) has no pointer any more (SX, 2026-10-02: «указатель
// можно не делать»): the locator blinks it and the map shows it, see markedFindNavigation.
//
// dx/dy point from the ship to the target in world units (positive y down).
// `arrived` means within interaction range, not that anything has been settled.
// `kind` is 'delivery' or 'recovery'; `targetId` is the id of the object
// the bearing leads to, so a separate discovery marker for it can be suppressed.
//
// Each bearing carries its course (src/course.js: SX's answer 3B, «a course around rocks and pirates as a bearing»): `course`
// ({ dx, dy }) when the straight line meets something in the next stretch, which the arrows point along; dx/dy stay the target's.
export function deliveryNavigation(world) {
  if (world.ledger.active) return withCourse(world, destinationRoute(world));
  return withCourse(world, recoveryRoute(world));
}

// The way out of the hidden sector (SX, 2026-10-02: «я один раз застрял в секретном секторе, там нужен указатель до
// черной дыры»): with a route of its own the bearing already leads to the hole (legTo); with none, a pilot in O-08 is
// still shown its black hole, the only way out. Not a route: the header and the locator do not take it.
export function exitNavigation(world) {
  if (!world.sector.hidden || deliveryNavigation(world)) return null;
  const hole = world.holes[0];
  if (!hole) return null;
  const d = world.delta(hole.x, hole.y, world.ship.x, world.ship.y);
  return { kind: 'exit', targetId: hole.id, label: 'BLACK HOLE', sectorLabel: world.sector.label, sectorId: world.sector.id,
    dx: d.x, dy: d.y, distance: Math.hypot(d.x, d.y), local: true, arrived: false, clock: null };
}

// The way home (SX: a pointer to the garage that G turns on and off): the bearing leads to the pilot's home garage
// (src/home.js) from anywhere on the grid, by the sector grid when it is in another sector, to where the station stands
// now (it drifts a little) when it is in this one. Not a route of the cargo's business: the page draws it in place of
// the delivery's pointer through drawDeliveryGuide's `route` option, and the header and the locator do not take it.
export function homeNavigation(world) {
  const def = stationDefById(CONFIG.home.id);
  if (!def) return null;
  const here = world.sector.id === def.sectorId ? world.stations.find((s) => s.id === def.id) : null;
  let leg;
  if (here) {
    const d = world.delta(here.x, here.y, world.ship.x, world.ship.y);
    leg = { dx: d.x, dy: d.y, distance: Math.hypot(d.x, d.y), local: true };
  } else leg = legTo(world, def.sectorId, def.x * world.width, def.y * world.height);
  if (!leg) return null;
  return withCourse(world, { kind: 'home', targetId: def.id, stationId: def.id, label: def.label, sectorLabel: def.sectorLabel, sectorId: def.sectorId,
    ...leg, arrived: leg.local && leg.distance <= CONFIG.station.interactRadius, clock: null });
}

// The way to a quest (src/quests.js), shown when the pilot picks it in the list (the page's quest pointer): to the
// besieged station or the ruin where it stands now in this sector, by the grid from elsewhere; to a cache's place. Not a
// route of the cargo's business: the header and the locator do not take it.
export function questNavigation(world, quest) {
  const t = quest?.target;
  if (!t) return null;
  // In this sector, the thing where it is now (a station drifts a little, a lost cargo drifts out of a station's menu).
  const id = t.mark ?? t.stationId;
  const here = world.sector.id === t.sectorId && id
    ? [world.stations, world.lostCargo, world.caches, world.paintCaches, world.signals, world.droids].flatMap((list) => list ?? []).find((o) => o.id === id)
    : null;
  let leg;
  if (here) {
    const d = world.delta(here.x, here.y, world.ship.x, world.ship.y);
    leg = { dx: d.x, dy: d.y, distance: Math.hypot(d.x, d.y), local: true };
  } else leg = legTo(world, t.sectorId, t.x * world.width, t.y * world.height);
  if (!leg) return null;
  const reach = t.reach ?? CONFIG.station.interactRadius;
  const arrived = leg.local && leg.distance <= reach;
  // `lift`: a small thing the pointer would stand on and hide (a ship, which the plate is as big as) is pointed to from
  // `lift` px above it, so the plate stands over it and not across it; the bearing is to that point, the arrival is the
  // thing's own.
  if (t.lift && leg.local) leg = { ...leg, dy: leg.dy - t.lift, distance: Math.hypot(leg.dx, leg.dy - t.lift) };
  return withCourse(world, { kind: 'quest', quest, targetId: t.mark ?? t.stationId ?? t.findId, label: quest.title,
    sectorLabel: sectorById(t.sectorId)?.label ?? '', sectorId: t.sectorId, ...leg, arrived, clock: null });
}

// Where the find a station marked lies from the ship, for the locator's blink (labs/graphics/locator.js): not a route, so
// nothing points to it in the sky and the header says nothing of it. Null when nothing is marked, when it can no longer be
// opened, and once the ship has come up to it (the ledger's `reached`: from then on it is on the map only, SX, 2026-10-02:
// «когда ты до него долетел то можно оставить только на общей»).
export function markedFindNavigation(world) {
  const find = placedFind(findDef(world.ledger.marked, world.ledger), world.ledger);   // where it was laid (src/cachePlaces.js)
  if (!find || !isAvailable(find, world.ledger) || world.ledger.reached.has(find.id)) return null;
  const leg = legTo(world, find.sector, find.x * world.width, find.y * world.height);
  if (!leg) return null;
  return { id: find.id, kind: find.kind, label: findTitle(find), sectorId: find.sector, ...leg };
}

// The delivery clock for a contract on the route (CONFIG.delivery): its par, the
// seconds on the pilot's clock so far, and what is left (negative when late).
function clockOf(world, contract) {
  const elapsed = world.ledger.elapsed?.(contract.id);
  if (elapsed === null || elapsed === undefined) return null;
  const par = parTime(contract);
  return { par, elapsed, left: par - elapsed };
}

function destinationRoute(world) {
  const contract = world.ledger.activeJob?.() ?? contractById(world.ledger.active?.id);
  if (!contract) return null;
  const station = stationDefById(contract.to);
  if (!station) return null;
  const leg = legTo(world, station.sectorId, station.x * world.width, station.y * world.height);
  if (!leg) return null;
  return {
    kind: 'delivery',
    targetId: station.id,
    stationId: station.id,
    label: station.label,
    cargo: contract.label,
    sectorLabel: station.sectorLabel,
    sectorId: station.sectorId,
    ...leg,
    arrived: leg.local && leg.distance <= CONFIG.station.interactRadius,
    clock: clockOf(world, contract),
  };
}

// Cargo lost on an earlier flight. The bearing leads back to it until it is
// taken again. With several, the nearest by straight-line distance.
function recoveryRoute(world) {
  let best = null;
  for (const [contractId, s] of world.ledger.stranded) {
    const contract = s.job ?? contractById(contractId);
    const leg = contract && legTo(world, s.sectorId, s.x, s.y);
    if (!leg || (best && best.distance <= leg.distance)) continue;
    best = {
      kind: 'recovery',
      targetId: `stranded:${contractId}`,
      contractId,
      label: contract.label,
      sectorLabel: sectorById(s.sectorId).label,
      sectorId: s.sectorId,
      ...leg,
      arrived: leg.local && leg.distance <= CONFIG.stranded.interactRadius,
      clock: clockOf(world, contract),
    };
  }
  return best;
}

// Offset and distance from the ship to a point in some sector. Local points use
// World.delta; remote ones use the sector grid. A sandbox torus has no sector
// exits, so it does not point through an unreachable edge. The locator reads it for
// the map's flags (labs/graphics/locator.js).
export function legTo(world, sectorId, x, y) {
  const sector = sectorById(sectorId);
  if (!sector) return null;
  const local = sector.id === world.sector.id;
  if (!local && world.topology.mode === WRAP) return null;
  // Nothing points past a closed border (the frontier, src/frontier.js): the pilot cannot fly there. What the rules let point
  // there in the first place is kept from it too; this is the last word for a bearing.
  if (!local && !sectorOpen(world.ledger, sector)) return null;
  // The hidden sector is off the grid (src/sectors.js): from inside it the way to
  // anywhere else is its black hole, so the bearing leads there; from outside,
  // nothing points in, because only a random passage reaches it.
  if (!local && (sector.hidden || world.sector.hidden)) {
    const hole = world.sector.hidden ? world.holes[0] : null;
    if (!hole) return null;
    const d = world.delta(hole.x, hole.y, world.ship.x, world.ship.y);
    return { dx: d.x, dy: d.y, distance: Math.hypot(d.x, d.y), local: false, via: 'hole' };
  }
  const offset = local
    ? world.delta(x, y, world.ship.x, world.ship.y)
    : {
      x: (sector.col - world.sector.col) * world.width + x - world.ship.x,
      y: (sector.row - world.sector.row) * world.height + y - world.ship.y,
    };
  return { dx: offset.x, dy: offset.y, distance: Math.hypot(offset.x, offset.y), local };
}
