// The skills' one-time hints (SX, 2026-10-09: «Мы нигде не учим пользователя что можно прыгать, тормозить, дрифтить. И стрелять»; his pick on
// labs/graphics/sketches/teach-hints.html, «берем Т4 by the shift»: T4 BY THE SHIP, nothing at the top). The game says once, by the ship,
// which key does a thing, at the moment the thing is wanted: not a lesson, one line, the key (a cap) and the verb. Each skill is said once in
// the whole game: the pilot's record of it is in the save (`Pilot.taught`), so a new game says it again and a loaded one does not. A hint goes
// the moment the pilot does the thing, or after HINT.life seconds, and never comes back; one stands at a time, and yields, unsaid, to a moment
// earlier in ORDER (a heavy hit ahead does not wait for the steering's words). Its keys are the mode's own (src/controls.js skillWay: the
// table's, or the mouse's words in MOUSE + HOTKEYS); the drawing is labs/graphics/skill-hint.js.
//
// A hint is a line of parts (HINTS): each part a way (its keys), a verb, the skill of the record it says and the deed that answers it. A line
// shows the parts whose skills are not yet said and that this hull and this mode can do; it goes when each part shown has had its deed (a part
// done stands dimmed till then), or at its seconds; every part shown is said by then, whatever the end.
//
// The tutorial, a new pilot's (the opening running, src/opening.js; SX, 2026-10-16: «сразу с момента скутера показать управление wasd, w внизу,
// s наверху a d слева и справа, потом они затухают, когда узер все кнопки нажал и мы показываем space тормоз q e прыжок ... Когда корабль
// забрали показываем shift стрельба, q -> e трюк»; «после того как показали управление самокатом давай покажем V видео шейдеры»; «когда по
// скутеру все показал покажи хоткей для контроля»; «m карта, p карточка пилота, когда первое слово подобрали пишлем рядом с кораблем L
// оставить письмо»):
//
//   MOVE   the first flight in SCOOTY JR. (KEYS + CLICKS): W under the ship, S over it, A and D left and right   each key pressed once
//   RIDE   the first flight's words said: SPACE BRAKE  Q E JUMP                                                the brake held, the take-off
//   VIEW   RIDE said: V SHADERS  ? CONTROLS                                                                    the filter changed, the list opened
//   ARMS   the pilot's own shuttle boarded: SHIFT FIRE  Q → E TRICK                                           a shot, a figure begun
//   NAV    the locator and the map fitted: M MAP  P PILOT CARD                                                 the map, the card opened
//   SIGN   the first word found beyond the starters: L LEAVE A SIGN                                           the composer opened
//
// The lines after the loaner (ARMS, NAV, SIGN) come only in a calm stretch, one at a time with a pause between (SX, 2026-10-16: «чуть
// помедленнее, постепенно в спокойные моменты. Не в моменты боя, да, не в моменты даже доставки ... с какими-то паузами не подряд ... я не
// заметил, когда подсказывают карту, не заметил, когда подсказывают, как карточку пилота открыть»): no fight on (src/audio.js inFight) and no
// pirate within HINT.clear u, no cargo carried or job running, nothing selected, for HINT.pause s with no hint standing. A calm line that
// stands when a fight or a job comes goes unsaid (a part already done is said) and comes again in the next calm stretch.
//
// In MOUSE + HOTKEYS the first flight is the two it was (the keys do not fly there): THRUST, the pointer's words, then STEER. The moments
// any pilot meets, the tutorial's skills among them for a pilot who never had it (a veteran's world, a skipped chapter):
//
//   THRUST the first flight in MOUSE + HOTKEYS: the loaner out of HOME, the opening's first stage           the thrust held
//   STEER  the first flight in MOUSE + HOTKEYS, once the thrust is said: the turn (no reverse there)       the turn
//   BRAKE  a heavy hit ahead is said (IMPACT over the lever, src/hitWarning.js)            the brake held on the ground
//   FIRE   a pirate within the gun's reach, for a hull that has a gun                       the fire key (a hull that fires)
//   DRIFT  a turn held HINT.hold s above FLIGHT.drift.start u/s, for a hull that drifts      a drift begun
//   JUMP   open space at a speed a figure has room at, HINT.hold s, after the first delivery   the take-off
//   TRICK  in the air, once the first delivery is made, where a figure has room             a figure begun, or the landing
//
// A hint whose moment is on when every deed of it is already being done is said and gone at once: never shown, still counted. The opening
// says two of the moments' skills already (src/opening.js: BRAKE TO A STOP and AIM AND FIRE, lines that name no key): while its line for a
// skill stands, that moment's hint waits (openingTeaches), and comes after, to the pilot who has not yet done the thing; the tutorial's lines
// (RIDE, ARMS) name the key beside it and do not wait. Several moments in one frame: the first of ORDER.
//
// Nothing here is read by the world's step: it reads the world and the hands once a frame, writes the pilot's record, and says what stands
// (`h.shown`); `h.changed` is set when the record changed, for the page to save. Reduced motion: no fade, the hint stands and goes.
import { FLIGHT } from './flightConfig.js';
import { CONFIG } from './config.js';
import { SKILL_IDS } from './pilot.js';
import { driftPreset } from './drift.js';
import { trickPreset, hangOf, lateZones, airZones } from './trick.js';
import { openingTeaches, openingStage, loanerOut, STAGES } from './opening.js';
import { WORDS } from './progression.js';
import { skillWay, codesOf, DEFAULT_SCHEME } from './controls.js';
import { hypot2 } from './util.js';
import { inFight } from './audio.js';

const MOUSE_MODE = 'M';
// A part of a line: the skill it says (src/pilot.js SKILL_IDS), its way (src/controls.js skillWay's name), its verb (none in the cross: the
// keys alone), its deed (deedOf's name); `keys` a part said only where the mode has keys for it (the steering's reverse: MOUSE + HOTKEYS has
// none, the pointer behind brakes and turns the nose), `join` the mark between its two caps (the trick from the ground, Q → E).
const part = (skill, way, verb, deed = way, more = null) => Object.freeze({ skill, way, verb, deed, keys: false, join: '', ...more });
const line = (parts, more = null) => Object.freeze({ parts: Object.freeze(parts), cross: false, life: null, ...more });
export const HINTS = Object.freeze({
  // The four round the ship, in the cross's order (labs/graphics/skill-hint.js CROSS): W under, S over, A left, D right. No seconds: it goes
  // when the four have been pressed, or with the first flight.
  move: line([part('thrust', 'thrust', ''), part('steer', 'back', '', 'retro'), part('steer', 'left', ''), part('steer', 'right', '')],
    { cross: true, life: Infinity }),
  thrust: line([part('thrust', 'thrust', 'FORWARD')]),
  steer: line([part('steer', 'steer', 'STEER', 'turn'), part('steer', 'back', 'BACK', 'retro', { keys: true })]),
  ride: line([part('brake', 'brake', 'BRAKE'), part('jump', 'jump', 'JUMP')]),
  view: line([part('display', 'display', 'SHADERS'), part('help', 'help', 'CONTROLS')]),
  arms: line([part('fire', 'fire', 'FIRE'), part('trick', 'combo', 'TRICK', 'figure', { join: '→' })]),
  nav: line([part('map', 'map', 'MAP'), part('card', 'card', 'PILOT CARD')]),
  sign: line([part('sign', 'sign', 'LEAVE A SIGN')]),
  brake: line([part('brake', 'brake', 'BRAKE')]),
  fire: line([part('fire', 'fire', 'FIRE')]),
  drift: line([part('drift', 'drift', 'DRIFT')]),
  jump: line([part('jump', 'jump', 'JUMP')]),
  trick: line([part('trick', 'trick', 'TRICK')]),
});
// `life` s a hint stands unless the deed ends it (SX, 2026-10-09 evening: «подсказки управления должны висеть какое-то время. То есть, типа, секунд
// 45»; his table's 5 s before); `hold` s a turn is held, or the sky is open, before its moment comes (SX's «удержанный секунду выше 300 u/s»);
// `fade` s it comes and goes in (none for reduced motion), and a part done dims in; `done` how much of itself a part done shows while the rest
// of its line stands («затухают, когда узер все кнопки нажал»).
// `pause` s of calm with no hint standing before a calm line comes, `clear` u no pirate is within for the calm (CALM).
export const HINT = Object.freeze({ life: 45, hold: 1, fade: 0.25, done: 0.3, pause: 12, clear: 3000 });
// The lines that wait for a calm stretch: the tutorial's after the loaner.
export const CALM = Object.freeze(['arms', 'nav', 'sign']);
// Which moment wins when two are on in one frame, and which a standing hint yields to: the jump's figure is on while the ship is up, the heavy
// hit ahead is the nearest danger; then the tutorial in its order, the first flight first; the moments of a pilot without it last.
export const ORDER = Object.freeze(['trick', 'brake', 'move', 'thrust', 'steer', 'ride', 'view', 'arms', 'nav', 'sign', 'fire', 'drift', 'jump']);
// The first flight's (SX, 2026-10-09: «первая подсказка по управлению кораблю должна быть, когда ты появляешься в скутере. Тогда уже должна
// быть информация, что W чтобы ехать вперед, как только пользователь поехал вперед, должна быть подсказка типа АД, чтобы рулить, С, чтобы
// назад»): said only in the opening's first stage, the loaner out of HOME; a pilot past it is never told them (a save from before them, a
// veteran's world), and they do not keep the step running for him.
export const FIRST_FLIGHT = Object.freeze(['thrust', 'steer']);
// The tutorial's own skills (src/pilot.js SKILL_IDS): said only to a new pilot, the chapter running (any stage, its rest too: the first word
// may come after it).
export const TUTORIAL = Object.freeze(['display', 'help', 'map', 'card', 'sign']);
const firstFlight = (world) => openingStage(world) === 'loaner';
const newPilot = (world) => openingStage(world) !== null;
// Whether a skill may still be said to this pilot.
function unsaid(world, skill) {
  if (world.pilot.taught.has(skill)) return false;
  if (skill === 'thrust' || skill === 'steer') return firstFlight(world);
  if (TUTORIAL.includes(skill)) return newPilot(world);
  return true;
}

// The page's state: the hint that stands (`shown`: { id, age, out (-1 standing, else s since it began to go), by (the side of the key that
// jumped, for the trick's key), parts (a bit a part shown), done (a bit a part answered), since (s since each part was answered), cells (each
// part's way as the mode says it), scheme }), how long a turn and an open sky have been held, the screen filter last seen (`display`: its
// change is the V's deed), and whether the record changed since the page last saved it.
// `learned` the hint whose deeds have just ended it (not its time, not the ship), for the page's sound (src/audio.js `learned`). `calm` s the
// flight has been calm with no hint standing (CALM's lines wait for HINT.pause of it).
export const createSkillHints = () => ({ shown: null, turning: 0, open: 0, calm: 0, display: null, changed: false, learned: null });

const canFire = (ship) => ship.params().can?.fire !== false;
// A hull's gun reaches what a shot covers in its life (the shot's own speed over CONFIG.bullet.life, from the hull).
const gunReach = (ship) => ship.params().muzzleSpeed * CONFIG.bullet.life;
// The first delivery made: the ledger's `completed` (src/pacing.js reads it as the deliveries).
const delivered = (world) => world.ledger.completed.size > 0;
// The locator and the map fitted: the opening's `freight` and after (src/opening.js; a pilot without the chapter has them from the start).
const FITTED = STAGES.indexOf('freight');
const navFitted = (world) => STAGES.indexOf(openingStage(world)) >= FITTED;
// A word found beyond the starters (src/progression.js WORDS: the starters are known from the first minute), the size the Set has with them.
const STARTERS = WORDS.filter((w) => w.starter).length;
const wordFound = (world) => (world.collection?.words.size ?? 0) > STARTERS;

// Whether a part may be said now: its skill not yet said, this hull able to do it, this mode with a way for it.
function sayable(world, p, scheme) {
  if (!unsaid(world, p.skill) || (p.keys && scheme === MOUSE_MODE)) return false;
  const ship = world.ship;
  switch (p.skill) {
    case 'fire': return canFire(ship);
    case 'drift': return !!driftPreset(world);
    case 'jump': case 'trick': return !!trickPreset(world);
    default: return true;
  }
}
// The parts of a line that may be said now, a bit each; 0 when none.
function sayableParts(world, id, scheme) {
  const parts = HINTS[id].parts;
  let bits = 0;
  for (let i = 0; i < parts.length; i++) if (sayable(world, parts[i], scheme)) bits |= 1 << i;
  return bits;
}

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

// No fight on, no pirate within HINT.clear, no cargo carried and no job running: what a standing calm line needs to stay.
const peaceful = (world) => !inFight(world) && !pirateWithin(world, HINT.clear) && !world.ledger.active && !world.cargo;
// And nothing selected (no station's or ship's window up close): what the calm stretch needs to count.
const calmNow = (world) => !world.selected && peaceful(world);

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

// The moments, by hint: whether it is on now. `a` the frame's hands and warning.
function momentOf(id, h, world, a) {
  const ship = world.ship, mouse = a.scheme === MOUSE_MODE;
  switch (id) {
    case 'move': return firstFlight(world) && !mouse;
    case 'thrust': return firstFlight(world) && mouse;
    case 'steer': return firstFlight(world) && mouse && world.pilot.taught.has('thrust');
    // The first flight's words said, or the first flight past without them.
    case 'ride': return newPilot(world) && (!firstFlight(world) || world.pilot.taught.has('thrust') && world.pilot.taught.has('steer'));
    case 'view': return newPilot(world) && sayableParts(world, 'ride', a.scheme) === 0 && momentOf('ride', h, world, a);
    case 'arms': return newPilot(world) && !loanerOut(world) && h.calm >= HINT.pause;
    case 'nav': return newPilot(world) && navFitted(world) && h.calm >= HINT.pause;
    case 'sign': return newPilot(world) && wordFound(world) && h.calm >= HINT.pause;
    case 'brake': return !!a.warning;
    case 'fire': return canFire(ship) && pirateWithin(world, gunReach(ship));
    case 'drift': return h.turning >= HINT.hold;
    case 'jump': return h.open >= HINT.hold;
    case 'trick': return ship.airborne && delivered(world) && !!world.air && world.air.figs.length === 0 && !!airZones(world)?.trick;
    default: return false;
  }
}
// A flight's key held, as the keyboard has it where the keys fly (the page's `held`: a key of the cross is its key, whatever the steering
// makes of it); else what the world was stepped with.
const keyed = (id) => A.scheme !== MOUSE_MODE && !!A.held?.(id);
// The deeds, by name: whether the pilot is doing the thing now. `screen` the screen open (labs/graphics/screens.js `open`).
function deedOf(deed, world, a) {
  const ship = world.ship, c = a.controls;
  switch (deed) {
    case 'thrust': return !!c?.thrust || keyed('thrust');
    case 'retro': return !!c?.retro || keyed('retro');
    case 'left': return (c?.turn ?? 0) < 0 || keyed('turnLeft');
    case 'right': return (c?.turn ?? 0) > 0 || keyed('turnRight');
    case 'turn': return !!c?.turn;
    case 'brake': return a.braking && !ship.airborne;
    case 'fire': return !!c?.fire && canFire(ship);
    case 'drift': return !!world.drift;
    case 'jump': return ship.airborne;
    case 'figure': return (world.air?.figs.length ?? 0) > 0;
    // The trick's moment is a thing of the air: the figure begun, or the contact (the hint has nothing to say on the ground).
    case 'trick': return !ship.airborne || (world.air?.figs.length ?? 0) > 0;
    case 'display': return a.filtered;
    case 'help': return !!a.screen?.help;
    case 'map': return !!a.screen?.map;
    case 'card': return !!a.screen?.pilot;
    case 'sign': return !!a.screen?.sign;
    default: return false;
  }
}
// The parts of a line its deeds answer this frame, a bit each, among `parts`.
function answered(id, parts, world, a) {
  const list = HINTS[id].parts;
  let bits = 0;
  for (let i = 0; i < list.length; i++) if (parts & (1 << i) && deedOf(list[i].deed, world, a)) bits |= 1 << i;
  return bits;
}

// What the pilot has been doing, counted whether a hint stands or not: a turn above the drift's speed, an open sky at a jump's speed.
function dwell(h, world, a, dt) {
  const ship = world.ship, pilot = world.pilot, speed = hypot2(ship.vx, ship.vy);
  const up = ship.airborne || !ship.alive || world.docked || world.home;
  h.calm = !h.shown && ship.alive && !world.docked && !world.home && calmNow(world) ? h.calm + dt : 0;
  const turning = !up && !pilot.taught.has('drift') && !!driftPreset(world) && speed > FLIGHT.drift.start && Math.abs(a.controls?.turn ?? 0) >= FLIGHT.drift.turning;
  h.turning = turning ? h.turning + dt : 0;
  const P = pilot.taught.has('jump') ? null : trickPreset(world);
  h.open = !up && P && delivered(world) && openSky(world, P, speed) ? h.open + dt : 0;
}

// Nothing left to say: every skill said (or the first flight's past, or no tutorial running) and no hint going out. The page does not call the
// step then (a frame's options object is garbage too).
function allSaid(world) {
  for (let i = 0; i < SKILL_IDS.length; i++) if (unsaid(world, SKILL_IDS[i])) return false;
  return true;
}
export const settled = (h, world) => !h.shown && allSaid(world);
// The first hint of ORDER, before `before` (an index), whose moment is on and that has a part to say, but not the moment of the skill the
// opening's own line is saying (a line of the tutorial is never that); null when none.
function firstOn(h, world, a, before = ORDER.length) {
  const hold = openingTeaches(world);
  for (let i = 0; i < before; i++) {
    const id = ORDER[i];
    if (id !== hold && sayableParts(world, id, a.scheme) && momentOf(id, h, world, a)) return id;
  }
  return null;
}

// The frame's hands, kept (a step's own object each frame would be garbage a frame for the whole game).
const A = { braking: false, controls: null, warning: null, scheme: DEFAULT_SCHEME, screen: null, filtered: false, held: null };
const teach = (h, pilot, skill) => { if (pilot.teach(skill)) h.changed = true; };
// Every skill of the parts shown said (or of those among `bits`: a calm line broken says only what was done).
function teachParts(h, pilot, s, bits = s.parts) {
  const list = HINTS[s.id].parts;
  for (let i = 0; i < list.length; i++) if (bits & (1 << i)) teach(h, pilot, list[i].skill);
}
// The parts' deeds of this frame put on the hint that stands: what is answered stays answered, dimming in.
function answer(s, world, a, dt) {
  const fresh = answered(s.id, s.parts & ~s.done, world, a);
  s.done |= fresh;
  for (let i = 0; i < s.since.length; i++) if (s.done & (1 << i) && !(fresh & (1 << i))) s.since[i] += dt;
}

// One frame. `dt` the frame's seconds; `braking` the brake as the page shows it; `controls` what the world was stepped with ({ turn, fire });
// `warning` the heavy hit ahead (labs/graphics/hit-warning.js `threat`), or null; `scheme` the controls' mode (labs/graphics/schemes.js); `still`:
// reduced motion; `frozen`: a pop-up stands over the flight (nothing runs, nothing is drawn, but a screen opened is a deed: the map, the card,
// the controls list, the sign's composer); `screen` the screens open (labs/graphics/screens.js `open`); `display` the screen filter on now
// (src/display.js mode: a change is V's deed); `held(action)` a flight key held (the page's keyboard), or null. Returns the hint that stands, or
// null: one going out still counts as standing, and is dropped at once if another's moment comes (the jump's, going out, and the trick's coming).
export function stepSkillHints(h, world, { braking = false, controls = null, warning = null, dt = 0, still = false, frozen = false, scheme = DEFAULT_SCHEME,
  screen = null, display = null, held = null } = {}) {
  const pilot = world.pilot;
  if (!pilot) return h.shown;
  A.braking = braking; A.controls = controls; A.warning = warning; A.scheme = scheme; A.screen = screen; A.held = held;
  A.filtered = display !== null && h.display !== null && display !== h.display;
  if (display !== null) h.display = display;
  let s = h.shown;
  if (frozen) { if (s && s.out < 0) answer(s, world, A, 0); return s; }
  const fade = still ? 0 : HINT.fade;
  if (s && s.out >= 0) {
    s.out += dt;
    if (s.out >= fade) h.shown = s = null;
  }
  if (allSaid(world)) { h.turning = h.open = 0; return s; }
  dwell(h, world, A, dt);
  const flying = world.ship.alive && !world.docked && !world.home;
  // The one standing: its deeds, its seconds, a ship no longer flying or a first flight past end it, and it is said by then, whatever the end;
  // a moment earlier in ORDER takes its place, and it is not said: it comes again when its own moment is on.
  if (s && s.out < 0) {
    s.age += dt;
    answer(s, world, A, dt);
    const line = HINTS[s.id], life = line.life ?? HINT.life;
    const deed = flying && s.age < life && s.done === s.parts;
    const ends = !flying || s.age >= life || deed || (line.cross && !firstFlight(world));
    const broken = !ends && CALM.includes(s.id) && !peaceful(world);
    if (!ends && !broken && !firstOn(h, world, A, ORDER.indexOf(s.id))) return s;
    if (ends) teachParts(h, pilot, s);
    else if (broken) teachParts(h, pilot, s, s.done);
    if (deed) h.learned = s.id;
    if (fade > 0) s.out = 0; else h.shown = s = null;
  }
  if (!flying) return s;
  // The next whose moment is on and that has a part not yet said.
  const id = firstOn(h, world, A);
  if (!id) return s;
  const next = { id, age: 0, out: -1, by: id === 'trick' ? world.air?.by ?? 0 : 0, parts: sayableParts(world, id, scheme), done: 0,
    since: HINTS[id].parts.map(() => 0), cells: HINTS[id].parts.map(() => ''), scheme: '' };
  next.done = answered(id, next.parts, world, A);
  if (next.done === next.parts) { teachParts(h, pilot, next); return s; }
  // A pilot in the air has jumped: the jump needs no word of its own after the trick's.
  if (id === 'trick') teach(h, pilot, 'jump');
  return (h.shown = next);
}

// What a hint says in a mode: each part's way (the mode's keys or the mouse's words), made again only when the mode changes.
export function hintWords(s, scheme = DEFAULT_SCHEME) {
  if (s.scheme !== scheme) {
    const list = HINTS[s.id].parts;
    s.scheme = scheme;
    for (let i = 0; i < list.length; i++) s.cells[i] = s.parts & (1 << i) ? skillWay(list[i].way, scheme, s.by) : '';
  }
  return s;
}
// Whether a part of the hint is shown, and whether it is answered.
export const partShown = (s, i) => (s.parts & (1 << i)) !== 0;
export const partDone = (s, i) => (s.done & (1 << i)) !== 0;
// A flight action's keys held on the page's keyboard (`input`, src/input.js: its `down`), for the step's `held`; made once by the page (a plain
// loop: asked every frame the cross stands).
export const heldOn = (input) => (id) => {
  const codes = codesOf(id);
  for (let i = 0; i < codes.length; i++) if (input.down.has(codes[i])) return true;
  return false;
};
