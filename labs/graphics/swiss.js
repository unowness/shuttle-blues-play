// The Swiss manner of a window (SX, 2026-10-09, labs/graphics/sketches/windows-swiss.html, his pick: «делаем вот это» and «в целом
// дизайн крутой»): the parts the pause (labs/graphics/pause-menu.js) and the pilot card (labs/graphics/windows.js) are laid out from.
// The sketch's "Принципы" are the rules, here as code:
//   - the character grid is the module: columns are the font's cells, rows are UI.row (20 px), and the finest step down a page is half a
//     row (`half`, UI.space.rows: 10 px); every number below is a count of them, or the font's measured ink (src/uiGrid.js);
//   - one type size (the game's 15 px): the hierarchy is place, an empty row and three inks, never a size: white is content, gray the
//     labels, the quiet gray the numbers and counts;
//   - hanging heads: a group is named in a narrow column at the left, with its number, its rows hang to the right;
//   - words flush left and figures flush right, on one axis (`axis`), the counts beyond it;
//   - lines quieter than text, and few of them: the frame and the rules are the grays of src/frames.js, drawn in the final layer (`onFrame`), so
//     no look turns them and the contrast of the content is never beaten by its own frame; a window has the rule under its head and the rule
//     over its foot (the pilot card one more over its band), each running to the nearest crossing line, the frame (SX, 2026-10-09: «Они должны
//     доходить до ближайшей поперечной ... Держись минимализма»); no vertical rules, none between groups: space keeps them apart;
//   - an empty place is the layout's crossed box with its number; a thing that answers is told by the inverted row (a white bar, black
//     text) under the pointer or the keys' focus, and by the interface's own colour where it is pressed (SX: «в поп апах не хватает цвета
//     например кнопки оформлены не так как в остальном интерфейсе»): a key is the cockpit's keycap (labs/graphics/ui-parts.js keycap: a white
//     letter in a blue cap), and the arrows ‹ › of a choice, the chevron › of a row that opens a page, a switch's square and the back arrow of
//     a page's head are ROLES.structure blue (`S`), black on the bar; the values stay white, the labels gray, a level a hairline with ticks at
//     0, 50 and 100 % and a mark.
// Only text casts a shadow (src/textShadow.js): a string on a bar or in a box stands on that (`onPlate`), not on the sky.
import { ROLES } from '../../src/roles.js';
import { UI, uiMetrics, uiAir } from '../../src/uiGrid.js';
import { frameInk, onFrame } from '../../src/frames.js';
import { onPlate } from '../../src/textShadow.js';
import { px, glyphs } from '../../src/util.js';
import { keycap, KEYCAP_PAD, KEYCAP_RISE } from './ui-parts.js';

// The inks of a Swiss window: content, labels, numbers and counts.
export const W = ROLES.textPrimary;
export const G = ROLES.textSecondary;
export const Q = ROLES.textHint;
export const S = ROLES.structure;                 // what is pressed: the interface's own blue, as the cockpit's keys and lines
export const BLACK = ROLES.backing;

export const len = (s) => glyphs(s).length;
export const pad2 = (n) => String(n).padStart(2, '0');
// The sector the pilot is in, as the head says it: «J-05 NARROWS» (the grid's letter and number, then the sector's name); null where the
// world has none.
export const sectorLine = (world) => {
  const s = world?.sector;
  return s?.label ? [s.label, s.name].filter(Boolean).join(' ') : null;
};

// The sheet's measures in one place. `air`: the black between a line of a window's chrome and the ink beside it, one number for all of
// them (SX, 2026-10-09, on the station's INFO: «в модальных окнах вот эти отступы ... должны быть ровные. Очень ровные визуально и технически
// ... выровни их в меньшую сторону»): the frame to the head's capitals, the frame to the words at the left and at the right, the head's
// capitals to its rule and the rule to the body's, the foot's rule to its keycaps and the keycaps to the frame. Nine px, so the head's band
// (its capitals, the air, the rule, the air) is a row and a half at the game's font and the body stands on the half-row grid; `headGap`
// is that band, `footRows` the empty row between the body's last row and the foot's, its rule `air` over the keycaps.
export const SWISS = Object.freeze({
  air: 9,                                  // px of black, line to ink
  headGap: 1.5,                            // rows from the head's row to the body's first: the head's band
  footRows: 1,                             // the empty rows between the body's last row and the foot's: the foot's rule `air` over its keycaps
  barPad: UI.pad,                          // an inverted bar stands this far past its words, each side
  keyGap: UI.space.cols,                   // a keycap to its words
  gap: UI.group.cols,                      // one key's words to the next key
  tickHalf: 3.5,                           // a slider's end and middle ticks: 7 px, the line through their middle
  mark: { w: 3, h: 13 },                   // a slider's mark
  lamp: 7,                                 // a switch's square
});

// The window's tokens on `r`: its font's measures and the grid's steps. `y` positions are px from a window's top edge; `rowAt(y0, k)` the top
// of the k-th row of a window whose box starts at y0 (k in halves): the head's capitals stand `I` under the edge, the frame's line and the air.
export function swiss(r) {
  const m = uiMetrics(r), air = uiAir(r), cw = r.cellW, I = SWISS.air + 1, lead = I - (m.textY + m.capTop);
  const ui = { r, m, cw, I, CAP: air.CAP, lead, row: UI.row, half: UI.space.rows * UI.row, air };
  ui.rowAt = (y0, k) => y0 + lead + k * UI.row;
  ui.capTopOf = (rowTop) => rowTop + m.textY + m.capTop;
  // The head's rule of a window whose box starts at y0: the line's own px, in the middle of the head's band, between the head's capitals and the
  // body's first.
  ui.headRule = (y0) => Math.round(y0 + I + (air.CAP + SWISS.headGap * UI.row) / 2 - 0.5);
  // The foot's rule of a window whose foot is on row `foot`: `air` over its keycaps' top (they rise over their row as keycapAt draws them).
  ui.keycapTop = (y0, foot) => Math.round(ui.rowAt(y0, foot) + m.textY - KEYCAP_RISE);
  ui.footRule = (y0, foot) => ui.keycapTop(y0, foot) - 1 - SWISS.air;
  // A window's height with its foot on row `last` (halves allowed): the foot's keycaps, which stand a little under the capitals, `air` over the
  // frame's line, as the head's capitals are at the top. Without a foot, `boxHeight`: the last row's capitals the same over the frame's line.
  ui.heightWithKeys = (last) => Math.round(lead + last * UI.row + m.textY + r.cellH + 1 + I);
  ui.boxHeight = (last) => Math.round(lead + last * UI.row + m.textY + m.capBottom + I);
  ui.capMid = (rowTop) => rowTop + m.textY + (m.capTop + m.capBottom) / 2;
  // Text with its ink's left edge at `ix` (a column's edge), or its ink's right edge at `ixr`; `ink` its colour. `plate`: on a bar or in a
  // box, so no shadow.
  ui.text = (s, ix, top, ink, plate = false) => {
    const draw = () => r.text(String(s), ix - m.capLeft, top + m.textY, ink);
    return plate ? onPlate(draw) : draw();
  };
  ui.textEnd = (s, ixr, top, ink, plate = false) => {
    const draw = () => r.text(String(s), ixr + m.capLeft - len(s) * cw, top + m.textY, ink);
    return plate ? onPlate(draw) : draw();
  };
  return ui;
}

// ---- the lines -----------------------------------------------------------------------------------------------------------------

// A hairline rect in a frame ink on the box's own edge (the window, a picture's box, a keycap).
export function frameBox(ui, box, name = 'frame') {
  const { ctx } = ui.r;
  onFrame(() => {
    ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = frameInk(name); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.rect(px(box.x), px(box.y), Math.round(box.w) - 1, Math.round(box.h) - 1); ctx.stroke();
    ctx.restore();
  });
}
// A rule across `w` px from (x, y), one px thick, in the rules' ink; or a rule down `h`. `edgeRule`: across the whole of a window `box`, from
// the frame's line to the frame's line (the grid runs to the edges); `edgeRuleV`: down between two y's, a window's, from one rule to the next.
export function ruleH(ui, x, y, w) {
  onFrame(() => ui.r.fill(Math.round(x), Math.round(y), Math.round(w), 1, frameInk('rule')));
}
export const edgeRule = (ui, box, y) => ruleH(ui, box.x + 1, y, box.w - 2);
export function ruleV(ui, x, y, h) {
  onFrame(() => ui.r.fill(Math.round(x), Math.round(y), 1, Math.round(h), frameInk('rule')));
}
// The layout's crossed box: a place waiting for its picture. Its number, if it has one, in the corner, quiet.
export function crossBox(ui, box, n = null) {
  const { ctx } = ui.r, x = Math.round(box.x), y = Math.round(box.y), w = Math.round(box.w), h = Math.round(box.h);
  onFrame(() => {
    ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = frameInk('rule'); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.rect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 0.5, y + 0.5); ctx.lineTo(x + w - 0.5, y + h - 0.5); ctx.moveTo(x + w - 0.5, y + 0.5); ctx.lineTo(x + 0.5, y + h - 0.5); ctx.stroke();
    ctx.restore();
  });
  // The number in the corner, quiet, over the lines as the sketch has it, a pad and a hairline in from the box's own.
  if (n !== null) ui.text(String(n), x + UI.pad + 1, y + UI.pad + 1 - (ui.m.textY + ui.m.capTop), Q, true);
}

// ---- the bar ---------------------------------------------------------------------------------------------------------------------

// The inverted row: a white bar, its words black. `box` the row's, the bar the box's own width. Returns the ink an inverted row's words use.
export function bar(ui, box) {
  ui.r.fill(Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h), W);
}
// An ink as a row shows it: its own, or black on the bar.
export const onBar = (on, ink) => (on ? BLACK : ink);

// ---- keys ---------------------------------------------------------------------------------------------------------------------

// The interface's keycap (labs/graphics/ui-parts.js keycap, the one the cockpit and the other windows draw: a white letter in a blue cap on a
// black backing) with its cap's left edge at `ix`, on the row `top`. Returns its box. `onBarAt`: the cap stands on an inverted bar, its
// stroke and letter black and no backing (SX's sketch: «.inv .key»).
export const keycapWidth = (ui, key) => Math.round(len(key) * ui.cw + 2 * KEYCAP_PAD);
export function keycapAt(ui, key, ix, top, ink = W, onBarAt = false) {
  const { r } = ui, y = top + ui.m.textY;
  const box = { x: Math.round(ix), y: Math.round(y - KEYCAP_RISE), w: keycapWidth(ui, key), h: r.cellH + KEYCAP_RISE + 1 };
  if (onBarAt) {
    const { ctx } = r;
    ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = BLACK; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.rect(px(box.x), px(box.y), box.w - 1, box.h - 1); ctx.stroke(); ctx.restore();
    onPlate(() => r.text(key, box.x + KEYCAP_PAD, y, BLACK));
  } else keycap(r, key, box.x + KEYCAP_PAD, y, { ink, reach: 0 });
  return box;
}
// A key and its words: [↑ ↓] MOVE, the words in `words` gray a cell after the key (the way of keysLeaf in labs/graphics/sketches/ledger.js). Returns { box (the cap's), end }.
export function keyWords(ui, key, words, ix, top, { dim = false } = {}) {
  const cap = keycapAt(ui, key, ix, top);
  const wx = cap.x + cap.w - KEYCAP_PAD + SWISS.keyGap * ui.cw;
  ui.text(words, wx, top, dim ? Q : G);
  return { box: cap, end: wx + len(words) * ui.cw };
}
export const keyWidth = (ui, key, words) => keycapWidth(ui, key) - KEYCAP_PAD + (SWISS.keyGap + len(words)) * ui.cw;

// A cell the lists show as its keys ('W / ↑' -> W, ↑; 'A D / ← →' four; '1-7' one range), or null where it is no key's (HOLD L, A ROW, POINT):
// the controls window, the garage room's controls plate and the skills' hints draw such a cell as keycaps (here since 2026-10-17, from the
// Swiss chrome before the organism, labs/graphics/sketches/swiss-window.js).
const KEY_WORD = /^(?:[A-Z0-9?]|ESC|TAB|ENTER|SPACE|BKSP|SHIFT|[←→↑↓]|\d-\d)$/;
export function keyTokens(cell) {
  const parts = String(cell).split(/ \/ | /).filter(Boolean);
  return parts.length && parts.every((s) => KEY_WORD.test(s)) ? parts : null;
}

// ---- the switches ---------------------------------------------------------------------------------------------------------------

// ‹ value › with its right ink edge at `right`; the arrows the interface's blue, the value white (black on a bar). `ends`: whether each arrow has a
// step to take (a row of choices that does not wrap, the controls list's, has none past its end): an arrow with none is the quiet ink. Returns its left
// ink edge and the box of the arrow ‹ and of the arrow ›.
export function drawStep(ui, { right, top, value, on = false, dim = false, ends = [true, true] }) {
  const { cw, m } = ui, n = len(value) + 4, origin = right + m.capLeft - n * cw;
  const arrow = (live) => (on ? BLACK : live ? S : Q), text = on ? BLACK : W;
  const say = (s, x, ink) => (on ? onPlate(() => ui.r.text(s, x, top + m.textY, ink)) : ui.r.text(s, x, top + m.textY, ink));
  say('‹', origin, arrow(ends[0]));
  say(value, origin + 2 * cw, dim && !on ? G : text);
  say('›', origin + (n - 1) * cw, arrow(ends[1]));
  return { left: origin + m.capLeft, origin, n, back: { x: origin - cw / 2, w: 2 * cw } };
}
// OFF □ or ON ■ ending at `right`, the square in the last cell (SX, 2026-10-14: «Индикатор у ON/off должен быть справа»; at the left until
// then): the square the interface's blue, the word white.
export function drawToggle(ui, { right, top, isOn, on = false }) {
  const { cw, m, r } = ui, words = isOn ? 'ON' : 'OFF', n = 2 + len(words), origin = right + m.capLeft - n * cw;
  const lx = Math.round(origin + (n - 1) * cw + cw / 2 - SWISS.lamp / 2), ly = Math.round(ui.capMid(top) - SWISS.lamp / 2);
  if (isOn) r.fill(lx, ly, SWISS.lamp, SWISS.lamp, on ? BLACK : S);
  else {
    const c = r.ctx;
    c.save(); c.lineWidth = 1; c.strokeStyle = on ? BLACK : S; c.globalAlpha = 1;
    c.beginPath(); c.rect(px(lx), px(ly), SWISS.lamp - 1, SWISS.lamp - 1); c.stroke(); c.restore();
  }
  const text = on ? BLACK : W;
  (on ? onPlate : (f) => f())(() => r.text(words, origin, top + m.textY, text));
  return { left: origin + m.capLeft };
}
// A level: a hairline from `x0` to `x1` on the row's middle with ticks at 0, 50 and 100 %, the mark at `level` (0..1). Returns the track's box
// and the mark's x for a pointer to read. On a bar the line and the mark are black.
export function sliderGeometry(x0, x1, level) {
  const w = Math.round(x1) - Math.round(x0), lv = Math.max(0, Math.min(1, level));
  return { x0: Math.round(x0), w, mark: Math.round(Math.round(x0) + lv * (w - SWISS.mark.w)) };
}
export function levelAt(x0, x1, x) {
  const w = Math.round(x1) - Math.round(x0);
  return Math.max(0, Math.min(1, (x - Math.round(x0) - SWISS.mark.w / 2) / Math.max(1, w - SWISS.mark.w)));
}
export function drawSlider(ui, { x0, x1, top, level, on = false }) {
  const { r } = ui, g = sliderGeometry(x0, x1, level), ly = Math.round(ui.capMid(top));
  const line = (draw) => (on ? draw(BLACK) : onFrame(() => draw(frameInk('frame'))));
  line((ink) => {
    r.fill(g.x0, ly, g.w, 1, ink);
    for (const t of [0, 0.5, 1]) r.fill(Math.round(g.x0 + t * (g.w - 1)), Math.round(ly - SWISS.tickHalf), 1, 2 * SWISS.tickHalf + 1, ink);
  });
  r.fill(g.mark, ly - Math.floor(SWISS.mark.h / 2), SWISS.mark.w, SWISS.mark.h, on ? BLACK : W);
  return { track: { x: g.x0 - UI.pad, y: top, w: g.w + 2 * UI.pad, h: UI.row }, g };
}
