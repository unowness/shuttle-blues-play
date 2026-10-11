// The rest of the windows in the Swiss manner (SX, 2026-10-09, labs/graphics/sketches/windows-swiss-2.html: «берем но наши текущие контекстные
// окна не трогаем мы сейчас поп апами занимаемся»; «Что-то очень много полосок ты начертил ... Они должны доходить до ближайшей поперечной ...
// Держись минимализма»): the chrome every one of them shares, on the kit of labs/graphics/swiss.js (the pause and the pilot card are laid out
// from the same). A window is the black sheet in the frames' gray (src/frames.js), a head row with a rule under it and, where it has keys, a rule
// over its foot, each across to the frame's lines; no rule down, none between groups: space keeps them apart. Its parts:
//   sheet      the black, the frame and the two rules, on the box the window's height gives (`ui.heightWithKeys(last)` with a foot,
//              `ui.boxHeight(last)` without), every line of it `SWISS.air` off the ink beside it (labs/graphics/swiss.js);
//   headRow    the title and what goes with it at the left, what the window knows at the right, a group's step between the parts;
//   hangHead   a group's number and name, the number quiet, the name gray, a group's rows hang to the right of it or stand under it;
//   footKeys   the keys as the cockpit's keycaps, each with its words (a button, the inverted row under the pointer), at the left or flush
//              right, and the last key's words between them;
//   putPart(End)  a part of a head: text, runs, or an amount in the coin's gold with the coin's sign before it (black on an inverted row).
// A part of a head is [text, ink], { runs: [[text, ink], ...] } or { money: '1,200' }.
import { ROLES } from '../../src/roles.js';
import { UI, centredWindow } from '../../src/uiGrid.js';
import { MONEY_INK, COIN_SIGN_INK, drawCoin, moneyRuns } from '../../src/money.js';
import { fitText } from '../../src/util.js';
import { SWISS, W, G, Q, BLACK, len, pad2, frameBox, edgeRule, bar, onBar, keycapAt, keycapWidth, keyWidth } from './swiss.js';
import { noteKeycap, noteKey, unnoted, keyCodeOf } from './clicks.js';
import { KEYCAP_PAD } from './ui-parts.js';

// Where a window `w` x `h` stands: the flight area's optical middle, across the middle of the screen, over the HUD's columns where it is wider than the room
// between them (SX allowed the widening for the pilot card and the pause, 1,084 and 759 px: centredWindow `clear: false`; the columns are dimmed under a
// pop-up, and a window off the middle because one column stands near it reads as a slip, not as room kept). One place for every window of the Swiss manner.
export const placeWindow = (r, w, h) => centredWindow(r, w, h, { clear: false });

// The sheet: black on the box's own edge, its frame, the rule in the head's band, and, when the window has a foot on row `footRow` (halves
// allowed), the rule `air` over its keycaps.
export function sheet(ui, box, footRow = null) {
  ui.r.fill(box.x, box.y, box.w, box.h, ROLES.backing);
  frameBox(ui, box);
  edgeRule(ui, box, ui.headRule(box.y));
  if (footRow !== null) edgeRule(ui, box, ui.footRule(box.y, footRow));
}

// A cell the lists show as its keys ('W / ↑' -> W, ↑; 'A D / ← →' four; '1-7' one range), or null where it is no key's (HOLD L, A ROW, POINT).
const KEY_WORD = /^(?:[A-Z0-9?]|ESC|TAB|ENTER|SPACE|BKSP|SHIFT|[←→↑↓]|\d-\d)$/;
export function keyTokens(cell) {
  const parts = String(cell).split(/ \/ | /).filter(Boolean);
  return parts.length && parts.every((s) => KEY_WORD.test(s)) ? parts : null;
}

// ---- parts ---------------------------------------------------------------------------------------------------------------------

export const partCols = (p) => (p.money != null ? 2 + len(p.money) : p.runs ? p.runs.reduce((n, [s]) => n + len(s), 0) : len(p[0]));
// A part with its ink's left edge at `ix`, on the row `top`; `on`: it stands on an inverted bar. Returns its columns.
export function putPart(ui, p, ix, top, on = false) {
  if (p.money != null) {
    const origin = ix - ui.m.capLeft;
    drawCoin(ui.r.ctx, origin + ui.cw / 2, ui.capMid(top), on ? BLACK : MONEY_INK, on ? BLACK : COIN_SIGN_INK);
    ui.text(p.money, ix + 2 * ui.cw, top, on ? BLACK : MONEY_INK, on);
  } else if (p.runs) {
    let x = ix;
    for (const [s, ink] of p.runs) { ui.text(s, x, top, onBar(on, ink), on); x += len(s) * ui.cw; }
  } else ui.text(p[0], ix, top, onBar(on, p[1]), on);
  return partCols(p);
}
// A part with its right ink edge at `ixr` (as ui.textEnd puts a string: a cell's side bearings are not its ink). Returns its columns.
export function putPartEnd(ui, p, ixr, top, on = false) {
  const n = partCols(p);
  putPart(ui, p, ixr + 2 * ui.m.capLeft - n * ui.cw, top, on);
  return n;
}

// The head's row: `left` from the window's inset, `right` flush to its other, a group's step between parts.
export function headRow(ui, box, left, right = [], { top = ui.rowAt(box.y, 0) } = {}) {
  const gap = SWISS.gap * ui.cw;
  let x = box.x + ui.I;
  for (const p of left) x += putPart(ui, p, x, top) * ui.cw + gap;
  let end = box.x + box.w - ui.I;
  for (const p of [...right].reverse()) end -= putPartEnd(ui, p, end, top) * ui.cw + gap;
}
// A group's head: its number (quiet) and its name (gray) four columns in, as the card's columns are headed.
export function hangHead(ui, ix, top, number, name, { on = false, ink = G } = {}) {
  ui.text(pad2(number), ix, top, onBar(on, Q), on);
  ui.text(name, ix + 4 * ui.cw, top, onBar(on, ink), on);
}

// ---- the foot -------------------------------------------------------------------------------------------------------------------

// `items`: [{ key, words, id, dim, quiet, right, plain }] the foot's keys, each its keycap and its words: a button (a click presses the key; the whole
// pair is the inverted row under the pointer), unless `quiet` (said, not pressed: the keys of a field being typed in); `dim` its words quiet (a key
// that cannot be taken now); `plain` a way that is no key, said in words (`key` white, then `words`); `right` flush to the window's right inset, the first of them last. A key written as several (← →, Q E) answers a click
// on each of its own characters, and its words for the first, as the text `[← →] WORDS` did. `message`: { text, ink, side, money } the last
// action's words in the room the keys leave, at the left (`side: 'left'`) or the right (the default, flush against the right keys), cut to it;
// `money` has the amounts in it drawn in the coin's gold. `w` is the window's ledger (labs/graphics/ledger.js: its items answer the pointer).
// Returns the columns the message was given.
export function footKeys(w, ui, box, items, { top, gap = SWISS.gap * ui.cw, message = null } = {}) {
  // The keys flush right end on the words' ink, not their cells': the last letter's side bearing past the inset (as putPartEnd).
  const { cw } = ui, L = box.x + ui.I, R = box.x + box.w - ui.I + 2 * ui.m.capLeft;
  const put = (it, x) => {
    // A way that is no key (the mouse's CLICK, WHEEL, DRAG): white words and then its own, nothing to press.
    if (it.plain) {
      ui.text(it.key, x, top, W);
      ui.text(it.words, x + (len(it.key) + SWISS.keyGap) * cw, top, G);
      return (len(it.key) + SWISS.keyGap + len(it.words)) * cw;
    }
    const wide = keyWidth(ui, it.key, it.words), item = { x: Math.round(x - UI.pad), y: top, w: Math.round(wide + 2 * UI.pad), h: UI.row };
    const paint = (on) => {
      if (on) bar(ui, item);
      keycapAt(ui, it.key, x, top, it.dim && !on ? G : W, on);
      ui.text(it.words, x + keycapWidth(ui, it.key) - KEYCAP_PAD + SWISS.keyGap * cw, top, on ? BLACK : it.dim ? Q : G, on);
    };
    if (it.quiet) unnoted(() => paint(false));
    else {
      const code = keyCodeOf(it.key);
      if (code) noteKeycap(it.key, item, 0, w.base);
      else {
        // Several keys in one cap: each answers on its own characters, the words for the first.
        const tokens = String(it.key).split(' '), origin = x;
        let at = 0;
        for (const t of tokens) {
          noteKey(t, { x: origin + at * cw, y: item.y, w: len(t) * cw, h: item.h }, w.base);
          at += len(t) + 1;
        }
        const first = tokens.find((t) => keyCodeOf(t));
        if (first) noteKey(first, { x: x + keycapWidth(ui, it.key) - KEYCAP_PAD, y: item.y, w: item.w - keycapWidth(ui, it.key) + KEYCAP_PAD - UI.pad, h: item.h }, w.base);
      }
      w.item(it.id ?? `key:${it.key}`, item, paint, 'flat');
    }
    return wide;
  };
  let at = L;
  for (const it of items.filter((q) => !q.right)) at += put(it, at) + gap;
  let end = R;
  const flush = items.filter((q) => q.right);
  for (const it of flush.reverse()) { end -= it.plain ? (len(it.key) + SWISS.keyGap + len(it.words)) * cw : keyWidth(ui, it.key, it.words); put(it, end); end -= gap; }
  // The room the words have: from the left keys' step to the right keys' (a step off them; with none, a step off the window's inset).
  const edge = flush.length ? end : R - gap;
  if (!message?.text) return 0;
  const room = Math.floor((edge - at) / cw);
  if (room < 4) return 0;
  const text = fitText(message.text, room), runs = message.money ? moneyRuns(text, message.ink) : [[text, message.ink]];
  let x = message.side === 'left' ? at : edge - len(text) * cw;
  for (const [s, ink] of runs) { ui.text(s, x, top, ink); x += len(s) * cw; }
  return room;
}
