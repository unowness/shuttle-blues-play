// The drift (SX's item 10; grammar D, his pick on labs/graphics/sketches/movement-grammar.html, 2026-10-04): Space and a turn key above
// FLIGHT.drift.start. The game's is G1 GLIDE (SX, 2026-10-06, after flying it: «да по заносу это то что я хотел»): no circle, no brake;
// the stick turns the nose and the course follows it with a low grip (stepGlide); let go, the grip back, no push. Before it the game
// flew D2 SKID, D1 SNAP (the car), ARC (the NFSU2 arc) and KART, and the lab flew K2, K3, K2R, S2 and K2S beside them on `?drift=`;
// their steps (the skid's throw, the car's lead, the arc's jerk and opening, the kart's band, glance and magnet, the surf's aim) went
// once SX had picked, 2026-10-07 (docs/decisions/2026-10.md has each, with his words). The rules and the numbers are FLIGHT.drift
// (src/flightConfig.js); this file is the step. It runs where the page turned it on (`world.stunts.drift`); without it (a check's
// world) the brake is the brake it always was, bit for bit. PRO (the pause's DRIFT row) flies G1 as it is; NORMAL, the default, flies
// it with its `normal` numbers over it: a softer way in and out, the course closer on the nose, the throttle's gain a tenth (SX,
// 2026-10-07; driftPreset).
//
// Let go, the nose stays where the pilot holds it, turning on from the rate it had as the hull's own stick lets it go, and the course
// is held to it by a grip that fades (SX, 2026-10-05: «слишком задает направление»; see holdOf), the stick answering all the while. The
// way out's push and its reflex (the tail's counter-flick) are every drift's machinery, none in G1 (FLIGHT.drift has why).
//
// State, on the world (declared with its first value in World's constructor; none of it saved: a drift lasts seconds):
//   world.drift       null, or { t, slide, from, throwSide, swept, tier, side, links, gateUntil, gateTier, lastStep, rate, nose, owed,
//                     paid, vx, vy }: the drift under way, `slide` the nose's angle off the course (rad, + clockwise), `swept` the angle
//                     the course turned (rad), the course's and the nose's rates (rad/s), `owed` the brake's take before it and `paid`
//                     what is given back so far, and the speed it left the ship at
//   world.driftPush   null, or { boost, time, end, t, reflex, flick, vx, vy, lastStep, glide, g0, gA, carry, jerk }: the way out of
//                     the last drift, still under way: the course being held to the nose and the push, over `time` s, and the hull's
//                     reflex, `flick` (rad) the part of the hull's angle it holds now, until `end` s; (vx, vy) the speed it left the
//                     ship at, to tell a blow. The grip that fades: `g0` at the let-go, `gA` its bump, `carry` the glide's rate the grip
//                     could not take on (rad/s); `jerk` null (an arc's last move, once)
//   world.driftChain  null, or { until, links }: PRO, a clean exit's chance of a chained drift
//   world.stuntLog    counters the drawing reads to start its effects (src/trick.js keeps the jump's): { drifts, boosts }
import { FLIGHT } from './flightConfig.js';
import { clamp, wrapPi, smoothstep, smootherstep } from './util.js';

const R = FLIGHT.drift;
// A step this long after the last one (s) means the ship was held meanwhile (src/shipStep.js keeps the same for the drift itself).
const STALE = 0.05;

const pro = (world) => !!world.stunts?.pro;
// NORMAL, the pause's DRIFT row's default, flies the preset with its `normal` numbers laid over it; PRO flies the preset as it is (SX,
// 2026-10-07: «режим про пусть будет таким же а не про наоборот помягче вход и выход из дрифта, побольше контроля в дрифте, чтобы
// поменьше было столкновений»). One merged preset per preset, made once.
const normals = new WeakMap();
function normalOf(P) {
  if (!P.normal) return P;
  let n = normals.get(P);
  if (!n) { n = Object.freeze({ ...P, ...P.normal, normal: null }); normals.set(P, n); }
  return n;
}
// The drift the page turned on, if the flown hull drifts (src/chassis.js `can`: SCOOTY JR. does not, its brake stays the brake), as
// the pilot's NORMAL or PRO flies it.
export function driftPreset(world) {
  const P = world.ship?.params().can?.drift === false ? null : world.stunts?.drift ?? null;
  return P && !pro(world) ? normalOf(P) : P;
}

// The turn the drift reads, -1..1 (SX, 2026-10-05: «пробел это тормоз, если пробел плюс кнопка направления, это занос по выбранному
// направлению»): the turn keys' (src/input.js `driftTurn`: with both held, the first pressed), or the side a pointer's gesture asks
// (labs/graphics/mouse-flight.js: grammar D's pointer aside of the course, the mouse alone's drift); never the pointer's steer, so Space
// with the pointer steering only brakes, and the pointer never fights the keys in a drift they began. Hands that say nothing of it (a
// check's, a scene's) are read by their turn.
export const driftTurn = (input) => input.driftTurn ?? input.turn ?? 0;

// Whether the hands ask for a drift at `speed` u/s: the brake and a turn key above `start` begin one, whichever came first, and the two
// together, above `keep`, hold one begun (NORMAL and PRO alike: PRO differs in what letting go pays). The turn key let go with Space still
// down ends the drift at once and Space is the ordinary brake from that very step (SX, 2026-10-09: «когда мы входим в дрифт, и потом
// отпускаем А или Д, нужно, чтобы пробел переключался на обычный тормоз»); until then Space alone held a drift, gliding on with no brake
// at all until Space was let go too. Pressing the turn key again, above `start`, begins a new drift.
export function wantsDrift(world, input, speed) {
  if (!input.damp || Math.abs(driftTurn(input)) < R.turning) return false;
  return speed > (world.drift ? R.keep : R.start);
}

// The drift begun, and the brake's frames before it given back (G1: `refund`): what the dampers took since Space went down, over a
// coast's, when the turn key came within `refund.window` s of it.
function startDrift(world, input, P) {
  const ship = world.ship, chain = world.driftChain;
  const links = pro(world) && chain && world.time < chain.until ? chain.links : 0;
  const course = Math.atan2(ship.vy, ship.vx), from = wrapPi(ship.angle - course);
  const throwSide = Math.sign(driftTurn(input)) || 1;
  const pr = presses.get(world), since = pr ? world.time - pr.from : Infinity;
  const owed = since <= P.refund.window ? Math.max(0, pr.v * Math.exp(-ship.params().drag * since) - Math.hypot(ship.vx, ship.vy)) : 0;
  world.drift = { t: 0, slide: from, from, throwSide, swept: 0, tier: 0, side: 0, links, gateUntil: -Infinity, gateTier: 0, lastStep: world.time,
    rate: 0, nose: ship.angVel, owed, paid: 0, vx: ship.vx, vy: ship.vy };
  world.driftChain = null;
  world.stuntLog.drifts++;
}
// When Space last went down and the speed then, per world (G1's refund; none of it saved).
const presses = new WeakMap();
function notePress(world, input, speed) {
  const pr = presses.get(world) ?? { held: false, from: -Infinity, v: 0 };
  if (input.damp && !pr.held) { pr.from = world.time; pr.v = speed; }
  pr.held = !!input.damp;
  presses.set(world, pr);
}

// The push a drift would pay if let go now, before PRO's share: its tier's `boost` (`flat`: whatever the drift cost; none in G1).
export const pushOf = (d, P) => P.boost[d.tier] ?? 0;

// The drift let go (or ended by a slowing ship): the nose stays where it is, turning on from the rate it had, in the pilot's hands
// from this step on, and the way out begins (stepDriftPush): the course held to the nose by a grip that fades, and the push the drift
// has earned (pushOf), in PRO by when it was let go.
export function endDrift(world, { pay = true } = {}) {
  const d = world.drift, P = driftPreset(world), ship = world.ship;
  world.drift = null;
  if (!d || !P || !pay) return 0;
  ship.angVel = d.nose;
  let boost = pushOf(d, P);
  if (pro(world) && boost > 0) {
    const inGate = world.time <= d.gateUntil;
    boost = inGate ? boost * (1 + R.pro.link * d.links) : boost * R.pro.late;
    if (inGate) world.driftChain = { until: world.time + R.pro.chain, links: Math.min(R.pro.links, d.links + 1) };
  }
  // The reflex: the tail swings back past the course, against the side it was thrown to, by `reflex` of the slide it had.
  const reflex = -Math.sign(d.slide) * P.reflex * Math.abs(d.slide);
  world.driftPush = { boost, time: P.exit, end: P.exit * R.reflexSpan[1], t: 0, reflex, flick: 0, vx: ship.vx, vy: ship.vy, lastStep: world.time,
    glide: true, ...holdOf(d, P, wrapPi(ship.angle - Math.atan2(ship.vy, ship.vx))), jerk: null };
  if (boost > 0) {
    world.lastBoost = { tier: d.tier, boost: Math.round(boost), links: d.links };
    world.stuntLog.boosts++;
    world.emit('driftBoost', { sectorId: world.sector.id, x: ship.x, y: ship.y, tier: d.tier, boost: Math.round(boost), links: d.links });
  }
  return boost;
}

// One step of the ground under the drift's rules. Returns true when it stepped the ship (a drift is under way), false when the
// plain Ship.step is to run. Space alone is the whole brake from its first step (SX, 2026-10-06: «надо убирать пролаг 0.1 после
// начала тормоза»: the tenth of a second's light brake of 278a1e9, Space's grace, is gone).
export function stepDrift(world, dt, input) {
  const P = driftPreset(world), ship = world.ship;
  if (!P) return false;
  const speed = Math.hypot(ship.vx, ship.vy);
  notePress(world, input, speed);
  if (world.drift) {
    world.drift.t += dt;
    if (!ship.alive || !wantsDrift(world, input, speed)) {
      endDrift(world, { pay: ship.alive });
      // Space still down: the dampers bite from this very step (the plain Ship.step below), and what they take counts from here, so a
      // turn key pressed again within `refund.window` s (A let go, D a moment later) gets the bite back as when Space came first.
      if (input.damp) { const pr = presses.get(world); pr.from = world.time; pr.v = speed; }
    }
  } else if (ship.alive && wantsDrift(world, input, speed)) startDrift(world, input, P);
  const d = world.drift;
  if (!d) return false;
  d.lastStep = world.time;
  return stepGlide(world, d, P, dt, input);
}

// The glide (G1; SX, 2026-10-06: «должен ощущаться мягче ... мы сверху смотрим ... скорее просто скользящий, приятный эффект ... И
// замедляет, и очень строго держит»): no circle and no brake. The hull's own step, the dampers off, the stick turning the nose as in
// flight, `steer` times the hull's rate eased in over `steerIn` s, and less as the nose comes `maxSlide` off the course (so it slides,
// never spins); none of the coast's drag. Then the course follows the nose with a low grip, a lag of `lag` s, its speed kept, and the
// brake's frames before the drift given back over `refund.time` s on an ease. The path's curve is the steering's.
function stepGlide(world, d, P, dt, input) {
  const ship = world.ship, c0 = Math.atan2(ship.vy, ship.vx), a0 = ship.angle, slide0 = wrapPi(a0 - c0), s0 = Math.hypot(ship.vx, ship.vy);
  let hand = input.turn || 0;
  if (hand && Math.sign(hand) === Math.sign(slide0)) hand *= 1 - smoothstep((Math.abs(slide0) - 0.7 * P.maxSlide) / (0.3 * P.maxSlide));
  ship.step(dt, { turn: hand * (1 + (P.steer - 1) * smootherstep(d.t / P.steerIn)), thrust: input.thrust, retro: false, damp: false, fire: input.fire });
  const H = ship.params(), keep = 1 - H.drag * dt, k = 1 / Math.max(1e-9, keep);
  let v = Math.hypot(ship.vx, ship.vy) * k;
  // What the throttle adds while it glides: `throttle` of it (NORMAL's a tenth, SX, 2026-10-07: «не ускоряй так сильно корабль при
  // дрифте можно чуть чуть»; PRO's all), and never more than flying straight would gain from this speed with the same push, the
  // coast's drag taken and the top's wall (SX, the same day: «особенно чтобы дрифт не выкручивал быстро скорость в максимальную»).
  // The coast's drag is cancelled, so the speed is kept, never braked; without the cap the push gained undragged, and a drift reached
  // the top sooner than flying straight (PRO from 850 u/s in 1.2 s against 3.6). Off the throttle the speed is kept.
  if (v > s0) {
    const straight = (s0 + ship.push) * keep;
    v = s0 + Math.min((v - s0) * P.throttle, Math.max(0, straight * ship.topShare(straight, dt) - s0));
  }
  const c = Math.atan2(ship.vy, ship.vx);
  const course = c + wrapPi(ship.angle - c) * (1 - Math.exp(-dt / P.lag));
  const due = d.owed * smoothstep(d.t / P.refund.time), pay = due - d.paid;
  d.paid = due;
  ship.vx = Math.cos(course) * (v + pay); ship.vy = Math.sin(course) * (v + pay);
  d.rate = wrapPi(course - c0) / dt;
  d.nose = wrapPi(ship.angle - a0) / dt;
  d.slide = wrapPi(ship.angle - course);
  d.vx = ship.vx; d.vy = ship.vy;
  if (Math.abs(d.slide) > R.side) d.side = Math.sign(d.slide);
  d.swept += Math.abs(d.rate) * dt;
  const tier = d.swept >= P.tiers[2] ? 3 : d.swept >= P.tiers[1] ? 2 : d.swept >= P.tiers[0] ? 1 : 0;
  if (tier > d.gateTier) { d.gateTier = tier; d.gateUntil = world.time + R.pro.gate; }
  d.tier = tier;
  return true;
}

// Whether the drift under way is a surf (the preset's `surf`; G1's), which is no brake: the page gives it neither the brake's look
// (the hull smaller and darker) nor its hiss.
export const surfing = (world) => !!(world.drift && driftPreset(world)?.surf);

// The reflex's share at `u` of the way out (its time in `exit`s): nothing until the span's start, the most at its middle, nothing at
// its end, smooth at both.
const reflexAt = (u) => { const [a, b] = R.reflexSpan, s = Math.sin(Math.PI * clamp((u - a) / (b - a), 0, 1)); return s * s; };
// The way out holds the course to the pilot's nose by a grip (1/s: the share of the angle between them closed a second) that fades
// to none over `exit` s, so the exit never sets the course for him (SX, 2026-10-05: «слишком задает направление, как будто контроля на
// выходе из заноса нет»; it locked the course onto the nose, the pilot's steer and all, and a turn key still held at the let-go swung
// the course 110 degrees in half a second). The grip `g0` at the let-go goes on turning the course as the drift did (`lag` the angle the
// nose led it by, the drift's rate over it, at most `catchMost`) and fades on a smoothstep; a bump of `gA` (6u(1-u), none at either end)
// brings what it closes of a held lag to `caught`. What the grip cannot carry of the drift's rate at once (a nose all but on the course)
// goes on as `carry` rad/s, fading on the same ease, so the course's turn never steps at the let-go.
function holdOf(d, P, lag) {
  const g0 = d.rate * lag > 0 ? Math.min(P.catchMost, d.rate / lag) : 0;
  return { g0, gA: Math.max(0, -Math.log(1 - P.caught) / P.exit - g0 / 2), carry: d.rate - g0 * lag };
}
// This step's turn of the course, over the share of the way out from `u0` to `u1`: toward the pilot's nose by the grip at the step's
// middle, and the carry. Nothing once the way out's catch is over (the course is the pilot's, as in any flight).
function glide(p, off, u0, u1, dt) {
  const u = (u0 + u1) / 2;
  if (u >= 1) return 0;
  const fade = 1 - smoothstep(u), g = p.g0 * fade + p.gA * 6 * u * (1 - u);
  return off * (1 - Math.exp(-g * dt)) + p.carry * fade * dt;
}

// After the ship's own step on the ground (the pilot's turn and throttle in it): the way out of a drift, over the preset's `exit` s.
// Each step the course is turned toward the pilot's nose by the grip that fades (glide), its speed kept, and goes where the pilot's
// nose and that grip take it; the push is added along that course on an ease in and out (smoothstep: nothing in the first step, most
// in the middle, nothing at the end). Over the end of the catch the hull swings the other way, past the course, and back onto the
// nose: the reflex (SX, 2026-10-04, F1d: «чтобы выкидывало с небольшим рефлексом в обратную сторону и потом вперед, но без сильного
// ускорения»), laid on the pilot's nose and taken off again (`flick`), so the nose is his at the end whatever he did meanwhile. A
// drift begun again under way takes the course back (no catch, no reflex, the push along the course); a blow (a step's change of speed
// past FLIGHT.drift.blow u/s: a bounce, the rope's throw), a step missed (a berth) or a jump ends it where it is, the reflex taken off
// the hull.
export function stepDriftPush(world, dt) {
  const ship = world.ship, p = world.driftPush;
  if (!p) return;
  if (!ship.alive || world.time - p.lastStep > STALE || Math.hypot(ship.vx - p.vx, ship.vy - p.vy) > R.blow) {
    cutPush(world);
    return;
  }
  const nose = world.drift ? ship.angle : ship.angle - p.flick;
  const u0 = p.t / p.time, from = smoothstep(u0);
  p.t += dt;
  const u1 = p.t / p.time, to = smoothstep(u1);
  let course = Math.atan2(ship.vy, ship.vx);
  if (!world.drift) {
    const speed = Math.hypot(ship.vx, ship.vy), off = wrapPi(nose - course);
    course += glide(p, off, u0, u1, dt);
    ship.vx = Math.cos(course) * speed; ship.vy = Math.sin(course) * speed;
  }
  const dv = p.boost * (to - from);
  ship.vx += Math.cos(course) * dv; ship.vy += Math.sin(course) * dv;
  p.flick = world.drift ? 0 : p.reflex * reflexAt(p.t / p.time);
  if (!world.drift) ship.angle = wrapPi(nose + p.flick);
  p.vx = ship.vx; p.vy = ship.vy; p.lastStep = world.time;
  if (p.t >= p.end) world.driftPush = null;
}
// The way out cut short: the reflex's share taken off the hull, so the nose is the pilot's.
function cutPush(world) {
  const p = world.driftPush;
  if (p && !world.drift) world.ship.angle = wrapPi(world.ship.angle - p.flick);
  world.driftPush = null;
}
// Anything that takes the ship out of the pilot's hands (or up: a jump) ends a drift without its push.
export function dropDrift(world) {
  cutPush(world);
  world.drift = null;
}
