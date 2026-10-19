import { CONFIG } from './config.js';
import { clamp, wrapPi } from './util.js';
import { around } from './npcRage.js';

// The friendly NPC ships flown as ships (SX, 2026-10-19, N1 FLIGHT on reports/2026-10-19-npc-rewrite-brief.md: «давай так как
// предлагаешь»; В3 «да»: they give way and go round, never through each other). Until now a ship's place was a function of the world's
// clock along its path (src/npcFleet.js Walker): no speed of its own, the same pace through a corner, through the pilot and through one
// another, a blow an offset that sprang back to where the clock said. Flown, a ship is a body (place, velocity, nose, turn): it follows the
// same path (the walk still lays it, legs, journeys and all) by aiming at a point ahead on it, swings its nose at `turn` rad/s, pushes
// along it and loses `grip` a second of what goes sideways, slows before a corner by how sharp the corner is and pulls out of it, gives
// way to the pilot's ship and to the others by what it sees coming, and is held apart from every other ship. A blow is its velocity, with
// the grip let go a moment (`skid`), so it slides and turns and finds its way back by itself. The numbers are CONFIG.traffic.flight; the
// fleet (src/npcFleet.js Fleet.stepFlight) keeps the bodies, and this file is what does not need a fleet, over plain numbers, as
// src/npcRage.js is for a raging ship. Its mode is CONFIG.traffic.flight.mode, the lab's `?npcFlight=new` (labs/graphics/game.js).
//
// A body: { x, y, vx, vy, angle, spin, rate, bank, skid } in the fleet's grid units; `rate` the nose's own turn a second (a blow's spin
// apart), `bank` how far it leans into the turn (-1 left .. 1 right, drawn by src/traffic.js drawCraft), `skid` the seconds of a blow's
// slide left.

export const flightConfig = () => CONFIG.traffic.flight;

// A body where a pose stands, going along its nose at `pace`.
export const bodyOf = (pose, pace) => ({ x: pose.x, y: pose.y, vx: Math.cos(pose.angle) * pace, vy: Math.sin(pose.angle) * pace,
  angle: pose.angle, spin: 0, rate: 0, bank: 0, skid: 0 });

// How fast a ship whose cruise is `cruise` may go at distance `s` of a path of `pieces` (src/npcFleet.js Walker: straight runs and
// rounded corners, `via` the corner's point), for the corners within `corner.ahead` u: in a corner turning by `theta` it goes at
// `1 - slow * theta / pi` of its cruise (never under `floor`), and no faster than its nose turns at `turn` rad/s round the corner's mean
// radius (`radius` of it); before a corner it is held to what it can brake from, at `brake` of its cruise a second, over the way left.
export function cornerPace(pieces, from, s, cruise) {
  const F = flightConfig(), C = F.corner, brake = Math.max(1, cruise * F.brake);
  let want = cruise;
  for (let k = from; k < pieces.length; k++) {
    const p = pieces[k];
    if (p.s0 > s + C.ahead) break;
    if (!p.via || p.s1 <= s) continue;
    const ax = p.via[0] - p.from[0], ay = p.via[1] - p.from[1], bx = p.to[0] - p.via[0], by = p.to[1] - p.via[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-6 || lb < 1e-6) continue;
    const theta = Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1));
    if (theta < 0.05) continue;
    const round = F.turn * C.radius * (p.s1 - p.s0) / theta;
    const v = Math.max(F.minPace, Math.min(cruise * Math.max(C.floor, 1 - C.slow * theta / Math.PI), round));
    const gap = Math.max(0, p.s0 - s);
    want = Math.min(want, Math.sqrt(v * v + 2 * brake * gap));
  }
  return want;
}

// Each of `ships` given way for what it sees coming within `giveWay.horizon` s (a velocity obstacle): its wanted velocity (`wx`, `wy`, set by
// the fleet from its path) is turned, when it would carry it into the disc round another ship (their reaches and `gap` u) or round the
// pilot's ship (its reach, the hull's and `pilotGap`) before the horizon, to that disc's edge (and `margin` rad past it), on the side it
// already leans to, or to its own right when the other is dead on (so two ships head on pass on their left sides), its pace against the
// other kept. The one that has the other on its right gives way: it slows too, by up to `slow` of its pace the nearer the meeting; every
// ship gives way to the pilot's ship. Already inside the disc, it goes straight out of it. A side once taken is kept while the meeting
// lasts and `keep` s after (`sides`, on the ship, by what it meets): a ship off its path aims back across the line to the other and would
// take the other side at every step, zig-zagging into it. `ships`: [{ x, y, vx, vy, reach, angle, fixed, wx, wy }] (`fixed`: a raging
// ship, seen, steering for itself); `pilot`: { x, y, vx, vy, radius } or null; `now` the world's clock. `wx`, `wy` are changed in place.
export function giveWay(ships, pilot, now = 0) {
  const G = flightConfig().giveWay, H = G.horizon;
  for (let i = 0; i < ships.length; i++) {
    const a = ships[i];
    if (a.fixed) continue;
    const pace = Math.hypot(a.wx, a.wy);
    let wx = a.wx, wy = a.wy, slow = 1;
    const sides = (a.sides ??= new Map());
    for (const [key, held] of sides) if (now - held.at > G.keep) sides.delete(key);
    const dodge = (key, ox, oy, ovx, ovy, r, yields) => {
      const rx = ox - a.x, ry = oy - a.y, dist = Math.hypot(rx, ry);
      if (dist > G.see) return;
      if (dist <= r) {
        const m = Math.hypot(wx, wy) || pace || 1, nx = -rx / (dist || 1), ny = -ry / (dist || 1);
        let dx = wx / m + nx * 2, dy = wy / m + ny * 2;
        const n = Math.hypot(dx, dy) || 1;
        wx = (dx / n) * m; wy = (dy / n) * m;
        if (yields) slow = Math.min(slow, 1 - G.slow);
        return;
      }
      const ux = wx - ovx, uy = wy - ovy, u = Math.hypot(ux, uy);
      if (u < 1e-6 || u * H < dist - r) return;
      const axis = Math.atan2(ry, rx), half = Math.asin(r / dist), off = wrapPi(Math.atan2(uy, ux) - axis);
      if (Math.abs(off) >= half + G.margin) return;
      const held = sides.get(key), side = held?.side ?? (Math.abs(off) < 0.02 ? 1 : Math.sign(off)), edge = axis + side * (half + G.margin);
      if (held) held.at = now; else sides.set(key, { side, at: now });
      wx = Math.cos(edge) * u + ovx; wy = Math.sin(edge) * u + ovy;
      if (yields) slow = Math.min(slow, 1 - G.slow * clamp(1 - (dist - r) / (u * H), 0, 1));
    };
    for (let j = 0; j < ships.length; j++) {
      if (j === i) continue;
      const b = ships[j];
      // Which has the other on its right (screen units, y down: the right of the nose is clockwise from it).
      dodge(b, b.x, b.y, b.vx, b.vy, a.reach + b.reach + G.gap, Math.cos(a.angle) * (b.y - a.y) - Math.sin(a.angle) * (b.x - a.x) > 0);
    }
    if (pilot) dodge(pilot, pilot.x, pilot.y, pilot.vx, pilot.vy, a.reach + pilot.radius + G.pilotGap, true);
    const m = Math.hypot(wx, wy), top = pace * slow;
    if (m > top && m > 1e-6) { wx *= top / m; wy *= top / m; }
    a.wx = wx; a.wy = wy;
  }
  return ships;
}

// One step `dt` of body `b` toward the way (dx, dy) (a unit vector, the push to give way added) at `want` u/s: its nose swings toward
// the way at `turn` rad/s (a blow's `spin` on top, dying away), it pushes along its nose at `accel` of `cruise` a second while it is under
// the pace and brakes at `brake` of it while it is over, and loses `grip` a second of what goes sideways (a twentieth of it, `skid.grip`,
// while a blow's slide lasts). Held outside every block (`blocks`, [x, y, r]: a station's keep-out, a planet's cushion, a hole's disc;
// steered round within `range` u) and inside the box `lo`..`hi`.
export function steerBody(b, dx, dy, want, cruise, blocks, lo, hi, dt) {
  const F = flightConfig();
  [dx, dy] = around(b.x, b.y, dx, dy, blocks, F.range);
  const err = wrapPi(Math.atan2(dy, dx) - b.angle), turn = clamp(err, -F.turn * dt, F.turn * dt);
  b.angle += turn + b.spin * dt;
  b.spin *= Math.exp(-CONFIG.traffic.npcSolid.knock.turnBack * dt);
  b.rate = turn / dt;
  b.bank += (clamp(b.rate / F.bank.at, -1, 1) - b.bank) * Math.min(1, F.bank.ease * dt);
  const hx = Math.cos(b.angle), hy = Math.sin(b.angle);
  let along = b.vx * hx + b.vy * hy;
  if (along < want) {
    const push = Math.min(cruise * F.accel * dt, want - along) * (Math.abs(err) < 1.2 ? 1 : 0.35);
    b.vx += hx * push; b.vy += hy * push;
  } else {
    const off = Math.min(Math.max(1, cruise * F.brake) * dt, along - want);
    b.vx -= hx * off; b.vy -= hy * off;
  }
  along = b.vx * hx + b.vy * hy;
  const keep = Math.exp(-F.grip * (b.skid > 0 ? F.skid.grip : 1) * dt);
  b.vx = along * hx + (b.vx - along * hx) * keep;
  b.vy = along * hy + (b.vy - along * hy) * keep;
  // Never over its cruise but in a blow's slide (a sideways drift adds to the pace along its nose).
  const pace = Math.hypot(b.vx, b.vy);
  if (b.skid <= 0 && pace > cruise) { b.vx *= cruise / pace; b.vy *= cruise / pace; }
  b.skid = Math.max(0, b.skid - dt);
  b.x += b.vx * dt; b.y += b.vy * dt;
  for (let i = 0; i < blocks.length; i++) {
    const k = blocks[i], ox = b.x - k[0], oy = b.y - k[1];
    if (ox * ox + oy * oy >= k[2] * k[2]) continue;
    const d = Math.hypot(ox, oy) || 1, nx = ox / d, ny = oy / d, into = b.vx * nx + b.vy * ny;
    b.x = k[0] + nx * k[2]; b.y = k[1] + ny * k[2];
    if (into < 0) { b.vx -= into * nx; b.vy -= into * ny; }
  }
  b.x = clamp(b.x, lo[0], hi[0]); b.y = clamp(b.y, lo[1], hi[1]);
}

// Holds every two of `ships` apart ([{ x, y, vx, vy, reach, fixed }], each its body or a raging ship's state, moved in place): two closer
// than their reaches are put apart along the line between them, half each (all of it on the one that is not `fixed`), and what each had
// of going into the other is taken off. The last word under giveWay: nothing goes through anything.
export function holdApart(ships) {
  for (let i = 0; i < ships.length; i++) {
    const a = ships[i];
    for (let j = i + 1; j < ships.length; j++) {
      const b = ships[j], dx = b.x - a.x, dy = b.y - a.y, need = a.reach + b.reach, d2 = dx * dx + dy * dy;
      if (d2 >= need * need || (a.fixed && b.fixed)) continue;
      const d = Math.sqrt(d2), nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0, over = need - d;
      const sa = a.fixed ? 0 : b.fixed ? 1 : 0.5, sb = 1 - sa;
      a.x -= nx * over * sa; a.y -= ny * over * sa; b.x += nx * over * sb; b.y += ny * over * sb;
      const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (closing < 0) { a.vx += nx * closing * sa; a.vy += ny * closing * sa; b.vx -= nx * closing * sb; b.vy -= ny * closing * sb; }
    }
  }
}
