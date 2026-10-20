// The encounters: everything the world does with pirates between their flight (src/pirates.js) and the posts' rules
// (src/raids.js): the zones' roll that starts a fight, a squad spawned and placed, the posts' step as the world calls it, a
// shot or a ram that meets a pirate or the ship, a pirate hurt, killed or gone, the fight's end, the coins and parts a pirate
// drops, a wreck's takings scattered for them to gather, and their den. Moved out of src/world.js as it was (2026-10-05, the
// pirates' seam: SX's hygiene list); World keeps a one-line method for each one the pirates, the raids, the quests, the
// wreck and the checks call on the world, and these call back through those methods, so a world that stands in for one (a
// check's killPirate) is heard. The golden master (tools/golden.mjs) holds the move to the same frames and the same world.
import { CONFIG } from './config.js';
import { TAU, clamp, lerp } from './util.js';
import { Pirate, stepPirates as flyPirates, pickGroupSize, pickTypes, pickMixedTypes, pickPaint } from './pirates.js';
import { rollSquad } from './personas.js';
import { stepPosts, wakePost, postGone, besieged } from './raids.js';
import { workingKind } from './ruins.js';
import { openingCalm } from './opening.js';
import { noteSpecialPirate } from './specials.js';
import { pirateDebris } from './debris.js';
import { replaceRoster } from './pirateRoster.js';
import { attachPirateCombat, finishPirateCombat } from './pirateCombat.js';
import { onNewPirateDamaged, onNewPirateRemoved } from './pirateRoles.js';
import { landedNow } from './trick.js';
import { applyPirateStyle, styleIdOf, temperTraits, hitMoves, scheduleReinforcement, stepReinforcement } from './pirateStyles.js';
import { cancelAttack } from './pirateAttacks.js';
import { contentAreas } from './mapContent.js';
import { noteVanish } from './vanish.js';

// How many restorations the lab's arena counts as made, for the hulls that replace the old four (src/pirateRoster.js): all of them.
const ROSTER_OPEN = 99;

// What a blow costs a pirate, on its own few hit points (CONFIG.pirates.hurt.impact): the ship's rule as it was
// when the hull had 10, so pirates break against each other and the ship as they did.
export function pirateImpact(closing) {
  const I = CONFIG.pirates.hurt.impact;
  if (!(closing >= I.touchSpeed)) return 0;
  return Math.max(1, Math.round(I.base * (closing / I.refSpeed) ** I.power));
}

// One step of everything to do with pirates: the automatic encounter rule
// (inert while CONFIG.pirates.zones is empty, without touching the random
// stream), then the craft themselves (src/pirates.js).
export function stepPirates(world, dt) {
  // The opening's guided stretch holds no pirate off (SX, 2026-10-04: «не надо тихих участков»; src/opening.js openingCalm).
  stepPosts(world, dt);
  if (world.reinforcement) stepReinforcement(world);   // more of a gang just cleared (a style's `reinforce`, src/pirateStyles.js)
  world.stepEncounters(dt);
  if (world.pirates.length) flyPirates(world, dt);
}

// The rule that starts a fight without anyone asking: the ship is flying
// inside a zone, well away from every station, no fight is on, and the
// cooldown since the last one has run out. Rolled every `checkEvery` seconds
// so that a zone's `rate` reads as encounters per minute of flying in it.
export function stepEncounters(world, dt) {
  const C = CONFIG.pirates;
  if (!world.autoEncounters || !C.zones.length || world.encounter || world.boss || world.pirates.some((p) => p.mode !== 'guard')) return;
  const ship = world.ship;
  if (!ship.alive || world.docked || world.time < world.pirateReadyAt) return;
  world.pirateRollIn -= dt;
  if (world.pirateRollIn > 0) return;
  world.pirateRollIn = C.checkEvery;
  const W = world.width, H = world.height;
  const zone = C.zones.find((z) => z.sectorId === world.sector.id &&
    ship.x >= z.x0 * W && ship.x <= z.x1 * W && ship.y >= z.y0 * H && ship.y <= z.y1 * H);
  if (!zone) return;
  // A working station keeps pirates off; a ruin (src/ruins.js) keeps nobody off
  // until it is rebuilt (2026-09-30: HALCYON stood on the first route and made a
  // stretch of it quiet).
  for (const s of world.stations) {
    if (workingKind(world.ledger, s) === 'ruin') continue;
    const d = world.delta(ship.x, ship.y, s.x, s.y);
    if (Math.hypot(d.x, d.y) < C.stationClear) return;
  }
  const chance = 1 - Math.exp(-(zone.rate ?? 0.5) * C.checkEvery / 60);
  if (world.rng('pirate')() >= chance) return;
  // Before the first delivery a patrol of two (CONFIG.pirates.patrol), then a squad of the zone's sizes.
  const area = contentAreas('pirate-field', world.ledger, { sectorId: world.sector.id })
    .find(a => Math.hypot(a.x * W - ship.x, a.y * H - ship.y) <= a.radius + C.spawnDistance[1]);
  // Keep the sector's encounter rate and off-screen distance. Near the exposed approach,
  // try its bearing first; pirateGround and the ordinary angular fallback still decide.
  const calm = openingCalm(world);
  const options = { ...(area ? { angle: Math.atan2(area.y * H - ship.y, area.x * W - ship.x) } : null), reinforce: !calm };
  world.spawnPirates(calm ? C.patrol : pickGroupSize(world.rng('pirate')), options);
}

// Whether a pirate can be placed at (x, y): inside the sector, off a dead
// edge's current, clear of planets, holes and rocks, and outside every
// station's safe radius. `pad` asks for more room all round.
export function pirateGround(world, x, y, pad = 0) {
  // Inside world sector, not across a seam: what lies there is not simulated.
  if (x < 100 || y < 100 || x > world.width - 100 || y > world.height - 100) return false;
  if (world.beyondLimits(x, y, 0)) return false;
  if (world.edgeDepths(x, y).some((e) => e.depth > 0)) return false;
  if (!world.clearance(x, y, 300 + pad)) return false;
  for (const a of world.asteroids) {
    const d = world.delta(x, y, a.x, a.y);
    if (Math.hypot(d.x, d.y) < a.radius * 1.3 + CONFIG.pirates.craft.radius + 200 + pad) return false;
  }
  return !world.inSafeZone(x, y, pad);
}

// The station whose safe radius contains a point, or null. Pirates do not
// enter it and do not fire into it.
export function inSafeZone(world, x, y, pad = 0) {
  const R = CONFIG.pirates.safe.radius + pad;
  for (const s of world.stations) {
    if (workingKind(world.ledger, s) === 'ruin') continue;   // no refuge in a ruin
    if (besieged(world, s)) continue;                         // nor in a station under a raid (src/raids.js)
    const d = world.delta(x, y, s.x, s.y);
    if (Math.hypot(d.x, d.y) < R) return s;
  }
  return null;
}

// A group of `count` (1 to 5; the encounters make squads of 3 to 5, SX 2026-10-17) appears
// outside the view and comes for the ship, aimed at it: a gang, its hulls all different (as far as the four go) in its one paint
// (SX, 2026-10-15, FC4: «разные банды прилетаеют и это от 2 до 4 пиратов, и разные типы кораблей у них но в одной раскраске»;
// one kind until then), unless `types`, `mixed: false` or `paint` say otherwise. Options: `angle` (the bearing from the ship to try first),
// `distance`, `at` ({ x, y }, the centre of the group), `speed` (a share of
// top speed), `silent` (no announcement). Returns the pirates made, or an
// empty list when nowhere in the sector would do. A group joins a fight
// already on. Each has a character (src/personas.js, a squad's drawn together) unless `traits` gives them (a list,
// or null entries for none) or `personas` is false. A squad at a post (src/raids.js) comes with `places` (each one's
// { x, y, heading }), `post` (what it guards) and `passive`: circling, no fight begun, nothing announced. A raid's squad is
// bigger than a zone's (`max`) and made of every hull (`mixed`, or the hulls named in `types`) in the one paint; a ruin's guards and a
// pestering squad say `mixed: false`, one hull (src/raids.js spawnPost).
export function spawnPirates(world, count = 1, options = {}) {
  const C = CONFIG.pirates;
  const rng = world.rng('pirate');
  const ship = world.ship;
  const n = clamp(Math.floor(count) || 1, 1, options.max ?? C.maxGroup);   // a raid's squad is bigger than a zone's (`max`, src/raids.js)
  const spread = options.spread ?? C.spawnSpread;
  const distance = options.distance ?? lerp(C.spawnDistance[0], C.spawnDistance[1], rng());
  let centre = options.at || options.places?.[0] || null;
  if (!centre) {
    // Bearings round the ship, a golden turn apart from a random first one,
    // until one leads to ground that will do; then, if none does, the same at
    // a shorter distance (never inside a view).
    const first = options.angle ?? rng() * TAU;
    for (const scale of [1, 0.85, 0.7]) {
      for (let i = 0; i < 48 && !centre; i++) {
        const a = first + i * TAU * 0.381966;
        const x = ship.x + Math.cos(a) * distance * scale, y = ship.y + Math.sin(a) * distance * scale;
        if (world.pirateGround(x, y)) centre = { x, y };
      }
      if (centre) break;
    }
  }
  if (!centre) return [];
  // A gang of two or more by default; a single ship is any kind.
  const mixed = options.mixed ?? n > 1;
  const kinds = options.types || replaceRoster(mixed ? pickMixedTypes(n, rng) : pickTypes(n, rng), {
    // The lab's arena (`?pirateStyle=`, labs/graphics/game.js) meets every kind, as a pilot who has restored them all does.
    restored: world.rosterOpen ? ROSTER_OPEN : world.ledger.restored.size,
    context: options.context ?? (options.post?.kind ?? (options.mixed ? 'raid' : mixed ? 'gang' : 'ordinary')),
    rng: world.rng('pirate-roster'),
  });
  // One paint for the squad (CONFIG.pirates.paints).
  const paint = options.paint || pickPaint(rng);
  const ring = rng() * TAU;
  const squad = `squad-${world.pirateSerial + 1}`;   // named by its first ship: the lead of a kind with one (src/pirates.js)
  const traits = options.traits ?? (options.personas === false ? [] : rollSquad(n, rng));
  const styleId = options.style ?? styleIdOf(world);   // how they fight (CONFIG.pirates.styles; the lab's or the game's)
  const made = [];
  for (let i = 0; i < n; i++) {
    const type = kinds[i % kinds.length];
    const arrive = (options.speed ?? C.spawnSpeed) * { ...C.craft, ...C.types[type].craft }.maxSpeed;
    let x = centre.x, y = centre.y, heading = null;
    const place = options.places?.[i];
    if (place) { x = place.x; y = place.y; heading = place.heading ?? null; }
    else if (n > 1) {
      const a = ring + (i / n) * TAU;
      const px = centre.x + Math.cos(a) * spread * (0.6 + 0.4 * rng());
      const py = centre.y + Math.sin(a) * spread * (0.6 + 0.4 * rng());
      if (world.pirateGround(px, py)) { x = px; y = py; }
    }
    const toShip = world.delta(ship.x, ship.y, x, y);
    const p = new Pirate(`pirate-${++world.pirateSerial}`, type, x, y, heading ?? Math.atan2(toShip.y, toShip.x),
      arrive, options.side ?? (i % 2 ? -1 : 1), rng, paint, squad, i, temperTraits(styleId, type, traits[i] ?? null));
    applyPirateStyle(world, p, styleId);
    p.squadSize = n;
    if (options.post) { p.post = { ...options.post }; p.posted = options.post.kind; p.mode = 'guard'; }
    world.pirates.push(p);
    made.push(p);
  }
  attachPirateCombat(world, made, options.combatRecord);
  if (options.passive) return made;
  if (!world.encounter) world.encounter = { startedAt: world.time, size: 0, farFor: 0, safeFor: 0 };
  world.encounter.size += made.length;
  // A gang (the zones', the lab's) may be reinforced once it is cleared (a style's `reinforce`); a reinforcement never is.
  if (options.reinforce && !world.encounter.reinforce) world.encounter.reinforce = { paint, styleId };
  if (options.reinforced) world.encounter.reinforced = true;
  if (!options.silent) {
    const to = world.delta(centre.x, centre.y, ship.x, ship.y);
    world.emit('piratesEngaged', {
      count: made.length, kinds: made.map((p) => p.type), total: world.pirates.length, sectorId: world.sector.id,
      bearing: Math.atan2(to.y, to.x), distance: Math.round(Math.hypot(to.x, to.y)), ...(options.reinforced ? { reinforced: true } : null),
    });
  }
  return made;
}

// A pirate is hurt: `amount` hit points go (CONFIG.pirates.hurt). At none it is
// destroyed (killPirate). Otherwise the hit has to be seen: the pirate flashes
// (drawPirate) and sheds sparks of the kind a bumped ship sheds, from `x, y`
// (where the shot met it) back the way it came (`aim`), some of them its own
// glyphs. No health bar, no line of text: a flash and sparks. Returns the coins
// dropped if it was destroyed, else 0.
export function hurtPirate(world, p, cause, { amount = 1, x = p.x, y = p.y, aim = null } = {}) {
  p.hp -= amount;
  onNewPirateDamaged(world, p, amount);
  if (p.mode === 'guard') wakePost(world, p);       // a squad at its post wakes when one of it is hit (src/raids.js)
  if (p.hp <= 0) return world.killPirate(p, cause);
  // A style's moves (src/pirateStyles.js): a hit may send it away, to come back on a boost.
  if (p.moves && hitMoves(world, p)) cancelAttack(world, p, 'retreat');
  const B = CONFIG.asteroid.bump, F = CONFIG.pirates.flash;
  p.flash = F.time;
  const bits = Array.from({ length: F.sparks }, (_, k) => ({
    ch: B.sparks[k % B.sparks.length], color: B.colors[k % B.colors.length],
  }));
  const glyphs = p.debris();
  for (let k = 0; k < F.chips && glyphs.length; k++) {
    const g = glyphs[Math.floor(world.rng('drop')() * glyphs.length)];
    bits.push({ ch: g.ch, color: g.color, size: g.size });
  }
  const opts = { vx: p.vx * 0.3, vy: p.vy * 0.3, speed: [70, 220], life: [0.2, 0.5] };
  if (aim !== null) opts.aim = aim;
  world.particles.burst(x, y, bits, opts);
  world.emit('pirateHit', {
    pirateId: p.id, kind: p.type, cause, left: p.hp, hp: p.maxHp, x: p.x, y: p.y, sectorId: world.sector.id,
  });
  return 0;
}

// A pirate is destroyed: by the pilot's shot ('shot'), by another pirate's
// ('friendly'), by a rock, a planet's surface or a hole ('rock', 'planet',
// 'hole'), or by touching the ship ('ram'). It comes apart into its own
// glyphs and drops 10-20 loose coins. The last one down ends the fight.
export function killPirate(world, p, cause) {
  if (!world.removePirate(p, { quiet: true })) return 0;
  pirateDebris(world, p);
  const held = p.hold;
  const coins = dropPirateLoot(world, p, cause);
  const post = p.post?.stationId ?? null;
  postGone(world, p);
  noteSpecialPirate(world, p);
  const left = world.pirates.filter((q) => q.mode !== 'leave' && q.mode !== 'guard').length;
  world.emit('pirateDown', {
    pirateId: p.id, kind: p.type, cause, coins, held, left, x: p.x, y: p.y, sectorId: world.sector.id, post,
  });
  if (world.encounter && !left) world.endEncounter('cleared');
  return coins;
}

// A pirate leaves without dying: it broke off and flew away, or it went past
// the limits of the map. It is beamed out where it is (src/vanish.js; `quiet` is a pirate destroyed, which comes apart instead).
// The last one to go ends the fight.
export function removePirate(world, p, { quiet = false } = {}) {
  const i = world.pirates.indexOf(p);
  if (i < 0) return false;
  onNewPirateRemoved(world, p, quiet ? 'destroyed' : 'removed');
  world.pirates.splice(i, 1);
  if (!quiet) noteVanish(world, 'pirate', p);
  if (!quiet && world.encounter && !world.pirates.some((q) => q.mode !== 'leave' && q.mode !== 'guard')) world.endEncounter('lost');
  return true;
}

// A pirate of a post that has run (src/pirates.js pirateFlees) counts as beaten there (src/raids.js).
export function pirateGone(world, p) { postGone(world, p); noteSpecialPirate(world, p); }

// The fight is over. 'hole', 'lost' and 'cleared' take the pirates out of
// the world; 'docked', 'station' and 'wrecked' let them break off and fly
// away, which is how they are seen to give up. A quiet period follows.
// With `deferEvent` the fight is ended but not announced: the event's data is
// returned for the caller to emit when it is ready.
export function endEncounter(world, cause, { leave = false, deferEvent = false, loot = false } = {}) {
  const enc = world.encounter;
  if (!enc) return false;
  finishPirateCombat(world, cause);
  world.encounter = null;
  const left = world.pirates.filter((p) => p.mode !== 'leave' && p.mode !== 'guard').length;
  // A squad at a post (src/raids.js) goes back to circling it when the fight is over, if its post is in world sector.
  const home = (p) => p.post && (p.post.kind === 'pester' || world.stations.includes(p.post.station));
  if (leave) {
    for (const p of world.pirates) {
      if (p.mode === 'leave' || p.mode === 'guard') continue;
      p.coin = null;             // whatever it was going for is no longer its business
      // `loot`: the pilot's coins lie at the wreck, and every pirate gathers them first (src/pirates.js).
      if (loot) { p.mode = 'loot'; p.modeTimer = CONFIG.pirates.loot.seized.time; continue; }
      if (home(p)) { p.mode = 'guard'; continue; }
      p.mode = 'leave';
      p.leaveTimer = CONFIG.pirates.leave.time;
    }
  } else {
    // The rest are taken out, each beamed out where it is (src/vanish.js): the runners still flying, most of all.
    for (const p of world.pirates) if (!home(p) || p.mode === 'leave') noteVanish(world, 'pirate', p);
    world.pirates = world.pirates.filter((p) => home(p) && p.mode !== 'leave');
    for (const p of world.pirates) { p.mode = 'guard'; p.coin = null; }
  }
  world.pirateReadyAt = world.time + CONFIG.pirates.cooldown;
  // A fight won (every one down, or the rest run): the pilot's first opens the quest economy's ships to be pestered.
  if (world.pilot && (cause === 'cleared' || cause === 'routed')) world.pilot.fought = true;
  const ended = { cause, sectorId: world.sector.id, size: enc.size, left, seconds: world.time - enc.startedAt };
  // A gang cleared quickly may have more of it coming (a style's `reinforce`, src/pirateStyles.js).
  if (cause === 'cleared') scheduleReinforcement(world, enc, ended.seconds);
  if (deferEvent) return ended;
  world.emit('encounterEnded', ended);
  return true;
}

// Loose 1 CR coins where a pirate exploded: its own 10-20 and all it had picked
// up, and 2-4 coins of 5 CR, flung out like the scatter from a wallet and untouchable for a moment. A
// planet or a hole would swallow them, so those deaths drop them on the body's
// edge, fanned away from it. This is the only place coins come out of a pirate
// fight: a hit on the pilot spills nothing.
export function dropPirateLoot(world, p, cause) {
  const L = CONFIG.pirates.loot, D = CONFIG.asteroid.drops;
  const rng = world.rng('drop');
  // Its own 10-20, and every coin it picked up (they were 1 CR each).
  const count = L.coins[0] + Math.floor(rng() * (L.coins[1] - L.coins[0] + 1)) + p.hold;
  p.hold = 0;
  let x = p.x, y = p.y, away = null;
  const body = cause === 'planet' ? world.planets.find((b) => Math.hypot(p.x - b.x, p.y - b.y) < b.radius)
    : cause === 'hole' ? world.holes.find((b) => Math.hypot(p.x - b.x, p.y - b.y) < b.horizon) : null;
  if (body) {
    const d = world.delta(p.x, p.y, body.x, body.y);
    const dd = Math.hypot(d.x, d.y) || 1;
    away = Math.atan2(d.y / dd, d.x / dd);
    const rim = body.radius ? body.radius * 1.05 : body.horizon * 1.4;
    x = body.x + Math.cos(away) * rim;
    y = body.y + Math.sin(away) * rim;
  }
  // A hold of a wreck's takings (scatterSeized) is many credits: they come out as at most
  // `seized.pieces` coins, the credits shared among them, so a rich pirate is not hundreds of coins.
  const pieces = Math.min(count, L.seized.pieces);
  const each = Math.floor(count / pieces), extra = count - each * pieces;
  const turn = rng() * TAU;
  for (let i = 0; i < pieces; i++) {
    const a = away === null
      ? turn + (i / pieces) * TAU + (rng() - 0.5) * 0.6
      : away + (i / Math.max(1, pieces - 1) - 0.5) * 2.2;
    const v = L.burst[0] + rng() * (L.burst[1] - L.burst[0]);
    const carry = away === null ? D.carry : 0;
    world.drops.push({
      id: `drop-${++world.dropSerial}`, value: (each + (i < extra ? 1 : 0)) * D.value, age: 0, delay: L.delay, x, y,
      vx: p.vx * carry + Math.cos(a) * v, vy: p.vy * carry + Math.sin(a) * v,
      phase: (world.dropSerial % 7) / 7,
    });
  }
  // And its coins of 5 CR (CONFIG.pirates.loot.fives), larger, flung out the same way.
  const fives = L.fives[0] + Math.floor(rng() * (L.fives[1] - L.fives[0] + 1));
  for (let i = 0; i < fives; i++) {
    const a = away === null ? turn + ((i + 0.5) / fives) * TAU + (rng() - 0.5) * 0.6 : away + (rng() - 0.5) * 2.2;
    const v = L.burst[0] + rng() * (L.burst[1] - L.burst[0]);
    const carry = away === null ? D.carry : 0;
    world.drops.push({
      id: `drop-${++world.dropSerial}`, value: 5 * D.value, five: true, age: 0, delay: L.delay, x, y,
      vx: p.vx * carry + Math.cos(a) * v, vy: p.vy * carry + Math.sin(a) * v,
      phase: (world.dropSerial % 7) / 7,
    });
  }
  // And a few parts of its hull, each mending CONFIG.pirates.loot.parts.hull points (SX, 2026-10-01: «детали будут
  // вылетать из пиратов ... ты восстанавливаешь хп»), flung out among the coins, tumbling.
  const P = L.parts, glyphs = CONFIG.droids.part.glyphs;
  const parts = P.count[0] + Math.floor(rng() * (P.count[1] - P.count[0] + 1));
  for (let i = 0; i < parts; i++) {
    const a = away === null ? rng() * TAU : away + (rng() - 0.5) * 2.2;
    const v = L.burst[0] + rng() * (L.burst[1] - L.burst[0]);
    const carry = away === null ? D.carry : 0;
    world.drops.push({
      id: `drop-${++world.dropSerial}`, kind: 'part', value: 0, hull: P.hull, age: 0, delay: L.delay, x, y,
      vx: p.vx * carry + Math.cos(a) * v, vy: p.vy * carry + Math.sin(a) * v,
      phase: (world.dropSerial % 7) / 7, glyph: glyphs[Math.floor(rng() * glyphs.length)],
      spin: (rng() * 2 - 1) * CONFIG.droids.part.spin,
    });
  }
  return count + 5 * fives;
}

// What pirates took from a wreck, as loose coins round it for them to gather: at most `pieces` coins
// (CONFIG.pirates.loot.seized), the amount shared out among them in whole credits, untouchable for a
// moment like any coins flung out. A pirate takes a coin's whole value into its hold, so a pirate shot
// down later gives it back (dropPirateLoot).
export function scatterSeized(world, x, y, amount) {
  const S = CONFIG.pirates.loot.seized, rng = world.rng('drop');
  const count = Math.max(1, Math.min(amount, S.pieces));
  const each = Math.floor(amount / count), extra = amount - each * count;
  const turn = rng() * TAU;
  for (let i = 0; i < count; i++) {
    const a = turn + (i / count) * TAU + (rng() - 0.5) * 0.6;
    const v = S.burst[0] + rng() * (S.burst[1] - S.burst[0]);
    world.drops.push({
      id: `drop-${++world.dropSerial}`, value: each + (i < extra ? 1 : 0), age: 0, delay: CONFIG.pirates.loot.delay,
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, phase: (world.dropSerial % 7) / 7,
    });
  }
  return count;
}

// Where the cargo pirates take comes to rest: their den, about
// CONFIG.pirates.den.distance u from the wreck and as far from any station as
// the sector allows. One place decides it, so what "taken" means can change
// without touching the wreck flow. Candidate points are ringed round the
// wreck; each is made a legal resting point (restingPoint), then scored on
// its distance from stations against how far it is from the distance asked.
export function pirateDen(world, from) {
  const D = CONFIG.pirates.den;
  const first = world.rng('pirate')() * TAU;
  let best = null;
  for (let i = 0; i < D.tries; i++) {
    const a = first + (i / D.tries) * TAU;
    const at = world.restingPoint(from.x + Math.cos(a) * D.distance, from.y + Math.sin(a) * D.distance);
    let clear = D.stationClear;
    for (const s of world.stations) {
      const d = world.delta(at.x, at.y, s.x, s.y);
      clear = Math.min(clear, Math.hypot(d.x, d.y));
    }
    const apart = Math.hypot(at.x - from.x, at.y - from.y);
    const score = clear / D.stationClear - D.shortfall * Math.abs(apart - D.distance) / D.distance;
    if (!best || score > best.score) best = { at, score };
  }
  return best.at;
}

// A pirate's shot stopped by a rock: a few sparks, nothing else.
export function absorbShot(world, b) {
  const color = CONFIG.pirates.bullet.color;
  world.particles.burst(b.x, b.y, ['·', '*', '·'].map((ch) => ({ ch, color })), {
    vx: b.vx * 0.05, vy: b.vy * 0.05, speed: [40, 120], life: [0.15, 0.4],
  });
}

// What pirates do to whoever is in reach: shots that meet a pirate or the
// ship, and pirates that touch the ship. A pirate's shot hurts any other
// pirate it meets, never its own shooter; the pilot's shot hurts any it meets
// (a hit point each, CONFIG.pirates.hurt). A shot that reaches the ship is
// spent even when the hit does not count (grace, invulnerability). Called from
// resolveHits, after rocks have had their say about the shots.
export function resolvePirateHits(world) {
  if (!world.pirates.length && !world.bullets.some((b) => b.owner === 'pirate')) return;
  const ship = world.ship;
  const C = CONFIG.pirates;
  const reach = C.weapon.bulletRadius;

  for (let bi = world.bullets.length - 1; bi >= 0; bi--) {
    const b = world.bullets[bi];
    const theirs = b.owner === 'pirate';
    let hit = null;
    for (const p of world.pirates) {
      if (theirs && b.by === p.id) continue;
      const d = world.delta(b.x, b.y, p.x, p.y);
      if (Math.hypot(d.x, d.y) < p.radius + reach) { hit = p; break; }
    }
    if (hit) {
      world.bullets.splice(bi, 1);
      world.hurtPirate(hit, theirs ? 'friendly' : 'shot', {
        amount: theirs ? (b.onPirates ?? C.hurt.friendly) : (b.damage ?? C.hurt.shot), x: b.x, y: b.y,
        aim: Math.atan2(-(b.vy - hit.vy), -(b.vx - hit.vx)),
      });
      continue;
    }
    // A hull up in a jump (src/trick.js) is passed under.
    if (!theirs || !ship.alive || world.docked || ship.airborne) continue;
    const d = world.delta(b.x, b.y, ship.x, ship.y);
    if (Math.hypot(d.x, d.y) >= ship.radius + reach) continue;
    world.bullets.splice(bi, 1);
    // The price of a hit, and only when it counted: a hull point. No coins
    // leave the wallet (SX, 2026-09-29: coins come out of a pirate ship that
    // explodes, and there only); a hit that wrecks takes every credit instead.
    world.damageShip(b.damage ?? C.weapon.damage, 'pirate', { by: b.kind, pirateId: b.by, at: b });
  }

  // Touching the ship costs each what a rock at that closing speed would cost the
  // ship (a touch below the touch speed costs the pirate one hit point and the
  // ship nothing): the pirate is destroyed only if that empties it. One that
  // survives is knocked back, as the ship is by a rock, and cannot be rammed
  // again for a moment.
  if (!ship.alive || world.docked || ship.airborne) return;
  for (let pi = world.pirates.length - 1; pi >= 0; pi--) {
    const p = world.pirates[pi];
    if (!p || p.ramGrace > 0) continue;
    const d = world.delta(ship.x, ship.y, p.x, p.y);
    const dist = Math.hypot(d.x, d.y);
    if (dist > ship.radius + p.radius) continue;
    const nx = dist > 1e-6 ? d.x / dist : 1, ny = dist > 1e-6 ? d.y / dist : 0;
    // A hull that has just come down on it from a jump (src/trick.js landedNow) strikes with all the speed it has on it, and the ship
    // pays `landing.mult` times the light price (CONFIG.hull.landing; SX, 2026-10-08).
    const landed = landedNow(world);
    const closing = Math.max(0, landed ? Math.hypot(ship.vx - p.vx, ship.vy - p.vy) : -((ship.vx - p.vx) * nx + (ship.vy - p.vy) * ny));
    // The ship pays a light thing's price (CONFIG.hull.light: 2 to 5 points; SX, 2026-10-01: «Если ты врезался ... в
    // пирата ... совсем чуть-чуть»), the pirate a blow on its own scale (pirateImpact), unless the kind has its own
    // (`ram.ship` and `ram.self`, the MAW's, whose ram is its weapon) for a contact at the touch speed or more; a
    // slower touch costs a hard nose nothing.
    const blow = world.pirateImpact(closing), R = p.R;
    const damage = blow > 0 && R.ship != null ? R.ship : world.impactDamage(closing, 'pirate', landed);
    const taken = R.self != null ? (blow > 0 ? R.self : 0) : Math.max(C.hurt.ramMin, blow);
    // What a ram costs the hull knocks parts off it as any blow does (src/debris.js chipHull; SX, 2026-10-01: «Просто покажи искры
    // ... деталь цвета нашего корабля отлетает»): from the side the pirate met, along its way.
    world.damageShip(damage, 'pirate', { by: p.type, ram: true, pirateId: p.id, ...(landed ? { landed } : null),
      at: { x: ship.x - nx * ship.radius, y: ship.y - ny * ship.radius, vx: p.vx, vy: p.vy } });
    if (taken > 0) world.hurtPirate(p, 'ram', {
      amount: taken,
      x: p.x + nx * p.radius, y: p.y + ny * p.radius, aim: Math.atan2(-ny, -nx),
    });
    if (world.pirates.includes(p)) {
      const back = closing * (1 + R.restitution);
      p.vx -= nx * back; p.vy -= ny * back;
      p.x = ship.x - nx * (ship.radius + p.radius + 1);
      p.y = ship.y - ny * (ship.radius + p.radius + 1);
      p.ramGrace = R.grace;
    }
    if (!ship.alive) return;
  }
}
