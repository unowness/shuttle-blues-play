import { CONFIG } from './config.js';
import { TAU, clamp } from './util.js';
import { anchorOf } from './tow.js';
import { sprite, drawSprite, halfHeight } from './sprites.js';

// PLANET EXPRESS's train of crates (QUESTS_V2_HANDOFF.md, round three; SX, 2026-10-02: «это не один груз, как обычно, а
// это такой паровозик грузов из трех грузов. То есть ты таким паровозом едешь на планет-экспрессе ... метка меняется, у
// тебя грузов становится меньше, но сначала ты длинный везешь»): `n` containers, each on a tether to the one before it,
// the first to the ship's tail.
//
// It borrows the tow's numbers (CONFIG.cargo.tow: the tether's length at rest, its spring and damping, the give, the
// containers' drag and the turn toward the tether) and its drawing (the container sprite, the dotted tether), but not
// src/tow.js itself: that is one body on one contract with its own collisions, damage and save, tuned by SX's flights.
// A train here is a chain of followers that pull on nothing but their own tethers: they feel gravity, a planet's cushion
// and a dead edge's current as the hull does, hang back on a tether that only pulls, and meet nothing (a rock passes
// through a crate: it is a quest's prop, never hurt, never hurting). The ship is slowed to `loadTop` of its top speed
// while it has a train (World.step), the train's weight.
//
//   cars: [{ x, y, vx, vy, angle }]   the first is the nearest the ship

const T = () => CONFIG.cargo.tow;
const SIZE = () => CONFIG.cargo.sizes.small;           // the crates are small ones, three of them (CONFIG.cargo.sizes)
const half = () => T().half * SIZE().scale;            // from a crate's middle to its end
const gap = () => 70 * SIZE().scale;                   // the tether's length at rest, end to end

// A train lying straight behind the ship, at rest on its tethers.
export function makeTrain(world, n) {
  const ship = world.ship, back = ship.angle + Math.PI;
  const at = anchorOf(ship), cars = [];
  let d = gap() + half();
  for (let i = 0; i < n; i++) {
    cars.push({ x: at.x + Math.cos(back) * d, y: at.y + Math.sin(back) * d, vx: ship.vx, vy: ship.vy, angle: ship.angle });
    d += 2 * half() + gap();
  }
  return cars;
}

// One step: each car follows the thing before it (the ship's tail anchor, then the car in front's tail).
export function stepTrain(world, cars, dt) {
  const ship = world.ship, C = T();
  if (!ship.alive || world.docked) return;
  let lead = { ...anchorOf(ship), vx: ship.vx, vy: ship.vy };
  for (const car of cars) {
    const g = world.gravityAt(car.x, car.y), o = world.orbitAccel(car.x, car.y, car.vx, car.vy);
    const b = world.topology.mode === 'plane' ? world.boundaryAccel(car.x, car.y, car.vx, car.vy) : { ax: 0, ay: 0 };
    car.vx += (g.x + o.ax + b.ax) * dt;
    car.vy += (g.y + o.ay + b.ay) * dt;
    const k = Math.max(0, 1 - C.drag * dt);
    car.vx *= k; car.vy *= k;
    car.x += car.vx * dt; car.y += car.vy * dt;
    // The tether: it only pulls. Taut, a spring and its damping take the stretch and the parting speed out of the car,
    // and past the give it is rigid, the car held on it.
    const d = world.delta(car.x, car.y, lead.x, lead.y), dist = Math.hypot(d.x, d.y), L = gap() + half();
    if (dist > L && dist > 1e-6) {
      const nx = d.x / dist, ny = d.y / dist, stretch = dist - L, w = C.spring;
      const apart = (car.vx - lead.vx) * nx + (car.vy - lead.vy) * ny;
      const pull = Math.max(0, w * w * stretch + 2 * C.damping * w * apart) * dt;
      car.vx -= nx * pull; car.vy -= ny * pull;
      const limit = L * C.give;
      if (stretch > limit) {
        car.x -= nx * (stretch - limit); car.y -= ny * (stretch - limit);
        const caught = (car.vx - lead.vx) * nx + (car.vy - lead.vy) * ny;
        if (caught > 0) { car.vx -= nx * caught; car.vy -= ny * caught; }
      }
    }
    // It points toward what pulls it, easing round.
    const want = Math.atan2(-d.y, -d.x);
    const diff = Math.atan2(Math.sin(want - car.angle), Math.cos(want - car.angle));
    car.angle += clamp(diff * Math.min(1, C.align * dt), -(C.maxSpin ?? 2.5) * dt, (C.maxSpin ?? 2.5) * dt);
    if (car.angle > Math.PI) car.angle -= TAU;
    if (car.angle < -Math.PI) car.angle += TAU;
    lead = { x: car.x - Math.cos(car.angle) * half(), y: car.y - Math.sin(car.angle) * half(), vx: car.vx, vy: car.vy };
  }
}

// The train, crate by crate, with the dotted tethers between (as the one cargo is drawn, src/world.js draw).
export function drawTrain(world, r, cars, t) {
  if (!cars.length || !world.ship.alive) return;
  const art = sprite('cargo-container'), scale = CONFIG.cargo.spriteScale * SIZE().scale;
  const ship = world.project(r, world.ship.x, world.ship.y), rear = world.ship.drawnRear();
  let from = { x: ship.x - Math.cos(world.ship.angle) * rear, y: ship.y - Math.sin(world.ship.angle) * rear };
  const hh = art ? halfHeight(r, art, scale) : 0;
  for (const car of cars) {
    const p = world.project(r, car.x, car.y), ux = Math.cos(car.angle), uy = Math.sin(car.angle);
    const near = { x: p.x + ux * hh, y: p.y + uy * hh };
    const dx = near.x - from.x, dy = near.y - from.y, len = Math.hypot(dx, dy);
    const marks = clamp(Math.round(len / 18), 2, 6);
    for (let i = 1; i <= marks; i++) r.glyph(CONFIG.cargo.tetherGlyph, from.x + (dx * i) / (marks + 1), from.y + (dy * i) / (marks + 1), CONFIG.cargo.color, 0.9);
    if (art) drawSprite(r, art, t, p.x, p.y, { scale, angle: car.angle + Math.PI / 2 });
    else r.glyph(CONFIG.cargo.glyph, p.x, p.y, CONFIG.cargo.color, 1, 1.6);
    from = { x: p.x - ux * hh, y: p.y - uy * hh };
  }
}
