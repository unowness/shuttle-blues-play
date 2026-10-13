// The quest list (SX's pick on labs/graphics/sketches/quests.html, 2026-10-02: «LIST Q3 A2 D3 P3», the place «on the LEFT, under the
// locator»; since 2026-10-08, «HUD PLACE: S3 + MIRROR SWITCH», on the side the locator is not: the top right, or the left where the
// pause's SIDES is turned, labs/graphics/hud-sides.js). What it holds is the world's (src/quests.js); this file
// keeps each plate's own clock and draws it. Since 2026-10-04 a plate is the banners' family 04 (SX's pick, Codex's A / Rail
// revision 5; labs/graphics/rail.js), laid out as they are, its mechanics and motion today's (SX, on the economy build: «кликаешь и
// восклицательный знак превращается в стрелочку ... таймер раскрашен хорошо ... они реально красиво пропадают ... просто новый
// лайаут»):
//
//   RAIL 04      a 3 px strip flush on the plate's left edge in the quest's ink, no backing (solid black until SX's «у квестов
//                убери черную подложку», 2026-10-07: the words stand on the sky with their text shadow), the sign centred in its
//                field at RAIL.sign in the strip's ink (`!` a red quest, `+` a yellow one, `◇` green and blue, the bearing arrow while
//                its pointer is on; white under the pointer), the title from RAIL.textX, under it the clock in the strip's ink, a
//                spaced middle dot and what to do (money in the coin's rim gold); RAIL.air over and under the two rows, no corner;
//                one width whatever its words: the locator's column's (SX, 2026-10-04: «квесты надо под его размер подгонять
//                примерно»; labs/graphics/locator.js questListAnchor `width`, 237 px at the scope's 119, on whichever side), RAIL.width where no column
//                is laid out; words past the row cut with an ellipsis (rail.js railFit); UI.pad between plates.
//   A2 LORE      a plate comes as the title's lore text does: each cell blank, 0.18 s of `01/:·_` changing every 55 ms,
//                then itself, the sweep 0.48 s from a corner picked at random.
//   D3 LORE OUT  done turns it green at once (`+` and the done words) and lights up: a wave of light runs over its squares
//                from a corner (0.5 s, each square flashing bright and settling to a tint), the plate stands lit to 1.4 s, then
//                its cells flicker out the same way from another corner; the plates under it ease up in 0.22 s. Late (a raid
//                lost): the same in red with `×`. A quest that is simply gone (the wallet fell short) flickers out at once.
//                SX, 2026-10-02: «в списке квестов должна быть более заметная анимация кажется она просто пропадает»: it
//                was a 0.12 s flash at 0.45 and 1.1 s of standing, which read as the plate switching its words and going. It
//                stands lit 4 s since SX's «квесты после выполнения должны пропадать с большей задержкой» (2026-10-06; 1.4 s).
//   BLINK        a purple quest (the story's, a reference ship's) blinks its sign until the pilot clicks its plate or steps to it by
//                key (SX, 2026-10-06: «пусть на квесте слева мигает его иконка пока на него не кликнут, но только для фиолетовых»):
//                QUEST_BLINK.on s shown, .off s not; no other tone blinks; under reduced motion the sign stands steady.
//
// The page's time runs the plates (seconds); the raid's clock is the pilot's (World.ledger.clock).

import { UI, uiMetrics } from '../../src/uiGrid.js';
import { clockText } from '../../src/contracts.js';
import { questTone } from '../../src/quests.js';
import { PALETTE, ROLES, QUEST_INKS } from '../../src/roles.js';
import { COLUMN_GAPS, buttonInk, drawColumnButton } from './locator.js';
import { keptDraw } from '../../src/grade.js';
import { RAIL, LORE, LORE_TIMES, sweepAt, washOf, moneyRuns, railFit, drawRailGrid } from './rail.js';
import { hoverItem, withAlpha } from '../../src/hover.js';
import { MARK_FOCUS } from '../../src/tasks.js';
import { keyName } from '../../src/controls.js';
import { easeOut as ease, noise3 as noise, inBox } from '../../src/util.js';

export const QUEST_FRAME = Object.freeze({ strip: RAIL.strip, rowH: UI.row, padY: RAIL.air, gap: UI.pad, rows: 2 });
// A quest's ink by its colour (src/quests.js QUEST_TONE; SX, 2026-10-02: red, yellow, green, blue; the inks are src/roles.js
// QUEST_INKS), and its mark.
export const QUEST_TONES = Object.freeze({
  red: { ink: QUEST_INKS.red, mark: '!' },
  yellow: { ink: QUEST_INKS.yellow, mark: '+' },
  green: { ink: QUEST_INKS.green, mark: '◇' },
  blue: { ink: QUEST_INKS.blue, mark: '◇' },
  // The story (SX's Q1 STORY PURPLE with P1, 2026-10-05: «квесты Q1 P1»): the opening chapter, the radio's guide and the reference
  // ships' rare quests (src/specials.js: a race, a battle, a train, a run, a fall) in the story's purple, signed ◆. The rare ones keep
  // a tone of their own, `special`, for what it does on the list (it comes selected, under the red ones), not for its colour; it was
  // O-08's violet (CONFIG.blackHole.color) until the pick.
  story: { ink: QUEST_INKS.story, mark: '◆' },
  special: { ink: QUEST_INKS.special, mark: '◆' },
});
const toneOf = (q) => QUEST_TONES[questTone(q)] ?? QUEST_TONES.green;
export const QUEST_OUTCOME = Object.freeze({
  done: { ink: PALETTE.green, mark: '+' },
  late: { ink: PALETTE.red, mark: '×' },
});
// The lore's own times (the cell, its step, the sweep, the scatter) are the banners' (rail.js LORE_TIMES: they took them from here).
export const QUEST_TIMES = Object.freeze({ ...LORE_TIMES, hold: 4, close: 0.22, wave: 0.5, glow: 0.4 });
// A purple quest's sign blinking until it is clicked (see BLINK at the head): seconds shown, seconds not.
export const QUEST_BLINK = Object.freeze({ on: 0.6, off: 0.4 });
const PURPLE = new Set(['story', 'special']);
// Whether a plate's sign is off now: a purple quest not yet clicked or stepped to, still on the list, between its blinks.
export const blinkOff = (plate, now, reduced = false) => !reduced && !plate.seen && plate.doneAt == null && !plate.outcome && PURPLE.has(questTone(plate.q))
  && ((now - plate.born) % (QUEST_BLINK.on + QUEST_BLINK.off)) >= QUEST_BLINK.on;
// How a plate lights when it ends: it stands in the notices' own wash of its ink (labs/graphics/notice.js washOf, laid at `wash`
// over the black: deep and coloured, as the cargo plates are), and a square flashes the ink itself at `flash` (0 to 1) as the wave
// reaches it, settling over QUEST_TIMES.glow.
export const QUEST_LIGHT = Object.freeze({ wash: 0.9, flash: 0.5 });

const NO_IDS = Object.freeze([]);
const BEARINGS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
export const bearingGlyph = (a) => BEARINGS[(Math.round(a / (Math.PI / 4)) % 8 + 8) % 8];
const glyphs = (s) => Array.from(String(s ?? ''));

export function createQuestBoard() {
  // `off`: the quests whose marks the pilot switched off by a click on their plate (src/tasks.js markedQuests). `auto`: the id the chapter
  // selected by itself (activeId while it is the pilot's own pick no more than that): the selection that gives the banner, the locator and the
  // map their one task, and dims no other plate or pointer.
  return { plates: [], activeId: null, auto: null, off: new Set(), boxes: [], box: null, hintBox: null, serial: 0 };
}

// The board follows the world's list: a quest new to it comes (A2), one no longer there goes, green or red if the world
// says how it ended (D3), quietly if not. A raid begun turns its pointer on (SX: «у тебя появляется указатель»).
export function syncQuestBoard(board, quests, outcomes, now) {
  const live = new Map(quests.map((q) => [q.id, q]));
  for (const plate of board.plates) {
    const q = live.get(plate.id);
    if (q) { plate.q = q; continue; }
    if (plate.doneAt != null) continue;
    plate.doneAt = now;
    plate.outcome = outcomes?.get(plate.id) ?? null;
    if (board.activeId === plate.id) board.activeId = null;
    board.off.delete(plate.id);
  }
  for (const q of quests) {
    if (board.plates.some((p) => p.id === q.id)) continue;
    board.serial += 1;
    // Every field a plate is given, given now (its shape does not change as it is drawn): its place (`y`, `target`, `from`, `moveAt`),
    // when it came in again (`shown`), whether it was clicked (`seen`) and is gone (`gone`).
    board.plates.push({ id: q.id, q, born: now, doneAt: null, outcome: null, seed: board.serial * 7919 + Math.floor(now * 1000) % 7919,
      y: null, target: null, from: null, moveAt: null, shown: null, seen: false, gone: false });
    // The opening chapter's objective (src/opening.js `select`) selects itself as it comes: it is the one thing to do. A red or a
    // purple quest no longer does (it did until 2026-10-07): every quest shows its marks as it comes (src/tasks.js markedQuests). It is
    // `auto`: the chapter's own selection, which dims nothing (SX, 2026-10-09, of a blue quest that stayed gray beside it and stayed gray when
    // clicked: a quest that is not the pilot's pick is lit while its marks are on).
    if (q.select) { board.activeId = q.id; board.auto = q.id; }
  }
  // The red ones first (a raid, a ship pestered), then side quests, each in the order they came.
  const rank = (p) => (questTone(p.q) === 'red' ? 0 : questTone(p.q) === 'special' ? 1 : 2);
  board.plates.sort((a, b) => (rank(a) === rank(b) ? a.born - b.born : rank(a) - rank(b)));
}

// The active quest's data, or null.
export function activeQuest(board) {
  return board.plates.find((p) => p.id === board.activeId && p.doneAt == null)?.q ?? null;
}

// The next quest's pointer, from the keyboard's focus on the list (labs/graphics/key-focus.js) or a click on the list's head (SX, 2026-10-02: «квесты надо
// как-то выбирать не только кликом в мышку ... непонятно, что кликнуть в них надо»): none selected goes to the first, each to the
// next, and the last to none.
export function cycleQuestBoard(board) {
  const ids = board.plates.filter((p) => p.doneAt == null).map((p) => p.id);
  if (!ids.length) return false;
  board.auto = null;
  const at = ids.indexOf(board.activeId);
  board.activeId = at < 0 ? ids[0] : at + 1 < ids.length ? ids[at + 1] : null;
  seen(board, board.activeId);
  return true;
}
// The pilot's own click or key on a plate: its sign stops blinking (BLINK).
export function seen(board, id) { const p = board.plates.find((q) => q.id === id); if (p) p.seen = true; }
// A click: the plate under (x, y) switches its quest's marks off, or on again if they were off (SX, 2026-10-09: «все квесты, когда
// они появляются, они показывают метки на карте. Если пользователь кликнул в него, то он его отключил просто»; until then a click
// selected the quest and only a selected one showed its marks); the list's head (R QUESTS, `hintBox`) does what the next quest's key
// did before the new layout: the next quest's pointer (SX, 2026-10-02: «квесты надо как-то выбирать не только кликом в мышку»).
// Returns whether the list was hit.
export function clickQuestBoard(board, x, y) {
  const hit = board.boxes.find((b) => inBox(b, x, y));
  if (hit) { seen(board, hit.id); toggleQuestMarks(board, hit.id); return true; }
  if (inBox(board.hintBox, x, y)) return cycleQuestBoard(board);
  return false;
}
// A quest's marks off, or on again; switched off, it is no longer the selected one either. Returns whether they show now.
export function toggleQuestMarks(board, id) {
  if (board.off.delete(id)) return true;
  // The ruin's restoration keeps its purple mark on the station whatever is clicked (src/opening.js `keep`; SX, 2026-10-09: «должна
  // быть всегда метка на станцию, да, фиолетовая оставаться»).
  if (board.plates.some((p) => p.id === id && p.q?.keep)) return true;
  board.off.add(id);
  if (board.activeId === id) board.activeId = null;
  return false;
}
export const questBoardHit = (board, x, y) => board.boxes.some((b) => inBox(b, x, y)) || inBox(board.hintBox, x, y);

// What a plate says now: its ink, mark and words by its state.
function plateWords(plate, clock, bearing) {
  const q = plate.q;
  const outcome = plate.outcome ? QUEST_OUTCOME[plate.outcome] : null;
  const words = plate.outcome === 'done' ? q.done : plate.outcome === 'late' ? q.late : [q.title, q.sub];
  const timer = q.ends != null && !plate.outcome ? clockText(Math.ceil(Math.max(0, q.ends - clock))) : '';
  return {
    ink: outcome?.ink ?? toneOf(q).ink,
    mark: bearing != null && !plate.outcome && plate.doneAt == null ? bearingGlyph(bearing) : outcome?.mark ?? toneOf(q).mark,
    title: words?.[0] ?? q.title, sub: words?.[1] ?? q.sub, timer,
  };
}

// A plate's measures: `width` (the Rail's) and two rows with RAIL.air over and under; `cols`, the characters a row holds from the
// words' origin to RAIL.trailing short of its right edge (no corner on a quest).
export const QUEST_WIDTH = RAIL.width;
export function questGeometry(r, width = QUEST_WIDTH) {
  const F = QUEST_FRAME, pitch = r.cellW;
  return { pitch, cols: Math.max(1, Math.floor((width - RAIL.textX - RAIL.trailing) / pitch)), width, height: F.rows * F.rowH + 2 * F.padY };
}
const geometry = questGeometry;

// The plate's squares, as the cargo plates' (notice.js flapSquares): the strip's (col -1), then a character's width each, set on
// the words' columns, to the right edge, by half a row. `mirror`: the plate on the screen's right (SX, 2026-10-08, «у квестов кстати
// отзеркаленный дизайн плашек должен быть»): every square at its mirror place, the strip on the right edge; the sweep is laid on the
// squares' columns as the plate has them on the left (`u`), so it runs from the mirrored corner on the screen: the light of the lore
// goes as it went on the left, reflected.
function squares(g, x, y, seed, outDir, mirror = false) {
  const F = QUEST_FRAME, xs = [];
  for (let at = RAIL.textX; at > F.strip + 0.5; at -= g.pitch) xs.unshift(Math.round(at));
  for (let at = RAIL.textX + g.pitch; at < g.width - 0.5; at += g.pitch) xs.push(Math.round(at));
  const edges = [0, F.strip, ...xs, g.width];                    // from the plate's left edge, as the plate stands on the left
  const n = edges.length - 1, bands = F.rows * 2, list = [];
  const bandY = (k) => Math.round(y + (k * g.height) / bands);
  const dir = Math.floor(noise(seed, 7, 9) * 4), dirOut = Math.floor(noise(seed, 8, 11) * 4);
  const push = (col, k, a, b, u) => {
    const v = (k + 0.5) / bands, hash = noise(col + 3, k + 5, 17 + seed);
    list.push({ col, k, x: x + (mirror ? g.width - b : a), y: bandY(k), w: b - a, h: bandY(k + 1) - bandY(k), hash,
      start: sweepAt(outDir ? dirOut : dir, u, v) * QUEST_TIMES.sweep * 1000 + hash * QUEST_TIMES.scatter * 1000 });
  };
  for (let k = 0; k < bands; k++) {
    push(-1, k, 0, F.strip, 0);
    for (let c = 1; c < n; c++) push(c - 1, k, edges[c], edges[c + 1], c / (n - 1));
  }
  return { list, n, bands, strip: mirror ? x + g.width - F.strip : x };
}

// The effect at the plate's clock: which squares stand, what a cell shows, the flash, and whether it is gone.
function plateFx(plate, now, reduced) {
  const T = QUEST_TIMES;
  const fx = { shown: () => true, char: (ch) => ch, lit: () => false, flash: () => 0, gone: false, out: false };
  if (plate.doneAt == null) {
    if (reduced) return fx;
    const ms = (now - (plate.shown ?? plate.born)) * 1000;
    fx.shown = (sq) => ms >= sq.start;
    fx.char = (ch, sq) => (ms < sq.start ? ' ' : ms < sq.start + T.cell * 1000
      ? LORE[(Math.floor(ms / (T.step * 1000)) + Math.floor(sq.hash * 151)) % LORE.length] : ch);
    return fx;
  }
  const t = now - plate.doneAt;
  const hold = plate.outcome ? T.hold : 0;
  // The wave of light: a square lights when the sweep reaches it (its `start`, scaled to `wave`), flashing over `glow` as it
  // does; under reduced motion the plate is simply lit as it ends.
  if (plate.outcome) {
    const span = (T.sweep + T.scatter) * 1000, reach = (sq) => (t - (sq.start / span) * T.wave) / T.glow;
    fx.lit = reduced ? () => true : (sq) => reach(sq) >= 0;
    fx.flash = reduced ? () => 0 : (sq) => { const u = reach(sq); return u < 0 || u >= 1 ? 0 : 1 - ease(u); };
  }
  const out = t - hold;
  if (out < 0) return fx;
  fx.out = true;
  const ms = out * 1000, end = T.sweep * 0.94 * 1000 + T.cell * 1000 + T.scatter * 1000;
  if (reduced) { fx.gone = true; return fx; }
  fx.shown = (sq) => ms < sq.start * 0.94 + T.cell * 1000;
  fx.char = (ch, sq) => {
    const at = sq.start * 0.94;
    return ms < at ? ch : ms < at + T.cell * 1000 ? LORE[(Math.floor(ms / (T.step * 1000)) + Math.floor(sq.hash * 151)) % LORE.length] : ' ';
  };
  fx.gone = ms >= end;
  return fx;
}

// Draws one plate with its top left at (x, y), as `g` (questGeometry) lays it. Returns its rectangle, or `gone`.
const fromRight = (a, b) => b.x - a.x;
function drawPlate(r, plate, x, y, g, now, clock, bearing, reduced, dim = false, over = false, mirror = false) {
  const F = QUEST_FRAME;
  const rect = { x, y, w: g.width, h: g.height };
  const fx = plateFx(plate, now, reduced);
  if (fx.gone) return { ...rect, gone: true };
  const words = plateWords(plate, clock, bearing);
  const sq = squares(g, x, y, plate.seed, fx.out, mirror);
  const shown = new Set();
  // At rest (every square standing, none lit or flashing) the strip's squares tile one rectangle, laid as one (the effects audit of
  // 2026-10-06, path #7; a lab switch until SX compared it by eye and took it into the game, 2026-10-07), so where a square's edge
  // falls between pixels (a plate pressed under the pointer, a little smaller) no faint seam shows. Coming, going or lit, square by
  // square.
  const still = sq.list.every((s) => fx.shown(s) && !fx.lit(s) && !(fx.flash(s) > 0));
  if (still) {
    for (const s of sq.list) shown.add(`${s.col},${s.k}`);
    const top = sq.list[0].y, bottom = sq.list[sq.list.length - 1].y + sq.list[sq.list.length - 1].h;
    r.fill(sq.strip, top, F.strip, bottom - top, words.ink);
  }
  // No black under the words (SX, 2026-10-07: «у квестов убери черную подложку»): a square that stands lets its letters show, and its
  // letters cast the interface's text shadow onto the sky (src/textShadow.js); the strip, the sign and a plate's light as it ends stay.
  for (const s of still ? [] : sq.list) {
    if (!fx.shown(s)) continue;
    shown.add(`${s.col},${s.k}`);
    if (s.col < 0) { r.fill(s.x, s.y, s.w, s.h, words.ink); continue; }
    if (fx.lit(s)) r.fill(s.x, s.y, s.w, s.h, washOf(words.ink) ?? words.ink, QUEST_LIGHT.wash);
    const flash = fx.flash(s);
    if (flash > 0) r.fill(s.x, s.y, s.w, s.h, words.ink, QUEST_LIGHT.flash * flash);
  }
  // Every resolved plate takes the cargo grid with its wash. Clip to the cells
  // still visible and already lit, so the grid follows both the wave and the exit.
  if (plate.outcome && plate.doneAt != null) {
    const ctx = r.ctx;
    ctx.save(); ctx.beginPath();
    for (const s of sq.list) if (s.col >= 0 && fx.shown(s) && fx.lit(s)) ctx.rect(s.x, s.y, s.w, s.h);
    ctx.clip();
    drawRailGrid(r, x, y, g.width, g.height, mirror);
    ctx.restore();
  }
  // A row's words where Codex's painter sets them (rail.js, the banners'): its top plus the interface's textY, the letters at their own
  // monospace places (rounding each letter to a whole pixel stepped them 9 or 10 px apart at a 9.27 px cell).
  const { textY } = uiMetrics(r);
  const rowText = (top) => top + textY;
  // The square under a point of the plate, and whether it stands (both halves of a row's band, as a letter needs).
  const sqUnder = (px0, k) => sq.list.find((s) => s.k === k && px0 >= s.x && px0 < s.x + s.w);
  const stands = (s, k) => s && shown.has(`${s.col},${k}`) && shown.has(`${s.col},${Math.max(0, k - 1)}`);
  // The cells it writes: the sign in its field, the title (quiet while another is selected), the clock in the strip's ink, a spaced
  // middle dot and what to do, money in gold.
  // Mirrored, the sign stands at the right in its field and each row ends where it began, on the words' origin from the right edge
  // (the words keep their order: they are aligned to the strip's side, not reversed).
  const cells = [{ ch: blinkOff(plate, now, reduced) ? ' ' : words.mark, x: mirror ? x + g.width - RAIL.sign - g.pitch / 2 : x + RAIL.sign - g.pitch / 2, row: 0,
    ink: over && !plate.outcome ? ROLES.textPrimary : words.ink }];
  const put = (runs, row) => {
    let n = 0;
    for (const [str] of runs) n += glyphs(str).length;
    let at = mirror ? x + g.width - RAIL.textX - n * g.pitch : x + RAIL.textX;
    for (const [str, ink] of runs) for (const ch of glyphs(str)) { cells.push({ ch, x: at, row, ink }); at += g.pitch; }
  };
  put([[railFit(words.title, g.cols), dim ? ROLES.textSecondary : ROLES.textPrimary]], 0);
  const timer = words.timer ? glyphs(words.timer).length + 3 : 0;
  put([...(words.timer ? [[words.timer, words.ink], [' · ', ROLES.textSecondary]] : []), ...moneyRuns(railFit(words.sub ?? '', g.cols - timer), ROLES.textSecondary)], 1);
  // Each letter casts its own copy of the text's shadow just before it is drawn (src/textShadow.js), which lies on the letters drawn
  // before it. Mirrored, on the screen's right, the shadow falls left: the letters are drawn from the right, so each copy lies on
  // letters still to come and they cover it (SX, 2026-10-08, a screenshot: «над квестами слоем выше лежит какая-то черная заливка и
  // буквы перекрываются»; drawn from the left, each letter's shadow bit into the right of the one before, an O read as a C).
  if (mirror) cells.sort(fromRight);
  for (const c of cells) {
    if (c.ch === ' ') continue;
    const k = c.row * 2 + 1, s = sqUnder(c.x + g.pitch / 2, k);
    if (s && !stands(s, k)) continue;
    const ch = fx.char(c.ch, s ?? { start: 0, hash: 0 });
    if (ch !== ' ') r.text(ch, c.x, rowText(y + F.padY + c.row * F.rowH), c.ink);
  }
  return rect;
}

// The list from its top left corner (x, y). Each plate eases to its place when one above it goes. `bearingOf(q)` gives
// the active quest's bearing for its mark. Returns the plates' rectangles (kept for clicks) and the list's whole box.
// Drawn in the kept layer (src/grade.js): a look filters the list as art and never repaints it (a quest's blue is the cockpit's).
// `pointer` ({ x, y, inside, down }, the page's): a plate under it gives as if pressed, a little smaller and darker, and further
// under a press (src/hover.js, a panel; SX, 2026-10-03: «Нотификейшн. Квесты. Локатор. Должны быть как будто
// продавливанием их ... чуть темнее»; they came closer since 2026-10-02).
// `width`: the plates' (the locator column's, locator.js questListAnchor). `button` ({ inset, edge }: the locator column's left ink edge
// and right edge from `x`, locator.js questListAnchor): the list's
// head, SX's «R QUESTS» (S3, L3+), drawn on the row at `y` with the plates COLUMN_GAPS.under its ink, as the legend's «M LEGEND»
// heads the legend; its key the next quest's (src/controls.js), a click on it does what that key did (the next quest's pointer),
// and it looks as under the pointer while the keys hold the list (`attached`, labs/graphics/key-focus.js: SX's rule 12). Without
// `button` (a window below the column's size) the plates start at `y`. Its cap holds its key's letter in every scheme (SX, 2026-10-06).
// `mirror`: the list on the screen's right (SX, 2026-10-08, «у квестов кстати отзеркаленный дизайн плашек должен быть»; the pause's
// SIDES leaves it on the left): every plate and the head mirrored about the plates' box: the strip on the right edge, the sign in its
// field beside it, the words aligned to it, the lore's sweep and the lit wave from the mirrored corner; the head's cap at the right.
// `focusId`: the quest the helmet's notch speaks for (labs/graphics/notices.js focusedQuestId). Since the notch says what to do and not
// the quest's name (SX, 2026-10-05: «что конкретно за квест выбран будет подсвечено слева в списке квестов»), its plate is marked as a
// selected one is, in the list's own way: the other plates' titles quiet (gray). A selected quest marks itself so already (its sign
// the bearing's arrow, the others quiet); a quest the notch holds with none selected (a red one by its clock, or the first) did not.
// `markedIds`: the quests whose marks stand in the sky (src/tasks.js markedQuests: every one but those switched off by a click): their
// plates show the bearing's arrow, as a selected one does, and their titles stand lit; a plate whose marks the pilot switched off reads
// quiet (gray, its sign the tone's diamond), so a click shows (SX, 2026-10-09: a blue quest that «остается серым» whatever was clicked:
// the chapter's purple, selected by itself, had every other plate gray beside it). With no list told (`null`) no plate is quiet for want of marks.
// The chapter's own selection (`board.auto`) is no pick: the others are neither dimmed nor grayed by it.
export const drawQuestBoard = keptDraw(function drawQuestBoard(r, board, x, y, now, clock,
  { bearingOf = () => null, reducedMotion = false, pointer = null, button = null, attached = false, width = QUEST_WIDTH, focusId = null,
    markedIds = null, mirror = false } = {}) {
  const F = QUEST_FRAME;
  board.boxes = [];
  board.hintBox = null;
  if (!board.plates.length) { board.box = null; return board; }
  x = Math.round(x);
  const g = geometry(r, Math.round(width));
  const top = y;
  if (button) {
    const ink = buttonInk(r), row = { x: x + button.inset, y, w: button.edge - button.inset, h: UI.row };
    const under = !!pointer?.inside && inBox(row, pointer.x, pointer.y);
    board.hintBox = drawColumnButton(r, { x0: x + button.inset, edge: x + button.edge, rowTop: y, key: keyName('nextQuest'), word: 'QUESTS',
      name: 'quests:button', over: attached || under ? true : null, axis: mirror ? 2 * x + Math.round(width) : null });
    y = Math.round(y + ink.bottom + COLUMN_GAPS.under);
  }
  const live = (id) => id != null && board.plates.some((p) => p.id === id && p.doneAt == null);
  const pointed = live(board.activeId) ? board.activeId : null;
  const picked = pointed != null && board.auto !== pointed ? pointed : null;
  const lead = picked ?? (live(focusId) ? focusId : null);
  let at = 0;
  for (const plate of board.plates) {
    // Its place, eased (QUEST_TIMES.close) when one above it has gone.
    if (plate.y == null) plate.y = plate.target = at;
    if (plate.target !== at) { plate.from = plate.y; plate.target = at; plate.moveAt = now; }
    const k = reducedMotion ? 1 : Math.min(1, (now - (plate.moveAt ?? now)) / QUEST_TIMES.close);
    plate.y = plate.from == null ? plate.target : plate.from + (plate.target - plate.from) * ease(k);
    const active = pointed === plate.id || !!markedIds?.includes(plate.id);
    const py = Math.round(y + plate.y);
    const over = !!pointer?.inside && pointer.x >= x && pointer.x <= x + g.width && pointer.y >= py && pointer.y <= py + g.height;
    // While a quest is selected, every other plate stands at MARK_FOCUS.dim of its light (SX's M3 PING, 2026-10-08: «должен и в списке
    // квестов выделяться, а остальные чуть затемняться»), its title quiet as before.
    const quiet = picked != null && plate.id !== picked ? MARK_FOCUS.dim : 1;
    const box = hoverItem(r, `plate:${plate.id}`, { x, y: py, w: g.width, h: g.height },
      () => withAlpha(r.ctx, quiet, () => drawPlate(r, plate, x, py, g, now, clock, active ? bearingOf(plate.q) : null, reducedMotion,
        lead != null ? plate.id !== lead : markedIds != null && plate.doneAt == null && !active, over && plate.doneAt == null, mirror)),
      { kind: 'panel', over: over && plate.doneAt == null, disabled: plate.doneAt != null || !pointer });
    if (box.gone) { plate.gone = true; continue; }
    if (plate.doneAt == null) board.boxes.push({ id: plate.id, ...box });
    at += g.height + F.gap;
  }
  board.plates = board.plates.filter((p) => !p.gone);
  // The list's box from its head to its last plate: what a label keeps off, what the layout editor moves.
  board.box = at > 0 ? { x, y: board.hintBox ? Math.min(top, board.hintBox.y) : y, w: Math.max(g.width, board.hintBox ? board.hintBox.w : 0), h: 0 } : null;
  if (board.box) board.box.h = y + at - F.gap - board.box.y;
  return board;
});

// The plate's squares, for the checks (a plate on the left, or `mirror`ed on the right).
export { squares as plateSquares };
