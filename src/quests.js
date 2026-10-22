import { CONFIG } from './config.js';
import { stationDefById, sectorById, networkStationIds } from './sectors.js';
import { bossQuestRecord } from './bossQuest.js';
import { chorusRecord } from './chorus.js';
import { SIGNALS, WORDS } from './progression.js';
import { STRANGERS, strangerOpen } from './strangers.js';
import { sectorOpen } from './frontier.js';
import { findsFor, findDef, isAvailable, findLabel, placedFind } from './rewards.js';
import { stillToInvest, isRestored, ruinDef, formatCR } from './ruins.js';
import { raidStatus, raidQuestId } from './raids.js';
import { clockText } from './contracts.js';
import { clearSpot, questSectors, nearPlaces } from './spots.js';
import { pesterQuest, startPester, stepPester } from './pester.js';
import { hintOptions, placeWreck, refreshWreck, wreckWords, stepWreck } from './wrecked.js';
import { errandCandidates, preferErrandCandidates, errandReach, errandWords, stepErrand } from './errands.js';
import { contentAreas } from './mapContent.js';
import { stepSpecial, specialQuest } from './specials.js';
import { factsOfWorld, unlocked, pickKind, pickShip, offerShare, newRecent, noteRecent, payFor } from './pacing.js';
import { restSide } from './sideSlot.js';
import { NPC_ART, QUEST_SHIPS, npcCraft } from './npcShips.js';
import { npcPalette } from './npcPaint.js';
import { sayFor } from './voices.js';
import { guideQuest, lookGuide, offerGuide } from './guide.js';
import { openingQuest, openingCalm, openingHoldsGuide, radioFitted } from './opening.js';
import { stepSupport, supportQuest } from './starterSupport.js';
import { freightCandidates, freightWaited, noteFreight, restFreight, freightTaken, freightReach, freightWords } from './freight.js';
import { QUEST_LINES as QL } from './questLines.js';
import { legTo } from './navigation.js';

// The quests (SX, 2026-10-01, GARAGE_QUESTS_HANDOFF.md step 3: «Если пираты напали, это квест. Типа, если ты накопил денег
// на новую краску, это может быть квест. Да, иногда это рандомный ... высветится. Зеленого цвета ... Главное, пока что это
// реализовано для того, чтобы знать, когда пираты на какую станцию напали»). What the list on the left holds is read from
// the world every frame, never stored on its own: a raid (src/raids.js), red, with its clock; and now and then a side
// quest, green, without one (eight kinds, sideCandidates), one at a time and not too often (CONFIG.quests). The one that is
// open when the game is saved is in the save and comes back (src/questSave.js, PLAN C1, 2026-10-03); what is not is the pacing.
//
// Quests in four colours (QUESTS_V2_HANDOFF.md) added three kinds: a ship pestered by pirates (src/pester.js, red, on a
// slot of its own beside the raid), a wrecked ship asking for money (src/wrecked.js, yellow) and a planet's errand
// (src/errands.js, blue), the last two side quests of the one slot.
//
// When a quest may come, and how often, is the quest economy's (reports/2026-10-02-quest-economy.md): the rules are
// src/pacing.js (a rest after the side slot frees by stations restored, what each kind waits for, the draw by weight, the pay
// grown with the network, expiry, no new offer under a red quest or a reference ship), the radio's eight steps src/guide.js
// (a slot of its own beside the side quest). `stepQuests` below is the look that applies them.
//
// How each quest ended is noted for the page (World.questOutcomes, 'done' or 'late'), so the plate can turn green or
// red as it goes (labs/graphics/quest-list.js); a quest that is simply no longer there (the wallet fell short again)
// goes without either.

const Q = () => CONFIG.quests;

function raidQuest(world) {
  const r = raidStatus(world);
  if (!r) return null;
  const def = r.def;
  const share = Math.round((r.ruin ? CONFIG.raids.ruinShare : CONFIG.raids.stationShare) * 100);
  return {
    id: raidQuestId(r), kind: 'raid', tone: 'red',
    title: QL.raid.title(def.label),
    sub: r.ruin ? QL.raid.subRuin(share) : QL.raid.subStation(share),
    ends: r.endsAt, time: r.time, left: r.left,
    target: { sectorId: def.sectorId, x: def.x, y: def.y, stationId: def.id, mark: def.id },
    done: [QL.raid.done(def.label), QL.raid.paid(formatCR(payFor('raidThanks', world.ledger.restored.size)))],
    late: [QL.raid.ended(), r.ruin ? QL.raid.lostRuin(formatCR(r.loss.cost)) : QL.raid.lostStation(share)],
  };
}

// --------------------------------------------------------------------------------------------- side quests

// Side quests of eight kinds, five of them SX's pick of «Квесты шире» (2026-10-02, after the quests sheet's samples), the wreck
// and the planet's errand of the second round (QUESTS_V2_HANDOFF.md), and the freight hint (2026-10-09, src/freight.js):
//   find      a cache the wallet covers (open, not opened, not the one already marked)
//   rebuild   a ruin the wallet can restore with all that is left
//   signal    a signal not yet tuned in, named by the station nearest it: A SIGNAL NEAR DRY DOCK
//   stranger  another pilot's lost cargo (src/strangers.js) lying open, while the pilot carries none: done when taken
//   rescue    a pilot out of fuel, drifting in this sector or a neighbour: give it `rescue.fuel` units for `rescue.pay` CR
//   wreck     a wrecked ship asks for money and gives a tip for it (src/wrecked.js), yellow
//   planet    a planet's errand: a suitcase to fetch from a station and bring back (src/errands.js), blue
//   freight   a station with a job on offer, for a pilot stuck at a ruin with an empty wallet and no cargo (src/freight.js), blue
// A kind is drawn first, evenly among those that have something, then one of its own; so twenty signals do not crowd
// out a paint (the freight hint is the exception: it comes ahead of the draw, offerSideQuest). Nothing past a closed border (the
// frontier, src/frontier.js): a find there is not available (src/rewards.js), and a ruin, a signal or another pilot's cargo there,
// or bound there, is not offered.
export function sideCandidates(world) {
  const L = world.ledger, out = [];
  for (const f of findsFor(L)) {
    if (!isAvailable(f, L) || L.marked === f.id || L.credits < f.price) continue;
    out.push({ id: `side:${f.id}`, kind: 'find', findId: f.id });
  }
  for (const id of networkStationIds()) {
    const def = ruinDef(id, L);
    if (!def || isRestored(L, def) || sectorById(def.sectorId)?.hidden || !sectorOpen(L, def.sectorId)) continue;
    const left = stillToInvest(L, def);
    if (left > 0 && L.credits >= left) out.push({ id: `side:${id}`, kind: 'rebuild', stationId: id });
  }
  for (const sig of SIGNALS) {
    if (L.heard.has(sig.id) || sectorById(sig.sector)?.hidden || !sectorOpen(L, sig.sector)) continue;
    out.push({ id: `side:${sig.id}`, kind: 'signal', signalId: sig.id });
  }
  if (!L.active) {
    for (const st of STRANGERS) {
      if (L.completed.has(st.contract.id) || L.stranded.has(st.contract.id) || !strangerOpen(st, L)) continue;
      out.push({ id: `side:${st.id}`, kind: 'stranger', strangerId: st.id, contractId: st.contract.id });
    }
  }
  if (!world.sector.hidden) out.push({ id: `side:rescue:${Math.round(world.time)}`, kind: 'rescue' });
  // A wrecked ship asks for what the wallet covers, and has a tip to give for it (src/wrecked.js).
  if (!world.sector.hidden && L.credits >= Math.min(...Q().wreck.asks) && hintOptions(world).length) {
    out.push({ id: `side:wreck:${Math.round(world.time)}`, kind: 'wreck' });
  }
  // A planet with a suitcase to be fetched (src/errands.js).
  if (!world.sector.hidden) out.push(...errandCandidates(world));
  // A pilot stuck at a ruin with an empty wallet and no cargo, and a station with a job to send it to (src/freight.js).
  if (!world.sector.hidden) out.push(...freightCandidates(world));
  return out;
}

// Whether a side quest is done (its cache opened, its ruin restored, its signal heard, its cargo taken, its pilot
// refuelled), and whether it is still to be had (the wallet still reaching a cache or a ruin; a stranger's cargo still
// lying): else it is withdrawn.
function sideDone(world, s) {
  const L = world.ledger;
  switch (s.kind) {
    case 'find': return L.found.has(s.findId);
    case 'rebuild': return isRestored(L, stationDefById(s.stationId, L));
    case 'signal': return L.heard.has(s.signalId);
    case 'stranger': return L.active?.id === s.contractId || L.completed.has(s.contractId);
    case 'rescue': case 'wreck': return !!s.helped;
    case 'freight': return freightTaken(world, s);
    default: return false;
  }
}
function sideReach(world, s) {
  const L = world.ledger;
  if (s.kind === 'find') { const f = findDef(s.findId, L); return !!f && L.credits >= f.price; }
  if (s.kind === 'rebuild') return L.credits >= stillToInvest(L, stationDefById(s.stationId));
  if (s.kind === 'stranger') return !L.stranded.has(s.contractId);
  // A wreck asks what the wallet covers and has a tip that is still true (or another).
  if (s.kind === 'wreck') return !!s.wreck.given || (L.credits >= s.wreck.ask && refreshWreck(world, s));
  if (s.kind === 'planet') return errandReach(world, s);
  if (s.kind === 'freight') return freightReach(world, s);
  return true;
}

// Whether the pilot can be led to the side quest on: it has its words and, if it names a place, a bearing leads there (src/navigation.js
// legTo: none past a closed border, none across a torus or into the hidden sector). A quest in the list is one that can be done and shows
// where (SX, 2026-10-09, of a blue one that hung in the list with no mark and stayed gray): one the pilot cannot be led to is withdrawn at
// the look, quietly, as one out of reach is, and the slot rests.
function sideLed(world) {
  const q = sideQuestWords(world);
  if (!q) return false;
  const t = q.target;
  return !t || !!legTo(world, t.sectorId, t.x * world.width, t.y * world.height);
}

// A clear place for a drifting pilot in a sector, from the catalogue alone (so it can be chosen for a sector the pilot
// is not in): inside the sector's middle, `rescue.clear` u from its stations, planets, holes, caches and signals, and apart from
// the open quests' places `avoid` (src/spots.js).
export const drifterSpot = (sectorId, rng, avoid = null, areas = []) => clearSpot(sectorId, rng, { clear: Q().rescue.clear, avoid, areas });

// Where a side quest the catalogue places would lead (a cache where it was laid for this pilot, a signal, a stranger's cargo, a ruin,
// a planet), as { sectorId, x, y } in fractions; null for the kinds a quest places itself (a pilot out of fuel, a wreck) and for the
// freight hint, which puts nothing in the open: it leads to a station that stands where it stands.
function candidatePlace(world, c) {
  switch (c.kind) {
    case 'find': { const f = placedFind(findDef(c.findId, world.ledger), world.ledger); return f && { sectorId: f.sector, x: f.x, y: f.y }; }
    case 'signal': { const g = SIGNALS.find((x) => x.id === c.signalId); return g && { sectorId: g.sector, x: g.x, y: g.y }; }
    case 'stranger': { const st = STRANGERS.find((x) => x.id === c.strangerId); return st && { sectorId: st.sector, x: st.x, y: st.y }; }
    case 'rebuild': { const def = stationDefById(c.stationId); return def && { sectorId: def.sectorId, x: def.x, y: def.y }; }
    case 'planet': {
      const p = c.errand.planet, def = sectorById(p.sectorId)?.planets?.find((x) => x.label === p.label);
      return def && { sectorId: p.sectorId, x: def.x, y: def.y };
    }
    default: return null;
  }
}

// Once in `checkEvery` s of flight: the side quest on now done or out of reach, or a new one, now and then. Every step:
// a drifting pilot hails one who comes near, once.
export function stepQuests(world, dt) {
  const C = Q();
  // A pilot just refuelled flies off and is gone (World.draw draws it going).
  if (world.drifterLeaving && (world.drifterLeaving.t += dt) >= C.rescue.leave) world.drifterLeaving = null;
  // The new kinds' own steps: a ship pestered, a wreck, a planet's errand (each reads its own state; none is a look).
  stepPester(world, dt);
  stepWreck(world, dt);
  stepErrand(world, dt);
  stepSpecial(world, dt);
  stepSupport(world);
  const drifter = drifterHere(world);
  if (drifter && !world.sideQuest?.hailed && world.ship.alive &&
      Math.hypot(drifter.x - world.ship.x, drifter.y - world.ship.y) < C.rescue.hailReach) {
    world.sideQuest.hailed = true;
    world.emit('trafficHail', { craftId: DRIFTER_ID, label: NPC_ART[drifter.code].name, line: sayFor(world, 'rescue', 'hail', drifter.code), x: drifter.x, y: drifter.y, sectorId: world.sector.id });
  }
  noteHome(world);
  world.questCheckIn -= dt;
  if (world.questCheckIn > 0) return;
  world.questCheckIn = C.checkEvery;
  // Since when the pilot has been stuck at a ruin (src/freight.js): the freight hint waits for it.
  noteFreight(world);
  // The guide's slot looks first (its plate paid when done), then the side slot's. The opening chapter holds the guide while it runs
  // (one tutorial at a time) and every new side quest through its guided stretch (src/opening.js). The radio line is the story's
  // purple, on the side from the start (SX, 2026-10-06: «основную линейку фиолетовых квестов выносить сбоку сразу»): its step comes at
  // the first look its rule allows, no chance, no red quest and no radio waited for (guideMay). The side quests are the radio's
  // (SX: «радио открывает квесты нпс и прочие дополнительные активности как рейды»): none is offered to a pilot without it.
  if (!openingHoldsGuide(world)) lookGuide(world, () => guideMay(world));
  const s = world.sideQuest;
  if (s) {
    if (sideDone(world, s)) { world.questOutcomes.set(s.id, 'done'); world.sideQuest = null; restSide(world); restFreight(world, s); }
    else if (!sideReach(world, s) || sideExpired(world, s) || !sideLed(world)) { world.sideQuest = null; restSide(world); restFreight(world, s); }
    return;
  }
  if (world.time < world.sideReadyAt || openingCalm(world) || !radioFitted(world) || !mayOffer(world)) return;
  offerSideQuest(world);
}

// Whether the radio line's step may come at this look: the pilot's ship is up and no reference ship stands or is flown (the story's
// own rest and rule are src/guide.js's).
const guideMay = (world) => world.ship.alive && !world.special;

// The home garage come up to while the radio line asks for it (SX, 2026-10-06: «не заставляй швартоваться и докаться внутри станции
// во время квестов»): within its menu's reach is the HOME step done (Pilot.homed), as docking there was until then. Only while that
// step is on: a new pilot leaves from HOME's berth, and docking there still counts as it always did (src/home.js).
function noteHome(world) {
  if (world.pilot.homed || world.guide?.step !== 'home' || !world.ship.alive) return;
  const s = world.stations.find((x) => x.id === CONFIG.home.id);
  if (!s) return;
  const d = world.delta(s.x, s.y, world.ship.x, world.ship.y);
  if (Math.hypot(d.x, d.y) <= s.interactRadius) world.pilot.homed = true;
}

// Whether a new offer may come at this look (the slots' shared rules, CONFIG.quests; the quest economy): the pilot's ship
// is up; no reference ship stands or is flown (nothing new while one is on, src/specials.js); no red quest is on (`holdForRed`:
// a raid or a ship pestered is urgent, a fresh green one is not); and the look's chance (`chance`) comes up.
export function mayOffer(world) {
  const C = Q();
  if (!world.ship.alive || world.special) return false;
  // A ship that waits only to be thanked is no red call any more.
  if (C.holdForRed && (world.ledger.raid || (world.pester && !world.pester.cleared))) return false;
  return world.rng('quest')() < C.chance;
}

// A side quest not started within `expire` s goes quietly (it never did: an unwanted one held the slot for good). Started:
// a planet's errand once the job is taken; a pilot out of fuel or a wreck once the pilot has come to it and been spoken to;
// the rest (a cache, a ruin, a signal, a stranger's cargo) are never started, only done.
function sideStarted(s) {
  if (s.kind === 'planet') return s.errand.stage !== 'ask';
  if (s.kind === 'rescue') return !!s.hailed;
  if (s.kind === 'wreck') return !!s.wreck?.hailed;
  return false;
}
export const sideExpired = (world, s) => !sideStarted(s) && world.time - (s.since ?? world.time) > Q().expire;

// A side quest offered now: a kind drawn evenly among those with something, then one of it (the freight hint, when the pilot has been stuck
// at a ruin long enough, ahead of the draw: src/freight.js). Returns it, or null.
// `kind` 'pester' calls for help instead (a red quest on its own slot, src/pester.js), whatever the clock says. `here`
// keeps what is placed in the open to the pilot's own sector (the lab's `?quest=`).
export function offerSideQuest(world, kind = null, { here = false } = {}) {
  const rng = world.rng('quest');
  if (kind === 'pester') return startPester(world, { here });
  if (kind === 'guide') return offerGuide(world, { force: true });
  // A kind asked for (the lab) is offered whatever the pilot has done; drawn, only the kinds unlocked (src/pacing.js). Either way
  // nothing whose place stands nearer than CONFIG.quests.apart to an open quest's (src/spots.js).
  const facts = kind ? null : factsOfWorld(world);
  const places = world.questPlaces();
  const pool = sideCandidates(world).filter((c) => (kind ? c.kind === kind : unlocked(c.kind, facts) && (c.kind !== 'freight' || freightWaited(world))))
    .filter((c) => { const at = candidatePlace(world, c); return !at || !nearPlaces(at.sectorId, at.x, at.y, places); });
  const kinds = [...new Set(pool.map((c) => c.kind))];
  if (!kinds.length) return null;
  // What was offered lately leans on the draw (src/pacing.js: the memory of the last 20 minutes; SX, 2026-10-02: «за 10 минут
  // прилетали только квесты заправить другой корабль»): the kind drawn by weight less what came, and when everything there is came
  // lately, the offer itself is thinned. A kind asked for (the lab's) is offered as asked.
  const recent = (world.recent ??= newRecent()), now = world.ledger.clock;
  // A pilot stuck at a ruin is told of the freight before anything else is drawn, and what was offered lately does not thin it.
  const stuck = !kind && kinds.includes('freight');
  if (!kind && !stuck) {
    const share = offerShare(kinds, recent, now);
    if (share < 1 && rng() >= share) return null;
  }
  const k = kind ?? (stuck ? 'freight' : pickKind(kinds, rng, recent, now));
  let own = pool.filter((c) => c.kind === k);
  // A planet's errand `here` is about a planet of this sector, if it has one.
  if (here && k === 'planet' && own.some((c) => c.errand.planet.sectorId === world.sector.id)) own = own.filter((c) => c.errand.planet.sectorId === world.sector.id);
  // Prefer authored connections only after the normal leg, unlock and quest-spacing checks. A lab's local offer stays local.
  if (!here && k === 'planet') own = preferErrandCandidates(world, own);
  const pick = { ...own[Math.min(own.length - 1, Math.floor(rng() * own.length))], since: world.time };
  if (k === 'rescue') {
    // This sector or one beside it on the grid, never O-08.
    const near = here ? [world.sector] : questSectors(world.sector, world.ledger);
    const sector = near[Math.min(near.length - 1, Math.floor(rng() * near.length))];
    const areas = here ? [] : contentAreas('fuel-help', world.ledger, { sectorId: sector.id });
    const spot = drifterSpot(sector.id, rng, places, areas);
    if (!spot) return null;
    // One of the thirteen friendly ships SX picked (SX, 2026-10-02: «это всегда был челнок такой же как мой только серый, это
    // должны быть разные корабли нпс которых мы придумали»), leaning away from the ones the pilot met or was asked about lately.
    // A person of the fleet out now, out of sight, the ones the pilot knows likelier (src/npcFleet.js Fleet.questShip; N6 QUESTS, 2026-10-19):
    // the very ship, taken off its journey while the quest stands.
    pick.drifter = { sectorId: sector.id, ...spot, angle: rng() * Math.PI * 2, code: world.fleet?.questShip?.(world, rng) ?? pickShip(QUEST_SHIPS, rng, recent, now) };
    // In a paint drawn by the counterweights, as the fleet's ships are (src/npcFleet.js questPaint).
    pick.drifter.paint = world.fleet?.questPaint(world, pick.drifter.code) ?? null;
  }
  if (k === 'wreck') {
    pick.wreck = placeWreck(world, rng, { here });
    if (!pick.wreck) return null;
  }
  world.sideQuest = pick;
  noteRecent(recent, 'kind', k, now);
  const ship = pick.drifter?.code ?? pick.wreck?.code;
  if (ship) noteRecent(recent, 'ship', ship, now, Q().mix.asked);
  world.emit('questOffered', { questId: pick.id, kind: pick.kind });
  return pick;
}

// ------------------------------------------------------------------------------------------- the drifting pilot

export const DRIFTER_ID = 'drifter';

// The drifting pilot of a rescue quest where it is, in this sector's units, or null when it is elsewhere or none.
export function drifterHere(world) {
  const d = world.sideQuest?.drifter;
  if (!d || world.sideQuest.helped || d.sectorId !== world.sector.id) return null;
  return { id: DRIFTER_ID, x: d.x * world.width, y: d.y * world.height, angle: d.angle, code: d.code ?? DRIFTER_FALLBACK, paint: d.paint ?? null };
}
// A drifter made before it had a ship (a check's, a lab's) is a TAXI.
const DRIFTER_FALLBACK = 'N15';

// The craft a pilot out of fuel is drawn as (its ship's own drawing and scale, in the paint it was drawn in) and the footprint of
// its menu.
export const drifterCraft = (d) => npcCraft(d.code ?? DRIFTER_FALLBACK, npcPalette(d.code ?? DRIFTER_FALLBACK, d.paint));
export function drifterArt(d) {
  const c = drifterCraft(d);
  return { model: { width: c.rows[0].length, height: c.rows.length }, scale: c.scale, turns: true };
}

// Giving it fuel: refused when the tank does not hold it; else the tank gives it, and the pilot's thanks wait beside it in its
// window until the quest is handed in (`handInDrifter`). Its thanks were a hail that faded as it flew off, gone before they
// were read (SX, 2026-10-02: «дизалоги с нпс они иногда после квеста уездают и ты не успеваешь прочитать что они сказали,
// давай чтобы завершить надо вернуться к нпс и поговорить типо 1 сдать задание ... кликом можно закрыть диалог и сдать
// заданее»; NPC_DIALOG_HANDOFF.md).
export function helpDrifter(world) {
  const C = Q().rescue, s = world.sideQuest, here = drifterHere(world);
  if (!here || s.fueled) return false;
  if (world.fuel < C.fuel) { world.emit('actionRefused', { reason: `NEED ${C.fuel} FUEL` }); return false; }
  world.fuel -= C.fuel;
  s.fueled = true;
  s.thanks = sayFor(world, 'rescue', 'thanks', here.code);
  return true;
}
// Handing it in (its window's HAND IN): the wallet is paid, the quest is done, the pilot flies off.
export function handInDrifter(world) {
  const C = Q().rescue, s = world.sideQuest, here = drifterHere(world);
  if (!here || !s.fueled) return false;
  const pay = payFor('rescue', world.ledger.restored.size);
  world.ledger.credits += pay;
  s.helped = true;
  world.questOutcomes.set(s.id, 'done');
  world.sideQuest = null;
  restSide(world);
  world.selectedId = null;
  world.drifterLeaving = { x: here.x, y: here.y, angle: here.angle, t: 0, code: here.code, paint: here.paint };
  world.emit('drifterHelped', { fuel: C.fuel, pay, credits: world.ledger.credits, x: here.x, y: here.y, sectorId: world.sector.id });
  world.fleet?.helped?.(here.code);     // it remembers, and owes the pilot a favor (src/npcTalk.js)
  return true;
}

// Quests in four colours (SX, 2026-10-02: «квесты давай красные зеленые синие и желтые»; the whole of it in
// QUESTS_V2_HANDOFF.md): red, pirates (a raid on a station, and to come, a few of them pestering a small ship); yellow,
// a ship in trouble given something of the pilot's own (fuel to one run dry, and to come, money to one wrecked); green,
// the quests near the story that lead the pilot into the game's ways (a cache within the wallet's reach, a ruin to fund,
// a signal heard on the radio); blue, an errand for a ship or a planet (another pilot's lost cargo brought home, and to
// come, the planets' own requests). A quest's `tone` is one of these; the list and the pointer take their ink from it.
// Since the second round: a ship pestered by pirates is red (it carries its own `tone`: it is not a side quest), a wrecked
// ship asked for money is yellow, and a planet's errand is blue. Since SX's Q1 STORY PURPLE (2026-10-05, «квесты Q1 P1»): the
// story is purple, `story` (the radio's guide here, the opening chapter's objective in src/opening.js), and the reference ships'
// `special` with it; the inks are src/roles.js QUEST_INKS. Since 2026-10-08 the yellow ones (a pilot out of fuel, a wrecked ship asking
// for money) are blue (SX: «бежевые квесты должны быть синие»: the amber read as beige); the yellow is the radio's for a quest come. The
// freight hint (2026-10-09, SX: «присылай квест синий что есть груз») is blue: a station with a job to take. Since 2026-10-22 the green ones are
// blue too, and a ruin to restore is the story's (SX, on labs/graphics/sketches/quest-tones.html: «вот эти два можно объединить и в синий ...
// квест Restore я бы делал фиолетовым, да, потому что это как бы для продвижения по сюжету важно»): a cache and a signal blue, a restoration
// purple; green stays the cargo's clock and a quest done.
export const QUEST_TONE = Object.freeze({ raid: 'red', pester: 'red', guide: 'story', rescue: 'blue', wreck: 'blue', find: 'blue', rebuild: 'story', signal: 'blue', stranger: 'blue', planet: 'blue', freight: 'blue', special: 'special' });
export const questTone = (q) => q?.tone ?? (q?.kind === 'raid' ? 'red' : 'green');

// The quest's words: its kind's.
function sideQuest(world) {
  const q = sideQuestWords(world);
  return q && { ...q, tone: QUEST_TONE[world.sideQuest.kind] ?? 'green', sideKind: world.sideQuest.kind };
}
function sideQuestWords(world) {
  const s = world.sideQuest;
  if (!s) return null;
  if (s.kind === 'wreck') return wreckWords(world, s);
  if (s.kind === 'planet') return errandWords(world, s);
  if (s.kind === 'freight') return freightWords(world, s);
  if (s.kind === 'find') {
    // Where it was laid for this pilot (src/cachePlaces.js), not the catalogue's place.
    const f = placedFind(findDef(s.findId, world.ledger), world.ledger);
    if (!f) return null;
    const what = f.kind === 'paint' ? 'PAINT' : 'SOUVENIR';
    const sector = sectorById(f.sector)?.label ?? '';
    // Closed, the cache is only its kind (SX, 2026-10-09: «в квестах про лутбоксы не подписывай, что внутри ... это должен быть
    // сюрприз»); what it held is said when it is opened (the done row).
    return {
      id: s.id, kind: 'side', title: QL.find.title(what), sub: QL.find.sub(sector), pointer: 'CACHE',
      target: { sectorId: f.sector, x: f.x, y: f.y, findId: f.id, mark: f.id, reach: CONFIG.cache.interactRadius },
      done: [QL.find.done(findLabel(f)), QL.find.doneSub(what)],
    };
  }
  if (s.kind === 'signal') {
    const sig = SIGNALS.find((x) => x.id === s.signalId);
    if (!sig) return null;
    const sector = sectorById(sig.sector);
    const near = (sector?.stations ?? []).reduce((best, t) => {
      const d = Math.hypot(t.x - sig.x, t.y - sig.y);
      return !best || d < best.d ? { t, d } : best;
    }, null);
    const newWord = WORDS.some((w) => !world.collection?.words?.has(w.id));
    return {
      id: s.id, kind: 'side', title: near ? QL.signal.titleNear(near.t.label) : QL.signal.titleIn(sector?.label ?? ''),
      sub: newWord ? QL.signal.newWord(sector?.label ?? '') : QL.signal.tuneIn(sector?.label ?? ''), pointer: 'SIGNAL',
      target: { sectorId: sig.sector, x: sig.x, y: sig.y, signalId: sig.id, mark: sig.id, reach: CONFIG.signal.reach },
      done: [QL.signal.done(), newWord ? QL.signal.doneWord() : QL.signal.doneAll()],
    };
  }
  if (s.kind === 'stranger') {
    const st = STRANGERS.find((x) => x.id === s.strangerId);
    if (!st) return null;
    const to = stationDefById(st.contract.to);
    const sector = sectorById(st.sector)?.label ?? '';
    return {
      id: s.id, kind: 'side', title: QL.stranger.title(st.author), sub: QL.stranger.sub(sector, st.contract.label), pointer: 'CARGO',
      target: { sectorId: st.sector, x: st.x, y: st.y, contractId: st.contract.id, mark: `stranger:${st.id}`, reach: CONFIG.stranded.interactRadius },
      done: [QL.stranger.done(), QL.stranger.doneSub(to?.label ?? 'ITS STATION')],
    };
  }
  if (s.kind === 'rescue') {
    const d = s.drifter, sector = sectorById(d.sectorId)?.label ?? '';
    return {
      id: s.id, kind: 'side', title: QL.rescue.title(), sub: s.fueled ? QL.rescue.handIn(sector) : QL.rescue.bring(sector, Q().rescue.fuel), pointer: 'PILOT',
      // (Its pointer over the ship, not on it: SX, 2026-10-16, «если метка стоит на NPC, то она прямо посередине его корабля ... чуть-чуть
      // поодаль ... чтобы его рисунок не закрывала метка»; a wreck's and a pestered ship's have their `lift`, src/navigation.js.)
      target: { sectorId: d.sectorId, x: d.x, y: d.y, mark: DRIFTER_ID, reach: CONFIG.stranded.interactRadius, lift: 110 },
      done: [QL.rescue.done(), QL.rescue.paid(formatCR(payFor('rescue', world.ledger.restored.size)), sector)],
    };
  }
  const def = stationDefById(s.stationId);
  if (!def) return null;
  return {
    id: s.id, kind: 'side', title: QL.restore.title(def.label),
    sub: QL.restore.sub(def.sectorLabel, formatCR(stillToInvest(world.ledger, def))), pointer: def.label,
    target: { sectorId: def.sectorId, x: def.x, y: def.y, stationId: def.id, mark: def.id },
    done: [QL.restore.done(def.label), QL.restore.doneSub()],
  };
}

// The list as it stands: the red ones first (the raid, a ship pestered), then the side quest, then the radio's step, then the opening
// chapter's objective (src/opening.js: while it runs the radio's step waits, so the two are never on together).
export function currentQuests(world) {
  return [raidQuest(world), pesterQuest(world), bossQuestRecord(world), specialQuest(world), chorusRecord(world), sideQuest(world), guideQuest(world), supportQuest(world), openingQuest(world)].filter(Boolean);
}

// Whether a world event is the very thing the side quest on asked for (its cache opened, its signal tuned in, its ruin restored,
// its stranger's cargo taken, a job taken for the freight hint), read at the event, before the quest's look names it done (every `checkEvery` s): the page lets
// the notice for it stand longer (labs/graphics/notice.js QUEST_NOTICE).
export function endsQuest(world, e) {
  const s = world.sideQuest;
  if (!s) return false;
  switch (e.type) {
    case 'cacheOpened': case 'paintFound': return s.kind === 'find' && s.findId === e.cacheId;
    case 'signalHeard': return s.kind === 'signal' && s.signalId === e.signalId;
    case 'stationRestored': return s.kind === 'rebuild' && s.stationId === e.stationId;
    case 'cargoRecovered': return s.kind === 'stranger' && s.contractId === e.contractId;
    case 'contractAccepted': return s.kind === 'freight';
    default: return false;
  }
}

// A quest's words on its pointer (P3 KIND + CLOCK): its kind's word (RAID, HELP, PLANET ... or QUEST) and, when it has
// one, its clock. The side quests name what they lead to: CACHE, SIGNAL, CARGO, PILOT, a ruin's own name (Codex's text pass QD01,
// 2026-10-16); QUEST is left for a quest with no word of its own.
export function questPointerLabel(q, clock) {
  const word = q.pointer ?? (q.kind === 'raid' ? 'RAID' : 'QUEST');
  return q.ends != null ? `${word}  ${clockText(Math.ceil(Math.max(0, q.ends - clock)))}` : word;
}
