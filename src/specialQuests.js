import { CONFIG } from './config.js';
import { SECTORS, sectorById, stationDefById, networkStationIds, SECTOR_SIZE, planetKey } from './sectors.js';
import { reachableStationIds, isRestored, ruinIdsOf } from './ruins.js';
import { sectorOpen } from './frontier.js';
import { clearSpot, questSectors, pickOf } from './spots.js';
import { makeTrain, stepTrain, drawTrain } from './train.js';
import { goneCells, brokenShare, specialModel } from './specialShips.js';
import { layTrails, snacksOf, trailWay, drawSnack, snackSpin, snackBits, pipesOf, stepSmoke, drawSmoke } from './scoobySnacks.js';
import { lerp, clamp } from './util.js';
import { QUEST_LINES as QL } from './questLines.js';
import { clipper, readClipperPlan } from './clipper.js';

// The reference ships' quests (the six of QUESTS_V2_HANDOFF.md, round three, the MYSTERY MACHINE's of 2026-10-21, below, and CLIPPER's of
// 2026-10-22, src/clipper.js; SX, 2026-10-02, each in his words: «Это с Марти
// Макфлаем скорее на скорость надо долететь. Если со спайком, то победить где-то большое количество пиратов. На
// планет-экспресс ... паровозик грузов из трех грузов ... по трем разным станциям. Корабль Хана Соло точно битва в
// космосе с пиратами. У какой-нибудь разбитой станции. Сиренити ... долететь до какой-то станции через два сектора ...
// у тебя таймер. И у нее падает ХП. X-Wing в течение двух минут сорока секунд убегать от пиратов ... они постоянно
// спавнятся, за ним гоняются»). src/specials.js meets the ships, lends them and gives the rewards; what happens between
// the boarding and the end is here, one handler to a ship:
//
//   plan(world, site)        what the quest would be, from where the ship stands (site, in the pilot's sector's units),
//                            or null when nothing fits (then that ship is not met there)
//   start(world, s)          the quest begins (the pilot has boarded): its runtime state `s.q`
//   step(world, s, dt, end)  every step while it lasts; `end.win(world)` and `end.lose(world, why)` finish it, `end.road(world, i)`
//                            has its crew say the `i`-th exchange of its way (src/specialShips.js `words.road`), once, at its moment
//   words(world, s)          its plate and pointer: title, sub, pointer word, `ends` (a clock), target; `win` the
//                            plate's line when it is done, `lose` its two lines when it is late
//   candidates / stationActions / draw / loadTop   a menu of its own, a station's row, a drawing, a weight (the train)
//
// A target is a station or a planet (`dest`) or a plain point (`ground`): positions as fractions of a sector, the way the
// catalogue has them, so a place in a sector the pilot is not in can be pointed to.

const C = () => CONFIG.quests.special;
const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
const SPECIAL_MARK = 'special-place';

const gOf = (sectorId, fx, fy) => { const s = sectorById(sectorId); return { x: s.col * W + fx * W, y: s.row * H + fy * H }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sum = (list) => list.reduce((n, x) => n + x, 0);
const here = (world, site) => gOf(site.sectorId, site.x / W, site.y / H);
// Whether a place may be a quest's: on the grid and open to the pilot (the frontier, src/frontier.js, 2026-10-02: nothing sends
// the pilot past a closed border). questSectors (src/spots.js) keeps to open ones by itself.
const openTo = (world, sectorId) => { const s = sectorById(sectorId); return !!s && !s.hidden && sectorOpen(world.ledger, s); };

// ---- places ------------------------------------------------------------------------------------------------------------

const stationDest = (def, reach = CONFIG.station.interactRadius * 0.9) => ({ kind: 'station', id: def.id, sectorId: def.sectorId, fx: def.x, fy: def.y, name: def.label, reach });
const planetDest = (sector, pl) => ({ kind: 'planet', id: `planet:${planetKey(pl)}`, sectorId: sector.id, fx: pl.x, fy: pl.y, name: pl.label, radius: pl.radius, reach: pl.radius * 1.045 + 420 });
const pointDest = (sectorId, spot, reach, name) => ({ kind: 'point', id: SPECIAL_MARK, sectorId, fx: spot.x, fy: spot.y, name, reach });

// Where a place is in its sector now, in the sector's units: a station as it drifts, else the catalogue's.
function posOf(world, dest) {
  if (dest.kind === 'station') {
    const st = world.sector.id === dest.sectorId ? world.stations.find((s) => s.id === dest.id) : null;
    if (st) return { x: st.x, y: st.y };
  }
  return { x: dest.fx * W, y: dest.fy * H };
}
// Whether the ship is there: in the place's sector, within its reach.
export function atDest(world, dest) {
  if (world.sector.id !== dest.sectorId) return false;
  const p = posOf(world, dest);
  return Math.hypot(p.x - world.ship.x, p.y - world.ship.y) <= dest.reach;
}
// A pointer's target for the quest list (src/navigation.js questNavigation): a station by its id, anything else by place.
const target = (dest) => ({ sectorId: dest.sectorId, x: dest.fx, y: dest.fy, mark: dest.kind === 'station' ? dest.id : SPECIAL_MARK, reach: dest.reach });

// A plan read back from a save (src/questSave.js; PLAN C1, 2026-10-03): the ship that stands waiting comes back with the same place
// to go to. A save is untrusted input, so a plan is rebuilt from the catalogue and only its choices are taken: the places by their
// ids (a station, a planet of a sector, a point inside one), the times; the waves and the crates are the config's. A place the
// catalogue no longer has, or that lies past a closed border, or a place the falcon's battle cannot be now (falconSite), is no plan: null.
function readDest(world, d, kinds) {
  if (!d || typeof d !== 'object' || !kinds.includes(d.kind) || !openTo(world, d.sectorId)) return null;
  const sector = sectorById(d.sectorId);
  const reach = Number.isFinite(d.reach) ? clamp(d.reach, 50, 4000) : undefined;
  if (d.kind === 'station') {
    const def = stationDefById(d.id);
    return def && def.sectorId === sector.id ? stationDest(def, reach) : null;
  }
  if (d.kind === 'planet') {
    const pl = (sector.planets ?? []).find((p) => p.label && `planet:${planetKey(p)}` === d.id);
    return pl ? planetDest(sector, pl) : null;
  }
  if (!Number.isFinite(d.fx) || !Number.isFinite(d.fy)) return null;
  return pointDest(sector.id, { x: clamp(d.fx, 0, 1), y: clamp(d.fy, 0, 1) }, reach ?? C().swordfish.arrive, sector.label);
}
export function readPlan(world, id, raw) {
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(HANDLERS, id)) return null;
  const c = C()[id];
  const seconds = Number.isFinite(raw.time) ? clamp(Math.round(raw.time), 1, 3600) : null;
  const distance = Number.isFinite(raw.distance) ? clamp(Math.round(raw.distance), 0, 100000) : 0;
  switch (id) {
    case 'delorean': case 'serenity': case 'xwing': {
      const dest = readDest(world, raw.dest, id === 'xwing' ? ['station', 'planet'] : ['station']);
      return dest && seconds ? { dest, distance, time: seconds } : null;
    }
    case 'falcon': {
      const dest = readDest(world, raw.dest, ['station']), def = dest && stationDefById(dest.id);
      return falconSite(world, def) ? { dest, waves: c.waves.slice(), total: sum(c.waves) } : null;
    }
    case 'swordfish': {
      const ground = readDest(world, raw.ground, ['point']);
      return ground ? { ground, waves: c.waves.slice(), total: sum(c.waves) } : null;
    }
    case 'scooby': {
      // The trails by their points (fractions of the sector, a little past its sides where a walk went on), their snacks worked out again.
      const sector = sectorById(raw.sectorId), point = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v) && v > -1 && v < 2);
      if (!sector || !openTo(world, sector.id) || !seconds || !Array.isArray(raw.trails) || raw.trails.length !== c.trails) return null;
      if (!raw.trails.every((t) => Array.isArray(t) && t.length === c.legs + 1 && t.every(point))) return null;
      const trails = raw.trails.map((t) => t.map(([x, y]) => [x, y])), total = snacksOf(trails, W, H).length;
      return total >= c.need ? { sectorId: sector.id, trails, total, need: c.need, distance, time: seconds } : null;
    }
    case 'clipper': return readClipperPlan(world, raw, openTo);
    case 'express': {
      const planet = readDest(world, raw.planet, ['planet']);
      const stops = Array.isArray(raw.stops) ? raw.stops.map((d) => readDest(world, d, ['station'])) : [];
      return planet && stops.length === c.cars && stops.every(Boolean) ? { planet, stops, cars: c.cars } : null;
    }
    default: return null;
  }
}

// ---- pirates a quest makes -----------------------------------------------------------------------------------------------

// The pirates a quest sent (tagged, src/world.js spawn): those flying and not running.
const flying = (world) => world.pirates.filter((p) => p.tag === 'special' && p.mode !== 'leave');
function send(world, count, options) {
  const made = world.spawnPirates(count, options);
  for (const p of made) p.tag = 'special';
  return made.length;
}

// A quest of waves: `total` pirates to beat in all, sent in batches (`batches`), the next once no more than `overlap` of
// the last are flying and `pause` s have gone. A pirate that vanished unbeaten (the pilot outran them, left the sector) is
// owed again; one that ran counts as beaten (World.pirateGone). `where(world)` gives spawn options.
function waves(world, s, { total, overlap, pause, options = () => ({}) }, end) {
  const q = s.q, alive = flying(world).length;
  if (alive > 0) q.hadAlive = true;
  else if (q.hadAlive) { q.hadAlive = false; q.nextAt = world.time + pause; }
  if (q.down >= total) return end.win(world);
  const pool = Math.max(0, total - q.down - alive);
  if (!pool || alive > overlap || world.time < q.nextAt || !world.autoEncounters || !world.ship.alive) return;
  const count = Math.min(pool, q.batches[0] ?? pool);
  if (send(world, count, options(world))) {
    q.batches.shift(); q.nextAt = world.time + pause;
    // The crew's word at the first batch and at the next (its `road`, each once).
    q.sent = (q.sent ?? 0) + 1;
    if (q.sent <= 2) end.road(world, q.sent - 1);
  }
}

const batchesOf = (plan) => plan.waves.slice();

// ---- the handlers --------------------------------------------------------------------------------------------------------

const delorean = {
  plan(world, site) {
    const c = C().delorean, from = here(world, site);
    const pool = networkStationIds().map((id) => stationDefById(id)).filter((d) => d && openTo(world, d.sectorId))
      .map((d) => ({ d, len: dist(from, gOf(d.sectorId, d.x, d.y)) })).filter((e) => e.len >= c.minLeg && e.len <= c.maxLeg);
    if (!pool.length) return null;
    const pick = pickOf(pool, world.rng('quest'));
    return { dest: stationDest(pick.d), distance: Math.round(pick.len), time: Math.round(pick.len / c.speed + c.slack) };
  },
  start(world, s) { s.q = { ends: world.ledger.clock + s.plan.time }; },
  step(world, s, dt, end) {
    if (atDest(world, s.plan.dest)) end.win(world);
    else if (world.ledger.clock >= s.q.ends) end.lose(world, 'TIME');
    // Doc on the radio once `road` of the clock has gone.
    else if (world.ledger.clock >= s.q.ends - s.plan.time * (1 - C().delorean.road)) end.road(world, 0);
  },
  words(world, s) {
    const d = s.plan.dest;
    return { title: QL.special.race(d.name), sub: QL.special.raceSub(), pointer: 'RACE', ends: s.q.ends, time: s.plan.time,
      target: target(d), win: QL.special.reached(d.name), lose: [QL.special.runFailed(), QL.special.missed()] };
  },
};

const swordfish = {
  plan(world, site) {
    const c = C().swordfish, rng = world.rng('quest');
    // A clear place in this sector or the next, the first of them in a drawn order that has one.
    const sectors = questSectors(world.sector, world.ledger).slice();
    for (let i = sectors.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [sectors[i], sectors[j]] = [sectors[j], sectors[i]]; }
    if (site.near) sectors.sort((a, b) => (a.id === world.sector.id ? -1 : 0) - (b.id === world.sector.id ? -1 : 0));
    const avoid = world.questPlaces();
    for (const sector of sectors) {
      const away = sector.id === site.sectorId ? { x: site.x, y: site.y, by: C().apart } : null;
      const spot = clearSpot(sector.id, rng, { clear: 800, edge: 0.2, away, avoid });
      if (spot) return { ground: pointDest(sector.id, spot, c.arrive, sector.label), waves: c.waves.slice(), total: sum(c.waves) };
    }
    return null;
  },
  start(world, s) { s.q = { stage: 'go', down: 0, batches: batchesOf(s.plan), nextAt: 0, hadAlive: false }; },
  step(world, s, dt, end) {
    const q = s.q, g = s.plan.ground;
    if (q.stage === 'go') {
      if (atDest(world, g)) { q.stage = 'fight'; q.nextAt = world.time + 1.5; }
      return;
    }
    if (world.sector.id !== g.sectorId) { q.hadAlive = false; return; }
    waves(world, s, { total: s.plan.total, overlap: 0, pause: C().swordfish.pause }, end);
  },
  words(world, s) {
    const g = s.plan.ground, q = s.q;
    return { title: QL.special.bounty(g.name), sub: q.stage === 'go' ? QL.special.outlaws(g.name, s.plan.total) : QL.special.down(q.down, s.plan.total),
      pointer: 'BOUNTY', target: target(g), win: QL.special.bountyDone(), lose: [QL.special.failed(), QL.special.escaped()] };
  },
};

// Where the falcon's battle can be: a ruin not yet restored, in this sector or one beside it; once every ruin is restored, a working
// station there (not broken) that pirates now hold instead (Codex's economy study, 2026-10-03: «completed network cannot block
// Falcon»; until 2026-10-04 a pilot with all eight restored never met it, and the X-WING after it never came).
function falconSite(world, def) {
  if (!def || def.kind === 'home') return false;
  if (def.kind === 'ruin' && !isRestored(world.ledger, def)) return true;
  return ruinIdsOf(world.ledger).every((id) => world.ledger.restored.has(id)) && isRestored(world.ledger, def) && !world.ledger.broken.has(def.id);
}
const falcon = {
  plan(world, site) {
    const c = C().falcon, near = new Set(questSectors(world.sector, world.ledger).map((x) => x.id));
    const ruins = networkStationIds().map((id) => stationDefById(id, world.ledger))
      .filter((d) => d && near.has(d.sectorId) && falconSite(world, d));
    if (!ruins.length) return null;
    const own = site.near ? ruins.filter((d) => d.sectorId === world.sector.id) : [];
    const pick = pickOf(own.length ? own : ruins, world.rng('quest'));
    return { dest: stationDest(pick, c.arrive), waves: c.waves.slice(), total: sum(c.waves) };
  },
  start(world, s) { s.q = { stage: 'go', down: 0, batches: batchesOf(s.plan), nextAt: 0, hadAlive: false }; },
  step(world, s, dt, end) {
    const q = s.q, d = s.plan.dest;
    if (q.stage === 'go') {
      if (atDest(world, d)) { q.stage = 'fight'; q.nextAt = world.time + 1.5; }
      return;
    }
    if (world.sector.id !== d.sectorId) { q.hadAlive = false; return; }
    // The pirates come in from out of sight, round the ruin, and make for the ship.
    waves(world, s, { total: s.plan.total, overlap: C().falcon.overlap, pause: 4, options: (w) => {
      const p = posOf(w, d), first = w.rng('pirate')() * Math.PI * 2;
      // The bearing from the ruin, at the ring's distance or nearer, that is open ground inside the sector; else any (the
      // squad is made where the world finds room).
      for (const k of [1, 0.8, 0.6]) {
        for (let i = 0; i < 16; i++) {
          const a = first + (i / 16) * Math.PI * 2, x = p.x + Math.cos(a) * C().falcon.ring * k, y = p.y + Math.sin(a) * C().falcon.ring * k;
          if (w.pirateGround(x, y, 100)) return { at: { x, y } };
        }
      }
      return {};
    } }, end);
  },
  words(world, s) {
    const d = s.plan.dest, q = s.q;
    return { title: QL.special.battle(d.name), sub: q.stage === 'go' ? QL.special.battleSub() : QL.special.down(q.down, s.plan.total),
      pointer: 'BATTLE', target: target(d), win: QL.special.clear(d.name), lose: [QL.special.failed(), QL.special.stillThere()] };
  },
};

const express = {
  plan(world, site) {
    const c = C().express, ledger = world.ledger;
    const stations = reachableStationIds(ledger).filter((id) => !ledger.broken.has(id)).map((id) => stationDefById(id));
    const planets = questSectors(world.sector, world.ledger).flatMap((sector) => (sector.planets ?? []).filter((p) => p.label).map((p) => ({ sector, p })));
    // A planet with `cars` stations between the legs' limits of it, taken nearest first.
    const options = planets.map(({ sector, p }) => {
      const at = gOf(sector.id, p.x, p.y);
      const stops = stations.map((d) => ({ d, len: dist(at, gOf(d.sectorId, d.x, d.y)) })).filter((e) => e.len >= c.minLeg && e.len <= c.maxLeg)
        .sort((a, b) => a.len - b.len);
      return { sector, p, stops };
    }).filter((o) => o.stops.length >= c.cars);
    if (!options.length) return null;
    // (the lab asks for what is in view: a planet of this sector, if there is one)
    const own = site.near ? options.filter((x) => x.sector.id === world.sector.id) : [];
    const o = pickOf(own.length ? own : options, world.rng('quest'));
    // Which three: drawn from those in reach, then in the order of a short way from the planet.
    const rest = o.stops.slice(), chosen = [];
    while (chosen.length < c.cars) chosen.push(rest.splice(Math.min(rest.length - 1, Math.floor(world.rng('quest')() * rest.length)), 1)[0].d);
    const way = [];
    let at = gOf(o.sector.id, o.p.x, o.p.y);
    while (chosen.length) {
      chosen.sort((a, b) => dist(at, gOf(a.sectorId, a.x, a.y)) - dist(at, gOf(b.sectorId, b.x, b.y)));
      const next = chosen.shift();
      way.push(stationDest(next));
      at = gOf(next.sectorId, next.x, next.y);
    }
    return { planet: planetDest(o.sector, o.p), stops: way, cars: c.cars };
  },
  start(world, s) { s.q = { stage: 'load', cars: [], delivered: 0 }; s.loadTop = 1; },
  step(world, s, dt, end) {
    const q = s.q;
    if (q.stage === 'deliver') stepTrain(world, q.cars, dt);
    s.loadTop = q.cars.length ? C().express.loadTop : 1;
    // The crew's word once loaded, and at the first stop (where there is a next).
    if (q.stage === 'deliver') end.road(world, 0);
    if (q.delivered === 1 && s.plan.cars > 1) end.road(world, 1);
  },
  // The planet's menu, on its limb, while the train waits to be loaded.
  candidates(world, s) {
    const q = s.q, pl = s.plan.planet;
    if (q.stage !== 'load' || world.sector.id !== pl.sectorId || !world.ship.alive) return [];
    const planet = world.planets.find((p) => `planet:${planetKey(p)}` === pl.id);
    if (!planet) return [];
    const d = world.delta(world.ship.x, world.ship.y, planet.x, planet.y), m = Math.hypot(d.x, d.y) || 1;
    return [{
      id: 'special-load', title: `${pl.name} / CARGO`, subtitle: `${s.plan.cars} CRATES TO LOAD`,
      x: planet.x + (d.x / m) * planet.rim, y: planet.y + (d.y / m) * planet.rim, interactRadius: CONFIG.quests.errand.reach,
      art: { model: { width: 6, height: 3 }, scale: 1 },
      actions: [{ label: 'LOAD CARGO', run: () => { q.cars = makeTrain(world, s.plan.cars); q.stage = 'deliver'; world.selectedId = null;
        world.emit('specialStage', { id: 'express', stage: 'loaded', x: world.ship.x, y: world.ship.y, sectorId: world.sector.id }); } }],
    }];
  },
  // The stop's row at its station: the rear crate comes off.
  stationActions(world, s, station) {
    const q = s.q, stop = s.plan.stops[q.delivered];
    if (q.stage !== 'deliver' || !stop || stop.id !== station.id) return [];
    return [{ label: `UNLOAD CRATE ${q.delivered + 1} OF ${s.plan.cars}`, run: () => {
      const car = q.cars.pop();
      q.delivered += 1;
      if (car) world.particles.burst(car.x, car.y, ['·', '+', '·', '*'].map((ch) => ({ ch, color: CONFIG.cargo.color })), { speed: [40, 140], life: [0.3, 0.8] });
      world.emit('specialStage', { id: 'express', stage: 'unloaded', left: q.cars.length, x: world.ship.x, y: world.ship.y, sectorId: world.sector.id });
    } }];
  },
  // Done once the last crate is off (checked each step so the plate turns at once).
  done: (world, s) => s.q.stage === 'deliver' && s.q.delivered >= s.plan.cars,
  draw(world, s, r, t) { if (s.q.stage === 'deliver') drawTrain(world, r, s.q.cars, t); },
  words(world, s) {
    const q = s.q, p = s.plan;
    if (q.stage === 'load') {
      return { title: QL.special.load(p.cars), sub: QL.special.loadSub(p.planet.name), pointer: 'LOAD', target: target(p.planet),
        win: QL.special.delivered(), lose: [QL.special.failed(), QL.special.deliveryFailed()] };
    }
    const next = p.stops[Math.min(q.delivered, p.stops.length - 1)];
    return { title: QL.special.tow(q.cars.length), sub: QL.special.towSub(q.delivered, p.cars, next.name), pointer: 'CRATES', target: target(next),
      win: QL.special.delivered(), lose: [QL.special.failed(), QL.special.deliveryFailed()] };
  },
};

const serenity = {
  plan(world, site) {
    const c = C().serenity, from = sectorById(site.sectorId), at = here(world, site);
    const pool = networkStationIds().map((id) => stationDefById(id)).filter((d) => {
      const s = d && sectorById(d.sectorId);
      return s && openTo(world, s.id) && Math.max(Math.abs(s.col - from.col), Math.abs(s.row - from.row)) === 2;
    }).map((d) => ({ d, len: dist(at, gOf(d.sectorId, d.x, d.y)) }));
    if (!pool.length) return null;
    const pick = pickOf(pool, world.rng('quest'));
    return { dest: stationDest(pick.d), distance: Math.round(pick.len), time: Math.round(pick.len / c.speed + c.slack) };
  },
  start(world, s) { s.q = { ends: world.ledger.clock + s.plan.time, rate: (world.hullMax * (1 - C().serenity.hullEnd)) / s.plan.time, sparkIn: 0 }; },
  step(world, s, dt, end) {
    const q = s.q, ship = world.ship;
    if (!ship.alive) return;
    if (!world.docked) world.hull = Math.max(0, world.hull - q.rate * dt);
    if (world.hull <= 0) { world.wreckShip('special'); return; }
    // The hull going, the drawing goes with it (src/specialShips.js), sparking where cells have gone.
    const share = brokenShare(world.hull / world.hullMax);
    q.sparkIn -= dt;
    if (share > 0 && q.sparkIn <= 0) {
      q.sparkIn = lerp(0.6, 0.15, Math.min(1, share / 0.5));
      const cells = goneCells(specialModel('serenity'), share);
      if (cells.length) {
        const c = cells[Math.floor(world.rng('drop')() * cells.length)], m = ship.metrics ?? { w: 9, h: 15 }, a = ship.facing;
        const lx = c.x * m.w, ly = c.y * m.h, B = CONFIG.asteroid.bump;
        const bits = Array.from({ length: 3 }, (_, k) => ({ ch: B.sparks[k % B.sparks.length], color: B.colors[k % B.colors.length] }));
        world.particles.burst(ship.x + lx * Math.cos(a) - ly * Math.sin(a), ship.y + lx * Math.sin(a) + ly * Math.cos(a), bits,
          { vx: ship.vx * 0.6, vy: ship.vy * 0.6, speed: [30, 110], life: [0.15, 0.45] });
      }
    }
    if (atDest(world, s.plan.dest)) end.win(world);
    else if (world.ledger.clock >= q.ends) end.lose(world, 'TIME');
    // Kaylee and Mal once the hull is down to `road` of it, the plating seen going.
    else if (world.hull <= world.hullMax * C().serenity.road) end.road(world, 0);
  },
  words(world, s) {
    const d = s.plan.dest;
    return { title: QL.special.serenity(d.name), sub: QL.special.hull(), pointer: 'SERENITY', ends: s.q.ends, time: s.plan.time,
      target: target(d), win: QL.special.arrived(), lose: [QL.special.failed(), QL.special.deliveryFailed()] };
  },
};

const xwing = {
  plan(world, site) {
    const c = C().xwing, from = here(world, site), rng = world.rng('quest');
    const places = [];
    for (const sector of SECTORS.filter((x) => openTo(world, x.id))) {
      for (const id of networkStationIds()) { const d = stationDefById(id); if (d.sectorId === sector.id) places.push({ dest: stationDest(d), at: gOf(d.sectorId, d.x, d.y) }); }
      for (const p of sector.planets ?? []) if (p.label) places.push({ dest: planetDest(sector, p), at: gOf(sector.id, p.x, p.y) });
    }
    // Away up and to the right: the right and the upper (the grid's lower left to its upper right), the furthest first.
    const pool = places.map((e) => ({ ...e, dx: e.at.x - from.x, dy: e.at.y - from.y, len: dist(from, e.at) }))
      .filter((e) => e.dx > 0 && e.dy < 0 && e.len >= c.minLeg && e.len <= c.maxLeg)
      .sort((a, b) => (b.dx - b.dy) - (a.dx - a.dy)).slice(0, 3);
    if (!pool.length) return null;
    const pick = pickOf(pool, rng);
    return { dest: pick.dest, distance: Math.round(pick.len), time: c.time };
  },
  start(world, s) { s.q = { ends: world.ledger.clock + s.plan.time, nextAt: world.time + 4, from: world.time }; },
  step(world, s, dt, end) {
    const q = s.q, c = C().xwing;
    if (atDest(world, s.plan.dest)) return end.win(world);
    if (world.ledger.clock >= q.ends) return end.lose(world, 'TIME');
    // Red Five on the radio `road` s into the run, and again at the first squad that comes.
    if (world.time >= q.from + c.road) end.road(world, 0);
    // Pirates keep coming, a squad at a time, while fewer than `cap` are on.
    if (world.autoEncounters && world.ship.alive && world.time >= q.nextAt) {
      q.nextAt = world.time + lerp(c.spawnEvery[0], c.spawnEvery[1], world.rng('pirate')());
      if (flying(world).length + c.squad <= c.cap && send(world, c.squad, {})) end.road(world, 1);
    }
  },
  words(world, s) {
    const d = s.plan.dest;
    return { title: QL.special.run(d.name), sub: QL.special.tail(), pointer: 'RUN', ends: s.q.ends, time: s.plan.time,
      target: target(d), win: QL.special.shaken(), lose: [QL.special.runFailed(), QL.special.missed()] };
  },
};
// The MYSTERY MACHINE (SX, 2026-10-21: «Ты садишься в тачку. И появляются ... скуби-снеки. И появляется счетчик, сколько ты собрал. И квест
// надо собрать какое-то определенное количество»; «давай надо собрать 75 минимум из 100»; «Таймер на весь квест»): Scooby snacks laid
// as trails in the sector where it stands (src/scoobySnacks.js), `need` of them taken before the clock; the count in its title (the plate's
// and the helmet's notch's), a +1 where each is taken, its crunch (src/audio.js), the smoke out of its pipes while it moves.
const scooby = {
  plan(world, site) {
    const c = C().scooby, trails = layTrails(world, site, world.rng('quest'));
    if (!trails) return null;
    const way = Math.round(trailWay(site, snacksOf(trails, W, H), c.need));
    return { sectorId: site.sectorId, trails, total: c.trails * c.per, need: c.need, distance: way, time: Math.round(way / c.speed + c.slack) };
  },
  start(world, s) {
    s.q = { ends: world.ledger.clock + s.plan.time, snacks: snacksOf(s.plan.trails, W, H), taken: 0, smoke: { puffs: [], due: 0, n: 0, sectorId: null } };
  },
  step(world, s, dt, end) {
    const c = C().scooby, q = s.q, ship = world.ship;
    // The smoke, in the sector's own units: puffs of a sector left behind are dropped.
    if (q.smoke.sectorId !== world.sector.id) { q.smoke.puffs = []; q.smoke.sectorId = world.sector.id; }
    const scale = ship.model?.scale ?? 1;
    stepSmoke(q.smoke, ship, pipesOf(ship.model), ship.metrics ?? { w: 9 * scale, h: 15 * scale }, dt);
    // Taken by touching, as a coin is (src/pickups.js), and passed over in a jump.
    if (world.sector.id === s.plan.sectorId && ship.alive && !ship.airborne) {
      const reach = CONFIG.pickup.collectRadius + ship.radius + c.nose;
      for (const p of q.snacks) {
        if (p.taken) continue;
        const d = world.delta(ship.x, ship.y, p.x, p.y);
        if (Math.hypot(d.x, d.y) > reach) continue;
        p.taken = true;
        q.taken += 1;
        world.particles.burst(p.x, p.y, snackBits(), { vx: ship.vx * 0.5, vy: ship.vy * 0.5, speed: [40, 150], life: [0.25, 0.6] });
        world.emit('snackTaken', { count: q.taken, need: s.plan.need, x: p.x, y: p.y, sectorId: world.sector.id });
      }
    }
    if (q.taken >= s.plan.need) end.win(world);
    else if (world.ledger.clock >= q.ends) end.lose(world, 'TIME');
    // Scooby and Shaggy once `road` snacks are in.
    else if (q.taken >= c.road) end.road(world, 0);
  },
  // The pointer leads to the nearest snack left (in the trails' sector, from the ship; elsewhere the first left).
  words(world, s) {
    const q = s.q, here = world.sector.id === s.plan.sectorId, ship = world.ship;
    let near = null, best = Infinity;
    for (const p of q.snacks) {
      if (p.taken) continue;
      const d = here ? Math.hypot(p.x - ship.x, p.y - ship.y) : 0;
      if (d < best) { best = d; near = p; }
      if (!here) break;
    }
    const sector = sectorById(s.plan.sectorId), spot = near ? { x: near.x / W, y: near.y / H } : { x: 0.5, y: 0.5 };
    return { title: QL.special.snacks(q.taken, s.plan.need), sub: QL.special.snacksSub(), pointer: 'SNACKS', ends: q.ends, time: s.plan.time,
      target: target(pointDest(sector.id, spot, CONFIG.pickup.collectRadius + 40, sector.label)),
      win: QL.special.solved(), lose: [QL.special.runFailed(), QL.special.hungry()] };
  },
  draw(world, s, r, t) {
    const q = s.q;
    drawSmoke(r, q.smoke, (x, y) => world.project(r, x, y));
    if (world.sector.id !== s.plan.sectorId) return;
    q.snacks.forEach((p, i) => {
      if (p.taken) return;
      const at = world.project(r, p.x, p.y);
      if (r.onScreen(at.x, at.y, 40)) drawSnack(r, at.x, at.y, snackSpin(t, i));
    });
  },
};
// CLIPPER's (src/clipper.js): led, never flown; its `meet` and `standing` say its two strips while it stands, `drawStanding` draws it then.
export const HANDLERS = Object.freeze({ delorean, swordfish, express, falcon, serenity, xwing, scooby, clipper });
