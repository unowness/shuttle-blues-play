// The boss TOLLKEEPER's quest (chat 6 of docs/plans/2026-10-13-next-chats.md, step 3): after the last ruin is restored, strange activity in a
// sector next to the last restored station's; at its EXPLORE mark the boss wakes, the smoke closes a square round the fight; a wreck lifts the
// smoke and the boss waits, whole, in another sector next door; beaten, the main game is done (Pilot.bossDefeated) and the page says so.
// SX, 2026-10-14: «после восстановления последней станции должен приходить квест "странная активность в соседнем секторе" ты туда
// прилетаешь на метку, там босс, на метке напиши типо explore»; «когда ты сражаешься с боссом, поле битвы окружает дым, ограничивая 1/4
// сектора в квадрат, если ты умер анблок снимается и босс спавнится в другом месте» (asked: «Четверть стороны», «Соседний сектор»).
//
//   stepBossQuest     the quest's step: offered at 8 of 8 (a save already there gets it at once, once), woken near its mark, the smoke held,
//                     the wreck and the win
//   bossQuestRecord   the quest as the list shows it (src/quests.js currentQuests)
//   bossQuestToJSON, readBossQuest   its place in the save (src/questSave.js): only where it waits; the fight itself is never saved
//   arenaSpot         a place whose whole smoke square is clear: inside the sector, off every station's keep-out, planet cushion and hole
//
// The page's side: the notices (labs/graphics/notices.js) and the window when it is beaten (labs/graphics/finale-window.js).
import { CONFIG } from './config.js';
import { sectorById, neighbourOf, SECTOR_SIZE, SECRET_HOLE, stationDefById } from './sectors.js';
import { ruinIdsOf } from './ruins.js';
import { KEEP_OUT } from './keepOut.js';
import { secretHoleAt } from './secretHole.js';
import { sectorOpen, openSectorIds } from './frontier.js';
import { QUEST_LINES as QL } from './questLines.js';
import { clamp, wrapPi } from './util.js';
import { NPC_SHIPS, npcShip } from './npcShips.js';

export const BOSS_QUEST_ID = 'boss';
const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
const Q = () => CONFIG.boss.quest;

// Every ruin of the pilot's catalogue restored (src/specialQuests.js reads it the same way).
export function allRestored(ledger) {
  const ids = ruinIdsOf(ledger);
  return ids.length > 0 && ids.every((id) => ledger.restored.has(id));
}
// The ruin restored last on the pilot's clock (ledger.restoredAt), or any one restored.
function lastRestored(ledger) {
  let best = null, at = -Infinity;
  for (const id of ruinIdsOf(ledger)) {
    const t = ledger.restoredAt?.get(id) ?? -1;
    if (ledger.restored.has(id) && t > at) { at = t; best = id; }
  }
  return best ? stationDefById(best, ledger) : null;
}
// The open grid sectors next to `sector` (the eight round it), never a hidden one.
function neighbours(sector, ledger) {
  const out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const s = neighbourOf(sector, dx, dy);
    if (s && !s.hidden && sectorOpen(ledger, s)) out.push(s);
  }
  return out;
}

// A place in `sectorId` (fractions) whose whole smoke square (`side` u) stands inside the sector and clear, by `margin` u more, of every
// station's keep-out (src/keepOut.js), every planet's cushion (its orbit's top), every hole's disc twice over and the secret hole; null when
// `tries` draws find none. The square is tested as a square: the distance from each thing's middle to its nearest point.
export function arenaSpot(sectorId, rng, { side = Q().arena, margin = Q().margin, tries = 120 } = {}) {
  const sector = sectorById(sectorId);
  if (!sector || sector.hidden) return null;
  const things = [
    ...(sector.stations ?? []).map((t) => ({ x: t.x * W, y: t.y * H, r: KEEP_OUT })),
    ...(sector.planets ?? []).map((t) => ({ x: t.x * W, y: t.y * H, r: t.radius + CONFIG.planet.orbit.height })),
    ...(sector.holes ?? []).map((t) => ({ x: t.x * W, y: t.y * H, r: (t.disc ?? 250) * 2 })),
    ...[secretHoleAt(sectorId)].filter(Boolean).map((t) => ({ x: t.x * W, y: t.y * H, r: SECRET_HOLE.disc * 2 })),
  ];
  const h = side / 2, lo = h + margin, hiX = W - h - margin, hiY = H - h - margin;
  if (hiX <= lo || hiY <= lo) return null;
  for (let i = 0; i < tries; i++) {
    const x = lo + (hiX - lo) * rng(), y = lo + (hiY - lo) * rng();
    const clear = things.every((t) => Math.hypot(Math.max(0, Math.abs(t.x - x) - h), Math.max(0, Math.abs(t.y - y) - h)) > t.r + margin);
    if (clear) return { x: x / W, y: y / H };
  }
  return null;
}

// Where the boss waits: a clear place in a sector next to `fromSectorId`, not in `not` (the one it was just in), the sectors tried in a
// seeded order; any open sector if none of those will do.
function placeBoss(world, fromSectorId, not = null) {
  const rng = world.rng('boss'), from = sectorById(fromSectorId);
  const near = neighbours(from, world.ledger).filter((s) => s.id !== not);
  for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [near[i], near[j]] = [near[j], near[i]]; }
  const rest = openSectorIds(world.ledger).map(sectorById).filter((s) => s && !s.hidden && s.id !== not && !near.includes(s));
  for (const s of [...near, ...rest]) {
    const at = arenaSpot(s.id, rng);
    if (at) return { sectorId: s.id, x: at.x, y: at.y };
  }
  return null;
}
const middleOf = (q) => ({ x: q.x * W, y: q.y * H });

// ------------------------------------------------------------------------------------------------------------------------------ step ---

export function stepBossQuest(world, dt) {
  const P = world.pilot, b = world.boss;
  // Beaten once: its pieces fly a while, then it is gone; no quest again.
  if (P.bossDefeated) {
    world.bossQuest = null;
    world.bossArena = null;
    if (b?.defeated && world.time - b.defeatedAt > Q().gone) world.boss = null;
    if (world.bossCrowd?.length) { stepCrowd(world, dt); if (world.time >= (world.bossCrowdGoAt ?? 0)) world.bossCrowd = []; }
    return;
  }
  if (!allRestored(world.ledger)) return;
  let q = world.bossQuest;
  // At 8 of 8 (and for a save already there, at its first step): the quest, once; its place next to the last restored station's sector.
  if (!q) {
    const from = lastRestored(world.ledger)?.sectorId ?? world.sector.id;
    const at = placeBoss(world, from);
    if (!at) return;
    q = world.bossQuest = { ...at, from, stage: 'waiting' };
    world.emit('bossQuestOffered', { sectorId: q.sectorId, label: sectorById(q.sectorId).label, x: q.x, y: q.y });
    return;
  }
  const here = q.sectorId === world.sector.id, ship = world.ship;
  if (q.stage === 'fight') {
    if (b?.defeated) {
      // Beaten: the main game is done; the smoke lifts; the watchers cheer and go.
      P.bossDefeated = true;
      world.bossArena = null;
      world.bossQuest = null;
      cheer(world);
      world.emit('bossQuestDone', { sectorId: world.sector.id, x: b.x, y: b.y });
      return;
    }
    if (!ship.alive) {
      // A wreck: the smoke lifts, and the boss, whole, waits in another sector next door (SX: «если ты умер анблок снимается и босс
      // спавнится в другом месте»); the mark moves there, red, with its name (bossQuestRecord).
      world.bossArena = null;
      world.boss = null;
      world.bossCrowd = [];
      const at = placeBoss(world, q.from, q.sectorId) ?? { sectorId: q.sectorId, x: q.x, y: q.y };
      const was = q.sectorId;
      Object.assign(q, at, { stage: 'waiting' });
      world.emit('bossMoved', { from: was, to: q.sectorId, label: sectorById(q.sectorId).label });
      return;
    }
    if (!b || !here) { q.stage = 'waiting'; world.bossArena = null; world.bossCrowd = []; return; }
    holdInArena(world);
    stepCrowd(world, dt);
    return;
  }
  // Waiting at its mark: from `seen` u off it lies there, in wait (src/boss.js `dormant`); it reacts to the pilot inside its square, or to
  // a hit, and only then the smoke closes round the place and the watchers come (SX: «Зона ограничевается как только с боссом начинается
  // схватка, то есть он реагирует»).
  if (!here || !ship.alive || world.docked) return;
  const c = middleOf(q), d = world.delta(ship.x, ship.y, c.x, c.y), dist = Math.hypot(d.x, d.y);
  if (!world.boss) {
    if (dist > Q().seen) return;
    world.spawnBoss({ x: c.x, y: c.y, dormant: true });
  }
  const lying = world.boss;
  if (!lying.dormant) return;
  if (dist > Q().wake && !lying.provoked) return;
  lying.dormant = false;
  lying.attack.dur = Q().entrance;
  world.bossArena = { x: c.x, y: c.y, half: Q().arena / 2 };
  q.stage = 'fight';
  q.met = true;
  gatherCrowd(world);
  world.emit('bossWoke', { sectorId: q.sectorId, x: lying.x, y: lying.y });
}

// ------------------------------------------------------------------------------------------------------------------------ the crowd ---

// The NPC ships that watch the fight from the smoke's edges: `count` of them, of different kinds in their own schemes, each just past a
// side of the square (round the four in turn), fussing about its place, turned to the fight; one calls a line now and then. They hit
// nothing and nothing hits them; the world draws them (src/worldDraw.js) and their lines stand with them (World.craftAt).
function gatherCrowd(world) {
  const C = CONFIG.boss.crowd, A = world.bossArena, rng = world.rng('boss-crowd');
  const codes = NPC_SHIPS.map((s) => s.code).filter((code) => !npcShip(code).rare);
  for (let i = codes.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [codes[i], codes[j]] = [codes[j], codes[i]]; }
  world.bossCrowd = codes.slice(0, C.count).map((code, k) => {
    const side = k % 4, along = (rng() * 2 - 1) * A.half * 0.8, out = A.half + C.out[0] + rng() * (C.out[1] - C.out[0]);
    const home = side === 0 ? { x: A.x + along, y: A.y - out } : side === 1 ? { x: A.x + out, y: A.y + along }
      : side === 2 ? { x: A.x + along, y: A.y + out } : { x: A.x - out, y: A.y + along };
    return { id: `boss-crowd-${k}`, code, label: npcShip(code).name, x: home.x, y: home.y, vx: 0, vy: 0, angle: 0, home, aim: { ...home }, nextAt: 0 };
  });
  world.bossCrowdSayAt = world.time + 1.5;
}

function stepCrowd(world, dt) {
  const C = CONFIG.boss.crowd, crowd = world.bossCrowd ?? [], rng = world.rng('boss-crowd'), b = world.boss;
  for (const w of crowd) {
    // A new spot near its place now and then: it fusses.
    if (world.time >= w.nextAt) {
      const a = rng() * Math.PI * 2, r = rng() * C.fuss;
      w.aim = { x: w.home.x + Math.cos(a) * r, y: w.home.y + Math.sin(a) * r };
      w.nextAt = world.time + C.every[0] + rng() * (C.every[1] - C.every[0]);
    }
    const dx = w.aim.x - w.x, dy = w.aim.y - w.y, len = Math.hypot(dx, dy) || 1, want = Math.min(C.speed, len * 3);
    w.vx += ((dx / len) * want - w.vx) * Math.min(1, 4 * dt);
    w.vy += ((dy / len) * want - w.vy) * Math.min(1, 4 * dt);
    w.x += w.vx * dt; w.y += w.vy * dt;
    // Turned to the fight: the boss, or the pilot when it is gone.
    const at = b && !b.defeated ? b : world.ship;
    w.angle += clamp(wrapPi(Math.atan2(at.y - w.y, at.x - w.x) - w.angle), -3 * dt, 3 * dt);
  }
  if (!crowd.length || world.time < world.bossCrowdSayAt) return;
  world.bossCrowdSayAt = world.time + C.say[0] + rng() * (C.say[1] - C.say[0]);
  // The one nearest the pilot calls, so its line is seen; its words by what is going on.
  const ship = world.ship, near = crowd.reduce((m, w) => (Math.hypot(w.x - ship.x, w.y - ship.y) < Math.hypot(m.x - ship.x, m.y - ship.y) ? w : m));
  const lines = C.lines, recent = (t) => t != null && world.time - t < 4;
  const pool = recent(b?.launchedAt) ? lines.launch : b?.sleds.some((s) => !s.on && recent(s.offAt)) ? lines.sled
    : b && CONFIG.boss.phases[b.phase]?.rage && !recent(world.bossRageSaidAt) ? (world.bossRageSaidAt = world.time, lines.rage) : lines.any;
  say(world, near, pool[Math.floor(rng() * pool.length)]);
}

// What the radio says of it (the text pass SX approved on 2026-10-24, codex/text-review/2026-10-24), as the notch says it (labs/graphics/
// notices.js): offered (where, the quest's sector), awake (the short form: the fight is on), moved after a wreck, beaten. And the line a
// watcher calls first when it is beaten.
export const RADIO = Object.freeze({
  offered: (sector) => `LARGE VESSEL REPORTED IN ${sector}. SENDING A MARKER. PLEASE INVESTIGATE.`,
  woke: 'TARGET THE CORE. MODULES ARE OPTIONAL.',
  moved: 'TOLLKEEPER HAS BEEN LOCATED AGAIN. COORDINATES UPDATED. BE ADVISED: ITS HULL IS RESTORED.',
  done: 'CORE DESTROYED. TOLLKEEPER IS NO LONGER A THREAT.',
  clear: "SMOKE'S CLEARING. YOU CAN GET OUT NOW.",
});

function say(world, w, line) {
  world.emit('trafficHail', { craftId: w.id, label: w.label, line, x: w.x, y: w.y, sectorId: world.sector.id, greet: true });
}

// Beaten: two of them call it (the first that the smoke is clearing), and the crowd goes with the boss's pieces.
function cheer(world) {
  const crowd = world.bossCrowd ?? [], rng = world.rng('boss-crowd'), won = CONFIG.boss.crowd.lines.won;
  crowd.slice(0, 2).forEach((w, i) => say(world, w, i === 0 ? RADIO.clear : won[Math.floor(rng() * won.length)]));
  world.bossCrowdGoAt = world.time + Q().gone;
}

// The smoke's square is the world's fog (its sides dead edges, World.edgeDepths): the rope throws a hull, a pirate, the cargo back off it.
// Behind the rope, as behind the world's edges (World.holdAtLimit), a backstop `backstop` u past the line that a flight never reaches: a
// body there is held with its outward speed taken away.
function holdInArena(world) {
  const A = world.bossArena;
  if (!A) return;
  const hold = (c) => {
    const lim = A.half + Q().backstop;
    if (c.x < A.x - lim) { c.x = A.x - lim; c.vx = Math.max(0, c.vx); } else if (c.x > A.x + lim) { c.x = A.x + lim; c.vx = Math.min(0, c.vx); }
    if (c.y < A.y - lim) { c.y = A.y - lim; c.vy = Math.max(0, c.vy); } else if (c.y > A.y + lim) { c.y = A.y + lim; c.vy = Math.min(0, c.vy); }
  };
  hold(world.ship);
  if (world.boss) hold(world.boss);
  for (const p of world.pirates) if (p.escort) hold(p);
}

// Whether a point is inside the smoke's square (the page draws the smoke; nothing else reads it).
export function inArena(world, x, y) {
  const A = world.bossArena;
  return !!A && Math.abs(x - A.x) <= A.half && Math.abs(y - A.y) <= A.half;
}

// ------------------------------------------------------------------------------------------------------------------------ the list ---

// The quest's plate. Until the pilot meets the boss: story purple, its mark EXPLORE (marks are named for what they lead to). From the meeting
// on (SX: «метка Explore только до момента встречи с боссом, потом у тебя просто квест ... с битвой, если ты умер, то метка показывает с
// ником босса на него, красная метка такая же как у рейдов»): red as a raid's, its mark the boss's name, BRING IT DOWN in the fight and
// where it waits after a wreck; the quest stays, its marks may be switched off on the list as any quest's.
export function bossQuestRecord(world) {
  const q = world.bossQuest;
  if (!q) return null;
  const label = sectorById(q.sectorId)?.label ?? '';
  const target = { sectorId: q.sectorId, x: q.x, y: q.y, mark: BOSS_QUEST_ID, reach: Q().wake };
  if (!q.met) return { id: BOSS_QUEST_ID, kind: 'boss', tone: 'story', pointer: QL.boss.pointer(), title: QL.boss.title(), sub: QL.boss.sub(label), target };
  const fight = q.stage === 'fight';
  return { id: BOSS_QUEST_ID, kind: 'boss', tone: 'red', pointer: QL.boss.name(), title: QL.boss.fight(),
    sub: fight ? QL.boss.fightSub() : QL.boss.waitSub(label), target };
}

// ------------------------------------------------------------------------------------------------------------------------ the save ---

export function bossQuestToJSON(world) {
  const q = world.bossQuest;
  return q ? { kind: 'boss', sectorId: q.sectorId, x: q.x, y: q.y, from: q.from, ...(q.met ? { met: true } : null) } : null;
}
// A save's record, untrusted: a grid sector there is and a place inside it; read as waiting (a fight is never saved: it waits whole).
export function readBossQuest(world, raw) {
  const s = sectorById(raw?.sectorId), from = sectorById(raw?.from) ?? s;
  if (!s || s.hidden || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  return { sectorId: s.id, x: clamp(raw.x, 0, 1), y: clamp(raw.y, 0, 1), from: from.id, stage: 'waiting', met: raw.met === true };
}
