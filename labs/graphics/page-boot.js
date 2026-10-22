// The page's boot, cut from labs/graphics/main.js (PLAN D4, toward createGame): the title and the load behind it, the frame the loop runs while it
// is up (`bootFrame`), and the flight's start (`startFlight`). Everything is loaded and warmed before the first flight frame (boot.js), behind
// the title (title.js, title-final.js), so nothing is built, compiled or rasterised for the first time while the ship is flying. The game waits
// there for a key or a click; the lab, which has no title, goes straight in. While this is up the frame loop (frame-loop.js) hands the frame to
// `bootFrame`: the world does not step, so no clock or timer runs, and nothing is saved from the title alone (`leave`, for the page's `pagehide`).
//
//   const boot = createPageBoot(game, page, { saves, respawnFx, followPixelRatio, followCursor }, env);
//   boot.title, boot.plan       the title's state and the load's plan, what `window.SPASER` shows        boot.titleFinal   the title's own state (its menu)
//   boot.bootFrame(now)         the frame behind the title        boot.startFlight()    the load is over: the world steps from the next frame
//   boot.leave()                the page is being left: the save, unless only the title has been up
//
// `game`: the page's parts, destructured when this is made (they are all made before it; main.js calls it where the title was made); `page`: the
// frame's state between calls (`last`, `titleDrawn`, `bootFailed`, `bootModelNote`); `saves` the save (labs/graphics/save-keeper.js: `persist`,
// `erase`, `warnHeld`); `respawnFx` the wreck's frame kept (prepared at the start).
// `env`: the browser's side, each with the browser's own as its default. `window` takes the title's keys; `now()` is the clock in ms; `fetch`
// and `base` fetch a sprite and a ship's drawing (`base` is a URL the files are found from, two folders up: this file's own); `createCanvas()`
// makes the rehearsal's canvas nobody sees; `log` is the console's error. Two seams for a check: `buildPlan(deps)` (boot.js's by default) and
// `reviewLinks(game)` (the lab drawer's by default). `loadModel` (src/asciiModel.js) fetches a ship's drawing through the global `fetch` itself.
import { CONFIG } from '../../src/config.js';
import { LabRenderer as Renderer, labStyle } from './style.js';
import { drawLabTopStrip } from './locator.js';
import { drawLabCockpit } from './hud.js';
import { rehearseWear } from './cockpit-fx.js';
import { prepareFrame } from './respawn-fx.js';
import { createWorldPresentation } from './world-art.js';
import { World } from '../../src/world.js';
import { normalizeModel, loadModel, PLACEHOLDER } from '../../src/asciiModel.js';
import { loadSprites } from '../../src/sprites.js';
import { SHIPS, CREW_SHIPS, registerShipModel, shipModel } from '../../src/hangar.js';
import { specialModel } from '../../src/specialShips.js';
import { LOANER, flyingLoaner } from '../../src/loaner.js';
import { SHIP_LOOKS, DEFAULT_SHIP_LOOK, HULL, registerShipLook, shipLookModel, shipLookById, lookOpen } from '../../src/shipLooks.js';
import { SECTORS } from '../../src/sectors.js';
import { Asteroid } from '../../src/bodies.js';
import { signalsIn } from '../../src/progression.js';
import { findsIn } from '../../src/rewards.js';
import { buildBootPlan } from './boot.js';
import { createTitle, advanceTitle } from './title.js';
import { createTitleFinal, advanceTitleFinal, drawTitleFinal, bindTitleMenu } from './title-final.js';
import { createTitleMenu } from './title-menu.js';
import { stepCursor, drawCursor } from './cursor.js';
import { applyReviewLinks } from './lab-drawer.js';
import { drawHelmet } from './helmet.js';

const BOOT_BUDGET_MS = 6;               // of a frame's time the load may take

export function createPageBoot(game, page, { saves, respawnFx, followPixelRatio, followCursor }, env = {}) {
  const { GAME, canvas, announcementEl, renderer, input, crt, sound, clock, framePace, radio, world, presentation, pointer, motionPreference,
    feedback, notices, storage, applyModel } = game;
  const { window = globalThis.window, now = () => performance.now(), fetch = (...args) => globalThis.fetch(...args), base = import.meta.url,
    createCanvas = () => document.createElement('canvas'), log = (...args) => console.error(...args), buildPlan = buildBootPlan,
    reviewLinks = applyReviewLinks } = env;

  const title = game.title = createTitle({ show: GAME, reducedMotion: motionPreference.matches });
  // The pointer leans the title's stars a little (title-final.js): where it is over the canvas, -1..1 each way,
  // and `title.skyPointer` follows it smoothly, a sixteenth of the way a frame; it goes back to the middle when the
  // pointer leaves.
  const titlePointer = { x: 0, y: 0 };
  title.skyPointer = { x: 0, y: 0 };
  // The title as SX set it (labs/graphics/title-final.js; 2026-10-02: «Добавь новый титульник»): drawn over the load `title` keeps,
  // leaning with the same pointer. Its lettering takes the worn look as the whole game does (src/grade.js, put on before the
  // first frame: SX, «пусть титульник как мы делали с гаммой красится в зависимости от выбранного цвета интерфейса»); its plate
  // is the kept layer, as every plate. `save`: there is a game to CONTINUE.
  const titleFinal = createTitleFinal({ reducedMotion: motionPreference.matches, save: !game.labFresh });
  titleFinal.skyPointer = title.skyPointer;
  canvas.addEventListener('pointermove', (e) => {
    if (!title.active) return;
    const box = canvas.getBoundingClientRect();
    titlePointer.x = ((e.clientX - box.left) / box.width) * 2 - 1;
    titlePointer.y = ((e.clientY - box.top) / box.height) * 2 - 1;
  });
  canvas.addEventListener('pointerleave', () => { titlePointer.x = 0; titlePointer.y = 0; });
  // The title's menu: what a choice does and the press that wakes a held sound (labs/graphics/title-menu.js). `startFlight` is below.
  const titleMenu = createTitleMenu({ game, titleFinal, start: startFlight, erase: saves.erase, clock: now });
  const plan = buildPlan({
    world, config: CONFIG, sectors: SECTORS, Asteroid, cachesIn: findsIn, signalsIn, renderer,
    stationModels: () => [...world.bodyCache.values()].flatMap((b) => b.stations.map((s) => s.model)),
    // Artwork first, then the first frame, so nothing flashes its fallback glyph. A
    // missing file is reported and drawn with its fallback.
    loadSprites,
    fetchSprite: async (url, options) => {
      const response = await fetch(new URL('../../' + url, base), options);
      if (response.ok && url !== 'sprites/credit.json') {
        // The id is the file's name; only the art the lab draws over is captured.
        const id = url.replace(/^sprites\/|\.json$/g, '');
        presentation.captureSprite(id, await response.clone().json());
      }
      return response;
    },
    spritesLoaded: (failed) => { page.bootFailed = failed; presentation.refresh(); },
    // Every ship's drawing, behind the title (src/hangar.js): the one flown is
    // applied, the others wait for the hangar. A hangar ship that fails to load
    // is only missing from the hangar, unless it is the one flown.
    // SCOOTY JR. (src/loaner.js) too, the opening's loaner: the drawing a new pilot flies first.
    // The STANDARD's looks too (src/shipLooks.js): MODERN is the STANDARD's own file, the others are loaded beside it, and the one kept
    // in this browser is registered as the STANDARD's drawing; a look whose file fails is not offered, and one kept that failed, or that
    // this world has not opened (SCOOTY JR. in a new pilot's opening), is MODERN.
    loadShipModel: async () => {
      const flown = flyingLoaner(world) ? LOANER.id : world.hangar.flying;
      const looks = SHIP_LOOKS.filter((l) => l.id !== DEFAULT_SHIP_LOOK);
      await Promise.all([...SHIPS, LOANER, ...looks].map((def) => {
        const url = new URL('../../' + def.model, base).href;
        const keep = looks.includes(def) ? (model) => registerShipLook(def.id, model) : (model) => registerShipModel(def.id, model);
        return loadModel(url).then(keep, (error) => {
          if (def.id === flown && !looks.includes(def)) throw error;
        });
      }));
      const own = shipModel(HULL);
      registerShipLook(DEFAULT_SHIP_LOOK, own);
      if (!shipLookModel(game.shipLook.worn) || !lookOpen(shipLookById(game.shipLook.worn), world)) game.shipLook.worn = DEFAULT_SHIP_LOOK;
      if (own) registerShipModel(HULL, shipLookModel(game.shipLook.worn));
      // The crews' ships (src/hangar.js CREW_SHIPS) are drawn in their quests' drawings, made in code: there to fly once their crew's run is done.
      for (const def of CREW_SHIPS) registerShipModel(def.id, specialModel(def.id));
      return shipModel(flown);
    },
    // A pilot hears about the model only if it failed (QA, 2026-09-30).
    applyModel,
    modelFailed: (err) => { page.bootModelNote = `ship art unavailable / fallback loaded (${err.message})`; },
    // The rehearsal runs on a world of its own and a canvas nobody sees.
    makeWorld: () => new World(normalizeModel(PLACEHOLDER, 'placeholder')),
    makePresentation: (scratch) => createWorldPresentation(scratch, labStyle),
    makeRenderer: () => new Renderer(createCanvas()),
    drawHud: (r, scratch) => {
      drawLabTopStrip(r, scratch);
      drawLabCockpit(r, scratch, input, { reducedMotion: feedback.reducedMotion });
    },
    // The deck and the helmet at every level of the cockpit's wear and broken (cockpit-fx.js rehearseWear), the page's own wear put back.
    drawDamage: (r, scratch) => rehearseWear(r.ctx, r.width, r.height, () => {
      const layout = drawLabCockpit(r, scratch, input, { part: 'deck' });
      if (layout?.deck) drawHelmet(r);
      return layout;
    }),
  });
  const bootStartedAt = now();

  function bootFrame(at) {
    // A fault in the load or the title costs the load or the title, never the game.
    try {
      page.last = at;
      followPixelRatio();
      input.down.clear(); input.pressed.clear();       // what is typed on the title is not the game's
      renderer.begin();
      plan.pump(BOOT_BUDGET_MS);                       // the glyph warm-up draws here, in black, under the title
      const step = advanceTitle(title, plan, at, motionPreference.matches);
      if (step.becameReady) {
        title.loadMs = now() - bootStartedAt;
        if (title.show) announcementEl.textContent = 'Shuttle Blues is ready. Use arrow keys to select, Enter to confirm.';
        // The score under the title (SX, 2026-10-01: «Почему-то музыка на титульном скрине не играет», again 2026-10-02:
        // «нет музыки на титульном скрине»): the sound is made as soon as it is prepared, and the score plays while the title
        // waits. A browser that holds sound until the page is pressed keeps it quiet until the first press, which on the
        // title's menu only moves the choice (or chooses): the score begins under the title (titleMenu.wake).
        if (title.show) sound.unlock();
      }
      if (title.ready && title.show) sound.update(world, input, 0, { active: false });
      if (step.start) { startFlight(); return; }
      title.skyPointer.x += (titlePointer.x - title.skyPointer.x) * 0.06;
      title.skyPointer.y += (titlePointer.y - title.skyPointer.y) * 0.06;
      if (title.show) {
        advanceTitleFinal(titleFinal, { progress: title.progress, label: title.label, done: title.ready }, at);
        page.titleDrawn = drawTitleFinal(renderer, titleFinal, at);
        // The title's SETTINGS over it, the pause's pages in the pause's window (labs/graphics/pause.js settings): drawn over what the frame has
        // drawn, its own glyphs alone (src/renderer.js drawOver; a flush of the frame's would put the title's stars back over it).
        if (game.pause?.settings.shown()) renderer.drawOver(() => game.pause.settings.draw());
      }
      followCursor();
      stepCursor(pointer, at, { hint: canvas.style.cursor });
      drawCursor(renderer.ctx, pointer, at);
      crt.render();
    } catch (error) {
      log('boot failed, starting the flight without it', error);
      if (title.active) startFlight();
    }
  }

  // The flight begins: the load is over, the key that ended it is not the game's, and
  // the world starts stepping with the next frame.
  function startFlight() {
    // The key or click that starts the flight is the gesture sound waits for.
    sound.unlock();
    if (title.show) sound.play('start');
    title.active = false;
    input.down.clear(); input.pressed.clear(); clock.reset();
    // A look kept that this world has not opened (src/shipLooks.js settle) gives way to MODERN for this visit.
    game.shipLook?.settle?.();
    // The quests the flight starts with were there before it: the radio hears none of them as come (radio.js listenQuests).
    radio.since = null;
    announcementEl.textContent = '';
    // The lab's review links (labs/graphics/lab-drawer.js; none in the game).
    reviewLinks(game);
    if (page.bootFailed.length) notices.toast(`sprite missing: ${page.bootFailed.join(', ')}`, 'danger');
    else if (page.bootModelNote) notices.toast(page.bootModelNote);
    if (storage.held) saves.warnHeld();
    // The canvas a wreck's frame is kept on (respawn-fx.js), made now rather than in the frame a first wreck would ask for it.
    prepareFrame(respawnFx, canvas);
    // The controls are on the title now (SX, 2026-09-30: «стартовый поп-ап можно не
    // делать с управлением тогда, вызывать его только по кнопке ?»).
    // The first flight frame counts from here, not from before the sound's start: making the
    // audio context the first time holds the page about 0.3 s, which the world would
    // otherwise run as eight catch-up steps at once (audit FE-09). The pace lets that first frame draw whatever the refresh.
    framePace.reset();
    page.last = now();
  }

  bindTitleMenu({ window, canvas, title, final: titleFinal, input, choose: titleMenu.choose, wake: titleMenu.wake,
    unproject: (x, y) => crt.unproject(x, y), layout: () => page.titleDrawn, clock: now, modal: game.pause?.settings ?? null });
  // Nothing is saved while only the title has been up: the world has not run. The page puts it on `pagehide` where it always has, at the end of
  // its body, after the loop has started (the order of the page's listeners is its behaviour).
  function leave() { if (!title.active) saves.persist('lab-close'); }
  return { title, titleFinal, plan, bootFrame, startFlight, leave };
}
