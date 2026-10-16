// The window when the boss TOLLKEEPER is beaten (src/bossQuest.js, the event bossQuestDone): the main game is done, how far the collection is
// gathered, and the way back (SX, 2026-10-14: «после победы тебе должен встретить поп-ап о том что основная игра пройдена, показать на сколько
// собраны твои коллектаблс и должна быть кнопка "вернуться в открытый космос"»). On the organism since SX's sketch W-ORG R9 (2026-10-16,
// labs/graphics/organism.js): a dialog the ladder's XS wide (480), as tall as its words. The head says what happened at the left, its mark in the red,
// and what it means at the right, its mark in the interface's blue; a line on what it means; the collection as the pilot card has it (src/pilot.js
// journey), each part its name and its count over its row of squares; the LEGACY, the share of it all; the foot RETURN TO OPEN SPACE, which a click
// (on it or anywhere on the window) presses. Like every pop-up it does not pause the flight. Returns the window's box.
import { journey } from '../../src/pilot.js';
import { UI } from '../../src/uiGrid.js';
import { noteAction } from './clicks.js';
import { Win, ORG, INK, SIZES } from './organism.js';

export const FINALE = Object.freeze({
  size: 'XS', title: 'TOLLKEEPER DOWN', right: 'MAIN GAME COMPLETE',
  line: 'THE ROUTES ARE FREE. SPACE STAYS OPEN.', share: 'LEGACY', key: 'ENTER', words: 'RETURN TO OPEN SPACE',
});

// A share as its name, its count at the column's right and its row of squares under them. Returns the squares' bottom.
function shareRow(win, p, Y, name, count, share, countInk = INK.label) {
  win.text(name, p.cx, Y, INK.label);
  win.text(count, p.cxr, Y, countInk, { right: true });
  return win.squares(Y + win.cap + ORG.under, share, { x0: p.cx, x1: p.cxr });
}
// The content's height, px from its first capitals: the line, then each part (its name and its squares, a row's step between), then the legacy.
const partH = (win) => win.cap + ORG.under + ORG.square;

function layoutOf(r, world) {
  const j = journey(world), win = new Win(r, { size: [SIZES[FINALE.size][0], null], id: 'finale' }), p = win.p;
  const first = p.y(p.next(p.yb(0))), legacy = first + j.rows.length * (partH(win) + UI.row - win.cap) - (UI.row - win.cap) + ORG.C;
  win.fit(legacy + partH(win)).place();
  return { j, win };
}

export function finaleRect(r, world) { return layoutOf(r, world).win.box; }

export function drawFinaleWindow(r, world, { onClose = null } = {}) {
  const { j, win } = layoutOf(r, world), p = win.p;
  win.sheet();
  win.head([['! ', INK.red], [FINALE.title, INK.text]], { meta: [{ runs: [['+ ', INK.blue], [FINALE.right, INK.label]] }] });
  win.text(FINALE.line, p.cx, p.y(0), INK.text);
  let y = p.y(p.next(p.yb(0)));
  for (const row of j.rows) y = shareRow(win, p, y, row.label, `${row.have}/${row.of}`, row.have / Math.max(1, row.of)) + (UI.row - win.cap);
  shareRow(win, p, y - (UI.row - win.cap) + ORG.C, FINALE.share, `${Math.round(j.progress * 100)}%`, j.progress, INK.text);
  win.foot([], [{ key: FINALE.key, words: FINALE.words, id: 'key:return' }]);
  if (onClose) noteAction(win.box, onClose);
  return win.box;
}
