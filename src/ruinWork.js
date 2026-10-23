// The ruins where the world meets them: a ruin's rows, the money put into one, and the sector a restoration opens. Moved out of
// src/world.js as it was (2026-10-08, chat N2 part 2's refactoring piece: the restoration is where the stations' gifts and the cursors'
// gates now meet it); World keeps a one-line method for each, and the golden master (tools/golden.mjs) holds the move to the same
// frames and world. The ruins' own rules are src/ruins.js (pure), their guards src/raids.js.
import { openSectorIds } from './frontier.js';
import { sectorById, sectorTitle } from './sectors.js';
import { rebuiltShare, investRuin, stillToInvest, INVEST_STEPS, formatCR, RUIN_IDS, workingKind } from './ruins.js';
import { findDef, findsOf, nextFindOf, isAvailable, placeOf } from './rewards.js';
import { lookGivenBy, LOOK_RUINS } from './looks.js';
import { postHeld } from './raids.js';
import { CLAIM, recordBuild } from './rewardLedger.js';
import { earnStationGift } from './stationGifts.js';
import { nextRuinQuestId } from './nextRuin.js';

// A ruin's actions (src/ruins.js): put in a part (50, 250, 500 CR, those under what is left), or
// restore it with all that is left, or read about it. An action the wallet cannot pay is shown
// greyed with what is missing. A cargo an older save accepted for a station that is a ruin now is
// delivered here all the same: an accepted job never changes its destination.
export function ruinActions(world, station) {
  const actions = [];
  const active = world.ledger.activeJob();
  if (active && active.to === station.id) actions.push({ label: `DELIVER ${active.label}`, run: () => world.deliver(station) });
  const left = stillToInvest(world.ledger, station);
  // Its guards (src/raids.js) take no money: while they fly here, one greyed RESTORE, the menu's subtitle saying why
  // (candidates) and a press saying what to do (`reason`, the refusal's words).
  if (postHeld(world, station.id)) {
    actions.push({ label: `RESTORE ${formatCR(left)} CR`, disabled: true, reason: 'CLEAR THE PIRATES FIRST', run: () => {} });
    actions.push({ label: 'INFO', run: () => world.logStation(station) });
    return actions;
  }
  const pay = (amount, label) => {
    const short = world.ledger.credits < amount;
    actions.push({ label, disabled: short, note: short ? `NEED ${formatCR(amount)} CR, HAVE ${formatCR(world.ledger.credits)}` : null,
      run: () => world.investStation(station, amount) });
  };
  for (const step of INVEST_STEPS) if (step < left) pay(step, `FUND ${formatCR(step)} CR`);
  pay(left, `RESTORE ${formatCR(left)} CR`);
  actions.push({ label: 'INFO', run: () => world.logStation(station) });
  return actions;
}

// Credits into a ruin (src/ruins.js investRuin). The part says how far along it is; the last
// credit in makes it the station it was, from the next frame: it docks and works like any other,
// freight is paid a fifth more from now on, and its two finds are unlocked, the bearing on the
// first (ECONOMY_V1_HANDOFF.md section 4). `support`: the credits are the first-dock support's (src/starterSupport.js), built in and not
// taken from the wallet, and the claim that records them is made in this same step: { job } the delivery that earned it.
export function investStation(world, station, amount = null, { support = null } = {}) {
  if (workingKind(world.ledger, station) !== 'ruin') return;
  if (postHeld(world, station.id)) { world.emit('actionRefused', { reason: 'CLEAR THE PIRATES FIRST' }); return; }
  const was = openSectorIds(world.ledger);
  const res = investRuin(world.ledger, station, amount, { free: !!support });
  if (!res.ok) { world.emit('actionRefused', { reason: res.reason }); return; }
  if (res.alreadySettled) return;
  if (support) recordBuild(world.ledger, CLAIM.starterSupport, { station: station.id, amount: res.given, job: support.job });
  const at = { x: station.x, y: station.y, sectorId: world.sector.id };
  world.emit('stationInvested', { stationId: station.id, label: station.label, amount: res.given, invested: res.invested,
    cost: station.cost, share: rebuiltShare(world.ledger, station), credits: res.credits, by: support ? 'support' : 'pilot', ...at });
  if (!res.done) return;
  world.ledger.restoredAt.set(station.id, world.ledger.clock);   // it stands in peace a while (CONFIG.raids.quiet)
  // The story's quest that led here, done (src/nextRuin.js): its plate turns green and the next ruin's comes.
  world.questOutcomes.set(nextRuinQuestId(station.id), 'done');
  world.selectedId = null;
  // Its two finds, and a souvenir the sector it opens gives, are laid now, anywhere open (src/cachePlaces.js).
  const laid = world.settleCaches();
  const first = nextFindOf(station.id, world.ledger);
  world.ledger.marked = first ? first.id : null;
  world.buildFinds();
  // The free find it earns (src/stationGifts.js): a waiver of the reward ledger, earned in this step, said on the restoration's own card.
  const gift = earnStationGift(world.ledger, station.id);
  world.emit('stationRestored', {
    stationId: station.id, label: station.label, becomes: station.becomes, price: res.price,
    // The finds it unlocks that can be had now: one past a closed border waits for its sector (HOIST's lie in K-06, src/frontier.js).
    credits: res.credits, restored: res.restored, finds: findsOf(station.id, world.ledger).filter((f) => isAvailable(f, world.ledger)).length,
    gift: gift ? gift.word : null, ...at,
  });
  if (res.restored === RUIN_IDS.length) world.emit('networkComplete', { stations: world.stations.length, ...at });
  // The next sector opens (src/frontier.js), said after the restoration's own notice.
  world.openFrontier(was, at, laid);
  // The look the fourth restored ruin gives (src/looks.js LOOK_RUINS), whichever ruin it is, with that restoration's finds.
  if (res.restored >= LOOK_RUINS) world.giveLook(lookGivenBy('ruin'), 'ruin', at);
}

// A restoration opens the next sector of the frontier (src/frontier.js; SX, 2026-10-02: «Руина открывает сектор»). `was`: the
// sector ids open before it. A border beside the pilot opens at once (the edges laid again: the seam where the rope and the
// fog were, the sector drawn beyond it), another pilot's cargo bound there can be had now, and the page says which sector
// opened ('sectorOpened', where the restoration was: `at`). Returns the ids opened.
export function openFrontier(world, was, at = {}, laid = []) {
  const opened = openSectorIds(world.ledger).filter((id) => !was.includes(id));
  if (!opened.length) return opened;
  world.layEdges(world.sector);
  world.buildLostCargo(world.sector);
  // The souvenir an opening gives (src/rewards.js ruleUnlocked) lies anywhere open: the pilot is told where, and the map
  // shows it (the ledger's `told`), so a find that opened is never one nobody can say how to reach.
  const gift = laid.map((id) => findDef(id, world.ledger)).find((f) => f && !f.station) ?? null;
  const giftAt = gift ? placeOf(gift, world.ledger) : null;
  if (gift) world.ledger.told.add(gift.id);
  for (const id of opened) {
    const s = sectorById(id);
    world.emit('sectorOpened', { opened: id, label: s.label, title: sectorTitle(s), ...at,
      cache: gift ? { findId: gift.id, kind: gift.kind, sectorId: giftAt.sector, sectorLabel: sectorById(giftAt.sector)?.label ?? '' } : null });
  }
  return opened;
}
