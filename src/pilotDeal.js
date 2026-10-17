// A new pilot's deal (cut from src/world.js, PLAN D3's last pieces, 2026-10-17): the finds dealt to a new game, the start ruin rolled,
// and the stations built again under it. Each takes the world first; World keeps a one-line method of each name (the page's boot, a
// load and the checks ask the world).
import { sectorById, START_STATIONS, startRuinOf } from './sectors.js';
import { buildStations } from './stations.js';
import { rollDeal } from './rewards.js';

// A new pilot's own deal of the finds (src/rewards.js; SX, 2026-10-02: «сувениры и цвета доступные на старте для каждого
// юзера рандомно генерировались»): which souvenirs and paints the start, the sectors and the ruins hold, kept in the save.
// Only for a game with nothing found or laid yet; a loaded save keeps the deal it has (Progress.fromJSON). The deal is the
// ledger's, and so this world's alone: what reads a find reads it there (src/rewards.js findsFor).
export function dealNew(world, rng) {
  if (world.ledger.found.size || world.ledger.placed.size) return world.ledger.deal;
  world.ledger.deal = rollDeal(rng);
  world.buildFinds();
  return world.ledger.deal;
}

// A new pilot's own broken station (src/sectors.js START_STATIONS; SX, 2026-10-02: «каждому игроку из 3 станций рандомно
// достается первая сломанная»): RELAY 12, HALCYON or YARD 3, one in three, kept in the save. Only for a game nothing has
// gone into a ruin in yet; a loaded save keeps the one it has (Progress.fromJSON), an older save HALCYON. `force`
// (the lab's `?startRuin=`) gives one to any save: what the three had of a ruin's record (restored, funded, guards
// beaten) goes, the rest is kept. The roll is the ledger's, and so this world's alone (src/sectors.js stationDefById). Returns the
// pilot's start ruin.
export function rollStartRuin(world, rng, { force = null } = {}) {
  const L = world.ledger;
  const forced = START_STATIONS.includes(force) ? force : null;
  if (forced) {
    for (const id of START_STATIONS) {
      L.restored.delete(id); L.invested.delete(id); L.cleared.delete(id); L.guardsAt.delete(id); L.restoredAt.delete(id);
      world.posts.delete(id);
    }
  } else if (L.restored.size || L.invested.size || L.cleared.size) return startRuinOf(L);
  L.startRuin = forced ?? START_STATIONS[Math.min(START_STATIONS.length - 1, Math.floor(rng() * START_STATIONS.length))];
  world.recastStations();
  world.buildFinds();
  return L.startRuin;
}

// The stations of every sector built so far, built again under the pilot's start ruin: after it changed (a load, a new pilot's
// roll), so the one rolled stands as a ruin and the others as what they work as. Their places, drift and look come from the
// catalogue, so nothing a pilot sees moves.
export function recastStations(world) {
  const size = { width: world.width, height: world.height };
  for (const [id, b] of world.bodyCache) b.stations = buildStations(sectorById(id), size, world.ledger);
  if (world.sector) world.stations = world.sectorBodies(world.sector).stations;
}
