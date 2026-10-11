// The trick (SX's item 11; grammar D, his pick on labs/graphics/sketches/movement-grammar.html, 2026-10-04): a key jumps the ship up
// and, held, keeps it up as long as its speed allows; the other key in the air plays the next figure of a sequence drawn ahead from the
// world's seed, turned to that key's side (SX, 2026-10-05: Q and E both jump, the first pressed; src/shipStep.js reads the pair), in
// the scale's one green (J2, the game's since 2026-10-06: from 0.1 s after the take-off) and only when the air left takes it at its own
// pace, else a soft abort (SX's pick of T1 SLOW's motion, 2026-10-05: resolveFigures);
// let go, it comes down, and the speed the top gave is taken back off. In the air the course is held and the ship passes over
// everything smaller than a planet; a planet bounces it off like a pinball (SX, 2026-10-03). The motion of the height is J1 SMOOTH UP,
// FIRM DOWN (docs/plans/2026-10-04-jump-motion.md). The rules and the numbers are FLIGHT.trick (src/flightConfig.js); this file is
// the step and the curves the drawing and the checks read. It runs only where the page turned it on (`world.stunts.trick`: J2, its
// figures' pace the lab's `?figure=` to compare); without it (a check's world) nothing here is ever called. T1, T2 and T3, the jumps
// before J2 (T2 the game's until 2026-10-06: a figure only at the top, a let-go green that landed it clean), went with the lab's
// `?trick=` and `?jump=` once SX had picked, 2026-10-07.
//
// State, on the world (declared in World's constructor) and the ship (none of it saved: a jump lasts seconds):
//   ship.airborne   true from the press to the contact (the clearance: a press just before a rock clears it, no early ground)
//   ship.air        the height, 0 on the ground to 1 at the top, for the drawing (the plates draw the ship over them: chat H)
//   world.air       null, or the jump under way: { t, v0 (its own speed, melting as a coast), hang, letGo, release, figs, asks, swing, swingV,
//                   bounces, start, by (the key that jumped and holds it up: -1 the pair's left, 1 its right, 0 a jump with no side, the
//                   mouse's) }; `letGo` when the key was let go (or the hang ran out), `release` when the fall began: later than the
//                   let-go while a figure turns (a landing never cuts one short)
//                   each of `figs` { kind, start, end, at, side (-1 left, 1 right, 0 none: the mouse's) }, a figure played (begun);
//                   each of `asks` { at, side }, a press of the figure key waiting for its start (resolveFigures)
//   world.landing   null, or the contact just made: { t, extra, left, clean, figures, at }: the top's speed going back off
//   world.airLog    the last jump's times on the world's clock, for the cargo lifted after the ship: { start, release, land, lag }
//   world.trickSeq  the figures drawn ahead: { code, kinds, next }
//   world.trickAbort null, or the soft abort's swing: { at (the world's time it began), side }, on through the contact
import { FLIGHT } from './flightConfig.js';
import { clamp, easeOut, smoothstep } from './util.js';
import { dropDrift } from './drift.js';

const T = FLIGHT.trick, M = T.motion;

// The figures and their base lengths in s (FLIGHT.trick's presets scale them): FLIP over the wings (the nose goes round), SPIN round in
// the plane, ROLL over the length (a barrel roll), PLAIN a grab, the hull tipped and back.
export const FIGURES = Object.freeze({ FLIP: 0.55, SPIN: 0.6, ROLL: 0.5, PLAIN: 0.45 });
// SX: «заготавливается секвенция действий на 30-1:00 вперед»: a minute of figures drawn once, ahead, by weight.
export const SEQUENCE_SECONDS = 60;

// The trick the page turned on, if the flown hull jumps (src/chassis.js `can`; every hull does today, SCOOTY JR. too).
export const trickPreset = (world) => (world.ship?.params().can?.jump === false ? null : world.stunts?.trick ?? null);

// The curves, by CSS's names (the brief): ease-out cubic `cubic-bezier(0.33, 1, 0.68, 1)` up, ease-in cubic `cubic-bezier(0.32, 0,
// 0.67, 0)` down.
export const riseCurve = (u) => easeOut(clamp(u, 0, 1));
export const fallCurve = (u) => clamp(u, 0, 1) ** 3;

// The height at `t` s after the press, for a jump let go (its fall begun) at `release` (null: not yet).
export function heightAt(t, release = null) {
  if (t <= 0) return 0;
  if (release !== null && t >= release) return 1 - fallCurve((t - release) / M.fall);
  return t < M.rise ? riseCurve(t / M.rise) : 1;
}

// The same on the world's clock, from a jump's log (the cargo, lifted `lag` s after the ship).
export function heightOnClock(airLog, time) {
  if (!airLog) return 0;
  const t = time - airLog.start;
  if (airLog.land !== null && time >= airLog.land) return 0;
  return heightAt(t, airLog.release === null ? null : airLog.release - airLog.start);
}

// Where the drawing puts a hull `h` up (0..1): `grow` larger at the top, in its place; `x` and `y` would move it toward the light by
// that much of its collider's radius, none since SX took its shadow away (F1d, 2026-10-04: «Тень не нужна»; it was -0.18 and -0.6,
// the shadow left where the hull was, 0.08 smaller): with no shadow beside it, a hull moved toward the light reads as a hull moved,
// so only its size says it is up. Presentation only: nothing in the step reads it (the drawing of the ship, labs/graphics/stunt-fx.js,
// of the cargo lifted after it, src/worldDraw.js, and of a dialog by the hull, labs/graphics/context.js).
// `grow` half of the 0.45 it was since SX, 2026-10-05: «при прыжке слишком визуально высоко подлетает»: a hull 1.225 times its size at
// the top where it was 1.45, on the same J1 curve (heightAt); the hang, the scale in the helmet's notch and its zones as they were.
export const LIFT = Object.freeze({ x: 0, y: 0, grow: 0.225 });
export const liftOffset = (h, radius) => ({ dx: LIFT.x * radius * h, dy: LIFT.y * radius * h, grow: 1 + LIFT.grow * h });

// How long a jump taken at `speed` u/s may stay up, rise included.
export const hangOf = (preset, speed) => clamp(speed * preset.perSpeed, preset.hang[0], preset.hang[1]);
// A figure's length, s: its base, the preset's share, and the pace (FLIGHT.trick.figures.pace; the lab's `?figure=` puts its own on
// the preset, labs/graphics/stunt-fx.js readStuntSwitches).
export const figureLength = (preset, kind) => FIGURES[kind] * preset.figure * (preset.pace ?? T.figures.pace);

// The share of a figure's turn done at `u` of its length (SX's pick of T1 SLOW, FLIGHT.trick.figures): an even speed, reached over the
// first `ease` of the length and given up over the last, each on a smoothstep of the speed (so the speed itself has no step), never
// past the whole turn. The turn is the speed integrated: over a ramp `ease` long, ease * (s^3 - s^4 / 2) at s of it; the whole
// 1 - ease. Every tenth of the figure's middle turns about a ninth of it, so the motion is seen over the figure's whole length.
export function figureTurn(u) {
  const r = T.figures.ease, x = clamp(u, 0, 1), ramp = (s) => r * (s ** 3 - s ** 4 / 2);
  const done = x < r ? ramp(x / r) : x <= 1 - r ? r / 2 + (x - r) : 1 - r - ramp((1 - x) / r);
  return done / (1 - r);
}

// The sequence: SEQUENCE_SECONDS of figures drawn by weight from the world's 'trick' stream, so one seed is one sequence (a recording
// replays it). `repeat` is the share of its weight a figure keeps for the draw after it.
function sequence(world, preset) {
  const have = world.trickSeq;
  if (have && have.code === preset.code) return have;
  const rng = world.rng('trick'), kinds = Object.keys(FIGURES), out = [];
  let last = null;
  for (let t = 0; t < SEQUENCE_SECONDS;) {
    const w = kinds.map((k) => (preset.weights[k] ?? 0) * (k === last ? preset.repeat : 1));
    let pick = rng() * w.reduce((a, b) => a + b, 0), kind = kinds[0];
    for (let i = 0; i < kinds.length; i++) { pick -= w[i]; if (pick < 0) { kind = kinds[i]; break; } }
    out.push(kind);
    last = kind;
    t += figureLength(preset, kind);
  }
  return (world.trickSeq = { code: preset.code, kinds: out, next: 0 });
}

// The jump's scale (S8 V1+, SX's pick 2026-10-04), on the hang's own axis (s since the press, the rise included), J2's (SX, 2026-10-06:
// «пусть момент для трюка будет зеленым, а желтая зона в конце, это когда ты невовремя отпустил прыжок, и у
// корабля типо закончился запас выталкивающей силы и он грохнулся с небольшой потерей скорости, можно сделать только когда на красной
// зоне в самом конце, но перед ней должна быть желтая а зеленая для трюка где-то в середине»; the preset's `scale`): one green, from
// `from` s after the take-off (SX, that evening: «трюк можно было сделать почти сразу после прыжка») to `window` / 2 past the hang's
// middle, kept where a figure begun in it still ends by the contact (its longest); a figure asked there plays, asked
// anywhere else it is the soft abort. Yellow from the green to the red: late, a let-go there lands with no trick and no harm. The red
// the last `red` of the hang: the lift spent, a let-go there (or the key held to the end) drops the ship hard (`drop` of its speed off,
// the hull jolted). Gray before the green. No green when no figure would fit (a slow jump).
export function lateZones(hang, P) {
  const S = P.scale, longest = Math.max(...Object.keys(FIGURES).map((k) => figureLength(P, k)));
  const red = hang * (1 - S.red), last = Math.min(red, hang + M.fall - longest);
  const g0 = S.from, g1 = Math.min(last, hang / 2 + S.window / 2);
  const trick = g1 > g0 ? [g0, g1] : null;
  return { trick, late: [trick ? trick[1] : M.rise, red], red, letgo: null };
}
// The same for the jump under way (`world.air`).
export function airZones(world) {
  const P = trickPreset(world);
  return world.air && P ? lateZones(world.air.hang, P) : null;
}
// The figure under way at `t` s into the jump, and how far through it (0..1), or null.
export function figureAt(air, t = air.t) {
  for (const f of air.figs) if (t >= f.start && t < f.end) return { ...f, u: (t - f.start) / (f.end - f.start) };
  return null;
}

// A press of a jump: the ship leaves the ground (the caller has checked it may), held up by the key that pressed it (`by`: -1 the
// pair's left, 1 its right, 0 a jump with no side).
export function takeOff(world, by = 0) {
  const P = trickPreset(world), ship = world.ship;
  // The speed it truly has: a jump taken while the last one's top speed is still going back off starts from under it (else a chain
  // of jumps would ratchet the speed up a little each time).
  const v0 = Math.max(0, Math.hypot(ship.vx, ship.vy) - (world.landing?.left ?? 0));
  world.air = { t: 0, v0, hang: hangOf(P, v0), letGo: null, release: null, figs: [], asks: [], swing: 0, swingV: 0, bounces: 0, start: world.time,
    lastStep: world.time, by };
  world.landing = null;
  // The figures drawn ahead now, so the scale knows the next one before E (their own stream: drawn now or at E, the same figures).
  sequence(world, P);
  // The way out of a drift ends at the jump, its reflex taken off the hull (src/drift.js): the hull goes up on the pilot's nose.
  dropDrift(world);
  ship.airborne = true;
  ship.air = 0;
  // The cargo comes up after the hull with the tether's delay: where the hull left the ground, as a wagon would.
  const lag = world.cargo ? clamp(world.cargo.length / Math.max(v0, 150), 0.08, 0.6) : 0;
  world.airLog = { start: world.time, release: null, land: null, lag };
  world.stuntLog.jumps++;
  world.emit('jumped', { sectorId: world.sector.id, x: ship.x, y: ship.y, hang: +world.air.hang.toFixed(2) });
}

// The figure key in the air, at any height (src/shipStep.js reads which key): asked now, played or not when its start comes
// (resolveFigures), turned to `side` (the key's: -1 left, 1 right; 0 none, the mouse's). The side is the drawing's
// (labs/graphics/stunt-fx.js); the step never reads it.
export function askFigure(world, side = 0) {
  if (world.air) world.air.asks.push({ at: world.air.t, side });
}

// When a figure asked at `at` s into the jump starts: not before `from` s after the take-off, on the way up (J2's `scale.from`; SX,
// 2026-10-06: «трюк можно было сделать почти сразу после прыжка, иначе неинтересно ощущается»; T2's waited for the top, SX's
// «трюк только на самой высокой точке» of 2026-10-05), not before it was asked, and not before the figure begun before it ends
// (`after`, or null).
export const figureStart = (at, after, from) => Math.max(from, at, after ?? 0);
// The soonest a figure of the preset `P` may begin.
const soonest = (P) => P.scale.from;

// The figures asked whose start has come, in turn. One plays if it was asked in the scale's green (lateZones), the key that jumped still
// holds the ship up (not let go), and the air left from its start, to the hang's end and then the fall, takes it at its own
// length: it is then the sequence's next, and it ends before the contact whatever the hands do (stepAir). Otherwise there is no
// figure, never one sped up to fit (SX: «чтобы не было неестественно ускоренной анимации»): the soft abort, the hull swung a little to
// the key's side and eased back (`world.trickAbort`, abortTurn; SX: «как будто бы пробел нажали в воздухе, чтобы он чуть-чуть занес
// угол, но не стал ничего делать»), and the sequence keeps its figure for the next press.
function resolveFigures(world, { landing = false } = {}) {
  const air = world.air, P = trickPreset(world), seq = sequence(world, P);
  while (air.asks.length) {
    const last = air.figs[air.figs.length - 1], start = figureStart(air.asks[0].at, last ? last.end : null, soonest(P));
    if (start > air.t + 1e-9 && !landing) return;
    const { at, side } = air.asks.shift(), kind = seq.kinds[seq.next % seq.kinds.length], end = start + figureLength(P, kind);
    const green = lateZones(air.hang, P).trick, inGreen = !!green && at >= green[0] - 1e-9 && at < green[1];
    if (!landing && air.release === null && end <= air.hang + M.fall + 1e-9 && inGreen) {
      seq.next++;
      air.figs.push({ kind, start, end, at, side });
    } else {
      world.trickAbort = { at: world.time - Math.max(0, air.t - start), side };
      world.stuntLog.aborts++;
    }
  }
}

// The soft abort's swing `t` s after it began, a share of FLIGHT.trick.abort's angle: out on an ease-out over `out` s, back on an
// ease-in-out over `back` s, never past the angle and never past level on the way back; 0 before and after.
export function abortSwing(t) {
  const A = T.abort;
  if (!(t > 0) || t >= A.out + A.back) return 0;
  return t < A.out ? easeOut(t / A.out) : 1 - smoothstep((t - A.out) / A.back);
}
// The hull's turn by the soft abort under way, rad, to its key's side (with none, to the right, as a SPIN turns): the drawing's.
export function abortTurn(world) {
  const a = world.trickAbort;
  return a ? (a.side || 1) * T.abort.angle * abortSwing(world.time - a.at) : 0;
}

// One step of the ship in the air: the course held and the height's curve; the speed `top` more as the height; the dead edge's rope
// still holds (the world's edge is no less an edge up there); a planet is a pinball. `input.jump` held keeps it up while the hang
// allows (the key that jumped: src/shipStep.js), and a figure turning keeps it up past a let-go until it can come down as the figure
// ends; `input.figurePress` asks for a figure, turned to `input.figureSide`; `input.damp` swings the tail (a look: no smoke, no slide).
// Lands at the end of the fall.
export function stepAir(world, dt, input) {
  const air = world.air, P = trickPreset(world), ship = world.ship;
  if (!ship.alive) { endAir(world, { quiet: true }); return; }
  air.t += dt;
  air.lastStep = world.time;
  if (input.figurePress) askFigure(world, input.figureSide ?? 0);
  if (air.release === null && air.t >= M.rise && (!input.jump || air.t >= air.hang)) {
    air.letGo = Math.max(M.rise, Math.min(air.t, air.hang));
    air.forced = !!input.jump;
    // A landing never cuts a figure short (the page measured them cut at 69-91 % and the hull snapping level in a frame): let go
    // while one turns, the fall waits for the figure's end less the fall. A figure begins only if the hang and the fall take it, so
    // this is never past the hang.
    const last = air.figs[air.figs.length - 1];
    air.release = Math.max(air.letGo, last ? last.end - M.fall : 0);
    world.airLog.release = world.time - (air.t - air.release);
  }
  resolveFigures(world);
  const h = heightAt(air.t, air.release);
  ship.air = h;
  // The tail swung out with Space, toward the turn (or the last side turned), on a loose spring (a look only).
  const turn = Math.sign(input.turn || 0);
  if (turn) air.side = turn;
  const want = input.damp ? (air.side || 1) * T.swing.angle : 0;
  air.swingV += (T.swing.stiffness * (want - air.swing) - T.swing.damping * air.swingV) * dt;
  air.swing += air.swingV * dt;

  // What the ship does up there: no hand on it, the timers run.
  ship.cooldown = Math.max(0, ship.cooldown - dt);
  ship.invuln = Math.max(0, ship.invuln - dt);
  ship.angVel = 0;
  ship.turnInput = 0;
  ship.braking = false;
  ship.thrusting = false;
  ship.retroing = false;
  ship.animating = false;
  ship.spool = Math.max(0, ship.spool - dt / ship.params().spoolDownTime);
  ship.retroSpool = Math.max(0, ship.retroSpool - dt / ship.params().spoolDownTime);
  world.stepBoundary(dt);
  // The course is the velocity's (the rope or a planet may turn it); its length the press's, `top` more at the top.
  // The jump's own speed melts as a coasting ship's does (FLIGHT.trick.airDrag of the hull's drag); the landing gives back to it.
  air.v0 *= Math.max(0, 1 - ship.params().drag * T.airDrag * dt);
  const sp = Math.hypot(ship.vx, ship.vy), want2 = air.v0 * (1 + P.top * h);
  if (sp > 1e-6) { const k = want2 / sp; ship.vx *= k; ship.vy *= k; }
  ship.x += ship.vx * dt; ship.y += ship.vy * dt;
  ship.flamePhase += dt * 34;
  bouncePlanets(world);
  // The contact on the step nearest the curve's zero, so the drawn height never lingers a hair over the ground.
  if (air.release !== null && air.t >= air.release + M.fall - dt / 2) land(world);
}

// A planet in a jump is a sphere: the hull is sent off it at any speed, mirrored along the normal (FLIGHT.trick.bounce, at most 1: no
// gain), with no crash and no hull lost; the jump goes on.
export function bouncePlanets(world) {
  const ship = world.ship, e = Math.min(1, T.bounce);
  for (const p of world.planets) {
    const d = world.delta(ship.x, ship.y, p.x, p.y);
    const dist = Math.hypot(d.x, d.y), reach = p.radius + ship.radius;
    if (dist >= reach || dist < 1e-6) continue;
    const nx = d.x / dist, ny = d.y / dist, vn = ship.vx * nx + ship.vy * ny;
    ship.x = p.x + nx * reach; ship.y = p.y + ny * reach;
    if (vn >= 0) continue;
    ship.vx -= (1 + e) * vn * nx; ship.vy -= (1 + e) * vn * ny;
    world.air.bounces++;
    world.stuntLog.bounces++;
    world.emit('jumpBounced', { sectorId: world.sector.id, x: p.x + nx * p.radius, y: p.y + ny * p.radius, speed: Math.round(-vn) });
  }
}

// The contact: one frame, the ship on the ground. Clean unless it was let go in the scale's red or held to the hang's end (J2: the lift
// spent): then dropped hard, `scale.drop` of its speed off, and the hull jolted for half a second (the orbit's weak grip, src/ship.js
// `jolt`), no hull lost.
function land(world) {
  const air = world.air, ship = world.ship;
  // A figure asked too late to begin before the contact: the soft abort, which goes on over the ground.
  resolveFigures(world, { landing: true });
  const contact = air.release + M.fall;
  const started = air.figs.filter((f) => f.start <= contact);
  const P = trickPreset(world), hard = air.forced || air.letGo >= lateZones(air.hang, P).red - 1e-9;
  const clean = !hard;
  if (!clean) ship.jolt = Math.max(ship.jolt, T.wobble);
  if (hard) { const k = 1 - P.scale.drop; air.v0 *= k; ship.vx *= k; ship.vy *= k; }
  const sp = Math.hypot(ship.vx, ship.vy), extra = Math.max(0, sp - air.v0);
  world.landing = { t: 0, extra, left: extra, clean, hard, figures: started.map((f) => f.kind), at: world.time };
  world.airLog.land = world.time;
  endAir(world, { quiet: true });
  world.stuntLog.landings++;
  world.emit('landed', { sectorId: world.sector.id, x: ship.x, y: ship.y, clean, figures: started.length, ...(hard ? { hard } : null) });
}

// The jump ended without its contact (a wreck, the way in taking the ship, the trick switched off): on the ground at once.
export function endAir(world, { quiet = false } = {}) {
  const ship = world.ship;
  if (world.air && world.airLog && world.airLog.land === null) world.airLog.land = world.time;
  world.air = null;
  ship.airborne = false;
  ship.air = 0;
  if (!quiet) world.landing = null;
}

// After the contact, the speed the top gave is taken back off over `motion.settle` s on an ease-out, whatever the hands do meanwhile.
// After the ship's own step on the ground.
export function stepLanding(world, dt) {
  const L = world.landing, ship = world.ship;
  if (!L) return;
  L.t += dt;
  const left = L.extra * (1 - easeOut(clamp(L.t / M.settle, 0, 1)));
  const off = L.left - left, sp = Math.hypot(ship.vx, ship.vy);
  L.left = left;
  if (sp > 1e-6 && off > 0) { const k = Math.max(0, sp - off) / sp; ship.vx *= k; ship.vy *= k; }
  if (L.t >= M.settle) world.landing = null;
}

// Whether the contact of a jump was made in this very step (`land` runs in the ship's own step, before the world resolves what the hull
// overlaps): the hull has just come down, and what it is on top of it strikes with all its speed (src/contact.js, CONFIG.hull.landing).
export const landedNow = (world) => world.landing != null && world.landing.at === world.time;

// Whether a jump has the hull's speed: up, or its top's lift being taken back after the contact (stepLanding). The ship's visual scale
// reads no slowing then, and Space up there swings the tail, no brake (labs/graphics/main.js updateShipScale, src/visualScale.js).
export const jumpSpeedHeld = (world) => !!(world.air || world.landing);

// Whether the cargo is up: from `lag` s after the hull left the ground to `lag` s after it came down.
export function cargoLifted(world) {
  const L = world.airLog;
  if (!L || !world.cargo) return false;
  return world.time >= L.start + L.lag && (L.land === null || world.time < L.land + L.lag);
}
export const cargoHeight = (world) => (world.airLog ? heightOnClock(world.airLog, world.time - world.airLog.lag) : 0);

// What the ship passes over in a jump darkens a little under it, briefly and smoothly (SX, 2026-10-04, F1d: «если корабль пролетает
// над чем-то, то ... затемняется. На короткое время, плавненько, не сильно»). The hull's footprint (its drawn size, grown with its
// height) over a thing's disc dims the thing by up to `depth` of its ink, more the higher the hull and the nearer their middles
// (nothing once they no longer overlap); the dim comes in over about `in` s and goes over about `out` s, so a thing passed at speed
// stays shaded a moment after. Presentation only: the drawing asks it, the step never does. Every kind that can be passed over draws
// through passedOver (rocks and pirates in labs/graphics/world-art.js, NPC ships and droids in src/worldDraw.js), or asks underShip
// itself (a smoke cloud, src/cloudDraw.js, each of its sections a thing, the dim laid cell by cell), with the thing itself (its dim is
// kept per thing), where it is drawn and its radius, all in px.
export const UNDER = Object.freeze({ depth: 0.35, in: 0.06, out: 0.18 });
const dims = new WeakMap();
// The share of its ink a thing drawn at (sx, sy), `radius` px, keeps this frame: 1, or less while the hull is up over it.
export function underShip(world, r, thing, sx, sy, radius) {
  const ship = world.ship, up = ship.alive && ship.airborne ? ship.air : 0;
  let d = dims.get(thing);
  if (!d && up <= 0) return 1;
  const at = world.project(r, ship.x, ship.y), foot = ship.radius * (1 + LIFT.grow * up);
  const cover = 1 - smoothstep(Math.hypot(sx - at.x, sy - at.y) / (foot + radius));
  const want = UNDER.depth * up * cover;
  if (!d) dims.set(thing, d = { k: 0, at: world.time });
  const dt = clamp(world.time - d.at, 0, 1);
  d.k += (want - d.k) * (1 - Math.exp(-dt / (want > d.k ? UNDER.in : UNDER.out)));
  d.at = world.time;
  if (want <= 0 && d.k < 0.005) { dims.delete(thing); return 1; }
  return 1 - d.k;
}
// A renderer that draws `k` of every glyph's ink (`r` itself at 1).
export function dimmed(r, k) {
  if (k >= 1) return r;
  const scoped = Object.create(r);
  scoped.glyph = (c, x, y, ink, a = 1, s = 1) => r.glyph(c, x, y, ink, a * k, s);
  scoped.glyphRot = (c, x, y, angle, ink, a = 1, s = 1) => r.glyphRot(c, x, y, angle, ink, a * k, s);
  scoped.glyphNow = (c, x, y, ink, a = 1, s = 1) => r.glyphNow(c, x, y, ink, a * k, s);
  scoped.text = (text, x, y, ink, a = 1) => r.text(text, x, y, ink, a * k);
  if (r.glyphRow) scoped.glyphRow = (c, x, y, count, ink, a = 1) => r.glyphRow(c, x, y, count, ink, a * k);
  return scoped;
}
// The renderer to draw `thing` with: dimmed while the hull is up over it.
export const passedOver = (world, r, thing, sx, sy, radius) => dimmed(r, underShip(world, r, thing, sx, sy, radius));
