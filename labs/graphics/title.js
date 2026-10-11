// The title's state and words (labs/graphics/main.js runs it; title-final.js draws the title SX set on 2026-10-02): whether the load
// behind it is done (advanceTitle), the story (STORY), the four control groups under the loader (ESSENTIALS), which keys play on
// (isPlayKey). The old title itself (its layout, lettering, loader and key binding: Codex's revision 19, in the game 2026-10-01 to
// 2026-10-02) was deleted with its checks by SX's word (PLAN D2, 2026-10-04); its sky (drawTitleSky), the title-only scenery
// (title-scenery.js) and the styles' sketch that still drew them went the same night (SX: «да, удали оба»).

import { codesOf, codeName, keyText, keyName } from '../../src/controls.js';

// Condensed at SX's request. The four-paragraph original remains in archive/title-v2/.
export const STORY = Object.freeze([
  'The year is 3000 . . .',
  'Meteor showers have devastated the first settlers’ stations on the edge of settled space. Those who remain struggle to keep the sector running.',
  'You’ve inherited an old shuttle and a small garage. Haul food, spare parts and seedlings to earn a living and bring back the shipyards, the dock lights and the gardens under glass, one delivery at a time.',
  'Helping each other is all that holds this world together.',
]);
// The keys' names are the bindings table's (src/controls.js, chat C): the four flight keys by their first and second keys
// ('WASD / ↑ ← ↓ →'), the brake, fire and the controls list.
const FLY_KEYS = ['thrust', 'turnLeft', 'retro', 'turnRight'];
export const ESSENTIALS = Object.freeze([
  [`${FLY_KEYS.map((id) => codeName(codesOf(id)[0])).join('')} / ${FLY_KEYS.map((id) => codeName(codesOf(id)[1])).join(' ')}`, 'FLY'],
  [keyText(['brake']), 'BRAKE'], [keyText(['fire']), 'FIRE'], [keyName('help'), 'CONTROLS'],
]);

// `show`: draw the title (the game), or start straight away (the lab).
export function createTitle({ show = true, reducedMotion = false } = {}) {
  return { show, active: true, ready: false, progress: 0, label: '', reducedMotion, readyAt: null };
}

// A key that plays on: any key but a modifier that only prepares a shortcut (Cmd, Ctrl and Alt on their own; F1 to F12): reloading
// the page or switching windows is not a keypress meant for the game. Shift and Escape are not keys either: a browser does not count
// them as a user activation, so a flight started with one of them would have no sound until the next key (design review, 2026-09-30).
const NOT_A_KEY = /^(Control|Alt|Meta|OS|CapsLock|NumLock|ScrollLock|Fn|FnLock|ContextMenu|Shift|Escape|F\d{1,2})(Left|Right)?$/;
// The same by a key's code alone (the game's Input keeps codes): the window about two tabs plays on with one.
export const isPlayKey = (code) => !NOT_A_KEY.test(code || '');

// One frame of the title's own state, from how far the load has got. `start` says the
// flight should begin now: the lab has no title, so it goes in as soon as it is loaded.
// The game stays where it is until a key or a click (title-final.js bindTitleMenu).
export function advanceTitle(title, plan, now = 0, reducedMotion = false) {
  title.progress = plan.progress;
  title.label = plan.label;
  title.reducedMotion = reducedMotion;
  const becameReady = plan.done && !title.ready;
  if (becameReady) { title.ready = true; title.readyAt = now; }
  return { becameReady, start: title.ready && !title.show };
}

export function wrapCopy(text,cols) {
  const lines=[]; let line='';
  for(const word of text.split(' ')) {
    if(line && line.length+word.length+1>cols) { lines.push(line); line=''; }
    line+=(line?' ':'')+word;
  }
  if(line) lines.push(line);
  return lines;
}
