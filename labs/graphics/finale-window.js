// The window when the boss TOLLKEEPER is beaten (src/bossQuest.js, the event bossQuestDone): the main game is done, how far the collection is
// gathered, and the way back (SX, 2026-10-14: «после победы тебе должен встретить поп-ап о том что основная игра пройдена, показать на сколько
// собраны твои коллектаблс и должна быть кнопка "вернуться в открытый космос"»). In the Swiss manner of every pop-up but the pause and the card
// (labs/graphics/swiss.js, swiss-window.js), as the window about two tabs is (tabs-window.js): the head its kind's mark in the gain's green and its
// title in white, TOLLKEEPER DOWN quiet at the right; a line on what it means; the collection's rows from the pilot card's journey (src/pilot.js
// journey), each its count at the right, the whole as a share; then a rule and RETURN TO OPEN SPACE as the cockpit's keycap, which a click (on it or
// anywhere on the window) presses. Like every pop-up it does not pause the flight. Returns the window's box.
import { journey } from '../../src/pilot.js';
import { NOTICE_KINDS } from './notice.js';
import { noteAction } from './clicks.js';
import { swiss, SWISS, W, Q } from './swiss.js';
import { placeWindow, sheet, headRow, footKeys } from './swiss-window.js';
import { ledger, finish, len } from './ledger.js';

export const FINALE = Object.freeze({
  cols: 44, title: 'MAIN GAME COMPLETE', right: 'TOLLKEEPER DOWN',
  line: 'THE ROUTES ARE FREE. SPACE STAYS OPEN.', share: 'COLLECTED', key: 'ENTER', words: 'RETURN TO OPEN SPACE',
});

function layoutOf(r, world) {
  const sw = swiss(r), { I } = sw, j = journey(world);
  // The line, a blank row, the collection's rows, a blank row, the share.
  const rows = j.rows, shareRow = 2 + rows.length + 1, bodyRows = shareRow + 1;
  const footRow = SWISS.headGap + bodyRows + SWISS.footRows;
  const bw = Math.round(2 * I + FINALE.cols * sw.cw), bh = sw.heightWithKeys(footRow);
  const at = placeWindow(r, bw, bh);
  return { sw, j, rows, shareRow, footRow, box: { x: at.x, y: at.y, w: bw, h: bh } };
}

export function finaleRect(r, world) { return layoutOf(r, world).box; }

export function drawFinaleWindow(r, world, { onClose = null } = {}) {
  const { sw, j, rows, shareRow, footRow, box } = layoutOf(r, world), w = ledger(r, { id: 'finale' });
  const kind = NOTICE_KINDS.gain, L = box.x + sw.I, R = box.x + box.w - sw.I, bodyAt = (k) => sw.rowAt(box.y, SWISS.headGap + k);
  sheet(sw, box, footRow);
  headRow(sw, box, [{ runs: [[kind.mark, kind.ink], [' ', W], [FINALE.title, W]] }], [[FINALE.right, Q]]);
  sw.text(FINALE.line, L, bodyAt(0), W);
  // The collection: its label quiet at the left, its count white at the right; a whole row in the gain's green.
  rows.forEach((row, k) => {
    const count = `${row.have} / ${row.of}`, whole = row.have >= row.of;
    sw.text(row.label, L, bodyAt(2 + k), Q);
    sw.text(count, R - len(count) * sw.cw, bodyAt(2 + k), whole ? kind.ink : W);
  });
  const share = `${Math.round(j.progress * 100)} %`;
  sw.text(FINALE.share, L, bodyAt(shareRow), Q);
  sw.text(share, R - len(share) * sw.cw, bodyAt(shareRow), W);
  footKeys(w, sw, box, [{ key: FINALE.key, words: FINALE.words, id: 'key:return', right: true }], { top: sw.rowAt(box.y, footRow) });
  finish(w);
  if (onClose) noteAction(box, onClose);
  return box;
}
