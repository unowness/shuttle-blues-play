// The ruin to restore next, as the story's quest (SX, 2026-10-23: «когда мы восстановили первую станцию, пусть сразу появляются шкала
// восстановления следующей станции и фиолетовая метка ведет ... к обнаружению следующей станции»; «я восстанавливаю первую станцию ... и
// как бы ни с чем остаюсь»). Once a station is restored and the opening chapter rests (or there is none: a veteran, a skipped start), the
// story always leads to one ruin: the first begun (money in it, not restored), else the cheapest to finish in an open sector
// (src/pacing.js cheapestRuin: the frontier opens one sector a restoration, src/frontier.js, so it is the one the last brought into
// reach). Its plate is the story's purple with the station's own mark and bearing; the ruins' tracker shows it from 0 %, a quest's ruin
// being a row of it (labs/graphics/tracker.js). Done when it is restored (src/ruinWork.js), and the next one stands at once; none once
// every ruin is (the boss's quest then, src/bossQuest.js). Derived from the ledger every time it is asked, never saved, so a save from
// before it has it at the load. The side quest to restore a ruin (src/quests.js `rebuild`) never offers this one beside it.
import { sectorById } from './sectors.js';
import { sectorOpen } from './frontier.js';
import { ruinDef, isRestored, stillToInvest, formatCR } from './ruins.js';
import { cheapestRuin } from './pacing.js';
import { openingStage, REST } from './opening.js';
import { QUEST_LINES as QL } from './questLines.js';

// The quest's id by its station: done at that station's restoration (World.questOutcomes, src/ruinWork.js).
export const nextRuinQuestId = (stationId) => `ruin:${stationId}`;

// The id of the ruin the story leads to now, or null.
export function nextRuinId(world) {
  const L = world.ledger, stage = openingStage(world);
  if (!L.restored.size || (stage !== null && stage !== REST)) return null;
  for (const id of L.invested.keys()) {
    const def = ruinDef(id, L);
    if (def && !isRestored(L, def) && !sectorById(def.sectorId)?.hidden && sectorOpen(L, def.sectorId)) return id;
  }
  return cheapestRuin(L)?.id ?? null;
}

// Its plate, or null: with the words of a ruin to restore (src/questLines.js `restore`), what is still to put in it as its sub. None while a
// side quest to restore the same ruin stands (an older save's, from before this): that one leads there.
export function nextRuinQuest(world) {
  const id = nextRuinId(world), side = world.sideQuest;
  if (!id || (side?.kind === 'rebuild' && side.stationId === id)) return null;
  const L = world.ledger, def = ruinDef(id, L);
  return {
    id: nextRuinQuestId(id), kind: 'ruin', tone: 'story', title: QL.restore.title(def.label),
    sub: QL.restore.sub(def.sectorLabel, formatCR(stillToInvest(L, def))), pointer: def.label,
    target: { sectorId: def.sectorId, x: def.x, y: def.y, stationId: def.id, mark: def.id },
    done: [QL.restore.done(def.label), QL.restore.doneSub()],
  };
}
