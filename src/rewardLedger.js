// The one reward ledger (chat N2, 2026-10-08; codex/economy-2026-10-03/CLAUDE_HANDOFF.md section 9: «Use stable ids and a single
// settlement boundary ... The economic claim and its owned item must settle together. On repeated interaction/load, return the prior
// result without charging, consuming another waiver, granting another item or emitting another celebration»).
//
// A claim is a right the pilot has earned, kept in the progress ledger (`ledger.claims`, saved in the ledger's own record) under a stable
// id, so a reload or a double press finds the right already used and grants nothing twice. Two kinds:
//
//   waiver  a find that costs nothing: { id, kind, earnedAt, find, station, of, redeemedFindId }. `find` names one find, `station` the
//           finds a station holds, `of` a kind of find ('souvenir' | 'paint'); a waiver names at least one, and fits a find that
//           meets every one it names. It is redeemed by the find it is spent on (`redeemedFindId`), inside src/rewards.js settleFind,
//           in the same step as the item and the record of the find: there is no state with the waiver spent and the item missing, or
//           the item given and the waiver still there. What a find costs this pilot (`priceFor`) is read from it, never decided anywhere
//           else.
//   cash    credits paid once: { id, kind, earnedAt, amount }. `payCash` credits the wallet and records the claim in one step; a second
//           call returns what the first paid and changes nothing.
//
//   build   credits put into a station's construction, never the wallet: { id, kind, earnedAt, station, amount, job } (the first-dock
//           support, src/starterSupport.js; chat N2 part 2). `recordBuild` records it once; the credit itself is src/ruins.js investRuin's
//           (`free`), made in the same step (src/ruinWork.js investStation), so a reload or a double press builds nothing twice.
//
// Ids of the opening's claims are CLAIM below; the economy handoff's other claims are chat N2's part 2, and add records of these kinds
// under ids of their own: a paint waiver for the start ruin and a choice waiver per later restoration (src/stationGifts.js:
// `start-paint`, `station-choice:<stationId>`, each naming the `station` and, where it must, the kind), the first-dock support
// (`starter-support`). The claims' time is the ledger's clock (the pilot's own, saved), never the wall's.
//
// Pure functions of a ledger (src/contracts.js Progress): nothing here emits an event or reads the world; the world says what happened
// (src/opening.js, src/finds.js). The queries run in the menus' step, so they allocate nothing.

export const CLAIM = Object.freeze({
  introSouvenir: 'intro-souvenir',       // the opening's first souvenir, free (SX's 9A): a waiver on the cache the chapter binds
  firstRun: 'guide-first-run',           // the radio's thanks for the first delivery, once (CONFIG.quests.guide.pay['first-run'])
  firstSouvenir: 'guide-first-souvenir', // the radio's thanks for the first souvenir, once (CONFIG.quests.guide.pay['a-souvenir'])
  guards: 'guide-the-guards',            // the radio's thanks for the start ruin's pirates beaten (slice 4; CONFIG.quests.guide.pay['the-guards'])
  firstCoins: 'guide-first-coins-in',    // ... for the first money put into it ('first-coins-in')
  rebuild: 'guide-rebuild',              // ... for the station restored ('rebuild')
  starterSupport: 'starter-support',     // the first-dock support, built into the start ruin once (economy handoff section 6)
  startPaint: 'start-paint',             // the start ruin's paint, free once it is restored (economy handoff section 8)
});
// A restored station's choice waiver: one of its two finds free (economy handoff section 8: «One choice waiver after each later restoration»).
export const stationChoiceId = (stationId) => `station-choice:${stationId}`;

export const emptyClaims = () => [];

// The claim with this id, or null.
export function claimOf(ledger, id) {
  const list = ledger.claims;
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
export const hasClaim = (ledger, id) => claimOf(ledger, id) !== null;

// A waiver earned: { ok, alreadyEarned, claim }. A waiver already earned is returned as it stands, and, while it is still unspent, is
// pointed at `find` when one is given (the chapter binds another cache when the first is gone). It names at least one of find, station,
// of; a waiver that names none would fit everything.
export function earnWaiver(ledger, id, { find = null, station = null, of = null } = {}) {
  const prior = claimOf(ledger, id);
  if (prior) {
    if (prior.kind !== 'waiver') return { ok: false, reason: 'NOT A WAIVER' };
    if (prior.redeemedFindId === null && find !== null) prior.find = find;
    return { ok: true, alreadyEarned: true, claim: prior };
  }
  if (!find && !station && !of) return { ok: false, reason: 'A WAIVER NAMES WHAT IT FITS' };
  const claim = { id, kind: 'waiver', earnedAt: ledger.clock, find, station, of, redeemedFindId: null };
  ledger.claims.push(claim);
  return { ok: true, alreadyEarned: false, claim };
}

const fits = (c, f) => c.kind === 'waiver' && c.redeemedFindId === null && (!c.find || c.find === f.id) && (!c.station || c.station === f.station)
  && (!c.of || c.of === f.kind);

// The waiver that fits find `f` (src/rewards.js): the earliest earned of those unspent, or null.
export function waiverFor(ledger, f) {
  const list = ledger.claims;
  if (!f || !list.length) return null;
  let best = null;
  for (let i = 0; i < list.length; i++) if (fits(list[i], f) && (!best || list[i].earnedAt < best.earnedAt)) best = list[i];
  return best;
}

// What this pilot pays to open find `f`: nothing under a waiver, else its price. The one place that is decided.
export function priceFor(ledger, f) {
  return waiverFor(ledger, f) ? 0 : f.price;
}

// A waiver spent on find `f` (called inside settleFind's commit, with the credit, the item and the record of the find).
export function redeemWaiver(claim, f) {
  claim.redeemedFindId = f.id;
}

// Credits built into a station's construction under claim `id` (the first-dock support), once: the record only; the credit is made by the
// caller in the same step. { ok, alreadySettled, amount }; a second call returns the first's amount and records nothing. Recorded even at 0
// (the support is claimed and over).
export function recordBuild(ledger, id, { station, amount, job = null }) {
  const prior = claimOf(ledger, id);
  if (prior) return { ok: true, alreadySettled: true, amount: prior.kind === 'build' ? prior.amount : 0 };
  if (!station || !Number.isInteger(amount) || amount < 0) return { ok: false, reason: 'BAD AMOUNT' };
  ledger.claims.push({ id, kind: 'build', earnedAt: ledger.clock, station, amount, job });
  return { ok: true, alreadySettled: false, amount };
}

// Credits paid once under claim `id`: { ok, alreadySettled, amount, credits }. The wallet and the record change together; a second call
// (a reload that repeats the step, a double press) returns the first's amount and changes nothing.
export function payCash(ledger, id, amount) {
  const prior = claimOf(ledger, id);
  if (prior) return { ok: true, alreadySettled: true, amount: prior.kind === 'cash' ? prior.amount : 0, credits: ledger.credits };
  if (!Number.isInteger(amount) || amount < 0) return { ok: false, reason: 'BAD AMOUNT' };
  ledger.credits += amount;
  ledger.claims.push({ id, kind: 'cash', earnedAt: ledger.clock, amount });
  return { ok: true, alreadySettled: false, amount, credits: ledger.credits };
}

// ------------------------------------------------------------------------------------------------------------- the save

export const claimsToJSON = (list) => list.map((c) => ({ ...c }));

const text = (v) => (typeof v === 'string' && v ? v : null);
function readClaim(r) {
  if (!r || typeof r !== 'object' || !text(r.id)) return null;
  const earnedAt = Number.isFinite(r.earnedAt) && r.earnedAt >= 0 ? r.earnedAt : 0;
  if (r.kind === 'cash') return Number.isInteger(r.amount) && r.amount >= 0 ? { id: r.id, kind: 'cash', earnedAt, amount: r.amount } : null;
  if (r.kind === 'build') return text(r.station) && Number.isInteger(r.amount) && r.amount >= 0 ? { id: r.id, kind: 'build', earnedAt, station: r.station, amount: r.amount, job: text(r.job) } : null;
  if (r.kind !== 'waiver') return null;
  const find = text(r.find), station = text(r.station), of = r.of === 'souvenir' || r.of === 'paint' ? r.of : null;
  if (!find && !station && !of) return null;
  return { id: r.id, kind: 'waiver', earnedAt, find, station, of, redeemedFindId: text(r.redeemedFindId) };
}

// A save's claims, untrusted (Progress.fromJSON, after the finds opened are read): records of a kind this build knows, one to an id,
// the first kept. A waiver aimed at a find that is already opened is spent on it: the item is owned, and a right cannot give it twice.
export function readClaims(raw, found) {
  const out = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const c = readClaim(r);
    if (c && !out.some((x) => x.id === c.id)) out.push(c);
  }
  for (const c of out) if (c.kind === 'waiver' && c.redeemedFindId === null && c.find && found?.has(c.find)) c.redeemedFindId = c.find;
  return out;
}
