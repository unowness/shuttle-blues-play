// Shots and blows (cut out of src/world.js, PLAN D3, 2026-10-09; the code is as it was, `this` now `world`): what costs the hull points (the
// one entry point, damageShip), a touch against a rock (bumpShip), the pilot's and the pirates' shots in flight and what they hit
// (stepBullets, resolveHits, which ends in what the hull meets, src/contact.js), and a rock broken (breakAsteroid; by the hull, ramAsteroid). The calls between them go
// through the world, as they did, so a tool that swaps one on a World (tools/asteroid-balance-sim.mjs) still reaches the others. World keeps
// a one-line method of each name the contact, the pirates, the tow, the tools and the checks call.
import { CONFIG } from './config.js';
import { TAU, clamp, between, wrapTo } from './util.js';
import { WRAP } from './topology.js';
import { shipContacts } from './contact.js';
import { absorbShot } from './encounters.js';
import { knockDroid } from './droids.js';
import { chipHull } from './debris.js';

// The one public entry point for anything that costs hull points -- today
// only a rock, later a pirate hit. Self-contained: it honours the ship's
// own invulnerability (respawn, just-undocked) and its own flat `grace`
// afterwards, so a caller never has to re-check either. Reaching 0 wrecks
// through the existing flow (cause is passed straight through); a respawn
// refills it. `detail` is extra fields for the event (who did it), except
// its `obstacle`, a sketch of the rock that did it, which goes to the wreck
// (the ghost draws it: the hull system had dropped it, and an asteroid wreck
// left a ghost with nothing to crash into). Returns whether the hit counted
// (a hit blocked by invulnerability or by the grace second returns false), so
// a caller that pays a price for a hit, like the coins a pirate shot knocks
// out, pays it only when it counted.
export function damageShip(world, amount, cause = 'impact', detail = {}) {
  const ship = world.ship;
  if (!ship.alive || world.docked || ship.invuln > 0 || world.hullGrace > 0 || amount <= 0) return false;
  const before = world.hull;
  // `at`: where the blow fell and how the thing that struck moved ({ x, y, vx, vy }: a shot, a ram), for the parts it knocks off.
  const { obstacle = null, at = null, ...fields } = detail;
  world.hull = clamp(world.hull - amount, 0, world.hullMax);
  world.hullGrace = CONFIG.hull.grace;
  world.emit('shipDamaged', {
    sectorId: world.sector.id, x: ship.x, y: ship.y,
    amount: before - world.hull, cause, hull: world.hull, ...fields,
  });
  if (world.hull <= 0) world.wreckShip(cause, obstacle);
  else chipHull(world, before - world.hull, at);
  return true;
}

// A slow touch against a rock: push the hull back out along the contact,
// take the closing speed away with a little bounce, hand some of it to a
// free rock, and shed bright sparks and a few of the hull's own glyphs, the
// way damage looks. Reused for every rock contact, gentle or hard alike
// (World.damageShip decides what, if anything, it costs); a hard one breaks the rock instead (ramAsteroid); no
// coins: a bump spilled the wallet until 2026-10-01 (CONFIG.asteroid.bump
// `spillOnBump`).
export function bumpShip(world, rock, nx, ny, closing, touch) {
  const B = CONFIG.asteroid.bump;
  const ship = world.ship;
  ship.x = rock.x + nx * touch;
  ship.y = rock.y + ny * touch;
  if (closing > 0) {
    const back = closing * (1 + B.restitution);
    ship.vx += nx * back;
    ship.vy += ny * back;
    if (!rock.moored) {
      rock.vx -= nx * closing * B.rockPush;
      rock.vy -= ny * closing * B.rockPush;
    }
  }
  if (closing <= B.sparkMin) return;
  const cx = ship.x - nx * ship.radius, cy = ship.y - ny * ship.radius;
  const sparks = Array.from({ length: 9 }, (_, k) => ({
    ch: B.sparks[k % B.sparks.length], color: B.colors[k % B.colors.length],
  }));
  const hull = ship.frameCells.slice(0, 3).map((c) => ({ ch: c.ch, color: c.color }));
  world.particles.burst(cx, cy, [...sparks, ...hull], {
    vx: ship.vx * 0.3, vy: ship.vy * 0.3, aim: Math.atan2(ny, nx),
    speed: [90, 260], life: [0.25, 0.65],
  });
  world.emit('shipBumped', { sectorId: world.sector.id, x: cx, y: cy, speed: Math.round(closing) });
  if (B.spillOnBump && closing >= CONFIG.hull.touchSpeed) world.spillCoins(cx, cy);
}

export function stepBullets(world, dt) {
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    const g = world.gravityAt(b.x, b.y);
    b.vx += g.x * dt * 0.6;
    b.vy += g.y * dt * 0.6;
    b.px = b.x; b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (world.topology.mode === WRAP) {
      b.x = wrapTo(b.x, world.width);
      b.y = wrapTo(b.y, world.height);
    } else if (world.beyondLimits(b.x, b.y)) {
      world.bullets.splice(i, 1); continue;   // it left the sector
    }
    b.life -= dt;
    // Planets are solid: a shot stops at the surface instead of passing through.
    if (b.life <= 0 || world.consumedByHole(b.x, b.y, 0) || world.insidePlanet(b.x, b.y, 0)) world.bullets.splice(i, 1);
  }
}

export function resolveHits(world) {
  for (let bi = world.bullets.length - 1; bi >= 0; bi--) {
    const b = world.bullets[bi];
    for (let ai = world.asteroids.length - 1; ai >= 0; ai--) {
      const a = world.asteroids[ai];
      const d = world.delta(b.x, b.y, a.x, a.y);
      const dist = Math.hypot(d.x, d.y);
      if (dist > a.radius) continue;
      const theta = Math.atan2(d.y, d.x) - a.angle;
      if (dist > a.radiusAt(theta)) continue;
      world.bullets.splice(bi, 1);
      // A pirate's shot is stopped by a rock: it does not break it and pays
      // nothing. Only the pilot's shots break rocks.
      if (b.owner === 'pirate') absorbShot(world, b);
      else world.breakAsteroid(ai);
      break;
    }
  }

  // A droid stops any shot, the pilot's or a pirate's, and is only nudged by it.
  if (world.droids.length) {
    for (let bi = world.bullets.length - 1; bi >= 0; bi--) {
      const b = world.bullets[bi];
      const hit = world.droids.find((d) => {
        const dd = world.delta(b.x, b.y, d.x, d.y);
        return Math.hypot(dd.x, dd.y) < CONFIG.droids.radius;
      });
      if (!hit) continue;
      world.bullets.splice(bi, 1);
      absorbShot(world, b);
      const sp = Math.hypot(b.vx, b.vy) || 1;
      knockDroid(hit, (b.vx / sp) * 12, (b.vy / sp) * 12, b.vx / sp, b.vy / sp);
    }
  }

  // The boss's core and sleds take the pilot's shots before a pirate in the way would (src/boss.js); its own shots are a pirate's.
  world.resolveBossHits?.();
  world.resolvePirateHits();

  // What the hull meets: a hole's horizon, rocks, droids, stations, the NPC ships and the planets' surfaces (src/contact.js).
  shipContacts(world);
}

// A rock broken by a hard blow of the hull (SX's FC1, 2026-10-15: «камень должен разбиться если столкновение сильное»; src/contact.js,
// a blow of CONFIG.asteroid.bump.ram `breaks` points or more): broken as a shot breaks it (World.breakAsteroid: its drop, its dust, its
// pieces), the pieces laid either side of the hull's way, clear of it, and flung off sideways at `scatter` u/s, so the hull goes on
// between them; it gives no bounce (the rock gave way), and the hull loses `loss` of its closing speed along the contact. The hull paid
// its blow before (World.damageShip).
export function ramAsteroid(world, index, nx, ny, closing) {
  const R = CONFIG.asteroid.bump.ram, ship = world.ship, a = world.asteroids[index];
  if (closing > 0) { ship.vx += nx * closing * R.loss; ship.vy += ny * closing * R.loss; }
  const before = world.asteroids.length;
  world.breakAsteroid(index);
  // The hull's way past the rock (its speed on the rock's), or straight in along the contact when it has none.
  let dx = ship.vx - a.vx, dy = ship.vy - a.vy, len = Math.hypot(dx, dy);
  if (len < 1e-6) { dx = -nx; dy = -ny; len = 1; }
  dx /= len; dy /= len;
  const along = world.topology.dx(a.x, ship.x) * dx + world.topology.dy(a.y, ship.y) * dy, bx = ship.x + dx * along, by = ship.y + dy * along;
  world.asteroids.slice(before - 1).forEach((child, k) => {
    // Either side of the way, by the outline's farthest lobe (src/bodies.js Asteroid: 1.19 of the radius) and the hull's radius.
    const side = k % 2 ? 1 : -1, off = child.radius * 1.2 + ship.radius + R.gap;
    child.x = bx - dy * side * off; child.y = by + dx * side * off;
    child.vx = a.vx * 0.55 - dy * side * R.scatter; child.vy = a.vy * 0.55 + dx * side * R.scatter;
  });
}

export function breakAsteroid(world, index) {
  const a = world.asteroids[index];
  const tier = CONFIG.asteroid.tiers[a.tier];
  world.score += tier.score;
  world.emit('rockBroken', { tier: a.tier, x: a.x, y: a.y, sectorId: world.sector.id });
  world.releaseDrop(a);
  world.shred(a, 1);
  world.asteroids.splice(index, 1);
  for (let i = 0; i < tier.splits; i++) {
    const child = world.newRock(a.x, a.y, a.tier + 1);
    const off = between(world.rng('field'), 0, TAU);
    child.x = a.x + Math.cos(off) * a.radius * 0.4;
    child.y = a.y + Math.sin(off) * a.radius * 0.4;
    child.vx += a.vx * 0.55;
    child.vy += a.vy * 0.55;
    world.asteroids.push(child);
  }
}
