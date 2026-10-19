import { CONFIG } from './config.js';
import { CHASSIS, DEFAULT_CHASSIS } from './chassis.js';
import { sectorById, SECTOR_SIZE, SECRET_HOLE } from './sectors.js';
import { CATALOGUE } from './rewards.js';
import { SIGNALS } from './progression.js';
import { FIXTURE_SIGNS } from './signs.js';
import { LOOK_FINDS } from './looks.js';
import { STRANGERS } from './strangers.js';
import { KEEP_OUT } from './keepOut.js';
import { FLAG } from './flags.js';
import { sanitizeObstacle } from './trace.js';

// Spatial revision, independent of payload shape. A current snapshot must never relocate an accepted task again.
// 1: Map X (2026-10-10). 2: the black hole put in K-05 in the secret hole's place (2026-10-19, src/sectors.js `hole-k05`): what a
// pilot left where its pull now stands is moved once to the nearest clear point, as Map X moved it; a legal point stays exact.
export const MAP_REVISION = 2;
const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height, EPS = 1e-5;
const circle = (p, r) => ({ x: p.x * W, y: p.y * H, r });

// These are the normal bodies of the pre-X map, in world units. A historical flight cannot be simulated again:
// its old body is a recorded outline, as an old asteroid already is in GhostReplay. Never resolve it by today's label.
const OLD_BODIES = Object.freeze({
  'sector-j04': [[1728, 2592, 340], [8640, 6480, 335], [9720, 9720, 275], [2592, 6696, 300]],
  'sector-j05': [[8208, 3456, 405], [2808, 8856, 400], [2592, 3240, 219]],
  'sector-k04': [[2160, 1944, 320], [8359.2, 2624.4, 260], [7344, 7128, 330]],
  'sector-k05': [[2160, 3456, 520], [7560, 8640, 295]],
  'sector-j06': [[7560, 3888, 520], [2376, 8856, 250]],
  'sector-k06': [[1080, 864, 300], [7992, 8640, 270], [5184, 4752, 250]],
});

// Exact nearest point outside a union of circles and inside a rectangle. A nearest boundary point is radial,
// a circle intersection, an edge intersection or a corner. No random stream is consumed by a save repair.
export function nearestMapPoint(point, hazards, edge = CONFIG.stranded.edgeMargin, optional = false) {
  const lo = edge, hiX = W - edge, hiY = H - edge;
  const safe = (x, y) => x >= lo && y >= lo && x <= hiX && y <= hiY &&
    hazards.every((h) => Math.hypot(x - h.x, y - h.y) >= h.r - EPS);
  if (safe(point.x, point.y)) return point;
  const circles = hazards.map((h) => ({ ...h, r: h.r + EPS * 4 }));
  let best = null, distance = Infinity;
  const offer = (x, y) => {
    const d = Math.hypot(x - point.x, y - point.y);
    if (d < distance && safe(x, y)) { best = { x, y }; distance = d; }
  };
  offer(Math.max(lo, Math.min(hiX, point.x)), Math.max(lo, Math.min(hiY, point.y)));
  for (const x of [lo, hiX]) for (const y of [lo, hiY]) offer(x, y);
  for (let i = 0; i < circles.length; i++) {
    const a = circles[i], d = Math.hypot(point.x - a.x, point.y - a.y);
    offer(a.x + (d ? (point.x - a.x) / d : 1) * a.r, a.y + (d ? (point.y - a.y) / d : 0) * a.r);
    for (const x of [lo, hiX]) {
      const n = a.r * a.r - (x - a.x) ** 2;
      if (n >= 0) { offer(x, a.y - Math.sqrt(n)); offer(x, a.y + Math.sqrt(n)); }
    }
    for (const y of [lo, hiY]) {
      const n = a.r * a.r - (y - a.y) ** 2;
      if (n >= 0) { offer(a.x - Math.sqrt(n), y); offer(a.x + Math.sqrt(n), y); }
    }
    for (let j = 0; j < i; j++) {
      const b = circles[j], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      if (!len || len > a.r + b.r || len < Math.abs(a.r - b.r)) continue;
      const along = (a.r * a.r - b.r * b.r + len * len) / (2 * len);
      const across = Math.sqrt(Math.max(0, a.r * a.r - along * along));
      const x = a.x + dx * along / len, y = a.y + dy * along / len;
      offer(x - dy * across / len, y + dx * across / len);
      offer(x + dy * across / len, y - dx * across / len);
    }
  }
  if (!best && !optional) throw new Error('Map migration could not preserve an accessible position');
  return best;
}

function bodyHazards(sectorId, kind, clear = 0) {
  const sector = sectorById(sectorId);
  if (!sector || sector.hidden) return [];
  const orbit = CONFIG.planet.orbit.height, reach = CONFIG.cache.interactRadius;
  const thrust = CHASSIS[DEFAULT_CHASSIS].thrust;
  const planets = (sector.planets ?? []).map((p) => circle(p, kind === 'cache' ? p.radius + 2 * orbit + reach + 100 : p.radius + orbit + clear));
  const holes = (sector.holes ?? []).map((h) => circle(h, kind === 'quest' ? 2 * (h.disc ?? 250) + clear :
    Math.max(h.disc, Math.sqrt(h.mass / (thrust * CONFIG.stranded.gravityShare))) + (kind === 'cache' ? orbit + reach + 100 : clear)));
  const stations = kind === 'personal' ? [] : (sector.stations ?? []).map((s) => circle(s,
    kind === 'cache' ? CONFIG.station.interactRadius + reach + 200 : Math.max(KEEP_OUT, 900 + clear)));
  const marks = kind === 'quest' ? [...CATALOGUE, ...SIGNALS].filter((g) => g.sector === sectorId).map((g) => circle(g, clear)) : [];
  return [...planets, ...holes, ...stations, ...marks];
}

function movePoint(p, sectorId, kind, { fractional = false, clear = 0, extra = [], preferred = [], edge = CONFIG.stranded.edgeMargin } = {}) {
  if (sectorById(sectorId)?.hidden) return false;
  const at = fractional ? { x: p.x * W, y: p.y * H } : p;
  const hazards = [...bodyHazards(sectorId, kind, clear), ...extra];
  let next = nearestMapPoint(at, hazards, edge);
  if (next.x === at.x && next.y === at.y) return false;
  if (preferred.length) next = nearestMapPoint(at, [...hazards, ...preferred], edge, true) ?? next;
  p.x = fractional ? next.x / W : next.x;
  p.y = fractional ? next.y / H : next.y;
  return true;
}

function historicalObstacle(rec) {
  if (rec.obstacle || !rec.trace?.length || !['planet', 'hole'].includes(rec.cause)) return rec.obstacle;
  const end = rec.trace.at(-1);
  const hits = (OLD_BODIES[rec.sectorId] ?? []).map(([x, y, r]) => ({ x, y, r, gap: Math.abs(Math.hypot(end[1] - x, end[2] - y) - r) }))
    .sort((a, b) => a.gap - b.gap);
  const hit = hits[0];
  return hit && Math.hypot(end[1] - hit.x, end[2] - hit.y) <= hit.r + CONFIG.stranded.wellMargin ? { x: hit.x, y: hit.y, r: hit.r } : null;
}

// Called only after Progress/SignBoard/flags readers and frontier settlement. Every record here has already been validated.
// `from`: the save's own revision. A lost cargo's historical obstacle (the pre-X map's body it hit) is looked up only for a save
// from before Map X: a later save's loss was made on today's map.
export function migrateMapLedger(ledger, signs, flags, secret = null, from = 0) {
  const roaming = (sectorId, radius = SECRET_HOLE.disc * 2) => secret?.sectorId === sectorId ? [circle(secret, radius)] : [];
  for (const [id, p] of ledger.placed) {
    if (ledger.found.has(id)) continue;
    const extra = [
      ...SIGNALS.filter((g) => g.sector === p.sector).map((g) => circle(g, 800)),
      ...FIXTURE_SIGNS.filter((g) => g.sector === p.sector).map((g) => circle(g, CONFIG.sign.objectClear + CONFIG.sign.spacing)),
      ...LOOK_FINDS.filter((g) => g.sector === p.sector).map((g) => circle(g, 1000)),
      ...STRANGERS.filter((g) => g.sector === p.sector).map((g) => circle(g, 800)),
      ...roaming(p.sector, CONFIG.cache.place.hole),
      ...[...ledger.placed].filter(([other, q]) => other !== id && q.sector === p.sector && !ledger.found.has(other))
        .map(([, q]) => circle(q, CONFIG.cache.place.apart)),
    ];
    const next = { ...p };
    if (movePoint(next, p.sector, 'cache', { fractional: true, extra })) ledger.placed.set(id, Object.freeze(next));
  }
  for (const rec of ledger.stranded.values()) {
    const oldX = rec.x, oldY = rec.y;
    const obstacle = from >= 1 ? rec.obstacle : historicalObstacle(rec);
    const extra = [...STRANGERS.filter((s) => s.sector === rec.sectorId).map((s) => circle(s, 2 * CONFIG.stranded.interactRadius)),
      ...roaming(rec.sectorId, SECRET_HOLE.disc * 2 + CONFIG.stranded.wellMargin)];
    if (movePoint(rec, rec.sectorId, 'cargo', { clear: CONFIG.stranded.wellMargin, extra })) {
      const dx = rec.x - oldX, dy = rec.y - oldY;
      if (rec.trace) rec.trace = rec.trace.map(([t, x, y, a, f]) => [t, x + dx, y + dy, a, f]);
      rec.obstacle = obstacle ? sanitizeObstacle({ ...obstacle, x: obstacle.x + dx, y: obstacle.y + dy }) : null;
    } else if (obstacle && !rec.obstacle) rec.obstacle = obstacle;
  }
  for (const p of signs.placed) movePoint(p, p.sectorId, 'personal', { extra: roaming(p.sectorId) });
  for (const p of flags) if (p && movePoint(p, p.sector, 'personal', { edge: FLAG.margin, extra: roaming(p.sector) })) {
    // Flag readers round to whole units. Pick the closest clear integer neighbour so the next load is exactly stable.
    const hazards = [...bodyHazards(p.sector, 'personal'), ...roaming(p.sector)], x = Math.round(p.x), y = Math.round(p.y), choices = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const q = { x: x + dx, y: y + dy };
      if (q.x >= FLAG.margin && q.y >= FLAG.margin && q.x <= W - FLAG.margin && q.y <= H - FLAG.margin &&
          hazards.every((h) => Math.hypot(q.x - h.x, q.y - h.y) >= h.r)) choices.push(q);
    }
    choices.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    Object.assign(p, choices[0]);
  }
}

function moveCapsule(combat, sectorId, secret) {
  const c = combat?.capsule;
  if (!c || !['available', 'carried'].includes(c.state)) return;
  const extra = secret?.sectorId === sectorId ? [circle(secret, SECRET_HOLE.disc * 2 + CONFIG.stranded.wellMargin)] : [];
  movePoint(c, sectorId, 'cargo', { clear: CONFIG.stranded.wellMargin, extra });
  movePoint(c.exit, sectorId, 'cargo', { edge: 0, extra });
}

// Existing quest readers resolve endpoint IDs and preserve payment, finite combat supplies, age and seconds remaining.
export function migrateMapQuests(world) {
  const q = world.sideQuest, places = [];
  const add = (p, sectorId, clear, fractional = false) => places.push({ p, sectorId, clear, fractional });
  if (q?.kind === 'rescue') add(q.drifter, q.drifter.sectorId, CONFIG.quests.rescue.clear, true);
  if (q?.kind === 'wreck') add(q.wreck, q.wreck.sectorId, CONFIG.quests.wreck.clear, true);
  if (world.pester) add(world.pester, world.pester.sectorId, CONFIG.quests.pester.clear);
  if (world.special) {
    const s = world.special;
    add(s.site, s.site.sectorId, CONFIG.quests.special.clear);
    const g = s.plan.ground;
    if (g?.kind === 'point') add({ x: g.fx, y: g.fy }, g.sectorId, CONFIG.quests.special.clear, true);
  }
  const global = (p) => {
    const sector = sectorById(p.sectorId);
    return { x: sector.col * W + p.p.x * (p.fractional ? W : 1), y: sector.row * H + p.p.y * (p.fractional ? H : 1) };
  };
  // Reserve fixed targets too. Already legal sites keep their exact coordinates; separation is a preference for moved sites.
  const original = places.map(global);
  const fixed = world.questPlaces().filter((p) => !original.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < EPS));
  for (const entry of places) {
    const sector = sectorById(entry.sectorId);
    const preferred = [...fixed, ...places.filter((other) => other !== entry).map(global)]
      .map((p) => ({ x: p.x - sector.col * W, y: p.y - sector.row * H, r: CONFIG.quests.apart }));
    const extra = world.secretHole?.sectorId === entry.sectorId ? [circle(world.secretHole, SECRET_HOLE.disc * 2 + entry.clear)] : [];
    movePoint(entry.p, entry.sectorId, 'quest', { fractional: entry.fractional, clear: entry.clear, preferred, extra });
  }
  const ground = world.special?.plan.ground;
  if (ground?.kind === 'point') { const point = places.at(-1).p; ground.fx = point.x; ground.fy = point.y; }
  if (world.pester) {
    moveCapsule(world.pester.combat, world.pester.sectorId, world.secretHole);
  }
}
