// The pause's little space (SX, 2026-10-02: «Но кораблик влетает в окно (в окне нет затемнения, и толкает табличку пауза на
// фоне космоса просто они от стен отскакивают просто дрейфуют», «окошко сделай 200х200 внутри»): a square of space in the
// pause's window (labs/graphics/pause-menu.js drawPauseWindow), never dimmed. Then (SX, the same night: «не должно быть твоего
// корабля в квадратике. Он туда должен прилететь, как будто подорваться от центра экрана туда ... когда нажимаем паузу, он как
// будто из центра экрана в сторону квадратика дергается, и врезается в надпись пауза»): the window is opaque, the world's ship
// is under it; the toy's ship starts where that one stood on the screen, turned as it was, the PAUSED plate assembling in the
// middle (or off the ship if it stands too near). From 2026-10-03 to 2026-10-06 the window came down with its square over the ship,
// and the ship kept still till it had landed (`wake`); since SX's «пауза – это тоже поп-ап» the window stands in the middle and the
// ship dives in from where it stood (`enter`), as on the first night; let go, it turns in place to the world
// ship's heading (homePauseToy) as the window flies up, and the camera carries the world under it (ship-kick.js carryKick).
// The square's inside is space under the window, not on it (SX: «корабль не должен как бы на карточке ехать понимаешь он же
// слой ниже»): were the window to move (stepPauseToy's `frame`; it stays where it lands since SX's last word), the ship, the
// plate and the stars would keep their place on the screen and its walls would sweep into them.
//
// Then (SX, 2026-10-03: «КОРАБЛЬ в меню паузы имеет неправильный вес и ускорение, он должен вести себя осознаннее как пират и
// приставать к кнопке пауза, а сперва резаться в края типо пытаясь вылететь»): the ship flies as a ship, and is piloted. It
// pushes only along its nose (the engine's spool the drawing's, labs/graphics/ship-motion.js), turns at the game's rate and
// pull (src/chassis.js STANDARD), keeps its way with a little drag, and it is the heavier of the two. And at last (SX, the
// same day: «Он слишком бесится ... Растерянное, изучающееся. Плавное ... иногда будет злиться ... как рандом энкаунтер»): calm,
// puzzled and finding out, slow and smooth, it looks about, noses up to the walls, goes round the plate and leans on it,
// thinking between (TOY.calm, `doings`, `opening`); now and then a fit (`anger`), when it bolts at the walls and rams the
// plate as a pirate on a ship would (src/pirates.js), looking at the plate only now and then (`react`), and then sighs.
//
// Two bodies on the square's own plane (px, y down): the plate a box that turns, sliding and settling (`plateDrag`), the
// ship a disc with a heading. The ship and the plate meet with `bounce` of their closing speed, the plate taking a spin from
// where it was struck (`spin`, at most `maxSpin`). Nothing here is the world's: the world is paused under the window.
import { drawPausePlate, pausePlateRect } from './notice.js';
import { drawPilotShip, flownShipInks, STAR_ROLES } from './world-art.js';
import { createShipMotion, stepShipMotion } from './ship-motion.js';
import { mulberry32, wrapPi } from '../../src/util.js';
import { ROLES } from '../../src/roles.js';

export const TOY = Object.freeze({
  size: 200,           // px, the square unless it is handed its own (`createPauseToy` size: the game's is the pause's right cell)
  wake: 0.55,          // s the ship hangs where it stood while the window lands over it (0.32 s), and a beat, before it wants out
  // The craft, px and s: the game's turn (3.4 rad/s, reached at 16 a second; src/chassis.js STANDARD), its push scaled to a
  // room of 200 px; `tau` how hard it chases the velocity it wants (src/pirates.js `velocityTau`).
  thrust: 520, retro: 260, strafe: 60, turnRate: 3.4, turnAccel: 16, turnGain: 6, drag: 0.5, maxSpeed: 220, tau: 0.2,
  massShip: 1.5, massPlate: 1.2, // the ship the heavier: it shoves the plate and follows through
  bounce: 0.3,         // the ship and the plate meeting
  spin: 0.7, maxSpin: 1.6, spinFade: 0.7,
  plateDrag: 1,        // a second: a rammed plate slides some 60-90 px and settles
  plateWall: 0.6,      // what the plate keeps of its speed off a wall
  // A wall: the ship keeps `wall` of its speed into it; a blow over `crash` px/s knocks its nose aside (`knock` rad/s for
  // each 100 px/s) and, while it wants out, leaves it dazed for `daze` s.
  wall: 0.35, crash: 35, knock: 3, daze: 0.3,
  // The window feels the blow (SX, 2026-10-03: «само окошко должно потрясываться тоже от ... ударов кораблика в стены. Но
  // чуть-чуть ... чтобы его вес ощущался. Типа он толкается, но все равно как бы бесполезно»): it is pushed the way the ship
  // struck at `kick` of the blow's speed and springs back (`omega` rad/s, `damping` of critical): some 2-3 px for a hard blow.
  // SX, then: «тряска в целом прикольная я бы чуть сильнее сделал» (0.8 until then, 2.5 px), and at last «пусть только на
  // корабль реагирует чуть-чуть флоутит ... в пределах 8 пикселей» (26 rad/s, a shake): a slow float, `most` px at most,
  // from any touch over `least` px/s.
  jolt: { kick: 0.63, omega: 7, damping: 0.55, most: 8, least: 10 },
  // Its mind (SX, 2026-10-03: «Он слишком бесится ... Давай он иногда будет злиться ... как рандом энкаунтер. Но в целом он
  // ведет себя так, как будто обдумывает ... Что произошло? Тыкается в стены. В разные крутится. Думает, пытается толкать ...
  // Растерянное, изучающееся. Плавное»). Calm, it flies at `calm.cruise` px/s at most, its push and turn held to `calm.thrust`
  // and `calm.turn` rad/s (turning by `calm.gain`), and does one thing after another, never the same twice running:
  //   look     turns to another way (or, `eye`, to the plate) and holds still a moment (`look` s);
  //   poke     noses up to a wall and touches it, gently (`calm.touch` px/s at the wall), then drifts back thinking;
  //   push     comes up to the plate and leans on it (`calm.push` px/s) for `pushTime` s, then thinks;
  //   inspect  goes slowly round the plate (`calm.inspect` px/s), its nose on it, for `inspectTime` s;
  //   think    lets go and drifts (`think` s).
  // First, waking, it wonders what happened (`opening`). Now and then (`anger.chance` of a choice, not within `anger.rest` s of
  // the last), a fit: for `anger.time` s it bolts at the walls (`bolt` px/s, dazed by its blows) and rams the plate (`ram`
  // px/s), as it did all the time until then, then sighs and thinks.
  calm: { cruise: 75, thrust: 240, turn: 2, gain: 3, touch: 26, push: 34, inspect: 46 },
  doings: { look: 3, poke: 3, push: 3, inspect: 2 },
  opening: ['look', 'poke', 'look', 'poke', 'eye', 'push'],
  look: [0.7, 1.6], think: [0.5, 1.0], pushTime: [1.2, 2.4], inspectTime: [2.2, 3.4],
  anger: { chance: 0.07, time: [3, 5], rest: 25 },
  bolt: 200, ram: 150, breakSpeed: 120, breakTime: [0.45, 0.7], swerve: 0.7, react: 0.28, standoff: 30,
  stars: 26,           // in a square of `size`; a larger square has as many more as its area
  // The plate blinks when the ship touches it (SX, 2026-10-14: «пусть она моргает немного когда корабль его касается, типо становится на
  // 15% темнее на момент»): `dark` darker at once, held `hold` s, back over `fade` s; a touch counts anew after `apart` s off the plate.
  blink: { dark: 0.15, hold: 0.06, fade: 0.14, apart: 0.15 },
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const between = (rng, [a, b]) => a + (b - a) * rng();

// `x`, `y`: where the world's ship stood on the screen, in the square's px (outside the square, it dives in; inside, it waits for
// `wake`), `angle` its heading; without them the ship starts just off a random side. `wake`: when it wants out. `size`: the
// square's side, px (labs/graphics/pause-menu.js measures the game's; the ship, the plate and their speeds stay as they are).
export function createPauseToy({ x = null, y = null, angle = null, seed = Date.now(), wake = TOY.wake, size = TOY.size } = {}) {
  const rng = mulberry32(seed >>> 0), S = size, c = S / 2;
  const stars = Array.from({ length: Math.round(TOY.stars * (S / TOY.size) ** 2) }, () => ({
    x: rng() * S, y: rng() * S, ch: rng() < 0.85 ? (rng() < 0.6 ? '.' : '·') : '+', layer: (rng() * 3) | 0,
  }));
  let sx = x, sy = y;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
    const side = (rng() * 4) | 0, along = S * (0.3 + rng() * 0.4), out = 40;
    [sx, sy] = [[-out, along], [S + out, along], [along, -out], [along, S + out]][side];
  }
  // The plate in the middle, or `room` off the ship toward the middle (straight down from it if it stands on the middle).
  let px = c, py = c;
  const dx = c - sx, dy = c - sy, d = Math.hypot(dx, dy), room = 72;
  if (d < room) {
    const ux = d > 1 ? dx / d : 0, uy = d > 1 ? dy / d : 1;
    px = Math.max(60, Math.min(S - 60, sx + ux * room));
    py = Math.max(24, Math.min(S - 24, sy + uy * room));
  }
  const ship = { x: sx, y: sy, vx: 0, vy: 0, a: Number.isFinite(angle) ? angle : Math.atan2(py - sy, px - sx), spin: 0, r: 20,
    inside: false, thrusting: false, retroing: false };
  ship.inside = depthOf(ship, S) > ship.r;
  return {
    t: 0, rng, stars, wake, size: S, blinkAt: -Infinity, touchedAt: -Infinity,
    mode: ship.inside ? 'wait' : 'enter', modeT: 0, until: 0,
    goal: null, wall: null, aim: 0, swerve: 1, heading: 0, orbit: 1, last: null, plan: [...TOY.opening],
    fitUntil: -1, lastFit: -Infinity, fits: 0, sighed: true, raging: false, touched: false, pressing: false,
    seen: null, seenAge: 0, lookIn: 0,
    struck: false, crashes: 0, rams: 0, pokes: 0, pushes: 0, hit: 0, blows: [], jolt: { x: 0, y: 0, vx: 0, vy: 0 },
    frame: null, drift: { x: 0, y: 0 }, walls: { vx: 0, vy: 0 },
    plate: { x: px, y: py, vx: 0, vy: 0, a: 0, va: 0, w: 0, h: 0 },
    ship,
    motion: createShipMotion(seed & 0xffff),
  };
}

const depthOf = (s, S) => Math.min(s.x, s.y, S - s.x, S - s.y);

// The plate's half extents along x and y as it is turned.
const extents = (p) => ({
  x: Math.abs(p.w / 2 * Math.cos(p.a)) + Math.abs(p.h / 2 * Math.sin(p.a)),
  y: Math.abs(p.w / 2 * Math.sin(p.a)) + Math.abs(p.h / 2 * Math.cos(p.a)),
});
// The plate's nearest point to (x, y), and how far that is (0 inside it).
function nearestOnPlate(p, x, y, w = p.w || 102, h = p.h || 28) {
  const c = Math.cos(p.a), sn = Math.sin(p.a), dx = x - p.x, dy = y - p.y;
  const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
  const qx = clamp(lx, -w / 2, w / 2), qy = clamp(ly, -h / 2, h / 2);
  const cx = p.x + qx * c - qy * sn, cy = p.y + qx * sn + qy * c;
  return { x: cx, y: cy, d: Math.hypot(x - cx, y - cy) };
}

// Where the ship's middle stands touching `wall`, `f` of the way along it.
function wallPoint(wall, f, r, S) {
  const along = r + f * (S - 2 * r);
  return { left: { x: r, y: along }, right: { x: S - r, y: along }, top: { x: along, y: r }, bottom: { x: along, y: S - r } }[wall];
}

// The next wall it bolts at: the one its nose is on at first, then any other, with room to gather speed across to it
// (`run` px, not along a wall it lies on); through the plate only if nothing else is clear.
function pickWall(toy, same = false) {
  const s = toy.ship, rng = toy.rng;
  if (same) {
    toy.goalF = clamp(toy.goalF + (rng() < 0.5 ? -1 : 1) * (0.12 + 0.12 * rng()), 0.1, 0.9);
    toy.goal = wallPoint(toy.wall, toy.goalF, s.r, toy.size);
    return;
  }
  // A way is blocked where it comes nearer the plate than the ship's disc allows, and nearer than the ship stands now.
  const near = Math.min(s.r + 2, nearestOnPlate(toy.plate, s.x, s.y).d - 1);
  let best = null;
  for (const wall of ['left', 'right', 'top', 'bottom']) {
    if (wall === toy.wall) continue;
    for (const f of [0.2, 0.5, 0.8]) {
      const g = wallPoint(wall, f, s.r, toy.size), d = Math.hypot(g.x - s.x, g.y - s.y);
      const run = wall === 'left' || wall === 'right' ? Math.abs(g.x - s.x) : Math.abs(g.y - s.y);
      let blocked = false;
      for (let i = 1; i <= 10 && !blocked; i++) {
        const k = i / 10;
        blocked = nearestOnPlate(toy.plate, s.x + (g.x - s.x) * k, s.y + (g.y - s.y) * k).d < near;
      }
      const turn = Math.abs(wrapPi(Math.atan2(g.y - s.y, g.x - s.x) - s.a));
      const score = turn * 0.8 + (blocked ? 4 : 0) + (run < 40 ? 6 : 0) + (d < 60 ? 1 : 0) + 0.6 * rng();
      if (!best || score < best.score) best = { wall, f, g, score };
    }
  }
  toy.wall = best.wall; toy.goalF = best.f; toy.goal = best.g;
}

function setMode(toy, mode) {
  const rng = toy.rng;
  toy.mode = mode; toy.modeT = 0; toy.touched = false; toy.pressing = false;
  if (mode === 'look') toy.until = between(rng, TOY.look);
  if (mode === 'think') toy.until = between(rng, TOY.think);
  if (mode === 'push') toy.until = between(rng, TOY.pushTime);
  if (mode === 'inspect') { toy.until = between(rng, TOY.inspectTime); toy.orbit = rng() < 0.5 ? -1 : 1; }
  if (mode === 'break') { toy.until = between(rng, TOY.breakTime); toy.swerve = rng() < 0.5 ? -1 : 1; }
  if (mode === 'ram') toy.aim = [-0.32, 0, 0, 0.32][(rng() * 4) | 0];
}

// Where it thinks the plate is: what it saw at its last look, carried on.
function sensed(toy, dt) {
  const p = toy.plate;
  toy.lookIn -= dt; toy.seenAge += dt;
  if (!toy.seen || toy.lookIn <= 0) {
    toy.seen = { x: p.x, y: p.y, vx: p.vx - toy.walls.vx, vy: p.vy - toy.walls.vy };
    toy.seenAge = 0;
    toy.lookIn = TOY.react * (0.67 + 0.66 * toy.rng());
  }
  return { x: toy.seen.x + toy.seen.vx * toy.seenAge, y: toy.seen.y + toy.seen.vy * toy.seenAge };
}

const inFit = (toy) => toy.t < toy.fitUntil;

// What it does next: in a fit, a wall or the plate, hard; out of one, a sigh; else the opening's next, or now and then a fit,
// or one of its doings by their weights, not the last again.
function next(toy) {
  const rng = toy.rng, A = TOY.anger;
  if (inFit(toy)) { if (rng() < 0.5) { pickWall(toy); setMode(toy, 'turn'); } else setMode(toy, 'ram'); return; }
  if (!toy.sighed) { toy.sighed = true; toy.raging = false; setMode(toy, 'think'); return; }
  const planned = toy.plan.shift();
  if (planned) { begin(toy, planned); return; }
  if (toy.t - toy.lastFit > A.rest && rng() < A.chance) {
    toy.fitUntil = toy.t + between(rng, A.time); toy.lastFit = toy.t; toy.fits++; toy.sighed = false; toy.raging = true;
    next(toy);
    return;
  }
  const names = Object.keys(TOY.doings).filter((n) => n !== toy.last), total = names.reduce((a, n) => a + TOY.doings[n], 0);
  let u = rng() * total;
  for (const n of names) { u -= TOY.doings[n]; if (u < 0) { begin(toy, n); return; } }
  begin(toy, names[names.length - 1]);
}
function begin(toy, name) {
  const s = toy.ship, rng = toy.rng;
  toy.last = name === 'eye' ? 'look' : name;
  if (name === 'look') { toy.heading = s.a + (rng() < 0.5 ? -1 : 1) * (1 + rng() * 1.6); setMode(toy, 'look'); return; }
  if (name === 'eye') { toy.heading = null; setMode(toy, 'look'); return; }
  if (name === 'poke') { pickWall(toy); setMode(toy, 'poke'); return; }
  setMode(toy, name);
}

// The pilot: the velocity it wants (`vx`, `vy`) and the heading (`want`), or nothing (`free`) while it is dazed, drifting or
// diving in; `calm` holds it to its calm pace and turn.
function pilot(toy, dt) {
  const s = toy.ship, p = toy.plate, S = toy.size, r = s.r, C = TOY.calm;
  const toward = (x, y, speed) => { const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy) || 1; return { vx: dx / d * speed, vy: dy / d * speed }; };
  // The nose on where it is going: across the velocity it lacks while that is large, else on `x`, `y`.
  const steer = (v, x, y) => {
    const ex = v.vx - s.vx, ey = v.vy - s.vy;
    return { ...v, want: Math.hypot(ex, ey) > 30 ? Math.atan2(ey, ex) : Math.atan2(y - s.y, x - s.x) };
  };
  const calm = (o) => ({ ...o, calm: true });
  toy.modeT += dt;
  switch (toy.mode) {
    case 'enter':
      if (s.inside) next(toy);
      return { free: true };
    case 'wait':
      // Not yet awake to the square: a wall sweeping into it shoves it, and it drifts.
      if (toy.t >= toy.wake) next(toy);
      return { free: true };
    case 'look': {
      // Still, turning slowly to another way (or to the plate), and a moment there.
      const at = sensed(toy, dt), want = toy.heading ?? Math.atan2(at.y - s.y, at.x - s.x);
      if (toy.modeT >= toy.until && Math.abs(wrapPi(want - s.a)) < 0.25) next(toy);
      return calm({ vx: 0, vy: 0, want });
    }
    case 'think':
      if (toy.modeT >= toy.until) next(toy);
      return { free: true };
    case 'poke': {
      // Up to the wall, slowing to a touch; once touched, it drifts back thinking.
      if (toy.touched || toy.modeT > 5) { toy.pokes += toy.touched ? 1 : 0; setMode(toy, 'think'); return { free: true }; }
      const g = toy.goal, run = toy.wall === 'left' || toy.wall === 'right' ? Math.abs(g.x - s.x) : Math.abs(g.y - s.y);
      return calm(steer(toward(g.x, g.y, Math.min(C.cruise, 1.1 * run + C.touch)), g.x, g.y));
    }
    case 'push': {
      // Up to the plate's near side, then leaning on it as it gives.
      const at = sensed(toy, dt), q = nearestOnPlate(p, s.x, s.y), gap = Math.max(0, q.d - r);
      if (toy.pressing && toy.modeT >= toy.until) { toy.pushes++; setMode(toy, 'think'); return { free: true }; }
      if (!toy.pressing && toy.modeT > 6) { setMode(toy, 'think'); return { free: true }; }
      if (toy.hit !== false && gap < 2 && !toy.pressing) { toy.pressing = true; toy.modeT = 0; }
      const v = toward(at.x, at.y, toy.pressing ? C.push : Math.min(C.cruise, 1.1 * gap + C.push));
      return calm({ vx: v.vx + (toy.pressing ? p.vx : 0), vy: v.vy + (toy.pressing ? p.vy : 0), want: Math.atan2(at.y - s.y, at.x - s.x) });
    }
    case 'inspect': {
      // Round the plate at a standoff, slowly, its nose on it.
      const at = sensed(toy, dt);
      let dx = s.x - at.x, dy = s.y - at.y;
      const d = Math.hypot(dx, dy) || 1, reach = Math.hypot(p.w || 102, p.h || 28) / 2 + r + 6;
      dx /= d; dy /= d;
      const tx = clamp(at.x + dx * reach - dy * toy.orbit * 30, r + 6, S - r - 6), ty = clamp(at.y + dy * reach + dx * toy.orbit * 30, r + 6, S - r - 6);
      if (toy.modeT >= toy.until) next(toy);
      const v = toward(tx, ty, Math.min(C.inspect, 1.5 * Math.hypot(tx - s.x, ty - s.y)));
      return calm({ ...v, want: Math.atan2(at.y - s.y, at.x - s.x) });
    }
    // A fit (TOY.anger): at a wall, hard.
    case 'turn': {
      const want = Math.atan2(toy.goal.y - s.y, toy.goal.x - s.x);
      if (Math.abs(wrapPi(want - s.a)) < 0.22 || toy.modeT > 1.2) setMode(toy, 'bolt');
      return { vx: 0, vy: 0, want };
    }
    case 'bolt':
      if (toy.modeT > 2) next(toy);
      return steer(toward(toy.goal.x, toy.goal.y, TOY.bolt), toy.goal.x, toy.goal.y);
    case 'daze':
      if (toy.modeT >= TOY.daze) next(toy);
      return { free: true };
    // ... and at the plate, a ram and away.
    case 'ram': {
      const at = sensed(toy, dt), off = toy.aim * (p.w || 102);
      const ax = at.x + Math.cos(p.a) * off, ay = at.y + Math.sin(p.a) * off;
      if (toy.hit > 20 || toy.modeT > 1.5) setMode(toy, 'break');
      return steer(toward(ax, ay, TOY.ram), ax, ay);
    }
    case 'break': {
      const at = sensed(toy, dt), away = Math.atan2(s.y - at.y, s.x - at.x) + toy.swerve * TOY.swerve;
      const v = { vx: Math.cos(away) * TOY.breakSpeed, vy: Math.sin(away) * TOY.breakSpeed };
      const ahead = { x: s.x + s.vx * 0.25, y: s.y + s.vy * 0.25 };
      if (toy.modeT >= toy.until || Math.min(ahead.x, ahead.y, S - ahead.x, S - ahead.y) < r + 4) next(toy);
      return { ...v, want: away };
    }
  }
  return { free: true };
}

// The pause let go (SX: «кораблик, как бы, успокаивается, мы начинаем на нем лететь»): the ship gives up what it was doing and
// glides back over `time` s to `to` ({ x, y, a }), where the world's ship stands under the window, its engine out. `to` null:
// the pause kept after all, and it takes up where it was (the walls still, or the plate).
export function homePauseToy(toy, to, time = 0.3) {
  const s = toy.ship;
  if (!to) { setMode(toy, 'think'); return; }
  toy.home = { from: { x: s.x, y: s.y, a: s.a }, to, t0: toy.t, time: Math.max(0.01, time) };
  setMode(toy, 'home');
}

// One frame of `dt` s. `still`: reduced motion, the ship parked under the plate and nothing moving. `frame`: the window's
// place on the screen ({ x, y }, unshaken, pause-menu.js `at`): what it moved since the last frame moves the square's walls
// over the space inside, not the space.
export function stepPauseToy(toy, dt, { still = false, frame = null } = {}) {
  const S = toy.size, p = toy.plate, s = toy.ship;
  if (still) {
    Object.assign(p, { x: S / 2, y: S * 0.42, vx: 0, vy: 0, a: 0, va: 0 });
    Object.assign(s, { x: S / 2, y: S * 0.72, vx: 0, vy: 0, a: -Math.PI / 2, inside: true });
    return toy;
  }
  dt = Math.min(Math.max(dt, 0), 0.05);
  if (!(dt > 0)) return toy;
  toy.t += dt;
  // The window moved: what is inside stays where it was on the screen, so in the square's own px it moves back; the walls
  // move at the window's speed.
  toy.walls.vx = toy.walls.vy = 0;
  if (frame) {
    if (toy.frame) {
      const dx = frame.x - toy.frame.x, dy = frame.y - toy.frame.y;
      for (const b of [p, s]) { b.x -= dx; b.y -= dy; }
      toy.drift.x -= dx; toy.drift.y -= dy;
      toy.walls.vx = dx / dt; toy.walls.vy = dy / dt;
    }
    toy.frame = { x: frame.x, y: frame.y };
  }
  // The window's give, sprung back (semi-implicit, stable at these steps).
  const J = toy.jolt, { omega: w, damping: z } = TOY.jolt;
  J.vx += (-w * w * J.x - 2 * z * w * J.vx) * dt; J.vy += (-w * w * J.y - 2 * z * w * J.vy) * dt;
  J.x += J.vx * dt; J.y += J.vy * dt;
  // Never further than `most` px off its place: what goes past is stopped there.
  const off = Math.hypot(J.x, J.y);
  if (off > TOY.jolt.most) {
    const ux = J.x / off, uy = J.y / off, out = J.vx * ux + J.vy * uy;
    J.x = ux * TOY.jolt.most; J.y = uy * TOY.jolt.most;
    if (out > 0) { J.vx -= ux * out; J.vy -= uy * out; }
  }
  if (toy.mode === 'home') {
    const H = toy.home, u = Math.min(1, (toy.t - H.t0) / H.time), k = u * u * (3 - 2 * u);
    Object.assign(s, { x: H.from.x + (H.to.x - H.from.x) * k, y: H.from.y + (H.to.y - H.from.y) * k,
      a: wrapPi(H.from.a + wrapPi(H.to.a - H.from.a) * k), vx: 0, vy: 0, spin: 0, thrusting: false, retroing: false });
    stepShipMotion(toy.motion, { thrust: false, retro: false, turn: 0, brake: false, speed: 0 }, dt);
    const kp = Math.exp(-TOY.plateDrag * dt);
    p.vx *= kp; p.vy *= kp; p.x += p.vx * dt; p.y += p.vy * dt; p.a = wrapPi(p.a + p.va * dt);
    return toy;
  }
  if (toy.mode === 'enter' && !toy.dived) {
    // The dive from where the world's ship stood: a jerk at the nearest place well inside, slowing as it goes.
    const m = s.r + 30, gx = clamp(s.x, m, S - m), gy = clamp(s.y, m, S - m), d = Math.hypot(gx - s.x, gy - s.y) || 1;
    const v = Math.max(300, (d + 20) * 3.5);
    s.vx = (gx - s.x) / d * v; s.vy = (gy - s.y) / d * v; s.a = Math.atan2(s.vy, s.vx); toy.dived = true;
  }
  const order = pilot(toy, dt);
  toy.hit = false;
  // The craft: the nose turns toward `want`, the push only along it (forward as the engine spools) and a little across.
  let along = 0, across = 0;
  if (order.free) {
    if (toy.mode === 'enter') { const k = Math.exp(-3.5 * dt); s.vx *= k; s.vy *= k; }
    s.spin *= Math.exp(-2.5 * dt);
  } else {
    const ax = (order.vx - s.vx) / TOY.tau, ay = (order.vy - s.vy) / TOY.tau, C = TOY.calm;
    const rate = order.calm ? C.turn : TOY.turnRate, gain = order.calm ? C.gain : TOY.turnGain;
    const turn = clamp(gain * wrapPi(order.want - s.a), -rate, rate);
    s.spin += (turn - s.spin) * clamp(TOY.turnAccel * dt, 0, 1);
    const fx = Math.cos(s.a), fy = Math.sin(s.a);
    along = clamp(ax * fx + ay * fy, -TOY.retro, order.calm ? C.thrust : TOY.thrust);
    across = clamp(-ax * fy + ay * fx, -TOY.strafe, TOY.strafe);
  }
  s.a = wrapPi(s.a + s.spin * dt);
  s.thrusting = along > 40; s.retroing = along < -40;
  stepShipMotion(toy.motion, { thrust: s.thrusting, retro: s.retroing, turn: order.free ? 0 : clamp(s.spin / TOY.turnRate, -1, 1),
    brake: false, speed: Math.hypot(s.vx, s.vy) * 10 }, dt);
  if (along > 0) along = Math.min(along, TOY.thrust * toy.motion.spool);
  const fx = Math.cos(s.a), fy = Math.sin(s.a);
  s.vx += (fx * along - fy * across) * dt;
  s.vy += (fy * along + fx * across) * dt;
  if (toy.mode !== 'enter') {
    const k = Math.max(0, 1 - TOY.drag * dt), v = Math.hypot(s.vx, s.vy) * k;
    s.vx *= k; s.vy *= k;
    if (v > TOY.maxSpeed) { s.vx *= TOY.maxSpeed / v; s.vy *= TOY.maxSpeed / v; }
  }
  // The plate slides and settles.
  const kp = Math.exp(-TOY.plateDrag * dt);
  p.vx *= kp; p.vy *= kp;
  for (const b of [p, s]) { b.x += b.vx * dt; b.y += b.vy * dt; }
  p.a = wrapPi(p.a + p.va * dt);
  p.va *= Math.exp(-TOY.spinFade * dt);
  if (!s.inside && depthOf(s, S) > s.r) s.inside = true;
  const blow = collide(p, s);
  if (blow !== false) {
    if (toy.t - toy.touchedAt > TOY.blink.apart) toy.blinkAt = toy.t;
    toy.touchedAt = toy.t;
  }
  if (blow !== false) { toy.struck = true; toy.hit = blow; if (blow > 20 && toy.mode === 'ram') toy.rams++; }
  // The walls, moving at the window's speed: the plate by its turned box, the ship by its disc once it is in.
  const e = extents(p), W = TOY.plateWall, wx = toy.walls.vx, wy = toy.walls.vy;
  if (p.x < e.x) { p.x = e.x; if (p.vx < wx) p.vx = wx + (wx - p.vx) * W; }
  if (p.x > S - e.x) { p.x = S - e.x; if (p.vx > wx) p.vx = wx - (p.vx - wx) * W; }
  if (p.y < e.y) { p.y = e.y; if (p.vy < wy) p.vy = wy + (wy - p.vy) * W; }
  if (p.y > S - e.y) { p.y = S - e.y; if (p.vy > wy) p.vy = wy - (p.vy - wy) * W; }
  if (s.inside) {
    if (s.x < s.r) { s.x = s.r; wall(toy, 1, 0); }
    if (s.x > S - s.r) { s.x = S - s.r; wall(toy, -1, 0); }
    if (s.y < s.r) { s.y = s.r; wall(toy, 0, 1); }
    if (s.y > S - s.r) { s.y = S - s.r; wall(toy, 0, -1); }
  }
  return toy;
}

// The ship against a wall whose inward normal is `nx`, `ny`: it keeps `wall` of its speed into it; a real blow scrapes its
// way along, knocks its nose aside (the way it already leant off square) and, if it was bolting at a wall, dazes it.
function wall(toy, nx, ny) {
  const s = toy.ship, into = -((s.vx - toy.walls.vx) * nx + (s.vy - toy.walls.vy) * ny);
  if (into <= 0) return;
  s.vx += nx * into * (1 + TOY.wall); s.vy += ny * into * (1 + TOY.wall);
  if (toy.mode === 'poke') toy.touched = true;
  // The window floats off the way it was struck, a little for a touch, more for a blow (TOY.jolt).
  if (into > TOY.jolt.least) { toy.jolt.vx -= nx * into * TOY.jolt.kick; toy.jolt.vy -= ny * into * TOY.jolt.kick; }
  if (into < TOY.crash) return;
  toy.blows.push({ t: toy.t, into, fit: toy.raging });
  if (toy.blows.length > 200) toy.blows.shift();
  const tx = -ny, ty = nx, slide = s.vx * tx + s.vy * ty;
  s.vx -= tx * slide * 0.2; s.vy -= ty * slide * 0.2;
  const off = wrapPi(s.a - Math.atan2(-ny, -nx));
  const side = Math.abs(off) > 0.02 ? Math.sign(off) : (toy.rng() < 0.5 ? -1 : 1);
  s.spin += side * TOY.knock * into / 100;
  if (toy.mode === 'bolt') { toy.crashes++; setMode(toy, 'daze'); }
}

// The ship's disc against the plate's turned box: pushed apart, an impulse along the normal, and a spin for the plate from
// where it was struck. Returns the closing speed of a blow (0 for a touch), or false.
function collide(p, s) {
  if (!p.w) return false;
  const q = nearestOnPlate(p, s.x, s.y);
  let nx = s.x - q.x, ny = s.y - q.y, d = q.d;
  if (d >= s.r) return false;
  if (d < 1e-6) { nx = s.x - p.x; ny = s.y - p.y; d = Math.hypot(nx, ny) || 1; }
  nx /= d; ny /= d;
  const mS = TOY.massShip, mP = TOY.massPlate;
  // Apart, each by its share.
  const push = s.r - Math.min(d, s.r);
  s.x += nx * push * mP / (mS + mP); s.y += ny * push * mP / (mS + mP);
  p.x -= nx * push * mS / (mS + mP); p.y -= ny * push * mS / (mS + mP);
  const closing = (s.vx - p.vx) * nx + (s.vy - p.vy) * ny;
  if (closing >= 0) return 0;
  const j = -(1 + TOY.bounce) * closing / (1 / mS + 1 / mP);
  s.vx += (j / mS) * nx; s.vy += (j / mS) * ny;
  p.vx -= (j / mP) * nx; p.vy -= (j / mP) * ny;
  // The blow off the plate's middle turns it: the arm across the push.
  const arm = (q.x - p.x) * ny - (q.y - p.y) * nx;
  const inertia = mP * (p.w * p.w + p.h * p.h) / 12;
  p.va = clamp(p.va + TOY.spin * (arm * j) / inertia, -TOY.maxSpin, TOY.maxSpin);
  return -closing;
}

// The renderer drawing glyphs at once instead of queueing them: the frame's queue still holds the world (flush() never
// empties it, begin() does), so a flush here would draw the world again over the window.
function immediate(r) {
  const now = Object.create(r);
  now.glyph = (ch, x, y, color, alpha = 1, size = 1) => r.glyphNow(ch, x, y, color, alpha, size);
  now.glyphRot = (ch, x, y, angle, color, alpha = 1, size = 1) => {
    if (ch === ' ' || alpha <= 0.02) return;
    const ctx = r.ctx;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); r.glyphNow(ch, 0, 0, color, alpha, size); ctx.restore();
  };
  now.flush = () => {};
  return now;
}

// The square at `box` ({ x, y, w, h } on the screen): its stars, the plate (assembling on `age`, s since the pause began) and
// the ship, drawn inside it only. `world` for the pilot's ship and paint. `ship`: 'clip' the ship inside the square with the
// rest, 'none' the rest without it, 'free' the ship alone and anywhere (while the window comes down over it or flies off).
// `frac`: the px the window stands off `box` (pause-menu.js), so the inside moves smoothly. The stars keep their place on
// the screen as the window drifts, wrapping round the square. Returns the plate's box on the screen, for its click.
export function drawPauseToy(r0, toy, box0, { world, age = 1e6, reducedMotion = false, ship: mode = 'clip', frac = null } = {}) {
  const r = immediate(r0), ctx = r.ctx, p = toy.plate, S = toy.size;
  if (!p.w) { const g = pausePlateRect(r, 0, 0); p.w = g.w; p.h = g.h; }
  const box = { ...box0, x: box0.x + (frac?.x ?? 0), y: box0.y + (frac?.y ?? 0) };
  const px = box.x + p.x, py = box.y + p.y;
  if (mode === 'free') drawShip(r, toy, box, world, reducedMotion);
  else {
    ctx.save();
    ctx.beginPath(); ctx.rect(box0.x, box0.y, box0.w, box0.h); ctx.clip();
    const wrap = (v) => ((v % S) + S) % S;
    for (const st of toy.stars) r.glyphNow(st.ch, box.x + wrap(st.x + toy.drift.x), box.y + wrap(st.y + toy.drift.y), STAR_ROLES[st.layer], 0.9);
    // The plate turned round its middle.
    ctx.save();
    ctx.translate(px, py); ctx.rotate(p.a); ctx.translate(-px, -py);
    const top = Math.round(py - p.h / 2), held = drawPausePlate(r, px, top, { age, instant: reducedMotion });
    // Its blink, a touch of the ship's (TOY.blink): black over it, the plate the darker by that share.
    const B = TOY.blink, since = toy.t - toy.blinkAt, dark = since < B.hold ? 1 : clamp(1 - (since - B.hold) / B.fade, 0, 1);
    if (held && dark > 0) r.fill(held.x, held.y, held.w, held.h, ROLES.backing, B.dark * dark);
    ctx.restore();
    if (mode === 'clip') drawShip(r, toy, box, world, reducedMotion);
    ctx.restore();
  }
  const e = extents(p);
  return { x: px - e.x, y: py - e.y, w: 2 * e.x, h: 2 * e.y };
}

// The pilot's ship, as the game draws it, turned to its drift and lit while it jerks; its disc measured from its drawing once. At the
// camera's zoom (src/zoom.js), as the world's ship it stands in for is drawn.
function drawShip(r, toy, box, world, reducedMotion) {
  const ship = world?.ship, s = toy.ship, z = r.zoom ?? 1;
  if (!ship) return;
  if (!s.measured) {
    const m = ship.metrics || { w: r.cellW * ship.model.scale, h: r.cellH * ship.model.scale };
    const cells = (ship.model.frames && ship.model.frames[ship.model.idleFrame]) || ship.model.cells || [];
    s.r = Math.max(10, 0.8 * z * Math.max(...cells.map((c) => Math.hypot(c.x * m.w, c.y * m.h))));
    s.measured = true;
  }
  const proxy = Object.create(ship, {
    angle: { value: s.a, writable: true }, invuln: { value: 0 }, thrusting: { value: false }, retroing: { value: false },
  });
  const inks = flownShipInks(world), x = box.x + s.x, y = box.y + s.y, ctx = r.ctx;
  if (z !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(z, z); ctx.translate(-x, -y); }
  try { drawPilotShip(r, proxy, x, y, toy.motion, inks.ink, inks.paint, { reducedMotion }); } finally { if (z !== 1) ctx.restore(); }
}
