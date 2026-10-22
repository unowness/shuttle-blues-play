// Where the interface's groups stand (SX, 2026-10-02: «в режиме паузы можно перетаскивать его по экрану, и там еще должны быть
// кнопки сохранить новое расположение или сбросить до стандартного», then «перетаскивать я имею ввиду не нотификации вокруг
// коробля ... а легенду локатор, расположение нотификаций, сувениров и так далее, основную панель нижнюю нельзя двигать»).
//
// Five groups move, each by an offset from its own place: the locator (the scope and its legend), the quest list, the route's
// header (the task banner since chat B; since S8 the task's line in the helmet's notch, which stays: see LAYOUT_ORDER), the souvenir
// shelf and the place the notices come in. The cockpit's lower panel does not. The shelf hangs under the locator and goes with it, and
// moves on its own too (SX, 2026-10-02: «локатор отдельным блоком ... Квесты отдельным блоком»; the quest list was the one under the
// locator until S3 SWAP of 2026-10-08, when the quests and the radio went to the screen's other side and the shelf took their place).
//
// The sides (labs/graphics/hud-sides.js, SX, 2026-10-08: «HUD PLACE: S3 + MIRROR SWITCH»): a group's own place is where the sides put it,
// and the offsets are from there. The pause's SIDES switch swaps the two sides; the offsets kept are mirrored with it (x less, y the same;
// the notice, in the middle, stays), so a layout made for one side is the same picture on the other and never leaves the screen.
// `place.side` is the side the offsets are for; the v2 record says it (`side`), and a record made for the other side is mirrored as it
// is read. A record with no side (or the v1 key) was made before S3 SWAP: its quests, shelf and radio offsets were from places they no
// longer stand in, and are dropped once, as it is read (the column's and the notice's places did not move, and are kept).
//
// The editor (chat P, 2026-10-04: SX's P2 LEDGER's LAYOUT page, labs/graphics/sketches/pause-v2.html; the economy's section 10,
// codex/economy-2026-10-03/CLAUDE_HANDOFF.md: «extend the existing editor ... never a second one»). Under P's pause, on the LAYOUT
// page, each group shows its outline and name and is dragged by the mouse on the interface's 4 px step; or taken from its row (a click,
// or Enter where the keys walk), moved 4 px a press by the arrows (16 with the layoutFar key) and put down again; Escape takes a move
// back. SAVE LAYOUT and CANCEL are apart, RESET THIS (the group taken last) and RESET ALL are apart; a reset is a draft until saved, and
// a layout not saved lasts the visit. Kept in this browser (src/prefs.js `hudLayout`, the v2 key; the v1 key's offsets are read once
// and written into it, and v1 is still written beside it so an older build finds its places). A write that fails is said as one,
// the draft kept and SAVE LAYOUT left to try again.
//
// Never off the screen, never over the cockpit, never on the ship (`safeArea`): a moved group is held inside the screen above the
// lower panel and out of a square round the screen's middle where the ship flies, each frame, so a smaller window or another screen
// brings an old place back into view (its stored offset is kept as it was). A group at its own place (offset 0) is the game's and is
// never moved. Nothing a group is (the hull, the fuel, the task the pilot follows) is hidden by the editor: it moves groups, never
// takes one away; a group a new pilot has not been given yet (the opening's locator and quests, its shelf: src/opening.js interfaceGiven) is not offered.

import { ROLES } from '../../src/roles.js';
import { uiMetrics, UI } from '../../src/uiGrid.js';
import { noteAction } from './clicks.js';
import { readHudPlace, writeHudPlace, readHudLayout, writeHudLayout, readHudSide } from '../../src/prefs.js';
import { px, clamp, inBox } from '../../src/util.js';
import { wornLook, BASE_LOOKS } from '../../src/widgets.js';
import { tr } from '../../src/lang.js';

// The locator's side (labs/graphics/hud-sides.js is the switch): the other side holds the quests and the radio.
export const HUD_SIDES = Object.freeze(['left', 'right']);
export const DEFAULT_HUD_SIDE = 'left';

// `under`: the group this one hangs under and rides with (the quest list under the locator). The radio's log and the photo frame are
// groups a pilot earns (src/widgets.js), drawn only while worn.
export const HUD_GROUPS = Object.freeze([
  { id: 'column', label: 'LOCATOR' }, { id: 'quests', label: 'QUESTS' }, { id: 'header', label: 'TASK' },
  { id: 'shelf', label: 'SOUVENIRS', under: 'column' }, { id: 'notice', label: 'NOTICES' }, { id: 'radio', label: 'RADIO' }, { id: 'photo', label: 'PHOTO' },
]);
// The LAYOUT page's list: the screen's reading order (the left column top to bottom, the middle, the right), by the locator's side.
// The task (`header`) is not on it since S8 (2026-10-04): its line stands in the notch of the helmet's top (labs/graphics/helmet.js),
// which no more moves than the lower panel does; an offset kept for it is kept and not read.
const ORDER = Object.freeze({
  left: Object.freeze(['column', 'shelf', 'notice', 'quests', 'radio', 'photo']),
  right: Object.freeze(['quests', 'radio', 'photo', 'notice', 'column', 'shelf']),
});
export const layoutOrder = (side) => ORDER[side] ?? ORDER.left;
export const LAYOUT_ORDER = ORDER.left;
// The groups that stand on the locator's side or on the other: the sides swap them, so their kept offsets mirror with the swap.
const SWAPS = Object.freeze(['column', 'quests', 'shelf', 'radio']);
// The groups whose own place S3 SWAP changed (the quests went to the top right, the shelf under the locator): offsets kept from before are not read.
const MOVED = Object.freeze(['quests', 'shelf', 'radio']);
// The groups the v1 key held (an older build reads exactly these).
const V1_IDS = Object.freeze(['column', 'quests', 'header', 'shelf', 'notice']);
export const groupLabel = (id) => HUD_GROUPS.find((g) => g.id === id)?.label ?? id;
// The edges of the HUD's two columns as drawn (the locator and the shelf under it on one side, the quest list and the radio on the
// other; `boxes` as the page keeps them, `radio` its box as drawn), for the centred windows to keep clear of (src/uiGrid.js centredWindow):
// the left column's right ink edge and the right column's left, null where nothing stands on that half of the screen.
const COLUMN_IDS = Object.freeze(['column', 'quests', 'shelf']);
function edgeOf(boxes, width, radio, right) {
  let edge = null;
  const take = (b) => {
    if (!b || !(b.w > 0) || (b.x + b.w / 2 < width / 2) === right) return;
    edge = right ? Math.min(edge ?? Infinity, b.x) : Math.max(edge ?? -Infinity, b.x + b.w);
  };
  for (const id of COLUMN_IDS) take(boxes?.[id]);
  take(radio);
  return edge;
}
export const leftColumnEdge = (boxes, width, radio = null) => edgeOf(boxes, width, radio, false);
export const rightColumnEdge = (boxes, width, radio = null) => edgeOf(boxes, width, radio, true);
// Px a press of the arrows moves a group taken, and with the layoutFar key held (the economy's section 10: «arrows move four
// pixels, Shift arrows sixteen»); `centre` the half side of the square round the screen's middle no group may stand on.
export const NUDGE = Object.freeze({ near: 4, far: 16 });
export const SAFE = Object.freeze({ centre: 150 });
// What a save of the layout says (chat B's T2: the fact and what it means): [title, detail, kind].
export const LAYOUT_NOTES = Object.freeze({
  saved: Object.freeze(['LAYOUT SAVED', 'IN THIS BROWSER', 'gain']),
  failed: Object.freeze(['LAYOUT NOT SAVED', 'KEPT FOR THIS VISIT', 'danger']),
});
const ZERO = Object.freeze({ x: 0, y: 0 });
const IDS = HUD_GROUPS.map((g) => g.id);
const blank = () => Object.fromEntries(IDS.map((id) => [id, { x: 0, y: 0 }]));
const zero = (o) => !o || (!o.x && !o.y);

// The places kept in this browser are src/prefs.js's; `store` is the page's backend, this browser's own when left out. A browser
// that kept only the v1 offsets has them written once under the v2 key (the migration; nothing kept, nothing written).
// `looks`: the presentation kept for a group (src/widgets.js), where one other than its own was chosen; `savedLooks` as last saved.
export function createHudPlace(store) {
  // (The side is the browser's own, kept apart from the places: the pause's SIDES row, hud-sides.js.)
  const side = readHudSide(HUD_SIDES, store);
  const place = { offsets: blank(), saved: blank(), looks: {}, savedLooks: {}, fitted: null, drag: null, store, safe: null, status: null,
    editor: { selected: null, moving: null }, side };
  const v2 = readHudLayout(IDS, store);
  // The offsets kept are for the side they were made on (a record that says none, or the v1 key, for the left): the other, mirrored.
  let made = 'left';
  if (v2) { Object.assign(place.offsets, v2.offsets); Object.assign(place.looks, v2.looks); made = v2.side ?? 'left'; }
  else Object.assign(place.offsets, readHudPlace(V1_IDS, store));
  if (!v2?.side) for (const id of MOVED) place.offsets[id] = { x: 0, y: 0 };
  if (made !== side) mirrorOffsets(place.offsets);
  if (!v2 && V1_IDS.some((id) => !zero(place.offsets[id]))) writeHudLayout(layoutRecord(place), store);
  place.saved = structuredClone(place.offsets);
  place.savedLooks = { ...place.looks };
  return place;
}
// Every group that changes sides, its offset mirrored in place (x less, y the same; an offset of 0 stays 0).
function mirrorOffsets(offsets) {
  for (const id of SWAPS) {
    const o = offsets[id];
    if (o && o.x) offsets[id] = { x: -o.x, y: o.y };
  }
}
// The locator's side swapped under a place made (the pause's SIDES, labs/graphics/hud-sides.js setHudSide): the offsets, those last
// saved and a move in hand mirrored with it, a drag let go. What the browser keeps is not written here: it says the side it was made
// for, and is mirrored when it is read.
export function flipHudPlace(place, side) {
  if (place.side === side) return false;
  place.side = side;
  mirrorOffsets(place.offsets);
  mirrorOffsets(place.saved);
  place.fitted = null;
  place.drag = null;
  const m = place.editor.moving;
  if (m && SWAPS.includes(m.id) && m.from.x) m.from = { x: -m.from.x, y: m.from.y };
  return true;
}
// What the v2 key holds: the version, the screen it was laid out on (`ref`, for a later scaling; null before one was seen), and
// each group's offset from its own place in whole px, with its presentation where one other than its own was chosen.
function layoutRecord(place, offsets = place.offsets, looks = place.looks) {
  const ref = place.safe ? { w: place.safe.w, h: place.safe.h } : null;
  return { version: 2, ref, side: place.side, modules: Object.fromEntries(IDS.map((id) => [id, { x: offsets[id].x, y: offsets[id].y,
    ...(looks[id] && looks[id] !== BASE_LOOKS[id]?.look ? { look: looks[id] } : {}) }])) };
}
// The presentation a group wears for this pilot (`ledger`, World.ledger): the one kept if earned, else its own.
export const lookOf = (place, id, ledger) => wornLook(ledger, id, place?.looks?.[id]);
// A presentation chosen on the LAYOUT page: a draft until saved.
export function setLook(place, id, look) {
  if (look === (BASE_LOOKS[id]?.look ?? null)) delete place.looks[id]; else place.looks[id] = look;
  place.status = null;
}

// A group's offset as drawn this frame: its own, or where the safe area holds it (settleHudPlace).
export const offsetOf = (place, id) => place?.fitted?.[id] ?? place?.offsets[id] ?? ZERO;
export const shifted = (box, o) => (box && (o.x || o.y) ? { ...box, x: box.x + o.x, y: box.y + o.y } : box);
export const unsaved = (place) => JSON.stringify(place.offsets) !== JSON.stringify(place.saved)
  || JSON.stringify(sorted(place.looks)) !== JSON.stringify(sorted(place.savedLooks));
const sorted = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)));

// SAVE LAYOUT: true when the browser took it (both keys); the draft stays as it is either way, so a failed one can be tried again.
export function saveHudPlace(place) {
  const v2 = writeHudLayout(layoutRecord(place), place.store);
  const v1 = writeHudPlace(Object.fromEntries(V1_IDS.map((id) => [id, place.offsets[id]])), place.store);
  if (v2 && v1) { place.saved = structuredClone(place.offsets); place.savedLooks = { ...place.looks }; }
  place.status = v2 && v1 ? 'saved' : 'failed';
  return v2 && v1;
}
// RESET ALL, saved at once (the page's old RESET LAYOUT; the editor's RESET ALL is a draft: resetGroups).
export function resetHudPlace(place) {
  resetGroups(place);
  return saveHudPlace(place);
}
// The editor's drafts: every group, or one, back at its own place; CANCEL, the last saved places back. None is kept until saved.
export function resetGroups(place, id = null) {
  for (const g of id ? [id] : IDS) { place.offsets[g] = { x: 0, y: 0 }; delete place.looks[g]; }
  place.editor.moving = null;
  place.status = null;
}
export function cancelLayout(place) {
  place.offsets = structuredClone(place.saved);
  place.looks = { ...place.savedLooks };
  place.editor.moving = null;
  place.status = null;
}

// ------------------------------------------------------------------------------------------------ the safe area

// The lower panel's top (labs/graphics/hud-layout.js deckLayout, as last drawn), or null with no deck.
export function deckTop(layout) {
  if (!layout?.deck) return null;
  const tops = [layout.consoleTop?.y, layout.drive?.y, layout.velocity?.y, layout.helm?.bounds?.y].filter(Number.isFinite);
  return tops.length ? Math.min(...tops) : null;
}
// Where a moved group may stand on `r`'s screen: inside it, above the lower panel by the inset's air, and off the square round its
// middle (`reserve`) where the ship flies.
export function safeArea(r, layout = null) {
  const deck = deckTop(layout), I = Math.round(UI.air.inset);
  const c = SAFE.centre, cx = r.cx ?? r.width / 2, cy = r.cy ?? r.height / 2;
  return { w: r.width, h: r.height, x0: 0, y0: 0, x1: r.width, y1: deck === null ? r.height : Math.min(r.height, deck - I),
    reserve: { x: cx - c, y: cy - c, w: 2 * c, h: 2 * c } };
}
// An offset `o` for a group whose own place is `base` ({ x, y, w, h }), held to the safe area `safe`: the screen and the deck's edge,
// then out of the reserve the shortest way. An offset of 0 is the group's own place and stands as it is.
export function clampOffset(o, base, safe) {
  if (zero(o) || !base || !safe) return o;
  const hold = (p) => ({ x: clamp(p.x, safe.x0, Math.max(safe.x0, safe.x1 - base.w)), y: clamp(p.y, safe.y0, Math.max(safe.y0, safe.y1 - base.h)) });
  let at = hold({ x: base.x + o.x, y: base.y + o.y });
  const q = safe.reserve;
  if (q && at.x < q.x + q.w && at.x + base.w > q.x && at.y < q.y + q.h && at.y + base.h > q.y) {
    const ways = [{ x: q.x - base.w, y: at.y }, { x: q.x + q.w, y: at.y }, { x: at.x, y: q.y - base.h }, { x: at.x, y: q.y + q.h }]
      .map((p) => ({ p, d: Math.abs(p.x - at.x) + Math.abs(p.y - at.y) }));
    at = hold(ways.reduce((a, b) => (b.d < a.d ? b : a)).p);
  }
  return { x: Math.round(at.x - base.x), y: Math.round(at.y - base.y) };
}
// Once a frame, after the groups are drawn (`boxes`, each as drawn with the offsets of offsetOf): where each will be drawn next,
// held to `safe` (a resize, another screen). A group's own place is its box less the offsets it was drawn with; one hanging under
// another rides with it and is held as a whole.
export function settleHudPlace(place, boxes, safe) {
  place.safe = safe;
  const fitted = {};
  for (const g of HUD_GROUPS) {
    const own = place.offsets[g.id], box = boxes?.[g.id];
    const parentNow = g.under ? fitted[g.under] ?? ZERO : ZERO, parentWas = g.under ? offsetOf(place, g.under) : ZERO;
    if (!box) { fitted[g.id] = own; continue; }
    const was = offsetOf(place, g.id);
    const base = { x: box.x - parentWas.x - was.x, y: box.y - parentWas.y - was.y, w: box.w, h: box.h };
    const total = clampOffset({ x: parentNow.x + own.x, y: parentNow.y + own.y }, base, safe);
    fitted[g.id] = { x: total.x - parentNow.x, y: total.y - parentNow.y };
  }
  place.fitted = fitted;
}

// The group under (x, y) among `boxes` ({ id: box as drawn now }), the one drawn last first.
export function groupAt(boxes, x, y) {
  for (const g of [...HUD_GROUPS].reverse()) if (inBox(boxes[g.id], x, y)) return g.id;
  return null;
}

// A group's own place, from its box as drawn now: less its offset and the offset of the group it hangs under.
function ownPlace(place, id, box) {
  const g = HUD_GROUPS.find((h) => h.id === id), parent = g?.under ? offsetOf(place, g.under) : ZERO, o = offsetOf(place, id);
  return { x: box.x - parent.x - o.x, y: box.y - parent.y - o.y, w: box.w, h: box.h, parent };
}
// A drag begun at (x, y) on group `id`, whose box is drawn at `box` now. It is the group taken (RESET THIS resets it).
export function beginDrag(place, id, x, y, box) {
  place.editor.selected = id;
  place.drag = { id, x, y, from: { ...offsetOf(place, id) }, base: ownPlace(place, id, box) };
  place.status = null;
}
// The pointer moved to (x, y): the group follows on the 4 px step, held to the safe area (the screen's, `width` x `height`, until
// a frame has measured one).
export function moveDrag(place, x, y, width, height, step = NUDGE.near) {
  const d = place.drag;
  if (!d) return;
  const snap = (v) => Math.round(v / step) * step;
  place.offsets[d.id] = heldOffset(place, d.base, { x: snap(d.from.x + x - d.x), y: snap(d.from.y + y - d.y) }, width, height);
}
export function endDrag(place) { place.drag = null; }
// An offset of a group (its own place `base`, the group it rides with at `base.parent`) held to the safe area.
function heldOffset(place, base, o, width, height) {
  const safe = place.safe ?? { x0: 0, y0: 0, x1: width, y1: height, reserve: null };
  const p = base.parent ?? ZERO, total = clampOffset({ x: p.x + o.x, y: p.y + o.y }, base, safe);
  return { x: total.x - p.x, y: total.y - p.y };
}

// The editor's keys: take a group from its row (or put it down, when it is the one taken), move it `dx`, `dy` px, or take the move
// back (Escape). `box` the group's as drawn now.
export function takeGroup(place, id) {
  const ed = place.editor;
  if (ed.moving?.id === id) { ed.moving = null; return false; }
  ed.selected = id;
  ed.moving = { id, from: { ...place.offsets[id] } };
  place.status = null;
  return true;
}
export function nudgeGroup(place, dx, dy, box, width, height) {
  const m = place.editor.moving;
  if (!m || !box) return false;
  const o = place.offsets[m.id];
  place.offsets[m.id] = heldOffset(place, ownPlace(place, m.id, box), { x: o.x + dx, y: o.y + dy }, width, height);
  return true;
}
export function backMove(place) {
  const m = place.editor.moving;
  if (!m) return false;
  place.offsets[m.id] = { ...m.from };
  place.editor.moving = null;
  return true;
}

// ------------------------------------------------------------------------------------------------------- under the pause ---

function dashedBox(r, b, ink, offset = 0) {
  const ctx = r.ctx;
  ctx.save();
  ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.globalAlpha = 1; ctx.setLineDash([4, 4]); ctx.lineDashOffset = offset;
  ctx.beginPath(); ctx.rect(px(b.x - 6), px(b.y - 6), Math.round(b.w + 11), Math.round(b.h + 11)); ctx.stroke();
  ctx.restore();
}

// Whether `rect` stands on the outline (the box less and more 6 px) of a group other than `id`.
function crowded(boxes, id, rect) {
  for (const g of HUD_GROUPS) {
    const o = boxes[g.id];
    if (g.id === id || !o) continue;
    if (rect.x < o.x + o.w + 5 && rect.x + rect.w > o.x - 6 && rect.y < o.y + o.h + 5 && rect.y + rect.h > o.y - 6) return true;
  }
  return false;
}
// Each group's outline and name over it (`hover` the one under the pointer or the row the pointer is on, and the one taken, in
// white; the rest in the structure blue, their dashes marching), and under the pause plate its two buttons, from `top`: SAVE LAYOUT
// (bright while there is a change to keep) and RESET. The buttons answer a click (labs/graphics/clicks.js). Returns the buttons' boxes.
// `buttons: false`: the outlines alone (the pause's LAYOUT page holds the buttons, labs/graphics/pause.js).
export function drawPlaceOverlay(r, boxes, place, { hover = null, top, t = 0, onSave, onReset, buttons: withButtons = true } = {}) {
  const m = uiMetrics(r), cw = r.cellW;
  for (const g of HUD_GROUPS) {
    const b = boxes[g.id];
    if (!b) continue;
    const lit = place.drag?.id === g.id || place.editor?.moving?.id === g.id || hover === g.id;
    dashedBox(r, b, lit ? ROLES.textPrimary : ROLES.structure, -t * 12);
    // The name over the outline's top left, or inside it when the outline stands at the screen's top or the name would stand on another
    // group's outline (the shelf under the locator: the two are a container's inset apart, less than the name's row).
    const label = tr(g.label), w = (Array.from(label).length + 2) * cw, above = b.y - 6 - UI.row >= 0 && !crowded(boxes, g.id, { x: b.x - 6, y: b.y - 6 - UI.row, w, h: UI.row }),
      y = Math.round(above ? b.y - 6 - UI.row : b.y - 5);
    r.fill(Math.round(b.x - 6), y, Math.round(w), UI.row, ROLES.backing);
    r.text(label, Math.round(b.x - 6 + cw), y + m.textY, lit ? ROLES.textPrimary : ROLES.structure);
  }
  if (!withButtons) return [];
  const buttons = [
    { label: 'SAVE LAYOUT', ink: unsaved(place) ? ROLES.textPrimary : ROLES.textSecondary, run: onSave },
    { label: 'RESET', ink: ROLES.textSecondary, run: onReset },
  ];
  for (const b of buttons) b.label = tr(b.label);
  const gap = 2 * cw, widths = buttons.map((b) => (Array.from(b.label).length + 4) * cw);
  let x = Math.round(r.cx - (widths.reduce((a, b) => a + b, 0) + gap) / 2);
  return buttons.map((b, i) => {
    const box = { x, y: Math.round(top), w: Math.round(widths[i]), h: UI.row + 2 * UI.pad };
    r.fill(box.x, box.y, box.w, box.h, ROLES.backing);
    const ctx = r.ctx;
    ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = b.ink; ctx.strokeRect(px(box.x), px(box.y), box.w - 1, box.h - 1); ctx.restore();
    r.text(b.label, box.x + 2 * cw, box.y + UI.pad + m.textY, b.ink);
    if (b.run) noteAction(box, b.run);
    x += widths[i] + gap;
    return box;
  });
}
