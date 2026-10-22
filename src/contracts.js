// Delivery contracts.
//
// One contract is active at a time, and it is carried as a visual follower
// rather than a simulated load. That is deliberate: the point of this stage is
// to find out whether travelling between two stations is worth doing, not to
// build cargo dynamics.
//
// Rewards are credited through `completeContract`, which is written to be safe
// to call more than once with the same contract. That discipline matters now
// because the same operation becomes a network request later, where a retry,
// a double click and a reconnect all replay it.

import { CONFIG } from './config.js';
import { hashId } from './util.js';
import { signalDef, wordDef, ROCK_COIN_MAX } from './progression.js';
import { sectorById, stationDefById, SECTOR_SIZE, START_STATIONS, startRuinOf } from './sectors.js';
import { RUIN_IDS, ruinIdsOf, isRestored, workingStationIds, reachableStationIds, networkMultiplier } from './ruins.js';
import { findDef, dealOk } from './rewards.js';
import { WRECK_CAUSES, sanitizeTrace, sanitizeObstacle } from './trace.js';
import { STRANGER_CONTRACTS } from './strangers.js';
import { stationGoods } from './stationInfo.js';
import { emptyClaims, claimsToJSON, readClaims } from './rewardLedger.js';
import { contentLinks } from './mapContent.js';
import { readPirateCombat } from './pirateCombatSave.js';

// Rewards: the freight rule (freightReward below): CONFIG.delivery.fixed CR plus CONFIG.delivery.perU CR a u of the straight way
// between the stations, times the cargo's share (CONFIG.cargo.sizes: a small one 0.85, a large one 1.4), to 5. Each authored contract
// pays its `share` of that rule: what it was authored at against the rule of its day in the layout's world (the first nine, the four
// starting stations', about 1.35 of it since 2026-10-02, SX: «явно не хватает денег ... поправь ее в начале»; the east about the rule),
// so its pay follows the rule as the world and the tariff change (chat SC, 2026-10-04: sectors twice as wide, src/worldScale.js; the
// tariff a u raised on SX's word so the money keeps pace). Runs, the opening's freight and other pilots' lost cargo pay the rule
// itself. Since the v1 economy each restored station adds to the tariff (src/ruins.js networkMultiplier), frozen into the job when it
// is accepted (quoteJob). A station offers its contracts one at a time, in this order; each is delivered once, and one bound for a ruin
// waits until the ruin is restored.
const DD = 'station-drydock-j04', R12 = 'station-relay-j05';
const DEPOT = 'station-depot-k04', YARD = 'station-yard-k05';
const COMMONS = 'station-commons-j06', SPOOL = 'station-spool-j06';
const APIARY = 'station-apiary-k06', WHARF = 'station-wharf-k06';
export const CONTRACTS = [
  { id: 'contract-coolant-01', label: 'COOLANT CELLS', from: DD, to: R12, size: 'medium', share: 1.49 },
  { id: 'contract-plates-01', label: 'HULL PLATES', from: DD, to: DEPOT, size: 'large', share: 0.94 },
  { id: 'contract-core-01', label: 'ENGINE CORE', from: DD, to: YARD, size: 'large', share: 1.36 },
  // SPARE PARTS until 2026-09-30: the relay's goods are radio (src/stationInfo.js).
  { id: 'contract-parts-01', label: 'RADIO VALVES', from: R12, to: DD, size: 'small', share: 1.48 },
  { id: 'contract-tapes-01', label: 'ARCHIVE TAPES', from: R12, to: DEPOT, size: 'small', share: 1.34 },
  { id: 'contract-lamps-01', label: 'SIGNAL LAMPS', from: DEPOT, to: DD, size: 'small', share: 0.95 },
  { id: 'contract-kits-01', label: 'MEDICAL KITS', from: DEPOT, to: YARD, size: 'medium', share: 1.26 },
  { id: 'contract-water-01', label: 'WATER TANKS', from: YARD, to: R12, size: 'large', share: 1.38 },
  { id: 'contract-paint-01', label: 'PAINT DRUMS', from: YARD, to: DD, size: 'medium', share: 1.34 },
  // The four working stations east (2026-09-30), two each, their own goods, priced by the rule above.
  { id: 'contract-bread-01', label: 'BREAD LOAVES', from: COMMONS, to: DD, size: 'small', share: 1.16 },
  { id: 'contract-blankets-01', label: 'WOOL BLANKETS', from: COMMONS, to: R12, size: 'medium', share: 0.96 },
  { id: 'contract-rods-01', label: 'FUEL RODS', from: SPOOL, to: YARD, size: 'large', share: 1.01 },
  { id: 'contract-filters-01', label: 'AIR FILTERS', from: SPOOL, to: APIARY, size: 'small', share: 0.99 },
  { id: 'contract-sprouts-01', label: 'SPROUTS', from: APIARY, to: COMMONS, size: 'small', share: 1.06 },
  { id: 'contract-honey-01', label: 'HONEY JARS', from: APIARY, to: DEPOT, size: 'medium', share: 1.07 },
  { id: 'contract-cable-01', label: 'CABLE REELS', from: WHARF, to: SPOOL, size: 'large', share: 0.93 },
  { id: 'contract-winch-01', label: 'WINCH PARTS', from: WHARF, to: DEPOT, size: 'medium', share: 1.02 },
];

// The freight rule: what a contract between its two stations pays, before CONFIG.delivery.base and the tariff (quoteJob), to 5 CR.
export function freightReward(contract, share = 1) {
  const D = CONFIG.delivery;
  return Math.round(((D.fixed + contractDistance(contract) * D.perU) * cargoOf(contract).reward * share) / 5) * 5;
}

// A contract's cargo size and what it does (CONFIG.cargo.sizes). A contract
// without one (another pilot's lost cargo) is medium.
export const CARGO_SIZES = ['small', 'medium', 'large'];
export function cargoSize(contract) {
  return CARGO_SIZES.includes(contract?.size) ? contract.size : 'medium';
}
export function cargoOf(contract) {
  return CONFIG.cargo.sizes[cargoSize(contract)];
}

// The authored contracts' rewards, each its share of the freight rule (above).
for (const c of CONTRACTS) c.reward = freightReward(c, c.share);
// Other pilots' lost cargo (src/strangers.js) pays the rule itself.
for (const c of STRANGER_CONTRACTS) c.reward = freightReward(c);

// Other pilots' lost cargo (src/strangers.js) is a contract too, so the ledger
// can hold its id, but no station offers it (offersAt reads CONTRACTS only) and it
// is not one of the authored nine the pilot card counts.
const byId = new Map([...CONTRACTS, ...STRANGER_CONTRACTS].map((c) => [c.id, c]));

// Repeatable courier runs (FEATURE_PLAN.md 1.3; SX, 2026-09-26, on refresh:
// "runs always"). Once a station's own contracts are done it offers a run, and
// after every run the next. A run is not stored anywhere: its id,
// `run:<station id>:<n>`, is the nth run out of that station, and its cargo,
// destination and reward follow from the id alone, so a save only keeps ids.
const RUN = /^run:(station-[a-z0-9-]+):(\d{1,6})$/;
export const RUN_CARGO = ['MAIL SACKS', 'FOOD CRATES', 'FUEL CELLS', 'SENSOR PARTS', 'SEED VAULTS',
  'TOOL KITS', 'RADIO VALVES', 'ICE BLOCKS'];
// The stations a run can go to: every other station of `pool`, the stations that
// work now (src/ruins.js workingStationIds), so a restored station receives runs too
// and a ruin never does. The pool changes with every restoration, and with it where
// a run of a given number goes; that is why an accepted run is frozen into its job
// (quoteJob) and never resolved from its id again.
// The four stations that work from the start under the catalogue's start ruin (HALCYON): the pool a run is read against when
// none is given. Offers always give the pool that works now (offersAt), so a pilot whose start ruin is another reads his own.
export const INITIAL_POOL = Object.freeze(workingStationIds({ restored: new Set() }));
// The pool every run went to before the v1 economy (eight working stations, the four
// ruins of the time excluded): only for reading the cargo of an older save, whose
// jobs were not frozen (legacyJob).
export const LEGACY_POOL = Object.freeze(['station-drydock-j04', 'station-relay-j05', 'station-depot-k04',
  'station-yard-k05', 'station-commons-j06', 'station-spool-j06', 'station-apiary-k06', 'station-wharf-k06']);

function runContract(id, pool = INITIAL_POOL) {
  const m = RUN.exec(id);
  if (!m || !stationDefById(m[1])) return null;
  const from = m[1], n = Number(m[2]);
  const targets = pool.filter((to) => to !== from && stationDefById(to));
  if (!targets.length) return null;
  const h = hashId(id);
  // What it carries is the sending station's own goods (src/stationInfo.js; SX, 2026-09-30:
  // «каждая станция дает тематические заказы»), or the general list for one without.
  const goods = stationGoods(from) ?? RUN_CARGO;
  const run = { id, label: goods[h % goods.length], from, to: targets[(h >>> 8) % targets.length], run: n,
    size: CARGO_SIZES[(h >>> 16) % CARGO_SIZES.length] };
  // Priced by the freight rule, as every contract is.
  run.reward = freightReward(run);
  return run;
}

// The opening's first freight (src/opening.js; codex/start-and-narrative/CAMPAIGN.md 05, HANDOFF.md section 5; chat N1, 2026-10-04):
// `opening:<from>:<to>`, from the station the new pilot collects their shuttle at to the other working start station. Like a run it
// is its id alone: small, the sending station's own goods, priced as a run is (then CONFIG.delivery.base, as every new job), and no
// station offers it (offersAt reads CONTRACTS and runs): only the chapter's row does, once. Its target is generous where a run's is
// tight: OPENING_TARGET.times the par the same run would have, never under OPENING_TARGET.floor s (Codex's hypothesis
// max(180 s, 3 x par); ALIGNMENT.md asks for it to be calculated on its own: RELAY 12 to YARD 3 is 3,507 u, par 35 s, target 3:00;
// HALCYON to YARD 3 and RELAY 12 to HALCYON are shorter, 3:00 as well). Late still pays (the clock's own rule) and still counts.
// The floor a quarter shorter with every par since 2026-10-17 (CONFIG.delivery.parShare): 2:15.
export const OPENING_TARGET = Object.freeze({ floor: 135, times: 3 });
const OPENING = /^opening:(station-[a-z0-9-]+):(station-[a-z0-9-]+)$/;
export const openingJobId = (from, to) => `opening:${from}:${to}`;
export const isOpeningJob = (id) => typeof id === 'string' && OPENING.test(id);
export function openingContract(id) {
  const m = typeof id === 'string' && OPENING.exec(id);
  if (!m || m[1] === m[2] || !stationDefById(m[1]) || !stationDefById(m[2])) return null;
  const c = { id, label: (stationGoods(m[1]) ?? RUN_CARGO)[0], from: m[1], to: m[2], size: 'small' };
  c.reward = freightReward(c);
  c.par = Math.max(OPENING_TARGET.floor, OPENING_TARGET.times * parTime(c));
  return c;
}

// An authored contract, another pilot's, the opening's first freight, or a run resolved against `pool` (the four
// initial stations unless given). Offers pass the pool that works now; a carried or
// lost cargo is never looked up here but read from its frozen job (Progress.job).
export function contractById(id, pool = INITIAL_POOL) {
  if (isOpeningJob(id)) return openingContract(id);
  return byId.get(id) || (typeof id === 'string' && id.startsWith('run:') ? runContract(id, pool) : null);
}

// Whether an id names a contract at all, whatever the pool: a completed run is kept by
// its id alone, so its number is never offered twice; the opening's first freight likewise.
function isContractId(id) {
  if (byId.has(id)) return true;
  if (isOpeningJob(id)) return !!openingContract(id);
  const m = typeof id === 'string' && RUN.exec(id);
  return !!m && !!stationDefById(m[1]);
}

// ------------------------------------------------------------------ jobs ---

// A job is a contract as it was accepted: what, from where, to where, what size, its
// original reward and par, and how many stations were restored at that moment (the
// tariff, networkMultiplier). ECONOMY_V1_HANDOFF.md: «Freeze the multiplier and quoted
// job basis when accepting a delivery. Do not change a cargo's destination, price basis
// or par after a restoration or reload.» Carried or lost in space, a cargo is its job.
//
// And its terms, written into it (SX, 2026-10-04, his answer 1A on labs/graphics/sketches/economy-decisions.html: «an accepted
// delivery keeps its own terms, written into the job (price, timing, tariff)»): `tariff`, the multiplier itself, and `timing`, the
// delivery clock's rule (CONFIG.delivery's fastShare, fastBonus, lateStep, lateCut, floor). Until save v16 a job kept the count
// of stations and read the tariff's formula and the clock's rule from CONFIG when it was delivered, so a change of either
// revalued every cargo already accepted (Codex's economy study, 2026-10-03, section 4.1). A job of an older save is given the
// terms it was accepted under (src/storage.js, v15 -> v16; LEGACY_TERMS for one older still).
const timingNow = () => {
  const D = CONFIG.delivery;
  return { fastShare: D.fastShare, fastBonus: D.fastBonus, lateStep: D.lateStep, lateCut: D.lateCut, floor: D.floor };
};
// The terms every job accepted before save v16 was settled under, whatever its tariff: a literal, a fact about the past.
export const LEGACY_TIMING = Object.freeze({ fastShare: 0.6, fastBonus: 0.25, lateStep: 15, lateCut: 0.1, floor: 0.5 });
const legacyTariff = (network) => Math.round((1 + 0.2 * network) * 100) / 100;

// A job's reward is the contract's times CONFIG.delivery.base (1.35 since 2026-10-04), to 5 CR: the base of every new job, once;
// a job already accepted is never quoted again (it keeps its reward), so nothing is uplifted twice.
export function quoteJob(contract, restored = 0) {
  const network = Number.isInteger(restored) && restored > 0 ? Math.min(restored, RUIN_IDS.length) : 0;
  return {
    id: contract.id, label: contract.label, from: contract.from, to: contract.to,
    size: cargoSize(contract), reward: toFive(contract.reward * CONFIG.delivery.base), par: parTime(contract),
    network, tariff: networkMultiplier(network), timing: timingNow(),
  };
}

const toFive = (x) => Math.round(x / CONFIG.delivery.payRound) * CONFIG.delivery.payRound;

// What a job is quoted at when offered or accepted: its reward on its own tariff.
export function jobQuote(job) {
  return toFive(job.reward * job.tariff);
}

// What a delivery pays after `elapsed` seconds: the clock's pay (deliveryPay) on the
// original reward under the job's own timing, times its own tariff, to 5. `base` is the clock's pay alone.
export function jobPay(job, elapsed) {
  const timed = deliveryPay(job, elapsed, job.timing);
  const multiplier = job.tariff;
  return { ...timed, base: timed.pay, pay: Math.max(0, toFive(timed.pay * multiplier)), multiplier };
}

// A job's timing from a save: each of the clock's five numbers finite and in reason. Null when any is not.
function readTiming(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { fastShare, fastBonus, lateStep, lateCut, floor } = raw;
  const within = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
  if (!within(fastShare, 0, 0.99) || !within(fastBonus, 0, 1) || !within(lateStep, 1, 600) || !within(lateCut, 0, 1) || !within(floor, 0, 1)) return null;
  return { fastShare, fastBonus, lateStep, lateCut, floor };
}

// A job from a save, untrusted: known stations, a known size, whole credits and a par
// in reason, a tariff no higher than every ruin restored, and its terms: a tariff from 1 to what the most generous rule
// ever gave its count (1 + 0.2 a station), a timing in reason. A job without terms is one accepted before they were kept
// (save v15 and older, through legacyJob): its terms are the ones of that time. Null when any is not.
function readJob(raw, id) {
  if (!raw || typeof raw !== 'object') return null;
  if (!stationDefById(raw.from) || !stationDefById(raw.to) || raw.from === raw.to) return null;
  if (typeof raw.label !== 'string' || !raw.label || raw.label.length > 40) return null;
  if (!CARGO_SIZES.includes(raw.size)) return null;
  if (!Number.isInteger(raw.reward) || raw.reward < 0 || raw.reward > 10000) return null;
  if (!Number.isFinite(raw.par) || raw.par <= 0 || raw.par > 3600) return null;
  if (!Number.isInteger(raw.network) || raw.network < 0 || raw.network > RUIN_IDS.length) return null;
  const kept = raw.tariff === undefined && raw.timing === undefined;
  const tariff = kept ? legacyTariff(raw.network) : raw.tariff;
  const timing = kept ? { ...LEGACY_TIMING } : readTiming(raw.timing);
  if (!Number.isFinite(tariff) || tariff < 1 || tariff > legacyTariff(raw.network) || !timing) return null;
  return { id, label: raw.label, from: raw.from, to: raw.to, size: raw.size, reward: raw.reward, par: raw.par, network: raw.network, tariff, timing };
}

// The job of a cargo an older save carried or lost, which kept only the contract's
// id: resolved as that build resolved it (a run against the pool of the time), at
// the original tariff and under the terms of the time.
export function legacyJob(id) {
  const c = contractById(id, LEGACY_POOL);
  return c ? { ...quoteJob(c, 0), reward: c.reward, tariff: legacyTariff(0), timing: { ...LEGACY_TIMING } } : null;
}

// The delivery clock (CONFIG.delivery). The straight distance between a
// contract's two stations, across the sector grid.
export function contractDistance(contract) {
  const a = stationDefById(contract.from), b = stationDefById(contract.to);
  const sa = a && sectorById(a.sectorId), sb = b && sectorById(b.sectorId);
  if (!sa || !sb) return 0;
  const ax = (sa.col + a.x) * SECTOR_SIZE.width, ay = (sa.row + a.y) * SECTOR_SIZE.height;
  const bx = (sb.col + b.x) * SECTOR_SIZE.width, by = (sb.row + b.y) * SECTOR_SIZE.height;
  return Math.hypot(bx - ax, by - ay);
}

// Seconds a contract should take: a bigger cargo is given more. A job carries the
// par it was accepted with.
export function parTime(contract) {
  if (Number.isFinite(contract?.par) && contract.par > 0) return contract.par;
  const D = CONFIG.delivery;
  const raw = (D.parBase + contractDistance(contract) / D.parPace) * cargoOf(contract).par * D.parShare;
  return Math.max(D.parRound, Math.round(raw / D.parRound) * D.parRound);
}

// m:ss, for a par or a countdown.
export function clockText(seconds) {
  const t = Math.max(0, Math.round(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// What a delivery pays after `elapsed` seconds. `status` is 'fast' (under par,
// with a bonus), 'onTime' or 'late'; `change` is the bonus or cut as a share of
// the reward (+0.25, -0.2). `timing` is the clock's rule: a job's own (jobPay), else today's.
export function deliveryPay(contract, elapsed, timing = timingNow()) {
  const D = { ...timing, payRound: CONFIG.delivery.payRound };
  const par = parTime(contract);
  const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  let change = 0;
  if (t <= par) {
    const fast = Math.max(0, Math.min(1, (par - t) / (par * (1 - D.fastShare))));
    change = D.fastBonus * fast;
  } else {
    change = -Math.min(1 - D.floor, Math.ceil((t - par) / D.lateStep - 1e-9) * D.lateCut);
  }
  const pay = Math.max(0, Math.round(contract.reward * (1 + change) / D.payRound) * D.payRound);
  const status = t > par ? 'late' : change > 0 && pay > contract.reward ? 'fast' : 'onTime';
  return { pay, par, elapsed: t, change, status };
}

// Contracts this station is currently offering: not already completed, not
// the one already being carried, and not one whose cargo lies stranded in
// space. That cargo is the contract now; the station has no second copy.
export function offersAt(stationId, ledger) {
  // A ruin (src/ruins.js) offers nothing until it is restored, and nothing is sent to
  // one: an authored contract bound for a ruin waits, and runs go where stations work.
  // The pilot's home garage (src/home.js) is no part of the freight network: it offers nothing.
  // Since the frontier (src/frontier.js, 2026-10-02) only stations in open sectors send and receive: a contract bound past a
  // closed border waits as one bound for a ruin does, and a run goes only where the pilot can fly.
  const station = stationDefById(stationId);
  if (!station || station.kind === 'home' || !isRestored(ledger, station)) return [];
  const pool = reachableStationIds(ledger);
  if (!pool.includes(stationId)) return [];
  const planned = new Set(contentLinks('freight-route', ledger)
    .filter((p) => p.anchorId === stationId && pool.includes(p.targetId) && p.targetId !== stationId)
    .map((p) => p.targetId));
  const own = CONTRACTS.filter((c) =>
    c.from === stationId &&
    pool.includes(c.to) &&
    !ledger.completed.has(c.id) &&
    ledger.active?.id !== c.id &&
    !ledger.stranded.has(c.id));
  if (own.length) return own.sort((a, b) => Number(planned.has(b.to)) - Number(planned.has(a.to)));
  // Then the next run from here: numbered past every run from here already
  // done, carried or lying in space.
  let n = 0;
  const taken = (id) => ledger.completed.has(id) || ledger.active?.id === id || ledger.stranded.has(id);
  while (taken(`run:${stationId}:${n}`)) n++;
  // An extra place in this offer's draw favours the planned lane while other working destinations remain possible.
  // Accepted/stranded jobs retain their frozen endpoints and quote; contractById itself keeps its ordinary meaning.
  const run = contractById(`run:${stationId}:${n}`, [...pool, ...planned]);
  return run ? [run] : [];
}

// The authored contracts a station offers now (offersAt, so exactly the menus' ACCEPT rows), in the catalogue's order: what the map's
// 04 CARGO lists and its stations' squares mark (SX's K2 on labs/graphics/sketches/last-cargo.html, 2026-10-14). One bound past a closed
// border, carried, lying in space or sent by a ruin is not waiting at a station.
export function authoredWaiting(ledger) {
  const offered = new Set();
  for (const from of new Set(CONTRACTS.filter((c) => !ledger.completed.has(c.id)).map((c) => c.from))) {
    for (const c of offersAt(from, ledger)) offered.add(c.id);
  }
  return CONTRACTS.filter((c) => offered.has(c.id));
}

// A lost cargo from a save: a contract the catalogue still has, in a sector it
// still has, at a finite position inside that sector, with its job (or, from an
// older save, the job its id resolved to then). Cause and trace are presentation;
// a malformed trace is dropped and the cargo kept.
function readStranded(s) {
  if (!s || typeof s !== 'object' || !isContractId(s.id)) return null;
  const job = readJob(s.job, s.id) || legacyJob(s.id);
  if (!job) return null;
  if (typeof s.sectorId !== 'string' || !sectorById(s.sectorId)) return null;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
  if (s.x < 0 || s.y < 0 || s.x > SECTOR_SIZE.width || s.y > SECTOR_SIZE.height) return null;
  return {
    sectorId: s.sectorId, x: s.x, y: s.y,
    cause: WRECK_CAUSES.includes(s.cause) ? s.cause : 'unknown',
    trace: sanitizeTrace(s.trace),
    obstacle: sanitizeObstacle(s.obstacle),
    job,
  };
}

// The pilot's progress: the wallet and everything that pays into it or out of it, and what the pilot has done and knows. It began
// as the contracts' ledger; since M4 it also settles the coins a pilot gathers, and since the v1 economy it records the ruins
// restored and the finds opened (src/ruins.js, src/rewards.js), the map known, the raids, the start ruin and the deal, because all
// of them move the same balance and must share one rule: a repeated call never pays or charges twice. Renamed from ContractLedger
// on 2026-10-05 (the code review's architecture finding 17, chat N1's refactoring piece); the world still holds it as
// `world.ledger`, and the save's `ledger` keeps its shape and keys (checks/save-migrations.mjs reads every fixture through it).
export class Progress {
  constructor() {
    this.active = null;          // { id, acceptedAt, job, lostOnce? }: acceptedAt on this.clock; `lostOnce` a cargo taken back after a wreck
    this.clock = 0;              // seconds of flight, the pilot's own; saved
    this.completed = new Set();  // contract ids paid out, ever
    this.credits = 0;
    this.stranded = new Map();   // contract id -> where its cargo was lost, and how
    this.heard = new Map();      // signal id -> what tuning it in taught or paid
    this.restored = new Set();   // ruined station ids restored (src/ruins.js)
    this.invested = new Map();   // ruined station id -> CR put in so far, short of its price (src/ruins.js)
    this.found = new Map();      // find id -> { content, kind, price } opened (src/rewards.js)
    this.marked = null;          // the find id a station marked (the locator blinks it, the map shows it), or null
    // What the pilot knows of the map (SX, 2026-10-02, the map's «Только известное»): the finds he has come up to (within the
    // reach of their menu) and not yet opened, and the sectors he has been in. A reached find leaves the locator's blink and
    // stays on the map; the sectors are drawn whole on the map and the others by their outline and name only.
    this.reached = new Set();    // find ids come up to (src/world.js stepCaches), opened or not
    this.visited = new Set();    // sector ids the ship has been in (the hidden one is never listed)
    // Where each find was laid when it opened (src/cachePlaces.js, 2026-10-02): find id -> { sector, x, y } (fractions),
    // kept after it is opened so the map shows it where it was; and the finds the game told the pilot of (a sector's
    // opening laid one: the map shows it, as it shows a reached one).
    this.placed = new Map();
    this.told = new Set();
    // This pilot's deal of the finds (src/rewards.js findsFor): which souvenir and paint each slot holds, or null for the
    // catalogue's own (an older save).
    this.deal = null;
    // This pilot's start ruin (src/sectors.js START_STATIONS: RELAY 12, HALCYON or YARD 3), or null for the catalogue's, HALCYON
    // (an older save, a ledger of a check).
    this.startRuin = null;
    this.broken = new Map();     // working station id -> CR still to repair it, after a wreck against it (2026-10-01)
    this.brokenLook = new Map(); // broken station id -> the share of it still standing, when not CONFIG.station.brokenLook (a raid's)
    this.wear = new Map();       // working station id -> the share of its hull lost to hard blows (0..1, CONFIG.station.wear); gone with its repair (2026-10-08)
    // Raids and guards (src/raids.js, 2026-10-02): the raid on now and when the next may come, on this.clock; the ruins
    // whose guards are beaten; when each ruin was restored (a fresh one stands in peace a while).
    this.raid = null;            // { stationId, startedAt, endsAt, size, down, paint, mix }: the squad's paint and the hulls still to beat, kept once it is made
    this.raidNext = null;        // the clock when the next raid may begin (null: not yet set)
    this.cleared = new Set();    // ruin ids whose guards are down
    this.restoredAt = new Map(); // ruin id -> this.clock at its restoration
    this.driven = new Map();     // station id -> this.clock when pirates were driven off it (a raid won), kept forward while the pilot is in its sector (src/raids.js gatherTally)
    this.guardsAt = new Map();   // ruin id -> this.clock when its guards were last beaten whole or ran (src/raids.js ruinGuarded: back `guardsEvery` s later); the start ruin's was `startGuardsAt` (save v22)
    // The rights the pilot has earned, by stable id (src/rewardLedger.js, save v23): a free find, the radio's thanks once. One record
    // to an id, settled in the same step as what it gives, so a reload or a double press grants nothing twice.
    this.claims = emptyClaims();
    // The first-dock support's offer (src/starterSupport.js, save v24): { offeredAt (this.clock), doneAtOffer (completed contracts then) }
    // once it has been made, or null. Its claim (`starter-support`) is in `claims`, with what was built.
    this.support = null;
    // Where TERRA stands, the planet CLIPPER's crew is led to (src/terra.js): { sector, x, y } (fractions of its sector) from the escort's
    // start, for good, as a laid find's place is (`placed`); null until then. Optional in the save, read leniently (no SAVE_VERSION step).
    this.terra = null;
  }

  // The job of a cargo carried or lying in space, or null.
  job(contractId) {
    if (this.active?.id === contractId) return this.active.job;
    return this.stranded.get(contractId)?.job ?? null;
  }

  activeJob() {
    return this.active?.job ?? null;
  }

  // Seconds the cargo of `contractId` has been on the clock, carried or lying in
  // space; null when it is neither.
  elapsed(contractId) {
    const record = this.active?.id === contractId ? this.active : this.stranded.get(contractId);
    return record && Number.isFinite(record.acceptedAt) ? Math.max(0, this.clock - record.acceptedAt) : null;
  }

  // Taking a cargo freezes its job at the tariff of this moment (quoteJob).
  accept(contract, atTime = this.clock, restored = this.restored.size) {
    if (this.active) return { ok: false, reason: 'ALREADY CARRYING CARGO' };
    if (this.completed.has(contract.id)) return { ok: false, reason: 'ALREADY DELIVERED' };
    if (this.stranded.has(contract.id)) return { ok: false, reason: 'CARGO IS STRANDED' };
    const job = quoteJob(contract, restored);
    this.active = { id: contract.id, acceptedAt: atTime, job };
    return { ok: true, contract, job, quote: jobQuote(job) };
  }

  // Idempotent on purpose. A second call with the same contract reports the
  // same outcome and does not pay twice, whether it came from a double press,
  // a reload, or one day a retried request.
  complete(contract) {
    if (this.completed.has(contract.id)) {
      return { ok: true, alreadySettled: true, reward: 0, credits: this.credits };
    }
    if (this.active?.id !== contract.id) {
      return { ok: false, reason: 'NOT CARRYING THIS CARGO' };
    }
    // The clock sets the pay (CONFIG.delivery), on the job's frozen basis and tariff.
    const settled = jobPay(this.active.job, this.clock - (this.active.acceptedAt || 0));
    this.completed.add(contract.id);
    this.active = null;
    this.credits += settled.pay;
    return { ok: true, alreadySettled: false, reward: settled.pay, credits: this.credits, timing: settled };
  }


  // Credits released by a broken rock. Unlike an authored pickup a drop has no
  // catalogue id and leaves no record: it exists once, in memory, and the
  // world removes it in the same step that pays it.
  collectDrop(value) {
    if (!Number.isInteger(value) || value < 1 || value > ROCK_COIN_MAX) return { ok: false, reason: 'DROP UNAVAILABLE' };
    this.credits += value;
    return { ok: true, reward: value, credits: this.credits };
  }

  // Coins knocked out of the hull by a collision. Never more than the wallet
  // holds; the world scatters exactly what this returns.
  spill(amount) {
    if (!Number.isInteger(amount) || amount < 0) return { ok: false, reason: 'BAD AMOUNT' };
    const lost = Math.min(amount, this.credits);
    this.credits -= lost;
    return { ok: true, lost, credits: this.credits };
  }

  // What pirates that destroyed the ship take (SX, 2026-09-29: "откупиться нельзя"):
  // since the v1 economy a fifth of the wallet, whole credits rounded down, never more
  // than 250 (CONFIG.economy.pirates), where it was every coin. The rest stays, and
  // so does everything bought. Returns how many; the world announces it.
  pirateLoss(cfg = CONFIG.economy.pirates) {
    const lost = Math.max(0, Math.min(Math.floor(this.credits * cfg.share), cfg.cap));
    this.credits -= lost;
    return lost;
  }

  // A wreck leaves the cargo where it fell. Doc 03: the same cargo goes back to
  // AVAILABLE with a new position and trace, and no carrier. Credits and
  // delivery history are never lost. Returns the contract, or null when
  // nothing was being carried.
  strandActive(record) {
    const lost = this.active;
    if (!lost) return null;
    this.active = null;
    // The cargo keeps its clock and its job while it lies in space, and the moment it
    // was lost, from which it waits CONFIG.stranded.returnAfter to be taken back.
    this.stranded.set(lost.id, { ...record, acceptedAt: lost.acceptedAt, job: lost.job, lostAt: this.clock });
    return lost.job;
  }

  // Lost cargo that waited too long goes back to its sending station (CONFIG.stranded
  // returnAfter): the record goes, so the station offers the contract again, as if never
  // taken, and a run's number is free again. Returns the jobs that went back.
  returnOverdue(wait = CONFIG.stranded.returnAfter) {
    const back = [];
    for (const [id, s] of this.stranded) {
      if (this.clock - (Number.isFinite(s.lostAt) ? s.lostAt : this.clock) < wait) continue;
      this.stranded.delete(id);
      back.push(s.job);
    }
    return back;
  }

  // Seconds before a lost cargo goes back, or null when it is not lying in space.
  returnsIn(contractId, wait = CONFIG.stranded.returnAfter) {
    const s = this.stranded.get(contractId);
    return s ? Math.max(0, wait - (this.clock - (Number.isFinite(s.lostAt) ? s.lostAt : this.clock))) : null;
  }

  // A wreck where cargo cannot be left lying (the hidden sector: nothing outside it
  // can point back in, SX, 2026-09-30): the cargo goes back to its sending station
  // and is offered again, as if never taken. No stranded record, no trace. Returns
  // the contract, or null when nothing was being carried.
  returnActive() {
    const lost = this.active;
    if (!lost) return null;
    this.active = null;
    return lost.job;
  }

  // Taking a stranded cargo is accepting it again, from where it lies. Same
  // shape as complete(): a repeat reports the settled state and changes nothing.
  recover(contractId, atTime = this.clock) {
    if (!this.stranded.has(contractId)) {
      return this.active?.id === contractId
        ? { ok: true, alreadySettled: true, contract: this.active.job }
        : { ok: false, reason: 'CARGO NO LONGER HERE' };
    }
    if (this.active) return { ok: false, reason: 'ALREADY CARRYING CARGO' };
    // Its clock goes on from when it was first taken, not from now, and its job
    // is the one it was accepted with.
    // It was lost once: the next wreck loses it (World wreckShip, SX, 2026-10-17: «один раз ты можешь его подобрать, на второй раз теряешь»).
    const { acceptedAt: kept, job } = this.stranded.get(contractId);
    this.stranded.delete(contractId);
    this.active = { id: contractId, acceptedAt: Number.isFinite(kept) ? kept : atTime, job, lostOnce: true };
    return { ok: true, alreadySettled: false, contract: job };
  }

  toJSON() {
    return {
      credits: this.credits,
      clock: this.clock,
      active: this.active,
      completed: [...this.completed],
      stranded: [...this.stranded].map(([id, s]) => ({ id, ...s })),
      heard: [...this.heard].map(([id, r]) => ({ id, ...r })),
      restored: [...this.restored],
      invested: [...this.invested].map(([id, amount]) => ({ id, amount })),
      found: [...this.found].map(([id, r]) => ({ id, ...r })),
      marked: this.marked,
      reached: [...this.reached],
      visited: [...this.visited],
      placed: [...this.placed].map(([id, p]) => ({ id, sector: p.sector, x: p.x, y: p.y })),
      told: [...this.told],
      deal: this.deal,
      startRuin: this.startRuin,
      broken: [...this.broken].map(([id, cost]) => (this.brokenLook.has(id) ? { id, cost, look: this.brokenLook.get(id) } : { id, cost })),
      wear: [...this.wear].map(([id, share]) => ({ id, share })),
      raid: this.raid,
      raidNext: this.raidNext,
      cleared: [...this.cleared],
      restoredAt: [...this.restoredAt].map(([id, at]) => ({ id, at })),
      driven: [...this.driven].map(([id, at]) => ({ id, at })),
      guardsAt: [...this.guardsAt].map(([id, at]) => ({ id, at })),
      claims: claimsToJSON(this.claims),
      support: this.support ? { ...this.support } : null,
      // (Written once it stands: a game without it writes the save it always wrote.)
      ...(this.terra ? { terra: { ...this.terra } } : null),
    };
  }

  // A pure parse (PLAN D1, 2026-10-03): the ledger comes back and nothing else changes. The save's start ruin and deal are the
  // ledger's, and the rest of the save is read through them (since 2026-10-05 the catalogue a pilot has is his ledger's own, and
  // nothing is put in force: src/sectors.js stationDefById, src/rewards.js findsFor, src/ruins.js ruinIdsOf).
  static fromJSON(raw) {
    const l = new Progress();
    if (!raw || typeof raw !== 'object') return l;
    // The pilot's start ruin first, then the deal: which station is a ruin, the ruins' list and the stations of the finds are read
    // through it below (what was restored or put in, a mark, a cargo's stations). A save without one has the catalogue's, HALCYON
    // broken as it always was.
    l.startRuin = START_STATIONS.includes(raw.startRuin) ? raw.startRuin : null;
    // The pilot's deal: what each find is, its station and its price, are read through it below (a mark, a find come
    // up to, a place). A save without one, or with one that is not a deal of this catalogue, has the catalogue's own.
    l.deal = dealOk(raw.deal) ? { souvenir: [...raw.deal.souvenir], paint: [...raw.deal.paint] } : null;
    return readRest(l, raw);
  }
}

// The rest of a save, read through the catalogue the save's start ruin and deal make, `l`'s (Progress.fromJSON).
function readRest(l, raw) {
  l.credits = Number.isFinite(raw.credits) && raw.credits >= 0 ? Math.floor(raw.credits) : 0;
  // A save from before the clock starts it at 0, and every cargo with it.
  l.clock = Number.isFinite(raw.clock) && raw.clock >= 0 ? raw.clock : 0;
  const onClock = (t) => (Number.isFinite(t) ? Math.min(Math.max(0, t), l.clock) : l.clock);
  // Only ids that still exist in the catalogue survive a load, so deleting a
  // contract from the game cannot resurrect it from an old save.
  l.completed = new Set((Array.isArray(raw.completed) ? raw.completed : []).filter((id) => isContractId(id)));
  const active = raw.active && isContractId(raw.active.id) ? raw.active : null;
  // The job it was accepted with, or, from a save before jobs were kept, the job
  // its id resolved to in that build (legacyJob). A cargo that resolves to neither
  // is dropped rather than carried somewhere it was never bound.
  const activeJob = active && (readJob(active.job, active.id) || legacyJob(active.id));
  l.active = active && activeJob && !l.completed.has(active.id)
    ? { id: active.id, acceptedAt: onClock(Number.isFinite(raw.clock) ? active.acceptedAt : NaN), job: activeJob, ...(active.lostOnce === true ? { lostOnce: true } : null) } : null;
  // Same rule for M4 records: only ids the catalogue still knows survive. (`claimed`, the authored
  // coins taken, is no longer read: the coins were cut on 2026-10-01.)
  // Signals heard, with what each taught. Unknown signals and words are
  // dropped; a malformed result keeps the record and loses only its detail.
  for (const r of Array.isArray(raw.heard) ? raw.heard : []) {
    if (!r || !signalDef(r.id) || l.heard.has(r.id)) continue;
    l.heard.set(r.id, r.kind === 'word' && wordDef(r.wordId)
      ? { kind: 'word', wordId: r.wordId, text: wordDef(r.wordId).text }
      : { kind: 'credits', amount: Number.isInteger(r.amount) && r.amount >= 0 ? r.amount : 0 });
  }
  // The ruins restored: only ruins the catalogue still has. What an older save had
  // put into ruins a part at a time was given back by its migration (src/storage.js).
  for (const id of Array.isArray(raw.restored) ? raw.restored : []) if (ruinIdsOf(l).includes(id)) l.restored.add(id);
  // What has gone into a ruin not yet restored (2026-10-01, parts of 50, 250, 500): only ruins of the
  // catalogue, whole positive credits, short of the price (a full one is a restoration, recorded as such).
  for (const r of Array.isArray(raw.invested) ? raw.invested : []) {
    const def = r && ruinIdsOf(l).includes(r.id) ? stationDefById(r.id, l) : null;
    if (!def || l.restored.has(r.id) || l.invested.has(r.id) || !Number.isInteger(r.amount) || r.amount <= 0) continue;
    if (r.amount >= def.cost) l.restored.add(r.id); else l.invested.set(r.id, r.amount);
  }
  // The finds opened: only finds the catalogue still has, with what they held and cost.
  // A find whose station is not restored cannot have been opened, and is dropped.
  for (const r of Array.isArray(raw.found) ? raw.found : []) {
    const f = r && findDef(r.id, l);
    if (!f || l.found.has(f.id) || (f.station && !l.restored.has(f.station))) continue;
    l.found.set(f.id, { content: f.content, kind: f.kind, price: Number.isInteger(r.price) && r.price >= 0 ? r.price : f.price });
  }
  // Stations a wreck broke (World.breakStation): stations the catalogue still has, a whole positive cost.
  for (const r of Array.isArray(raw.broken) ? raw.broken : []) {
    if (!r || !stationDefById(r.id) || l.broken.has(r.id) || !Number.isInteger(r.cost) || r.cost <= 0) continue;
    l.broken.set(r.id, r.cost);
    if (Number.isFinite(r.look) && r.look >= 0 && r.look <= 1) l.brokenLook.set(r.id, r.look);
  }
  // Hard blows a working station remembers (src/stationService.js wearStation; added 2026-10-08, so a save without it is a world of
  // stations undamaged): stations the catalogue still has that are not broken, a share lost short of the break (CONFIG.station.wear).
  for (const r of Array.isArray(raw.wear) ? raw.wear : []) {
    if (!r || !stationDefById(r.id) || l.wear.has(r.id) || l.broken.has(r.id) || !Number.isFinite(r.share) || !(r.share > 0) || r.share >= CONFIG.station.wear.breaks) continue;
    l.wear.set(r.id, r.share);
  }
  // Raids (src/raids.js): a raid on a station the catalogue still has, its times on the clock, its tally whole numbers.
  const raid = raw.raid;
  if (raid && stationDefById(raid.stationId) && Number.isFinite(raid.endsAt) && Number.isInteger(raid.size) && raid.size > 0) {
    const down = Number.isInteger(raid.down) ? Math.max(0, Math.min(raid.size - 1, raid.down)) : 0;
    l.raid = { stationId: raid.stationId, startedAt: onClock(raid.startedAt), endsAt: raid.endsAt, size: raid.size, down };
    // The squad's paint and the hulls still to beat, if they were made: a paint and kinds the catalogue still has.
    if (CONFIG.pirates.paints.some((q) => q.id === raid.paint)) l.raid.paint = raid.paint;
    if (raid.combat) l.raid.combat = readPirateCombat(raid.combat);
    if (Array.isArray(raid.mix)) l.raid.mix = raid.mix.filter((k) => Object.hasOwn(CONFIG.pirates.types, k)).slice(0, raid.size - down);
  }
  l.raidNext = Number.isFinite(raw.raidNext) && raw.raidNext >= 0 ? raw.raidNext : null;
  for (const id of Array.isArray(raw.cleared) ? raw.cleared : []) if (ruinIdsOf(l).includes(id)) l.cleared.add(id);
  for (const r of Array.isArray(raw.restoredAt) ? raw.restoredAt : []) {
    if (r && l.restored.has(r.id) && Number.isFinite(r.at)) l.restoredAt.set(r.id, onClock(r.at));
  }
  // Stations the pilot drove pirates off (src/raids.js): stations the catalogue still has, a time on the clock.
  for (const r of Array.isArray(raw.driven) ? raw.driven : []) {
    if (r && stationDefById(r.id) && Number.isFinite(r.at)) l.driven.set(r.id, onClock(r.at));
  }
  // When each ruin's guards were last beaten whole (src/raids.js ruinGuarded): ruins not restored, a time on the clock. A save from before
  // 2026-10-08 (no version step) holds only the start ruin's, as `startGuardsAt`.
  for (const r of Array.isArray(raw.guardsAt) ? raw.guardsAt : []) {
    if (r && ruinIdsOf(l).includes(r.id) && !l.restored.has(r.id) && Number.isFinite(r.at)) l.guardsAt.set(r.id, onClock(r.at));
  }
  if (Number.isFinite(raw.startGuardsAt) && !l.guardsAt.has(startRuinOf(l)) && !l.restored.has(startRuinOf(l))) l.guardsAt.set(startRuinOf(l), onClock(raw.startGuardsAt));
  // The rights earned (src/rewardLedger.js), read after the finds opened: a free find already opened is a right spent.
  l.claims = readClaims(raw.claims, l.found);
  // The first-dock support's offer (src/starterSupport.js): when it was made on the clock, how many runs the pilot had done.
  const sup = raw.support;
  l.support = sup && typeof sup === 'object' && Number.isFinite(sup.offeredAt) && Number.isInteger(sup.doneAtOffer) && sup.doneAtOffer >= 0
    ? { offeredAt: onClock(sup.offeredAt), doneAtOffer: sup.doneAtOffer } : null;
  // TERRA's place: a grid sector the catalogue has, a place inside it; anything else is none.
  const ts = sectorById(raw.terra?.sector);
  if (ts && !ts.hidden && Number.isFinite(raw.terra.x) && Number.isFinite(raw.terra.y)) {
    l.terra = { sector: ts.id, x: Math.min(1, Math.max(0, raw.terra.x)), y: Math.min(1, Math.max(0, raw.terra.y)) };
  }
  // The mark, if it still names a find that is unlocked and not opened.
  const mark = findDef(raw.marked, l);
  l.marked = mark && !l.found.has(mark.id) && (!mark.station || l.restored.has(mark.station)) ? mark.id : null;
  // The finds come up to: a find that exists and was not locked (a save cannot know a place it had no way in to), and the
  // sectors been in: ones the catalogue still has, on the grid.
  for (const id of Array.isArray(raw.reached) ? raw.reached : []) {
    const f = findDef(id, l);
    if (f && (!f.station || l.restored.has(f.station))) l.reached.add(f.id);
  }
  for (const id of Array.isArray(raw.visited) ? raw.visited : []) if (sectorById(id) && !sectorById(id).hidden) l.visited.add(id);
  // The finds' places: a find the catalogue still has, in a grid sector, inside it. A save without them (before
  // 2026-10-02's places) has its finds laid again at the load (src/cachePlaces.js), the ones it knew where they were.
  for (const p of Array.isArray(raw.placed) ? raw.placed : []) {
    const f = findDef(p?.id, l), s = sectorById(p?.sector);
    if (!f || !s || s.hidden || !(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1)) continue;
    l.placed.set(f.id, Object.freeze({ sector: s.id, x: p.x, y: p.y }));
  }
  for (const id of Array.isArray(raw.told) ? raw.told : []) if (findDef(id, l) && l.placed.has(id)) l.told.add(id);
  // A cargo is in one place at a time: never both carried and lying in
  // space, never delivered and still lost, never two wrecks for one cargo.
  // A save from before the return (2026-10-01) has no moment of loss: its cargo waits
  // from the load on.
  for (const s of Array.isArray(raw.stranded) ? raw.stranded : []) {
    const record = readStranded(s);
    if (!record || l.completed.has(s.id) || l.active?.id === s.id || l.stranded.has(s.id)) continue;
    l.stranded.set(s.id, { ...record, acceptedAt: onClock(Number.isFinite(raw.clock) ? s.acceptedAt : NaN),
      lostAt: Number.isFinite(s.lostAt) ? onClock(s.lostAt) : l.clock });
  }
  return l;
}
