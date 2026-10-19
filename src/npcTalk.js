import { CONFIG } from './config.js';
import { npcShip, npcCraftDef } from './npcShips.js';
import { stationDefById, SECTOR_SIZE } from './sectors.js';
import { hintOptions, giveHint } from './wrecked.js';

// What a friendly ship says as a person (SX, 2026-10-19, N4 TALK on reports/2026-10-19-npc-rewrite-brief.md: «можно вводить все что ты
// сказал»): its answer to the pilot's greeting (src/greetings.js greetCraft) knows what is near (pirates, its home) and what the pilot is
// (its paint, its speed), and what was (the first meeting, a ram it still holds, a rescue, a station restored since they last met); now and
// then a ship speaks first as it comes by (Fleet.step's meetings), only for what matters (a grudge, a thanks, a station back, pirates near).
// And a ship the pilot helped (N6 QUESTS) owes it a favor of its own (its record's `favor`, src/npcShips.js), given at the next greeting.
// The memory is the fleet's (src/npcFleet.js Fleet.people, saved); the numbers CONFIG.traffic.talk. The lines are the agent's, in the
// greetings' dry voice and a hail's two rows of 22 cells: product copy SX or Codex may change. `{name}`, `{job}`, `{station}` are filled.

export const TALK_LINES = Object.freeze({
  first: Object.freeze(['{job}. NICE TO MEET YOU.', "NEW FACE. I'M {name}.", '{name}. {job}. HELLO.']),
  regular: Object.freeze(['YOU AGAIN. HELLO.', 'GOOD TO SEE YOU, PILOT.', "REGULAR, AREN'T YOU?"]),
  grudge: Object.freeze(['YOU AGAIN. KEEP OFF.', 'STILL SORE FROM LAST TIME.', 'MIND MY HULL THIS TIME.', 'I REMEMBER YOU.']),
  helped: Object.freeze(['MY RESCUER!', 'I OWE YOU ONE.', 'STILL GRATEFUL, PILOT.']),
  news: Object.freeze(['{station} IS BACK. THANKS.', 'YOU FIXED {station}?', 'HEARD {station} IS OPEN.']),
  pirates: Object.freeze(['PIRATES CLOSE. CAREFUL.', "THEY'RE OUT HERE. WATCH IT.", 'SAW PIRATES. KEEP MOVING.']),
  paint: Object.freeze(['NICE PAINT.', 'SAME PAINT. GOOD TASTE.']),
  fast: Object.freeze(['SLOW DOWN THERE.', "WHERE'S THE FIRE?"]),
  home: Object.freeze(['{station} IS HOME.', 'HEADING HOME TO {station}.']),
  // A flown ship in a pilot's fight (src/npcFleet.js fightStep, N5 FIGHTS): getting clear, joining it, ramming a pirate.
  fight: Object.freeze({
    flee: Object.freeze(["PIRATES! I'M OUT.", 'NOT MY FIGHT.', 'GETTING CLEAR.']),
    join: Object.freeze(['HOLD ON, PILOT!', "I'M IN.", 'COMING THROUGH!']),
    hit: Object.freeze(['GOT ONE!', 'HA! TAKE THAT.', 'RIGHT IN THE HULL.']),
  }),
  favor: Object.freeze({
    fuel: Object.freeze(['HERE. +{amount} FUEL. ON ME.', 'TOPPED YOU UP. +{amount} FUEL.']),
    hull: Object.freeze(['PATCHED YOU UP. +{amount} HULL.', 'HOLD STILL. +{amount} HULL.']),
    cache: Object.freeze(['KNOW A CACHE. MARKED IT.', 'FOUND SOMETHING. MARKED.']),
    signal: Object.freeze(['PICKED UP A SIGNAL. LISTEN.', 'A SIGNAL FOR YOU. TUNE IN.']),
    word: Object.freeze(['A WORD FOR YOUR SIGNS.', 'LEARN THIS ONE.']),
  }),
});

const T = () => CONFIG.traffic.talk;
// One of `lines`, not `last` again (src/greetings.js pickGreeting, kept here: greetings.js reads this file).
const pickGreeting = (lines, last, rng) => { const pool = lines.length > 1 ? lines.filter((l) => l !== last) : lines; return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]; };
const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
const fill = (line, at) => line.replace('{name}', at.name ?? '').replace('{job}', at.job ?? '').replace('{station}', at.station ?? '').replace('{amount}', at.amount ?? '');

// What a ship can tell about now: its record (Fleet.people), where it is in the pilot's sector's units, and the facts its lines are about,
// each true or false. Null for a craft that is no person of the fleet.
export function talkContext(world, code) {
  const fleet = world.fleet, rec = fleet?.personOf?.(code), ship = npcShip(code), walker = fleet?.byCode.get(code);
  if (!rec || !ship || !walker) return null;
  const C = T(), t = world.time, clock = world.ledger.clock, p = walker.pose(t), ox = world.sector.col * W, oy = world.sector.row * H;
  const x = p.x - ox, y = p.y - oy, me = world.ship, top = me.params?.().maxSpeed ?? 999;
  const restored = [...world.ledger.restored], home = walker.home && stationDefById(walker.home.station);
  const nearHome = !!home && home.sectorId === world.sector.id && Math.hypot(home.x * W - me.x, home.y * H - me.y) < C.homeReach;
  return {
    rec, ship, x, y, name: ship.name, job: ship.job, clock,
    grudge: rec.grudge > clock,
    helped: rec.helped > 0,
    owed: rec.favors > 0,
    news: rec.knew >= 0 && restored.length > rec.knew ? stationDefById(restored[restored.length - 1])?.label ?? null : null,
    pirates: (world.pirates ?? []).some((q) => q.hp > 0 && Math.hypot(q.x - me.x, q.y - me.y) < C.pirates),
    paint: world.pilot?.paint != null && world.pilot.paint === fleet.keyOf(code),
    fast: Math.hypot(me.vx ?? 0, me.vy ?? 0) > C.fast * top,
    first: rec.met <= 1,
    regular: rec.met >= C.regular,
    home: nearHome ? home.label : null,
  };
}

// A line of `pool` (TALK_LINES), never the one it gave last, filled for `at`.
function lineOf(world, pool, at) {
  const key = `talk:${pool}`, lines = TALK_LINES[pool], said = (world.said ??= new Map());
  const line = pickGreeting(lines, said.get(key), world.rng('quest'));
  said.set(key, line);
  return fill(line, at);
}

// The ship's answer to the pilot's greeting: { line, angry }. A favor owed is given first (giveFavor); then what matters most of now, by
// the order below, `context` of the times (else the ship's own answers, or the greetings' common ones). Null for a craft that is no person.
export function replyFor(world, code, own) {
  const at = talkContext(world, code);
  if (!at) return null;
  if (at.owed) return { line: giveFavor(world, code, at), angry: false };
  const order = [['grudge', at.grudge], ['helped', at.helped], ['news', !!at.news], ['pirates', at.pirates], ['first', at.first],
    ['paint', at.paint], ['fast', at.fast], ['regular', at.regular], ['home', !!at.home]];
  const top = order.find(([, on]) => on)?.[0];
  if (top && (top === 'grudge' || world.rng('quest')() < T().context)) {
    if (top === 'news') at.rec.knew = world.ledger.restored.size;
    return { line: lineOf(world, top, { ...at, station: top === 'home' ? at.home : at.news }), angry: top === 'grudge' };
  }
  return { line: pickGreeting(own, world.lastReply, world.rng('quest')), angry: false };
}

// What a ship coming by says before it is greeted, or null: only a grudge, a thanks, a station back or pirates near; each ship once a meeting
// (the caller's), and the fleet's ships not more often than `every` s together (`fleet.talkAt`).
export function hailFor(world, code) {
  const at = talkContext(world, code), fleet = world.fleet;
  if (!at || world.time - (fleet.talkAt ?? -Infinity) < T().every) return null;
  const pool = at.grudge ? 'grudge' : at.helped && at.owed ? 'helped' : at.news ? 'news' : at.pirates ? 'pirates' : null;
  if (!pool) return null;
  if (pool === 'news') at.rec.knew = world.ledger.restored.size;
  fleet.talkAt = world.time;
  return { line: lineOf(world, pool, { ...at, station: at.news }), angry: pool === 'grudge', x: at.x, y: at.y };
}

// Says ship `code`'s line at the pilot, over the ship, in the greeting's style (as Fleet.say does a curse).
export function sayAtPilot(world, code, said) {
  const craft = npcCraftDef(code);
  world.emit('trafficHail', { craftId: craft.id, label: craft.label, line: said.line, x: said.x, y: said.y, sectorId: world.sector.id,
    greet: true, angry: !!said.angry });
}

// A favor owed, given (N6 QUESTS): the ship's own kind (its record's `favor`), or, when that has nothing left to give (a full tank, a
// whole hull, no cache or signal or word left, a side quest already open for a signal), the next of FAVOR_ORDER that has. Fuel and hull
// are given now, `amount` of each (CONFIG.traffic.talk.favor); a cache, a signal, a word as a wreck's tip is (src/wrecked.js giveHint).
// One favor a help. Returns its line.
const FAVOR_ORDER = Object.freeze(['fuel', 'hull', 'cache', 'signal', 'word']);
export function giveFavor(world, code, at = talkContext(world, code)) {
  const ship = npcShip(code), F = T().favor, rec = at.rec;
  const tips = hintOptions(world), can = {
    fuel: world.fuel < world.fuelTank - 1, hull: world.hull < world.hullMax - 1,
    cache: tips.some((o) => o.kind === 'cache'), signal: !world.sideQuest && tips.some((o) => o.kind === 'signal'), word: tips.some((o) => o.kind === 'word'),
  };
  const kind = can[ship.favor] ? ship.favor : FAVOR_ORDER.find((k) => can[k]) ?? null;
  rec.favors = Math.max(0, rec.favors - 1);
  if (!kind) return lineOf(world, 'helped', at);
  let amount = '';
  if (kind === 'fuel') { amount = Math.round(Math.min(F.fuel * world.fuelTank, world.fuelTank - world.fuel)); world.fuel += amount; }
  else if (kind === 'hull') { amount = Math.round(Math.min(F.hull * world.hullMax, world.hullMax - world.hull)); world.hull += amount; }
  else {
    const list = tips.find((o) => o.kind === kind).list, item = list[Math.floor(world.rng('quest')() * list.length)];
    giveHint(world, kind === 'cache' ? { kind, findId: item.id } : kind === 'signal' ? { kind, signalId: item.id } : { kind, wordId: item.id }, { x: at.x, y: at.y });
  }
  world.emit('npcFavor', { code, kind, amount: Number(amount) || 0, sectorId: world.sector.id, x: at.x, y: at.y });
  const key = `favor:${kind}`, said = (world.said ??= new Map()), line = pickGreeting(TALK_LINES.favor[kind], said.get(key), world.rng('quest'));
  said.set(key, line);
  return fill(line, { ...at, amount });
}
