import { stepAttack, attackShot, attackCommitted, cancelAttack } from './pirateAttacks.js';
import { clearGroundPath } from './groundMath.js';
import { CONFIG } from './config.js';
import { LEGACY_PIRATE_TYPES } from './pirateAttackConfig.js';
import { workingKind } from './ruins.js';
import { TAU, clamp, lerp, wrapTo, hypot2 } from './util.js';
import { WRAP, PLANE } from './topology.js';
import { personaBrain, personaWeapon, personaCraft, hideChance, hideTime, wantsToRun, shoutFor } from './personas.js';
import { wakePost, besieged, harass } from './raids.js';

// Pirates (SX, 2026-09-29): armed craft that chase the ship and shoot at it,
// one or a group of two to four, four hit points each. Their bullets can hit one
// another, they can fly into a rock, and a pilot they destroy loses every coin
// and the cargo. A pirate that explodes drops loose coins, and another pirate
// may pick them up first. The rules that touch the rest of the world (hits,
// coins, the wreck, the encounter) live in World; this file is the craft itself:
// its physics, its pilot (the hunt, and the greed for loose coins) and its drawing.
//
// A pirate is transient. It is never saved; a reload ends the fight. There are
// four kinds (CONFIG.pirates.types, SX's choice of 2026-09-30): the BRUTE, an
// armoured one that closes steadily, the MAW, which rams, the WARLORD, a flagship
// whose squad hangs back behind its lead and fires over it, and the DART, a chaser
// that closes in. They share this code and differ in numbers, in a ram and a
// squad role, and in how they are drawn. They come in squads of two to four of
// one kind in one paint (CONFIG.pirates.paints).
//
// The pilot sees the ship only every CONFIG.pirates.brain.react seconds and
// plans a wanted velocity from that old look, so it overshoots a pilot who
// brakes or turns. It flies to the wanted velocity with its own limits: weaker
// turning than the ship, a slower top speed than the ship's red step, a small
// sideways thruster to circle with its nose on the target. The steering
// randomness comes from World.rng('pirate'), so a check or a simulation can seed it.

const wrapPi = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

// A roughly normal variate of unit sigma from three uniform draws.
const gauss = (rng) => (rng() + rng() + rng() - 1.5) * 2;

// ------------------------------------------------------------------ drawing ---

// The looks are SX's choice (2026-09-30, from labs/graphics/sketches/pirate-squads.html:
// the BRUTE, the MAW and the WARLORD, and the DART of 2026-09-29, in four paints), glyph drawings
// nose up in cells of the renderer's measured font at CONFIG.pirates.scale (the
// ship's own default), turned with the heading the way the ship is. What a pirate
// looks like is its type's `art` and `parts` and its squad's paint; its guns are
// always CONFIG.pirates.ink, the orange its shots are, whatever the paint. The lab
// passes the paints' inks through (labs/graphics/world-art.js).

// A squad's paint by id, or the first. The boss's escort wears a paint of its own (CONFIG.boss.escort.paint), found here and never rolled.
export function piratePaint(id) {
  const list = CONFIG.pirates.paints, escort = CONFIG.boss.escort.paint;
  return list.find((q) => q.id === id) || (id === escort.id ? escort : null) || list[0];
}
// The ink a cell of `part` is drawn in, in `paint`.
export function partInk(part, paint) {
  if (part === 'g') return CONFIG.pirates.ink;
  if (part === 't') return paint.trim;
  if (part === 'm') return paint.mark;
  if (part === 'e') return paint.drive;
  return paint.hull;
}
// Every ink a pirate may be drawn in: the guns, the flash, and the paints'; the boss's escort's and the boss's own (src/bossConfig.js),
// so the world draws them as they are, not as the pilot's ship (labs/graphics/world-art.js), and the NPC rule keeps clear of them.
const ESCORT = CONFIG.boss.escort.paint;
export const PIRATE_INKS = new Set([CONFIG.pirates.ink, CONFIG.pirates.flash.ink,
  ...[...CONFIG.pirates.paints, ESCORT].flatMap((q) => [q.hull, q.trim, q.mark, q.drive]), ...Object.values(CONFIG.boss.art.palette)]);

export function drawPirate(r, sx, sy, p) {
  const C = CONFIG.pirates, T = C.types[p.type];
  const rows = T.art, paint = piratePaint(p.paint);
  const w = r.cellW * C.scale, h = r.cellH * C.scale;
  const a = p.angle + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
  const cols = rows[0].length;
  rows.forEach((row, j) => Array.from(row).forEach((ch, i) => {
    if (ch === ' ') return;
    const part = T.parts?.[j]?.[i] ?? 'h';
    // A hit that did not finish it shows as a flash of the whole drawing; an engine burns brighter under thrust.
    const ink = p.flash > 0 ? C.flash.ink : partInk(part, paint);
    const alpha = part === 'e' && !(p.flash > 0) ? (p.thrusting ? 1 : 0.7) : 1;
    const lx = (i - (cols - 1) / 2) * w, ly = (j - (rows.length - 1) / 2) * h;
    r.glyphRot(ch, sx + lx * ca - ly * sa, sy + lx * sa + ly * ca, a, ink, alpha, C.scale);
  }));
}

// The glyphs a pirate comes apart into, placed as drawn and turned with it.
export function pirateGlyphs(p) {
  const C = CONFIG.pirates, T = C.types[p.type];
  const rows = T.art, paint = piratePaint(p.paint);
  const cw = 9 * C.scale, ch = 15 * C.scale;   // a nominal cell: debris is not measured against the font
  const a = p.angle + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
  const cols = rows[0].length;
  const out = [];
  rows.forEach((row, j) => Array.from(row).forEach((glyph, i) => {
    if (glyph === ' ') return;
    const lx = (i - (cols - 1) / 2) * cw, ly = (j - (rows.length - 1) / 2) * ch;
    out.push({ dx: lx * ca - ly * sa, dy: lx * sa + ly * ca, ch: glyph, color: partInk(T.parts?.[j]?.[i] ?? 'h', paint), size: C.scale });
  }));
  return out;
}

// ------------------------------------------------------------------- craft ---

export class Pirate {
  // `type` is a key of CONFIG.pirates.types; its overrides are laid over the
  // base craft, weapon, brain and ram rule (the gunner's, which were the RAIDER's)
  // once, here, so a pirate keeps the numbers it was made with. `side` is which way
  // it circles first (+1 or -1); a group alternates so its members come at the ship
  // from both flanks. `paint` is its squad's (CONFIG.pirates.paints). `squad` names
  // the group it was made with (null for a pirate on its own) and `rank` is its
  // place in it, 0 the first: in a kind that has a `cover` (the WARLORD) rank 0 is the
  // lead and the rest are covers, and when the lead is gone the next one leads.
  // `traits` is its character (src/personas.js: greed, daring, aggression, cowardice, 0-10 each), laid over the kind's
  // numbers once, here; without one it flies as the kind's numbers say, as every pirate did before 2026-10-02.
  constructor(id, type, x, y, angle, speed, side, rng, paint = CONFIG.pirates.paints[0].id, squad = null, rank = 0, traits = null) {
    const C = CONFIG.pirates;
    const T = C.types[type];
    this.type = type;
    this.paint = paint;
    this.squad = squad;
    this.traits = traits;
    this.K = personaCraft({ ...C.craft, ...T.craft }, traits);
    this.W = personaWeapon({ ...C.weapon, ...T.weapon }, traits);
    this.B = personaBrain({ ...C.brain, ...T.brain }, traits);
    this.R = { ...C.ram, ...T.ram };
    this.id = id;
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.angle = angle;
    this.angVel = 0;
    this.hp = T.hp ?? C.hp;
    this.maxHp = this.hp;
    this.flash = 0;                // seconds left of the flash a hit that did not finish it leaves
    this.ramGrace = 0;             // seconds in which a ram counts for nothing (it is being knocked back)
    this.rockGrace = 0;            // seconds in which a rock counts for nothing (it has just been struck and bounced off)
    this.hold = 0;                 // coins it has picked up; dropped again when it explodes
    this.greedCool = 0;            // seconds before it may break off for coins again
    this.greedGot = 0;             // coins taken in the grab it is on
    this.coin = null;              // the loose coin it is going for
    this.radius = this.K.radius;
    // 'hunt', 'break' (away from a too-close ship), 'greed' (off for loose coins), 'hide' (behind a rock between
    // shots, a daring one), 'guard' (circling its post, src/raids.js, until the pilot comes near), 'loot' (the
    // wreck's coins), 'leave' (the fight is over for it).
    this.mode = 'hunt';
    this.post = null;              // { stationId, kind, x, y, radius, wake }: the station it guards or besieges (src/raids.js)
    this.posted = null;            // the kind of post it was made at ('guard', 'raid'), kept when the post is done with
    this.squadSize = 1;            // how many its squad was made with (a coward counts the losses against it)
    this.cover = null;             // the rock or planet it hides behind
    this.fled = false;             // it ran (cowardice): gone without a fight
    this.closedIn = false;         // it has come in to its range once (an aggressive one says so)
    this.modeTimer = 0;
    this.leaveTimer = 0;
    this.swerve = side;
    this.standoffAt = rng();       // where in its kind's range it keeps, 0 to 1 (kept, so a change of role moves it the same way)
    this.standoff = lerp(this.B.standoff[0], this.B.standoff[1], this.standoffAt);
    this.role = 'lead';            // 'cover' for the ones that hang back behind a lead (a kind with `cover`)
    this.orbitDir = side;
    this.flipIn = lerp(this.B.strafeFlip[0], this.B.strafeFlip[1], rng());
    this.weaveRate = TAU / lerp(this.B.weavePeriod[0], this.B.weavePeriod[1], rng());
    this.weavePhase = rng() * TAU;
    this.cooldown = lerp(this.W.firstDelay[0], this.W.firstDelay[1], rng());
    this.seen = null;              // the ship as last looked at: { x, y, vx, vy }
    this.alert = false;            // watching for the pilot's shots (re-rolled at each look)
    this.careful = false;          // holding fire for a wingman in the way (likewise)
    this.watching = true;          // looking where it flies (likewise)
    this.lapse = 0;                // s its mind still wanders for (brain.lapse)
    this.senseIn = 0;
    this.senseAge = 0;
    this.sinceLook = 0;            // seconds since the look before this one (greed is a rate, rolled at looks)
    this.thrusting = false;
    this.retroing = false;
    this.age = 0;
    if (rank > 0) this.setRole('cover');
  }

  draw(r, sx, sy) { drawPirate(r, sx, sy, this); }

  debris() { return pirateGlyphs(this); }

  // The brain of a squad's cover, or of a lead again: the kind's own numbers with the
  // cover's laid over them, and the range it keeps moved to match.
  setRole(role) {
    const C = CONFIG.pirates, T = C.types[this.type];
    if (!T.cover || role === this.role) return;
    const greed = this.B.greed;
    this.role = role;
    this.B = { ...personaBrain({ ...C.brain, ...T.brain, ...(role === 'cover' ? T.cover : null) }, this.traits, { keepGreed: true }), greed };
    this.standoff = lerp(this.B.standoff[0], this.B.standoff[1], this.standoffAt);
  }
}

// ------------------------------------------------------------ steering maths ---

// The heading that puts a shot of `speed` (relative to the shooter) on a target
// at (rx, ry) moving at (wx, wy) relative to the shooter, assuming it holds its
// velocity. With no solution it aims straight at it. Shared with the scripted
// pilots of tools/pirate-sim.mjs, which lead their shots the same way.
export function interceptAngle(rx, ry, wx, wy, speed, life = Infinity) {
  const a = wx * wx + wy * wy - speed * speed;
  const b = 2 * (rx * wx + ry * wy);
  const c = rx * rx + ry * ry;
  let t = -1;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-9) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
      const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
      t = lo > 0 ? lo : hi;
    }
  }
  if (!(t > 0)) t = Math.sqrt(c) / speed;
  t = Math.min(t, life);
  return Math.atan2(ry + wy * t, rx + wx * t);
}

// How many ships a group has, from the configured shares.
export function pickGroupSize(rng, table = CONFIG.pirates.groupSize) {
  const total = table.reduce((s, [, share]) => s + share, 0);
  let u = rng() * total;
  for (const [n, share] of table) {
    u -= share;
    if (u < 0) return n;
  }
  return table[table.length - 1][0];
}

// The kinds of a squad of `count` ships: one kind, drawn by each kind's
// `share`, for all of them (SX, 2026-09-30: «пираты летают только отрядами по
// 2-4 корабля в одном типе спрайта»). Since SX's gangs (2026-10-15) a zone's squad is mixed (pickMixedTypes); one kind is a
// single ship's, a ruin's guards' and a pestering squad's.
export function pickTypes(count, rng, C = CONFIG.pirates) {
  const ids = LEGACY_PIRATE_TYPES.filter((id) => C.types[id]);
  const total = ids.reduce((sum, id) => sum + C.types[id].share, 0);
  let u = rng() * total, kind = ids[ids.length - 1];
  for (const id of ids) {
    u -= C.types[id].share;
    if (u < 0) { kind = id; break; }
  }
  return Array.from({ length: count }, () => kind);
}

// The hulls of a raid's squad and of a gang (every squad of two or more that comes for the ship), mixed (SX, 2026-10-02: «причем разные типы кораблей но все в одной раскраске»): one of
// each kind in a random order first, then the rest drawn by each kind's `share`, so a squad of four or more shows every
// hull and a bigger one repeats them. The paint stays the squad's one (spawnPirates), so the drawing varies, the colour does not.
export function pickMixedTypes(count, rng, C = CONFIG.pirates) {
  const ids = LEGACY_PIRATE_TYPES.filter((id) => C.types[id]);
  const first = ids.map((id) => ({ id, at: rng() })).sort((a, b) => a.at - b.at).map((o) => o.id);
  const total = ids.reduce((sum, id) => sum + C.types[id].share, 0);
  return Array.from({ length: count }, (_, i) => {
    if (i < first.length) return first[i];
    let u = rng() * total;
    for (const id of ids) { u -= C.types[id].share; if (u < 0) return id; }
    return ids[ids.length - 1];
  });
}

// A squad's paint, one of CONFIG.pirates.paints, evenly.
export function pickPaint(rng, C = CONFIG.pirates) {
  return C.paints[Math.min(C.paints.length - 1, Math.floor(rng() * C.paints.length))].id;
}

// An acceleration to add to the one wanted so the craft clears what lies ahead.
// It looks only `avoidHorizon` seconds along its own velocity (and at least
// `avoidLook` u), and only in the share of its looks that it is watching
// (`avoidAttention`): that is the imperfection. Anything met at a speed the craft cannot turn away from in the
// time it has left is hit. Rocks, planets (their surface), holes (well out) and
// the safe radius of stations are all obstacles.
function dodge(world, p, out) {
  const C = CONFIG.pirates, B = p.B, K = p.K, topo = world.topology;
  out.x = 0; out.y = 0; out.urgency = 0;
  const consider = (ox, oy, radius, ovx = 0, ovy = 0) => {
    // In the obstacle's own frame: where it is and how fast the pirate closes.
    const vx = p.vx - ovx, vy = p.vy - ovy;
    const speed2 = vx * vx + vy * vy;
    if (speed2 < B.avoidMinSpeed * B.avoidMinSpeed) return;
    const speed = Math.sqrt(speed2);
    const relx = topo.dx(ox, p.x), rely = topo.dy(oy, p.y);
    const tca = (relx * vx + rely * vy) / speed2;
    // It looks `avoidHorizon` seconds ahead when fast, and never less than
    // `avoidLook` u ahead however slow: a craft that sees a rock only when it is
    // a hull's length away could not turn from it at any speed.
    const look = Math.max(B.avoidHorizon, B.avoidLook / speed);
    if (tca <= 0 || tca > look) return;
    const mx = relx - vx * tca, my = rely - vy * tca;
    const miss = hypot2(mx, my);
    const rho = radius + K.radius + B.avoidMargin;
    if (miss >= rho) return;
    // Away from the obstacle, across the line of flight; dead ahead it picks
    // the side it is circling toward.
    let ex, ey;
    if (miss > 1e-3) { ex = -mx / miss; ey = -my / miss; }
    else { ex = -vy / speed * p.orbitDir; ey = vx / speed * p.orbitDir; }
    // The sideways speed it must gain to pass with `avoidMargin` to spare,
    // asked for over `avoidTau` seconds: quick, because there is little time.
    const need = (rho - miss) / Math.max(tca, B.avoidMinTime);
    out.x += ex * need / B.avoidTau;
    out.y += ey * need / B.avoidTau;
    out.urgency = Math.max(out.urgency, 1 - tca / look);
  };
  // A rock's outline swings out to 1.2 of its nominal radius.
  for (const a of world.asteroids) consider(a.x, a.y, a.radius * 1.2, a.vx, a.vy);
  for (const a of world.attractors) {
    consider(a.x, a.y, a.kind === 'hole' ? a.kill * B.holeWide : a.kill + B.planetMargin);
  }
  for (const s of world.stations) consider(s.x, s.y, refuge(world, s));
}

// How far from a station pirates keep: its safe radius, or only its hull for a
// ruin not yet rebuilt (src/ruins.js), which shelters nobody, and for a station under a raid (src/raids.js).
function refuge(world, s) {
  return workingKind(world.ledger, s) === 'ruin' || besieged(world, s) ? s.hullRadius : CONFIG.pirates.safe.radius;
}

// A push, as an acceleration, out of the way of the pilot's shots it can see
// coming: a shot older than `dodgeReact` seconds (so it has had time to be
// noticed) that will pass within a hull's width of it inside `dodgeHorizon`
// seconds. The push is across the shot's line, away from it, harder the closer
// the shot. A shot from close by cannot be dodged: there is no time left.
function dodgeShots(world, p, out) {
  const C = CONFIG.pirates, B = p.B, topo = world.topology;
  out.x = 0; out.y = 0;
  const reach = p.radius + C.weapon.bulletRadius + B.dodgeMargin;
  for (const b of world.bullets) {
    if (b.owner === 'pirate' || CONFIG.bullet.life - b.life < B.dodgeReact) continue;
    const relx = topo.dx(p.x, b.x), rely = topo.dy(p.y, b.y);       // from the shot to the pirate
    if (hypot2(relx, rely) > B.dodgeRange) continue;
    const wx = b.vx - p.vx, wy = b.vy - p.vy;
    const w2 = wx * wx + wy * wy;
    if (w2 < 1) continue;
    const tca = (relx * wx + rely * wy) / w2;
    if (tca <= 0 || tca > B.dodgeHorizon) continue;
    const mx = relx - wx * tca, my = rely - wy * tca;
    const miss = hypot2(mx, my);
    if (miss >= reach) continue;
    let ex, ey;
    if (miss > 1e-3) { ex = mx / miss; ey = my / miss; }
    else { const w = Math.sqrt(w2); ex = -wy / w * p.orbitDir; ey = wx / w * p.orbitDir; }
    const urgency = clamp(1 - tca / B.dodgeHorizon, 0.25, 1);
    out.x += ex * urgency;
    out.y += ey * urgency;
  }
  const m = Math.hypot(out.x, out.y);
  if (m < 1e-6) { out.x = 0; out.y = 0; return; }
  out.x = (out.x / m) * B.dodgeAccel;
  out.y = (out.y / m) * B.dodgeAccel;
}

// Whether another pirate stands between this one and the point it is aiming
// at, inside `clearCone` of the line. It sees only what is between it and the
// ship, so a shot that misses and flies on, or a wingman that crosses the line
// after the shot leaves, can still hit one.
export function wingmanInWay(world, p, aim, dist) {
  const B = p.B;
  for (const q of world.pirates) {
    if (q === p || q.mode === 'leave') continue;
    const d = world.delta(q.x, q.y, p.x, p.y);
    const gap = Math.hypot(d.x, d.y);
    if (gap > dist || gap < 1e-6) continue;
    if (Math.abs(wrapPi(Math.atan2(d.y, d.x) - aim)) < B.clearCone) return true;
  }
  return false;
}

// Pirates keep out of each other's way inside `spacing`, so a group spreads
// instead of flying as one clump; but only while they are looking where they fly
// (`watching`, CONFIG.pirates.brain.avoidAttention): a pirate with its mind on the
// ship drifts into a wingman, and the two can collide (stepPirates).
function separate(world, p, out) {
  const B = p.B;
  out.x = 0; out.y = 0;
  if (p.watching === false) return;
  for (const q of world.pirates) {
    if (q === p || q.mode === 'leave') continue;
    const d = world.delta(p.x, p.y, q.x, q.y);
    const dist = Math.hypot(d.x, d.y);
    if (dist >= B.spacing || dist < 1e-6) continue;
    const push = (1 - dist / B.spacing) * B.separation;
    out.x += (d.x / dist) * push;
    out.y += (d.y / dist) * push;
  }
}

// The nearest loose coin within `range` u, or null. Only the loose ones (World.drops:
// broken rocks', a wallet's spill, a dead pirate's): never a pilot's authored coin or
// what a cache holds, and never a fuel canister from a rock (SX, 2026-09-30: only the
// pilot's tank takes those).
function nearestCoin(world, p, range) {
  let best = null, bestGap = range;
  for (const d of world.drops) {
    if (d.kind) continue;                 // oil and a droid's parts are the pilot's, never a pirate's
    const g = world.delta(d.x, d.y, p.x, p.y);
    const gap = Math.hypot(g.x, g.y);
    if (gap < bestGap) { best = d; bestGap = gap; }
  }
  return best;
}

// Any coin the hull touches goes into the hold (not one still flung out of a wallet
// or a wreck: those are untouchable for a moment, for it as for the pilot).
function takeCoins(world, p) {
  const G = p.B.greed, drops = world.drops;
  const reach = p.radius + G.reach;
  let took = 0;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.delay > 0 || d.kind) continue;
    const g = world.delta(d.x, d.y, p.x, p.y);
    if (Math.hypot(g.x, g.y) > reach || !clearGroundPath(world, d, p)) continue;
    drops.splice(i, 1);
    took += d.value;
  }
  if (!took) return;
  p.hold += took;
  p.greedGot += took;
  world.particles.burst(p.x, p.y, [{ ch: '+', color: CONFIG.pickup.sparkColor }, { ch: '\u00b7', color: CONFIG.pickup.sparkColor }],
    { vx: p.vx * 0.5, vy: p.vy * 0.5, speed: [30, 90], life: [0.2, 0.45] });
  world.emit('pirateLoot', { pirateId: p.id, kind: p.type, coins: took, hold: p.hold, x: p.x, y: p.y, sectorId: world.sector.id });
}

// A grab is over: it hunts again, and does not go for coins again for a while.
function endGreed(world, p, reason) {
  world.emit('pirateGreedEnd', { pirateId: p.id, kind: p.type, got: p.greedGot, reason, sectorId: world.sector.id });
  p.mode = 'hunt';
  p.greedCool = p.B.greed.cooldown;
  p.coin = null;
}

// A short shout at the pirate for acting on `trait` (SX, 2026-10-02: «выкрики короткие»), said as the hails are
// (src/feedback.js drawHail), when it has the points for it and has not shouted lately, nor any pirate just now.
export function pirateShout(world, p, trait) {
  const S = CONFIG.pirates.personas;
  if ((world.time - (p.shoutAt ?? -Infinity)) < S.gap || (world.time - world.shoutAt) < S.apart) return null;
  const line = shoutFor(p.traits, trait, world.rng('pirate'));
  if (!line) return null;
  p.shoutAt = world.shoutAt = world.time;
  world.emit('pirateShout', { pirateId: p.id, kind: p.type, trait, line, x: p.x, y: p.y, sectorId: world.sector.id });
  return line;
}

// How many of a pirate's squad are gone (down, or run): what a coward weighs.
function squadLost(world, p) {
  if (!p.squad) return 0;
  let here = 0;
  for (const q of world.pirates) if (q.squad === p.squad && q.mode !== 'leave') here++;
  return Math.max(0, p.squadSize - here);
}

// A coward runs (src/personas.js wantsToRun): it leaves as a pirate that has given up does, shouting, and counts as
// beaten for whatever it was guarding. The last of a fight to run ends it: the pilot won.
export function pirateFlees(world, p, why) {
  cancelAttack(world, p, 'fled');
  p.mode = 'leave';
  p.leaveTimer = CONFIG.pirates.leave.time;
  p.coin = null;
  p.fled = true;
  pirateShout(world, p, 'cowardice');
  world.emit('pirateFled', { pirateId: p.id, kind: p.type, why, x: p.x, y: p.y, sectorId: world.sector.id, post: p.post?.stationId ?? null });
  world.pirateGone?.(p, 'fled');
  if (world.encounter && !world.pirates.some((q) => q.mode !== 'leave' && q.mode !== 'guard')) world.endEncounter('routed', { leave: true });
}

// What a daring pirate hides behind: the rock or planet nearest it within `reach`, the place behind it from the ship.
function coverOf(world, o) {
  const B = CONFIG.pirates.brain;
  return o.kind === 'planet' ? o.kill + B.planetMargin : o.radius * 1.2;
}
function findCover(world, p) {
  const H = CONFIG.pirates.personas.daring.hide;
  let best = null, bestGap = H.reach;
  const consider = (o) => {
    const d = world.delta(o.x, o.y, p.x, p.y);
    const gap = Math.hypot(d.x, d.y) - coverOf(world, o);
    if (gap < bestGap) { best = o; bestGap = gap; }
  };
  for (const a of world.asteroids) if (a.radius >= 40) consider(a);
  for (const a of world.attractors) if (a.kind === 'planet') consider(a);
  return best;
}
function startHide(world, p) {
  const cover = findCover(world, p);
  if (!cover) return false;
  p.mode = 'hide';
  p.cover = cover;
  p.modeTimer = hideTime(world.rng('pirate'));
  if (world.rng('pirate')() < 0.5) pirateShout(world, p, 'daring');
  return true;
}

// ---------------------------------------------------------------- one step ---

const AVOID = { x: 0, y: 0, urgency: 0 };
const APART = { x: 0, y: 0 };
const DUCK = { x: 0, y: 0 };

// What a pirate's attack pattern is handed each step (src/pirateAttacks.js stepAttack): one object, filled again for each pirate, so a
// step makes none (it made one a pirate a step from 2026-10-09 to 2026-10-13). A pattern reads it during its call and keeps nothing.
const ATTACK_CONTEXT = { aim: 0, want: 0, vdx: 0, vdy: 0, dist: 0, rx: 0, ry: 0, targetable: false, avoidUrgency: 0, separateX: 0, separateY: 0 };

function stepPirate(world, p, dt) {
  const C = CONFIG.pirates, K = p.K, B = p.B, W = p.W;
  const ship = world.ship, rng = world.rng('pirate');
  const targetable = ship.alive && !world.docked;
  p.age += dt;
  p.flash = Math.max(0, p.flash - dt);
  p.ramGrace = Math.max(0, p.ramGrace - dt);
  p.rockGrace = Math.max(0, p.rockGrace - dt);
  p.greedCool = Math.max(0, p.greedCool - dt);
  p.lapse = Math.max(0, (p.lapse ?? 0) - dt);

  // What it knows of the ship: a look every `react` seconds, then the old
  // velocity carried on.
  if (targetable) {
    p.senseIn -= dt;
    p.sinceLook += dt;
    if (!p.seen || p.senseIn <= 0) {
      p.seen = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };
      p.senseAge = 0;
      const gap = p.sinceLook;
      p.sinceLook = 0;
      p.senseIn = B.react * (1 + (rng() * 2 - 1) * B.reactJitter);
      // Whether it is watching for shots during this look: it is not always.
      p.alert = rng() < B.dodgeSkill;
      // ... and whether it looks for a wingman in its line of fire.
      p.careful = rng() < B.clearSkill;
      // ... and whether it is looking where it flies.
      p.watching = rng() < B.avoidAttention;
      // ... and whether its mind wanders (`lapse`, a rate a second like greed): for a second or two it neither looks
      // at the ship again nor where it flies, and holds its fire, flying on what it last saw, so it overshoots and
      // runs into things (SX, 2026-10-01: «почему-то пираты мало тупят»).
      if (B.lapse && gap > 0 && rng() < 1 - Math.exp(-B.lapse.rate * gap)) {
        p.lapse = lerp(B.lapse.time[0], B.lapse.time[1], rng());
        p.senseIn = p.lapse;
        p.watching = false;
        p.alert = false;
      }
      // ... and whether loose coins nearby tempt it away from the hunt: a rate per
      // second, so how often it looks (`react`) does not change how greedy it is.
      if (p.mode === 'hunt' && !attackCommitted(p) && p.greedCool <= 0 && world.pirates.reduce((n, q) => n + (q.mode === 'greed' ? 1 : 0), 0) < B.greed.max) {
        const coin = nearestCoin(world, p, B.greed.radius);
        if (coin && rng() < 1 - Math.exp(-B.greed.rate * gap)) {
          p.mode = 'greed';
          p.modeTimer = B.greed.time;
          p.greedGot = 0;
          p.coin = coin;
          world.emit('pirateGreed', { pirateId: p.id, kind: p.type, x: p.x, y: p.y, sectorId: world.sector.id });
          pirateShout(world, p, 'greed');
        }
      }
      // ... and whether it has had enough (cowardice): its own hull, or its squad's losses.
      if (p.traits && p.mode !== 'guard' && p.mode !== 'loot' && p.mode !== 'leave') {
        const run = wantsToRun(p.traits, p.hp, p.maxHp, squadLost(world, p), p.squadSize);
        if (run) { pirateFlees(world, p, run); return; }
      }
    }
  }
  if (!p.seen) p.seen = { x: ship.x, y: ship.y, vx: 0, vy: 0 };
  p.senseAge += dt;
  const tx = p.seen.x + p.seen.vx * p.senseAge;
  const ty = p.seen.y + p.seen.vy * p.senseAge;

  const R = world.delta(tx, ty, p.x, p.y);
  const dist = Math.hypot(R.x, R.y) || 1;
  const rx = R.x / dist, ry = R.y / dist;

  // After the kill (World.endEncounter `loot`): the wreck's coins, every one within reach, then away.
  if (p.mode === 'loot') {
    const coin = nearestCoin(world, p, C.loot.seized.reach);
    p.modeTimer -= dt;
    if (!coin || p.modeTimer <= 0) {
      p.coin = null;
      if (p.post) p.mode = 'guard';                  // back to its post (src/raids.js)
      else { p.mode = 'leave'; p.leaveTimer = C.leave.time; }
    } else p.coin = coin;
  }

  // A guard (src/raids.js) wakes, with its squad, once the pilot has been near it a moment (CONFIG.pirates.guard).
  if (p.mode === 'guard') {
    const d = world.delta(ship.x, ship.y, p.x, p.y);
    p.post.noticed = targetable && Math.hypot(d.x, d.y) < p.post.wake ? (p.post.noticed ?? 0) + dt : 0;
    if (p.post.noticed >= CONFIG.pirates.guard.notice) wakePost(world, p);
    // A squad round a ship it is pestering fires at it while it has not noticed the pilot (src/raids.js).
    if (p.mode === 'guard') harass(world, p, dt);
  }

  const leaving = p.mode === 'leave';
  const guarding = p.mode === 'guard';
  let aim = p.angle;            // where a shot has to go to meet the ship
  let want = p.angle;           // the heading it is turning toward
  let vdx = p.vx, vdy = p.vy;   // the velocity it wants

  if (leaving) {
    // Away from the ship at speed, until the timer runs out.
    const away = world.delta(p.x, p.y, ship.x, ship.y);
    const ad = Math.hypot(away.x, away.y) || 1;
    vdx = (away.x / ad) * K.maxSpeed * 0.85;
    vdy = (away.y / ad) * K.maxSpeed * 0.85;
    want = Math.atan2(vdy, vdx);
    p.leaveTimer -= dt;
  } else {
    if (p.mode === 'greed') {
      // Still coins to get, still time, and the fight not over: go on.
      const coin = nearestCoin(world, p, B.greed.radius * 1.5);
      p.modeTimer -= dt;
      if (!coin) endGreed(world, p, 'gone');
      else if (p.modeTimer <= 0) endGreed(world, p, 'time');
      else p.coin = coin;
    }
    if (p.mode === 'hide') {
      // Out again when its time is up, or when the rock it was behind is gone.
      p.modeTimer -= dt;
      if (p.modeTimer <= 0 || (p.cover && p.cover.kind !== 'planet' && !world.asteroids.includes(p.cover))) { p.mode = 'hunt'; p.cover = null; }
    }
    if (p.mode === 'break') {
      p.modeTimer -= dt;
      if (p.modeTimer <= 0) p.mode = 'hunt';
    } else if (!attackCommitted(p) && p.mode !== 'greed' && p.mode !== 'loot' && !guarding && targetable && dist < B.breakRange) {
      p.mode = 'break';
      p.modeTimer = B.breakTime;
      p.swerve = p.orbitDir;
    }

    p.flipIn -= dt;
    if (p.flipIn <= 0 && !guarding) {
      p.orbitDir = -p.orbitDir;
      p.flipIn = lerp(B.strafeFlip[0], B.strafeFlip[1], rng());
    }

    aim = interceptAngle(R.x, R.y, p.seen.vx - p.vx, p.seen.vy - p.vy, W.muzzleSpeed, W.life);

    // What lies ahead, if it is watching: a push aside, and a lifting of the
    // throttle the nearer the danger.
    if (p.watching || attackCommitted(p)) dodge(world, p, AVOID);
    else { AVOID.x = 0; AVOID.y = 0; AVOID.urgency = 0; }

    if (guarding) {
      // Round its post, a little ahead of where it is on the ring, at a stroll; nose along the way it flies.
      const G = CONFIG.pirates.guard, post = p.post;
      const rel = world.delta(p.x, p.y, post.x, post.y);
      const at = Math.atan2(rel.y, rel.x) + p.orbitDir * G.lead;
      const to = world.delta(post.x + Math.cos(at) * post.radius, post.y + Math.sin(at) * post.radius, p.x, p.y);
      const gap = Math.hypot(to.x, to.y) || 1;
      const fly = Math.min(G.speed, 1.5 * gap);
      vdx = (to.x / gap) * fly;
      vdy = (to.y / gap) * fly;
    } else if (p.mode === 'hide') {
      // Behind its cover from the ship (a daring one between shots), held off it by `gap`.
      const H = CONFIG.pirates.personas.daring.hide, o = p.cover;
      const from = world.delta(o.x, o.y, ship.x, ship.y);
      const fd = Math.hypot(from.x, from.y) || 1;
      const off = coverOf(world, o) + p.radius + H.gap;
      const to = world.delta(o.x + (from.x / fd) * off, o.y + (from.y / fd) * off, p.x, p.y);
      const gap = Math.hypot(to.x, to.y) || 1;
      const fly = Math.min(H.speed, 2.5 * gap);
      vdx = (o.vx || 0) + (to.x / gap) * fly;
      vdy = (o.vy || 0) + (to.y / gap) * fly;
    } else if (p.mode === 'break') {
      const away = Math.atan2(-ry, -rx) + p.swerve * B.breakSwerve;
      vdx = p.seen.vx + Math.cos(away) * B.breakSpeed;
      vdy = p.seen.vy + Math.sin(away) * B.breakSpeed;
      want = away;
    } else if (p.mode === 'greed' || p.mode === 'loot') {
      // Straight for the coin, easing as it closes so it touches it and does not fly through.
      const to = world.delta(p.coin.x, p.coin.y, p.x, p.y);
      const gap = Math.hypot(to.x, to.y) || 1;
      const fly = Math.min(p.mode === 'loot' ? C.loot.seized.speed : B.greed.speed, 2.5 * gap);
      vdx = p.coin.vx + (to.x / gap) * fly;
      vdy = p.coin.vy + (to.y / gap) * fly;
    } else if (B.ramSpeed > 0) {
      // A ram: straight for the ship, about `ramSpeed` faster than it (each keeps its
      // own pace, a little over or under, so a squad arrives one after another and
      // not as a knot), all the way in. It holds no range and circles nothing; the
      // craft's own limits decide how it overshoots a ship that turns.
      const pace = B.ramSpeed * (0.85 + 0.3 * p.standoffAt);
      vdx = p.seen.vx + rx * pace;
      vdy = p.seen.vy + ry * pace;
    } else {
      // Closing speed: proportional to the range still to cover, but never more
      // than it can brake from before the standoff; inside the standoff it
      // backs away instead.
      const S = p.standoff;
      let close;
      if (dist >= S) {
        const stop = Math.sqrt(2 * B.brake * Math.max(0, dist - S * B.brakeMargin));
        close = Math.min(B.approachGain * (dist - S), stop, B.approachMax) * (1 - B.avoidBrake * AVOID.urgency);
      } else {
        close = Math.max(B.approachGain * (dist - S), -B.backSpeed);
      }
      // Circling, only near the standoff.
      const ring = clamp((S * B.strafeFar - dist) / (S * (B.strafeFar - 1.2)), 0, 1);
      const around = p.orbitDir * B.strafeSpeed * ring;
      vdx = p.seen.vx + rx * close - ry * around;
      vdy = p.seen.vy + ry * close + rx * around;
    }

    separate(world, p, APART);
    vdx += APART.x;
    vdy += APART.y;
    const wanted = Math.hypot(vdx, vdy);
    if (wanted > K.maxSpeed) { vdx *= K.maxSpeed / wanted; vdy *= K.maxSpeed / wanted; }

    if (p.mode === 'hunt' && targetable && dist < B.aimRange) want = aim;
    else if (guarding) { if (Math.hypot(vdx, vdy) > 30) want = Math.atan2(vdy, vdx); }
    else if (p.mode !== 'break' && Math.hypot(vdx - p.vx, vdy - p.vy) > 30) want = Math.atan2(vdy - p.vy, vdx - p.vx);
    // An aggressive one says so as it first comes in to its range.
    if (p.mode === 'hunt' && targetable && !p.closedIn && dist < p.standoff * 1.15) { p.closedIn = true; pirateShout(world, p, 'aggression'); }
  }

  // The pilot proposes ordinary motion; the attack owns its committed direction.
  const c = ATTACK_CONTEXT;
  c.aim = aim; c.want = want; c.vdx = vdx; c.vdy = vdy; c.dist = dist; c.rx = rx; c.ry = ry; c.targetable = targetable;
  c.avoidUrgency = leaving ? 0 : AVOID.urgency; c.separateX = leaving ? 0 : APART.x; c.separateY = leaving ? 0 : APART.y;
  const pattern = stepAttack(world, p, dt, c);
  aim = pattern.aim ?? aim; want = pattern.want ?? want;
  vdx = pattern.vdx ?? vdx; vdy = pattern.vdy ?? vdy;

  // The acceleration that would close the velocity error, split across the
  // nose and across it, and what the craft can actually give.
  let adx = (vdx - p.vx) / B.velocityTau, ady = (vdy - p.vy) / B.velocityTau;
  if (!leaving && (p.watching || pattern.steady || pattern.avoid)) { adx += AVOID.x; ady += AVOID.y; }
  // A greedy one grabbing coins does not watch for shots (src/personas.js `reckless`).
  if (!pattern.steady && !leaving && p.alert && !(p.mode === 'greed' && B.greed.reckless)) {
    dodgeShots(world, p, DUCK);
    adx += DUCK.x; ady += DUCK.y;
  }
  const turn = clamp(K.turnGain * wrapPi(want - p.angle), -K.turnRate, K.turnRate);
  p.angVel += (turn - p.angVel) * clamp(K.turnAccel * dt, 0, 1);
  p.angle = wrapPi(p.angle + p.angVel * dt);
  const fx = Math.cos(p.angle), fy = Math.sin(p.angle);
  // A weave on top: a sideways push that swings one way and the other, so its
  // velocity is never steady long enough for a shot led on it to arrive where
  // it was aimed. It costs the pirate's own aim nothing (its shots carry the
  // sideways velocity and are aimed with it), only the pilot's.
  const weave = !pattern.steady && !leaving && !guarding && dist < B.weaveRange ? B.weaveAccel * Math.sin(p.age * p.weaveRate + p.weavePhase) : 0;
  const along = clamp(adx * fx + ady * fy, -K.retro, K.thrust);
  const across = clamp(-adx * fy + ady * fx + weave, -K.strafe, K.strafe);
  p.thrusting = along > 60;
  p.retroing = along < -60;

  // The world acts on it as on the ship: gravity, a planet's cushion, a dead
  // edge's current.
  const g = world.gravityAt(p.x, p.y);
  const o = world.orbitAccel(p.x, p.y, p.vx, p.vy);
  const e = world.boundaryAccel(p.x, p.y, p.vx, p.vy);
  p.vx += (fx * along - fy * across + g.x + o.ax + e.ax) * dt;
  p.vy += (fy * along + fx * across + g.y + o.ay + e.ay) * dt;
  const k = Math.max(0, 1 - K.drag * dt);
  p.vx *= k; p.vy *= k;
  const sp = hypot2(p.vx, p.vy);
  if (sp > K.maxSpeed) { p.vx *= K.maxSpeed / sp; p.vy *= K.maxSpeed / sp; }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (world.topology.mode === WRAP) { p.x = wrapTo(p.x, world.width); p.y = wrapTo(p.y, world.height); }

  // A station's safe radius is a wall to them (a ruin's hull only).
  for (const s of world.stations) {
    const dx = world.topology.dx(p.x, s.x), dy = world.topology.dy(p.y, s.y);
    const dd = hypot2(dx, dy);
    const wall = refuge(world, s);
    if (dd >= wall || dd < 1e-6) continue;
    const nx = dx / dd, ny = dy / dd;
    p.x = s.x + nx * wall;
    p.y = s.y + ny * wall;
    const into = p.vx * nx + p.vy * ny;
    if (into < 0) { p.vx -= nx * into; p.vy -= ny * into; }
  }

  takeCoins(world, p);

  // The gun: only on the hunt (not breaking away, not off for coins).
  p.cooldown = Math.max(0, p.cooldown - dt);
  if (pattern.fire === true && p.mode === 'hunt' && targetable && world.patternVisible?.(p) !== false && p.cooldown <= 0 && !(p.lapse > 0) && dist <= W.range &&
      Math.abs(wrapPi(p.angle - aim)) < W.cone && !world.inSafeZone(ship.x, ship.y) &&
      !(p.careful && wingmanInWay(world, p, aim, dist))) {
    const heading = (pattern.steady ? aim : p.angle) + (pattern.exact ? 0 : gauss(rng) * W.error);
    const ux = Math.cos(heading), uy = Math.sin(heading);
    world.bullets.push({
      x: p.x + ux * W.muzzleOffset, y: p.y + uy * W.muzzleOffset,
      vx: p.vx + ux * W.muzzleSpeed, vy: p.vy + uy * W.muzzleSpeed,
      life: W.life, owner: 'pirate', by: p.id, kind: p.type, damage: W.damage,
    });
    world.emit('shotFired', { owner: 'pirate', kind: p.type, x: p.x, y: p.y, sectorId: world.sector.id });
    p.cooldown = pattern.cooldown ?? W.interval * (1 + (rng() * 2 - 1) * W.jitter);
    attackShot(world, p);
    // A daring one may slip behind a rock until its gun is ready again.
    const hide = hideChance(p.traits);
    if (!attackCommitted(p) && hide > 0 && rng() < hide) startHide(world, p);
  }
}

// Two pirates that touch (SX, 2026-10-01: «пусть они чуть чаще тупят, попадают друг в друга и врезаются
// друг в друга и объекты, пока гоняются за персонажем»): each pays what a rock at that closing speed would
// cost (CONFIG.pirates.hurt.bump: the rock rule, never under `min`), and they are knocked apart, equal
// masses, giving back `restitution` of the closing speed. One contact counts once (`grace` s).
function collideWingmen(world) {
  const H = CONFIG.pirates.hurt.bump;
  const list = world.pirates;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i], q = list[j];
      if (!p || !q || p.mode === 'leave' || q.mode === 'leave') continue;
      const d = world.delta(q.x, q.y, p.x, p.y);
      const dist = Math.hypot(d.x, d.y), touch = p.radius + q.radius;
      if (dist >= touch || dist < 1e-6) continue;
      const nx = d.x / dist, ny = d.y / dist;            // from p to q
      const closing = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
      const push = (touch - dist) / 2;
      p.x -= nx * push; p.y -= ny * push; q.x += nx * push; q.y += ny * push;
      if (closing <= 0) continue;
      const j2 = ((1 + H.restitution) * closing) / 2;
      p.vx -= nx * j2; p.vy -= ny * j2; q.vx += nx * j2; q.vy += ny * j2;
      if ((p.bumpGrace || 0) > 0 || (q.bumpGrace || 0) > 0 || closing < H.speed) continue;
      p.bumpGrace = q.bumpGrace = H.grace;
      const amount = Math.max(H.min, world.pirateImpact(closing));
      const x = p.x + nx * p.radius, y = p.y + ny * p.radius;
      world.hurtPirate(p, 'collision', { amount, x, y, aim: Math.atan2(-ny, -nx) });
      world.hurtPirate(q, 'collision', { amount, x, y, aim: Math.atan2(ny, nx) });
    }
  }
}

// What a rock costs a pirate that meets it at `closing` u/s (SX, 2026-10-09: «Пиратам поменьше урон при столкновении с камнями, а то они
// за один удар об камень взрываются»): nothing under `hurt.rock.touchSpeed`; otherwise `share` of its hit points at `refSpeed`, times
// (closing / refSpeed) to `power`, rounded, never under one. A rock used to destroy a pirate at once, whatever it had left. Pure: the
// check and the pirate sim read this one rule.
export function rockBlow(closing, maxHp) {
  const R = CONFIG.pirates.hurt.rock;
  if (!(closing >= R.touchSpeed)) return 0;
  return Math.max(1, Math.round(maxHp * R.share * (closing / R.refSpeed) ** R.power));
}

// A pirate that has met a rock (stepPirates): set on the rock's rim, with what it closed on the rock taken off its velocity as a bump of
// two pirates takes it (restitution `hurt.bump.restitution`). The rock goes on. `d` is the way from the rock to the pirate, `dist` its
// length, `rim` the rock's outline there and the hull's radius. Returns the speed it closed on the rock at (0 if it was moving off it),
// for the cost of the blow, which a squad strolling its post does not pay.
function turnOffRock(p, a, d, dist, rim) {
  const nx = dist > 1e-6 ? d.x / dist : 1, ny = dist > 1e-6 ? d.y / dist : 0;
  p.x += nx * (rim - dist + 1);
  p.y += ny * (rim - dist + 1);
  const into = (p.vx - (a.vx || 0)) * nx + (p.vy - (a.vy || 0)) * ny;
  if (into >= 0) return 0;
  const back = into * (1 + CONFIG.pirates.hurt.bump.restitution);
  p.vx -= nx * back;
  p.vy -= ny * back;
  return -into;
}

// Every pirate one step, then what the group as a whole is doing: did they
// crash, did they lose the ship, did the ship reach a refuge.
export function stepPirates(world, dt) {
  const C = CONFIG.pirates, topo = world.topology;
  const ship = world.ship;
  const list = world.pirates;

  if (world.encounter && world.docked) world.endEncounter('docked', { leave: true });
  else if (world.encounter && !ship.alive) world.endEncounter('wrecked', { leave: true });

  // A squad that has lost its lead follows the next: the first of its covers still flying.
  for (const p of list) {
    if (p.role !== 'cover' || p.mode === 'leave') continue;
    if (!list.some((q) => q.squad === p.squad && q.role === 'lead' && q.mode !== 'leave')) p.setRole('lead');
  }

  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (!p) continue;
    stepPirate(world, p, dt);

    // Crashes. A hull that reaches a hole's horizon or a planet's surface is gone. A hull that touches a rock is bounced off it and
    // pays a part of its hit points (rockBlow; it was gone at once until 2026-10-09); the rock is not broken and pays nothing.
    let crash = null;
    if (world.consumedByHole(p.x, p.y, 0)) crash = 'hole';
    if (!crash) {
      for (const a of world.attractors) {
        if (a.kind !== 'planet') continue;
        if (hypot2(topo.dx(p.x, a.x), topo.dy(p.y, a.y)) < a.kill) { crash = 'planet'; break; }
      }
    }
    if (!crash) {
      for (const a of world.asteroids) {
        const dx = topo.dx(p.x, a.x), dy = topo.dy(p.y, a.y);
        const dist = hypot2(dx, dy);
        if (dist > a.radius * 1.3 + p.radius) continue;
        const rim = a.radiusAt(Math.atan2(dy, dx) - a.angle) + p.radius;
        if (dist > rim) continue;
        // A squad strolling its post is turned off the rock, not wrecked by it (SX, 2026-10-08: «около разбитых станций нет пиратов даже
        // в квестах, должно быть от 4 до 8 всегда»): the rocks of a dense field drift through the ring, and every guard they killed
        // counted as beaten, so a ruin was cleared, and a raid won, with no shot fired. Hunting, they still meet rocks (SX's «врезаются»)
        // and pay for it, a part of their hit points (rockBlow), no longer all of them.
        if (p.mode === 'guard') { turnOffRock(p, a, { x: dx, y: dy }, dist, rim); continue; }
        const closing = turnOffRock(p, a, { x: dx, y: dy }, dist, rim);
        const blow = p.rockGrace > 0 ? 0 : rockBlow(closing, p.maxHp);
        if (blow > 0) {
          p.rockGrace = CONFIG.pirates.hurt.rock.grace;
          const nx = dist > 1e-6 ? dx / dist : 1, ny = dist > 1e-6 ? dy / dist : 0;
          world.hurtPirate(p, 'rock', { amount: blow, x: p.x - nx * p.radius, y: p.y - ny * p.radius, aim: Math.atan2(ny, nx) });
          if (!list.includes(p)) break;     // it was destroyed (killPirate took it out of the squad)
        }
      }
    }
    if (crash) { world.killPirate(p, crash); continue; }
    if (!list.includes(p)) continue;
    if (p.bumpGrace > 0) p.bumpGrace -= dt;

    // Gone quietly: broke off and flown away, or past the limits of the map.
    if ((p.mode === 'leave' && (p.leaveTimer <= 0)) ||
        (world.topology.mode === PLANE && world.beyondLimits(p.x, p.y, 0))) {
      world.removePirate(p);
    }
  }

  collideWingmen(world);

  const enc = world.encounter;
  if (!enc || !ship.alive) return;
  // A pilot who has outrun them, or who has sat in a refuge long enough.
  let nearest = Infinity;
  for (const p of list) {
    if (p.mode === 'leave' || p.mode === 'guard') continue;
    const d = world.delta(p.x, p.y, ship.x, ship.y);
    nearest = Math.min(nearest, Math.hypot(d.x, d.y));
  }
  enc.farFor = nearest > C.lose.range ? enc.farFor + dt : 0;
  if (enc.farFor >= C.lose.time) { world.endEncounter('lost'); return; }
  enc.safeFor = world.inSafeZone(ship.x, ship.y) ? enc.safeFor + dt : 0;
  if (enc.safeFor >= C.safe.linger) world.endEncounter('station', { leave: true });
}
