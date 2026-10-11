import { CONFIG } from './config.js';
import { clamp, wrapPi } from './util.js';
import { NPC_CURSES, RAGE_LINES, pickGreeting } from './greetings.js';

// A friendly ship the pilot rams curses, and may rage and come after the pilot (SX, 2026-10-08: «И я хочу, чтобы еще когда врезаешься в
// NPC, он выдавал какую-нибудь фразу, ругался на наш корабль, например. А еще NPC может взбеситься от того, что мы в него врезались, и
// преследовать нас и таранить какое-то время, пока мы не взорвемся или не улетим совсем далеко»). The numbers are CONFIG.traffic.
// npcRage; the fleet (src/npcFleet.js Fleet.rammed, Fleet.stepRage, Fleet.calm) keeps the ships' state and says when they begin and
// end, and this file is what does not need a fleet: the chance, the words and the chase's steering, each over plain numbers.
//
// A ship's path is a function of the world's clock (src/npcFleet.js), nothing simulated. An enraged ship leaves it: it is simulated
// (position, velocity, nose) in the fleet's grid units until it calms, and then starts a path of its own from where it stands, going
// the way its nose points (Walker.restart).

export const rageConfig = () => CONFIG.traffic.npcRage;

// The closing speed under which a bump is a graze: where the damage rule begins to cost the hull (CONFIG.hull.touchSpeed), read, so
// the curse and the rage follow the rule whatever its numbers are.
export const grazeSpeed = () => CONFIG.hull.touchSpeed;

// The chance a blow closing at `closing` u/s enrages the ship: `from` at the least blow that is not a graze, `to` at `full` or more,
// straight between.
export function rageChance(closing) {
  const { chance } = rageConfig(), min = grazeSpeed();
  return clamp(chance.from + (chance.to - chance.from) * (closing - min) / (chance.full - min), chance.from, chance.to);
}

// A ship's pace when enraged: `mul` times its own, between `floor` and `cap`, and never over `share` of the pilot's top speed (the
// pilot's ship out-runs it whatever it flies).
export function rageTop(own, pilotTop = Infinity) {
  const C = rageConfig().chase;
  return Math.min(clamp(own * C.mul, C.floor, C.cap), pilotTop * C.share);
}

// What a ship says: a curse from its own list or the common one, a line as it turns, rams, calms; never the line said last from that
// pool (`said`, a Map the fleet keeps), drawn from the stream `rng`.
export function lineFrom(pool, craft, said, rng) {
  const lines = pool === 'curse' ? (craft?.curses ?? NPC_CURSES) : RAGE_LINES[pool];
  const line = pickGreeting(lines, said.get(pool), rng);
  said.set(pool, line);
  return line;
}

// A new rage at (x, y) going (vx, vy), its nose along `angle`, begun at `t` and lasting CONFIG.traffic.npcRage.chase.time s of the
// world's clock. `spin`: the turn a blow gave it, dying away; `docked`: how long the pilot has been docked; `told`: whether it has
// said its line as it turned; `said`: when it last spoke; `rams`: how many times it has hit the pilot.
export const startRage = (x, y, vx, vy, angle, t) => ({ x, y, vx, vy, angle, spin: 0, since: t, until: t + rageConfig().chase.time,
  docked: 0, told: false, said: -Infinity, rams: 0 });

// The direction (dx, dy), a unit vector, turned round the blocks ahead of a ship at (x, y): [cx, cy, r] each, a station's keep-out,
// a planet's cushion, a hole's disc. A block within `range` u of its edge that the way leads into is gone round, on the side the
// way already leans to, and a little out; the nearer, the more.
function around(x, y, dx, dy, blocks, range) {
  let ax = 0, ay = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], ox = x - b[0], oy = y - b[1], d = Math.hypot(ox, oy), edge = d - b[2];
    if (edge > range || d < 1e-6) continue;
    const nx = ox / d, ny = oy / d, inward = -(dx * nx + dy * ny);
    if (inward <= 0 && edge > 0) continue;
    let tx = -ny, ty = nx;
    if (tx * dx + ty * dy < 0) { tx = -tx; ty = -ty; }
    const w = 2 * clamp(1 - edge / range, 0, 1) * Math.max(inward, 0.3);
    ax += (tx + nx * 0.5) * w;
    ay += (ty + ny * 0.5) * w;
  }
  if (!ax && !ay) return [dx, dy];
  const mx = dx + ax, my = dy + ay, m = Math.hypot(mx, my) || 1;
  return [mx / m, my / m];
}

// One step `dt` of a raging ship `g` (startRage) after the pilot's ship: it aims where the ship will be in `lead` s of its way,
// swings its nose toward that at `turn` rad/s, pushes along its nose, and loses `grip` a second of what goes sideways of it, so it
// goes through a pass and comes round again; held to `top` u/s and outside every block (and inside the box `lo`..`hi`), sliding
// along a block's edge when the pilot is inside it. (`aim`: { x, y, vx, vy }, the pilot's place and velocity in the same units.)
export function chase(g, aim, top, blocks, lo, hi, dt) {
  const C = rageConfig().chase;
  const sp = Math.hypot(g.vx, g.vy), gap = Math.hypot(aim.x - g.x, aim.y - g.y);
  const lead = Math.min(C.lead, gap / Math.max(sp, 100));
  let dx = aim.x + aim.vx * lead - g.x, dy = aim.y + aim.vy * lead - g.y;
  const len = Math.hypot(dx, dy);
  if (len > 1e-6) { dx /= len; dy /= len; } else { dx = Math.cos(g.angle); dy = Math.sin(g.angle); }
  [dx, dy] = around(g.x, g.y, dx, dy, blocks, C.range);
  const err = wrapPi(Math.atan2(dy, dx) - g.angle);
  g.angle += clamp(err, -C.turn * dt, C.turn * dt) + g.spin * dt;
  g.spin *= Math.exp(-CONFIG.traffic.npcSolid.knock.turnBack * dt);
  // The push is full while the nose is within about 70 degrees of the way, a third when it is turned away.
  const push = (Math.abs(err) < 1.2 ? 1 : 0.35) * C.accel * dt, hx = Math.cos(g.angle), hy = Math.sin(g.angle);
  g.vx += hx * push; g.vy += hy * push;
  const along = g.vx * hx + g.vy * hy, keep = Math.exp(-C.grip * dt);
  g.vx = along * hx + (g.vx - along * hx) * keep;
  g.vy = along * hy + (g.vy - along * hy) * keep;
  const now = Math.hypot(g.vx, g.vy);
  if (now > top) { const k = Math.max(top / now, 1 - 3 * dt); g.vx *= k; g.vy *= k; }
  g.x += g.vx * dt; g.y += g.vy * dt;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], ox = g.x - b[0], oy = g.y - b[1], wall = b[2] + C.margin;
    if (ox * ox + oy * oy >= wall * wall) continue;
    const d = Math.hypot(ox, oy) || 1, nx = ox / d, ny = oy / d, into = g.vx * nx + g.vy * ny;
    g.x = b[0] + nx * wall; g.y = b[1] + ny * wall;
    if (into < 0) { g.vx -= into * nx; g.vy -= into * ny; }
  }
  g.x = clamp(g.x, lo[0], hi[0]); g.y = clamp(g.y, lo[1], hi[1]);
}
