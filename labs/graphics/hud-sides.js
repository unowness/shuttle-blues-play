// Which side of the screen the HUD's two columns stand on (SX, 2026-10-08, on labs/graphics/sketches/hud-placement.html: «HUD PLACE: S3 +
// MIRROR SWITCH»). S3 SWAP: the locator keeps the top left, the quest list (R QUESTS) and the radio (T RADIO) go to the top right, and the
// souvenir shelf (the charm that hangs from the locator; the wallet is on the deck's shoulder since the evening of 2026-10-08) stands under the locator. The mirror switch (the pause's SIDES, kept in this browser: src/prefs.js
// `hudSide`, never the save) swaps the two sides: the locator and the shelf on the right, the quests and the radio on the left (the
// page's S2 IMMORTAL).
//
// A column is moved whole: its ink edges are mirrored (the column's visible ink runs from `x0`, the scope's ring and the capitals, to
// the chevrons' edge, locator.js questListAnchor `edge`, so the mirror moves it by W - x0 - edge and its ink keeps the same air from its
// own screen edge). The locator and the shelf are moved as they are drawn. The quests' column, the radio on top (its row on the column's
// top row, the header's capitals' line) and the quest list under it, is drawn mirrored where it stands on the right: the plates, the
// heads and the radio's picture, aligned to the screen's edge (quests.mirror). The shelf stands a container's inset (COLUMN_GAPS.block)
// under the last ink of the locator, its edge on the column's ink edge (its left on `x0`; mirrored, its right on the screen's `x0` from
// the right).
//
// This file only says where; the offsets are from the left-edge places that locator.js (columnLayout, questListAnchor) and
// souvenir-shelf.js (shelfLayout) still lay out, so a page that draws the column alone (the sketch pages, the checks) is unchanged.
// What follows a side: the page's draw order (labs/graphics/main.js), the LAYOUT editor's kept offsets (hud-place.js flipHudPlace), the
// pause's row (pause.js), the centred windows' room (src/uiGrid.js through renderer.clearLeftOf / clearRightOf) and the oval of marks
// (rim-marks.js playArea reads the groups' boxes as drawn, each on its own side).
import { columnLayout, questListAnchor, buttonInk, COLUMN_GAPS } from './locator.js';
import { shelfLayout } from './souvenir-shelf.js';
import { TOP } from './hud-layout.js';
import { readHudSide, writeHudSide } from '../../src/prefs.js';
import { flipHudPlace, HUD_SIDES, DEFAULT_HUD_SIDE } from './hud-place.js';

export { HUD_SIDES, DEFAULT_HUD_SIDE };
// The pause's SIDES row: the value shown for each (the locator's side; the quests and the radio take the other).
export const HUD_SIDE_NAMES = Object.freeze({ left: 'LOCATOR LEFT', right: 'LOCATOR RIGHT' });
export const fitHudSide = (v) => (HUD_SIDES.includes(v) ? v : DEFAULT_HUD_SIDE);

// The page's: { locator }, read once at the start (this browser's own, the left unless the right is kept), changed by the pause's row.
export const createHudSide = (store) => ({ locator: readHudSide(HUD_SIDES, store) });
// The switch: kept at once, and the layout editor's offsets mirrored with it (`place`, hud-place.js). True when the side changed.
export function setHudSide(state, side, store, place = null) {
  const next = fitHudSide(side);
  if (next === state.locator) return false;
  state.locator = next;
  writeHudSide(next, store);
  if (place) flipHudPlace(place, next);
  return true;
}

const ZERO = Object.freeze({ x: 0, y: 0 });
// The places for one screen and side, kept while the screen's measures and the side are the same (nothing is made a frame: the
// column's layout, the anchor and the shelf's are each made for the answer once). Read-only for whoever holds it.
const kept = { w: -1, h: -1, cw: 0, ch: 0, dpr: 0, font: null, side: null, value: null };

// { side, flipped, laid, mirror, column, quests, shelf } on `r`'s screen:
//   column   { x, y } the offset the locator is drawn under (translate) and its box shifted by, from its left-edge place;
//   quests   { x, y } the column's top row: the radio's row stands there and the list hangs under the radio (`under`: from the radio's
//            last ink to the list's head row, a container's inset by ink); `dx` how far the column is from the left-edge anchor;
//            `left`, `x0`, `edge` the plates' left, the column's left ink edge and its button's right edge there (what radioPlace
//            takes); `width` the plates' and `button` ({ inset, edge } from `x`, or null) what drawQuestBoard takes; `mirror` whether
//            the column stands on the screen's right, where the plates, the heads and the radio are drawn mirrored (SX, 2026-10-08:
//            «у квестов кстати отзеркаленный дизайн плашек должен быть», «Давай само радио тоже отзеркалим»);
//   shelf    { x, y } the offset from the shelf's own place (the top right) that shelfLayout is given, under the locator on its side.
// `laid` false: the screen is below the size the column is laid out for (locator.js columnLayout), where the quests hang under the small
// scope as they always did and the shelf is at the top right; the sides do not apply.
export function sidePlaces(r, side) {
  const k = kept;
  if (k.value !== null && k.side === side && k.w === r.width && k.h === r.height && k.cw === r.cellW && k.ch === r.cellH && k.dpr === r.dpr && k.font === r.font) return k.value;
  const value = lay(r, side);
  k.side = side; k.w = r.width; k.h = r.height; k.cw = r.cellW; k.ch = r.cellH; k.dpr = r.dpr; k.font = r.font; k.value = value;
  return value;
}
function lay(r, side) {
  const flipped = side === 'right', L = columnLayout(r), A = questListAnchor(r);
  if (!L) return { side, flipped, laid: false, mirror: 0, column: ZERO, quests: { x: A.x, y: A.y, dx: 0, left: A.x, x0: A.x, edge: A.x, width: undefined, button: null, under: 0, mirror: false }, shelf: ZERO };
  const W = r.width, mirror = Math.round(W - L.x0 - A.edge);
  const own = shelfLayout(r, null, { given: false }).shelf;           // the shelf's own place, the top right, and its width
  const under = Math.round(L.blockBottom + COLUMN_GAPS.block) - TOP;
  const shelfX = Math.round(flipped ? W - L.x0 - own.w - own.x : L.x0 - own.x);
  const dx = flipped ? 0 : mirror;
  return { side, flipped, laid: true, mirror,
    column: { x: flipped ? mirror : 0, y: 0 },
    quests: { x: A.x + dx, y: Math.round(L.top - L.textY), dx, left: L.questsX + dx, x0: L.x0 + dx, edge: A.edge + dx, width: A.width,
      button: { inset: A.x0 - A.x, edge: A.edge - A.x }, under: COLUMN_GAPS.block - buttonInk(r).top, mirror: !flipped },
    shelf: { x: shelfX, y: under } };
}
