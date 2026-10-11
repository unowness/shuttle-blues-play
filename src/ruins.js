import { CONFIG } from './config.js';
import { stationDefById, stationIds, networkStationIds, sectorById, startRuinOf } from './sectors.js';
import { sectorOpen } from './frontier.js';

// Ruined stations (SX, 2026-09-30: «Я бы нарисовал еще разрушенные станции, в
// которые надо вложиться монетами чтобы их восстановить»).
//
// A ruin is a station of kind 'ruin' in the sector catalogue, with `becomes`
// (the station it was: a freight hub or a garage) and `cost` (what restoring it
// takes, in CR). Since the v1 economy (ECONOMY_V1_HANDOFF.md, 2026-10-01) there
// are eight, at fixed prices that belong to the station and not to how many are
// done, in no order. A ruin takes its price in one payment (RESTORE) or a part at
// a time (INVEST 50, 250, 500: SX the same day, over the handoff's «no partial
// deposits»: «оставь возможность грузить в станции деньги понемногу»); what has
// gone in stays in it (Progress.invested) and the drawing comes back as it
// fills. Which ruins are restored is kept in the ledger (Progress.restored),
// so it survives a reload. A restored ruin is
// that station again: it docks, refuels, repairs if it was a garage, sends out
// runs and receives them. Each restoration raises the freight tariff for
// everything accepted after it (networkMultiplier) and unlocks two finds near the
// station (src/rewards.js).

// Every ruin in the catalogue, by id; under the pilot's start ruin when `ledger` is given (src/sectors.js stationDefById).
export function ruinDef(id, ledger = null) {
  const def = stationDefById(id, ledger);
  return def && def.kind === 'ruin' ? def : null;
}

// The ruins, by id, in catalogue order: the seven that are always ruins and the pilot's start ruin (src/sectors.js
// START_STATIONS; SX, 2026-10-02: «каждому игроку из 3 станций рандомно достается первая сломанная»). Eight under every roll, made
// once for each. A pilot's are `ruinIdsOf(ledger)`, each world's own (2026-10-05, chat E1's refactoring piece: until then one list
// was put in force for the whole process, with the start ruin and the deal); `RUIN_IDS` is the catalogue's, HALCYON the start
// ruin: a new pilot's, an older save's.
const RUINS = new Map();
export function ruinIdsOf(ledger = null) {
  const key = startRuinOf(ledger);
  let ids = RUINS.get(key);
  if (!ids) RUINS.set(key, ids = Object.freeze(stationIds().filter((id) => ruinDef(id, ledger))));
  return ids;
}
export const RUIN_IDS = ruinIdsOf(null);

// The station as the pilot's catalogue has it, whatever object stands for it (a world's Station, a def): under his start ruin
// a station of the three is a ruin or works by his roll, not by the object's.
const asPilots = (ledger, station) => (ledger && station?.id && stationDefById(station.id, ledger)) || station;

export function isRestored(ledger, station) {
  const def = asPilots(ledger, station);
  return !!def && (def.kind !== 'ruin' || !!ledger?.restored?.has(def.id));
}

// How much of a ruin stands, 0..1, for its drawing (labs/graphics/world-art.js): what has gone in
// of its price, all of it once restored.
export function invested(ledger, id) {
  return ledger?.invested?.get(id) ?? 0;
}
export function rebuiltShare(ledger, station) {
  if (isRestored(ledger, station)) return 1;
  const cost = asPilots(ledger, station)?.cost ?? ruinDef(station?.id, ledger)?.cost ?? 0;
  return cost ? Math.max(0, Math.min(1, invested(ledger, station.id) / cost)) : 0;
}

// How many ships guard a ruin: by its price (CONFIG.raids.guards, 4 for the cheapest, 8 for the dearest; src/raids.js). Here and not in
// src/raids.js because the opening (src/opening.js) says the number and cannot import raids.js, which reads the opening.
export function guardSize(def) {
  const table = CONFIG.raids.guards;
  for (const [upTo, n] of table) if ((def?.cost ?? 0) <= upTo) return n;
  return table[table.length - 1][1];
}

// What is left to put into a ruin before it is restored.
export function stillToInvest(ledger, station) {
  const def = station && ruinDef(station.id, ledger);
  if (!def || ledger.restored.has(def.id)) return 0;
  return Math.max(0, def.cost - invested(ledger, def.id));
}

// The parts a pilot may put in at a time (SX, 2026-10-01: «варианты грузить по 50 и по 250 и по 500»).
export const INVEST_STEPS = Object.freeze([50, 250, 500]);

// What it costs to reopen a station that was closed: a raid lost (src/raids.js loseRaid), a blow that wore it out (src/stationService.js
// wearStation). SX's 11B (2026-10-04, Codex's study: «150 + min(200, round((station.cost ?? 1500) / 25))»): 150 CR and a twenty-fifth of
// its price, at most 200, a restored ruin by its own price, any other station as one of `loss.value`: 210 to 338 CR.
export function stationBill(def) {
  const L = CONFIG.raids.loss;
  return L.base + Math.min(L.cap, Math.round((def.kind === 'ruin' && Number.isFinite(def.cost) ? def.cost : L.value) / L.per));
}

// What a station works as now: a ruin is 'ruin' until restored, then what it was.
export function workingKind(ledger, station) {
  const def = asPilots(ledger, station);
  if (def?.kind !== 'ruin') return def?.kind;
  return isRestored(ledger, def) ? def.becomes : 'ruin';
}

// The stations that work now, on the grid (never the hidden sector, which has none
// and which nothing outside points into), in catalogue order: where freight goes. The pilot's home
// garage (src/home.js) is not on the freight network.
export function workingStationIds(ledger) {
  return networkStationIds().filter((id) => {
    const def = stationDefById(id, ledger);
    return !sectorById(def.sectorId)?.hidden && isRestored(ledger, def);
  });
}

// The stations that work now and stand in a sector open to the pilot (src/frontier.js): where freight goes, where raids fall
// and suitcases wait, so nothing sends the pilot across a closed border. The pilot card's STATIONS still counts every station
// that works (workingStationIds).
export function reachableStationIds(ledger) {
  return workingStationIds(ledger).filter((id) => sectorOpen(ledger, stationDefById(id).sectorId));
}

// The freight tariff (ECONOMY_V1_HANDOFF.md section 5): each restored station adds a
// share of the original tariff (CONFIG.economy.networkBonus, 0.15 since 2026-10-04), 1.0 with none and 2.2 with all eight
// (`networkMax`). Additive, not compounded. `restored` is a count: the ledger's at the job's acceptance, when the job
// takes the tariff into its own terms (src/contracts.js quoteJob).
export function networkMultiplier(restored) {
  const E = CONFIG.economy, n = Number.isInteger(restored) && restored > 0 ? restored : 0;
  return Math.round(Math.min(E.networkMax, 1 + E.networkBonus * n) * 100) / 100;
}

// Putting `amount` CR into a ruin, the same shape as every other settlement: the refusals first;
// then the debit and the record together. Never more than is left to put in; short of the amount,
// nothing changes (the menu says what is missing). The last credit in restores it. `amount`
// omitted is all that is left: RESTORE. `free`: the credits are built in and not taken from the wallet (the first-dock support,
// src/starterSupport.js); everything else is the same, and a wallet short of it matters not.
export function investRuin(ledger, station, amount = null, { free = false } = {}) {
  const def = station && ruinDef(station.id, ledger);
  if (!def) return { ok: false, reason: 'NOT A RUIN' };
  if (ledger.restored.has(def.id)) return { ok: true, alreadySettled: true, credits: ledger.credits };
  if (!Number.isInteger(def.cost) || def.cost <= 0) return { ok: false, reason: 'RUIN UNAVAILABLE' };
  // Past a closed border (src/frontier.js) a ruin takes nothing: the pilot cannot be there, and money in it is what the frontier
  // was made to stop (SX, 2026-10-02: «вкидываю по чуть чуть во все разрушенные базы и ни одну так и не открыл»).
  if (!sectorOpen(ledger, def.sectorId)) return { ok: false, reason: 'SECTOR CLOSED' };
  const left = stillToInvest(ledger, def);
  const give = Math.min(Number.isInteger(amount) && amount > 0 ? amount : left, left);
  if (!free && ledger.credits < give) return { ok: false, reason: `NEED ${formatCR(give)} CR, HAVE ${formatCR(ledger.credits)}` };
  if (!free) ledger.credits -= give;
  const total = invested(ledger, def.id) + give;
  const done = total >= def.cost;
  if (done) { ledger.invested.delete(def.id); ledger.restored.add(def.id); } else ledger.invested.set(def.id, total);
  return { ok: true, alreadySettled: false, given: give, invested: done ? def.cost : total, done,
    price: def.cost, credits: ledger.credits, restored: ledger.restored.size };
}


// Credits as the economy's prices are written (2,500): thousands grouped.
export function formatCR(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
