// Freight at a station (cut out of src/world.js, PLAN D3, 2026-10-09; the code is as it was, `this` now `world`): a job accepted at the
// station that offers it, a cargo delivered where it is bound, with the answers the ledger gives (src/contracts.js) said as events, the finder's
// fee of another pilot's cargo, and the chapter's hook (src/opening.js). World keeps a one-line method of each name.
import { strangerByContract } from './strangers.js';
import { payFor } from './pacing.js';
import { openingDelivered } from './opening.js';

export function acceptContract(world, contract) {
  const res = world.ledger.accept(contract);
  if (!res.ok) { world.emit('actionRefused', { reason: res.reason }); return false; }
  world.emit('contractAccepted', {
    contractId: contract.id, label: contract.label,
    destination: world.stationLabelOf(contract.to), reward: res.quote, par: res.job.par,
  });
  return true;
}

export function deliver(world, station) {
  const active = world.ledger.activeJob();
  if (!active) { world.emit('actionRefused', { reason: 'NO CARGO' }); return; }
  if (active.to !== station.id) {
    world.emit('actionRefused', { reason: `DELIVER TO ${world.stationLabelOf(active.to)}` });
    return;
  }
  const res = world.ledger.complete(active);
  if (!res.ok) { world.emit('actionRefused', { reason: res.reason }); return; }
  world.cargo = null;
  // Another pilot's cargo (src/strangers.js), delivered: a rescue, and their thanks,
  // once each. The counters move only on the delivery that paid, never on a repeat.
  const stranger = res.alreadySettled ? null : strangerByContract(active.id);
  if (stranger) { world.pilot.rescued += 1; world.pilot.thanks += 1; }
  // A finder's fee on top of the cargo's freight (the quest economy), grown with the stations restored.
  const fee = stranger ? payFor('strangerFee', world.ledger.restored.size) : 0;
  if (fee) world.ledger.credits += fee;
  world.emit('delivered', {
    contractId: active.id, label: active.label,
    stationId: station.id, x: station.x, y: station.y, sectorId: world.sector.id,
    reward: res.reward, credits: res.credits, alreadySettled: res.alreadySettled,
    timing: res.timing || null,
    rescued: !!stranger, author: stranger?.author ?? null, thanks: stranger?.thanks ?? null, fee,
  });
  // The opening's first freight (src/opening.js): its receipt, B's words, its stage passed.
  openingDelivered(world, active, res);
}
