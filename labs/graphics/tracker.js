// The ruins' tracker, on the deck's left shoulder (SX, 2026-10-08: «нарисуй 4 варианта виджета трекера, который показывает все станции в
// которые ты начал вкладываться и сколько процентов вложено (цветными полосочками узкими по 4px прям с подписями», then on the four
// variants of labs/graphics/sketches/station-tracker.html: «я бы вот так поставил и позволил бы скрывать как и легенду, а деньги перенес
// бы рядом с топливом», on a screenshot with a box over the space above the deck's left rail; and, on the look: «берем ledger»).
//
// What it shows: a row for each ruin the pilot has begun to fund and not yet restored (src/ruins.js: `invested` over the price; the
// ledger's `invested` map holds exactly those, the first begun first). A row is the sketch's T1 LEDGER: two lines, the ruin's name and
// its sector's code in the hint ink with the share at the right end, and under them a bar 4 px thick (UI.pad: a mark and its own ink) the
// block's whole width, its colour the station's own (`ruinInk`: its look's hue; the sector's until 2026-10-09). A ruin restored says RESTORED in the
// done green a moment, and goes; the rows over it close up. Nothing begun: nothing is drawn, no button either.
//
// Where it stands: the left shoulder of the deck, between the strut's foot and the shoulder's bend, the lowest line two containers'
// insets over the rail (SX's box on his screenshot; «чуть вверх», 2026-10-09). At the block's foot is its button, as M LEGEND is the
// locator's: a keycap with its letter, a word and a chevron that turns (labs/graphics/locator.js drawColumnButton), the rows above it,
// the first begun lowest and the rest growing upward. On the same row, at the block's right end, stands the WALLET (labs/graphics/souvenir-shelf.js drawWallet: SX, on the
// second screenshot, a box on the button's row at the right: «бро вот сделай так»), so the row holds the wallet alone while nothing is
// begun. The key B (src/controls.js `tracker`) or a click on the button hides the rows and shows them again; kept in this browser
// (src/prefs.js `tracker`), never in the save; the button stays. The deck is not mirrored by the pause's SIDES, nor is this.
//
// Its motion is the quest list's, on the quest list's times (labs/graphics/quest-list.js, rail.js): a row comes as its cells change
// through `01/:·_` and settle; a deposit grows the bar and lights the new part white; a ruin finished turns green, stands, and goes the
// way a done quest goes, the rows over it easing down. Reduced motion: no lore, no flash, no easing; a row stands as it is, and a done
// row stands its time and goes.
//
// Made once, nothing a frame (common rule 14): the state (`createTracker`, the page's `game.tracker`) and its rows are kept and reused;
// the shoulder's places per screen (`shoulderOf`). The strings a row's lore makes for its first second and its last are the one
// exception, as the quest list's plates make theirs.
import { UI, uiMetrics } from '../../src/uiGrid.js';
import { ROLES, PALETTE } from '../../src/roles.js';
import { clamp, easeOut } from '../../src/util.js';
import { keyName } from '../../src/controls.js';
import { readTracker, writeTracker } from '../../src/prefs.js';
import { START_STATIONS, sectorById } from '../../src/sectors.js';
import { ruinDef, ruinIdsOf } from '../../src/ruins.js';
import { BAR } from './cockpit-bar.js';
import { washOf, LORE, LORE_TIMES, railOutTime } from './rail.js';
import { QUEST_OUTCOME, QUEST_TIMES } from './quest-list.js';
import { drawColumnButton, buttonInk } from './locator.js';
import { keyMarkLeft, KEYCAP_PAD, KEY_MARK_HALF } from './ui-parts.js';
import { noteKey } from './clicks.js';
import { LOOKS } from './station-art.js';
import { tr } from '../../src/lang.js';

// The ink of each sector's bar until 2026-10-09 (T1: the code printed by the name was the key to it), now only a ruin's with no look. The sketch gave five of the palette's inks to the
// five sectors of its demo pilot's ruins; K-05 is YARD 3's, the start ruin one pilot in three begins with, and takes the gray (not the
// white: the money just put in is lit white, and would not show on it).
export const SECTOR_INK = Object.freeze({ 'K-04': PALETTE.blue, 'J-06': PALETTE.green, 'K-06': PALETTE.amber, 'J-04': PALETTE.orange, 'J-05': PALETTE.purple,
  'K-05': PALETTE.gray });
// The ink of a ruin's bar: its station's own colour, the hue its look is drawn from (labs/graphics/station-art.js: the look's lit tone, its
// coloured parts the hue's tones; SX, 2026-10-09: «полоску восстановления станции делай, кстати, по основному цвету станции. Да, то есть там
// есть какой-то преобладающий цветной элемент, вот делай такую полоску»). A ruin with no look keeps its sector's ink.
export const ruinInk = (def) => (LOOKS[def.look] ? LOOKS[def.look]().hue : null) ?? SECTOR_INK[sectorById(def.sectorId)?.label] ?? PALETTE.blue;
// What a finished ruin is painted in, and says: the done quest's green.
export const DONE_INK = QUEST_OUTCOME.done.ink;
export const DONE_WORD = 'RESTORED';
// The numbers of the tracker in one place. `fill` the bar's growth to a new share (s), `flash` the white of the money just put in
// settling to the ink, `hold` how long a finished ruin stands (a second less than a done quest: the restoration has its own notice), `out`
// how long it takes to go, `move` how long the rows take to close up (the quest list's), `lore` .. `step` the lore's, the quest
// list's own, `turn` the chevron's (the legend's). `words`: the button's word, hidden (it opens upward) and shown. `over` the air between
// the block's lowest ink and the rail's: a container's inset until SX, 2026-10-09: «Чуть подальше, чуть вверх подвинь ... виджет
// восстановления станции, как-то он на слишком маленьком отступе стоит от панели», now two.
export const TRACKER = Object.freeze({ fill: 0.6, flash: 1.2, hold: QUEST_TIMES.hold - 1, out: railOutTime('event'), move: QUEST_TIMES.close, over: 2 * UI.air.inset,
  lore: LORE_TIMES.sweep, glyph: LORE_TIMES.cell, step: LORE_TIMES.step, turn: 0.18, words: Object.freeze({ hidden: "RUINS", shown: "HIDE RUINS" }),
  // the lore's whole length: past it a row's words are plain
  settled: LORE_TIMES.sweep + LORE_TIMES.cell });
// The widest name of any ruin under any start ruin's roll, in cells: the sector's code stands a cell after it.
export const NAME_CELLS = Math.max(...START_STATIONS.flatMap((start) => {
  const ledger = { startRuin: start };
  return ruinIdsOf(ledger).map((id) => Array.from(ruinDef(id, ledger).label).length);
}));
// A bar's thickness: SX's 4 px, the spacing system's first step (UI.pad: a mark and its own ink).
const BAR_H = UI.pad;

// ------------------------------------------------------------------------------------------------ the places

// The shoulder's measures on `r`'s screen, kept while they are the same: `x0`, `x1` the block's ink edges (the strut's foot and the shoulder's
// bend, each its air in), `rowTop` the button's row (the wallet's too: a text row, the keycap's ink TRACKER.over above the rail's),
// `rowsBottom` where the lowest bar ends (a rule's air over the button's ink), `pitch` one entry's, `capH` the capitals', `wallet` the
// box drawWallet is given (its count ends on x1), `foot` the ink of the row (the box the windows keep off while nothing is begun).
const kept = { w: -1, h: -1, cw: 0, ch: 0, dpr: 0, font: null, value: null };
export function shoulderOf(r, deck) {
  const k = kept;
  if (k.value !== null && k.w === r.width && k.h === r.height && k.cw === r.cellW && k.ch === r.cellH && k.dpr === r.dpr && k.font === r.font) return k.value;
  const m = uiMetrics(r), ink = buttonInk(r);
  const x0 = Math.round(deck.rail[1][0] + UI.air.inset), x1 = Math.round(deck.rail[2][0] - UI.air.rule);
  const railTop = deck.railY - BAR.outer / 2;
  const rowTop = Math.round(railTop - TRACKER.over - ink.bottom);
  const capH = m.capBottom - m.capTop;
  const value = Object.freeze({
    x0, x1, rowTop, capH, ink, pitch: Math.round(capH + UI.pad + BAR_H + UI.air.rule),
    rowsBottom: rowTop + ink.top - UI.air.rule,
    wallet: Object.freeze({ x: x0, y: rowTop, w: x1 + m.capLeft - x0, h: UI.row, alone: false }),
    foot: Object.freeze({ x: x0, y: rowTop + ink.top, w: x1 - x0, h: ink.bottom - ink.top }),
  });
  k.w = r.width; k.h = r.height; k.cw = r.cellW; k.ch = r.cellH; k.dpr = r.dpr; k.font = r.font; k.value = value;
  return value;
}

// ------------------------------------------------------------------------------------------------ the state

// A row's fields, every one declared here: `seq` the order begun (the first lowest), `born` when it came (its lore), `from` .. `to` the
// bar's share and `fundAt` when it began to move, `flashA` .. `flashB` and `flashAt` the money just put in (white over that part), `doneAt` when
// it was finished (null: live), `slotFrom` .. `slotTo` its place in the stack and `moveAt` since when, `seen` the frame that last found it
// in the ledger, `pct` its share as written.
function makeRow(id, def, seq, now) {
  return { id, label: def.label, sector: sectorById(def.sectorId)?.label ?? '--', cost: def.cost, ink: PALETTE.blue, seq, born: now, from: 0, to: 0, fundAt: now,
    flashA: 0, flashB: 0, flashAt: -Infinity, doneAt: null, slotFrom: 0, slotTo: 0, moveAt: -Infinity, seen: 0, pct: '0%' };
}
const pctText = (share) => `${Math.floor(share * 100 + 1e-9)}%`;

// The page's one tracker: `hidden` this browser's choice (kept), `rows` in the order begun, `ledger` the one they follow; `box` the ink
// of what stands now (rows and button), `button` the button's box as drawn; `ceiling` the lowest ink above the block of anything the
// page keeps (the page sets it each frame); `near` the boxes the page lays over it. Every field declared here.
export function createTracker(store) {
  const t = { store, hidden: readTracker(store), rows: [], by: new Map(), ledger: null, frame: 0, now: 0, reduced: false, seq: 0, shownAt: -Infinity,
    turn: 0, turnFrom: 0, turnAt: -Infinity, box: { x: 0, y: 0, w: 0, h: 0 }, button: null, near: [null, null, null, null], visit: null,
    r: null, key: '', note: null, args: { x0: 0, edge: 0, rowTop: 0, key: '', word: '', turn: 0, name: 'tracker', note: null },
    phase: { name: 0, u: 0, age: 0 } };
  t.turn = t.hidden ? 1 : 0; t.turnFrom = t.turn;
  t.note = (box) => noteKey(t.key, box, t.r);
  t.args.note = t.note;
  t.visit = (cr, id) => visit(t, cr, id);
  return t;
}
// The phase names of a row at a time (`phaseOf`): live, finished and standing, finished and going.
const LIVE = 0, DONE = 1, OUT = 2;

// `cr` the money in it; a ruin an open quest is about comes with none yet (`quest`: SX, 2026-10-09, «прям на квесте про станцию начинай
// уже показывать незаполненную шкалу и подпись станции»), its bar empty, its row there from the quest's first frame.
function visit(t, cr, id, quest = false) {
  if (!(cr > 0) && !quest) return;
  if (quest && t.ledger?.restored?.has(id)) return;
  const now = t.now;
  let row = t.by.get(id);
  // A ruin finished and begun again (a reset): the old row is gone, this is a new one.
  if (row && row.doneAt != null) { t.rows.splice(t.rows.indexOf(row), 1); t.by.delete(id); row = undefined; }
  if (!row) {
    const def = ruinDef(id, t.ledger);
    if (!def) return;
    row = makeRow(id, def, t.seq++, now);
    row.ink = ruinInk(def);
    row.slotFrom = row.slotTo = t.rows.length;
    t.rows.push(row); t.by.set(id, row);
  }
  row.seen = t.frame;
  const share = Math.min(1, cr / row.cost);
  if (share > row.to + 1e-6) {
    row.from = t.reduced ? share : shareOf(row, now);
    if (!t.reduced && row.to > 0) { row.flashA = row.to; row.flashB = share; row.flashAt = now; }
    row.to = share; row.fundAt = now; row.pct = pctText(share);
  } else if (share < row.to - 1e-6) { row.from = t.reduced ? share : shareOf(row, now); row.to = share; row.fundAt = now; row.flashAt = -Infinity; row.pct = pctText(share); }
  if (t.reduced) row.from = row.to;
}
// The bar's share now: from the old one to the new over `fill`.
function shareOf(row, now) { return row.from + (row.to - row.from) * easeOut(clamp((now - row.fundAt) / TRACKER.fill, 0, 1)); }
// A row's slot in the stack now (0 the lowest), easing to its new one as the rows close up.
function slotOf(row, now) { return row.slotFrom + (row.slotTo - row.slotFrom) * easeOut(clamp((now - row.moveAt) / TRACKER.move, 0, 1)); }
function finish(t, row, now) {
  row.from = t.reduced ? 1 : shareOf(row, now);
  if (!t.reduced) { row.flashA = row.to; row.flashB = 1; row.flashAt = now; }
  row.to = 1; row.fundAt = now; row.doneAt = now; row.pct = DONE_WORD;
}
// Where a row is at `now`, written into the state's one `phase`: LIVE, DONE (finished, standing), OUT (going; `u` 0..1); `age` since the
// row came (LIVE), since it was finished (DONE) or since it began to go (OUT).
function phaseOf(t, row, now) {
  const p = t.phase;
  if (row.doneAt == null) { p.name = LIVE; p.u = 0; p.age = now - row.born; return p; }
  const a = now - row.doneAt;
  if (a < TRACKER.hold || t.reduced) { p.name = DONE; p.u = 0; p.age = a; return p; }
  p.name = OUT; p.u = clamp((a - TRACKER.hold) / TRACKER.out, 0, 1); p.age = a - TRACKER.hold;
  return p;
}

// Once a frame, before the cockpit is drawn: `ledger` the pilot's (src/contracts.js: `invested` the ruins begun, `restored` those done),
// `now` the page's time (s). Rows follow the ledger: one for each ruin with money in it, a finished one kept till it has gone.
// `plates` the quest list's (labs/graphics/quest-list.js board.plates, synced this frame): a ruin an open quest leads to (its target's
// `stationId`: the guide's THE GUARDS, FIRST COINS and REBUILD, the opening's old station, the first-dock support) has its row too,
// empty until money goes in; a ruin with money in it comes first as it did.
export function stepTracker(t, ledger, now, reducedMotion = false, plates = null) {
  t.now = now; t.reduced = reducedMotion;
  if (!ledger?.invested) return;
  if (t.ledger !== ledger) { t.ledger = ledger; t.rows.length = 0; t.by.clear(); }
  t.frame += 1;
  ledger.invested.forEach(t.visit);
  if (plates) for (let i = 0; i < plates.length; i++) {
    const p = plates[i], id = p.doneAt == null ? p.q?.target?.stationId : null;
    if (id != null && !ledger.invested.has(id)) visit(t, 0, id, true);
  }
  const rows = t.rows, gone = TRACKER.hold + (reducedMotion ? 0 : TRACKER.out);
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.doneAt == null) {
      if (row.seen === t.frame) continue;
      if (ledger.restored?.has(row.id)) finish(t, row, now);
      else { rows.splice(i, 1); t.by.delete(row.id); }
    } else if (now - row.doneAt >= gone) { rows.splice(i, 1); t.by.delete(row.id); }
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.slotTo === i) continue;
    row.slotFrom = reducedMotion ? i : slotOf(row, now); row.slotTo = i; row.moveAt = reducedMotion ? -Infinity : now;
  }
  // The chevron's turn.
  const target = t.hidden ? 1 : 0;
  if (reducedMotion) t.turn = target; else t.turn = t.turnFrom + (target - t.turnFrom) * easeOut(clamp((now - t.turnAt) / TRACKER.turn, 0, 1));
}

// B or a click on the button: the rows hidden or shown. Kept at once, in this browser (never the save); shown again, they come as new.
export function toggleTracker(t) {
  t.hidden = !t.hidden;
  writeTracker(t.hidden, t.store);
  t.turnFrom = t.turn; t.turnAt = t.now;
  if (!t.hidden) for (let i = 0; i < t.rows.length; i++) { const row = t.rows[i]; row.born = t.now; row.from = 0; row.fundAt = t.now; row.flashAt = -Infinity; row.slotFrom = row.slotTo; row.moveAt = -Infinity; }
  return t.hidden;
}

// ------------------------------------------------------------------------------------------------ drawing

// The words of a row as they show, the lore's cells changing through `01/:·_` before the letter, in and out (the quest list's, rail.js).
function loreIn(s, age, key) {
  if (age >= TRACKER.settled) return s;
  const n = s.length, step = TRACKER.lore / Math.max(1, n);
  let out = '';
  for (let i = 0; i < n; i++) {
    const ch = s[i];
    if (ch === ' ') { out += ' '; continue; }
    const a = age - i * step;
    out += a < 0 ? ' ' : a < TRACKER.glyph ? LORE[(Math.floor(age / TRACKER.step) + i * 3 + key) % LORE.length] : ch;
  }
  return out;
}
function loreOut(s, age, key) {
  const n = s.length, step = (TRACKER.out * 0.7) / Math.max(1, n);
  let out = '';
  for (let i = 0; i < n; i++) {
    const ch = s[i];
    if (ch === ' ') { out += ' '; continue; }
    const a = age - i * step;
    out += a < 0 ? ch : a < TRACKER.glyph ? LORE[(Math.floor(age / TRACKER.step) + i * 3 + key) % LORE.length] : ' ';
  }
  return out;
}
// (The words in the pilot's language, src/lang.js tr, before their lore turns them.)
function say(t, row, words) {
  const s = tr(words);
  if (t.reduced) return s;
  const p = t.phase, key = row.seq * 5;
  return p.name === OUT ? loreOut(s, p.age, key) : p.name === LIVE ? loreIn(s, p.age, key) : s;
}
// Capitals with their ink's top at `capTop`: from `x` (the ink's left edge), or ending on it (`end`).
function caps(r, m, words, x, capTop, ink, end = false) {
  if (!words) return;
  const s = tr(words);
  const left = end ? x - s.length * r.cellW + m.capLeft : x - m.capLeft;
  r.text(s, Math.round(left), Math.round(capTop - m.capTop), ink, 1);
}
// A bar 4 px thick (its track in the ink's own wash, as the HULL and FUEL steps stand on theirs), filled to `share` from the left; the
// money just put in lit white, settling to the ink over TRACKER.flash; `keep` the share of the track that is left while a row goes.
function bar(r, x, y, w, share, ink, row, now, keep) {
  const X = Math.round(x), full = Math.round(w), W = Math.max(0, Math.round(full * keep));
  if (W <= 0) return;
  r.fill(X, y, W, BAR_H, washOf(ink), 1);
  const fw = Math.min(W, Math.round(full * clamp(share, 0, 1)));
  if (fw > 0) r.fill(X, y, fw, BAR_H, ink, 1);
  if (row.flashAt > -Infinity) {
    const k = 1 - easeOut(clamp((now - row.flashAt) / TRACKER.flash, 0, 1));
    if (k > 0.02) {
      const a = Math.round(full * row.flashA), b = Math.min(Math.round(full * row.flashB), fw);
      if (b > a) r.fill(X + a, y, b - a, BAR_H, ROLES.textPrimary, k);
    }
  }
}

// The tracker on `place` (shoulderOf): the button at the foot, the rows over it. `t.box` the ink of both; null (and nothing drawn, no
// button) with nothing begun. Returns the box.
export function drawTracker(r, t, place) {
  const rows = t.rows, m = uiMetrics(r), cw = r.cellW, now = t.now;
  if (!rows.length) { t.button = null; return null; }
  const key = keyName('tracker'), word = tr(t.hidden ? TRACKER.words.hidden : TRACKER.words.shown);
  // The button, as the legend's: the chevron a cell after its word instead of on the column's edge (the wallet stands at the right end of
  // the row), pointing up while the rows are hidden, the way they open (the legend's opens downward).
  const a = t.args, capX = Math.round(keyMarkLeft(r, place.x0 + m.capLeft) - 0.5) + KEYCAP_PAD;
  t.r = r; t.key = key;
  a.x0 = place.x0 - 1; a.rowTop = place.rowTop; a.key = key; a.word = word; a.turn = t.turn;
  a.edge = capX + (key.length + 1 + Array.from(word).length + 1) * cw + 2 * KEY_MARK_HALF + 1;
  t.button = drawColumnButton(r, a);
  const bx = place.x0, bw = place.x1 - place.x0;
  let top = place.rowTop + place.ink.top;
  let bottom = place.rowTop + place.ink.bottom;
  // `down` (the modern interface's, labs/graphics/hud-modern.js): the rows hang under the button, the first nearest it, each its bar over
  // its words (the bar `rowsTop` + its slot's `pitch`, the words' capitals `under` the bar); as many as stand over `floor`, the rest «+N MORE».
  if (!t.hidden && place.down) {
    const pitch = place.pitch, room = place.floor == null ? rows.length : Math.max(0, Math.floor((place.floor - place.rowsTop - BAR_H - place.under - place.capH) / pitch) + 1);
    const cut = rows.length > room ? Math.max(0, room - 1) : rows.length;
    for (let i = 0; i < cut; i++) {
      const row = rows[i], ph = phaseOf(t, row, now);
      const done = ph.name !== LIVE, share = shareOf(row, now);
      const y = Math.round(place.rowsTop + (t.reduced ? row.slotTo : slotOf(row, now)) * pitch), capTop = y + BAR_H + place.under;
      const inkOf = done ? DONE_INK : row.ink;
      bar(r, bx, y, bw, share, inkOf, row, now, ph.name === OUT ? 1 - easeOut(ph.u) : 1);
      caps(r, m, say(t, row, row.label), bx, capTop, ROLES.textSecondary);
      caps(r, m, say(t, row, row.sector), bx + (NAME_CELLS + 1) * cw, capTop, ROLES.textHint);
      caps(r, m, say(t, row, done ? DONE_WORD : row.pct), place.x1, capTop, done ? DONE_INK : ROLES.textPrimary, true);
      bottom = Math.max(bottom, capTop + place.capH);
    }
    if (cut < rows.length) {
      const capTop = Math.round(place.rowsTop + cut * pitch) + BAR_H + place.under;
      caps(r, m, `+${rows.length - cut} MORE`, bx, capTop, ROLES.textHint);
      bottom = Math.max(bottom, capTop + place.capH);
    }
  } else if (!t.hidden) {
    // What fits over the button, the page's boxes above it (a column's last ink) laid; the rest is folded into «+N MORE».
    let ceiling = r.view?.y ?? 0;
    for (let i = 0; i < t.near.length; i++) {
      const b = t.near[i];
      if (b && b.w > 0 && b.h > 0 && b.x < place.x1 && b.x + b.w > place.x0) ceiling = Math.max(ceiling, b.y + b.h + UI.air.inset);
    }
    const ink = place.capH + UI.pad + BAR_H, pitch = place.pitch;
    const room = Math.max(0, Math.floor((place.rowsBottom - ceiling - ink) / pitch) + 1);
    const cut = rows.length > room ? Math.max(0, room - 1) : rows.length;
    for (let i = 0; i < cut; i++) {
      const row = rows[i], ph = phaseOf(t, row, now);
      const done = ph.name !== LIVE, share = shareOf(row, now);
      const y = Math.round(place.rowsBottom - (t.reduced ? row.slotTo : slotOf(row, now)) * pitch) - BAR_H, capTop = y - UI.pad - place.capH;
      const inkOf = done ? DONE_INK : row.ink;
      caps(r, m, say(t, row, row.label), bx, capTop, ROLES.textSecondary);
      caps(r, m, say(t, row, row.sector), bx + (NAME_CELLS + 1) * cw, capTop, ROLES.textHint);
      caps(r, m, say(t, row, done ? DONE_WORD : row.pct), place.x1, capTop, done ? DONE_INK : ROLES.textPrimary, true);
      bar(r, bx, y, bw, share, inkOf, row, now, ph.name === OUT ? 1 - easeOut(ph.u) : 1);
      top = Math.min(top, capTop);
    }
    if (cut < rows.length) {
      const capTop = Math.round(place.rowsBottom - cut * pitch) - BAR_H - UI.pad - place.capH;
      caps(r, m, `+${rows.length - cut} MORE`, bx, capTop, ROLES.textHint);
      top = Math.min(top, capTop);
    }
  }
  const b = t.box;
  b.x = place.x0; b.y = Math.floor(top); b.w = bw; b.h = Math.ceil(bottom) - b.y;
  return b;
}
