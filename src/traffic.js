// Friendly traffic in the hidden sector (SX, 2026-09-30: «Далее делаем
// разнообразие скрытому сектору, он должен сильно выделяться по сравнению с
// остальными, там должно быть больше приколов, например трафик добрых кораблей,
// нарисовать корабль из футурамы»; then, with Codex's sheet of character ships:
// «Вот еще спрайты кораблей в скрытый сектор с отсылками»).
//
// O-08 is the one place where other ships go about their business. Each craft
// keeps to a fixed lane or orbit: its pose is a function of the world's clock
// alone, so nothing about it is simulated, saved or random, and it touches
// nothing (no collision, no gravity, shots pass through). Flying close to a
// named one gets a hail, once each visit (World.stepTraffic): its name and a
// line, in the feedback, with a horn.
//
// Six of them are Codex's character ships (src/trafficArt.js): PLANET EXPRESS,
// SERENITY, X-WING, MILLENNIUM FALCON, DELOREAN and SWORDFISH II, drawn in the sheet's own
// colours, a colour to each cell. The tour shuttles are drawn here, a colour to each kind
// of glyph (HEART OF GOLD was too, until SX cut it on 2026-10-01).
//
// A craft is drawn pointing up in its rows, like the ships, and turned to its
// heading glyph by glyph. `colors` (the character ships) gives each cell a key into
// `palette`; without it `inks` maps each glyph to its colour and a glyph not in the
// map takes `ink`.
//
// Size: `size` is a craft's own scale, 1 being the sheet at 1x, one cell of the game's
// grid to a cell of the drawing. `scale`, what it is drawn at, is that times
// CONFIG.traffic.craftScale, SX's one knob for how big the traffic is; the small
// craft (`small`, the tour shuttles) do not follow it.

import { CONFIG } from './config.js';
import { CRAFT_ART } from './trafficArt.js';
import { NPC_CRAFTS } from './npcShips.js';
import { TAU } from './util.js';
import { keepOutOf } from './keepOut.js';

// A craft as a frozen record, with `scale` worked out from the knob each time it is read. O-08's unless it says.
export const makeCraft = (def) => Object.freeze({
  sector: 'sector-hidden', ...def,
  get scale() { return def.size * (def.small ? 1 : CONFIG.traffic.craftScale); },
});

// One of the character ships: its art as copied, its hull colour as the fallback ink.
const characterShip = (id) => {
  const art = CRAFT_ART[id];
  return { rows: art.glyphs, colors: art.colors, palette: art.palette, ink: art.palette.b, inks: {} };
};

// Positions are fractions of the sector, as in the catalogue; lanes run between
// two points and back, easing to a stop and turning round at each end; orbits
// circle a point. Periods in seconds; `phase` offsets the clock.
// SX's map layout of 2026-10-02 put the third at (0.34, 0.12): its orbit left the sector over the top and crossed CAMEO, so it
// stands at (0.295, 0.205) (692 u from his spot), where the orbit circles CAMEO, inside the sector's margins.
const TOUR_AT = [[0.78, 0.50], [0.54, 0.76], [0.295, 0.205]];
export const TRAFFIC = Object.freeze([
  {
    id: 'planet-express', label: 'PLANET EXPRESS', hail: 'DELIVERY APPROACHING.',
    // Between its namesake planet and GREEN ROOM, the aliens' world: deliveries.
    path: { kind: 'lane', from: [0.715, 0.345], to: [0.66, 0.54], period: 22, phase: 3 },
    ...characterShip('express'), size: 1,
  },
  {
    // Spike Spiegel's (SX, 2026-10-01: «Добавь Спайка Шпигеля в игру ... в секретный сектор, и иногда он может
    // появиться»; Codex's drawing and the line SX chose, codex/handoffs/swordfish-ii). It flies HEART OF GOLD's way
    // round CAMEO, the other way to everything else, at a fighter's pace; HEART OF GOLD is gone (SX: «Вырежи ...
    // корабль Heart of Gold. Он не нужен»). The line is SX's, in the hails' capitals.
    id: 'swordfish-ii', label: 'SWORDFISH II', hail: 'SEE YOU, SPACE COWBOY.',
    // (SX's layout of 2026-10-02 put its centre at x 0.16, which took the orbit 84 u past the sector's 300 u margin; 0.175 is 108 u east.)
    path: { kind: 'orbit', at: [0.175, 0.56], radius: 0.13, period: 30, phase: 0, dir: -1 },
    ...characterShip('swordfish-ii'), size: 1,
  },
  {
    id: 'serenity', label: 'SERENITY', hail: 'SERENITY. HOLDING COURSE.',
    // Along the bottom of the sector, clear of the hole.
    path: { kind: 'lane', from: [0.12, 0.92], to: [0.88, 0.9], period: 34, phase: 11 },
    ...characterShip('serenity'), size: 1,
  },
  // The other three character ships each keep to a region of their own, so that the
  // named craft do not crowd a screen: the edges (the FALCON at the top, SERENITY at the
  // bottom, the X-WING on the right) and the sector's front door (the DELOREAN). The way
  // of each of the three is at least 790 u from every other craft's (checks/hidden-sector.mjs).
  {
    id: 'falcon', label: 'MILLENNIUM FALCON', hail: 'FALCON. PASSING THROUGH.',
    // A long run across the top. SX's map layout of 2026-10-02 put it from (0.4935, 0.0825) to (1.1465, 0.1175): past the sector's
    // east edge and through PLANET EXPRESS's orbit. The start keeps his place to 216 u, the far end is at (0.94, 0.09) (1,515 u from his).
    path: { kind: 'lane', from: [0.4935, 0.0525], to: [0.94, 0.09], period: 26, phase: 7 },
    ...characterShip('falcon'), size: 1,
  },
  {
    id: 'x-wing', label: 'X-WING', hail: 'STAY ON TARGET',
    // Down the right-hand side at a fighter's pace: 200 u/s over the lane, the quickest.
    path: { kind: 'lane', from: [0.14, 0.058], to: [0.14, 0.502], period: 16, phase: 2 },
    ...characterShip('x-wing'), size: 1,
  },
  {
    id: 'delorean', label: 'DELOREAN', hail: 'DOC, CHECK THE READOUT.',
    // A short, quick pass across the way from the black hole to GREEN ROOM: what a pilot
    // coming through the hole meets first.
    path: { kind: 'lane', from: [0.3625, 0.4175], to: [0.3975, 0.5425], period: 8, phase: 1 },
    ...characterShip('delorean'), size: 1,
  },
  // Tour shuttles, small, unnamed, no hail. They circled GREEN ROOM until SX's layout of 2026-10-02 (labs/map-editor/layouts/
  // 2026-10-02-sx-second.json) set each on its own orbit, about the centres below.
  ...[0, 1, 2].map((k) => ({
    id: `tour-${k + 1}`, label: null, hail: null,
    path: { kind: 'orbit', at: TOUR_AT[k], radius: 0.112 + 0.012 * k, period: 30 + 7 * k, phase: k * 2.1, dir: k === 1 ? -1 : 1 },
    rows: ['▴', '·'],
    ink: '#B9D7E6', inks: { '·': '#79A78F' }, size: 1, small: true,
  })),
].map(makeCraft));

// The friendly NPC ships of the grid's sectors (src/npcShips.js, SX's picks of 2026-10-02), as crafts like these: where each
// begins (its old lane or orbit, which is all `path` says now). They do not stay there: the fleet (src/npcFleet.js) sends each over
// the whole grid and holds a view of it for every sector it is in (kind 'walk'); `trafficIn` is O-08's alone.
export const NPCS = Object.freeze(NPC_CRAFTS.map(makeCraft));

const bySector = new Map();
for (const c of TRAFFIC) bySector.set(c.sector, [...(bySector.get(c.sector) ?? []), c]);
export const trafficIn = (sectorId) => bySector.get(sectorId) ?? [];

// How close a pilot has to come to be hailed, in world units.
export const HAIL_REACH = 460;

// Whether a craft is a fleet ship enraged now (src/npcFleet.js: a ship the pilot rammed that turned on it): it is not greeted, and its
// name stands in the danger ink. Only a fleet ship's view (kind 'walk') has a walker to ask.
export const isEnraged = (craft) => craft.path.kind === 'walk' && !!craft.path.walker?.rage;

// Where a craft is at time `t` (s), in a sector `W` x `H`, and which way it
// points (radians, screen coordinates, 0 = right).
export function craftPose(craft, t, W, H) {
  const P = craft.path;
  // A walker of the fleet (src/npcFleet.js): its place on the grid, in this sector's own units.
  if (P.kind === 'walk') {
    const p = P.walker.pose(t);
    return { x: p.x - P.ox, y: p.y - P.oy, angle: p.angle };
  }
  if (P.kind === 'orbit') {
    const a = P.phase + (P.dir || 1) * TAU * (t / P.period);
    const R = P.radius * W;
    return { x: P.at[0] * W + Math.cos(a) * R, y: P.at[1] * H + Math.sin(a) * R, angle: a + (P.dir || 1) * Math.PI / 2 };
  }
  // A lane: there (leg 0) and back (leg 1), easing out and in, turning round
  // over the last tenth of each leg as it slows.
  const ax = P.from[0] * W, ay = P.from[1] * H, bx = P.to[0] * W, by = P.to[1] * H;
  const u = (t + P.phase) / P.period;
  const leg = ((Math.floor(u) % 2) + 2) % 2, f = u - Math.floor(u);
  const s = (1 - Math.cos(Math.PI * f)) / 2;
  const [x0, y0, x1, y1] = leg === 0 ? [ax, ay, bx, by] : [bx, by, ax, ay];
  const heading = Math.atan2(y1 - y0, x1 - x0);
  const turn = f > 0.9 ? (f - 0.9) / 0.1 : 0;
  return { x: x0 + (x1 - x0) * s, y: y0 + (y1 - y0) * s, angle: heading + Math.PI * turn * turn * (3 - 2 * turn) };
}

// How far from its centre a craft's drawing can reach on the screen, whichever way it
// points: half the diagonal of its rows, and never under 120 px (what World.draw gave every
// craft before the character ships). It is how far off screen a craft may be and still be
// drawn, so one that is bigger (CONFIG.traffic.craftScale) does not vanish with its wing
// tips still in view.
export const craftReach = (r, craft) =>
  Math.max(120, Math.hypot(craft.rows[0].length * r.cellW, craft.rows.length * r.cellH) * craft.scale / 2);
// Half its drawing's longer side, px: the disc a hull up in a jump passes over (src/trick.js underShip).
export const craftSize = (r, craft) => Math.max(craft.rows[0].length * r.cellW, craft.rows.length * r.cellH) * craft.scale / 2;

// One craft, turned to its heading; `alpha` for fading at the screen's edge.
export function drawCraft(r, craft, sx, sy, angle, alpha = 1) {
  const turn = angle + Math.PI / 2;
  const c = Math.cos(turn), s = Math.sin(turn);
  const w = r.cellW * craft.scale, h = r.cellH * craft.scale;
  const rows = craft.rows;
  rows.forEach((row, j) => Array.from(row).forEach((ch, i) => {
    if (ch === ' ') return;
    const lx = (i - (row.length - 1) / 2) * w, ly = (j - (rows.length - 1) / 2) * h;
    const ink = craft.colors ? craft.palette[craft.colors[j][i]] : (craft.inks[ch] || craft.ink);
    r.glyphRot(ch, sx + lx * c - ly * s, sy + lx * s + ly * c, turn, ink, alpha, craft.scale);
  }));
}

// A rare visitor (SX, 2026-10-01: «сделай так что персонажи с отсылками всегда находятся в секретной локации, но
// изредка ты можешь их встретить и в открытом космосе, это должно ощущаться как приятное событие, так что довольно
// редкое»). They keep to O-08 as before; now and then one of the named craft passes through the sector the pilot
// is flying in (CONFIG.traffic.visit): first after `first` s of flight, then once in `every` s, never while
// docked, in a fight or in the hidden sector itself, and only in a world that asks (`world.autoVisitors`, the
// game's page). It crosses in front of a moving ship, or past a still one, on a straight line `pass` u long at
// `speed` u/s, says it is in the sector, and hails when the pilot comes near, as in O-08. It touches nothing.
export const VISITORS = TRAFFIC.filter((c) => c.hail && !c.small);

export function spawnVisitor(world, { craftId = null } = {}) {
  const V = CONFIG.traffic.visit, rng = world.rng('visit'), ship = world.ship;
  const craft = VISITORS.find((c) => c.id === craftId) || VISITORS[Math.floor(rng() * VISITORS.length)];
  const speed = Math.hypot(ship.vx, ship.vy);
  const heading = speed > 100 ? Math.atan2(ship.vy, ship.vx) : rng() * TAU;
  // The point it passes: ahead of a moving ship, where the ship will be in `lead` s; beside a still one.
  const lead = speed > 100 ? Math.min(V.lead * speed, V.ahead) : 0;
  const side = (rng() < 0.5 ? -1 : 1) * (V.offset[0] + rng() * (V.offset[1] - V.offset[0]));
  let cx = ship.x + Math.cos(heading) * lead - Math.sin(heading) * side;
  let cy = ship.y + Math.sin(heading) * lead + Math.cos(heading) * side;
  // Across the ship's way, within a quarter turn of square to it.
  const dir = heading + (Math.PI / 2) * (rng() < 0.5 ? 1 : -1) + (rng() - 0.5) * 0.8;
  const half = V.pass / 2;
  // A pass that would go through a station's menu reach (a still ship by a station: it passes beside the ship) is moved aside, square
  // to its way, the least that takes it by every station's keep-out (src/keepOut.js; SX, 2026-10-07: «давай npc ... не будут сильно
  // близко к станциям подлетать»): it still crosses before the ship, a little farther off. A station beyond the pass's ends is let be.
  // Each station forbids the line a band of offsets across its way (its place across, give or take its keep-out); the offset taken is
  // the nearest to none outside every band. Once a visit: a few stations, a few candidates.
  const ux = Math.cos(dir), uy = Math.sin(dir);
  const bands = [];
  for (const st of world.stations) {
    const ox = st.x - cx, oy = st.y - cy, keep = keepOutOf(st);
    if (Math.abs(ox * ux + oy * uy) <= half + keep) bands.push([oy * ux - ox * uy, keep]);
  }
  const clear = (q) => bands.every(([at, keep]) => Math.abs(at - q) >= keep);
  let by = 0;
  if (!clear(0)) {
    by = Infinity;
    for (const [at, keep] of bands) for (const q of [at - keep, at + keep]) if (Math.abs(q) < Math.abs(by) && clear(q)) by = q;
    if (!Number.isFinite(by)) by = 0;
  }
  cx += -uy * by; cy += ux * by;
  world.visitor = {
    craft, sectorId: world.sector.id, t: 0, duration: V.pass / V.speed, hailed: false,
    from: { x: cx - ux * half, y: cy - uy * half },
    to: { x: cx + ux * half, y: cy + uy * half },
  };
  world.emit('visitorArrived', { craftId: craft.id, label: craft.label, sectorId: world.sector.id });
  return world.visitor;
}

// Where a visitor is, and which way it points.
export function visitorPose(v) {
  const f = Math.min(1, v.t / v.duration);
  return {
    x: v.from.x + (v.to.x - v.from.x) * f, y: v.from.y + (v.to.y - v.from.y) * f,
    angle: Math.atan2(v.to.y - v.from.y, v.to.x - v.from.x),
  };
}

export function stepVisitor(world, dt) {
  const V = CONFIG.traffic.visit, ship = world.ship;
  const v = world.visitor;
  if (v) {
    v.t += dt;
    if (v.t >= v.duration || world.sector.id !== v.sectorId) { world.visitor = null; return; }
    const p = visitorPose(v);
    if (!v.hailed && ship.alive && Math.hypot(p.x - ship.x, p.y - ship.y) < HAIL_REACH) {
      v.hailed = true;
      world.emit('trafficHail', { craftId: v.craft.id, label: v.craft.label, line: v.craft.hail, x: p.x, y: p.y, sectorId: world.sector.id, visitor: true, greet: true });
    }
    return;
  }
  if (!world.autoVisitors) return;
  if (!ship.alive || world.docked || world.encounter || world.sector.hidden) return;
  world.visitorIn -= dt;
  if (world.visitorIn > 0) return;
  world.visitorIn = V.every[0] + world.rng('visit')() * (V.every[1] - V.every[0]);
  spawnVisitor(world);
}
