import { CONFIG } from './config.js';
import { fitText } from './interface.js';
import { UI, uiPanel, centredWindow, frameInk } from './uiGrid.js';
import { WORDS, wordDef } from './progression.js';
import { SIGN_WORDS_MAX, SIGN_LIMIT, drawSign, signTypeLabel } from './signs.js';
import { hoverItem } from './hover.js';

// The sign composer, opened with L. The flight goes on underneath it, the ship's controls
// let go, as under the pilot screen. Presentation only: the sign is left through
// World.leaveSign, which checks everything again.
//
// The whole dictionary is laid out, in catalogue order. A word not found yet
// is a row of dots, so the size of the set is known but not its contents. The
// sign above the words is drawn as it will stand, with an open slot shown as
// dots and the pilot's name beside the post.

const ink = () => CONFIG.hud.hot;
const muted = () => CONFIG.hud.color;
const accent = () => CONFIG.hud.accent;
const frame = () => CONFIG.hud.frame;

export const WORD_CELL = 10;     // columns per word: eight letters (EVERYONE), a gap, the marker
export const WORDS_PER_ROW = 4;  // words to a row (the window in the Swiss manner, labs/graphics/windows.js SIGN, lays them four across too)
const PER_ROW = WORDS_PER_ROW;
const LETTERS = Math.max(...WORDS.map((word) => Array.from(word.text).length));   // the longest word

// The key lines: the full form and the short one for a window without room.
const KEY_LINES = [
  ['[←↑↓→] WORD', '[ENTER] ADD', '[BKSP] UNDO'],
  ['[T] TYPE', '[L] LEAVE SIGN', '[0] CANCEL'],
];
const keyLine = (items) => items.join(' '.repeat(UI.line.cols));

// Every measurement, from the canvas size alone, so a check can verify the
// layout without drawing it. On the interface's grid (src/uiGrid.js, 2026-09-30;
// the map is reports/2026-09-30-spacing-system.md section 6): as wide as its
// widest line plus the frame and `line` each side, as tall as the rows below.
//   row 0 the frame and title, 1 the header, 2 blank, 3-7 the sign, 8 blank,
//   9... the words, a blank, the message, the two key lines, the frame
export function signLayout(r) {
  const cw = r.cellW, row = UI.row;
  const words = (PER_ROW - 1) * WORD_CELL + LETTERS;        // the last word has no gap after it; the pointers hang in the column before each word
  const cols = 2 * UI.line.cols + Math.max(words, ...KEY_LINES.map((items) => Array.from(keyLine(items)).length));
  const perRow = PER_ROW;
  const gridRows = Math.ceil(WORDS.length / perRow);
  const at = { header: 1, sign: 3, grid: 9 };            // the sign's first row; the diamond stands on row 7
  at.message = at.grid + gridRows + UI.line.rows;
  at.keys = at.message + 1;
  const rows = at.keys + KEY_LINES.length + 1;
  const { x, y } = centredWindow(r, cols * cw, rows * row, { ink: frameInk(r) });
  return { cols, rows, perRow, gridRows, at, x, y, cw, row };
}

// The caption as the composer shows it: the words chosen so far, then a dotted
// slot for each word that may still be added.
export function draftCaption(words) {
  const chosen = words.map((id) => wordDef(id)?.text).filter(Boolean);
  return [...chosen, ...Array(SIGN_WORDS_MAX - chosen.length).fill('···')].join(' ');
}

// `ui` holds the chosen word ids, the selected dictionary index and a short
// message from the last key. Returns the layout it drew with, and each known word's box (`wordBoxes`: a click adds it,
// labs/graphics/main.js).
// The look before SX's V2 (2026-10-05): the game draws this window in the menus' look now (labs/graphics/windows.js drawSignComposer); this
// painter stays only for the sketch pages that show the old look beside the new (labs/graphics/sketches/popups-v2.html, and
// menus-ledger.html's V0). BACKLOG: remove it with them.
export function drawSignPanel(r, world, ui) {
  const L = signLayout(r);
  const { cw, row: ROW, x, y, at } = L;
  const g = uiPanel(r, x, y, L.cols, L.rows, 'LEAVE A SIGN');
  const first = UI.line.cols, last = L.cols - 1 - UI.line.cols;    // the text columns
  const room = last - first + 1;

  const own = world.signs.placed.length;
  // The sign's type (src/signs.js SIGN_TYPES), which T steps through, ends the header line.
  g.text(fitText(`${world.sector.label} / YOUR SIGNS ${own} OF ${SIGN_LIMIT}`, room), first, at.header, muted());
  g.textEnd(signTypeLabel(ui.type), last, at.header, accent());

  // The sign itself, as it will stand, of the chosen type, centred in rows 3 to 8 at the world's
  // cells (the buoy, the tallest, spans them all); the transmitter's rings are kept small here.
  // Kept inside the frame: STARS scatters its sky wider than the panel's text (two dots past it at the longest caption).
  const put = (c, gx, gy, color, a = 1) => {
    if (gx - cw / 2 < x + cw || gx + cw / 2 > x + (L.cols - 1) * cw) return;
    r.glyphNow(c, gx, gy, color, a);
  };
  drawSign(put, r, x + Math.floor(L.cols / 2) * cw + cw / 2, g.Y(at.sign + 3) + ROW / 2, draftCaption(ui.words), world.pilot.nickname,
    CONFIG.sign, ui.type, world.time, { preview: true });

  // The dictionary. The pointer hangs in the column before its word, so the
  // words keep a straight left edge.
  // A known word is a button, from its pointer's column to its end, and comes up under the pointer (src/hover.js).
  const wordBoxes = [];
  WORDS.forEach((word, i) => {
    const col = first + (i % L.perRow) * WORD_CELL;
    const row = at.grid + Math.floor(i / L.perRow);
    const known = world.collection.words.has(word.id);
    const chosen = i === ui.selected;
    const draw = () => {
      if (chosen) r.text('▸', g.X(col - 1), g.Y(row) + g.metrics.textY, accent(), 1);
      g.text(known ? word.text : '······', col, row, chosen ? accent() : known ? ink() : frame());
    };
    if (!known) { draw(); return; }
    const box = { x: g.X(col - 1), y: g.Y(row), w: (1 + Array.from(word.text).length) * cw + g.metrics.textX, h: ROW };
    wordBoxes.push({ index: i, box });
    hoverItem(r, `sign:${word.id}`, box, draw);
  });
  L.wordBoxes = wordBoxes;

  const full = own >= SIGN_LIMIT ? 'LIMIT REACHED / REPLACES OLDEST' : null;
  if (ui.message) g.text(fitText(ui.message, room), first, at.message, accent());
  else if (full) g.text(fitText(full, room), first, at.message, muted());

  const shorts = [['[←→] WORD', '[ENTER] ADD', '[BKSP] UNDO'], ['[T] TYPE', '[L] LEAVE', '[0] CANCEL']];
  KEY_LINES.forEach((items, k) => {
    const long = keyLine(items);
    const line = Array.from(long).length <= room ? long : shorts[k].join(' ');
    g.text(fitText(line, room), first, at.keys + k, muted());
  });
  return L;
}
