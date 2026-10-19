import { CONFIG } from './config.js';
import { SECTORS, SECTOR_SIZE, sectorById, stationDefById } from './sectors.js';
import { NPC_ROUTES, NPC_SHIPS, RARE_SHIPS, npcShip, npcCraftDef, npcHome, resolveRoute } from './npcShips.js';
import { KEEP_OUT } from './keepOut.js';
import { makeCraft } from './traffic.js';
import { shipContact, counterweight, noteRecent, newRecent } from './pacing.js';
import { OWN, npcPalette, paintKeysFor, paintWeights, paintNote } from './npcPaint.js';
import { openSectorIds } from './frontier.js';
import { rageConfig, rageChance, rageTop, grazeSpeed, lineFrom, startRage, chase } from './npcRage.js';
import { flightConfig, bodyOf, cornerPace, giveWay, steerBody, holdApart } from './npcFlight.js';
import { GROUND } from './groundConfig.js';
import { hailFor, sayAtPilot, TALK_LINES } from './npcTalk.js';
import { clamp } from './util.js';

// The friendly NPC ships of the grid, going where they like (SX, 2026-10-02: «нпс корабли должны иметь разные рандомные пути и
// не летать кругами, у них должен быть спектр гораздо шире радиус полета, и я думаю нам надо их по умному перемешивать в
// космосе»). They flew a lane between two near places and back, or a circle round one: a few hundred to three thousand units, the
// same every time (src/npcShips.js NPC_ROUTES, which now say only where each begins and how fast it goes). Now each is a walker
// over the whole grid, sector after sector, seam or no seam: a run of long straight legs between places drawn at random, each
// corner rounded so it turns as a ship turns, never into a planet's cushion, a station's menu, a black hole or the grid's edge,
// at the ship's own pace. A leg is `minLeg` to `maxLeg` units; at 60 to 230 u/s a ship crosses a sector in half a minute to two.
// Which sector a ship is in is where it is: it is drawn there, from the sector the pilot is in or from a neighbour.
// The open sectors only (SX, 2026-10-04, his answer 5 to chat SC: «the 13 NPC ships kept inside the open sectors», so a world twice as
// wide does not thin them out): a corner is drawn among the free places of the sectors the frontier has open (src/frontier.js), and a
// ship found in a closed one out of the pilot's sight is sent out again at a free place of an open one past `zone` (Fleet.keepOpen).
//
// Smart mixing (src/pacing.js: the memory of the last 20 minutes). The paths know nothing of the pilot; who flies them does. Of the
// ships out of the pilot's sight but in its part of the grid, one the pilot has met a lot lately is now and then exchanged for one
// far off that it has met little (`mix`): the two become each other's ship from here on, each going on down the path it was on, at
// the other's pace. Nothing is placed or removed where it could be seen, and the draw is by the counterweights, a lean and not
// a rota: what was met a lot goes out of the pilot's part of the grid, what was not comes into it. A ship is met when it comes within
// `sight` u of the pilot, once for a pass (it is met again after it has been `rearm` u off).
//
// A path is by distance and laid ahead of the ship (`ahead` u), and where the ship is on it is read from its clock (`travelled`), so
// drawing costs a search and a few multiplications; a swap changes the pace from that moment, not the path. In memory only; a
// reload starts the ships where the routes put them.
//
// Paints (SX, 2026-10-02: «По системе весов перекрашивай корабли нпс в разные цвета, ну примерно в наших палитрах»). Each ship wears
// one of the pilot's paints as src/npcPaint.js tames it for that ship, or its own scheme as SX picked it. A ship is repainted when it
// comes into the pilot's part of the grid (within `zone`, out of sight past `hide`; and when a swap makes it another ship there), and
// every ship is when the pilot jumps (a hole, a wreck's return, out of O-08; the first look of a world too). The paint is drawn by
// the counterweights (`drawPaint`): never one worn by another ship in the pilot's part of the grid or by a quest's ship (so two in
// sight never wear the same), not the one it wore before, and among the rest leaning away from colours the pilot met lately
// (src/npcPaint.js paintWeights). In memory only, like the rest of the fleet: a reload paints afresh.
//
// Rage (SX, 2026-10-08: «когда врезаешься в NPC, он выдавал какую-нибудь фразу ... NPC может взбеситься ... и преследовать нас и
// таранить какое-то время, пока мы не взорвемся или не улетим совсем далеко»). A ship the pilot rams (Fleet.rammed, called by
// src/contact.js) swears, and sometimes turns on the pilot: it leaves its path, which is a function of the clock and cannot be left
// otherwise, for a state simulated step by step (`Walker.rage`: place, velocity, nose; src/npcRage.js chase), goes at the pilot's ship
// and rams it through the same contact() as any blow, until the time is up, the pilot is far or docked or wrecked or out of the grid;
// then it starts a path afresh from where it stands, going the way its nose points (Walker.restart), and is a roaming ship again.
// In memory only, like the rest: a reload calms every ship. Its chance and its words come from the stream `rage`, so the paths' own
// stream ('npc') is not moved by a ram.
//
// Flown (SX, 2026-10-19, N1 FLIGHT: CONFIG.traffic.flight.mode 'step', the lab's `?npcFlight=new`; src/npcFlight.js). The path is laid as
// before, but no clock reads it: each ship is a body that follows it (Walker.body, `s` how far along it is), slowing into its corners,
// giving way to the pilot and to the others, held apart from them, knocked by a blow as a body is (Fleet.stepFlight). A swap, a ship sent
// out of a closed sector or born again keep working as they did: a new walker is boarded at its first step. The mode 'path' is the clock.
//
// Persons (SX, 2026-10-19, N3 PERSONS: «давай знакомых», and «давай в эту сторону» to keeping them in the save; CONFIG.traffic.persons).
// Each ship is itself for good: it is never exchanged for another (no mixing), it wears one paint, drawn once and never two ships alike
// (Fleet.fixPaints), it has a home (src/npcShips.js npcHome) whose sector must be open for it to be out (a new pilot meets the few of the
// first sectors, each sector restored brings its own: Fleet.keepHomes), its journeys go home and out to the stations of its sector and the
// ones next to it and home again (Walker.choose), a ship broken comes back at home, and it remembers the pilot: how often met, helped,
// rammed, and a grudge after a ram (`people`, by code). Where each ship out is and what it remembers are in the save (Fleet.toJSON,
// Fleet.restore; save v27). With `persons` off the fleet is as it was: the mixing, the paints drawn anew, the open sectors only.

const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
const TAU = 2 * Math.PI;
const unevenOf = (code) => npcShip(code)?.uneven ?? null;
const GRID = SECTORS.filter((s) => !s.hidden);
const GRID_W = (Math.max(...GRID.map((s) => s.col)) + 1) * W, GRID_H = (Math.max(...GRID.map((s) => s.row)) + 1) * H;
const K = () => CONFIG.traffic.walk;

// ------------------------------------------------------------------------------------------------------ the grid

// Everything a path keeps clear of, in grid units: [x, y, radius], a path its `air` more. A station's keep-out (src/keepOut.js KEEP_OUT,
// 1,001.6 u: the reach its window keeps and a margin; SX, 2026-10-07, «давай npc ... не будут сильно близко к станциям подлетать»),
// less the air, so a path keeps the keep-out itself (until then NPC_CLEAR, 700, and the air: 780, a little past the window's 731.6); a
// planet's orbit and a little more, a hole's disc and more, as the routes' own check held them (checks/npc-traffic.mjs); and the free
// places, on a lattice. (A route's lane still stops NPC_CLEAR short of a station: it says only where a ship begins, at the free place
// nearest it, and its pace.)
let blocks = null, spots = null;
function grid() {
  if (blocks) return { blocks, spots };
  blocks = [];
  for (const s of GRID) {
    for (const t of s.stations ?? []) blocks.push([s.col * W + t.x * W, s.row * H + t.y * H, KEEP_OUT - K().air]);
    for (const p of s.planets ?? []) blocks.push([s.col * W + p.x * W, s.row * H + p.y * H, p.radius + CONFIG.planet.orbit.height + K().planetAir]);
    for (const h of s.holes ?? []) blocks.push([s.col * W + h.x * W, s.row * H + h.y * H, (h.disc ?? 250) + K().holeAir]);
  }
  // A free place: clear of every block by `air` more, inside the grid's edge.
  spots = [];
  for (let x = K().edge; x <= GRID_W - K().edge; x += K().spotStep) {
    for (let y = K().edge; y <= GRID_H - K().edge; y += K().spotStep) {
      if (blocks.every(([bx, by, br]) => Math.hypot(bx - x, by - y) > br + 2 * K().air)) spots.push([x, y]);
    }
  }
  // The sector each free place stands in.
  spotSector = spots.map(([x, y]) => sectorAt(x, y)?.id ?? null);
  return { blocks, spots };
}
let spotSector = null;

// Approach zones make through-traffic read as journeys between places. They
// are free route nodes outside the station/menu clearance, never docking slots.
let gates = null;
function routeGates() {
  if (gates) return gates;
  const free = grid().spots;
  gates = [];
  for (const s of GRID) for (const st of s.stations ?? []) {
    const x = s.col * W + st.x * W, y = s.row * H + st.y * H;
    const points = free.filter((p, i) => spotSector[i] === s.id && Math.hypot(p[0] - x, p[1] - y) < GROUND.traffic.gateRadius);
    if (points.length) gates.push({ station: st.id, sector: s.id, points });
  }
  return gates;
}

// How many other places a place can run to (a leg of the length a leg has, clear of everything), counted once: a corner is only
// made at a place with `hub` of them, so a ship is never left in a pocket of the grid with nowhere to go.
let degrees = null;
function degreeOf(i) {
  degrees ??= new Int16Array(grid().spots.length).fill(-1);
  if (degrees[i] >= 0) return degrees[i];
  const free = grid().spots, p = free[i];
  let n = 0;
  for (let j = 0; j < free.length; j++) {
    const len = Math.hypot(free[j][0] - p[0], free[j][1] - p[1]);
    if (len >= K().minLeg && len <= K().maxLeg && segmentClear(p[0], p[1], free[j][0], free[j][1])) n++;
  }
  return (degrees[i] = n);
}

// Whether the segment (ax, ay)-(bx, by) keeps `air` clear of every block.
function segmentClear(ax, ay, bx, by, air = K().air) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  for (const [cx, cy, r] of grid().blocks) {
    const u = len2 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2)) : 0;
    if (Math.hypot(ax + dx * u - cx, ay + dy * u - cy) < r + air) return false;
  }
  return true;
}
const bezier = (b, v, c, u) => ({
  x: (1 - u) * (1 - u) * b[0] + 2 * (1 - u) * u * v[0] + u * u * c[0], y: (1 - u) * (1 - u) * b[1] + 2 * (1 - u) * u * v[1] + u * u * c[1],
});
// A rounded corner's path: from `b` to `c`, the corner `v` its control point, looked at in eight steps.
function curveClear(b, v, c) {
  for (let k = 1; k < 8; k++) {
    const p = bezier(b, v, c, k / 8);
    for (const [cx, cy, r] of grid().blocks) if (Math.hypot(p.x - cx, p.y - cy) < r + K().air) return false;
  }
  return true;
}
// A curve's length, and the length reached at each eighth of its parameter (so a ship goes round it at its pace, not faster
// where the curve is straighter).
function curveTable(b, v, c) {
  const table = [0];
  let x = b[0], y = b[1];
  for (let k = 1; k <= 8; k++) { const p = bezier(b, v, c, k / 8); table.push(table[k - 1] + Math.hypot(p.x - x, p.y - y)); x = p.x; y = p.y; }
  return table;
}
// The parameter of the point `l` of the way along a curve whose lengths are `table`.
function curveParam(table, l) {
  const at = Math.max(0, Math.min(table[8], l));
  let k = 0;
  while (k < 7 && table[k + 1] < at) k++;
  return (k + (table[k + 1] > table[k] ? (at - table[k]) / (table[k + 1] - table[k]) : 0)) / 8;
}

// ------------------------------------------------------------------------------------------------------ a walker

// A ship's path and where it is on it. The path is by distance, laid ahead of the ship: `pieces` in order of `s0`..`s1` (the distance
// along it), each a straight run or a rounded corner ({ from, to, via }: a quadratic curve from `from` to `to` bending toward the corner
// `via`); `at` is where the last piece ended, `vertex` the corner the next run is bound for (the pending straight), `last` the
// corner before it and `back` the length of the chord that ran into `vertex`. How far along the ship is at a time is `profile`:
// entries { t, s, v, u } (from time `t`, at distance `s`, at `v` u/s), a new one each time the ship is another (`retype`). `u` is the
// ship's `uneven` (src/npcShips.js: LEARNER's), or null: its pace swings about `v`, v (1 + sum of a sin(2 pi t / T)) for each [a, T],
// on the world's clock, and the distance is that pace's integral, so a pose is still read from the clock alone.
class Walker {
  constructor(code, speed, start, time) {
    this.code = code;
    this.speed = speed;
    this.pieces = [];
    this.length = 0;
    this.at = [start[0], start[1]];
    this.vertex = null;
    this.last = null;
    this.back = 0;
    this.start = start;
    this.profile = [{ t: time, s: 0, v: speed, u: unevenOf(code) }];
    this.changedAt = -Infinity;      // when it became the ship it is
    this.inZone = false;             // within `zone` of the pilot at the last look (a ship coming in is repainted)
    this.stepOns = 0;                // how often no leg was found and it went a short step on (a diagnostic: it should be 0)
    this.memo = { t: NaN, pose: null };
    this.hull = CONFIG.traffic.npcSolid.hull;   // what a blow from the pilot's ship has left it (Fleet.hurt)
    this.knocks = [];                            // blows that knocked it off its path (Fleet.knock): { t, vx, vy, spin }
    this.rage = null;                            // enraged: its simulated state (src/npcRage.js startRage), off its path; or null
    this.destination = null;                     // the station's free place its journey leans toward (choose; CONFIG.ground.traffic)
    this.home = npcHome(code);                   // its home station and sector (src/npcShips.js), or null
    this.homing = false;                         // its journeys go from its home and back (Fleet.persons)
    this.body = null;                            // flown (Fleet.flight 'step'): its body (src/npcFlight.js), or null on the clock
    this.s = 0;                                  // flown: how far along its path it is (the clock's `travelled` while on the clock)
    this.stops = [];                             // a person's stops at stations ahead on its path: { s, station } (N2 ROUTES)
    this.stopAtVertex = null;                    // the station the corner at `vertex` is a stop by (Walker.push)
    this.nextStop = null;                        // the station the corner `choose` gives now is a stop by
    this.waiting = null;                         // flown, standing at a stop: { until, station }
  }

  // Flown from here (src/npcFlight.js): a body where the clock has it now, going at the clock's pace.
  board(t) {
    const s = this.travelled(t), p = this.pose(t), v = this.speedAt(t);
    this.s = s;
    this.body = bodyOf(p, v);
    this.knocks = [];
    this.memo = { t: NaN, pose: null };
  }
  // Back on the clock (the mode 'path' again, the lab's switch): a path begun where its body is, the way it goes, its pace easing from the
  // body's to its own (Walker.restart), so nothing jumps; the next step lays the path on.
  unboard(t) {
    const b = this.body, v = Math.hypot(b.vx, b.vy);
    this.body = null;
    this.restart([b.x, b.y], v > 20 ? Math.atan2(b.vy, b.vx) : b.angle, v, t);
  }
  // Its own pace at time `t` (LEARNER's swinging), what a flown ship cruises at.
  cruise(t) {
    const u = unevenOf(this.code);
    if (!u) return this.speed;
    let swing = 0;
    for (const [a, T] of u) swing += a * Math.sin((TAU * t) / T);
    return this.speed * (1 + swing);
  }
  // The index of the piece of path holding distance `s` (0 before the first).
  pieceAt(s) {
    const P = this.pieces;
    let lo = 0, hi = P.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (P[mid].s0 <= s) lo = mid; else hi = mid - 1; }
    return Math.max(0, lo);
  }

  // How far the blows have knocked it off its path at time `t`, and its turn and velocity off it: each a kick of velocity
  // that slows and comes back (v t e^(-omega t), a spring damped critically) and of turn that straightens.
  knocked(t) {
    const K = CONFIG.traffic.npcSolid.knock, out = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
    for (const k of this.knocks) {
      const u = t - k.t;
      if (u <= 0) continue;
      const e = Math.exp(-K.omega * u), lift = u * e, pace = e * (1 - K.omega * u);
      out.x += k.vx * lift; out.y += k.vy * lift; out.vx += k.vx * pace; out.vy += k.vy * pace;
      out.angle += k.spin * u * Math.exp(-K.turnBack * u);
    }
    return out;
  }

  // Its pace at time `t`, u/s (the profile's: a swap changes it).
  speedAt(t) {
    if (this.rage) return Math.hypot(this.rage.vx, this.rage.vy);
    if (this.body) return Math.hypot(this.body.vx, this.body.vy);
    const P = this.profile;
    let k = P.length - 1;
    while (k > 0 && P[k].t > t) k--;
    const e = P[k];
    if (!e.u) return e.v;
    let swing = 0;
    for (const [a, T] of e.u) swing += a * Math.sin((TAU * t) / T);
    return e.v * (1 + swing);
  }

  // The distance travelled by time `t`.
  travelled(t) {
    if (this.body) return this.s;
    const P = this.profile;
    let k = P.length - 1;
    while (k > 0 && P[k].t > t) k--;
    const e = P[k], d = Math.max(0, t - e.t);
    if (!e.u) return e.s + e.v * d;
    let swing = 0;
    for (const [a, T] of e.u) swing += ((a * T) / TAU) * (Math.cos((TAU * e.t) / T) - Math.cos((TAU * (e.t + d)) / T));
    return e.s + e.v * (d + swing);
  }

  // The point `s` of the way along the path ([x, y]), the path's end held beyond it.
  place(s) {
    const P = this.pieces;
    if (!P.length) return this.start;
    if (s >= this.length) return P[P.length - 1].to;
    if (s <= P[0].s0) return P[0].from;
    let lo = 0, hi = P.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (P[mid].s0 <= s) lo = mid; else hi = mid - 1; }
    const piece = P[lo];
    if (piece.via) { const p = bezier(piece.from, piece.via, piece.to, curveParam(piece.table, s - piece.s0)); return [p.x, p.y]; }
    const u = (s - piece.s0) / (piece.s1 - piece.s0);
    return [piece.from[0] + (piece.to[0] - piece.from[0]) * u, piece.from[1] + (piece.to[1] - piece.from[1]) * u];
  }

  // Where the ship is at time `t`, and which way it points (screen angle, 0 = right). It points along the chord of the path
  // `smooth` u either side of it, so a sharp corner is turned over some seconds and not snapped.
  pose(t) {
    if (t === this.memo.t) return this.memo.pose;
    // Enraged: where its simulation has put it (Fleet.stepRage), whatever the clock the path was read by.
    if (this.rage) return (this.memo = { t, pose: { x: this.rage.x, y: this.rage.y, angle: this.rage.angle } }).pose;
    // Flown: where its body is, leaning into its turn.
    if (this.body) { const b = this.body; return (this.memo = { t, pose: { x: b.x, y: b.y, angle: b.angle, bank: b.bank } }).pose; }
    const s = this.travelled(t), L = K().smooth, here = this.place(s), ahead = this.place(s + L), behind = this.place(Math.max(0, s - L));
    const dx = ahead[0] - behind[0], dy = ahead[1] - behind[1];
    const way = dx || dy ? Math.atan2(dy, dx) : (this.memo.pose?.angle ?? 0);
    const off = this.knocks.length ? this.knocked(t) : null;
    const pose = off ? { x: here[0] + off.x, y: here[1] + off.y, angle: way + off.angle } : { x: here[0], y: here[1], angle: way };
    this.memo = { t, pose };
    return pose;
  }

  // The ship becomes another (a swap): from now on it is `code`, at that ship's pace, down the same path.
  retype(code, speed, t) {
    this.profile.push({ t, s: this.travelled(t), v: speed, u: unevenOf(code) });
    // Flown, it is the other ship at that ship's pace from now (a swap is never where the pilot could see it).
    if (this.body && this.speed > 0) { const k = speed / this.speed; this.body.vx *= k; this.body.vy *= k; }
    this.code = code;
    this.speed = speed;
    this.home = npcHome(code);
    this.changedAt = t;
    this.memo = { t: NaN, pose: null };
    if (this.profile.length > 40) this.profile.splice(0, this.profile.length - 40);
  }

  // The path begun again at `at` at time `t`, for a ship that calms (Fleet.calm) going `heading` at `now` u/s: its first run goes straight
  // on along the heading as far as that is clear (up to 1,800 u), the path's first corner rounding off at the run's end, so the ship
  // does not turn on the spot; none clear, it begins any way (`choose`). Its pace eases from `now` to its own over CONFIG.traffic.
  // npcRage.chase.ease s, in twelve steps of the profile (a path reads where the ship is from the clock alone).
  restart(at, heading, now, t) {
    this.pieces = []; this.length = 0; this.knocks = [];
    this.stops = []; this.stopAtVertex = null; this.nextStop = null; this.waiting = null;
    this.at = [at[0], at[1]]; this.start = this.at;
    this.vertex = null; this.last = null; this.back = 0;
    const c = Math.cos(heading), s = Math.sin(heading), edge = K().edge;
    for (const run of [1800, 1200, 700, 300]) {
      const v = [at[0] + c * run, at[1] + s * run];
      if (v[0] < edge || v[1] < edge || v[0] > GRID_W - edge || v[1] > GRID_H - edge || !segmentClear(at[0], at[1], v[0], v[1], 0)) continue;
      this.vertex = v; this.last = this.at; this.back = run;
      break;
    }
    const span = rageConfig().chase.ease, n = 12;
    this.profile = [];
    let dist = 0;
    for (let k = 0; k < n; k++) {
      const v = now + (this.speed - now) * ((k + 0.5) / n);
      this.profile.push({ t: t + (k * span) / n, s: dist, v, u: null });
      dist += (v * span) / n;
    }
    this.profile.push({ t: t + span, s: dist, v: this.speed, u: unevenOf(this.code) });
    this.changedAt = t;
    this.memo = { t: NaN, pose: null };
  }

  // The next corner, drawn at random: a free place `minLeg` to `maxLeg` from the last, not a hairpin turn from the way it is going,
  // the straight to it and the rounded corner before it clear of everything. The tries are made again, more of them, with a wider
  // turn (`maxTurnMore`) and legs that may be shorter and longer (to twice and three times `maxLeg`), when none is found, then
  // looking at every place with any turn short of a reversal (`maxTurnAll`: a ship in a corner of the grid heading out), then with
  // any turn and a corner that may touch a block's air (its cut the smallest): none after that is null (it never is). A corner is made at a place that has `hub` ways on (degreeOf).
  // `me`, the pilot's place in the grid (or null): with the chance `toward` a first round looks for the corner only within `pass` u of
  // it, at the first round's turn, so the ships of the pilot's part of the grid come by where the pilot flies (W2, 2026-10-04; SX: «мало
  // ... NPC и других кораблей»); none there, the rounds go on as before. Fleet.step gives a ship the pilot met lately less of it.
  choose(rng, open = null, me = null, chance = 0) {
    const { spots: free } = grid(), C = K(), from = this.vertex ?? this.at;
    const prior = this.vertex ? [this.vertex[0] - this.last[0], this.vertex[1] - this.last[1]] : null;
    const T = GROUND.traffic;
    // Arrived: within `gateArrival` of the place; a person also once its next leg could only overshoot it (closer than most of a leg).
    const arrival = this.homing && this.home ? Math.max(T.gateArrival, C.minLeg * CONFIG.traffic.persons.arrive) : T.gateArrival;
    // A person arriving (N2 ROUTES): its next corner is the station's approach place itself, where it will stand a while (Fleet.stepFlight),
    // if the way there is clear; the journey's next place is drawn after it.
    const arriving = this.homing && this.home && this.vertex && this.destination && (!open || open.has(this.destination.sector)) &&
      Math.hypot(from[0] - this.destination.at[0], from[1] - this.destination.at[1]) < arrival;
    if (arriving && !this.stopAtVertex) {
      const g = this.destination.at, len = Math.hypot(g[0] - from[0], g[1] - from[1]);
      if (len > CONFIG.traffic.stops.least && segmentClear(from[0], from[1], g[0], g[1]) && this.cornerClear(g)) {
        this.nextStop = this.destination.station;
        this.lastStation = this.destination.station;
        this.destination = null;
        return [g[0], g[1]];
      }
    }
    if (!this.destination || (open && !open.has(this.destination.sector)) || Math.hypot(from[0] - this.destination.at[0], from[1] - this.destination.at[1]) < arrival) {
      let choices = routeGates().filter((g) => (!open || open.has(g.sector)) && g.station !== this.destination?.station && g.station !== this.lastStation);
      // A person's journeys (Fleet.persons): home, then one of the stations of its sector or the ones next to it (never the pilot's
      // garage HOME), then home again.
      if (this.homing && this.home) {
        choices = choices.filter((g) => !g.station.startsWith('station-home'));
        // Home next once it has been (or was bound) somewhere else; out once it has been home.
        const was = this.destination?.station ?? this.lastStation ?? null, back = was !== null && was !== this.home.station;
        const hs = sectorById(this.home.sector), reach = CONFIG.traffic.persons.reach;
        const mine = choices.filter((g) => back ? g.station === this.home.station : (() => { const q = sectorById(g.sector); return Math.abs(q.col - hs.col) <= reach && Math.abs(q.row - hs.row) <= reach; })());
        if (mine.length) choices = mine;
      }
      const gate = choices[Math.floor(rng() * choices.length)];
      this.destination = gate ? { station: gate.station, sector: gate.sector, at: gate.points[Math.floor(rng() * gate.points.length)] } : null;
    }
    // A person keeps to its journey more (CONFIG.traffic.persons `lean`, `progress`): it is going somewhere.
    const P = this.homing && this.home ? CONFIG.traffic.persons : null, progress = P ? P.progress : T.gateProgress;
    const goal = this.destination && rng() < (P ? P.lean : T.routeChance) ? this.destination.at : null;
    const distance = goal ? Math.hypot(from[0] - goal[0], from[1] - goal[1]) : 0;
    const toward = me && chance > 0 && Math.hypot(from[0] - me[0], from[1] - me[1]) < C.zone && rng() < chance ? me : null;
    for (let pass = toward ? -1 : 0; pass < 4; pass++) {
      const round = Math.max(0, pass), near = pass < 0 ? toward : null;
      // The last round looks at every place (from a random one), not a draw of them: a ship in a corner of the grid has few.
      const tries = round >= 2 ? free.length : C.tries * (round + 1), first = Math.floor(rng() * free.length);
      for (let i = 0; i < tries; i++) {
        const at = round >= 2 ? (first + i) % free.length : Math.min(free.length - 1, Math.floor(rng() * free.length)), q = free[at];
        if (open && !open.has(spotSector[at])) continue;
        if (pass === 0 && goal && Math.hypot(q[0] - goal[0], q[1] - goal[1]) > Math.max(T.gateArrival, distance * progress)) continue;
        if (near && Math.hypot(q[0] - near[0], q[1] - near[1]) > C.pass) continue;
        const dx = q[0] - from[0], dy = q[1] - from[1], len = Math.hypot(dx, dy);
        if (len < C.minLeg * (round ? 0.4 : 1) || len > C.maxLeg * (1 + round)) continue;
        if (prior) {
          const turn = Math.acos(Math.max(-1, Math.min(1, (prior[0] * dx + prior[1] * dy) / (Math.hypot(prior[0], prior[1]) * len))));
          if (round < 3 && turn > (round === 2 ? C.maxTurnAll : C.maxTurn + (round ? C.maxTurnMore : 0))) continue;
        }
        if (!segmentClear(from[0], from[1], q[0], q[1])) continue;
        if (this.vertex && round < 3 && !this.cornerClear(q)) continue;
        if (round < 2 && degreeOf(at) < C.hub) continue;
        return q;
      }
    }
    return null;
  }

  // The rounded corner at the vertex if the ship went on to `q`: where it begins and where it ends. The widest turn that keeps clear
  // (the cut `cut` u, then 0.6 and 0.3 of it where a block is near the corner), or null when none does.
  corner(q, force = false) {
    const v = this.vertex, inX = v[0] - this.last[0], inY = v[1] - this.last[1], outX = q[0] - v[0], outY = q[1] - v[1];
    const lin = Math.hypot(inX, inY), lout = Math.hypot(outX, outY), room = 0.45 * Math.min(this.back, lout);
    for (const share of [1, 0.6, 0.3]) {
      const cut = Math.min(K().cut * share, room), b = [v[0] - (inX / lin) * cut, v[1] - (inY / lin) * cut], c = [v[0] + (outX / lout) * cut, v[1] + (outY / lout) * cut];
      if (force ? share === 0.3 : curveClear(b, v, c)) return { b, c };
    }
    return null;
  }
  cornerClear(q) { return !!this.corner(q); }

  // Takes `q` as the next corner: the run to the last corner and its rounding are laid down as pieces. The first corner is the
  // ship's own start, so there is nothing to lay until the second is chosen.
  push(q) {
    if (!this.vertex) { this.vertex = q; this.last = this.at; this.back = Math.hypot(q[0] - this.at[0], q[1] - this.at[1]); this.stopAtVertex = this.nextStop; this.nextStop = null; return; }
    const v = this.vertex, k = this.corner(q) ?? this.corner(q, true);
    this.lay(this.at, k.b, null, Math.hypot(k.b[0] - this.at[0], k.b[1] - this.at[1]));
    const cornerFrom = this.length;
    this.lay(k.b, k.c, v, null);
    // The corner at a stop's place: the ship stands at its middle (N2 ROUTES).
    if (this.stopAtVertex) this.stops.push({ s: (cornerFrom + this.length) / 2, station: this.stopAtVertex });
    this.stopAtVertex = this.nextStop;
    this.nextStop = null;
    this.at = k.c;
    this.last = v;
    this.vertex = q;
    this.back = Math.hypot(q[0] - v[0], q[1] - v[1]);
  }
  // A piece of path: a straight run (`via` null) or a rounded corner (`via` the corner it bends toward, its lengths tabled).
  lay(from, to, via, length) {
    const table = via ? curveTable(from, via, to) : null, len = table ? table[8] : length;
    if (len < 1e-6) return;
    this.pieces.push({ s0: this.length, s1: this.length + len, from: [from[0], from[1]], to: [to[0], to[1]], ...(via ? { via: [via[0], via[1]], table } : {}) });
    this.length += len;
  }
  // A path nobody can lengthen goes a short step on (it never should; the lattice has a thousand places).
  stepOn() {
    const a = this.vertex ?? this.at, dir = this.last ? Math.atan2(a[1] - this.last[1], a[0] - this.last[0]) : 0;
    this.stepOns++;
    this.push([Math.min(GRID_W - K().edge, Math.max(K().edge, a[0] + Math.cos(dir) * 300)), Math.min(GRID_H - K().edge, Math.max(K().edge, a[1] + Math.sin(dir) * 300))]);
  }

  // Lays pieces until the path is `ahead` u past the ship at time `t`; old pieces are dropped, a long session keeping a short list.
  extend(rng, t, open = null, me = null, toward = 0) {
    const here = this.travelled(t), ahead = this.body || this.homing ? flightConfig().ahead : K().ahead;
    // At most `batch` corners a step, so the first step of a world does not lay all thirteen paths in one frame (it was 50 ms): they
    // fill over the next few steps, and a ship has seconds of path in front of it from the first. A flown ship's path is laid less far
    // ahead (CONFIG.traffic.flight.ahead), so what leans it (the pilot, a journey) is minutes fresher; so is a person's (Fleet.persons).
    for (let laid = 0; this.length < here + ahead && laid < K().batch; laid++) {
      const q = this.choose(rng, open, me, toward);
      if (q) this.push(q); else this.stepOn();
    }
    if (this.pieces.length > 400) {
      let drop = 0;
      while (drop < this.pieces.length - 100 && this.pieces[drop].s1 < here - 500) drop++;
      if (drop) this.pieces.splice(0, drop);
    }
  }
}

// ------------------------------------------------------------------------------------------------------ the fleet

// Where a route begins, in grid units: the middle of a lane, a point of an orbit.
function startOf(route) {
  const r = resolveRoute(route), s = sectorById(route.sector);
  if (!r || !s) return null;
  if (r.kind === 'orbit') return [s.col * W + (r.at[0] + Math.cos(r.phase) * r.radius) * W, s.row * H + (r.at[1] + Math.sin(r.phase) * r.radius) * W];
  return [s.col * W + ((r.from[0] + r.to[0]) / 2) * W, s.row * H + ((r.from[1] + r.to[1]) / 2) * H];
}

// The free place nearest a point: a ship begins in clear space, whatever a route's middle was (a station's menu or a planet's
// cushion may lie on it now).
function freeNear(p) {
  let best = null, d2 = Infinity;
  for (const q of grid().spots) { const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d < d2) { d2 = d; best = q; } }
  return best ? [best[0], best[1]] : p;
}

// The sector holding a point of the grid, or null.
const sectorAt = (x, y) => GRID.find((s) => x >= s.col * W && x < (s.col + 1) * W && y >= s.row * H && y < (s.row + 1) * H) ?? null;
// Where the pilot is, in grid units, or null in O-08.
export const pilotAt = (world) => (world.sector.hidden ? null : [world.sector.col * W + world.ship.x, world.sector.row * H + world.ship.y]);

export class Fleet {
  constructor(time = 0) {
    this.walkers = [];
    for (const route of NPC_ROUTES) {
      const start = startOf(route);
      if (start && npcCraftDef(route.code)) this.walkers.push(new Walker(route.code, route.path.speed, freeNear(start), time));
    }
    // A rare ship (its record's `rare`, src/eggs.js): when it next comes out and until when it is out.
    this.rare = RARE_SHIPS.filter((code) => npcCraftDef(code)).map((code) => ({ code, next: time + npcShip(code).rare.first, until: -Infinity, out: false }));
    this.byCode = new Map(this.walkers.map((w) => [w.code, w]));
    this.views = new Map();          // code -> (sector id -> the craft as that sector sees it)
    this.bucket = new Map();         // sector id -> the crafts in it now
    this.bucketAt = NaN;
    this.lookIn = 0;
    this.mixIn = 0;
    this.near = new Set();           // codes within sight of the pilot now (met, not yet left)
    this.swaps = 0;                  // how many times a ship has been exchanged for another out of sight
    // What each ship wears: its paint's key (src/npcPaint.js: OWN or a paint's id) and when it was put on, and the palette its
    // views draw, one object a ship refilled in place when it is repainted, so every sector's view of it follows.
    const codes = [...this.walkers.map((w) => w.code), ...this.rare.map((r) => r.code)];
    this.paints = new Map(codes.map((code) => [code, { key: OWN, at: -Infinity }]));
    this.palettes = new Map(codes.map((code) => [code, { ...npcPalette(code, OWN) }]));
    this.lastMe = null;              // where the pilot was at the last look (null: none yet, or O-08)
    this.repaints = 0;
    this.raging = [];                // the walkers enraged now (Walker.rage), in the order they turned on the pilot
    this.spoke = new Map();          // ship code -> when it last said a line at the pilot (a curse, a rage's words)
    this.said = new Map();           // pool ('curse', 'turn', 'ram', 'calm') -> the line it gave last, so none is said twice running
    this.flight = flightConfig().mode;   // 'path' on the clock, 'step' flown (src/npcFlight.js; the lab's `?npcFlight=new`)
    this.persons = CONFIG.traffic.persons.on;   // each ship itself, at home, remembering (N3 PERSONS); off: the mixing of before
    // What each ship of the list remembers, by code (saved): its paint (a key of src/npcPaint.js, null until drawn), how often the pilot
    // met it, helped it (a quest about it done), rammed it, until when on the pilot's clock it holds a ram against the pilot (`grudge`), when
    // it was last met (`seen`).
    this.people = new Map(NPC_SHIPS.map((s) => [s.code, freshPerson()]));
    this.resting = [];               // the codes of the ships at home, not out: their sector is closed
    this.settled = false;            // the first look has put the ships of closed sectors to rest at once (they stand in the fog)
    this.restarts = 0;               // flown: how often a ship knocked far off its path began a new one from where it was
  }

  // Keeps every path ahead of the ship on it, notes the ships the pilot meets, and now and then exchanges two ships out of sight.
  step(world, dt) {
    const t = world.time, C = K();
    if (this.raging.length) this.stepRage(world, dt);
    const rng = world.rng('npc'), recent = (world.recent ??= newRecent()), open = this.openOf(world), here = pilotAt(world);
    // A ship comes by the pilot the less the more it was met lately (src/pacing.js counterweights, as the mixing leans). An enraged
    // one has no path to keep ahead of it.
    for (const w of this.walkers) {
      w.homing = this.persons;
      if (!w.rage) w.extend(rng, t, open, here, here ? C.toward * counterweight(shipContact(recent, w.code, world.ledger.clock)) : 0);
    }
    if (this.flight === 'step') this.stepFlight(world, dt);
    else for (const w of this.walkers) if (w.body) w.unboard(t);
    this.lookIn -= dt;
    if (this.lookIn > 0) return;
    this.lookIn = C.look;
    const me = pilotAt(world);
    if (this.persons) { this.reconcileQuests(world); this.keepHomes(world, t, me, open); } else this.keepOpen(world, t, me, open);
    if (this.rare.length) this.rareLook(world, t, me, open);
    if (this.persons) this.fixPaints(world);
    if (!me) { this.near.clear(); this.lastMe = null; return; }
    const clock = world.ledger.clock;
    if (!this.persons) this.paintLook(world, t, me);
    if (world.ship.alive) {
      for (const w of this.walkers) {
        const p = w.pose(t), d = Math.hypot(p.x - me[0], p.y - me[1]);
        if (d < C.sight && !this.near.has(w.code)) {
          this.near.add(w.code);
          const rec = this.people.get(w.code);
          if (rec && this.persons) {
            rec.met++; rec.seen = clock;
            if (rec.knew < 0) rec.knew = world.ledger.restored?.size ?? 0;
            // It may speak first (src/npcTalk.js hailFor): a grudge, a thanks, a station back, pirates near.
            const said = !w.rage && hailFor(world, w.code);
            if (said) sayAtPilot(world, w.code, said);
          }
          noteRecent(recent, 'ship', w.code, clock, CONFIG.quests.mix.met);
          // and the paint it was met in, which the next paints drawn lean away from
          noteRecent(recent, 'paint', paintNote(w.code, this.keyOf(w.code)), clock, CONFIG.quests.mix.met);
        } else if (d > C.rearm) this.near.delete(w.code);
      }
    } else this.near.clear();
    this.mixIn -= C.look;
    if (this.mixIn > 0 || this.persons) return;
    this.mixIn = C.mixEvery;
    this.mix(t, me, rng, recent, clock, world);
  }

  // Every ship flown a step (the mode 'step', src/npcFlight.js): each not raging aims `look` ahead on its path (its body's own way along it,
  // `s`, kept by where the body is), at its cruise taken down for the corners ahead and for what it gives way to (the others, a raging
  // one among them, and the pilot's ship while it flies), and swings, pushes or brakes toward that; then every two are held apart. A ship
  // knocked or pushed more than `offTrack` u off its path begins a new one from where it is, going the way it goes (Walker.restart).
  stepFlight(world, dt) {
    const F = flightConfig(), t = world.time, me = pilotAt(world), ship = world.ship, blocks = grid().blocks;
    const edge = K().edge * F.edge, lo = [edge, edge], hi = [GRID_W - edge, GRID_H - edge];
    const ships = (this.flying ??= []);
    ships.length = 0;
    for (const w of this.walkers) {
      const reach = boxOf(w.code)?.reach ?? 80;
      if (w.rage) {
        const g = w.rage, q = (w.rageSeen ??= { fixed: true });
        q.x = g.x; q.y = g.y; q.vx = g.vx; q.vy = g.vy; q.angle = g.angle; q.reach = reach;
        ships.push(q);
        continue;
      }
      if (!w.body) w.board(t);
      w.body.reach = reach;
      ships.push(w.body);
    }
    const flying = me && ship.alive && !world.docked;
    const pilot = flying ? (this.pilotSeen ??= {}) : null;
    if (pilot) { pilot.x = me[0]; pilot.y = me[1]; pilot.vx = ship.vx ?? 0; pilot.vy = ship.vy ?? 0; pilot.radius = ship.radius ?? 0; }
    const foes = this.foesOf(world);
    for (let i = 0; i < this.walkers.length; i++) {
      const w = this.walkers[i], b = w.body;
      if (w.rage) continue;
      const cruise = w.cruise(t);
      if (w.pieces.length) {
        // How far along its path the body has got: its place on the path's tangent, never back, never more than a few steps' way.
        const at = w.place(w.s), ahead = w.place(w.s + 8), back = w.place(Math.max(0, w.s - 8));
        let tx = ahead[0] - back[0], ty = ahead[1] - back[1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        w.s += clamp((b.x - at[0]) * tx + (b.y - at[1]) * ty, 0, Math.max(60, Math.hypot(b.vx, b.vy) * dt * 4));
        const now = w.place(w.s);
        if (Math.hypot(b.x - now[0], b.y - now[1]) > F.offTrack) {
          w.restart([b.x, b.y], Math.hypot(b.vx, b.vy) > 20 ? Math.atan2(b.vy, b.vx) : b.angle, Math.hypot(b.vx, b.vy), t);
          w.s = 0;
          w.extend(world.rng('npc'), t, this.openOf(world), me, 0);
          this.restarts++;
        }
      }
      let dx = Math.cos(b.angle), dy = Math.sin(b.angle), want = cruise;
      if (w.pieces.length) {
        const look = clamp(Math.hypot(b.vx, b.vy) * F.lookTime, F.look[0], F.look[1]), c = w.place(w.s + look);
        const cx = c[0] - b.x, cy = c[1] - b.y, cl = Math.hypot(cx, cy);
        if (cl > 1e-6) { dx = cx / cl; dy = cy / cl; }
        want = Math.min(cruise, cornerPace(w.pieces, w.pieceAt(w.s), w.s, cruise));
      }
      // A stop at a station (N2 ROUTES): it brakes to stand at the stop's place, its nose to the station, `time` s, and goes on.
      const stop = w.stops[0];
      if (stop && w.s >= stop.s - CONFIG.traffic.stops.lead && !w.waiting) w.waiting = { until: t + this.stopTime(world, w), station: stop.station };
      if (w.waiting) {
        if (t >= w.waiting.until || !w.stops.length) { w.waiting = null; w.stops.shift(); }
        else {
          const st = stationDefById(w.waiting.station), sec = st && sectorById(st.sectorId);
          if (sec) { const sx = sec.col * W + st.x * W - b.x, sy = sec.row * H + st.y * H - b.y, sl = Math.hypot(sx, sy) || 1; dx = sx / sl; dy = sy / sl; }
          b.faceX = dx; b.faceY = dy;
          want = 0;
        }
      } else if (stop) want = Math.min(want, Math.sqrt(2 * Math.max(1, cruise * F.brake) * Math.max(0, stop.s - w.s)));
      b.wx = dx * want; b.wy = dy * want; b.cruise = cruise;
      if (foes.length || w.fight) this.fightStep(world, w, b, cruise, foes, t);
    }
    // What each gives way to turns the velocity it wants (src/npcFlight.js giveWay), and each swings, pushes or brakes toward that.
    giveWay(ships, pilot, t);
    for (const w of this.walkers) {
      if (w.rage) continue;
      const b = w.body, want = Math.hypot(b.wx, b.wy);
      // A ship standing at a stop turns its nose to the station (its way's direction kept in `wx`, `wy` at no pace) and may stand still.
      const still = !!w.waiting, ux = want > 1e-6 ? b.wx / want : still ? b.faceX ?? Math.cos(b.angle) : Math.cos(b.angle), uy = want > 1e-6 ? b.wy / want : still ? b.faceY ?? Math.sin(b.angle) : Math.sin(b.angle);
      steerBody(b, ux, uy, still ? want : Math.max(F.minPace, want), b.cruise, blocks, lo, hi, dt);
    }
    holdApart(ships);
    if (foes.length) this.fightContacts(world, foes, t);
    for (const w of this.walkers) w.memo = { t: NaN, pose: null };
    this.bucketAt = NaN;
  }

  // ------------------------------------------------------------------------------------------------------- pirates (N5 FIGHTS)

  // The pirates of the pilot's sector, alive, in the fleet's grid units: [{ p, x, y, radius }] (a list kept on the fleet).
  foesOf(world) {
    const out = (this.foes ??= []);
    out.length = 0;
    if (world.sector.hidden || !world.pirates?.length) return out;
    const ox = world.sector.col * W, oy = world.sector.row * H;
    for (const p of world.pirates) if (p.hp > 0) out.push({ p, x: p.x + ox, y: p.y + oy, radius: p.radius ?? 30 });
    return out;
  }

  // A flown ship and the pirates (SX, 2026-10-19, N5 FIGHTS; CONFIG.traffic.fights): within `see` u of one, a brave ship (`brave`) may join
  // the pilot's fight, once a fight, with the chance `chance` (the stream 'npcFight'): for `time` s it goes at the nearest pirate at `boost`
  // of its cruise and rams it (Fleet.fightContacts). Any other ship within `flee.reach` u of a pirate gets clear of it, away from it at
  // `flee.boost` of its cruise. Each says so once a fight. Sets the velocity it wants (`wx`, `wy`) and the pace it may go (`cruise`).
  fightStep(world, w, b, cruise, foes, t) {
    const C = CONFIG.traffic.fights;
    let near = null, d = Infinity;
    for (const f of foes) { const e = Math.hypot(f.x - b.x, f.y - b.y); if (e < d) { d = e; near = f; } }
    if (!near || d > C.see) { w.fight = null; return; }
    const enc = world.encounter;
    if (!w.fight && enc && C.brave.includes(w.code) && w.fightRolled !== enc) {
      w.fightRolled = enc;
      if (world.rng('npcFight')() < C.chance) { w.fight = { until: t + C.time, hitAt: -Infinity }; this.fightSay(world, w, 'join'); }
    }
    if (w.fight && t < w.fight.until) {
      const k = cruise * C.boost, dx = near.x - b.x, dy = near.y - b.y;
      b.wx = (dx / d) * k; b.wy = (dy / d) * k; b.cruise = k;
      return;
    }
    w.fight = null;
    if (d > C.flee.reach) return;
    const k = cruise * C.flee.boost, m = Math.hypot(b.wx, b.wy) || 1;
    let ax = b.wx / m + ((b.x - near.x) / d) * 2, ay = b.wy / m + ((b.y - near.y) / d) * 2;
    const n = Math.hypot(ax, ay) || 1;
    b.wx = (ax / n) * k; b.wy = (ay / n) * k; b.cruise = k;
    if (enc && w.fleeSaid !== enc) { w.fleeSaid = enc; this.fightSay(world, w, 'flee'); }
  }

  // A ship joining the fight that touches a pirate rams it: `blow` of its hull (src/encounters.js hurtPirate, cause 'npc'), not again within
  // `again` s, and bounces off it with its grip let go.
  fightContacts(world, foes, t) {
    const C = CONFIG.traffic.fights;
    for (const w of this.walkers) {
      const b = w.body;
      if (!w.fight || !b || t - w.fight.hitAt < C.again) continue;
      for (const f of foes) {
        const dx = f.x - b.x, dy = f.y - b.y, d = Math.hypot(dx, dy);
        if (d > b.reach + f.radius || f.p.hp <= 0) continue;
        w.fight.hitAt = t;
        world.hurtPirate(f.p, 'npc', { amount: C.blow, aim: Math.atan2(dy, dx) });
        const nx = dx / (d || 1), ny = dy / (d || 1), into = b.vx * nx + b.vy * ny;
        if (into > 0) { b.vx -= 1.5 * into * nx; b.vy -= 1.5 * into * ny; }
        b.skid = flightConfig().skid.time;
        if (world.rng('npcFight')() < 0.5) this.fightSay(world, w, 'hit');
        break;
      }
    }
  }

  // How long ship `w` stands at a stop (N2 ROUTES): CONFIG.traffic.stops.time s, drawn from the paths' stream (a stop is its journey's).
  stopTime(world, w) {
    const [a, b] = CONFIG.traffic.stops.time;
    return a + world.rng('npc')() * (b - a);
  }

  // Ship `w`'s line in a fight (src/npcTalk.js TALK_LINES.fight), over it, in the greeting's style.
  fightSay(world, w, pool) {
    const lines = TALK_LINES.fight[pool], line = lines[Math.floor(world.rng('npcFight')() * lines.length)], p = w.pose(world.time);
    sayAtPilot(world, w.code, { line, x: p.x - world.sector.col * W, y: p.y - world.sector.row * H, angry: false });
  }

  // The sectors open to the pilot (src/frontier.js), as a set, made again when a restoration opens one; null when the world has no
  // ledger to ask (every sector then).
  openOf(world) {
    const L = world.ledger;
    if (!L) return null;
    const key = `${L.restored?.size ?? 0}`;
    if (key !== this.openKey) { this.openKey = key; this.open = new Set(openSectorIds(L)); }
    return this.open;
  }

  // A ship in a closed sector and out of the pilot's sight (`hide` u off, or the pilot in O-08) is sent out again at a free place of
  // an open sector out of the pilot's sight (as one that came apart is, Fleet.hurt): the fleet keeps to the open sectors. Of `spread`
  // free places drawn, the one farthest from every other ship (SX, 2026-10-07: «странный разброс нпс ... все скапливается в одном
  // месте»). Until then it was a free place past `zone` from the pilot: with the frontier's first two sectors open that is the far
  // end of the second one, and the fleet's 21, most of whom begin in closed sectors, all came out there at once (measured on three
  // seeds: 12 to 28 pairs of ships within 1,500 u of each other in the first half minute, where an even spread has about 6, and up
  // to 6 ships in one square of 2,700 u), and took minutes to spread.
  keepOpen(world, t, me, open) {
    if (!open) return;
    grid();
    let pool = null, others = null;
    for (let i = 0; i < this.walkers.length; i++) {
      const w = this.walkers[i], p = w.pose(t), s = sectorAt(p.x, p.y);
      if ((s && open.has(s.id)) || w.rage) continue;
      if (me && Math.hypot(p.x - me[0], p.y - me[1]) <= K().hide) continue;
      pool ??= grid().spots.filter((q, k) => open.has(spotSector[k]) && (!me || Math.hypot(q[0] - me[0], q[1] - me[1]) > K().hide));
      if (!pool.length) return;
      // Where the other ships are now: those already in an open sector, and those sent out before this one.
      others ??= this.walkers.map((o) => { const q = o.pose(t), z = sectorAt(q.x, q.y); return z && open.has(z.id) ? [q.x, q.y] : null; }).filter(Boolean);
      const rng = world.rng('npc');
      let at = null, best = -1;
      for (let k = 0; k < K().spread; k++) {
        const q = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
        let near = Infinity;
        for (const o of others) near = Math.min(near, Math.hypot(q[0] - o[0], q[1] - o[1]));
        if (near > best) { best = near; at = q; }
      }
      others.push([at[0], at[1]]);
      const fresh = new Walker(w.code, w.speed, [at[0], at[1]], t);
      fresh.changedAt = w.changedAt;
      this.walkers[i] = fresh;
      this.byCode.set(w.code, fresh);
      fresh.extend(rng, t, open);
      this.near.delete(w.code);
      this.bucketAt = NaN;
    }
  }

  // The persons' look (Fleet.persons), in place of keepOpen: a ship whose home sector is closed rests at home (the first look of a world puts
  // them to rest at once: they stand in the fog; later, only out of the pilot's sight); one out that has wandered into a closed sector, out
  // of sight, is back at home; a ship resting whose home sector has opened comes out there, out of sight.
  keepHomes(world, t, me, open) {
    if (!open) { this.settled = true; return; }
    const hidden = (x, y) => !me || Math.hypot(x - me[0], y - me[1]) > K().hide;
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      if (this.rareOf(w.code) || w.rage || !w.home || open.has(w.home.sector)) continue;
      const p = w.pose(t);
      if (this.settled && !hidden(p.x, p.y)) continue;
      this.walkers.splice(i, 1);
      this.byCode.delete(w.code);
      this.resting.push(w.code);
      this.near.delete(w.code);
      this.bucketAt = NaN;
    }
    this.settled = true;
    for (let i = 0; i < this.walkers.length; i++) {
      const w = this.walkers[i];
      if (this.rareOf(w.code) || w.rage) continue;
      const p = w.pose(t), z = sectorAt(p.x, p.y);
      if ((z && open.has(z.id)) || !hidden(p.x, p.y)) continue;
      const at = this.homeSpot(world, w.code, me);
      if (at) this.walkers[i] = this.placeWalker(world, w.code, at, t, w.changedAt);
    }
    for (const code of this.resting.slice()) {
      const home = npcHome(code);
      if (!home || !open.has(home.sector)) continue;
      const at = this.homeSpot(world, code, me);
      if (!at) continue;
      this.resting.splice(this.resting.indexOf(code), 1);
      this.walkers.push(this.placeWalker(world, code, at, t, t));
    }
  }

  // A free place in ship `code`'s home sector out of the pilot's sight (`hide` u off): of the `spread` nearest its home station, the one
  // farthest from the other ships. Null when there is none.
  homeSpot(world, code, me) {
    const home = npcHome(code), st = home && stationDefById(home.station), hs = home && sectorById(home.sector);
    if (!st || !hs) return null;
    const sx = hs.col * W + st.x * W, sy = hs.row * H + st.y * H, { spots } = grid();
    const pool = [];
    spots.forEach((q, k) => { if (spotSector[k] === home.sector && (!me || Math.hypot(q[0] - me[0], q[1] - me[1]) > K().hide)) pool.push(q); });
    if (!pool.length) return null;
    pool.sort((a, b) => Math.hypot(a[0] - sx, a[1] - sy) - Math.hypot(b[0] - sx, b[1] - sy));
    const near = pool.slice(0, K().spread), t = world.time;
    const others = this.walkers.filter((o) => o.code !== code).map((o) => o.pose(t));
    let best = near[0], far = -1;
    for (const q of near) {
      let d = Infinity;
      for (const o of others) d = Math.min(d, Math.hypot(q[0] - o.x, q[1] - o.y));
      if (d > far) { far = d; best = q; }
    }
    return [best[0], best[1]];
  }

  // A new walker for ship `code` at `at` (grid units), its path begun, in the fleet's lists; `changed` its changedAt. Facing `angle` if
  // given (a saved ship goes on the way it was going).
  placeWalker(world, code, at, t, changed = t, angle = null) {
    const fresh = new Walker(code, npcShip(code)?.speed ?? 100, [at[0], at[1]], t);
    fresh.changedAt = changed;
    fresh.homing = this.persons;
    if (angle !== null) fresh.restart([at[0], at[1]], angle, fresh.speed, t);
    this.byCode.set(code, fresh);
    fresh.extend(world.rng('npc'), t, this.openOf(world));
    this.near.delete(code);
    this.bucketAt = NaN;
    return fresh;
  }

  // Every ship of the list wears a paint of its own for good (Fleet.persons): one without (a new world, a save from before) is given one,
  // drawn by the counterweights as before (Fleet.weigh), never one another ship of the fleet wears.
  fixPaints(world) {
    for (const s of NPC_SHIPS) {
      const rec = this.people.get(s.code), keys = paintKeysFor(s.code);
      if (rec.paint != null && keys.includes(rec.paint)) { if (this.keyOf(s.code) !== rec.paint) this.wear(s.code, rec.paint, world.time); continue; }
      const taken = new Set();
      for (const [code, r] of this.people) if (code !== s.code && r.paint != null) taken.add(paintId(code, r.paint));
      const cands = keys.filter((k) => !taken.has(paintId(s.code, k)));
      const pool = cands.length ? cands : keys, recent = (world.recent ??= newRecent()), rng = world.rng('paint');
      const weights = this.weigh(s.code, pool, recent, world.ledger?.clock ?? 0);
      let u = rng() * weights.reduce((n, x) => n + x, 0), key = pool[pool.length - 1];
      for (let i = 0; i < pool.length; i++) { u -= weights[i]; if (u < 0) { key = pool[i]; break; } }
      rec.paint = key;
      this.wear(s.code, key, world.time);
    }
  }
  wear(code, key, t) {
    this.paints.set(code, { key, at: t });
    Object.assign(this.palettes.get(code), npcPalette(code, key));
  }

  // What ship `code` remembers (Fleet.people), or null for a ship not of the list.
  personOf(code) { return this.people.get(code) ?? null; }
  // The ship a quest is about (a pilot out of fuel, a wreck, a ship pestered; N6 QUESTS, SX 2026-10-19): a person of the fleet out now, not
  // raging, not another quest's, out of the pilot's sight (it goes from its journey to the quest's place unseen), of `allowed` codes if
  // given; the ones the pilot has met likelier, by how often (a ship it knows calls for help). Null without persons or with none to take
  // (the quest draws as before). Fleet.reconcileQuests takes it off its journey while the quest stands.
  questShip(world, rng, allowed = null) {
    if (!this.persons) return null;
    const me = pilotAt(world), t = world.time, busy = new Set(questShips(world).map((q) => q.code));
    const pool = this.walkers.filter((w) => {
      if (!w.home || w.rage || busy.has(w.code) || (allowed && !allowed.includes(w.code))) return false;
      const p = w.pose(t);
      return !me || Math.hypot(p.x - me[0], p.y - me[1]) > K().hide;
    });
    if (!pool.length) return null;
    const weight = (w) => 1 + Math.min(5, this.people.get(w.code)?.met ?? 0);
    let u = rng() * pool.reduce((n, w) => n + weight(w), 0);
    for (const w of pool) { u -= weight(w); if (u < 0) return w.code; }
    return pool[pool.length - 1].code;
  }

  // The quests' ships taken off their journeys and given back (Fleet.persons, every look): a ship a quest is about (src/quests.js,
  // src/wrecked.js, src/pester.js, standing or going away) is not out with the fleet, so it is never in two places; once its quest is
  // over and it has gone, it is at home again, to come out there out of sight (Fleet.keepHomes).
  reconcileQuests(world) {
    const busy = new Set(questShips(world).map((q) => q.code)), taken = (this.taken ??= new Set());
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      if (!busy.has(w.code) || !w.home) continue;
      if (w.rage) this.unrage(w);
      this.walkers.splice(i, 1);
      this.byCode.delete(w.code);
      this.near.delete(w.code);
      taken.add(w.code);
      this.bucketAt = NaN;
    }
    for (const code of [...taken]) {
      if (busy.has(code)) continue;
      taken.delete(code);
      if (!this.resting.includes(code)) this.resting.push(code);
    }
    // A ship resting at home that a quest is about stays out of the fleet too (a quest restored from a save).
    for (const code of busy) { const i = this.resting.indexOf(code); if (i >= 0) { this.resting.splice(i, 1); taken.add(code); } }
  }

  // The pilot helped ship `code` (a quest about it done: N6 QUESTS): it remembers, and owes the pilot a favor (src/npcTalk.js giveFavor).
  helped(code) {
    const rec = this.people.get(code);
    if (rec) { rec.helped++; rec.favors++; }
  }

  // What the save keeps of the fleet (save v27): each ship of the list, what it remembers and, out, where it is and which way it points
  // (grid units). Nothing of its path, its pace or a rage: a reload sets it going from there.
  toJSON(world) {
    const t = world.time, num = (v) => (Number.isFinite(v) ? v : null);
    return { ships: NPC_SHIPS.map((s) => {
      const r = this.people.get(s.code), w = this.byCode.get(s.code), p = w && this.walkers.includes(w) ? w.pose(t) : null;
      return [s.code, { paint: r.paint, met: r.met, helped: r.helped, rammed: r.rammed, grudge: num(r.grudge), seen: num(r.seen), knew: r.knew, favors: r.favors,
        at: p ? [Math.round(p.x), Math.round(p.y), Math.round(p.angle * 1000) / 1000] : null }];
    }) };
  }

  // A save's fleet put back (World.restore): what each ship remembers, and the ships out where they were, going the way they pointed. A
  // save is untrusted: a ship not of the list, a count that is not a whole number, a paint the ship cannot wear, a place off the grid or
  // in a block is dropped (the ship keeps what a new world gives it). A save without a fleet (before v27) leaves the fleet as it is.
  restore(raw, world) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.ships)) return;
    const t = world.time, count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0), time = (v) => (Number.isFinite(v) ? v : -Infinity);
    for (const entry of raw.ships) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !entry[1] || typeof entry[1] !== 'object') continue;
      const [code, r] = entry, rec = this.people.get(code);
      if (!rec) continue;
      Object.assign(rec, { paint: typeof r.paint === 'string' && paintKeysFor(code).includes(r.paint) ? r.paint : null,
        met: count(r.met), helped: count(r.helped), rammed: count(r.rammed), grudge: time(r.grudge), seen: time(r.seen),
        knew: Number.isInteger(r.knew) && r.knew >= -1 ? r.knew : -1, favors: count(r.favors) });
      if (rec.paint != null) this.wear(code, rec.paint, t);
      const at = r.at;
      if (!Array.isArray(at) || !at.slice(0, 3).every(Number.isFinite)) continue;
      const [x, y, angle] = at, edge = K().edge * 0.5;
      if (x < edge || y < edge || x > GRID_W - edge || y > GRID_H - edge || grid().blocks.some(([bx, by, br]) => Math.hypot(x - bx, y - by) < br)) continue;
      const old = this.byCode.get(code), i = old ? this.walkers.indexOf(old) : -1, rest = this.resting.indexOf(code);
      const fresh = this.placeWalker(world, code, [x, y], t, t, angle);
      if (i >= 0) this.walkers[i] = fresh; else this.walkers.push(fresh);
      if (rest >= 0) this.resting.splice(rest, 1);
    }
    this.settled = false;
    this.bucketAt = NaN;
  }

  // A rare ship is not out with the others: from its record's `rare` (src/eggs.js), the first time after `first` s and then `every` s
  // apart, it comes out where the pilot is going, out of sight: at the free place of an open sector nearest the point `hide` + `ahead`
  // u along the pilot's way (a pilot slower than 100 u/s: any in the ring `hide` to `hide` + `ring` u round it), its first leg bound
  // for the pilot's part of the grid; it goes about as the others do for `stay` s, then is taken in again as soon as it is out of
  // sight. Never put out or taken in where it could be seen; not in O-08, nor to a pilot wrecked, docked or in a fight. It is never
  // exchanged in the mixing.
  rareLook(world, t, me, open) {
    for (const r of this.rare) {
      if (r.out) {
        const w = this.byCode.get(r.code), p = w.pose(t);
        if (t >= r.until && !(me && Math.hypot(p.x - me[0], p.y - me[1]) <= K().hide)) this.takeIn(world, r, t);
        continue;
      }
      if (t < r.next || !me || !world.ship.alive || world.docked || world.encounter) continue;
      const ship = npcShip(r.code), R = ship.rare, vx = world.ship.vx ?? 0, vy = world.ship.vy ?? 0, v = Math.hypot(vx, vy);
      const pool = [];
      grid().spots.forEach((q, k) => {
        const d = Math.hypot(q[0] - me[0], q[1] - me[1]);
        if (d > K().hide && d <= K().hide + R.ring && (!open || open.has(spotSector[k]))) pool.push(q);
      });
      if (!pool.length) continue;
      const rng = world.rng('npc');
      let at = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
      if (v > 100) {
        const ax = me[0] + (vx / v) * (K().hide + R.ahead), ay = me[1] + (vy / v) * (K().hide + R.ahead);
        let best = Infinity;
        for (const q of pool) { const d = (q[0] - ax) ** 2 + (q[1] - ay) ** 2; if (d < best) { best = d; at = q; } }
      }
      const w = new Walker(r.code, ship.speed, [at[0], at[1]], t);
      w.changedAt = t;
      this.walkers.push(w);
      this.byCode.set(r.code, w);
      w.extend(rng, t, open, me, 1);
      r.out = true;
      r.until = t + ship.rare.stay;
      this.bucketAt = NaN;
    }
  }
  takeIn(world, r, t) {
    const w = this.byCode.get(r.code), i = this.walkers.indexOf(w), [a, b] = npcShip(r.code).rare.every;
    if (i >= 0) this.walkers.splice(i, 1);
    this.byCode.delete(r.code);
    this.near.delete(r.code);
    r.out = false;
    r.next = t + a + world.rng('npc')() * (b - a);
    this.bucketAt = NaN;
  }
  rareOf(code) { return this.rare.find((r) => r.code === code) ?? null; }

  // The smart mixing (SX, 2026-10-02: «нам нужно под капотом считать сколько раз за последние 20 минут пилот встретил такого нпс и
  // постепенно повышать вероятности встретить другого типа»). Of the ships out of the pilot's sight but in its part of the grid
  // (`hide` to `zone` u off), one the pilot has met a lot lately is exchanged for one far off (past `zone`) that it has met little:
  // the two become each other's ship from here on, at the other's pace, each going down the path it was on (a swap: never a ship
  // placed or removed where it could be seen). Both are drawn by weight (the more met the likelier to go out, the less met the
  // likelier to come in: the counterweights of src/pacing.js), and only when the one going out has been met `gap` more; a ship that
  // changed lately (`hold` s) stays as it is. Not an even draw and not a rota: a lean, which the weights make gradual.
  mix(t, me, rng, recent, clock, world) {
    if (CONFIG.quests.mix.lean >= 1) return;                     // the counterweights are off (CONFIG.quests.mix)
    const C = K(), inZone = [], away = [];
    for (const w of this.walkers) {
      if (t - w.changedAt < C.hold || this.rareOf(w.code) || w.rage) continue;
      const p = w.pose(t), d = Math.hypot(p.x - me[0], p.y - me[1]);
      if (d > C.hide && d <= C.zone) inZone.push(w); else if (d > C.zone) away.push(w);
    }
    if (!inZone.length || !away.length) return;
    const met = (w) => shipContact(recent, w.code, clock);
    const draw = (list, weight) => {
      let u = rng() * list.reduce((n, w) => n + weight(w), 0);
      for (const w of list) { u -= weight(w); if (u < 0) return w; }
      return list[list.length - 1];
    };
    // Going out: the weight is how much of the base weight the counterweight has taken (nothing for a ship not met).
    const out = draw(inZone, (w) => 1 - counterweight(met(w)) + 1e-6), inn = draw(away, (w) => counterweight(met(w)));
    if (met(out) - met(inn) < C.gap) return;
    const a = out.code, b = inn.code, sa = out.speed, sb = inn.speed;
    out.retype(b, sb, t); inn.retype(a, sa, t);
    this.byCode.set(b, out); this.byCode.set(a, inn);
    this.bucketAt = NaN;
    this.swaps++;
    // The ship now in the pilot's part of the grid is another ship: it comes in another paint. The one sent away keeps its own
    // until it comes back in.
    this.repaint(world, out, me, t);
  }

  // ------------------------------------------------------------------------------------------------------------- paints

  keyOf(code) { return this.paints.get(code)?.key ?? OWN; }

  // At every look: after a jump of the pilot (or at the first) every ship is repainted; else a ship that has come into the pilot's
  // part of the grid out of sight is, unless it was painted `hold` s ago and nothing about it wears its paint.
  paintLook(world, t, me) {
    const C = K(), P = CONFIG.traffic.npcPaint;
    const jumped = !this.lastMe || Math.hypot(me[0] - this.lastMe[0], me[1] - this.lastMe[1]) > P.jump;
    this.lastMe = me;
    if (jumped) { this.paintAll(world, t, me); return; }
    for (const w of this.walkers) {
      const p = w.pose(t), d = Math.hypot(p.x - me[0], p.y - me[1]), inZone = d <= C.zone;
      if (inZone && !w.inZone && d > C.hide) {
        const worn = this.wornAbout(world, me, t, w).some((x) => x.id === paintId(w.code, this.keyOf(w.code)));
        if (worn || t - this.paints.get(w.code).at >= P.hold) this.repaint(world, w, me, t);
      }
      w.inZone = inZone;
    }
  }

  // Every ship, wherever it is, nearest the pilot first, each against the ones painted before it.
  paintAll(world, t, me = pilotAt(world)) {
    if (!me) return;
    const order = this.walkers.map((w) => { const p = w.pose(t); return { w, d: Math.hypot(p.x - me[0], p.y - me[1]) }; }).sort((a, b) => a.d - b.d);
    for (const { w } of order) this.paints.set(w.code, { key: null, was: this.keyOf(w.code), at: -Infinity });
    for (const { w, d } of order) { this.repaint(world, w, me, t); w.inZone = d <= K().zone; }
  }

  repaint(world, w, me, t) {
    const key = this.drawPaint(world, w.code, { me, t, self: w });
    this.paints.set(w.code, { key, at: t });
    Object.assign(this.palettes.get(w.code), npcPalette(w.code, key));
    this.repaints++;
  }

  // The paints worn now about the pilot: by the other ships within `zone` of it, and by the quests' ships wherever they are, as
  // [{ code, key, id }] (`id` a paint's identity: a paint's id, or a ship's own scheme with its code).
  wornAbout(world, me, t, self = null) {
    const out = [];
    for (const w of this.walkers) {
      if (w === self) continue;
      const key = this.paints.get(w.code)?.key;
      if (key == null) continue;
      const p = w.pose(t);
      if (Math.hypot(p.x - me[0], p.y - me[1]) <= K().zone) out.push({ code: w.code, key, id: paintId(w.code, key) });
    }
    for (const q of questShips(world)) if (q.paint) out.push({ code: q.code, key: q.paint, id: paintId(q.code, q.paint) });
    return out;
  }

  // A paint for ship `code`, drawn by the counterweights: among the keys it can wear (src/npcPaint.js paintKeysFor) less the ones
  // worn about the pilot (wornAbout) and less what `self` wore before, each by its weight (src/npcPaint.js paintWeights: the
  // colours the pilot met lately lean on it). On the paint stream `world.rng('paint')`, apart from the paths' own.
  drawPaint(world, code, { me = pilotAt(world), t = world.time, self = null } = {}) {
    const recent = (world.recent ??= newRecent()), now = world.ledger.clock, rng = world.rng('paint');
    const worn = me ? this.wornAbout(world, me, t, self) : questShips(world).filter((q) => q.paint).map((q) => ({ code: q.code, key: q.paint, id: paintId(q.code, q.paint) }));
    const taken = new Set(worn.map((x) => x.id)), was = self ? (this.paints.get(code)?.key ?? this.paints.get(code)?.was) : null;
    const all = paintKeysFor(code);
    let cands = all.filter((k) => !taken.has(paintId(code, k)));
    if (cands.length > 1 && was != null) cands = cands.filter((k) => k !== was);
    if (!cands.length) cands = all.filter((k) => k !== was);
    const weights = this.weigh(code, cands, recent, now);
    let u = rng() * weights.reduce((s, x) => s + x, 0);
    for (let i = 0; i < cands.length; i++) { u -= weights[i]; if (u < 0) return cands[i]; }
    return cands[cands.length - 1];
  }

  // The weights of the draw (src/npcPaint.js paintWeights; a check puts an even draw here to measure what they do).
  weigh(code, cands, recent, now) { return paintWeights(code, cands, recent, now); }

  // A paint for a quest's ship (a pilot out of fuel, a wreck, a ship pestered: src/quests.js, src/wrecked.js, src/pester.js), drawn
  // as a fleet ship's is, and noted as met (the quest is about it).
  questPaint(world, code) {
    // A person wears its own paint, in a quest too.
    const own = this.persons ? this.people.get(code)?.paint : null;
    const key = own ?? this.drawPaint(world, code), recent = (world.recent ??= newRecent());
    noteRecent(recent, 'paint', paintNote(code, key), world.ledger.clock, CONFIG.quests.mix.met);
    return key;
  }

  // The lab's `?npcs=N`: N ships (the nearest) set going from places on a ring round the pilot (an ellipse 520 by 260 u, to stand
  // in the view; a place in a block's air moves further out), and every ship repainted, so several are seen at once, each in its
  // paint.
  gather(world, n = 4) {
    const me = pilotAt(world), t = world.time;
    if (!me) return [];
    const clear = (x, y) => grid().blocks.every(([bx, by, br]) => Math.hypot(bx - x, by - y) > br + K().air);
    const ships = this.walkers.map((w) => { const p = w.pose(t); return { w, d: Math.hypot(p.x - me[0], p.y - me[1]) }; }).sort((a, b) => a.d - b.d);
    const moved = [];
    for (let k = 0; k < Math.min(n, ships.length); k++) {
      const a = (k / n) * 2 * Math.PI + 0.4;
      let at = null;
      for (let grow = 1; grow <= 4 && !at; grow += 0.5) {
        const x = me[0] + Math.cos(a) * 520 * grow, y = me[1] + Math.sin(a) * 260 * grow;
        if (clear(x, y)) at = [x, y];
      }
      if (!at) continue;
      const old = ships[k].w, w = new Walker(old.code, old.speed, at, t);
      this.walkers[this.walkers.indexOf(old)] = w;
      this.byCode.set(w.code, w);
      moved.push(w.code);
    }
    for (const w of this.walkers) w.extend(world.rng('npc'), t);
    this.bucketAt = NaN;
    this.paintAll(world, t, me);
    return moved;
  }

  // The NPC ships are solid (SX, 2026-10-02: «Сделай еще что в корабли npc можно врезатсья и если ты на большой скорости влетел то
  // оба корабля могут взорваться»). Each is a box `fill` of its drawing (CONFIG.traffic.npcSolid), turned to its heading: its rows
  // along the way it goes, its columns across (src/traffic.js drawCraft). The ships the pilot's hull is in now, each with the way
  // out of it towards the pilot (`nx`, `ny`), how far in (`depth`), its place and velocity, all in the pilot's sector's units.
  // src/contact.js shipContacts holds the hull out and bounces it off, as off a station; none from O-08.
  contacts(world) {
    const me = pilotAt(world);
    if (!me) return NONE;
    const t = world.time, R = world.ship.radius, ox = me[0] - world.ship.x, oy = me[1] - world.ship.y;
    let out = null;
    for (const w of this.walkers) {
      const p = w.pose(t), dx = me[0] - p.x, dy = me[1] - p.y, box = boxOf(w.code);
      if (!box || dx * dx + dy * dy > (box.reach + R) ** 2) continue;
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      let nu = u - Math.max(-box.half, Math.min(box.half, u)), nv = v - Math.max(-box.side, Math.min(box.side, v));
      const dist = Math.hypot(nu, nv);
      let depth;
      if (dist > 1e-6) {
        if (dist >= R) continue;
        nu /= dist; nv /= dist; depth = R - dist;
      } else {
        // The hull's middle inside the box: out by the nearer side.
        const pu = box.half - Math.abs(u), pv = box.side - Math.abs(v);
        if (pu < pv) { nu = u < 0 ? -1 : 1; nv = 0; depth = pu + R; } else { nu = 0; nv = v < 0 ? -1 : 1; depth = pv + R; }
      }
      const pace = w.speedAt(t), off = w.knocks.length ? w.knocked(t) : null, own = w.rage ?? w.body;
      (out ??= []).push({ walker: w, code: w.code, label: box.label, nx: nu * c - nv * s, ny: nu * s + nv * c, depth,
        x: p.x - ox, y: p.y - oy, angle: p.angle,
        vx: own ? own.vx : Math.cos(p.angle) * pace + (off?.vx ?? 0), vy: own ? own.vy : Math.sin(p.angle) * pace + (off?.vy ?? 0) });
    }
    return out ?? NONE;
  }

  // The ships in the pilot's sector as fixed bodies of the one plane (src/groundPlane.js): each its hull's envelope where its path
  // puts it, moving at its path's pace. They shove loose things aside and are never moved by them: a ship keeps to its route (until
  // 2026-10-13 the pass pushed them off it and a steering took them round obstacles, into planets and kilometres off their paths).
  // The bodies are kept on the walkers and the list on the fleet: nothing is made a step.
  groundBodies(world) {
    const out = this.ground ??= [];
    out.length = 0;
    if (world.sector.hidden) return out;
    const ox = world.sector.col * W, oy = world.sector.row * H, t = world.time;
    for (const w of this.walkers) {
      const box = boxOf(w.code);
      if (!box) continue;
      const p = w.pose(t), radius = box.reach, x = p.x - ox, y = p.y - oy;
      if (x < -radius || y < -radius || x > world.width + radius || y > world.height + radius) continue;
      const b = w.groundProxy ??= { x: 0, y: 0, vx: 0, vy: 0, radius: 0 };
      const own = w.rage ?? w.body, pace = own ? 0 : w.speedAt(t);
      b.x = x; b.y = y; b.radius = radius;
      b.vx = own ? own.vx : Math.cos(p.angle) * pace; b.vy = own ? own.vy : Math.sin(p.angle) * pace;
      out.push(b);
    }
    return out;
  }

  // A ship knocked off its path by a blow (src/contact.js shipContacts; CONFIG.traffic.npcSolid.knock): `vx`, `vy` the velocity it takes
  // (u/s), `at` where it was struck from its middle (u), which turns it. Blows that have come back on are let go.
  knock(world, w, vx, vy, at) {
    const K = CONFIG.traffic.npcSolid.knock, t = world.time, box = boxOf(w.code), reach = Math.max(20, box?.reach ?? 60);
    const spin = Math.max(-K.maxSpin, Math.min(K.maxSpin, K.spin * (at.x * vy - at.y * vx) / (reach * reach)));
    // An enraged ship has no path to come back on: the blow is its own velocity and turn.
    if (w.rage) {
      w.rage.vx += vx; w.rage.vy += vy; w.rage.spin = Math.max(-K.maxSpin, Math.min(K.maxSpin, w.rage.spin + spin));
      w.memo = { t: NaN, pose: null };
      return;
    }
    // A flown ship takes it as a body does: the velocity and the turn, its grip let go while it slides (CONFIG.traffic.flight.skid).
    if (w.body) {
      const b = w.body;
      b.vx += vx; b.vy += vy; b.spin = Math.max(-K.maxSpin, Math.min(K.maxSpin, b.spin + spin)); b.skid = flightConfig().skid.time;
      w.memo = { t: NaN, pose: null };
      return;
    }
    w.knocks = w.knocks.filter((k) => t - k.t < 12 / K.omega);
    w.knocks.push({ t, vx, vy, spin });
    w.memo = { t: NaN, pose: null };
  }

  // A blow of `points` to a ship (src/contact.js shipContacts). One its hull holds keeps flying; one emptied comes apart, and the fleet sends the
  // same ship out again at a free place past `zone` from the pilot, new, to come into its part of the grid as any other does.
  // Returns the pieces it came apart into (its glyphs in its paint, where they stood about its middle), or null.
  hurt(world, w, points) {
    w.hull -= points;
    if (w.hull > 0) return null;
    const t = world.time, pose = w.pose(t), pieces = this.piecesOf(w.code, pose.angle);
    this.unrage(w);
    // A rare ship broken is taken in, to come out again in its time.
    const rare = this.rareOf(w.code);
    if (rare) { this.takeIn(world, rare, t); return pieces; }
    const me = pilotAt(world), rng = world.rng('npc'), spots = grid().spots, open = this.openOf(world);
    const far = spots.filter((q, k) => (!open || open.has(spotSector[k])) && (!me || Math.hypot(q[0] - me[0], q[1] - me[1]) > K().zone));
    // A person comes back at home, out of sight.
    const at = (this.persons && this.homeSpot(world, w.code, me)) || (far.length ? far[Math.min(far.length - 1, Math.floor(rng() * far.length))] : freeNear(w.start));
    const ship = npcShip(w.code);
    const fresh = new Walker(w.code, ship?.speed ?? w.speedAt(t), [at[0], at[1]], t);
    fresh.changedAt = t;
    this.walkers[this.walkers.indexOf(w)] = fresh;
    this.byCode.set(w.code, fresh);
    fresh.extend(rng, t, open);
    this.near.delete(w.code);
    this.bucketAt = NaN;
    return pieces;
  }

  // ------------------------------------------------------------------------------------------------------------- rage

  // The pilot's ship has struck ship `hit.walker` closing at `closing` u/s (src/contact.js, a ship that survived the blow, just before
  // it is knocked): under the damage rule's touch speed (CONFIG.hull.touchSpeed, src/npcRage.js grazeSpeed) it is a graze and nothing happens. Else the ship swears (one of
  // src/greetings.js NPC_CURSES, or its own), not again within `curse.again` s, and rolls its rage: the chance grows with the blow
  // (src/npcRage.js rageChance), drawn from the stream `rage`; at most `most` ships rage at once. A ship that rages already says
  // something at a ram now and then. A rare ship (src/npcFleet.js Fleet.rare) does neither: its comings and goings are its own.
  rammed(world, hit, closing) {
    const R = rageConfig(), w = hit.walker, t = world.time;
    if (closing < grazeSpeed() || w.hull <= 0 || this.byCode.get(w.code) !== w || this.rareOf(w.code)) return;
    const since = t - (this.spoke.get(w.code) ?? -Infinity), rec = this.people.get(w.code);
    // Remembered (Fleet.persons): one more ram, and a grudge for CONFIG.traffic.persons.grudge s of the pilot's clock.
    if (rec && !w.rage) { rec.rammed++; rec.grudge = (world.ledger?.clock ?? t) + CONFIG.traffic.persons.grudge; }
    if (w.rage) {
      w.rage.rams++;
      if (since >= R.say.again && world.rng('rage')() < R.say.ram) this.say(world, w, 'ram');
      return;
    }
    if (since < R.curse.again) return;
    this.say(world, w, 'curse');
    if (this.raging.length < R.most && world.rng('rage')() < rageChance(closing)) this.enrage(world, w, hit);
  }

  // Ship `w` turns on the pilot from where it is, going as it was (the blow's knock comes after, as its own velocity).
  enrage(world, w, hit) {
    const t = world.time, p = w.pose(t);
    w.knocks = [];
    w.body = null;                     // flown, its body is its rage's state until it calms (Fleet.calm boards it again)
    w.rage = startRage(p.x, p.y, hit.vx, hit.vy, p.angle, t);
    w.memo = { t: NaN, pose: null };
    this.raging.push(w);
  }

  // An enraged ship leaves the list (it was broken, or calmed): its state gone, nothing else touched.
  unrage(w) {
    if (!w.rage) return;
    w.rage = null;
    const i = this.raging.indexOf(w);
    if (i >= 0) this.raging.splice(i, 1);
  }

  // The words of ship `w` at the pilot (`pool`: 'curse', 'turn', 'ram', 'calm'), a hail over it in the greeting style (`greet`) in the
  // danger ink (`angry`), where it is now.
  say(world, w, pool) {
    const craft = npcCraftDef(w.code), p = w.pose(world.time), line = lineFrom(pool, craft, this.said, world.rng('rage'));
    world.emit('trafficHail', { craftId: craft.id, label: craft.label, line, x: p.x - world.sector.col * W, y: p.y - world.sector.row * H,
      sectorId: world.sector.id, greet: true, angry: true });
    this.spoke.set(w.code, world.time);
    return line;
  }

  // Every enraged ship a step on (World.step, before the pilot's ship moves): after the pilot's ship, or calmed when its time is up,
  // the pilot is far off (`far`), has been docked or inside a station's keep-out, a planet's cushion or a hole's disc (where it cannot
  // follow) for `refuge` s, is wrecked, or is out of the grid (O-08). It turns on the pilot, saying so, `say.turn` s after the blow.
  stepRage(world, dt) {
    const R = rageConfig(), C = R.chase, t = world.time, ship = world.ship, me = pilotAt(world);
    const lo = [K().edge * C.edge, K().edge * C.edge], hi = [GRID_W - lo[0], GRID_H - lo[1]], blocks = grid().blocks;
    const pilotTop = ship.params?.().maxSpeed ?? Infinity;
    for (const w of this.raging.slice()) {
      const g = w.rage;
      if (this.byCode.get(w.code) !== w) { this.unrage(w); continue; }     // swapped out from under it (the lab's `gather`)
      let why = null;
      if (!me) why = 'away';
      else if (!ship.alive) why = 'wrecked';
      else if (Math.hypot(me[0] - g.x, me[1] - g.y) > C.far) why = 'far';
      else if (t >= g.until) why = 'tired';
      else if (this.sheltered(world, g, me, blocks)) { g.docked += dt; if (g.docked >= C.refuge) why = 'refuge'; } else g.docked = 0;
      if (why) { this.calm(world, w, why); continue; }
      if (!g.told && t - g.since >= R.say.turn) { g.told = true; this.say(world, w, 'turn'); }
      chase(g, { x: me[0], y: me[1], vx: ship.vx, vy: ship.vy }, rageTop(w.speed, pilotTop), blocks, lo, hi, dt);
      w.memo = { t: NaN, pose: null };
    }
    this.bucketAt = NaN;
  }

  // Whether the pilot is out of a raging ship's reach: docked, or inside a block it keeps out of (a station's keep-out, a planet's cushion,
  // a hole's disc) with the ship held off at its wall, within `range` u of it.
  sheltered(world, g, me, blocks) {
    if (world.docked) return true;
    const wall = blocks.find((b) => Math.hypot(me[0] - b[0], me[1] - b[1]) < b[2]);
    return !!wall && Math.hypot(g.x - wall[0], g.y - wall[1]) < wall[2] + rageConfig().chase.range;
  }

  // A raging ship calms (`why`: 'tired', 'far', 'refuge', 'wrecked' or 'away'): it says so if the pilot is near and alive, and is a
  // roaming ship again from where it stands (Walker.restart), the nose its heading, its pace easing down to its own.
  calm(world, w, why) {
    const g = w.rage, t = world.time, me = pilotAt(world);
    const speaks = me && world.ship.alive && why !== 'far' && Math.hypot(me[0] - g.x, me[1] - g.y) <= rageConfig().say.calmReach;
    if (speaks) this.say(world, w, 'calm');
    this.unrage(w);
    w.restart([g.x, g.y], g.angle, Math.hypot(g.vx, g.vy), t);
    // Flown, it goes on as the body it was: where it is, at its speed, its nose as it was.
    if (this.flight === 'step') { w.s = 0; w.body = bodyOf({ x: g.x, y: g.y, angle: g.angle }, 0); w.body.vx = g.vx; w.body.vy = g.vy; }
    w.extend(world.rng('npc'), t, this.openOf(world), me, 0);
    this.bucketAt = NaN;
  }

  // A ship's glyphs in the paint it wears, each where it stands about the ship's middle (world units), for its breaking up; `raw`: its
  // pieces keep those inks when drawn, as the ship does (src/particles.js).
  piecesOf(code, angle) {
    const craft = npcCraftDef(code), box = boxOf(code), palette = this.palettes.get(code) ?? craft?.palette;
    if (!craft || !box) return [];
    const turn = angle + Math.PI / 2, c = Math.cos(turn), s = Math.sin(turn), out = [];
    craft.rows.forEach((row, j) => Array.from(row).forEach((ch, i) => {
      if (ch === ' ') return;
      const lx = (i - (row.length - 1) / 2) * box.cellW, ly = (j - (craft.rows.length - 1) / 2) * box.cellH;
      out.push({ ch, color: palette?.[craft.colors?.[j]?.[i]] ?? craft.ink, dx: lx * c - ly * s, dy: lx * s + ly * c, size: box.scale, raw: true });
    }));
    return out;
  }

  // The crafts in a sector at time `t`: the ships whose place on the grid is in it. A craft is a sector's view of a ship (its path
  // the walker's, shifted to the sector's own units), made once; the walker it follows is whoever is that ship now.
  in(sectorId, t) {
    if (t !== this.bucketAt) {
      this.bucketAt = t;
      for (const list of this.bucket.values()) list.length = 0;
      for (const w of this.walkers) {
        const p = w.pose(t), s = sectorAt(p.x, p.y);
        if (!s) continue;
        // By code, then by sector: a key made of both by a template string was a string made and hashed for every ship, every frame.
        const code = w.code;
        let seen = this.views.get(code);
        if (!seen) this.views.set(code, seen = new Map());
        let view = seen.get(s.id);
        if (!view) {
          const base = npcCraftDef(code), fleet = this;
          view = makeCraft({ ...base, sector: s.id, palette: this.palettes.get(code),
            path: { kind: 'walk', ox: s.col * W, oy: s.row * H, get walker() { return fleet.byCode.get(code); } } });
          seen.set(s.id, view);
        }
        if (!this.bucket.has(s.id)) this.bucket.set(s.id, []);
        this.bucket.get(s.id).push(view);
      }
    }
    return this.bucket.get(sectorId) ?? NONE;
  }
}
const NONE = Object.freeze([]);
export { GRID_W, GRID_H, grid };

// What a ship remembers of the pilot at first (Fleet.people).
// `knew`: how many stations were restored when it last spoke of them (-1 until it first meets the pilot); `favors`: favors it owes the
// pilot for help (src/npcTalk.js giveFavor).
const freshPerson = () => ({ paint: null, met: 0, helped: 0, rammed: 0, grudge: -Infinity, seen: -Infinity, knew: -1, favors: 0 });

// A ship's box (Fleet.contacts): half its length along its heading (`half`, its rows) and half its width across (`side`, its
// columns), `fill` of its drawing in the game's cells at its scale; `reach`, the box's half diagonal; its cells, for its pieces.
const BOXES = new Map();
function boxOf(code) {
  if (BOXES.has(code)) return BOXES.get(code);
  const craft = npcCraftDef(code);
  let box = null;
  if (craft) {
    const S = CONFIG.traffic.npcSolid, scale = craft.size * (craft.small ? 1 : CONFIG.traffic.craftScale);
    const cellH = CONFIG.render.fontSize * CONFIG.render.lineRatio * scale, cellW = CONFIG.render.fontSize * S.cellEm * scale;
    const half = craft.rows.length * cellH / 2 * S.fill, side = Math.max(...craft.rows.map((r) => r.length)) * cellW / 2 * S.fill;
    box = { half, side, reach: Math.hypot(half, side), cellW, cellH, scale, label: craft.label };
  }
  BOXES.set(code, box);
  return box;
}

// A paint's identity as the rule "two never alike" reads it: a paint's id, or a ship's own scheme with its code (two ships in
// their own schemes wear two paints).
export const paintId = (code, key) => (key === OWN ? `${OWN}:${code}` : key);
// The quests' NPC ships, standing or going (src/quests.js, src/wrecked.js, src/pester.js), with the paint each was drawn in.
const questShips = (world) => [world.sideQuest?.drifter, world.sideQuest?.wreck, world.pester, world.drifterLeaving,
  world.wreckLeaving, world.pesterLeaving].filter((q) => q?.code);
