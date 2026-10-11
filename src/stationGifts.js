// What a restoration gives free (codex/economy-2026-10-03/CLAUDE_HANDOFF.md section 8, nine free claims; chat N2 part 2, 2026-10-08):
//
//   the start ruin   its paint, free: a waiver naming the station and the kind (`start-paint`), «Bind to the station id, not a current
//                    restored count» (the start ruin is the first restored, whatever the count says later)
//   a later ruin     one of its two finds free, the pilot's choice: a waiver naming the station (`station-choice:<id>`), the first of
//                    its caches opened is the free one; «limited to that station's two cache slots»
//   HOIST            its souvenir only while its paint (PAINT 12, src/paint.js PENDING_PAINT) had no look of its own; one of the two
//                    since SX chose the look (OLIVE, 2026-10-08)
//
// The waiver is a claim of the reward ledger (src/rewardLedger.js): earned inside the restoration (src/ruinWork.js investStation), spent
// inside the settlement of the find it frees (src/rewards.js settleFind), so a reload, a second press or the load of an old save grants
// nothing twice. An old save is given none for the stations it had already restored (no retroactive free finds: the waivers are earned at
// the restoration, and the restorations of the past never pass through it again). A station with no finds gives none.
import { startRuinOf } from './sectors.js';
import { findsOf } from './rewards.js';
import { PENDING_PAINT, paintById } from './paint.js';
import { CLAIM, earnWaiver, stationChoiceId } from './rewardLedger.js';

// The waiver `stationId`'s restoration earns, or null: { id, word } with `word` what the notice says is free ('PAINT', 'SOUVENIR' or
// 'CACHE': either of the two). A repeated call earns nothing and returns null.
export function earnStationGift(ledger, stationId) {
  const finds = findsOf(stationId, ledger).filter((f) => f.content !== PENDING_PAINT || !!paintById(PENDING_PAINT)?.inks);
  if (!finds.length) return null;
  let id, of, word;
  if (stationId === startRuinOf(ledger)) { id = CLAIM.startPaint; of = 'paint'; word = 'PAINT'; }
  else {
    id = stationChoiceId(stationId);
    of = finds.every((f) => f.kind === finds[0].kind) ? finds[0].kind : null;
    word = of === 'souvenir' ? 'SOUVENIR' : of === 'paint' ? 'PAINT' : 'CACHE';
  }
  const res = earnWaiver(ledger, id, { station: stationId, of });
  return res.ok && !res.alreadyEarned ? { id, word } : null;
}
