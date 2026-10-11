// Flying with the mouse (SX, 2026-10-02: «1 кнопка мыши как бы набирает скорость, и так подтягивает корабль и ты мышкой
// выбираешь направление, а второй кнопкой стреляешь»). Since 2026-10-07 the mouse flies alone in MOUSE + HOTKEYS and never in KEYS +
// CLICKS (labs/graphics/input-router.js hands: the keys handed in here are none then); on a page with no mode (a check's rig) the keys
// stay and the mouse adds to them:
// - the left button, pressed in open space, pulls the ship toward the pointer: the nose turns to it and the engine runs
//   while the nose is within `align` of it, so the ship is drawn the way it is pointed and never pushed sideways;
// - the right button fires, the nose turning to the pointer as well, so a shot goes where the pointer is;
// - within `dead` px of the ship the pointer asks nothing (no way to point at the ship itself);
// - A or D held turn the ship as before, over the pointer.
// The turn is a proportional steer with damping on the ship's own turning speed (`gain`, `damp`), allowed `reach` times
// the chassis' full turn. SX, 2026-10-02: the first steer (gain 3, damp 0.4, reach 1) read «ватный», asked 25 to 30 %
// quicker. Measured on every chassis, 10 to 179 degrees, at 120, 60 and 30 frames a second: the nose is on the pointer
// (within a degree) 26 to 32 % sooner, the engine starts 25 % sooner, and it swings past by under 0.7 degrees.
// The keys keep the chassis' own turn: only the pointer turns harder.
import { readGameplay, writeGameplay } from './gameplay-settings.js';
import { wrapPi } from '../../src/util.js';
import { FLIGHT } from '../../src/flightConfig.js';
import { driftTurn, driftPreset } from '../../src/drift.js';

export const STEER = Object.freeze({ gain: 5, damp: 0.7, reach: 1.4, align: 0.6, dead: 28 });

// The mouse's ways this file does, by src/controls.js's names (MOUSE_WAYS): the left button held pulls the ship toward the pointer,
// which steers it, and the right one fires; in grammar D's mouse (the new layout, the game's: B on the M0 page, SX's pick) the
// left button held with the pointer behind the course brakes and aside of it drifts, a double press held jumps (and the wheel up), the
// right button in the air plays a figure (checks/controls-coverage.mjs holds the table to this list).
export const GESTURES = Object.freeze(['hold-l-ahead', 'pointer', 'hold-r', 'hold-l-behind', 'hold-l-aside', 'double-l', 'wheel-up', 'r-in-air']);
// Grammar D's zones round the course (the M0 page's B, its sandbox's numbers): at speed past `from` u/s the pointer more than
// `behind` off the course brakes (no turn: the nose turns once it has slowed), between `aside` and `behind` it drifts where the drift
// is on (src/drift.js; the brake and the pointer's steer, as Space and a turn key: this gesture alone hands the drift the pointer's
// steer, `driftTurn`), else it pulls as ever. In the air the pointer more than
// `swing` off the nose swings the tail (the brake up there, src/trick.js). A second press within `double` s, held, is the jump; the
// wheel turned up holds it while its turns come within `wheel` s of each other (one jump a gesture, a trackpad's coasting too).
export const ZONES = Object.freeze({ from: 200, aside: 60 * Math.PI / 180, behind: 135 * Math.PI / 180, swing: 25 * Math.PI / 180,
  double: 0.3, wheel: 0.25 });

// The player sets the reach (SX, 2026-10-02: «засунуть в настройки геймплея пункт GAMEPLAY в котором можно регулировать это»):
// ten steps of a tenth, 1.0 to 1.9, under the pause's GAMEPLAY SETTINGS, kept in this browser. The gain and the damping go with
// the reach in proportion, so every step is the same steer only quicker: measured as above, step 1 is the first steer within
// 5 %, the middle step (1.4, the default) 28 % quicker, the last 42 %, each swinging past by under 0.8 degrees.
export const MOUSE_REACH_STEPS = 10;
// A step (1..10) and its reach, in whole tenths so the middle step is STEER.reach exactly.
export const reachOfStep = (n) => (9 + clamp(Math.round(n), 1, MOUSE_REACH_STEPS)) / 10;
export const stepOfReach = (reach) => Math.round(reach * 10) - 9;
const fitReach = (v) => Number.isFinite(v) ? reachOfStep(stepOfReach(v)) : STEER.reach;

export function readMouseReach(store) {
  return fitReach(readGameplay(store).mouseReach);
}
export function writeMouseReach(reach, store) {
  writeGameplay({ mouseReach: fitReach(reach) }, store);
}

// What the right button does (SX, 2026-10-02: «добавь в пункт меню геймлея выбр вторая кнопка мыши это стрельба или тормоз»):
// 'fire' (the nose turned to the pointer, as above) or 'brake' (the dampers, as SPACE, and no turn), kept with the others.
export const MOUSE_RIGHT = Object.freeze(['fire', 'brake']);
const fitRight = (v) => (MOUSE_RIGHT.includes(v) ? v : MOUSE_RIGHT[0]);
export function readMouseRight(store) { return fitRight(readGameplay(store).mouseRight); }
export function writeMouseRight(right, store) { writeGameplay({ mouseRight: fitRight(right) }, store); }

// `grammar`: 'D' for grammar D's mouse (the new layout), else the mouse as it was.
export function createMouseFlight(reach = STEER.reach, right = MOUSE_RIGHT[0], grammar = null) {
  return { x: 0, y: 0, pull: false, fire: false, brake: false, reach: fitReach(reach), right: fitRight(right), grammar,
    jump: false, figure: false, lAt: -Infinity, wheelUntil: -Infinity };
}

// The right button pressed or let go, as the player has it. In grammar D it fires on the ground and plays a figure in the air (no fire
// up there: C0 conflict 8), by where the ship is when it is pressed; `airborne` says so.
export function pressRight(mouse, down, airborne = false) {
  if (mouse.grammar === 'D') {
    mouse.fire = down && !airborne;
    mouse.figure = down && airborne;
    mouse.brake = false;
    return;
  }
  mouse.fire = down && mouse.right === 'fire';
  mouse.brake = down && mouse.right === 'brake';
}
// The left button pressed in open space at `t` (s): grammar D's double press, held, is the jump instead of the pull. Returns 'jump' or
// 'pull'.
export function pressLeft(mouse, t) {
  const double = mouse.grammar === 'D' && t - mouse.lAt <= ZONES.double;
  mouse.lAt = double ? -Infinity : t;
  mouse.jump = double;
  mouse.pull = !double;
  return double ? 'jump' : 'pull';
}
export function releaseLeft(mouse) { mouse.pull = false; mouse.jump = false; }
// The wheel turned up at `t` (s): grammar D holds the jump while the turns keep coming.
export function wheelUp(mouse, t) { if (mouse.grammar === 'D') mouse.wheelUntil = t + ZONES.wheel; }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// The controls the world steps on this frame: the keyboard's, and the mouse's on top while a button is held.
// `r` the renderer, for where the ship is on the screen (World.project).
// The keys' direction on the screen (GAMEPLAY's STEERING SCREEN, src/steering.js: `keys.aim`) is carried as it is, and while one is held
// the keys fly the ship over the pointer, as A or D turn it over the pointer in TANK: the buttons still fire, brake, jump and play a
// figure, and the pointer neither steers nor pulls.
const keysSteer = (keys) => Number.isFinite(keys.aim);
export function mouseControls(mouse, keys, world, r, t = performance.now() / 1000) {
  if (mouse.grammar === 'D') return mouseControlsD(mouse, keys, world, r, t);
  if (!mouse.pull && !mouse.fire && !mouse.brake) return keys;
  const ship = world.ship;
  // The drift reads the keys' turn, never the pointer's steer (src/drift.js driftTurn): the brake with the pointer steering only brakes.
  const out = { thrust: keys.thrust, retro: keys.retro, turn: keys.turn, damp: keys.damp || !!mouse.brake, fire: keys.fire || mouse.fire,
    driftTurn: driftTurn(keys), ...(keys.aim !== undefined ? { aim: keys.aim } : null) };
  if (!ship?.alive || (!mouse.pull && !mouse.fire) || keysSteer(keys)) return out;
  const at = world.project(r, ship.x, ship.y);
  const dx = mouse.x - at.x, dy = mouse.y - at.y;
  if (Math.hypot(dx, dy) < STEER.dead) return out;
  const off = wrapPi(Math.atan2(dy, dx) - ship.angle);
  if (!keys.turn) {
    const rate = ship.params?.().turnRate || 2, reach = mouse.reach ?? STEER.reach, k = reach / STEER.reach;
    out.turn = clamp(k * (STEER.gain * off - STEER.damp * (ship.angVel || 0) / rate), -reach, reach);
  }
  if (mouse.pull && Math.abs(off) < STEER.align) out.thrust = true;
  return out;
}

// Grammar D's mouse (above, ZONES): the keyboard's controls and the mouse's on top, with the jump and the figure the trick reads
// (src/shipStep.js: a press is the step they first are).
function mouseControlsD(mouse, keys, world, r, t) {
  const wheel = t < mouse.wheelUntil;
  if (!mouse.pull && !mouse.fire && !mouse.figure && !mouse.jump && !wheel) return keys;
  const ship = world.ship;
  // The drift reads the keys' turn (src/drift.js driftTurn), so Space with the pointer steering only brakes and the pointer never
  // fights the keys in a drift they began; the pointer aside of the course (below) asks one by its own steer, the mouse alone's.
  const out = { thrust: keys.thrust, retro: keys.retro, turn: keys.turn, damp: keys.damp, fire: keys.fire, driftTurn: driftTurn(keys),
    jump: mouse.jump || wheel, figure: mouse.figure, ...(keys.aim !== undefined ? { aim: keys.aim } : null) };
  if (!ship?.alive) return out;
  const airborne = !!ship.airborne;
  if (mouse.fire && !airborne) out.fire = true;
  if ((!mouse.pull && !(mouse.fire && !airborne)) || keysSteer(keys)) return out;
  const at = world.project(r, ship.x, ship.y);
  const dx = mouse.x - at.x, dy = mouse.y - at.y;
  if (Math.hypot(dx, dy) < STEER.dead) return out;
  const aim = Math.atan2(dy, dx), off = wrapPi(aim - ship.angle);
  const steer = () => {
    if (keys.turn) return;
    const rate = ship.params?.().turnRate || 2, reach = mouse.reach ?? STEER.reach, k = reach / STEER.reach;
    out.turn = clamp(k * (STEER.gain * off - STEER.damp * (ship.angVel || 0) / rate), -reach, reach);
  };
  if (!mouse.pull) { steer(); return out; }
  if (airborne) {
    steer();
    if (Math.abs(off) > ZONES.swing) out.damp = true;
    return out;
  }
  const v = Math.hypot(ship.vx, ship.vy), course = v > 1 ? Math.atan2(ship.vy, ship.vx) : ship.angle;
  const offCourse = Math.abs(wrapPi(aim - course));
  // (Where the flown hull drifts: SCOOTY JR.'s pointer aside only pulls, src/drift.js driftPreset.)
  const drift = driftPreset(world) ? (world.drift ? FLIGHT.drift.keep : FLIGHT.drift.start) : Infinity;
  if (v > ZONES.from && offCourse > ZONES.behind) { out.damp = true; return out; }
  if (offCourse > ZONES.aside && v > Math.max(ZONES.from, drift)) {
    steer(); out.damp = true; out.driftTurn ||= out.turn;
    // The pointer staying aside is what holds a drift under way, as the turn key does (src/drift.js wantsDrift; SX, 2026-10-09): the
    // nose coming round onto the pointer takes the steer to nothing, and that must not read as a key let go. Behind the course
    // (above) or ahead of it (below) there is no side: the drift ends and the brake, or the pull, is the ordinary one.
    if (world.drift && Math.abs(out.driftTurn) < FLIGHT.drift.turning) out.driftTurn = Math.sign(off) || 1;
    return out;
  }
  steer();
  if (Math.abs(off) < STEER.align) out.thrust = true;
  return out;
}
