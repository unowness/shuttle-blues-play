// The side quest's slot, the one writer of its clock (World.sideReadyAt): when a side quest ends, however it ends, the slot rests
// before the next is offered (src/quests.js stepQuests reads it). The rest's length is a pacing rule, pure, in src/pacing.js
// (restFor); this was pacing.js's restSide, moved here on 2026-10-05 because that file touches no world (the code review's
// architecture finding 10). A leaf: src/quests.js, src/errands.js and src/wrecked.js import it, and it imports none of them.
import { restFor } from './pacing.js';

// The side slot is free again after `restFor`, on the world's own time (not saved: a load begins with the slot free).
export function restSide(world) {
  world.sideReadyAt = world.time + restFor(world.ledger.restored.size);
}
