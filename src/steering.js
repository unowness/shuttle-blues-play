// How the keyboard steers (SX, 2026-10-05, evening: «еще надо внести настройку в управлении как управлять на клаве w вперед s назад или
// w a s d каждая кнопка ведет корабль в сторону нажатой клавиши относительно оси»; which axis, asked, he picked the screen's). GAMEPLAY's
// STEERING row (labs/graphics/pause.js), kept in this browser with the other GAMEPLAY settings (src/prefs.js), never in the save:
//   TANK    the default, and the game as it was: W thrust, S reverse, A and D turn (src/input.js reads them; nothing here runs)
//   SCREEN  each of W A S D (and the arrows) asks for its own side of the screen, two keys a diagonal, opposite keys nothing. The page
//           sends the world that direction (`aim` in the hands, rad, on the screen's axes, which are the world's: x right, y down, 0 to the
//           right; the camera never turns), and the ship's step makes it the verbs the chassis flies by, every step (src/shipStep.js
//           `steered`), so the turn and the push are the chassis' own (src/chassis.js, src/ship.js) and nothing else
//
// SCREEN's rule:
//   the nose   turned toward the direction at the chassis' turn rate: the turn input held to ±1 (src/ship.js turns at `turnRate` times
//              it), from a steer proportional to the angle left and damped on the hull's own turning speed, the mouse's gain and
//              damping (labs/graphics/mouse-flight.js STEER); checks/steering.mjs measures it on every chassis
//   the push   along the nose, once it points within `cone` of the direction: 50 degrees. Wider than the 45 between a key and the
//              diagonal beside it, so a second key put down or lifted never cuts a burning engine (its spool would fall and start again
//              from its floor, src/ship.js); narrow enough that most of the push goes the asked way (cos 50 = 64 % at the cone's edge, all
//              of it once the nose is on), and a key opposite the course turns the hull 130 degrees before it pushes, so it never pushes
//              on along the old way
//   the brake  Space held: the directions steer and never push, as Space with A or D in TANK (a brake never comes with a push)
//   the drift  Space with a direction drifts (src/drift.js, G1) to the side of the current course the direction lies on, read every
//              step, so in a drift the key held is into it while the direction is off to that side (the tightest), nothing once the
//              course comes onto it (the middle) and the other way past it (the widest):
//                ahead   within `ahead` (22.5 degrees, half the keys' step) of the course: no side, Space the brake alone
//                behind  within `behind` (22.5) of straight behind: the side the nose turns to reach it (the steer's), so Space and the
//                        key behind is a U-turn drift round the side the hull goes, and the drift never fights the nose
//   let go     no direction held: the hull coasts, as in TANK.
// Q and E (the jump and the trick), the mouse's ways and every other key are the same in both.
import { clamp, wrapPi } from './util.js';
import { readGameplay, writeGameplay } from './prefs.js';

export const STEERINGS = Object.freeze(['tank', 'screen']);
export const STEERING_NAMES = Object.freeze({ tank: 'TANK', screen: 'SCREEN' });
export const DEFAULT_STEERING = 'tank';
export const fitSteering = (v) => (STEERINGS.includes(v) ? v : DEFAULT_STEERING);

// Kept with the GAMEPLAY settings (src/prefs.js PREFS.gameplay, `steering`): TANK unless SCREEN was kept.
export const readSteering = (store) => fitSteering(readGameplay(store).steering);
export const writeSteering = (mode, store) => writeGameplay({ steering: fitSteering(mode) }, store);
// The page's: { mode }, read once at the start, changed by GAMEPLAY's row (setSteering).
export const createSteering = (store) => ({ mode: readSteering(store) });
export function setSteering(steering, mode, store) {
  steering.mode = fitSteering(mode);
  writeSteering(steering.mode, store);
  return steering.mode;
}

const DEG = Math.PI / 180;
export const SCREEN_STEER = Object.freeze({ gain: 5, damp: 0.7, cone: 50 * DEG, ahead: 22.5 * DEG, behind: 22.5 * DEG });
const S = SCREEN_STEER;

// The direction the four keys ask, on the screen (rad, 0 to the right, y down), or null (none held, or only opposite keys): `held(id)`
// says whether a key of that action is down, the thrust's keys up, the reverse's down, the turns' left and right (src/controls.js).
export function keysAim(held) {
  const x = (held('turnRight') ? 1 : 0) - (held('turnLeft') ? 1 : 0), y = (held('retro') ? 1 : 0) - (held('thrust') ? 1 : 0);
  return x || y ? Math.atan2(y, x) : null;
}

// The turn input (-1..1) that brings the nose onto `aim`: proportional to the angle left, damped on the hull's turning speed.
export function steerTurn(ship, aim) {
  const rate = ship.params().turnRate || 1;
  return clamp(S.gain * wrapPi(aim - ship.angle) - S.damp * ship.angVel / rate, -1, 1);
}

// The side of the current course `aim` lies on, as the drift reads a turn key: 1 the right (clockwise on the screen), -1 the left, 0
// ahead. Straight behind it is the side `turn` (the steer's) goes round, else the side the nose is off the course, else the right.
export function aimSide(ship, aim, turn = steerTurn(ship, aim)) {
  const course = Math.hypot(ship.vx, ship.vy) > 1e-6 ? Math.atan2(ship.vy, ship.vx) : ship.angle;
  const off = wrapPi(aim - course), far = Math.abs(off);
  if (far <= S.ahead) return 0;
  if (far >= Math.PI - S.behind) return Math.sign(turn) || Math.sign(wrapPi(ship.angle - course)) || 1;
  return Math.sign(off);
}

// The hands the ship flies by this step: those that carry a direction (`aim`, SCREEN) made the chassis' verbs, the turn, the push in the
// cone (none while Space brakes), no reverse, and the drift's side; any other hands as they are.
export function steered(ship, input) {
  if (!Number.isFinite(input?.aim)) return input;
  const turn = steerTurn(ship, input.aim);
  const thrust = !input.damp && Math.abs(wrapPi(input.aim - ship.angle)) <= S.cone;
  return { ...input, thrust, retro: false, turn, driftTurn: aimSide(ship, input.aim, turn) };
}
