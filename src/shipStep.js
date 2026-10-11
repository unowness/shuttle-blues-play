// The ship's step in open space: the pulls on the hull (gravity, a station's push, a planet's orbit, a dead edge's rope),
// the engine's share of authority (an empty tank's limp, a towed cargo's lower top speed), and the step of the ship itself.
// Moved out of World.step as it was (chat F1, 2026-10-04, the roadmap's refactoring piece: the ship's step out of
// src/world.js); World.step calls stepShip at the same place, and World.stepOrbits and World.holdOffSurfaces hand over to the
// two below, so every reader is unchanged. The golden master (tools/golden.mjs) holds the move to the same frames and the
// same world.
import { CONFIG } from './config.js';
import { clamp } from './util.js';
import { cargoOf } from './contracts.js';
import { specialLoadTop } from './specials.js';
import { FLIGHT } from './flightConfig.js';
import { stepDrift, stepDriftPush, dropDrift } from './drift.js';
import { trickPreset, takeOff, stepAir, endAir, stepLanding } from './trick.js';
import { steered } from './steering.js';

// One step of `dt` s of the ship flying free. Hands that carry a direction on the screen (GAMEPLAY's STEERING SCREEN, `input.aim`) are
// made the chassis' verbs here, every step, before anything reads them (src/steering.js steered).
export function stepShip(world, dt, hands) {
  const ship = world.ship, input = steered(ship, hands);
  ship.pull = 0;
  // The drift and the trick, where the page turned them on (src/drift.js, src/trick.js); without them this is the step it always was.
  if (world.stunts && stepStunts(world, dt, input)) return;
  if (ship.alive) {
    const g = world.gravityAt(ship.x, ship.y);
    ship.vx += g.x * dt;
    ship.vy += g.y * dt;
    ship.pull = Math.hypot(g.x, g.y);
    for (const s of world.stations) s.repel(ship, world.delta.bind(world), dt);
    stepOrbits(world, dt);
    world.stepBoundary(dt);
  }
  ship.limp = world.fuel > 0 ? 1 : CONFIG.fuel.limp;
  // A towed cargo lowers the top speed (CONFIG.cargo.sizes `top`); its mass is felt
  // through the tether (src/tow.js), not as a share of the engine.
  const load = world.ledger.active ? cargoOf(world.ledger.activeJob()) : null;
  ship.loadTop = load ? load.top : specialLoadTop(world);
  if (!(world.stunts && stepDrift(world, dt, input))) ship.step(dt, input);
  if (world.stunts) afterGround(world, dt);
}

// A step this long after the last one (s) means the ship was held meanwhile.
const STALE = 0.05;

// The hands' presses for the drift and the trick, each read as held (or tapped within the frame), a press the step it first is. Two
// ways to jump and play a figure:
//   input.jump, input.figure           a jump and a figure with no side: the mouse's (grammar D), and MOUSE + HOTKEYS' Space
//   input.stuntLeft, input.stuntRight  the pair (Q and E; SX, 2026-10-05: «Q и E это одновременные прыжок и трюк.
//                                      Зависит от того, что нажали первым ... флип влево когда делаешь трюк с помощью Q, флип
//                                      вправо, когда делаешь флип с помощью E»): on the ground either key jumps, the first pressed (the
//                                      left when both come in one step), and that key holds the jump up; in the air the other plays
//                                      the figure, turned to its own side. Pressed again in the air, the key that jumped asks for the
//                                      next jump, as the jump's own press does.
// A jump that cannot be taken at once (in a drift) waits FLIGHT.trick.motion.buffer s, with the key that asked for it.
const SIDES = Object.freeze({ left: -1, right: 1 });
function hands(world, input) {
  const h = world.stuntHands;
  const now = { jump: !!input.jump, figure: !!input.figure, left: !!input.stuntLeft, right: !!input.stuntRight };
  const press = {};
  for (const k in now) { press[k] = now[k] && !h[k]; h[k] = now[k]; }
  return press;
}
// The jump this step's presses ask for, kept with its key: on the ground by either of the pair (the left first) or the jump; in the
// air only by the key that jumped, or the jump.
function askJump(world, press) {
  const h = world.stuntHands, by = world.air?.by ?? null, ask = (side) => by === null || by === side;
  const jumpBy = press.left && ask(SIDES.left) ? SIDES.left : press.right && ask(SIDES.right) ? SIDES.right : press.jump ? 0 : null;
  if (jumpBy !== null) { h.buffered = world.time; h.by = jumpBy; }
}
// What the hands do in the air: the jump held up by the key that jumped (or the jump with no side, as it always was); a figure by the
// other key of the pair, turned to that key's side, or by the figure with no side. One figure a step.
function airHands(air, input, press) {
  const held = !!input.jump || (air.by === SIDES.left && !!input.stuntLeft) || (air.by === SIDES.right && !!input.stuntRight);
  const side = press.left && air.by !== SIDES.left ? SIDES.left : press.right && air.by !== SIDES.right ? SIDES.right : press.figure ? 0 : null;
  return { jump: held, figurePress: side !== null, figureSide: side ?? 0 };
}

// The step in the air, in place of the ship's own. Returns true when the ship was up (nothing else moves it this step).
function stepStunts(world, dt, input) {
  const ship = world.ship, press = hands(world, input);
  if (!ship.alive || world.docked) {
    // A berth or a wreck takes the ship: no drift, no jump.
    if (world.air) endAir(world);
    if (world.drift || world.driftPush) dropDrift(world);
    askJump(world, press);
    return false;
  }
  // A drift or a jump left behind while the ship was held (docked, a screen's dock menu): ended, not resumed.
  if (world.air && world.time - world.air.lastStep > STALE) endAir(world);
  if (world.drift && world.time - world.drift.lastStep > STALE) dropDrift(world);
  askJump(world, press);
  // A press of a jump takes the ship up this very step (the clearance counts from the press: a press just before a rock clears it),
  // unless a drift is under way (the press then waits FLIGHT.trick.motion.buffer s for it to end) or the garage holds the ship.
  const h = world.stuntHands;
  if (!world.air && trickPreset(world) && !world.drift && !world.home && world.time - h.buffered <= FLIGHT.trick.motion.buffer) {
    h.buffered = -Infinity;
    takeOff(world, h.by);
  }
  if (!world.air) return false;
  stepAir(world, dt, { ...input, ...airHands(world.air, input, press), damp: input.damp, turn: input.turn });
  return true;
}

// After the ship's step on the ground: the speed a landing gives back, and the push out of a drift.
function afterGround(world, dt) {
  stepLanding(world, dt);
  stepDriftPush(world, dt);
}

// A planet's orbit pushes a ship back out and brakes its fall (SX,
// 2026-09-24). The push grows with the square of depth, like the dead-edge
// current, and only inward speed is braked, so how deep a ship gets depends
// on how fast it was falling: along a tangent it is turned away, straight in
// and fast it reaches the surface. Crossing the orbit line sets the hull
// tumbling by its sideways speed and weakens control (`ship.jolt`) until
// `recover` seconds after it is out again.
export function stepOrbits(world, dt) {
  const ship = world.ship;
  const O = CONFIG.planet.orbit;
  let inside = false;
  for (const p of world.planets) {
    const d = world.delta(ship.x, ship.y, p.x, p.y);
    const dist = Math.hypot(d.x, d.y);
    const surface = p.radius * 0.97;
    const orbit = p.radius + O.height;
    if (dist >= orbit || dist < 1e-6) { world.orbitContact.delete(p); continue; }
    inside = true;
    const nx = d.x / dist, ny = d.y / dist;
    if (!world.orbitContact.has(p)) {
      world.orbitContact.set(p, Math.max(0, -(ship.vx * d.x + ship.vy * d.y) / dist));
      const side = ship.vy * nx - ship.vx * ny;       // speed along the orbit
      ship.angVel += clamp(side * O.spin / 1000, -O.maxSpin, O.maxSpin);
      world.emit('orbitContact', { sectorId: world.sector.id, x: ship.x, y: ship.y });
    }
    const f = clamp((orbit - dist) / (orbit - surface), 0, 1);
    const out = ship.vx * nx + ship.vy * ny;          // positive when leaving
    let a = O.push * f * f;
    if (out < 0) a += O.damping * f * f * -out;
    ship.vx += nx * a * dt;
    ship.vy += ny * a * dt;
  }
  ship.jolt = inside ? 1 : Math.max(0, ship.jolt - dt / O.recover);
}

// Planets are solid even to a ship that cannot be wrecked right now (just
// spawned, just undocked): it is held at the surface instead of passing
// through. A vulnerable ship that reaches the surface is wrecked in
// resolveHits.
export function holdOffSurfaces(world) {
  const ship = world.ship;
  if (!ship.alive || ship.invuln <= 0) return;
  for (const p of world.planets) {
    const d = world.delta(ship.x, ship.y, p.x, p.y);
    const dist = Math.hypot(d.x, d.y);
    const surface = p.radius * 0.97;
    if (dist >= surface) continue;
    const nx = dist > 1e-6 ? d.x / dist : 1, ny = dist > 1e-6 ? d.y / dist : 0;
    ship.x = p.x + nx * surface;
    ship.y = p.y + ny * surface;
    const out = ship.vx * nx + ship.vy * ny;
    if (out < 0) { ship.vx -= nx * out; ship.vy -= ny * out; }
  }
}
