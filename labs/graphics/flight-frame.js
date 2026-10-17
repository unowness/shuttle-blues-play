// The flight's frame and the interface's drawing order, cut from labs/graphics/main.js (PLAN D4, toward createGame): the frame's steps (the keys, the
// clock and the world's steps, the radio's and the notices' events, the saves), the world drawn, then each group of the interface in its order (the
// flight's labels, the locator, the cockpit, the helmet, the quests and the radio, the pop-ups, the pause), the cursor, the screen filter; and the
// helpers only the frame uses (the groups' wipes and boxes, the pirates' arrows, the marks and windows of an object, the ship's visual scale).
//
// It is handed the page's parts as `game` (read when the frame runs, as every module cut from main.js does), `page` (the frame's state between
// calls: main.js declares it) and, of what the boot and the save also use, `saves`, `diagnostics`, `respawnFx`, `followPixelRatio` and
// `followCursor`. It returns the frame, `flightFrame(now)`; main.js hands it to the frame loop (labs/graphics/frame-loop.js).
import { CONFIG } from '../../src/config.js';
import { drawLabTopStrip, nearbyBearings, bearingMemory, locatorBounds, legendCovers } from './locator.js';
import { lap, timed, flushing, frameDone } from '../../src/frameProfile.js';
import { textShadowed, setTextShadowLean } from '../../src/textShadow.js';
import { syncQuestBoard, drawQuestBoard, QUEST_TONES } from './quest-list.js';
import { currentQuests, questTone } from '../../src/quests.js';
import { drawLabCockpit } from './hud.js';
import { drawScootyDeck } from './scooty-deck.js';
import { flyingLoaner } from '../../src/loaner.js';
import { stepCharm } from './charm.js';
import { stepTracker } from './tracker.js';
import { COCKPIT_FX, damageLevel, wearCockpit, shakeOffset, drawPieces, steerLight, mendCockpit, crackShape, drawCracked } from './cockpit-fx.js';
import { keepFrame, startRespawn, respawning, handsOff, drawReboot, drawRisingShip, scrambleOf } from './respawn-fx.js';
import { drawContextPlates, shipOverPlate, PLATE } from './context.js';
import { selectedTask, markedQuests, boardQuests } from '../../src/tasks.js';
import { menuOpen, standShare } from '../../src/interaction.js';
import { GUIDE_PLATE, noticeRect } from './notice.js';
import { ROLES } from '../../src/roles.js';
import { STAR_ROLES, STAR_PINK } from './world-art.js';
import { clamp } from '../../src/util.js';
import { deliveryNavigation, exitNavigation, homeNavigation, questNavigation } from '../../src/navigation.js';
import { courseOf } from '../../src/course.js';
import { stepScale, brakeShade } from '../../src/visualScale.js';
import { jumpSpeedHeld } from '../../src/trick.js';
import { surfing } from '../../src/drift.js';
import { guideOf, drawObjectFocus } from '../../src/interface.js';
import { viewArea } from '../../src/rim.js';
import { drawRimMarks, playArea } from './rim-marks.js';
import { noteVisit, drawWorldFlags, FLAGS } from './map-screen.js';
import { UI } from '../../src/uiGrid.js';
import { stepLean, drawDust } from './depth.js';
import { stepKick, putKick, liftKick, nodKick } from './ship-kick.js';
import { stepStuntFx, drawStuntFx, deckShift, scaleOf } from './stunt-fx.js';
import { HELM_FX } from './vector-helm.js';
import { stepHitWarning, warnGauge, warnLamp, drawWarnMark } from './hit-warning.js';
import { stepSkillHints, settled, heldOn } from '../../src/skillHints.js';
import { drawSkillHint } from './skill-hint.js';
import { stepPointed, pointedMenu } from './world-pointer.js';
import { beginNotes, endNotes, noteDuring, muteNotes } from './clicks.js';
import { hoverFrame, hoverReach, itemUnder, hoverEntered } from '../../src/hover.js';
import { offsetOf, shifted, settleHudPlace, safeArea, lookOf } from './hud-place.js';
import { sidePlaces } from './hud-sides.js';
import { listenRadio, listenQuests, drawRadio, radioPlace, radioSize, deckFloor } from './radio.js';
import { interfaceGiven } from '../../src/opening.js';
import { stepCursor, drawCursor, cursorSleep } from './cursor.js';
import { cornerTile } from './ui-parts.js';
import { drawHelmet } from './helmet.js';
import { drawModernHud, wearNotch, stepModernFx, MODERN_HOLD } from './hud-modern.js';
import { hungCharm } from './charm.js';
import { fitWorldLayer, inWorld } from '../../src/zoom.js';

export function createFlightFrame(game, page, { saves, diagnostics, respawnFx, followPixelRatio, followCursor }) {
  const { world, renderer, input, crt, sound, canvas, feedback, ghost, presentation, notices, screens, pause, router, schemes, keyFocus, questBoard,
    questPlace, radio, charm, tracker, kick, lean, pointer, stuntFx, hitWarning, skillHints, hudSide, menu, clock, framePace, shipScale, persist } = game;
  const hudPlace = game.hud.place;

  const pageTime = () => performance.now() / 1000;

  function updateShipScale(dt) {
    const ship = world.ship;
    const m = ship.model;
    if (m.baseScale === undefined) m.baseScale = m.scale;
    const speed = Math.hypot(ship.vx, ship.vy);
    // A jump has the speed while it is up and as the top's lift is taken back after the contact (src/trick.js): a landing is not a
    // brake, and Space in the air swings the tail.
    const held = jumpSpeedHeld(world);
    // (The glide, G1, is no brake: src/drift.js surfing.)
    const braking = brakeHands.damp && !world.docked && !held && !surfing(world);
    const factor = stepScale(shipScale, speed, dt, CONFIG.ship.visualScale, ship.alive, braking, held);
    presentation.shipShade = brakeShade(factor, CONFIG.ship.visualScale);
    presentation.shipBraking = braking;
    const next = m.baseScale * factor;
    if (Math.abs(next - m.scale) > 1e-4) {
      m.scale = next;
      ship.measureDrawing(renderer.cellW, renderer.cellH);
    }
  }

  // ------------------------------------------------------------------- hud ---

  // A pirate beyond the flight area gets an arrow on the rim (rim-marks.js), on its bearing, in the hostile ink: a shot should never
  // come from nowhere. An arrow only, no box under it (SX, 2026-10-02); the locator carries the rest. Pirates flying away get none.
  const PIRATE_EDGE_RANGE = 2400;   // u; farther ones are the locator's business
  function pirateEdges(r) {
    const v = r.view, out = [];
    const ship = world.project(r, world.ship.x, world.ship.y);
    for (const p of world.pirates) {
      if (p.mode === 'leave') continue;
      const at = world.project(r, p.x, p.y);
      if (at.x >= v.x && at.x <= v.x + v.w && at.y >= v.y && at.y <= v.y + v.h) continue;
      const dist = Math.hypot(at.x - ship.x, at.y - ship.y);
      if (dist > PIRATE_EDGE_RANGE * r.zoom || dist < 1) continue;
      out.push({ id: p.id, at });
    }
    return out;
  }

  // Things that belong to the sky rather than to the panel: state the pilot
  // reads while looking where they are going.
  // The ship's controls let go: what the flight reads while a pop-up stands over it (the world is not paused).
  const IDLE_CONTROLS = Object.freeze({ thrust: false, retro: false, turn: 0, damp: false, fire: false });
  // The brake as the page shows it (the hull's brake look, the helm's lamp, the heavy hit's warning): Space where the keys fly, the
  // mouse's brake (the last steps' hands) in MOUSE + HOTKEYS, where Space is the jump. One object, its one field set each frame.
  const brakeHands = { damp: false };
  // The hover's sound (U1): when it was last heard, and how often at most (a sweep across a list is a few, not one a row).
  const HOVER_SOUND_GAP = 0.06;
  let hoverHeard = -Infinity;
  // The controls the world was last stepped with (the skills' hints read the turn and the fire key of them: src/skillHints.js), and the keys
  // the first flight's cross reads as they are held (its four, whatever the steering makes of them).
  let flown = IDLE_CONTROLS;
  const heldKeys = heldOn(input);
  function drawViewportOverlay(r) {
    const ship = world.ship;

    // WRECKED is the task slot's while the ship is gone (labs/graphics/notices.js, chat B 2026-10-04: every status above the top
    // of the screen is one system); it stood here, under the notice, on a line of its own.

    // A faint pointer to the strongest nearby well, so gravity is legible.
    // Immediate, not queued: the bucket flush has already happened.
    const g = world.gravityAt(ship.x, ship.y);
    const gMag = Math.hypot(g.x, g.y);
    if (gMag > 14 && ship.alive) {
      const a = Math.atan2(g.y, g.x);
      for (let i = 1; i <= 4; i++) {
        const rr = (46 + i * 11) * r.zoom;                   // (round the hull as drawn: src/zoom.js)
        r.glyphNow('·', r.cx + Math.cos(a) * rr, r.cy + Math.sin(a) * rr,
          ROLES.structure, clamp(gMag / 320, 0.08, 0.7) * (1 - i * 0.14));
      }
    }
  }

  // What the gray marks showed and since when each newcomer has been picked (locator.js nearbyBearings: a mark keeps its place against
  // one picked for a moment, so it does not hide and come back where it stood).
  const nearbyHeld = bearingMemory();
  // The quests whose marks stand in the sky this frame (src/tasks.js markedQuests) and their ids for the list's arrows: kept arrays.
  const MARKED = [], MARKED_IDS = [];
  const markedIds = () => { MARKED_IDS.length = 0; for (const q of markedQuests(world, questBoard, MARKED)) MARKED_IDS.push(q.id); return MARKED_IDS; };

  // The corners on the thing in reach show only while the ship stands (SX's B1 LOCK WHEN SLOW on labs/graphics/sketches/marks-strategy.html,
  // 2026-10-07: «MARKS: A1, B1, C0»): they close in on it from a row out as the ship comes to stand (src/interaction.js shipStands, the
  // moment its window comes), in the windows' fade, and go in it once the ship flies; the cargo on the tether keeps its corners whatever
  // the ship does. The gray marks on the rim no longer go with them: SX flew it the same day and saw them blink (the ship's standing
  // changes every time it slows past 200 u/s or speeds past 236): «метки плохо, они моргают, давай не скрывать их».

  // Contextual menu. Drawn flat and opaque over the world: no blur, no border
  // glow, no shadow. It is derived from the world every frame rather than stored,
  // so it cannot describe an object that has moved away or stopped existing.
  // `area`: the play area the marks' ellipse is inset in (rim-marks.js playArea).
  function drawInteraction(r, avoid = [], area = viewArea(r.view)) {
    const target = world.selected;
    const near = standShare(world, PLATE.fadeIn, feedback.reducedMotion);
    drawObjectFocus(r, world, target, feedback, near);
    const occupied = [...avoid];
    // Under P's pause the screen is the layout's and the settings' (labs/graphics/hud-place.js, volume-panel.js): no object's menu.
    const open = menuOpen(target, menu.closed, world.docked) && !pause.pauseShown();
    // Every mark at the edge of the flight rides one ellipse (rim-marks.js; SX, 2026-10-07: «метки аккуратно крутятся вдоль его
    // границы»): the routes' pointers, the gray distance marks of what is near (SX, 2026-10-03: «не у корабля, а с краю ... не белые, а
    // серенькие»), the pirates' arrows. They glide along it and nothing pushes them off it (SX, 2026-10-07: «не задевают за углы, а
    // плавно едут по овалу»): they are drawn first, under the windows, as the whole of the flight's labels is under the interface.
    const guideArgs = { reducedMotion: feedback.reducedMotion, plate: GUIDE_PLATE };
    // In O-08 with no route of its own, the way out (src/navigation.js exitNavigation).
    const guides = [guideOf(r, world, { ...guideArgs, route: exitNavigation(world) })];
    // The quests whose marks stand in the sky (src/tasks.js markedQuests): every quest (SX, 2026-10-09), beside the cargo's (P3).
    const marked = markedQuests(world, questBoard, MARKED);
    // The selected quest's pointer is the one at full light, the others dimmed, and it pings as it is selected (src/tasks.js MARK_FOCUS:
    // SX's M3 PING, 2026-10-08).
    let active = null;
    for (const quest of marked) {
      const g = guideOf(r, world, { ...guideArgs, route: questNavigation(world, quest) });
      if (g && quest.id === questBoard.activeId && questBoard.auto !== quest.id) active = g.key;     // (the chapter's own selection dims nothing)
      guides.push(g);
      // A second place a quest keeps marked (src/opening.js `also`: the ruin beside the repair droid), in its own pointer.
      if (quest.also) guides.push(guideOf(r, world, { ...guideArgs, route: questNavigation(world, quest.also) }));
    }
    // G: the way home (src/navigation.js homeNavigation), beside whatever else the pilot is following.
    if (world.homeGuide) guides.push(guideOf(r, world, { ...guideArgs, route: homeNavigation(world) }));
    // The object the cargo bearing already leads to gets no second marker, nor one a quest's pointer leads to.
    const destination = deliveryNavigation(world);
    const bearings = nearbyBearings(world, nearbyHeld).filter((d) => d.id !== destination?.targetId && !marked.some((q) => q.target?.mark === d.id || q.also?.target?.mark === d.id));
    occupied.push(...drawRimMarks(r, { area, guides, bearings, pirates: pirateEdges(r), time: world.time,
      reducedMotion: feedback.reducedMotion, ship: world.project(r, world.ship.x, world.ship.y), active, clock: world.ledger.clock }));
    // Its window (context.js) comes once the ship has stood by its object half a second, on an arc round it, and the one before it
    // goes; a menu closed or the pause takes them at once. Beside it, the window of what the pointer is over (SX, 2026-10-04: a hover
    // shows the context window; world-pointer.js pointedMenu), shown, not used. Over the marks.
    const hover = pause.pauseShown() ? null : pointedMenu(world);
    occupied.push(...drawContextPlates(r, world, open && !game.beat.shown() ? target : null, avoid, { dismissed: !!target && !open, reducedMotion: feedback.reducedMotion, hover, area,
      greeting: game.greeting.style }));
    return occupied;
  }

  // The groups' boxes as drawn now: the locator with its legend, the quest list under it (a block of its own, SX 2026-10-02:
  // «локатор отдельным блоком ... со скрывающейся легендой. Квесты отдельным блоком»), the shelf, and where a notice comes in (a
  // two-line notice's box when none is up). The task's line stays in the helmet's notch (S8): no box to drag.
  function hudPlaceBoxes(layout) {
    const sample = { title: "NOTICES APPEAR HERE", sub: 'DRAG TO MOVE', kind: 'news' };
    // The quests' column: the radio on top (its row and picture as drawn) and the list under it, its head (R QUESTS) and its plates
    // (labs/graphics/quest-list.js); one group, so LAYOUT holds the radio on the screen with the list.
    const list = questBoard.box, radioBox = page.radioArea;
    const quests = list && radioBox ? { x: Math.min(list.x, radioBox.x), y: Math.min(list.y, radioBox.y), w: Math.max(list.x + list.w, radioBox.x + radioBox.w) - Math.min(list.x, radioBox.x),
      h: Math.max(list.y + list.h, radioBox.y + radioBox.h) - Math.min(list.y, radioBox.y) } : list ?? radioBox;
    // (Only what the opening has given, src/opening.js interfaceGiven: the editor never offers what a new pilot lacks.)
    const given = interfaceGiven(world);
    return { column: given.column ? shifted(locatorBounds(renderer), hudAt.column) : null, quests: given.quests ? quests ?? null : null,
      header: null, shelf: given.shelf && layout?.shelf?.h > 0 ? layout.shelf : null,
      notice: notices.currentNoticeRect() ?? shifted(noticeRect(renderer, sample), offsetOf(hudPlace, 'notice')) };
  }
  // A panel coming in with the beat that gives it (labs/graphics/opening-focus.js, the lab's ?focus=F2 and F3): drawn inside a wipe over
  // its place `box` (screen px; `offset`, the translation the drawing stands under), from the top down, or from the middle out (`across`).
  // Outside its reveal it is drawn as it is. Its corner marks stand off it by a step of the vector grid, an arm as long.
  function wiped(panel, box, draw, { across = false, offset = null } = {}) {
    const p = game.focus.wipe(panel);
    if (p === null || !box) return draw();
    const ctx = renderer.ctx, W = renderer.width, H = renderer.height, ox = offset?.x ?? 0, oy = offset?.y ?? 0;
    ctx.save();
    ctx.beginPath();
    if (across) { const half = (box.w / 2) * p; ctx.rect(box.x + box.w / 2 - half - ox, -H, 2 * half, 3 * H); }
    else ctx.rect(-W, -H, 3 * W, H + box.y + box.h * p - oy);
    ctx.clip();
    try { return draw(); } finally { ctx.restore(); }
  }
  const BEAT_MARK = Object.freeze({ air: UI.vector.space, arm: UI.vector.space });
  const inflateBox = (b, d) => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });

  // Where each group stands this frame: the sides' place and the offset LAYOUT added (kept, rewritten each frame; nothing is made a frame).
  // `column` the locator's translate, `list` the quest list's top left, `shelf` the shelf's from its own place (the top right).
  const hudAt = { column: { x: 0, y: 0 }, list: { x: 0, y: 0 }, shelf: { x: 0, y: 0 } };
  const cockpitShift = { shelf: hudAt.shelf, header: null };

  // Where the radio stands this frame (radio.js radioPlace): on top of the quests' column (SX, 2026-10-08: «ты радио сделай сверху, а
  // список квестов под ним»), its row on the sides' top row with the quests' offset LAYOUT added; its picture folds into its row where it
  // would reach the cockpit (`layout`, the deck as drawn this frame). `sides` labs/graphics/hud-sides.js sidePlaces, `listShift` the
  // quests' offset. The list hangs under it (flightFrame).
  function radioPlaceNow(layout, sides, listShift) {
    if (!sides.laid) return null;
    const q = sides.quests, dx = listShift.x, left = q.left + dx;
    return radioPlace(renderer, { x0: q.x0 + dx, edge: q.edge + dx, left, rowTop: q.y + listShift.y, mirror: q.mirror,
      floor: deckFloor(layout, left, left + radioSize(renderer).w, renderer.width, renderer.height) });
  }

  // Only the interface's text casts a shadow (SX, 2026-10-06: «давай еще вообще уберем наши эффекты тени, которые мы под интерфейсом
  // рисуем, нужен явно простой оптимизированный шаг», then «нам по сути только тень тексту нужна»): each group is drawn once, straight,
  // and its strings each with a black copy 4 px toward the screen's middle (src/textShadow.js; `group` below). Until then every group
  // was recorded and played twice, every shape of it in black under it (labs/graphics/sketches/hudShadow.js, on disk and drawn by no game code since),
  // with J and the pause's UI SHADOW to choose its style; a kept choice in this browser (PREFS.hudShadow) is not read.

  // A group of the interface, drawn once and straight, its strings with their shadow (src/textShadow.js), as a section `name` of H's
  // profiler (src/frameProfile.js); what `draw` returns.
  function group(name, r, draw) {
    return timed(name, () => textShadowed(r, draw));
  }

  function flightFrame(now) {
    followPixelRatio();
    // The camera's height (src/zoom.js; the pilot's −, = and GRAPHICS > CAMERA): the world's layer fitted to the page's measures as they
    // are now, before the camera follows (a docked station is held in the screen's middle, in units) and the pointer is read.
    const layer = fitWorldLayer(renderer, game.zoom?.value ?? 1);
    // H's per-effect profiler goes on and off with the diagnostics (the lab only).
    diagnostics.follow();
    // Under the pause the toy's ship is the ship (pause-toy.js): the world's is not drawn while it stands in for it.
    presentation.shipHidden = (!!pause.state.toy && pause.pauseShown()) || respawning(respawnFx, pageTime());
    const t0 = performance.now(), gapMs = now - page.last;
    // The start sets `page.last` after its own work (startFlight), and the first flight frame's timestamp
    // can be older than that: the browser stamps a frame when it begins, and the start key, with the
    // sound's 0.3 s first start, is handled inside it. So the frame time never runs backwards: that
    // frame runs nothing, and the next counts from the start, not from the stale stamp (measured
    // 2026-10-01: from the stamp it was 275 ms, eight catch-up steps at once).
    const rawDt = Math.max(0, Math.min(0.25, (now - page.last) / 1000));
    page.last = Math.max(page.last, now);
    diagnostics.tick(rawDt);

    pause.playOnAfterPause();
    // KEYS + CLICKS (labs/graphics/schemes.js): a pointer faded by its own rule sleeps and lets go of what it was over (C0 conflict 5).
    // Then the keys' focus, on the last frame's boxes (labs/graphics/key-focus.js): a quest plate's, a window's walk.
    if (schemes.rests(pointer, now)) cursorSleep(pointer);
    keyFocus.step();
    // The pause let go: the camera carries the world under the toy's ship meanwhile (ship-kick.js carryKick; flightFrame).
    if (pause.state.leave) { liftKick(world, kick); stepKick(kick, rawDt, { still: feedback.reducedMotion }); putKick(world, kick, renderer.zoom); }
    if (!game.labOpen) router.gameKeys();
    if (screens.tabLocked()) world.holdPause('tab-locked');
    // The map knows the sectors the pilot has been in (the hidden one is never on it).
    if (world.sector && !world.sector.hidden) noteVisit(screens.map, world.sector.id, world.ledger);
    // P's pause, and a tab paused for good, put the sound to sleep, the score too (src/audio.js).
    sound.sleep((pause.state.keyPause && world.paused && pageTime() > pause.state.soundPreviewUntil) || screens.tabLocked(), 'paused', { after: 0.15 });
    screens.stepMessages(rawDt);

    // Fixed timestep: the simulation always advances in equal slices, so the
    // physics behaves the same on a 60Hz and a 144Hz display. The clock decides how
    // many slices this frame runs and carries the leftover; the camera moves by the
    // time those slices covered, so the ship and the view advance together.
    brakeHands.damp = schemes.scheme() === 'M' ? page.mouseDamp : Boolean(input.damp);
    if (!world.paused && !game.labOpen) {
      // (At the opening's slow beat, F3, a frame runs fewer of the world's steps: labs/graphics/opening-focus.js.)
      // (A talk's beat, labs/graphics/talk-beat.js, slows the world the same way while its line stands.)
      game.beat.step();
      const steps = game.beat.steps(game.focus.steps(clock.advance(rawDt)));
      // A pop-up does not pause the game (SX, 2026-10-02: «давай на паузу игру при поп апах не ставить»): the world flies
      // on under it, the ship with its controls let go, so the keys a screen reads (arrows, digits) do not fly it.
      const controls = flown = screens.anyScreen() || game.beat.shown() || handsOff(respawnFx, pageTime()) ? IDLE_CONTROLS : router.flyControls();
      page.mouseDamp = !!controls.damp;
      // The kick's camera is the drawing's: the world steps and the camera follows from where it truly is.
      liftKick(world, kick);
      for (let i = 0; i < steps; i++) world.step(CONFIG.sim.step, controls);
      world.updateCamera(layer, clock.frameDt(rawDt) * game.focus.pace() * game.beat.pace());
      updateShipScale(rawDt);
      // A drift is not a brake on the camera (it leans out of the turn instead), nor is Space up in a jump.
      const drifting = world.drift && world.drift.side ? world.drift : null;
      let lean = null;
      if (drifting) { const out = Math.atan2(world.ship.vy, world.ship.vx) - drifting.side * Math.PI / 2; lean = { x: Math.cos(out), y: Math.sin(out) }; }
      if (world.stunts && (world.stuntLog?.landings ?? 0) > page.stuntLandings && !feedback.reducedMotion) nodKick(kick);
      page.stuntLandings = world.stuntLog?.landings ?? 0;
      stepKick(kick, rawDt, { braking: !!controls.damp && world.ship.alive && !world.drift && !world.ship.airborne, vx: world.ship.vx, vy: world.ship.vy,
        still: feedback.reducedMotion, drift: lean });
      putKick(world, kick, renderer.zoom);
    }
    if (world.stunts) stepStuntFx(stuntFx, world, renderer, world.paused || game.labOpen ? 0 : rawDt, { reducedMotion: feedback.reducedMotion });
    if (!world.paused && !game.labOpen) {
      stepHitWarning(hitWarning, world, { braking: brakeHands.damp && !world.drift, reducedMotion: feedback.reducedMotion, sound, panel: stuntFx.panel });
      // The skills' one-time hints (src/skillHints.js): each said once in the whole game, by the ship; what was said is the pilot's, saved as it is.
      if (!settled(skillHints, world)) {
        stepSkillHints(skillHints, world, { braking: brakeHands.damp, controls: flown, warning: hitWarning.threat, dt: rawDt,
          still: feedback.reducedMotion, frozen: screens.anyScreen(), scheme: schemes.scheme(), screen: screens.open, display: crt?.mode ?? null,
          held: heldKeys });
        if (skillHints.changed) { skillHints.changed = false; persist('taught'); }
        // A hint its deed ended: the skill is answered (T1).
        if (skillHints.learned) { skillHints.learned = null; sound.play('learned'); }
      }
    }
    const tSim = performance.now();

    // The frame's events as the radio hears them, before the notices drain them.
    listenRadio(radio, world.events, pageTime());
    notices.handleEvents();
    // The quests come and ended as the radio hears them (a wave in yellow, green or red: SX, 2026-10-08), at the board's own time.
    const boardNow = pageTime();
    syncQuestBoard(questBoard, boardQuests(world), notices.outcomes, boardNow);
    listenQuests(radio, questBoard, boardNow);
    feedback.step(world.paused || game.labOpen ? 0 : rawDt);
    sound.update(world, screens.anyScreen() ? IDLE_CONTROLS : router.hands(), rawDt, { active: !world.paused && !game.labOpen });
    ghost.step(world.paused || game.labOpen ? 0 : rawDt);
    saves.tellNotes();
    // An event's notice waits while the game does (P, a screen); a note from the page does not.
    screens.settleGarageRoom();
    notices.age(rawDt);
    // The respawn is where a wreck is saved (persist does not save a wreck). It comes back near its wreck (src/world.js): the camera
    // is there at once and the screen is redrawn over it (respawn-fx.js), the deck whole again; the ship comes up and stays
    // untouchable as long again as the return takes (the world sets that, CONFIG.ship.respawnInvuln, the same with or without the
    // animation: reduced motion skips the sweep and the rise, not the protection).
    if (world.ship.alive && !page.shipWasAlive) {
      persist('respawn');
      world.cam.x = world.ship.x; world.cam.y = world.ship.y;
      mendCockpit();
      if (!feedback.reducedMotion) startRespawn(respawnFx, pageTime());
    }
    // A wreck's wait keeps a frame of its own (the copy below, at the frame's end).
    if (!world.ship.alive && page.shipWasAlive) respawnFx.kept = false;
    page.shipWasAlive = world.ship.alive;
    // Back from a wreck it stands mixed and is put back while it cannot be hurt, in place of the blink (labs/graphics/ship-scramble.js).
    presentation.shipScramble = scrambleOf(respawnFx, world.ship);

    // Checkpoint on a timer as well as on outcomes, so a long flight is not lost.
    saves.tick(rawDt);

    // A dismissed menu stays dismissed only for the target it was dismissed for.
    if (world.selected?.id !== menu.forId) { menu.forId = world.selected?.id ?? null; menu.closed = false; }

    const tWorld0 = performance.now();
    page.frameDtNow = rawDt;
    // The mouse's lean, none for reduced motion. Under a pop-up it goes on (SX, 2026-10-16: «я бы не делал параллакс внутри окон ... Скорее просто
    // параллакс окна относительно фона должен быть»): the window stands still over the world leaning behind it; until then the lean went back to
    // the middle there. The lab's drawer still calms it.
    world.lean = stepLean(lean, rawDt, renderer, { calm: game.labOpen, still: feedback.reducedMotion });
    // The text's shadow slides with it, as the world behind the interface does (src/textShadow.js).
    setTextShadowLean(world.lean);
    // What the pointer is over in the world: its window shows (world-pointer.js, drawInteraction).
    stepPointed(world, pointer.inside ? router.worldPointAt(pointer.x, pointer.y) : null);
    renderer.begin();
    presentation.prepare();
    // The stars on the screen as it is, then the world on its layer under the camera's height (src/zoom.js): the stars are infinitely far.
    world.drawSky(renderer);
    renderer.flushPart();
    inWorld(renderer, (v) => {
      world.draw(v, false);
      // The drift's and the trick's smoke, sparks and rings go with the world's glyphs (labs/graphics/stunt-fx.js).
      lap('stunt fx');
      if (world.stunts) drawStuntFx(v, world, stuntFx);
      lap('ghost');
      ghost.draw(v, world);
      flushing(renderer);
      v.flush();
    });
    // The dust before the world, near the eye, on the screen as it is.
    lap('dust');
    drawDust(renderer, world, world.lean, world.sector?.hidden ? STAR_PINK[1] : STAR_ROLES[1]);
    lap('marks');
    // The flight a step darker behind the interface at the opening's slow beat (F3).
    const beatDim = game.focus.dim();
    if (beatDim > 0.004) renderer.fill(0, 0, renderer.width, renderer.height, CONFIG.render.background, beatDim);
    inWorld(renderer, (v) => {
      // A heavy hit ahead ringed in the world (W3 only; labs/graphics/hit-warning.js).
      drawWarnMark(v, world, hitWarning);
      // The map's flags standing in space (map-screen.js), the same mark as on the map and the locator.
      drawWorldFlags(v, world, pageTime(), { reducedMotion: feedback.reducedMotion });
      // The ship coming back up (respawn-fx.js), by itself while the world's is hidden.
      if (respawning(respawnFx, pageTime()) && world.ship.alive) {
        const at = world.project(v, world.ship.x, world.ship.y);
        drawRisingShip(v, respawnFx, pageTime(), world, at.x, at.y, { reducedMotion: feedback.reducedMotion });
      }
    });
    lap(null);
    const tWorld = performance.now();
    // The interface answers the pointer from here on (src/hover.js sinks what is under it, labs/graphics/clicks.js
    // notes its keys for the clicks): the flight's groups only while no pop-up and no pause stand over them.
    const hudAnswers = !screens.anyScreen() && !pause.pauseShown();
    beginNotes();
    muteNotes(!hudAnswers);
    hoverFrame(pointer, rawDt, { reducedMotion: feedback.reducedMotion });
    hoverReach(hudAnswers);
    // The pointer come onto a button: its breath of a click (U1), at most one in HOVER_SOUND_GAP s.
    if (hoverEntered() !== null && performance.now() - hoverHeard >= HOVER_SOUND_GAP * 1000) { hoverHeard = performance.now(); sound.play('hover'); }
    // Each group of the interface drawn once (`group`): this one, the locator, the cockpit, the quests, the labels and arrows in the
    // flight, the notice.
    group('overlay', renderer, drawViewportOverlay);
    // The interface the pilot wears (labs/graphics/hud-modern.js, the pause's GRAPHICS > INTERFACE): MODERN draws its own groups in place of
    // the deck, the helmet, the locator's column, the shelf, the radio and the quests below, and the helmet's geometry (the task's line, the
    // notices under it) follows its notch from here on.
    // On SCOOTY JR. (the opening's loaner, or the STANDARD wearing it after the opening, src/shipLooks.js scooter): its handlebar, the marks
    // of the targets on the rim, an object's window and the skills' hints, and nothing else of the interface, the notices none (SX,
    // 2026-10-16: «когда на самокате едем можешь показывать только руль самоката и метку на карте, вообще никакого интерфейса не надо
    // больше ну и обучение управлением»; the texts too, his answer the same day). The notices age unseen meanwhile (notices.age above).
    const scooter = flyingLoaner(world) || !!game.shipLook?.scooter?.();
    const modern = !scooter && game.interface?.style === 'modern';
    wearNotch(renderer, modern);
    // Where each group stands: the sides' place (labs/graphics/hud-sides.js) and LAYOUT's offset from it. The locator and the shelf under
    // it on one side, the quests and the radio on the other; the quest list is no more under the locator, the shelf is.
    const sides = sidePlaces(renderer, hudSide.locator);
    const colUser = offsetOf(hudPlace, 'column'), listUser = offsetOf(hudPlace, 'quests'), shelfUser = offsetOf(hudPlace, 'shelf');
    const colShift = hudAt.column, listAt = hudAt.list, shelfAt = hudAt.shelf;
    colShift.x = sides.column.x + colUser.x; colShift.y = sides.column.y + colUser.y;
    // (The quest list hangs under the radio: its place is made once the radio is drawn, below.)
    shelfAt.x = sides.shelf.x + colUser.x + shelfUser.x; shelfAt.y = sides.shelf.y + colUser.y + shelfUser.y;
    // The locator marks the map's flags and each open quest's target (SX: «флажки и цели не отмечаются на мини-локаторе»).
    const colMoved = colShift.x || colShift.y;
    // In two parts: the scope, and its header and legend.
    const scopeArgs = { reducedMotion: feedback.reducedMotion,
      flags: world.flags.map((flag, i) => flag && { flag, ink: FLAGS[i].ink, name: FLAGS[i].name }),
      quests: currentQuests(world).map((quest) => ({ quest, ink: (QUEST_TONES[questTone(quest)] ?? QUEST_TONES.green).ink })),
      // The column's presentation (src/widgets.js, worn on LAYOUT).
      look: lookOf(hudPlace, 'column', world.ledger),
      // The selected task (src/tasks.js, the quest list's field): the locator's route and header lead to it.
      task: selectedTask(world, questBoard) };
    const scopeBox = shifted(locatorBounds(renderer), colShift);
    // A new pilot has what the opening chapter has given (src/opening.js interfaceGiven): the locator, its legend and the quest list from
    // the first station's dispatch (until then the bearing in the sky and the top banner lead, and the column is empty), the souvenir
    // shelf once it is fitted at B, the pilot's own cockpit with their shuttle (hud.js: SCOOTY JR.'s before it).
    // (A panel given comes in with the beat that says so under the lab's ?focus=F2 and F3: labs/graphics/opening-focus.js.)
    const given = game.focus.shown(interfaceGiven(world)), fitted = given.column;
    // While its legend shows under the scope (M), the charm that hangs there is not drawn and answers nothing; the quests
    // and the radio are on the other side and stay (locator.js legendCovers).
    const covered = game.hudCovered = !modern && !scooter && given.column && legendCovers(renderer);
    const columnBox = scopeBox;                // (the locator's own wipe and corner marks: the quests are given from the first frame)
    // The labels and arrows of the flight (an object's window, the marks on the rim, a ghost's label, the feedback),
    // drawn before the interface, which is the top layer and stands over them whatever they do (SX, 2026-10-07: «почему то пролетают над
    // интерфейсом, интерфейс у нас выше всех»; until then they were drawn after it, and a window that stood on the deck covered it). They
    // keep off its boxes: the column as it stands, the quests, the shelf and the radio as the last frame drew them, the notch's line and
    // the notice as they stand; and the windows keep to the play area between the helmet's floor and the deck's top (rim-marks.js).
    if (!screens.anyScreen()) {
      const lastLayout = game.lastHudLayout, wasModern = !!lastLayout?.modern;
      const rode = !!lastLayout?.scooter;
      const avoid = rode ? [...lastLayout.avoid] : wasModern ? [...lastLayout.avoid, lastLayout.column, lastLayout.quests].filter(Boolean) : fitted ? [scopeBox] : [];
      if (!wasModern && !rode && given.quests && questBoard.box) avoid.push(questBoard.box);
      if (lastLayout?.deck && lastLayout.shelf?.h > 0 && !covered) avoid.push(lastLayout.shelf);          // the charm's room, while one hangs
      if (lastLayout?.deck && lastLayout.tracker) avoid.push(lastLayout.tracker);                         // the deck's shoulder: the wallet, the tracker's button and rows
      if (page.radioArea) avoid.push(page.radioArea);
      const taskBox = notices.taskRect(), noticeBox = notices.currentNoticeRect();
      if (taskBox && !scooter) avoid.push(taskBox);
      if (noticeBox && !scooter) avoid.push(noticeBox);
      group('labels', renderer, (r) => {
        const occupied = noteDuring(r, () => drawInteraction(r, avoid, wasModern && lastLayout.area ? lastLayout.area : playArea(r, { boxes: game.hud.boxes, layout: lastLayout })));
        const trace = scooter ? null : ghost.drawLabel(r, world, occupied);
        if (trace) occupied.push(trace);
        if (!scooter) feedback.draw(r, world, occupied);
        // By the ship, riding with it (src/skillHints.js; labs/graphics/skill-hint.js).
        if (skillHints.shown) drawSkillHint(r, world, skillHints.shown, { scheme: schemes.scheme(), reducedMotion: feedback.reducedMotion });
      });
      // Up in a jump over a menu, the ship is drawn over it (SX's M5+: «если ... перепрыгнуть, то он сверху в нее пролетает»).
      if (shipOverPlate()) inWorld(renderer, (v) => { const s = world.project(v, world.ship.x, world.ship.y); v.drawOver(() => world.ship.draw(v, s.x, s.y)); });
    }
    const legacyColumn = fitted && !modern && !scooter;
    if (legacyColumn && colMoved) { renderer.ctx.save(); renderer.ctx.translate(colShift.x, colShift.y); }
    if (legacyColumn) wiped('column', columnBox, () => group('scope', renderer, (r) => drawLabTopStrip(r, world, { ...scopeArgs, part: 'scope' })), { offset: colShift });
    let locatorArea = legacyColumn ? shifted(wiped('column', columnBox, () => group('legend', renderer, (r) => drawLabTopStrip(r, world, { ...scopeArgs, part: 'text' })), { offset: colShift }), colShift) : null;
    if (legacyColumn && colMoved) renderer.ctx.restore();
    // The cockpit (cockpit-fx.js): glints ride its bars as the ship turns or is jolted; it wears the hull's damage a step
    // each fifth; a worse step shakes the whole cockpit and flings pieces of its bars over it.
    const fxNow = performance.now() / 1000;
    COCKPIT_FX.now = fxNow; COCKPIT_FX.reducedMotion = feedback.reducedMotion;
    COCKPIT_FX.jolt = world.ship.jolt;
    COCKPIT_FX.hullShare = world.ship.alive && world.hullMax > 0 ? world.hull / world.hullMax : 1;
    steerLight(world.ship.angle);
    wearCockpit(damageLevel(world.ship.alive ? world.hull : 0, world.hullMax), fxNow, { wrecked: !world.ship.alive });
    let shake = COCKPIT_FX.shake ? shakeOffset(fxNow) : { x: 0, y: 0 };
    // The console on its springs, answering the drift and the trick, and the lever with it (labs/graphics/stunt-fx.js, vector-helm.js).
    if (world.stunts || hitWarning.threat) {
      const panel = deckShift(stuntFx, world, { reducedMotion: feedback.reducedMotion });
      shake = { x: shake.x + panel.x, y: shake.y + panel.y };
      HELM_FX.lean = stuntFx.panel.a; HELM_FX.pull = stuntFx.panel.pull;
      // A heavy hit ahead says itself over the lever (W1); the drift's and the trick's scale is the helmet's (S8, below).
      HELM_FX.gauge = warnGauge(hitWarning);
    }
    HELM_FX.lamp = hitWarning.threat ? warnLamp(hitWarning, world, { reducedMotion: feedback.reducedMotion }) : null;
    if (shake.x || shake.y) { renderer.ctx.save(); renderer.ctx.translate(shake.x, shake.y); }
    // Its blocks: the lower panel, the souvenir shelf and the route's header.
    cockpitShift.header = offsetOf(hudPlace, 'header');
    // The ruins' tracker follows the ledger and the quests that lead to a ruin; what the page has laid over its column (the locator, the charm's room, the quests and the radio,
    // as the last frame drew them, the legend's rows counted while they cover the charm's place) sets how many rows fit over its button.
    stepTracker(tracker, world.ledger, pageTime(), feedback.reducedMotion, questBoard.plates);
    const hudBoxes = game.hud.boxes;
    tracker.near[0] = hudBoxes.column; tracker.near[1] = hudBoxes.quests; tracker.near[2] = covered ? null : hudBoxes.shelf; tracker.near[3] = page.radioArea;
    const cockpitArgs = { cargoAcknowledged: feedback.cargoAcknowledged,
      reducedMotion: feedback.reducedMotion, charm, tracker,
      shift: cockpitShift, steady: { x: -shake.x, y: -shake.y }, shelf: given.shelf };
    // MODERN: the whole interface under the shake (SX: «при столкновениях весь интерфейс трясется ... как будто бы это ... аугментированный
    // интерфейс в шлеме»), the charm on its mount's reel, what tore off at the hull's last tenth falling (hud-modern.js).
    let modernOut = null;
    if (modern) {
      const hungId = given.shelf ? hungCharm(world) : null;
      stepCharm(charm, world.ship, world.time, hungId, pageTime(), rawDt, feedback.reducedMotion, MODERN_HOLD);
      charm.shown = false;
      stepModernFx(game.modernFx, { share: world.ship.alive && world.hullMax > 0 ? world.hull / world.hullMax : 0, angle: world.ship.angle, dt: rawDt,
        charmAt: game.lastHudLayout?.modern ? game.lastHudLayout.charmAt : null, charmId: hungId,
        wheelAt: game.lastHudLayout?.modern ? game.lastHudLayout.wheelAt : null, thrust: flown?.thrust ?? 0, retro: flown?.retro ?? 0,
        reducedMotion: feedback.reducedMotion });
      modernOut = group('modern', renderer, (r) => drawModernHud(r, game, { given, brake: !!brakeHands.damp, lamp: HELM_FX.lamp,
        speed: Math.hypot(world.ship.vx, world.ship.vy), maxSpeed: world.ship.params().maxSpeed, input: flown, now: pageTime(),
        scopeArgs: { flags: scopeArgs.flags, quests: scopeArgs.quests, task: scopeArgs.task }, reducedMotion: feedback.reducedMotion,
        level: damageLevel(world.ship.alive ? world.hull : 0, world.hullMax), attached: keyFocus.holdsArrows(), focusId: notices.focusedQuestId(),
        markedIds: markedIds(), pointer: screens.anyScreen() ? null : pointer,
        bearingOf: (q) => { const way = courseOf(questNavigation(world, q)); return way ? Math.atan2(way.dy, way.dx) : null; } }));
      locatorArea = modernOut.column;
    }
    // Broken at a wreck (cockpit-fx.js crackShape): each half on its own side of the break, bent.
    const deckCrack = !modern && !scooter && COCKPIT_FX.shake ? crackShape(fxNow, renderer.width, renderer.height) : null;
    // (Its layout only, nothing drawn, while the pilot's cockpit waits for its beat: `header` draws nothing.)
    const drawDeck = (r) => drawLabCockpit(r, world, brakeHands, { ...cockpitArgs, part: given.deck ? 'deck' : 'header' });
    const whole = { x: 0, y: 0, w: renderer.width, h: renderer.height };
    // SCOOTY JR.'s handlebar alone (labs/graphics/scooty-deck.js): what the marks and the windows keep off is the bar and its streamers.
    const rideDeck = () => {
      const out = group('cockpit', renderer, (r) => drawScootyDeck(r, world, brakeHands, { reducedMotion: feedback.reducedMotion }));
      return { scooter: true, avoid: out ? [out.box, ...out.keys] : [], deck: null };
    };
    const hudLayout = scooter ? rideDeck() : modern ? modernOut : deckCrack ? drawCracked(renderer.ctx, deckCrack, renderer.width, renderer.height, () => group('cockpit', renderer, drawDeck))
      : wiped('cockpit', whole, () => group('cockpit', renderer, drawDeck), { across: true });
    // The top of the helmet (labs/graphics/helmet.js, S8 V1+): the deck's bar across the top with its notch, shaking with the deck, on
    // its own shadow, the scale of a jump or a drift in its floor (stunt-fx.js scaleOf); the task's line in the notch is the banners'
    // (steady, below).
    const stuntScale = world.stunts ? scaleOf(stuntFx, { reducedMotion: feedback.reducedMotion }) : null;
    if (hudLayout?.deck) group('helmet', renderer, (r) => drawHelmet(r, notices.notch(r), stuntScale));
    // The wallet stands from the first frame (SX, 2026-10-06: «сейчас нет индикатора монет нигде»): since 2026-10-08 on the deck's left
    // shoulder, drawn with the deck (hud.js drawLabCockpit); the shelf is the charm alone.
    const drawShelfBlock = () => group('shelf', renderer, (r) => drawLabCockpit(r, world, brakeHands, { ...cockpitArgs, part: 'shelf' }));
    // What hangs is what the shelf's layout says (the opening's gate is its, labs/graphics/souvenir-shelf.js shelfLayout); the state keeps
    // swinging while the legend covers its place, so it is where it was when the legend folds.
    if (!modern && !scooter) {
      stepCharm(charm, world.ship, world.time, hudLayout?.charm?.id ?? null, pageTime(), rawDt, feedback.reducedMotion);
      charm.shown = false;
      if (covered) { /* the legend stands in its place */ }
      else if (given.shelf) wiped('shelf', hudLayout?.shelf, drawShelfBlock);
    }
    if (shake.x || shake.y) renderer.ctx.restore();
    if (COCKPIT_FX.shake && !modern && !scooter) drawPieces(renderer.ctx, fxNow);       // (the legacy deck's own pieces)
    game.lastHudLayout = hudLayout;
    // The quests' column, on the side the locator is not (S3 SWAP; SX, 2026-10-08, «ты радио сделай сверху, а список квестов под ним»):
    // the radio on top once the opening has given it (src/opening.js interfaceGiven), on the column's top row, where its picture would
    // reach the cockpit it folds to its row (labs/graphics/radio.js); the quest list under it, a container's inset under its last ink,
    // on the top row with no radio, from the first frame (the opening gives the quests at once). On the right the plates, the heads and
    // the radio are drawn mirrored (hud-sides.js quests.mirror). Dragged on its own under the pause, the list keeps its own offset.
    if (modern) page.radioArea = modernOut.radioArea;
    else page.radioArea = given.radio && !scooter ? group('radio', renderer, (r) => drawRadio(r, radio, radioPlaceNow(hudLayout, sides, listUser), pageTime(),
      { reducedMotion: feedback.reducedMotion })) : null;
    const listBase = questPlace?.at ?? sides.quests;
    listAt.x = listBase.x + listUser.x;
    listAt.y = questPlace?.at ? listBase.y + listUser.y : page.radioArea ? Math.round(page.radioArea.y + page.radioArea.h + sides.quests.under) : listBase.y + listUser.y;
    if (questPlace) questPlace.home = sides.quests;
    // Its head, R QUESTS, on the column's edges (S3, L3+); it looks as under the pointer while the keys hold the list (key-focus.js).
    if (given.quests && !modern && !scooter) group('quests', renderer, (r) => drawQuestBoard(r, questBoard, listAt.x, listAt.y, pageTime(), world.ledger.clock, {
      reducedMotion: feedback.reducedMotion, button: sides.quests.button, attached: keyFocus.holdsArrows(), width: sides.quests.width,
      focusId: notices.focusedQuestId(), markedIds: markedIds(), mirror: sides.quests.mirror,
      bearingOf: (q) => { const way = courseOf(questNavigation(world, q)); return way ? Math.atan2(way.dy, way.dx) : null; },
      pointer: screens.anyScreen() ? null : pointer,
    }));
    // A panel just given, marked by its four corners for a moment (F2, F3).
    for (const [panel, box] of scooter ? [] : modern ? [['column', modernOut.locator]] : [['column', columnBox], ['shelf', hudLayout?.shelf]]) {
      if (box && box.h > 0 && game.focus.marks(panel, { reducedMotion: feedback.reducedMotion })) cornerTile(renderer, inflateBox(box, BEAT_MARK.air), ROLES.textPrimary, BEAT_MARK.arm);
    }
    // An open panel stands over the screen at half its light (CONFIG.view.underPanel).
    // Under a pop-up the notices lie with the flight, under its dimming (SX, 2026-10-02: «нотификации должны быть под картой
    // в смысле слои у них ниже карты под затемнением», then «уведомления под поп апах»); with no screen open they are over
    // the whole interface, as before (SX, 2026-10-01: «нотификейшены должны быть поверх всего интерфейса»).
    const noticeUnder = screens.anyScreen();
    // The banners (labs/graphics/notices.js): the task slot where the route's header stood, and the notice under it; steady while the
    // deck shakes, over every panel and an object's menu, or under a pop-up's dimming as the notices always were.
    if (noticeUnder && !scooter) { group('header', renderer, notices.drawTaskPlaced); group('notice', renderer, notices.drawNoticePlaced); }
    if (screens.anyScreen()) {
      renderer.fill(0, 0, renderer.width, renderer.height, CONFIG.render.background, 1 - CONFIG.view.underPanel);
    }
    // Each pop-up with its keys noted for the mouse and its extent measured (labs/graphics/clicks.js): the last drawn is on
    // top, and a click outside it closes it. The controls list's keys are the game's, so only its CLOSE answers; the
    // tabs window is a lock and is not closed by a click. The pointer is theirs (src/hover.js), and the pause's after them.
    muteNotes(false);
    hoverReach(true);
    // A talk's beat (labs/graphics/talk-beat.js): its veil over the whole frame and the speaker's window, under any pop-up.
    timed('talk beat', () => game.beat.draw(renderer));
    game.popupOnTop = timed('pop-ups', () => screens.drawPopups(now));
    game.hud.boxes = scooter ? { column: null, quests: null, header: null, shelf: null, notice: null } : modern ? { column: modernOut.column, quests: modernOut.quests, header: null, shelf: null,
      notice: notices.currentNoticeRect() ?? shifted(noticeRect(renderer, { title: "NOTICES APPEAR HERE", sub: 'DRAG TO MOVE', kind: 'news' }), offsetOf(hudPlace, 'notice')) }
      : hudPlaceBoxes(hudLayout);
    // A moved group held inside the screen, above the cockpit and off the ship for the next frame (hud-place.js; a resize brings it back).
    // (MODERN's groups stand where it lays them.)
    if (!modern && !scooter) settleHudPlace(hudPlace, game.hud.boxes, safeArea(renderer, hudLayout));
    const pausing = pause.settle();
    timed('h panel', () => diagnostics.draw(renderer, locatorArea, hudLayout));
    if (!noticeUnder && !scooter) { group('header', renderer, notices.drawTaskPlaced); group('notice', renderer, notices.drawNoticePlaced); }   // over the interface
    // Under P's pause, over everything and the rest dimmed as under a pop-up: the pause's window (labs/graphics/pause.js draw).
    if (pausing) timed('pause', () => pause.draw());
    endNotes();
    // The return's sweep over the finished frame; and the frame kept for it while the ship waits to come back (respawn-fx.js).
    lap('sweep');
    drawReboot(renderer, respawnFx, pageTime());
    // The sweep shows the last frame before the return, so the frame is copied where the return may come with the next frame or the one
    // after (as long as this one and a step each), and once as the wait enters its last 0.3 s in case no frame lands there; until
    // 2026-10-06 every frame of that 0.3 s copied the whole canvas (1.9 ms each in headless Chrome at 1512 x 982 @2: 18 copies at 60 Hz,
    // 36 at 120). None with reduced motion, which has no sweep.
    if (!world.ship.alive && !feedback.reducedMotion && world.ship.respawnIn < 0.3
      && (!respawnFx.kept || world.ship.respawnIn < 2 * (rawDt + CONFIG.sim.step))) keepFrame(respawnFx, canvas);
    // The pointer over everything, then the finished frame, through the tube when the filter is on.
    lap('cursor');
    followCursor();
    stepCursor(pointer, now, { hint: canvas.style.cursor || (itemUnder() || pointer.parked ? 'pointer' : ''), flying: !screens.anyScreen() });
    drawCursor(renderer.ctx, pointer, now);
    lap(null);
    const tCockpit = performance.now();
    timed('screen', () => crt.render());
    const tEnd = performance.now();
    diagnostics.log(gapMs, tSim - t0, tWorld - tWorld0, tCockpit - tWorld, tEnd - tCockpit, tEnd - t0, framePace.held);
    frameDone(now);
  }

  return flightFrame;
}
