import { CONFIG } from './config.js';
import { sectorById, SECTOR_SIZE, stationDefById } from './sectors.js';
import { bossQuestToJSON, readBossQuest } from './bossQuest.js';
import { chorusToJSON, readChorus } from './chorus.js';
import { findDef, isAvailable } from './rewards.js';
import { SIGNALS, WORDS } from './progression.js';
import { STRANGERS, strangerOpen } from './strangers.js';
import { ruinDef, isRestored, reachableStationIds } from './ruins.js';
import { sectorOpen } from './frontier.js';
import { NPC_ART } from './npcShips.js';
import { GUIDE } from './guide.js';
import { PLANET_ASKS, PLANET_THANKS, planetWords, sayFor } from './voices.js';
import { specialById } from './specialShips.js';
import { readPlan } from './specialQuests.js';
import { clamp } from './util.js';
import { readPirateCombat, writePirateCombat, readPirateRoster } from './pirateCombatSave.js';
import { pickTypes } from './pirates.js';

// The quests that are open when the game is saved (PLAN C1, 2026-10-03; the chats audit: «a reload resets them»). They were in
// memory only, so a reload dropped a side quest, the radio's step, a ship pestered or a reference ship waiting, and the money a
// quest had taken (a wreck given to, fuel given to a pilot) was gone with the quest. Now each open one is a record in the
// save's `quests` list, with what it takes to build it again: its kind, its target and place, how far it has got, and its clock.
//
//   [{ kind: 'find', findId, age }, { kind: 'rescue', drifter: {...}, fueled, hailed, age }, { kind: 'pester', ... left },
//    { kind: 'freight', stationId, ruinId, age }, ...]
//
// What is NOT here, on purpose:
//   a raid               the ledger's own (`ledger.raid`, with its clock and its tally): it is saved there, once
//   pirate squads        never saved (their personas, SX's rule): a pestered ship's squad is made again when the pilot is in its
//                        sector, as many as are still to beat (`down`, remaining hull IDs and paint are kept). Finite role supplies
//                        and the NPC capsule are quest state; flight state and transient carrier IDs are not saved.
//   the pacing           `sideReadyAt`, `guideReadyAt`, `pesterNext`, `freightPace`, the reference ships' clock, and the memory of the last 20
//                        minutes (`world.recent`): a load begins them flat, as before. The memory would be easy to add: it is a list
//                        of { kind, key, at, weight } notes ('kind', 'ship', 'paint') on the ledger's clock, plain numbers and short
//                        strings, so it needs one more field in the save and one reader like these
//   a run in a borrowed ship   the pilot is saved in his own ship, parked (World.snapshot, src/specials.js): the quest comes back as
//                        the reference ship standing where it was met, ready to be boarded again, its run to start over
//
// Clocks. The ledger's clock is saved, so a clock on it (a ship pestered, a ship standing) is kept as the seconds LEFT and set
// from the loaded clock; the side quest's `since` is on the world's own time, which begins at 0 with every page, so it is kept
// as its `age`. Neither runs while the game is closed: they are the pilot's flying time, as the delivery clock is. A quest whose
// time is out at the load meets its kind's rule on the first look: a pestered ship is lost, a ship standing goes, a side quest
// not started in `expire` s is withdrawn.
//
// A save is untrusted input. Each record is read on its own: one that names what the catalogue no longer has (a find, a ruin, a
// signal, a ship, a place), what lies past a closed border, or is not in the shape, is dropped, and the load goes on without it.
// The first valid record of a slot is kept (one side quest, one radio step, one ship pestered, one reference ship).

const Q = () => CONFIG.quests;
const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
const SIDE_KINDS = Object.freeze(['find', 'rebuild', 'signal', 'stranger', 'rescue', 'wreck', 'planet', 'freight']);
const STAGES = Object.freeze(['ask', 'fetch', 'return', 'thanked']);

const fin = Number.isFinite;
const flag = (v) => v === true;
const num = (v, lo, hi, fallback) => (fin(v) ? clamp(v, lo, hi) : fallback);
const text = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null);
const known = (code) => typeof code === 'string' && Object.hasOwn(NPC_ART, code);
// A sector of the grid that is open to the pilot (the hidden one and a closed border hold no quest), or null.
const openSector = (world, id) => {
  const s = typeof id === 'string' ? sectorById(id) : null;
  return s && !s.hidden && sectorOpen(world.ledger, s) ? s : null;
};

// ------------------------------------------------------------------------------------------------------- writing

export function questsToJSON(world) {
  const out = [];
  if (world.sideQuest) { const rec = writeSide(world, world.sideQuest); if (rec) out.push(rec); }
  if (world.guide) out.push({ kind: 'guide', step: world.guide.step });
  if (world.pester) out.push(writePester(world, world.pester));
  if (world.special) out.push(writeSpecial(world, world.special));
  const boss = bossQuestToJSON(world);
  if (boss) out.push(boss);
  const chorus = chorusToJSON(world);
  if (chorus) out.push(chorus);
  return out;
}

function writeSide(world, s) {
  // How long it has been on offer, on the world's time.
  const age = Math.max(0, world.time - (s.since ?? world.time));
  switch (s.kind) {
    case 'find': return { kind: 'find', findId: s.findId, age };
    case 'rebuild': return { kind: 'rebuild', stationId: s.stationId, age };
    case 'signal': return { kind: 'signal', signalId: s.signalId, age };
    case 'stranger': return { kind: 'stranger', strangerId: s.strangerId, age };
    case 'freight': return { kind: 'freight', stationId: s.stationId, ruinId: s.ruinId, age };
    case 'rescue': {
      const d = s.drifter;
      return { kind: 'rescue', age, drifter: { sectorId: d.sectorId, x: d.x, y: d.y, angle: d.angle, code: d.code, paint: d.paint ?? null },
        fueled: !!s.fueled, hailed: !!s.hailed };
    }
    case 'wreck': {
      const w = s.wreck;
      return { kind: 'wreck', age, wreck: { sectorId: w.sectorId, x: w.x, y: w.y, angle: w.angle, code: w.code, paint: w.paint ?? null, ask: w.ask,
        hint: w.hint ? { ...w.hint } : null, given: !!w.given, hailed: !!w.hailed } };
    }
    case 'planet': {
      // A wreck loses the suitcase (src/errands.js stepErrand): saved at a wreck, before that step has run, it is not kept.
      if (s.errand.stage === 'return' && !world.ship.alive) return null;
      const e = s.errand;
      return { kind: 'planet', age, errand: { planet: { ...e.planet }, station: e.station, stage: e.stage, spoke: !!e.spoke, travelled: e.travelled,
        ambushed: !!e.ambushed, ambushAt: e.ambushAt, length: e.length, words: e.words ? { ...e.words } : null } };
    }
    default: return null;
  }
}

function writePester(world, p) {
  return { kind: 'pester', code: p.code, paint: p.paint ?? null, sectorId: p.sectorId, x: p.x, y: p.y, angle: p.angle, size: p.size, down: p.down,
    left: Math.max(0, p.ends - world.ledger.clock), hailed: !!p.hailed,
    mix: p.mix ? [...p.mix] : undefined, piratePaint: p.piratePaint ?? null, combat: writePirateCombat(p.combat) };
}

// A reference ship standing, or one flown: both are saved as the ship standing at its site (see the top of the file).
function writeSpecial(world, s) {
  return { kind: 'special', ship: s.id, site: { sectorId: s.site.sectorId, x: s.site.x, y: s.site.y, angle: s.site.angle },
    plan: structuredClone(s.plan), left: s.stage === 'flying' ? Q().special.stay : Math.max(0, s.leaveAt - world.ledger.clock) };
}

// ------------------------------------------------------------------------------------------------------- reading

// Sets the world's four slots from a save's list (World.restore, after the ledger, the pilot and the sector are in place):
// what the list holds that can still be had, nothing else.
export function restoreQuests(world, raw) {
  world.sideQuest = null;
  world.guide = null;
  world.pester = null;
  world.special = null;
  world.bossQuest = null;
  world.chorus = null;
  for (const r of Array.isArray(raw) ? raw : []) {
    try {
      if (r?.kind === 'guide') world.guide ??= readGuide(world, r);
      else if (r?.kind === 'pester') world.pester ??= readPester(world, r);
      else if (r?.kind === 'special') world.special ??= readSpecial(world, r);
      else if (r?.kind === 'boss') world.bossQuest ??= readBossQuest(world, r);
      else if (r?.kind === 'chorus') world.chorus ??= readChorus(world, r);
      else if (SIDE_KINDS.includes(r?.kind) && !world.sideQuest) world.sideQuest = readSide(world, r);
    } catch {
      // A record that cannot be read is dropped; the pilot's load never fails for a quest.
    }
  }
}

function readSide(world, r) {
  const L = world.ledger, since = world.time - num(r.age, 0, 1e6, 0);
  switch (r.kind) {
    case 'find': {
      const f = findDef(r.findId, L);
      return f && isAvailable(f, L) ? { id: `side:${f.id}`, kind: 'find', findId: f.id, since } : null;
    }
    case 'rebuild': {
      const def = typeof r.stationId === 'string' ? ruinDef(r.stationId, L) : null;
      return def && !isRestored(L, def) && openSector(world, def.sectorId) ? { id: `side:${def.id}`, kind: 'rebuild', stationId: def.id, since } : null;
    }
    case 'signal': {
      const sig = SIGNALS.find((g) => g.id === r.signalId);
      return sig && !L.heard.has(sig.id) && openSector(world, sig.sector) ? { id: `side:${sig.id}`, kind: 'signal', signalId: sig.id, since } : null;
    }
    case 'stranger': {
      const st = STRANGERS.find((x) => x.id === r.strangerId);
      return st && strangerOpen(st, L) && !L.completed.has(st.contract.id) && !L.stranded.has(st.contract.id)
        ? { id: `side:${st.id}`, kind: 'stranger', strangerId: st.id, contractId: st.contract.id, since } : null;
    }
    case 'freight': {
      // The station and the ruin it is for; whether the wallet still falls short is the first look's to say (src/freight.js freightReach).
      const st = typeof r.stationId === 'string' ? stationDefById(r.stationId) : null;
      const ruin = typeof r.ruinId === 'string' ? ruinDef(r.ruinId, L) : null;
      return st && ruin && !isRestored(L, ruin) && openSector(world, ruin.sectorId) && reachableStationIds(L).includes(st.id)
        ? { id: `freight:${st.id}:${Math.round(world.time)}`, kind: 'freight', stationId: st.id, ruinId: ruin.id, base: L.completed.size, since } : null;
    }
    case 'rescue': {
      const d = r.drifter, sector = openSector(world, d?.sectorId);
      if (!sector || !known(d.code) || !fin(d.x) || !fin(d.y)) return null;
      const q = { id: `side:rescue:${Math.round(world.time)}`, kind: 'rescue', since,
        drifter: { sectorId: sector.id, x: clamp(d.x, 0, 1), y: clamp(d.y, 0, 1), angle: num(d.angle, -1e3, 1e3, 0), code: d.code, paint: text(d.paint) } };
      if (flag(r.hailed)) q.hailed = true;
      // The pilot's thanks wait in its window until the quest is handed in (src/quests.js helpDrifter).
      if (flag(r.fueled)) { q.fueled = true; q.thanks = sayFor(world, 'rescue', 'thanks', d.code); }
      return q;
    }
    case 'wreck': {
      const w = r.wreck, sector = openSector(world, w?.sectorId);
      if (!sector || !known(w.code) || !Q().wreck.asks.includes(w.ask) || !fin(w.x) || !fin(w.y)) return null;
      const wreck = { sectorId: sector.id, x: clamp(w.x, 0, 1), y: clamp(w.y, 0, 1), angle: num(w.angle, -1e3, 1e3, 0), code: w.code, paint: text(w.paint),
        ask: w.ask, hint: readHint(w.hint, world.ledger) };
      if (flag(w.hailed)) wreck.hailed = true;
      // Given, the money is the ledger's already (spent); the ship's thanks wait in its window (src/wrecked.js giveToWreck).
      if (flag(w.given)) { wreck.given = true; wreck.thanks = sayFor(world, 'wreck', 'thanks', w.code); }
      return { id: `side:wreck:${Math.round(world.time)}`, kind: 'wreck', since, wreck };
    }
    case 'planet': return readErrand(world, r, since);
    default: return null;
  }
}

// A tip as it was promised, or none (the quest's look draws another, or withdraws the quest, src/wrecked.js refreshWreck).
function readHint(h, ledger) {
  if (h?.kind === 'cache' && findDef(h.findId, ledger)) return { kind: 'cache', findId: h.findId };
  if (h?.kind === 'signal' && SIGNALS.some((g) => g.id === h.signalId)) return { kind: 'signal', signalId: h.signalId };
  if (h?.kind === 'word' && WORDS.some((w) => w.id === h.wordId)) return { kind: 'word', wordId: h.wordId };
  return null;
}

function readErrand(world, r, since) {
  const e = r.errand, A = Q().errand.ambush;
  const sector = openSector(world, e?.planet?.sectorId);
  const planet = sector && typeof e.planet.label === 'string' ? (sector.planets ?? []).find((p) => p.label === e.planet.label) : null;
  const station = typeof e?.station === 'string' ? stationDefById(e.station) : null;
  if (!planet || !station || !openSector(world, station.sectorId) || !STAGES.includes(e.stage) || !fin(e.length) || e.length <= 0) return null;
  const errand = { planet: { sectorId: sector.id, label: planet.label }, station: station.id, stage: e.stage, spoke: flag(e.spoke),
    travelled: num(e.travelled, 0, 1e7, 0), ambushed: flag(e.ambushed), ambushAt: num(e.ambushAt, 0, 1e7, clamp(e.length * A.after, A.min, A.max)),
    length: e.length };
  // The wording it was drawn with (indices into the pools of src/voices.js), else drawn when the planet first speaks.
  const w = e.words;
  if (Number.isInteger(w?.ask) && w.ask >= 0 && w.ask < PLANET_ASKS.length && Number.isInteger(w?.thanks) && w.thanks >= 0 && w.thanks < PLANET_THANKS.length) errand.words = { ask: w.ask, thanks: w.thanks };
  // Thanked, the planet's words wait in its window until the quest is handed in (src/errands.js deliverSuitcase).
  if (errand.stage === 'thanked') errand.thanks = PLANET_THANKS[(errand.words ??= planetWords(world)).thanks];
  return { id: `side:planet:${planet.label}:${Math.round(world.time)}`, kind: 'planet', since, errand };
}

function readGuide(world, r) {
  const step = GUIDE.find((s) => s.id === r.step);
  if (!step) return null;
  world.guideSerial += 1;
  return { id: `guide:${step.id}:${world.guideSerial}`, step: step.id, since: world.time };
}

function readPester(world, r) {
  const C = Q().pester, sector = openSector(world, r.sectorId);
  if (!sector || !known(r.code) || !fin(r.x) || !fin(r.y) || !Number.isInteger(r.size)) return null;
  const size = clamp(r.size, 1, Math.max(...C.squad.map(([n]) => n)));
  const down = Number.isInteger(r.down) ? clamp(r.down, 0, size) : 0;
  const mix = readPirateRoster(r.mix, size - down);
  const combat = readPirateCombat(r.combat);
  // Do not turn a malformed new objective into an already completed ordinary rescue.
  if ((r.mix != null && !mix) || (r.combat?.capsule && !combat?.capsule) || (mix?.includes('jackal') && !combat?.capsule)) return null;
  const capsule = combat?.capsule;
  if (capsule && [capsule, capsule.exit].some((point) => point.x < 0 || point.x > W || point.y < 0 || point.y > H)) return null;
  world.pesterSerial += 1;
  const p = { id: `pester:${world.pesterSerial}`, code: r.code, name: NPC_ART[r.code].name, sectorId: sector.id, x: clamp(r.x, 0, W), y: clamp(r.y, 0, H),
    angle: num(r.angle, -1e3, 1e3, 0), size, down, ends: world.ledger.clock + num(r.left, 0, C.time, C.time), hailed: flag(r.hailed), hits: [], paint: text(r.paint),
    mix: mix ?? pickTypes(size - down, world.rng('pirate')),
    piratePaint: CONFIG.pirates.paints.some((q) => q.id === r.piratePaint) ? r.piratePaint : null, combat };
  // Driven off: it waits for its thanks to be heard (src/pester.js stepPester).
  if (down >= size && (!combat?.capsule || combat.capsule.state === 'recovered')) {
    p.cleared = true; p.thanks = sayFor(world, 'pester', 'thanks', p.code);
  }
  return p;
}

function readSpecial(world, r) {
  const sp = typeof r.ship === 'string' ? specialById(r.ship) : null;
  const sector = openSector(world, r.site?.sectorId);
  // A ship whose note the pilot holds is not met again.
  if (!sp || world.pilot.notes.has(sp.id) || !sector || !fin(r.site.x) || !fin(r.site.y)) return null;
  const plan = readPlan(world, sp.id, r.plan);
  if (!plan) return null;
  const stay = Q().special.stay;
  world.specialSerial = (world.specialSerial ?? 0) + 1;
  return { id: sp.id, n: world.specialSerial, questId: `special:${world.specialSerial}`, stage: 'seen',
    site: { sectorId: sector.id, x: clamp(r.site.x, 0, W), y: clamp(r.site.y, 0, H), angle: num(r.site.angle, -1e3, 1e3, 0) },
    plan, q: null, loadTop: 1, leaveAt: world.ledger.clock + num(r.left, 0, stay, stay), spoke: false, parked: null, boarded: false };
}
