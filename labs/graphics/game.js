// The game's page (index.html, game mode) and the lab's (labs/graphics/index.html, with the drawer): `createGame(env)` makes the page's parts
// in order (the renderer, the world, the save, the sound, the screens), the title and the boot, and starts the frame loop. labs/graphics/main.js,
// the page's entry, calls it with the browser's own objects. It began on 2026-09-25 as
// the lab's copy of the old src/main.js; since 2026-09-29 it is the game's code, and src/main.js is gone.
// Cut on 2026-10-04 (chat F, PLAN D4 in part) so the roadmap's chats each own a file: the pause (pause.js), the notices
// (notices.js), the screens (screens.js), the keys and the mouse (input-router.js), the lab's drawer (lab-drawer.js). They are
// handed the page's parts as `game`, below. Cut on 2026-10-09 (PLAN D4): the save (save-keeper.js), the title's menu (title-menu.js), the
// canvas fit (canvas-fit.js), the frame loop (frame-loop.js), the H panel (diagnostics.js) and the flight's frame with its drawing order
// (flight-frame.js, handed `game` and `page`, the frame's state between calls, declared below), and the title with the boot behind it
// (page-boot.js, the same), and what the pause's rows and the router's keys do to the page itself (page-actions.js). Cut on 2026-10-09 (the
// second night): the body into createGame(env), the browser read through `env` (below).
import { CONFIG } from '../../src/config.js';
import { FLIGHT } from '../../src/flightConfig.js';
import { ECONOMY } from '../../src/economyConfig.js';
import { LabRenderer as Renderer, applyStyle, labStyle, cleanSettings } from './style.js';
import { createLabBackend } from './storage.js';
import { seedLab } from './scenes.js';
import { ART_MOTION } from '../../src/souvenirArt.js';
import { DROID_MOTION } from '../../src/droidArt.js';
import { legend, readLegendPreference } from './locator.js';
import { createQuestBoard } from './quest-list.js';
import { offerSideQuest } from '../../src/quests.js';
import { startRaid } from '../../src/raids.js';
import { createCharm } from './charm.js';
import { createTracker } from './tracker.js';
import { COCKPIT_FX } from './cockpit-fx.js';
import { createRespawnFx } from './respawn-fx.js';
import { deckLayout } from './hud-layout.js';
import { createWorldPresentation, unassignedMaterials } from './world-art.js';
import { Input } from '../../src/input.js';
import { World } from '../../src/world.js';
import { PIRATE_STYLE_IDS } from '../../src/pirateStyles.js';
import { setSecretHole } from '../../src/secretHole.js';
import { normalizeModel, PLACEHOLDER } from '../../src/asciiModel.js';
import { TAU, deepFreeze } from '../../src/util.js';
import { Storage } from '../../src/storage.js';
import { createScaleState } from '../../src/visualScale.js';
import { Feedback } from '../../src/feedback.js';
import { GhostReplay } from '../../src/ghost.js';
import { LOOKS } from '../../src/looks.js';
import { watchOlderTabs, tabsChannelName } from '../../src/tabs.js';
import { createShipLook } from '../../src/shipLooks.js';
import { Display, readDisplayMode } from '../../src/display.js';
import { Sound, readSoundPreference } from '../../src/audio.js';
import { grade, installGrade } from '../../src/grade.js';
import { FrameClock } from '../../src/frameClock.js';
import { FramePace } from '../../src/framePace.js';
import { START_STATIONS } from '../../src/sectors.js';
import { ruinIdsOf } from '../../src/ruins.js';
import { createLean, readLeanSettings } from './depth.js';
import { createKick } from './ship-kick.js';
import { readStuntSwitches, createStuntFx } from './stunt-fx.js';
import { CLOUD_LOOKS } from '../../src/clouds.js';
import { readWarnSwitch, createHitWarning } from './hit-warning.js';
import { createSkillHints } from '../../src/skillHints.js';
import { createHudPlace, leftColumnEdge, rightColumnEdge } from './hud-place.js';
import { createHudSide } from './hud-sides.js';
import { createInterface, createModernFx } from './hud-modern.js';
import { loadFrames } from '../../src/frames.js';
import { createRadio } from './radio.js';
import { readVolumes } from './volume-panel.js';
import { readOpening } from '../../src/prefs.js';
import { beginOpening, skipOpening } from '../../src/opening.js';
import { createMouseFlight, readMouseReach } from './mouse-flight.js';
import { createCursor, CURSORS } from './cursor.js';
import { createPause } from './pause.js';
import { createNotices, NOTICE_FATES } from './notices.js';
import { createOpeningFocus, readFocusSwitch, FOCUS_DEFAULT } from './opening-focus.js';
import { createTalkBeat } from './talk-beat.js';
import { createScreens } from './screens.js';
import { createInputRouter } from './input-router.js';
import { createSaveKeeper } from './save-keeper.js';
import { createCanvasFit } from './canvas-fit.js';
import { createFrameLoop } from './frame-loop.js';
import { installLabDrawer } from './lab-drawer.js';
import { createSchemes } from './schemes.js';
import { createSteering } from '../../src/steering.js';
import { createGreeting, drawGreetAnswer } from './greeting.js';
import { createKeyFocus } from './key-focus.js';
import { createDiagnostics } from './diagnostics.js';
import { createFlightFrame } from './flight-frame.js';
import { createPageBoot } from './page-boot.js';
import { warmSmoke } from './boot.js';
import { createZoom, setZoom, stepZoom, fitWorldLayer } from '../../src/zoom.js';
import { createPageActions, paintPageColours } from './page-actions.js';

// `env` is the browser's side, as main.js builds it from the page and a check from stand-ins. The body reads these by the names it always had
// (`window`, `document`, `location`); the rest comes by `env`:
//   now()                      the clock in ms (performance.now): the frame's stamp, the load's time, the save's interval
//   random()                   [0, 1): the world's seed is drawn from it, as every game has drawn its dice
//   requestAnimationFrame(f)   the loop's next refresh (the first call starts the loop)
//   storage()                  the game's save backend (localStorage) or null; reading it can throw, and is tried
//   BroadcastChannel           the constructor, or undefined: two tabs on one save
//   fetch(url, options), base  a sprite's or a ship's file, and the URL they are found from (two folders up from it)
// What it makes it hands back, as `game` (the page's parts, labs/graphics/pause.js and the rest read it); `window.SPASER` is set on `window`.
// The modules it makes still read the browser's globals themselves, each its own: src/input.js, src/renderer.js (`window`, `document`,
// `getComputedStyle`), labs/graphics/lab-drawer.js (`document`, `location`), the garage room's picture (`Image`), the souvenirs' canvases.
export function createGame(env) {
  const { window, document, location } = env;
  // The main game runs this same code (SX, 2026-09-29: «внеси в текущую актуальную
  // версию все изменения», then "move the lab into the game"): index.html sets
  // <body data-mode="game">. In game mode there is no lab drawer, no fixture seeding
  // and no URL test switches, and pirates find the pilot on their own.
  //
  // The lab is the game with the drawer (SX, 2026-10-01: «лаба соответствовала чаще всего
  // мейну», «Лабу давай той же сейф, что в игре», with a separate one as a choice): it plays
  // the game's own save and display choices (V, O, M), and pirates and droids come as in the
  // game. A review link, which sets up a test (`?scene=`, `?pirates=`, `?droid=`, or a drawer
  // jump), uses the lab's separate save instead (labs/graphics/storage.js), so a test never
  // touches the pilot's game, and is quiet: pirates and droids come when it calls them.
  // `?save=lab` chooses the separate save for a plain flight. The drawer's graphics settings
  // are always the lab's own.
  const GAME = document.body.dataset.mode === 'game';
  const pageParams = new URLSearchParams(location.search);
  // The ship's return after a wreck (labs/graphics/respawn-fx.js): the screen redrawn through a band of black glyphs (SX, 2026-10-04).
  const respawnFx = createRespawnFx();
  // (`?boss=1`, the boss TOLLKEEPER on open ground, src/boss.js: a review link too, so its fight never touches the pilot's save.)
  const REVIEW = !GAME && ['scene', 'pirates', 'droid', 'visitor', 'hull', 'boss'].some((key) => pageParams.has(key));
  // `?look=` and `?looks=` (src/looks.js) hand the pilot looks, so they too play the lab's own save, never the game's; so do
  // `?placeQuests`, the quest list's editor (labs/graphics/sketches/quests.html), which starts quests to place, and `?startRuin`;
  // and `?raid`, `?quest` and `?special`, which start a raid or a quest at once and raise the wallet or edit the notes and the
  // cargo, and `?map=all`, which marks every sector seen (PLAN C1, 2026-10-03: they used to play on the pilot's real save and,
  // saving as the game does, wrote all that into it).
  // `?focus=F0..F3` (the opening's beats, labs/graphics/opening-focus.js) plays a new pilot's opening at every load, on the lab's own save
  // wiped first: to compare the beats from the start as often as wanted, never touching the pilot's game.
  const FOCUS_RUN = !GAME && pageParams.has('focus');
  const LAB_SAVE = !GAME && (REVIEW || FOCUS_RUN || pageParams.get('save') === 'lab' || ['look', 'looks'].some((key) => pageParams.has(key)) ||
    ['placeQuests', 'startRuin', 'raid', 'quest', 'special', 'restored', 'pirateStyle'].some((key) => pageParams.has(key)) || pageParams.get('map') === 'all');
  const gameBackend = () => { try { return env.storage() || null; } catch { return null; } };
  const saveBackend = LAB_SAVE ? createLabBackend() : gameBackend();
  const tuningBackend = GAME ? null : createLabBackend();
  // `?startRuin=relay|halcyon|yard` (the lab, always on its own save) makes that one of the
  // start's three the broken one (src/sectors.js START_STATIONS), whatever the save held: to see each pilot's start.
  const START_RUIN = LAB_SAVE ? START_STATIONS.find((id) => id.split('-')[1] === pageParams.get('startRuin')?.toLowerCase()) ?? null : null;
  let settings;
  try { settings = GAME ? cleanSettings() : cleanSettings(JSON.parse(tuningBackend?.getItem('settings') || '{}')); }
  catch { settings = cleanSettings(); }
  applyStyle(settings);
  // The tunables frozen, deep, once the style has put its inks in (the code review's architecture finding 6, chat V's refactoring piece,
  // 2026-10-05): nothing writes CONFIG at run time, and the flight's and the economy's numbers, which CONFIG holds under its names, with
  // it. A write throws (a module's code is strict); the lab's switches and the GAMEPLAY settings keep their own state, never CONFIG's.
  deepFreeze(CONFIG); deepFreeze(FLIGHT); deepFreeze(ECONOMY);
  // The lab's `?notices=old` says every notice as a card under the notch, as before the notch's flips (notices.js NOTICE_FATES; SX agreed
  // the fates on 2026-10-05): kept while the opening's beats wait for SX's pick, `?focus=F2` and `F3` coming in with the cards' notices.
  // (`?praise=on` and `?notices=left` went once SX had answered them, 2026-10-07.) The game reads none.
  if (!GAME && pageParams.get('notices') === 'old') NOTICE_FATES.mode = 'old';
  // SX's colour grade (src/grade.js) is always on in the game; the lab can show the colours as written, for a
  // side-by-side look, with `?grade=off`.
  const GRADED = GAME || new URLSearchParams(location.search).get('grade') !== 'off';
  const shade = GRADED ? grade : (color) => color;
  // The page's own colours (the pilot's name field, the lab drawer) wear the game's grade too (labs/graphics/page-actions.js).
  paintPageColours(document.documentElement, shade);
  // M hides the locator's legend; the choice is this browser's, like V's.
  legend.hidden = readLegendPreference(saveBackend);

  const canvas = document.getElementById('stage');
  const announcementEl = document.getElementById('announcement');
  const nameInput = document.getElementById('nickname');
  const feedback = new Feedback();
  const ghost = new GhostReplay();
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  feedback.reducedMotion = ghost.reducedMotion = motionPreference.matches;
  motionPreference.addEventListener('change', e => { feedback.reducedMotion = ghost.reducedMotion = presentation.reducedMotion = e.matches; ART_MOTION.on = DROID_MOTION.on = !e.matches; });

  const renderer = new Renderer(canvas);
  // SX's colour grade (2026-10-01, codex/reports/palette/PALETTE_HANDOFF_FOR_CLAUDE.md): every colour the frame is drawn
  // in is graded once, as it is handed to this canvas, after roles, paints and planets have resolved it; the CRT
  // filter shows the graded frame and grades nothing again (src/grade.js).
  if (GRADED) installGrade(renderer.ctx);
  // The ship's place is measured from the helm (src/renderer.js layout): the top of its grip, on the desktop deck.
  renderer.panelTopOf = (r) => { try { const L = deckLayout(r); return L?.deck ? L.helm.gripTop : null; } catch { return null; } };
  renderer.layout();
  const input = new Input();
  // The display's screens (src/display.js, SX's from the film-grade editor): the CRT's curved tube (the base, what a
  // browser starts on), an LCD panel, a VHS tape, or FLAT (for checks). V steps through them; the choice is remembered by
  // this browser, not by the save. `crt` keeps its name: the page talks to it as it did.
  const crt = new Display(canvas, document.getElementById('crt'), { doc: document, now: env.now });
  crt.setMode(readDisplayMode(saveBackend));
  if (crt.enabled) renderer.setPixelBudget(CONFIG.crt.maxPixels);

  // Sound (src/audio.js): on unless O turned it off, a display choice of this
  // browser like the tube. A browser lets a page make sound only after a key or a
  // click, so the first of either starts it; a hidden page puts it to sleep.
  const sound = new Sound();
  // The player's volumes, kept in this browser (labs/graphics/volume-panel.js; the pause's SETTINGS).
  Object.assign(sound.volumes, readVolumes(saveBackend));
  // The page's parts, handed to the modules cut from this file. Each reads what it needs from here when it runs; this file still
  // makes every part, in the order it always has. `labOpen`: the lab's drawer is open (the flight frozen); `labFresh`: no save was
  // loaded (a new pilot).
  const game = { GAME, LAB_SAVE, REVIEW, pageParams, saveBackend, tuningBackend, canvas, announcementEl, nameInput, feedback, ghost,
    renderer, input, crt, sound, shade, motionPreference, labOpen: !GAME, labFresh: true, showDiag: false, pointerAsked: null,
    popupOnTop: null, lastHudLayout: null, hudCovered: false };
  // What the pause's rows, the router's keys and the notices do to the page itself (labs/graphics/page-actions.js): V, O, K, the look, the ship's
  // drawing. They read the parts they touch from `game` when they run, so they are made here, before the parts they touch; `followCursor` is the
  // frame's and the boot's, handed on below, not the page's.
  const { followCursor, ...actions } = createPageActions(game, { root: document.documentElement });
  Object.assign(game, actions);
  // The pilot's ship's look (src/shipLooks.js; SX, 2026-10-07): which drawing the STANDARD wears, kept in this browser, chosen on the
  // pause's GRAPHICS page.
  game.shipLook = createShipLook(saveBackend, { world: () => world, apply: game.applyModel });
  // The pause (labs/graphics/pause.js): P's, its window and its menu.
  game.pause = createPause(game);
  sound.setEnabled(readSoundPreference(saveBackend).on);
  for (const type of ['keydown', 'pointerdown']) window.addEventListener(type, () => sound.unlock());
  document.addEventListener('visibilitychange', () => sound.sleep(document.hidden));
  // The world's one source of chance (PLAN D1, 2026-10-03): a seed drawn here, as every game has drawn its dice, and every stream of
  // the world derived from it (`world.rng(name)`, src/world.js), so a game is as varied as ever and `world.seed` says which one it was.
  // The secret hole into O-08 stands nowhere until it comes to a pilot alone in the void, ahead on the course, and goes again
  // (src/secretHole.js, H3 LURE, SX's pick of 2026-10-04), drawn on the world's own 'secret' stream. A review link keeps the fixed
  // stream a check's World has, as it keeps its droids and visitors off. Its way is shut since SX's word of 2026-10-19
  // (CONFIG.blackHole.secret.way): it comes nowhere, and K-05's ordinary hole stands in its place.
  const world = new World(normalizeModel(PLACEHOLDER, 'placeholder'), { seed: (env.random() * 4294967296) >>> 0, rollSecret: !REVIEW });
  // Pirates come by themselves (CONFIG.pirates.zones), in the game and in the lab; a review
  // link calls them with `?pirates=` or a drawer button, so a review of anything else is
  // not interrupted.
  world.autoEncounters = !REVIEW;
  // `?pirateStyle=P0..P3` (the lab, on its own save): how the pirates made from now on fight (CONFIG.pirates.styles, src/pirateStyles.js;
  // SX, 2026-10-17: «лаб с пресетами P1 FASTER, P2 PACK, P3 MOVES»). The game's is CONFIG.pirates.style.
  // Its squads are drawn as a pilot who has restored every ruin meets them, so the hulls that replace the old four come too
  // (SX, 2026-10-17: «ни одного пирата, который кодекс рисовал, мне не встретилось»).
  if (!GAME && PIRATE_STYLE_IDS.includes(pageParams.get('pirateStyle'))) { world.pirateStyle = pageParams.get('pirateStyle'); world.rosterOpen = true; }
  // `?npcFlight=new` (the lab): the NPC ships flown as ships, giving way, slowing into corners (src/npcFlight.js; SX's N1 FLIGHT, 2026-10-19);
  // `?npcFlight=old` the clock. The game's is CONFIG.traffic.flight.mode.
  if (!GAME && pageParams.has('npcFlight')) world.fleet.flight = pageParams.get('npcFlight') === 'old' ? 'path' : 'step';
  // The drift G1 GLIDE and the jump J2, the game's (chat F1: src/drift.js, src/trick.js, FLIGHT's presets in src/flightConfig.js); the lab
  // may put the pilot's NORMAL or PRO aside (labs/graphics/stunt-fx.js readStuntSwitches). NORMAL or PRO is kept in this browser; nothing
  // else of it is saved.
  world.stunts = readStuntSwitches(GAME ? new URLSearchParams() : pageParams, saveBackend);
  // The smoke clouds (chat W2, 2026-10-04; src/clouds.js), C3 FILL (the shade alone, no outline; SX, 2026-10-04): the game's since SX's
  // word of 2026-10-06 («почему-то нет облаков в космосе»), in the lab too.
  world.clouds = CLOUD_LOOKS.C3;
  // Service droids likewise (src/droids.js): now and then, by `?droid=` on a review link.
  world.autoDroids = !REVIEW;
  // And, rarely, a named craft out of O-08 (src/traffic.js): by `?visitor=` (a craft's id, or any) on a review link.
  world.autoVisitors = !REVIEW;
  // And, rarely, a reference ship standing in a sector with a quest for a pilot (src/specials.js): by `?special=<ship>` on a review link.
  world.autoSpecials = !REVIEW;
  // The page's first move of the hole: where the World put it, told to the quests' places (src/spots.js) to keep clear of.
  setSecretHole(world, world.secretHole);
  const presentation = createWorldPresentation(world, labStyle);
  game.world = world; game.presentation = presentation;
  presentation.reducedMotion = motionPreference.matches;
  // The souvenirs' band of light and their moving frames, and the droids' idle loops and oil, hold still under reduced motion
  // (src/souvenirArt.js, src/droidArt.js).
  ART_MOTION.on = DROID_MOTION.on = !motionPreference.matches;
  world.ship.measureDrawing(renderer.cellW, renderer.cellH);

  // Persistence is owned by the frame, not by the simulation. The world hands out
  // a snapshot and accepts one back; it never touches storage itself.
  const storage = game.storage = new Storage(saveBackend);
  if (FOCUS_RUN) storage.clear();
  // The save, read and written by labs/graphics/save-keeper.js: the boot's restore now (what it came to is `saves.notes`, said at the first
  // flight frame), the writes (`persist`, the pause's SAVE GAME), the held save's notice, the last write's line, and the erasing chord.
  const saves = createSaveKeeper(game, { clock: () => env.now() / 1000, reload: () => location.reload() });
  const { persist, saveByHand } = saves;
  Object.assign(game, { persist, saveByHand, lastSave: saves.lastSave });
  saves.restoreProgress();
  if (game.labFresh && LAB_SAVE && !FOCUS_RUN) seedLab(world);
  // A new pilot starts with CONFIG.wallet.start, once: a balance, not a floor (a save loads exactly
  // what it held, and nothing refills it at a load or a respawn).
  if (game.labFresh && (!LAB_SAVE || FOCUS_RUN)) world.ledger.credits = CONFIG.wallet.start;
  // The finds are laid where they open, for each pilot his own (src/cachePlaces.js; SX, 2026-10-02: «тут нужно интереснее
  // сгенерировать логику»): a new game's four paints now, a save's opened finds that lie nowhere yet now, the rest as the
  // frontier opens them. A review link keeps the catalogue's places, as it keeps its droids and visitors off.
  world.placeCaches = !REVIEW;
  // A new pilot gets a deal of his own: which souvenirs and paints come at the start, with the sectors and with the ruins.
  if (game.labFresh && !REVIEW) world.dealNew(world.rng('deal'));
  // And his own broken station of the start's three (src/sectors.js START_STATIONS; SX, 2026-10-02: «каждому игроку из 3 станций
  // рандомно достается первая сломанная»), one in three; a save keeps its own (an older one HALCYON), a review link the catalogue's.
  if (START_RUIN) world.rollStartRuin(world.rng('startRuin'), { force: START_RUIN });
  else if (game.labFresh && !REVIEW) world.rollStartRuin(world.rng('startRuin'));
  world.settleCaches();
  // A new pilot's opening chapter (src/opening.js; codex/start-and-narrative/, SX's answers 7A and 8A): HOME in SCOOTY JR., their own
  // shuttle collected at the first station, the radio, the locator and the map, the first freight, fuel, the first cache. Not on the
  // lab's own save (its pilot is seeded with money and a cargo). A browser that keeps the opening skipped (src/prefs.js, the golden
  // master's scenarios) starts as it did before the chapter. A loaded save has its own record (World.restore; an older one a veteran's).
  if (game.labFresh && (!LAB_SAVE || FOCUS_RUN)) {
    if (readOpening(saveBackend) === 'skip' && !FOCUS_RUN) skipOpening(world);
    else beginOpening(world);
  }

  // The look the pilot wears (src/looks.js) goes on the grade before the first frame; the page's colours follow it. In the lab,
  // on a review link, `?look=<code or name>` (G1, SPAWN, original ...) owns and wears one, and `?looks=all` owns every look, in
  // the lab's own save: to see each, and what finds them is the game's.
  if (!GAME) {
    if (pageParams.get('looks') === 'all') for (const l of LOOKS) world.pilot.grantLook(l.id);
    const asked = pageParams.get('look')?.toLowerCase();
    const wanted = asked && LOOKS.find((l) => l.id.toLowerCase() === asked || l.name.toLowerCase() === asked);
    if (wanted) { world.pilot.grantLook(wanted.id); world.pilot.wearLook(wanted.id); }
    // `?restored=N` (chat P): the first N ruins counted restored on the lab's own save, to see the presentations they earn on the pause's
    // LAYOUT page (src/widgets.js: the locator's COMPACT at 1); the ruins themselves are not rebuilt in the world.
    const ruins = ruinIdsOf(world.ledger);
    const restored = Math.max(0, Math.min(ruins.length, Math.floor(Number(pageParams.get('restored')) || 0)));
    for (const id of ruins.slice(0, restored)) world.ledger.restored.add(id);
  }
  game.putOnLook();

  // Another tab's load or save is seen here at once, so the pilot is told before playing on.
  window.addEventListener('storage', () => { if (!storage.owns()) saves.warnHeld(); });

  // Two tabs on one save (src/tabs.js, src/tabsPanel.js, tabs-window.js; SX, 2026-10-01): the window and its state are the screens'
  // (labs/graphics/screens.js openTabs); the channel that hears the other tabs is here. And the notices (labs/graphics/notices.js)
  // and the screens (labs/graphics/screens.js) themselves.
  // The opening's beats (labs/graphics/opening-focus.js): the game's FOCUS_DEFAULT, the lab's `?focus=` to compare.
  game.focus = createOpeningFocus(game, GAME ? FOCUS_DEFAULT : readFocusSwitch(pageParams));
  // A talk as a beat of its own (labs/graphics/talk-beat.js, SX's D4C of 2026-10-15): the veil, the world slowed, the speaker's window.
  game.beat = createTalkBeat(game);
  const notices = game.notices = createNotices(game);
  const screens = game.screens = createScreens(game);
  const tabs = typeof env.BroadcastChannel === 'function' && storage.available
    ? watchOlderTabs({
      channel: new env.BroadcastChannel(tabsChannelName(LAB_SAVE ? 'lab' : 'game')),
      id: storage.id,
      onChange: (older, change) => { if (change === 'here') screens.openTabs(); else if (!older.size) screens.tabsClear(); },
    })
    : null;
  window.addEventListener('pagehide', () => tabs?.leave());

  // Cmd+Backspace (or Ctrl+Backspace) erases this browser's save and starts a new pilot: twice within ERASE_WINDOW seconds (save-keeper.js).
  window.addEventListener('keydown', saves.eraseChord, true);

  // The quest list, on the side the locator is not (labs/graphics/quest-list.js, hud-sides.js): the world's quests (src/quests.js), each plate with
  // its own clock on the page's time; a click on one, or Q, turns its pointer on and off.
  const questBoard = game.questBoard = createQuestBoard();
  // SX's editor for the list's place (labs/graphics/sketches/quests.html; SX, 2026-10-02: «Дай мне старый редактор интерфейса
  // чтобы я показал куда поставить квесты на экране»): with `?placeQuests` (the lab only) the list is dragged by its plates, its
  // top left held to 4 px; a press that does not move is a plate's click as ever. The sheet reads the place (SPASER.questPlace)
  // and says it as a line to paste back; `home` is where the game puts the list now (hud-sides.js sidePlaces `quests`).
  const questPlace = game.questPlace = !GAME && pageParams.has('placeQuests') ? {
    at: null, home: null, drag: null, swallow: false, board: questBoard,
    raid: () => !!startRaid(world, null),
    side: (kind) => !!offerSideQuest(world, kind, { here: true }),
  } : null;

  // Menu state is only "has the player dismissed this target". The menu itself is
  // derived from the world every frame, so it can never describe a stale object.
  game.menu = { closed: false, forId: null };
  // The HTML over the canvas follows a resized window too (QA, 2026-09-30: the
  // name field stayed where the card had been, 140 px off): the name field is
  // placed again every frame it is open.
  // (labs/graphics/canvas-fit.js: fitted again at a resize, and at a change of the pixel ratio alone, which no event is promised for.)
  const canvasFit = createCanvasFit({ window, renderer, world });
  window.addEventListener('resize', canvasFit.fit);
  const followPixelRatio = canvasFit.follow;

  // Visual scale follows the speed trend; the rule lives in src/visualScale.js. The hull a little less opaque as it shrinks while it slows
  // (SX, 2026-10-05): CONFIG.ship.visualScale.fade, a fifth (the renderer keeps alpha in sixteenths: it shows as three).
  game.shipScale = createScaleState();

  // H's panel and its log of the last ten seconds of frames (labs/graphics/diagnostics.js): the lab only. It reads the page's parts as
  // `game` holds them when it runs (`framePace` is made below).
  const diagnostics = createDiagnostics(game);

  // ------------------------------------------------------------------ loop ---

  // What the frame carries from one of its functions to the next (PLAN D4, toward createGame): flightFrame, bootFrame, startFlight, the boot
  // plan's callbacks and the boxes the layout reads. Declared here once with the first values, and read and written as `page.<field>`; it is
  // all this file keeps between calls (its one other `let`, `settings`, is read once at the start), so a function that takes `page` and
  // `game` can leave the file as it is.
  const page = {
    last: env.now(),           // ms; the frame stamp the next dt counts from (the boot and the start move it; a flight frame never lets it run back)
    frameDtNow: 1 / 60,        // s; the last frame's raw dt, what game.frameDt() says to the modules
    mouseDamp: false,          // the mouse's brake as the last steps' controls had it (brakeHands.damp reads it in MOUSE + HOTKEYS)
    stuntLandings: 0,          // the landings the world had counted at the last frame: a new one nods the kick
    shipWasAlive: true,        // the ship's life as the last frame left it: the edges of a wreck and of the return
    radioArea: null,           // the radio's box as the last frame drew it (the labels and the windows keep off it)
    titleDrawn: null,          // the title's layout as last drawn, for the pointer
    bootFailed: [],            // sprites that did not load
    bootModelNote: null,       // that the ship's model failed, told once the flight starts
  };
  // Whole fixed steps from the frame times (src/frameClock.js): the same number of
  // steps on every frame of a steady display, so the ship does not judder at speed.
  game.clock = new FrameClock(CONFIG.sim.step, CONFIG.sim.maxStepsPerFrame);
  // An even 60 on a display faster than 60 Hz (src/framePace.js; SX, 2026-10-07: «ровные 60»): on a 120 Hz display the flight draws
  // and steps on every second refresh, so its frames come 16.7 ms apart instead of wandering between 8.3 and 16.7; the frame clock
  // then counts each as two steps, as on a 60 Hz display, where nothing changes. The title draws every refresh (its load is paced by
  // its own budget a frame), and the pace measures the display meanwhile.
  const framePace = game.framePace = new FramePace();

  // The souvenir that hangs from the locator (labs/graphics/charm.js; SX, 2026-10-08): its state, stepped once a frame before the shelf is
  // drawn. `souvenirFocus.hover`: the kind under the pointer (a click opens the pilot card on it), null off it.
  game.charm = createCharm();
  // The ruins' tracker on the deck's left shoulder (labs/graphics/tracker.js; SX, 2026-10-08): its rows follow the ledger, stepped once a
  // frame before the cockpit is drawn; hidden or shown by B or a click on its button, kept in this browser.
  game.tracker = createTracker(saveBackend);
  game.souvenirFocus = { hover: null };
  // The mouse leans the world (labs/graphics/depth.js, CONFIG.depth) and the game draws its own pointer
  // (labs/graphics/cursor.js): the one the pilot wears (src/cursors.js, Pilot.cursor), K the next one owned (a key kept by SX's
  // word, 2026-10-03); `?cursor=C1` (or C0, the system's) shows one without wearing it, until K.
  game.lean = createLean(readLeanSettings(saveBackend));
  const pointer = game.pointer = createCursor();
  game.frameDt = () => page.frameDtNow;
  game.pointerAsked = CURSORS.some((c) => c.code === pageParams.get('cursor')) ? pageParams.get('cursor') : null;
  followCursor();
  // The mouse flies (labs/graphics/mouse-flight.js), and a press that flies kicks the ship toward the pointer on the screen, the brake
  // back against its way (labs/graphics/ship-kick.js). Where the interface's groups stand (labs/graphics/hud-place.js): dragged under
  // P's pause, kept by SAVE LAYOUT; each group's box as the last frame drew it (`boxes`), for the drag, and the one under the pointer.
  game.mouseFlight = createMouseFlight(readMouseReach(saveBackend), 'fire', 'D');
  // How the keys steer (src/steering.js; SX, 2026-10-05): TANK, the default, or SCREEN, GAMEPLAY's STEERING row, kept in this browser.
  game.steering = createSteering(saveBackend);
  // How a friendly ship is greeted and its words drawn (labs/graphics/greeting.js; SX, 2026-10-07): WAVE, the default, or NOTCH, GAMEPLAY's
  // GREETING row, kept in this browser.
  game.greeting = createGreeting(saveBackend);
  feedback.drawGreet = (r, w, item) => drawGreetAnswer(r, w, item, game.greeting.style);
  game.kick = createKick();
  // The drift and the trick drawn, where the lab turned them on (labs/graphics/stunt-fx.js).
  game.stuntFx = createStuntFx();
  // The warning before a heavy hit (SX's 3B; labs/graphics/hit-warning.js): W1 in the game, the lab's `?warn=W2 | W3 | off` to compare.
  game.hitWarning = createHitWarning(readWarnSwitch(GAME ? new URLSearchParams() : pageParams));
  // The skills' one-time hints by the ship (src/skillHints.js; SX, 2026-10-09: «берем Т4 by the shift»): what stands now; what was said is the pilot's.
  game.skillHints = createSkillHints();
  // Which side the locator stands on, the quests and the radio on the other (labs/graphics/hud-sides.js; SX, 2026-10-08: «HUD PLACE: S3 +
  // MIRROR SWITCH»): this browser's, the left unless the pause's SIDES keeps the right. Where the places keep offsets (`hudPlace`) they are
  // for that side.
  game.hudSide = createHudSide(saveBackend);
  // The interface the flight wears and the modern one's locator (labs/graphics/hud-modern.js; SX, 2026-10-16): MODERN with a SQUARE locator
  // unless this browser keeps LEGACY or ROUND (the pause's GRAPHICS > INTERFACE and MAP); what tore off the modern one, falling.
  game.interface = createInterface(saveBackend);
  // Under MODERN the ship stands at the screen's middle, not over LEGACY's helm (src/renderer.js layout; CONFIG.view.modernMiddle); laid
  // again now that the choice is known, and when the pause changes it.
  renderer.shipMiddleOf = () => (game.interface.style === 'modern' ? CONFIG.view.modernMiddle : null);
  // And its centred windows (the pilot card, INFO, the hangar, the controls ...) in the middle of the whole screen, not of LEGACY's flight
  // view over a cockpit band it does not draw (SX, 2026-10-17: «карточка пилота почему-то не по центру экрана она как-то завышена»).
  renderer.windowViewOf = (r) => (game.interface.style === 'modern' ? { x: 0, y: 0, w: r.width, h: r.height } : null);
  renderer.layout();
  game.modernFx = createModernFx();
  // The camera's height over the world (src/zoom.js; SX, 2026-10-17: «камеру чуть повыше взять»): this browser's step, 90 % unless − and = or
  // the pause's GRAPHICS > CAMERA kept another; the lab's `?zoom=100|90|83` one for this load, not kept. The world's layer is fitted to it
  // now (the boot bakes the smoke's rows at its scale), and again with the smoke's rows at once when the pilot changes it, so the first
  // frame at a new height makes no canvas.
  game.zoom = createZoom(saveBackend, GAME ? null : pageParams.get('zoom'));
  fitWorldLayer(renderer, game.zoom.value);
  const zoomed = (moved) => {
    if (!moved) return false;
    fitWorldLayer(renderer, game.zoom.value);
    warmSmoke(renderer, CONFIG);
    if (game.pause?.state?.toy) game.pause.state.toy.ship.measured = false;     // (the toy's ship drawn at it: its disc measured again)
    return true;
  };
  game.setZoom = (value) => zoomed(setZoom(game.zoom, value, saveBackend));
  game.stepZoom = (dir) => zoomed(stepZoom(game.zoom, dir, saveBackend));
  // The windows' frames and rules in the Swiss manner (src/frames.js; SX, 2026-10-09): GRAY unless this browser keeps TINTED (the pause's GRAPHICS > FRAMES).
  loadFrames(saveBackend);
  const hudPlace = createHudPlace(saveBackend);
  game.hud = { place: hudPlace, boxes: {}, hover: null };
  // The centred windows keep clear of the HUD's two columns as last drawn (src/uiGrid.js centredWindow; SX, 2026-10-04: «когда карточка
  // пилота открывается она упирается в рамку квестов»; the right column too since the quests stand there, 2026-10-08).
  renderer.clearLeftOf = (r) => leftColumnEdge(game.hud.boxes, r.width, page.radioArea);
  renderer.clearRightOf = (r) => rightColumnEdge(game.hud.boxes, r.width, page.radioArea);
  // The radio under the quests (labs/graphics/radio.js, SX's H1 SIDEWAYS, 2026-10-06): what it heard last, whether it is hidden to its row
  // (this browser's), and where it was drawn last frame (the labels keep off it).
  game.radio = createRadio(saveBackend);
  // The controls' mode (labs/graphics/schemes.js; the new layout only), and the keyboard's focus (key-focus.js): the notice Enter acts
  // on wears the focus's look while the keys hold the pointer (labs/graphics/notices.js reads `keysOnly`).
  const schemes = game.schemes = createSchemes(game);
  game.keysOnly = () => schemes.keysOnly();
  const keyFocus = game.keyFocus = createKeyFocus(game);
  // The keys and the pointer (labs/graphics/input-router.js): its listeners go on here, in the order the page always added them.
  const router = game.router = createInputRouter(game);
  router.install();

  // The flight's frame and the interface's drawing order (labs/graphics/flight-frame.js, cut from this file in PLAN D4): it reads the page's parts
  // through `game` and the frame's state through `page`; what the boot and the save also use is handed in.
  const flightFrame = createFlightFrame(game, page, { saves, diagnostics, respawnFx, followPixelRatio, followCursor });

  // ------------------------------------------------------------------ boot ---

  // The title, the load behind it and the flight's start (labs/graphics/page-boot.js, cut from this file in PLAN D4): it reads the page's parts
  // through `game` and the frame's state through `page`; what the save and the frame also use is handed in.
  const { title, plan, bootFrame, leave } = createPageBoot(game, page, { saves, respawnFx, followPixelRatio, followCursor },
    { window, now: env.now, fetch: env.fetch, base: env.base, createCanvas: () => document.createElement('canvas') });

  // The frame loop (labs/graphics/frame-loop.js): behind the title the boot's frame, else one flight frame, a fault in it costing that frame
  // and not the game.
  const frame = createFrameLoop({ title, framePace, bootFrame, flightFrame, input, schedule: env.requestAnimationFrame });
  env.requestAnimationFrame(frame);

  // Handy from the console, and what tools/flight-probe.mjs reads; `questPlace` is the quest sheet's editor's (`?placeQuests`); `pointer`,
  // `schemes` and `keyFocus` the controls' (chat C: the drawn pointer, the mode in use, the keyboard's focus).
  window.SPASER = { world, renderer, CONFIG, TAU, presentation, unassignedMaterials, title, plan, sound, crt, questPlace, notices, questBoard, pointer, schemes, keyFocus, framePace };
  // The HUD's groups as the last frame drew them (`boxes`, hudPlaceBoxes): what checks/page-smoke.mjs reads of what a new pilot is shown.
  window.SPASER.hud = game.hud;
  window.SPASER.focus = game.focus;
  // The ship's look (src/shipLooks.js): what is worn, and wear(id), for a check or a look in the console.
  window.SPASER.shipLook = game.shipLook;
  // The charm that hangs from the locator (labs/graphics/charm.js: its box as drawn, what it is) and the side the locator stands on.
  window.SPASER.charm = game.charm;
  window.SPASER.hudSide = game.hudSide;
  // The ruins' tracker on the deck's shoulder (labs/graphics/tracker.js: its rows, whether it is hidden, the box it was drawn in).
  window.SPASER.tracker = game.tracker;
  // The skills' one-time hints (src/skillHints.js): the one that stands, how long a turn and an open sky have been held (the golden master's traces read it).
  window.SPASER.skillHints = game.skillHints;
  // The screens, the pause, a talk's beat and the menu's state: what tools/click-audit.mjs reads before and after a click.
  Object.assign(window.SPASER, { screens: game.screens, pause: game.pause, beat: game.beat, menu: game.menu, lean: game.lean });

  // Nothing is saved while only the title has been up: the world has not run (labs/graphics/page-boot.js).
  window.addEventListener('pagehide', leave);

  // The cockpit's glints and wear, its shake and its pieces: tried in the lab first (SX, 2026-10-01: «в лабе версию»),
  // in the game too since SX accepted them («Кабина отличная ... Все прям можно принимать»); the drawer still turns them
  // off in the lab. Set here, before the lab's branch: inside it the game never had them (SX, 2026-10-01: «у меня не
  // ломается консоль ... Когда я разбиваюсь, она не трясется ... На ней нет блика»).
  COCKPIT_FX.wear = COCKPIT_FX.shake = true;

  if (GAME) {
    document.documentElement.dataset.labOpen = 'false';
  } else {
    // The lab's drawer (labs/graphics/lab-drawer.js).
    installLabDrawer(game);
  }

  return game;
}
