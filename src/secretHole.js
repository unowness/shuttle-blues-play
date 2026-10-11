// The secret hole: the way into the hidden sector O-08, standing in the open sectors at a place that moves.
//
// SX, 2026-10-02: «Давай черная дыра в секретный сектор будет спавниться в разных местах из открытой зоны, у нее нет
// статичного места, и на карте ее нет только на локаторе как обычная черная дыра, юзер должен узнать ее по тому что
// она крутится в другую сторону и внутри себя имеет кольцо другого цвета или некоторые символы в ее рисунке розовые
// ... когда ты вылетаешь из секретного сектора, тебя выкидывает наружу из рандомной дыры которая не является
// секретной, а секретная переезжает».
//
// So there is one secret hole in the six sectors of the grid, at a clear spot rolled at random (not in the catalogue:
// src/sectors.js lists only the holes that stand still, and the map, the map editor and every check of the catalogue
// read that list, so this hole is on none of them; the locator reads the world's bodies and shows it like any hole).
// Falling into it leads to O-08's own hole (`hole-hidden`); no ordinary hole leads there (`otherHoles`); leaving O-08
// through its hole comes out of an ordinary one, and the secret hole moves to a new place (World.transitHole). The
// place is saved (`secretHole` in the save, v12) and a save without one is given a fresh place.
//
// The world holds the place and the body; this module holds the rules for where a hole may stand and the functions
// that put it there. Presentation (the pink tell, the spin) is the BlackHole painter's (src/bodies.js).
//
// Since SX's pick of 2026-10-04 (H3 LURE on labs/graphics/sketches/secret-hole-rules.html, after «Постоянно встречаешь розовую
// секретную черную дыру, надо гораздо реже и придумать интересный алгоритм появления, в целом это чуть меньшая редкость чем встреча
// квеста с персонажем отсылкой в космосе») the hole does not stand: it comes to a pilot alone in the void and goes again (the lure,
// below; CONFIG.blackHole.secret.lure), about once in 23 minutes of flight. A World built with `secretLure: false` keeps the hole
// as it was before (always standing, moved on leaving O-08): the checks of its place and its passages.

import { CONFIG } from './config.js';
import { CHASSIS, DEFAULT_CHASSIS } from './chassis.js';
import { BlackHole } from './bodies.js';
import { SECTORS, SECTOR_SIZE, SECRET_HOLE } from './sectors.js';
import { CATALOGUE } from './rewards.js';
import { SIGNALS } from './progression.js';
import { FIXTURE_SIGNS } from './signs.js';
import { LOOK_FINDS } from './looks.js';
import { STRANGERS } from './strangers.js';
import { NPCS } from './traffic.js';
import { mulberry32 } from './util.js';
import { sectorOpen } from './frontier.js';

// The roaming hole's id (a catalogue hole's is `hole-<sector>`), and the id of O-08's hole it leads to.
export const SECRET_HOLE_ID = 'hole-secret';
export const SECRET_EXIT_ID = 'hole-hidden';

// The seed of the stream for rolling the hole's place in a World not asked to roll it (`rollSecret`, src/world.js: a check's or a
// tool's; PLAN D1, 2026-10-03: the game's page asks for it, and the place is rolled from the world's own seed): such a World puts it
// at the same spot every time, so a flight a check makes in the open is never met by a hole at a place it did not choose, like the
// droids and the visitors.
const SECRET_SEED = 0x5ec7e7;

// The sectors the secret hole may stand in: the six of the grid, never O-08. The one place that says so, so that a
// filter (only some sectors open) is added here and nowhere else. With a `ledger`, only those open to its pilot (the frontier,
// src/frontier.js, 2026-10-02): the hole is never past a closed border, and one saved there moves (World.restore).
export function secretHoleSectors(ledger = null) {
  return SECTORS.filter((s) => !s.hidden && (!ledger || sectorOpen(ledger, s)));
}

const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
const P = () => CONFIG.blackHole.secret.place;
const D = SECRET_HOLE.disc;
// How far from the hole the pull on a ship is `share` of the flown ship's main thrust: a station, a cache, a signal and a
// lost cargo are places where a pilot parks and reads a menu, and everywhere else the pull there is held under 1 % of the
// thrust (checks/planets.mjs, checks/ruins.mjs) so the ship does not drift away while it is read. At this hole's mass 1 %
// is 1790 u, and the sectors have no spot that far from all their stations and caches (0.0 to 0.5 % of a sector's middle),
// so the shares are looser: CONFIG.blackHole.secret.place.pull, a station's and the rest's.
const pullReach = (share) => Math.sqrt(SECRET_HOLE.mass / (share * CHASSIS[DEFAULT_CHASSIS].thrust));
const round4 = (v) => Math.round(v * 1e4) / 1e4;

// What a hole of the secret hole's size must keep clear of in a sector, from the catalogue alone and kept (the catalogue
// stands still): each a centre, what it is and `r0`, the part of the distance that is the thing's own; the distance
// a hole's centre keeps from it is worked out when asked (`need`), from the tunable CONFIG.blackHole.secret.place.
const stands = new Map();
function standsIn(sector) {
  let list = stands.get(sector.id);
  if (list) return list;
  const at = (t) => ({ x: t.x * W, y: t.y * H });
  list = [];
  for (const p of sector.planets ?? []) list.push({ ...at(p), kind: 'planet', r0: p.radius + CONFIG.planet.orbit.height, what: `planet ${p.label}` });
  for (const s of sector.stations ?? []) list.push({ ...at(s), kind: 'station', r0: 0, what: `station ${s.label}` });
  for (const h of sector.holes ?? []) list.push({ ...at(h), kind: 'hole', r0: h.disc, what: `hole ${h.id}` });
  // What a pilot must reach or read: caches, signals, a look's cache, other pilots' signs, lost cargo.
  const points = [
    ...CATALOGUE.filter((f) => f.sector === sector.id), ...SIGNALS.filter((g) => g.sector === sector.id),
    ...LOOK_FINDS.filter((f) => f.sector === sector.id), ...FIXTURE_SIGNS.filter((f) => f.sector === sector.id),
    ...STRANGERS.filter((f) => f.sector === sector.id),
  ];
  for (const t of points) list.push({ ...at(t), kind: 'reach', r0: 0, what: t.id ?? 'a place' });
  stands.set(sector.id, list);
  return list;
}
// How far a hole's centre keeps from one of those.
function need(t) {
  const c = P();
  return t.kind === 'planet' ? t.r0 + D + c.gap : t.kind === 'hole' ? c.apart * (t.r0 + D) : pullReach(c.pull[t.kind]);
}

// The friendly ships' ways in a sector (src/traffic.js NPCS): a lane is a segment, an orbit a ring, in fractions.
function lanesIn(sector) {
  return NPCS.filter((n) => n.sector === sector.id).map((n) => n.path);
}
const toSegment = (x, y, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const f = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
  return Math.hypot(x - (a.x + dx * f), y - (a.y + dy * f));
};

// Why a hole of the secret hole's size cannot stand at (x, y), in world units of `sector`, or null when it can.
// `extra` is the pilot's own things the catalogue does not hold ([{ sectorId, x, y }]: a lost cargo, a sign).
export function placeIssue(sector, x, y, extra = []) {
  const c = P();
  if (x < c.edge || y < c.edge || x > W - c.edge || y > H - c.edge) return 'too near the sector edge';
  for (const t of standsIn(sector)) if (Math.hypot(t.x - x, t.y - y) < need(t)) return `too near ${t.what}`;
  for (const t of extra) if (t.sectorId === sector.id && Math.hypot(t.x - x, t.y - y) < pullReach(c.pull.reach)) return 'too near a pilot\'s own thing';
  for (const lane of lanesIn(sector)) {
    const d = lane.kind === 'orbit'
      ? Math.abs(Math.hypot(x - lane.at[0] * W, y - lane.at[1] * H) - lane.radius * W)
      : toSegment(x, y, { x: lane.from[0] * W, y: lane.from[1] * H }, { x: lane.to[0] * W, y: lane.to[1] * H });
    if (d < D + c.lane) return 'too near a ship\'s lane';
  }
  return null;
}

// Why a saved place is not good, or null: a sector the hole may stand in (open to the pilot of `ledger`, when given), whole
// fractions, and clear as above. The pilot's own things are not asked here: a place a pilot reached was clear of them when it
// was made.
export function secretHoleIssue(place, ledger = null) {
  if (!place || typeof place !== 'object') return 'none';
  const sector = secretHoleSectors(ledger).find((s) => s.id === place.sectorId);
  if (!sector) return 'not a sector the hole may stand in';
  if (!Number.isFinite(place.x) || !Number.isFinite(place.y) || place.x <= 0 || place.x >= 1 || place.y <= 0 || place.y >= 1) return 'not a place';
  return placeIssue(sector, place.x * W, place.y * H);
}

// A saved place, read as untrusted input: the clean place, or null (the save has none, or one that no longer holds).
export function readSecretHole(raw, ledger = null) {
  return secretHoleIssue(raw, ledger) === null ? { sectorId: raw.sectorId, x: round4(raw.x), y: round4(raw.y) } : null;
}

// A place for the hole: a sector drawn at random from the ones it may stand in (each as likely as another, whatever its
// room), then a clear spot in it; the next sector in the draw when a sector has none. `away` ({ sectorId, x, y, by }, in
// that sector's units) keeps it `by` u from a point, the pilot's, so it is not found where the pilot has just come out.
// Null when no sector has a spot (the catalogue as it is, none fails).
export function rollSecretHole(rng, { extra = [], away = null, sectors = secretHoleSectors() } = {}) {
  const order = sectors.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const c = P(), here = away && SECTORS.find((s) => s.id === away.sectorId);
  for (const sector of order) {
    for (let k = 0; k < 160; k++) {
      const fx = round4((c.edge + (W - 2 * c.edge) * rng()) / W), fy = round4((c.edge + (H - 2 * c.edge) * rng()) / H);
      const x = fx * W, y = fy * H;
      if (here && Math.hypot((sector.col - here.col) * W + x - away.x, (sector.row - here.row) * H + y - away.y) < away.by) continue;
      if (placeIssue(sector, x, y, extra) === null) return { sectorId: sector.id, x: fx, y: fy };
    }
  }
  return null;
}

// The place as the rest of the game may ask it, without a world: where the hole stands now, for the quests' open places
// (src/spots.js) to keep clear of. It is the place of the world that last put its hole somewhere on purpose (`setSecretHole`
// with `announce`: the page's first move, a restored save, a move out of O-08), and not of one that was only built: the
// boot's rehearsal world is built after the page's own, and a mirror set by every constructor would be its place.
let standing = null;
export const secretHoleAt = (sectorId) => (standing && standing.sectorId === sectorId ? standing : null);

// A BlackHole for a place, in world units; `rng`: where the turn it starts at is drawn (the world's, World.rng).
const secretBody = (place, rng) => new BlackHole({
  ...SECRET_HOLE, id: SECRET_HOLE_ID, secret: true, x: place.x * W, y: place.y * H,
}, rng);

// The hole of the world's place as an array, for a sector's bodies to take: empty unless it stands in that sector.
export const secretHoleBodies = (world, sector) => (world.secretBody && world.secretHole.sectorId === sector.id ? [world.secretBody] : []);

// Puts the hole at `place` (null takes it away); `announce` false (a world's own constructor) leaves what spots.js is told
// alone. The sectors' bodies are built once and kept, so the old body leaves its
// sector's list and the new one joins its sector's, in place: the world's `holes` of the sector the pilot is in is that
// very list, and what is drawn across a seam reads the same ones.
export function setSecretHole(world, place, announce = true) {
  if (world.secretBody) for (const b of world.bodyCache.values()) {
    const i = b.holes.indexOf(world.secretBody);
    if (i >= 0) b.holes.splice(i, 1);
  }
  world.secretHole = place ? { sectorId: place.sectorId, x: place.x, y: place.y } : null;
  world.secretBody = place ? secretBody(place, world.rng('sky:secret')) : null;
  if (place) world.bodyCache.get(place.sectorId)?.holes.push(world.secretBody);
  if (announce) standing = world.secretHole;
  if (world.sector) world.rebuildAttractors();
}

// What the pilot has left in the world that the catalogue does not know: stranded cargo and signs, in world units.
export function secretExtras(world) {
  return [
    ...[...world.ledger.stranded.values()].map((s) => ({ sectorId: s.sectorId, x: s.x, y: s.y })),
    ...world.signs.placed.map((s) => ({ sectorId: s.sectorId, x: s.x, y: s.y })),
    // The caches laid for this pilot and not yet opened (src/cachePlaces.js), which the catalogue does not hold where they lie.
    ...[...(world.ledger.placed ?? [])].filter(([id]) => !world.ledger.found.has(id)).map(([, p]) => ({ sectorId: p.sector, x: p.x * W, y: p.y * H })),
  ];
}

// Rolls a new place with the world's own stream and puts the hole there; the old place stays when none is found.
// `away`: a point in a sector's world units the new place keeps `place.away` (CONFIG.blackHole.secret) from: the pilot's.
export function moveSecretHole(world, away = null) {
  const place = rollSecretHole(world.rng('secret'), {
    sectors: secretHoleSectors(world.ledger), extra: secretExtras(world), away: away && { ...away, by: P().away },
  });
  if (place) setSecretHole(world, place);
  return place;
}

export const newSecretStream = () => mulberry32(SECRET_SEED);

// ------------------------------------------------------------------------------------------------ the lure (H3)
//
// The hole comes to a pilot alone in the void: `void` u clear of every station, planet's orbit and hole's disc of the grid, for
// `alone` s at least, not docked nor taken in; no sooner than `rest` minutes of the pilot's clock after the last meeting (its going,
// or its sighting); then a chance of `chance` every `look` s, and past `pity` minutes for sure. It opens `ahead` u along the pilot's
// course, `spread` rad either side, at a place that holds every rule above, in an open sector. Unseen, it goes after `life` s, once
// the pilot is not near; seen (its middle within `sight` u of the ship), it stays while the pilot is near and goes once the pilot
// is `rearm` u off. Its timers run on the pilot's clock and are saved (`lure`, v18), so short sessions meet it as long ones do.
// The rule is pure (`stepLure`), as labs/graphics/sketches/secret-hole-rules.js simulates it: checks/secret-hole.mjs holds the
// page's median of 22.9 minutes between sightings.
const LURE = () => CONFIG.blackHole.secret.lure;

// A lure's state: `calm` and `sawAt` (the pilot's clock, s) its last going and its last sighting, `openedAt` when the hole now open
// came (null when none is); `alone` s alone in the void so far, `look` s to its next look, `armed` whether a sighting counts again.
export const newLure = (clock = 0) => ({ calm: clock, sawAt: null, openedAt: null, alone: 0, look: LURE().look, armed: true });
// What of it a save keeps, and a saved one read as untrusted input against the save's clock (a missing or junk one rests from it).
export const lureSave = (lure) => ({ calm: lure.calm, sawAt: lure.sawAt, openedAt: lure.openedAt });
export function readLure(raw, clock = 0) {
  const t = (v) => (Number.isFinite(v) ? Math.min(v, clock) : null);
  const lure = newLure(t(raw?.calm) ?? clock);
  lure.sawAt = t(raw?.sawAt);
  lure.openedAt = t(raw?.openedAt);
  return lure;
}

// One step of `dt` s at the pilot's `clock`: `alone` (the pilot alone in the void now), `open` (the hole is open), `dist` (u from
// the ship to it, Infinity when none, or the ship is not in the grid). Returns 'close' (the hole goes), 'open' (it may come: the
// caller places it and calls lureOpened when it found a place) or null. `rng` draws the chance.
export function stepLure(lure, { clock, dt, alone, open, dist }, rng, L = LURE()) {
  if (open && lure.armed && dist < L.sight) { lure.sawAt = clock; lure.armed = false; }
  if (!lure.armed && dist > L.rearm) lure.armed = true;
  lure.alone = alone ? lure.alone + dt : 0;
  if (open) {
    const met = lure.sawAt !== null && lure.openedAt !== null && lure.sawAt >= lure.openedAt;
    if ((!met && clock - lure.openedAt >= L.life && dist > L.sight) || (met && dist > L.rearm)) {
      lure.calm = clock; lure.openedAt = null;
      return 'close';
    }
    return null;
  }
  if ((lure.look -= dt) > 0) return null;
  lure.look = L.look;
  const since = clock - Math.max(lure.calm, lure.sawAt ?? -Infinity);
  return since >= L.rest * 60 && lure.alone >= L.alone && (since >= L.pity * 60 || rng() < L.chance) ? 'open' : null;
}
export function lureOpened(lure, clock) { lure.openedAt = clock; lure.sawAt = null; lure.armed = true; }

// The grid's bodies a pilot alone keeps clear of, in the grid's units (a sector's col and row times its size, plus its point): a
// station, a planet with its orbit, a hole with its disc; from the catalogue (the stations' float is a few dozen units).
let BODIES = null;
function gridBodies() {
  if (BODIES) return BODIES;
  BODIES = secretHoleSectors().flatMap((s) => [
    ...(s.stations ?? []).map((t) => ({ x: s.col * W + t.x * W, y: s.row * H + t.y * H, r: 0 })),
    ...(s.planets ?? []).map((t) => ({ x: s.col * W + t.x * W, y: s.row * H + t.y * H, r: t.radius + CONFIG.planet.orbit.height })),
    ...(s.holes ?? []).map((t) => ({ x: s.col * W + t.x * W, y: s.row * H + t.y * H, r: t.disc ?? 250 })),
  ]);
  return BODIES;
}
// Whether a point of the grid is in the void: `clear` u past every body.
export const inVoid = (x, y, clear = LURE().void) => gridBodies().every((b) => Math.hypot(b.x - x, b.y - y) > b.r + clear);
const gridSectorAt = (x, y) => secretHoleSectors().find((s) => x >= s.col * W && x < (s.col + 1) * W && y >= s.row * H && y < (s.row + 1) * H) ?? null;

// A place ahead of a pilot at (x, y) of the grid going `heading`: `ahead` u on, `spread` rad either side, in a sector open to the
// pilot of `ledger`, holding every rule (placeIssue, the pilot's own things `extra` too); null when none of `tries` holds (the next
// look tries again).
export function lureAhead(rng, { x, y, heading }, { ledger = null, extra = [], tries = 80 } = {}, L = LURE()) {
  for (let k = 0; k < tries; k++) {
    const a = heading + (rng() * 2 - 1) * L.spread, d = L.ahead[0] + rng() * (L.ahead[1] - L.ahead[0]);
    const gx = x + Math.cos(a) * d, gy = y + Math.sin(a) * d, s = gridSectorAt(gx, gy);
    if (!s || (ledger && !sectorOpen(ledger, s))) continue;
    const fx = round4((gx - s.col * W) / W), fy = round4((gy - s.row * H) / H);
    if (placeIssue(s, fx * W, fy * H, extra) === null) return { sectorId: s.id, x: fx, y: fy };
  }
  return null;
}

// The world's lure, a step of `dt` s (World.step): the ship's point in the grid, whether it is alone in the void, how far the open
// hole is; the hole opened ahead of it or taken away as the rule says. A World with `secretLure` off keeps its hole as it is.
export function stepSecretHole(world, dt) {
  if (!world.secretLure) return;
  const L = LURE(), ship = world.ship, clock = world.ledger.clock, sector = world.sector;
  const at = sector && !sector.hidden && ship.alive ? { x: sector.col * W + ship.x, y: sector.row * H + ship.y } : null;
  const p = world.secretHole, hs = p && SECTORS.find((s) => s.id === p.sectorId);
  const dist = at && hs ? Math.hypot(hs.col * W + p.x * W - at.x, hs.row * H + p.y * H - at.y) : Infinity;
  const alone = !!at && !world.docked && !world.home && inVoid(at.x, at.y, L.void);
  const what = stepLure(world.lure, { clock, dt, alone, open: !!p, dist }, world.rng('secret'), L);
  if (what === 'close') setSecretHole(world, null);
  else if (what === 'open') {
    const heading = Math.hypot(ship.vx, ship.vy) > 1 ? Math.atan2(ship.vy, ship.vx) : ship.angle;
    const place = lureAhead(world.rng('secret'), { ...at, heading }, { ledger: world.ledger, extra: secretExtras(world) }, L);
    if (place) { setSecretHole(world, place); lureOpened(world.lure, clock); }
  }
}
