// The pause (P and Escape), cut from labs/graphics/main.js (PLAN D4 in part, chat F, 2026-10-04): whether P's pause stands; its
// window over everything (pause-menu.js) with the toy ship in its square (pause-toy.js); the menu's rows and pages and what the
// picture's page has shown (the green dots); the let-go that flies the window off before the world plays on. P's own pause is the
// only one that says PAUSED: a screen does not pause the flight, it stands over it (screens.js anyScreen). Chat P owns it
// (docs/plans/2026-10-04-roadmap.md). `game` is the page's (main.js), read when a function runs.
//
// The pages, in the order SX's pick argued (labs/graphics/sketches/pause-v2.html, P2 LEDGER with S2 STEPPER, its «Порядок строк»), laid out in
// the Swiss manner since 2026-10-09 (labs/graphics/pause-menu.js: the rows numbered 01-07 on the main page, a settings page's groups hung
// with their number and name, the foot's key hints, the frame and rules in the grays of src/frames.js):
//   main       RESUME first (the commonest and safest; Enter right after P plays on), the settings (GRAPHICS with the finds' news,
//              AUDIO, GAMEPLAY, LAYOUT, the rarest and a mode of its own), then SAVE GAME (a click saves at once, as before chat P) and
//              MAIN MENU last, a blank row apart, so the end of a session is never under the hand. The head says what the game knows: the
//              sector, the flight's time, and when the game last saved itself (honest, never «saved» before the write has gone). SAVE
//              GAME's page of facts went (SX on the picks hub, 2026-10-04: «SAVE GAME saves at once»): the pilot card and the HUD already
//              say the money, the stations and the finds.
//   graphics   SCREEN: DISPLAY (the whole screen, as V), LOOK, FRAMES (the grays or the look's tint, src/frames.js), from the wider to the
//              narrower; PILOT: SHIP, the drawing the pilot's ship wears (src/shipLooks.js, SX 2026-10-07), over PAINT, what it is painted in,
//              and CURSOR, the collections (UI SHADOW went with the interface's shadow, 2026-10-06: only its text casts one now,
//              src/textShadow.js, and that one is not chosen); COCKPIT: COCKPIT SMOKE and SIDES, which side the locator stands on (the quests
//              and the radio take the other: SX, 2026-10-08, the mirror switch of «HUD PLACE: S3 + MIRROR SWITCH»)
//   audio      SOUND (as O), then VOLUME: MASTER over the three it scales; DEFAULTS in the foot
//   gameplay   CONTROLS (KEYS + CLICKS or MOUSE + HOTKEYS), STEERING (TANK or SCREEN; quiet where the mouse flies); FLIGHT: HOME BEARING,
//              DRIFT where the lab flies it, GREETING, TURN RATE (quiet where the keys fly); PARALLAX's three; DEFAULTS in the foot
//   leave      a step back before the title: STAY, LEAVE TO TITLE (the flight is saved first)
//   layout     where the interface's groups stand (labs/graphics/hud-place.js), moved under the pause
// The toy ship's square is the main page's alone (the Swiss pages give the room to the rows); it is not stepped while another page stands.
import { CONFIG } from '../../src/config.js';
import { readSeen, writeSeen, writeCockpitSmoke } from '../../src/prefs.js';
import { frames, FRAME_STYLES, FRAME_STYLE_NAMES, setFrames } from '../../src/frames.js';
import { shipById } from '../../src/hangar.js';
import { keyName } from '../../src/controls.js';
import { lookById, ownedLooks } from '../../src/looks.js';
import { paintById } from '../../src/paint.js';
import { ownedCursors, cursorName } from '../../src/cursors.js';
import { DISPLAY_LABELS, DISPLAY_MODES } from '../../src/display.js';
import { ROLES } from '../../src/roles.js';
import { inBox } from '../../src/util.js';
import { createPauseMenu, drawPauseWindow, PAUSE_WINDOW } from './pause-menu.js';
import { createPauseToy, stepPauseToy, drawPauseToy, homePauseToy } from './pause-toy.js';
import { carryKick } from './ship-kick.js';
import { noteAction } from './clicks.js';
import { saveHudPlace, drawPlaceOverlay, unsaved as unsavedLayout, layoutOrder, LAYOUT_NOTES, NUDGE, groupLabel, takeGroup, nudgeGroup,
  backMove, cancelLayout, resetGroups, lookOf, setLook } from './hud-place.js';
import { HUD_SIDES, HUD_SIDE_NAMES, setHudSide } from './hud-sides.js';
import { looksFor, earnedWidgets, widgetsToCome } from '../../src/widgets.js';
import { VOLUMES, writeVolumes } from './volume-panel.js';
import { writeMouseReach, reachOfStep, stepOfReach, MOUSE_REACH_STEPS, STEER } from './mouse-flight.js';
import { writeDriftPro } from './stunt-fx.js';
import { setLeanSetting, createLean, LEAN_SETTINGS, LEAN_STEPS } from './depth.js';
import { codesOf, SCHEMES, SCHEME_NAMES, DEFAULT_SCHEME } from '../../src/controls.js';
import { radioFitted, interfaceGiven } from '../../src/opening.js';
import { STEERINGS, STEERING_NAMES, DEFAULT_STEERING, setSteering } from '../../src/steering.js';
import { GREETINGS, GREETING_NAMES, DEFAULT_GREETING, setGreeting } from './greeting.js';
import { sectorLine, pad2 } from './swiss.js';

// How long ago, in the save row's words.
function agoText(s) {
  if (s < 1) return 'JUST NOW';
  if (s < 60) return `${Math.floor(s)} S AGO`;
  return `${Math.floor(s / 60)} MIN AGO`;
}

export function createPause(game) {
  const { saveBackend } = game;
  const pageTime = () => performance.now() / 1000;
  // `keyPause`: P's pause (Escape's too) asked for. `leave`: the pause let go and its window flying off ({ at, time }), or null.
  // The window's own while it stands: when it came (`at`), where the ship stood (`shipAt`), the toy, its box, and its rows as last
  // drawn (for ← →).
  const state = { keyPause: false, leave: null, toy: null, at: null, shipAt: null, box: null, rows: [],
    // While a volume is being set under the pause the sound is woken for its sample, until this page time (s).
    soundPreviewUntil: -Infinity,
    // MAIN MENU's save did not go: the leave page says so and offers its three ways on (exitToTitle), until the page is left.
    leaveFailed: false };
  // The pause's menu (labs/graphics/pause-menu.js): which page is open, and what the picture's page has shown (a find not yet seen
  // there wears a green dot, and so does the menu row to it), kept in this browser. What is owned when this first runs counts as seen.
  const menu = createPauseMenu();
  const seen = readSeen(saveBackend) ?? { looks: null, paints: null, cursors: null };
  function ownedNow() {
    const { world } = game;
    return { looks: ownedLooks(world.pilot.looks).map((l) => l.id), paints: ['standard', ...world.pilot.paints], cursors: ownedCursors(world.pilot.cursors) };
  }
  function markSeen() {
    const o = ownedNow();
    for (const k of ['looks', 'paints', 'cursors']) seen[k] = new Set([...(seen[k] ?? []), ...o[k]]);
    writeSeen(seen, saveBackend);                      // (a store that will not take it: this visit only)
  }
  const isNew = (kind, id) => !!seen[kind] && !seen[kind].has(id);
  // P's pause, and only P's, under no screen. Since 2026-10-02 it is a window over everything in the middle of the screen (over the
  // ship from 2026-10-03 to 2026-10-06)
  // (labs/graphics/pause-menu.js drawPauseWindow), the PAUSED plate in its little space, pushed about by the ship
  // (labs/graphics/pause-toy.js, made new each pause); before, the plate stood under the ship (SX, 2026-10-01).
  function pauseShown() {
    const { world } = game;
    return !game.screens.anyScreen() && world.ship.alive && state.keyPause && world.paused;
  }
  const layoutEditing = () => pauseShown() && menu.page === 'layout';
  function openPage(page) { menu.page = page; state.leaveFailed = false; }
  // The presentations earned (src/widgets.js) and not yet seen on the LAYOUT page wear its green dot, and so does the menu's LAYOUT;
  // seen once the page is left, kept with the other marks (an older seen record has none: what this pilot earned is news to it).
  const earnedNow = () => earnedWidgets(game.world.ledger).map((w) => w.id);
  const newWidget = (id) => !(seen.widgets ?? new Set()).has(id);
  function markWidgetsSeen() {
    seen.widgets = new Set([...(seen.widgets ?? []), ...earnedNow()]);
    if (seen.looks) writeSeen(seen, saveBackend);
  }
  function leavePausePage() {
    state.leaveFailed = false;
    if (menu.page === 'graphics') markSeen();
    if (menu.page === 'layout') { game.hud.place.editor.moving = null; markWidgetsSeen(); }     // a group taken is put down where it stands
    menu.page = 'main';
  }
  function resumeFromMenu() {
    leavePausePage();
    letPauseGo();
    game.sound.play('blip');
  }
  // The pause let go (SX, 2026-10-03: «когда ты выключаешь меню, оно как бы вверх взлетает, экран снова становится ярким,
  // кораблик, как бы, успокаивается, мы начинаем на нем лететь»): the window flies up and the screen brightens over
  // PAUSE_WINDOW.leave s while the toy's ship glides back to where the world's stands (draw), and once it is there the
  // world plays on (playOnAfterPause, at `time`). At once for reduced motion, or with no window up.
  function letPauseGo() {
    if (pauseShown() && !game.feedback.reducedMotion) state.leave ??= { at: pageTime(), time: PAUSE_WINDOW.leave };
    else { state.leave = null; state.keyPause = false; game.world.holdPause('key', false); }
  }
  function playOnAfterPause() {
    if (!state.leave || pageTime() - state.leave.at < state.leave.time) return;
    state.leave = null; state.keyPause = false; game.world.holdPause('key', false);
  }
  // MAIN MENU saves first and goes only once the save has gone (Codex's text pass UI-02, SX 2026-10-07: «берем все»; it reloaded
  // whatever persist said, under YOUR FLIGHT SAVES FIRST): a save that failed, found no storage or is held by another tab keeps the
  // pilot here, and the page says PROGRESS NOT SAVED with TRY AGAIN, STAY and LEAVE UNSAVED (leaveRows). 'erasing' reloads: the
  // erase is on its way to a fresh start.
  function exitToTitle({ unsaved = false } = {}) {
    if (!unsaved) {
      const outcome = game.persist('title');
      if (outcome !== 'saved' && outcome !== 'erasing') { state.leaveFailed = true; return; }
    }
    location.reload();
  }

  // The last save as the SAVE GAME row says it (main.js `game.lastSave()`: when the save was written, by its own clock, or why
  // nothing is being written): honest, never «saved» before the write has gone.
  function saveWords() {
    const last = typeof game.lastSave === 'function' ? game.lastSave() : null;
    if (!last || last.outcome === 'none') return { value: null, ink: null };
    if (last.outcome === 'saved') return { value: `SAVED ${agoText(last.ago)}`, ink: null };
    if (last.outcome === 'failed') return { value: 'SAVE FAILED', ink: ROLES.danger };
    return { value: 'NOT SAVING', ink: ROLES.danger };
  }

  const blank = { kind: 'blank' };
  const back = (label) => ({ kind: 'back', label, run: () => leavePausePage() });
  // A choice of several (S2's ‹ VALUE ›): `options` [{ label, worn, dot, run }].
  const choice = (label, options, extra = {}) => ({ kind: 'choices', label, options, ...extra });

  // The ship's look (main.js game.shipLook): every look whose drawing loaded, none a find; quiet while another ship than the STANDARD
  // is flown (SCOOTY JR. in the opening, the COURIER, the HAULER), whose drawing it is not. The toy's ship measures its disc again.
  function shipRows() {
    const hull = game.shipLook, looks = hull?.looks() ?? [];
    if (looks.length < 2) return [];
    return [choice('SHIP', looks.map((l) => ({ label: l.label, worn: hull.worn === l.id,
      run: () => { if (hull.wear(l.id) && state.toy) state.toy.ship.measured = false; } })), { dim: !hull.shown() })];
  }
  function graphicsRows() {
    const { world, crt } = game, P = world.pilot, o = ownedNow();
    return [back('GRAPHICS'),
      { kind: 'heading', title: 'SCREEN' },
      choice('DISPLAY', DISPLAY_MODES.map((mode) => ({ label: DISPLAY_LABELS[mode], worn: crt.mode === mode, run: () => game.toggleCrt(mode) }))),
      choice('LOOK', o.looks.map((id) => ({ label: lookById(id)?.name ?? id, worn: P.look === id, dot: isNew('looks', id),
        run: () => { P.wearLook(id); game.putOnLook(); game.persist('look'); } }))),
      // The frames and rules of the Swiss windows (src/frames.js; SX, 2026-10-09: «в оригинале они были серые. А там можно было бы включить
      // и тонированные, пока в графические настройки сохраняю»): GRAY, or TINTED toward the look worn; kept in this browser.
      choice('FRAMES', FRAME_STYLES.map((id) => ({ label: FRAME_STYLE_NAMES[id], worn: frames.style === id, run: () => setFrames(id, game.saveBackend) }))),
      blank, { kind: 'heading', title: 'PILOT' },
      ...shipRows(),
      choice('PAINT', o.paints.map((id) => ({ label: paintById(id)?.label ?? id, worn: P.paint === id, dot: isNew('paints', id),
        run: () => { P.wearPaint(id); game.persist('paint'); } }))),
      choice('CURSOR', o.cursors.map((id) => ({ label: cursorName(id), worn: P.cursor === id, dot: isNew('cursors', id),
        run: () => { game.pointerAsked = null; game.applyCursor(P.wearCursor(id)); game.persist('cursor'); } }))),
      blank, { kind: 'heading', title: 'COCKPIT' },
      // The smoke at the view's sides while in smoke (SX, 2026-10-07: «отключать дым в настройке графики ... именно который в кабине»).
      { kind: 'toggle', label: 'COCKPIT SMOKE', on: world.cockpitSmoke !== false,
        set: () => { world.cockpitSmoke = world.cockpitSmoke === false; writeCockpitSmoke(world.cockpitSmoke, game.saveBackend); } },
      // The mirror switch (labs/graphics/hud-sides.js): the locator and the shelf under it on one side, the quests and the radio on the
      // other; kept in this browser, and the layout's kept offsets are mirrored with it.
      ...(game.hudSide ? [choice('SIDES', HUD_SIDES.map((side) => ({ label: HUD_SIDE_NAMES[side], worn: game.hudSide.locator === side,
        run: () => setHudSide(game.hudSide, side, game.saveBackend, game.hud.place) })))] : []),
    ];
  }
  function audioRows() {
    const { sound } = game;
    return [back('AUDIO'),
      { kind: 'heading', title: 'SOUND' },
      // The same switch as O (C0), the mouse's way to it since the corner list went (2026-10-06).
      { kind: 'toggle', label: 'SOUND', on: !!sound.enabled, set: () => game.toggleSound() },
      blank, { kind: 'heading', title: 'VOLUME' },
      ...VOLUMES.map((v) => ({ kind: 'volume', label: v.label, level: sound.volumes[v.id] ?? 1, def: 1, set: (x) => setVolumeFromPanel(v.id, x, v) })),
      { kind: 'item', label: 'DEFAULTS', foot: true, run: () => {
        for (const v of VOLUMES) sound.setVolume(v.id, 1);
        writeVolumes(sound.volumes, saveBackend);
        if (!sound.enabled) game.toggleSound();
      } },
    ];
  }
  // How hard the pointer turns the ship (labs/graphics/mouse-flight.js), against the keys' turn, and the parallax's three
  // (labs/graphics/depth.js), 100% as CONFIG.depth has them: ten steps each, kept in this browser (gameplay-settings.js).
  function gameplayRows() {
    const { world, mouseFlight, lean } = game, schemes = game.schemes;
    const rows = [back('GAMEPLAY'), { kind: 'heading', title: 'CONTROLS' }];
    // The mode (SX, 2026-10-07: «давай переключать управление в меню паузы два варианта»; labs/graphics/schemes.js). The right
    // button's FIRE or BRAKE (RIGHT BTN) was the layout from before chat C's, and went with it on 2026-10-08.
    if (schemes) {
      rows.push(choice('CONTROLS', SCHEMES.map((id) => ({ label: SCHEME_NAMES[id], worn: schemes.scheme() === id, run: () => schemes.setPref(id) }))));
    }
    // How the keys steer (src/steering.js; SX, 2026-10-05: «настройку в управлении как управлять на клаве»): TANK, today's and the
    // default, or SCREEN, each direction key toward its own side of the screen; kept in this browser. Quiet where the mouse alone
    // flies (a setting that does nothing looks so).
    if (game.steering) {
      rows.push(choice('STEERING', STEERINGS.map((id) => ({ label: STEERING_NAMES[id], worn: game.steering.mode === id,
        run: () => setSteering(game.steering, id, saveBackend) })), { dim: !!schemes && !schemes.keysFly() }));
    }
    // (REBIND KEYS ›, C0's R1, comes here once its page is built: src/controls.js is the seam it writes into.)
    rows.push(blank, { kind: 'heading', title: 'FLIGHT' });
    // The way home in the sky (G), for the mouse alone since the corner list went (SX, 2026-10-06: «кнопки для мышки убрать»).
    rows.push({ kind: 'toggle', label: 'HOME BEARING', on: !!world.homeGuide, set: () => { world.homeGuide = !world.homeGuide; } });
    // The drift's NORMAL or PRO (M0's D; chat F1): the game's drift since SX's pick, kept in this browser (stunt-fx.js writeDriftPro).
    if (world.stunts?.drift) {
      rows.push(choice('DRIFT', [['NORMAL', false], ['PRO', true]].map(([label, pro]) => ({ label, worn: !!world.stunts.pro === pro,
        run: () => { world.stunts.pro = pro; writeDriftPro(pro, saveBackend); } }))));
    }
    // How a friendly ship is greeted (labs/graphics/greeting.js; SX, 2026-10-07: «берем g2 wave и нотч вставь ручку для переключения в
    // настройки геймплея»): WAVE, the default, or NOTCH; kept in this browser.
    if (game.greeting) {
      rows.push(choice('GREETING', GREETINGS.map((id) => ({ label: GREETING_NAMES[id], worn: game.greeting.style === id,
        run: () => setGreeting(game.greeting, id, saveBackend) }))));
    }
    // Only the mouse's: quiet where the keys fly (KEYS + CLICKS).
    rows.push({ kind: 'volume', label: 'TURN RATE', level: stepOfReach(mouseFlight.reach) / MOUSE_REACH_STEPS, least: 1,
      def: stepOfReach(STEER.reach) / MOUSE_REACH_STEPS, value: `${Math.round(mouseFlight.reach * 100)}%`, dim: !!schemes && !schemes.mouseFlies(),
      set: (x) => { mouseFlight.reach = reachOfStep(x * MOUSE_REACH_STEPS); writeMouseReach(mouseFlight.reach, saveBackend); } });
    rows.push({ kind: 'note', label: '100% = KEYBOARD TURN RATE' }, blank, { kind: 'heading', title: 'PARALLAX' });
    const start = createLean().settings;
    for (const d of LEAN_SETTINGS) {
      const n = lean.settings[d.id];
      rows.push({ kind: 'volume', label: d.label, level: n / LEAN_STEPS, least: d.mute ? 0 : 1, def: start[d.id] / LEAN_STEPS,
        value: n ? `${n * 20}%` : 'OFF', set: (x) => setLeanSetting(lean, d.id, x * LEAN_STEPS, saveBackend) });
    }
    rows.push({ kind: 'item', label: 'DEFAULTS', foot: true, run: () => {
      mouseFlight.reach = STEER.reach; writeMouseReach(mouseFlight.reach, saveBackend);
      for (const d of LEAN_SETTINGS) setLeanSetting(lean, d.id, start[d.id], saveBackend);
      if (schemes) schemes.setPref(DEFAULT_SCHEME);
      if (world.stunts?.drift) { world.stunts.pro = false; writeDriftPro(false, saveBackend); }
      if (game.steering) setSteering(game.steering, DEFAULT_STEERING, saveBackend);
      if (game.greeting) setGreeting(game.greeting, DEFAULT_GREETING, saveBackend);
    } });
    return rows;
  }
  function leaveRows() {
    if (state.leaveFailed) {
      return [back('MAIN MENU'), { kind: 'note', label: 'PROGRESS NOT SAVED', ink: ROLES.danger }, blank,
        { kind: 'item', label: 'TRY AGAIN', run: () => exitToTitle() },
        { kind: 'item', label: 'STAY', run: () => leavePausePage() },
        { kind: 'item', label: 'LEAVE UNSAVED', run: () => exitToTitle({ unsaved: true }) }];
    }
    return [back('MAIN MENU'), { kind: 'note', label: 'SAVE BEFORE RETURNING TO MAIN MENU' }, blank,
      { kind: 'item', label: 'STAY', run: () => leavePausePage() },
      { kind: 'item', label: 'LEAVE TO TITLE', run: () => exitToTitle() }];
  }
  // The layout editor (labs/graphics/hud-place.js): the groups in the screen's reading order, a row each (a click, or Enter where the
  // keys walk, takes it: the arrows move it, the same again puts it down, Escape takes the move back), then SAVE LAYOUT and CANCEL,
  // RESET THIS (the group taken last) and RESET ALL, the destructive last. A group the opening has not fitted yet (the locator before
  // the first dispatch, src/opening.js) is not offered; one with nothing on the screen now (no quests) is quiet.
  // A group the pilot has: the locator and the quests once fitted, the shelf once it is fitted at B (src/opening.js interfaceGiven), the
  // radio's log once the radio works and the log is earned, the photo frame once earned; the rest always.
  const offered = (id) => (id === 'column' ? interfaceGiven(game.world).column : id === 'quests' ? interfaceGiven(game.world).quests : id === 'shelf' ? interfaceGiven(game.world).shelf
    : id === 'radio' ? radioFitted(game.world) && looksFor(game.world.ledger, 'radio').length > 1
    : id === 'photo' ? looksFor(game.world.ledger, 'photo').length > 1 : true);
  function layoutRows() {
    const place = game.hud.place, ed = place.editor, boxes = game.hud.boxes ?? {}, changed = unsavedLayout(place), ledger = game.world.ledger;
    const rows = [back('LAYOUT'), { kind: 'heading', title: 'PANELS' }];
    for (const id of layoutOrder(place.side)) {
      if (!offered(id)) continue;
      const moving = ed.moving?.id === id, shown = !!boxes[id], take = shown ? () => takeGroup(place, id) : null;
      // Its presentations, where it has earned more than its own (‹ FULL ›, ‹ OFF ›): a choice; the name and Enter take it.
      const looks = looksFor(ledger, id), worn = lookOf(place, id, ledger);
      if (!moving && looks.length > 1) {
        const fresh = earnedWidgetsOf(id).filter(newWidget).map((w) => w.look);
        rows.push(choice(groupLabel(id), looks.map((l) => ({ label: l.label, worn: l.look === worn, dot: fresh.includes(l.look), run: () => setLook(place, id, l.look) })),
          { group: id, dim: !shown && worn !== 'off', run: take }));
      } else {
        rows.push({ kind: 'item', label: groupLabel(id), group: id, dim: !shown, value: moving ? 'MOVING' : null, valueInk: ROLES.textPrimary, run: take });
      }
    }
    if (widgetsToCome(ledger)) rows.push({ kind: 'note', label: 'RESTORE RUINS FOR MORE PANELS' });
    const failed = place.status === 'failed';
    rows.push(blank, { kind: 'heading', title: 'EDIT' },
      { kind: 'item', label: 'SAVE LAYOUT', dim: !changed && !failed, value: failed ? 'NOT SAVED' : null, valueInk: ROLES.danger,
        run: () => {
          const [title, sub, kind] = LAYOUT_NOTES[saveHudPlace(place) ? 'saved' : 'failed'];
          // Saved: the row says it (its UNSAVED goes); not saved: the notch says it too.
          game.notices.notify(title, sub, { kind, life: 2.6, waits: false, fate: kind === 'danger' ? 'flip' : 'gone' });
        } },
      { kind: 'item', label: 'CANCEL', dim: !changed, run: () => cancelLayout(place) },
      { kind: 'item', label: 'RESET THIS', quiet: true, dim: !ed.selected, value: ed.selected ? groupLabel(ed.selected) : null,
        run: () => { if (ed.selected) resetGroups(place, ed.selected); } },
      { kind: 'item', label: 'RESET ALL', quiet: true, run: () => resetGroups(place) });
    return rows;
  }
  function mainRows() {
    const o = ownedNow(), fresh = o.looks.some((id) => isNew('looks', id)) || o.paints.some((id) => isNew('paints', id)) || o.cursors.some((id) => isNew('cursors', id));
    return [
      // (Its own function, not the plate's: the golden master tells the buttons apart by what they run.) Its key's cap at its right: P.
      { kind: 'item', label: 'RESUME', key: keyName('pause'), run: () => resumeFromMenu() },
      blank,
      { kind: 'item', label: 'GRAPHICS', more: true, dot: fresh, page: 'graphics', run: () => openPage('graphics') },
      { kind: 'item', label: 'AUDIO', more: true, page: 'audio', run: () => openPage('audio') },
      { kind: 'item', label: 'GAMEPLAY', more: true, page: 'gameplay', run: () => openPage('gameplay') },
      { kind: 'item', label: 'LAYOUT', more: true, dot: earnedNow().some(newWidget), value: unsavedLayout(game.hud.place) ? 'UNSAVED' : null,
        page: 'layout', run: () => openPage('layout') },
      blank,
      // The last save is said in the head (headMeta), as the sketch has it, not at the row's right.
      { kind: 'item', label: 'SAVE GAME', run: () => game.saveByHand() },
      { kind: 'item', label: 'MAIN MENU', page: 'leave', run: () => openPage('leave') },
    ];
  }
  const earnedWidgetsOf = (group) => earnedWidgets(game.world.ledger, group);
  const PAGES = { graphics: graphicsRows, audio: audioRows, gameplay: gameplayRows, leave: leaveRows, layout: layoutRows };
  function pauseRows() { return (PAGES[menu.page] ?? mainRows)(); }

  // The head's words (the Swiss pause, labs/graphics/pause-menu.js): on the main page PAUSE and, at the right, only what the game knows: the
  // sector, the flight's time (the pilot's own seconds of flight, src/contracts.js clock) once there is some, and the last save, honest as
  // saveWords says it; on a page, the number of the menu's row that opens it.
  const clockText = (sec) => { const t = Math.floor(sec); return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(pad2).join(':'); };
  function headOf() {
    if (menu.page !== 'main') {
      const at = mainRows().filter((row) => row.kind === 'item').findIndex((row) => row.page === menu.page);
      return { title: 'PAUSE', number: at >= 0 ? at + 1 : null, meta: [] };
    }
    const { world } = game, words = saveWords(), clock = world.ledger?.clock;
    const meta = [{ text: sectorLine(world) }, { text: Number.isFinite(clock) && clock > 0 ? clockText(clock) : null }, { text: words.value, ink: words.ink ?? undefined }];
    return { title: 'PAUSE', number: null, meta: meta.filter((m) => m.text) };
  }
  // The foot's keys (ESC lets the pause go from any page: the Escape key's own, labs/graphics/pause.js press). A group taken on LAYOUT is moved
  // by the arrows, put down by Enter or the same click, Escape takes the move back.
  const ESC_RESUME = { side: 'right', key: 'ESC', words: 'RESUME' };
  function hintsOf() {
    if (menu.page === 'main') return [{ key: '↑ ↓', words: 'MOVE' }, { key: 'ENTER', words: 'OPEN' }, ESC_RESUME];
    if (menu.page === 'leave') return [{ key: '↑ ↓', words: 'MOVE' }, { key: 'ENTER', words: 'CHOOSE' }, ESC_RESUME];
    if (menu.page === 'layout' && game.hud.place.editor.moving) {
      return [{ key: '← → ↑ ↓', words: 'MOVE' }, { key: 'ENTER', words: 'PUT DOWN' }, { side: 'right', key: 'ESC', words: 'CANCEL MOVE' }];
    }
    return [{ side: 'right', key: '← →', words: 'CHANGE' }, ESC_RESUME];
  }
  // Under the square: the ship flown and the drawing it wears (the pause's SHIP row), where the game has them.
  function captionOf() {
    const { world } = game, flying = shipById(world.hangar?.flying) ?? shipById('standard'), hull = game.shipLook;
    const worn = hull?.shown() ? hull.looks().find((l) => l.id === hull.worn)?.label : null;
    return { left: flying.label, right: worn ?? null };
  }

  function setVolumeFromPanel(id, v, def) {
    const { sound } = game;
    sound.setVolume(id, v);
    writeVolumes(sound.volumes, saveBackend);
    state.soundPreviewUntil = pageTime() + 0.6;
    sound.sleep(false, 'paused');
    if (def?.sample) sound.play(def.sample);
  }

  // P's (or Escape's) press: pause, or let the pause go; `pausedNow` whether P's pause stood when it was read.
  function press(pausedNow) {
    const { world } = game;
    // Let go, the window flies off (letPauseGo); P again meanwhile keeps it.
    if (state.leave) state.leave = null;
    else if (pausedNow) letPauseGo();
    else {
      // (Only P's reason is P's to hold: the two-tabs window and a locked tab take the keys before they come here.)
      state.keyPause = !world.paused;
      world.holdPause('key', state.keyPause);
    }
    game.sound.play('blip');
  }

  // ← → on the row the pointer is on (the mouse's, or the keys' parked there: labs/graphics/key-focus.js): a choice steps, a switch
  // flips, a level moves a step, at once (C0: «← → сразу меняют носимое»). `key(action)`: pressed this frame. True when it took them.
  function keys(key) {
    if (!pauseShown() || state.leave) return false;
    // A group taken on the LAYOUT page: the arrows move it NUDGE.near px a press (NUDGE.far with the layoutFar key held), Escape takes
    // the move back (the economy's section 10: «Escape cancels the active move, not the whole game»).
    const place = game.hud.place, moving = menu.page === 'layout' ? place.editor.moving : null;
    if (moving) {
      const px1 = game.input.held(...codesOf('layoutFar')) ? NUDGE.far : NUDGE.near;
      const dx = ((key('right') ? 1 : 0) - (key('left') ? 1 : 0)) * px1, dy = ((key('down') ? 1 : 0) - (key('up') ? 1 : 0)) * px1;
      if (dx || dy) { nudgeGroup(place, dx, dy, game.hud.boxes?.[moving.id], game.renderer.width, game.renderer.height); return true; }
      if (key('back')) { backMove(place); game.sound.play('blip'); return true; }
    }
    const d = (key('right') ? 1 : 0) - (key('left') ? 1 : 0);
    const p = game.pointer;
    if (!d || !p?.inside) return false;
    const row = state.rows.find((l) => l.step && inBox(l.box, p.x, p.y));
    if (!row) return false;
    row.step(d);
    if (row.kind !== 'volume') game.sound.play('menu');
    return true;
  }

  // Each frame, before the pause's window is drawn: none standing, its window's state goes, and its page closes. Returns whether
  // it stands this frame.
  function settle() {
    const pausing = pauseShown();
    if (!pausing) { state.toy = state.at = state.shipAt = state.box = null; state.rows = []; if (menu.page !== 'main') leavePausePage(); }
    return pausing;
  }

  // Under P's pause, over everything and the rest dimmed as under a pop-up: the pause's window (labs/graphics/pause-menu.js),
  // its little space where the ship wants out, then pesters the PAUSED plate (pause-toy.js; a click on the plate plays on), the menu under
  // it. On the layout's page the interface's groups show their outlines over the dimming and can be moved (hud-place.js).
  function draw() {
    const { world, renderer, feedback, pointer, kick } = game;
    state.at ??= pageTime();
    const still = feedback.reducedMotion;
    // The window comes down in the middle (SX, 2026-10-06: «пауза – это тоже поп-ап ... в центр экрана»; over the ship, `cover`, from
    // 2026-10-03 until then). The toy's ship starts where the world's stands, turned as it was, drawn over the window while it comes
    // (`above`), and dives into the square from there (pause-toy.js `enter`; it kept still there while the window landed over it);
    // then it is the square's, jolting the window when it strikes a wall (`shake`). Let go (letPauseGo), the window stops where it
    // is and flies off, and the ship glides back to where the world's stands; the world plays on once it is there.
    state.shipAt ??= world.project(renderer, world.ship.x, world.ship.y);
    const toyIn = (view, frac) => {
      if (state.toy) return;
      state.toy = createPauseToy({ x: state.shipAt.x - view.x - (frac?.x ?? 0), y: state.shipAt.y - view.y - (frac?.y ?? 0), angle: world.ship.angle });
    };
    // The toy is the main page's: another page stands without it, and neither the toy's steps nor its blows' jolts nor its glide home run
    // meanwhile (it picks up where it was when the main page comes back).
    const toyPage = menu.page === 'main';
    const leave = state.leave ? Math.min(1, (pageTime() - state.leave.at) / PAUSE_WINDOW.leave) : 0;
    const { box: windowBox, view, at, rows } = drawPauseWindow(renderer, pauseRows(), pointer, (view, r, landed, frac) => {
      toyIn(view, frac);
      const plate = drawPauseToy(r, state.toy, view, { world, age: state.toy.t, reducedMotion: still, ship: landed ? 'clip' : 'none', frac });
      if (!state.leave) noteAction(plate, resumeFromMenu);
    }, { dim: 1 - CONFIG.view.underPanel, age: still ? Infinity : (state.leave?.at ?? pageTime()) - state.at, leave,
      shake: state.leave || !toyPage ? null : state.toy?.jolt, page: menu.page, dt: game.frameDt(), still,
      head: headOf(), hints: hintsOf(), caption: toyPage ? captionOf() : null,
      above: toyPage ? (view, frac) => drawPauseToy(renderer, state.toy, view, { world, reducedMotion: still, ship: 'free', frac }) : null,
      over: layoutEditing() ? () => drawPlaceOverlay(renderer, game.hud.boxes, game.hud.place, { hover: game.hud.hover ?? rowGroup(), t: pageTime(), buttons: false }) : null });
    state.box = windowBox;
    state.rows = rows;
    if (!toyPage || !state.toy) return;
    if (state.leave && state.toy.mode !== 'home') {
      // Let go (SX, 2026-10-03: «очень неестественно корабль возвращается ... Придумай какой-нибудь костыль»): the toy's ship
      // turns where it stands to the world ship's heading, at about the game's turn, and the camera carries the world so that
      // the world's ship comes under it (ship-kick.js carryKick); the world plays on with the two together, and the camera
      // brings the ship home as it catches a ship up.
      const s = state.toy.ship, turn = Math.abs(Math.atan2(Math.sin(world.ship.angle - s.a), Math.cos(world.ship.angle - s.a)));
      const time = Math.max(PAUSE_WINDOW.leave, turn / 2.6);
      homePauseToy(state.toy, { x: s.x, y: s.y, a: world.ship.angle }, time);
      carryKick(kick, view.x + (at.x - Math.round(at.x)) + s.x - state.shipAt.x, view.y + (at.y - Math.round(at.y)) + s.y - state.shipAt.y, time);
      state.leave.time = time;
    } else if (!state.leave && state.toy.mode === 'home') homePauseToy(state.toy, null);
    stepPauseToy(state.toy, game.frameDt(), { still, frame: at });
  }

  // The group of the LAYOUT page's row under the pointer (its outline on the screen lights with it), or null.
  function rowGroup() {
    const p = game.pointer;
    return p?.inside ? state.rows.find((l) => l.group && inBox(l.box, p.x, p.y))?.group ?? null : null;
  }

  // Whether a click at (x, y) is outside the standing window (a click there plays on; SX, 2026-10-03: «Клик вне меню паузы.
  // Закрывает меню паузы»): the window's box while it stands and is not flying off.
  function clickOutside(x, y) {
    const pb = pauseShown() && !state.leave ? state.box : null;
    return !!pb && !inBox(pb, x, y);
  }

  // (`rows`: the open page's rows, for checks/controls-coverage.mjs.)
  return { state, menu, seen, markSeen, pauseShown, layoutEditing, leavePausePage, resumeFromMenu, letPauseGo, playOnAfterPause, rows: pauseRows,
    head: headOf, hints: hintsOf, press, keys, settle, draw, clickOutside };
}
