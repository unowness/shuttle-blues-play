// The input router, cut from labs/graphics/main.js (PLAN D4 in part, chat F, 2026-10-04): the keys and the mouse to what they
// do. Its bindings are src/controls.js's (chat C, 2026-10-04: the one table of every action; since 2026-10-07 in two modes, SX's KEYS +
// CLICKS and MOUSE + HOTKEYS, labs/graphics/schemes.js); the flight's own verbs (thrust, retro, turn, brake, fire) are read by
// src/input.js and labs/graphics/mouse-flight.js, and the mode says which of the two flies (`hands`): in KEYS + CLICKS the mouse leans
// the parallax and clicks, never a gesture of the flight; in MOUSE + HOTKEYS no key flies the ship but Space, the jump. The lab's
// workshop keys are the lab's own (labs/graphics/lab-keys.js, `game.labKeys`), off the game's frame.
//
// What a key does on a screen is the screen's (labs/graphics/screens.js, which reads KEYS through `tapped`, and says which screen
// takes the frame's keys); this file asks it, else sends them to the flight's keys (flightKeys), and turns the pointer's events into the same
// actions (a click on a menu's key presses that key for a frame: labs/graphics/clicks.js). `game` is the page's (main.js), read
// when a function runs.
import { CONFIG } from '../../src/config.js';
import { menuOpen } from '../../src/interaction.js';
import { questBoardHit, clickQuestBoard } from './quest-list.js';
import { writeLegendPreference, legend } from './locator.js';
import { toggleRadio } from './radio.js';
import { toggleTracker } from './tracker.js';
import { radioFitted } from '../../src/opening.js';
import { aimLean, leaveLean } from './depth.js';
import { cursorMove, cursorLeave, cursorDown, cursorUp } from './cursor.js';
import { kickToward } from './ship-kick.js';
import { targetAt } from './world-pointer.js';
import { keyAt, actionAt } from './clicks.js';
import { itemUnder } from '../../src/hover.js';
import { mouseControls, pressRight, pressLeft, releaseLeft, wheelUp } from './mouse-flight.js';
import { groupAt, beginDrag, moveDrag, endDrag } from './hud-place.js';
import { mapPress, mapRelease, mapWheel } from './map-screen.js';
import { KEYS, codesOf, codesIn, stuntPair } from '../../src/controls.js';
import { clamp } from '../../src/util.js';

// Every action of the keyboard outside the flight's verbs, and its keys (KeyboardEvent.code), first key first: src/controls.js,
// the one bindings table (chat C, common rule 12). An action read on several screens is one action (`back` is Escape on every screen;
// `close` is 0). Two actions may share a key where they never meet (the table names each share): Q is the jump in flight and the
// map's zoom out on the map; L opens the sign and, in the composer, leaves it.
export { KEYS };

// Whether `action` was pressed this frame (any of its keys), and whether one of its keys is held.
// An action with no key (the lab's respawn, a drawer button) is never pressed.
const NONE = Object.freeze([]);
export const tapped = (input, action) => (KEYS[action] ?? NONE).some((code) => input.tapped(code));
export const held = (input, action) => input.held(...(KEYS[action] ?? NONE));
// The `i`th choice (0 the first: key 1) pressed this frame.
export const tappedChoice = (input, i) => i < KEYS.choices.length && input.tapped(KEYS.choices[i]);
// Whether one of `codes` is held or was pressed this frame.
function heldOrTapped(input, codes) {
  for (let i = 0; i < codes.length; i++) if (input.held(codes[i]) || input.tapped(codes[i])) return true;
  return false;
}
// The keys of MOUSE + HOTKEYS: none flies the ship (its Space, the jump, read with the trick's).
const NO_KEYS = Object.freeze({ thrust: false, retro: false, turn: 0, damp: false, fire: false, driftTurn: 0 });

export function createInputRouter(game) {
  const { input } = game;
  const key = (action) => tapped(input, action);

  // The keys of plain flight, with no screen open.
  function flightKeys() {
    const { world, sound } = game, screens = game.screens, open = screens.open, pause = game.pause;
    // The keys that open a screen first (labs/graphics/screens.js openKeys: at most one a frame, and the one that opens ends the
    // frame's keys). A menu's number, which may open the hangar or INFO, counts only when none did.
    if (screens.openKeys()) return;
    // G turns the bearing to the home garage on and off (GARAGE_QUESTS_HANDOFF.md step 2; its dish sends rings while on).
    if (key('homeGuide')) world.homeGuide = !world.homeGuide;
    // R attaches the keys to the quest list (labs/graphics/key-focus.js), which then holds ↑ ↓, Enter and Escape. (The locator's legend
    // covered the quests and the radio, and R or T folded it away, until the quests went to the other side from the locator, 2026-10-08:
    // it covers the shelf under the scope now, locator.js legendCovers.)
    const listTook = game.keyFocus?.questKeys(key) ?? false;
    if (key('banner') && !listTook) game.notices.confirm();
    // Escape is the pause's too (SX, 2026-10-02: «надо паузу кнопки escape»): under the pause it steps back from a page, then
    // plays on; in flight it pauses once nothing else it closes is open (the controls list, an object's menu; a berth's menu is
    // never closed, so docked it pauses).
    const pausedNow = pause.state.keyPause && world.paused;
    // A talk's beat standing (labs/graphics/talk-beat.js) takes Escape and 0 as its LATER, docked too, where its menu stays (a berth's must): its
    // foot says ESC LATER (SX's organism, 2026-10-16: the way back the foot's first key). It pauses no more than a menu's close does.
    const later = !open.help && !pausedNow && !listTook && !!game.beat?.standing() && (key('back') || key('close'));
    if (later) game.beat.later();
    const escape = !later && key('back') && !listTook && !open.help && (pausedNow || world.docked || !menuOpen(world.selected, game.menu.closed, world.docked));
    if (escape && pausedNow && pause.menu.page !== 'main') pause.leavePausePage();
    else if (escape && !open.help) pause.press(pausedNow);
    // The workshop's keys (H, R), the lab's only (labs/graphics/lab-keys.js); the game has none.
    game.labKeys?.();
    if (key('legend')) {
      sound.play('blip');
      legend.hidden = !legend.hidden;
      writeLegendPreference(legend.hidden, game.saveBackend);
    }
    // T (or a click on its row) hides the radio under the quests to its row and shows it again, once the opening has given it.
    if (key('radio') && game.radio && radioFitted(world)) {
      sound.play('blip');
      toggleRadio(game.radio);
    }
    // B (or a click on its button) hides the ruins' tracker's rows and shows them again; with no ruin begun there is nothing drawn to answer.
    if (key('tracker') && game.tracker?.rows.length) {
      sound.play('blip');
      toggleTracker(game.tracker);
    }

    // Contextual actions, the one way the keys act on a station or a ship (SX, 2026-10-07: «и со станциями, и с кораблями всё делается
    // только через их контекстное окно вблизи»). Edge-triggered, so holding a number does not repeat,
    // and only while a menu is actually on screen. One action a frame; its tick
    // plays when it ran, a refusal has its own sound (the world's actionRefused event).
    if (menuOpen(world.selected, game.menu.closed, world.docked) && !open.help) {
      for (let i = 0; i < CONFIG.interaction.maxActions; i++) {
        if (!tappedChoice(input, i)) continue;
        if (world.runAction(i)) sound.play('menu');
        break;
      }
    }
    // A docked ship's menu is its way out, so Esc and 0 do not dismiss it (SX, 2026-10-02: «Когда ты докнулся в станцию нет
    // способа вылететь из нее»: a dismissed menu stayed dismissed for as long as the ship was held, since the selection
    // cannot change while docked). The menu does not draw a CLOSE row then (labs/graphics/context.js).
    if (key('close') || (key('back') && !escape && !listTook)) {
      if (open.help) screens.closeHelp(); else if (!world.docked) game.menu.closed = true;
    }
    // And the way out that needs no menu: a fresh press of the forward thrust leaves a berth, as UNDOCK does (a held key
    // does not: the one that flew in may still be down when DOCK is chosen). It is read here and not in the world's step,
    // so a pop-up that lets the controls go, a typed word, never undocks. Not in MOUSE + HOTKEYS, where no key flies: there the berth's
    // menu row (its click, or its number) is the way out.
    if (!open.help && (game.schemes?.keysFly() ?? true) && key('undock') && world.leaveStation()) sound.play('menu');
  }

  // The frame's keys: the two-tabs window's, the page's settings, then the screen that is open (labs/graphics/screens.js, which
  // says which), or flight.
  function gameKeys() {
    const screens = game.screens, open = screens.open;
    if (screens.tabsKeys()) return;
    if (key('display')) game.toggleCrt();
    if (key('sound')) game.toggleSound();
    if (game.pause.seen.looks === null) game.pause.markSeen();
    // K is the card's COCKPIT key while the card is open (a click on its [K] did both).
    // K (the next pointer) is kept by SX's word (2026-10-03), not a try-out key to be taken out. (J, the next interface shadow, went with
    // the shadow's styles on 2026-10-06: src/textShadow.js.)
    if (key('nextCursor') && !open.pilot) game.nextCursorChoice();
    // ← → on the pause's row the pointer is on (its own or the keys'): a choice, a switch or a level changes at once (labs/graphics/pause.js).
    if (game.pause.keys(key)) return;
    // The keyboard's focus in the windows (the new layout): the pause's rows, the room's things, the map's middle; Enter clicks there.
    if (game.keyFocus?.windowKeys(key)) return;
    if (!screens.screenKeys()) flightKeys();
  }

  // ------------------------------------------------------------------------------------------------------------ the mouse

  // Only the charm, where it hangs now (its picture as the last frame drew it, labs/graphics/charm.js), answers the pointer, and not while
  // the legend stands over its place: the kind it is, else null.
  function charmAt(x, y) {
    const c = game.charm, b = c.box;
    return !game.hudCovered && c.shown && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h ? c.id : null;
  }
  const UI_TONES = Object.freeze(['menu', 'blip', 'panelOpen', 'panelClose']);
  let pressHushed = false;
  // What a press sounds like, by what it lands on (src/audio.js, SX: «в разных сущностях должны быть разного типа щелчки»): every
  // menu's item, an object's menu's too, and every button of the interface the system's click (SX, 2026-10-03: «на пункты меню
  // нажимания ... нужен системный щелчок, вот это наш базовый звук»; an object's menu had the warm `clickDialog`, kept for the
  // conversations to come), a find's notice, a plate (the cargo's, the quest list's), and over open space the worn pointer's own.
  const POINTER_TICK = Object.freeze({ C1: 'tick', C2: 'tickRing', C3: 'tickCorners', C4: 'tickDiamond' });
  function pressSound(x, y) {
    const inBox = (b) => !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    if (game.title.active) return 'clickUi';
    if (!game.screens.anyScreen() && inBox(game.notices.currentNoticeRect())) return game.notices.state.notice?.cargo ? 'clickPlate' : 'clickFind';
    if (!game.screens.anyScreen() && inBox(game.notices.taskRect())) return 'clickPlate';
    if (actionAt(x, y) || game.screens.anyScreen() || keyAt(x, y)) return 'clickUi';
    if (questBoardHit(game.questBoard, x, y)) return 'clickPlate';
    if (charmAt(x, y) !== null || itemUnder()) return 'clickUi';
    return POINTER_TICK[game.pointer.code] ?? 'tick';
  }
  const answersClick = (x, y) => {
    const nb = game.notices.currentNoticeRect();
    return !!keyAt(x, y) || !!actionAt(x, y) || !!itemUnder() || charmAt(x, y) !== null || questBoardHit(game.questBoard, x, y)
      || (!!nb && x >= nb.x && x <= nb.x + nb.w && y >= nb.y && y <= nb.y + nb.h);
  };
  // The mouse on the world (labs/graphics/world-pointer.js): a friendly craft or a station under the pointer, where no menu or
  // the interface answers it: its window shows (main.js stepPointed). A click on it does nothing, in either mode (SX, 2026-10-07: «нет убери клик в станцию саму везде только по контекстной меню»): a station or a ship is acted on only through its
  // window's rows up close. In MOUSE + HOTKEYS a press over one is the flight's, as over open space.
  const worldPointAt = (x, y) => (game.title.active || game.labOpen || game.screens.anyScreen() || game.pause.pauseShown() || !game.world.ship.alive || answersClick(x, y)
    ? null : targetAt(game.world, game.renderer, x, y));
  // The flight's keys with some let go to another (the quest list's ↑ ↓ while it holds the keys: labs/graphics/key-focus.js).
  function keysWithout(freed) {
    const only = (id) => codesOf(id).filter((c) => !freed.includes(c));
    return { thrust: input.held(...only('thrust')), retro: input.held(...only('retro')), turn: input.turn, damp: input.damp, fire: input.fire,
      driftTurn: input.driftTurn };
  }
  // GAMEPLAY's STEERING SCREEN (src/steering.js): the four direction keys are one direction on the screen (`aim`), which the world's
  // step makes the turn and the push (src/shipStep.js); none of them is a verb of its own. Space and Shift as ever.
  function screenKeys(freed = []) {
    return { thrust: false, retro: false, turn: 0, driftTurn: 0, damp: input.damp, fire: input.fire, aim: input.aimOf(freed) };
  }
  // The hands this step as the mode has them, before the trick's keys (labs/graphics/schemes.js): the keys alone in KEYS + CLICKS, the
  // mouse alone in MOUSE + HOTKEYS; both on a page with no mode (a check's rig: 'MK'). The engine's sound reads them too.
  function hands() {
    const { world } = game, mode = game.schemes?.scheme() ?? 'MK';
    if (mode === 'M') return mouseControls(game.mouseFlight, NO_KEYS, world, game.renderer);
    const freed = game.keyFocus?.holdsArrows() ? [...codesOf('listUp'), ...codesOf('listDown')] : null;
    const keys = game.steering?.mode === 'screen' ? screenKeys(freed ?? []) : freed ? keysWithout(freed) : input;
    return mode === 'K' ? keys : mouseControls(game.mouseFlight, keys, world, game.renderer);
  }
  // The controls this step: the pilot's own.
  function flyControls() {
    const { world } = game;
    let own = hands();
    // Where the trick is on (the game's J2), Q and E go to the world as held, or tapped within the frame (src/shipStep.js
    // reads a press as the step they first are) as the pair, each side by its own (either jumps, the first pressed; the other plays
    // the figure to its side: SX, 2026-10-05); in MOUSE + HOTKEYS only Space, the jump (src/controls.js mKeys). The mouse's jump and
    // figure (grammar D) have no side. Without the trick the controls are what they always were.
    if (world.stunts?.trick) {
      const mouseMode = game.schemes?.scheme() === 'M', pair = stuntPair(), side = (codes) => codes.some((c) => input.held(c) || input.tapped(c));
      own = { thrust: own.thrust, retro: own.retro, turn: own.turn, damp: own.damp, fire: own.fire, driftTurn: own.driftTurn, aim: own.aim ?? null,
        jump: !!own.jump || (mouseMode && heldOrTapped(input, codesIn('jump', 'M'))), figure: !!own.figure,
        stuntLeft: !mouseMode && side(pair.left), stuntRight: !mouseMode && side(pair.right) };
    }
    return own;
  }

  // The pointer's listeners, in the order the page has always added them (two on one event run in that order, and the last to
  // set the canvas's cursor hint wins).
  function install() {
    const { canvas, renderer, crt, sound, feedback } = game, screens = game.screens, pointer = game.pointer;
    // The pointer in the flat frame's pixels: under the CRT filter the screen shows the frame
    // bent, so a point is taken back through the bend before it is asked about.
    const pointerAt = (event) => crt.unproject(event.offsetX, event.offsetY);
    renderer.canvas.addEventListener('pointermove', event => {
      const p = pointerAt(event);
      const claimed = screens.pointerHint(p.x, p.y);
      if (claimed !== null) { renderer.canvas.style.cursor = claimed; return; }
      // The shelf is under a pop-up's dimming while one is open, and answers nothing there.
      game.souvenirFocus.hover = screens.anyScreen() ? null : charmAt(p.x, p.y);
      const button = game.souvenirFocus.hover !== null || screens.onCardLine(p.x, p.y) || (!screens.anyScreen() && questBoardHit(game.questBoard, p.x, p.y))
        || !!itemUnder();
      renderer.canvas.style.cursor = button ? 'pointer' : '';
    });
    renderer.canvas.addEventListener('pointerleave', () => { game.souvenirFocus.hover = null; });
    canvas.addEventListener('pointermove', (event) => {
      const p = pointerAt(event);
      aimLean(game.lean, renderer, p.x, p.y);
      cursorMove(pointer, p.x, p.y, performance.now());
      game.mouseFlight.x = p.x; game.mouseFlight.y = p.y;
      // A menu's key under the pointer is a button (labs/graphics/clicks.js), and so is an item that sinks under it
      // (src/hover.js) and a notice (a find's opens what it says, the rest go at a click); a station or a ship is not.
      if (!game.title.active && (keyAt(p.x, p.y) || itemUnder())) canvas.style.cursor = 'pointer';
      const nb = !game.title.active && game.notices.state.notice && !screens.anyScreen() ? game.notices.currentNoticeRect() : null;
      if (nb && p.x >= nb.x && p.x <= nb.x + nb.w && p.y >= nb.y && p.y <= nb.y + nb.h) canvas.style.cursor = 'pointer';
    });
    canvas.addEventListener('pointerleave', () => { leaveLean(game.lean); cursorLeave(pointer); });
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const p = pointerAt(event);
      cursorMove(pointer, p.x, p.y, performance.now());
      cursorDown(pointer, performance.now());
      // The interface's own press sounds whatever the pointer worn; over open space the drawn pointer's tick, none for the system's.
      const press = pressSound(p.x, p.y);
      if (pointer.code !== 'C0' || !Object.values(POINTER_TICK).includes(press)) sound.play(press);
      // One press, one sound (SX, 2026-10-03: «нет никаких сухих щелчков ... какие-то просто флопы»): the interface's tones the
      // action plays after the click (a menu's move, a toggle, a panel's opening) are let go till it has done its work.
      if (press === 'clickUi') { sound.hush(UI_TONES, 1.5); pressHushed = true; }
    });
    for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, () => cursorUp(pointer));

    // The mouse flies (labs/graphics/mouse-flight.js), where the mode lets it (MOUSE + HOTKEYS): the left
    // button pressed in open space (a station or a ship under it too) pulls the ship toward the pointer, the right one fires. A press on
    // what answers a click (a menu's key, the quest list, a souvenir) is that click's in either mode, and under a pop-up the mouse is
    // the pop-up's.
    canvas.addEventListener('mousedown', (event) => {
      const { world, mouseFlight } = game;
      if (game.title.active || game.labOpen || screens.anyScreen() || game.pause.pauseShown()) return;
      const p = pointerAt(event);
      mouseFlight.x = p.x; mouseFlight.y = p.y;
      const flies = game.schemes?.mouseFlies() ?? true;
      if (event.button === 2) { if (flies) pressRight(mouseFlight, true, !!world.ship.airborne); }
      else if (flies && event.button === 0 && !answersClick(p.x, p.y)) {
        // (Grammar D's mouse: a second press held is the jump, labs/graphics/mouse-flight.js pressLeft.)
        if (pressLeft(mouseFlight, performance.now() / 1000) === 'pull' && world.ship.alive && !feedback.reducedMotion) {
          const at = world.project(renderer, world.ship.x, world.ship.y);
          kickToward(game.kick, p.x - at.x, p.y - at.y);
        }
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) releaseLeft(game.mouseFlight);
      if (event.button === 2) pressRight(game.mouseFlight, false);
    });
    window.addEventListener('blur', () => { releaseLeft(game.mouseFlight); pressRight(game.mouseFlight, false); });
    // Grammar D's mouse: the wheel turned up in open flight jumps (labs/graphics/mouse-flight.js wheelUp); a window's wheel is its own.
    canvas.addEventListener('wheel', (event) => {
      if (event.deltaY < 0 && (game.schemes?.mouseFlies() ?? true) && !game.title.active && !game.labOpen && !screens.anyScreen() && !game.pause.pauseShown()) {
        wheelUp(game.mouseFlight, performance.now() / 1000);
      }
    }, { passive: true });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    // A click on a menu's key presses it for a frame, as the keyboard would; a click outside the pop-up on top closes it
    // (SX, 2026-10-02: «поп апы закрываются кликом в пространство вне поп апа»). Before the page's own click handlers
    // (capture on the window), which then do not see it. Where the interface's groups stand (labs/graphics/hud-place.js):
    // dragged under P's pause, kept by SAVE LAYOUT.
    const hud = game.hud;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !game.pause.layoutEditing()) return;
      const p = pointerAt(event);
      if (actionAt(p.x, p.y)) return;
      const id = groupAt(hud.boxes, p.x, p.y);
      if (!id) return;
      beginDrag(hud.place, id, p.x, p.y, hud.boxes[id]);
      try { canvas.setPointerCapture(event.pointerId); } catch { /* a pointer that is already gone */ }
    });
    canvas.addEventListener('pointermove', (event) => {
      const p = pointerAt(event);
      if (hud.place.drag) { moveDrag(hud.place, p.x, p.y, renderer.width, renderer.height); canvas.style.cursor = 'grabbing'; return; }
      hud.hover = game.pause.layoutEditing() ? groupAt(hud.boxes, p.x, p.y) : null;
      if (hud.hover) canvas.style.cursor = 'grab';
      if (game.pause.pauseShown() && actionAt(p.x, p.y)) canvas.style.cursor = 'pointer';
    });
    for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => endDrag(hud.place));
    window.addEventListener('click', (event) => {
      // The press's hush lasts the frame or two the click's key takes to run, no longer (a key pressed after it sounds again).
      if (pressHushed) { sound.hush(UI_TONES, 0.15); pressHushed = false; }
      if (event.target !== canvas || event.button !== 0 || game.title.active || game.labOpen) return;
      if (clickOver(pointerAt(event))) event.stopPropagation();
    }, true);
    // The map: the button down on its sectors may start a drag of the picture, up ends it; the wheel zooms about the pointer.
    renderer.canvas.addEventListener('pointerdown', event => {
      if (!screens.open.map || screens.open.help || event.button !== 0) return;
      const p = pointerAt(event);
      mapPress(screens.map, p.x, p.y);
      try { renderer.canvas.setPointerCapture(event.pointerId); } catch { /* a pointer that is already gone */ }
    });
    for (const type of ['pointerup', 'pointercancel']) renderer.canvas.addEventListener(type, () => mapRelease(screens.map));
    renderer.canvas.addEventListener('wheel', event => {
      if (!screens.open.map || screens.open.help) return;
      event.preventDefault();
      const p = pointerAt(event);
      mapWheel(screens.map, p.x, p.y, event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY);
    }, { passive: false });
    // The quest list dragged to a new place (`?placeQuests`, the sheet's editor).
    const questPlace = game.questPlace;
    if (questPlace) {
      renderer.canvas.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || screens.anyScreen()) return;
        const p = pointerAt(event);
        if (!questBoardHit(game.questBoard, p.x, p.y)) return;
        questPlace.drag = { x: p.x, y: p.y, from: questPlace.at ?? questPlace.home, moved: false };
        try { renderer.canvas.setPointerCapture(event.pointerId); } catch { /* a pointer that is already gone */ }
      });
      renderer.canvas.addEventListener('pointermove', (event) => {
        const d = questPlace.drag, p = pointerAt(event);
        if (!d) { if (!screens.anyScreen() && questBoardHit(game.questBoard, p.x, p.y)) renderer.canvas.style.cursor = 'grab'; return; }
        renderer.canvas.style.cursor = 'grabbing';
        const dx = p.x - d.x, dy = p.y - d.y;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        d.moved = true;
        const snap = (v) => Math.round(v / 4) * 4;
        questPlace.at = { x: clamp(snap(d.from.x + dx), 0, renderer.width - 40), y: clamp(snap(d.from.y + dy), 0, renderer.height - 40) };
      });
      renderer.canvas.addEventListener('pointerup', () => { if (questPlace.drag?.moved) questPlace.swallow = true; questPlace.drag = null; });
      renderer.canvas.addEventListener('pointercancel', () => { questPlace.drag = null; });
    }
    renderer.canvas.addEventListener('click', event => {
      if (questPlace?.swallow) { questPlace.swallow = false; return; }
      clickUnder(pointerAt(event));
    });
  }

  // A click at p, in the flat frame's pixels, as the page's two click listeners take it. First what stands over everything (the
  // window's listener, before the page's own): true when it took the click, and nothing under it sees it.
  function clickOver(p) {
    const hud = game.hud, input = game.input;
    // The banners first: they are drawn over every panel (an object's menu under a notice is not what the click is on; chat B,
    // 2026-10-04). The notice and the task slot's banner press, go, then do their one thing (labs/graphics/notices.js).
    if (game.notices.click(p.x, p.y)) return true;
    // The charm hangs over the legend's button's row (SX's C2 ROW), drawn over it: where its picture stands the click is the charm's, not
    // the button's; a pop-up that stands has the click first.
    if (!game.screens.anyScreen() && charmAt(p.x, p.y) !== null) return false;
    const code = keyAt(p.x, p.y);
    if (code) { input.pressed.add(code); return true; }
    const act = actionAt(p.x, p.y);
    if (act) { act(); return true; }
    // Under the pause a click on a group is the drag's, not the group's own (the quest list would cycle).
    if (game.pause.layoutEditing() && groupAt(hud.boxes, p.x, p.y)) return true;
    // ... and a click anywhere else outside its window plays on (SX, 2026-10-03: «Клик вне меню паузы. Закрывает меню паузы»).
    if (game.pause.clickOutside(p.x, p.y)) { game.pause.resumeFromMenu(); return true; }
    const top = game.popupOnTop;
    if (!top?.box || !top.close) return false;
    const b = top.box;
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return false;
    top.close();
    return true;
  }
  // Then the screen's own and the flight's interface (the canvas's listener). True when one took it.
  function clickUnder(p) {
    const screens = game.screens;
    // A screen's own: the garage's room, the map, the card's lines and tiles, the hangar's ships, the sign's words.
    if (screens.click(p.x, p.y)) return true;
    if (clickQuestBoard(game.questBoard, p.x, p.y)) { game.sound.play('blip'); return true; }
    // The charm that hangs from the locator opens the pilot card on its souvenir.
    const kind = charmAt(p.x, p.y);
    if (kind === null) return false;
    screens.openCardOn(kind);
    return true;
  }
  // The keyboard's click (Enter, where its focus is parked: labs/graphics/key-focus.js): the same click, with the press's sound.
  function clickAt(x, y) {
    if (game.title.active || game.labOpen) return false;
    game.sound.play(pressSound(x, y));
    const p = { x, y };
    return clickOver(p) || clickUnder(p);
  }

  // (`pressSound` and `answersClick` are for checks/page-modules.mjs too.)
  return { gameKeys, flightKeys, hands, flyControls, worldPointAt, install, pressSound, answersClick, clickAt, KEYS };
}
