import { CONFIG } from './config.js';
import { stationDefById, sectorById } from './sectors.js';
import { isRestored, reachableStationIds, formatCR, guardSize, stationBill } from './ruins.js';
import { TAU, lerp } from './util.js';
import { factsOf, raidStartAt, raidFirstDue, raidGapFor, payFor } from './pacing.js';
import { radioFitted } from './opening.js';
import { contentLinks } from './mapContent.js';

// Pirates at a post (SX, 2026-10-01, GARAGE_QUESTS_HANDOFF.md step 3; CONFIG.raids): a ruin's guards and a raid's
// besiegers. Both are a squad that circles a station (mode 'guard', src/pirates.js) until the pilot comes near or hits
// one; then it hunts as any squad does, and when it has lost the pilot, or the pilot has docked or sat in a refuge, it
// goes back to circling. A squad at a post is only ever in the sector the pilot is in, like every pirate: it is made
// when the pilot is there and its post has none, and its tally (`size`, `down`) says how many are still to beat, so a
// pilot who leaves and comes back meets the rest of it, not a fresh one.
//
//   GUARDS  a ruin not yet restored has a squad round it (CONFIG.raids.guards, 5 to 9 by its price, 4 to 8 until 2026-10-20; SX, 2026-10-08: «около разбитых
//           станций нет пиратов даже в квестах, должно быть от 4 до 8 всегда»), funded or not. No money goes in while it flies there;
//           once every one of it is down (or has run), the ruin is clear (the ledger's `cleared`, which the quests count once) and its
//           guards are back `guardsEvery` s later on the pilot's clock (the ledger's `guardsAt`), until it is restored. The tally is
//           saved since v25 (World.posts, `piratePosts`, src/pirateCombatSave.js; Codex, 2026-10-09): leaving the sector and coming back
//           meets the part not yet beaten, a reload the whole squad (SX, 2026-10-15, W3 «B»), and so do `guardsEvery` s with part of it
//           beaten. A squad at
//           its post is not wrecked by the rocks that drift through its ring (src/pirates.js): until 2026-10-08 they were, and a ruin was
//           cleared, and a raid won, with no shot fired.
//   RAIDS  one at a time, on the pilot's clock (CONFIG.raids): a working station is besieged and the pilot has `time`
//           seconds to beat the squad. In time: nothing lost. Late: the station is closed until repaired, for 150 CR and a
//           twenty-fifth of its price (raidLoss; it was half a ruin's price, a quarter of a station's worth). The
//           raid is in the ledger (`raid`, `raidNext`), so a reload keeps its clock and its tally.
//
//   THE START RUIN  the pilot's own broken station (src/sectors.js startRuinOf, the opening's ruin) is a ruin like the rest. Its guards
//           were the first to come back (SX, 2026-10-06: «У разбитой первой станции поставь сразу 3 пиратов, которые раз в 15 минут
//           респавнятся там, пока станцию не починят»); that rule is every ruin's now, and its number the table's (4 at its price of
//           1,900). The opening reads the same `guardsAt` (src/opening.js guardsDown).
//   GATHERINGS  a station the pilot drove the pirates off (a raid won) and then left alone a long time fills with them
//           again (SX, 2026-10-02: «если я зачистил станцию но улетел и долго не возвращался там они снова скапливаются»):
//           a squad circling it as a ruin's guards do, no clock and no loss, there for the pilot to see and clear.
//
// A raid's squad is many ships of every hull in one paint (SX, 2026-10-02: «Рейд пиратов вокруг станций должен содержать
// много пиратов, причем разные типы кораблей но все в одной раскраске»); a gathering's the same, smaller. The paint and the
// hulls still to beat are in the raid's record, so a pilot who leaves and comes back meets the same colours.
//
// What a pilot sees of either is the page's: the quest list and the pointer (src/quests.js, labs/graphics/quest-list.js).

const R = () => CONFIG.raids;

// A ruin's guards: how many ships, by its price (src/ruins.js guardSize, where the opening can reach it).
export { guardSize };

// Whether a ruin's guards are down now: beaten whole (or run) less than `guardsEvery` s ago on the pilot's clock.
export function guardsBeaten(ledger, id) {
  const at = ledger.guardsAt?.get(id);
  return Number.isFinite(at) && ledger.clock < at + R().guardsEvery;
}

// Whether a ruin has its guards now: not restored, and never beaten whole or beaten `guardsEvery` s ago or more. Money put into it
// changes nothing (it stays in, and no more goes in while they fly there: postHeld), nor does `cleared`, which only says they were
// beaten once.
export function ruinGuarded(ledger, station) {
  return station?.kind === 'ruin' && !isRestored(ledger, station) && !guardsBeaten(ledger, station.id);
}

// A raid's quest id (src/quests.js): the station and the moment it began, so the next raid there is a new plate.
export const raidQuestId = (raid) => `raid:${raid.stationId}:${Math.round(raid.startedAt)}`;

// The station under a raid now, by id, or null.
const raidStationId = (ledger) => ledger?.raid?.stationId ?? null;
// A station is besieged, and no refuge, while a raid is on it or a gathering of pirates is round it (World.posts holds the
// gathering's tally under the station's id).
export const gathered = (world, station) => !!station && world.posts.get(station.id)?.kind === 'gather';
export const besieged = (world, station) => !!station && (raidStationId(world.ledger) === station.id || gathered(world, station));

// Whether a post's squad is here and not gone: what holds the ruin's money back.
export function postHeld(world, stationId) {
  return world.pirates.some((p) => p.post?.stationId === stationId && p.mode !== 'leave');
}

// When the next raid may come, on the pilot's clock: never (Infinity) until a station is restored (CONFIG.raids.restored),
// then not before the start rule (`quiet` s after the first restoration, `notBefore` s at the earliest; src/pacing.js); later
// ones by the gap their predecessor's end left. A save from before the rule keeps its own clock but not earlier than the rule's.
// A query: it writes nothing (the code review's architecture finding 10). The ledger's `raidNext` is set by the raids' own
// step (settleRaidClock), its first value the start the rule gives at the first look after a restoration.
export function nextRaidAt(ledger) {
  const start = raidStartAt(factsOf(ledger));
  if (start === null) return Infinity;
  return Math.max(Number.isFinite(ledger.raidNext) ? ledger.raidNext : start, start);
}

// The raids' clock set once a station is restored, at the posts' look that asks whether a raid is due (stepPosts, its one
// owner): `raidNext` takes the start the rule gives then and is saved, so a save from before restoredAt was kept, whose start
// moves with the clock, keeps the one it was given. Returns when the next raid may come, as nextRaidAt.
function settleRaidClock(ledger) {
  const facts = factsOf(ledger), start = raidStartAt(facts);
  if (start === null) return Infinity;
  if (!Number.isFinite(ledger.raidNext)) ledger.raidNext = raidFirstDue(facts);
  return Math.max(ledger.raidNext, start);
}
const raidGap = (world) => raidGapFor(world.ledger.restored.size, world.rng('pirate'));

function pickSize(rng) {
  const table = R().squad, total = table.reduce((s, [, w]) => s + w, 0);
  let u = rng() * total;
  for (const [n, w] of table) { u -= w; if (u < 0) return n; }
  return table[table.length - 1][0];
}

// ------------------------------------------------------------------------------------------------- one step

// Once a `checkEvery` s: a raid's clock run out, a raid due, and every post in this sector that should have a squad and
// has none given one. Inert while World.autoEncounters is off (checks, tools, the lab's review scenes).
export function stepPosts(world, dt) {
  if (!world.autoEncounters) return;
  world.postCheckIn -= dt;
  if (world.postCheckIn > 0) return;
  world.postCheckIn = R().checkEvery;
  const L = world.ledger;
  if (L.raid && L.clock >= L.raid.endsAt) loseRaid(world);
  // A raid waits for a ship pestered and a reference ship to end, as they wait for it (one red quest at a time); and for the radio, which
  // hears it (SX, 2026-10-06: «радио открывает ... дополнительные активности как рейды»): its clock waits with it.
  if (!L.raid && radioFitted(world) && !(world.pester && !world.pester.cleared) && !world.special && L.clock >= settleRaidClock(L)) startRaid(world);
  for (const p of world.pirates) if (p.post?.station) { p.post.x = p.post.station.x; p.post.y = p.post.station.y; }
  if (!world.ship.alive) return;
  for (const s of world.stations) {
    const raid = raidStationId(L) === s.id ? L.raid : null;
    const guarded = !raid && ruinGuarded(L, s);
    const gather = !raid && !guarded ? gatherTally(world, s) : null;
    if (!raid && !guarded && !gather) continue;
    if (world.pirates.some((p) => p.post?.stationId === s.id)) continue;
    const tally = raid ?? gather ?? guardTally(world, s);
    const left = tally.size - tally.down;
    if (left <= 0) continue;
    // A raid's paint and the hulls still to beat are kept the first time its squad is made, so the squad that is met
    // again after a pilot has left and come back is the same colour and the same ships.
    const made = spawnPost(world, s, raid ? 'raid' : gather ? 'gather' : 'guard', left,
      { size: tally.size, types: tally.mix, paint: tally.paint, record: tally });
    if (made.length) { tally.paint = made[0].paint; tally.mix = made.map((p) => p.type); }
  }
}

// A station the pilot drove the pirates off fills with them again once he has been away a long time (SX, 2026-10-02: «если я
// зачистил станцию но улетел и долго не возвращался там они снова скапливаются»). `ledger.driven` is the moment they were
// driven off, put forward to now at every look while the pilot is in the station's sector, so it is `after` s old only when
// he has been elsewhere that long. Then, the first time he is in the sector and not within `clear` u of the station (they
// would appear in view), there is a squad of `size[0]` ships, one more for each `grow` s past `after` up to `size[1]`: the
// longer away, the more of them. It circles the station as a ruin's guards do (kind 'gather'), and the station is no refuge
// while it does. Every one down or run, and the wait starts over. A reload keeps the part not yet beaten (save v25); a ruin's guards come back whole (W3).
function gatherTally(world, s) {
  const L = world.ledger, G = R().regather;
  const held = world.posts.get(s.id);
  if (held) return held.kind === 'gather' ? held : null;
  const at = L.driven.get(s.id);
  if (at === undefined || L.broken.has(s.id) || !world.ship.alive) return null;
  const away = L.clock - at;
  if (away < G.after) { L.driven.set(s.id, L.clock); return null; }
  const d = world.delta(s.x, s.y, world.ship.x, world.ship.y);
  if (Math.hypot(d.x, d.y) < R().clear) return null;
  const tally = { kind: 'gather', size: Math.min(G.size[1], G.size[0] + Math.floor((away - G.after) / G.grow)), down: 0, paint: null, at: L.clock };
  world.posts.set(s.id, tally);
  return tally;
}

// A ruin's guards' tally (saved since v25; a reload makes it whole again, src/pirateCombatSave.js readPiratePosts): `guardSize` ships by its price, made at `at` on the pilot's
// clock; one met in part and left is whole again once `guardsEvery` s have passed since.
function guardTally(world, s) {
  const L = world.ledger;
  const held = world.posts.get(s.id);
  if (held && !(held.down > 0 && L.clock >= held.at + R().guardsEvery)) return held;
  const tally = { size: guardSize(s), down: 0, at: L.clock };
  world.posts.set(s.id, tally);
  return tally;
}

// A squad round a station, evenly on a ring `guard.gap` u outside its hull, flying along the ring. A squad round
// something that is no station (a small ship pestered, src/pester.js, kind 'pester': anything with an `id` and an x, y)
// says its own `radius` and `wake`, and `label`, what it is called when the squad turns on the pilot.
// A raid's or a gathering's squad is of every hull in one paint (`mixed`; a ruin's guards and a pestering squad stay one
// hull, as before) and can be more than a zone's four, so its ring grows with its size to keep `raids.spacing` u between
// neighbours; so does a ruin's, whose guards are 5 to 9 (the ring is the hull's and the guard gap while that is wider: up to six). `size` is
// what the squad was made with (the ring is the same when the rest of it is met again), `types` the hulls still to beat and `paint`
// its colour, when they are known.
export function spawnPost(world, station, kind, count, { radius = null, wake = CONFIG.pirates.guard.wake, label = null, size = count, types = null, paint = null, record = null } = {}) {
  const rng = world.rng('pirate');
  const ring = radius ?? Math.max(station.hullRadius + CONFIG.pirates.guard.gap, kind === 'raid' || kind === 'gather' || kind === 'guard' ? R().spacing / (2 * Math.sin(Math.PI / Math.max(2, size))) : 0);   // a chord of `spacing` between neighbours
  const start = rng() * TAU, dir = rng() < 0.5 ? -1 : 1;
  const places = Array.from({ length: count }, (_, i) => {
    const a = start + (i / count) * TAU;
    return { x: station.x + Math.cos(a) * ring, y: station.y + Math.sin(a) * ring, heading: a + dir * Math.PI / 2 };
  });
  return world.spawnPirates(count, {
    places, passive: true, silent: true, speed: 0.15, side: dir, max: Math.max(CONFIG.pirates.maxGroup, count),
    combatRecord: record,
    mixed: kind === 'raid' || kind === 'gather', types: types?.length ? types : null, paint,
    post: { stationId: station.id, kind, station, x: station.x, y: station.y, radius: ring, wake, label },
  });
}

// A squad at a post wakes (src/pirates.js: the pilot came near, or hit one): every one of it hunts, and the fight is on.
export function wakePost(world, p) {
  const woken = world.pirates.filter((q) => q.squad === p.squad && q.mode === 'guard');
  if (!woken.length) return;
  for (const q of woken) { q.mode = 'hunt'; q.senseIn = 0; }
  if (!world.encounter) world.encounter = { startedAt: world.time, size: 0, farFor: 0, safeFor: 0 };
  world.encounter.size += woken.length;
  const to = world.delta(p.x, p.y, world.ship.x, world.ship.y);
  world.emit('piratesEngaged', {
    count: woken.length, kinds: woken.map((q) => q.type), total: world.pirates.length, sectorId: world.sector.id,
    bearing: Math.atan2(to.y, to.x), distance: Math.round(Math.hypot(to.x, to.y)),
    post: p.post?.kind ?? null, stationId: p.post?.stationId ?? null, label: p.post?.label ?? stationDefById(p.post?.stationId)?.label ?? null,
  });
}

// A squad pestering a ship (kind 'pester', src/pester.js) fires at it now and then (CONFIG.quests.pester.fire): a bolt
// that ends at the hull's edge, and sparks on the hull when it gets there (the ship's `hits`, which the quest's step
// lights). A bolt that flew on would cross the ring into its own squad, and the ship is nobody's target, so it is
// aimed and timed to stop. Said once in `every` s a pirate, by the dice of the drops (cosmetic, never the squad's).
export function harass(world, p, dt) {
  const post = p.post, ship = post?.station;
  if (post?.kind !== 'pester' || !ship?.hits) return;
  const F = CONFIG.quests.pester.fire;
  p.harassIn = (p.harassIn ?? lerp(0.4, F[1], world.rng('drop')())) - dt;
  if (p.harassIn > 0) return;
  p.harassIn = lerp(F[0], F[1], world.rng('drop')());
  const to = world.delta(ship.x, ship.y, p.x, p.y);
  const dist = Math.hypot(to.x, to.y) || 1;
  const heading = Math.atan2(to.y, to.x) + (world.rng('drop')() - 0.5) * 0.08;
  const ux = Math.cos(heading), uy = Math.sin(heading), W = p.W;
  const reach = Math.max(0.05, (dist - W.muzzleOffset - 40) / W.muzzleSpeed);
  world.bullets.push({
    x: p.x + ux * W.muzzleOffset, y: p.y + uy * W.muzzleOffset, vx: ux * W.muzzleSpeed, vy: uy * W.muzzleSpeed,
    life: reach, owner: 'pirate', by: p.id, kind: p.type, damage: W.damage,
  });
  ship.hits.push({ at: world.time + reach, x: ship.x - ux * 30, y: ship.y - uy * 30, aim: heading + Math.PI });
  world.emit('shotFired', { owner: 'pirate', kind: p.type, x: p.x, y: p.y, sectorId: world.sector.id });
}

// A pirate of a post is down or has run: the tally goes on, and a post with none left is won.
export function postGone(world, p) {
  const post = p.post;
  if (!post) return;
  p.post = null;
  const L = world.ledger;
  // A pirate down or run from a ship it was pestering: the tally of the quest, which frees the ship when it is all of them.
  if (post.kind === 'pester') {
    if (world.pester?.id === post.stationId) {
      world.pester.down += 1;
      const at = world.pester.mix?.indexOf(p.type) ?? -1;
      if (at >= 0) world.pester.mix.splice(at, 1);
    }
    return;
  }
  if (post.kind === 'raid') {
    if (L.raid?.stationId !== post.stationId) return;
    L.raid.down += 1;
    const at = L.raid.mix?.indexOf(p.type) ?? -1;
    if (at >= 0) L.raid.mix.splice(at, 1);           // the hulls still to beat
    if (L.raid.down >= L.raid.size) winRaid(world);
    return;
  }
  // A gathering beaten: gone, and the wait for the next one starts now.
  if (post.kind === 'gather') {
    const tally = world.posts.get(post.stationId);
    if (tally?.kind !== 'gather') return;
    tally.down += 1;
    const at = tally.mix?.indexOf(p.type) ?? -1;
    if (at >= 0) tally.mix.splice(at, 1);
    if (tally.down < tally.size) return;
    world.posts.delete(post.stationId);
    L.driven.set(post.stationId, L.clock);
    return;
  }
  const tally = world.posts.get(post.stationId);
  if (!tally) return;
  tally.down += 1;
  const at = tally.mix?.indexOf(p.type) ?? -1;
  if (at >= 0) tally.mix.splice(at, 1);
  if (tally.down < tally.size) return;
  world.posts.delete(post.stationId);
  L.cleared.add(post.stationId);
  // Any ruin's come back `guardsEvery` s from now, until it is restored. `cleared` says only that they were beaten once (the quests count
  // it once, src/pacing.js, src/guide.js); what a squad that returns pays is its pirates' loot and nothing else (src/encounters.js).
  L.guardsAt.set(post.stationId, L.clock);
  const def = stationDefById(post.stationId);
  world.emit('ruinCleared', { stationId: post.stationId, label: def?.label, sectorId: world.sector.id, x: post.x, y: post.y });
}

// ------------------------------------------------------------------------------------------------ the raids

// Where a raid may fall now: a working station in an open sector (the frontier, src/frontier.js: the pilot could not come to
// one past a closed border), not broken, not a ruin restored less than `quiet` ago, not one the ship is near enough to see,
// with its weight.
export function raidCandidates(world) {
  const L = world.ledger, C = R();
  const out = [];
  for (const id of reachableStationIds(L)) {
    if (L.broken.has(id) || world.posts.get(id)?.kind === 'gather') continue;
    const def = stationDefById(id, L);
    const ruin = def.kind === 'ruin';
    if (ruin && L.clock - (L.restoredAt?.get(id) ?? -Infinity) < C.quiet) continue;
    if (def.sectorId === world.sector.id) {
      const s = world.stations.find((x) => x.id === id);
      const d = s ? world.delta(s.x, s.y, world.ship.x, world.ship.y) : null;
      if (d && Math.hypot(d.x, d.y) < C.clear) continue;
    }
    out.push({ id, def, ruin, weight: ruin ? C.ruinWeight : 1 });
  }
  return out;
}

// A raid begins, if one can: not while the ship is down or lost in O-08 (it would have no way to come). With nowhere
// to fall it tries again in a minute.
export function startRaid(world, stationId = null) {
  const L = world.ledger, rng = world.rng('pirate');
  if (L.raid) return null;
  if (!world.ship.alive || world.sector.hidden || world.special?.boarded) return null;
  let pool = raidCandidates(world).filter((c) => !stationId || c.id === stationId);
  if (!stationId) {
    const plans = contentLinks('raid-defence', L);
    const preferred = pool.filter((c) => plans.some((p) => p.anchorId === c.id));
    if (preferred.length) pool = preferred;
  }
  if (!pool.length) { L.raidNext = L.clock + 60; return null; }
  const total = pool.reduce((s, c) => s + c.weight, 0);
  let u = rng() * total, pick = pool[pool.length - 1];
  for (const c of pool) { u -= c.weight; if (u < 0) { pick = c; break; } }
  L.raid = { stationId: pick.id, startedAt: L.clock, endsAt: L.clock + R().time, size: pickSize(rng), down: 0 };
  L.raidNext = null;
  world.emit('raidStarted', { ...raidWords(pick.def), stationId: pick.id, size: L.raid.size, time: R().time, sectorId: world.sector.id });
  return L.raid;
}

// What a raid costs when the pilot is late: CR to repair, and the share the drawing keeps. The bill since 2026-10-04 (SX's 11B,
// Codex's study: «150 + min(200, round((station.cost ?? 1500) / 25))», 210 to 338 CR): a restored ruin by its price, any other
// station as one of `loss.value`; until then half a ruin's price, or a quarter of 2,000 for a working station.
export function raidLoss(def) {
  const C = R();
  return { cost: stationBill(def), look: 1 - (def.kind === 'ruin' ? C.ruinShare : C.stationShare) };
}

function raidWords(def) {
  return { label: def.label, sectorLabel: def.sectorLabel, ruin: def.kind === 'ruin' };
}

function winRaid(world) {
  const L = world.ledger, raid = L.raid, def = stationDefById(raid.stationId, L);
  L.raid = null;
  L.raidNext = L.clock + raidGap(world);
  L.driven.set(raid.stationId, L.clock);             // they gather again if the pilot leaves it alone a long time (gatherTally)
  // A raid won pays (SX, 2026-10-02: 150 CR, the quest economy), grown with the stations restored.
  const pay = payFor('raidThanks', L.restored.size);
  L.credits += pay;
  world.questOutcomes?.set(raidQuestId(raid), 'done');
  world.emit('raidWon', { ...raidWords(def), stationId: raid.stationId, seconds: L.clock - raid.startedAt, sectorId: world.sector.id,
    pay, credits: L.credits });
  // (Until 2026-10-17 the first raid won gave SPAWN; it is the default look since, owned from the start: src/looks.js.)
}

// Late: the station is closed until repaired (the same `broken` a wreck against it leaves, World.brokenActions), and the
// besiegers here fly off with what they came for.
export function loseRaid(world) {
  const L = world.ledger, raid = L.raid;
  if (!raid) return;
  const def = stationDefById(raid.stationId, L);
  const { cost, look } = raidLoss(def);
  L.broken.set(raid.stationId, Math.max(L.broken.get(raid.stationId) ?? 0, cost));
  L.brokenLook.set(raid.stationId, Math.min(L.brokenLook.get(raid.stationId) ?? 1, look));
  L.raid = null;
  L.raidNext = L.clock + raidGap(world);
  world.questOutcomes?.set(raidQuestId(raid), 'late');
  for (const p of world.pirates) {
    if (p.post?.stationId !== raid.stationId) continue;
    p.post = null;
    if (p.mode === 'guard') { p.mode = 'leave'; p.leaveTimer = CONFIG.pirates.leave.time; }
  }
  world.emit('raidLost', { ...raidWords(def), stationId: raid.stationId, cost, costText: formatCR(cost), sectorId: world.sector.id });
}

// The raid as the page shows it: where, how long is left, how many still to beat. Null without one.
export function raidStatus(world) {
  const L = world.ledger, raid = L.raid;
  if (!raid) return null;
  const def = stationDefById(raid.stationId, L);
  if (!def) return null;
  return { ...raid, def, label: def.label, sectorLabel: sectorById(def.sectorId)?.label ?? def.sectorLabel,
    ruin: def.kind === 'ruin', left: raid.endsAt - L.clock, time: R().time, loss: raidLoss(def) };
}
