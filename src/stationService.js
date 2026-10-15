import { CONFIG } from './config.js';
import { workingKind, formatCR, stationBill } from './ruins.js';
import { stationDefById } from './sectors.js';

// What a docked station sells and mends, and a station a wreck or a raid broke (moved out of src/world.js, 2026-10-04, chat E1:
// the station service as its own module, the economy's prices read in one place). World keeps a method of each name that calls
// the one here, so a caller (a menu's row, a check) says `world.refuel()` as before.
//
//   serviceActions   the docked rows the station's menu lists after UNDOCK: REFUEL, REPAIR HULL at a garage or PATCH HULL at a
//                    freight hub, BUY CHALK
//   refuel           fuel by the whole unit (CONFIG.fuel.price), as much as the tank takes and the wallet pays for
//   repairHull       a garage's hull points (CONFIG.hull.repairPrice), as many as the wallet pays for, up to a whole hull
//   patchHull        a freight hub's, at the same price, up to CONFIG.hull.patchShare of the chassis' whole hull (2026-10-04,
//                    the economy SX chose: freight docks had no repair, and a pilot far from a garage flew on damaged)
//   buyChalk         chalk, up to a box at a time (CONFIG.chalk)
//   breakStation     a working station a ship was wrecked against, or one worn out by hard blows (wearStation), is closed until
//                    repaired, for the bill of a lost raid (stationBill)
//   wearStation      a hard blow on a working station's hull is remembered (CONFIG.station.wear): `ledger.wear`, a notice at 10 %, broken at 20 %
//   brokenActions    a broken station's menu: a cargo bound to it, UNDOCK, REPAIR STATION, INFO
//   repairStation    the broken station's price paid, and it works again; a worn one's pro rata, and the wear is gone

// The rows a docked station's menu lists after UNDOCK: its fuel, its hull repair (a garage's whole, a freight hub's patch), its chalk.
export function serviceActions(world, station) {
  const kind = workingKind(world.ledger, station);
  const actions = [world.refuelAction()];
  if (kind === 'garage') actions.push(world.repairAction());
  else if (kind === 'freight') actions.push(world.patchAction());
  actions.push(world.chalkAction());
  // A station worn by hard blows (wearStation) can be put right before it breaks, for its share of the bill.
  if ((world.ledger.wear.get(station.id) ?? 0) > 0) actions.push(wornAction(world, station));
  return actions;
}

// Any docked station sells fuel by the whole unit, as much as the tank takes
// and the wallet pays for, like repair.
export function refuelAction(world) {
  const F = CONFIG.fuel;
  const missing = Math.floor(world.fuelTank - world.fuel);
  const buyable = Math.min(missing, Math.floor(world.ledger.credits / F.price));
  return {
    label: 'REFUEL',
    disabled: missing <= 0 || buyable <= 0,
    note: missing <= 0 ? 'TANK FULL'
      : buyable <= 0 ? `NEED ${F.price} CR, HAVE ${world.ledger.credits}`
      : `${buyable} FUEL / ${buyable * F.price} CR`,
    run: () => world.refuel(),
  };
}

export function refuel(world) {
  const F = CONFIG.fuel;
  const missing = Math.floor(world.fuelTank - world.fuel);
  if (missing <= 0) { world.emit('actionRefused', { reason: 'TANK FULL' }); return; }
  const units = Math.min(missing, Math.floor(world.ledger.credits / F.price));
  if (units <= 0) { world.emit('actionRefused', { reason: `NEED ${F.price} CR, HAVE ${world.ledger.credits}` }); return; }
  const cost = units * F.price;
  world.ledger.credits -= cost;
  world.fuel = Math.min(world.fuelTank, world.fuel + units);
  world.emit('refueled', {
    sectorId: world.sector.id, x: world.ship.x, y: world.ship.y,
    units, cost, fuel: world.fuel, credits: world.ledger.credits,
  });
}

// Any docked station sells chalk, up to a box at a time (CONFIG.chalk).
export function chalkAction(world) {
  const C = CONFIG.chalk;
  const room = C.max - world.chalk;
  const pieces = Math.min(C.box, room, Math.floor(world.ledger.credits / C.price));
  return {
    label: 'BUY CHALK',
    disabled: room <= 0 || pieces <= 0,
    note: room <= 0 ? 'CHALK STOCK FULL'
      : pieces <= 0 ? `NEED ${C.price} CR, HAVE ${world.ledger.credits}`
      : `${pieces} CHALK / ${pieces * C.price} CR`,
    run: () => world.buyChalk(),
  };
}

export function buyChalk(world) {
  const C = CONFIG.chalk;
  const room = C.max - world.chalk;
  if (room <= 0) { world.emit('actionRefused', { reason: 'CHALK STOCK FULL' }); return; }
  const pieces = Math.min(C.box, room, Math.floor(world.ledger.credits / C.price));
  if (pieces <= 0) { world.emit('actionRefused', { reason: `NEED ${C.price} CR, HAVE ${world.ledger.credits}` }); return; }
  const cost = pieces * C.price;
  world.ledger.credits -= cost;
  world.chalk += pieces;
  world.emit('chalkBought', {
    sectorId: world.sector.id, x: world.ship.x, y: world.ship.y,
    pieces, cost, chalk: world.chalk, credits: world.ledger.credits,
  });
}

// One action, in the cacheActions style: the price is in the note, which
// only appears when the action cannot run and says what is missing.
// CONFIG.hull.repairPrice CR buys one point, as many as the pilot can
// afford, up to a full hull (SX, 2026-09-26: "ремонт делай по 20").
export function repairAction(world) {
  const H = CONFIG.hull;
  const missing = world.hullMax - world.hull;
  const buyable = Math.min(missing, Math.floor(world.ledger.credits / H.repairPrice));
  return {
    label: 'REPAIR HULL',
    disabled: missing <= 0 || buyable <= 0,
    note: missing <= 0 ? 'HULL UNDAMAGED'
      : buyable <= 0 ? `NEED ${H.repairPrice} CR, HAVE ${world.ledger.credits}`
      : `${buyable} HULL / ${buyable * H.repairPrice} CR`,
    run: () => world.repairHull(),
  };
}

export function repairHull(world) {
  const H = CONFIG.hull;
  const missing = world.hullMax - world.hull;
  if (missing <= 0) { world.emit('actionRefused', { reason: 'HULL UNDAMAGED' }); return; }
  mendTo(world, world.hullMax);
}

// The points a hull is mended to `ceiling` with, as many as the wallet pays for at CONFIG.hull.repairPrice, paid and said.
function mendTo(world, ceiling) {
  const H = CONFIG.hull;
  const points = Math.min(Math.max(0, ceiling - world.hull), Math.floor(world.ledger.credits / H.repairPrice));
  if (points <= 0) { world.emit('actionRefused', { reason: `NEED ${H.repairPrice} CR, HAVE ${world.ledger.credits}` }); return; }
  const cost = points * H.repairPrice;
  world.ledger.credits -= cost;
  world.hull = Math.min(ceiling, world.hull + points);
  world.emit('hullRepaired', {
    sectorId: world.sector.id, x: world.ship.x, y: world.ship.y,
    points, cost, hull: world.hull, credits: world.ledger.credits,
  });
}

// A freight hub's patch: whole points up to CONFIG.hull.patchShare of the chassis' whole hull (75 of a STANDARD's 100, 112 of a
// HAULER's 150), at a garage's price; above it the note says a garage mends the rest.
export const patchCeiling = (world) => Math.floor(world.hullMax * CONFIG.hull.patchShare);

export function patchAction(world) {
  const H = CONFIG.hull, ceiling = patchCeiling(world);
  const missing = Math.max(0, Math.floor(ceiling - world.hull));
  const buyable = Math.min(missing, Math.floor(world.ledger.credits / H.repairPrice));
  return {
    label: 'PATCH HULL',
    disabled: missing <= 0 || buyable <= 0,
    note: world.hull >= world.hullMax ? 'HULL UNDAMAGED'
      : missing <= 0 ? `USE GARAGE ABOVE ${ceiling} HULL`
      : buyable <= 0 ? `NEED ${H.repairPrice} CR, HAVE ${world.ledger.credits}`
      : `${buyable} HULL / ${buyable * H.repairPrice} CR`,
    run: () => world.patchHull(),
  };
}

export function patchHull(world) {
  const ceiling = patchCeiling(world);
  if (world.hull >= world.hullMax) { world.emit('actionRefused', { reason: 'HULL UNDAMAGED' }); return; }
  if (Math.floor(ceiling - world.hull) <= 0) { world.emit('actionRefused', { reason: `USE GARAGE ABOVE ${ceiling} HULL` }); return; }
  mendTo(world, world.hull + Math.floor(ceiling - world.hull));
}

// A station a wreck broke (breakStation): closed but for a cargo bound to it, until repaired.
export function brokenActions(world, station) {
  const actions = [];
  const active = world.ledger.activeJob();
  if (active && active.to === station.id) actions.push({ label: `DELIVER ${active.label}`, cargo: true, run: () => world.deliver(station) });
  // A ship berthed when the station broke (a raid ran out its clock round it, src/raids.js loseRaid) is not shut in with it:
  // the way out is first among what is left (SX, 2026-10-02: «Когда ты докнулся в станцию нет способа вылететь из нее»).
  if (world.docked === station.id) actions.push({ label: 'UNDOCK', run: () => world.undock(station) });
  const cost = world.ledger.broken.get(station.id);
  const short = world.ledger.credits < cost;
  actions.push({ label: `REPAIR STATION ${formatCR(cost)} CR`, disabled: short,
    note: short ? `NEED ${formatCR(cost)} CR, HAVE ${formatCR(world.ledger.credits)}` : null, run: () => world.repairStation(station) });
  actions.push({ label: 'INFO', run: () => world.logStation(station) });
  return actions;
}

// A working station that a ship was wrecked against breaks (SX, 2026-10-01: «станция ломается на 100
// монет и ее снова нужно починить немного»), or one that hard blows wore out (wearStation). Either costs the bill of a lost raid
// (src/ruins.js stationBill, 210 to 338 CR; SX's W4 of 2026-10-15: a wreck breaks it for the ram's bill, where it was a flat 100 CR and
// the cheaper way to break one). A ruin, or one already broken, has nothing more to break. Broken, it remembers no wear: the repair
// starts it again whole.
export function breakStation(world, station) {
  if (workingKind(world.ledger, station) === 'ruin' || world.ledger.broken.has(station.id)) return false;
  const cost = stationBill(stationDefById(station.id, world.ledger));
  world.ledger.broken.set(station.id, cost);
  world.ledger.wear.delete(station.id);
  world.emit('stationBroken', { stationId: station.id, label: station.label, cost, sectorId: world.sector.id, x: station.x, y: station.y });
  return true;
}

// A hard blow on a working station's hull, closing at `closing` u/s, is remembered (CONFIG.station.wear; SX, 2026-10-08: «если ты
// прям сильно врезался в станцию, у нее уже минусуется и запоминается минус хп ... минус 20% ... она ломается, и надо снова вложить
// деньги»): nothing under `hardSpeed`; else the share of its hull lost goes by the hull's own curve. At `warn` it is said once; at
// `breaks` the station breaks (debris and all, World.breakStation) for the bill of a lost raid. A ruin, HOME and a station already
// broken remember nothing. Returns the share this blow took.
export function wearStation(world, station, closing) {
  const W = CONFIG.station.wear, L = world.ledger;
  if (!(closing >= W.hardSpeed) || L.broken.has(station.id)) return 0;
  const kind = workingKind(L, station);
  if (!kind || kind === 'ruin' || kind === 'home') return 0;
  const lost = W.base * (closing / W.refSpeed) ** W.power, before = L.wear.get(station.id) ?? 0, after = before + lost;
  if (after >= W.breaks) {
    world.breakStation(station);
    return lost;
  }
  L.wear.set(station.id, after);
  if (before < W.warn && after >= W.warn) {
    world.emit('stationWorn', { stationId: station.id, label: station.label, wear: after, sectorId: world.sector.id, x: station.x, y: station.y });
  }
  return lost;
}

// The price of putting a worn station right: its share of the bill, whole at the break.
const wornCost = (world, station) => Math.ceil(stationBill(stationDefById(station.id, world.ledger)) * (world.ledger.wear.get(station.id) ?? 0) / CONFIG.station.wear.breaks);

// The row of a docked station worn by hard blows (not yet broken): the repair, cleared wear and all.
function wornAction(world, station) {
  const cost = wornCost(world, station), short = world.ledger.credits < cost;
  return { label: `REPAIR STATION ${formatCR(cost)} CR`, disabled: short,
    note: short ? `NEED ${formatCR(cost)} CR, HAVE ${formatCR(world.ledger.credits)}` : `${Math.round(100 * world.ledger.wear.get(station.id))} % WORN`,
    run: () => world.repairStation(station) };
}

export function repairStation(world, station) {
  const L = world.ledger, broken = L.broken.has(station.id), worn = L.wear.has(station.id);
  if (!broken && !worn) { world.emit('actionRefused', { reason: 'NOTHING TO REPAIR' }); return; }
  const cost = broken ? L.broken.get(station.id) : wornCost(world, station);
  if (L.credits < cost) { world.emit('actionRefused', { reason: `NEED ${formatCR(cost)} CR, HAVE ${formatCR(L.credits)}` }); return; }
  L.credits -= cost;
  L.broken.delete(station.id);
  L.brokenLook.delete(station.id);
  L.wear.delete(station.id);
  world.emit('stationRepaired', { stationId: station.id, label: station.label, cost, credits: L.credits,
    sectorId: world.sector.id, x: station.x, y: station.y, ...(broken ? null : { mended: true }) });
}
