// The game's page (index.html, game mode) and the lab's (labs/graphics/index.html, with the drawer): the browser's side. It hands the page's own
// objects to createGame (labs/graphics/game.js), which makes the page's parts in order (the renderer, the world, the save, the sound, the screens),
// the title and the boot, and starts the frame loop. It began on 2026-09-25 as the lab's copy of the old src/main.js; since 2026-09-29 it is the
// game's entry, and src/main.js is gone. Cut on 2026-10-04 (chat F, PLAN D4 in part) so the roadmap's chats each own a file, and on 2026-10-09
// (PLAN D4) into leaves, the body at last into game.js: this file hands it the browser's `window`, `document` and `location`, the clock, the
// dice, the loop's schedule, the storage, the tabs' channel and `fetch`, which game.js reads through `env` and by no other way, so a game can
// be made from another browser's objects.
import { createGame } from './game.js';

createGame({
  window,
  document,
  location,
  now: () => performance.now(),
  random: () => Math.random(),
  requestAnimationFrame: (next) => requestAnimationFrame(next),
  storage: () => globalThis.localStorage,
  BroadcastChannel: globalThis.BroadcastChannel,
  fetch: (...args) => globalThis.fetch(...args),
  base: import.meta.url,
});
