// The pilot's home garage in the world (CONFIG.home; the drawing is labs/graphics/garage-art.js).
//
// The garage is a station of its own kind, `home`, in the start sector: a rock with a cube cut into it and a berth open
// at the bottom. The ship's physics stay what they were. DOCK hands the ship to the garage: from the moment it is chosen
// until the ship is handed back outside the mouth, the ship is drawn where the docking's timeline puts it (the sketch's
// PHASES, labs/graphics/sketches/garage-setting.js), its flight frozen and nothing able to touch it: the world holds it
// `docked` for the whole of it, which is what every part of the game that stands down for a docked ship already reads
// (pirates, rocks, planets, damage, the tow, droids). `world.home` says which phase it is in, so a save, a pirate, the
// menus and the page can read it:
//
//   approach  the ship flies in from where DOCK was chosen to the berth, round the rock if it must (src/approach.js)
//   settle    it stops in the berth; `docked` is said, the threshold lamps turn green
//   fuel      the hose runs out and fills the tank (paid as it fills: CONFIG.home.fuelPrice), left out with a full tank
//   repair    the crane mends the hull, free up to CONFIG.home.freeShare of it and the rest at CONFIG.home.repairPrice a point as far as
//             the wallet goes (paid as it mends), left out with a whole hull or nothing it can do
//   bridge    the bridge runs out to the hull
//   door      the door opens and the room's light falls out; `homeEntered` is said
//   inside    held here until World.leaveHome (the page's room calls it when it closes)
//   close, unbridge, backout, leave   the way out, and the ship is handed back, slow, outside the mouth
//
// Everything here is in the garage's own board cells (64 x 29, the drawing's), turned into the world's units by
// `cellSize`; the station's place is the board's middle. A garage that floats (src/float.js, CONFIG.float.home, softer than the
// stations; SX's item 17, chat G; the game's since 2026-10-04) is turned by `station.angle`: its board, its bay, its berth and the way in
// turn and move with it (the way in is planned in the board's own frame, `turn` 0, and flown turned by World.onStation). Nothing in
// this file draws.

import { CONFIG } from './config.js';
import { TAU, smoothstep as smooth } from './util.js';
import { planWay, wayAt } from './approach.js';
import { turnPoint } from './float.js';

export const BOARD = Object.freeze({ W: 64, H: 29 });
// What of the board the garage's drawing covers, in its cells, over a whole turn of its sway (labs/graphics/garage-art.js homeCells:
// the stone from column 8, the dish to 61, rows 2 to 26): the box its corner marks and its window stand round (SX, 2026-10-08: «У гаража
// слишком большая зона для рамочки сделай уже»; they stood round the whole board until then).
export const BOARD_INK = Object.freeze({ x0: 8, y0: 2, x1: 61, y1: 26 });
// The berth cut into the stone from the bottom: its walls' columns and the row it starts at.
export const NOTCH = Object.freeze({ x0: 26, x1: 36, y0: 17 });
// The berth's rows from its back wall: the crane's rail, the stop's upper marks, the ship, the lower marks, and the
// threshold at the mouth.
export const BERTH = Object.freeze({ rail: 1, top: 2, bottom: 5, mouth: 6 });

// The docking's phases in the order they run; 'away' is the garage at rest (no docking), first in the order the
// drawing's state compares phases by.
export const ORDER = Object.freeze(['approach', 'settle', 'fuel', 'repair', 'bridge', 'door', 'inside', 'close', 'unbridge', 'backout', 'leave']);
const ORDER_ALL = ['away', ...ORDER];
// What the menu says while the garage has the ship (it can only be waited out).
const PHASE_WORDS = Object.freeze({
  approach: 'COMING IN', settle: 'SETTLING', fuel: 'REFUELLING', repair: "REPAIRING HULL", bridge: 'BRIDGE OUT', door: 'OPENING',
  close: 'CLOSING', unbridge: 'BRIDGE IN', backout: 'BACKING OUT', leave: 'LEAVING',
});

const BACKOUT_ROWS = 6;          // how far the ship backs out of the berth, rows
const GATE_ROWS = 8;             // the gate under the mouth, rows below the berth: the glide up the axis starts there
const wrapPi = (a) => { const m = (a + Math.PI) % TAU; return (m < 0 ? m + TAU : m) - Math.PI; };

const MID = Object.freeze({ x: (BOARD.W - 1) / 2, y: (BOARD.H - 1) / 2 });

// ----------------------------------------------------------------------------------------------- geometry

// A board cell in the world's units (u): a glyph cell times CONFIG.home.scale.
export function cellSize() {
  const H = CONFIG.home, R = CONFIG.render;
  return { w: H.cellEm * R.fontSize * H.scale, h: R.fontSize * R.lineRatio * H.scale };
}

// Where a ship rests in the berth: in the middle, its nose a row and a half from the door.
export function berthOf() {
  return { x: (NOTCH.x0 + NOTCH.x1) / 2, y: NOTCH.y0 + (BERTH.top + BERTH.bottom) / 2 };
}

export function isHome(station) {
  return station?.kind === 'home';
}

// A board point (cells, the cell's middle at integers) in the station's own frame, unturned, in the world's units.
function boardLocal(bx, by) {
  const c = cellSize();
  return { x: (bx - MID.x) * c.w, y: (by - MID.y) * c.h };
}
// The world's place of a board point of this station, turned with it.
export function boardToWorld(station, bx, by) {
  const l = boardLocal(bx, by), p = turnPoint(l.x, l.y, station.angle || 0);
  return { x: station.x + p.x, y: station.y + p.y };
}

// The board point of a place in the world.
export function worldToBoard(world, station, x, y) {
  const c = cellSize(), d = world.delta(x, y, station.x, station.y), p = turnPoint(d.x, d.y, -(station.angle || 0));
  return { x: p.x / c.w + MID.x, y: p.y / c.h + MID.y };
}

// How far to either side of the berth's axis DOCK can be chosen, board cells, `down` rows below the berth's middle: the cone
// widens by `widen` a row from `width` at `top`, and by `wide` a row from `deep` on, where the way in is high above
// the rock's lower lips and has room to turn (SX, 2026-10-02: «надо очень точно и близко подлететь ко входу»).
export function bayHalf(down) {
  const bay = CONFIG.home.bay;
  return bay.width + bay.widen * (Math.min(down, bay.deep) - bay.top) + bay.wide * Math.max(0, down - bay.deep);
}

// Whether DOCK can be chosen from where the ship is: below the berth, in a cone that widens downward. A ship beside or
// above the rock would be drawn in through it.
export function inBay(world, station) {
  return inCone(worldToBoard(world, station, world.ship.x, world.ship.y));
}
// (A millionth of a cell of slack: a place on the cone's edge stays on it through the board's round trip to the world and back.)
function inCone(p) {
  const B = berthOf(), down = p.y - B.y;
  return down >= CONFIG.home.bay.top - 1e-6 && Math.abs(p.x - B.x) <= bayHalf(down) + 1e-6;
}

// Where a new game's ship stands: at rest in the bay, below the berth's mouth on its axis, its nose away from the mouth, down the
// screen, so the first push flies the scooter out and on (SX, 2026-10-09: «пусть он как бы будет повернут сразу кабиной вниз ...
// чтобы пользователь нажимая букву w летел вперед на нем»; nose to the mouth until then).
export function startPose(station) {
  const B = berthOf(), at = boardToWorld(station, B.x, B.y + CONFIG.home.bay.start);
  return { x: at.x, y: at.y, angle: Math.PI / 2 + (station.angle || 0) };
}

// ---------------------------------------------------------------------------------------------- the timeline

// The way in, from the ship's place on the board `S` (its heading `face0`, the drawing's: 0 is nose up, clockwise; and in
// `opts` its velocity `v` and push in the world's units),
// flown by the way in's engine (src/approach.js): its points are the garage's, the speed and the nose the engine's.
// From the bay: to the gate on the berth's axis `GATE_ROWS` under the berth (or across to the axis at its own height, when
// the ship is already higher), then the glide up the axis and through the door. From anywhere else (SX, 2026-10-02: «в гараж нужно
// иметь возможность зашвартоваться уже когда у тебя контекстная табличка рядом с ним появилась»): round the rock on its
// nearer side, `ROUND.side` cells off the board, down to `ROUND.below` rows under it (from below `ROUND.under`, the greenhouse's
// top as it swings on its tether, straight down; from below the rock, straight across), across to the axis, and up through the
// gate. From between the greenhouse and the stone (past `ROUND.hang` across) the way goes `ROUND.away` cells across away from the
// greenhouse before it goes down, so a ship that sets off turning does not swing into its glass. `T` is how long it takes. (Until chat G, 2026-10-04,
// `under` was 25, the row below the solar wing's and the old tank's last; the tank is set into the stone now, up out of the way.)
// (`side` and `below` 6.5 since the board's cells went from LOOK_SCALE 1.625 to 1.5, 2026-10-17: the way round as wide in the world's units as
// it was, so its bends are no tighter for the ship, whose size did not change.)
const ROUND = Object.freeze({ side: 6.5, below: 6.5, under: 17, hang: 7, away: 4 });
export function approachPlan(S, face0, opts = {}) {
  const B = berthOf(), c = cellSize();
  const gate = { x: B.x, y: B.y + GATE_ROWS };
  let pts, g;
  if (inCone(S)) {
    // (Higher than the gate already: across to the axis at its own height first, as a quadratic's corner did till then.)
    pts = [S, S.y > gate.y ? gate : { x: B.x, y: S.y }, B];
    g = 1;
  } else {
    pts = roundCorners(S);
    g = pts.length - 2;
  }
  const toWorld = (p) => ({ x: (p.x - MID.x) * c.w, y: (p.y - MID.y) * c.h });
  const plan = planWay({ points: pts.map(toWorld), gate: g, v: opts.v, push: opts.push, angle: face0 - Math.PI / 2,
    speeds: CONFIG.home.approach, endDir: { x: 0, y: -1 } });
  plan.length = plan.L;
  plan.turn = 0;
  return plan;
}
// The way in from where the ship is and how it moves (src/docking.js wayIn): the ship, its course and what stands in the way taken into the
// board's own frame (turned back by the garage's float), the plan in that frame, `turn` 0.
export function homeWayIn(world, station) {
  const ship = world.ship, a = station.angle || 0;
  const v = turnPoint(ship.vx - (station.vx ?? 0), ship.vy - (station.vy ?? 0), -a);
  return approachPlan(worldToBoard(world, station, ship.x, ship.y), ship.angle - a + Math.PI / 2, { v });
}

// The way round: its corners, the start first and the berth last.
function roundCorners(S) {
  const B = berthOf(), W = BOARD.W - 1, low = BOARD.H - 1 + ROUND.below;
  const left = S.x < B.x, side = left ? -ROUND.side : W + ROUND.side, beyond = left ? S.x <= side : S.x >= side;
  const pts = [{ x: S.x, y: S.y }];
  // (From under the rock already, straight across.)
  if (S.y < low && S.y >= ROUND.under) {
    // Straight down first; from beside the greenhouse, across away from it a little before.
    if (left && S.x > ROUND.hang) pts.push({ x: S.x + ROUND.away, y: S.y + 1 });
    pts.push({ x: pts.at(-1).x, y: low });
  }
  else if (S.y < low) {
    if (!beyond) pts.push({ x: side, y: S.y });           // out past the rock's side at its own height
    pts.push({ x: side, y: low });                         // down past its bottom (from beyond the side, straight there)
  }
  pts.push({ x: B.x, y: low }, { x: B.x, y: B.y + GATE_ROWS }, { x: B.x, y: B.y });
  return pts;
}

// The direction the ship leaves in (world units, unit length): down and to the left, as the sketch's ship does.
function leaveDirection() {
  const c = cellSize(), dx = -22 * c.w, dy = 8 * c.h, n = Math.hypot(dx, dy);
  return { x: dx / n, y: dy / n };
}
// How far the leave carries the ship: it speeds up to `exitSpeed` over the phase, so (distance / duration) is half of it.
const leaveDistance = () => CONFIG.home.exitSpeed * CONFIG.home.phases.leave / 2;

// The ship's place and heading in a phase, in board cells (nose up at 0, clockwise), and the burns it asks of its
// engines. Every value comes from the phase and how far through it (`u`, 0..1) alone, so a still can be taken anywhere.
export function homePose(plan, phase, u) {
  const B = berthOf(), c = cellSize();
  if (phase === 'approach') {
    const p = wayAt(plan, u * plan.T);
    return { x: p.x / c.w + MID.x, y: p.y / c.h + MID.y, facing: wrapPi(p.angle + Math.PI / 2), thrust: p.thrust, retro: p.retro };
  }
  if (phase === 'backout') return { x: B.x, y: B.y + smooth(u) * BACKOUT_ROWS, facing: 0, thrust: false, retro: u < 0.55 };
  if (phase === 'leave') {
    const dir = leaveDirection(), d = leaveDistance() * u * u, end = Math.atan2(dir.x, -dir.y);
    return { x: B.x + dir.x * d / c.w, y: B.y + BACKOUT_ROWS + dir.y * d / c.h, facing: end * smooth(u / 0.35), thrust: u > 0.25, retro: false };
  }
  return { x: B.x, y: B.y, facing: 0, thrust: false, retro: false };
}

// Where the ship is handed back and how it leaves: the end of the leave (turned with a floating garage, and moving as it does).
export function homeExit(station) {
  const a = station.angle || 0, pose = homePose(null, 'leave', 1), at = boardToWorld(station, pose.x, pose.y);
  const d = leaveDirection(), dir = turnPoint(d.x, d.y, a);
  const sv = a || station.spin ? { x: station.vx ?? 0, y: station.vy ?? 0 } : { x: 0, y: 0 };
  return { x: at.x, y: at.y, angle: pose.facing - Math.PI / 2 + a, vx: dir.x * CONFIG.home.exitSpeed + sv.x, vy: dir.y * CONFIG.home.exitSpeed + sv.y };
}

// What the garage is doing in a phase, and how far each part is out: the drawing's state (labs/graphics/garage-art.js).
// `docked` is the green lamps; `near` the lamps' quickening; `fuelled` how far the hose has run the tank down.
export function dockState(phase, u = 0) {
  const st = { phase, near: 0, hose: 0, flow: false, crane: 0, sparks: false, bridge: 0, door: 0, docked: false, fuelled: 0, beacon: false };
  const i = ORDER_ALL.indexOf(phase), past = (n) => i > ORDER_ALL.indexOf(n);
  if (phase === 'approach') st.near = smooth((u - 0.2) / 0.8);
  else if (phase === 'backout') st.near = 1 - u;
  else if (phase !== 'away' && phase !== 'leave') { st.near = 1; st.docked = phase !== 'settle'; }
  if (phase === 'fuel') {
    st.hose = smooth(u / 0.25) * (1 - smooth((u - 0.82) / 0.18));
    st.flow = u > 0.25 && u < 0.82;
    st.fuelled = smooth((u - 0.25) / 0.57);
  } else if (past('fuel') && i < ORDER_ALL.indexOf('leave')) st.fuelled = 1;
  else if (phase === 'leave') st.fuelled = 1 - smooth(u);     // the store's tank fills again as the ship goes
  if (phase === 'repair') {
    st.crane = Math.sin(Math.PI * smooth(u));
    st.sparks = u > 0.3 && u < 0.7;
  }
  if (phase === 'bridge') st.bridge = smooth(u);
  else if (past('bridge') && !past('close')) st.bridge = 1;
  else if (phase === 'unbridge') st.bridge = 1 - smooth(u);
  if (phase === 'door') st.door = smooth(u);
  else if (phase === 'inside') st.door = 1;
  else if (phase === 'close') st.door = 1 - smooth(u);
  return st;
}

// The garage's state for the drawing: its docking's while it has the ship, else at rest; `world.homeGuide` (the
// page's pointer to it, G) sends rings from the dish.
export function homeDockState(world, station) {
  const h = world.home && world.home.stationId === station.id ? world.home : null;
  const st = dockState(h ? h.phase : 'away', h ? h.u : 0);
  st.beacon = !!world.homeGuide;
  return st;
}

// ----------------------------------------------------------------------------------------------- in the world

export function homeStation(world) {
  return world.stations.find(isHome) || null;
}

// DOCK at the garage (World.dock): from the ship's place and its course, the garage takes the ship over.
export function startHomeDocking(world, station) {
  const plan = homeWayIn(world, station);
  const P = CONFIG.home.phases;
  world.home = {
    stationId: station.id, phase: 'approach', t: 0, u: 0, plan, fuel: null, hull: null,
    dur: { approach: plan.T, settle: P.settle, fuel: P.fuel, repair: P.repair, bridge: P.bridge, door: P.door, inside: Infinity,
      close: P.close, unbridge: P.unbridge, backout: P.backout, leave: P.leave },
  };
  world.docked = station.id;
  if (world.pilot) world.pilot.homed = true;              // the radio's HOME step is done (src/guide.js)
  world.emit('homeDocking', { stationId: station.id, label: station.label });
  // A docked ship is safe: pirates break off and fly away.
  world.endEncounter('docked', { leave: true });
}

// The page's room is closed: the door shuts, the bridge goes in, the ship backs out and leaves. Only from `inside`.
export function leaveHome(world) {
  const h = world.home;
  if (!h || h.phase !== 'inside') return false;
  h.t = 0;
  enter(world, h, 'close');
  world.emit('homeLeaving', { stationId: h.stationId });
  return true;
}

// One step of the docking, in World.step in place of a docked ship's easing to its station: the phases advance (a
// phase with nothing to do has no time), the ship is put where its phase says and the tank and the hull follow.
export function stepHome(world, dt) {
  const h = world.home, ship = world.ship;
  const station = world.stations.find((s) => s.id === h.stationId);
  if (!station) { world.home = null; world.docked = null; return; }
  h.t += dt;
  for (;;) {
    const d = h.dur[h.phase];
    if (h.t < d) break;
    h.t -= d;
    exit(world, h, station);
    const next = ORDER[ORDER.indexOf(h.phase) + 1];
    if (!next) { handBack(world, h, station); return; }
    enter(world, h, next);
  }
  const d = h.dur[h.phase];
  h.u = Number.isFinite(d) && d > 0 ? h.t / d : 0;
  tend(world, h);
  // The way in is the engine's, flown as it says (its burns drawn and heard), turned with a floating garage; the rest is the
  // garage's own timeline.
  if (h.phase === 'approach') {
    ship.flyTo(dt, world.onStation(station, wayAt(h.plan, h.t), h.plan));
    return;
  }
  const pose = homePose(h.plan, h.phase, h.u), at = boardToWorld(station, pose.x, pose.y);
  if (dt > 0) { ship.vx = (at.x - ship.x) / dt; ship.vy = (at.y - ship.y) / dt; }
  ship.x = at.x; ship.y = at.y;
  ship.angle = wrapPi(pose.facing - Math.PI / 2 + (station.angle || 0));
  ship.angVel = 0;
  ship.thrusting = pose.thrust; ship.retroing = pose.retro;
  ship.spool = 0; ship.retroSpool = 0;
  ship.animating = false; ship.wasAnimating = false;
  ship.animCursor = 0; ship.frameTimer = 0;
}

// What the world's own fields hold while a phase runs: the tank fills and is paid for as it fills, the hull is mended.
function tend(world, h) {
  if (h.phase === 'fuel' && h.fuel) {
    const F = h.fuel, fill = dockState('fuel', h.u).fuelled;
    world.fuel = Math.min(world.fuelTank, F.from + F.units * fill);
    const owed = F.price > 0 ? Math.ceil(F.units * fill * F.price - 1e-9) : 0;
    world.ledger.credits -= owed - F.paid;
    F.paid = owed;
  } else if (h.phase === 'repair' && h.hull) {
    const H = h.hull, mended = Math.floor(H.points * smooth((h.u - 0.3) / 0.4));
    world.hull = Math.min(world.hullMax, H.from + mended);
    // What is mended past the free share is paid as it goes, never more than was quoted (homeQuote).
    const owed = Math.min(H.cost, Math.ceil(Math.max(0, mended - H.free) * H.price - 1e-9));
    world.ledger.credits -= owed - H.paid;
    H.paid = owed;
  }
}

// What the garage's crane will do for this hull and this wallet (SX's economy of 2026-10-04, proposal.json `hull`: free to 60 % of the
// chassis' whole hull, the rest at 1 CR a point as far as the wallet goes; until then it mended all of it free): `free` points free,
// `paid` points for `cost` CR, `points` in all. The DOCK row says it before the ship goes in, and the docking does no more.
export function homeQuote(world, credits = world.ledger.credits) {
  const H = CONFIG.home, max = world.hullMax, hull = world.hull;
  const line = Math.floor(max * H.freeShare);
  const free = Math.max(0, Math.ceil(line - hull - 1e-9));
  const room = Math.max(0, Math.ceil(max - Math.max(hull, line) - 1e-9));
  const afford = H.repairPrice > 0 ? Math.floor(Math.max(0, credits) / H.repairPrice + 1e-9) : Infinity;
  const paid = Math.min(room, afford);
  return { free, paid, points: free + paid, cost: Math.ceil(paid * H.repairPrice - 1e-9), price: H.repairPrice };
}

function enter(world, h, name) {
  h.phase = name;
  if (name === 'fuel') {
    // As much as the tank takes and the wallet pays for, in whole CR (the ceiling of the units times the price); none
    // for a pilot with no credit. Under a unit missing is a full tank, as at any station.
    const price = CONFIG.home.fuelPrice, missing = world.fuelTank - world.fuel;
    const afford = price > 0 ? Math.floor(world.ledger.credits / price + 1e-9) : Infinity;
    const units = Math.max(0, Math.min(missing, afford));
    if (missing >= 1 && units >= 1) h.fuel = { from: world.fuel, units, price, paid: 0 };
    else h.dur.fuel = 0;
  } else if (name === 'repair') {
    // The quote of this moment (the fuel just paid for is out of the wallet): free to the line, the rest as the wallet allows.
    const q = homeQuote(world);
    if (q.points >= 1) h.hull = { from: world.hull, points: q.points, free: q.free, cost: q.cost, price: q.price, paid: 0 };
    else h.dur.repair = 0;
  } else if (name === 'inside') {
    world.emit('homeEntered', { stationId: h.stationId, label: world.stations.find((s) => s.id === h.stationId)?.label,
      fuel: world.fuel, hull: world.hull, credits: world.ledger.credits });
  }
}

function exit(world, h, station) {
  const at = { sectorId: world.sector.id, x: station.x, y: station.y };
  if (h.phase === 'settle') {
    world.emit('docked', { stationId: station.id, label: station.label });
  } else if (h.phase === 'fuel' && h.fuel) {
    const F = h.fuel;
    h.u = 1; tend(world, h);
    world.fuel = Math.min(world.fuelTank, F.from + F.units);
    world.emit('refueled', { ...at, units: F.units, cost: F.paid, fuel: world.fuel, credits: world.ledger.credits });
  } else if (h.phase === 'repair' && h.hull) {
    const H = h.hull;
    h.u = 1; tend(world, h);
    world.hull = Math.min(world.hullMax, H.from + H.points);
    world.emit('hullRepaired', { ...at, points: H.points, cost: H.paid, hull: world.hull, credits: world.ledger.credits });
  }
}

// The leave is over: the ship is its own again, outside the mouth, slow, as an undocked ship is (World.undock).
function handBack(world, h, station) {
  const ship = world.ship, out = homeExit(station);
  world.home = null;
  world.docked = null;
  ship.x = out.x; ship.y = out.y; ship.angle = out.angle;
  ship.vx = out.vx; ship.vy = out.vy;
  ship.thrusting = false; ship.retroing = false;
  // The container leaves the berth with the hull, not yanked out of it by the tether.
  if (world.cargo) { world.cargo.vx = ship.vx; world.cargo.vy = ship.vy; }
  world.leavingStation = station.id;
  ship.invuln = Math.max(ship.invuln, 1.2);
  world.emit('undocked', { stationId: station.id });
}

// Why DOCK cannot be chosen now, in the menu's words, or null: the ship is too fast. Wherever the garage's menu stands
// DOCK may be chosen (SX, 2026-10-02); from outside the bay the way in goes round the rock (approachPlan). Until then it
// had to be lined up below the berth (LINE UP BELOW THE BERTH).
export function dockRefusal(world, station) {
  const limit = CONFIG.station.dockSpeed;
  return Math.hypot(world.ship.vx, world.ship.vy) > limit ? `BRAKE BELOW ${limit}` : null;
}

// The DOCK row's quote of the hull's mending, or null when there is none to do: «HULL +30 FREE / +40 FOR 40 CR».
function quoteNote(q) {
  if (q.points <= 0) return null;
  const parts = [];
  if (q.free > 0) parts.push(`+${q.free} HULL FREE`);
  if (q.paid > 0) parts.push(`+${q.paid} HULL: ${q.cost} CR`);
  return `${parts.join(' / ')}`;
}

// The berth's middle in the world, where a ship stands in it.
export function berthPoint(station) {
  const B = berthOf();
  return boardToWorld(station, B.x, B.y);
}

// The garage's service from outside, without docking (SX, 2026-10-17: «на цифру 1 в гараже заправка и восстановление здоровья. Не докаясь, а
// 2 док»): the tank filled and the hull mended at once, at the docking's own prices: CONFIG.home.fuelPrice a unit as far as the wallet goes
// (the docking's `fuel`), then the crane's quote out of what is left (homeQuote). `units` of fuel for `fuelCost` CR, the hull's quote `hull`.
export function homeServiceQuote(world) {
  const price = CONFIG.home.fuelPrice, missing = world.fuelTank - world.fuel;
  const afford = price > 0 ? Math.floor(world.ledger.credits / price + 1e-9) : Infinity;
  const units = missing >= 1 ? Math.max(0, Math.min(missing, afford)) : 0;
  const fuelCost = units >= 1 && price > 0 ? Math.ceil(units * price - 1e-9) : 0;
  return { units: units >= 1 ? units : 0, fuelCost, hull: homeQuote(world, world.ledger.credits - fuelCost) };
}
function homeService(world, station) {
  const q = homeServiceQuote(world), at = { sectorId: world.sector.id, x: station.x, y: station.y };
  if (q.units <= 0 && q.hull.points < 1) { world.emit('actionRefused', { reason: serviceNote(world, q) }); return; }
  if (q.units > 0) {
    world.ledger.credits -= q.fuelCost;
    world.fuel = Math.min(world.fuelTank, world.fuel + q.units);
    world.emit('refueled', { ...at, units: q.units, cost: q.fuelCost, fuel: world.fuel, credits: world.ledger.credits });
  }
  if (q.hull.points >= 1) {
    world.ledger.credits -= q.hull.cost;
    world.hull = Math.min(world.hullMax, world.hull + q.hull.points);
    world.emit('hullRepaired', { ...at, points: q.hull.points, cost: q.hull.cost, hull: world.hull, credits: world.ledger.credits });
  }
}
// The row's note, short enough for the window's note column (about twelve cells; the public build showed «TANK FULL /…»): what it costs,
// or why it can do nothing.
function serviceNote(world, q) {
  if (q.units <= 0 && q.hull.points < 1) return world.fuelTank - world.fuel >= 1 || world.hull < world.hullMax ? 'NEED CR' : 'ALL FULL';
  const cost = q.fuelCost + q.hull.cost;
  return cost > 0 ? `${cost} CR` : 'FREE';
}

// The garage's menu: from outside, its service (REFUEL + REPAIR) and DOCK from the bay and slow enough; while it has the ship, what it is
// doing (nothing to choose); inside, the way out and the hangar. INFO is added by the caller.
export function homeActions(world, station) {
  const h = world.home && world.home.stationId === station.id ? world.home : null;
  if (!h) {
    const why = dockRefusal(world, station), q = homeServiceQuote(world);
    return [{ label: 'REFUEL + REPAIR', disabled: q.units <= 0 && q.hull.points < 1, note: serviceNote(world, q), run: () => homeService(world, station) },
      { label: 'DOCK', disabled: !!why, note: why ?? quoteNote(homeQuote(world)), run: () => world.dock(station) }];
  }
  if (h.phase === 'inside') {
    return [{ label: 'LEAVE', run: () => world.leaveHome() },
      { label: 'HANGAR', run: () => world.emit('hangarRequested', { stationId: station.id }) }];
  }
  return [{ label: PHASE_WORDS[h.phase], disabled: true, note: null, run: () => {} }];
}
