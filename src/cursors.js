// The pointers as collectibles (SX, 2026-10-02: «давай курсоры будем дарить за случайные квесты, в мой сейв запиши что все
// доступны, у тебя все хорошие по умолчанию берем квадратик»). Four, drawn by labs/graphics/cursor.js:
//
//   C3 CORNERS   the little square of corner marks: every pilot's from the start, and worn by a new one
//   C2 RING, C1 CROSS, C4 DIAMOND   given in that order, each by a gate of two numbers (CONFIG.cursors.gates): the ordinary quests done
//                and the stations restored, RING (3, 1), CROSS (9, 3), DIAMOND (18, 6) (chat N2 part 2, 2026-10-08, the economy handoff's
//                section 8; it was one for every two random quests, and then the pilot who only took quests was given all three before
//                a station stood). A gate met gives the pointer at that moment, whether it was a quest or a restoration that met it.
//
// An ordinary quest is one the game offers by chance: the side slot's (its id `side:...`: a find, a signal, a ruin to fund,
// a stranger's cargo, a pilot out of fuel, a wreck, a planet's errand) and a ship pestered by pirates (`pester:...`); not a raid,
// the radio's steps, the opening chapter's or a reference ship's run, nor the freight hint (`freight:...`, src/freight.js: it asks
// for a job to be taken and pays nothing, so it is no step toward a pointer). Which are owned, which is worn and how many ordinary quests were
// done are the pilot's (Pilot.cursors, Pilot.cursor, Pilot.randomDone), saved with the card. A save from before the pointers was given
// them all (src/storage.js, v14), and a pointer once given is never taken back by the gates (v24 keeps every one owned). K walks the
// ones owned.

import { CONFIG } from './config.js';

export const START_CURSOR = 'C3';
// The card's order: the one owned from the start, then the found ones in the order they are given.
const CURSOR_LIST = Object.freeze([
  Object.freeze({ id: 'C3', name: 'CORNERS' }),
  Object.freeze({ id: 'C2', name: 'RING' }),
  Object.freeze({ id: 'C1', name: 'CROSS' }),
  Object.freeze({ id: 'C4', name: 'DIAMOND' }),
]);
const FOUND_CURSORS = Object.freeze(CURSOR_LIST.filter((c) => c.id !== START_CURSOR).map((c) => c.id));
const byId = new Map(CURSOR_LIST.map((c) => [c.id, c]));
export const isCursorId = (id) => byId.has(id);
export const cursorName = (id) => byId.get(id)?.name ?? '';

export const ownsCursor = (found, id) => id === START_CURSOR || !!found?.has(id);
export const ownedCursors = (found) => CURSOR_LIST.filter((c) => ownsCursor(found, c.id)).map((c) => c.id);
// The next one owned after the one worn, in the card's order.
export function nextOwnedCursor(found, worn) {
  const list = ownedCursors(found);
  return list[(list.indexOf(worn) + 1) % list.length];
}
// The next to give, or null when all are owned.
export const cursorToGive = (found) => FOUND_CURSORS.find((id) => !found?.has(id)) ?? null;
// The next pointer the gates give now: the first not owned, in the order they are given, whose two numbers are met; else null. A pointer
// whose gate is not met holds the later ones back (RING before CROSS before DIAMOND). Asked every step: it makes nothing.
export function cursorEarned(found, quests, restored) {
  const gates = CONFIG.cursors.gates;
  for (let i = 0; i < FOUND_CURSORS.length; i++) {
    const id = FOUND_CURSORS[i];
    if (found?.has(id)) continue;
    const g = gates[id];
    return quests >= g.quests && restored >= g.restored ? id : null;
  }
  return null;
}

// Is a quest's id a random one's?
export const isRandomQuest = (id) => typeof id === 'string' && (id.startsWith('side:') || id.startsWith('pester:'));

// A save's pointers, untrusted: the found ones the catalogue has, the one worn only if owned.
export function sanitizeCursors(rawFound, rawWorn) {
  const found = new Set();
  for (const id of Array.isArray(rawFound) ? rawFound : []) if (FOUND_CURSORS.includes(id)) found.add(id);
  const worn = typeof rawWorn === 'string' && ownsCursor(found, rawWorn) ? rawWorn : START_CURSOR;
  return { found, worn };
}
