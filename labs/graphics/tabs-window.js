import { TAB_WINDOWS } from '../../src/tabsPanel.js';
import { noteAction } from './clicks.js';
import { Win, INK, SIZES, len } from './organism.js';

// The window about two tabs on one save (src/tabs.js, the words in src/tabsPanel.js), on the organism since SX's sketch W-ORG R8 (2026-10-16,
// labs/graphics/organism.js; before it his S9 of labs/graphics/sketches/windows-swiss-2.html): a dialog the ladder's XS wide (480), as tall as its words.
// The head the title after its kind's mark, the mark in the red of a warning (the held tab's danger, the other tab's refusal) or the interface's blue
// (the way clear); the head's TWO TABS went (the window says what it is). The lines that say what is going on in white, then, a blank row on, the status
// that says what happens now in the label's gray, and, where there is a key to leave by, the foot with it in its right corner, which a click presses
// (labs/graphics/clicks.js). The status breathes while it waits for a key, and while the newer tab waits for the older one to close three dots run after
// it (the room for them kept, so the line does not move as they come); both hold still under reduced motion. `onClick`: what a click anywhere on the
// window does (the clear one plays on). Returns the window's box.
const TAB_WINDOW = Object.freeze({ size: 'XS', dots: 0.45, breath: Object.freeze({ period: 2.4, low: 0.5 }) });
const MARK_INK = Object.freeze({ danger: INK.red, refusal: INK.red, gain: INK.blue, news: INK.blue });

// Where it stands and what it holds: the window, and the rows its parts stand on.
function layoutOf(r, name) {
  const state = TAB_WINDOWS[name], key = /^\[([^\]]+)\]\s*(.*)$/.exec(state.key ?? '');
  const win = new Win(r, { size: [SIZES[TAB_WINDOW.size][0], null], id: 'tabs' }), p = win.p, statusRow = state.lines.length + 1;
  win.fit(p.yb(statusRow), { foot: !!key }).place();
  return { state, win, key, statusRow };
}

export function tabWindowRect(r, name) {
  return layoutOf(r, name).win.box;
}

export function drawTabsWindow(r, name, { age = 1e6, reducedMotion = false, onClick = null } = {}) {
  const { state, win, key, statusRow } = layoutOf(r, name), p = win.p;
  win.sheet();
  win.head([[`${state.mark} `, MARK_INK[state.kind] ?? INK.blue], [state.title, INK.text]]);
  state.lines.forEach((s, k) => win.text(s, p.cx, p.y(k), INK.text));
  // The status: it breathes while it waits for a key (clear), and the dots run while the other tab is waited for.
  const breath = TAB_WINDOW.breath;
  const alpha = state.breathes && !reducedMotion ? breath.low + (1 - breath.low) * (0.5 + 0.5 * Math.cos(age * 2 * Math.PI / breath.period)) : 1;
  const Y = p.y(statusRow), m = win.m, origin = p.cx - m.capLeft;
  r.text(state.status, origin, Y - m.capTop, INK.label, alpha);
  if (state.waiting) r.text('.'.repeat(reducedMotion ? 3 : 1 + Math.floor(age / TAB_WINDOW.dots) % 3), origin + len(state.status) * win.cw, Y - m.capTop, INK.label, alpha);
  if (key) win.foot([{ key: key[1], words: key[2], id: 'key:leave' }]);
  if (onClick) noteAction(win.box, onClick);
  return win.box;
}
