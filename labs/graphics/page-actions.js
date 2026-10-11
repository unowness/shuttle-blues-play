// What the pause's rows, the router's keys and the notices do to the page itself, cut from labs/graphics/main.js (PLAN D4, toward createGame): the
// ship flown takes its drawing (`applyModel`), the display's filter and the sound switched (`toggleCrt`, `toggleSound`), the pointer worn
// (`applyCursor`, `followCursor`, `nextCursorChoice`) and the look put on (`putOnLook`). They are the page's, not a screen's: V, O, K, a row of the
// pause's GRAPHICS and SETTINGS, a find's notice and the pilot card's L all reach them through `game` (labs/graphics/pause.js, input-router.js,
// notices.js, screens.js, lab-drawer.js).
//
//   Object.assign(game, createPageActions(game));       right after `game` is made; `followCursor` is the frame's and the boot's, handed on
//
// `game`: the page's parts, read when a function runs (the world, the notices, the pointer and the ship's scale are made after this): `world`, `renderer`,
// `crt`, `sound`, `notices`, `saveBackend`, `shade`, `shipScale`, `pointer`, `canvas`, `pointerAsked`, `persist`. `env.root`: the element whose custom
// properties are the page's colours (the document's, by default); the name field and the lab drawer read them.
import { CONFIG } from '../../src/config.js';
import { ROLES } from '../../src/roles.js';
import { installLook } from '../../src/looks.js';
import { takeModel } from '../../src/visualScale.js';
import { writeDisplayMode, DISPLAY_LABELS } from '../../src/display.js';
import { writeSoundPreference } from '../../src/audio.js';
import { cursorLabel } from './cursor.js';
import { QUEST_LINES as QL } from '../../src/questLines.js';

// The page's own colours (the pilot's name field, the lab drawer) wear the game's grade too, and so the look worn (src/looks.js): they are
// set again when it changes. `shade` is the grade (src/grade.js), or the identity where the lab shows the colours as written.
export function paintPageColours(root, shade) {
  for (const [name, value] of Object.entries({
    space: ROLES.space, backing: ROLES.backing, structure: ROLES.structure,
    'text-primary': ROLES.textPrimary, 'text-secondary': ROLES.textSecondary,
    active: ROLES.interactionActive, focus: ROLES.focus,
  })) root.style.setProperty(`--color-${name}`, shade(value));
}

export function createPageActions(game, env = {}) {
  const root = () => env.root ?? document.documentElement;

  // The ship flown takes its drawing: at the boot, and when the hangar changes ships (src/visualScale.js takeModel).
  function applyModel(model) {
    takeModel(model, game.shipScale, game.world.ship, game.renderer);
  }

  // A display setting, open from every screen: none of them uses V.
  function toggleCrt(mode = null) {
    const { crt, renderer, world, sound, notices, saveBackend } = game;
    if (!crt.available) { notices.toast(`display filters unavailable (${crt.error || 'no 2d canvas'})`, 'refusal'); return; }
    const was = crt.mode;
    if (mode) crt.setMode(mode); else crt.next();
    // A very large canvas is too dear for the filters' copies (CONFIG.crt.maxPixels): its pixel ratio gives way while one is on.
    renderer.setPixelBudget(crt.enabled ? CONFIG.crt.maxPixels : Infinity);
    world.ship.measureDrawing(renderer.cellW, renderer.cellH);
    writeDisplayMode(crt.mode, saveBackend);
    if (crt.mode !== was) sound.play(crt.enabled ? 'crtOn' : 'crtOff');
    notices.toast(`display ${DISPLAY_LABELS[crt.mode].toLowerCase()}`, 'news', { fate: 'gone' });
  }

  // O: sound off and on again, remembered in this browser.
  function toggleSound() {
    const { sound, notices, saveBackend } = game;
    const on = sound.setEnabled(!sound.enabled);
    writeSoundPreference(on, saveBackend);
    if (on) { sound.unlock(); sound.play('soundOn'); }
    notices.toast(`sound ${on ? 'on' : 'off'}`, 'news', { fate: 'gone' });
  }

  // The mouse leans the world (labs/graphics/depth.js, CONFIG.depth) and the game draws its own pointer
  // (labs/graphics/cursor.js): the one the pilot wears (src/cursors.js, Pilot.cursor), K the next one owned (a key kept by SX's
  // word, 2026-10-03); `?cursor=C1` (or C0, the system's) shows one without wearing it, until K.
  function applyCursor(code) {
    game.pointer.code = code;
    // The page's cursor names stay as the hints the drawn pointer reads; the stylesheet hides the system's (lab.css).
    game.canvas.classList.toggle('drawn-cursor', code !== 'C0');
  }
  // Each frame: the pointer worn, as the save has it (a save loaded, a pointer given and put on).
  function followCursor() {
    const { pointer, canvas, world } = game;
    const code = game.pointerAsked ?? world.pilot.cursor;
    if (pointer.code !== code || canvas.classList.contains('drawn-cursor') !== (code !== 'C0')) applyCursor(code);
  }
  function nextCursorChoice() {
    const { world, notices } = game;
    game.pointerAsked = null;
    const code = world.pilot.wearCursor(world.pilot.nextCursor());
    applyCursor(code);
    // A cursor put on is seen (the pointer is it): gone; none to put on is an answer to the key: the notch says it.
    notices.toast(world.pilot.cursors.size ? `cursor applied / ${cursorLabel(code).toLowerCase()}` : QL.banner.moreCursors().toLowerCase(), 'news',
      { fate: world.pilot.cursors.size ? 'gone' : 'flip' });
    game.persist('cursor');
  }

  // The look the pilot wears (src/looks.js) goes on the grade; the page's colours follow it.
  function putOnLook() {
    installLook(game.world.pilot.look);
    paintPageColours(root(), game.shade);
  }

  return { applyModel, toggleCrt, toggleSound, applyCursor, followCursor, nextCursorChoice, putOnLook };
}
