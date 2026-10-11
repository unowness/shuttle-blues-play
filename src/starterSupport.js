// The first-dock support (codex/economy-2026-10-03/CLAUDE_HANDOFF.md section 6, «First-dock recovery contract»; chat N2 part 2,
// 2026-10-08): a deliberate one-time fallback for the pilot who is working but whose first station does not come.
//
//   1. Eligible: no station restored, `CONFIG.support.after` s (25 minutes) of the pilot's own clock flown, `deliveries` runs done.
//   2. Offered once, through the radio and a plate of the list: the offer's state is saved (`ledger.support`: when, and how many
//      deliveries the pilot had), so a reload keeps it and never offers again.
//   3. Qualified by a NEW delivery after the offer: the ledger's completed contracts past the count at the offer. A delivery made
//      before it does not count; a repeated hand-in of one contract is one (a contract completes once, src/contracts.js).
//   4. Claimed at the ruin, with its pirates down: the pilot comes to R (close by it) and the pirates on it are beaten (the support
//      waits, it never beats them for the pilot and never writes the investment before they are down: the guard's `invested > 0`
//      shortcut, src/raids.js ruinGuarded, is the thing not to exploit). At that moment
//         grant = max(0, what R still needs - max(0, wallet - keep))
//      is built into R's construction (src/ruinWork.js investStation with `support`: never the wallet, which is not touched), and the
//      claim `starter-support` is recorded in the same step, even at 0. The pilot finishes with their own money as they do any
//      restoration (or the grant finishes it, when the wallet is under the reserve).
//
// «Never use elapsed wall-clock time or offline time»: the clock is Progress.clock. «Never change which station is the starter after
// loading»: R is the ledger's start ruin. «One-time, nontransferable»: R's, once; it cannot fund a later station or a purchase.
//
// It does not stack with the opening chapter's money (ALIGNMENT.md): the chapter adds none of its own beyond the radio's thanks the
// economy counts (src/opening.js), and this is the economy's fallback for the pilot those do not carry. The pilot elsewhere in a chapter
// (mid-slice 3, say) is offered it all the same when the numbers say so: it is about the clock and the work, not the story.
//
// `stepSupport` runs every step of the world (src/quests.js stepQuests): integer comparisons, nothing made.
import { CONFIG } from './config.js';
import { startRuinOf, stationDefById } from './sectors.js';
import { stillToInvest, formatCR } from './ruins.js';
import { CLAIM, claimOf, recordBuild } from './rewardLedger.js';
import { QUEST_LINES as QL } from './questLines.js';
import { closeBy, guardsDown, radioFitted } from './opening.js';
import { postHeld } from './raids.js';

export const SUPPORT_ID = 'support:run';
const S = () => CONFIG.support;

// The ledger holds the offer and its terms: { offeredAt, doneAtOffer } or null.
export const supportOffered = (L) => L.support !== null;
export const supportClaimed = (L) => claimOf(L, CLAIM.starterSupport) !== null;
// Eligible for the offer now (the radio asked for by the world, below).
export const supportEligible = (L) => L.support === null && L.restored.size === 0 && L.clock >= S().after && L.completed.size >= S().deliveries;
// A new delivery after the offer.
export const supportQualified = (L) => L.support !== null && L.completed.size > L.support.doneAtOffer;
// What the support builds into the start ruin `def` now: what it still needs less what the wallet holds above the reserve.
export function supportGrant(L, def) {
  return Math.max(0, stillToInvest(L, def) - Math.max(0, L.credits - S().keep));
}

// The delivery that qualified the pilot (the first completed after the offer; a Set keeps its order), for the claim's record.
function qualifyingJob(L) {
  let i = 0;
  for (const id of L.completed) { if (i++ === L.support.doneAtOffer) return id; }
  return null;
}

export function stepSupport(world) {
  const L = world.ledger;
  if (L.restored.size > 0) {
    // The station restored before the claim: the support is over, recorded as built at 0 (it does not wait for a station that is there).
    if (L.support !== null && !supportClaimed(L)) recordBuild(L, CLAIM.starterSupport, { station: startRuinOf(L), amount: 0, job: null });
    return;
  }
  if (L.support === null) {
    if (supportEligible(L) && world.ship.alive && radioFitted(world)) offer(world, L);
    return;
  }
  if (!supportQualified(L) || supportClaimed(L)) return;
  const id = startRuinOf(L), def = stationDefById(id, L);
  // Qualified: said once, then claimed at the ruin with its pirates down.
  if (!world.supportSaid) {
    world.supportSaid = true;
    world.emit('starterSupport', { stage: 'ready', stationId: id, label: def.label, amount: 0, left: stillToInvest(L, def) });
    world.emit('guideHeard', { step: 'support', line: `RUN IN. COME TO ${def.label}: SUPPORT IS READY.` });
  }
  if (!world.ship.alive || world.sector.id !== def.sectorId || !guardsDown(L, id) || !closeBy(world, id) || postHeld(world, id)) return;
  const station = world.stations.find((s) => s.id === id);
  if (!station) return;
  const grant = supportGrant(L, def), job = qualifyingJob(L);
  if (grant > 0) world.investStation(station, grant, { support: { job } });
  else recordBuild(L, CLAIM.starterSupport, { station: id, amount: 0, job });
  if (!supportClaimed(L)) return;     // refused (the pirates came back this very step): asked again at the next
  world.questOutcomes.set(SUPPORT_ID, 'done');
  world.emit('starterSupport', { stage: 'built', stationId: id, label: def.label, amount: claimOf(L, CLAIM.starterSupport).amount, left: stillToInvest(L, def) });
}

function offer(world, L) {
  const id = startRuinOf(L), def = stationDefById(id, L);
  L.support = { offeredAt: L.clock, doneAtOffer: L.completed.size };
  world.supportSaid = false;
  world.emit('starterSupport', { stage: 'offered', stationId: id, label: def.label, amount: 0, left: stillToInvest(L, def) });
  // The radio's own flow (a step of the line heard: its lamp, its blip, the notch's page): the offer is said as the radio says a step.
  world.emit('guideHeard', { step: 'support', line: `ANY DELIVERY NOW BUILDS ${def.label}.` });
}

// The offer as a plate of the list, or null: the radio's, the story's purple. A run to make, then the ruin to come to.
export function supportQuest(world) {
  const L = world.ledger;
  if (L.support === null || supportClaimed(L)) return null;
  const id = startRuinOf(L), def = stationDefById(id, L), R = def.label;
  const done = [QL.support.done(R), QL.support.doneSub(formatCR(supportGrant(L, def)))];
  const base = { id: SUPPORT_ID, kind: 'support', tone: 'story', done };
  if (!supportQualified(L)) return { ...base, title: QL.support.title(), sub: QL.support.run(R) };
  return { ...base, title: QL.support.ready(), sub: guardsDown(L, id) ? QL.support.go(R) : QL.support.clear(R),
    pointer: R, target: { sectorId: def.sectorId, x: def.x, y: def.y, stationId: id, mark: id } };   // (the mark says the station it leads to, SX, 2026-10-09)
}
