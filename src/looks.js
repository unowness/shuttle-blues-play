import { ALL_LOOKS, makeLook } from './filmGrade.js';
import { setGradeLook } from './grade.js';

// The interface's looks as collectibles (SX, 2026-10-02: «мы точно будем раздавать как дополнительные коллектабл с цвета
// интерфейса»; INTERFACE_LOOKS_HANDOFF.md). A look recolours the interface (the deep shadow, the cockpit's lines, the
// text), keeps the signals in their families and only filters everything that is art: the ship, the souvenirs, the
// planets, the notices and plates, the quest list, the pointers (src/grade.js, the kept layer). Switched on the pilot
// card (C, the LOOK line), applied at once.
//
// What a look IS is SX's, tuned in his editor (labs/graphics/sketches/film-grade.html): the game reads the looks from
// src/filmGrade.js as they stand, the one place where the numbers live, and never copies or changes
// them (SX: «Цифры мои, лежат в film-grade.js — не меняй их без меня»). That is the one place the game imports from a
// sketch folder, by SX's word; this module is the only door.
//
// Five looks to wear. Three from the start: SPAWN (SPAWN SOFT since 2026-10-17, the game's default, a new save starts in it: SX,
// «спаун софт должен быть в умолчании. В настройках все еще можно ... переключиться ... подбираем спаун софт теперь main цвет»), NOW
// (the default until that day, the game as SX tuned it on 2026-10-02) and ORIGINAL (exactly the grade the game had before the looks,
// src/grade.js, which bypasses the look engine altogether); and the two found:
//
//   SUNSET  a cache at the far east dead edge of K-06 (LOOK_FINDS, free to open, a find and not a purchase)
//   TYRELL  the pilot's fourth restored ruin, whichever (src/world.js investStation), with that restoration's finds
//
// (SPAWN was the first raid the pilot won until it became the default; a raid gives no look now.)
//
// Which are owned and which is worn are the pilot's (Pilot.looks, Pilot.look), saved with the card, like the paints.
// The start looks are owned from the start and never stored; `looks` holds the found ones. A save keeps the look it wears: one
// from before 2026-10-17 wears NOW until the pilot puts on another.

export const ORIGINAL_ID = 'ORIGINAL';
export const DEFAULT_LOOK = 'G1';                         // SPAWN: the editor's own code for it
export const NOW_ID = 'G0';
// Where the editor's looks are had, by the editor's code (G0 NOW and G1 SPAWN from the start, G2 SUNSET, G3 TYRELL found).
const SOURCE = Object.freeze({ G0: 'start', G1: 'start', G2: 'cache', G3: 'ruin' });
export const START_LOOKS = Object.freeze([DEFAULT_LOOK, NOW_ID, ORIGINAL_ID]);

const look = (id, name, film, source, def) => Object.freeze({ id, name, film, source, def });
// In the card's order: the start looks first (the default, NOW, the plain ORIGINAL), then the found ones in the editor's order.
const byCode = (code) => ALL_LOOKS.find((l) => l.code === code);
export const LOOKS = Object.freeze([
  ...[DEFAULT_LOOK, NOW_ID].map((code) => { const l = byCode(code); return look(l.code, l.name, l.film, 'start', l); }),
  look(ORIGINAL_ID, 'ORIGINAL', "The game's own grade as it was before the looks, to the digit", 'start', null),
  ...ALL_LOOKS.filter((l) => !START_LOOKS.includes(l.code)).map((l) => look(l.code, l.name, l.film, SOURCE[l.code] ?? null, l)),
]);
const byId = new Map(LOOKS.map((l) => [l.id, l]));
export const lookById = (id) => byId.get(id) || null;
export const isLookId = (id) => byId.has(id);

// What the pilot may wear: the start looks and the found ones (`found`, the pilot's set).
export const ownsLook = (found, id) => START_LOOKS.includes(id) || !!found?.has(id);
export const ownedLooks = (found) => LOOKS.filter((l) => ownsLook(found, l.id));
// The next look the pilot owns after the one worn, in the card's order.
export function nextLook(found, worn) {
  const list = ownedLooks(found);
  const at = list.findIndex((l) => l.id === worn);
  return list[(at + 1) % list.length].id;
}

// Where the found looks are given: the id of the look a source gives ('raid', 'cache', 'ruin'), or null.
export const lookGivenBy = (source) => LOOKS.find((l) => l.source === source)?.id ?? null;
// The fourth restored ruin gives its look (TYRELL); a save that is already past the fourth is given it on load.
export const LOOK_RUINS = 4;
export function reconcileLooks(ledger, pilot) {
  const id = lookGivenBy('ruin');
  return !!id && (ledger?.restored?.size ?? 0) >= LOOK_RUINS && pilot.grantLook(id);
}

// SUNSET's cache (SX's pick, 2026-10-02: «Тайник на краю карты»): a find in open space near a far dead edge, free to open,
// part of no collection. Not in FINDS (src/rewards.js): those are the 24 souvenirs and paints and everything that counts
// them; this one is its own kind, shaped like a find so the world builds it as one (`content` is the look's code). The
// pilot owning the look is the claim, so nothing else records it, and once it is owned the cache is not built. Placed where
// the map is empty beside the far east edge of K-06 (468 u inside the line, every rule checks/looks.mjs holds it to kept
// with room to spare); SX moves it in the map editor like any object.
export const LOOK_FINDS = Object.freeze([
  Object.freeze({ id: 'find-look-sunset', kind: 'look', content: lookGivenBy('cache'), sector: 'sector-k06', x: 0.68, y: 0.14, price: 0, station: null }),
]);
export const lookFindsIn = (sectorId, found) => LOOK_FINDS.filter((f) => f.sector === sectorId && !found?.has(f.content));
export const lookFindLabel = (f) => lookById(f?.content)?.name ?? '';

// A look's cache is a tin like a paint's (src/paint.js PAINT_TIN) in the look's own inks: its structure above the seal, its
// secondary below, its primary for the shimmer. NOW has no palette; its tin is the interface's own.
export function lookTinInks(id) {
  const palette = lookById(id)?.def?.palette;
  return palette ? { material: palette.structure, structure: palette.secondary, highlight: palette.primary } : null;
}

// The engine. A look's function of one HEX, built once from its definition and tune and kept (its own cache lives in it);
// null for ORIGINAL, which the grade reads as "no look": src/grade.js is then what it was.
const built = new Map();
export function lookFunction(id) {
  const def = lookById(id);
  if (!def || !def.def) return null;
  if (!built.has(id)) built.set(id, makeLook(def.def));
  return built.get(id);
}
// Puts the look on the grade, which empties its caches and moves its epoch (what holds graded pixels draws itself again).
export function installLook(id) {
  const worn = lookById(id) ? id : DEFAULT_LOOK;
  setGradeLook(lookFunction(worn));
  return worn;
}

// A save's looks, untrusted: only found ones the catalogue has (never a start look), without repeats, and the one worn
// only if owned. A save from before the looks holds none and wears NOW.
export function sanitizeLooks(rawLooks, rawLook) {
  const found = new Set();
  for (const id of Array.isArray(rawLooks) ? rawLooks : []) {
    if (typeof id === 'string' && isLookId(id) && !START_LOOKS.includes(id)) found.add(id);
  }
  const worn = typeof rawLook === 'string' && ownsLook(found, rawLook) ? rawLook : DEFAULT_LOOK;
  return { found, worn };
}
