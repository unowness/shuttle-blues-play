import { collectibleDef } from './progression.js';
import { paintById } from './paint.js';
import { startRuinOf, CATALOGUE_START_RUIN } from './sectors.js';
import { CONFIG } from './config.js';
import { sectorOpen } from './frontier.js';
import { waiverFor, redeemWaiver } from './rewardLedger.js';

// The two reward collections of the v1 economy (ECONOMY_V1_HANDOFF.md, SX + Codex,
// 2026-09-30; SX: «пусть четыре краски сразу летает, все остальные по координатам от
// других станций»). Twelve souvenirs and twelve paints, each found once, in a cache
// of its own, for a fixed price: 24 claims in all, never rerolled, never duplicated.
//
// Eight are tied to no ruin: four paints and three souvenirs open from the start, the fourth
// souvenir with the first sector the frontier opens (2026-10-02). The other sixteen belong to the
// eight ruins, two each: they are locked until that station is restored, then the
// station marks them on the locator. Since 2026-10-02 a find is laid, when it opens,
// in any open sector (src/cachePlaces.js), and stays there until opened: the places
// below are SX's, the pool it lays them on. Restoring a station grants no
// item: it gives access to a find, which still costs its price to open.
//
// A find's `id` is `find-<content>`: stable, unique, and what a save records. `station`
// is the ruin whose restoration unlocks it (null: open from the start). Positions are
// fractions of the sector, like stations. The first eight stand where eight of the old
// souvenir caches stood (already clear of every planet, hole, signal, coin and sign);
// each station's two stand 1,000-1,400 u from it, out of its docking ring's reach and
// at least 1,100 u from each other, placed by the search the checks repeat
// (checks/rewards.mjs). Prices: every souvenir 125 CR; the four paints of the start STARTER_PAINT_PRICE, the paints of the first four
// ruins 200, of the last four 250 (since 2026-10-04, SX's answer 5A on economy-decisions.html, Codex's study: half of what they were,
// 250 and 300 / 400 / 500; a find already opened keeps the price it was opened at). The start's paints went from 150 to 375 the same
// day (SX's answer 3 to chat SC: «дешево», he bought a souvenir and two paints in one pass; the paints dearer, not the wallet): two of
// them, 750, are more than the 400 a new pilot starts with and than what one holds when the opening lets go (the first freight and the
// radio's two pays: 610 to 670 on time, 720 at the fastest). One of them, a first souvenir free, is still in reach.
// What the game says where a find's price would stand when it costs this pilot nothing (a free claim, World.findPrice): the words
// the opening already gives for what it gives (SCOOTY's radio, «NO CHARGE»).
export const FREE_WORDS = 'NO CHARGE';
const find = (content, kind, sector, x, y, price, station = null, closedAtMost = null) =>
  Object.freeze({ id: `find-${content}`, content, kind, sector, x, y, price, station, closedAtMost });

export const SOUVENIR_PRICE = 125;
const S = SOUVENIR_PRICE;
export const STARTER_PAINT_PRICE = 375;
const SP = STARTER_PAINT_PRICE;

// The slots as SX laid them: which content each slot holds here is the catalogue's own deal (a pilot's deals it again, `findsFor`).
export const CATALOGUE = Object.freeze([
  // Not tied to a ruin: the four paints and three of the souvenirs from the start, the fourth souvenir with the first sector the
  // frontier opens (`closedAtMost`: open once no more than that many sectors are closed). SX, 2026-10-02, of the options: «4 краски
  // сразу, сувениры с секторами», as he first had it: «пусть четыре краски сразу летает»; then, after flying it, «Я также не
  // встретил ни одного бокса с сувениром в первых двух секторах, а должно быть доступно 3 и 1 дарит станция»: three at the
  // start, and the start's ruin gives the fourth (its two finds, below). Where each is laid when it opens is
  // src/cachePlaces.js's (any open sector: at the start, the start's two); the place written here is one of SX's places in the
  // pool it draws from.
  find('gamepad', 'souvenir', 'sector-j04', 0.30, 0.38, S),
  find('eva00', 'paint', 'sector-k06', 0.277, 0.945, SP),
  find('basketball', 'souvenir', 'sector-j06', 0.76, 0.12, S, null, 3),
  find('eva01', 'paint', 'sector-j04', 0.10, 0.08, SP),
  find('figurine', 'souvenir', 'sector-k04', 0.80, 0.50, S),
  find('eva02', 'paint', 'sector-k04', 0.055, 0.060, SP),
  find('disc', 'souvenir', 'sector-k05', 0.55, 0.30, S),
  find('eva03', 'paint', 'sector-k05', 0.12, 0.60, SP),
  // Unlocked by restoring a ruin, in the order of the ruins' prices.
  find('mixtape', 'souvenir', 'sector-j05', 0.09, 0.38, S, 'station-halcyon-j05'),
  find('express', 'paint', 'sector-j05', 0.164, 0.684, 200, 'station-halcyon-j05'),
  find('videotape', 'souvenir', 'sector-k04', 0.362, 0.224, S, 'station-foundry-k04'),
  find('neon', 'paint', 'sector-k04', 0.10, 0.66, 200, 'station-foundry-k04'),
  find('instant-photo', 'souvenir', 'sector-j06', 0.40, 0.41, S, 'station-commons-j06'),
  find('arctic', 'paint', 'sector-j06', 0.09, 0.18, 200, 'station-commons-j06'),
  find('manga', 'souvenir', 'sector-k05', 0.14, 0.88, S, 'station-spool-j06'),
  find('carbon', 'paint', 'sector-j04', 0.075, 0.439, 200, 'station-spool-j06'),
  find('handheld', 'souvenir', 'sector-j06', 0.35, 0.60, S, 'station-pharos-j06'),
  find('patina', 'paint', 'sector-j06', 0.090, 0.756, 250, 'station-pharos-j06'),
  find('floppy', 'souvenir', 'sector-k06', 0.10, 0.81, S, 'station-apiary-k06'),
  find('royal', 'paint', 'sector-k06', 0.30, 0.24, 250, 'station-apiary-k06'),
  find('virtual-pet', 'souvenir', 'sector-k06', 0.64, 0.11, S, 'station-wharf-k06'),
  find('dune', 'paint', 'sector-k06', 0.73, 0.40, 250, 'station-wharf-k06'),
  find('crt-monitor', 'souvenir', 'sector-k06', 0.46, 0.70, S, 'station-hoist-k06'),
  // The twelfth paint: its look is SX's to choose (src/paint.js, PENDING_PAINT).
  find('paint-12', 'paint', 'sector-k06', 0.594, 0.823, 250, 'station-hoist-k06'),
]);

// A pilot's own deal (SX, 2026-10-02: «сделай так чтобы сувениры и цвета доступные на старте для каждого юзера рандомно
// генерировались»): which souvenir and which paint each slot of the catalogue holds. A slot is everything but the content: its
// kind, place, price, station and `closedAtMost`; so a new pilot's four start paints, the souvenirs that come with the sectors
// and a ruin's two are drawn from the whole collection, each content once. PAINT 12 (its look not yet SX's, src/paint.js) keeps
// its slot. The deal is the pilot's ledger's (`deal`, src/contracts.js Progress: World.dealNew, or the save), so each world has
// its own (2026-10-05, chat E1's refactoring piece; until then one deal was put in force for the whole process): what reads a
// find for a pilot asks with his ledger, `findsFor(ledger)`, `findDef(id, ledger)`. `FINDS` is the finds of a pilot with no deal
// of his own (an older save, a World of a check, the map editor): the catalogue's slots as they are. Where the slots lie is the
// same under every deal and roll, so what keeps clear of a find reads `CATALOGUE`.
export const FINDS = CATALOGUE;
const kindsOf = (kind) => CATALOGUE.filter((f) => f.kind === kind);
const FIXED = Object.freeze(['paint-12']);
// The catalogue's own deal: each kind's contents in its slots' order.
export const catalogueDeal = () => ({ souvenir: kindsOf('souvenir').map((f) => f.content), paint: kindsOf('paint').map((f) => f.content) });
// Whether `deal` is a deal of this catalogue: each kind a permutation of its contents, the fixed ones in their slots.
export function dealOk(deal) {
  if (!deal || typeof deal !== 'object') return false;
  return ['souvenir', 'paint'].every((kind) => {
    const slots = kindsOf(kind), list = deal[kind];
    if (!Array.isArray(list) || list.length !== slots.length || new Set(list).size !== list.length) return false;
    if (!list.every((c) => slots.some((s) => s.content === c))) return false;
    return slots.every((s, i) => !FIXED.includes(s.content) || list[i] === s.content);
  });
}
// A new deal: each kind's contents shuffled over its slots by `rng`, the fixed ones left where they are.
export function rollDeal(rng) {
  const out = {};
  for (const kind of ['souvenir', 'paint']) {
    const slots = kindsOf(kind), free = slots.map((s) => s.content).filter((c) => !FIXED.includes(c));
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    out[kind] = slots.map((s) => (FIXED.includes(s.content) ? s.content : free.shift()));
  }
  return out;
}
// The finds a deal makes (the catalogue's own when it is not a good one). The two slots of the start's ruin (HALCYON's in the
// catalogue) belong to the pilot's start ruin (src/sectors.js START_STATIONS, SX 2026-10-02: «каждому игроку из 3 станций
// рандомно достается первая сломанная»): the souvenir and the paint its restoration gives follow the roll.
function dealt(deal, startRuin) {
  const use = dealOk(deal) ? deal : catalogueDeal();
  const list = [];
  const at = { souvenir: 0, paint: 0 };
  for (const slot of CATALOGUE) {
    const content = use[slot.kind][at[slot.kind]++];
    const station = slot.station === CATALOGUE_START_RUIN ? startRuin : slot.station;
    list.push(content === slot.content && station === slot.station ? slot : Object.freeze({ ...slot, id: `find-${content}`, content, station }));
  }
  return { list: Object.freeze(list), byId: new Map(list.map((f) => [f.id, f])) };
}
// Each deal's finds under each start ruin, made once and never changed after, so a frame's asking makes nothing. A deal is the
// ledger's own object, set whole (World.dealNew, Progress.fromJSON) and never edited in place; none is the catalogue's own.
const DEALS = new WeakMap(), OWN = new Map();
function dealOf(ledger) {
  const deal = ledger.deal && typeof ledger.deal === 'object' ? ledger.deal : null, startRuin = startRuinOf(ledger);
  let byRuin = deal ? DEALS.get(deal) : OWN;
  if (!byRuin) DEALS.set(deal, byRuin = new Map());
  let made = byRuin.get(startRuin);
  if (!made) byRuin.set(startRuin, made = dealt(deal, startRuin));
  return made;
}
const OWN_IDS = new Map(FINDS.map((f) => [f.id, f]));
// The pilot's finds, his deal under his start ruin; `FINDS` for no ledger.
export const findsFor = (ledger) => (ledger ? dealOf(ledger).list : FINDS);
export const findDef = (id, ledger = null) => (ledger ? dealOf(ledger).byId : OWN_IDS).get(id) || null;
export const findsIn = (sectorId, ledger = null) => findsFor(ledger).filter((f) => f.sector === sectorId);
export const findsOf = (stationId, ledger = null) => findsFor(ledger).filter((f) => f.station === stationId);

// What a find holds, by name: the souvenir's or the paint's label.
export function findLabel(f) {
  if (!f) return '';
  return f.kind === 'paint' ? (paintById(f.content)?.label ?? f.content) : (collectibleDef(f.content)?.label ?? f.content);
}
export const findTitle = (f) => (f?.kind === 'paint' ? 'PAINT CACHE' : f?.kind === 'look' ? 'LOOK CACHE' : 'SOUVENIR CACHE');   // a look's is src/looks.js

// Opened to the pilot by the rule, wherever it lies: its station restored, or, for one of no station, from the start or once
// the frontier has opened enough sectors (`closedAtMost`). Asked per frame: it allocates nothing.
export function ruleUnlocked(f, ledger) {
  if (!f) return false;
  if (f.station) return !!ledger?.restored?.has(f.station);
  if (f.closedAtMost == null) return true;
  let closed = 0;
  for (const id of CONFIG.frontier.order) if (!sectorOpen(ledger, id)) closed++;
  return closed <= f.closedAtMost;
}

// Where a find lies: where src/cachePlaces.js laid it for this pilot (the ledger's `placed`), else the catalogue's place (a
// World of a check, which lays nothing, and a find opened before places were laid).
export const placeOf = (f, ledger) => ledger?.placed?.get(f.id) ?? f;

// A find as the world reads it, at its place: the catalogue's own object when it lies where the catalogue says, else one
// with its laid sector and fractions, made once per place, so a frame asks it without making anything new. Kept per find as
// dealt (`from`): another pilot's deal has another find under the same id.
const laid = new Map();
export function placedFind(f, ledger) {
  if (!f) return f;
  const p = placeOf(f, ledger);
  if (p === f || (p.sector === f.sector && p.x === f.x && p.y === f.y)) return f;
  const key = `${p.sector}|${p.x}|${p.y}`, was = laid.get(f.id);
  if (was && was.key === key && was.from === f) return was.def;
  const def = Object.freeze({ ...f, sector: p.sector, x: p.x, y: p.y });
  laid.set(f.id, { key, from: f, def });
  return def;
}

// Unlocked: opened by the rule and lying in a sector open to the pilot (the frontier, src/frontier.js, 2026-10-02: no quest,
// tip, mark or bearing leads past a closed border; a laid find always lies in an open one). Claimed: opened and paid for.
// Available: unlocked and not yet claimed, which is what the world builds.
const isUnlocked = (f, ledger) => ruleUnlocked(f, ledger) && sectorOpen(ledger, placeOf(f, ledger).sector);
export const isClaimed = (f, ledger) => !!f && !!ledger?.found?.has(f.id);
export const isAvailable = (f, ledger) => isUnlocked(f, ledger) && !isClaimed(f, ledger);
// The available finds lying in a sector, at their places.
export const availableIn = (sectorId, ledger) =>
  findsFor(ledger).filter((f) => isAvailable(f, ledger) && placeOf(f, ledger).sector === sectorId).map((f) => placedFind(f, ledger));

// The station's next find to point at: the first unclaimed one after `current` (so the
// same action steps from the souvenir to the paint), or null when both are claimed.
export function nextFindOf(stationId, ledger, current = null) {
  const open = findsOf(stationId, ledger).filter((f) => isAvailable(f, ledger));
  if (!open.length) return null;
  const at = open.findIndex((f) => f.id === current);
  return open[(at + 1) % open.length];
}

// How many of each collection are claimed, of how many.
export function collectionCount(ledger, kind) {
  const all = findsFor(ledger).filter((f) => f.kind === kind);
  return { have: all.filter((f) => isClaimed(f, ledger)).length, of: all.length };
}

// Opening a find: the third repeat-safe settlement, the same shape as settleCache was
// and Progress.complete is. Every refusal is checked before anything changes;
// from the debit on nothing can refuse, and the debit, the item and the record happen
// together. A second call returns the recorded result and charges nothing. Short of
// credits, the wallet and the cache are both left as they were. What this pilot pays for it is the
// ledger's to say (src/rewardLedger.js priceFor): nothing under a waiver he has earned, else its price. The waiver is spent
// in the same step as the debit, the item and the record, recorded as the price it was opened at (0 for a free one).
export function settleFind(ledger, collection, pilot, f) {
  if (!f || !findDef(f.id, ledger)) return { ok: false, reason: 'CACHE UNAVAILABLE' };
  const prior = ledger.found.get(f.id);
  if (prior) return { ok: true, alreadySettled: true, ...prior, credits: ledger.credits };
  if (!isUnlocked(f, ledger)) return { ok: false, reason: 'CACHE IS SEALED' };
  const waiver = waiverFor(ledger, f), price = waiver ? 0 : f.price;
  if (ledger.credits < price) return { ok: false, reason: `NEED ${price} CR, HAVE ${ledger.credits}`, need: price, have: ledger.credits };
  if (f.kind === 'souvenir' && !collectibleDef(f.content)) return { ok: false, reason: 'CACHE IS EMPTY' };
  if (f.kind === 'paint' && !paintById(f.content)) return { ok: false, reason: 'CACHE IS EMPTY' };

  // Commit. Nothing below this line can refuse.
  ledger.credits -= price;
  if (waiver) redeemWaiver(waiver, f);
  const result = { content: f.content, kind: f.kind, price, claim: waiver ? waiver.id : null };
  if (f.kind === 'souvenir') {
    const inst = collection.grant(f.content, { source: f.id });
    pilot.charmFound(f.content);        // the first souvenir hangs from the locator at once (labs/graphics/charm.js)
    Object.assign(result, { instanceId: inst.id, isNew: inst.isNew, slot: inst.slot });
  } else {
    pilot.paints.add(f.content);
    pilot.wearPaint(f.content);
  }
  ledger.found.set(f.id, { content: f.content, kind: f.kind, price });
  if (ledger.marked === f.id) ledger.marked = null;
  return { ok: true, alreadySettled: false, ...result, credits: ledger.credits };
}

// A save's three records of what was found (the ledger's claims, the collection, the
// pilot's paints) brought into agreement, without charging anything, after a load:
//   - an item owned with its claim not recorded (a save from before this economy, when
//     old caches sold souvenirs and the hidden sector paints) is recorded as claimed at
//     price 0, so it is never sold again;
//   - a claim recorded with its item missing (a save that lost part of itself) gives
//     the item back, since it was paid for;
//   - a mark on a find that is not available any more is dropped.
// Returns how many claims were recorded and how many items given back.
export function reconcileFinds(ledger, collection, pilot) {
  let recorded = 0, restored = 0;
  for (const f of findsFor(ledger)) {
    const owned = f.kind === 'souvenir' ? collection.discovered.has(f.content) : pilot.paints.has(f.content);
    if (!ledger.found.has(f.id)) {
      if (owned) { ledger.found.set(f.id, { content: f.content, kind: f.kind, price: 0 }); recorded++; }
      continue;
    }
    if (owned) continue;
    if (f.kind === 'souvenir') collection.grant(f.content, { source: f.id });
    else pilot.paints.add(f.content);
    restored++;
  }
  if (ledger.marked && !isAvailable(findDef(ledger.marked, ledger), ledger)) ledger.marked = null;
  // And the charm that hangs (src/pilot.js settleCharm): the newest found for a save from before it.
  pilot.settleCharm(collection);
  return { recorded, restored };
}

