// A body floating round its place (SX's item 17, 2026-10-04: «всем станциям нужно небольшой флотинг сделать ... Влево-вправо,
// чтобы они крутились и чуть-чуть на каком-то радиусе перемещались ... Касается станций. И гаража»; picked on
// labs/graphics/sketches/garage-edits.html, G11: «берем 8 градусов. Скорость помедленнее флоутинга. Ну и не видно, что он по орбите
// двигается»). The stations and the home garage float by it (World.floating, src/stations.js), the game's since SX's word of 2026-10-04
// (a check may hold the old drift: `World.floating` off). The garage floats softer and slower, its own numbers by the same
// function (CONFIG.float.home; SX: «плавание гаража медленнее и 4 процента нужно, его слишком шатает»).
//
// The float (CONFIG.float): a turn of `turn` degrees either way and back over `turnPeriod` s, and an orbit round the place, `orbit`
// u across its radius, once in `orbitPeriod` s, each started at a phase of the body's own (from its id, so a body is where it was on
// either side of a seam and after a reload, by the world's clock). A pose is pure: where, how turned and how fast, at a time.
//
// A frame that turns with the body: a point of the body's own (its berth, its gate, a way in planned at one turn) is turned by how
// far the body has turned since (`turnPoint`), and what the body's turn adds to a velocity there (`spinVelocity`), so a ship held
// to it goes round with it.
import { CONFIG } from './config.js';
import { hashId } from './util.js';

const TAU = Math.PI * 2;

// The float a station takes from the world's (`F`, CONFIG.float, or null when the world does not float): the home garage its own,
// softer one (`F.home`; src/home.js isHome reads the same `kind`), every other station the stations'.
export const floatOf = (station, F = CONFIG.float) => (F && station?.kind === 'home' ? F.home ?? F : F);

// Two phases from an id: the turn's and the orbit's, each in [0, 2π).
export function floatPhases(id) {
  const seed = hashId(String(id));
  return { turn: ((seed >>> 3) & 1023) / 1023 * TAU, orbit: ((seed >>> 17) & 1023) / 1023 * TAU };
}

// The pose at time `t` of a body with `phases`: its offset from its place (dx, dy) and its velocity (vx, vy), u and u/s; its turn
// (angle, rad, 0 at rest) and the turn's rate (spin, rad/s). The orbit is measured from where it stands at its phase, so a body
// at the clock's zero is `orbit` u off its place on a circle round it.
export function floatPose(phases, t, F = CONFIG.float) {
  const A = (F.turn * Math.PI) / 180, wt = TAU / F.turnPeriod, wo = TAU / F.orbitPeriod;
  const a = wt * t + phases.turn, o = wo * t + phases.orbit;
  return {
    dx: F.orbit * Math.cos(o), dy: F.orbit * Math.sin(o),
    vx: -F.orbit * wo * Math.sin(o), vy: F.orbit * wo * Math.cos(o),
    angle: A * Math.sin(a), spin: A * wt * Math.cos(a),
  };
}

// A point (x, y) of a frame turned by `by` rad about its middle.
export function turnPoint(x, y, by) {
  if (!by) return { x, y };
  const c = Math.cos(by), s = Math.sin(by);
  return { x: x * c - y * s, y: x * s + y * c };
}

// What a body's turn at `spin` rad/s adds to the velocity of a point (x, y) off its middle.
export const spinVelocity = (x, y, spin) => (spin ? { x: -spin * y, y: spin * x } : { x: 0, y: 0 });
