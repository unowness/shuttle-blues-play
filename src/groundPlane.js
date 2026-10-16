// The one plane (SX, 2026-10-10, as Codex recorded it: the world's material things on one level, the jump the one way off it): a
// last, non-damaging contact pass at the end of each step (World.step), for the pairs no other system holds apart. The hits own the
// damage, the wrecks and the rewards (src/contact.js, src/hits.js, src/encounters.js, src/tow.js); the rocks meet each other in
// src/field.js; this pass only separates and trades the closing speed, so nothing is paid twice.
//
// Who is in it: the rocks (a moored one fixed), the loose coins, parts and drops of oil, the pirates, the droids, the caches, a lost
// cargo, the towed load until the jump lifts it, the ship while it is down; and fixed, never moved by it, the NPC fleet, O-08's
// craft, a visitor and a quest's ship, which keep their paths and shove loose things aside (src/sceneSolids.js, Fleet.groundBodies).
//
// Rewritten on 2026-10-13 (SX: «Переписать дёшево»): Codex's pass ran three times a step, four rounds each with the grid rebuilt in
// every round, and made objects in its inner loops: a step cost 5 to 14 times HEAD's and made 8 to 18 times the garbage. Now: once a
// step, the broad phase once (a grid of typed arrays, a pair visited only in the first cell both share), the rounds over the pairs it
// found, rock to rock and fixed to fixed never asked, and nothing made per pair, body or step once the arrays have grown.
import { CONFIG } from './config.js';
import { GROUND as G } from './groundConfig.js';
import { oilRadius } from './oil.js';
import { clearGroundPath, boundDelta } from './groundMath.js';
import { towBody, cargoBody } from './tow.js';
import { contractById } from './contracts.js';
import { cargoLifted } from './trick.js';
import { sceneBodies } from './sceneSolids.js';

export const dropRadius = (d) => d.kind === 'fuel' ? oilRadius(d.units) : CONFIG.asteroid.drops.body.coin;

// The bodies of a step, in a pool of records reused step after step: { body, kind, radius, inv } (inv the inverse mass, 0 fixed).
const pool = [];
let count = 0;
function add(body, kind, radius, mass) {
  const b = pool[count] ??= { body: null, kind: '', radius: 0, inv: 0, cx: 0, cy: 0 };
  b.body = body; b.kind = kind; b.radius = radius; b.inv = mass > 0 ? 1 / mass : 0;
  count++;
}

// The broad phase's grid: sector-local cells of `G.cell` u over the sector and a margin round it (a body past the margin is counted in
// the edge cell, which costs pairs, never a contact). A cell's bodies are a linked list in typed arrays.
const MARGIN = 4;
let cols = 0, rows = 0, heads = new Int32Array(0);
let nodeBody = new Int32Array(256), nodeNext = new Int32Array(256), nodes = 0;
let used = new Int32Array(256), usedCount = 0;
let pairA = new Int32Array(512), pairB = new Int32Array(512), pairs = 0;
const grow = (a, n) => { const b = new Int32Array(Math.max(n, a.length * 2)); b.set(a); return b; };

function gridFor(world) {
  const c = Math.ceil(world.width / G.cell) + 2 * MARGIN, r = Math.ceil(world.height / G.cell) + 2 * MARGIN;
  if (c !== cols || r !== rows) { cols = c; rows = r; heads = new Int32Array(c * r).fill(-1); }
}
const cellX = (x) => Math.min(cols - 1, Math.max(0, Math.floor(x / G.cell) + MARGIN));
const cellY = (y) => Math.min(rows - 1, Math.max(0, Math.floor(y / G.cell) + MARGIN));

// Whether the pass holds this pair apart at all.
function asked(a, b) {
  if (!(a.inv + b.inv)) return false;
  const ka = a.kind, kb = b.kind;
  if (ka === 'rock' && kb === 'rock') return false;                 // src/field.js meets them
  // The ship's own contacts with rocks, pirates, droids, caches, NPCs and its load are shape-aware and damaging (src/contact.js,
  // src/encounters.js, src/tow.js): the pass adds no bumper over them. It holds apart what the ship cannot take, and a quest's ship.
  if (ka === 'ship' || kb === 'ship') { const o = ka === 'ship' ? kb : ka; return o === 'drop' || o === 'cargo' || o === 'actor'; }
  if (ka === 'tow' || kb === 'tow') { const o = ka === 'tow' ? kb : ka; return o !== 'rock' && o !== 'droid' && o !== 'pirate'; }
  return true;
}

function broad(world) {
  if (world.topology.mode === 'wrap') {
    // A wrapping world (the lab's) has no edge for the grid: every pair is asked.
    pairs = 0;
    for (let i = 0; i < count; i++) for (let j = 0; j < i; j++) {
      if (!asked(pool[j], pool[i])) continue;
      if (pairs === pairA.length) { pairA = grow(pairA, pairs + 1); pairB = grow(pairB, pairs + 1); }
      pairA[pairs] = j; pairB[pairs] = i; pairs++;
    }
    return;
  }
  gridFor(world);
  for (let i = 0; i < usedCount; i++) heads[used[i]] = -1;
  usedCount = 0; nodes = 0; pairs = 0;
  for (let i = 0; i < count; i++) {
    const b = pool[i], p = b.body, r = b.radius + G.gap;
    const x0 = cellX(p.x - r), x1 = cellX(p.x + r), y0 = cellY(p.y - r), y1 = cellY(p.y + r);
    b.cx = x0; b.cy = y0;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const cell = x * rows + y;
      for (let n = heads[cell]; n !== -1; n = nodeNext[n]) {
        const j = nodeBody[n], a = pool[j];
        // A pair once: in the first cell both share.
        if (x !== Math.max(a.cx, b.cx) || y !== Math.max(a.cy, b.cy) || !asked(a, b)) continue;
        if (pairs === pairA.length) { pairA = grow(pairA, pairs + 1); pairB = grow(pairB, pairs + 1); }
        pairA[pairs] = j; pairB[pairs] = i; pairs++;
      }
      if (nodes === nodeBody.length) { nodeBody = grow(nodeBody, nodes + 1); nodeNext = grow(nodeNext, nodes + 1); }
      if (heads[cell] === -1) { if (usedCount === used.length) used = grow(used, usedCount + 1); used[usedCount++] = cell; }
      nodeBody[nodes] = i; nodeNext[nodes] = heads[cell]; heads[cell] = nodes; nodes++;
    }
  }
}

// The contact of a pair, if they overlap: its normal from a to b and its depth, in these three, made once.
let nx = 0, ny = 0, depth = 0;
function touching(world, a, b, ia, ib) {
  const T = world.topology, dx = T.dx(b.body.x, a.body.x), dy = T.dy(b.body.y, a.body.y);
  const reach = a.radius + b.radius + G.gap;
  if (dx > reach || dx < -reach || dy > reach || dy < -reach) return false;
  const dist = Math.hypot(dx, dy);
  if (dist >= reach) return false;
  // Two at the same point part along a direction of their own, never the same for every pair.
  const angle = dist > 1e-6 ? Math.atan2(dy, dx) : ((ia * 7 + ib * 13) % 16) * Math.PI / 8;
  const ra = a.kind === 'rock' ? a.body.radiusAt(angle - a.body.angle) : a.radius;
  const rb = b.kind === 'rock' ? b.body.radiusAt(angle + Math.PI - b.body.angle) : b.radius;
  depth = ra + rb + G.gap - dist;
  if (depth <= 0) return false;
  nx = Math.cos(angle); ny = Math.sin(angle);
  return true;
}

function resolve(world, ia, ib) {
  const a = pool[ia], b = pool[ib];
  if (!touching(world, a, b, ia, ib)) return;
  // Two drops of oil run together (src/oil.js poolOil), unless a hull stands between them.
  if (a.kind === 'drop' && b.kind === 'drop' && a.body.kind === 'fuel' && b.body.kind === 'fuel' && clearGroundPath(world, a.body, b.body)) return;
  const A = a.body, B = b.body, share = a.inv / (a.inv + b.inv);
  A.x -= nx * depth * share; A.y -= ny * depth * share;
  B.x += nx * depth * (1 - share); B.y += ny * depth * (1 - share);
  const closing = ((A.vx ?? 0) - (B.vx ?? 0)) * nx + ((A.vy ?? 0) - (B.vy ?? 0)) * ny;
  if (closing <= 0) return;
  const impulse = closing * (1 + G.bounce);
  if (a.inv) { A.vx = (A.vx ?? 0) - nx * impulse * share; A.vy = (A.vy ?? 0) - ny * impulse * share; }
  if (b.inv) { B.vx = (B.vx ?? 0) + nx * impulse * (1 - share); B.vy = (B.vy ?? 0) + ny * impulse * (1 - share); }
}

// A station's body holds out what moves (HOME's opening kept: its real outline, src/stations.js contact).
function holdOut(world, b, delta) {
  if (!b.inv || b.kind === 'ship' || b.kind === 'tow') return;
  const p = b.body, T = world.topology, stations = world.stations;
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i], reach = st.hullRadius + b.radius;
    const dx = T.dx(p.x, st.x), dy = T.dy(p.y, st.y);
    if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
    const c = st.contact(p.x, p.y, b.radius, delta);
    if (!c || c.inside) continue;
    p.x += c.nx * (c.depth + G.gap); p.y += c.ny * (c.depth + G.gap);
    const closing = -(((p.vx ?? 0) - (st.vx ?? 0)) * c.nx + ((p.vy ?? 0) - (st.vy ?? 0)) * c.ny);
    if (closing > 0) { p.vx = (p.vx ?? 0) + c.nx * closing * (1 + G.bounce); p.vy = (p.vy ?? 0) + c.ny * closing * (1 + G.bounce); }
  }
}

// Sweep a fast, small piece of loot against the rocks and the stations over its move this step (x, y to where it is now): a piece
// that would start and end on opposite sides of a rock stops at its face instead of passing through.
export function sweepDrop(world, drop, x, y) {
  const T = world.topology, mx = T.dx(drop.x, x), my = T.dy(drop.y, y), length2 = mx * mx + my * my;
  if (length2 < 1e-9) return;
  const radius = dropRadius(drop);
  let first = 1, hit = false, hx = 0, hy = 0, hvx = 0, hvy = 0;
  const rocks = world.asteroids;
  for (let i = 0; i < rocks.length; i++) {
    const a = rocks[i], dx = T.dx(x, a.x), dy = T.dy(y, a.y), r = a.radius * G.rockEnvelope + radius + G.gap;
    const c = dx * dx + dy * dy - r * r;
    if (c < 0) continue;                       // a piece already inside an envelope is the pass's
    const k = dx * mx + dy * my, disc = k * k - length2 * c;
    if (k >= 0 || disc < 0) continue;
    const at = (-k - Math.sqrt(disc)) / length2;
    if (at < 0 || at > first) continue;
    first = at; hit = true;
    hx = (dx + mx * at) / r; hy = (dy + my * at) / r; hvx = a.vx ?? 0; hvy = a.vy ?? 0;
  }
  const length = Math.sqrt(length2), stations = world.stations, delta = boundDelta(world);
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    if (Math.hypot(T.dx(st.x, x), T.dy(st.y, y)) > length + st.hullRadius + radius) continue;
    const steps = Math.max(1, Math.ceil(length / Math.max(1, radius)));
    for (let k = 1; k <= steps && k / steps <= first; k++) {
      const at = k / steps, c = st.contact(x + mx * at, y + my * at, radius, delta);
      if (!c || c.inside) continue;
      first = (k - 1) / steps; hit = true; hx = c.nx; hy = c.ny; hvx = st.vx ?? 0; hvy = st.vy ?? 0;
      break;
    }
  }
  if (!hit) return;
  drop.x = x + mx * first; drop.y = y + my * first;
  const closing = -((drop.vx - hvx) * hx + (drop.vy - hvy) * hy);
  if (closing > 0) { drop.vx += hx * closing * (1 + G.bounce); drop.vy += hy * closing * (1 + G.bounce); }
}

const scene = [];
// The pass, once a step, after everything has moved (World.step).
export function settleGround(world, dt) {
  count = 0;
  for (const a of world.asteroids) add(a, 'rock', a.radius * G.rockEnvelope, a.moored ? 0 : (a.radius / G.rockMassRadius) ** 2);
  for (const d of world.drops) add(d, 'drop', dropRadius(d), G.mass.drop * (d.kind === 'fuel' ? Math.max(1, d.units) : 1));
  for (const p of world.pirates) add(p, 'pirate', p.radius, G.mass.pirate);
  for (const p of world.droids) add(p, 'droid', CONFIG.droids.radius, G.mass.droid);
  for (const p of world.caches) add(p, 'cache', CONFIG.cache.float.radius, G.mass.cache);
  for (const p of world.paintCaches) add(p, 'cache', CONFIG.cache.float.radius, G.mass.cache);
  for (const p of world.lookCaches) add(p, 'cache', CONFIG.cache.float.radius, G.mass.cache);
  for (const p of world.fleet.groundBodies?.(world) ?? []) add(p, 'npc', p.radius, 0);
  scene.length = 0;
  for (const p of sceneBodies(world, dt, scene)) add(p, 'actor', p.radius, 0);
  const ship = world.ship;
  if (ship.alive && !ship.airborne && !world.docked) add(ship, 'ship', ship.radius, G.mass.ship);
  // The load lifts after the hull, on the jump's own timing (src/trick.js cargoLifted), as it is drawn.
  if (world.cargo && !world.docked && !cargoLifted(world)) add(world.cargo, 'tow', towBody(world).reach, G.mass.cargo);
  for (const p of world.lostCargo) {
    // A lost cargo nudged off its rest slows to a stop; nothing pushes it on.
    if (p.vx || p.vy) { const k = Math.exp(-G.actorDrag * dt); p.vx *= k; p.vy *= k; p.x += p.vx * dt; p.y += p.vy * dt; }
    add(p, 'cargo', cargoBody(p.stranger ? contractById(p.contractId) : world.ledger.job(p.contractId)).reach, G.mass.cargo);
  }
  if (count < 2) return;
  broad(world);
  const delta = boundDelta(world);
  for (let round = 0; round < G.iterations; round++) {
    for (let k = 0; k < pairs; k++) resolve(world, pairA[k], pairB[k]);
    for (let i = 0; i < count; i++) holdOut(world, pool[i], delta);
  }
  // The pilot's own lost cargo keeps its place in the ledger, which the save writes.
  for (const p of world.lostCargo) {
    const record = !p.stranger && world.ledger.stranded.get(p.contractId);
    if (record) { record.x = p.x; record.y = p.y; }
  }
  for (let i = 0; i < count; i++) pool[i].body = null;
}
