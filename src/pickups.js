// What the hull takes by touching it, and the loose things it takes (cut out of src/world.js, PLAN D3, 2026-10-09; the code is as it was,
// `this` now `world`): a signal's word, a coin, a fuel canister, a part; their step (drift, the hull's pull, fading, the pieces solid to each
// other), a broken rock's scatter, and the coins a blow knocks out of the wallet. World keeps a one-line method of each name the step, the
// wreck, the contact and the checks call.
import { CONFIG } from './config.js';
import { TAU, wrapTo } from './util.js';
import { WRAP } from './topology.js';
import { hearSignal, rollRockScatter } from './progression.js';
import { poolOil, oilRadius } from './oil.js';
import { holdOutOfStations } from './field.js';

// What the hull takes by touching it: a signal's word, a loose coin, a fuel canister.
export function collectPickups(world) {
  const ship = world.ship;
  // Nothing is picked up by a hull up in a jump (src/trick.js): it passes over coins, oil and signals.
  if (!ship.alive || ship.airborne) return;
  const reach = CONFIG.pickup.collectRadius + ship.radius;
  // A signal is tuned in by flying through it: a word, once.
  for (let i = world.signals.length - 1; i >= 0; i--) {
    const sig = world.signals[i];
    const d = world.delta(ship.x, ship.y, sig.x, sig.y);
    if (Math.hypot(d.x, d.y) > CONFIG.signal.reach) continue;
    const res = hearSignal(world.ledger, world.collection, sig.def, world.rng('word'));
    world.signals.splice(i, 1);
    if (!res.ok || res.alreadySettled) continue;
    world.emit('signalHeard', {
      signalId: sig.id, kind: res.kind, wordId: res.wordId || null, text: res.text || null,
      amount: res.amount || 0, credits: res.credits, x: sig.x, y: sig.y, sectorId: world.sector.id,
    });
  }
  // Loose credits from broken rocks: the same touch, no permanent record. A
  // fuel canister goes into the tank instead, and only while the tank has
  // room: with it full the canister stays where it is for later.
  for (let i = world.drops.length - 1; i >= 0; i--) {
    const drop = world.drops[i];
    if (drop.delay > 0) continue;
    const d = world.delta(ship.x, ship.y, drop.x, drop.y);
    // A drop of oil is touched at its edge, and a big one is big (src/oil.js).
    if (Math.hypot(d.x, d.y) > reach + (drop.kind === 'fuel' ? oilRadius(drop.units) * 0.6 : 0)) continue;
    // A part mends the hull, while there is something to mend; with the hull whole it stays for later.
    if (drop.kind === 'part') {
      if (world.hull >= world.hullMax) continue;
      const before = world.hull;
      world.hull = Math.min(world.hullMax, world.hull + drop.hull);
      world.drops.splice(i, 1);
      world.emit('partClaimed', { pickupId: drop.id, gained: world.hull - before, hull: world.hull,
        x: drop.x, y: drop.y, sectorId: world.sector.id });
      continue;
    }
    if (drop.kind === 'fuel') {
      if (!tankHasRoom(world)) {
        // Flown through and left lying: say why, now and then, so a canister
        // that stays put reads as a full tank and not as a fault.
        if (world.time >= world.tankFullCueAt) {
          world.tankFullCueAt = world.time + CONFIG.fuel.fullCue;
          world.emit('tankFull', { pickupId: drop.id, x: drop.x, y: drop.y, sectorId: world.sector.id });
        }
        continue;
      }
      const units = drop.units, before = world.fuel;
      world.fuel = Math.min(world.fuelTank, world.fuel + units);
      const gained = world.fuel - before;
      world.rockFuel += gained;
      // `gained` is what went into the tank. Drops of oil run together (src/oil.js), so one can hold more
      // than a nearly full tank takes: what is left stays where it is, a smaller drop.
      const left = units - gained;
      if (left > 0.05) drop.units = left;
      else world.drops.splice(i, 1);
      world.emit('fuelClaimed', { pickupId: drop.id, units, gained, fuel: world.fuel,
        x: drop.x, y: drop.y, sectorId: world.sector.id, drop: true });
      continue;
    }
    // Paid first, then gone: a coin the ledger refuses is a broken one and goes anyway, but never a good one unpaid.
    const res = world.ledger.collectDrop(drop.value);
    world.drops.splice(i, 1);
    if (!res.ok) continue;
    world.rockCredits += res.reward;
    world.emit('pickupClaimed', { pickupId: drop.id, reward: res.reward, credits: res.credits,
      x: drop.x, y: drop.y, sectorId: world.sector.id, drop: true });
  }
}

// Whether a fuel canister would be taken: the tank has room for a whole unit.
// A canister holds one or two, the HUD shows the tank rounded up and a
// station sells whole units, so a tank that reads 100 is full everywhere
// (QA, 2026-09-30: at 99.96 a canister went in for 0.04 and said +0.0 FUEL,
// and TANK FULL could hardly be seen after a touch of thrust).
function tankHasRoom(world) {
  return world.fuel <= world.fuelTank - 1;
}

// Loose coins and canisters drift on with part of their rock's momentum and
// scatter, slow to a stop, and fade after a while. A hull passing close draws
// them in (a canister only while the tank has room for it). A black hole or a
// planet takes them.
export function stepDrops(world, dt) {
  const D = CONFIG.asteroid.drops;
  const M = D.magnet;
  const ship = world.ship;
  const pulling = ship.alive && !world.docked && M.radius > 0;
  const k = Math.max(0, 1 - D.drag * dt);
  const room = tankHasRoom(world);
  for (let i = world.drops.length - 1; i >= 0; i--) {
    const d = world.drops[i];
    d.age += dt;
    if (d.delay > 0) d.delay = Math.max(0, d.delay - dt);
    const wanted = d.kind !== 'fuel' || room;
    const toShip = pulling && wanted && !d.delay ? world.delta(ship.x, ship.y, d.x, d.y) : null;
    const gap = toShip ? Math.hypot(toShip.x, toShip.y) : Infinity;
    if (gap < M.radius && gap > 1e-6) {
      d.vx += (toShip.x / gap) * M.accel * dt;
      d.vy += (toShip.y / gap) * M.accel * dt;
      const s = Math.hypot(d.vx, d.vy);
      if (s > M.maxSpeed) { d.vx *= M.maxSpeed / s; d.vy *= M.maxSpeed / s; }
    } else {
      d.vx *= k; d.vy *= k;
    }
    d.x += d.vx * dt; d.y += d.vy * dt;
    if (world.topology.mode === WRAP) { d.x = wrapTo(d.x, world.width); d.y = wrapTo(d.y, world.height); }
    if (d.swell) d.swell = Math.max(0, d.swell - dt);
    if (d.age >= D.life || world.beyondLimits(d.x, d.y) ||
        world.consumedByHole(d.x, d.y, 0) || world.insidePlanet(d.x, d.y, 0)) {
      world.drops.splice(i, 1);
    }
  }
  poolOil(world, dt);
  separateDrops(world, dt);
  // Held out of the stations' bodies, HOME's too (src/field.js; SX, 2026-10-07: «сейчас на него залетают камни и монеты»).
  holdOutOfStations(world, world.drops, (d) => (d.kind === 'fuel' ? oilRadius(d.units) : CONFIG.asteroid.drops.body.coin), CONFIG.asteroid.drops.body.bounce);
}

// Loose pieces are solid to each other (SX, 2026-10-01: «Монеты не должны залезать друг на друга и на
// канистры, они физически должны отталкиваться друг от друга»): two that overlap are eased apart along
// the line between them, half each, and the speed that closes them is traded like equal masses meeting
// with a little bounce. Each kind keeps the size it is drawn at (CONFIG.asteroid.drops.body; a drop of oil
// its own, src/oil.js). Two drops of oil do not push: they run together (poolOil).
function separateDrops(world, dt) {
  const drops = world.drops, n = drops.length;
  if (n < 2) return;
  const S = CONFIG.asteroid.drops.body;
  const ease = Math.min(1, S.ease * dt);
  for (let i = 0; i < n; i++) {
    const radius = (d) => (d.kind === 'fuel' ? oilRadius(d.units) : S.coin);
    const a = drops[i], ra = radius(a);
    for (let j = i + 1; j < n; j++) {
      const b = drops[j];
      if (a.kind === 'fuel' && b.kind === 'fuel') continue;
      const touch = ra + radius(b);
      const dx0 = b.x - a.x, dy0 = b.y - a.y;
      if ((Math.abs(dx0) > touch || Math.abs(dy0) > touch) && world.topology.mode !== WRAP) continue;
      const d = world.delta(b.x, b.y, a.x, a.y);
      let dist = Math.hypot(d.x, d.y);
      if (dist >= touch) continue;
      // Two at the very same point part along a direction of their own, never the same for every pair.
      let nx, ny;
      if (dist < 1e-6) { const t = (i * 7 + j * 13) % 16 / 16 * TAU; nx = Math.cos(t); ny = Math.sin(t); dist = 0; }
      else { nx = d.x / dist; ny = d.y / dist; }
      const push = (touch - dist) * 0.5 * ease;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing > 0) {
        const j2 = closing * (1 + S.bounce) / 2;
        a.vx -= nx * j2; a.vy -= ny * j2;
        b.vx += nx * j2; b.vy += ny * j2;
      }
    }
  }
}

// A broken rock always releases a scatter, more pieces from a bigger rock
// (CONFIG.asteroid.drops): fuel canisters the more often the emptier the tank
// (9 breaks in 10 empty, 1 full), 1 CR coins otherwise (SX, 2026-09-30),
// never both and never nothing (progression.js
// rollRockScatter). A canister is `{ kind: 'fuel', units }` with no value in
// credits; a coin has no kind. They leave evenly around the break with a
// jitter, so a scatter reads as a spray rather than a clump.
export function releaseDrop(world, rock) {
  const D = CONFIG.asteroid.drops;
  const { kind, pieces } = rollRockScatter(rock.tier, world.rng('drop'), D, world.fuel / world.fuelTank);
  const count = pieces.length;
  const out = [];
  const turn = world.rng('drop')() * TAU;
  for (let i = 0; i < count; i++) {
    const a = turn + (i / count) * TAU + (world.rng('drop')() - 0.5) * 0.8;
    const v = D.burst[0] + world.rng('drop')() * (D.burst[1] - D.burst[0]);
    const drop = {
      id: `drop-${++world.dropSerial}`, value: kind === 'fuel' ? 0 : pieces[i], age: 0,
      x: rock.x + Math.cos(a) * rock.radius * 0.3,
      y: rock.y + Math.sin(a) * rock.radius * 0.3,
      vx: rock.vx * D.carry + Math.cos(a) * v,
      vy: rock.vy * D.carry + Math.sin(a) * v,
      phase: (world.dropSerial % 7) / 7,
    };
    if (kind === 'fuel') { drop.kind = 'fuel'; drop.units = pieces[i]; }
    world.drops.push(drop);
    out.push(drop);
  }
  return out;
}

// Coins knocked out of the wallet by a collision, scattered around (x, y).
// They fly past the hull's pull and cannot be taken for a moment, then they
// are ordinary loose coins that can be gathered again before they fade.
export function spillCoins(world, x, y) {
  const B = CONFIG.asteroid.bump;
  if (world.time < world.spillReadyAt) return 0;
  const want = B.spill[0] + Math.floor(world.rng('drop')() * (B.spill[1] - B.spill[0] + 1));
  const res = world.ledger.spill(want);
  if (!res.ok || !res.lost) return 0;
  world.spillReadyAt = world.time + B.spillCooldown;
  const D = CONFIG.asteroid.drops;
  const turn = world.rng('drop')() * TAU;
  for (let i = 0; i < res.lost; i++) {
    const a = turn + (i / res.lost) * TAU + (world.rng('drop')() - 0.5) * 0.5;
    const v = B.spillBurst[0] + world.rng('drop')() * (B.spillBurst[1] - B.spillBurst[0]);
    world.drops.push({
      id: `drop-${++world.dropSerial}`, value: D.value, age: 0, delay: B.spillDelay,
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, phase: (world.dropSerial % 7) / 7,
    });
  }
  world.emit('coinsSpilled', { sectorId: world.sector.id, x, y, amount: res.lost, credits: res.credits });
  return res.lost;
}
