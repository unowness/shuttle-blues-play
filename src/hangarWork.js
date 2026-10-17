// The hangar at a garage (cut from src/world.js, PLAN D3's last pieces, 2026-10-17): the station whose hangar the ship is docked at,
// a ship bought and a ship flown. The hangar's record and the fleet are src/hangar.js, its window src/hangarPanel.js. Each takes the world
// first; World keeps a one-line method of each name (the menus, the garage room and the checks ask the world).
import { clamp } from './util.js';
import { workingKind, formatCR } from './ruins.js';
import { shipById, shipLimits } from './hangar.js';
import { isHome } from './home.js';
import { openingHangarBar } from './opening.js';

// The hangar at the garage the ship is docked at (src/hangar.js). Buying pays
// for a ship and flies it at once, delivered full; changing ships leaves the
// one flown until now in the hangar as it was, hull and fuel, and takes the
// other as it was left. Neither repairs, refuels or touches the cargo.
export function hangarStation(world) {
  const station = world.stations.find((s) => s.id === world.docked);
  return station && (workingKind(world.ledger, station) === 'garage' || isHome(station)) ? station : null;
}

export function buyShip(world, id) {
  const bar = openingHangarBar(world);
  if (bar) { world.emit('actionRefused', { reason: bar }); return false; }
  const def = shipById(id);
  const station = world.hangarStation();
  if (!def || !station) { world.emit('actionRefused', { reason: 'NO HANGAR HERE' }); return false; }
  // A crew's ship is never sold: had, it is flown; not had, flyShip says so.
  if (world.hangar.owns(id) || def.crew) return world.flyShip(id);
  if (world.ledger.credits < def.price) {
    world.emit('actionRefused', { reason: `NEED ${formatCR(def.price)} CR, HAVE ${formatCR(world.ledger.credits)}` });
    return false;
  }
  world.ledger.credits -= def.price;
  world.hangar.owned.add(id);
  const full = shipLimits(id);
  world.hangar.stored.set(id, { hull: full.hull, fuel: full.tank });
  world.emit('shipBought', {
    shipId: id, label: def.label, price: def.price, credits: world.ledger.credits,
    stationId: station.id, sectorId: world.sector.id, x: station.x, y: station.y,
  });
  return world.flyShip(id);
}

export function flyShip(world, id) {
  const bar = openingHangarBar(world);
  if (bar) { world.emit('actionRefused', { reason: bar }); return false; }
  const def = shipById(id);
  const station = world.hangarStation();
  if (!def || !station) { world.emit('actionRefused', { reason: 'NO HANGAR HERE' }); return false; }
  // (A crew's ship not had yet: its crew's run comes first.)
  if (!world.hangar.owns(id)) { world.emit('actionRefused', { reason: def.crew ? `HELP ${def.who} FIRST` : `${def.label} NOT OWNED` }); return false; }
  if (world.hangar.flying === id) return true;
  const from = world.hangar.flying;
  world.hangar.stored.set(from, { hull: world.hull, fuel: world.fuel });
  const full = shipLimits(id);
  const next = world.hangar.stored.get(id) || { hull: full.hull, fuel: full.tank };
  world.hangar.stored.delete(id);
  world.hangar.flying = id;
  world.ship.setChassis(def.chassis);
  world.hull = clamp(next.hull, 1, world.hullMax);
  world.fuel = clamp(next.fuel, 0, world.fuelTank);
  world.emit('shipChanged', {
    shipId: id, from, label: def.label, hull: world.hull, fuel: world.fuel,
    stationId: station.id, sectorId: world.sector.id, x: station.x, y: station.y,
  });
  return true;
}
