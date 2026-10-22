import { CONFIG } from './config.js';
import { sectorById, neighbourOf, SECTOR_SIZE } from './sectors.js';
import { TERRA, terraOf, terraSpot, placeTerra } from './terra.js';
import { noteVanish } from './vanish.js';
import { QUEST_LINES as QL } from './questLines.js';
import { clamp, TAU } from './util.js';

// CLIPPER, the eighth reference ship: SX (ROUXEE) and his friend Pasha (KWLSK), who tested the game, on their way to a beta test (SX,
// 2026-10-21, labs/graphics/sketches/clipper-beta.html: «встречаешь этот корабль ... две полосочки, с текстом, один от меня, другой от Паши
// ... в диалоговом окне ... они постоянно путают вперед и назад ... летят задом ... Наш пилот говорит, подожди, сейчас уточню по радио ... у
// них сломался локатор ... проводить нас до туда ... планету, которая напоминает Землю ... Чуваки летят медленнее нашего корабля ... если мы
// разошлись на два разных экрана, то надо к ним вернуться ... проходят вокруг планеты ... кричат «Спасибо, чувак, увидимся» ... если нападает
// на них пираты, то они тоже стреляют»; his picks of 2026-10-22: the paint G8, the flight R4 FIDGET, the talk D2 SCRIPT, the nicks as every
// NPC's, his own lines word for word; then «пора делать»). Its handler for src/specials.js, as the seven's are in src/specialQuests.js, but
// CLIPPER is led, never flown (`escort` in src/specialShips.js): the pilot stays in their own ship.
//
//   seen     it stands (its nose any way, fidgeting); a pilot who comes near hears KWLSK, then ROUXEE, over it in strips; up close its window
//            is the talk (KWLSK, ROUXEE, YOU, RADIO, KWLSK: a script, labs/graphics/talk-beat.js) and LEAD THEM
//   follow   TERRA comes to stand (src/terra.js), out of sight a sector or two off; the crew follows the pilot, slower, backwards as often
//            as not (R4 FIDGET); left a screen behind they stop, the quest says to go back for them, and back in sight KWLSK calls; on the
//            way three exchanges, each said only in sight; partway, two DARTs come at them, and the crew shoots with the pilot
//   round    at TERRA: KWLSK's thanks, a turn round it, slowing to a stop
//   still    ROUXEE's last word, and once it has stood its time the beam takes them (src/vanish.js, SX's G3 BEAM): the quest won
//
// The crew's place is the grid's (world units of the whole grid, `q.x`, `q.y`), so it crosses the seams with the pilot; drawn and spoken
// where it falls in the sector the pilot is in. Nothing of the escort is saved: a game loaded during it has CLIPPER standing where it was
// met (src/questSave.js, as a flown quest is), TERRA where it came to stand.

const C = () => CONFIG.quests.special.clipper;
const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
export const CLIPPER_ID = 'clipper';

// Who is aboard, by their handles (SX, 2026-10-21: «паша пусть будет KWLSK»; «Давай мой ник будет Рокси с двумя И»).
export const CREW = Object.freeze({ sx: 'ROUXEE', pasha: 'KWLSK' });
const YOU = 'YOU', RADIO = 'RADIO';
// Each of the two speaks as a craft of its own, so both strips stand at once (src/feedback.js keeps one hail a craft): CLIPPER's place.
export const CREW_HAILS = Object.freeze({ [CREW.sx]: 'clipper-rouxee', [CREW.pasha]: 'clipper-kwlsk' });
export const isCrewHail = (id) => id === CREW_HAILS[CREW.sx] || id === CREW_HAILS[CREW.pasha];

// SX's own lines (2026-10-21, his table of «Где / Кто / Текст»; labs/graphics/sketches/clipper-beta.js LINES), word for word: met (strips),
// the talk (the window), the way's three exchanges (strips), the call when the pilot comes back for them, after the pirates, at TERRA, and
// ROUXEE's last before the beam (after Furious 7's «One last ride»). TERRA's name is a placeholder.
export const LINES = Object.freeze({
  meet: [[CREW.pasha, 'PSST! DUDE! KNOW WHERE THE BETA TEST IS?'], [CREW.sx, 'WE WERE SUPPOSED TO BE THERE YESTERDAY.']],
  talk: [
    [CREW.pasha, 'JUST GIVING THEM TIME TO FIX THE BUGS.'],
    [CREW.sx, 'SO WE CAN FIND SOME NEW ONES.'],
    [YOU, "HOLD ON. I'LL ASK RADIO."],
    [RADIO, `${TERRA.label}. TEST'S STILL RUNNING. BRING PATIENCE.`],
    [CREW.pasha, "OUR LOCATOR'S IN BETA TOO. MIND LEADING?"],
  ],
  road: [
    [[CREW.pasha, 'SEE? I KNEW WE WERE GOING THE RIGHT WAY.'], [CREW.sx, "AND WE'RE DOING IT BACKWARDS."]],
    [[CREW.pasha, 'JUST CHECKING THE REAR VIEW.'], [CREW.sx, 'WITH THE FRONT OF THE SHIP.']],
    [[CREW.pasha, "THINK WE'LL MAKE THE CREDITS?"], [CREW.sx, 'AT LEAST THE PATCH NOTES.']],
  ],
  wait: [[CREW.pasha, 'NO SPEEDRUNS, DUDE!']],
  fight: [[CREW.sx, 'THAT WAS EASY.'], [CREW.pasha, 'SSS RANK. DMC5 TAUGHT ME WELL.']],
  bye: [[CREW.pasha, "THANKS, DUDE. WE'LL TAKE IT FROM HERE."]],
  last: [[CREW.sx, 'I SWEAR. THAT WAS OUR LAST RIDE.']],
});
// What the window says, as the script's lines (src/specials.js specialCandidates): each its speaker.
export const talkOf = () => LINES.talk.map(([who, line]) => ({ who, line }));

// How long a line stands: long enough to read while flying (SX: «чтобы фразочки ... довольно долго на экране висели»).
export const readLife = (line) => Math.max(C().read.least, C().read.base + line.length / C().read.chars);

// ---- places ------------------------------------------------------------------------------------------------------------------

const origin = (world) => ({ x: world.sector.col * W, y: world.sector.row * H });
const gridOf = (sectorId, fx, fy) => { const s = sectorById(sectorId); return s ? { x: (s.col + fx) * W, y: (s.row + fy) * H } : null; };
const terraAt = (world) => { const t = terraOf(world); return t && gridOf(t.sector, t.x, t.y); };
const rim = () => TERRA.radius * 1.045;
// The crew's place in the pilot's sector's units.
const localOf = (world, q) => { const o = origin(world); return { x: q.x - o.x, y: q.y - o.y }; };
// Whether a place of the pilot's sector is in sight of the pilot (CONFIG's `view`: the screen, about).
function inSight(world, at) {
  const ship = world.ship, v = C().view;
  return !!at && ship.alive && !world.sector.hidden && Math.abs(at.x - ship.x) <= v.x && Math.abs(at.y - ship.y) <= v.y;
}
// Whether a place of the grid falls near the pilot's sector (drawn there, its hails standing there, its shots in its units).
const nearSector = (at) => at.x > -W * 0.5 && at.y > -H * 0.5 && at.x < W * 1.5 && at.y < H * 1.5;

// ---- the crew's flight (R4 FIDGET) ---------------------------------------------------------------------------------------------

const smooth = (a, b, v) => { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
// SX's R4 FIDGET (2026-10-21: «хочется чтобы они были суетными и подвижными»; «глюков не должно быть»; of R3-R5 «фиджет прикольно»): a round
// of the nose against the way it goes, eased between keys, never snapped: backwards, then unsure (a quarter, back, the other quarter), then
// forwards, the drive in bursts, then backwards again; a hunting wobble over all of it. `s` s into the round.
const P = Math.PI;
const TURNS = Object.freeze([[3.0, P], [3.35, P - 1.5], [3.7, P - 0.3], [4.05, P + 1.5], [4.4, P + 0.5], [5.2, TAU], [8.8, TAU], [9.8, 3 * P]]);
function turnTo(s) {
  if (s <= TURNS[0][0]) return TURNS[0][1];
  for (let i = 1; i < TURNS.length; i++) if (s <= TURNS[i][0]) return lerp(TURNS[i - 1][1], TURNS[i][1], smooth(TURNS[i - 1][0], TURNS[i][0], s));
  return TURNS.at(-1)[1];
}
export function fidget(s) {
  const F = C().fidget, u = ((s % F.period) + F.period) % F.period;
  const ahead = u >= 5.2 && u < 8.8, burst = ahead && (u * 1.7) % 1 < 0.55;
  return { turn: turnTo(u) + 0.2 * Math.sin(u * 4.7) + 0.08 * Math.sin(u * 9.1), engine: burst, share: ahead ? (burst ? 1 : F.coast) : F.back };
}
// Standing, the nose hunts a little where it points.
const standingNose = (s, t) => s.site.angle + 0.12 * Math.sin(t * 4.7) + 0.05 * Math.sin(t * 9.1);

// Off planets, holes and stations of the pilot's sector: a push away within a body's reach and `avoid` u more.
function keepOff(world, at) {
  const out = { x: 0, y: 0 };
  if (!nearSector(at)) return out;
  const bodies = [...world.attractors.map((a) => ({ x: a.x, y: a.y, r: (a.orbit ?? a.kill) })), ...world.stations.map((s) => ({ x: s.x, y: s.y, r: s.hullRadius ?? 300 }))];
  for (const b of bodies) {
    const dx = at.x - b.x, dy = at.y - b.y, d = Math.hypot(dx, dy) || 1, reach = b.r + C().avoid;
    if (d >= reach) continue;
    const k = C().speed * 1.5 * (1 - d / reach);
    out.x += (dx / d) * k; out.y += (dy / d) * k;
  }
  return out;
}

// ---- what they say -----------------------------------------------------------------------------------------------------------

// Lines to be said from `due` (world time), a pair's second `pair` s after its first is said.
function queue(list, lines, due) { lines.forEach(([who, line], i) => list.push({ due, who, line, pair: i > 0 })); }
// The lines due, said while `at` (the pilot's sector's units) is in sight; returns the lines said.
function sayDue(world, list, at) {
  const said = [];
  while (list.length && world.time >= list[0].due && inSight(world, at)) {
    const e = list.shift();
    world.emit('trafficHail', { craftId: CREW_HAILS[e.who], label: e.who, line: e.line, life: readLife(e.line), x: at.x, y: at.y, sectorId: world.sector.id });
    said.push(e);
    if (list[0]?.pair) list[0].due = Math.max(list[0].due, world.time + C().pair);
  }
  return said;
}

// ---- the handler (src/specials.js) -----------------------------------------------------------------------------------------------

// The quest from where it stands: TERRA's place (this game's, once it stands; else one drawn a sector or two off), or null.
function plan(world, site) {
  const at = terraOf(world) ?? terraSpot(world, site.sectorId, world.rng('quest'));
  const from = gridOf(site.sectorId, site.x / W, site.y / H), to = at && gridOf(at.sector, at.x, at.y);
  if (!from || !to) return null;
  return { terra: { sector: at.sector, x: at.x, y: at.y }, distance: Math.round(Math.hypot(to.x - from.x, to.y - from.y)) };
}
// A plan read back from a save: this game's TERRA where it stands, else the saved place if its sector is open.
export function readClipperPlan(world, raw, open) {
  const t = terraOf(world) ?? raw?.terra, s = sectorById(t?.sector);
  if (!s || !open(world, s.id) || !Number.isFinite(t.x) || !Number.isFinite(t.y)) return null;
  const distance = Number.isFinite(raw?.distance) ? clamp(Math.round(raw.distance), 0, 100000) : 0;
  return { terra: { sector: s.id, x: clamp(t.x, 0, 1), y: clamp(t.y, 0, 1) }, distance };
}

// Met: KWLSK, then ROUXEE, over it (its strips while it stands, `s.greet`).
function meet(world, s) { s.greet = []; queue(s.greet, LINES.meet, world.time); }
function standing(world, s) { if (s.greet?.length) sayDue(world, s.greet, { x: s.site.x, y: s.site.y }); }

// LEAD THEM: TERRA comes to stand; the crew starts from where it stood, backwards, the way's lines on their times.
function start(world, s) {
  placeTerra(world, s.plan.terra);
  const from = gridOf(s.site.sectorId, s.site.x / W, s.site.y / H), to = terraAt(world);
  s.q = { stage: 'follow', x: from.x, y: from.y, vx: 0, vy: 0, course: s.site.angle, nose: s.site.angle + P, engine: false, t0: world.time,
    d0: Math.max(1, Math.hypot(to.x - from.x, to.y - from.y)), lag: false, say: [], fight: 'ahead', shotIn: 0, aim: 0, aimAt: -Infinity,
    round: null, beamAt: null };
  C().road.forEach((t, i) => queue(s.q.say, LINES.road[i], world.time + t));
  world.emit('specialStage', { id: CLIPPER_ID, stage: 'led', x: world.ship.x, y: world.ship.y, sectorId: world.sector.id });
}

// The crew after the pilot: `follow` u behind, slower; past `lag` u they stop until the pilot is back in sight.
function follow(world, q, dt) {
  const c = C(), o = origin(world), ship = world.ship, f = fidget(world.time - q.t0);
  const dx = o.x + ship.x - q.x, dy = o.y + ship.y - q.y, d = Math.hypot(dx, dy) || 1;
  if (d > c.lag) q.lag = true;
  else if (q.lag && inSight(world, localOf(world, q))) { q.lag = false; q.say.unshift(...LINES.wait.map(([who, line]) => ({ due: world.time, who, line, pair: false }))); }
  const want = !q.lag && ship.alive ? clamp((d - c.follow) / c.ramp, 0, 1) * c.speed * f.share : 0, push = keepOff(world, localOf(world, q));
  steer(q, (dx / d) * want + push.x, (dy / d) * want + push.y, dt);
  q.nose = world.time - q.aimAt < 0.6 ? q.aim + 0.05 * Math.sin(world.time * 9.1) : q.course + f.turn;
  q.engine = f.engine && Math.hypot(q.vx, q.vy) > 25;
}
function steer(q, wx, wy, dt) {
  const k = Math.min(1, C().accel * dt);
  q.vx += (wx - q.vx) * k; q.vy += (wy - q.vy) * k;
  q.x += q.vx * dt; q.y += q.vy * dt;
  if (Math.hypot(q.vx, q.vy) > 25) q.course = Math.atan2(q.vy, q.vx);
}

// Partway, two DARTs come at them from ahead (once, and only where pirates come by themselves); beaten or gone, the two say so.
function fight(world, q) {
  const c = C().fight;
  if (q.fight === 'ahead') {
    const to = terraAt(world), at = localOf(world, q);
    if (!world.autoEncounters || !to || 1 - Math.hypot(to.x - q.x, to.y - q.y) / q.d0 < c.at || !inSight(world, at) || world.docked || world.encounter) return;
    const o = origin(world), ship = world.ship;
    const made = world.spawnPirates(c.count, { types: Array(c.count).fill(c.type), angle: Math.atan2(to.y - o.y - ship.y, to.x - o.x - ship.x), distance: c.distance });
    for (const p of made) p.tag = 'special';
    if (made.length) q.fight = 'on';
  } else if (q.fight === 'on' && !world.pirates.some((p) => p.tag === 'special' && p.mode !== 'leave')) {
    q.fight = 'done';
    queue(q.say, LINES.fight, world.time + 0.6);
  }
}
// The crew shoots at the nearest pirate within reach (any: «если нападает на них пираты, то они тоже стреляют»), its nose to it a moment.
function shoot(world, q, dt) {
  const c = C().shot, at = localOf(world, q);
  q.shotIn -= dt;
  if (q.shotIn > 0 || !world.pirates.length || !nearSector(at)) return;
  let best = null, bd = c.reach;
  for (const p of world.pirates) {
    if (p.mode === 'leave') continue;
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  q.shotIn = c.every;
  const lead = bd / c.speed, a = Math.atan2(best.y + (best.vy ?? 0) * lead - at.y, best.x + (best.vx ?? 0) * lead - at.x);
  q.aim = a; q.aimAt = world.time;
  const x = at.x + Math.cos(a) * 30, y = at.y + Math.sin(a) * 30;
  world.bullets.push({ x, y, vx: q.vx + Math.cos(a) * c.speed, vy: q.vy + Math.sin(a) * c.speed, life: c.life, owner: 'clipper' });
  world.emit('shotFired', { owner: 'clipper', x, y, sectorId: world.sector.id });
}

// At TERRA: KWLSK's thanks, a turn round it at `orbit` u off its rim, slowing to a stop; then ROUXEE's last word.
function beginRound(world, q) {
  const to = terraAt(world), dx = q.x - to.x, dy = q.y - to.y;
  q.stage = 'round';
  q.say = [];
  queue(q.say, LINES.bye, world.time);
  q.round = { a: Math.atan2(dy, dx), r: Math.hypot(dx, dy), t: 0, dir: dx * q.vy - dy * q.vx < 0 ? -1 : 1 };
}
function round(world, q, dt) {
  const c = C(), to = terraAt(world), R = q.round;
  R.t += dt;
  const k = R.t < c.round ? 1 : Math.exp(-(R.t - c.round) / c.stop);
  R.a += R.dir * c.spin * k * dt;
  R.r += (rim() + c.orbit - R.r) * Math.min(1, dt * 1.5);
  const x = to.x + Math.cos(R.a) * R.r, y = to.y + Math.sin(R.a) * R.r;
  q.vx = (x - q.x) / dt; q.vy = (y - q.y) / dt; q.x = x; q.y = y;
  if (k > 0.2) q.course = Math.atan2(q.vy, q.vx);
  q.nose = q.course + 0.04 * Math.sin(world.time * 4.7);
  q.engine = k > 0.35;
  if (R.t >= c.round + 4 * c.stop) { q.stage = 'still'; q.vx = 0; q.vy = 0; queue(q.say, LINES.last, world.time); }
}

function step(world, s, dt, end) {
  const q = s.q;
  if (q.stage === 'gone') return;
  if (q.stage === 'follow') {
    follow(world, q, dt);
    fight(world, q);
    const to = terraAt(world);
    if (to && Math.hypot(to.x - q.x, to.y - q.y) <= rim() + C().arrive) beginRound(world, q);
  } else if (q.stage === 'round') round(world, q, dt);
  if (q.stage !== 'still') shoot(world, q, dt);
  const at = localOf(world, q);
  for (const e of sayDue(world, q.say, at)) if (e.line === LINES.last[0][1]) q.beamAt = world.time + readLife(e.line);
  // ROUXEE's last word has stood its time: the beam takes them (the look where they are, the page's drawing lent: world.clipperArt).
  if (q.beamAt != null && world.time >= q.beamAt) {
    const craft = world.clipperArt?.craft();
    if (craft && nearSector(at)) noteVanish(world, 'craft', craft, { x: at.x, y: at.y, vx: 0, vy: 0, angle: q.nose });
    q.stage = 'gone';
    end.win(world);
  }
}

// Its plate and pointer: TERRA, or, while the crew waits a screen behind, back to them.
function words(world, s) {
  const q = s.q, t = terraOf(world);
  const terra = t && { sectorId: t.sector, x: t.x, y: t.y, mark: 'special-place', reach: rim() + C().arrive };
  let target = terra;
  if (q?.lag) {
    const col = Math.floor(q.x / W), row = Math.floor(q.y / H), sector = neighbourOf(world.sector, col - world.sector.col, row - world.sector.row);
    if (sector) target = { sectorId: sector.id, x: q.x / W - col, y: q.y / H - row, mark: 'special-place', reach: C().follow };
  }
  return { title: QL.special.escort(), sub: q?.lag ? QL.special.escortBack() : QL.special.escortTo(TERRA.label), pointer: q?.lag ? 'CLIPPER' : 'TERRA',
    target, win: QL.special.escorted(), lose: [QL.special.failed(), QL.special.missed()] };
}

// Drawn where it is: its look in its paint, by the page (labs/graphics/clipper-art.js); standing, its nose hunting where it points.
function draw(world, s, r, t) {
  const q = s.q;
  if (!q || q.stage === 'gone') return;
  const at = localOf(world, q), p = world.project(r, at.x, at.y);
  if (r.onScreen(p.x, p.y, 220)) world.clipperArt?.draw(r, p.x, p.y, q.nose, { engine: q.engine, fly: Math.hypot(q.vx, q.vy) > 25, t });
}
function drawStanding(world, s, r, t, p) { world.clipperArt?.draw(r, p.x, p.y, standingNose(s, t), { t }); }

export const clipper = Object.freeze({ plan, rows: () => LINES.meet.map(([, line]) => line), meet, standing, start, step, words, draw, drawStanding });

// ---- for the page ----------------------------------------------------------------------------------------------------------------

// Where CLIPPER is and where its nose points, in the pilot's sector's units (its hails, the talk's picture), or null where it is not near.
export function clipperPose(world) {
  const s = world.special;
  if (s?.id !== CLIPPER_ID) return null;
  if (s.stage === 'seen') return s.site.sectorId === world.sector.id ? { x: s.site.x, y: s.site.y, angle: standingNose(s, world.time) } : null;
  const q = s.q;
  if (!q || q.stage === 'gone') return null;
  const at = localOf(world, q);
  return nearSector(at) ? { x: at.x, y: at.y, angle: q.nose } : null;
}
// Where a strip of the crew stands (World.craftAt): CLIPPER's place, its drawing's size for the shoulder.
export function crewCraftAt(world) {
  const at = clipperPose(world);
  return at ? { x: at.x, y: at.y, craft: { rows: Array(6).fill(' '.repeat(8)), scale: 1.5 } } : null;
}
