import { clamp, mixHex, mulberry32 } from '../../src/util.js';
import { ROLES, PALETTE } from '../../src/roles.js';

// Motion for the player's ship, drawn around SX's frame 0 instead of his exhaust loop
// (SX, 2026-09-30: "переделай спрайт корабля ... новую анимацию движения"). Presentation
// only: nothing here reads or writes physics, and the module never touches the input
// or the model it is given (checks/ship-motion.mjs proves both with frozen objects).
//
// One look (SX chose it, 2026-09-30: the puffs, with the cockpit glass), one set of rules:
//   thrust  - the two rear-centre nozzles fire backwards, sized by an engine spool
//   retro   - the two front nozzles fire forwards
//   turn    - turning left: mainly the FRONT-RIGHT nozzle fires right; over ~700 u/s the
//             REAR-LEFT side nozzle also fires left. Turning right mirrors it.
//   brake   - short alternating puffs from the two side nozzles, outward
//   glass   - the left @ goes one ink step darker while turning left, the right @ while
//             turning right (a glint sliding off the cockpit glass)
//   wings   - MODERN's side of a turn darkens from the nose back, each row's outermost
//             glyph on that side (bankDraws); in reverse both wings take their brake pose
//             (wingFlip)
//
// Data flow: input -> stepShipMotion (state) -> drawShipMotion (glyph calls). The state
// is plain data; the drawing reads it and the model's cells, and nothing else.
//
// Geometry is in model cells (x right, y down, the nose is -y, origin at the pivot), so a
// nozzle turns with the ship. Distances along an exhaust are in "em": one cell height at
// the ship's scale, so a lateral jet and a rear jet of the same length look as long.

// ---- the numbers -----------------------------------------------------------------
export const MOTION = Object.freeze({
  // Engine spool for the rear (thrust) and front (retro) nozzles, the shape of
  // src/chassis.js: snaps to the floor on press, climbs to 1, falls fast on release.
  spool: Object.freeze({ floor: 0.3, riseThrust: 0.6, riseRetro: 0.4, fall: 0.15 }),
  // The turning nozzles ease in and out so a tap is a short tick, not a flash.
  jetEase: Object.freeze({ rise: 0.05, fall: 0.12 }),
  // The rear side nozzle joins a turn between these speeds (u/s), easing in.
  fastFrom: 700,
  fastTo: 1000,
  // How hard the rear side nozzle fires at full speed, against the front one.
  sideShare: 0.85,
  // Brake puffs: one full left-right cycle, seconds; each side owns half of it.
  brakePeriod: 0.26,
  brakeShare: 0.9,
  // Glass: seconds to swing between the two inks (a crossfade by alpha).
  glassSeconds: 0.12,
  // MODERN's side of a turn: how far toward black it goes (bankDraws), and the seconds the darkening takes to run from the nose to the tail.
  wingDark: 0.45,
  bankSeconds: 0.28,
  // A port at or below this level is not firing (and is not drawn).
  fire: 0.05,
  maxPuffs: 160,
});

// Where the nozzles are, from the art (see nozzlesOf): the tips of the glyphs themselves.
// SX, 2026-09-30, choosing A and the glass: «позиционирование начальной точки поправил
// постарался подвести к вершинам точек, но при этом с равными отступами от вершин в
// размер точки», marking the outer ends of the two front arcs and the bottom ends of the
// four struts. So a nozzle is a glyph's ink vertex, and the first puff sits one dot's
// width clear of it, the same at every nozzle.
//
// Ink vertices as a share of the font size, from the glyph's centre (drawn centred, middle
// baseline): the bottom-left end of '/', the bottom-right end of '\', the outer ends of the
// arcs, and the first puff's dot. SF Mono (what SX's Mac draws the game in), measured at
// 400 px on 2026-09-30; `cellW` is the font's advance, so x converts to cells.
export const VERTICES = Object.freeze({
  '/': Object.freeze([-0.2125, 0.3625]),
  '\\': Object.freeze([0.21, 0.3625]),
  '◝': Object.freeze([-0.1475, -0.2338]),
  '◜': Object.freeze([0.1475, -0.2288]),
  dot: Object.freeze({ width: 0.1475, centre: Object.freeze([-0.0012, -0.0212]) }),
  cellW: 0.6182,
});

// The first puff's dot ('∙'), in multiples of the ship's glyph size, and every puff's
// size in turn (the glyphs a puff goes through as it ages): the warm-up renders these
// at the ship's base scale before the flight (labs/graphics/warmup.js).
export const FIRST_DOT = 1.35;
export const PUFF_SIZES = Object.freeze([FIRST_DOT, 1.5, 1.1, 0.9]);

const DOWN = Object.freeze([0, 1]);
const UP = Object.freeze([0, -1]);
const LEFT = Object.freeze([-1, 0]);
const RIGHT = Object.freeze([1, 0]);

// Every jet the ship can fire is one nozzle firing one way for one reason. `dir` is the
// exhaust direction in model space; the ship is pushed the other way.
export const PORTS = Object.freeze([
  Object.freeze({ id: 'rearL', nozzle: 'rearL', dir: DOWN, kind: 'drive' }),
  Object.freeze({ id: 'rearR', nozzle: 'rearR', dir: DOWN, kind: 'drive' }),
  Object.freeze({ id: 'frontL.retro', nozzle: 'frontL', dir: UP, kind: 'retro' }),
  Object.freeze({ id: 'frontR.retro', nozzle: 'frontR', dir: UP, kind: 'retro' }),
  // Fires left (pushes the nose right): used when turning RIGHT.
  Object.freeze({ id: 'frontL.turn', nozzle: 'frontL', dir: LEFT, kind: 'turn' }),
  // Fires right (pushes the nose left): used when turning LEFT.
  Object.freeze({ id: 'frontR.turn', nozzle: 'frontR', dir: RIGHT, kind: 'turn' }),
  Object.freeze({ id: 'sideL.turn', nozzle: 'sideL', dir: LEFT, kind: 'turn' }),
  Object.freeze({ id: 'sideR.turn', nozzle: 'sideR', dir: RIGHT, kind: 'turn' }),
  Object.freeze({ id: 'sideL.brake', nozzle: 'sideL', dir: LEFT, kind: 'brake' }),
  Object.freeze({ id: 'sideR.brake', nozzle: 'sideR', dir: RIGHT, kind: 'brake' }),
]);
const PORT_INDEX = Object.freeze(Object.fromEntries(PORTS.map((p, i) => [p.id, i])));

// Reading order for captions: nose, flanks, tail.
export const NOZZLES = Object.freeze(['frontL', 'frontR', 'sideL', 'sideR', 'rearL', 'rearR']);

// Per kind of jet: the puffs (rate per second, reach in em). Main thrust emits more,
// reaches farther.
const LOOK = Object.freeze({
  drive: Object.freeze({ ink: 'drive', rate: 70, reach: 3.4 }),
  retro: Object.freeze({ ink: 'retro', rate: 44, reach: 2.8 }),
  turn: Object.freeze({ ink: 'turn', rate: 44, reach: 1.9 }),
  brake: Object.freeze({ ink: 'brake', rate: 50, reach: 1.7 }),
});

// Role inks from the lab (src/roles.js). Drive green is the engine's colour and
// amber is the brake lamp's; the turning jets are the quiet white of a cold-gas vent.
// Glass: the game paints the @ in ROLES.highlight (world-art.js shipInk maps the accent
// key to it); the darker step is PALETTE.gray, one step down the palette's ladder
// (white, gray, blue, depth). Blue would be two-plus steps and reads as a black window.
export const MOTION_INKS = Object.freeze({
  drive: ROLES.driveActive,
  retro: ROLES.driveActive,
  turn: ROLES.textPrimary,
  brake: ROLES.brakeActive,
  glassBase: ROLES.highlight,
  glassDark: PALETTE.gray,
});

// ---- nozzle geometry, read from the art ------------------------------------------
const nozzleCache = new WeakMap();

function extreme(cells, ch, side) {
  let best = null;
  for (const c of cells || []) {
    if (c.ch !== ch) continue;
    if (!best || (side < 0 ? c.x < best.x : c.x > best.x)) best = c;
  }
  return best;
}

// Where the six nozzles are, in model cells (x in columns, y in rows, from the pivot),
// from SX's art so they follow it when he redraws (ships/spaceship.json):
//   front - the outer ends of the ◝ (left) and ◜ (right) arcs of the top row
//   rear  - the bottom ends of the two inner struts: the inner '\\' and '/' of '/\\/\\'
//   side  - the bottom ends of the two outer struts: the outer '/' and '\\'
// A model without those glyphs falls back to its idle frame's outline: the top corners
// for the front, the bottom corners for the sides, beside the middle for the rear.
// A model whose file places them (`nozzles`, src/asciiModel.js: the hero looks of the pilot's
// ship, src/shipLooks.js, whose lines are not SX's arcs and struts) has them where it says.
export function nozzlesOf(model, V = VERTICES) {
  if (model.nozzles) return model.nozzles;
  const hit = nozzleCache.get(model);
  if (hit && hit.V === V) return hit.out;
  const idle = (model.frames && model.frames[model.idleFrame]) || model.cells;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of idle) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const half = Math.max(Math.abs(minX), Math.abs(maxX));
  // A glyph's vertex, in model cells.
  const tip = (c) => ({ x: c.x + V[c.ch][0] / V.cellW, y: c.y + V[c.ch][1] });

  const arcL = extreme(idle, '◝', -1), arcR = extreme(idle, '◜', 1);
  // The struts: the lowest row that has them, outer and inner on each side.
  const struts = idle.filter((c) => c.ch === '/' || c.ch === '\\');
  const low = struts.length ? Math.max(...struts.map((c) => c.y)) : null;
  const row = struts.filter((c) => c.y === low);
  const outL = extreme(row, '/', -1), outR = extreme(row, '\\', 1);
  const inner = (ch, side) => row.filter((c) => c.ch === ch && Math.sign(c.x) === side)
    .sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0] || null;
  const inL = inner('\\', -1), inR = inner('/', 1);

  const out = {
    frontL: arcL ? tip(arcL) : { x: -(half + 0.5), y: minY },
    frontR: arcR ? tip(arcR) : { x: half + 0.5, y: minY },
    sideL: outL ? tip(outL) : { x: -(half + 0.5), y: maxY + 0.5 },
    sideR: outR ? tip(outR) : { x: half + 0.5, y: maxY + 0.5 },
    rearL: inL && inL !== outL ? tip(inL) : { x: -0.25, y: maxY + 0.5 },
    rearR: inR && inR !== outR ? tip(inR) : { x: 0.25, y: maxY + 0.5 },
  };
  nozzleCache.set(model, { V, out });
  return out;
}

// A page measures its own font once and uses that instead of the SF Mono table: the same
// scan as the table was made with (glyph drawn centred at 200 px, ink above half alpha).
// Returns the table unchanged where there is no canvas (the checks).
const measured = new Map();
export function measureVertices(fontFamily, makeCanvas = () => globalThis.document?.createElement('canvas')) {
  if (!fontFamily) return VERTICES;
  if (measured.has(fontFamily)) return measured.get(fontFamily);
  const canvas = makeCanvas();
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return VERTICES;
  const FS = 200, SIZE = 400;
  canvas.width = SIZE; canvas.height = SIZE;
  ctx.font = `${FS}px ${fontFamily}`;
  const scan = (ch) => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, SIZE / 2, SIZE / 2);
    const d = ctx.getImageData(0, 0, SIZE, SIZE).data, pts = [];
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) if (d[(j * SIZE + i) * 4 + 3] > 128) pts.push([i, j]);
    return pts;
  };
  const f = (v) => (v - SIZE / 2) / FS;
  const table = { cellW: ctx.measureText('M').width / FS };
  for (const ch of ['/', '\\']) {
    const pts = scan(ch);
    if (!pts.length) return VERTICES;
    const bottom = Math.max(...pts.map((p) => p[1])), xs = pts.filter((p) => p[1] === bottom).map((p) => p[0]);
    table[ch] = [f(ch === '/' ? Math.min(...xs) : Math.max(...xs)), f(bottom)];
  }
  for (const ch of ['◝', '◜']) {
    const pts = scan(ch);
    if (!pts.length) return VERTICES;
    const edge = ch === '◝' ? Math.min(...pts.map((p) => p[0])) : Math.max(...pts.map((p) => p[0]));
    const ys = pts.filter((p) => p[0] === edge).map((p) => p[1]);
    table[ch] = [f(edge), f(ys.reduce((a, b) => a + b, 0) / ys.length)];
  }
  const dot = scan('∙');
  if (!dot.length) return VERTICES;
  const xs = dot.map((p) => p[0]), ys = dot.map((p) => p[1]);
  table.dot = { width: (Math.max(...xs) - Math.min(...xs)) / FS,
    centre: [f((Math.max(...xs) + Math.min(...xs)) / 2), f((Math.max(...ys) + Math.min(...ys)) / 2)] };
  measured.set(fontFamily, table);
  return table;
}

// ---- state -----------------------------------------------------------------------
export function createShipMotion(seed = 1) {
  const zeros = () => Object.fromEntries(PORTS.map((p) => [p.id, 0]));
  return {
    t: 0,
    spool: 0,          // rear nozzles, 0..1
    retroSpool: 0,     // front nozzles, 0..1
    brakeClock: 0,     // seconds since the brake went down; 0 when it is up
    levels: zeros(),   // what each port is doing now, 0..1
    emit: zeros(),     // fractional puffs owed
    puffs: [],         // live puffs { port, age, life, reach, side, k }
    glass: { left: 0, right: 0 },
    bank: { left: 0, right: 0 },   // MODERN's side of a turn darkening, 0..1 (bankDraws)
    flip: 0,                       // the wings turned over in reverse, 0..1 (wingFlip)
    rng: mulberry32(seed),
  };
}

const flag = (v) => clamp(Number(v) || 0, 0, 1);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function follow(v, target, dt, rise, fall) {
  return target > v ? Math.min(target, v + dt / rise) : Math.max(target, v - dt / fall);
}
function spoolStep(v, on, dt, rise) {
  const S = MOTION.spool;
  if (on) return Math.min(1, Math.max(v, S.floor) + dt * (1 - S.floor) / rise);
  return Math.max(0, v - dt / S.fall);
}

// input: { thrust, retro, turn (-1 left .. 1 right), brake, speed (u/s) }, read only.
export function stepShipMotion(state, input, dt) {
  if (!(dt > 0)) return state;
  dt = Math.min(dt, 0.1);
  const M = MOTION;
  state.t += dt;

  const thrust = flag(input.thrust) > 0;
  const retro = flag(input.retro) > 0 && !thrust;   // as Ship.step: retro yields to thrust
  const turn = clamp(Number(input.turn) || 0, -1, 1);
  const left = Math.max(0, -turn), right = Math.max(0, turn);
  const braking = flag(input.brake) > 0;
  const fast = smooth(M.fastFrom, M.fastTo, Math.max(0, Number(input.speed) || 0));

  state.spool = spoolStep(state.spool, thrust, dt, M.spool.riseThrust);
  state.retroSpool = spoolStep(state.retroSpool, retro, dt, M.spool.riseRetro);

  // Brake: left puffs first, then right, and so on; the clock restarts on every press.
  state.brakeClock = braking ? state.brakeClock + dt : 0;
  const leftTurn = braking && (state.brakeClock / M.brakePeriod) % 1 < 0.5;

  const want = {
    rearL: state.spool, rearR: state.spool,
    'frontL.retro': state.retroSpool, 'frontR.retro': state.retroSpool,
    'frontL.turn': right,           // turning right: the front-left nozzle fires left
    'frontR.turn': left,            // turning left: the front-right nozzle fires right
    'sideL.turn': left * fast * M.sideShare,
    'sideR.turn': right * fast * M.sideShare,
    'sideL.brake': braking && leftTurn ? M.brakeShare : 0,
    'sideR.brake': braking && !leftTurn ? M.brakeShare : 0,
  };
  for (const p of PORTS) {
    const eased = p.kind === 'drive' || p.kind === 'retro';   // the spools are already smooth
    const next = eased ? want[p.id]
      : follow(state.levels[p.id], want[p.id], dt, p.kind === 'brake' ? 0.03 : M.jetEase.rise, p.kind === 'brake' ? 0.06 : M.jetEase.fall);
    state.levels[p.id] = next;
  }

  // Glass: a dark step on the pane the turn swings away from.
  const g = 1 / M.glassSeconds;
  state.glass.left = clamp(state.glass.left + (turn < -0.1 ? g : -g) * dt, 0, 1);
  state.glass.right = clamp(state.glass.right + (turn > 0.1 ? g : -g) * dt, 0, 1);
  // The side of a turn darkening from the nose back (bankDraws), on its own longer timing.
  const b = 1 / M.bankSeconds;
  state.bank.left = clamp(state.bank.left + (turn < -0.1 ? b : -b) * dt, 0, 1);
  state.bank.right = clamp(state.bank.right + (turn > 0.1 ? b : -b) * dt, 0, 1);
  // The wings turned over: in reverse, both, on the glass's timing.
  state.flip = clamp(state.flip + (retro ? g : -g) * dt, 0, 1);

  stepPuffs(state, dt);
  return state;
}

function stepPuffs(state, dt) {
  const live = state.puffs;
  let n = 0;
  for (let i = 0; i < live.length; i++) {
    const q = live[i];
    q.age += dt;
    if (q.age < q.life) live[n++] = q;
  }
  live.length = n;
  const rnd = state.rng;
  for (const p of PORTS) {
    const level = state.levels[p.id];
    if (level <= 0.02) { state.emit[p.id] = 0; continue; }
    const look = LOOK[p.kind];
    state.emit[p.id] += look.rate * level * dt;
    while (state.emit[p.id] >= 1) {
      state.emit[p.id] -= 1;
      if (live.length >= MOTION.maxPuffs) { state.emit[p.id] = 0; break; }
      live.push({
        port: p.id, age: rnd() * dt, life: 0.25 + 0.15 * rnd(),
        reach: look.reach * (0.6 + 0.4 * level) * (0.8 + 0.4 * rnd()),
        side: rnd() * 2 - 1, k: rnd(),
      });
    }
  }
}

// ---- what is firing (captions, checks) ---------------------------------------------
export function firingPorts(state, min = MOTION.fire) {
  return PORTS.filter((p) => state.levels[p.id] > min).map((p) => p.id);
}
export function firingNozzles(state, min = MOTION.fire) {
  const on = new Set(firingPorts(state, min).map((id) => PORTS[PORT_INDEX[id]].nozzle));
  return NOZZLES.filter((n) => on.has(n));
}
export function isAtRest(state) {
  return state.puffs.length === 0 && firingPorts(state, 0).length === 0
    && state.glass.left === 0 && state.glass.right === 0 && state.flip === 0
    && state.bank.left === 0 && state.bank.right === 0;
}

// ---- cockpit glass -----------------------------------------------------------------
// 0..1: how far this cell has swung to the dark ink. Only the two @ cells, the left one by
// x < 0 (it needs no model to know which side it is on).
export function glassMix(state, cell) {
  if (!cell || cell.ch !== '@') return 0;
  return cell.x < 0 ? state.glass.left : cell.x > 0 ? state.glass.right : 0;
}

// The draws for one cell of the hull, in order: [{ ink, alpha }]. A crossfade by alpha of
// two draws (the dark ink over the base); settled either way it is a single draw, so the
// anti-aliased edge of the glyph does not keep a pale fringe.
export function glassDraws(state, cell, baseInk, inks = MOTION_INKS) {
  const k = glassMix(state, cell);
  if (k < 0.02) return [{ ink: baseInk, alpha: 1 }];
  if (k > 0.98) return [{ ink: inks.glassDark, alpha: 1 }];
  return [{ ink: baseInk, alpha: 1 }, { ink: inks.glassDark, alpha: k }];
}

// ---- the side of a turn ------------------------------------------------------------
// MODERN's side of a turn darkens (SX, 2026-10-16: «при поворотах делай крылошки затемняющимися во в сторону поворотов»; then the whisker,
// the glass's half and the wing; since 2026-10-17: «Кабину давай самолету красить не будем ... красить каждый левый символ в ряду и каждый
// правый символ в ряду ... самые боковые символы только затемняем. Остальные не трогаем»): each row's outermost glyph on the turn's side,
// the rows from the nose back, each over its share of `bankSeconds` (the nose's row first, the tail's last), the cell's own ink `wingDark`
// toward black, a crossfade by alpha as the glass's. A drawing with no wing (WING_GLYPHS: SX's CLIPPER, SCOOTY JR.) has none.
export const WING_GLYPHS = new Set(['◢', '◣', '◤', '◥', '▔']);
// Of a pose's cells, the outermost of each row, left and right of the axis, each with its row's share of the way from the nose (0) to the
// tail (1); empty for a drawing with no wing. Made once a pose.
const outerCells = new WeakMap();
function outerOf(cells) {
  let outer = outerCells.get(cells);
  if (outer) return outer;
  outer = new Map();
  if (cells.some((c) => WING_GLYPHS.has(c.ch))) {
    const rows = [...new Set(cells.map((c) => c.y))].sort((a, b) => a - b), last = Math.max(1, rows.length - 1);
    rows.forEach((y, i) => {
      const row = cells.filter((c) => c.y === y);
      const l = row.reduce((a, c) => (c.x < a.x ? c : a)), r = row.reduce((a, c) => (c.x > a.x ? c : a));
      if (l.x < 0) outer.set(l, i / last);
      if (r.x > 0) outer.set(r, i / last);
    });
  }
  outerCells.set(cells, outer);
  return outer;
}
const wingInks = new Map();
// The draws for `cell` of the pose `cells` in a turn: null for a cell that is not a row's outermost (the caller draws it as it would).
export function bankDraws(state, cells, cell, baseInk) {
  const row = outerOf(cells).get(cell);
  if (row === undefined) return null;
  const side = cell.x < 0 ? state.bank.left : state.bank.right, from = row * 0.55;
  const k = smooth(from, from + 0.45, side);
  if (k < 0.02 || typeof baseInk !== 'string' || baseInk.length !== 7) return [{ ink: baseInk, alpha: 1 }];
  let dark = wingInks.get(baseInk);
  if (!dark) { dark = mixHex(baseInk, '#000000', MOTION.wingDark); wingInks.set(baseInk, dark); }
  if (k > 0.98) return [{ ink: dark, alpha: 1 }];
  return [{ ink: baseInk, alpha: 1 }, { ink: dark, alpha: k }];
}
// In reverse the wings turn over as in the brake (SX, 2026-10-16: «когда задний ход крылья корабля тоже должны реагировать»; first the
// turn's side alone, since 2026-10-17 both, the key alone: «когда я нажимаю назад, S, то крылья тоже должны переворачиваться, как при
// тормозе»): the glyph its drawing's brake pose has in that cell (MODERN's ◢ ◤, ◣ ◥), once the flip is past half. The glyph to draw for
// `cell` of `model`'s idle pose; its own where the drawing has no brake pose.
const flips = new WeakMap();
export function wingFlip(state, model, cell) {
  if (!WING_GLYPHS.has(cell.ch) || model.brakeFrame == null || state.flip < 0.5) return cell.ch;
  let turned = flips.get(model);
  if (!turned) {
    turned = new Map(model.frames[model.brakeFrame].filter((c) => WING_GLYPHS.has(c.ch)).map((c) => [`${c.x},${c.y}`, c.ch]));
    flips.set(model, turned);
  }
  return turned.get(`${cell.x},${cell.y}`) ?? cell.ch;
}

// ---- drawing -----------------------------------------------------------------------
// Where the puff being placed is on the screen (drawShipMotion's `at`).
const PUFF_AT = { x: 0, y: 0 };
// r: the Renderer (or anything with glyphRot). sx, sy: the pivot on screen. facing: the
// ship's rotation (Ship.facing). scale: the ship's drawn scale (model.scale times the
// braking response). The puffs are small dots that leave each firing nozzle, drift out
// along the exhaust and fade.
// `glyphScale` is the size the puffs are drawn at: the ship's base scale, so they keep
// the sizes the warm-up made while the hull breathes to its braking scale.
export function drawShipMotion(r, state, model, sx, sy, facing, scale, inks = MOTION_INKS, glyphScale = scale) {
  // The page's own font where there is one (Renderer.fontFamily), else the SF Mono table.
  const V = r.fontFamily && globalThis.document ? measureVertices(r.fontFamily) : VERTICES;
  const nz = nozzlesOf(model, V);
  const cw = r.cellW * scale, em = r.cellH * scale;
  const ca = Math.cos(facing), sa = Math.sin(facing);

  // A point at `dist` em along a port's exhaust (and `across` em sideways), on screen: put in PUFF_AT, not returned as a pair (a pair
  // and a destructuring for each puff, every frame a nozzle fired: ~14 KB of garbage a frame at full thrust, 2026-10-09).
  const at = (p, dist, across = 0) => {
    const n = nz[p.nozzle];
    const lx = n.x * cw + (p.dir[0] * dist - p.dir[1] * across) * em;
    const ly = n.y * em + (p.dir[1] * dist + p.dir[0] * across) * em;
    PUFF_AT.x = sx + lx * ca - ly * sa; PUFF_AT.y = sy + lx * sa + ly * ca;
  };
  const inkOf = (p) => inks[LOOK[p.kind].ink];

  // The gap from a nozzle's vertex to the first dot's ink is the dot's own width, the
  // same at every nozzle: its centre sits a width and a half out.
  const lead = 1.5 * V.dot.width * FIRST_DOT;
  for (const q of state.puffs) {
    const p = PORTS[PORT_INDEX[q.port]];
    const u = q.age / q.life;
    // Born one dot's width clear of the vertex (lead), then drifting out.
    const dist = lead + q.reach * (1 - (1 - u) * (1 - u));
    at(p, dist, q.side * 0.16 * dist);
    const x = PUFF_AT.x, y = PUFF_AT.y;
    const mark = u + q.k * 0.2;
    // Bigger dots young, the raised marks (they sit high in the cell) small and last.
    const ch = mark < 0.3 ? '∙' : mark < 0.6 ? '·' : mark < 0.85 ? '˙' : "'";
    const size = mark < 0.3 ? PUFF_SIZES[0] : mark < 0.6 ? PUFF_SIZES[1] : mark < 0.85 ? PUFF_SIZES[2] : PUFF_SIZES[3];
    // The first dot is placed by its ink, not its glyph box: its ink centre is a hair
    // above the middle, turned with the ship.
    const ox = ch === '∙' ? V.dot.centre[0] * size * em : 0, oy = ch === '∙' ? V.dot.centre[1] * size * em : 0;
    r.glyphRot(ch, x - (ox * ca - oy * sa), y - (ox * sa + oy * ca), facing, inkOf(p), Math.pow(1 - u, 0.9), glyphScale * size);
  }
}
