import { CONFIG } from '../../src/config.js';
import { Asteroid } from '../../src/bodies.js';
import { CONTRACTS } from '../../src/contracts.js';
import { sectorById, stationDefById, startRuinOf } from '../../src/sectors.js';
import { spawnDroid } from '../../src/droids.js';
import { WORLD_SCALE } from '../../src/worldScale.js';

// A place of SX's layout (u of its sector), where it stands in the game's sector (src/worldScale.js): the same spot of the map.
const L = (u) => u * WORLD_SCALE;
const OPEN = Object.freeze({ x: L(3000), y: L(3400) });

// Every review location, with the label of its drawer button (the drawer lists them all, so
// it never falls behind this list).
//
// Planets are found by their seed. SX's map layout of 2026-10-02 re-seeded some (AMBERGRIS 27 -> 42256, GLOAMING 141 -> 1274,
// SORREL 152 -> 80454, GREEN ROOM 113 -> 9366); HOME stands in J-05 since then, and HOIST (the ruined garage) in J-04.
export const SCENES = {
  flight: { label: 'Flight', sector: 'sector-j05', fixture: 'A scene jump beside Relay 12; flight starts at rest.' },
  station: { label: 'Station', sector: 'sector-j04', fixture: 'A scene jump outside the real Dry Dock hull.' },
  planet: { label: 'Block planet', sector: 'sector-k05', planetSeed: 88, fixture: 'A scene jump outside the small planet’s orbit.' },
  'planet-classic': { label: 'Classic planet', sector: 'sector-j04', planetSeed: 42256, fixture: 'A scene jump beside AMBERGRIS, the pink banded planet in J-04.' },
  hole: { label: 'Black hole', sector: 'sector-j05', fixture: 'A scene jump outside the real black hole gravity well.' },
  rocks: { label: 'Rocks', sector: 'sector-j04', fixture: 'Three staged, shootable asteroids using normal game physics and drops.' },
  hidden: { label: 'Hidden sector', sector: 'sector-hidden', planetSeed: 9366, fixture: 'A scene jump into the hidden sector, beside the larger alien planet.' },
  // The three planets added with the colour pass (2026-09-30), one scene each.
  gloaming: { label: 'Gloaming', sector: 'sector-k04', planetSeed: 1274, fixture: 'A scene jump outside the mauve cratered planet in K-04.' },
  beryl: { label: 'Beryl', sector: 'sector-k04', planetSeed: 163, fixture: 'A scene jump outside the mint block planet in K-04.' },
  sorrel: { label: 'Sorrel', sector: 'sector-j05', planetSeed: 80454, fixture: 'A scene jump outside the pale cratered planet in J-05.' },
  // Open ground for the pirate fights (visitPirates): J-04, clear of its
  // station's refuge, its planets and its hole, with the usual field and no
  // staged rocks.
  open: { label: 'Open ground', sector: 'sector-j04', point: OPEN, fixture: 'A jump to open ground in J-04, at rest, clear of every station, planet and hole.' },
  // Another pilot's sign, drawn as STARS like every other pilot's (CONFIG.sign.others, 2026-10-01).
  sign: { label: 'A sign', sector: 'sector-j04', point: { x: L(2722), y: L(4046) - 216 }, fixture: 'Just above FARNSWORTH\'s sign in J-04, which is drawn as STARS like every other pilot\'s.' },
  // Fuel as oil (src/oil.js, 2026-10-01): the open ground, and a broken rock's oil and coins just ahead.
  oil: { label: 'Oil', sector: 'sector-j04', point: OPEN, oil: true, fixture: 'Open ground, and two scatters of oil and coins just ahead: the drops fly apart, then run together; the coins keep apart.' },
  // The ruins (src/ruins.js, 2026-09-30).
  // The start's broken station, which is each pilot's own (src/sectors.js START_STATIONS): HALCYON in the catalogue, the one
  // `?startRuin=` rolled in the lab; the world's (a scene's `sector` and `stationId` may be read from the world it is visited in).
  ruin: { label: 'Ruin', sector: (world) => stationDefById(startRuinOf(world.ledger)).sectorId, stationId: (world) => startRuinOf(world.ledger),
    fixture: 'A scene jump beside the start\'s ruined station: HALCYON, or the one ?startRuin= rolled.' },
  'ruin-garage': { label: 'Ruined garage', sector: 'sector-k04', stationId: 'station-foundry-k04', fixture: 'A scene jump beside the ruined garage FOUNDRY 2.' },
  // The pilot's home garage (src/home.js, labs/graphics/garage-art.js, 2026-10-02), in the middle of J-05 (SX's layout).
  home: { label: 'Home garage', sector: 'sector-j05', stationId: 'station-home-j04', fixture: 'A scene jump beside the pilot\'s home garage in J-05, the rock with its berth open to the south.' },
  // The two sectors east (2026-09-30).
  commons: { label: 'Commons', sector: 'sector-j06', stationId: 'station-commons-j06', fixture: 'A scene jump beside COMMONS, the ring in J-06.' },
  apiary: { label: 'Apiary', sector: 'sector-k06', stationId: 'station-apiary-k06', fixture: 'A scene jump beside APIARY, the hive in K-06.' },
};

// The wallet of a fresh lab pilot, and the floor the pirate buttons top it up to.
export const LAB_CREDITS = 240;

// Only call for a NEW lab save. These are review fixtures, not earned rewards.
// The caller owns storage isolation; this module never reads or writes storage.
// No souvenir is handed out any more (SX, 2026-10-01: «в мире сразу есть 4 тайника за
// пэйволом они не сразу в инвентаре»): a fresh lab pilot starts as a new game's does,
// the first four souvenirs waiting in their caches (src/rewards.js).
export function seedLab(world) {
  world.ledger.credits = LAB_CREDITS;
  // Use the real contract ledger: delivery, wrecks and recovery still work.
  world.ledger.accept(CONTRACTS[0]);
  world.cargo = null;
  world.updateCargo(0);
}

function clearPoint(world, x, y) {
  if (!world.isSafeResume(x, y) || world.edgeDepths(x, y).some(edge => edge.depth > 0)) return false;
  const margin = world.ship.radius + 60;
  for (const body of world.attractors) {
    const delta = world.delta(x, y, body.x, body.y);
    if (Math.hypot(delta.x, delta.y) < (body.orbit || body.kill) + margin) return false;
  }
  if (!world.clearance(x, y, margin)) return false;
  return world.asteroids.every(rock => Math.hypot(x - rock.x, y - rock.y) > rock.radius * 1.2 + margin);
}

function beside(world, focus, distance) {
  // Start beside the object, never inside a painted berth or an orbit.
  for (const angle of [0, Math.PI, -Math.PI / 2, Math.PI / 2]) {
    const point = { x: focus.x + Math.cos(angle) * distance, y: focus.y + Math.sin(angle) * distance };
    if (clearPoint(world, point.x, point.y)) return point;
  }
  throw new Error('No safe graphics lab arrival beside this object.');
}

function arrivalCamera(renderer, ship, focus, radiusX, radiusY) {
  // Frame the real-size object and ship on arrival. Normal camera following
  // resumes in the caller; there is no zoom, frozen simulation or fake orbit.
  const axis = (position, target, radius, span) => {
    const half = span / 2 - 24;
    const low = Math.max(position + 60, target + radius) - half;
    const high = Math.min(position - 60, target - radius) + half;
    const framed = low <= high ? Math.max(low, Math.min(high, position)) : (low + high) / 2;
    const shift = Math.max(0, half - 60);
    return Math.max(position - shift, Math.min(position + shift, framed));
  };
  return {
    x: axis(ship.x, focus.x, radiusX, renderer.view.w),
    y: axis(ship.y, focus.y, radiusY, renderer.view.h),
  };
}

// Lab-only teleport. Progress survives; bullets, loose drops and transient
// flight effects do not. The caller must also clear its Input, menus, feedback,
// ghost playback and visual-scale state, which are not owned by World.
export function visitScene(world, renderer, id) {
  const scene = SCENES[id];
  if (!scene) throw new RangeError(`Unknown graphics lab scene: ${id}`);
  const of = (v) => (typeof v === 'function' ? v(world) : v), stationId = of(scene.stationId);
  world.loadSector(sectorById(of(scene.sector)), { announce: false });
  // Do not carry the previous sector's free rocks through a lab teleport.
  world.asteroids = [];

  let focus, point, radiusX, radiusY;
  if (scene.planetSeed !== undefined) {
    focus = world.planets.find(planet => planet.seed === scene.planetSeed);
    if (!focus) throw new Error('Graphics lab planet is unavailable.');
    point = beside(world, focus, focus.radius + CONFIG.planet.orbit.height + world.ship.radius + 80);
    radiusX = radiusY = focus.radius * 1.05;
  } else if (id === 'hole') {
    focus = world.holes[0];
    if (!focus) throw new Error('Graphics lab black hole is unavailable.');
    point = beside(world, focus, Math.max(focus.horizon, focus.disc) + world.ship.radius + 100);
    // The disc is a circle (src/bodies.js), so it is as tall as it is wide.
    radiusX = radiusY = focus.disc * 1.12;
  } else if (scene.point) {
    point = scene.point;
    if (!clearPoint(world, point.x, point.y)) throw new Error('Graphics lab open-ground arrival is obstructed.');
    // Face the middle of the sector; there is nothing to frame.
    focus = { x: world.width / 2, y: world.height / 2 };
    radiusX = radiusY = 120;
  } else if (id === 'rocks') {
    // Positions, seeds and initial drift directions are lab staging only.
    // Asteroid supplies the tier radius/speed, rotation, splitting and drops.
    point = { ...OPEN };
    if (!clearPoint(world, point.x, point.y)) throw new Error('Graphics lab rock arrival is obstructed.');
    const rocks = [[250, -90, 0, 251], [45, -185, 1, 252], [-160, -110, 2, 253]]
      .map(([dx, dy, tier, seed]) => {
        const rock = new Asteroid(point.x + dx, point.y + dy, tier, seed, Math.random);
        // An ordinary tangential starting velocity avoids an immediate random
        // hit on arrival. World.step takes over; these are not scripted orbits.
        const speed = Math.hypot(rock.vx, rock.vy), distance = Math.hypot(dx, dy);
        rock.vx = -dy / distance * speed;
        rock.vy = dx / distance * speed;
        return rock;
      });
    world.asteroids.push(...rocks);
    focus = rocks[0];
    radiusX = radiusY = focus.radius * 1.2;
  } else {
    focus = stationId ? world.stations.find((s) => s.id === stationId) : world.stations[0];
    if (!focus) throw new Error('Graphics lab station is unavailable.');
    const distance = id === 'flight' || stationId ? focus.interactRadius + 100 : focus.hullRadius + world.ship.radius + 90;
    point = beside(world, focus, distance);
    // The home garage's board is its drawing's (the presentation sets `footprint`); the rest are framed by their models.
    const art = focus.kind === 'home' && focus.footprint ? focus.footprint : { model: focus.model, scale: focus.model.scale };
    radiusX = art.model.width * renderer.cellW * art.scale / 2;
    radiusY = art.model.height * renderer.cellH * art.scale / 2;
  }

  const ship = world.ship;
  Object.assign(ship, {
    x: point.x, y: point.y, vx: 0, vy: 0,
    angle: Math.atan2(focus.y - point.y, focus.x - point.x), angVel: 0,
    alive: true, respawnIn: 0, invuln: 0, cooldown: 0, jolt: 0, holeGrace: 0,
    thrusting: false, retroing: false, animating: false, wasAnimating: false,
    animCursor: 0, frameTimer: 0, flamePhase: 0,
  });
  world.clearPause();
  world.docked = null;
  world.selectedId = null;
  world.selected = null;
  world.bullets = [];
  world.particles.items = [];
  world.events = [];
  world.orbitContact.clear();
  world.ropeDive = { deepest: 0, told: false };
  world.fogWake = [];
  world.spillReadyAt = -Infinity;
  world.recorder.reset();
  world.cargo = null;
  world.updateCargo(0);
  world.cam = arrivalCamera(renderer, ship, focus, radiusX, radiusY);
  // The normal field stays active, with the usual clear spawn around the ship.
  world.spawnAsteroids(world.sector.asteroids);
  if (scene.oil) stageOil(world);
  return { id, sectorId: world.sector.id, focus: { x: focus.x, y: focus.y }, fixture: scene.fixture };
}

// Two scatters as a broken rock throws them (World.releaseDrop), ahead of the ship: half a fuel unit a drop
// of oil, a credit a coin, thrown out from one point each at the drops' burst speeds.
function stageOil(world) {
  const D = CONFIG.asteroid.drops, ship = world.ship, rng = world.rng('drop');
  const ux = Math.cos(ship.angle), uy = Math.sin(ship.angle);
  for (const [ahead, side, oil, coins] of [[420, -120, 7, 4], [520, 220, 5, 6]]) {
    const x = ship.x + ux * ahead - uy * side, y = ship.y + uy * ahead + ux * side;
    const n = oil + coins, turn = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.8, v = D.burst[0] + rng() * (D.burst[1] - D.burst[0]);
      const drop = { id: `drop-${++world.dropSerial}`, value: i < oil ? 0 : D.value, age: 0, x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, phase: (world.dropSerial % 7) / 7 };
      if (i < oil) { drop.kind = 'fuel'; drop.units = D.oil.unit; }
      world.drops.push(drop);
    }
  }
}

// Lab-only: a pirate encounter on demand (the drawer's PIRATES buttons and
// `?pirates=N`). The pilot is jumped to open ground at rest with a full hull, so
// the encounter is live (a station's refuge would end it), and `count` pirates
// (1-4) appear outside the view, coming for the ship. The caller clears its
// Input, menus, feedback and ghost, as for visitScene. Progress is untouched:
// what pirates take from the lab pilot (coins, cargo) is really taken. So that
// there is always something to take, the wallet is topped up to the fixture's
// 240 CR if it is lower, and the fixture delivery is carried again if it is
// neither carried, lost nor done: the lab only ever adds here, like seedLab.
// `kind` and `paint` (`?pirates=3&kind=maw&paint=ember`) name the squad's hull and paint, for
// a review of one of them; anything that is not one of CONFIG.pirates' leaves it to the dice.
export function visitPirates(world, renderer, count, { kind = null, paint = null } = {}) {
  const result = visitScene(world, renderer, 'open');
  world.hull = world.hullMax;
  world.hullGrace = 0;
  if (world.ledger.credits < LAB_CREDITS) world.ledger.credits = LAB_CREDITS;
  const fixture = CONTRACTS[0];
  if (!world.ledger.active && !world.ledger.stranded.has(fixture.id) && !world.ledger.completed.has(fixture.id)) {
    world.ledger.accept(fixture);
    world.cargo = null;
    world.updateCargo(0);
  }
  world.pirates.length = 0;
  world.encounter = null;
  const named = {};
  if (kind && Object.hasOwn(CONFIG.pirates.types, kind)) named.types = Array(count).fill(kind);
  if (CONFIG.pirates.paints.some((q) => q.id === paint)) named.paint = paint;
  world.spawnPirates(count, named);
  return { ...result, pirates: world.pirates.length };
}

// Lab-only: a service droid on demand (`?droid=fuel|repair`). The pilot is jumped to
// open ground, the hull and the tank taken down so the droid has something to sell, and the
// droid comes in 800 u ahead, its first stop 230 u in front of the ship.
export function visitDroid(world, renderer, kind) {
  const result = visitScene(world, renderer, 'open');
  const ship = world.ship;
  if (kind === 'repair') world.hull = Math.min(world.hull, Math.ceil(world.hullMax / 2));
  else world.fuel = Math.min(world.fuel, world.fuelTank / 2);
  if (world.ledger.credits < LAB_CREDITS) world.ledger.credits = LAB_CREDITS;
  world.droids.length = 0;
  const ux = Math.cos(ship.angle), uy = Math.sin(ship.angle);
  // Its first stop inside its menu's reach of the ship (CONFIG.droids.interactRadius), so a still ship is served there.
  const at = { x: ship.x + ux * 800, y: ship.y + uy * 800 };
  const route = [{ x: ship.x + ux * 220 - uy * 70, y: ship.y + uy * 220 + ux * 70 }, { x: ship.x - uy * 1400, y: ship.y + ux * 1400 }];
  const droid = spawnDroid(world, { kind, at, route, silent: true });
  return { ...result, droid: droid?.id ?? null };
}
