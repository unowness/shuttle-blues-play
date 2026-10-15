// What a World writes into the save and reads back (cut out of src/world.js, PLAN D3, 2026-10-09; the code is as it was, `this` now `world`).
// `World.snapshot` and `World.restore` stay as one-line methods of those names: the page, the checks and the tools ask the world, and
// the save's shape and SAVE_VERSION are src/storage.js's, not this file's. A save is untrusted input, even a local one: it is read whole
// before anything is applied (a malformed one leaves the world as it was), and what does not resolve against the current catalogue is
// dropped, not repaired. Pure functions of a world and a save: nothing here keeps state.
import { CONFIG } from './config.js';
import { clamp } from './util.js';
import { sectorById, START_SECTOR, stationDefById } from './sectors.js';
import { Progress } from './contracts.js';
import { Collection } from './progression.js';
import { Pilot } from './pilot.js';
import { SignBoard } from './signs.js';
import { Hangar, shipById } from './hangar.js';
import { reconcileFinds } from './rewards.js';
import { reconcileLooks } from './looks.js';
import { sectorOpen, settleFrontier } from './frontier.js';
import { lureSave, readLure, setSecretHole, readSecretHole, rollSecretHole, secretExtras, secretHoleSectors } from './secretHole.js';
import { readFlags, flagsToJSON } from './flags.js';
import { questsToJSON, restoreQuests } from './questSave.js';
import { openingToJSON, restoreOpening } from './opening.js';
import { specialParked } from './specials.js';
import { homeExit, homeStation } from './home.js';
import { MAP_REVISION, migrateMapLedger, migrateMapQuests } from './mapMigration.js';
import { readPiratePosts, writePirateCombat } from './pirateCombatSave.js';

// What the save's v16 step gave back (src/storage.js: a ruin whose price fell, restored by what was in it, the rest to the wallet), for
// the page to say once: { amount, restored: [labels] }, or null. Only what the ledger holds: a ruin named that is not restored is not said.
function readRefund(raw, ledger) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.amount) || raw.amount < 0 || !Array.isArray(raw.restored)) return null;
  const restored = raw.restored.filter((id) => ledger.restored.has(id)).map((id) => stationDefById(id)?.label ?? id);
  return restored.length ? { amount: raw.amount, restored } : null;
}

// Visit counts from a save: [sectorId, count] pairs for sectors that still
// exist, each with a whole positive count. Any other entry is dropped.
function readVisits(raw) {
  const out = new Map();
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (!Array.isArray(entry)) continue;
    const [id, count] = entry;
    if (typeof id !== 'string' || !sectorById(id)) continue;
    if (!Number.isInteger(count) || count < 1) continue;
    out.set(id, count);
  }
  return out;
}

// What a save holds. Deliberately small: progress and a place to resume, not
// a serialisation of the simulation. No particles, no asteroids, no bodies.
export function worldToJSON(world) {
  // A ship wrecked and not yet respawned (the page saves at the wreck, and on a
  // timer or a close) is saved as the respawn will leave it: the hull's respawn share
  // (World.respawnHull), and the tank's respawn minimum. Its hull reads 0 at that moment, and a save of 0 used
  // to load as a living ship with nothing left (QA, 2026-09-30). What the wreck
  // cost (the cargo, the coins) is already in the ledger and is saved as it is.
  // A ship moved by the workshop's R is saved as it was: R is not a free service.
  const afloat = world.ship.alive || world.lastWreckCause === 'reset';
  // A ship the home garage has (src/home.js) is saved where it will be handed back, outside the mouth: a save is never
  // taken inside the rock, and a fuel or mending the garage is part of is saved as far as it has gone.
  const home = world.home && world.stations.find((s) => s.id === world.home.stationId);
  const out = home ? homeExit(home) : null;
  // A pilot in a borrowed ship (src/specials.js) is saved in its own, parked where it was left: the quest is not saved.
  const kept = specialParked(world);
  return {
    mapRevision: MAP_REVISION,
    ledger: world.ledger.toJSON(),
    piratePosts: [...world.posts].map(([id, p]) => [id, { ...p, mix: p.mix ? [...p.mix] : null, combat: writePirateCombat(p.combat) }]),
    collection: world.collection.toJSON(),
    pilot: world.pilot.toJSON(),
    signs: world.signs.toJSON(),
    sectorId: kept ? kept.sectorId : world.sector.id,
    ship: kept ? { x: kept.x, y: kept.y, angle: kept.angle } : out ? { x: out.x, y: out.y, angle: out.angle } : { x: world.ship.x, y: world.ship.y, angle: world.ship.angle },
    hull: kept ? Math.max(1, kept.hull) : afloat ? Math.max(1, world.hull) : world.respawnHull,
    fuel: kept ? kept.fuel : afloat ? world.fuel : Math.max(world.fuel, CONFIG.fuel.respawnMin),
    chalk: world.chalk,
    hangar: world.hangar.toJSON(),
    visits: [...world.visits],
    // Where the secret hole stands now (src/secretHole.js), v12.
    secretHole: world.secretHole ? { ...world.secretHole } : null,
    // When it came and went (src/secretHole.js, the lure), v18.
    lure: lureSave(world.lure),
    // The map's flags that are put (src/flags.js) and the side and reference-ship quests that are open (src/questSave.js), v15.
    // A raid is the ledger's. A pirate is never saved, nor where a squad is or what it is doing; a post's roster, paint and spent
    // supplies are (`piratePosts`, v25, src/pirateCombatSave.js).
    flags: flagsToJSON(world.flags),
    quests: questsToJSON(world),
    // The opening chapter's record (src/opening.js), v17: null for a world with none.
    opening: openingToJSON(world),
  };
}

// A save is untrusted input, even a local one. Anything that does not resolve
// against the current catalogue is dropped rather than repaired, and the
// position is validated before it is used.
export function restoreWorld(world, data) {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'empty' };

  // Everything is read before anything is applied, so a save that turns out
  // to be malformed half-way cannot leave a half-restored world behind.
  let ledger, collection, visits, pilot, signs, hangar, flags;
  try {
    ledger = Progress.fromJSON(data.ledger);
    collection = Collection.fromJSON(data.collection);
    visits = readVisits(data.visits);
    pilot = Pilot.fromJSON(data.pilot);
    signs = SignBoard.fromJSON(data.signs);
    hangar = Hangar.fromJSON(data.hangar, pilot.notes);
    flags = readFlags(data.flags);
  } catch {
    // Nothing to put back: reading a save changes nothing but what it returns (Progress.fromJSON).
    return { ok: false, reason: 'malformed' };
  }
  // The save is read whole. Its start ruin and its deal are its ledger's, and what the rest of the load reads (a ruin, a find, a
  // station) it reads through that ledger: they are this world's from here on, and no other world's (2026-10-05).
  // A cargo an earlier build stranded in the hidden sector can never be found
  // again (nothing outside points into it): it goes back to its sending station,
  // as a wreck there does now.
  for (const [id, rec] of ledger.stranded) if (sectorById(rec.sectorId)?.hidden) ledger.stranded.delete(id);
  // What was found, in the ledger, agrees with what is owned: an older save's
  // souvenirs and paints are recorded as found, free, and never sold again; a find
  // paid for whose item went missing gives it back (src/rewards.js).
  reconcileFinds(ledger, collection, pilot);
  // A pilot already past the fourth restored ruin has the look it gives (src/looks.js).
  reconcileLooks(ledger, pilot);
  // The frontier (src/frontier.js, save v13): an older save is moved to it. What it had put into ruins past a closed border is
  // back in the wallet, and cargo bound past one is called off (settleFrontier); a ship in a closed sector starts at HOME, below.
  // A save of this build has nothing to settle, so it is said once, by the load that moved it.
  const frontier = settleFrontier(ledger);
  const migrateMap = data.mapRevision !== MAP_REVISION;
  const saved = readSecretHole(data.secretHole, ledger);
  if (migrateMap) migrateMapLedger(ledger, signs, flags, saved);
  world.ledger = ledger;
  world.collection = collection;
  world.pilot = pilot;
  world.signs = signs;
  world.flags = flags;
  // The save's start ruin is this world's now (its ledger's): the stations built before the load stand as it says.
  world.recastStations();
  // The secret hole stands where the save says, if that is still a place it may stand; a save without one (v11), or one
  // that no longer holds, gets a fresh place, away from the saved ship.
  // A ship saved in a sector the frontier has closed (an older save) starts at the home garage's berth, as a new game does (SX's
  // pick for his long save, 2026-10-02: «Вернуть вложенное»).
  let sector = sectorById(data.sectorId) || sectorById(START_SECTOR);
  const movedHome = !sectorOpen(ledger, sector);
  if (movedHome) sector = sectorById(START_SECTOR);
  // The hole stands only in an open sector (src/secretHole.js secretHoleSectors): one saved past a closed border moves.
  if (world.secretLure) {
    // Under the lure (v18): the hole open where the save has it, if it was open and the place still holds; else none, its
    // timers on the save's clock.
    world.lure = readLure(data.lure, ledger.clock);
    setSecretHole(world, saved && world.lure.openedAt !== null ? saved : null);
    if (!world.secretHole) world.lure.openedAt = null;
  } else {
    const at = !movedHome && data.ship && Number.isFinite(data.ship.x) && Number.isFinite(data.ship.y) ? { sectorId: data.sectorId, x: data.ship.x, y: data.ship.y } : null;
    const secret = saved || rollSecretHole(world.rng('secret'), { sectors: secretHoleSectors(ledger), extra: secretExtras(world), away: at && { ...at, by: CONFIG.blackHole.secret.place.away } });
    if (secret) setSecretHole(world, secret);
  }
  // The flown ship first (2026-09-30): its hull and tank bound what follows.
  // A save from before the hangar flies the standard.
  world.hangar = hangar;
  world.ship.setChassis(shipById(hangar.flying).chassis);
  // v6 (2026-09-26): the hull. A save from before it, or any other
  // malformed value, reads as a full hull rather than a hole in the save. The
  // ship restored here is alive, so it has at least one point left: a 0 or less
  // (a save written at a wreck by an older build) would be a living ship that
  // the next touch wrecks again (QA, 2026-09-30).
  world.hull = Number.isFinite(data.hull) ? clamp(data.hull, 1, world.hullMax) : world.hullMax;
  // A save from before fuel starts with a full tank.
  world.fuel = Number.isFinite(data.fuel) ? clamp(data.fuel, 0, world.fuelTank) : world.fuelTank;
  // A save from before chalk starts with a new pilot's pieces.
  world.chalk = Number.isInteger(data.chalk) ? clamp(data.chalk, 0, CONFIG.chalk.max) : CONFIG.chalk.start;
  // The opening chapter (src/opening.js, v17): a new pilot's still in SCOOTY JR. flies it again, its hull and tank its own.
  restoreOpening(world, data.opening, { hull: data.hull, fuel: data.fuel });
  world.openingState = null;
  world.supportSaid = false;
  world.hullGrace = 0;
  // Pirates themselves are never saved (a post's roster is, `piratePosts`): loadSector below leaves none, and a fresh load
  // is met by a quiet period, not by an encounter waiting at the door.
  world.pirateReadyAt = world.time + CONFIG.pirates.firstDelay;
  world.pirateRollIn = CONFIG.pirates.checkEvery;
  // Droids neither: the next comes after the first wait of a start.
  world.droidIn = CONFIG.droids.first;

  world.loadSector(sector, { announce: false });
  world.posts = readPiratePosts(data.piratePosts, ledger);
  world.visits = visits;
  if (!world.visits.has(sector.id)) world.visits.set(sector.id, 1);

  const p = data.ship || {};
  const home = movedHome ? homeStation(world) : null;
  const valid = !movedHome && world.isSafeResume(p.x, p.y);
  if (home) world.placeAtHome(home);
  else if (valid) {
    world.ship.x = p.x; world.ship.y = p.y;
    world.ship.angle = Number.isFinite(p.angle) ? p.angle : -Math.PI / 2;
    world.ship.vx = 0; world.ship.vy = 0;
    world.ship.alive = true;
    world.ship.invuln = CONFIG.ship.invulnTime;
  } else {
    world.placeShip();
  }

  world.cam = { x: world.ship.x, y: world.ship.y };
  world.special = null;
  world.specialLeaving = null;
  world.spawnField(sector);
  world.cargo = null;
  world.docked = null;
  world.home = null;
  world.berth = null;
  world.dockHeld = null;
  // A ship saved in a berth (or anywhere in a station's body) flies out of it as if undocking.
  const inside = world.stations.find((st) => st.contact(world.ship.x, world.ship.y, world.ship.radius, world.delta.bind(world)));
  world.leavingStation = inside ? inside.id : null;
  world.selectedId = null;
  world.recorder.reset();
  // The quests that were open when it was saved, the ones that can still be had (src/questSave.js); pirate squads are met anew.
  restoreQuests(world, data.quests);
  if (migrateMap) migrateMapQuests(world);
  return { ok: true, positionRestored: valid, sectorId: sector.id, frontier: { ...frontier, movedHome }, refund: readRefund(data.refund, ledger) };
}
