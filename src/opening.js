import { CONFIG } from './config.js';
import { START_STATIONS, stationDefById, sectorById, startRuinOf } from './sectors.js';
import { formatCR, INVEST_STEPS, guardSize } from './ruins.js';
import { findsFor, findDef, isAvailable, placedFind, findTitle, FREE_WORDS } from './rewards.js';
import { openingContract, openingJobId, isOpeningJob, quoteJob, jobQuote, parTime, clockText, cargoOf } from './contracts.js';
import { LOANER, flyingLoaner } from './loaner.js';
import { shipById, shipModel } from './hangar.js';
import { QUEST_LINES as QL } from './questLines.js';
import { CLAIM, earnWaiver, payCash } from './rewardLedger.js';

// The opening chapter, slices 1 to 5 (codex/start-and-narrative/HANDOFF.md section 6, CAMPAIGN.md 01-16; SX's answers on
// labs/graphics/sketches/economy-decisions.html, 2026-10-04: 7A the chapter's 15 steps whole, N1 to the first cache; 8A the loaner
// SCOOTY JR. and its mechanic SCOOTY; 3B a short braking practice in the first leg; 9A the first souvenir a free claim, no cash thanks:
// the chapter's cache opens for 0 CR, SX's answer of 2026-10-04; since 2026-10-08 it is the first claim of the reward ledger,
// `intro-souvenir`, src/rewardLedger.js; 10A old saves keep everything, SCOOTY JR. never appears for them).
//
// A new pilot leaves HOME in SCOOTY JR. (src/loaner.js) while their own shuttle is in service at A, the working start station
// nearest HOME; docks there, hands the loaner back and boards their own shuttle, its radio repaired for free; hears the first call;
// is fitted with the locator and the map at A's dispatch, which mark B, the other working start station; takes a small first
// freight to B with a generous target time and a receipt that tells the time it took; refuels at B; and opens the sealed cache C a
// receiver at B marks, the nearest souvenir cache that can be opened, free. Slice 3 (chat N2 part 1, 2026-10-08): the pilot takes the
// souvenir back to B, where the shelf is fitted and shown (a row of B's menu, so the pilot's own act is the beat), looks at the pilot
// card if they like, and takes the return freight to A, with fewer words than the first. Slices 4 and 5 (chat N2 part 2, 2026-10-08)
// are the reason for the work: A tells of the old station, the pilot's own broken first station R (the start ruin), and a row of A's
// menu marks it; the pilot flies to R and beats the pirates sitting on it (the short shooting practice, SX's 3B, is the hint on the way
// in: the guards are its natural place), puts the first money in, meets the repair droid that holds clear of the station (a hull
// check: a sound hull is a finished lesson, a mend is the pilot's to buy), and then works for the rest of R's price as they choose,
// the freight and the calls open to them as anywhere, until it is restored; the chapter then rests (REST). The stages, in order:
//
//   loaner   in SCOOTY JR., to A; the braking practice on the way          service  close by A: BOARD MY SHUTTLE
//   call     the first call: GET THE DELIVERY DETAILS at A                freight  locator and map fitted: ACCEPT the first freight
//   deliver  the first freight to B (the cargo is the objective)          fuel     refuel close by B (a full tank is enough)
//   cache    open the cache C, for 0 CR                                     shelf    bring the souvenir to B: FIT THE SHELF (the shelf is shown)
//   look     open the pilot card (optional: the return load skips it)       load     close by B: ACCEPT the return load
//   haul     the return load to A (the cargo is the objective)              ruin     close by A: ABOUT <R> (R is told of and marked)
//   guards   R's pirates, to beat (the firing hint on the way in)           fund     put the first money into R
//   repair   meet the repair droid at R (a check of the hull)               work     reopen R: the rest of its price, as the pilot likes
//   board    R is restored: the chapter rests (REST)
//
// Already-satisfied steps are acknowledged, never made again (HANDOFF section 4.7): R told of with its pirates already beaten goes on
// at the first money, one already funded at the work, one already restored at the end; a hull that needs no mend is the droid's finished
// lesson; nothing forces a fight, a purchase or a mend. The pirates come back `CONFIG.raids.guardsEvery` s after they were beaten
// (SX, 2026-10-06; every ruin's, SX, 2026-10-08), so the objective says so when they are back, in whatever stage the pilot is.
//
// No step asks the pilot to dock (SX, 2026-10-06: «не заставляй швартоваться и докаться внутри станции во время квестов»): each is done
// from the station's menu close by (`closeBy`: within its menu's reach, as the selection reads it, src/interaction.js), docked or not;
// B's menu sells the fuel close by while the fuel stage runs; R's rows (a ruin cannot be docked at) are the ruin's own.
//
// One objective at a time, on the selected-task state chat B built (src/tasks.js): the stage's objective is a quest of the list
// (`openingQuest`, selected as it comes), so the plate, the top banner, the in-flight bearing (with its course round what is in the
// way, src/course.js), the locator and the map all lead to the same target; while the first freight is carried the cargo is that
// objective. The words at A are its people's, in A's menu (a dialog window: SCOOTY the mechanic, then A's dispatch); B's are radio
// lines (`openingCall`). Nothing the chapter says is a key's name: it names the action (the keys come from src/controls.js, chat C).
//
// While the guided stretch runs (to the first delivery) nothing else asks for the pilot's attention: no droid comes, no side quest is
// offered; and until the chapter rests (REST) the radio's old line (src/guide.js) waits, so there is never a second tutorial
// beside this one. The dangers are not held: pirates find the pilot from the start's first minute (CONFIG.pirates.firstDelay), a patrol
// of two till the first delivery (CONFIG.pirates.patrol), and the ruins' guards gather, as anywhere (SX, 2026-10-04, of N1's calm: «не надо тихих участков»; it held both to the first delivery until
// then). Freight offers are the chapter's until the first delivery is done. The two
// radio bonuses the old line paid for the same two acts (the first delivery, the first souvenir: CONFIG.quests.guide.pay) are paid
// here at those moments, once each, as claims of the reward ledger (`guide-first-run`, `guide-first-souvenir`: the credit and the
// record in one step, so a reload or a repeated call pays nothing twice), so a new pilot's money is what the economy modelled
// (codex/economy-2026-10-03 simulator.mjs counts the guide's pays); no other money is added (ALIGNMENT.md: never stack the
// narrative's cash aid on the economy's claims). Slices 4 and 5 pay the radio's three other thanks for the acts they ask of the pilot the
// same way (the guards beaten 100, the first money in 50, the station restored 200: `guide-the-guards`, `guide-first-coins-in`,
// `guide-rebuild`), once each, for the stage the pilot passes by their own act; a stage already satisfied is acknowledged and unpaid
// (the economy's rule: a step done before its plate came is unpaid).
//
// The record (HANDOFF section 3: only what cannot be read again from the world), saved as `opening` (save v17, src/storage.js):
//   { version, status, stage, a, b, c, braked, receipt, fuel, fired, repair }
//   status   'active' (a new pilot), 'veteran' (a save from before the chapter: everything it has stands, the chapter shows nothing
//            and the old radio line goes on as the quiet hint, SX's 10A), 'skipped' (the page asked to skip it: the start as it was,
//            but for the radio, which such a pilot earns with the next quest handed in: src/questHooks.js giveRadio)
//   a, b     the two stations bound at the start; c the cache bound when the cache stage begins; braked the practice done;
//            receipt the first freight's { elapsed, par, onTime }; fuel how the fuel stage ended ('bought' or 'full')
//   fired    the shooting practice done (v24); repair how the lesson at the droid ended ('sound', 'checked' or 'served'; v24)
// Everything else is read from the world: the loaner is out while the stage is `loaner` or `service` (and its chassis is on); the
// locator and the map are fitted from `freight`; the shelf from `look`; the first freight is the ledger's (`opening:<a>:<b>`), the
// return load its mirror (`opening:<b>:<a>`); R is the start ruin (`startRuinOf`), what is put into it and whether its pirates are down
// the ledger's. The radio is the pilot's own (Pilot.radio, saved with the card), given at BOARD MY SHUTTLE.
// What the chapter has paid or promised is the reward ledger's (src/rewardLedger.js): the free first souvenir, the radio's thanks.

export const OPENING_VERSION = 1;
export const STAGES = Object.freeze(['loaner', 'service', 'call', 'freight', 'deliver', 'fuel', 'cache', 'shelf', 'look', 'load', 'haul',
  'ruin', 'guards', 'fund', 'repair', 'work', 'board']);
// Where the chapter rests: R restored, the new board the pilot's. A chapter at REST asks nothing of the pilot.
export const REST = 'board';
const STATUSES = Object.freeze(['active', 'veteran', 'skipped']);
const REPAIRS = Object.freeze(['sound', 'checked', 'served']);
const at = (stage) => STAGES.indexOf(stage);

// The braking practice (SX's 3B): once the ship has gone `arm` u/s, the objective asks for the brake; held to under `stop` u/s, it is
// done. It never blocks anything: a pilot who never flies that fast, or docks without it, goes on. And the firing practice (3B's other
// half, slice 4): on the way in to R's pirates, within `reach` u of the station, the objective asks to aim and fire until the ship has
// fired `shots` times; their squad circles without a care until the ship comes within CONFIG.pirates.guard.wake, so the first shots
// are the practice of a quiet minute. It never blocks anything either.
export const PRACTICE = Object.freeze({ arm: 300, stop: 40, fire: Object.freeze({ reach: 2000, shots: 3 }) });

// What the ship has to be for the fight, said by A as the pilot asks (a pilot below it is told to mend and refuel first, never stopped),
// the seconds the contact's window is up before the hull check counts as made, how long the contact waits after the first money before it
// comes (a beat of its own), and the time the contact's spawn is tried again after it found no ground.
export const READY = Object.freeze({ hull: 0.7, fuel: 0.4 });
export const CONTACT = Object.freeze({ look: 0.8, after: 5, retry: 2 });

// ------------------------------------------------------------------------------------------------ the record

// The chapter's record when it is a new pilot's and running, else null.
const running = (world) => (world?.opening?.status === 'active' ? world.opening : null);
export const openingStage = (world) => running(world)?.stage ?? null;

// A and B for the pilot's start ruin (`ledger`'s, src/sectors.js START_STATIONS: one of the three is his ruin): A the working one
// nearest HOME, B the other. Null when the catalogue does not give two (never, for the game's three).
export function openingRoles(ledger) {
  const grid = (def) => { const s = sectorById(def.sectorId); return { x: s.col + def.x, y: s.row + def.y }; };
  const home = grid(stationDefById(CONFIG.home.id));
  const away = (def) => { const p = grid(def); return Math.hypot(p.x - home.x, p.y - home.y); };
  const working = START_STATIONS.map((id) => stationDefById(id, ledger)).filter((d) => d && d.kind !== 'ruin').sort((p, q) => away(p) - away(q));
  return working.length >= 2 ? { a: working[0].id, b: working[1].id } : null;
}

// A new pilot's start (the page calls it once, after the deal and the start ruin are rolled): the roles bound, SCOOTY JR. on, its tank
// and hull full. Returns the record.
export function beginOpening(world) {
  const roles = openingRoles(world.ledger);
  if (!roles) return skipOpening(world);
  world.opening = { version: OPENING_VERSION, status: 'active', stage: 'loaner', a: roles.a, b: roles.b, c: null, braked: false, receipt: null, fuel: null,
    fired: false, repair: null };
  putOnLoaner(world);
  world.hull = world.hullMax;
  world.fuel = world.fuelTank;
  return world.opening;
}
// The start as it was before the chapter (the page's hook for the golden master's scenarios and, later, a SKIP INTRO): no loaner,
// everything fitted but the radio (the next quest handed in gives it), the old radio line.
export function skipOpening(world) {
  world.opening = { version: OPENING_VERSION, status: 'skipped' };
  return world.opening;
}

// What the save keeps (World.snapshot), or null for a world with no chapter (a check's, a tool's).
export function openingToJSON(world) {
  const r = world.opening;
  if (!r) return null;
  if (r.status !== 'active') return { version: r.version, status: r.status };
  return { version: r.version, status: r.status, stage: r.stage, a: r.a, b: r.b, c: r.c, braked: r.braked, receipt: r.receipt ? { ...r.receipt } : null,
    fuel: r.fuel, fired: r.fired, repair: r.repair };
}

// A save's record, untrusted (World.restore, after the ledger, the catalogue and the flown ship are in place): a running chapter whose
// stations are not the two working start stations of this pilot, whose stage or cache is not one this build knows, is read as a
// veteran's (nothing is taken: everything is fitted, the radio as the pilot owns it, the old radio line runs). `saved` is the save's
// hull and tank, held to SCOOTY JR.'s when the loaner is out. A save without a record (v17 of a world with none) has none.
export function restoreOpening(world, raw, saved = {}) {
  world.opening = readOpening(raw, world.ledger);
  if (!loanerOut(world)) return world.opening;
  putOnLoaner(world);
  world.hull = Number.isFinite(saved.hull) ? Math.min(Math.max(1, saved.hull), world.hullMax) : world.hullMax;
  world.fuel = Number.isFinite(saved.fuel) ? Math.min(Math.max(0, saved.fuel), world.fuelTank) : world.fuelTank;
  return world.opening;
}
function readOpening(raw, ledger) {
  if (raw === null || raw === undefined) return null;
  const veteran = { version: OPENING_VERSION, status: 'veteran' };
  if (typeof raw !== 'object' || raw.version !== OPENING_VERSION || !STATUSES.includes(raw.status)) return veteran;
  if (raw.status !== 'active') return { version: OPENING_VERSION, status: raw.status };
  const roles = openingRoles(ledger);
  if (!roles || raw.a !== roles.a || raw.b !== roles.b || !STAGES.includes(raw.stage)) return veteran;
  const c = typeof raw.c === 'string' && findDef(raw.c, ledger)?.kind === 'souvenir' ? raw.c : null;
  const t = raw.receipt;
  const receipt = t && Number.isFinite(t.elapsed) && t.elapsed >= 0 && Number.isFinite(t.par) && t.par > 0
    ? { elapsed: t.elapsed, par: t.par, onTime: t.elapsed <= t.par } : null;
  return { version: OPENING_VERSION, status: 'active', stage: raw.stage, a: raw.a, b: raw.b, c, braked: raw.braked === true, receipt,
    fuel: raw.fuel === 'bought' || raw.fuel === 'full' ? raw.fuel : null,
    fired: raw.fired === true, repair: REPAIRS.includes(raw.repair) ? raw.repair : null };
}

// ------------------------------------------------------------------------------------------------ what the rest reads

// SCOOTY JR. is out (flown, and in the save) while the pilot has not yet boarded their own shuttle.
export const loanerOut = (world) => { const s = openingStage(world); return s === 'loaner' || s === 'service'; };
// The radio is the pilot's own once given (SX, 2026-10-05: «Виджет радио появляется только когда тебе радио выдают с квестами»): a new
// pilot's with the shuttle, at the first call (boardShuttle); a pilot with no running chapter (a veteran, a skipped start, a check's
// world) has none until the next quest handed in (src/questHooks.js giveRadio). The locator and the map from the delivery details; a
// pilot with no running chapter has those, as before the chapter.
export const radioFitted = (world) => world?.pilot?.radio === true;
export const navFitted = (world) => { const s = openingStage(world); return s === null || at(s) >= at('freight'); };
// What of the interface the chapter has given, panel by panel: the page draws these and nothing else (SX, 2026-10-04, after playing
// slices 1-2: «у меня сразу был открыт весь интерфейс, за квесты его не выдавали»; until then only the locator and the map waited, and
// the pilot's whole cockpit, the quest list and the souvenir shelf stood from the first frame).
//   cockpit  'loaner' SCOOTY JR.'s own (labs/graphics/scooty-deck.js) while the loaner is out, then 'own': the pilot's, with their shuttle
//   radio    owned (radioFitted): from the first call   column  the locator and its legend, from the delivery details
//   map      with the column (TAB)                     shelf   the souvenir shelf, fitted at B (stage `look`), whatever the pilot owns
//   quests   the quest list, from the first frame (SX, 2026-10-06: «основную линейку фиолетовых квестов выносить сбоку сразу»: the
//            chapter's objective on the side at once, where the locator will come; it waited for the column until then)
// The objective is never hidden: the top banner and the bearing in the sky say it from the first frame. A pilot with no running
// chapter (a veteran, a skipped start, a check's world) has everything but the radio until a quest gives it.
export function interfaceGiven(world) {
  const s = openingStage(world), radio = radioFitted(world);
  if (s === null) return { cockpit: 'own', radio, column: true, quests: true, map: true, shelf: true };
  const nav = at(s) >= at('freight');
  return { cockpit: loanerOut(world) ? 'loaner' : 'own', radio, column: nav, quests: true, map: nav,
    shelf: at(s) > at('shelf') };
}
// The guided stretch, to the first delivery: no droid or side quest asks for the pilot meanwhile (pirates and guards are not held; the
// pirates come as a patrol of two, World.stepEncounters).
export const openingCalm = (world) => { const s = openingStage(world); return s !== null && at(s) <= at('deliver'); };
// Whether the pilot's next thing may be to put money into a ruin: no chapter is running (a veteran, a skipped start, a check's world), or it
// has come to the first money (`fund`, then `repair` and `work`, and `board` at rest). Before it the next thing is the ruin's pirates or the
// chapter's own freight, and the freight hint (src/freight.js) keeps out of the way.
export const openingFunding = (world) => { const s = openingStage(world); return s === null || at(s) >= at('fund'); };
// The old radio line (src/guide.js) waits while the chapter runs: one tutorial at a time.
export const openingHoldsGuide = (world) => { const s = openingStage(world); return s !== null && s !== REST; };
// Why the hangar will not change ships now, or null: SCOOTY JR. is not the pilot's to swap, and their own shuttle is at A.
export function openingHangarBar(world) {
  if (!loanerOut(world) && !flyingLoaner(world)) return null;
  return `YOUR SHUTTLE IS AT ${stationDefById(world.opening?.a)?.label ?? 'THE SERVICE BERTH'}`;
}

// The first freight, A to B (src/contracts.js `opening:<a>:<b>`): small, its own goods, a generous target time. And the return load,
// B to A (`opening:<b>:<a>`, slice 3): the same rule, B's own goods, the same forgiving target (CAMPAIGN 09: «keep a forgiving authored
// time target for this second compulsory job»).
export const openingJob = (world) => { const r = running(world); return r ? openingContract(openingJobId(r.a, r.b)) : null; };
export const returnJob = (world) => { const r = running(world); return r ? openingContract(openingJobId(r.b, r.a)) : null; };

// ------------------------------------------------------------------------------------------------ the flight

const label = (id) => stationDefById(id)?.label ?? '';
// The ship close by the station `id`: docked there, or up and within its menu's reach (its interactRadius, src/interaction.js).
export function closeBy(world, id) {
  if (world.docked === id) return true;
  const s = world.stations?.find((x) => x.id === id);
  if (!s || !world.ship.alive) return false;
  const d = world.delta(s.x, s.y, world.ship.x, world.ship.y);
  return Math.hypot(d.x, d.y) <= s.interactRadius;
}
function putOnLoaner(world) {
  world.ship.setChassis(LOANER.chassis);
  const model = shipModel(LOANER.id);
  if (model) { model.scale = model.baseScale ?? model.scale; world.ship.setModel(model); }
}
function setStage(world, stage) {
  const r = running(world);
  if (!r || r.stage === stage) return;
  const from = r.stage;
  // The objective that ends is done (the quest list turns its plate green with its words); the pilot card, optional, that the return
  // load skipped is not: its plate just goes.
  if (OBJECTIVES[from] && !(from === 'look' && stage === 'haul')) world.questOutcomes.set(questId(from), 'done');
  r.stage = stage;
  // The guided stretch over: a droid comes no sooner than CONFIG.droids.first s from now, as after a load (pirates were never held).
  if (at(from) <= at('deliver') && at(stage) > at('deliver')) world.droidIn = Math.max(world.droidIn ?? 0, CONFIG.droids.first);
  world.emit('openingStage', { stage, from });
}
// One of the old radio line's pays, for the act it was for (CONFIG.quests.guide.pay), once: a claim of the reward ledger, paid as
// its stage is passed. The wallet and the claim change together; a second call pays nothing and says nothing.
const PAY_CLAIM = Object.freeze({ 'first-run': CLAIM.firstRun, 'a-souvenir': CLAIM.firstSouvenir, 'the-guards': CLAIM.guards, 'first-coins-in': CLAIM.firstCoins,
  rebuild: CLAIM.rebuild });
function payRadio(world, step) {
  const pay = CONFIG.quests.guide.pay[step] ?? 0;
  if (pay <= 0) return;
  const res = payCash(world.ledger, PAY_CLAIM[step], pay);
  if (!res.ok || res.alreadySettled) return;
  world.emit('guidePaid', { step, pay, credits: world.ledger.credits, x: world.ship.x, y: world.ship.y, sectorId: world.sector.id });
}
const tankFull = (world) => Math.floor(world.fuelTank - world.fuel) <= 0;
// Whether the pilot has opened a souvenir cache (the ledger's finds). A plain loop: it runs in the cache stage's step.
function ownsSouvenir(L) {
  for (const f of L.found.values()) if (f.kind === 'souvenir') return true;
  return false;
}

// Every step of the world (World.step): the braking practice, and the stages the world itself moves on (docked at A, the freight
// accepted or lost, the tank full at B, the cache opened). The moves made by a menu's row are its own (boardShuttle, takeDetails).
// `state` is the step's memory that no save needs: whether the practice is armed, the tank when the ship came close by B, whether the
// finds hold a souvenir, and the two freights' ids (made once: a string made every step is garbage).
export function stepOpening(world) {
  const r = running(world);
  if (!r) return;
  const ship = world.ship, L = world.ledger, state = (world.openingState ??= { armed: false, dockFuel: null, foundSize: -1, owned: false, firstId: openingJobId(r.a, r.b),
    returnId: openingJobId(r.b, r.a), shots: 0, cooldown: 0, approached: false, lookAt: null, contactAt: 0, contactSaid: false });
  switch (r.stage) {
    case 'loaner': {
      const speed = Math.hypot(ship.vx, ship.vy);
      if (!r.braked && ship.alive && !world.docked) {
        if (speed >= PRACTICE.arm) state.armed = true;
        if (state.armed && ship.braking && speed <= PRACTICE.stop) { r.braked = true; world.emit('openingPractice', { what: 'brake' }); }
      }
      if (closeBy(world, r.a)) setStage(world, 'service');
      break;
    }
    case 'freight': {
      const id = state.firstId;
      if (L.active?.id === id) setStage(world, 'deliver');
      // Delivered some other way already (a save of an older chapter): the delivery's stage is passed.
      else if (L.completed.has(id)) settleDelivery(world, null);
      break;
    }
    case 'deliver': {
      const id = state.firstId;
      if (L.completed.has(id)) settleDelivery(world, null);
      // Neither carried, nor lying in space, nor delivered: it went back to A (CONFIG.stranded.returnAfter), and A offers it again.
      else if (L.active?.id !== id && !L.stranded.has(id)) setStage(world, 'freight');
      break;
    }
    case 'fuel': {
      if (!closeBy(world, r.b)) { state.dockFuel = null; break; }
      state.dockFuel ??= world.fuel;
      if (!tankFull(world)) break;
      r.fuel = Math.floor(world.fuelTank - state.dockFuel) > 0 ? 'bought' : 'full';
      beginCache(world, r);
      break;
    }
    case 'cache': {
      // (scanned when the finds change, not every step)
      if (state.foundSize !== L.found.size) { state.foundSize = L.found.size; state.owned = ownsSouvenir(L); }
      if (state.owned) {
        // The souvenir is theirs; B asks for it back to fit the shelf (the radio's thanks for it come with the shelf).
        setStage(world, 'shelf');
        world.emit('openingCall', { who: `${label(r.b)} RECEIVING`, line: "KEEP IT. BRING IT BACK: WE'LL FIT A SHELF." });
        break;
      }
      // The cache bound is gone some other way (not opened by this pilot): another, the nearest that can be opened, or none.
      if (!r.c || !isAvailable(findDef(r.c, L), L)) bindCache(world, r);
      break;
    }
    // The return load: accepted at B whether or not the card was looked at.
    case 'look': case 'load': {
      const id = state.returnId;
      if (L.active?.id === id) setStage(world, 'haul');
      else if (L.completed.has(id)) settleReturn(world, null);
      break;
    }
    case 'haul': {
      const id = state.returnId;
      if (L.completed.has(id)) settleReturn(world, null);
      // Neither carried, nor lying in space, nor delivered: it went back to B (CONFIG.stranded.returnAfter), and B offers it again.
      else if (L.active?.id !== id && !L.stranded.has(id)) setStage(world, 'load');
      break;
    }
    // Slices 4 and 5: the ruin R (its row at A is the pilot's, askAboutRuin; the rest is read from the world).
    case 'ruin':
      if (L.restored.has(ruinOf(world))) finishRestored(world, r);
      break;
    case 'guards': {
      const id = ruinOf(world);
      if (L.restored.has(id)) { finishRestored(world, r); break; }
      if (guardsDown(L, id)) {
        payRadio(world, 'the-guards');
        setStage(world, putIn(L, id) > 0 ? 'work' : 'fund');
        break;
      }
      stepApproach(world, r, state);
      break;
    }
    case 'fund':
      if (L.restored.has(ruinOf(world))) finishRestored(world, r);
      else if (putIn(L, ruinOf(world)) > 0) afterFirstMoney(world, r, state);
      break;
    case 'repair':
      if (L.restored.has(ruinOf(world))) finishRestored(world, r);
      else lookAtContact(world, r, state);
      break;
    case 'work':
      if (L.restored.has(ruinOf(world))) finishRestored(world, r);
      break;
    default: break;
  }
}

// The first freight delivered (World.deliver calls it with the ledger's answer; stepOpening with none, for a save that already has it):
// the receipt kept, B's words, the old line's pay for a first delivery, the fuel stage.
export function settleDelivery(world, res) {
  const r = running(world);
  if (!r || at(r.stage) > at('deliver')) return;
  if (res && !res.alreadySettled && res.timing) r.receipt = { elapsed: res.timing.elapsed, par: res.timing.par, onTime: res.timing.elapsed <= res.timing.par };
  setStage(world, 'fuel');
  payRadio(world, 'first-run');
  const b = label(r.b);
  world.emit('openingCall', { who: `${b} RECEIVING`, line: r.receipt && !r.receipt.onTime ? 'CARGO RECEIVED. LATE PAYS LESS. TOP UP HERE.'
    : 'FIRST RUN DONE. ON TIME, TOO. TOP UP HERE.' });
}
// The return load delivered at A (World.deliver calls it, stepOpening with none for a save that already has it): A says so, truthfully,
// and the chapter goes on at the ruin (slice 4): A's window tells of the old station, and its row is the pilot's ask. The receipt is the
// delivered card's (its time and its target); the words are A's, one line, and the beat of the ask is the pilot's own.
export function settleReturn(world, res) {
  const r = running(world);
  if (!r || at(r.stage) < at('look') || at(r.stage) > at('haul')) return;
  const onTime = res?.timing ? res.timing.elapsed <= res.timing.par : true;
  setStage(world, 'ruin');
  world.emit('openingCall', { who: `${label(r.a)} DISPATCH`, line: onTime ? 'RETURN LOAD IN. ON TIME AGAIN.' : 'RETURN LOAD IN. LATE PAYS LESS. NEXT ONE.' });
}
// World.deliver's hook: only the chapter's own freight, the first or the return.
export function openingDelivered(world, job, res) {
  const r = running(world);
  if (!r || !res?.ok || !isOpeningJob(job?.id)) return;
  if (job.id === openingJobId(r.a, r.b)) settleDelivery(world, res);
  else if (job.id === openingJobId(r.b, r.a)) settleReturn(world, res);
}

// The cache stage begins: the nearest cache that can be opened is bound and marked (the locator blinks it, the map shows it), and B
// says so. A pilot who owns a souvenir already passes it at the next step.
function beginCache(world, r) {
  setStage(world, 'cache');
  bindCache(world, r);
  const b = label(r.b);
  world.emit('openingCall', { who: `${b} RECEIVING`, line: r.fuel === 'full' ? 'TANK FULL. SEALED CACHE MARKED ON YOUR MAP.'
    : 'TOPPED UP. SEALED CACHE MARKED ON YOUR MAP.' });
}
// The souvenir cache nearest B that can be opened now, where it was laid (src/cachePlaces.js), marked; none: the stage is passed.
// It opens free: the waiver `intro-souvenir` is earned for it (src/rewardLedger.js; a pilot who owns a souvenir already earns none, the
// first one was theirs), and pointed at another cache if this one goes before it is opened.
function bindCache(world, r) {
  const b = stationDefById(r.b), sb = sectorById(b.sectorId);
  const from = { x: (sb.col + b.x) * world.width, y: (sb.row + b.y) * world.height };
  let best = null;
  for (const f of findsFor(world.ledger)) {
    if (f.kind !== 'souvenir' || !isAvailable(f, world.ledger)) continue;
    const p = placedFind(f, world.ledger), s = sectorById(p.sector);
    if (!s || s.hidden) continue;
    const d = Math.hypot((s.col + p.x) * world.width - from.x, (s.row + p.y) * world.height - from.y);
    if (!best || d < best.d) best = { f, d };
  }
  r.c = best ? best.f.id : null;
  if (!best) { setStage(world, 'shelf'); return; }
  if (!ownsSouvenir(world.ledger)) earnWaiver(world.ledger, CLAIM.introSouvenir, { find: r.c });
  world.ledger.marked = r.c;
  world.ledger.reached.delete(r.c);
  // (its kind, not its name: the first souvenir is a surprise too, SX, 2026-10-09)
  world.emit('findMarked', { findId: r.c, label: findTitle(best.f), kind: 'souvenir', sectorId: placedFind(best.f, world.ledger).sector });
}

// ------------------------------------------------------------------------------------------------ slices 4 and 5: the ruin R

// R is the pilot's start ruin (src/sectors.js startRuinOf), the broken first station.
export const ruinOf = (world) => startRuinOf(world.ledger);
// Its pirates are down: beaten whole and not yet back (src/raids.js guardsBeaten, the same rule; raids.js reads this file for the radio, so
// it is not imported here: checks/opening-ruin.mjs holds the two together).
export const guardsDown = (L, id) => L.cleared.has(id) && Number.isFinite(L.guardsAt.get(id)) && L.clock < L.guardsAt.get(id) + CONFIG.raids.guardsEvery;
const putIn = (L, id) => L.invested.get(id) ?? 0;
// The ship within `reach` u of R, R's sector being the one it is in (a plain loop: it is asked every step of the fight's stage).
function nearRuin(world, reach) {
  const id = ruinOf(world), def = stationDefById(id, world.ledger), list = world.stations;
  if (!def || def.sectorId !== world.sector.id || !world.ship.alive || !list) return false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id !== id) continue;
    const d = world.delta(list[i].x, list[i].y, world.ship.x, world.ship.y);
    return Math.hypot(d.x, d.y) <= reach;
  }
  return false;
}
function storyDroid(world) {
  for (let i = 0; i < world.droids.length; i++) if (world.droids[i].story) return world.droids[i];
  return null;
}

// The stage the chapter goes on at when A has told of R, by what the world already holds (HANDOFF section 4.7: «Unexpected player
// competence counts»): its pirates not down: the fight; down and nothing in it: the first money; money in it: the work; restored: the end.
function stageAfterReveal(world) {
  const L = world.ledger, id = ruinOf(world);
  if (L.restored.has(id)) return REST;
  if (!guardsDown(L, id)) return 'guards';
  return putIn(L, id) > 0 ? 'work' : 'fund';
}
// What A says when the ask finds a step already made (the pirates beaten, money in, the station open): the pilot was there first.
const ACK = Object.freeze({
  fund: (R) => `${R} IS CLEAR ALREADY. YOU WERE THERE FIRST.`,
  work: (R) => `${R} IS CLEAR AND FUNDED. KEEP IT GOING.`,
  [REST]: (R) => `${R} IS OPEN ALREADY. WELL DONE.`,
});

// ABOUT <R> (close by A, once the return load is in): A's words are in the window; this is the pilot's own ask. R is marked on the locator
// and the map (it is the objective now), a card says what it costs to rebuild, and the chapter goes on at the step the world is at.
export function askAboutRuin(world) {
  const r = running(world);
  if (!r || at(r.stage) > at('ruin')) return false;
  if (r.stage !== 'ruin' || !closeBy(world, r.a)) { world.emit('actionRefused', { reason: 'NOT NOW' }); return false; }
  const id = ruinOf(world), def = stationDefById(id, world.ledger), next = stageAfterReveal(world);
  setStage(world, next);
  world.emit('openingFitted', { what: 'ruin', stationId: id, label: def.label, cost: formatCR(def.cost), owned: 0 });
  if (ACK[next]) world.emit('openingCall', { who: `${label(r.a)} DISPATCH`, line: ACK[next](def.label) });
  return true;
}

// On the way in to R's pirates: the dispatch says so once as R comes into sight, and the firing practice is counted (a shot is a rise of
// the ship's gun clock). Never blocks: the guards are beaten or they are not.
function stepApproach(world, r, state) {
  const ship = world.ship;
  if (ship.cooldown > state.cooldown) state.shots++;
  state.cooldown = ship.cooldown;
  if (!r.fired && state.shots >= PRACTICE.fire.shots) { r.fired = true; world.emit('openingPractice', { what: 'fire' }); }
  if (!state.approached && nearRuin(world, PRACTICE.fire.reach)) {
    state.approached = true;
    world.emit('openingCall', { who: `${label(r.a)} DISPATCH`, line: 'STATION AHEAD. CLEAR THE SHIPS HOLDING IT.' });
  }
}

// The first money is in: the radio's 50, the contact's word, and the repair droid comes a few seconds on (a beat of its own).
function afterFirstMoney(world, r, state) {
  payRadio(world, 'first-coins-in');
  setStage(world, 'repair');
  state.contactAt = world.time + CONTACT.after;
  world.emit('openingCall', { who: `${label(ruinOf(world))} CONTACT`, line: 'FIRST SECTION STARTED. KEEP THE ROUTE EARNING.' });
}

// R is restored (by the pilot's money, the support's, however): what the stage owed is paid once (the 50 for the first money if the
// pilot came to the end at one stroke, the 200 for the station), the contact is let go and the chapter rests, its contact saying so. A
// restoration before the pilot asked, or before the fight, is acknowledged and unpaid.
function finishRestored(world, r) {
  const owed = at(r.stage) >= at('fund');
  if (r.stage === 'fund') payRadio(world, 'first-coins-in');
  if (owed) payRadio(world, 'rebuild');
  const said = r.stage !== 'ruin';
  const dr = storyDroid(world);
  if (dr) dr.story = false;
  // The old radio line is released a rest after, not at once: the restoration is the pilot's to take in (HANDOFF slice 6: «later features
  // do not all interrupt the restoration celebration»; found by tools/opening-rhythm.mjs, a call 2 s after it).
  world.guideReadyAt = Math.max(world.guideReadyAt ?? 0, world.time + CONFIG.quests.guide.rest);
  setStage(world, REST);
  if (said) world.emit('openingCall', { who: `${label(ruinOf(world))} CONTACT`, line: 'DOCK IS OPEN. CARGO IS ON THE BOARD. WHERE NEXT?' });
}

// The repair droid (src/droids.js asks each step): the ruin's id while the stage wants the contact, the contact being due (the pilot in
// R's sector, alive, the beat after the first money gone), else null. It is made by src/droids.js spawnStoryDroid, and `contactMade` is
// told; where the ground gave no place, `contactFailed` makes it ask again a moment later.
export const contactStage = (world) => (running(world)?.stage === 'repair' ? ruinOf(world) : null);
export function contactDue(world) {
  const state = world.openingState, def = stationDefById(ruinOf(world), world.ledger);
  return !!state && world.ship.alive && !world.docked && world.time >= state.contactAt && world.sector.id === def?.sectorId;
}
export const contactSaid = (world) => !!world.openingState?.contactSaid;
export function contactMade(world) {
  const state = world.openingState;
  if (!state || state.contactSaid) return;
  state.contactSaid = true;
  world.emit('openingCall', { who: 'REPAIR DROID', line: 'HOLDING CLEAR OF THE STATION. COME OVER WHEN READY.' });
}
export function contactFailed(world) {
  if (world.openingState) world.openingState.contactAt = world.time + CONTACT.retry;
}
// What the droid says when the lesson is over, by how it ended.
const CONTACT_LINES = Object.freeze({
  sound: "HULL'S SOUND. NO WORK TO CHARGE FOR.",
  checked: 'HULL TOOK A BEATING. REPAIR ROW IS OPEN.',
  served: 'DONE. THAT WILL HOLD. COME BACK ANY TIME.',
});

// The hull check (stage `repair`): the pilot has come up to the droid and its window has stood a moment (`CONTACT.look` s on the world's
// clock): the lesson is made whether or not anything was bought. A hull that needs nothing is a finished lesson; a mend is the pilot's to
// buy, and one bought before the window had stood is told as it was.
function lookAtContact(world, r, state) {
  const dr = storyDroid(world);
  const looking = !!dr && world.ship.alive && !world.docked && world.selectedId === dr.id;
  if (!looking) { state.lookAt = null; return; }
  state.lookAt ??= world.time;
  if (world.time - state.lookAt < CONTACT.look) return;
  state.lookAt = null;
  r.repair = dr.stock < CONFIG.droids.repair.stock ? 'served' : world.hull >= world.hullMax ? 'sound' : 'checked';
  dr.story = false;
  setStage(world, 'work');
  world.emit('openingCall', { who: 'REPAIR DROID', line: CONTACT_LINES[r.repair] });
}

// R's repair row lit in the story's purple at once (SX, 2026-10-06: «квест с починкой не считается, там пусть сразу подсвечивается
// починка фиолетовым»): its FUND and RESTORE rows while the chapter asks for money in it (src/menus.js litRepair).
export const openingRepairAsked = (world, id) => {
  const s = openingStage(world);
  return (s === 'fund' || s === 'work') && id === ruinOf(world);
};

// A wreck in SCOOTY JR. costs nothing: no coins knocked out, no rescue bill (World.wreckShip asks). The pilot comes back in it near
// the wreck, as any pilot does, and flies the leg again.
export const courtesyWreck = (world) => flyingLoaner(world);

// ------------------------------------------------------------------------------------------------ the menus at A

// BOARD MY SHUTTLE (close by A, in the loaner): SCOOTY JR. stays with SCOOTY, the pilot is in their own shuttle (the hangar's flown
// ship, its chassis and its drawing), serviced: a whole hull and a full tank. The radio works, the pilot's from now (Pilot.radio, in
// the save); the first call comes at once.
export function boardShuttle(world) {
  const r = running(world);
  if (!r || r.stage !== 'service' || !closeBy(world, r.a)) { world.emit('actionRefused', { reason: 'NOT NOW' }); return false; }
  const own = world.hangar.flying, ship = world.ship;
  ship.setChassis(shipById(own)?.chassis ?? own);
  const model = shipModel(own);
  if (model) { model.scale = model.baseScale ?? model.scale; ship.setModel(model); }
  world.hull = world.hullMax;
  world.fuel = world.fuelTank;
  world.pilot.grantRadio(world.ledger.clock + CONFIG.quests.npcCall.after);
  setStage(world, 'call');
  world.emit('loanerReturned', { stationId: r.a, label: label(r.a), shipId: own });
  world.emit('openingCall', { who: `${label(r.a)} DISPATCH`, line: QL.banner.smallDelivery(label(r.b)) });
  return true;
}
// DELIVERY DETAILS (at A, after the call): the locator and the map are fitted, and B is marked on both.
export function takeDetails(world) {
  const r = running(world);
  if (!r || r.stage !== 'call') { world.emit('actionRefused', { reason: 'NOT NOW' }); return false; }
  setStage(world, 'freight');
  world.emit('openingFitted', { what: 'navigation', stationId: r.b, label: label(r.b) });
  return true;
}

// FIT THE SHELF (close by B, the souvenir brought home): the shelf is fitted and shown, the souvenir already in it (it is the pilot's
// since the cache; nothing is granted again, nothing taken), and the radio's thanks for the souvenir are paid, once. The pilot's own act
// is the beat: the shelf appears when they ask for it, and a card says so. A second press finds the stage passed and does nothing.
export function fitShelf(world) {
  const r = running(world);
  if (!r) return false;
  if (at(r.stage) > at('shelf')) return false;
  if (r.stage !== 'shelf' || !closeBy(world, r.b)) { world.emit('actionRefused', { reason: 'NOT NOW' }); return false; }
  setStage(world, 'look');
  payRadio(world, 'a-souvenir');
  world.emit('openingFitted', { what: 'shelf', stationId: r.b, label: label(r.b), owned: world.collection.instances.length });
  return true;
}
// The pilot card opened (the page calls it as C opens it): the optional look at it is done. Any other stage: nothing.
export function noteCardOpened(world) {
  const r = running(world);
  if (r && r.stage === 'look') setStage(world, 'load');
}

// The offers a station makes are the chapter's through its two freights: until the first delivery, and from the card to the return
// load's delivery. (Between them, from the fuel to the shelf, the pilot is free to take whatever B and A offer.)
const guidedOffers = (stage) => at(stage) <= at('deliver') || (at(stage) >= at('look') && at(stage) <= at('haul'));
// Whether the chapter holds the stations' own offers now: the map then lists no authored job waiting (labs/graphics/map-screen.js 04 CARGO).
export const openingHoldsOffers = (world) => { const r = running(world); return !!r && guidedOffers(r.stage); };

// A station's rows under the chapter (World.stationActions, over src/menus.js's): freight offers are the chapter's through its two
// freights; at A, close by in SCOOTY JR., its row, INFO and a docked ship's way out; after the call, its row first; then the
// first freight; at B while the fuel stage runs, REFUEL close by (a docked ship has it among the station's services), then FIT THE SHELF
// once the souvenir is brought, and the return load.
export function openingActions(world, station, actions) {
  const r = running(world);
  if (!r) return actions;
  let rows = guidedOffers(r.stage) ? actions.filter((a) => !a.offer) : actions;
  if (station.id === r.b) {
    if (r.stage === 'fuel' && world.docked !== station.id) return [world.refuelAction(), ...rows];
    if (r.stage === 'shelf' && closeBy(world, station.id)) rows = [{ label: 'FIT THE SHELF', run: () => fitShelf(world) }, ...rows];
    if ((r.stage === 'look' || r.stage === 'load') && !world.ledger.active) {
      const c = returnJob(world), quote = jobQuote(quoteJob(c, world.ledger.restored.size));
      rows = [{ label: `ACCEPT ${c.label}`, cargo: true, note: `${cargoOf(c).name} / ${formatCR(quote)} CR / TARGET ${clockText(parTime(c))}`,
        run: () => world.acceptContract(c) }, ...rows];
    }
    return rows;
  }
  if (station.id !== r.a) return rows;
  if (r.stage === 'ruin' && closeBy(world, station.id)) rows = [{ label: `ABOUT ${label(ruinOf(world))}`, run: () => askAboutRuin(world) }, ...rows];
  if (r.stage === 'service' && closeBy(world, station.id)) {
    return [{ label: 'BOARD MY SHUTTLE', run: () => boardShuttle(world) }, ...rows.filter((a) => a.label === 'UNDOCK' || a.label === 'INFO')];
  }
  if (r.stage === 'call') rows = [{ label: 'DELIVERY DETAILS', run: () => takeDetails(world) }, ...rows];
  if (r.stage === 'freight' && !world.ledger.active) {
    const c = openingJob(world), quote = jobQuote(quoteJob(c, world.ledger.restored.size));
    rows = [{ label: `ACCEPT ${c.label}`, cargo: true, note: `${cargoOf(c).name} / ${formatCR(quote)} CR / TARGET ${clockText(parTime(c))}`,
      run: () => world.acceptContract(c) }, ...rows];
  }
  return rows;
}

// What A's people say in its menu (a dialog window, labs/graphics/context.js `talk`), or null. Each line is short enough for the
// window's five rows (checks/opening.mjs holds it).
export function openingTalk(world, station) {
  const r = running(world);
  if (!r) return null;
  const a = label(r.a), b = label(r.b);
  // B's, after the cache: the shelf to fit, then the rack to fill, then the return load (A is waiting; the old station is slice 4's).
  if (station.id === r.b) {
    if (r.stage === 'shelf' && closeBy(world, station.id)) return { name: `${b} RECEIVING`, lines: ["THAT'S A FINE KEEPSAKE. LET'S GIVE IT A SHELF IN YOUR COCKPIT."] };
    if (r.stage === 'look') {
      const has = world.collection.instances.length > 0;
      return { name: `${b} RECEIVING`, lines: [has ? 'THERE. YOUR FIRST SOUVENIR, WHERE YOU CAN SEE IT. THE REST OF THE RACK IS YOURS TO FILL.' : 'THERE. THE RACK IS YOURS TO FILL.'] };
    }
    if (r.stage === 'load' && !world.ledger.active) return { name: `${b} RECEIVING`, lines: [`${a} IS WAITING FOR THIS RETURN LOAD. THEY ALSO ASKED ABOUT THE OLD STATION.`] };
    return null;
  }
  if (station.id !== r.a) return null;
  // A's, once the return load is in: the old station and its pirates (the ready ship is told to go; one that needs mending, to mend first).
  if (r.stage === 'ruin' && closeBy(world, station.id)) {
    const R = label(ruinOf(world)), ready = world.hull >= world.hullMax * READY.hull && world.fuel >= world.fuelTank * READY.fuel;
    return { name: `${a} DISPATCH`, lines: [ready ? `${R} USED TO KEEP THIS STRETCH MOVING. PIRATES SIT ON IT NOW. CLEAR THEM AND WE CAN REBUILD IT.`
      : `${R} USED TO KEEP THIS STRETCH MOVING. PIRATES SIT ON IT. MEND AND REFUEL FIRST, THEN CLEAR THEM.`] };
  }
  if (r.stage === 'service' && closeBy(world, station.id)) {
    return { name: 'SCOOTY / MECHANIC', lines: ["SHUTTLE'S READY. FIXED THE RADIO TOO. NO CHARGE. LEAVE JUNIOR WITH ME."] };
  }
  if (r.stage === 'call') return { name: `${a} DISPATCH`, lines: [`THERE YOU ARE. ${b} NEEDS A SMALL DELIVERY. READY TO WORK AGAIN?`] };
  if (r.stage === 'freight' && !world.ledger.active) {
    return { name: `${a} DISPATCH`, lines: [`LOCATOR'S FITTED. ${b} IS ON IT AND YOUR MAP. BEAT THE TARGET TIME FOR BETTER PAY.`] };
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ the objective

// The stage's objective as a quest of the list (src/quests.js currentQuests): its title (verb and target), what to do under it,
// where it leads, and the words its plate turns green with. None while the first freight is carried (the cargo is the objective)
// and none once the chapter rests. `select`: the list selects it as it comes (labs/graphics/quest-list.js), so its bearing shows.
// `pointer`: the word on its mark at the edge of the flight, the name of what the mark leads to (a station's, `CACHE`), never where
// the call came from (SX, 2026-10-09: «все метки, которые называются радио, это очень непонятно»; it was RADIO on every stage from the
// call to the work). The ruin's restoration, from its pirates to the last of its price, keeps its purple mark on the ruin whatever the
// step is (SX: «должна быть всегда метка на станцию, да, фиолетовая оставаться»; its `keep`, which held it against the list's click that
// switched marks off, went with that click at W8, 2026-10-15). `also`: a second place the quest marks, the ruin
// where the step leads elsewhere (the repair droid's, the first money still to earn at A): drawn at the edge and ringed on the locator as a
// quest's own, in the quest's tone (flight-frame.js, locator.js radarContacts).
const questId = (stage) => `opening:${stage}`;
const stationTarget = (id) => { const d = stationDefById(id); return d ? { sectorId: d.sectorId, x: d.x, y: d.y, stationId: d.id, mark: d.id } : null; };
// What the opening's own line is teaching just now (the objective's `teach`): the brake on the loaner's leg once the ship has gone `arm` u/s and
// not yet braked to a stop, the gun on the way in to R's pirates, until one is down or `shots` are fired. The objectives below read these two;
// so does the skills' one-time hints (src/skillHints.js), which stand off while the opening's line stands, as it names no key.
const brakeLine = (world, r) => !r.braked && !!world.openingState?.armed;
const fireLine = (world, r) => !(world.posts?.get(ruinOf(world))?.down > 0) && !r.fired && nearRuin(world, PRACTICE.fire.reach);
export function openingTeaches(world) {
  const r = running(world);
  if (!r) return null;
  if (r.stage === 'loaner' && brakeLine(world, r)) return 'brake';
  if (r.stage === 'guards' && fireLine(world, r)) return 'fire';
  return null;
}
const OBJECTIVES = {
  loaner: (world, r) => {
    const a = label(r.a), brake = brakeLine(world, r);
    return { pointer: 'SERVICE', title: QL.opening.collect(), target: stationTarget(r.a), done: [QL.opening.reached(a), QL.opening.serviceBerth()],
      sub: brake ? QL.opening.brake() : QL.opening.service(a), teach: brake ? 'brake' : null };
  },
  service: (world, r) => {
    const a = label(r.a), near = closeBy(world, r.a);
    return { pointer: 'SERVICE', title: near ? QL.opening.board() : QL.opening.collect(), target: stationTarget(r.a),
      sub: near ? QL.opening.berth() : QL.opening.service(a), done: [QL.opening.shuttle(), QL.opening.radioFixed()] };
  },
  call: (world, r) => ({ pointer: label(r.a), title: QL.opening.call(), sub: QL.opening.dispatch(label(r.a)), target: stationTarget(r.a),
    done: [QL.opening.fitted(), QL.opening.marked(label(r.b))] }),
  freight: (world, r) => ({ pointer: label(r.a), title: QL.opening.freight(), sub: QL.opening.seeMap(label(r.b)), target: stationTarget(r.a),
    done: [QL.opening.accepted(), QL.opening.to(label(r.b))], teach: 'map' }),
  fuel: (world, r) => {
    const b = label(r.b);
    return { pointer: b, title: QL.opening.refuel(b), target: stationTarget(r.b), done: [QL.opening.full(), QL.opening.station(b)],
      sub: QL.opening.unitPrice(CONFIG.fuel.price) };
  },
  cache: (world, r) => {
    const f = placedFind(findDef(r.c, world.ledger), world.ledger);
    if (!f) return null;
    const price = world.findPrice(f);
    return { pointer: 'CACHE', title: QL.opening.cache(), sub: QL.opening.cacheSub(sectorById(f.sector)?.label ?? '', price > 0 ? `${formatCR(price)} CR` : FREE_WORDS),
      target: { sectorId: f.sector, x: f.x, y: f.y, findId: f.id, mark: f.id, reach: CONFIG.cache.interactRadius },
      done: [QL.opening.souvenir()] };
  },
  // The souvenir home: the shelf is fitted at B, and the radio's thanks for the souvenir are paid there.
  shelf: (world, r) => ({ pointer: label(r.b), title: QL.opening.shelf(), sub: QL.opening.shelfAt(label(r.b)), target: stationTarget(r.b),
    done: [QL.opening.shelfFitted(), QL.guide.bonus(CONFIG.quests.guide.pay['a-souvenir'])] }),
  // The pilot card, optional: the return load skips it.
  look: (world, r) => ({ pointer: label(r.b), title: QL.opening.card(), sub: QL.opening.cardSub(), target: stationTarget(r.b),
    done: [QL.opening.cardOpened(), QL.opening.lookYours()], teach: 'card' }),
  // The return load, with no hint to find the map: the pilot has done this.
  load: (world, r) => ({ pointer: label(r.b), title: QL.opening.load(), sub: QL.opening.to(label(r.a)), target: stationTarget(r.b),
    done: [QL.opening.loadTaken(), QL.opening.to(label(r.a))] }),
  // Slice 4: A tells of the old station, and the pilot asks (a row of A's menu).
  ruin: (world, r) => {
    const R = label(ruinOf(world)), def = stationDefById(ruinOf(world), world.ledger);
    return { pointer: label(r.a), title: QL.opening.askRuin(R), sub: QL.opening.ruinAt(label(r.a)), target: stationTarget(r.a),
      done: [QL.opening.ruinMarked(R), QL.opening.ruinCost(formatCR(def.cost))] };
  },
  // The pirates on R: the firing hint on the way in, then the tally. Beaten, the radio's 100.
  guards: (world, r) => {
    const id = ruinOf(world), R = label(id), tally = world.posts?.get(id), fighting = tally?.down > 0;
    const hint = fireLine(world, r);
    return { pointer: R, title: QL.opening.guards(),
      sub: fighting ? QL.special.down(tally.down, tally.size) : hint ? QL.opening.fire() : QL.opening.guardsAt(R, guardSize(stationDefById(id, world.ledger))),
      target: stationTarget(id), done: [QL.special.clear(R), QL.guide.bonus(CONFIG.quests.guide.pay['the-guards'])], teach: hint ? 'fire' : null };
  },
  // The first money: whatever the pilot likes, 50 CR up. Pirates back (they come back every quarter hour until R is restored, SX's rule)
  // are the fight again; a wallet under the least step is told to earn first, and how. The plate's end is the stage's own either way.
  fund: (world, r) => {
    const L = world.ledger, id = ruinOf(world), R = label(id), def = stationDefById(id, L);
    const done = [QL.guide.fundDone(), QL.guide.bonus(CONFIG.quests.guide.pay['first-coins-in'])];
    if (!guardsDown(L, id)) return again(world, done);
    if (L.credits < INVEST_STEPS[0] && putIn(L, id) <= 0) return { pointer: label(r.a), also: ruinMark(world), title: QL.opening.earn(), sub: QL.opening.earnSub(), target: stationTarget(r.a), done };
    return { pointer: R, title: QL.opening.fund(R), sub: QL.opening.funds(formatCR(putIn(L, id)), formatCR(def.cost)), target: stationTarget(id), done };
  },
  // The hull check at the repair droid: its bearing is the droid's own while it stands in this sector (the ruin's menu would take the
  // selection from it, so the pilot is led to the droid, which holds clear of the ruin outside its reach), else the ruin it holds clear of.
  // The ruin keeps its purple mark beside the droid's (`also`; SX, 2026-10-09: «должна быть всегда метка на станцию, да, фиолетовая
  // оставаться»: with the droid the only mark, the station's went with it).
  repair: (world, r) => {
    const id = ruinOf(world), def = stationDefById(id, world.ledger), dr = storyDroid(world);
    const target = dr ? { sectorId: def.sectorId, x: def.x, y: def.y, mark: dr.id, reach: CONFIG.droids.interactRadius } : stationTarget(id);
    return { pointer: dr ? 'DROID' : label(id), also: dr ? ruinMark(world) : null, title: QL.opening.repairer(), sub: QL.opening.checkHull(), target,
      done: [r.repair === 'served' ? QL.opening.hullMended() : QL.opening.hullSound(), QL.opening.droidMet()] };
  },
  // The work: the rest of R's price as the pilot likes, the freight and the calls as anywhere. The radio's 200 when it opens.
  work: (world, r) => {
    const L = world.ledger, id = ruinOf(world), R = label(id), def = stationDefById(id, L);
    const done = [QL.restore.done(R), QL.guide.bonus(CONFIG.quests.guide.pay.rebuild)];
    if (!guardsDown(L, id)) return again(world, done);
    return { pointer: R, title: QL.opening.reopen(R), sub: QL.opening.funds(formatCR(putIn(L, id)), formatCR(def.cost)), target: stationTarget(id), done };
  },
};
// The pirates are back on R (every quarter hour after they were beaten, until it is restored): the fight is the objective again, the
// stage's own ending kept.
function again(world, done) {
  const id = ruinOf(world);
  return { pointer: label(id), title: QL.opening.guards(), sub: QL.opening.guardsBack(), target: stationTarget(id), done };
}
// The ruin's purple mark as a place a quest keeps beside its own (`also`): the quest's tone and the station's name on the mark, the station as the
// target. A fresh object a call, like the quest it rides on.
const ruinMark = (world) => { const id = ruinOf(world); return { kind: 'opening', tone: 'story', pointer: label(id), title: label(id), target: stationTarget(id) }; };
export function openingQuest(world) {
  const r = running(world), make = r && OBJECTIVES[r.stage];
  const q = make ? make(world, r) : null;
  if (!q || !q.target) return null;
  return { id: questId(r.stage), kind: 'opening', tone: 'story', select: true, ...q };
}
