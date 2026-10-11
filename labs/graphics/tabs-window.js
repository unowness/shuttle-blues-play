import { TAB_WINDOWS } from '../../src/tabsPanel.js';
import { NOTICE_KINDS } from './notice.js';
import { noteAction } from './clicks.js';
import { swiss, SWISS, W, Q } from './swiss.js';
import { placeWindow, sheet, headRow, footKeys } from './swiss-window.js';
import { ledger, finish, len } from './ledger.js';

// The window about two tabs on one save (src/tabs.js, the words in src/tabsPanel.js), in the Swiss manner since SX's S9 of labs/graphics/sketches/
// windows-swiss-2.html (2026-10-09; the kit, labs/graphics/swiss.js, the chrome, labs/graphics/swiss-window.js): the head the title after its kind's mark in
// the kind's ink (the quest plates' way: the held tab's danger is the one place it says so) and TWO TABS quiet at the right, a rule, the lines that say
// what is going on in white, then, a blank row on, the status that says what happens now, and, where there is a key to leave by, a rule and the key as the
// cockpit's keycap, which a click presses (labs/graphics/clicks.js). The status breathes while it waits for a key, and while the newer tab waits for the
// older one to close three dots run after it (the room for them kept, so the line does not move as they come); both hold still under reduced motion.
// `onClick`: what a click anywhere on the window does (the clear one plays on). Placed as every Swiss window is (swiss-window.js placeWindow). Returns the
// window's box.
const TAB_WINDOW = Object.freeze({ cols: 52, dots: 0.45, breath: Object.freeze({ period: 2.4, low: 0.5 }) });

// Where it stands and what it holds: the window's box, and the rows its parts stand on.
function layoutOf(r, name) {
  const state = TAB_WINDOWS[name], sw = swiss(r), { I } = sw;
  const key = /^\[([^\]]+)\]\s*(.*)$/.exec(state.key ?? '');
  const statusRow = state.lines.length + 1, bodyRows = statusRow + 1;
  const footRow = key ? SWISS.headGap + bodyRows + SWISS.footRows : null;
  const bw = Math.round(2 * I + TAB_WINDOW.cols * sw.cw);
  const bh = footRow !== null ? sw.heightWithKeys(footRow) : sw.boxHeight(SWISS.headGap + bodyRows - 1);
  const at = placeWindow(r, bw, bh);
  return { state, sw, key, statusRow, footRow, box: { x: at.x, y: at.y, w: bw, h: bh } };
}

export function tabWindowRect(r, name) {
  return layoutOf(r, name).box;
}

export function drawTabsWindow(r, name, { age = 1e6, reducedMotion = false, onClick = null } = {}) {
  const { state, sw, key, statusRow, footRow, box } = layoutOf(r, name), w = ledger(r, { id: 'tabs' });
  const kind = NOTICE_KINDS[state.kind] ?? NOTICE_KINDS.news, L = box.x + sw.I, bodyAt = (k) => sw.rowAt(box.y, SWISS.headGap + k);
  sheet(sw, box, footRow);
  headRow(sw, box, [{ runs: [[state.mark, kind.ink], [' ', W], [state.title, W]] }], [['TWO TABS', Q]]);
  state.lines.forEach((s, k) => sw.text(s, L, bodyAt(k), W));
  // The status: it breathes while it waits for a key (clear), and the dots run while the other tab is waited for.
  const breath = TAB_WINDOW.breath;
  const alpha = state.breathes && !reducedMotion ? breath.low + (1 - breath.low) * (0.5 + 0.5 * Math.cos(age * 2 * Math.PI / breath.period)) : 1;
  const ink = state.breathes || state.waiting ? W : kind.ink, top = bodyAt(statusRow) + sw.m.textY, origin = L - sw.m.capLeft;
  w.r.text(state.status, origin, top, ink, alpha);
  if (state.waiting) w.r.text('.'.repeat(reducedMotion ? 3 : 1 + Math.floor(age / TAB_WINDOW.dots) % 3), origin + len(state.status) * sw.cw, top, ink, alpha);
  if (key) footKeys(w, sw, box, [{ key: key[1], words: key[2], id: 'key:leave', right: true }], { top: sw.rowAt(box.y, footRow) });
  finish(w);
  if (onClick) noteAction(box, onClick);
  return box;
}
