import { CONFIG } from './config.js';
import { fitText } from './util.js';

// The interface's spacing system (SX, 2026-09-30: «Все вот эти отступы и отступы
// в интерфейсе должны быть в системе, берем максимум 8 типов и размеров
// отступов ... Он должен выглядеть причёсанным, ровным, эстетичным, лаконичным и
// собранным, сейчас очень сильный разнобой и вариативность»). The decision and
// the reasons: reports/2026-09-30-spacing-system.md; the note for people is
// Obsidian «16 Spacing system».
//
// The interface has a row of its own: 20 px. The world's cell (9.27 x 15,
// lineRatio 1) is not touched; a window is laid out on whole rows (this file)
// and whole columns (the renderer's measured cell width) and never on a fraction
// of `ch`. Horizontally one column is 9.27 px, vertically one row is 20, so the
// same step in rows and in twice the columns gives the same air on both axes.
//
// The chain rule: a number in a window's code is one of these tokens, a count of
// rows or columns, or a value computed from the font's measured ink below. Set
// UI.row to 24 and everything that did not follow is a broken chain.
export const UI = Object.freeze({
  row: 20,                                             // px, the interface's row
  // Four steps, each about twice the one before (a step reads as a level, not
  // as a slip, from 1.5x):
  pad: 4,                                              // px: a mark and its own ink (keycap stroke and letter, a text backing, a label box)
  space: Object.freeze({ cols: 1, rows: 0.5 }),        // inside one statement: key and action, label and leader dots, legend mark and name
  line: Object.freeze({ cols: 2, rows: 1 }),           // the step: pitch; frame or rule to content, all four sides; box beside box; label column to value column
  group: Object.freeze({ cols: 4, rows: 2 }),          // between groups (one blank row), between text columns, between the title's blocks
  // The vector HUD draws the same steps on its 8 px grid (ANGLES.md): space 8,
  // line 16 (EDGE, across) and 20 (SCREEN_ROW, down), group 40 (SX's 40 px of the title).
  vector: Object.freeze({ space: 8, line: 16, group: 40 }),
  // Air: what the eye measures, ink to ink (SX, 2026-09-30, colouring the gaps of
  // the pilot card that must match: «Бро пойми уже наконец логику отступов ... все
  // что по цветам одинаковые я нарисовал должны быть одинаковые»). Rows put text
  // 13.5 px from a line and a line 18.5 px from a line; the eye sees two sizes where
  // one was meant. So a block is placed by its ink (uiGrid's `capRow`, `lineRow`):
  //   inset   a container's edge (frame, box, divider, tile) to what it holds, on
  //           every side, and one container to the next: 17.5 px, what two columns
  //           give across (the frame's line ink to the text's ink)
  //   rule    a rule to the text over and under it, the same both sides: 10 px
  // Lines of text inside a block keep the row's 20 px pitch. Obsidian note 17.
  air: Object.freeze({ inset: 17.5, rule: 10 }),
});

// How what floats over the flight floats (SX, 2026-10-03: «оно более-менее флоутит. Там, в очень небольшом диапазоне, типа 20
// пикселей ... придумай правила флоутинга и везде рассчитай, чтобы у нас какие-то примерные одинаковые размеры флоутинга были.
// Знаешь, придумай сетку, как с отступами»). One ladder from the row, as the spacing's is, and one pace for all, so everything
// that floats breathes alike:
//   window  a row across, end to end (±10 px from its place): a dialog window by its object
//   plate   half of it (±5): a label or a plate, a bearing at the screen's edge
//   mark    a quarter (±2.5): a small mark beside a thing
// Each axis a slow sine, `period` s round (two that never meet, so the path does not repeat to the eye), from its place at once
// (an offset of nothing at the age 0, so a thing appears exactly where it is laid), the way a seed turns it; its quickest is
// about 5.7 px a second for a window.
export const FLOAT = Object.freeze({ window: UI.row, plate: UI.row / 2, mark: UI.row / 4, period: Object.freeze([11, 15]) });
// The offset of a thing that floats `range` px across (a FLOAT step) at `age` s, turned by `seed` (any number, a thing's own).
export function floatOffset(age, range = FLOAT.window, seed = 0) {
  const a = range / 2, [px, py] = FLOAT.period, t = Math.max(0, age || 0);
  const sx = seed % 2 ? -1 : 1, sy = Math.floor(seed / 2) % 2 ? -1 : 1;
  return { x: sx * a * Math.sin((2 * Math.PI * t) / px), y: sy * a * Math.sin((2 * Math.PI * t) / py) };
}

const roundHalf = (n) => Math.round(n * 2) / 2;

// Where text and lines sit in a row, measured from the font, not chosen. What
// the measurement gave at SF Mono 15 px (2026-09-30, pixel-scanned) stands in
// where a canvas cannot measure (a Node check's stub) and where the font has
// not loaded yet (measureText gives zeros).
const MEASURED = Object.freeze({ capTop: 1.4, capBottom: 11.97, capLeft: 1.12, lineHalf: 0.56, lineInkLeft: 4.07 });
// The metrics by font, then by cell width, and the last ones asked: every interface function asks for them, a hundred times a frame,
// and a key made of the font and the width by a template string was a string made and hashed at each (2026-10-09: 5.5 KB of garbage a frame).
const cache = new Map();
let lastFont = null, lastCell = NaN, lastMetrics = null;

// How a row is read (the row is UI.row tall):
//   textY   the offset that centres capitals in the row: (row - cap height) / 2 - cap top
//   textX   the offset that starts a text's ink where a line drawn in the same
//           column starts: the ink of '│' at 4.07 px minus the ink of 'H' at 1.12
//   capTop, capBottom, capLeft   the capitals' ink inside a text cell drawn from its top-left
//   lineHalf                     half the weight of a line glyph's stroke
// Left-aligned text is drawn at column x + textX, right-aligned text ends at its
// column's end - textX, centred text takes no shift; line glyphs are centred in
// the row and the column.
export function uiMetrics(r) {
  if (r.font === lastFont && r.cellW === lastCell) return lastMetrics;
  const byCell = cache.get(r.font) ?? cache.set(r.font, new Map()).get(r.font);
  const known = byCell.get(r.cellW);
  if (known) { lastFont = r.font; lastCell = r.cellW; return lastMetrics = known; }
  let raw = MEASURED;
  const ctx = r.ctx;
  if (ctx && typeof ctx.measureText === 'function') {
    try {
      ctx.save();
      ctx.font = r.font;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const cap = ctx.measureText('H');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const bar = ctx.measureText('│');
      ctx.restore();
      const measured = {
        capTop: -cap.actualBoundingBoxAscent, capBottom: cap.actualBoundingBoxDescent, capLeft: -cap.actualBoundingBoxLeft,
        lineHalf: (bar.actualBoundingBoxLeft + bar.actualBoundingBoxRight) / 2,
        lineInkLeft: r.cellW / 2 - bar.actualBoundingBoxLeft,
      };
      if (Object.values(measured).every(Number.isFinite) && measured.capBottom - measured.capTop > 4 && measured.lineHalf > 0) raw = measured;
    } catch { /* the stand-in stays */ }
  }
  const { capTop, capBottom, capLeft, lineHalf, lineInkLeft } = raw;
  const metrics = Object.freeze({
    capTop, capBottom, capLeft, lineHalf,
    textY: roundHalf((UI.row - (capBottom - capTop)) / 2 - capTop),
    textX: roundHalf(lineInkLeft - capLeft),
  });
  byCell.set(r.cellW, metrics);
  lastFont = r.font; lastCell = r.cellW; lastMetrics = metrics;
  return metrics;
}

// The air inside every pop-up, by ink (SX, 2026-09-30, on the pilot card: «Все вот эти отступы ... должны быть в системе»;
// made the rule of every pop-up on 2026-10-02: «верстка отступов крайне неаккуратная бери из карточки пилота и формулируй
// как систему, у нас во всех поп-апах должны быть одинаковые правила и логика верстки внутри, хоть они и разные по форме
// и содержанию, но ходы должны быть использованы одинаковые в том числе цвета и верстка»). The card's own flow, as
// functions of px down (or across) the panel: `y` a line's middle or a text line's capitals, as each says.
//   a container's line (the frame, a divider joined to it, a box) to what it holds: `inset` (17.5 px) ink to ink, every
//   side; across, that is the two columns between a line and its text;
//   a free rule inside a column to the text over and under it: `rule` (10 px);
//   lines of text: the row's 20 px.
// Inks (the card's): the outer frame and the dividers joined to it CONFIG.hud.edge; a box inside, a free rule, leader
// dots and the keys CONFIG.hud.hint; a label CONFIG.hud.color; a value, a name, a heading's subject CONFIG.hud.hot. The
// keys stand on the last text line, `inset` over the frame's bottom line.
// A window whose edge is its box (a line, where it has one, on the box's own edge, not in a row's middle: the two-tabs window, a
// dialog, the pause's and the garage room's black windows) takes the same inset on whole px (`I`): `lead` from the box's top to its
// first text row's top puts that row's capitals `I` under the edge, and `boxHeight(last)` ends the box `I` under the capitals of
// text row `last` (0 the first). Derived, not a step: no new number.
export function uiAir(r) {
  const m = uiMetrics(r), T = UI.air.inset, RA = UI.air.rule, LH = m.lineHalf, CAP = m.capBottom - m.capTop;
  const I = Math.round(T), lead = I - (m.textY + m.capTop);
  return Object.freeze({
    T, RA, LH, CAP, I, lead,
    boxHeight: (last) => Math.round(lead + last * UI.row + m.textY + m.capBottom + I),
    frameTop: UI.row / 2,                                      // the frame's top line, its middle, from the panel's top
    frameBottom: (rows) => (rows - 1) * UI.row + UI.row / 2,   // and its bottom line, for a panel `rows` tall
    afterLine: (y) => y + LH + T,                              // the first ink a container's line lets in under it
    lineAfter: (y) => y + T + LH,                              // a container's line `inset` under some ink
    lines: (capTop, n) => capTop + (n - 1) * UI.row + CAP,     // the capitals' bottom of n lines of text
    ruleAfter: (y) => y + RA + LH,                             // a free rule `rule` under some text's ink
    afterRule: (y) => y + LH + RA,                             // text `rule` under a free rule
    linesBefore: (y, n) => y - LH - T - CAP - (n - 1) * UI.row, // the first of n lines whose last ends `inset` over a line
  });
}

// Where a window that stands in the middle stands (SX, 2026-10-04: «окна центровые по вертикали визуально всегда неприятно
// сбалансированы, нужно расстановки с оптической компенсацией»; «когда карточка пилота открывается она упирается в рамку квестов, надо
// исправлять»). One rule for every centred window: the pilot card, station INFO, the hangar, the sign composer, the two-tabs window,
// the controls list, and the pause where it has no ship to come down over.
//   down    in the flight area (`r.view`, between the top strip and the cockpit), at its optical middle: of the height the window
//           leaves free there, OPTICAL.above stands over it and the rest under it, so it sits a little above the geometric middle
//           (a small window more, one that nearly fills the area hardly at all); kept UI.pad inside the screen;
//   across  in the middle of the screen, unless one of the HUD's two columns (the locator with the shelf under it on one side, the
//           quest list with the radio on the other, as the page draws them: `r.clearLeftOf(r)`, the left one's right ink edge, and
//           `r.clearRightOf(r)`, the right one's left, each or null) stands within `inset` of the window's ink: then just clear of
//           it, its ink `inset` off the column's (container to container, ink to ink: `air.inset`), and `inset` off the screen's edges.
// `ink`: px from the window's box to its first ink across (a framed panel's line glyph, `frameInk`; 0 for a black window whose edge
// is its box). Returns { x, y } on whole px. `windowRoom(r, ink)` is the widest box such a window may be (a panel that can be
// narrower, as the pilot card with fewer tiles a row, fits itself to it). No new step: the inset, the pad and one share.
export const OPTICAL = Object.freeze({ above: 0.45 });
export const frameInk = (r) => r.cellW / 2 - uiMetrics(r).lineHalf;
function clearLeft(r) {
  const at = r.clearLeftOf?.(r);
  return Number.isFinite(at) ? at + UI.air.inset : null;
}
function clearRight(r) {
  const at = r.clearRightOf?.(r);
  return Number.isFinite(at) ? at - UI.air.inset : null;
}
export function windowRoom(r, ink = 0) {
  const left = clearLeft(r) ?? UI.air.inset, right = clearRight(r) ?? r.width - UI.air.inset;
  return right - left + 2 * ink;
}
export function centredWindow(r, w, h, { ink = 0, clear = true } = {}) {
  const view = r.view || { x: 0, y: 0, w: r.width, h: r.height };
  const y = Math.max(UI.pad, Math.min(r.height - h - UI.pad, view.y + (view.h - h) * OPTICAL.above));
  // `clear: false`: a window wider than the room between the columns (the pilot card in the Swiss manner, SX allowed it: 1100 px at
  // 1280) stands in the middle of the screen over them, never pushed off its edge.
  const left = clear ? clearLeft(r) : null, right = clear ? clearRight(r) : null, middle = (r.width - w) / 2;
  // Clear of the left column first; where that leaves it over the right one, the window is wider than the room between them.
  const x = left !== null && middle + ink < left ? Math.ceil(left - ink)
    : right !== null && middle + w - ink > right ? Math.floor(right - w + ink) : Math.round(middle);
  return { x, y: Math.round(y) };
}

const canClip = (ctx) => !!ctx && ['save', 'restore', 'beginPath', 'rect', 'clip'].every((name) => typeof ctx[name] === 'function');
const glyphs = (s) => Array.from(String(s));

// A window's grid: columns from its left edge, rows from its top edge, both
// given as counts. `x0` and `y0` are the window's corner; keep y0 a whole pixel
// and every line lands on whole device pixels at DPR 2.
export function uiGrid(r, x0, y0) {
  const cw = r.cellW, ROW = UI.row, m = uiMetrics(r);
  const X = (col) => x0 + col * cw;
  const Y = (row) => y0 + row * ROW;

  // One line glyph, centred in its cell and its row.
  const glyph = (ch, col, row, ink) => r.glyphNow(ch, X(col) + cw / 2, Y(row) + ROW / 2, ink);
  // A run of them along one row: `a` at the first column, `b` at the last, `mid` between.
  const hline = (col0, col1, row, ink, a = '─', b = '─', mid = '─') => {
    for (let c = col0; c <= col1; c++) glyph(c === col0 ? a : c === col1 ? b : mid, c, row, ink);
  };
  // A run down one column from row0 to row1, both included, at most a row apart:
  // whole rows as before, and a span that is not a whole number of rows (a block
  // placed by its ink) spread evenly, so the line never shows a gap (a '│' is 21 px).
  const vline = (col, row0, row1, ink, ch = '│') => {
    const span = row1 - row0;
    if (span < 0) return;
    const n = Math.ceil(span - 1e-9);
    for (let k = 0; k <= n; k++) glyph(ch, col, n ? row0 + (span * k) / n : row0, ink);
  };
  // Where a block goes by its ink: the (fractional) row whose text has its
  // capitals' top at `y` px, and the row whose line glyph has its middle at `y`;
  // and back: a text row's capitals' top and bottom, a line row's middle.
  const capRow = (y) => (y - y0 - m.textY - m.capTop) / ROW;
  const lineRow = (y) => (y - y0 - ROW / 2) / ROW;
  const capTopOf = (row) => Y(row) + m.textY + m.capTop;
  const capBottomOf = (row) => Y(row) + m.textY + m.capBottom;
  const lineOf = (row) => Y(row) + ROW / 2;

  // Text.
  const text = (s, col, row, ink) => r.text(String(s), X(col) + m.textX, Y(row) + m.textY, ink, 1);
  const textEnd = (s, endCol, row, ink) => r.text(String(s), X(endCol + 1) - m.textX - glyphs(s).length * cw, Y(row) + m.textY, ink, 1);
  const textCentered = (s, col, cols, row, ink) => r.text(String(s), X(col) + (cols - glyphs(s).length) * cw / 2, Y(row) + m.textY, ink, 1);

  // A caption set into a frame's line (`┌─ SHIP / STANDARD ─┐`): the plate's
  // colour behind ` s `, from column `col`. Counts as text: a blank row goes before it.
  const title = (s, col, row, ink) => {
    const label = ` ${s} `;
    r.fill(X(col), Y(row), glyphs(label).length * cw, ROW, CONFIG.view.panel);
    text(label, col, row, ink);
  };

  // A free run of '─' inside a column: clipped to the column's ink edges, from
  // the middle of its first cell to the middle of its last, so a rule, a box's
  // line and the text over it share one left edge and one right edge.
  const rule = (col0, col1, row, ink) => {
    const ctx = r.ctx, clip = canClip(ctx);
    if (clip) {
      ctx.save(); ctx.beginPath();
      ctx.rect(X(col0) + cw / 2 - m.lineHalf, Y(row), X(col1) - X(col0) + 2 * m.lineHalf, ROW);
      ctx.clip();
    }
    hline(col0, col1, row, ink);
    if (clip) ctx.restore();
  };

  const box = (col0, row0, col1, row1, ink) => {
    hline(col0, col1, row0, ink, '┌', '┐'); hline(col0, col1, row1, ink, '└', '┘');
    vline(col0, row0 + 1, row1 - 1, ink); vline(col1, row0 + 1, row1 - 1, ink);
  };

  // A place, lighter than a panel: the top and bottom lines are rows of the
  // grid, the dashes between the corners spaced evenly, as near the world's
  // pitch as the height allows (rule 11: a box a multiple of 3 rows tall, line
  // to line, is a whole number of world rows and keeps it exactly; another
  // height spreads the same dashes a little, never leaving a short last gap).
  const dashed = (col0, row0, col1, row1, ink) => {
    hline(col0, col1, row0, ink, '┌', '┐', '┄'); hline(col0, col1, row1, ink, '└', '┘', '┄');
    const top = Y(row0) + ROW / 2, bottom = Y(row1) + ROW / 2;
    const steps = Math.max(1, Math.round((bottom - top) / r.cellH)), pitch = (bottom - top) / steps;
    for (let k = 1; k < steps; k++) {
      r.glyphNow('┆', X(col0) + cw / 2, top + k * pitch, ink); r.glyphNow('┆', X(col1) + cw / 2, top + k * pitch, ink);
    }
  };

  // The chosen object's own frame, drawn heavy at its four corners, two cells
  // along each edge (the pilot card's tile mark; the hangar's ship).
  const corners = (col0, row0, col1, row1, ink) => {
    glyph('┏', col0, row0, ink); glyph('━', col0 + 1, row0, ink); glyph('━', col1 - 1, row0, ink); glyph('┓', col1, row0, ink);
    for (const row of [row0 + 1, row1 - 1]) { glyph('┃', col0, row, ink); glyph('┃', col1, row, ink); }
    glyph('┗', col0, row1, ink); glyph('━', col0 + 1, row1, ink); glyph('━', col1 - 1, row1, ink); glyph('┛', col1, row1, ink);
  };

  // A label, its value at the column's end and dots between them, a dot every
  // other cell counted from the column's end (so the dots stand in columns
  // across rows) and never touching either: the label's and the value's first
  // free cells stay empty. Dots sit on cell centres, without the text shift.
  const leader = (label, value, col0, col1, row, valueInk, labelInk, dotInk) => {
    const v = String(value);
    text(label, col0, row, labelInk);
    let dots = '';
    const from = col0 + glyphs(label).length + 1, to = col1 - glyphs(v).length - 1;
    for (let c = from; c <= to; c++) dots += (col1 - c) % 2 === 1 ? '.' : ' ';
    if (dots.trim()) r.text(dots, X(from), Y(row) + m.textY, dotInk, 1);
    textEnd(v, col1, row, valueInk);
  };

  return { x0, y0, cw, row: ROW, X, Y, metrics: m, glyph, hline, vline, text, textEnd, textCentered, rule, box, title, dashed, corners, leader,
    capRow, lineRow, capTopOf, capBottomOf, lineOf };
}

// The window every panel shares: a flat plate of `cols` x `rows`, framed on
// the grid, with a title in the top line when it has one, its frame in `line`.
// Returns its grid. (`asciiPanel` in interface.js is the same plate on the
// world's rows, which the classic cockpit and the lab's compare mode still use.)
// `line` null: no frame, the panel's black alone, its outer row and column the air round what it holds (the pilot card,
// SX 2026-10-02: «не должно быть контура синего, только черная заливка с отступом»).
export function uiPanel(r, x, y, cols, rows, title = '', line = CONFIG.hud.frame) {
  const g = uiGrid(r, x, y);
  r.fill(x, y, cols * r.cellW, rows * UI.row, CONFIG.view.panel);
  if (line) g.box(0, 0, cols - 1, rows - 1, line);
  if (title) g.title(fitText(title, cols - 8), UI.line.cols, 0, CONFIG.hud.color);
  return g;
}
