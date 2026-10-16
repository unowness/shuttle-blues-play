import { deliveryNavigation, markedFindNavigation, questNavigation, legTo } from '../../src/navigation.js';
import { sectorById } from '../../src/sectors.js';
import { signalsIn } from '../../src/progression.js';
import { availableIn, findTitle } from '../../src/rewards.js';
import { lookFindsIn } from '../../src/looks.js';
import { openStrangersIn } from '../../src/strangers.js';
import { CONFIG } from '../../src/config.js';
import { hypot2 } from '../../src/util.js';
import { UI, uiMetrics } from '../../src/uiGrid.js';
import { formatDistance } from '../../src/interface.js';
import { readLegend, writeLegend } from '../../src/prefs.js';
import { ROLES, QUEST_INKS } from '../../src/roles.js';
import { haloText, keycap, keyMarkLeft, KEY_MARK_HALF, KEYCAP_PAD, KEYCAP_RISE } from './ui-parts.js';
import { LORE, LORE_TIMES } from './rail.js';
import { clamp, easeOut, noise3, fitText } from '../../src/util.js';
import { noteKey } from './clicks.js';
import { keyName } from '../../src/controls.js';
import { taskNavigation } from '../../src/tasks.js';
import { questTone } from '../../src/quests.js';
import { hoverItem } from '../../src/hover.js';
import { DROID_INKS } from '../../src/droids.js';

// The 3400 u draft was rejected in the native screenshot review: an approaching
// station at 364 u merged with the nose. This is a local display range, not a
// new sensor; each action contact must still pass its existing discoverRadius.
export const LOCATOR_RANGE = 1600;

// Pirates are shown well beyond the scope's own range, held on its rim in the
// direction they are coming from: a warning has to reach the pilot before the
// ships do, and a group appears 2200-2800 u away.
export const PIRATE_RANGE = 4000;

// The find a station marked blinks on the scope (SX, 2026-10-02: «покажи его мигающем на радаре и на общей карте»), in the
// cache's own light, until the ship has come up to it; the pointer in the sky is gone. The beat is the map's ship's (labs/
// graphics/map-screen.js reads this too): on for two thirds of 1.2 s, then dimmed, not out, so it is seen and does not
// shout. With reduced motion it is steady.
export const MARK_BLINK = Object.freeze({ period: 1.2, on: 2 / 3, dim: 0.3 });
export const markBlinkAlpha = (time, reducedMotion = false) => (reducedMotion || (time % MARK_BLINK.period) < MARK_BLINK.period * MARK_BLINK.on ? 1 : MARK_BLINK.dim);

// Nearest rocks only: a dense field stays legible, and rocks carry no
// identity worth keeping past the cap the way a station or a signal does.
const ROCK_CAP = 40;

function selectContacts(world, discoveries) {
  const route = deliveryNavigation(world);
  const seen = new Set(route ? [route.targetId] : []);
  const contacts = discoveries.filter(contact => {
    if (seen.has(contact.id) || !Number.isFinite(contact.angle)
      || !Number.isFinite(contact.dist) || contact.dist < 0) return false;
    seen.add(contact.id);
    return true;
  }).sort((a, b) => a.dist - b.dist || String(a.id).localeCompare(String(b.id))).slice(0, 4)
    .map(contact => ({ ...contact, glyph: '·', priority: false }));
  if (route) contacts.unshift({ id: route.targetId, label: route.label,
    angle: Math.atan2(route.dy, route.dx), dist: route.distance, glyph: '◇', priority: true });
  return contacts;
}

// The original discovery-list API remains available for marker-mode checks.
export function locatorContacts(world) {
  return selectContacts(world, world.discoveries());
}

// One route plus at most one discovery, or two discoveries without a route.
// Nearby directions need angular separation as well as a count limit.
//
// `held` (bearingMemory(), the page's: main.js) what it showed and since when each newcomer has been picked. Until 2026-10-07 it chose
// afresh each frame, and a thing at the edge of a rule (a third as near as the second, two bearings 36° apart, its reach or its range
// crossed) came and went from one frame to the next: its mark on the rim (rim-marks.js) vanished and faded in again where it stood, or
// one came for a fraction of a second (SX, 2026-10-07: «Метки багуют, могут скрываться и возникать там же без причины»; measured in Node
// over ten minutes of flight in J-05: 8 to 22 such returns and 20 to 28 such visits a run). Now, with `held`:
// - each rule has the selection's band (CONFIG.interaction.exitTolerance, 1.18, the band an object's menu keeps its claim over): a
//   thing shown keeps its place against a nearer newcomer unless that one is nearer by the band, keeps it beside another until they
//   are 36° / 1.18 apart, and stays out to its range times the band; a newcomer comes only past its reach times the band (where its
//   menu lets go of it), as its menu comes at its reach;
// - a newcomer comes once the rules have picked it `BEARING_SETTLE` s on end, and until then the marks shown keep the places it would
//   take: one picked for less (the ship crossing a line between two things) shows nothing and moves nothing.
export const BEARING_APART = Math.PI / 5;
export const BEARING_SETTLE = 0.5;          // s
export const bearingMemory = () => ({ shown: new Set(), since: new Map() });
export function nearbyBearings(world, held = null) {
  const route = deliveryNavigation(world), band = CONFIG.interaction.exitTolerance, t = world.time ?? 0, cap = route ? 1 : 2;
  const kept = (id) => !!held?.shown.has(id);
  const routeAngles = () => (route ? [Math.atan2(route.dy, route.dx)] : []);
  const apartFrom = (angles, item) => !angles.some((angle) => Math.abs(Math.atan2(Math.sin(item.angle - angle), Math.cos(item.angle - angle)))
    < (kept(item.id) ? BEARING_APART / band : BEARING_APART));
  const score = (d) => (kept(d.id) ? d.dist / band : d.dist);
  const seen = new Set(route ? [route.targetId] : []), pool = [];
  for (const d of world.discoveries({ band })) {
    if (seen.has(d.id) || !Number.isFinite(d.angle) || !Number.isFinite(d.dist) || d.dist < 0) continue;
    seen.add(d.id);
    if (kept(d.id) || ((!(d.reach > 0) || d.dist > d.reach * band) && (!(d.range > 0) || d.dist <= d.range))) pool.push(d);
  }
  pool.sort((a, b) => score(a) - score(b) || String(a.id).localeCompare(String(b.id)));
  const pick = (from, angles = routeAngles(), out = []) => {
    for (const item of from) {
      if (out.length >= cap) break;
      if (!out.includes(item) && apartFrom(angles, item)) { out.push(item); angles.push(item.angle); }
    }
    return out;
  };
  const picked = pick(pool);
  if (!held) return picked;
  for (const id of [...held.since.keys()]) if (!picked.some((d) => d.id === id)) held.since.delete(id);
  for (const d of picked) if (!held.since.has(d.id)) held.since.set(d.id, t);
  const ripe = picked.filter((d) => kept(d.id) || t - held.since.get(d.id) >= BEARING_SETTLE - 1e-9);
  const shown = pick(pool.filter((d) => kept(d.id)), [...routeAngles(), ...ripe.map((d) => d.angle)], [...ripe]);
  held.shown = new Set(shown.map((d) => d.id));
  return shown;
}

// Every station/cache/lost-cargo/signal/sign within LOCATOR_RANGE, in this
// sector and in each seamless neighbour, at the same (ox, oy) offset the
// world itself draws that neighbour's bodies and props at (see
// World.drawNeighbour). A category still respects its own discoverRadius,
// exactly as before; a sign has none, so only the display range gates it.
// No count cap here: the locator shows everything discovered, not a top few.
function actionContacts(world) {
  const W = world.width, H = world.height;
  const out = [];
  // `color`: a mark's own ink over its kind's (a droid's, its service's), or undefined.
  const push = (id, label, kind, x, y, discoverRadius, color = undefined) => {
    const d = world.delta(x, y, world.ship.x, world.ship.y);
    const dist = Math.hypot(d.x, d.y);
    const cap = discoverRadius == null ? LOCATOR_RANGE : Math.min(discoverRadius, LOCATOR_RANGE);
    if (!(dist <= cap)) return;
    out.push({ id, label, kind, dist, angle: Math.atan2(d.y, d.x), color });
  };
  // This sector: the world's own ready-built, ledger-derived lists, so a
  // check that overrides world.caches/world.signals/... is still honoured.
  for (const st of world.stations) push(st.id, st.label, 'station', st.x, st.y, st.discoverRadius);
  // The finds (src/rewards.js): souvenir and paint caches share the cache mark.
  for (const c of world.caches) push(c.id, c.def ? findTitle(c.def) : 'SEALED CACHE', 'cache', c.x, c.y, c.discoverRadius);
  for (const c of world.paintCaches || []) push(c.id, c.def ? findTitle(c.def) : 'PAINT CACHE', 'cache', c.x, c.y, c.discoverRadius);
  for (const c of world.lookCaches || []) push(c.id, findTitle(c.def), 'cache', c.x, c.y, c.discoverRadius);   // a look's (src/looks.js)
  for (const s of world.signals) push(s.id, 'SIGNAL', 'signal', s.x, s.y, s.discoverRadius);
  // The pilot's own lost cargo and other pilots' (src/strangers.js) share the mark.
  for (const l of world.lostCargo) push(l.id, l.stranger ? 'LOST CARGO' : 'STRANDED CARGO', 'cargo', l.x, l.y, l.discoverRadius);
  for (const sign of world.signsIn(world.sector.id)) push(sign.id, 'SIGN', 'sign', sign.x, sign.y, null);
  // Service droids (src/droids.js), wherever they are in range, each in its service's ink as it is drawn in the world (SX, 2026-10-07:
  // the fuel droid blue, the repair droid green); the legend's DROID keeps the kind's green, as its FLAG keeps the white of flags of
  // every ink.
  for (const d of world.droids || []) push(d.id, d.label, 'droid', d.x, d.y, null, DROID_INKS[d.kind]);
  // Neighbours: the catalogue plus the ledger, filtered the same way
  // World.buildProgressObjects/buildLostCargo filter the current sector.
  for (const n of world.neighbours) {
    const b = world.sectorBodies(n.sector);
    for (const st of b.stations) push(st.id, st.label, 'station', st.x + n.ox, st.y + n.oy, st.discoverRadius);
    for (const def of availableIn(n.sector.id, world.ledger)) {
      push(def.id, findTitle(def), 'cache', def.x * W + n.ox, def.y * H + n.oy, CONFIG.cache.discoverRadius);
    }
    for (const def of lookFindsIn(n.sector.id, world.pilot?.looks)) {
      push(def.id, findTitle(def), 'cache', def.x * W + n.ox, def.y * H + n.oy, CONFIG.cache.discoverRadius);
    }
    for (const def of signalsIn(n.sector.id)) {
      if (world.ledger.heard.has(def.id)) continue;
      push(def.id, 'SIGNAL', 'signal', def.x * W + n.ox, def.y * H + n.oy, CONFIG.signal.discoverRadius);
    }
    for (const [contractId, rec] of world.ledger.stranded) {
      if (rec.sectorId !== n.sector.id) continue;
      push(`stranded:${contractId}`, 'STRANDED CARGO', 'cargo', rec.x + n.ox, rec.y + n.oy, CONFIG.stranded.discoverRadius);
    }
    for (const s of openStrangersIn(n.sector.id, world.ledger)) {
      push(`stranger:${s.id}`, 'LOST CARGO', 'cargo', s.x * W + n.ox, s.y * H + n.oy, CONFIG.stranded.discoverRadius);
    }
    for (const sign of world.signsIn(n.sector.id)) push(sign.id, 'SIGN', 'sign', sign.x + n.ox, sign.y + n.oy, null);
  }
  return out;
}

// Every pirate within PIRATE_RANGE, with the heading its mark points along.
// Not an action contact: nothing can be done with one but shoot it or flee.
function pirateContacts(world) {
  const ship = world.ship;
  return (world.pirates || []).flatMap((p) => {
    const d = world.delta(p.x, p.y, ship.x, ship.y);
    const dist = Math.hypot(d.x, d.y);
    if (dist > PIRATE_RANGE) return [];
    return [{ id: p.id, label: 'PIRATE', kind: 'pirate', dist, angle: Math.atan2(d.y, d.x), heading: p.angle }];
  });
}

// The live route (if any) plus every other action contact, each tagged with
// the kind that decides its symbol. A contact is never shifted from its real
// position to resolve overlap; painting the route last (in the caller) keeps
// the active target visible when a bearing coincides with a plain contact.
// `flags`: the map's flags put down (labs/graphics/map-screen.js), each `{ flag, ink, name }`; `quests`: the open quests, each
// `{ quest, ink }` in its colour of the quest list. SX, 2026-10-02: «флажки и цели не отмечаются на мини-локаторе» (of the map,
// before: «разноцветные флажки метки, которые будут в локаторе отображаться, но указателя не будет»).
// `task`: the selected task (src/tasks.js selectedTask, the quest list's own field, chat B): the route's mark is its target, as the
// top banner's bearing and the map's ring are; without one, the cargo's as before. A quest's route mark is in the quest's ink (SX's
// Q1 on labs/graphics/sketches/quest-colours.html, 2026-10-05: ROUTE was the cargo's green whatever the quest); a cargo's stays green.
const routeColor = (task) => (task?.kind === 'quest' ? QUEST_INKS[questTone(task.quest)] ?? QUEST_INKS.green : undefined);
export function radarContacts(world, { flags = [], quests = [], task = null } = {}) {
  const route = routeOf(world, task);
  const marked = markedFindNavigation(world);
  const seen = new Set([...(route ? [route.targetId] : []), ...(marked ? [marked.id] : [])]);
  const contacts = [...actionContacts(world), ...pirateContacts(world)].filter(contact => {
    if (seen.has(contact.id)) return false;
    seen.add(contact.id);
    return true;
  });
  if (route) contacts.unshift({ id: route.targetId, label: route.label, kind: 'route', priority: true, color: routeColor(task),
    angle: Math.atan2(route.dy, route.dx), dist: route.distance });
  // The marked find, wherever it is: held on the rim in its bearing when beyond the scope's range, as the route is.
  if (marked) contacts.push({ id: marked.id, label: marked.label, kind: 'cache', blink: true, priority: true,
    angle: Math.atan2(marked.dy, marked.dx), dist: marked.distance });
  // Each quest's target, ringed in the quest's colour over whatever mark stands there (a raided station, a ship in trouble),
  // held on the rim when beyond the range as the route is; the pointer in the sky stays the picked quest's alone.
  for (const { quest, ink } of quests) {
    const way = questNavigation(world, quest);
    if (way) contacts.push({ id: `quest:${quest.id}`, label: quest.title, kind: 'quest', color: ink, priority: true,
      angle: Math.atan2(way.dy, way.dx), dist: way.distance });
    // A second place the quest marks (src/opening.js `also`: the ruin beside the repair droid).
    const also = quest.also && questNavigation(world, quest.also);
    if (also) contacts.push({ id: `quest:${quest.id}:also`, label: quest.also.title, kind: 'quest', color: ink, priority: true,
      angle: Math.atan2(also.dy, also.dx), dist: also.distance });
  }
  // The boss TOLLKEEPER (SX, 2026-10-14: «у босса должна быть уникальная картинка на локаторе, красная»): its own mark in the danger's red,
  // on the boss once it is there (lying in wait from `quest.seen` u, or fighting), and at its quest's place after the pilot has met it
  // (src/bossQuest.js: before, the strange activity is only the quest's ring), held on the rim when far as the route is.
  const b = world.boss && !world.boss.defeated ? world.boss : null;
  if (b) {
    const d = world.delta(b.x, b.y, world.ship.x, world.ship.y);
    contacts.push({ id: 'boss', label: 'TOLLKEEPER', kind: 'boss', priority: true, angle: Math.atan2(d.y, d.x), dist: Math.hypot(d.x, d.y), heading: b.heading });
  } else if (world.bossQuest?.met && !world.sector.hidden) {
    const leg = legTo(world, world.bossQuest.sectorId, world.bossQuest.x * world.width, world.bossQuest.y * world.height);
    if (leg) contacts.push({ id: 'boss', label: 'TOLLKEEPER', kind: 'boss', priority: true, angle: Math.atan2(leg.dy, leg.dx), dist: leg.distance });
  }
  // The flags, each in its ink, on the rim when far: a bearing only, no pointer in the sky. From inside O-08 every way out is
  // its hole, so they wait until the pilot is back on the grid.
  if (!world.sector.hidden) flags.forEach((f, i) => {
    const leg = f?.flag && legTo(world, f.flag.sector, f.flag.x, f.flag.y);
    if (leg) contacts.push({ id: `flag:${i}`, label: `${f.name} FLAG`, kind: 'flag', color: f.ink, priority: true,
      angle: Math.atan2(leg.dy, leg.dx), dist: leg.distance });
  });
  return contacts;
}

// Local physical bodies: this sector's and each neighbour's planets/holes,
// at their real radius, offset the same way actionContacts offsets props.
// No cap: a planet or a hole is rare enough that every one in range belongs.
export function locatorBodies(world) {
  const here = [
    ...world.planets.map((body, index) => ({ body, kind: 'planet', id: `planet:${index}`, radius: body.radius, ox: 0, oy: 0 })),
    ...world.holes.map((body, index) => ({ body, kind: 'hole', id: `hole:${index}`, radius: body.horizon, ox: 0, oy: 0 })),
  ];
  const neighbourBodies = world.neighbours.flatMap(n => {
    const b = world.sectorBodies(n.sector);
    return [
      ...b.planets.map((body, index) => ({ body, kind: 'planet', id: `${n.sector.id}:planet:${index}`, radius: body.radius, ox: n.ox, oy: n.oy })),
      ...b.holes.map((body, index) => ({ body, kind: 'hole', id: `${n.sector.id}:hole:${index}`, radius: body.horizon, ox: n.ox, oy: n.oy })),
    ];
  });
  return [...here, ...neighbourBodies].flatMap(({ body, kind, id, radius, ox, oy }) => {
    const delta = world.delta(body.x + ox, body.y + oy, world.ship.x, world.ship.y);
    const dist = Math.hypot(delta.x, delta.y);
    if (dist > LOCATOR_RANGE) return [];
    return [{ id, kind, radius, dist, angle: Math.atan2(delta.y, delta.x) }];
  });
}

// Free-flying rocks: only this sector's (a neighbour never spawns its own
// field; only pickup-moored rocks travel with a neighbour, and those are a
// presentation detail the sketch does not ask the locator to resolve).
// Sorted nearest-first and capped so a dense field stays legible.
export function locatorRocks(world) {
  // A loop, not a flatMap: the field is a hundred rocks and a few are in range, and each one made a closure call, an array and a
  // Math.hypot's boxed numbers every frame (10 KB of garbage a frame in J-05, 2026-10-09).
  const near = [], rocks = world.asteroids;
  for (let index = 0; index < rocks.length; index++) {
    const a = rocks[index], d = world.delta(a.x, a.y, world.ship.x, world.ship.y);
    const dist = hypot2(d.x, d.y);
    if (dist > LOCATOR_RANGE) continue;
    near.push({ id: `rock:${index}`, kind: 'rock', dist, angle: Math.atan2(d.y, d.x) });
  }
  return near.sort((a, b) => a.dist - b.dist).slice(0, ROCK_CAP);
}

// World +X stays right and +Y stays down, independently of the ship's heading
// and drift. Range clipping preserves bearing, rather than inventing a position.
export function projectLocatorContacts(contacts, radius, range = LOCATOR_RANGE) {
  if (!(radius > 0) || !(range > 0)) return [];
  return contacts.map(contact => {
    const radial = Math.min(contact.dist / range, 1) * radius;
    return { ...contact, x: Math.cos(contact.angle) * radial,
      y: Math.sin(contact.angle) * radial, clipped: contact.dist > range };
  });
}

// The single rotating shape is the ship's nose, not its velocity vector.
export function locatorShipTriangle(angle, size = 5) {
  const forward = { x: Math.cos(angle), y: Math.sin(angle) };
  const side = { x: -forward.y, y: forward.x };
  return [
    { x: forward.x * size, y: forward.y * size },
    { x: -forward.x * size * .65 + side.x * size * .65,
      y: -forward.y * size * .65 + side.y * size * .65 },
    { x: -forward.x * size * .65 - side.x * size * .65,
      y: -forward.y * size * .65 - side.y * size * .65 },
  ];
}

// One glyph per category, matched exactly to the accepted sketch's sym():
// labs/graphics/sketches/make_sketch.py. `radius` only matters to a physical
// body (planet/hole); every other kind is a fixed-size mark regardless of
// distance. The same function draws a contact on the scope and its entry in
// the legend, so the legend can never drift from what the scope actually draws.
function drawMark(ctx, x, y, kind, color, radius = 4, heading = -Math.PI / 2) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const poly = (points) => {
    ctx.beginPath();
    points.forEach(([dx, dy], i) => ctx[i ? 'lineTo' : 'moveTo'](x + dx, y + dy));
    ctx.closePath();
  };
  switch (kind) {
    case 'planet':
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
      return;
    case 'hole':
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, Math.min(1.6, radius * .5), 0, Math.PI * 2); ctx.fill();
      return;
    case 'rock':
      ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill();
      return;
    case 'signal':
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 3 * i;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * 4, y - Math.sin(a) * 4);
        ctx.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
        ctx.stroke();
      }
      return;
    case 'sign':
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y - 4);
      ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 5);
      ctx.stroke();
      return;
    case 'ship-legend':
      poly([[0, -5], [5, 4], [-5, 4]]); ctx.stroke();
      return;
    case 'key-m':
      // The legend's own key, drawn as a mark of the same size as the others
      // (like SIGN's T), not a key cap standing taller than its row.
      ctx.beginPath();
      [[-1, 1], [-1, -1], [0, 0.25], [1, -1], [1, 1]].forEach(([dx, dy], i) => ctx[i ? 'lineTo' : 'moveTo'](x + dx * KEY_MARK_HALF, y + dy * KEY_MARK_HALF));
      ctx.stroke();
      return;
    case 'route':
      poly([[0, -4], [4, 0], [0, 4], [-4, 0]]); ctx.fill();
      return;
    case 'pirate': {
      // A solid dart, its nose along the pirate's heading (drawn nose up at
      // -PI/2, as the legend shows it): not the ship's outline triangle.
      const c = Math.cos(heading + Math.PI / 2), s = Math.sin(heading + Math.PI / 2);
      poly([[0, -5], [4, 4], [0, 2], [-4, 4]].map(([px, py]) => [px * c - py * s, px * s + py * c]));
      ctx.fill();
      return;
    }
    case 'boss': {
      // The boss's tug: a solid core, its nose along its heading, and its two sleds behind it on their tethers' places; bigger than any
      // mark, in the danger's red, so it is told at a glance from a squad's darts.
      const c = Math.cos(heading + Math.PI / 2), s = Math.sin(heading + Math.PI / 2);
      const turn = (pts) => pts.map(([px, py]) => [px * c - py * s, px * s + py * c]);
      poly(turn([[0, -7], [6, -2], [6, 3], [-6, 3], [-6, -2]])); ctx.fill();
      for (const side of [-1, 1]) { poly(turn([[side * 9, 5], [side * 6, 5], [side * 6, 8], [side * 9, 8]])); ctx.fill(); }
      return;
    }
    case 'cargo':
      poly([0, 1, 2, 3, 4, 5].map(i => {
        const a = Math.PI / 3 * i + Math.PI / 6;
        return [Math.cos(a) * 5, Math.sin(a) * 5];
      }));
      ctx.stroke();
      return;
    case 'droid':
      // A service cross in a ring: a droid that fuels or mends.
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = ROLES.backing; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5);
      ctx.stroke();
      return;
    case 'station':
      poly([[-4, -4], [4, -4], [4, 4], [-4, 4]]);
      ctx.fillStyle = ROLES.backing; ctx.fill();
      ctx.strokeStyle = color; ctx.stroke();
      return;
    case 'cache':
      poly([[0, -4], [4, 0], [0, 4], [-4, 0]]);
      ctx.fillStyle = ROLES.backing; ctx.fill();
      ctx.strokeStyle = color; ctx.stroke();
      return;
    case 'flag': {
      // The map's pennant (labs/graphics/map-screen.js drawFlag), at the scope's size: a pole with its foot on the place.
      const px = Math.round(x) + 0.5, py = Math.round(y) + 4;
      ctx.beginPath(); ctx.moveTo(px, py + 0.5); ctx.lineTo(px, py - 9.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + 0.5, py - 10); ctx.lineTo(px + 6, py - 7.5); ctx.lineTo(px + 0.5, py - 5); ctx.closePath(); ctx.fill();
      return;
    }
    case 'quest':
      // A ring round the target, open to what stands inside it.
      ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.stroke();
      return;
    default:
      return;
  }
}

// Colours come only from ROLES: white for the neutral structures a pilot can
// walk up to, green for what is actively pointed at or broadcasting, orange
// for cargo that is lost, and the same muted grey the physical bodies already used.
const MARK_COLOR = {
  'ship-legend': ROLES.textPrimary, station: ROLES.textPrimary, cache: ROLES.textPrimary, sign: ROLES.textPrimary, flag: ROLES.textPrimary,
  route: ROLES.routeActive, signal: ROLES.interactionActive, droid: ROLES.interactionActive,
  cargo: ROLES.caution, pirate: ROLES.danger, boss: ROLES.danger,
  planet: ROLES.textSecondary, hole: ROLES.textSecondary, rock: ROLES.textSecondary,
};

const LEGEND = [
  ['ship-legend', 'SHIP'], ['route', 'ROUTE'], ['station', 'STATION'], ['cache', 'CACHE'], ['cargo', 'LOST CARGO'],
  ['signal', 'SIGNAL'], ['sign', 'SIGN'], ['planet', 'PLANET'], ['hole', 'BLACK HOLE'], ['rock', 'ROCK'],
  ['pirate', 'PIRATE'], ['droid', 'DROID'], ['flag', 'FLAG'],
];
// Two columns of seven under the scope (the droids, 2026-10-01; the map's flags, 2026-10-02), back there on SX's word of 2026-10-05
// evening («легенда карты стоит очень плохо сейчас, наверное надо ее сделать по старому»); it was one column of thirteen right of the
// scope that day (7a72ff6). A quest's ring is told by its colour, the quest list's own.
const LEGEND_COLS = 2;
const LEGEND_ROWS = Math.ceil(LEGEND.length / LEGEND_COLS);

// M shows the legend and hides it again (SX, 2026-09-30: "Legend карты сделай возможно скрывать по нажатию на кнопку M"). A
// display preference of this browser, kept apart from the save like the CRT's: the page sets it from src/prefs.js as it starts (closed
// unless kept open since 2026-10-05); shown here until then, for the checks and the sketch pages that draw the column alone.
export const legend = { hidden: false };
// Its key (`spaser.legend.v1`) and the reading are src/prefs.js's; the store is the page's backend, this browser's own when left out.
export const readLegendPreference = (store) => readLegend(store);
export const writeLegendPreference = (hidden, store) => writeLegend(hidden, store);
// The widest legend name, in characters; column width is derived from the
// measured cell width so it stays correct under any monospace font metrics,
// never a literal pixel count.
const LEGEND_NAME_MAX = Math.max(...LEGEND.map(([, name]) => name.length));

// Desktop is the only target (no mobile version): a tall/narrow window still
// gets a small scope with no legend, and a very short one collapses further.
// SCOPE_RADIUS was the full scope's until SX's S3 (256 px across, ring and all; SX, 2026-10-01: «я бы локатор чуть крупнее
// сделал, примерно как размер 9 клеток сувениров»): the column's left edge is still laid from it, and the COMPACT presentation
// (src/widgets.js, earned at the first restoration) draws the scope at it.
export const SCOPE_RADIUS = 119;
const expandedAt = (r) => r.height >= 400 && r.width >= 700 && r.height >= 550;
// The scope's black ring past its edge (the backing disc is radius + SCOPE_RING).
const SCOPE_RING = 9;

// The air over the scope (SX, 2026-10-02, his screenshot with the gaps boxed in red and yellow): `top`, the window's top edge
// over the header's capitals (equal, as seen on the base screen's glass, to what was the air over the quests: 22 flat is about 28
// seen); `part` less `arc` from the header to the scope, whose top is a curve that falls away under the header's two words, so
// that air reads wider than it measures. `part` was also the air under the scope and under the last quest, and `list` the legend's
// last row over the quests (28) until SX's S3 (COLUMN below); the S3 page's BEFORE switch still reads them.
export const COLUMN_AIR = Object.freeze({ part: 15, arc: 2, top: 22, list: 28 });

// ------------------------------------------------------------------------------------------------ the column (S3, L3+)
//
// SX's pick L3+ on labs/graphics/sketches/plate-motion.html (2026-10-04): «между локатором и легендой локатора должна стоять
// кнопка ... когда я нажимаю под ней появляется легенда ... кнопка становится hide legend. Потом должен быть отступ. Потом должна
// быть такая же кнопка ... quests. И под ней начинаться квесты», with his fixes: the keys in the game's square caps; the chevrons
// on one edge, one under the other. The scope at its own size since SX, 2026-10-04 («локатор сделай меньше как был раньше ... нет,
// его не надо делать шириной с квесты и квесты надо под его размер подгонять примерно»): the column is one width, the scope's (its
// ring from the column's left ink edge to its right edge, SCOPE_RADIUS), and the quests' plates are cut to it (`questW`; they were
// RAIL.width and the scope grew to them, chat H's L3+ until then).
//
// The legend's key stood in the header's line, at its right end, from SX's word of 2026-10-05 («там сверху у локатора делаем название
// сектора, расстояние показать легенду, одной строкой»), and went back under the scope as its own button on his word of 2026-10-06
// («на скрине расположил как кнопку легенды поставить, пока не надо, лучше перемести ее под картой как раньше»). The legend itself
// stands under its button since the evening of 2026-10-05, the quests and the radio hidden while it shows (SX: «наверное надо ее
// сделать по старому, но скрывать квесты и радио когда она открыта, а когда закрыта раскрывать если они были открыты до этого и не
// раскрывать то что было скрыто до этого»). So, top to bottom, until 2026-10-08: the header's one line (the distance, then the sector's
// name), the scope, «N LEGEND» (M until 2026-10-16; HIDE LEGEND while it shows), then either the legend, or «R QUESTS» (labs/graphics/quest-list.js), the
// quests, «T RADIO» and the radio (labs/graphics/radio.js). On SX's word of 2026-10-08 («HUD PLACE: S3 + MIRROR SWITCH») the quests and
// the radio stand on the screen's other side (labs/graphics/hud-sides.js), and under the button the souvenir shelf (the charm; the wallet
// went to the deck's shoulder that evening) takes their place: the legend's first row stands a button's air under its button, where the
// shelf would; while its rows show (`legendCovers`) the page draws the charm no more, and it answers nothing; the quests and the radio, far from the
// legend, are left as they are (nothing of theirs needs a fold or a memory now). The keys' letters are
// src/controls.js's, in every scheme (SX, 2026-10-06: «в режиме мышки кнопки клавиатурных шорткатов не убирать»). The legend's rows
// come in lore, as the quest plates do, and go the same way backwards. A column button's word stands after its key, its chevron on
// the column's right edge.
//
// The air, two steps of src/uiGrid.js measured ink to ink: UI.air.inset between the column's blocks (the scope, the legend, the
// quests' button and the quests, the radio's), as from one container to the next everywhere; UI.air.rule under a button to what it
// opens, a little more than a list's rows have between them, so the button reads as its list's head. In the header's line, the
// line's step (UI.line.cols) from the distance to the name.
export const COLUMN_GAPS = Object.freeze({ block: UI.air.inset, under: UI.air.rule });
// Where the quest list hangs, against the column's left ink edge (SX, 2026-10-02, the quests sheet's editor: «moved +2 ... Вот так
// давай поставим»; its `y` was the air over it, now COLUMN_GAPS').
const QUEST_LIST_SHIFT = Object.freeze({ x: 2, y: 20 });
// The chevron: a mark's size, 8 px across and 4 down (the key mark's half), its right ink on the column's right edge.
const CHEVRON = Object.freeze({ half: KEY_MARK_HALF, drop: 2 });
// The motion (the S3 page's L3): the chevron turns over in `turn` s; the legend's rows come in the quest plates' lore over
// `lore` s and go in `out` of it.
const LEGEND_TIMES = Object.freeze({ turn: 0.18, lore: LORE_TIMES.sweep + LORE_TIMES.cell + LORE_TIMES.scatter, out: 0.6 });

// The presentation the column wears (src/widgets.js: 'full', or 'compact' once earned and worn on the pause's LAYOUT page); the
// page says it as it draws the scope (drawLabTopStrip), and what is laid out after reads it.
const column = { look: 'full' };
// The legend's motion: what was shown last, since when, and the chevron's turn when it changed.
const shownLegend = { open: null, at: -Infinity, turnFrom: 0, still: false };
const clockNow = () => performance.now() / 1000;
const easeIn = (u) => easeOut(clamp(u, 0, 1));

// The legend's state at `now` (s): `open` whether it is shown, `turn` the chevron's (0 pointing down, the way it opens; 1 up, to
// fold), `lore` the rows' reveal ({ dir, t } while they come or go, else null) and `rows` whether its rows are drawn at all.
function legendPhase(now = clockNow()) {
  const open = !legend.hidden, s = shownLegend;
  if (s.open === null) Object.assign(s, { open, at: -Infinity, turnFrom: open ? 1 : 0 });
  else if (s.open !== open) {
    const was = legendPhase.last ?? { turn: s.open ? 1 : 0 };
    Object.assign(s, { open, at: now, turnFrom: was.turn });
  }
  const since = now - s.at, still = s.still || !Number.isFinite(s.at);
  const target = open ? 1 : 0;
  const turn = still ? target : s.turnFrom + (target - s.turnFrom) * easeIn(since / LEGEND_TIMES.turn);
  const outT = LEGEND_TIMES.lore * LEGEND_TIMES.out;
  const lore = still ? null : open ? (since < LEGEND_TIMES.lore ? { dir: 1, t: since } : null)
    : (since < outT ? { dir: -1, t: since / LEGEND_TIMES.out } : null);
  const phase = { open, turn, lore, rows: open || !!lore };
  legendPhase.last = phase;
  return phase;
}

// The column's places at `now`: the header's line, the scope's, the legend under it (its first row's top, `colW` its second column's
// offset), where the quests' button stands and the block's bottom ink over it (the scope's ring). Whole pixels: the ring and the text
// stand on them. null below the size the column is laid out for.
export function columnLayout(r, now = clockNow()) {
  if (!expandedAt(r)) return null;
  const { capTop, capBottom, capLeft, textY } = uiMetrics(r);
  // The column's left ink edge, where it stood before S3 (the scope's at SCOPE_RADIUS, the legend wider than it at most).
  const x0 = 16 + Math.max(SCOPE_RADIUS * 2 + 20, (LEGEND_NAME_MAX + 3) * r.cellW * 2) / 2 - SCOPE_RADIUS;
  const questsX = Math.round(x0 - capLeft) + QUEST_LIST_SHIFT.x;
  // The scope at its own size in both looks; the column's right edge is its ring's, and the quests' plates run to it.
  const radius = SCOPE_RADIUS;
  const cx = x0 + radius;
  const edge = Math.round(x0 + 2 * radius), questW = edge - questsX;
  const top = Math.round(COLUMN_AIR.top - capTop);
  const cy = top + Math.round(capBottom + COLUMN_AIR.part - COLUMN_AIR.arc) + radius;
  const ring = cy + radius + 0.5;
  // The column's right ink edge is the scope's ring's, and the quests' plates end on it, in both looks.
  const left = x0 - capLeft, right = edge + capLeft;
  const btn = buttonInk(r), rows = legendInk(r);
  const phase = legendPhase(now);
  // The legend's button a container's inset under the ring; its rows a button's air under its ink, the first column on the column's
  // left ink edge and the second ending on its right one; the quests' button a container's inset under the legend's (the legend, while
  // it shows, stands in their place and they are not drawn). `blockBottom`: the ink over the quests (the legend button's).
  const legendX = x0;
  const mTop = Math.round(ring + COLUMN_GAPS.block - btn.top);
  const listTop = Math.round(mTop + btn.bottom + COLUMN_GAPS.under - rows.top);
  const blockBottom = mTop + btn.bottom;
  const qTop = Math.round(blockBottom + COLUMN_GAPS.block - btn.top);
  return { x0, cx, cy, radius, top, left, right, edge, questsX, questW, legendX, mTop, listTop, qTop, blockBottom, phase, textY, capTop, capBottom, capLeft,
    colW: right - (2 + LEGEND_NAME_MAX) * r.cellW - x0 };
}

// A column button's ink in its row, from the row's top: its keycap's stroke, over the capitals and under them (ui-parts.js keycap).
export function buttonInk(r) {
  const { textY } = uiMetrics(r);
  const top = Math.round(textY - KEYCAP_RISE);
  return { top, bottom: top + Math.round(r.cellH + KEYCAP_RISE + 1) };
}
// The legend's ink from its first row's top: the highest of the first row's (SHIP's apex, 5 px over the row's middle and its line's
// mitred point past that) or the capitals, to the last row's lowest (SIGN's stem, 5 px under the middle, or the capitals).
const SHIP_APEX = 5 + 0.5 / Math.sin(Math.atan2(5, 9));
function legendInk(r) {
  const { textY, capTop, capBottom } = uiMetrics(r);
  return { top: Math.min(UI.row / 2 - SHIP_APEX, textY + capTop), bottom: (LEGEND_ROWS - 1) * UI.row + Math.max(UI.row / 2 + 5, textY + capBottom) };
}

export function locatorBounds(r) {
  if (!expandedAt(r)) {
    const radius = scopeRadius(r);
    return { x: 16, y: 14, w: radius * 2 + 20, h: radius * 2 + 38 };
  }
  // The header's line, the scope's disc, the legend's button and the legend under it while it shows.
  const L = columnLayout(r);
  const x = L.cx - L.radius - SCOPE_RING - 1;
  const right = L.right;
  const bottom = Math.max(L.cy + L.radius + SCOPE_RING + 1, L.blockBottom, L.phase.rows ? L.listTop + LEGEND_ROWS * UI.row : -Infinity);
  const w = Math.max(2 * (L.radius + SCOPE_RING + 1), Math.ceil(right - x));
  return { x, y: L.top, w, h: Math.ceil(bottom) - L.top };
}
function scopeRadius(r) {
  if (expandedAt(r)) return columnLayout(r).radius;
  return r.height < 400 ? 40 : 52;
}

// Where the locator's route leads: the selected task's target (src/tasks.js taskNavigation), else the cargo's (deliveryNavigation).
const routeOf = (world, task) => (task ? taskNavigation(world, task) : null) ?? deliveryNavigation(world);

// The locator's header: where the route leads and how far, or, without a route, only the sector the ship is in (SX, 2026-10-01,
// the scope's range struck in red: without a target it read as a distance to nothing). One line over the scope since SX's word of
// 2026-10-05 («там сверху у локатора делаем название сектора, расстояние показать легенду, одной строкой, код убираем меняем
// местами название и расстояние, проследи за качественными отступами»): the distance, then the sector's name (the legend's key stood
// at the line's right end until 2026-10-06; it is a button under the scope again); the sector's address (J-04) is gone. Through a
// hole: the distance and VIA HOLE. The name first since 2026-10-07 (headerPieces).
// A sector with no name says its address rather than nothing.
export function locatorHeader(world, task = null) {
  const route = routeOf(world, task);
  const nameOf = (sector, label) => sector?.name || sector?.label || label || '--';
  if (!route) return { name: nameOf(world.sector), far: '' };
  if (route.via === 'hole') return { name: 'VIA HOLE', far: formatDistance(route.distance) };
  return { name: nameOf(sectorById(route.sectorId), route.sectorLabel), far: formatDistance(route.distance) };
}
// The header's pieces as drawn, each { value, x, ink }, from the column's left ink edge `left`: the name in white first, then, the
// line's step (UI.line.cols) after it, the distance with its flag in the label's gray, when there is a route and both fit short of
// `end` (the column's `right` by default) by the same step; when they do not, the distance is left out and the name stands alone,
// cut with an ellipsis only if it alone is too long. SX, 2026-10-07 («бро сверху у локатора старый баг, поставь там нормально все»,
// the distance and its flag struck on his picture and led round to the name): the distance stood first, at the column's edge by the
// screen's, and the name after it; the name is what the line is about, and it now starts the line, the distance never past `end`.
export function headerPieces(r, header, left, right, end = right) {
  const cells = (v) => Array.from(v).length, step = UI.line.cols;
  const room = Math.floor((end - left) / r.cellW) - step;
  if (!header.name || room < 2) return [];
  const out = [{ value: fitText(header.name, room), x: left, ink: ROLES.textPrimary }];
  if (header.far && cells(header.name) + step + cells(header.far) <= room) {
    out.push({ value: header.far, x: left + (cells(header.name) + step) * r.cellW, ink: ROLES.textSecondary });
  }
  return out;
}

// Whether the legend's rows stand under the scope now (shown, or still coming or going): the page does not draw the charm then, which
// hangs there (labs/graphics/main.js; it was the quests' and the radio's place until 2026-10-08).
export function legendCovers(r, now = clockNow()) {
  return !!columnLayout(r, now)?.phase.rows;
}
// Where the quest list hangs at the column's left edge: the row of its button, «R QUESTS», which labs/graphics/quest-list.js draws over
// its plates: a container's inset under the scope's ring. (The page puts it on the other side, on the column's top row, and the shelf
// in this place: labs/graphics/hud-sides.js lays them from these measures.)
export function questListAnchor(r, now = clockNow()) {
  const L = columnLayout(r, now);
  if (!L) {
    const bounds = locatorBounds(r), radius = scopeRadius(r), cx = bounds.x + bounds.w / 2;
    return { x: Math.round(cx - radius) + QUEST_LIST_SHIFT.x, y: Math.ceil((bounds.y + bounds.h + UI.air.rule) / 4) * 4 + QUEST_LIST_SHIFT.y };
  }
  return { x: L.questsX, y: L.qTop, x0: L.x0, edge: L.right - L.capLeft, width: L.questW };
}

// A column button (L3+): the key in its cap, its left stroke on the column's left ink edge, the words a column after it, the
// chevron with its right ink on the column's right edge (`edge`), on the capitals' middle; `turn` the chevron's (0 down, 1 up).
// Its key's letter in every scheme, M too (SX, 2026-10-06: «в режиме мышки кнопки клавиатурных шорткатов не убирать»; M held a
// picture in the cap until then). `name`: its hover's; `over`: drawn as under the pointer whatever the pointer does (the keyboard's
// focus looks the same: SX's rule 12). Returns its box.
// `axis`: the sum of the two edges the button is mirrored about (a number), or null: SX's «отзеркаленный дизайн» of the column that stands
// on the screen's right (2026-10-08, the quests' and the radio's heads there): the keycap at the right end with its right stroke where
// the left one's left stroke stood, the word before it ending a cell short of it, the chevron at the left end, each at its mirror place;
// the words themselves are not reversed.
export function drawColumnButton(r, { x0, edge, rowTop, key, word, turn = 0, name, over = null, note = null, axis = null }) {
  const { textY, capLeft, capTop, capBottom } = uiMetrics(r), ink = ROLES.textHint;
  const capX = Math.round(keyMarkLeft(r, x0 + capLeft) - 0.5) + KEYCAP_PAD, y = rowTop + textY;
  const box = { x: capX - KEYCAP_PAD - 2, y: Math.round(rowTop) - KEYCAP_RISE, w: Math.round(edge - capX + KEYCAP_PAD) + 4, h: UI.row + KEYCAP_RISE };
  if (axis !== null) box.x = axis - box.x - box.w;
  if (note) note(box);
  const midY = Math.round(y + (capTop + capBottom) / 2) + 0.5, chevronX = Math.round(edge - CHEVRON.half - 1) + 0.5;
  hoverItem(r, name, box, () => {
    if (axis === null) {
      const next = keycap(r, key, capX, y, { ink: ROLES.textSecondary, reach: 0 });
      haloText(r, word, next, y, ink);
      drawChevron(r.ctx, chevronX, midY, turn, ink);
    } else {
      const capW = Array.from(key).length * r.cellW;
      keycap(r, key, axis - capX - capW, y, { ink: ROLES.textSecondary, reach: 0 });
      haloText(r, word, axis - (capX + capW + r.cellW) - Array.from(word).length * r.cellW, y, ink);
      drawChevron(r.ctx, axis - chevronX, midY, turn, ink);
    }
  }, over === null ? {} : { over });
  return box;
}
// The chevron, `turn` 0 pointing down (it opens downward), 1 up (it folds up), between them turning over.
function drawChevron(ctx, x, y, turn, color) {
  const a = Math.PI * turn, c = Math.cos(a), s = Math.sin(a), H = CHEVRON.half, D = CHEVRON.drop;
  const p = (dx, dy) => [x + dx * c - dy * s, y + dx * s + dy * c];
  ctx.save();
  ctx.lineWidth = 1; ctx.globalAlpha = 1; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(...p(-H, -D)); ctx.lineTo(...p(0, D)); ctx.lineTo(...p(H, -D)); ctx.stroke();
  ctx.restore();
}
// `part`: 'scope' the scope alone (what moves every frame), 'text' its header, its legend's button and the legend (what seldom
// does), 'all' (by default) both; the page draws each as a group (main.js `group`; their text's shadow src/textShadow.js). `look` the column's presentation (src/widgets.js).
export function drawLabTopStrip(r, world, { reducedMotion = false, flags = [], quests = [], task = null, part = 'all', look = 'full' } = {}) {
  column.look = look === 'compact' ? 'compact' : 'full';
  shownLegend.still = reducedMotion;
  const bounds = locatorBounds(r);
  const L = columnLayout(r);
  const radius = scopeRadius(r);
  const cx = L ? L.cx : bounds.x + bounds.w / 2;
  const cy = L ? L.cy : bounds.y + 10 + radius;
  const ctx = r.ctx;
  if (part !== 'text') {
    // The scope is the map's small copy, so a click on it opens the map as TAB does, and under the pointer it gives as if pressed,
    // a little smaller and darker (a panel, src/hover.js; SX, 2026-10-03: «Нотификейшн. Квесты. Локатор. Должны быть
    // как будто продавливанием их, и они должны становиться типа чуть темнее»). Its black disc stays whole under it, so a dimmed
    // scope darkens and never lets the sky through.
    const R = radius + SCOPE_RING, disc = { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R };
    noteKey(keyName('map'), disc, r);
    ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = ROLES.backing;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    hoverItem(r, 'locator:scope', disc, () => drawScope(r, world, { cx, cy, radius, reducedMotion, flags, quests, task }), { kind: 'panel' });
  }
  if (part !== 'scope') {
    if (L) drawColumnText(r, world, L, task);
    else {
      const label = formatDistance(LOCATOR_RANGE);
      haloText(r, label, cx - label.length * r.cellW / 2, cy + radius + 11, ROLES.textSecondary);
    }
  }
  return bounds;
}

function drawScope(r, world, { cx, cy, radius, reducedMotion, flags, quests, task }) {
  const ctx = r.ctx;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.fillStyle = ROLES.backing;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + SCOPE_RING, 0, Math.PI * 2);
  ctx.fill();
  // Outer ring: a dotted scope edge with degree ticks just inside it, every
  // 10 degrees (every 30th longer), both in the structural ink.
  ctx.strokeStyle = ROLES.structure;
  ctx.setLineDash([1, 3]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let deg = 0; deg < 360; deg += 10) {
    const a = deg * Math.PI / 180;
    const len = deg % 30 === 0 ? 9 : 4;
    ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.lineTo(cx + Math.cos(a) * (radius - len), cy + Math.sin(a) * (radius - len));
  }
  ctx.stroke();
  // Inner distance rings and the crosshair read as depth, not structure.
  ctx.strokeStyle = ROLES.shadow;
  ctx.beginPath();
  for (const fraction of [.33, .66]) ctx.arc(cx, cy, radius * fraction, 0, Math.PI * 2);
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    ctx.moveTo(cx + dx * 12, cy + dy * 12);
    ctx.lineTo(cx + dx * (radius - 8), cy + dy * (radius - 8));
  }
  ctx.stroke();
  // Local physical bodies and rocks provide context without becoming action
  // contacts; both are clipped to the scope so an oversized planet outline
  // never bleeds past the black disc.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  for (const body of projectLocatorContacts(locatorBodies(world), radius)) {
    drawMark(ctx, cx + body.x, cy + body.y, body.kind, ROLES.textSecondary,
      Math.max(2, body.radius / LOCATOR_RANGE * radius));
  }
  for (const rock of projectLocatorContacts(locatorRocks(world), radius)) {
    drawMark(ctx, cx + rock.x, cy + rock.y, 'rock', ROLES.textSecondary);
  }
  ctx.restore();
  // Datum ticks were folded into the degree ring above; nothing further to
  // draw here but the action contacts and the ship.
  const contacts = projectLocatorContacts(radarContacts(world, { flags, quests, task }), radius);
  for (const contact of [...contacts].sort((a, b) => Number(a.priority) - Number(b.priority))) {
    const x = cx + contact.x, y = cy + contact.y;
    // A blinking contact is the marked find: the cache's own light, dimmed on the off beat.
    const color = contact.blink ? CONFIG.cache.sparkColor : contact.color ?? MARK_COLOR[contact.kind] ?? ROLES.textSecondary;
    if (contact.blink) ctx.globalAlpha = markBlinkAlpha(world.time, reducedMotion);
    drawMark(ctx, x, y, contact.kind, color, 4, contact.heading);
    if (contact.priority && contact.clipped) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(contact.angle) * (radius + 5), cy + Math.sin(contact.angle) * (radius + 5));
      ctx.lineTo(cx + Math.cos(contact.angle) * (radius + 8), cy + Math.sin(contact.angle) * (radius + 8));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const triangle = locatorShipTriangle(world.ship.angle);
  ctx.fillStyle = ROLES.backing;
  ctx.strokeStyle = ROLES.textPrimary;
  ctx.beginPath();
  triangle.forEach((point, index) => ctx[index ? 'lineTo' : 'moveTo'](cx + point.x, cy + point.y));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the modern interface's scope

// The modern interface's locator (labs/graphics/hud-modern.js; SX, 2026-10-16): the scope's own picture in a body of its own, round or
// square (SX: «квадратным по ширине как радио, закругленные углы как радио ... пунктир, квадрат, четкий контур, линеечки на пунктирном
// квадрате ... по радиусу квадрата, и тоже такой фейд»). What it holds is clipped to its dotted rim, so a mark at the rim goes under it, and a
// shade lies round the rim inside, black at the rim to none, under the rim and over the marks (SX: «иконки ... заходили под него ... чтобы
// они закатывались под него ... ощущение круга, шара»); outside the rim, as far as the notch's two lines stand apart, the contour in the
// frames' line (SX: «кольцо ... снаружи, с отступом, как внутри челки»). Square, a mark keeps its place on the disc carried to the square
// (each point (u, v) of the disc to the square's point whose disc is it, the inverse of x·√(1 − y²/2), y·√(1 − x²/2)): the crosshair stays
// straight, the edge of the disc is the square's edge. Its wear (`level`, cockpit-fx.js damageLevel): breaks in the rim and the contour,
// more at each step, a broken piece knocked out of line at the worst (SX: «локатор тоже внешний край ломается с внутренним»).
// `wreck`: at a wreck (SX, 2026-10-16: «локатор во время аварии разрушался побольше») `breaks` more breaks round it, `span` times as long,
// each piece of the contour knocked `off` px out of line, and a crack across its glass: `steps` jags of up to `jag` px off its line, and `branches` short ones off it,
// `branch` of the glass's half long.
export const MODERN_SCOPE = Object.freeze({ apart: 5, round: 8, shade: 22, dark: 0.8, long: 9, short: 4, breaks: 2,
  wreck: Object.freeze({ breaks: 10, span: 1.8, off: [3, 6], steps: 7, jag: 7, branches: 3, branch: 0.35 }) });
function discToSquare(u, v) {
  const u2 = u * u, v2 = v * v, t = 2 * Math.SQRT2;
  const x = 0.5 * Math.sqrt(Math.max(0, 2 + u2 - v2 + t * u)) - 0.5 * Math.sqrt(Math.max(0, 2 + u2 - v2 - t * u));
  const y = 0.5 * Math.sqrt(Math.max(0, 2 - u2 + v2 + t * v)) - 0.5 * Math.sqrt(Math.max(0, 2 - u2 + v2 - t * v));
  return [clamp(x, -1, 1), clamp(y, -1, 1)];
}
function roundedRect(ctx, x, y, w, h, rr) {
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}
// `box` its contour's box (whole pixels, square), `shape` 'round' or 'square', `level` its wear (0-4), `seed` where its breaks fall, `wreck`
// the deck's break at a wreck while it stands (cockpit-fx.js cockpitCrack: its `seed` where the crack runs), or null.
export function drawModernScope(r, world, { box, shape = 'square', reducedMotion = false, flags = [], quests = [], task = null, level = 0, seed = 1, wreck = null }) {
  const ctx = r.ctx, S = MODERN_SCOPE, cx = box.x + box.w / 2, cy = box.y + box.h / 2, square = shape === 'square';
  const inner = box.w / 2 - 0.5 - S.apart, dotRound = Math.max(0, S.round - S.apart);
  noteKey(keyName('map'), box, r);
  // The rim's path: the dotted circle, or the dotted rounded square.
  const rim = (half) => { if (square) roundedRect(ctx, cx - half, cy - half, 2 * half, 2 * half, Math.max(0, dotRound - (inner - half))); else { ctx.beginPath(); ctx.arc(cx, cy, half, 0, Math.PI * 2); } };
  // Where a point of the disc (its own px from the middle, out of `inner`) stands.
  const at = (x, y) => { if (!square) return [cx + x, cy + y]; const [sx, sy] = discToSquare(x / inner, y / inner); return [cx + sx * inner, cy + sy * inner]; };
  hoverItem(r, 'locator:scope', box, () => {
    ctx.save(); ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.fillStyle = ROLES.backing;
    if (square) roundedRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, S.round); else { ctx.beginPath(); ctx.arc(cx, cy, box.w / 2, 0, Math.PI * 2); }
    ctx.fill();
    // What it holds, inside the rim.
    ctx.save(); rim(inner); ctx.clip();
    ctx.strokeStyle = ROLES.shadow; ctx.beginPath();
    for (const f of [0.33, 0.66]) {
      if (square) { const h = inner * f; roundedRect(ctx, cx - h, cy - h, 2 * h, 2 * h, h * 0.45); ctx.stroke(); ctx.beginPath(); }
      else ctx.arc(cx, cy, inner * f, 0, Math.PI * 2);
    }
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { ctx.moveTo(cx + dx * 12, cy + dy * 12); ctx.lineTo(cx + dx * (inner - 8), cy + dy * (inner - 8)); }
    ctx.stroke();
    for (const body of projectLocatorContacts(locatorBodies(world), inner)) {
      const [x, y] = at(body.x, body.y);
      drawMark(ctx, x, y, body.kind, ROLES.textSecondary, Math.max(2, body.radius / LOCATOR_RANGE * inner));
    }
    for (const rock of projectLocatorContacts(locatorRocks(world), inner)) { const [x, y] = at(rock.x, rock.y); drawMark(ctx, x, y, 'rock', ROLES.textSecondary); }
    const contacts = projectLocatorContacts(radarContacts(world, { flags, quests, task }), inner);
    for (const contact of [...contacts].sort((a, b) => Number(a.priority) - Number(b.priority))) {
      const [x, y] = at(contact.x, contact.y);
      const color = contact.blink ? CONFIG.cache.sparkColor : contact.color ?? MARK_COLOR[contact.kind] ?? ROLES.textSecondary;
      if (contact.blink) ctx.globalAlpha = markBlinkAlpha(world.time, reducedMotion);
      drawMark(ctx, x, y, contact.kind, color, 4, contact.heading);
      ctx.globalAlpha = 1;
    }
    const triangle = locatorShipTriangle(world.ship.angle);
    ctx.fillStyle = ROLES.backing; ctx.strokeStyle = ROLES.textPrimary; ctx.beginPath();
    triangle.forEach((point, index) => ctx[index ? 'lineTo' : 'moveTo'](cx + point.x, cy + point.y));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // The shade round the rim, inside it.
    if (square) {
      for (let t = 0; t < S.shade; t++) {
        ctx.strokeStyle = `rgba(0, 0, 0, ${S.dark * (1 - t / S.shade) ** 1.6})`; rim(inner - t - 0.5); ctx.stroke();
      }
    } else {
      const g = ctx.createRadialGradient(cx, cy, inner - S.shade, cx, cy, inner);
      for (const [stop, a] of [[0, 0], [0.45, 0.25], [0.8, 0.6], [1, 1]]) g.addColorStop(stop, `rgba(0, 0, 0, ${a * S.dark})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2); ctx.fill();
    }
    // The rim over the shade: dotted, its ticks every 10 degrees where each ray from the middle meets it, pointing in.
    ctx.strokeStyle = ROLES.structure; ctx.setLineDash([1, 3]); rim(inner); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath();
    for (let deg = 0; deg < 360; deg += 10) {
      const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), reach = square ? inner / Math.max(Math.abs(c), Math.abs(sn)) : inner;
      const len = deg % 30 === 0 ? S.long : S.short;
      ctx.moveTo(cx + c * reach, cy + sn * reach); ctx.lineTo(cx + c * (reach - len), cy + sn * (reach - len));
    }
    ctx.stroke();
    // The contour.
    if (square) roundedRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, S.round); else { ctx.beginPath(); ctx.arc(cx, cy, inner + S.apart, 0, Math.PI * 2); }
    ctx.stroke();
    // The wear: black over the rim and the contour where they broke, a piece of the contour knocked out of line at the worst; at a wreck
    // breaks all round, the pieces knocked farther, and the crack across the glass.
    const WR = S.wreck;
    if (level > 0 || wreck) {
      const outerHalf = inner + S.apart, n = level * S.breaks + (wreck ? WR.breaks : 0), at3 = wreck ? wreck.seed % 997 : 0;
      const pointAt = (half, a) => { const c = Math.cos(a), sn = Math.sin(a), reach = square ? half / Math.max(Math.abs(c), Math.abs(sn)) : half; return [cx + c * reach, cy + sn * reach]; };
      ctx.lineCap = 'butt';
      for (let i = 0; i < n; i++) {
        const own = i >= level * S.breaks, sd = own ? seed + at3 : seed;
        const a = noise3(sd, i, 3) * Math.PI * 2, span = (0.05 + 0.08 * noise3(sd, i, 5)) * (square ? 0.8 : 1) * (own ? WR.span : 1);
        for (const [half, w] of [[outerHalf, 3], ...(i % 2 ? [[inner, 3]] : [])]) {
          ctx.strokeStyle = ROLES.backing; ctx.lineWidth = w; ctx.beginPath();
          for (let k = 0; k <= 6; k++) { const [x, y] = pointAt(half, a - span / 2 + (span * k) / 6); ctx[k ? 'lineTo' : 'moveTo'](x, y); }
          ctx.stroke();
          if ((level >= 3 || wreck) && half === outerHalf) {
            const off = wreck ? WR.off[0] + noise3(sd, i, 7) * (WR.off[1] - WR.off[0]) : 1.5 + noise3(seed, i, 7) * 1.5;
            ctx.strokeStyle = ROLES.structure; ctx.lineWidth = 1; ctx.beginPath();
            for (let k = 1; k <= 5; k++) { const [x, y] = pointAt(half + off, a - span / 3 + (span * k) / 9); ctx[k > 1 ? 'lineTo' : 'moveTo'](x, y); }
            ctx.stroke();
          }
        }
      }
      // The crack: from the contour to the contour about across, jagged off its line, a short branch off it here and there; black cut
      // under a line of the contour's ink.
      if (wreck) {
        const sd = seed + at3, a0 = noise3(sd, 1, 61) * Math.PI * 2, a1 = a0 + Math.PI + (noise3(sd, 2, 61) - 0.5);
        const [x0, y0] = pointAt(outerHalf, a0), [x1, y1] = pointAt(outerHalf, a1), len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = -(y1 - y0) / len, ny = (x1 - x0) / len, run = [];
        for (let k = 0; k <= WR.steps; k++) {
          const t = k / WR.steps, j = k === 0 || k === WR.steps ? 0 : (noise3(sd, k, 67) * 2 - 1) * WR.jag;
          run.push([x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j]);
        }
        const lines = [run];
        for (let b = 0; b < WR.branches; b++) {
          const k = 1 + Math.floor(noise3(sd, b, 71) * (WR.steps - 1)), [bx, by] = run[k], side = b % 2 ? 1 : -1;
          const turn = Math.atan2(y1 - y0, x1 - x0) + side * (0.6 + 0.5 * noise3(sd, b, 73)), L = WR.branch * inner * (0.6 + 0.4 * noise3(sd, b, 79));
          const mid = L * 0.55, bend = (noise3(sd, b, 83) * 2 - 1) * 0.35;
          lines.push([[bx, by], [bx + Math.cos(turn) * mid, by + Math.sin(turn) * mid], [bx + Math.cos(turn + bend) * L, by + Math.sin(turn + bend) * L]]);
        }
        ctx.lineJoin = 'miter';
        for (const [w, ink] of [[3, ROLES.backing], [1, ROLES.structure]]) {
          ctx.strokeStyle = ink; ctx.lineWidth = w; ctx.beginPath();
          for (const line of lines) line.forEach(([x, y], k) => ctx[k ? 'lineTo' : 'moveTo'](x, y));
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }, { kind: 'panel' });
  return box;
}
// The legend's rows where the modern interface lays them (`L` columnLayout's, its `legendX` and `listTop` the modern's).
export const drawLegendRowsAt = (r, L, lore = null) => drawLegendRows(r, L, lore);
export const LEGEND_ROW_COUNT = LEGEND_ROWS;

function drawColumnText(r, world, L, task) {
  // Header: where the route leads, one line (SX, 2026-10-01: «Вот эту инфу из центра перенеси вместо надписей над локатором и
  // сделай динамичной»; 2026-10-05: the distance, the name). Text over open space takes a knockout outline, not a black box (SX,
  // 2026-09-26). The header stands inside the column, its ink from its left edge to its right (SX, 2026-10-01: «они должны быть
  // выровнены, в том числе и легенда, по краю локатора»).
  for (const piece of headerPieces(r, locatorHeader(world, task), L.left, L.right)) haloText(r, piece.value, piece.x, L.top, piece.ink);
  // The legend's button under the scope: a click does what its key does (src/controls.js `legend`), and it comes up under the pointer.
  const phase = L.phase, key = keyName('legend');
  drawColumnButton(r, { x0: L.x0, edge: L.right - L.capLeft, rowTop: L.mTop, key, word: phase.open ? 'HIDE LEGEND' : 'LEGEND',
    turn: phase.turn, name: 'locator:legend', note: (box) => noteKey(key, box, r) });
  if (phase.rows) drawLegendRows(r, L, phase.lore);
}

// The legend's rows from `L.listTop`, under the scope from `L.legendX`: two columns of seven, mark then name, drawn with the marks
// the scope itself just used. `lore`
// ({ dir, t }) while they come or go: a cell at a time, blank, then 0.18 s of the quest plates' lore glyphs, then itself, a sweep
// from the top left (labs/graphics/quest-list.js A2 LORE); going, the same backwards.
function drawLegendRows(r, L, lore = null) {
  const ctx = r.ctx;
  LEGEND.forEach(([kind, name], i) => {
    const col = Math.floor(i / LEGEND_ROWS), row = i % LEGEND_ROWS, x = L.legendX + col * L.colW, y = L.listTop + row * UI.row;
    const ink = MARK_COLOR[kind] || ROLES.textSecondary;
    if (!lore) {
      haloText(r, name, x + 2 * r.cellW, y + L.textY, ROLES.textSecondary);
      drawMark(ctx, x + r.cellW / 2, y + UI.row / 2, kind, ink);
      return;
    }
    const cells = [' ', ' ', ...Array.from(name)], t = lore.dir > 0 ? lore.t : LEGEND_TIMES.lore - lore.t;
    cells.forEach((ch, c) => {
      const u = (col * (LEGEND_NAME_MAX + 2) + c) / (LEGEND_COLS * (LEGEND_NAME_MAX + 2)), v = row / LEGEND_ROWS;
      const hash = noise3(i + 3, c + 5, 41);
      const start = (v * 0.3 + u * 0.7) * LORE_TIMES.sweep + hash * LORE_TIMES.scatter;
      if (t < start || c === 1) return;
      const glyph = t < start + LORE_TIMES.cell ? LORE[(Math.floor(t / LORE_TIMES.step) + Math.floor(hash * 151)) % LORE.length] : null;
      if (c === 0) { if (glyph) haloText(r, glyph, x, y + L.textY, ROLES.textSecondary); else drawMark(ctx, x + r.cellW / 2, y + UI.row / 2, kind, ink); return; }
      haloText(r, glyph ?? ch, x + c * r.cellW, y + L.textY, ROLES.textSecondary);
    });
  });
}
