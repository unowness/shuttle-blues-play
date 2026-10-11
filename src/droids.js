// Service droids (SX, 2026-10-01: «8 артов для дроида заправщика и 8 артов для дроида починщика
// которые летают в космосе и о них можно починиться или заправится, на станциях тоже можно, дроиды
// летают не часто но летают ... эти дроиды должны перемещаться но довольно медленно, с ними можно
// столкнуться со станциями нельзя»).
//
// Now and then one droid comes through the pilot's sector (CONFIG.droids): a fuel droid (TANKER) or a
// repair droid (SPANNER), SX's picks, drawn from above (src/droidArt.js). It works its way through a
// few stops, the first of them near where the pilot is, rests at each, and leaves; the next one
// comes a few minutes of flight after it has gone. It is slow and solid: a hull that hits it pays
// by the speed of the blow (World.impactDamage, the droid's base), a container shoves it, a shot
// stops at it. Near a slow ship it stops and waits, and within its reach it sells what it carries through its
// menu, dearer than a station, until it is empty; what is bought is seen to cross to the hull (startServiceFx).
// (For an hour on 2026-10-01 it threw drops and parts instead; SX: «надо ее все-таки покупать ... чтобы менюшка
// была контекстуальная».)
//
// A droid is in memory only, like a pirate: not saved, gone with the sector it was in unless it
// was close enough to the ship to cross a seam with it.

import { CONFIG } from './config.js';
import { openingCalm, contactStage, contactDue, contactSaid, contactMade, contactFailed } from './opening.js';
import { TAU, clamp, lerp, hypot2 } from './util.js';
import { DROID_ART, DROID_MOTION, droidSize, idleFrame } from './droidArt.js';
import { drawOil } from './oil.js';
import { createTankOil, splitTankOil, stepTankOil, drawTankOil } from './tankOil.js';
import { PALETTE } from './palette.js';
import { inKeepOut, stationPush } from './keepOut.js';

const KIND_LABEL = { fuel: 'FUEL DROID', repair: 'REPAIR DROID' };
// The word under a droid while the pilot is near, set as a friendly ship's name is (src/worldDraw.js; SX, 2026-10-06: «у роботов
// дроидов должна быть подпись снизу просто FUEL, REPAIR, как имена у нпс»): what it serves, not its name.
export const DROID_CAPTION = Object.freeze({ fuel: 'FUEL', repair: 'REPAIR' });

// The palette's own (src/palette.js): the lab resolves inks by exact string. The service ink by kind (SX, 2026-10-07, after flying:
// «Дроид починщик должен быть зеленым Дроид заправщик синим»): the fuel droid in the palette's blue, the oil's own (src/oil.js), the
// repair droid in its green, the HULL gauge's when whole (labs/graphics/meter-bar.js). Until then the fuel droid wore the green and the
// repair droid the brake lamp's amber.
export const DROID_INKS = Object.freeze({
  b: PALETTE.white, m: PALETTE.gray, s: PALETTE.blue, e: PALETTE.blue,
  fuel: PALETTE.blue, repair: PALETTE.green,
});

class Droid {
  constructor(id, kind, look, x, y, rng) {
    const D = CONFIG.droids;
    this.id = id;
    this.kind = kind;
    this.look = look;
    this.art = DROID_ART[kind][look];
    this.name = this.art.name;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    // A knock tips it over a little (`tilt`, turning at `spin`); it rights itself.
    this.tilt = 0; this.spin = 0;
    this.stock = D[kind].stock;
    this.cruise = lerp(D.speed[0], D.speed[1], rng());
    this.route = [];
    this.stop = 0;
    this.rest = 0;
    this.mode = 'work';            // 'work' through its stops, 'hold' for a pilot, 'leave'
    this.story = false;            // the opening's repair contact (spawnStoryDroid): it waits at its one stop while the lesson stands
    this.leaveTo = null;
    this.holdFor = 0;
    this.holdCool = 0;
    this.phase = rng() * TAU;
  }

  get label() { return KIND_LABEL[this.kind]; }
  get price() { return CONFIG.droids[this.kind].price; }
  get radius() { return CONFIG.droids.radius; }
}

// Which kind comes: even odds, and a hull or a tank under half tips them toward what is
// missing (at empty, four to one).
export function pickDroidKind(world, rng) {
  const need = (fill) => 1 + 3 * Math.max(0, 0.5 - fill) / 0.5;
  const fuel = need(world.fuel / world.fuelTank), repair = need(world.hull / world.hullMax);
  return rng() * (fuel + repair) < fuel ? 'fuel' : 'repair';
}

// Whether a droid could be at (x, y): inside the sector clear of its edges and of a dead edge's
// current, clear of every planet's orbit, hole and station by `need`, and out of every station's menu reach (its keep-out,
// src/keepOut.js; SX, 2026-10-07: «давай npc и дроиды ... не будут сильно близко к станциям подлетать»), so no stop is laid there.
function droidGround(world, x, y, need) {
  const margin = 500;
  if (x < margin || y < margin || x > world.width - margin || y > world.height - margin) return false;
  if (world.edgeDepths(x, y).some((e) => e.depth > 0)) return false;
  for (const p of world.planets) {
    if (Math.hypot(x - p.x, y - p.y) < p.radius + CONFIG.planet.orbit.height + need) return false;
  }
  for (const h of world.holes) if (Math.hypot(x - h.x, y - h.y) < holeReach(h) + need) return false;
  for (const s of world.stations) if (Math.hypot(x - s.x, y - s.y) < s.hullRadius + need) return false;
  return !inKeepOut(world, x, y);
}

// How far out a hole is kept away from: its visible disc.
const holeReach = (h) => Math.max(h.horizon * 3, h.disc || 0);

// A point `dist` u from (x, y) on a bearing near `angle`, on ground a droid can be at, or null.
function pointNear(world, x, y, angle, dist, rng, spread = Math.PI) {
  const need = CONFIG.droids.avoid;
  for (let i = 0; i < 40; i++) {
    const a = angle + (rng() - 0.5) * spread * (1 + i / 20);
    const r = dist * (1 - 0.3 * (i / 40));
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (droidGround(world, px, py, need)) return { x: px, y: py };
  }
  return null;
}

// A droid comes into the sector: off screen, `spawn` u from the ship, its first stop between
// it and the pilot (so it passes by where the pilot is flying), then `stops - 1` more a `leg`
// apart. `options`: `kind`, `look`, `at` ({ x, y }), `route` ([{ x, y }]) and `silent`, for the
// lab and the checks. Returns the droid, or null when the sector had no room for one.
export function spawnDroid(world, options = {}) {
  const D = CONFIG.droids, rng = world.rng('droid'), ship = world.ship;
  const kind = options.kind || pickDroidKind(world, rng);
  const look = options.look ?? Math.floor(rng() * DROID_ART[kind].length);
  let at = options.at || null;
  // A ship on its way meets the droid ahead of it (SX, 2026-10-01: «Я за 10 минут не встретил ни разу дроида»).
  const speed = Math.hypot(ship.vx, ship.vy), heading = Math.atan2(ship.vy, ship.vx);
  const ahead = speed > D.ahead.speed;
  for (let i = 0; !at && i < 48; i++) {
    const a = ahead && i < 32 ? heading + (rng() * 2 - 1) * D.ahead.spread : rng() * TAU;
    const r = lerp(D.spawn[0], D.spawn[1], rng());
    const x = ship.x + Math.cos(a) * r, y = ship.y + Math.sin(a) * r;
    if (droidGround(world, x, y, D.avoid)) at = { x, y };
  }
  if (!at) return null;
  const droid = new Droid(`droid-${++world.droidSerial}`, kind, look, at.x, at.y, rng);
  if (options.route) droid.route = options.route.map((p) => ({ x: p.x, y: p.y }));
  else {
    const back = Math.atan2(at.y - ship.y, at.x - ship.x);
    const first = pointNear(world, ship.x, ship.y, back, lerp(700, 1300, rng()), rng, 1.4);
    let from = first || at;
    if (first) droid.route.push(first);
    while (droid.route.length < D.stops) {
      const next = pointNear(world, from.x, from.y, rng() * TAU, lerp(D.leg[0], D.leg[1], rng()), rng, TAU);
      if (!next) break;
      droid.route.push(next);
      from = next;
    }
  }
  if (options.story) droid.story = true;
  world.droids.push(droid);
  if (!options.silent) world.emit('droidArrived', { droidId: droid.id, kind, name: droid.name, label: droid.label, sectorId: world.sector.id });
  return droid;
}

// The opening's repair contact (src/opening.js, stage `service`): a repair droid that holds clear of `station` (the start ruin), on the
// side the ship came from, `CONFIG.droids.story.air` u outside its hull, and stays at that one stop while the lesson stands
// (`story`). Null when the ground there is no place for a droid (the caller asks again a step later). `silent`: no arrival notice (the
// contact is bound again after a reload, or a sector change, without being announced twice).
export function spawnStoryDroid(world, station, { silent = false } = {}) {
  const ship = world.ship, rng = world.rng('droid'), S = CONFIG.droids.story;
  const toShip = Math.atan2(ship.y - station.y, ship.x - station.x);
  // Clear of what else has a window here, so the droid's is the one that stands when the pilot comes up to it: the first ground the
  // search finds, a few turns round the ruin if the first lies by a cache (the first found, if none is clear).
  let at = null, first = null;
  for (let i = 0; i < 9 && !at; i++) {
    const turn = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.7;
    const p = pointNear(world, station.x, station.y, toShip + turn, station.hullRadius + S.air, rng, 0.5);
    first ??= p;
    if (p && clearOfFinds(world, p, S.clear)) at = p;
  }
  at ??= first;
  if (!at) return null;
  return spawnDroid(world, { kind: 'repair', at, route: [at], story: true, silent });
}
// Nothing with a window of its own (a cache, a paint or a look in space, a cargo lying, a signal) within `need` u of the point.
function clearOfFinds(world, p, need) {
  for (const list of [world.caches, world.paintCaches, world.lookCaches, world.lostCargo, world.signals]) {
    for (let i = 0; list && i < list.length; i++) if (Math.hypot(list[i].x - p.x, list[i].y - p.y) < need) return false;
  }
  return true;
}

// Once a step: the schedule, then each droid's flight.
export function stepDroids(world, dt) {
  const D = CONFIG.droids, ship = world.ship;
  // None comes while the opening's guided stretch runs (src/opening.js openingCalm): its fuel lesson is a station's.
  if (!world.droids.length && world.autoDroids && !openingCalm(world)) {
    const flying = ship.alive && !world.docked && !world.encounter && !world.sector.hidden;
    if (flying) world.droidIn -= dt;
    if (flying && world.droidIn <= 0) {
      world.droidIn = lerp(D.every[0], D.every[1], world.rng('droid')());
      spawnDroid(world);
    }
  }
  stepStoryDroid(world);
  stepServiceFx(world, dt);
  for (let i = world.droids.length - 1; i >= 0; i--) {
    const dr = world.droids[i];
    fly(world, dr, dt);
    const toShip = world.delta(ship.x, ship.y, dr.x, dr.y);
    const gone = (dr.mode === 'leave' && Math.hypot(toShip.x, toShip.y) > D.gone) || world.beyondLimits(dr.x, dr.y, 200);
    if (gone) {
      world.droids.splice(i, 1);
      world.droidIn = Math.max(world.droidIn, lerp(D.every[0], D.every[1], world.rng('droid')()));
      world.emit('droidLeft', { droidId: dr.id, kind: dr.kind, sectorId: world.sector.id });
    }
  }
}

// The opening's repair contact (src/opening.js, stage `repair`): bound to the start ruin while the lesson stands, made again when it is
// gone (a reload, the sector left and come back) and let go, to leave as any droid does, when the stage is over.
function stepStoryDroid(world) {
  const ruin = contactStage(world);
  let has = false;
  for (let i = 0; i < world.droids.length; i++) { const dr = world.droids[i]; if (dr.story) { if (ruin) has = true; else dr.story = false; } }
  if (!ruin || has || !contactDue(world)) return;
  const station = world.stations.find((s) => s.id === ruin);
  const dr = station ? spawnStoryDroid(world, station, { silent: contactSaid(world) }) : null;
  if (dr) contactMade(world); else contactFailed(world);
}

// Where it leaves for: away from the ship, `gone` and a little more.
function leaveFor(world, dr) {
  const ship = world.ship;
  const d = world.delta(dr.x, dr.y, ship.x, ship.y);
  const a = Math.atan2(d.y, d.x);
  const far = CONFIG.droids.gone + 600;
  return { x: ship.x + Math.cos(a) * far, y: ship.y + Math.sin(a) * far };
}

// The push out of a station's keep-out, read at once (src/keepOut.js stationPush).
const PUSH = { ux: 0, uy: 0, depth: 0 };
// What a droid wants (its pull toward a stop and the pushes of what it keeps away from), summed in place by `awayFrom`.
const WANT = { x: 0, y: 0 };
// The push out of one keep-out ring, stronger the deeper the droid is in it, added to WANT. This runs for every rock of the sector for
// every droid at every step: a closure with a delta and a Math.hypot's boxed numbers in it for each was ~10 KB of garbage a frame (2026-10-09).
function awayFrom(topo, dr, ox, oy, reach) {
  const dx = topo.dx(dr.x, ox), dy = topo.dy(dr.y, oy);
  const dist = hypot2(dx, dy);
  if (dist >= reach || dist < 1e-6) return;
  const f = 1 - dist / reach;
  WANT.x += (dx / dist) * dr.cruise * 2.5 * f;
  WANT.y += (dy / dist) * dr.cruise * 2.5 * f;
}

// One droid's step: what it wants (its stop, a pilot to wait for, the way out), what it keeps
// away from, and a gentle push toward that; a knock is worked off at the same gentle rate, so
// a droid that is hit is seen to drift and come back.
function fly(world, dr, dt) {
  const D = CONFIG.droids, ship = world.ship, topo = world.topology;
  dr.holdCool = Math.max(0, dr.holdCool - dt);

  // A pilot slow beside it: it stops and waits.
  const shipDist = hypot2(topo.dx(ship.x, dr.x), topo.dy(ship.y, dr.y));
  const rel = hypot2(ship.vx - dr.vx, ship.vy - dr.vy);
  const pilotNear = ship.alive && !world.docked && shipDist < D.hold && rel < CONFIG.station.dockSpeed;
  if (dr.mode === 'work' && dr.stock > 0 && dr.holdCool <= 0 && pilotNear) { dr.mode = 'hold'; dr.holdFor = 0; }
  if (dr.mode === 'hold') {
    dr.holdFor += dt;
    if (!ship.alive || world.docked || shipDist > D.hold * 1.3 || dr.holdFor > D.holdTime) {
      dr.mode = dr.stop >= dr.route.length ? 'leave' : 'work';
      dr.holdCool = 20;
    }
  }
  if (dr.stock <= 0 && dr.mode !== 'leave') dr.mode = 'leave';
  if (dr.mode === 'leave' && !dr.leaveTo) dr.leaveTo = leaveFor(world, dr);

  let wx = 0, wy = 0;
  const target = dr.mode === 'hold' ? null : dr.mode === 'leave' ? dr.leaveTo : dr.route[dr.stop];
  if (dr.mode === 'work' && !target) { dr.mode = 'leave'; dr.leaveTo = leaveFor(world, dr); }
  if (target) {
    const dx = topo.dx(target.x, dr.x), dy = topo.dy(target.y, dr.y);
    const dist = hypot2(dx, dy);
    if (dr.mode === 'work' && dist < 60) {
      dr.rest += dt;
      if (dr.rest >= D.rest) { dr.rest = 0; if (!dr.story) dr.stop++; }
    } else if (dist > 1e-6) {
      const speed = dr.cruise * (dr.mode === 'leave' ? 1.4 : 1) * clamp(dist / 250, 0.15, 1);
      wx = (dx / dist) * speed; wy = (dy / dist) * speed;
    }
  }

  // What it keeps away from: a push out of each keep-out ring, stronger the deeper it is.
  WANT.x = wx; WANT.y = wy;
  for (const p of world.planets) awayFrom(topo, dr, p.x, p.y, p.radius + CONFIG.planet.orbit.height + D.avoid);
  for (const h of world.holes) awayFrom(topo, dr, h.x, h.y, holeReach(h) + D.avoid);
  for (const s of world.stations) awayFrom(topo, dr, s.x, s.y, s.hullRadius + D.avoid);
  for (const a of world.asteroids) awayFrom(topo, dr, a.x, a.y, a.radius + D.radius + 90);
  wx = WANT.x; wy = WANT.y;
  // A station's menu reach (src/keepOut.js): a push over its keep-out's last margin, so a droid bound past a station bends round it,
  // one inside eases out at its own gentle rate, and one waiting for a pilot stopped by a station waits at the edge, not in it.
  const K = CONFIG.station.keepOut;
  for (const s of world.stations) {
    if (!stationPush(world, dr.x, dr.y, s, PUSH)) continue;
    wx += PUSH.ux * dr.cruise * K.push * PUSH.depth;
    wy += PUSH.uy * dr.cruise * K.push * PUSH.depth;
  }

  // Toward what it wants, at its own gentle rate.
  let ax = (wx - dr.vx) * 1.5, ay = (wy - dr.vy) * 1.5;
  const a = hypot2(ax, ay);
  if (a > D.accel) { ax *= D.accel / a; ay *= D.accel / a; }
  dr.vx += ax * dt; dr.vy += ay * dt;
  dr.x += dr.vx * dt; dr.y += dr.vy * dt;

  // A tipped droid rights itself.
  dr.tilt += dr.spin * dt;
  dr.spin *= Math.max(0, 1 - 2.5 * dt);
  dr.tilt += (0 - dr.tilt) * Math.min(1, 1.8 * dt);

  // Rocks are solid to it too: held out, bouncing a little, a free rock shoved.
  for (const r of world.asteroids) {
    const dx = topo.dx(dr.x, r.x), dy = topo.dy(dr.y, r.y);
    const dist = hypot2(dx, dy);
    if (dist > r.radius + D.radius) continue;
    const touch = r.radiusAt(Math.atan2(dy, dx) - r.angle) + D.radius;
    if (dist >= touch || dist < 1e-6) continue;
    const nx = dx / dist, ny = dy / dist;
    dr.x = r.x + nx * touch; dr.y = r.y + ny * touch;
    const closing = -((dr.vx - r.vx) * nx + (dr.vy - r.vy) * ny);
    if (closing > 0) {
      dr.vx += nx * closing * 1.3; dr.vy += ny * closing * 1.3;
      if (!r.moored) { r.vx -= nx * closing * 0.1; r.vy -= ny * closing * 0.1; }
    }
  }
}

// ---- the purchase (cut out of src/world.js, PLAN D3, 2026-10-09; World.droidActions and World.droidService stay as one-line methods)

// A droid's one service (CONFIG.droids): what it carries, as much as the ship takes and the
// wallet pays for, like a station's; refused while the ship is not matched to its speed.
function droidOffer(world, dr) {
  const fuel = dr.kind === 'fuel';
  const missing = fuel ? Math.floor(world.fuelTank - world.fuel) : world.hullMax - world.hull;
  const units = Math.min(missing, dr.stock, Math.floor(world.ledger.credits / dr.price));
  const rel = Math.hypot(world.ship.vx - dr.vx, world.ship.vy - dr.vy);
  // The station's own words for the same purchase (the copy pass of 2026-10-01: `N FUEL`, `N HULL`).
  const unit = fuel ? 'FUEL' : 'HULL';
  const reason = rel > CONFIG.station.dockSpeed ? `MATCH SPEED BELOW ${CONFIG.station.dockSpeed}`
    : missing <= 0 ? (fuel ? 'TANK FULL' : 'HULL UNDAMAGED')
    : dr.stock <= 0 ? 'OUT OF STOCK'
    : units <= 0 ? `NEED ${dr.price} CR, HAVE ${world.ledger.credits}`
    : null;
  return { fuel, units, cost: units * dr.price, reason, note: reason || `${units} ${unit} / ${units * dr.price} CR` };
}

export function droidActions(world, dr) {
  const offer = droidOffer(world, dr);
  return [{
    label: offer.fuel ? 'REFUEL' : 'REPAIR HULL',
    disabled: !!offer.reason, note: offer.note,
    run: () => droidService(world, dr),
  }];
}

// Bought, and seen to be delivered (SX: «чтобы какой-то эффект был»): the droid sends what was bought across to
// the hull, drops of oil or tumbling parts (src/droids.js serviceFx), and a part's arrival is welded on in sparks.
export function droidService(world, dr) {
  if (!world.droids.includes(dr)) { world.emit('actionRefused', { reason: 'DROID UNAVAILABLE' }); return; }
  const offer = droidOffer(world, dr);
  if (offer.reason) { world.emit('actionRefused', { reason: offer.reason }); return; }
  world.ledger.credits -= offer.cost;
  dr.stock -= offer.units;
  if (offer.fuel) world.fuel = Math.min(world.fuelTank, world.fuel + offer.units);
  else world.hull = Math.min(world.hullMax, world.hull + offer.units);
  startServiceFx(world, dr, offer.units);
  world.emit('droidServed', {
    droidId: dr.id, kind: dr.kind, name: dr.name, sectorId: world.sector.id, x: dr.x, y: dr.y,
    units: offer.units, cost: offer.cost, left: dr.stock,
    fuel: world.fuel, hull: world.hull, credits: world.ledger.credits,
  });
}

// The mending: sparks of a weld all round the hull, and a chip or two of the part going in.
function mendSparks(world) {
  const ship = world.ship, B = CONFIG.asteroid.bump, P = CONFIG.droids.part;
  const sparks = Array.from({ length: P.sparks }, (_, k) => ({ ch: B.sparks[k % B.sparks.length], color: k % 3 ? '#ffd27f' : '#ffffff' }));
  world.particles.burst(ship.x, ship.y, sparks, { vx: ship.vx, vy: ship.vy, speed: [60, 200], life: [0.2, 0.6] });
}

// What was bought, seen on its way (SX, 2026-10-01: «надо ее все-таки покупать ... чтобы какой-то эффект был»):
// pieces leave the droid one after another and fly to the hull along a bend, drops of oil from a fuel droid (drawn
// as the oil is, src/oil.js), tumbling parts from a repair droid; a part that reaches the hull is welded on in
// sparks, a drop splashes. Presentation only: the purchase is already in the tank or the hull (droidService).
// `CONFIG.droids.fx`: `pieces` a purchase (by what it bought, within the range), `stagger` s between them, `time`
// s each takes to arrive.
export function startServiceFx(world, dr, units) {
  const F = CONFIG.droids.fx, P = CONFIG.droids.part, rng = world.rng('droid');
  const n = clamp(Math.round(units / (dr.kind === 'fuel' ? 6 : 10)), F.pieces[0], F.pieces[1]);
  for (let i = 0; i < n; i++) {
    world.serviceFx.push({
      kind: dr.kind, sectorId: world.sector.id, from: { x: dr.x, y: dr.y }, delay: i * F.stagger, t: 0,
      time: lerp(F.time[0], F.time[1], rng()), bend: (rng() * 2 - 1) * 0.6,
      glyph: P.glyphs[i % P.glyphs.length], spin: (rng() * 2 - 1) * P.spin, phase: (i % 7) / 7,
    });
  }
}

// Where a piece is: from the droid to the ship as it is now, along a bend to one side, easing in.
function fxAt(world, f) {
  const ship = world.ship, k = Math.min(1, f.t / f.time), e = k * k * (3 - 2 * k);
  const dx = ship.x - f.from.x, dy = ship.y - f.from.y, d = Math.hypot(dx, dy) || 1;
  const side = Math.sin(Math.PI * e) * f.bend * d * 0.35;
  return { x: f.from.x + dx * e - (dy / d) * side, y: f.from.y + dy * e + (dx / d) * side, k };
}

function stepServiceFx(world, dt) {
  const list = world.serviceFx;
  if (!list?.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    if (f.sectorId !== world.sector.id || !world.ship.alive) { list.splice(i, 1); continue; }
    if (f.delay > 0) { f.delay -= dt; continue; }
    f.t += dt;
    if (f.t < f.time) continue;
    list.splice(i, 1);
    const ship = world.ship;
    if (f.kind === 'repair') mendSparks(world);
    else world.particles.burst(ship.x, ship.y, [{ ch: '\u00b7', color: PALETTE.blue }, { ch: '\u00b7', color: '#2C5290' }, { ch: '░', color: '#2C5290' }],
      { vx: ship.vx, vy: ship.vy, speed: [30, 90], life: [0.2, 0.45] });
  }
}

// Drawn over the world: the oil through its own field, the parts tumbling in the repair ink.
export function drawServiceFx(r, world, t, project) {
  const list = world.serviceFx;
  if (!list?.length) return;
  const oil = [];
  for (const f of list) {
    if (f.delay > 0) continue;
    const p = fxAt(world, f);
    if (f.kind === 'fuel') { oil.push({ x: p.x, y: p.y, units: CONFIG.asteroid.drops.oil.unit, age: 1, phase: f.phase }); continue; }
    const s = project(p.x, p.y);
    r.glyphRot(f.glyph, s.x, s.y, f.spin * f.t, DROID_INKS.repair, 1, 1.15);
  }
  if (oil.length) drawOil(r, oil, project, t);
}

// A knock from a hull, a container or a shot: `dvx, dvy` of speed, and a tip by how
// sideways it came.
export function knockDroid(dr, dvx, dvy, nx = 0, ny = 0) {
  dr.vx += dvx; dr.vy += dvy;
  dr.spin += clamp((dvx * ny - dvy * nx) * 0.02, -3, 3);
}

// Drawn over its bob as seen from above, turned only by a knock's tilt; its lamp blinks, its jets flicker, its idle loop plays
// (src/droidArt.js idleFrame: SPANNER's pulse) and a tanker's oil rolls in its tank. `r` is the renderer; (sx, sy) its place on
// screen; `t` the world's time.
export function drawDroid(r, dr, sx, sy, t) {
  const D = CONFIG.droids;
  const art = idleFrame(dr.art, t + dr.phase), rows = art.rows;
  const scale = D.scale;
  const w = r.cellW * scale, h = r.cellH * scale;
  const bob = Math.sin(t * D.bob.rate * TAU + dr.phase) * D.bob.amount;
  const accent = DROID_INKS[dr.kind];
  const lamp = Math.sin(t * 5 + dr.phase) > -0.2 ? 1 : 0.25;
  const jet = 0.45 + 0.35 * Math.sin(t * 23 + dr.phase * 3);
  const c = Math.cos(dr.tilt), s = Math.sin(dr.tilt);
  rows.forEach((row, j) => {
    const cells = [...row], parts = [...art.parts[j]];
    cells.forEach((ch, i) => {
      if (ch === ' ') return;
      const part = parts[i] || 'b';
      const ink = part === 'a' || part === 'l' ? accent : DROID_INKS[part] || DROID_INKS.b;
      const alpha = part === 'l' ? lamp : part === 'e' ? jet : 1;
      const lx = (i - (cells.length - 1) / 2) * w, ly = (j - (rows.length - 1) / 2) * h + bob;
      const x = sx + lx * c - ly * s, y = sy + lx * s + ly * c;
      if (Math.abs(dr.tilt) > 0.01) r.glyphRot(ch, x, y, dr.tilt, ink, alpha, scale);
      else r.glyph(ch, x, y, ink, alpha, scale);
    });
  });
  if (dr.art.tank) drawDroidOil(r, dr, sx, sy, t, bob);
}

// A tanker's oil (src/tankOil.js), as the garage's tank holds it: kept beside the drawing, never on the droid (a look, not the
// world's), stepped by the world's time as it is drawn. What the tank does shakes it: the droid's own speeding up and slowing
// down, and its bob; a knock (a change of speed no engine makes in a frame) throws it apart, and it pools again. Under reduced
// motion it lies still in one drop.
const DROID_OIL = new WeakMap();
const KNOCK = 10;                                   // u/s of speed changed in one drawn frame: a blow, not its engine
function droidTankOil(r, dr) {
  let s = DROID_OIL.get(dr);
  if (s && s.cellW === r.cellW && s.cellH === r.cellH) return s;
  const art = dr.art, W = Math.max(...art.rows.map((row) => [...row].length)), H = art.rows.length;
  const w = r.cellW * CONFIG.droids.scale, h = r.cellH * CONFIG.droids.scale, cells = new Set();
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  art.parts.forEach((p, j) => [...p].forEach((k, i) => {
    if (k !== 'i') return;
    cells.add(j * 1000 + i);
    i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
  }));
  const box = { x0: (i0 - 0.5 - (W - 1) / 2) * w, x1: (i1 + 0.5 - (W - 1) / 2) * w, y0: (j0 - 0.5 - (H - 1) / 2) * h, y1: (j1 + 0.5 - (H - 1) / 2) * h };
  const seed = Math.floor((dr.phase / TAU) * 7919) + 1;
  s = { cellW: r.cellW, cellH: r.cellH, oil: createTankOil(box, { shape: art.tank.shape, seed }), at: null, vx: dr.vx, vy: dr.vy,
    shows: (x, y) => cells.has(Math.round(y / h + (H - 1) / 2) * 1000 + Math.round(x / w + (W - 1) / 2)) };
  DROID_OIL.set(dr, s);
  return s;
}
function drawDroidOil(r, dr, sx, sy, t, bob) {
  const s = droidTankOil(r, dr), D = CONFIG.droids;
  const dt = s.at === null ? 0 : Math.min(0.1, Math.max(0, t - s.at));
  s.at = t;
  if (dt > 0 && DROID_MOTION.on) {
    const dvx = dr.vx - s.vx, dvy = dr.vy - s.vy;
    if (Math.hypot(dvx, dvy) > KNOCK) splitTankOil(s.oil);
    const w = D.bob.rate * TAU, ay = -D.bob.amount * w * w * Math.sin(t * w + dr.phase);
    stepTankOil(s.oil, dt, dvx / dt, dvy / dt + ay);
  }
  s.vx = dr.vx; s.vy = dr.vy;
  const c = Math.cos(dr.tilt), sn = Math.sin(dr.tilt);
  drawTankOil(r, s.oil, { x: sx - bob * sn, y: sy + bob * c, angle: dr.tilt, shows: s.shows });
}

// What a droid's drawing covers, for the menus to stand clear of (as a station's footprint).
export function droidFootprint(dr) {
  return { model: droidSize(dr.art), scale: CONFIG.droids.scale };
}
