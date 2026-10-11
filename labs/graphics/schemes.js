// The controls' mode (SX, 2026-10-07: «давай переключать управление в меню паузы два варианта "клавиатура + клик в кнопки " "мышь +
// хоткейс"»; src/controls.js has his words whole): GAMEPLAY's CONTROLS row picks one, kept in this browser with the other GAMEPLAY
// settings; a new pilot's is KEYS + CLICKS.
//   K  KEYS + CLICKS    the keys fly; the mouse leans the parallax and clicks what the screen shows (labs/graphics/input-router.js
//                       gives it no gesture of the flight); the keyboard's focus stands while the pointer rests (`keysOnly`)
//   M  MOUSE + HOTKEYS  the mouse alone flies; every other action by its key or a click; no key flies but Space, the jump
// Until then the game saw which hands played (AUTO, MK at the start, K or M after 20 s of one hand) and the scheme changed the hints
// only; a kept AUTO, K or MK reads as K, a kept M as M, and the browser keeps the new value from then on (src/controls.js fitScheme).
//
// The pointer in KEYS + CLICKS: the mouse moved, it is the mouse's (hover, clicks); once it has faded by its own rule (unmoved in open
// flight, over nothing that answers a click: labs/graphics/cursor.js) it sleeps, and the keys' focus may park it (the nose's, the map's
// middle: labs/graphics/key-focus.js). Every keycap shows its letter in both modes (SX, 2026-10-06: «в режиме мышки кнопки клавиатурных
// шорткатов не убирать»).
import { fitScheme } from '../../src/controls.js';
import { readGameplay, writeGameplay } from './gameplay-settings.js';
import { cursorFaded } from './cursor.js';

export const readScheme = (store) => fitScheme(readGameplay(store).controls);
export const writeScheme = (scheme, store) => writeGameplay({ controls: fitScheme(scheme) }, store);

// `game` the page's (main.js): its pointer is read when a function runs.
export function createSchemes(game, store = game.saveBackend) {
  const kept = readGameplay(store).controls;
  let mode = fitScheme(kept);
  // A choice kept before the two modes (AUTO, MK) is kept as the mode it reads as.
  if (kept !== undefined && kept !== mode) writeScheme(mode, store);
  const resting = (p) => !p || !p.inside || !!p.parked;
  return {
    // The mode: 'K' or 'M'.
    scheme: () => mode,
    // The help's page and the room's plate read it.
    hints: () => mode,
    // Which hand flies the ship.
    keysFly: () => mode !== 'M',
    mouseFlies: () => mode !== 'K',
    // The keyboard's focus stands: KEYS + CLICKS, the pointer asleep or parked by the keys (labs/graphics/notices.js and key-focus.js).
    keysOnly: () => mode === 'K' && resting(game.pointer),
    pref: () => mode,
    setPref(scheme) {
      mode = fitScheme(scheme);
      writeScheme(mode, store);
    },
    // Once a frame (`now` the frame's, ms), before the keys' focus: whether a pointer faded by its own rule is to sleep (KEYS + CLICKS).
    rests: (pointer, now) => mode === 'K' && cursorFaded(pointer, now),
  };
}
