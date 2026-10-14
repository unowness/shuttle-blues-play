// The lab's own (labs/graphics/index.html, the game with its drawer), cut from labs/graphics/main.js (PLAN D4 in part, chat F,
// 2026-10-04): the drawer (` opens it and freezes the flight; its palette, sky and screen settings, its jumps to the review scenes
// of labs/graphics/scenes.js, the cockpit's wear switches) and the review links a lab page is opened with (`?scene=`, `?pirates=`,
// `?droid=`, `?visitor=`, `?npcs`, `?raid`, `?special=`, `?quest=`, `?hull=`, `?map`, `?room`). The game (index.html) runs none of
// it. Chat C takes the drawer off the game's hot paths (docs/plans/2026-10-04-roadmap.md). `game` is the page's (main.js).
import { PALETTE } from '../../src/roles.js';
import { SECTORS } from '../../src/sectors.js';
import { spawnVisitor } from '../../src/traffic.js';
import { startRaid } from '../../src/raids.js';
import { offerSideQuest } from '../../src/quests.js';
import { offerSpecial } from '../../src/specials.js';
import { SPECIAL_IDS } from '../../src/specialShips.js';
import { createScaleState } from '../../src/visualScale.js';
import { applyStyle, labStyle, cleanSettings, PALETTES } from './style.js';
import { visitScene, visitPirates, visitDroid, visitBoss, visitBossQuest, SCENES } from './scenes.js';
import { noteVisit } from './map-screen.js';
import { COCKPIT_FX } from './cockpit-fx.js';
import { createLabKeys, respawnNow } from './lab-keys.js';
const SCENE_IDS = Object.keys(SCENES);

// The review links, when the flight starts (main.js startFlight): what the lab page was opened to look at.
export function applyReviewLinks(game) {
  const { GAME, LAB_SAVE, pageParams, world, renderer } = game, screens = game.screens;
  // `?scene=<id>` visits a lab review location, like the drawer's buttons.
  const requestedScene = GAME ? null : new URLSearchParams(location.search).get('scene');
  if (requestedScene && SCENE_IDS.includes(requestedScene)) visitScene(world, renderer, requestedScene);
  if (!GAME && new URLSearchParams(location.search).has('room')) screens.openGarageRoom();
  if (!GAME && pageParams.has('map')) {
    if (pageParams.get('map') === 'all') for (const s of SECTORS) if (!s.hidden) noteVisit(screens.map, s.id);
    screens.openMapScreen();
  }
  // (Not `?focus=`: it plays a new pilot's opening from HOME, labs/graphics/opening-focus.js.)
  else if (game.labFresh && LAB_SAVE && !pageParams.has('focus')) visitScene(world, renderer, 'flight');
  // `?pirates=N` (1-4): a group of pirates at load, on open ground; `&kind=maw&paint=ember` name its hull and paint.
  const launch = new URLSearchParams(location.search);
  const wantedPirates = GAME ? 0 : Number(launch.get('pirates'));
  if (Number.isInteger(wantedPirates) && wantedPirates >= 1 && wantedPirates <= 4) {
    Object.assign(game.shipScale, createScaleState());
    visitPirates(world, renderer, wantedPirates, { kind: launch.get('kind'), paint: launch.get('paint') });
  }
  // `?boss=1`: the boss TOLLKEEPER ahead of the ship, on open ground (src/boss.js); `?boss=quest`: its quest, every ruin restored on the
  // lab's save, the ship short of its EXPLORE mark (src/bossQuest.js).
  if (!GAME && launch.get('boss') === '1') {
    Object.assign(game.shipScale, createScaleState());
    visitBoss(world, renderer);
  } else if (!GAME && launch.get('boss') === 'quest') {
    Object.assign(game.shipScale, createScaleState());
    visitBossQuest(world, renderer);
  }
  // `?droid=fuel` or `?droid=repair`: a service droid beside the ship, on open ground.
  const wantedDroid = GAME ? null : launch.get('droid');
  if (wantedDroid === 'fuel' || wantedDroid === 'repair') {
    visitDroid(world, renderer, wantedDroid);
  }
  // `?visitor=` (planet-express, swordfish-ii, serenity, falcon, x-wing, delorean, or anything for one at
  // random): open ground, and a named craft out of O-08 passing beside the ship at once.
  const wantedVisitor = GAME ? null : launch.get('visitor');
  if (wantedVisitor !== null && wantedVisitor !== undefined) {
    visitScene(world, renderer, 'open');
    spawnVisitor(world, { craftId: wantedVisitor });
  }
  // `?npcs` (or `?npcs=N`, 1 to every ship of the fleet, 4 by default): N of the NPC ships set going from places round the ship
  // and every ship repainted, each in a paint drawn by the counterweights (src/npcPaint.js, src/npcFleet.js), to see several at
  // once; e.g. `?scene=open&npcs=6`.
  if (!GAME && launch.has('npcs')) world.fleet.gather(world, Math.max(1, Math.min(world.fleet.walkers.length, Number(launch.get('npcs')) || 4)));
  // `?raid` (or `?raid=station-yard-k05`, a station of an open sector: the lab's own save opens J-05 and K-05 only, so a raid
  // asked for a station past them is refused): a raid at once, its plate in the quest list and its pointer on; `?quest` (or
  // `?quest=find`, `rebuild`, `signal`, `stranger`, `rescue`, `wreck`, `planet`, `pester`, `freight`): a quest at once, the wallet raised to reach a cache.
  // In the game they come by themselves (src/raids.js, src/quests.js); the lab's review scenes turn pirates off, so
  // `?raid` turns them on (zone squads stay off).
  if (!GAME && launch.has('raid')) {
    world.autoEncounters = true;
    world.pirateReadyAt = Infinity;
    startRaid(world, launch.get('raid') || null);
  }
  // `?special=<ship>` (delorean, swordfish, express, falcon, serenity, xwing): that reference ship standing near the ship at once
  // (src/specials.js), its note forgotten if the save holds it.
  if (!GAME && launch.has('special')) {
    const id = launch.get('special');
    if (SPECIAL_IDS.includes(id)) {
      world.autoEncounters = true; world.pirateReadyAt = Infinity;
      world.pilot.notes.delete(id);
      if (world.ledger.active) { world.ledger.returnActive(); world.cargo = null; }       // a ship will not be boarded with a cargo aboard
      // Some ships have no quest from some sectors (SERENITY needs a station two sectors off, the X-WING a place away up and to
      // the right): the review scenes of the other sectors are tried in turn.
      let met = offerSpecial(world, { id, near: true });
      for (const scene of ['open', 'gloaming', 'planet', 'flight']) {
        if (met) break;
        visitScene(world, renderer, scene);
        met = offerSpecial(world, { id, near: true });
      }
      if (!met) game.notices.toast(`${id}: no quest from here`, 'danger');
    }
  }
  // `?quest=pester|wreck|planet`: the second round (QUESTS_V2_HANDOFF.md), placed in this sector; pirates are turned on for
  // the two that bring them (the zone squads stay off), as `?raid` does.
  if (!GAME && launch.has('quest')) {
    const kind = launch.get('quest') || null;
    // (the freight hint is for a pilot with an empty wallet and no cargo, src/freight.js: `?quest=freight` empties the one and returns the other)
    if (kind === 'freight') { world.ledger.credits = 0; if (world.ledger.active) { world.ledger.returnActive(); world.cargo = null; } }
    else world.ledger.credits = Math.max(world.ledger.credits, 400);
    if (kind === 'pester' || kind === 'planet') { world.autoEncounters = true; world.pirateReadyAt = Infinity; }
    offerSideQuest(world, kind, { here: true });
  }
  // `?hull=N` (1-100): the hull at N % of the flown ship's, to see the cockpit's steps of wear (cockpit-fx.js), e.g.
  // `?scene=open&hull=30`.
  const wantedHull = GAME ? NaN : Number(launch.get('hull'));
  if (launch.has('hull') && Number.isFinite(wantedHull)) {
    world.hull = Math.max(1, Math.min(world.hullMax, Math.round(world.hullMax * wantedHull / 100)));
  }
}

// The drawer, put in once the page is built (the lab page only).
export function installLabDrawer(game) {
  const { LAB_SAVE, crt, presentation, renderer, world, input, ghost, feedback, canvas, saveBackend } = game, screens = game.screens;
  // The workshop's keys (H, R), read where the flight's keys are (labs/graphics/lab-keys.js); the game's frame never asks for them.
  game.labKeys = createLabKeys(game);
  // The drawer freezes the simulation (game.labOpen) and leaves P's pause as it was.
  const drawer = document.getElementById('lab-drawer');
  const paletteSelect = document.getElementById('palette');
  const sky = document.getElementById('sky');
  const status = document.getElementById('lab-status');
  for (const [id, p] of Object.entries(PALETTES)) paletteSelect.add(new Option(p.label, id));
  // Which save the lab plays, and the way to the other (a reload: the save is chosen at load).
  document.getElementById('save-note').textContent = LAB_SAVE
    ? 'Separate lab save: the game is not touched.'
    : 'Your game save: the lab is the game.';
  const saveSwitch = document.getElementById('save-switch');
  saveSwitch.textContent = LAB_SAVE ? 'Play the game save' : 'Use a separate lab save';
  saveSwitch.addEventListener('click', () => { location.search = LAB_SAVE ? '' : '?save=lab'; });
  // The workshop's respawn, a button (R is the quests, C0 conflict 2), on the lab's own save.
  if (LAB_SAVE) {
    const respawn = document.createElement('button');
    respawn.id = 'lab-respawn';
    respawn.textContent = 'Respawn the ship';
    respawn.addEventListener('click', () => { setDrawer(false); respawnNow(game); });
    saveSwitch.after(respawn);
  }
  // A button for every scene there is (labs/graphics/scenes.js).
  for (const [id, scene] of Object.entries(SCENES)) {
    const button = document.createElement('button');
    button.dataset.scene = id;
    button.textContent = scene.label;
    document.getElementById('scene-picker').append(button);
  }
  function syncControls() {
    document.getElementById('dash-signal').checked = COCKPIT_FX.wear;
    document.getElementById('dash-shake').checked = COCKPIT_FX.shake;
    paletteSelect.value = labStyle.palette;
    sky.value = labStyle.sky;
    document.getElementById('sky-value').value = `${labStyle.sky}%`;
    document.getElementById('crt-setting').checked = crt.mode === 'crt';
    document.getElementById('crt-setting').disabled = !crt.available;
    const swatches = document.getElementById('swatches');
    swatches.replaceChildren();
    for (const [role, color] of Object.entries(PALETTE)) {
      const item = document.createElement('span');
      item.style.backgroundColor = game.shade(color);
      item.title = `${role}: ${color}`;
      item.setAttribute('aria-label', `${role}: ${color}`);
      swatches.append(item);
    }
  }
  function saveSettings() {
    try {
      if (!game.tuningBackend) throw new Error('storage unavailable');
      game.tuningBackend.setItem('settings', JSON.stringify(cleanSettings(labStyle)));
      status.textContent = 'Lab settings saved locally.';
    } catch { status.textContent = 'Session only: local storage is unavailable.'; }
  }
  function setDrawer(open) {
    game.labOpen = open;
    document.documentElement.dataset.labOpen = String(open);
    renderer.resize();
    world.ship.measureDrawing(renderer.cellW, renderer.cellH);
    input.down.clear(); input.pressed.clear(); game.clock.reset();
    if (open) {
      syncControls();
      if (!drawer.open) drawer.showModal();
    } else {
      drawer.close();
      canvas.focus();
    }
  }
  document.getElementById('resume').addEventListener('click', () => setDrawer(false));
  document.getElementById('lab-close').addEventListener('click', () => setDrawer(false));
  drawer.addEventListener('cancel', event => { event.preventDefault(); setDrawer(false); });
  drawer.addEventListener('keydown', event => event.stopPropagation());
  drawer.addEventListener('keyup', event => event.stopPropagation());
  drawer.addEventListener('change', event => {
    if (event.target.id === 'dash-signal' || event.target.id === 'dash-shake') {
      COCKPIT_FX[event.target.id === 'dash-signal' ? 'wear' : 'shake'] = event.target.checked;
      return;
    }
    if (event.target.id === 'crt-setting') {
      if (event.target.checked !== (crt.mode === 'crt')) game.toggleCrt(event.target.checked ? 'crt' : 'flat');
      syncControls();
      return;
    }
    applyStyle({ palette: paletteSelect.value, sky: Number(sky.value) });
    presentation.refresh();
    syncControls(); saveSettings();
  });
  sky.addEventListener('input', () => {
    labStyle.sky = Number(sky.value);
    document.getElementById('sky-value').value = `${labStyle.sky}%`;
  });
  // The drawer's jump buttons: a lab scene, a group of pirates or a service droid. A jump is a
  // test, so on the game's save it reloads into the lab's own, at that jump (a review link). On
  // the lab's save it jumps in place, clearing what belongs to the moment before it (menus,
  // feedback, ghost, held keys) and leaving earned progress alone.
  for (const button of document.querySelectorAll('[data-scene], [data-pirates], [data-droid], [data-boss]')) {
    button.addEventListener('click', () => {
      if (!LAB_SAVE) {
        const [key, value] = Object.entries(button.dataset)[0];
        location.search = `?${new URLSearchParams({ fly: '', [key]: value })}`;
        return;
      }
      if (screens.open.pilot) screens.closePilot();
      if (screens.open.sign) screens.closeSign();
      if (screens.open.hangar) screens.closeHangar();
      if (screens.open.station) screens.closeStationInfo();
      screens.closeHelp(false);
      ghost.stop(); feedback.items.length = 0;
      game.menu.closed = true; game.menu.forId = null; game.notices.clearNotices();
      input.down.clear(); input.pressed.clear(); game.clock.reset();
      Object.assign(game.shipScale, createScaleState());
      const result = button.dataset.boss
        ? visitBoss(world, renderer)
        : button.dataset.pirates
        ? visitPirates(world, renderer, Number(button.dataset.pirates))
        : button.dataset.droid
          ? visitDroid(world, renderer, button.dataset.droid)
          : visitScene(world, renderer, button.dataset.scene);
      world.clearPause();
      game.pause.state.keyPause = false;
      game.persist('lab-view');
      status.textContent = `View: ${button.textContent}. Flight is frozen while tuning.`;
      for (const other of document.querySelectorAll('[data-scene], [data-pirates], [data-droid], [data-boss]')) other.setAttribute('aria-pressed', String(other === button));
      void result;
    });
  }
  document.getElementById('defaults').addEventListener('click', () => {
    if (crt.mode !== 'crt') game.toggleCrt('crt');   // the base screen is the curved tube
    applyStyle(cleanSettings()); presentation.refresh(); syncControls(); saveSettings();
  });
  document.getElementById('export').addEventListener('click', () => {
    const data = { version: 1, ...cleanSettings(labStyle), crt: crt.enabled };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'spaser-graphics-lab.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Exported graphics settings.';
  });
  window.addEventListener('keydown', event => {
    if (event.code === 'Backquote' && !screens.pilotUI.editing) {
      event.preventDefault(); event.stopImmediatePropagation(); setDrawer(!game.labOpen);
    }
  }, true);
  if (!saveBackend) status.textContent = 'Session only: local storage is unavailable.';
  // The lab starts in flight like the game, the drawer closed (` opens it); `?drawer` opens it at
  // the start (`?fly`, which once closed it, is the default now). (`?pin=N`, which pinned one shelf tile's focus, went with the tiles.)
  setDrawer(new URLSearchParams(location.search).has('drawer'));
}
