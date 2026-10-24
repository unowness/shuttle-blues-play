// The quests where the world meets them: the open quests' places that a new one keeps apart from, the pointers given for random
// quests done, the radio given for the next quest handed in, a quest's ship found by its id (a pilot out of fuel, a ship pestered, a wreck, a planet speaking, a reference ship)
// and the bearings to them, and the pilot out of fuel drawn. The quests themselves step in src/quests.js and their own modules
// (src/guide.js, src/pester.js, src/wrecked.js, src/errands.js, src/specials.js); these are what was left of them in src/world.js,
// moved as it was (2026-10-05, the quests' seam: SX's hygiene list). World keeps a one-line method for each one the quests, the
// drawing and the checks call on the world; the golden master (tools/golden.mjs) holds the move to the same frames and world.
import { CONFIG } from './config.js';
import { drawCraft, craftReach, HAIL_REACH } from './traffic.js';
import { drifterHere, drifterCraft, DRIFTER_ID, currentQuests, offerSideQuest } from './quests.js';
import { NPC_ART } from './npcShips.js';
import { sayFor } from './voices.js';
import { questPlaces as placesOf } from './spots.js';
import { pesterCraftAt, PESTER_ID } from './pester.js';
import { wreckHere, wreckCraftAt, WRECK_ID } from './wrecked.js';
import { planetCraftAt, PLANET_ID } from './errands.js';
import { isRandomQuest, cursorEarned, cursorName } from './cursors.js';
import { SPECIAL_ID, SPECIAL_CREW_ID, specialDiscovery, specialCraftAt, specialCrewAt } from './specials.js';
import { openingStage } from './opening.js';
import { terraTarget } from './terra.js';
import { isCrewHail, crewCraftAt } from './clipper.js';
import { RECORDER_ID, recorderCraftAt } from './chorus.js';
import { tr } from './lang.js';

// The open quests' places as points of the grid (src/spots.js): what a quest that puts something in the open keeps apart from. A
// reference ship standing, not yet boarded, is on no list but stands in the open all the same (src/specials.js).
export function questPlaces(world) {
  const s = world.special, standing = s && !s.boarded && s.site
    ? [{ target: { sectorId: s.site.sectorId, x: s.site.x / world.width, y: s.site.y / world.height } }] : [];
  // TERRA, where the pilot's stands (src/terra.js): no catalogue's planet, so kept apart from as an open quest's place is.
  const terra = terraTarget(world);
  return placesOf([...currentQuests(world), ...standing, ...(terra ? [{ target: terra }] : [])]);
}

// The pointers given for ordinary quests and restorations (src/cursors.js): each ordinary quest done is counted once, as the quests
// leave their outcomes, and the pointer whose two numbers (the quests done, the stations restored) are met is given, said as
// `cursorFound`; a quest or a restoration may meet a gate, so it is asked every step. It is not put on: K walks the ones owned.
export function giveCursors(world) {
  const out = world.questOutcomes, p = world.pilot;
  if (out.size !== world.outcomesRead) {
    world.outcomesRead = out.size;
    for (const [id, how] of out) {
      if (how !== 'done' || !isRandomQuest(id) || world.questsCounted.has(id)) continue;
      world.questsCounted.add(id);
      p.randomDone += 1;
    }
  }
  for (let give = cursorEarned(p.cursors, p.randomDone, world.ledger.restored.size); give; give = cursorEarned(p.cursors, p.randomDone, world.ledger.restored.size)) {
    if (!p.grantCursor(give)) break;
    world.emit('cursorFound', { cursorId: give, label: cursorName(give), sectorId: world.sector.id });
  }
}

// The radio as a quest's gift (SX, 2026-10-05: «Виджет радио появляется только когда тебе радио выдают с квестами»; asked, he picked
// the next quest handed in, of any kind, a find's card as a pointer's): a pilot with no running chapter (a veteran, a skipped start, an
// old save) has no radio until a quest of the list ends done (World.questOutcomes 'done', one place for every kind: a side quest of
// any tone, a ship pestered and freed, a raid won, the radio line's step, a reference ship's run; one ended late gives nothing), or until
// a station of theirs is restored (SX, 2026-10-23: «старому пилоту радио, как только починена хоть одна станция»; `questId` null then).
// The side quests, the raids and the reference ships are the radio's, so an old pilot past every step of the radio line was offered no
// quest at all and could never earn it: SX's own save, three stations restored and twenty minutes of nothing. Said once, as
// `radioGiven`. A new pilot's comes with the shuttle (src/opening.js boardShuttle), so while the chapter runs no quest gives it.
export function giveRadio(world) {
  const p = world.pilot;
  if (p.radio || openingStage(world) !== null) return;
  const callAt = world.ledger.clock + CONFIG.quests.npcCall.after;
  for (const [id, how] of world.questOutcomes) {
    if (how !== 'done') continue;
    if (p.grantRadio(callAt)) world.emit('radioGiven', { questId: id, sectorId: world.sector.id });
    return;
  }
  if (world.ledger.restored.size && p.grantRadio(callAt)) world.emit('radioGiven', { questId: null, sectorId: world.sector.id });
}

// The radio's first NPC quest (SX, 2026-10-06: «радио открывает квесты нпс и прочие дополнительные активности как рейды. первый квест
// нпс, мы получаем по радио через 1 минуту после его получения»): CONFIG.quests.npcCall.after s after the radio is given (Pilot.npcCallAt,
// saved), a pilot out of fuel calls over it: the side slot's rescue (src/quests.js offerSideQuest), offered whatever the pacing says
// and through the opening's calm, its ship's plea said as a radio call (`openingCall`: the radio's lamp, the notch's line). Where it
// cannot be placed now (the side slot taken, the ship down, O-08, a reference ship standing or flown, no clear spot), it tries again
// `retry` s later. Once.
export function stepRadioCall(world) {
  const p = world.pilot, due = p.npcCallAt, C = CONFIG.quests.npcCall;
  if (!p.radio || !Number.isFinite(due) || world.ledger.clock < due) return;
  const later = () => { p.npcCallAt = world.ledger.clock + C.retry; };
  if (!world.ship.alive || world.sector.hidden || world.special || world.sideQuest) { later(); return; }
  const q = offerSideQuest(world, 'rescue');
  if (!q) { later(); return; }
  p.npcCallAt = null;
  const code = q.drifter.code, plea = q.plea = sayFor(world, 'rescue', 'hail', code);
  world.emit('openingCall', { who: NPC_ART[code]?.name ?? 'PILOT', line: plea });
}

// A pilot out of fuel: one of the thirteen friendly ships (src/npcShips.js), in its own colours, turning slowly with its
// distress light blinking over it; refuelled, it flies off along its nose, fading (SX, 2026-10-02: it was a grey copy of the
// pilot's own ship, «это должны быть разные корабли нпс которых мы придумали»).
export function drawDrifter(world, r, t) {
  const still = drifterHere(world), going = world.drifterLeaving;
  const d = still ?? going;
  if (!d) return;
  const craft = drifterCraft(d), leave = CONFIG.quests.rescue.leave;
  const u = going && !still ? Math.min(1, going.t / leave) : 0;
  const angle = d.angle + (still ? t * 0.05 : 0);
  const run = u * u * 900;                       // eases away along its nose
  const x = d.x + Math.cos(angle) * run, y = d.y + Math.sin(angle) * run;
  const s = world.project(r, x, y);
  if (!r.onScreen(s.x, s.y, craftReach(r, craft))) return;
  drawCraft(r, craft, s.x, s.y, angle, 1 - u);
  const reach = Math.hypot(craft.rows[0].length * r.cellW, craft.rows.length * r.cellH) * craft.scale / 2;
  // The distress light, a second on and a second off, over its nose.
  if (still && Math.floor(t) % 2 === 0) r.glyph('·', s.x, s.y - reach * 0.8, CONFIG.hud.warning, 1, 1.6);
  if (still && Math.hypot(d.x - world.ship.x, d.y - world.ship.y) < HAIL_REACH * 2.5) {
    const label = tr(craft.name), w = Array.from(label).length * r.cellW * (r.textScale ?? 1);
    r.text(label, s.x - w / 2, s.y + reach + r.cellH * 1.5, CONFIG.hud.color, 0.9);
  }
}

// A quest's ship by its id, where it is and the craft itself, so its hail stays with it (World.craftAt): a pilot out of fuel
// (src/quests.js) hails from where it drifts; the second round's are a ship pestered (src/pester.js), a wreck (src/wrecked.js)
// and a planet speaking (src/errands.js); and a reference ship (src/specials.js). Null once it is gone; undefined for an id
// that names no quest's ship.
export function questCraftAt(world, craftId) {
  if (craftId === DRIFTER_ID) {
    const d = drifterHere(world) ?? world.drifterLeaving;
    return d ? { x: d.x, y: d.y, craft: drifterCraft(d) } : null;
  }
  if (craftId === PESTER_ID) return pesterCraftAt(world);
  if (craftId === WRECK_ID) return wreckCraftAt(world);
  if (craftId === PLANET_ID) return planetCraftAt(world);
  if (craftId === SPECIAL_ID) return specialCraftAt(world);
  if (craftId === SPECIAL_CREW_ID) return specialCrewAt(world);
  if (isCrewHail(craftId)) return crewCraftAt(world);
  if (craftId === RECORDER_ID) return recorderCraftAt(world);
  return undefined;
}

// The quests' ships a bearing leads to from afar (World.discoveries): the pilot out of fuel, the wreck, the reference ship.
export function questDiscoveries(world) {
  return [
    ...(drifterHere(world) ? [{ ...drifterHere(world), label: 'PILOT', interactRadius: CONFIG.stranded.interactRadius,
      discoverRadius: CONFIG.stranded.discoverRadius }] : []),
    ...(wreckHere(world) ? [{ ...wreckHere(world), label: 'WRECK', interactRadius: CONFIG.stranded.interactRadius,
      discoverRadius: CONFIG.stranded.discoverRadius }] : []),
    ...(specialDiscovery(world) ? [specialDiscovery(world)] : []),
  ];
}
