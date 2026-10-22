// Map editor: the game's catalogues as one layout, and the layout file's shape.
//
// This module is pure (no DOM), so Node can import it. It reads the REAL catalogues of src/ and never
// copies a position by hand: when the game's catalogue changes, the editor's "game layout" follows.
//
// LAYOUT FILE, version 2 (labs/map-editor/layout.json; README.md has the longer version)
//   {
//     version: 2,
//     savedAt: ISO string | null,        null + pristine:true = the untouched game layout, nothing saved yet
//     pristine: boolean,
//     sectorSize: { width: 7200, height: 7200 },
//     sectors: [{ id, label, name, col, row, hidden, asteroids, pirateRate, note,
//                 game: { label, name, col, row, hidden, asteroids, pirateRate } | null }],
//     objects: [{ kind, id, label, description, sector, x, y, note,
//                 game: { sector, x, y, label, description } | null,       // null = an object SX ADDED (not in the game)
//                 props }],
//     shelf:   [ same record, sector / x / y null: taken off the map, nothing destroyed ],
//     summary: { moved, changedSector, shelved, added, renamed, described, looked, notes, ... }
//   }
//   x, y are FRACTIONS of the sector (0..1), as in src/sectors.js. `game` is what the game had when the file was
//   made (a diff reference: place, name, description). `label` is the object's name, editable; `description` is the
//   in-game text (lore, a hail, a sign's line), prefilled from the game; `note` is SX's instructions on mechanics.
//   `props` are facts of the catalogue that are not placement (a planet's radius, a cache's price ...); of an ADDED
//   object they are what SX set. A planet's props also hold its LOOK (`style`, `tint2`, `bands`, `spin`, `seed`; labs/
//   graphics/world-art.js paintPlanet draws a planet from them at its `radius`), and its `game.look` is the look the game
//   had, so a resized or regenerated planet is told from one left alone. kind: planet | hole | station | cache | look | signal | sign | stranger | traffic | npc | marker
//   (marker: a free "event" that does not exist in the game yet; props.type is a short word SX typed).
//   npc: a friendly ship of the grid's sectors (src/npcShips.js). Its x, y are DERIVED (the lane's middle, or the
//   point of its orbit at its phase), never set by hand. props.route is the route as src/npcShips.js authors it:
//   `from` / `to` / `at` are a station id, `planet:NAME`, or [x, y] fractions (the free anchors SX drags);
//   props.path is that route resolved against THIS layout (what src/traffic.js craftPose reads), null with
//   props.problem when an anchor's station or planet is not in the ship's sector.
//   Version 1 (no description, `game` without label / description) is still read: nothing in it is lost.

import { SECTORS, SECTOR_SIZE, stationDefById } from '../../src/sectors.js';
import { FINDS, findLabel } from '../../src/rewards.js';
import { SIGNALS } from '../../src/progression.js';
import { FIXTURE_SIGNS, signText } from '../../src/signs.js';
import { STRANGERS } from '../../src/strangers.js';
import { TRAFFIC } from '../../src/traffic.js';
import { NPC_ART, NPC_ROUTES, NPC_CLEAR } from '../../src/npcShips.js';
import { LOOK_FINDS, lookById, lookFindLabel } from '../../src/looks.js';
import { stationLore, stationInfo } from '../../src/stationInfo.js';
import { paintById, PENDING_PAINT } from '../../src/paint.js';
import { CONFIG } from '../../src/config.js';
import { SOUVENIR_LORE } from '../graphics/souvenir-lore.js';

export { SECTOR_SIZE };
export const VERSION = 2;
const READABLE_VERSIONS = [1, 2];

// The map pulls sectors apart by GAP u so their titles have room; the game's sectors touch. The ruler
// measures as if they touched (view.js mapToGame).
export const GAP = 1100;
export const PITCH = SECTOR_SIZE.width + GAP;
// Extra air above the off-grid strip, for the dashed rule and its note.
export const OFFGRID_AIR = 700;

// Full speed, u/s (CONFIG.sector comments: "coasting in at full speed 1500"): the ruler's seconds.
export const FULL_SPEED = 1500;

// The snap grid: one fiftieth of a sector, 144 u.
export const SNAP_STEP = 1 / 50;

// Layers, bottom to top in drawing order. `name` is the layer's word, `one` a single item's.
export const KINDS = Object.freeze([
  { id: 'planet', name: 'PLANETS', one: 'PLANET' },
  { id: 'hole', name: 'HOLES', one: 'BLACK HOLE' },
  { id: 'station', name: 'STATIONS', one: 'STATION' },
  { id: 'cache', name: 'CACHES', one: 'CACHE' },
  { id: 'look', name: 'LOOK CACHES', one: 'LOOK CACHE', addable: false },   // the interface's looks found in open space (src/looks.js): the game's own, not added by hand
  { id: 'signal', name: 'SIGNALS', one: 'SIGNAL' },
  { id: 'sign', name: 'SIGNS', one: 'SIGN' },
  { id: 'stranger', name: 'LOST CARGO', one: 'LOST CARGO' },
  { id: 'traffic', name: 'TRAFFIC', one: 'CRAFT' },
  { id: 'npc', name: 'NPC SHIPS', one: 'NPC SHIP', addable: false },   // routes, not things SX places: the game's own
  { id: 'marker', name: 'EVENTS', one: 'EVENT' },
]);
export const ADD_KINDS = Object.freeze(KINDS.filter((k) => k.addable !== false));
export const KIND_IDS = KINDS.map((k) => k.id);
export const kindName = (id) => KINDS.find((k) => k.id === id)?.one ?? id.toUpperCase();

// Radii the "radii" layer draws, from CONFIG. Optional chaining and a fallback because the game's config
// is edited in parallel; a missing key must not take the editor down.
const cfg = (read, fallback) => { try { const v = read(); return Number.isFinite(v) ? v : fallback; } catch { return fallback; } };
export const RADII = Object.freeze({
  orbit: cfg(() => CONFIG.planet.orbit.height, 200),            // a planet's cushion above its surface
  hull: cfg(() => CONFIG.station.hullRadius, 266),
  menu: cfg(() => CONFIG.station.interactRadius, 620),          // the station's menu opens inside it
  pirateFree: cfg(() => CONFIG.pirates.stationClear, 1200),     // no automatic pirate fight this close to a working station
  guardWake: cfg(() => CONFIG.pirates.guard.wake, 1000),        // a ruin's guards notice a pilot within it
  cache: cfg(() => CONFIG.cache.interactRadius, 380),
  signal: cfg(() => CONFIG.signal.reach, 90),
});
export const stationBody = (look) => {
  try { const b = CONFIG.station.bodies[look]; if (b && b.length === 2) return b; } catch { /* fall through */ }
  return [RADII.hull, RADII.hull];
};

export const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const round4 = (v) => Math.round(v * 10000) / 10000;
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export const objKey = (o) => `${o.kind}:${o.id}`;

const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;

const make = (kind, id, label, sector, x, y, props, description = '') => ({
  kind, id, label, description, sector, x: round4(x), y: round4(y), note: '',
  game: { sector, x: round4(x), y: round4(y), label, description }, props,
});

// A planet's look: what the game draws it from (radius to seed), and `pull`, which follows its size.
export const LOOK_KEYS = Object.freeze(['radius', 'pull', 'tint', 'tint2', 'style', 'seed', 'bands', 'spin']);
// A hue is the same hue in capitals or not: the game's catalogue lowercases it (planetHue), SX's file may spell it either way.
const norm = (v) => (v === undefined ? null : typeof v === 'string' ? v.toLowerCase() : v);
export const lookOf = (props) => Object.fromEntries(LOOK_KEYS.map((k) => [k, norm(props?.[k])]));
const sameLook = (a, b) => LOOK_KEYS.every((k) => norm(a?.[k]) === norm(b?.[k]));

// A pirate rate per sector: the one full-sector zone of CONFIG.pirates.zones, or null (the hidden sector).
const pirateRateOf = (id) => {
  try { return CONFIG.pirates.zones.find((z) => z.sectorId === id)?.rate ?? null; } catch { return null; }
};

// A craft's handle on the map: a lane's middle, an orbit's centre. Moving it moves the whole path.
export const trafficAnchor = (path) => (path.kind === 'orbit'
  ? { x: path.at[0], y: path.at[1] }
  : { x: (path.from[0] + path.to[0]) / 2, y: (path.from[1] + path.to[1]) / 2 });

export function translatePath(path, dx, dy) {
  const p = clone(path);
  if (p.kind === 'orbit') p.at = [round4(p.at[0] + dx), round4(p.at[1] + dy)];
  else { p.from = [round4(p.from[0] + dx), round4(p.from[1] + dy)]; p.to = [round4(p.to[0] + dx), round4(p.to[1] + dy)]; }
  return p;
}

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(isNum);
export const validPath = (p) => !!p && typeof p === 'object' && isNum(p.period) && (p.kind === 'orbit'
  ? isPoint(p.at) && isNum(p.radius) : p.kind === 'lane' && isPoint(p.from) && isPoint(p.to));

// A fresh lane or orbit round (x, y), for a craft SX adds.
export function defaultPath(kind, x, y) {
  return kind === 'orbit'
    ? { kind: 'orbit', at: [round4(x), round4(y)], radius: 0.08, period: 30, phase: 0, dir: 1 }
    : { kind: 'lane', from: [round4(x - 0.06), round4(y)], to: [round4(x + 0.06), round4(y)], period: 20, phase: 0 };
}

// A craft's `props.path` follows its handle: the game's path (or, for a craft SX added, its own) moved so that its
// anchor sits at x, y. Derived on every move, never typed.
export function syncDerived(o) {
  if (o.kind !== 'traffic') return o;
  const source = o.game?.path || (o.game ? null : o.props.path);
  if (o.sector == null && o.game) { o.props.path = null; return o; }
  if (!validPath(source)) { if (o.sector != null) o.props.path = defaultPath('lane', o.x, o.y); return o; }
  if (o.sector == null) return o;
  const a = trafficAnchor(source);
  o.props.path = translatePath(source, o.x - a.x, o.y - a.y);
  return o;
}

// ------------------------------------------------------------------ NPC routes

const samePoint = (a, b) => Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
export const validRoute = (r) => !!r && typeof r === 'object' && (r.kind === 'orbit' ? r.at != null : r.kind === 'lane' && r.from != null && r.to != null)
  && isNum(r.speed) && r.speed > 0;

// An NPC's route against the layout as it stands. A station or planet anchor is where that object is NOW and must be
// in the ship's own sector (src/npcShips.js leaves out a route whose place is elsewhere); a free anchor is its own
// [x, y]. The arithmetic is resolveRoute()'s there. `override` = { which, x, y } puts one free anchor elsewhere (a drag
// in progress). Returns { path, mid, anchors: [{ which, free, x, y }], problems }; path is null when a place is missing.
export function npcResolve(layout, o, override = null) {
  const R = o.props?.route;
  const out = { path: null, mid: null, anchors: [], problems: [] };
  if (!validRoute(R) || o.sector == null) return out;
  const find = (kind, id) => layout.objects.find((q) => q.kind === kind && q.id === id);
  const place = (which) => {
    const ref = R[which];
    if (Array.isArray(ref)) {
      const p = override && override.which === which ? [override.x, override.y] : ref;
      out.anchors.push({ which, free: true, x: p[0], y: p[1] });
      return { x: p[0] * W, y: p[1] * H, r: 0 };
    }
    const planet = typeof ref === 'string' && ref.startsWith('planet:');
    const target = planet ? find('planet', `planet-${slug(ref.slice(7))}`) : find('station', ref);
    if (!target) { out.problems.push(`${ref} IS NOT IN THE LAYOUT`); return null; }
    if (target.sector !== o.sector) { out.problems.push(`${target.label} IS ${target.sector == null ? 'ON THE SHELF' : 'IN ANOTHER SECTOR'}`); return null; }
    out.anchors.push({ which, free: false, x: target.x, y: target.y });
    return planet ? { x: target.x * W, y: target.y * H, r: (target.props.radius ?? 0) + RADII.orbit } : { x: target.x * W, y: target.y * H, r: 0, station: true };
  };
  if (R.kind === 'orbit') {
    const c = place('at');
    if (!c) return out;
    const radius = (c.station ? 0 : c.r) + (R.radius ?? 0);
    out.path = { kind: 'orbit', at: [c.x / W, c.y / H], radius: radius / W, period: (2 * Math.PI * radius) / R.speed, phase: R.phase ?? 0, dir: R.dir ?? 1 };
    out.mid = [out.path.at[0] + Math.cos(out.path.phase) * out.path.radius, out.path.at[1] + Math.sin(out.path.phase) * out.path.radius];
    return out;
  }
  const a = place('from'), b = place('to');
  if (!a || !b) return out;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const ca = a.station ? NPC_CLEAR : 0, cb = b.station ? NPC_CLEAR : 0;
  const from = [(a.x + ux * ca) / W, (a.y + uy * ca) / H], to = [(b.x - ux * cb) / W, (b.y - uy * cb) / H];
  const run = Math.max(len - ca - cb, 1);
  out.path = { kind: 'lane', from, to, period: run / R.speed, phase: (R.phase ?? 0) * (run / R.speed) };
  out.mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  return out;
}

// Every NPC's derived place and path, from the layout as it is. Run after anything that can move a station or a
// planet, or an anchor (the model does it on every edit, a load does it once).
export function syncNpcs(layout) {
  for (const o of layout.objects) {
    if (o.kind !== 'npc') continue;
    if (o.sector == null) { o.props.path = null; delete o.props.problem; continue; }
    const res = npcResolve(layout, o);
    if (res.path) { o.x = round4(res.mid[0]); o.y = round4(res.mid[1]); o.props.path = res.path; delete o.props.problem; } else { o.props.path = null; o.props.problem = res.problems.join('; ') || 'NO ROUTE'; }
  }
  return layout;
}

// ------------------------------------------------------------------ descriptions (the game's own text)

const stationLabel = (id) => stationDefById(id)?.label ?? id;

// A station's INFO lore (src/stationInfo.js); a ruin's carries what it becomes when restored, and one of the start's three
// that is another pilot's broken one (src/sectors.js START_STATIONS) what it is then.
function stationDescription(st) {
  const lore = stationLore(st.id), ruined = stationInfo(st.id)?.ruined;
  if (st.kind !== 'ruin') return ruined ? `${lore}\nWHEN BROKEN: ${ruined}` : lore;
  const rebuilt = stationLore(st.id, true);
  return rebuilt && rebuilt !== lore ? `${lore}\nWHEN RESTORED: ${rebuilt}` : lore;
}

// A souvenir cache: the souvenir's name and lore blurb (labs/graphics/souvenir-lore.js); a paint cache: the paint.
function cacheDescription(f) {
  if (f.kind === 'souvenir') { const l = SOUVENIR_LORE[f.content]; return l ? `${l.name} / ${l.lore}` : ''; }
  const p = paintById(f.content);
  if (!p) return '';
  return f.content === PENDING_PAINT ? `Ship paint ${p.label}. Its look is not chosen yet.` : `Ship paint ${p.label}.`;
}

// A look cache: the look it gives, in the editor's own words for it (film-grade.js).
const lookDescription = (f) => { const l = lookById(f.content); return l ? `Free to open. Gives the interface look ${l.name}: ${l.film}.` : ''; };

// Another pilot's lost cargo: its story from src/strangers.js, put in a sentence.
function strangerDescription(s) {
  const what = s.cause === 'planet' ? 'a planet' : 'an asteroid';
  return `${s.author} set out from ${stationLabel(s.contract.from)} for ${stationLabel(s.contract.to)} with ${s.contract.label} (${s.contract.reward} CR) and lost the ship to ${what}. Thanks line: ${s.thanks}`;
}

// A planet of the catalogue (or TERRA where a game has it: src/terra.js) as a layout's object in sector `sectorId`.
export function planetObject(p, sectorId) {
  const props = { radius: p.radius, pull: p.pull, tint: p.tint, seed: p.seed, aliens: !!p.aliens, bands: p.bands ?? 0, spin: p.spin ?? 0 };
  if (p.style) props.style = p.style;
  if (p.tint2) props.tint2 = p.tint2;
  const o = make('planet', `planet-${slug(p.label)}`, p.label, sectorId, p.x, p.y, props, '');
  o.game.look = lookOf(props);
  return o;
}

// The game's layout, built from the catalogues. A fresh copy each call.
export function gameLayout() {
  const sectors = SECTORS.map((s) => {
    // A sector's rocks as the layout counts them (`rocks`, for a sector of the layout's size); the game spawns that density over its
    // own sector (src/worldScale.js), `asteroids`.
    const game = { label: s.label, name: s.name || '', col: s.col, row: s.row, hidden: !!s.hidden,
      asteroids: s.rocks ?? 0, pirateRate: pirateRateOf(s.id) };
    return { id: s.id, ...clone(game), note: '', game };
  });
  const objects = [];
  for (const s of SECTORS) {
    for (const p of s.planets || []) objects.push(planetObject(p, s.id));
    for (const h of s.holes || []) {
      objects.push(make('hole', h.id, h.id.replace('hole-', 'HOLE ').toUpperCase(), s.id, h.x, h.y,
        { horizon: h.horizon, disc: h.disc, mass: h.mass, spinDir: h.spinDir }, ''));
    }
    for (const st of s.stations || []) {
      const props = { look: st.look, stationKind: st.kind };
      if (st.becomes) props.becomes = st.becomes;
      if (st.cost != null) props.cost = st.cost;
      objects.push(make('station', st.id, st.label, s.id, st.x, st.y, props, stationDescription(st)));
    }
  }
  for (const f of FINDS) {
    objects.push(make('cache', f.id, findLabel(f), f.sector, f.x, f.y,
      { cacheKind: f.kind, content: f.content, price: f.price, station: f.station }, cacheDescription(f)));
  }
  // The interface looks found in open space (src/looks.js LOOK_FINDS): SUNSET's cache, a free find of its own kind.
  for (const f of LOOK_FINDS) {
    objects.push(make('look', f.id, lookFindLabel(f), f.sector, f.x, f.y, { look: f.content }, lookDescription(f)));
  }
  for (const s of SIGNALS) {
    objects.push(make('signal', s.id, `SIGNAL ${s.id.replace('signal-', '').toUpperCase()}`, s.sector, s.x, s.y, {}, ''));
  }
  for (const s of FIXTURE_SIGNS) {
    objects.push(make('sign', s.id, signText(s), s.sector, s.x, s.y,
      { author: s.author, signType: s.type, words: s.words, ...(s.text ? { text: s.text } : {}) }, `${s.author}: ${signText(s)}`));
  }
  // Lost cargo: src/strangers.js keeps where it came to rest in WORLD UNITS (record.x / 7200 makes the
  // fraction used here). The resting point is not authored: tools/record-stranger-traces.mjs flies a wreck
  // and freezes it, together with the ghost's trace. Moving one here means that tool must run again.
  for (const s of STRANGERS) {
    objects.push(make('stranger', s.id, s.author, s.sector, s.x, s.y,
      { author: s.author, cargo: s.contract.label, from: s.contract.from, to: s.contract.to, reward: s.contract.reward,
        sourceUnit: 'src/strangerTraces.generated.js record x, y in world units; fraction = unit / 7200; moving needs tools/record-stranger-traces.mjs' },
      strangerDescription(s)));
  }
  for (const c of TRAFFIC) {
    const path = clone(c.path);
    const a = trafficAnchor(path);
    const o = make('traffic', c.id, c.label || c.id.toUpperCase(), c.sector, a.x, a.y,
      { craft: c.label || null, hail: c.hail || null, anchor: path.kind === 'orbit' ? 'orbit centre' : 'lane midpoint', path },
      c.hail || '');
    o.game.path = clone(path);
    objects.push(o);
  }
  // The friendly ships of the grid's sectors (src/npcShips.js). Their place is derived from the route, so it is worked
  // out once every station and planet is in the layout.
  for (const route of NPC_ROUTES) {
    const art = NPC_ART[route.code];
    if (!art) continue;
    const o = make('npc', `npc-${route.code.toLowerCase()}`, `${art.name} ${route.code}`, route.sector, 0.5, 0.5,
      { code: route.code, name: art.name, scheme: art.scheme, route: clone(route.path) }, '');
    o.game.route = clone(route.path);
    objects.push(o);
  }
  const layout = syncNpcs({ sectors, objects });
  for (const o of objects) if (o.kind === 'npc') { o.game.x = o.x; o.game.y = o.y; }
  return layout;
}

// ------------------------------------------------------------------ file

const cleanText = (v, max) => String(v ?? '').replace(/\r/g, '').slice(0, max);

export function toFile(layout, { savedAt = null, pristine = false } = {}) {
  const placed = layout.objects.filter((o) => o.sector != null);
  const shelved = layout.objects.filter((o) => o.sector == null);
  const record = (o) => ({ kind: o.kind, id: o.id, label: o.label, description: o.description ?? '', sector: o.sector, x: o.x, y: o.y,
    note: o.note, game: clone(o.game ?? null), props: clone(o.props) });
  return {
    version: VERSION, savedAt, pristine, sectorSize: { ...SECTOR_SIZE },
    sectors: layout.sectors.map((s) => ({ id: s.id, label: s.label, name: s.name, col: s.col, row: s.row, hidden: s.hidden,
      asteroids: s.asteroids, pirateRate: s.pirateRate, note: s.note, game: clone(s.game) })),
    objects: placed.map(record),
    shelf: shelved.map(record),
    summary: diffSummary(layout),
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);

// A parsed file brought into the editor's shape, or the reasons it cannot be. Boundary check only.
export function readFile(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['not a JSON object'] };
  if (!READABLE_VERSIONS.includes(raw.version)) errors.push(`version ${raw.version} is not one of ${READABLE_VERSIONS.join(', ')}`);
  if (!Array.isArray(raw.sectors)) errors.push('sectors is not a list');
  if (!Array.isArray(raw.objects)) errors.push('objects is not a list');
  if (errors.length) return { ok: false, errors };

  const sectors = [];
  const seen = new Set();
  for (const s of raw.sectors) {
    if (!s || typeof s.id !== 'string' || !isInt(s.col) || !isInt(s.row)) { errors.push(`bad sector ${JSON.stringify(s?.id)}`); continue; }
    if (seen.has(s.id)) { errors.push(`sector ${s.id} twice`); continue; }
    seen.add(s.id);
    sectors.push({ id: s.id, label: cleanText(s.label, 12), name: cleanText(s.name, 24), col: s.col, row: s.row,
      hidden: !!s.hidden, asteroids: isInt(s.asteroids) && s.asteroids >= 0 ? s.asteroids : 0,
      pirateRate: isNum(s.pirateRate) ? s.pirateRate : null, note: cleanText(s.note, 4000), game: s.game && typeof s.game === 'object' ? clone(s.game) : null });
  }
  const objects = [];
  const keys = new Set();
  const take = (o, shelved) => {
    if (!o || !KIND_IDS.includes(o.kind) || typeof o.id !== 'string') { errors.push(`bad object ${JSON.stringify(o?.kind)}:${JSON.stringify(o?.id)}`); return; }
    const key = objKey(o);
    if (keys.has(key)) { errors.push(`${key} twice`); return; }
    keys.add(key);
    let sector = shelved ? null : o.sector;
    if (sector != null && !seen.has(sector)) { errors.push(`${key} is in unknown sector ${sector}`); sector = null; }
    const placed = sector != null;
    // A ship's x, y are derived from its route and may lie outside its sector (an orbit round a planet by the edge); they are
    // worked out again by syncNpcs, so only that they are numbers matters.
    const derived = o.kind === 'npc';
    if (placed && !(isNum(o.x) && isNum(o.y) && (derived || (o.x >= 0 && o.x <= 1 && o.y >= 0 && o.y <= 1)))) { errors.push(`${key} has a position outside 0..1`); return; }
    // `game: null` is an object SX added. A version-1 record has no description and its `game` has no label or
    // description: they stay undefined here and reconcile() fills them from the game, so nothing is invented.
    const g = o.game && typeof o.game === 'object' && o.game.sector != null && isNum(o.game.x) && isNum(o.game.y) ? clone(o.game) : null;
    const rec = { kind: o.kind, id: o.id, label: cleanText(o.label, 60), description: cleanText(o.description, 4000),
      sector: placed ? sector : null, x: placed ? round4(o.x) : null, y: placed ? round4(o.y) : null, note: cleanText(o.note, 4000),
      game: g, props: o.props && typeof o.props === 'object' ? clone(o.props) : {} };
    if (!g && o.kind === 'traffic' && !validPath(rec.props.path)) rec.props.path = defaultPath('lane', rec.x ?? 0.5, rec.y ?? 0.5);
    if (o.kind === 'npc' && !validRoute(rec.props.route)) rec.props.route = null;     // reconcile() brings the game's back
    objects.push(rec);
  };
  for (const o of raw.objects) take(o, false);
  for (const o of Array.isArray(raw.shelf) ? raw.shelf : []) take(o, true);
  if (errors.length) return { ok: false, errors };
  return { ok: true, layout: syncNpcs({ sectors, objects: objects.map(syncDerived) }), savedAt: raw.savedAt ?? null, pristine: !!raw.pristine };
}

// A loaded layout (draft or file) brought up to date with the game's catalogues as they are NOW, since
// the game is edited in parallel: `game` references and non-placement props are refreshed by id; a thing
// the game gained appears at its game position; a thing the game lost stays, marked `gone`.
// Placement (sector, x, y, note) is always the layout's own. Name and description are SX's once he has changed
// them; while they still equal what the game had when the file was made they follow the game (a three-way
// merge, and how a version-1 file, which had neither, gets its descriptions). Objects SX added (game null) are
// never touched.
export function reconcile(layout, game) {
  const gameObjs = new Map(game.objects.map((o) => [objKey(o), o]));
  const gameSecs = new Map(game.sectors.map((s) => [s.id, s]));
  const report = { added: [], gone: [] };
  for (const s of layout.sectors) {
    const g = gameSecs.get(s.id);
    s.game = g ? clone(g.game) : (s.game || null);
    if (!g) s.gone = !!s.game;       // a sector the game no longer has (a new one the user made has game null)
    else delete s.gone;
  }
  for (const s of game.sectors) {
    if (!layout.sectors.some((x) => x.id === s.id)) { layout.sectors.push(clone(s)); report.added.push(`sector ${s.id}`); }
  }
  for (const o of layout.objects) {
    const g = gameObjs.get(objKey(o));
    if (!g) {
      if (o.game) { o.gone = true; report.gone.push(objKey(o)); } else delete o.gone;
      continue;
    }
    delete o.gone;
    const was = o.game || {};
    const label = was.label === undefined || o.label === was.label ? g.label : o.label;
    const description = was.description === undefined || (o.description ?? '') === was.description ? g.description : o.description;
    const mine = o.props?.route;
    const mineProps = o.props;
    o.game = clone(g.game);
    o.props = clone(g.props);
    // A planet SX resized or regenerated keeps his look; one he left alone follows the game's.
    if (o.kind === 'planet' && was.look && !sameLook(mineProps, was.look)) {
      for (const k of LOOK_KEYS) if (mineProps[k] !== undefined) o.props[k] = mineProps[k]; else delete o.props[k];
    }
    if (o.kind === 'npc' && validRoute(mine) && was.route) {
      // A free anchor SX dragged stays his; one he never touched follows the game.
      for (const w of ['from', 'to', 'at']) if (Array.isArray(o.props.route[w]) && Array.isArray(mine[w]) && !samePoint(mine[w], was.route[w])) o.props.route[w] = [...mine[w]];
    }
    o.label = label;
    o.description = description ?? '';
    syncDerived(o);
  }
  const have = new Set(layout.objects.map(objKey));
  for (const g of game.objects) {
    if (have.has(objKey(g))) continue;
    layout.objects.push(clone(g));
    report.added.push(objKey(g));
  }
  syncNpcs(layout);
  return report;
}

// ------------------------------------------------------------------ diff

const EPS = 0.0004;   // under 3 u: the same place
const sameText = (a, b) => (a ?? '') === (b ?? '');
export const isNew = (o) => !o.game;                       // SX added it: the game has no such object
export const isShelved = (o) => o.sector == null;
export const isMoved = (o) => !!o.game && !isShelved(o) && o.sector === o.game.sector && (Math.abs(o.x - o.game.x) > EPS || Math.abs(o.y - o.game.y) > EPS);
export const isChangedSector = (o) => !!o.game && !isShelved(o) && o.sector !== o.game.sector;
// A planet's look is not the game's (resized, regenerated, recoloured).
export const isLookChanged = (o) => o.kind === 'planet' && !!o.game?.look && !sameLook(o.props, o.game.look);
export const isRenamed = (o) => !!o.game && o.game.label !== undefined && o.label !== o.game.label;
export const isDescribed = (o) => !!o.game && o.game.description !== undefined && !sameText(o.description, o.game.description);
// An NPC's route is not the game's (an anchor SX dragged).
export const isRouteChanged = (o) => o.kind === 'npc' && !!o.game?.route && JSON.stringify(o.props.route) !== JSON.stringify(o.game.route);
// Where it stands differs from the game (what BACK TO GAME undoes).
export const isPlaceChanged = (o) => !!o.game && (isShelved(o) ? o.game.sector != null : (isMoved(o) || isChangedSector(o) || isRouteChanged(o)));
// Anything differs: added, moved, shelved, renamed or described (the white dot on the map).
export const isChanged = (o) => isNew(o) || isPlaceChanged(o) || isRenamed(o) || isDescribed(o) || isLookChanged(o);

export function diffSummary(layout) {
  const d = { moved: 0, changedSector: 0, shelved: 0, added: 0, renamed: 0, described: 0, looked: 0, notes: 0 };
  for (const o of layout.objects) {
    if (isNew(o)) d.added++;
    else if (isShelved(o)) d.shelved++;
    else if (isChangedSector(o)) d.changedSector++;
    else if (isMoved(o) || isRouteChanged(o)) d.moved++;
    if (isRenamed(o)) d.renamed++;
    if (isDescribed(o)) d.described++;
    if (isLookChanged(o)) d.looked++;
    if (o.note) d.notes++;
  }
  let sectorsMoved = 0, sectorsEdited = 0, sectorsAdded = 0, sectorNotes = 0;
  for (const s of layout.sectors) {
    if (!s.game) { sectorsAdded++; continue; }
    if (s.col !== s.game.col || s.row !== s.game.row) sectorsMoved++;
    if (s.label !== s.game.label || s.name !== s.game.name || s.asteroids !== s.game.asteroids || s.pirateRate !== s.game.pirateRate) sectorsEdited++;
    if (s.note) sectorNotes++;
  }
  return { ...d, sectorsMoved, sectorsEdited, sectorsAdded, sectorNotes };
}

// ------------------------------------------------------------------ geometry (pure)

// Where each sector's top-left corner is on the map, in world units. Grid sectors sit at their cell; a hidden
// sector is "off the grid" and goes into a strip under the grid, right-aligned, in catalogue order.
export function sectorOrigins(sectors) {
  const grid = sectors.filter((s) => !s.hidden);
  const maxRow = grid.length ? Math.max(...grid.map((s) => s.row)) : 0;
  const maxCol = grid.length ? Math.max(...grid.map((s) => s.col)) : 0;
  const out = new Map();
  for (const s of grid) out.set(s.id, { x: s.col * PITCH, y: s.row * PITCH });
  const stripY = (maxRow + 1) * PITCH + OFFGRID_AIR;
  sectors.filter((s) => s.hidden).forEach((s, i) => out.set(s.id, { x: (maxCol - i) * PITCH, y: stripY }));
  return out;
}

// Map point -> sector and fractions, or null when the point is in a gap or outside everything.
export function sectorAtPoint(sectors, origins, mx, my) {
  for (const s of sectors) {
    const o = origins.get(s.id);
    if (!o) continue;
    const fx = (mx - o.x) / SECTOR_SIZE.width, fy = (my - o.y) / SECTOR_SIZE.height;
    if (fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1) return { sector: s, x: fx, y: fy };
  }
  return null;
}

// A layout object's place on the map in world units, or null when shelved / its sector is missing.
export function objectMapPos(layout, origins, o) {
  if (o.sector == null) return null;
  const org = origins.get(o.sector);
  return org ? { x: org.x + o.x * SECTOR_SIZE.width, y: org.y + o.y * SECTOR_SIZE.height } : null;
}

// Map point -> the game's own world coordinates (sectors touching), for distances across sectors. Null for a
// point in a hidden sector (it is off the grid; no distance to it exists).
export function mapToGame(sectors, origins, mx, my) {
  let best = null;
  for (const s of sectors) {
    const o = origins.get(s.id);
    if (!o) continue;
    const lx = Math.min(Math.max(mx - o.x, 0), SECTOR_SIZE.width), ly = Math.min(Math.max(my - o.y, 0), SECTOR_SIZE.height);
    const d = Math.hypot(mx - o.x - lx, my - o.y - ly);
    if (!best || d < best.d) best = { d, s, lx, ly };
  }
  if (!best || best.s.hidden) return best ? { hidden: best.s.id } : null;
  return { x: best.s.col * SECTOR_SIZE.width + best.lx, y: best.s.row * SECTOR_SIZE.height + best.ly };
}
