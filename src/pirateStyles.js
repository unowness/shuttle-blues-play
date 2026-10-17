// How a squad fights: the behaviour presets of CONFIG.pirates.styles (SX, 2026-10-17: «А с пиратами довольно скучно сражаться ... они
// довольно однообразно ведут себя и довольно медленные»; «лаб с пресетами P1 FASTER, P2 PACK, P3 MOVES»). P0 is the fight as it was and
// asks nothing of this file: a pirate made without a style (a check's, a tool's) or under P0 has no `moves` and no `cutoff`, draws on
// no stream and flies as src/pirates.js always flew it. The rest is read where the flight reads it: the craft once, when spawnPirates
// makes a pirate (applyPirateStyle); the attack slots in src/pirateAttacks.js (pressureSlots); the cutoff's way, the passes, the boost,
// the sidestep and the retreat in src/pirates.js stepPirate through the functions below. Chance is the world's 'pirate-moves' stream.
// P4 CHARACTERS deals those out by kind (styleFor: a kind's own sections laid over the squad's), with a few of its own: a kind's
// brain, gun and range numbers, its attack pattern's (src/pirateAttacks.js reads `p.tune`), a fan of bolts (src/pirates.js), its
// character's points held in a span (temperTraits, before the pirate is made), a break away after its own shot or from a pilot too
// near, and the squad's reinforcement after a gang cleared quickly (the 'pirate-reinforce' stream).
import { CONFIG } from './config.js';
import { PIRATE_ATTACKS } from './pirateAttackConfig.js';
import { attackCommitted } from './pirateAttacks.js';
import { clamp, lerp, hypot2 } from './util.js';

export const PIRATE_STYLE_IDS = Object.freeze(Object.keys(CONFIG.pirates.styles));

// The style a world's new pirates take: the lab's (world.pirateStyle) or the game's (CONFIG.pirates.style).
export function styleIdOf(world) {
  const id = world?.pirateStyle;
  return id && CONFIG.pirates.styles[id] ? id : CONFIG.pirates.style;
}

// What a style asks of one kind: the squad's sections with the kind's own (`kinds`) laid over them, made once for each pair.
const RESOLVED = new Map();
export function styleFor(id, type) {
  const key = `${id}/${type}`;
  let S = RESOLVED.get(key);
  if (!S) {
    const base = CONFIG.pirates.styles[id] ?? CONFIG.pirates.styles[CONFIG.pirates.style], own = base.kinds?.[type];
    S = own ? { ...base, ...own } : base;
    RESOLVED.set(key, S);
  }
  return S;
}

// A pirate's character (src/personas.js) held inside its kind's span (`temper`), before it is made: a MAW is never a coward. A copy;
// the points outside the span move to its edge, the rest stay. No chance drawn.
export function temperTraits(id, type, traits) {
  const T = styleFor(id, type).temper;
  if (!T || !traits) return traits;
  const out = { ...traits };
  for (const [trait, [least, most]] of Object.entries(T)) out[trait] = clamp(out[trait] ?? 0, least, most);
  return out;
}

// Laid on a pirate once, as it is made: its craft scaled, its kind's numbers, and the moves' state it keeps. A pirate keeps its style
// for its life.
export function applyPirateStyle(world, p, id = styleIdOf(world)) {
  const S = styleFor(id, p.type);
  p.styleId = id;
  p.style = S;
  if (S.craft) {
    const K = p.K, c = S.craft;
    K.maxSpeed *= c.speed; K.thrust *= c.push; K.retro *= c.push; K.strafe *= c.push;
    K.turnRate *= c.turn; K.turnAccel *= c.turn;
  }
  if (S.brain) p.B = { ...p.B, ...S.brain };
  if (S.weapon) p.W = { ...p.W, ...S.weapon };
  if (S.range) p.standoff *= S.range;
  if (S.attack && PIRATE_ATTACKS[p.type]) p.tune = { ...PIRATE_ATTACKS[p.type], ...S.attack };
  if (S.moves) {
    const rng = world.rng('pirate-moves'), M = S.moves;
    p.moves = {
      aimedFor: 0, side: 0, sideDir: 0, sideCool: 0,
      boost: 0, boostIn: M.boost ? lerp(M.boost.every[0], M.boost.every[1], rng()) : Infinity,
      retreating: false, retreatCool: 0,
      pass: null, passSide: p.orbitDir,
    };
  }
  return p;
}

// ------------------------------------------------------------------- P2 PACK ---

// A squad's cutoff: its fastest gunner hunting (a DART first, then a lead WARLORD, a BRUTE; a ram never, a WARLORD's cover never),
// by id on a tie. Asked once a step for every squad of a style with a `cutoff` (src/pirates.js stepPirates); the next takes over when it
// is gone. Returns nothing: it marks `p.cutoff`.
const CUTOFF_RANK = { dart: 0, jackal: 0, warlord: 1, needle: 3, tender: 3, brute: 2, weaver: 2 };
const rankOf = (p) => { const i = p.style.cutoffRank?.indexOf(p.type) ?? -1; return i >= 0 ? i : p.style.cutoffRank ? 9 : CUTOFF_RANK[p.type] ?? 4; };
const best = new Map();   // kept between calls: asked every step, it makes nothing
export function assignCutoffs(world) {
  best.clear();
  for (const p of world.pirates) {
    if (!p.style?.cutoff) continue;
    const able = p.mode !== 'leave' && p.mode !== 'guard' && !(p.B.ramSpeed > 0) && p.role !== 'cover' && p.squad;
    p.cutoff = false;
    if (!able) continue;
    const held = best.get(p.squad);
    const rank = rankOf(p);
    if (!held || rank < held.rank || (rank === held.rank && (p.K.maxSpeed > held.p.K.maxSpeed ||
        (p.K.maxSpeed === held.p.K.maxSpeed && p.id < held.p.id)))) best.set(p.squad, { p, rank });
  }
  for (const held of best.values()) held.p.cutoff = true;
  best.clear();
}

// The cutoff's wanted velocity (into `out`): to the point ahead on the pilot's course, or, a pilot near still, to the far side of the
// squad from it. `tx, ty` and `seen` are the ship as the pirate believes it. Its nose stays the hunt's: on the pilot.
export function cutoffVelocity(world, p, tx, ty, out) {
  const L = p.style.cutoff, B = p.B, seen = p.seen;
  const sv = hypot2(seen.vx, seen.vy);
  let gx, gy;
  if (sv > L.minSpeed) {
    const ahead = clamp(sv * L.lead, L.ahead[0], L.ahead[1]);
    gx = tx + (seen.vx / sv) * ahead; gy = ty + (seen.vy / sv) * ahead;
  } else {
    // The far side of the pilot from the rest of the squad, at its own range: a pincer.
    let cx = 0, cy = 0, n = 0;
    for (const q of world.pirates) {
      if (q === p || q.squad !== p.squad || q.mode === 'leave') continue;
      const d = world.delta(q.x, q.y, tx, ty);
      cx += d.x; cy += d.y; n++;
    }
    const ax = n ? -cx / n : world.delta(p.x, p.y, tx, ty).x, ay = n ? -cy / n : world.delta(p.x, p.y, tx, ty).y;
    const al = hypot2(ax, ay) || 1;
    gx = tx + (ax / al) * p.standoff; gy = ty + (ay / al) * p.standoff;
  }
  const to = world.delta(gx, gy, p.x, p.y);
  const gap = hypot2(to.x, to.y) || 1;
  const fly = Math.min(B.approachMax, L.gain * gap);
  out.x = seen.vx + (to.x / gap) * fly;
  out.y = seen.vy + (to.y / gap) * fly;
}

// ------------------------------------------------------------------ P3 MOVES ---

// At each of its looks: has the pilot's nose held on it long enough to jink aside? `gap` is the time since the look before; `steady`,
// whether its own attack holds it (then it does not jink).
export function lookMoves(world, p, gap, steady) {
  const m = p.moves, S = p.style.moves.sidestep;
  if (!S) return;
  const ship = world.ship;
  const d = world.delta(p.x, p.y, ship.x, ship.y);
  const bearing = Math.atan2(d.y, d.x);
  const off = Math.abs(Math.atan2(Math.sin(bearing - ship.angle), Math.cos(bearing - ship.angle)));
  m.aimedFor = off < S.cone && hypot2(d.x, d.y) < S.range ? m.aimedFor + gap : 0;
  if (m.side > 0 || m.sideCool > 0 || steady || p.mode !== 'hunt' || m.aimedFor < S.after) return;
  const rng = world.rng('pirate-moves');
  if (rng() >= S.chance) { m.sideCool = lerp(S.cool[0], S.cool[1], rng()) * 0.5; return; }
  m.side = S.time;
  m.sideDir = rng() < 0.5 ? -1 : 1;
  m.sideCool = lerp(S.cool[0], S.cool[1], rng());
  m.aimedFor = 0;
}

// The timers of the moves, once a step; a break away from a pilot too near (`shy`); a boost when it is due closing in from afar.
export function tickMoves(world, p, dt, dist) {
  const m = p.moves, M = p.style.moves;
  m.side = Math.max(0, m.side - dt);
  m.sideCool = Math.max(0, m.sideCool - dt);
  m.boost = Math.max(0, m.boost - dt);
  m.retreatCool = Math.max(0, m.retreatCool - dt);
  if (p.mode !== 'hunt') m.pass = null;      // a pass is the hunt's: off for coins, breaking away or back at a post, it is over
  if (M.shy && dist < M.shy && m.retreatCool <= 0) startRetreat(world, p);
  if (!M.boost) return;
  m.boostIn -= dt;
  if (m.boostIn <= 0) {
    m.boostIn = lerp(M.boost.every[0], M.boost.every[1], world.rng('pirate-moves')());
    if (p.mode === 'hunt' && dist > p.standoff * 1.2) startBoost(world, p);
  }
}

// A burst: its top and push raised for a moment, and a puff of its drive's colour thrown out behind it.
const PUFF = ['\u00b7', '\u2219', '\u00b7'];
export function startBoost(world, p) {
  const M = p.style?.moves?.boost;
  if (!M || p.moves.boost > 0) return;
  p.moves.boost = M.time;
  const drive = (CONFIG.pirates.paints.find((q) => q.id === p.paint) ?? CONFIG.boss.escort.paint).drive;
  const back = p.angle + Math.PI, r = p.radius;
  world.particles.burst(p.x + Math.cos(back) * r, p.y + Math.sin(back) * r, PUFF.map((ch) => ({ ch, color: drive })),
    { vx: p.vx * 0.4, vy: p.vy * 0.4, speed: [60, 160], life: [0.2, 0.45], aim: back });
  world.emit('pirateBoost', { pirateId: p.id, kind: p.type, x: p.x, y: p.y, sectorId: world.sector.id });
}

// How much more than its own push a pirate's thrusters give this step: a jink's, a boost's, or none.
export function movesPush(p) {
  const m = p.moves, M = p.style.moves;
  return Math.max(1, m.side > 0 ? M.sidestep.push : 1, m.boost > 0 ? M.boost.push : 1);
}
// Its top this step: raised in a burst (a boost or a jink).
export function movesTop(p) {
  const m = p.moves, B = p.style.moves.boost;
  return p.K.maxSpeed * (B && (m.boost > 0 || m.side > 0) ? B.top : 1);
}

// A hit (src/encounters.js hurtPirate): a chance to break away and come back on a boost.
export function hitMoves(world, p) {
  const R = p.style?.moves?.retreat;
  if (!R || !p.moves || p.moves.retreatCool > 0 || world.rng('pirate-moves')() >= R.chance) return false;
  return startRetreat(world, p);
}
// Its own shot fired (src/pirates.js): one that `scoot`s breaks away to another place at once, a sniper's habit.
export function shotMoves(world, p) {
  if (p.style?.moves?.scoot) startRetreat(world, p);
}
// Away from the pilot for a moment, then back on a boost (src/pirates.js, the break's way). Not a ram, not mid-attack, not a guard;
// returns whether it went.
export function startRetreat(world, p) {
  const R = p.style?.moves?.retreat;
  if (!R || p.hp <= 0 || p.mode !== 'hunt' || attackCommitted(p) || p.B.ramSpeed > 0) return false;
  const rng = world.rng('pirate-moves');
  p.mode = 'break';
  p.modeTimer = lerp(R.time[0], R.time[1], rng());
  p.swerve = rng() < 0.5 ? -1 : 1;
  p.moves.retreating = true;
  p.moves.retreatCool = R.cool;
  p.moves.pass = null;
  return true;
}

// A pass instead of circling (into `out`): returns false while it is still far and closes as before. `rel` is from the ship (as the
// pirate believes it) to the pirate.
export function passVelocity(world, p, relx, rely, dist, dt, out) {
  const M = p.style.moves.passes, m = p.moves;
  if (!M || p.role === 'cover') return false;
  if (m.pass) {
    m.pass.time -= dt;
    if (relx * m.pass.dx + rely * m.pass.dy > M.out || m.pass.time <= 0) m.pass = null;
  }
  if (!m.pass) {
    if (dist > p.standoff * M.engage) return false;
    m.passSide = -m.passSide;
    const ux = -relx / (dist || 1), uy = -rely / (dist || 1);                 // the pirate to the ship
    const miss = lerp(M.miss[0], M.miss[1], world.rng('pirate-moves')());
    const gx = -relx - uy * m.passSide * miss, gy = -rely + ux * m.passSide * miss;
    const gl = hypot2(gx, gy) || 1;
    m.pass = { dx: gx / gl, dy: gy / gl, time: M.time };
    startBoost(world, p);
  }
  out.x = p.seen.vx + m.pass.dx * p.K.maxSpeed * M.speed;
  out.y = p.seen.vy + m.pass.dy * p.K.maxSpeed * M.speed;
  return true;
}

// ------------------------------------------------------------ reinforcement ---

// A gang cleared (src/encounters.js endEncounter): a style's `reinforce` may send more of it, in its paint, a moment later. Never for a
// fight that was a reinforcement, nor one that took longer than `within` s. Kept on the world as a time and what comes (not saved).
export function scheduleReinforcement(world, enc, seconds) {
  const R = enc.reinforce && CONFIG.pirates.styles[enc.reinforce.styleId]?.reinforce;
  if (!R || enc.reinforced || seconds > R.within) return false;
  const rng = world.rng('pirate-reinforce');
  if (rng() >= R.chance) return false;
  world.reinforcement = { at: world.time + lerp(R.delay[0], R.delay[1], rng()), count: R.count, paint: enc.reinforce.paint,
    styleId: enc.reinforce.styleId, sectorId: world.sector.id };
  return true;
}
// Every step while one is due: it comes when its time is, unless the pilot is gone, docked, in a refuge or in another sector.
export function stepReinforcement(world) {
  const r = world.reinforcement;
  if (!r || world.time < r.at) return;
  world.reinforcement = null;
  const ship = world.ship;
  if (!ship.alive || world.docked || world.boss || world.sector.id !== r.sectorId || world.inSafeZone(ship.x, ship.y)) return;
  world.spawnPirates(r.count, { paint: r.paint, style: r.styleId, reinforced: true });
}
