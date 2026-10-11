// The skills' one-time hints (SX, 2026-10-09: «Мы нигде не учим пользователя что можно прыгать, тормозить, дрифтить. И стрелять»; his pick on
// labs/graphics/sketches/teach-hints.html, «берем Т4 by the shift»: T4 BY THE SHIP, nothing at the top). The game says once, by the ship,
// which key does a thing, at the moment the thing is wanted: not a lesson, one line, the key (a cap) and the verb. Each skill is said once in
// the whole game: the pilot's record of it is in the save (`Pilot.taught`), so a new game says it again and a loaded one does not. A hint goes
// the moment the pilot does the thing, or after HINT.life seconds, and never comes back; one stands at a time, and yields, unsaid, to a moment
// earlier in ORDER (a heavy hit ahead does not wait for the steering's words). Its keys are the mode's own (src/controls.js skillWay: the
// table's, or the mouse's words in MOUSE + HOTKEYS); the drawing is labs/graphics/skill-hint.js.
//
//   THRUST the first flight: the loaner out of HOME, the opening's first stage                the thrust held
//   STEER  the first flight, once the thrust is said: the turn's keys and the reverse's        both done, the turn and the reverse
//   BRAKE  a heavy hit ahead is said (IMPACT over the lever, src/hitWarning.js)            the brake held on the ground
//   FIRE   a pirate within the gun's reach, for a hull that has a gun                       the fire key (a hull that fires)
//   DRIFT  a turn held HINT.hold s above FLIGHT.drift.start u/s, for a hull that drifts      a drift begun
//   JUMP   open space at a speed a figure has room at, HINT.hold s, after the first delivery   the take-off
//   TRICK  in the air, once the first delivery is made, where a figure has room             a figure begun, or the landing
//
// A hint whose moment is on when the deed is already being done is said and gone at once: never shown, still counted. The opening says two
// of them already (src/opening.js: BRAKE TO A STOP and AIM AND FIRE, lines that name no key): while its line for a skill stands, that skill's
// hint waits (openingTeaches), and comes after, to the pilot who has not yet done the thing. Several moments in one frame: the first of ORDER.
//
// Nothing here is read by the world's step: it reads the world and the hands once a frame, writes the pilot's record, and says what stands
// (`h.shown`); `h.changed` is set when the record changed, for the page to save. Reduced motion: no fade, the hint stands and goes.
import { FLIGHT } from './flightConfig.js';
import { CONFIG } from './config.js';
import { SKILL_IDS } from './pilot.js';
import { driftPreset } from './drift.js';
import { trickPreset, hangOf, lateZones, airZones } from './trick.js';
import { openingTeaches, openingStage } from './opening.js';
import { skillWay, DEFAULT_SCHEME } from './controls.js';
import { hypot2 } from './util.js';

// What the hint says of a skill: its verb (the way is the mode's, `skillWay`). One line, no reason: the rock or the pirates are there to see.
// `then`: a second way and its verb on the same line (the steering's reverse: SX, «АД, чтобы рулить, С, чтобы назад»), said where the mode has
// keys for it (MOUSE + HOTKEYS has no reverse: the pointer behind brakes and turns the nose).
const MOUSE_MODE = 'M';
export const SKILLS = Object.freeze({
  thrust: Object.freeze({ verb: 'FORWARD' }),
  steer: Object.freeze({ verb: 'STEER', then: Object.freeze({ skill: 'back', verb: 'BACK' }) }),
  brake: Object.freeze({ verb: 'BRAKE' }),
  fire: Object.freeze({ verb: 'FIRE' }),
  drift: Object.freeze({ verb: 'DRIFT' }),
  jump: Object.freeze({ verb: 'JUMP' }),
  trick: Object.freeze({ verb: 'TRICK' }),
});
// `life` s a hint stands unless the deed ends it (SX, 2026-10-09 evening: «подсказки управления должны висеть какое-то время. То есть, типа, секунд
// 45»; his table's 5 s before); `hold` s a turn is held, or the sky is open, before its moment comes (SX's «удержанный секунду выше 300 u/s»);
// `fade` s it comes and goes in (none for reduced motion).
export const HINT = Object.freeze({ life: 45, hold: 1, fade: 0.25 });
// Which moment wins when two are on in one frame, and which a standing hint yields to: the jump's figure is on while the ship is up, the heavy
// hit ahead is the nearest danger; the first flight's two last, as they are on all through it.
export const ORDER = Object.freeze(['trick', 'brake', 'fire', 'drift', 'jump', 'thrust', 'steer']);
// The first flight's two (SX, 2026-10-09: «первая подсказка по управлению кораблю должна быть, когда ты появляешься в скутере. Тогда уже должна
// быть информация, что W чтобы ехать вперед, как только пользователь поехал вперед, должна быть подсказка типа АД, чтобы рулить, С, чтобы
// назад»): said only in the opening's first stage, the loaner out of HOME; a pilot past it is never told them (a save from before them, a
// veteran's world), and they do not keep the step running for him.
export const FIRST_FLIGHT = Object.freeze(['thrust', 'steer']);
const firstFlight = (world) => openingStage(world) === 'loaner';
// Whether a skill may still be said to this pilot.
const unsaid = (world, skill) => !world.pilot.taught.has(skill) && (skill !== 'thrust' && skill !== 'steer' || firstFlight(world));

// The page's state: the hint that stands (`shown`: { skill, age, out (-1 standing, else s since it began to go), by (the side of the key that
// jumped, for the trick's key), cell, scheme (the way as the mode says it) }), how long a turn and an open sky have been held, and whether
// the record changed since the page last saved it. The steering's hint keeps what of it was done (`turned`, `backed`).
export const createSkillHints = () => ({ shown: null, turning: 0, open: 0, changed: false });

const canFire = (ship) => ship.params().can?.fire !== false;
// A hull's gun reaches what a shot covers in its life (the shot's own speed over CONFIG.bullet.life, from the hull).
const gunReach = (ship) => ship.params().muzzleSpeed * CONFIG.bullet.life;
// The first delivery made: the ledger's `completed` (src/pacing.js reads it as the deliveries).
const delivered = (world) => world.ledger.completed.size > 0;

// A pirate not leaving, within `reach` of the ship (a plain loop: asked every frame a hull that fires has no hint of its own yet).
function pirateWithin(world, reach) {
  const ship = world.ship, t = world.topology;
  for (let i = 0; i < world.pirates.length; i++) {
    const p = world.pirates[i];
    if (p.mode !== 'leave' && hypot2(t.dx(ship.x, p.x), t.dy(ship.y, p.y)) <= reach + p.radius) return true;
  }
  return false;
}

// The least speed at which a jump of the preset has a green for a figure (src/trick.js lateZones: "no green when no figure would fit"): the
// hang grows with the speed (hangOf), so it is where the zone first stands; one number a preset, found once.
const figureSpeeds = new WeakMap();
function figureSpeed(P) {
  let v = figureSpeeds.get(P);
  if (v === undefined) {
    let lo = 0, hi = 2 * P.hang[1] / P.perSpeed;
    if (!lateZones(hangOf(P, hi), P).trick) v = Infinity;
    else {
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (lateZones(hangOf(P, mid), P).trick) hi = mid; else lo = mid; }
      v = hi;
    }
    figureSpeeds.set(P, v);
  }
  return v;
}

// Open space at a speed a jump with a figure fits: nothing selected (no window near), and no rock, planet, station, hole or pirate within the
// way a jump covers (the speed over the hang it would have) and the thing's own size.
function openSky(world, P, speed) {
  const ship = world.ship;
  if (world.selected || speed < figureSpeed(P)) return false;
  const reach = speed * hangOf(P, speed) + ship.radius, O = CONFIG.planet.orbit.height;
  for (const a of world.asteroids) if (within(world, a.x, a.y, reach + a.radius)) return false;
  for (const p of world.planets) if (within(world, p.x, p.y, reach + p.radius + O)) return false;
  for (const s of world.stations) if (within(world, s.x, s.y, reach + s.far)) return false;
  for (const h of world.holes) if (within(world, h.x, h.y, reach + h.disc)) return false;
  for (const p of world.pirates) if (within(world, p.x, p.y, reach + p.radius)) return false;
  return true;
}
// Whether (x, y) is nearer the ship than `d` (a call, not a closure made for each frame's loop).
const within = (world, x, y, d) => hypot2(world.topology.dx(world.ship.x, x), world.topology.dy(world.ship.y, y)) < d;

// The moments, by skill: whether it is on now. `a` the frame's hands and warning.
function momentOf(skill, h, world, a) {
  const ship = world.ship;
  switch (skill) {
    case 'thrust': return firstFlight(world);
    case 'steer': return firstFlight(world) && world.pilot.taught.has('thrust');
    case 'brake': return !!a.warning;
    case 'fire': return canFire(ship) && pirateWithin(world, gunReach(ship));
    case 'drift': return h.turning >= HINT.hold;
    case 'jump': return h.open >= HINT.hold;
    case 'trick': return ship.airborne && delivered(world) && !!world.air && world.air.figs.length === 0 && !!airZones(world)?.trick;
    default: return false;
  }
}
// The deeds, by skill: whether the pilot is doing the thing now; the steering's, whether both its ways were done while it stood (`s`).
function deedOf(skill, world, a, s = null) {
  const ship = world.ship;
  switch (skill) {
    case 'thrust': return !!a.controls?.thrust;
    case 'steer': return !!s && s.turned && (s.backed || A.scheme === MOUSE_MODE);
    case 'brake': return a.braking && !ship.airborne;
    case 'fire': return !!a.controls?.fire && canFire(ship);
    case 'drift': return !!world.drift;
    case 'jump': return ship.airborne;
    // The trick is a thing of the air: the figure begun, or the contact (the hint has nothing to say on the ground).
    case 'trick': return !ship.airborne || (world.air?.figs.length ?? 0) > 0;
    default: return false;
  }
}

// What the pilot has been doing, counted whether a hint stands or not: a turn above the drift's speed, an open sky at a jump's speed.
function dwell(h, world, a, dt) {
  const ship = world.ship, pilot = world.pilot, speed = hypot2(ship.vx, ship.vy);
  const up = ship.airborne || !ship.alive || world.docked || world.home;
  const turning = !up && !pilot.taught.has('drift') && !!driftPreset(world) && speed > FLIGHT.drift.start && Math.abs(a.controls?.turn ?? 0) >= FLIGHT.drift.turning;
  h.turning = turning ? h.turning + dt : 0;
  const P = pilot.taught.has('jump') ? null : trickPreset(world);
  h.open = !up && P && delivered(world) && openSky(world, P, speed) ? h.open + dt : 0;
}

// Nothing left to say: every skill said (or the first flight's past) and no hint going out. The page does not call the step then (a frame's
// options object is garbage too).
function allSaid(world) {
  for (let i = 0; i < SKILL_IDS.length; i++) if (unsaid(world, SKILL_IDS[i])) return false;
  return true;
}
export const settled = (h, world) => !h.shown && allSaid(world);
// The first skill of ORDER, before `before` (an index), whose moment is on and that may be said, but not the one the opening's own line is
// saying; null when none.
function firstOn(h, world, a, before = ORDER.length) {
  const hold = openingTeaches(world);
  for (let i = 0; i < before; i++) {
    const skill = ORDER[i];
    if (unsaid(world, skill) && skill !== hold && momentOf(skill, h, world, a)) return skill;
  }
  return null;
}

// The frame's hands, kept (a step's own object each frame would be garbage a frame for the whole game).
const A = { braking: false, controls: null, warning: null, scheme: DEFAULT_SCHEME };
const teach = (h, pilot, skill) => { if (pilot.teach(skill)) h.changed = true; };

// One frame. `dt` the frame's seconds; `braking` the brake as the page shows it; `controls` what the world was stepped with ({ turn, fire });
// `warning` the heavy hit ahead (labs/graphics/hit-warning.js `threat`), or null; `scheme` the controls' mode (labs/graphics/schemes.js); `still`:
// reduced motion; `frozen`: a pop-up stands over the
// flight (nothing runs, nothing is drawn). Returns the hint that stands, or null: one going out still counts as standing, and is dropped at
// once if another's moment comes (the jump's, going out, and the trick's coming).
export function stepSkillHints(h, world, { braking = false, controls = null, warning = null, dt = 0, still = false, frozen = false, scheme = DEFAULT_SCHEME } = {}) {
  const pilot = world.pilot;
  if (!pilot || frozen) return h.shown;
  A.braking = braking; A.controls = controls; A.warning = warning; A.scheme = scheme;
  const fade = still ? 0 : HINT.fade;
  let s = h.shown;
  if (s && s.out >= 0) {
    s.out += dt;
    if (s.out >= fade) h.shown = s = null;
  }
  if (allSaid(world)) { h.turning = h.open = 0; return s; }
  dwell(h, world, A, dt);
  const flying = world.ship.alive && !world.docked && !world.home;
  // The one standing: its deed, its seconds, or a ship no longer flying end it, and it is said by then, whatever the end; a moment earlier in
  // ORDER takes its place, and it is not said: it comes again when its own moment is on.
  if (s && s.out < 0) {
    s.age += dt;
    if (s.skill === 'steer') { if (A.controls?.turn) s.turned = true; if (A.controls?.retro) s.backed = true; }
    const ends = !flying || s.age >= HINT.life || deedOf(s.skill, world, A, s);
    if (!ends && !firstOn(h, world, A, ORDER.indexOf(s.skill))) return s;
    if (ends) teach(h, pilot, s.skill);
    if (fade > 0) s.out = 0; else h.shown = s = null;
  }
  if (!flying) return s;
  // The next whose moment is on and that has not been said.
  const skill = firstOn(h, world, A);
  if (!skill) return s;
  if (deedOf(skill, world, A)) { teach(h, pilot, skill); return s; }
  // A pilot in the air has jumped: the jump needs no word of its own after the trick's.
  if (skill === 'trick') teach(h, pilot, 'jump');
  return (h.shown = { skill, age: 0, out: -1, by: skill === 'trick' ? world.air?.by ?? 0 : 0, cell: '', cell2: '', scheme: '', turned: false, backed: false });
}

// What a hint says in a mode: its way (the mode's keys or the mouse's words), and its second's (`cell2`, the steering's reverse). The ways are
// made again only when the mode changes.
export function hintWords(s, scheme = DEFAULT_SCHEME) {
  if (s.scheme !== scheme) {
    const then = SKILLS[s.skill].then;
    s.scheme = scheme; s.cell = skillWay(s.skill, scheme, s.by); s.cell2 = then && scheme !== MOUSE_MODE ? skillWay(then.skill, scheme) : '';
  }
  return s;
}
