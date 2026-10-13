import { CONFIG } from './config.js';
import { sectorById } from './sectors.js';
import { ruinIdsOf, ruinDef, isRestored, stillToInvest, INVEST_STEPS } from './ruins.js';
import { sectorOpen } from './frontier.js';
import { findsFor, isAvailable } from './rewards.js';

// The quests' pacing rules, as pure functions of CONFIG (`quests`, `raids`) and a `facts` record of what the pilot has
// done (the quest economy, reports/2026-10-02-quest-economy.md; SX, 2026-10-02: «квесты не сразу прям все открыты были,
// а как-то равномерно подавались, открывались там новые когда чинится станции ... вначале было по квестам побогаче ...
// новых квестов все меньше к концу появляется ... но ты не был завален заданиями»). The game's rollers (src/quests.js,
// src/guide.js, src/pester.js, src/raids.js, src/specials.js) and the simulator that measures them
// (tools/quest-economy-sim.mjs) both read their rules from here, so the curve that was measured is the curve that is built.
// Nothing here touches a world: a number in, a number out.
//
//   facts = { clock, deliveries, finds, souvenirs, paints, cleared, restored, heard, credits, invested, firstRestoredAt,
//             cheapest, carrying, fought, homed }
//   clock            the pilot's clock, s (Progress.clock)
//   deliveries       cargo delivered, any (the ledger's `completed`)
//   finds / souvenirs / paints   caches opened, in all and by kind
//   cleared          ruins whose guards are beaten
//   restored         stations restored: the count every table is keyed on
//   heard            signals tuned in
//   credits          the wallet
//   invested         whether any money has gone into a ruin (restored ones included)
//   firstRestoredAt  the clock of the earliest restoration, or null
//   cheapest         { id, left } the ruin cheapest to finish (on the grid), or null
//   carrying         a cargo is on the tether (the ledger's `active`)
//   fought           a first pirate fight won (Pilot.fought)
//   homed            the home garage docked at once (Pilot.homed)

const Q = () => CONFIG.quests;
const R = () => CONFIG.raids;

// A table of rows [x, a, b, ...] read at x, straight between the rows and flat beyond them: the values of the row.
export function lerpTable(table, x) {
  if (x <= table[0][0]) return table[0].slice(1);
  for (let i = 1; i < table.length; i++) {
    const [x1] = table[i], [x0] = table[i - 1];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return table[i].slice(1).map((v, k) => table[i - 1][k + 1] + (v - table[i - 1][k + 1]) * t);
    }
  }
  return table[table.length - 1].slice(1);
}

// ------------------------------------------------------------------------------------------------------- the facts

// The ruin cheapest to finish among those on the grid not restored, or null. Only one in an open sector (the frontier,
// src/frontier.js): one past a closed border cannot be funded.
export function cheapestRuin(ledger) {
  let best = null;
  for (const id of ruinIdsOf(ledger)) {
    const def = ruinDef(id, ledger);
    if (!def || isRestored(ledger, def) || sectorById(def.sectorId)?.hidden || !sectorOpen(ledger, def.sectorId)) continue;
    const left = stillToInvest(ledger, def);
    if (!best || left < best.left) best = { id, left };
  }
  return best;
}

// What the rules read, taken from a ledger. `fought` and `homed` are the pilot's (Pilot), `clock` replaces the ledger's
// (the simulator keeps its own).
export function factsOf(ledger, { fought = false, homed = false, clock = ledger.clock } = {}) {
  let souvenirs = 0, paints = 0, firstRestoredAt = null;
  for (const f of ledger.found.values()) { if (f.kind === 'paint') paints += 1; else souvenirs += 1; }
  for (const at of ledger.restoredAt.values()) if (firstRestoredAt === null || at < firstRestoredAt) firstRestoredAt = at;
  // The caches open to find now, by kind (src/rewards.js: four paints from the start, souvenirs as the frontier opens).
  let souvenirsOpen = 0, paintsOpen = 0;
  for (const f of findsFor(ledger)) if (isAvailable(f, ledger)) { if (f.kind === 'paint') paintsOpen += 1; else souvenirsOpen += 1; }
  return {
    clock, deliveries: ledger.completed.size, finds: ledger.found.size, souvenirs, paints, cleared: ledger.cleared.size,
    restored: ledger.restored.size, heard: ledger.heard.size, credits: ledger.credits,
    invested: ledger.restored.size > 0 || ledger.invested.size > 0, firstRestoredAt, cheapest: cheapestRuin(ledger),
    souvenirsOpen, paintsOpen, carrying: !!ledger.active, fought: !!fought, homed: !!homed,
  };
}
export const factsOfWorld = (world) => factsOf(world.ledger, { fought: world.pilot?.fought, homed: world.pilot?.homed });

// ------------------------------------------------------------------------------------------------------- side quests

// The rest, s, after the side slot frees: by stations restored (CONFIG.quests.rest). src/sideSlot.js restSide sets the world's
// clock by it.
export const restFor = (restored) => lerpTable(Q().rest, restored)[0];

// Whether a kind of side quest may be offered yet (CONFIG.quests.unlock). `begun`: the restoration of a station has begun, money is in a
// ruin (`facts.invested`: SX, 2026-10-09, «как только мы начали квест по сбору станции, уже должны быть сайт-квесты про помощь NPC,
// сайт-квесты по рейдам, и прочее»): a kind that waited for a number of runs, a cache or a restored station comes with the first money if
// that is sooner than its own gate, and a kind with `begun` alone comes with it.
export function unlocked(kind, facts) {
  const u = Q().unlock[kind];
  if (!u) return true;
  const gated = u.deliveries || u.finds || u.cleared || u.restored;
  const met = !gated || (!(u.deliveries && facts.deliveries < u.deliveries) && !(u.finds && facts.finds < u.finds) &&
    !(u.cleared && facts.cleared < u.cleared) && !(u.restored && facts.restored < u.restored));
  return u.begun ? (gated ? met : false) || !!facts.invested : met;
}

// The freight hint's rule (src/freight.js; SX, 2026-10-09: «вот я дошел до миссии, где надо вложить деньги, мне нет денег»): the pilot is
// stuck when a ruin is there to fund, a cargo is not on the tether, and the wallet is under the least the ruin takes at a time. That
// is the first instalment (INVEST_STEPS[0], 50 CR), or what is left of the ruin when that is less (the last credits restore it): a
// wallet under it cannot put a coin in, which is what stuck means here; a wallet that can is the pilot's own business (the plate of
// the story or the ruin's own says what is left). The ruin is the cheapest to finish on the grid (`facts.cheapest`: the pilot's start
// ruin while the opening runs, the only one in an open sector then). Whether the pilot has waited, whether the side slot is free and
// whether the chapter has come to funding are the world's (src/freight.js, src/quests.js).
export const leastStep = (left) => Math.min(INVEST_STEPS[0], left);
export const freightStuck = (facts) => !!facts.cheapest && !facts.carrying && facts.credits < leastStep(facts.cheapest.left);

// ------------------------------------------------------------------------------------ the memory of the last 20 minutes

// What the pilot has met and been asked lately, and the counterweights it gives (SX, 2026-10-02: «нам нужно под капотом считать
// сколько раз за последние 20 минут пилот встретил такого нпс и постепенно повышать вероятности встретить другого типа и также
// с квестами, то есть помогать другим нпс и квесты получать разных типов, но не прям чистое распределение просто система
// противовесов»). A memory is a list of notes { kind, key, at, weight } on the pilot's clock (`recent`, kept on the world, in
// memory only: a reload begins with none, which is flat weights, as the game was before this):
//   kind 'kind'  key a side quest's kind, noted when it is offered (weight 1)
//   kind 'ship'  key an NPC ship's code, noted when the pilot comes within sight of it (`met`) and when a quest is about it
//                (`asked`: a rescue, a wreck, a ship pestered)
// A note counts for 1 when new and fades straight to nothing over `window` s (a count is a sum, not a tally of the last 20
// minutes, so a type is not forgiven all at once). A count turns into a weight by `counterweight`: `lean` of it per point,
// never under `floor`, so what was met a lot is rarer but never shut out, and what was not met is the heaviest. Not an even
// draw and not a rota: the base weights (CONFIG.quests.weights) stay, the counts lean on them.
const M = () => Q().mix;

export const newRecent = () => [];
export function noteRecent(recent, kind, key, at, weight = 1) {
  recent.push({ kind, key, at, weight });
  while (recent.length && at - recent[0].at > M().window) recent.shift();
}
export function recentCount(recent, kind, key, now) {
  let n = 0;
  for (const note of recent) {
    if (note.kind !== kind || note.key !== key) continue;
    const age = now - note.at;
    if (age < M().window) n += note.weight * (1 - Math.max(0, age) / M().window);
  }
  return n;
}
export const counterweight = (count) => Math.max(M().floor, M().lean ** count);

// A kind drawn among those present, by its weight (CONFIG.quests.weights, 1 where none is said), leaned on by what was
// offered lately when a memory is given.
const kindWeight = (k, recent, now) => (Q().weights[k] ?? 1) * (recent ? counterweight(recentCount(recent, 'kind', k, now)) : 1);
export function pickKind(kinds, rng, recent = null, now = 0) {
  const total = kinds.reduce((s, k) => s + kindWeight(k, recent, now), 0);
  let u = rng() * total;
  for (const k of kinds) { u -= kindWeight(k, recent, now); if (u < 0) return k; }
  return kinds[kinds.length - 1];
}

// How much of its usual chance an offer keeps, 0 to 1: the weight the kinds present have left after what was offered lately, over
// what they had (never under `offerFloor`). With every kind present just offered (a pilot with only a pilot out of fuel to
// ask for) this thins the offers instead of repeating one kind at the same pace.
export function offerShare(kinds, recent, now) {
  if (!recent || !kinds.length) return 1;
  let left = 0, all = 0;
  for (const k of kinds) { all += Q().weights[k] ?? 1; left += kindWeight(k, recent, now); }
  return Math.max(M().offerFloor, left / all);
}

// How much a ship has been in the pilot's way lately (met and asked), and the weight that gives it.
export const shipContact = (recent, code, now) => (recent ? recentCount(recent, 'ship', code, now) : 0);
const shipWeight = (code, recent, now) => counterweight(shipContact(recent, code, now));

// A ship drawn among `codes`, leaning away from the ones the pilot has met or been asked about lately.
export function pickShip(codes, rng, recent = null, now = 0) {
  const total = codes.reduce((s, c) => s + shipWeight(c, recent, now), 0);
  let u = rng() * total;
  for (const c of codes) { u -= shipWeight(c, recent, now); if (u < 0) return c; }
  return codes[codes.length - 1];
}

// A money quest's pay once the network has grown: `grow` of it more for each station restored, to 5 CR.
export const growth = (restored) => 1 + Q().grow * Math.max(0, restored);
export const grownPay = (base, restored) => Math.round((base * growth(restored)) / 5) * 5;
// What each money quest pays with `restored` stations restored: its base in CONFIG, grown.
const BASE_PAY = {
  rescue: () => Q().rescue.pay, pester: () => Q().pester.pay, planet: () => Q().errand.pay,
  strangerFee: () => Q().stranger.fee, raidThanks: () => R().thanks,
};
export const payFor = (kind, restored) => grownPay(BASE_PAY[kind](), restored);

// ---------------------------------------------------------------------------------------------------- red quests

// A ship pestered may be called once the pilot's clock has run `first` s and (`afterFight`) a pirate fight has been won.
export const pesterOpen = ({ clock, fought }) => clock >= Q().pester.first && (!Q().pester.afterFight || !!fought);

// s from a pestering's end to the next one's start: a draw in the row for the stations restored.
export function pesterGap(restored, rng) {
  const [lo, hi] = lerpTable(Q().pester.gap, restored);
  return lo + (hi - lo) * rng();
}

// The clock when the first raid may fall: none before `restored` stations are restored or the restoration of one has begun (money in a
// ruin: `facts.invested`, SX, 2026-10-09; null otherwise), then `quiet` s after the first restoration and never before `notBefore`.
export function raidStartAt(facts) {
  const C = R();
  if (facts.restored < C.restored && !facts.invested) return null;
  return Math.max(C.notBefore, (facts.firstRestoredAt ?? facts.clock - C.quiet) + C.quiet);
}
// When the first raid is first due, set once at the first look that finds the gate open (src/raids.js settleRaidClock, tools/quest-economy-sim.mjs):
// the start the rule gives, and where the restoration has begun and no station is restored yet, `begunQuiet` s after that look at the least
// (a start that moved with the clock would never come; the quiet that follows a restoration is the restoration's, and this one is the first
// money's). Null while the gate is shut.
export function raidFirstDue(facts) {
  const start = raidStartAt(facts);
  if (start === null) return null;
  return facts.restored > 0 ? start : Math.max(start, facts.clock + R().begunQuiet);
}

// s from a raid's end to the next one's start.
export function raidGapFor(restored, rng) {
  const [lo, hi] = lerpTable(R().gap, restored);
  return lo + (hi - lo) * rng();
}

// ------------------------------------------------------------------------------------------------ reference ships

// The ship that comes next, as { id, restored, pay }: going round the order from the one after `last` (the ship whose turn
// ended last, met or not, done or not: src/pilot.js lastSpecial; from the first with none), the first whose note the pilot does
// not hold. A ship missed or failed comes again after the rest of the round, never before the others (SX, 2026-10-13: «Следующий
// по кругу»; the first of the order not held came every time, so a DELOREAN never met held the other five back for good: his
// friend's NOTES 0 / 6 after the whole game). Each still waits for its stations (specialDue). Null once all six are held.
export function nextSpecial(notes, last = null) {
  const order = Q().special.order, from = order.findIndex(([id]) => id === last) + 1;
  for (let k = 0; k < order.length; k++) {
    const [id, restored, pay] = order[(from + k) % order.length];
    if (!notes.has(id)) return { id, restored, pay };
  }
  return null;
}
export const specialPay = (id) => Q().special.order.find(([x]) => x === id)?.[2] ?? 0;

// The chance in one look of `seconds`, from a chance a minute.
export const rollChance = (perMinute, seconds) => 1 - (1 - perMinute) ** (seconds / 60);

// Whether the next reference ship is due now. `state` is { since, endedAt } (kept by the caller: `since` the clock at
// which a ship was first due, `endedAt` the clock at which the last one ended); `blocked` says the pilot is in no state to
// meet one (docked, in a fight): then nothing is rolled and the sure chance stays sure; `last` the ship whose turn ended
// last (nextSpecial). Not before `first`, nor the ship's own ruins; not within `rest` of the last one's end; then a chance a
// minute, and a sure one `pity` s after it ended (or after it was first due).
export function specialDue(state, { clock, restored }, notes, rng, seconds, blocked = false, last = null) {
  const C = Q().special, next = nextSpecial(notes, last);
  if (!next || clock < C.first || restored < next.restored) return false;
  state.since ??= clock;
  if (state.endedAt != null && clock - state.endedAt < C.rest) return false;
  if (blocked) return false;
  const waited = clock - Math.max(state.since, state.endedAt ?? -Infinity);
  return waited >= C.pity || rng() < rollChance(C.chance, seconds);
}
