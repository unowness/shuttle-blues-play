// What breaks off things and hangs in space: a wreck's pieces, a chip knocked off the hull by a shot, a broken rock's
// shards, the sparks of a blow. Moved out of src/world.js as it was (chat W, 2026-10-04, the roadmap's refactoring piece: the
// wreck and the debris out of src/world.js); the World's methods of the same names call these, and the golden master
// (tools/golden.mjs) holds the move to the same frames and the same world. Every piece is a particle (src/particles.js) drawn
// from the world's 'fx' stream: a look, read by nothing in the simulation.
import { CONFIG } from './config.js';
import { TAU, clamp, between } from './util.js';
import { ROLES } from './roles.js';

// Pieces of a broken body that hang in space (SX's item 8, 2026-10-04: CONFIG.debris): `pieces` ({ ch, color, dx, dy, size, raw })
// about (x, y), thrown out at the `kind`'s speed with `carry` of (vx, vy), slowing by its drag, about 40 s, fading from 25 s (two
// minutes, from 80 s, until SX's «детали в космосе должны висеть меньше по времени», 2026-10-05).
export function hangPieces(world, x, y, pieces, kind, vx = 0, vy = 0) {
  const D = CONFIG.debris, K = D[kind];
  world.particles.burst(x, y, pieces, { vx: vx * D.carry, vy: vy * D.carry, speed: K.speed, life: D.life, drag: K.drag ?? D.drag, fade: D.fade, hang: true });
}

// `CONFIG.debris.share` of a body's glyphs, at least one, drawn at random from the world's 'fx' stream: what of a body that comes apart
// whole hangs (SX, 2026-10-05: «Слишком много деталей ... поменьше выбрасывать детали»; every glyph until then).
function someOf(world, pieces) {
  const n = Math.min(pieces.length, Math.max(1, Math.round(pieces.length * CONFIG.debris.share)));
  const pool = pieces.slice(), fx = world.rng('fx'), out = [];
  for (let k = 0; k < n; k++) out.push(pool.splice(Math.floor(fx() * pool.length), 1)[0]);
  return out;
}

// A wreck's pieces at `x`, `y`, carrying some of `vx`, `vy`: the pilot's ship's, a broken NPC's, a borrowed ship's; a share of them.
export function wreckDebris(world, x, y, pieces, vx = 0, vy = 0) {
  hangPieces(world, x, y, someOf(world, pieces), 'ship', vx, vy);
}

// Parts knocked off the hull (SX's item 9, 2026-10-04: «при каждом –10 от хп, от корабля гг отлетает от 1-3 деталей от корабля с
// искрами висят 5 секунд пропадают постепенно»; it was one glyph a pirate's shot, 2026-10-01; one part for 3 s since SX's «поменьше
// выбрасывать детали», 2026-10-05: CONFIG.ship.chip). Every `every` hull points lost, by
// whatever hit it, `parts` of the hull's own glyphs fly off with `sparks` sparks: the ones nearest `at` (the blow's point: a shot, a
// ram), or without one the ones on the side the ship was going (it hits what it flies into), thrown out from the hull at `speed`
// u/s with `carry` of the ship's way, slowing by `drag` a second so they hang near where they came off, and gone after `life` s,
// fading over its last `fade`. The hull keeps its drawing: it is the damage seen, not a part lost. What is lost below `every` is
// carried to the next blow (`world.chipDebt`, a look's own count, never saved: a reload starts it at nought).
export function chipHull(world, lost, at = null) {
  const ship = world.ship, P = CONFIG.ship.chip;
  if (!ship.alive || !(lost > 0)) return;
  world.chipDebt += lost;
  while (world.chipDebt >= P.every) {
    world.chipDebt -= P.every;
    chipOnce(world, at);
  }
}

function chipOnce(world, at) {
  const ship = world.ship, P = CONFIG.ship.chip, B = CONFIG.asteroid.bump, fx = world.rng('fx');
  const cells = ship.debris();
  if (!cells.length) return;
  // Where the blow fell, about the hull's middle: the blow's point, or the side the ship was going.
  const speed = Math.hypot(ship.vx, ship.vy);
  const d = at ? world.delta(at.x, at.y, ship.x, ship.y)
    : speed > 1 ? { x: (ship.vx / speed) * ship.radius, y: (ship.vy / speed) * ship.radius }
      : { x: Math.cos(ship.facing) * ship.radius, y: Math.sin(ship.facing) * ship.radius };
  const n = Math.min(cells.length, P.parts[0] + Math.floor(fx() * (P.parts[1] - P.parts[0] + 1)));
  // `n` of the twice as many cells nearest the blow, drawn: the side it fell on, never the same few every time.
  const near = cells.map((c) => ({ c, g: Math.hypot(c.dx - d.x, c.dy - d.y) })).sort((a, b) => a.g - b.g).slice(0, 2 * n).map((e) => e.c);
  const parts = [];
  for (let k = 0; k < n; k++) parts.push(near.splice(Math.floor(fx() * near.length), 1)[0]);
  const bx = at?.vx ?? ship.vx, by = at?.vy ?? ship.vy, bv = Math.hypot(bx - ship.vx, by - ship.vy);
  const push = bv > 1 ? { x: ((bx - ship.vx) / bv) * P.push, y: ((by - ship.vy) / bv) * P.push } : { x: 0, y: 0 };
  for (const part of parts) {
    const out = Math.atan2(part.dy || d.y, part.dx || d.x);
    world.particles.burst(ship.x + part.dx, ship.y + part.dy, [{ ch: part.ch, color: part.color, size: part.size }], {
      vx: ship.vx * P.carry + push.x, vy: ship.vy * P.carry + push.y, aim: out, speed: P.speed, life: [P.life, P.life], drag: P.drag, fade: P.fade,
    });
  }
  const x = ship.x + d.x, y = ship.y + d.y, out = Math.atan2(d.y, d.x);
  const sparks = Array.from({ length: P.sparks }, (_, k) => ({ ch: B.sparks[k % B.sparks.length], color: B.colors[k % B.colors.length] }));
  world.particles.burst(x, y, sparks, { vx: ship.vx * 0.5, vy: ship.vy * 0.5, aim: out, speed: [80, 220], life: [0.2, 0.5] });
}

// The sparks of a blow against `what` along (nx, ny), the normal out of the thing, and a few of the hull's own glyphs; the
// event the sound listens for.
export function shipSparks(world, nx, ny, closing, what) {
  const B = CONFIG.asteroid.bump, ship = world.ship;
  if (closing <= B.sparkMin) return;
  const cx = ship.x - nx * ship.radius, cy = ship.y - ny * ship.radius;
  const sparks = Array.from({ length: 9 }, (_, k) => ({ ch: B.sparks[k % B.sparks.length], color: B.colors[k % B.colors.length] }));
  const hull = ship.frameCells.slice(0, 3).map((c) => ({ ch: c.ch, color: c.color }));
  world.particles.burst(cx, cy, [...sparks, ...hull], {
    vx: ship.vx * 0.3, vy: ship.vy * 0.3, aim: Math.atan2(ny, nx), speed: [90, 260], life: [0.25, 0.65],
  });
  world.emit('shipBumped', { sectorId: world.sector.id, x: cx, y: cy, speed: Math.round(closing), what });
}

// A rock coming apart: shards of its own glyph from inside its outline, `intensity` of as many as its size gives, and a share of those
// (CONFIG.debris.share: half since 2026-10-05, 5 to 26 for a whole rock until then); they hang.
export function shred(world, a, intensity) {
  const n = Math.round(clamp(a.radius / 9, 5, 26) * intensity * CONFIG.debris.share);
  const glyphs = [], fx = world.rng('fx');
  for (let i = 0; i < n; i++) {
    const th = between(fx, 0, TAU);
    const rr = a.radiusAt(th) * between(fx, 0.35, 1);
    glyphs.push({
      dx: Math.cos(th) * rr, dy: Math.sin(th) * rr,
      ch: a.glyph, color: CONFIG.asteroid.color,
    });
  }
  hangPieces(world, a.x, a.y, glyphs, 'rock', a.vx, a.vy);
}

// A destroyed pirate coming apart into its own glyphs, in its paint (World.killPirate); a share of them hang.
export function pirateDebris(world, p) {
  hangPieces(world, p.x, p.y, someOf(world, p.debris()), 'pirate', p.vx, p.vy);
}

// A station broken by a wreck (src/stationService.js breakStation): `share` of its cells, at most `most`, knocked off it in its own
// glyphs and inks. Its drawing is the page's (labs/graphics/station-art.js), so the page lends the world its cells
// (`world.stationPieces`, set by labs/graphics/world-art.js); a world with no page (a check, a tool) breaks off box strokes in the
// station's two line inks. Only a station in the sector the pilot is in: pieces are in its units.
export function stationDebris(world, station) {
  if (!world.stations.includes(station)) return;
  const S = CONFIG.debris.station, fx = world.rng('fx');
  const cells = world.stationPieces?.(station) ?? plainStationPieces(station, fx);
  const n = Math.min(S.most, Math.max(1, Math.round(cells.length * S.share)));
  const pool = cells.slice(), pieces = [];
  for (let k = 0; k < n && pool.length; k++) pieces.push(pool.splice(Math.floor(fx() * pool.length), 1)[0]);
  hangPieces(world, station.x, station.y, pieces, 'station');
}
const PLAIN = '─│┌┐└┘├┤┬┴';
function plainStationPieces(station, fx) {
  const { hx, hy } = station.body, out = [];
  for (let k = 0; k < 60; k++) {
    out.push({ ch: PLAIN[Math.floor(fx() * PLAIN.length)], color: k % 3 ? ROLES.material : ROLES.structure,
      dx: (fx() * 2 - 1) * hx, dy: (fx() * 2 - 1) * hy, raw: true });
  }
  return out;
}
