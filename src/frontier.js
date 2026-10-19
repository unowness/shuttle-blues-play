import { CONFIG } from './config.js';
import { SECTORS, sectorById, stationDefById } from './sectors.js';

// The frontier: which sectors of the grid are open to the pilot (SX, 2026-10-02: «знаешь вот я давно на своем сейве летаю,
// и я просто вкидываю по чуть чуть во все разрушенные базы и ни одну так и не открыл, короче это проблема большая, видимо
// нам надо постепенно открывать сектора»; of the options, «Руина открывает сектор»).
//
// The pilot starts with HOME's sector and the one beside it (CONFIG.frontier: the first `start` of `order`); each ruin
// restored opens the next of the order, so the money goes into the one ruin in reach instead of a little into all eight.
// A sector that holds a restored ruin is open too, so no save can have a restored station behind a closed border. Derived
// from the ledger's `restored` every time it is asked, never stored: a reload, a migration and a check all read the same.
//
// A closed sector is a dead edge, with the rope and the fog (src/world.js openNeighbour), and nothing points the pilot
// into one: freight (src/ruins.js reachableStationIds), the quests, raids, places for ships in trouble (src/spots.js),
// the black holes' exits (the ring, src/holePassage.js holeExit, runs in this order), the secret hole (src/secretHole.js), the
// bearings (src/navigation.js). O-08 is off the grid and not part of this (its way in is the secret hole, shut since 2026-10-19);
// a grid sector the order does not list is not gated.
//
// What an older save had in closed sectors goes back to it on load (settleFrontier, World.restore).

const GRID = SECTORS.filter((s) => !s.hidden);

// Whether a sector (or its id) is open to the pilot of `ledger`. No allocation: it is asked per frame.
export function sectorOpen(ledger, sectorOrId) {
  const s = typeof sectorOrId === 'string' ? sectorById(sectorOrId) : sectorOrId;
  if (!s) return false;
  const F = CONFIG.frontier, at = F.order.indexOf(s.id);
  if (s.hidden || at < 0) return true;
  const restored = ledger?.restored;
  if (at < F.start + (restored?.size ?? 0)) return true;
  if (restored) for (const id of restored) if (stationDefById(id)?.sectorId === s.id) return true;
  return false;
}

// Whether a station stands in an open sector.
export function stationOpen(ledger, stationId) {
  const def = stationDefById(stationId);
  return !!def && sectorOpen(ledger, def.sectorId);
}

// The ids of the grid's sectors open now, in catalogue order.
export function openSectorIds(ledger) {
  return GRID.filter((s) => sectorOpen(ledger, s)).map((s) => s.id);
}

// The grid's sectors still closed, in the order they open.
export function closedSectorIds(ledger) {
  return CONFIG.frontier.order.filter((id) => sectorById(id) && !sectorOpen(ledger, id));
}

// An older save moved to the rule (World.restore; the save's v13, src/storage.js). What it had beyond the border comes back
// or is called off, nothing is charged:
//   money put into ruins in closed sectors   back into the wallet, the ruin's record of it cleared
//   the cargo carried, bound for a closed station, and lost cargo bound for one   called off: the contract is offered again
//                                            when its station's sector opens (accepting never cost anything, so nothing is owed)
//   a raid on a station in a closed sector   called off, nothing lost
// What waits: lost cargo lying in a closed sector bound for an open station (nothing points to it; the five minutes' return
// takes it home as any lost cargo), the pilot's signs, the sectors visited. A find marked there loses its mark at the load, as
// any find no longer available does (src/rewards.js reconcileFinds). A ship in a closed sector is
// World.restore's (it starts at HOME's berth). Returns what was done: { refunded, ruins, calledOff (cargo labels), raid }.
export function settleFrontier(ledger) {
  const out = { refunded: 0, ruins: [], calledOff: [], raid: false };
  for (const [id, amount] of ledger.invested) {
    if (stationOpen(ledger, id)) continue;
    ledger.invested.delete(id);
    ledger.credits += amount;
    out.refunded += amount;
    out.ruins.push(id);
  }
  const job = ledger.active?.job;
  if (job && !stationOpen(ledger, job.to)) { ledger.active = null; out.calledOff.push(job.label); }
  for (const [id, s] of ledger.stranded) {
    if (stationOpen(ledger, s.job?.to)) continue;
    ledger.stranded.delete(id);
    out.calledOff.push(s.job?.label ?? id);
  }
  if (ledger.raid && !stationOpen(ledger, ledger.raid.stationId)) { ledger.raid = null; out.raid = true; }
  return out;
}
