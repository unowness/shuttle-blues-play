import { CONFIG } from './config.js';
import { stationDefById } from './sectors.js';
import { offersAt } from './contracts.js';
import { reachableStationIds, ruinDef, isRestored, stillToInvest } from './ruins.js';
import { factsOfWorld, freightStuck, leastStep } from './pacing.js';
import { openingFunding } from './opening.js';
import { legTo } from './navigation.js';
import { QUEST_LINES as QL } from './questLines.js';

// The freight hint, a blue side quest (SX, 2026-10-09, after a flight: «постоянно довольно мало денег и ничего не отсылает не намекает на
// то, что нужно отвести груз. И если пользователь не занимается вкладом денег, то присылай квест синий что есть груз ... вот я дошел до
// миссии, где надо вложить деньги, мне нет денег, и мне не приходят никакие квесты. И мне не происходит ничего»). It is the "next step"
// action BACKLOG.md kept for the work stage of the opening (CAMPAIGN 14), built when SX's flight found that stage aimless.
//
// WHEN IT COMES. All of these at once, at a look of the side slot (src/quests.js stepQuests, every CONFIG.quests.checkEvery s):
//   - a ruin is there to fund and the pilot is stuck at it: no cargo on the tether, and the wallet under the least the ruin takes at a time
//     (src/pacing.js freightStuck: 50 CR, or what is left of it when that is less). Nothing is asked of a pilot who can put a coin in.
//   - the next thing is to put money into a ruin (src/opening.js openingFunding): never in the opening's guided stretch to the first
//     delivery (src/quests.js stepQuests holds every side offer through it), nor while the chapter has the pilot at the ruin's pirates or
//     the chapter's own freight; from the first money on, or with no chapter running.
//   - the pilot has been stuck for CONFIG.quests.freight.wait s (`since`, kept from the look that first saw it, cleared at the first look
//     that does not): not a nag at the moment of being broke, and a rock's coins or a find in that time are the pilot's own answer.
//   - the pilot has taken a delivery before (CONFIG.quests.unlock.freight): the radio's first run is the guide's, not a side quest's.
//   - the side slot is free (rested, the radio fitted, no red quest, the look's chance: src/quests.js mayOffer) and the freight quest
//     itself has not ended within CONFIG.quests.freight.rest s (`readyAt`, set at its end by the way it ended: taken, withdrawn or expired).
//   - there is a station to send the pilot to: the nearest that works in an open sector, is not broken and has a job on offer.
// It comes ahead of the draw of the other kinds (src/quests.js offerSideQuest): the pilot is stuck, and the others can wait their rest.
//
// WHEN IT GOES. Done when a job is taken, at any station (the cargo on the tether, or one taken and delivered between two looks): the
// plate turns blue-done and says the job pays when it is delivered, for the quest pays nothing of its own. Withdrawn quietly, with no
// outcome, when the wallet covers the ruin's least instalment, the ruin is restored, the station has no job on offer any more, or the
// quest has stood CONFIG.quests.expire s. Saved while it is open (src/questSave.js: its station and its ruin and its age); the pace is not.
// Its id is `freight:...`, not `side:...`: a hint that asks for a job to be taken is not counted among the ordinary quests that give
// the pilot pointers (src/cursors.js isRandomQuest).

const C = () => CONFIG.quests.freight;

// The pace, in memory only (World.freightPace; a load begins it flat, as every pacing rule here): since when the pilot has been stuck
// (the world's time) or null, and when the hint may next come.
const pace = (world) => (world.freightPace ??= { since: null, readyAt: 0 });

// The pilot is stuck at a ruin now, and at which: { ruinId, step } (the ruin to fund and the least it takes), or null. The world's side
// of the pacing rule: the facts are the ledger's, the chapter's stage is the opening's.
export function freightNeed(world) {
  if (world.sector.hidden || !openingFunding(world)) return null;
  const facts = factsOfWorld(world);
  return freightStuck(facts) ? { ruinId: facts.cheapest.id, step: leastStep(facts.cheapest.left) } : null;
}

// Every look: since when the pilot has been stuck.
export function noteFreight(world) {
  const p = pace(world);
  if (freightNeed(world)) p.since ??= world.time; else p.since = null;
}
// Whether the pilot has been stuck long enough, and the hint has rested since it last ended.
export function freightWaited(world) {
  const p = pace(world);
  return p.since !== null && world.time - p.since >= C().wait && world.time >= p.readyAt;
}
// The hint's quest ended, however it did: it rests.
export function restFreight(world, s) {
  if (s?.kind === 'freight') pace(world).readyAt = world.time + C().rest;
}

// The station to send the pilot to: the nearest (by the grid, src/navigation.js legTo) that works, in a sector open to the pilot (src/ruins.js
// reachableStationIds), whole (a broken station sells no jobs) and with a job on offer (src/contracts.js offersAt). Its id, or null.
export function freightStation(world) {
  const L = world.ledger;
  let best = null;
  for (const id of reachableStationIds(L)) {
    const def = stationDefById(id);
    if (!def || L.broken.has(id) || !offersAt(id, L).length) continue;
    const leg = legTo(world, def.sectorId, def.x * world.width, def.y * world.height);
    if (leg && (!best || leg.distance < best.distance)) best = { id, distance: leg.distance };
  }
  return best?.id ?? null;
}

// The quest it would be, in the shape of the side quest's candidates (src/quests.js sideCandidates), or none: the pilot is stuck now and
// there is a station to go to. (The wait and the rest are not here: offerSideQuest applies them as it applies a kind's unlock.) `base` is
// how many deliveries stood when it came, so a job taken and delivered between two looks still ends it done.
export function freightCandidates(world) {
  const need = freightNeed(world);
  const stationId = need && freightStation(world);
  return stationId ? [{ id: `freight:${stationId}:${Math.round(world.time)}`, kind: 'freight', stationId, ruinId: need.ruinId, base: world.ledger.completed.size }] : [];
}

// Done: a job is on the tether, or one was taken and delivered since the quest came.
export const freightTaken = (world, s) => !!world.ledger.active || world.ledger.completed.size > (s.base ?? world.ledger.completed.size);

// Still to be had: the ruin is still to fund and the wallet is still under its least instalment, and the station still has a job on offer.
export function freightReach(world, s) {
  const L = world.ledger, def = ruinDef(s.ruinId, L);
  if (!def || isRestored(L, def) || L.credits >= leastStep(stillToInvest(L, def))) return false;
  return !L.broken.has(s.stationId) && offersAt(s.stationId, L).length > 0;
}

// The plate and the pointer (src/quests.js sideQuest gives it its tone): the station to go to, the ruin it is for, the pointer's word.
export function freightWords(world, s) {
  const station = stationDefById(s.stationId), ruin = stationDefById(s.ruinId);
  if (!station || !ruin) return null;
  return {
    id: s.id, kind: 'side', title: QL.freight.title(station.label), sub: QL.freight.sub(ruin.label), pointer: 'FREIGHT',
    target: { sectorId: station.sectorId, x: station.x, y: station.y, stationId: station.id, mark: station.id },
    done: [QL.freight.done(), QL.freight.doneSub()],
  };
}
