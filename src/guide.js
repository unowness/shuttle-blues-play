import { CONFIG } from './config.js';
import { findsFor, isAvailable, placedFind, FREE_WORDS } from './rewards.js';
import { SIGNALS } from './progression.js';
import { stationDefById, sectorById, START_STATIONS } from './sectors.js';
import { ruinIdsOf, ruinDef, isRestored, stillToInvest, invested, formatCR } from './ruins.js';
import { factsOfWorld } from './pacing.js';
import { sectorOpen } from './frontier.js';
import { QUEST_LINES as QL } from './questLines.js';

// The radio line: the green quest of the quest economy (reports/2026-10-02-quest-economy.md; QUESTS_V2_HANDOFF.md, SX,
// 2026-10-02: the green ones «если у тебя долго нет зеленых квестов» lead a new pilot through the game's mechanics, as
// radio transmissions heard from other pilots). Eight steps in a fixed order, each a plate in the quest list while it
// lasts, on a slot of its own beside the side quest (CONFIG.quests.guide):
//
//   FIRST RUN    take a cargo and deliver it            A SOUVENIR   open a souvenir cache
//   ON THE RADIO tune in a signal                       THE GUARDS   beat a ruin's guards
//   FIRST COINS  put money into a cleared ruin          A PAINT      open a paint cache
//   HOME         dock at the home garage                REBUILD      restore a ruin
//
// The line has no state of its own: the step to offer is the first whose `done` is false, read from what the pilot has
// done (the `facts` of src/pacing.js), so a reload loses nothing and a step learnt already is skipped, unpaid. Every
// `done` is something that stays done. A step is offered when its `when` holds (a souvenir is asked for only once the
// wallet reaches one), `rest` s after the last was paid (the rest the side slot has, but its own), never while a red quest
// or a reference ship is on. It does not expire. Paid when the plate is seen done: the radio's thanks, on top of what the
// act itself gave. `world.guide = { id, step, since }` is saved while it is on (src/questSave.js); `world.guideReadyAt` is not.

const G = () => CONFIG.quests.guide;

export const GUIDE = Object.freeze([
  { id: 'first-run', when: (f) => f.deliveries === 0, done: (f) => f.deliveries >= 1 },
  { id: 'a-souvenir', when: (f) => f.credits >= 250 && f.souvenirs === 0, done: (f) => f.souvenirs > 0, can: (f) => f.souvenirsOpen > 0 },
  { id: 'on-the-radio', when: (f) => f.deliveries >= 1 && f.heard === 0, done: (f) => f.heard > 0 },
  { id: 'the-guards', when: (f) => f.deliveries >= 3 && f.cleared === 0, done: (f) => f.cleared > 0 },
  { id: 'first-coins-in', when: (f) => f.cleared > 0 && f.credits >= 250 && !f.invested, done: (f) => f.invested },
  { id: 'a-paint', when: (f) => f.credits >= 300 && f.paints === 0, done: (f) => f.paints > 0, can: (f) => f.paintsOpen > 0 },
  { id: 'home', when: (f) => f.deliveries >= 4 && !f.homed, done: (f) => f.homed },
  { id: 'rebuild', when: (f) => f.restored === 0 && !!f.cheapest && f.credits >= f.cheapest.left, done: (f) => f.restored > 0 },
]);

// The first step not yet done that can be done now, or null. A step with nothing to do it with yet (`can`: no souvenir
// cache open before the frontier opens a sector, 2026-10-02) is passed over and comes back when there is: the line does
// not stand still on it.
export const guideStepFor = (facts) => GUIDE.find((s) => !s.done(facts) && (s.can?.(facts) ?? true)) ?? null;

// ------------------------------------------------------------------------------------------------------ the words

const gridGap = (world, sectorId) => {
  const a = world.sector, b = sectorById(sectorId);
  return b ? Math.abs(a.col - b.col) + Math.abs(a.row - b.row) : Infinity;
};
const nearest = (world, list, sectorOf) => list.reduce((best, x) => (!best || gridGap(world, sectorOf(x)) < gridGap(world, sectorOf(best)) ? x : best), null);
const stationTarget = (def) => ({ sectorId: def.sectorId, x: def.x, y: def.y, stationId: def.id, mark: def.id });
const findTarget = (f) => ({ sectorId: f.sector, x: f.x, y: f.y, findId: f.id, mark: f.id, reach: CONFIG.cache.interactRadius });
const sectorLabel = (id) => sectorById(id)?.label ?? '';

// A ruin on the grid, by what a step needs of it: only in a sector open to the pilot (the frontier, src/frontier.js), as every
// place the radio names (a cache's is in src/rewards.js isAvailable, a signal's below).
const ruins = (world, keep) => ruinIdsOf(world.ledger).map((id) => ruinDef(id, world.ledger)).filter((d) => d && !sectorById(d.sectorId)?.hidden && sectorOpen(world.ledger, d.sectorId) && keep(d, world.ledger));
// Where the first run is taken: of the start's three stations (src/sectors.js START_STATIONS, in HOME's sector and the one
// beside it, both always open), the working one nearest HOME: RELAY 12, or HALCYON when RELAY 12 is the pilot's broken one
// (SX, 2026-10-02: «каждому игроку из 3 станций рандомно достается первая сломанная»). It was DRY DOCK, the first contract's
// station, until the frontier closed J-04 at the start (2026-10-02), then RELAY 12 alone. `ledger`: the pilot's, whose roll it is.
const gridAt = (def) => { const s = sectorById(def.sectorId); return { x: s.col + def.x, y: s.row + def.y }; };
function firstRunAt(ledger) {
  const home = gridAt(stationDefById(CONFIG.home.id));
  const away = (def) => { const p = gridAt(def); return Math.hypot(p.x - home.x, p.y - home.y); };
  return START_STATIONS.map((id) => stationDefById(id, ledger)).filter((d) => d.kind !== 'ruin').reduce((best, d) => (!best || away(d) < away(best) ? d : best), null);
}
// What a cache costs this pilot, as a plate says it: its price, or NO CHARGE under a free claim (src/rewardLedger.js, World.findPrice).
const chargeOf = (world, f) => { const price = world.findPrice(f); return price > 0 ? `${formatCR(price)} CR` : FREE_WORDS; };
const cheapestOf = (list) => list.reduce((best, d) => (!best || d.cost < best.cost ? d : best), null);

// For each step: the radio's call (heard when the plate comes), the plate's title, what it says under it and where it
// points (from the world, so it follows what the pilot has bought), and how it ends. Capitals, short: the plate takes
// its width from its longest line.
const WORDS = {
  'first-run': {
    call: (ledger) => `CARGO WAITING AT ${firstRunAt(ledger).label}`, title: QL.guide.firstRun(), done: QL.guide.firstRunDone(),
    place: (world) => { const def = firstRunAt(world.ledger); return { sub: QL.guide.firstRunSub(def.label), target: stationTarget(def), pointer: def.label }; },
  },
  'a-souvenir': {
    call: 'OPEN A SOUVENIR CACHE', title: QL.guide.souvenir(), done: QL.guide.souvenirDone(),
    place: (world) => {
      const f = nearest(world, findsFor(world.ledger).filter((x) => x.kind === 'souvenir' && isAvailable(x, world.ledger)).map((x) => placedFind(x, world.ledger)), (x) => x.sector);
      return f ? { sub: QL.guide.cacheSub(sectorLabel(f.sector), chargeOf(world, f)), target: findTarget(f), pointer: 'CACHE' } : {};
    },
  },
  'on-the-radio': {
    call: 'FLY THROUGH A SIGNAL TO TUNE IN', title: QL.guide.radio(), done: QL.guide.radioDone(),
    place: (world) => {
      const sig = nearest(world, SIGNALS.filter((x) => !world.ledger.heard.has(x.id) && !sectorById(x.sector)?.hidden && sectorOpen(world.ledger, x.sector)), (x) => x.sector);
      return sig ? { sub: QL.guide.radioSub(sectorLabel(sig.sector)), pointer: 'SIGNAL',
        target: { sectorId: sig.sector, x: sig.x, y: sig.y, signalId: sig.id, mark: sig.id, reach: CONFIG.signal.reach } } : {};
    },
  },
  'the-guards': {
    call: 'CLEAR THE GUARDS. THEN YOU CAN REPAIR.', title: QL.guide.guards(), done: QL.guide.guardsDone(),
    place: (world) => {
      const def = cheapestOf(ruins(world, (d, L) => !L.cleared.has(d.id) && invested(L, d.id) <= 0)) ?? cheapestOf(ruins(world, () => true));
      return def ? { sub: QL.guide.guardsSub(def.label), target: stationTarget(def), pointer: def.label } : {};
    },
  },
  'first-coins-in': {
    call: 'FUND REPAIRS IN INSTALMENTS', title: QL.guide.fund(), done: QL.guide.fundDone(),
    place: (world) => {
      const def = cheapestOf(ruins(world, (d, L) => L.cleared.has(d.id) && !isRestored(L, d))) ?? cheapestOf(ruins(world, (d, L) => !isRestored(L, d)));
      return def ? { sub: QL.guide.fundSub(def.label, 50), target: stationTarget(def), pointer: def.label } : {};
    },
  },
  'a-paint': {
    call: 'FIND A PAINT CACHE', title: QL.guide.paint(), done: QL.guide.paintDone(),
    place: (world) => {
      const f = nearest(world, findsFor(world.ledger).filter((x) => x.kind === 'paint' && isAvailable(x, world.ledger)).map((x) => placedFind(x, world.ledger)), (x) => x.sector);
      return f ? { sub: QL.guide.cacheSub(sectorLabel(f.sector), chargeOf(world, f)), target: findTarget(f), pointer: 'CACHE' } : {};
    },
  },
  home: {
    call: "FUEL'S CHEAPER AT HOME.", title: QL.guide.home(), done: QL.guide.homeDone(),
    place: () => { const def = stationDefById(CONFIG.home.id); return { sub: QL.guide.homeSub(), target: stationTarget(def), pointer: def.label }; },
  },
  rebuild: {
    call: "YOU'VE GOT ENOUGH TO RESTORE A RUIN.", title: QL.restore.title('A RUIN'), done: QL.guide.rebuildDone(),
    place: (world) => {
      const def = cheapestOf(ruins(world, (d, L) => !isRestored(L, d)));
      return def ? { title: QL.restore.title(def.label), sub: QL.restore.sub(def.sectorLabel, formatCR(stillToInvest(world.ledger, def))), target: stationTarget(def), pointer: def.label } : {};
    },
  },
};
// A step's radio call; the first run's names the station of the pilot's roll (`ledger`; none: the catalogue's).
export const guideCall = (id, ledger = null) => { const call = WORDS[id]?.call; return typeof call === 'function' ? call(ledger) : call ?? ''; };

// ------------------------------------------------------------------------------------------------------- the slot

// The step on now as a plate, or null.
export function guideQuest(world) {
  const g = world.guide;
  const w = g && WORDS[g.step];
  if (!w) return null;
  const place = w.place(world) ?? {};
  return {
    // The word on its mark is the name of what it leads to (`place.pointer`), never the radio it was heard on (SX, 2026-10-09: «все метки,
    // которые называются радио, это очень непонятно»); with no place yet, the quests' plain word.
    id: g.id, kind: 'guide', tone: 'story', pointer: place.pointer, title: place.title ?? w.title, sub: place.sub ?? '', target: place.target,
    done: [w.done, QL.guide.bonus(G().pay[g.step])],
  };
}

// A step offered now: the first not done, when its `when` holds, or whichever is next with `force` (the lab's
// `?quest=guide`). Returns the slot, or null.
export function offerGuide(world, { force = false } = {}) {
  if (world.guide) return null;
  const step = guideStepFor(factsOfWorld(world));
  if (!step || (!force && !step.when(factsOfWorld(world)))) return null;
  world.guideSerial += 1;
  world.guide = { id: `guide:${step.id}:${world.guideSerial}`, step: step.id, since: world.time };
  world.emit('questOffered', { questId: world.guide.id, kind: 'guide' });
  world.emit('guideHeard', { step: step.id, line: guideCall(step.id, world.ledger) });
  return world.guide;
}

// The slot's look (every `checkEvery` s, with the side quest's): a step done is paid and the plate turns green; with none
// on, `offer` (the caller's gates and chance) says whether one may come.
export function lookGuide(world, offer) {
  const g = world.guide;
  if (g) {
    const step = GUIDE.find((s) => s.id === g.step);
    if (step && !step.done(factsOfWorld(world))) return;
    const pay = G().pay[g.step] ?? 0;
    world.ledger.credits += pay;
    world.questOutcomes.set(g.id, 'done');
    world.guide = null;
    world.guideReadyAt = world.time + G().rest;
    world.emit('guidePaid', { step: g.step, pay, credits: world.ledger.credits, x: world.ship.x, y: world.ship.y, sectorId: world.sector.id });
    return;
  }
  if (world.time < (world.guideReadyAt ?? 0)) return;
  const facts = factsOfWorld(world), step = guideStepFor(facts);
  if (!step || !step.when(facts) || !offer()) return;
  offerGuide(world);
}
