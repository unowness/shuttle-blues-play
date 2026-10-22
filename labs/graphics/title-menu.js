// What the title's menu does with a choice (labs/graphics/title-final.js draws it and binds its keys and pointer: bindTitleMenu), cut from
// labs/graphics/main.js (PLAN D4, toward createGame): CONTINUE flies the save; NEW GAME flies a new pilot, and over a save asks first, as
// Cmd+Backspace does (the save goes on a second choice within ERASE_WINDOW s, and the page starts afresh); SETTINGS opens the pause's settings
// in their window over the title (labs/graphics/pause.js settings); MANUAL and CREDITS are not written yet. `game`: the page's parts (`sound`), read when a function runs; `titleFinal`: the title's state (`save`: there is a game to
// CONTINUE; `message`: the line it says); `start()`: the flight begins; `erase()`: the save goes and the page reloads (save-keeper.js).
import { ERASE_WINDOW } from './save-keeper.js';

export function createTitleMenu({ game, titleFinal, start, erase, clock = () => performance.now() }) {
  let newAskedAt = -Infinity;
  // A press on the title wakes the score when the browser is holding the sound back (Firefox and Chrome until the page is
  // pressed; SX, 2026-10-02: «нет музыки на титульном скрине»): inside the gesture, so the score begins under the title, and the
  // press is still the menu's (it moves the choice or chooses). True when it woke it.
  function wake() {
    const { sound } = game;
    if (!sound.enabled || !sound.held) return false;
    sound.unlock();
    return true;
  }
  function choose(id) {
    const now = clock();
    if (id === 'continue' || (id === 'new' && !titleFinal.save)) { start(); return; }
    if (id === 'settings') { game.pause.settings.open(); return; }
    if (id === 'new') {
      if (now / 1000 - newAskedAt <= ERASE_WINDOW) { erase(); return; }
      newAskedAt = now / 1000;
      titleFinal.message = { text: "ERASE SAVE? / SELECT NEW GAME AGAIN", at: now };
      game.sound.play('refuse');
      return;
    }
    titleFinal.message = { text: `${id === 'manual' ? 'MANUAL' : 'CREDITS'}  /  UNAVAILABLE`, at: now };
    game.sound.play('blip');
  }
  return { wake, choose };
}
