// What the game loads and warms behind its title, so that nothing is built, parsed,
// compiled or rasterised for the first time while the ship is flying.
//
// Measured on 2026-09-30 (tools/flight-probe.mjs, M1 Pro, Chrome): the first frame of
// a flight took 15-16 ms and the next few 3-5 ms; a planet coming into view for the
// first time cost 5-9 ms against 1 ms once its drawing had run a few times; each ship
// size the breathing scale reached for the first time, and each quarter-pixel of a
// glyph, made a mask; the ship's model was fetched beside the first frames, not before
// them; and the key that starts the flight made the sound's noise and the score's reverb
// (unlock() took 245 ms the first time, 20 ms of it the reverb's samples). Every step here
// is one of those, moved before the flight:
//
//   assets      the sprites and the ship's model (in parallel)
//   sound       the noise and the reverb's impulse, samples only: no AudioContext is made
//               until a key is pressed (the context's own start is not moved)
//   sectors     every sector's planets, holes, stations and moored rocks, its coins,
//               caches, signals and signs, and a field of rocks made and thrown away
//   simulation  a scratch world stepped a few seconds with thrust, fire, pirates
//   drawing     that scratch world drawn (stars, bodies, seams, rocks, shots, pirates,
//               sparks, ship) and the cockpit, on a canvas that is never shown, so the
//               drawing code is compiled and the fonts, shapes and colours are known
//   damage      the same scratch world hit down to a wreck and brought back, and the cockpit
//               drawn at every level of its wear and broken (2026-10-06)
//   glyphs      every character at every size, at each quarter pixel (warmup.js), on
//               the real canvas in black
//
// The plan (plan.js) is pumped once a frame by the caller, after the frame is cleared,
// so the glyph warm-up is drawn into a frame that is really rendered. Each step reports
// how far it is; the bar is the share of the weight done, not a clock.

import { createPlan } from './plan.js';
import { warmSizes, warmChars, warmSize } from './warmup.js';
import { prepareSound } from '../../src/audio.js';
import { LOOK_SCALE } from './station-art.js';

// Sizes that come from a module's own constant and no configuration: the aliens of the
// hidden sector (src/aliens.js SCALE), and the station looks (station-art.js LOOK_SCALE).
// checks/preload.mjs fails if a scene draws any size that is not warmed, so a new one
// cannot be forgotten quietly.
export const EXTRA_SIZES = Object.freeze([0.8, LOOK_SCALE]);

// The rehearsal's blows: the hull's share each leaves, a level of the cockpit's wear each (cockpit-fx.js damageLevel: under 80, 60,
// 40, 20 %), then nothing: the wreck.
export const DAMAGE_REHEARSAL = Object.freeze([0.7, 0.5, 0.3, 0.1, 0]);

// Views centred on each body of the world's sector and the sectors beside it, and on
// its coins, caches, signals and signs: the places the drawing has something to draw.
export function tourCameras(world) {
  const out = [];
  const add = (thing, ox = 0, oy = 0) => { if (thing) out.push({ x: thing.x + ox, y: thing.y + oy }); };
  for (const list of [world.planets, world.holes, world.stations, world.caches, world.signals]) list.forEach((t) => add(t));
  for (const n of world.neighbours) {
    const b = world.sectorBodies(n.sector);
    for (const list of [b.planets, b.holes, b.stations]) list.forEach((t) => add(t, n.ox, n.oy));
  }
  return out;
}

// deps (all injected, so this runs against fakes in a check):
//   world, config, sectors, Asteroid, cachesIn, signalsIn
//   loadSprites(fetchSprite), fetchSprite(url, options), spritesLoaded(failed)
//   loadShipModel() -> promise, applyModel(model), modelFailed(error)
//   loadPictures() -> promise (optional: the souvenirs' dithered photographs)
//   prepareSound() -> iterator of shares done (optional: src/audio.js's by default)
//   makeWorld(), makePresentation(world), makeRenderer(), drawHud(renderer, world)
//   renderer (the real one), stationModels()
export function buildBootPlan(deps, planOptions) {
  const { world, config } = deps;
  const plan = createPlan(planOptions);

  plan.add({
    id: 'assets', label: "SHIPS AND WORLD", weight: 4,
    run(step) {
      let started = 0, done = 0, total = 1;                       // the ship's model is one
      const settle = () => { done++; step.fraction = done / total; };
      const counted = async (url, options) => {
        started++;
        try { return await deps.fetchSprite(url, options); } finally { settle(); }
      };
      const sprites = deps.loadSprites(counted).then((failed) => deps.spritesLoaded(failed));
      total += started;                                            // every sprite fetch has begun
      const ship = deps.loadShipModel().then((model) => deps.applyModel(model), (error) => deps.modelFailed(error));
      ship.then(settle, settle);
      const pictures = deps.loadPictures ? (total++, deps.loadPictures().then(() => {}, () => {})) : Promise.resolve();
      if (deps.loadPictures) pictures.then(settle, settle);
      return Promise.all([sprites, ship, pictures]);
    },
  });

  // Samples the sound needs and no context is needed to make, a piece a frame.
  plan.add({
    id: 'sound', label: 'SOUND', weight: 1,
    *run() { yield* (deps.prepareSound || prepareSound)(); },
  });

  for (const sector of deps.sectors) {
    plan.add({
      id: `sector:${sector.id}`, label: `SECTOR ${sector.label}`, weight: 1,
      run() {
        world.sectorBodies(sector);
        deps.cachesIn(sector.id);
        deps.signalsIn(sector.id);
        world.signsIn(sector.id);
        // What a visit does, done once early: the rocks of the field made and thrown
        // away, and one of each size for when they split. Their dice are the page's own, not the world's: a warm-up draws nothing from it.
        for (let i = 0; i < (sector.asteroids || 0); i++) new deps.Asteroid(0, 0, 0, undefined, Math.random);
        for (const tier of [1, 2]) new deps.Asteroid(0, 0, tier, undefined, Math.random);
      },
    });
  }

  // A scratch world and a canvas nobody sees: the real world and screen are never touched.
  plan.add({
    id: 'rehearsal', label: 'CHECKING FLIGHT', weight: 5,
    *run() {
      const scratch = deps.makeWorld();
      scratch.autoEncounters = false;
      const presentation = deps.makePresentation(scratch);
      const view = deps.makeRenderer();
      const input = { thrust: true, retro: false, turn: 1, damp: false, fire: true };
      const dt = config.sim.step;
      scratch.spawnPirates(2);
      const chunks = 6, perChunk = 60;
      const draw = () => { view.begin(); presentation.prepare(); scratch.draw(view); view.flush(); };
      for (let chunk = 0; chunk < chunks; chunk++) {
        input.turn = chunk % 2 ? -1 : 1;
        input.damp = chunk === 4;
        for (let i = 0; i < perChunk; i++) scratch.step(dt, input);
        scratch.updateCamera(view, 0.5);
        draw();
        if (chunk === 0) deps.drawHud(view, scratch);
        yield ((chunk + 1) / (chunks + 1)) * 0.5;
      }
      // A tour of the sector: the view over each body and each thing to pick up.
      scratch.ship.invuln = Infinity;
      const cameras = tourCameras(scratch);
      for (let i = 0; i < cameras.length; i++) {
        scratch.cam = { ...cameras[i] };
        draw();
        yield 0.5 + ((i + 1) / cameras.length) * 0.35;
      }
      // Blows down to a wreck, and the return: what the first blow of a flight, the first worse level of the hull and the first wreck
      // would otherwise run for the first time in the frame they happen (2026-10-06, SX's H panel: the worst frames came with damage;
      // docs/playbook/rendering-performance.md, "Spikes on events"). The hull chipped and its sparks, the wreck's pieces turning and
      // at rest, drawn; the cockpit's every level, a blow's burst, the pieces flung and the deck's break (`drawDamage`).
      const idle = { thrust: false, retro: false, turn: 0, damp: false, fire: false };
      scratch.cam = { x: scratch.ship.x, y: scratch.ship.y };
      for (const share of DAMAGE_REHEARSAL) {
        scratch.ship.invuln = 0; scratch.hullGrace = 0;
        scratch.damageShip(Math.max(1, Math.ceil(scratch.hull - share * scratch.hullMax)), 'asteroid');
        for (let i = 0; i < 6; i++) scratch.step(dt, idle);
        draw();
      }
      for (let i = 0; i < 1200 && !scratch.ship.alive; i++) {
        scratch.step(dt, idle);
        if (i === 30) draw();
      }
      draw();
      yield 0.9;
      deps.drawDamage?.(view, scratch);
      yield 1;
      view.canvas.width = view.canvas.height = 0;                 // let go of the canvas
    },
  });

  plan.add({
    id: 'glyphs', label: 'TEXT', weight: 5,
    *run(step) {
      const renderer = deps.renderer;
      const sizes = warmSizes({ models: [world.ship.model], stations: deps.stationModels(), config, extra: EXTRA_SIZES });
      for (let i = 0; i < sizes.length; i++) {
        step.label = `TEXT ${Math.round(renderer.fontSize * sizes[i] * 100) / 100} PX`;
        warmSize(renderer, sizes[i], warmChars(sizes[i]), config);
        yield (i + 1) / sizes.length;
      }
    },
  });

  // The smoke's shade tiles (Renderer.warmRows): '░' in the smoke's ink at each sixteenth up to its strength (a bucket's alpha is in
  // sixteenths; the side smoke and a cloud's dimmed cells lay it fainter). They were made on the first frame in the smoke.
  plan.add({
    id: 'smoke', label: 'SMOKE', weight: 1,
    run() {
      const alphas = [];
      for (let q = 0; q <= Math.round(config.smoke.shade * 16); q++) alphas.push(q / 16);
      deps.renderer.warmRows?.(config.sector.boundary.fog.shade.ch, config.smoke.ink, alphas);
    },
  });

  return plan;
}
