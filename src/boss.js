// The boss TOLLKEEPER in the world (chat 6 of docs/plans/2026-10-13-next-chats.md, step 2): a pirates' tug, a core towing two gun sleds on
// tethers, launching its escort out of a bay. Its numbers and drawing are CONFIG.boss (src/bossConfig.js); it is drawn by
// labs/graphics/boss-art.js. The fight grew from the sheet's prototype (labs/graphics/sketches/boss-arena.js), measured there.
//
//   spawnBoss        the boss at a place, whole, nose to the pilot: World.boss
//   stepBoss         its step: the motion (M1, it holds a range), its sleds on their tethers, its patterns in turn by its phase, the sleds'
//                    own guns, its launches
//   resolveBossHits  the pilot's shots on the core and the sleds; a touch of the core or a sled on the hull (a ram)
//   bossCue          what its warning lights now, for the drawing
//
// The boss is not a pirate: it is not in World.pirates, no encounter counts it, and its shots are a pirate's (owner 'pirate', by 'boss'), so
// they break on a pirate in their way as any pirate's do (src/encounters.js resolvePirateHits, with `onPirates` for what one costs) and cost
// the hull what `damage` says. Its escort are pirates, made by spawnPirates in their ASH paint, tagged `escort`. Chance is the world's
// (`world.rng('boss')`); the fight is never saved: a sector loaded (World.loadSector) ends it, and a wreck heals it whole.
import { CONFIG } from './config.js';
import { interceptAngle, pirateFlees } from './pirates.js';
import { clamp, wrapPi, TAU } from './util.js';

// The boss aims without noise (measured on the sheet: an error of 0.05 rad on its burst took a pilot slipping off the lead from 2.1 to 7.9
// hits a minute).

// A local point of the boss (x right, y toward the stern) in the world, its nose along `heading`.
export function bossPoint(b, lx, ly, heading = b.heading) {
  const a = heading + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
  return { x: b.x + lx * ca - ly * sa, y: b.y + lx * sa + ly * ca };
}
export const sledHook = (b, s) => bossPoint(b, s.side * CONFIG.boss.body.sled.hook.x, CONFIG.boss.body.sled.hook.y);
// Where a sled's arm holds it now: round its hook at its tether's length, swaying (`arms.sway` at `arms.rate`, the two half a turn
// apart), reaching forward while the core aims, spread aside while the spiral spins (`b.armPose`, eased toward the pattern's; local
// angles from the right toward the stern, so forward is toward the nose on each side).
function sledRest(b, s) {
  const S = CONFIG.boss.body.sled, A = CONFIG.boss.body.arms;
  const rx = s.side * (S.rest.x - S.hook.x), ry = S.rest.y - S.hook.y, len = Math.hypot(rx, ry);
  const f = (b.armPose ?? 0) + A.sway * Math.sin((b.armT ?? 0) * A.rate + (s.side > 0 ? 0 : Math.PI));
  const a = Math.atan2(ry, rx) - s.side * f;
  return bossPoint(b, s.side * S.hook.x + Math.cos(a) * len, S.hook.y + Math.sin(a) * len);
}
// The pose the arms ease toward: forward for the aimed burst, aside for the spiral, else at rest.
function armPoseFor(b) {
  const A = CONFIG.boss.body.arms, atk = b.attack;
  if (atk.phase === 'recover' || !atk.kind) return 0;
  return atk.kind === 'aimed' ? A.reach : atk.kind === 'spiral' ? A.spread : 0;
}

// The boss at (x, y), whole, its nose along `heading`, its sleds at their places behind it; with `entrance` (its quest's waking) its
// sleds start far out and fold in while it rests (CONFIG.boss.quest.entrance s).
export function spawnBoss(world, { x, y, heading = null, entrance = false, dormant = false } = {}) {
  const B = CONFIG.boss, ship = world.ship;
  const to = world.delta(ship.x, ship.y, x, y);
  const h = heading ?? Math.atan2(to.y, to.x);
  const b = {
    x, y, vx: 0, vy: 0, heading: h, hp: B.hp, flash: 0, flashAt: -Infinity, phase: 0, strafe: 0, queue: 0, launchedAt: -Infinity,
    attack: { kind: null, phase: 'recover', t: 0, dur: 1, n: 0, next: 0, data: {} },
    sleds: [-1, 1].map((side) => ({ side, x, y, vx: 0, vy: 0, angle: h, hp: B.body.sled.hp, on: true, spin: 0, flash: 0, flashAt: -Infinity,
      gun: { phase: 'recover', t: side > 0 ? B.sledGun.recover / 2 : 0, shots: 0 } })),
    defeated: false, armT: 0, armPose: 0,
    // Lying at its quest's mark until it reacts (src/bossQuest.js): it drifts and sways, its guns silent; a hit `provoked` it.
    dormant, provoked: false,
  };
  for (const s of b.sleds) {
    const at = sledRest(b, s), k = entrance ? 2.4 : 1;
    s.x = x + (at.x - x) * k; s.y = y + (at.y - y) * k;
  }
  if (entrance) b.attack.dur = B.quest.entrance;
  world.boss = b;
  world.emit('bossSpawned', { sectorId: world.sector.id, x, y });
  return b;
}

// The boss whole again where it is (the pilot was wrecked): every hit point, both sleds, resting.
export function healBoss(world) {
  const b = world.boss, B = CONFIG.boss;
  if (!b || b.defeated) return;
  b.hp = B.hp; b.phase = 0; b.queue = 0;
  Object.assign(b.attack, { kind: null, phase: 'recover', t: 0, dur: 2, n: 0, next: 0, data: {} });
  for (const s of b.sleds) {
    const at = sledRest(b, s);
    Object.assign(s, { x: at.x, y: at.y, vx: b.vx, vy: b.vy, angle: b.heading, hp: B.body.sled.hp, on: true, spin: 0, flash: 0 });
    Object.assign(s.gun, { phase: 'recover', t: 0, shots: 0 });
  }
  world.emit('bossHealed', { sectorId: world.sector.id });
}

const phaseOf = (b) => {
  const P = CONFIG.boss.phases, share = b.hp / CONFIG.boss.hp;
  let k = 0;
  for (let i = 0; i < P.length; i++) if (share <= P[i].from) k = i;
  return k;
};
const raging = (b) => !!CONFIG.boss.phases[b.phase].rage;
const escortOut = (world) => world.pirates.filter((p) => p.escort && p.hp > 0 && p.mode !== 'leave').length;

// What the warning lights now: the cells of the core's `cue`, the step the pattern is in and how far through it.
export function bossCue(b) {
  const atk = b?.attack;
  if (!atk?.kind) return null;
  return { cue: CONFIG.boss.patterns[atk.kind].cue, phase: atk.phase, u: atk.dur > 0 ? atk.t / atk.dur : 1, kind: atk.kind };
}

// ------------------------------------------------------------------------------------------------------------------------------ step ---

export function stepBoss(world, dt) {
  const b = world.boss;
  if (!b || b.defeated) return;
  const ship = world.ship;
  // A wreck heals it whole (SX, 2026-10-14: «если тебя убили у босса восстанавливается хп»); it waits, resting, while the pilot is gone.
  if (!ship.alive) { if (!b.healedForWreck) { healBoss(world); b.healedForWreck = true; } return; }
  b.healedForWreck = false;
  b.armT += dt;
  b.armPose += clamp(armPoseFor(b) - b.armPose, -2 * dt, 2 * dt);
  // Lying in wait: it holds its place, turning slowly toward the pilot, its arms swaying; nothing fires.
  if (b.dormant) {
    b.flash = Math.max(0, b.flash - dt);
    b.vx *= 1 - 0.8 * dt; b.vy *= 1 - 0.8 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const to = world.delta(ship.x, ship.y, b.x, b.y), C = CONFIG.boss.body.core;
    b.heading += clamp(wrapPi(Math.atan2(to.y, to.x) - b.heading), -C.turnRate * 0.3 * dt, C.turnRate * 0.3 * dt);
    stepSleds(world, b, dt);
    return;
  }
  const phase = phaseOf(b);
  if (phase !== b.phase) {
    b.phase = phase;
    world.emit('bossPhase', { phase, rage: raging(b), sectorId: world.sector.id, x: b.x, y: b.y });
  }
  b.flash = Math.max(0, b.flash - dt);
  const atk = b.attack;
  atk.t += dt;
  if (atk.t >= atk.dur) nextStep(world, b);
  moveBoss(world, b, dt);
  if (atk.kind && atk.phase === 'commit') commitStep(world, b);
  stepSleds(world, b, dt);
  // The escort's guns: no more than `slots` of it line up a shot at once (the pirates' own pressure slots).
  holdEscort(world);
}

function moveBoss(world, b, dt) {
  const B = CONFIG.boss, C = B.body.core, ship = world.ship, atk = b.attack;
  const to = world.delta(ship.x, ship.y, b.x, b.y), dist = Math.hypot(to.x, to.y) || 1;
  const charging = atk.kind === 'charge' && atk.phase === 'commit';
  if (charging) {
    const k = B.patterns.charge, ux = Math.cos(b.heading), uy = Math.sin(b.heading);
    const along = b.vx * ux + b.vy * uy;
    if (along < k.speed * (raging(b) ? B.rage.speed : 1)) { b.vx += ux * k.push * dt; b.vy += uy * k.push * dt; }
  } else {
    // M1: its range from the pilot along its own bearing, sliding to and fro across it; the bearing turned slowly, at `level` rad/s, to
    // `tilt` above the level, so it fights beside the pilot and a little above, where the view is wide and the cockpit is not. (The
    // bearing is the boss's own, not read from where it is: read so, the slide added up frame on frame into a swing of fifty degrees.)
    const H = B.hold;
    b.strafe += dt * H.rate;
    b.bearing ??= Math.atan2(-to.y, -to.x);
    const flat = Math.abs(wrapPi(b.bearing)) < Math.PI / 2 ? -H.tilt : Math.PI + H.tilt;
    b.bearing += clamp(wrapPi(flat - b.bearing), -H.level * dt, H.level * dt);
    const ux = Math.cos(b.bearing), uy = Math.sin(b.bearing), slide = Math.sin(b.strafe) * H.slide;
    const tx = ship.x + ux * H.range - uy * slide, ty = ship.y + uy * H.range + ux * slide;
    const d = world.delta(tx, ty, b.x, b.y);
    let wx = d.x * H.gain, wy = d.y * H.gain;
    const w = Math.hypot(wx, wy);
    if (w > C.maxSpeed) { wx *= C.maxSpeed / w; wy *= C.maxSpeed / w; }
    const dvx = wx - b.vx, dvy = wy - b.vy, dv = Math.hypot(dvx, dvy), most = C.accel * dt;
    const f = dv > most ? most / dv : 1;
    b.vx += dvx * f; b.vy += dvy * f;
    // After a charge it drifts out of it, slowing.
    if (atk.kind === 'charge' && atk.phase === 'recover') { b.vx *= 1 - 0.9 * dt; b.vy *= 1 - 0.9 * dt; }
    b.vx *= 1 - C.drag * dt; b.vy *= 1 - C.drag * dt;
  }
  // The rope of the world's dead edges and of its own smoke (World.boundaryAccel), as on a pirate.
  const rope = world.boundaryAccel(b.x, b.y, b.vx, b.vy);
  b.vx += rope.ax * dt; b.vy += rope.ay * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  // Turning: toward the pilot, slower than the pilot turns; a charge locks on while it is warned and holds its line once committed, and
  // turns back slowly after it (the window to answer it).
  if (!charging) {
    const want = Math.atan2(to.y, to.x);
    let rate = C.turnRate;
    if (atk.kind === 'charge' && atk.phase === 'prepare') rate = B.patterns.charge.lockTurn;
    if (atk.kind === 'charge' && atk.phase === 'recover') rate = C.turnRate * 0.45;
    b.heading += clamp(wrapPi(want - b.heading), -rate * dt, rate * dt);
  }
}

// The pattern's next step: prepare -> commit -> recover -> the next pattern of its phase's turn.
function nextStep(world, b) {
  const B = CONFIG.boss, atk = b.attack;
  if (atk.kind && atk.phase === 'prepare') { begin(world, b, atk.kind, 'commit'); return; }
  if (atk.kind && atk.phase === 'commit') { begin(world, b, atk.kind, 'recover'); return; }
  const script = B.phases[b.phase].script, ship = world.ship;
  const to = world.delta(ship.x, ship.y, b.x, b.y);
  // Too far from the pilot to be on its screen: it waits (and comes on, holding its range).
  if (world.docked || Math.hypot(to.x, to.y) > B.reach) { Object.assign(atk, { kind: null, phase: 'recover', t: 0, dur: 0.3 }); return; }
  let kind = script[b.queue % script.length];
  b.queue++;
  // A launch with the escort still out in strength, or too soon after the last, gives its turn to the next pattern.
  if (kind === 'launch' && !canLaunch(world, b)) kind = script[b.queue++ % script.length];
  if (kind === 'launch' && !canLaunch(world, b)) kind = 'aimed';
  begin(world, b, kind, 'prepare');
}

function begin(world, b, kind, phase) {
  const B = CONFIG.boss, k = B.patterns[kind], rage = raging(b) ? B.rage : null, atk = b.attack;
  const dur = phase === 'prepare' ? k.prepare * (rage ? rage.prepare : 1) : phase === 'recover' ? k.recover * (rage ? rage.recover : 1) : k.commit;
  Object.assign(atk, { kind, phase, t: 0, dur, n: 0, next: 0 });
  if (phase === 'prepare') atk.data = {};
  if (phase === 'commit' && kind === 'spiral') atk.data = { base: world.rng('boss')() * TAU, dir: world.rng('boss')() < 0.5 ? -1 : 1 };
  if (phase === 'commit' && kind === 'launch') b.launchedAt = world.time;
  world.emit('bossPattern', { pattern: kind, phase, sectorId: world.sector.id, x: b.x, y: b.y });
}

function canLaunch(world, b) {
  const E = CONFIG.boss.escort, alive = escortOut(world);
  return alive <= E.below && alive < E.cap && world.time - b.launchedAt >= E.apart;
}

// A shot of the boss's: a pirate's bolt (the world's drawing and hits), its own speed, damage and cost to a pirate it meets.
function shoot(world, x, y, angle, speed, life, vx = 0, vy = 0) {
  const S = CONFIG.boss.shot;
  world.bullets.push({ x, y, vx: vx + Math.cos(angle) * speed, vy: vy + Math.sin(angle) * speed, life,
    owner: 'pirate', by: 'boss', kind: 'boss', damage: S.damage, onPirates: S.onPirates });
  world.emit('shotFired', { owner: 'pirate', kind: 'boss', x, y, sectorId: world.sector.id });
}
// The angle from `from` to hit `to` where it will be (src/pirates.js interceptAngle, the pirates' own lead).
function lead(world, from, to, speed) {
  const r = world.delta(to.x, to.y, from.x, from.y);
  return interceptAngle(r.x, r.y, (to.vx ?? 0) - (from.vx ?? 0), (to.vy ?? 0) - (from.vy ?? 0), speed);
}

function commitStep(world, b) {
  const B = CONFIG.boss, M = B.body.muzzles, atk = b.attack, k = B.patterns[atk.kind], ship = world.ship;
  const speedK = raging(b) ? B.rage.speed : 1, due = () => atk.t >= atk.next;
  switch (atk.kind) {
    case 'aimed':
      // A1: three pairs from the shoulders, each led on the pilot.
      while (atk.n < k.shots && due()) {
        for (const m of M.shoulders) {
          const at = bossPoint(b, m.x, m.y);
          shoot(world, at.x, at.y, lead(world, at, ship, k.speed * speedK), k.speed * speedK, k.life);
        }
        atk.n++; atk.next += k.every;
      }
      break;
    case 'spiral':
      // A4 out of the sleds (SX: «круговые атаки происходят из боковых»): `arms` streams from each live sled, the whole turning at `spin`
      // rad/s, a shot a stream every `every` s; the two sleds' streams half a step apart.
      while (due() && atk.next < k.commit) {
        const turn = atk.data.base + atk.data.dir * k.spin * atk.next;
        for (const sl of b.sleds) {
          if (!sl.on) continue;
          for (let i = 0; i < k.arms; i++) shoot(world, sl.x, sl.y, turn + (i + (sl.side > 0 ? 0.5 : 0)) * TAU / k.arms, k.speed * speedK, k.life, sl.vx * 0.5, sl.vy * 0.5);
        }
        atk.next += k.every;
      }
      break;
    case 'launch': {
      // A7: out of the bay at the stern, one after another, swinging aside; their brains take over at once.
      const E = B.escort;
      while (due() && atk.n < E.types.length && escortOut(world) < E.cap) {
        const at = bossPoint(b, M.bay.x, M.bay.y), back = b.heading + Math.PI + (atk.n - (E.types.length - 1) / 2) * 0.55;
        const made = world.spawnPirates(1, { types: [E.types[atk.n]], paint: E.paint.id, silent: true,
          places: [{ x: at.x, y: at.y, heading: back }], personas: false });
        for (const p of made) { p.escort = true; p.vx = b.vx + Math.cos(back) * k.out; p.vy = b.vy + Math.sin(back) * k.out; }
        atk.n++; atk.next += k.every;
      }
      if (atk.n === 1 && !atk.data.told) { atk.data.told = true; world.emit('bossLaunch', { count: E.types.length, sectorId: world.sector.id, x: b.x, y: b.y }); }
      break;
    }
    default:
      break;
  }
}

// The sleds: held on the rig by a spring toward their places behind the core, their tethers a rope that never stretches past its length;
// each fires its own stream on its own clock. A sled shot off is loose debris that hits nothing, drifting and turning.
function stepSleds(world, b, dt) {
  const B = CONFIG.boss, S = B.body.sled, G = B.sledGun, ship = world.ship;
  for (const sl of b.sleds) {
    sl.flash = Math.max(0, sl.flash - dt);
    if (!sl.on) {
      sl.x += sl.vx * dt; sl.y += sl.vy * dt; sl.vx *= 1 - 0.25 * dt; sl.vy *= 1 - 0.25 * dt; sl.angle += sl.spin * dt;
      continue;
    }
    const at = sledRest(b, sl);
    const d = world.delta(at.x, at.y, sl.x, sl.y);
    sl.vx += (d.x * S.stiffness - (sl.vx - b.vx) * S.damping) * dt;
    sl.vy += (d.y * S.stiffness - (sl.vy - b.vy) * S.damping) * dt;
    sl.x += sl.vx * dt; sl.y += sl.vy * dt;
    const hook = sledHook(b, sl), r = world.delta(sl.x, sl.y, hook.x, hook.y), len = Math.hypot(r.x, r.y);
    if (len > S.tether) {
      const nx = r.x / len, ny = r.y / len;
      sl.x = hook.x + nx * S.tether; sl.y = hook.y + ny * S.tether;
      const out = (sl.vx - b.vx) * nx + (sl.vy - b.vy) * ny;
      if (out > 0) { sl.vx -= nx * out; sl.vy -= ny * out; }
    }
    // Its gun turns to the pilot while it is to fire (and in the last of its rest), else it faces as the core does.
    const g = sl.gun, toP = world.delta(ship.x, ship.y, sl.x, sl.y), gap = Math.hypot(toP.x, toP.y);
    const aiming = g.phase !== 'recover' || g.t > G.recover * 0.6;
    const want = aiming ? Math.atan2(toP.y, toP.x) : b.heading;
    sl.angle += clamp(wrapPi(want - sl.angle), -G.turn * dt, G.turn * dt);
    // Its own clock: warned, a stream at where the pilot is, a rest; only near the pilot, and not while the pilot is docked, nor while the
    // boss lies in wait.
    if (b.dormant) { g.phase = 'recover'; g.t = 0; continue; }
    g.t += dt;
    const recover = G.recover * (raging(b) ? B.rage.recover : 1);
    if (g.phase === 'recover' && g.t >= recover && gap < B.reach && !world.docked) { g.phase = 'prepare'; g.t = 0; }
    else if (g.phase === 'prepare' && g.t >= G.prepare) { g.phase = 'commit'; g.t = 0; g.shots = 0; }
    else if (g.phase === 'commit') {
      const speed = G.speed * (raging(b) ? B.rage.speed : 1);
      while (g.shots < G.shots && g.t >= g.shots * G.every) {
        const mx = sl.x + Math.cos(sl.angle) * G.muzzle, my = sl.y + Math.sin(sl.angle) * G.muzzle, aim = world.delta(ship.x, ship.y, mx, my);
        shoot(world, mx, my, Math.atan2(aim.y, aim.x), speed, G.life);
        g.shots++;
      }
      if (g.shots >= G.shots) { g.phase = 'recover'; g.t = 0; }
    }
  }
}

function breakSled(world, b, sl, why) {
  sl.on = false; sl.hp = 0; sl.offAt = world.time;
  const out = world.delta(sl.x, sl.y, b.x, b.y), len = Math.hypot(out.x, out.y) || 1;
  sl.vx += out.x / len * 90; sl.vy += out.y / len * 90; sl.spin = (world.rng('boss')() * 2 - 1) * 1.6;
  world.emit('bossSledOff', { side: sl.side, why, sectorId: world.sector.id, x: sl.x, y: sl.y });
}

// The escort's pressure: past `slots` of it lining up at once, the rest hold their guns a moment (src/pirates.js reads `lapse`).
function holdEscort(world) {
  const slots = CONFIG.boss.escort.slots;
  let busy = 0;
  for (const p of world.pirates) {
    if (!p.escort || p.hp <= 0) continue;
    const lining = p.attack && p.attack.phase !== 'approach' && p.attack.phase !== 'recover' && p.attack.phase !== 'reset';
    if (lining) { busy++; if (busy > slots) p.lapse = Math.max(p.lapse ?? 0, 0.3); }
  }
}

// ------------------------------------------------------------------------------------------------------------------------------ hits ---

// The pilot's shots on the boss: the sleds first (they hang in front of the core's flanks), then the core. A hit flashes the part (at most
// once in `flashEvery` s) and takes the shot's damage; a sled at none breaks loose; the core at none is beaten. A touch of the core or a
// live sled on the hull is a ram: the hull pays `ram.damage` (once in its grace, World.damageShip) and is pushed off.
export function resolveBossHits(world) {
  const b = world.boss;
  if (!b || b.defeated) return;
  const B = CONFIG.boss, ship = world.ship, reach = CONFIG.pirates.weapon.bulletRadius;
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const q = world.bullets[i];
    if (q.owner === 'pirate') continue;
    let hit = null;
    for (const sl of b.sleds) {
      if (!sl.on) continue;
      const d = world.delta(q.x, q.y, sl.x, sl.y);
      if (Math.hypot(d.x, d.y) < B.body.sled.radius + reach) { hit = sl; break; }
    }
    const dc = world.delta(q.x, q.y, b.x, b.y);
    const core = !hit && Math.hypot(dc.x, dc.y) < B.body.core.radius + reach;
    if (!hit && !core) continue;
    world.bullets.splice(i, 1);
    b.provoked = true;
    const amount = q.damage ?? CONFIG.pirates.hurt.shot, part = hit ?? b;
    if (world.time >= part.flashAt + B.flashEvery) { part.flash = CONFIG.pirates.flash.time; part.flashAt = world.time; }
    if (hit) {
      hit.hp -= amount;
      world.emit('bossHit', { part: hit.side < 0 ? 'sled-left' : 'sled-right', left: Math.max(0, hit.hp), sectorId: world.sector.id, x: q.x, y: q.y });
      if (hit.hp <= 0) breakSled(world, b, hit, 'shot');
    } else {
      b.hp = Math.max(0, b.hp - amount);
      world.emit('bossHit', { part: 'core', left: b.hp, sectorId: world.sector.id, x: q.x, y: q.y });
      if (b.hp <= 0) { defeat(world, b); return; }
    }
  }
  // The ram: a hull up in a jump passes over it (src/trick.js).
  if (!ship.alive || world.docked || ship.airborne) return;
  const touch = (x, y, r) => { const d = world.delta(ship.x, ship.y, x, y), len = Math.hypot(d.x, d.y); return len < r + ship.radius ? { d, len } : null; };
  let met = touch(b.x, b.y, B.body.core.radius);
  for (const sl of b.sleds) if (!met && sl.on) met = touch(sl.x, sl.y, B.body.sled.radius);
  if (!met) return;
  const nx = met.len > 1e-6 ? met.d.x / met.len : 1, ny = met.len > 1e-6 ? met.d.y / met.len : 0;
  world.damageShip(B.body.ram.damage, 'pirate', { by: 'boss', ram: true, at: { x: ship.x - nx * ship.radius, y: ship.y - ny * ship.radius, vx: b.vx, vy: b.vy } });
  ship.vx += nx * B.body.ram.push; ship.vy += ny * B.body.ram.push;
}

// Beaten: the sleds cut loose, its escort breaks off, and it is gone (the drawing throws its pieces: labs/graphics/boss-art.js).
function defeat(world, b) {
  b.defeated = true;
  b.defeatedAt = world.time;
  for (const sl of b.sleds) if (sl.on) breakSled(world, b, sl, 'end');
  for (const p of [...world.pirates]) if (p.escort && p.mode !== 'leave') pirateFlees(world, p, 'boss');
  world.emit('bossDefeated', { sectorId: world.sector.id, x: b.x, y: b.y });
}
