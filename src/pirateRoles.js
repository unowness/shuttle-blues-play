import { PIRATE_ROLES as NEW_ENEMY_RULES } from './pirateRolesConfig.js';
import { DONORS } from './pirateRoster.js';
import { pressureAvailable, PATTERNS } from './pirateAttacks.js';

export { NEW_ENEMY_RULES };

// The answer of a pattern with nothing to do: no gun, no hold on the motion. One frozen object, not one a step.
const IDLE = Object.freeze({ fire: false, steady: false });
const finitePoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const distance = (world, a, b) => Math.hypot(world.topology.dx(a.x, b.x), world.topology.dy(a.y, b.y));
const visible = (world, p) => world.patternVisible(p);
const active = (p) => p.hp > 0 && p.mode !== 'leave' && !p.fled;
export const roleSystemFor = (world, p) => p.roleSystemId ? world.pirateRoleSystems?.get(p.roleSystemId) : world.newEnemySystems;
const activeMines = (world) => [...systemsOf(world)].reduce((n, sys) => n + (sys.closed ? 0 : sys.mines.length), 0);
const systemsOf = (world) => world.pirateRoleSystems?.values() ?? (world.newEnemySystems ? [world.newEnemySystems] : []);

// Boundary: a unique encounterId and optional fabricated NPC capsule {id,x,y,exit:{x,y}}.
// This state never detaches player freight or grants credits. Quest adapters own persistence and hand-in.
export function beginNewEnemySystems(world, { encounterId, capsule = null, budget = null } = {}) {
  if (typeof encounterId !== 'string' || !encounterId) throw new TypeError('A stable encounterId is required');
  world.pirateRoleSystems ??= new Map();
  const existing = world.pirateRoleSystems.get(encounterId);
  if (existing) { world.newEnemySystems = existing; return existing; }
  if (capsule && (typeof capsule.id !== 'string' || !capsule.id || !finitePoint(capsule) || !finitePoint(capsule.exit))) {
    throw new TypeError('An NPC capsule needs a stable id, position and departure point');
  }
  const R = NEW_ENEMY_RULES;
  budget ??= { mineRemaining: R.mine.encounterBudget, supplyRemaining: R.tender.supply };
  if (!Number.isFinite(budget.mineRemaining) || budget.mineRemaining < 0 ||
      !Number.isFinite(budget.supplyRemaining) || budget.supplyRemaining < 0) throw new TypeError('Invalid encounter supplies');
  // A persistent objective owns this exact object. Loading adapters normalize transient carriers before begin.
  if (capsule && !capsule.state) Object.assign(capsule, {
    owner: 'npc', state: 'available', carrierId: null, claimId: null, loadedAt: null, drops: 0,
  });
  const sys = {
    encounterId, clock: 0, closed: false, reason: null, mines: [], mineSerial: 0,
    budget, capsule,
  };
  Object.defineProperties(sys, {
    mineRemaining: { enumerable: true, get: () => budget.mineRemaining, set: (n) => { budget.mineRemaining = n; } },
    supplyRemaining: { enumerable: true, get: () => budget.supplyRemaining, set: (n) => { budget.supplyRemaining = n; } },
  });
  world.pirateRoleSystems.set(encounterId, sys);
  world.newEnemySystems = sys;
  return sys;
}

function phase(world, p, name, duration, extra = {}) {
  p.attack = { kind: p.type, phase: name, time: duration, duration, progress: 0, heading: p.angle,
    pressure: false, lastHp: p.hp, ...extra };
  world.emit('piratePattern', { pirateId: p.id, kind: p.type, phase: name });
  return p.attack;
}
function tick(p, dt) {
  p.attack.time = Math.max(0, p.attack.time - dt);
  p.attack.progress = p.attack.duration ? 1 - p.attack.time / p.attack.duration : 0;
  p.attack.lastHp = p.hp;
  return p.attack;
}
const hold = (p, fire = false) => ({ aim: p.attack.heading, want: p.attack.heading, vdx: 0, vdy: 0, fire, steady: true });
function towards(world, p, target, speed, fire = false) {
  const d = world.delta(target.x, target.y, p.x, p.y), length = Math.hypot(d.x, d.y) || 1;
  const heading = Math.atan2(d.y, d.x);
  return { aim: heading, want: heading, vdx: d.x / length * speed, vdy: d.y / length * speed, fire, steady: true };
}

const NEEDLE_SHOT = new Set(['aim', 'lock', 'release']);
const LAYING = new Set(['rack', 'lay']);
const GUN = new Set(['gun-prepare', 'gun-pass', 'gun-reset']);
const GUN_WARNED = new Set(['gun-prepare', 'gun-pass']);
const CAPSULE_DONE = new Set(['escaped', 'recovered', 'cancelled']);
const CAPSULE_KEPT = new Set(['recovered', 'escaped']);
const ENDED_KEEPING = new Set(['cleared', 'suspended']);
// The phases a role is waiting in: leaving the hunt does not cut them short (a NEEDLE that breaks away keeps its reload).
const WAITING = new Set(['idle', 'seek', 'screen', 'approach', 'reload', 'reset', 'gun-reset', 'withdraw']);

function needle(world, p, dt, ctx) {
  const R = NEW_ENEMY_RULES.needle;
  let a = p.attack ?? phase(world, p, 'approach', 0);
  tick(p, dt);
  if (NEEDLE_SHOT.has(a.phase) && (!visible(world, p) || ctx.avoidUrgency > R.obstacleAbort)) {
    a = phase(world, p, 'reload', R.reload);
  }
  if (a.phase === 'approach' && p.cooldown <= 0 && ctx.dist <= p.W.range && visible(world, p) && pressureAvailable(world, p)) {
    a = phase(world, p, 'aim', R.aim, { heading: ctx.aim, pressure: true });
  }
  if (a.phase === 'aim') {
    a.heading = ctx.aim;
    if (a.time <= 0) a = phase(world, p, 'lock', R.lock, { heading: a.heading, pressure: true, committed: true });
    return hold(p);
  }
  if (a.phase === 'lock') {
    if (a.time <= 0) a = phase(world, p, 'release', R.release, { heading: a.heading, pressure: true, committed: true });
    return hold(p, a.phase === 'release');
  }
  if (a.phase === 'release') {
    if (a.time <= 0) { phase(world, p, 'reload', R.reload); return IDLE; }
    return hold(p, true);
  }
  if (a.phase === 'reload' && a.time <= 0) phase(world, p, 'approach', 0);
  return IDLE;
}

function layMine(world, p) {
  const sys = roleSystemFor(world, p), R = NEW_ENEMY_RULES.mine;
  if (activeMines(world) >= R.activeCap || sys.mineRemaining <= 0 || world.inSafeZone(p.x, p.y)) return false;
  // Deposit at a sampled position the ship actually traversed, not at a point around the pilot.
  if (sys.mines.some((m) => distance(world, m, p) < NEW_ENEMY_RULES.weaver.spacing)) return false;
  const mine = { id: `${sys.encounterId}:mine:${++sys.mineSerial}`, x: p.x, y: p.y, radius: R.radius,
    ownerId: p.id, damage: p.W.damage, age: 0, life: R.life, armed: false, kind: 'mine' };
  sys.mines.push(mine); sys.mineRemaining -= 1;
  world.emit('mineLaid', { id: mine.id, pirateId: p.id, x: mine.x, y: mine.y });
  return true;
}
function weaver(world, p, dt, ctx) {
  const sys = roleSystemFor(world, p), R = NEW_ENEMY_RULES.weaver;
  let a = p.attack ?? phase(world, p, 'approach', 0);
  tick(p, dt);
  if (LAYING.has(a.phase) && (!visible(world, p) || ctx.avoidUrgency > R.obstacleAbort)) a = phase(world, p, 'reset', R.reload);
  if (a.phase === 'approach' && sys.mineRemaining > 0 && activeMines(world) < NEW_ENEMY_RULES.mine.activeCap &&
      ctx.dist < p.W.range && visible(world, p) && pressureAvailable(world, p)) {
    a = phase(world, p, 'rack', R.windup, { heading: ctx.aim + (p.orbitDir || 1) * Math.PI / 2, pressure: true });
  }
  if (a.phase === 'rack' && a.time <= 0) a = phase(world, p, 'lay', R.lay, { heading: a.heading, pressure: true, committed: true, dropIn: 0 });
  if (a.phase === 'rack' || a.phase === 'lay') {
    if (a.phase === 'lay') {
      a.dropIn -= dt;
      if (a.dropIn <= 0 && Math.hypot(p.vx, p.vy) >= R.minSpeed) {
        layMine(world, p); a.dropIn = R.interval;
      }
      if (a.time <= 0 || sys.mineRemaining <= 0 || sys.mines.length >= NEW_ENEMY_RULES.mine.activeCap) {
        phase(world, p, 'reset', R.reload); return IDLE;
      }
    }
    return { aim: a.heading, want: a.heading, vdx: Math.cos(a.heading) * p.K.maxSpeed * R.laySpeed,
      vdy: Math.sin(a.heading) * p.K.maxSpeed * R.laySpeed, fire: false, steady: true };
  }
  if (a.phase === 'reset' && a.time <= 0) phase(world, p, 'approach', 0);
  // A spent rack leaves the inherited gun: a warned, finite firing pass, then an opening to retaliate.
  if (sys.mineRemaining <= 0 || GUN.has(p.attack.phase)) {
    return warnedGun(world, p, ctx, R.fallback, R.obstacleAbort);
  }
  return IDLE;
}

// A warned, finite firing pass, then an opening to retaliate: a WEAVER's once its rack is spent, a screening JACKAL's (its
// donor DART's pass, src/pirateAttackConfig.js) while another carries or claims the capsule.
function warnedGun(world, p, ctx, F, obstacleAbort) {
  let a = p.attack;
  if (GUN_WARNED.has(a.phase) && (!visible(world, p) || ctx.avoidUrgency > obstacleAbort)) {
    a = phase(world, p, 'gun-reset', Math.max(F.reset, p.W.interval));
  }
  if (a.phase === 'gun-prepare') a.heading = ctx.aim;
  if (a.phase === 'gun-reset' && a.time <= 0) a = phase(world, p, 'approach', 0);
  if (a.phase === 'approach' && p.cooldown <= 0 && ctx.dist <= p.W.range && visible(world, p) && pressureAvailable(world, p)) {
    a = phase(world, p, 'gun-prepare', F.prepare, { heading: ctx.aim, pressure: true });
  }
  if (a.phase === 'gun-prepare' && a.time <= 0) {
    if (Math.abs(Math.atan2(Math.sin(p.angle - a.heading), Math.cos(p.angle - a.heading))) <= F.alignment) {
      a = phase(world, p, 'gun-pass', F.pass, { heading: a.heading, pressure: true, committed: true });
    } else a = phase(world, p, 'gun-reset', Math.max(F.reset, p.W.interval));
  }
  if (a.phase === 'gun-pass' && a.time <= 0) a = phase(world, p, 'gun-reset', Math.max(F.reset, p.W.interval));
  if (a.phase === 'gun-prepare') return hold(p);
  if (a.phase === 'gun-pass') return { aim: ctx.aim, want: ctx.aim,
    vdx: Math.cos(a.heading) * p.K.maxSpeed * F.speed, vdy: Math.sin(a.heading) * p.K.maxSpeed * F.speed,
    fire: true, steady: true };
  return IDLE;
}

const DART_PASS = { prepare: PATTERNS.dart.prepare, pass: PATTERNS.dart.commit, reset: PATTERNS.dart.recover,
  speed: PATTERNS.dart.commitSpeedShare, alignment: PATTERNS.alignment };
// Until 2026-10-13 a screening JACKAL fired the old continuous gun, unwarned and outside the pressure slots.
function screen(world, p, ctx) {
  if (!GUN.has(p.attack.phase) && p.attack.phase !== 'approach') phase(world, p, 'approach', 0);
  return warnedGun(world, p, ctx, DART_PASS, PATTERNS.obstacleAbort);
}

function jackal(world, p, dt, ctx) {
  const sys = roleSystemFor(world, p), c = sys.capsule, R = NEW_ENEMY_RULES.jackal;
  if (!p.attack) phase(world, p, 'screen', 0);
  tick(p, dt);
  if (!c || CAPSULE_DONE.has(c.state)) return screen(world, p, ctx);
  if (c.claimId && !world.pirates.some((q) => q.id === c.claimId && active(q))) c.claimId = null;
  if (c.state === 'available' && !c.claimId) {
    c.claimId = world.pirates.find((q) => q.type === 'jackal' && roleSystemFor(world, q) === sys && active(q))?.id ?? null;
  }
  if (c.carrierId === p.id) {
    c.x = p.x; c.y = p.y;
    if (p.attack.phase !== 'escape') phase(world, p, 'escape', 0, { committed: true });
    if (distance(world, p, c.exit) < R.departReach && sys.clock - c.loadedAt >= R.announce) {
      c.state = 'escaped'; c.carrierId = null; c.claimId = null;
      p.mode = 'leave'; p.leaveTimer = 0; p.fled = true;
      world.emit('capsuleEscaped', { capsuleId: c.id, pirateId: p.id });
      return IDLE;
    }
    return towards(world, p, c.exit, p.K.maxSpeed * R.loadedSpeed);
  }
  if (c.state !== 'available' || c.claimId !== p.id) return screen(world, p, ctx);
  if (p.attack.phase === 'interrupted' && p.attack.time > 0) return hold(p);
  const gap = distance(world, p, c);
  if (gap >= R.reach) {
    if (p.attack.phase !== 'pickup') phase(world, p, 'pickup', 0);
    return towards(world, p, c, Math.min(p.K.maxSpeed * R.pickupSpeed, gap * R.pickupGain));
  }
  if (!visible(world, p)) return IDLE;
  if (p.attack.phase !== 'secure') phase(world, p, 'secure', R.secure, { committed: true });
  if (Math.hypot(p.vx, p.vy) > R.secureSpeed) { p.attack.time = R.secure; p.attack.progress = 0; }
  if (p.attack.time <= 0) {
    c.state = 'carried'; c.carrierId = p.id; c.loadedAt = sys.clock;
    phase(world, p, 'escape', 0, { committed: true });
    world.emit('capsuleSecured', { capsuleId: c.id, pirateId: p.id, exit: { ...c.exit } });
  }
  return hold(p);
}

const eligiblePatient = (p, q) => q !== p && q.squad === p.squad && active(q) && q.type !== 'tender' &&
  !q.boss && q.type !== 'tollkeeper' && q.hp < q.maxHp;
function followPatient(world, p, q) {
  const R = NEW_ENEMY_RULES.tender, d = world.delta(q.x, q.y, p.x, p.y), gap = Math.hypot(d.x, d.y) || 1;
  const close = Math.max(-R.connectSpeed, Math.min(p.K.maxSpeed * R.approachSpeed, gap - R.range * R.stopRange));
  let vx = (q.vx ?? 0) + d.x / gap * close, vy = (q.vy ?? 0) + d.y / gap * close;
  const speed = Math.hypot(vx, vy);
  if (speed > p.K.maxSpeed) { vx *= p.K.maxSpeed / speed; vy *= p.K.maxSpeed / speed; }
  const heading = Math.atan2(d.y, d.x);
  return { aim: heading, want: heading, vdx: vx, vdy: vy, fire: false, steady: true };
}
function tender(world, p, dt) {
  const sys = roleSystemFor(world, p), R = NEW_ENEMY_RULES.tender;
  if (!p.attack) phase(world, p, 'seek', 0);
  tick(p, dt);
  let a = p.attack;
  if (a.phase === 'withdraw' && a.time > 0) return IDLE;
  if (a.phase === 'withdraw') a = phase(world, p, 'seek', 0);
  if (a.phase === 'pulse') {
    const q = world.pirates.find((candidate) => candidate.id === a.patientId);
    if (!q || !eligiblePatient(p, q) || distance(world, p, q) > R.range || !visible(world, p)) {
      phase(world, p, 'withdraw', R.withdraw); return IDLE;
    }
    if (a.time <= 0) {
      const before = q.hp;
      q.hp = Math.min(q.maxHp, q.hp + R.pulse);
      world.emit('repairPulse', { pirateId: p.id, patientId: q.id, amount: q.hp - before });
      phase(world, p, 'withdraw', R.withdraw);
    }
    return followPatient(world, p, q);
  }
  if (sys.supplyRemaining <= 0) return IDLE;
  const patients = world.pirates.filter((q) => eligiblePatient(p, q));
  const q = patients.sort((a, b) => distance(world, p, a) - distance(world, p, b))[0];
  if (!q) return IDLE;
  if (distance(world, p, q) > R.range || Math.hypot(p.vx - (q.vx ?? 0), p.vy - (q.vy ?? 0)) > R.connectSpeed) {
    return followPatient(world, p, q);
  }
  if (visible(world, p)) {
    sys.supplyRemaining -= 1; // Reserve at commitment; interruption wastes this finite charge.
    world.emit('repairSupplySpent', { pirateId: p.id, left: sys.supplyRemaining });
    phase(world, p, 'pulse', R.windup, { patientId: q.id, committed: true });
  }
  return followPatient(world, p, q);
}

// Called after generic steering, before the existing craft integrator and gun gates.
export function stepNewPiratePattern(world, p, dt, ctx) {
  if (!Object.hasOwn(DONORS, p.type)) return null;
  const sys = roleSystemFor(world, p);
  if (!sys || sys.closed) return IDLE;
  if (p.attack && p.hp < p.attack.lastHp) onNewPirateDamaged(world, p, p.attack.lastHp - p.hp);
  if (p.mode !== 'hunt' || !ctx.targetable || world.docked || world.inSafeZone(world.ship.x, world.ship.y)) {
    if (p.attack && !WAITING.has(p.attack.phase)) phase(world, p, 'approach', 0);
    else if (p.attack && p.attack.time > 0) tick(p, dt);
    return IDLE;
  }
  if (p.type === 'needle') return needle(world, p, dt, ctx);
  if (p.type === 'weaver') return weaver(world, p, dt, ctx);
  if (p.type === 'jackal') return jackal(world, p, dt, ctx);
  return tender(world, p, dt);
}

export function onNewPirateShot(world, p) {
  if (p.type === 'needle') phase(world, p, 'reload', Math.max(NEW_ENEMY_RULES.needle.reload, p.W.interval));
  if ((p.type === 'weaver' || p.type === 'jackal') && p.attack?.phase === 'gun-pass') {
    const F = p.type === 'weaver' ? NEW_ENEMY_RULES.weaver.fallback : DART_PASS;
    phase(world, p, 'gun-reset', Math.max(F.reset, p.W.interval));
  }
}
export function onNewPirateDamaged(world, p, amount) {
  if (!p.attack || amount < NEW_ENEMY_RULES.tender.meaningfulHit) return;
  if (p.type === 'tender' && p.attack.phase === 'pulse') {
    phase(world, p, 'withdraw', NEW_ENEMY_RULES.tender.withdraw);
    world.emit('repairInterrupted', { pirateId: p.id, amount });
  }
  if (p.type === 'jackal' && p.attack.phase === 'secure') phase(world, p, 'interrupted', NEW_ENEMY_RULES.jackal.interrupt);
}
// A capsule dropped where its carrier died in a planet or a hole would lie where no hull can reach it: it comes out at the body's
// rim, as the carrier's coins do (src/encounters.js dropPirateLoot).
function dropClear(world, c, x, y) {
  c.x = x; c.y = y;
  for (const b of world.planets) {
    const dx = world.topology.dx(x, b.x), dy = world.topology.dy(y, b.y), d = Math.hypot(dx, dy);
    if (d < b.radius) { const k = b.radius * 1.05 / (d || 1); c.x = b.x + (d ? dx * k : b.radius * 1.05); c.y = b.y + (d ? dy * k : 0); return; }
  }
  for (const h of world.holes) {
    const dx = world.topology.dx(x, h.x), dy = world.topology.dy(y, h.y), d = Math.hypot(dx, dy);
    if (d < h.horizon) { const k = h.horizon * 1.4 / (d || 1); c.x = h.x + (d ? dx * k : h.horizon * 1.4); c.y = h.y + (d ? dy * k : 0); return; }
  }
}

export function onNewPirateRemoved(world, p, reason = 'removed') {
  const c = roleSystemFor(world, p)?.capsule;
  if (c?.state === 'carried' && c.carrierId === p.id) {
    c.state = 'available'; dropClear(world, c, p.x, p.y); c.carrierId = null; c.claimId = null; c.drops += 1;
    world.emit('capsuleDropped', { capsuleId: c.id, pirateId: p.id, reason, x: c.x, y: c.y });
  }
  if (c?.claimId === p.id) c.claimId = null;
  if (p.attack) p.attack.pressure = false;
}

function bulletHitsMine(world, b, mine) {
  const T = world.topology, ox = b.px ?? b.x, oy = b.py ?? b.y;
  const lx = T.dx(b.x, ox), ly = T.dy(b.y, oy), mx = T.dx(mine.x, ox), my = T.dy(mine.y, oy);
  const length2 = lx * lx + ly * ly;
  const u = length2 ? Math.max(0, Math.min(1, (mx * lx + my * ly) / length2)) : 0;
  return Math.hypot(mx - u * lx, my - u * ly) <= mine.radius;
}

// Run after bullet movement and rock/droid resolution, immediately before pirate/ship projectile hits.
export function stepNewEnemySystems(world, dt) {
  for (const sys of systemsOf(world)) if (!sys.closed) stepSystem(world, sys, dt);
}
function stepSystem(world, sys, dt) {
  sys.clock += dt;
  const ship = world.ship, R = NEW_ENEMY_RULES.mine;
  for (let i = sys.mines.length - 1; i >= 0; i--) {
    if (sys.closed || !ship.alive || !sys.mines[i]) break; // A mine may wreck the ship and synchronously clear the encounter.
    const m = sys.mines[i];
    m.age += dt; m.life -= dt; m.armed = m.age >= R.arm;
    let reason = m.life <= 0 ? 'expired' : world.inSafeZone(m.x, m.y) ? 'safe-zone' : null;
    if (!reason) {
      const bi = world.bullets.findIndex((b) => b.owner !== 'pirate' && bulletHitsMine(world, b, m));
      if (bi >= 0) { world.bullets.splice(bi, 1); reason = 'shot'; }
    }
    if (!reason && m.armed && ship.alive && !world.docked && !ship.airborne &&
        !world.inSafeZone(ship.x, ship.y) && distance(world, m, ship) < R.trigger + ship.radius) {
      world.damageShip(m.damage, 'pirate', { by: 'weaver', pirateId: m.ownerId, at: m, mineId: m.id });
      reason = 'triggered';
    }
    if (reason) { sys.mines.splice(i, 1); world.emit('mineRemoved', { id: m.id, reason, x: m.x, y: m.y }); }
  }
  const c = sys.capsule;
  if (c?.state === 'carried') {
    const p = world.pirates.find((q) => q.id === c.carrierId && active(q));
    if (p) { c.x = p.x; c.y = p.y; }
    else {
      c.state = 'available'; dropClear(world, c, c.x, c.y); c.carrierId = null; c.claimId = null; c.drops += 1;
      world.emit('capsuleDropped', { capsuleId: c.id, reason: 'carrier-missing', x: c.x, y: c.y });
    }
  }
}

export function recoverCapsule(world, encounterId = null) {
  const available = [...systemsOf(world)].filter((sys) => (!encounterId || sys.encounterId === encounterId) && sys.capsule?.state === 'available');
  available.sort((a, b) => distance(world, a.capsule, world.ship) - distance(world, b.capsule, world.ship));
  const c = available[0]?.capsule, ship = world.ship;
  if (!c || c.state !== 'available' || !ship.alive || ship.airborne ||
      distance(world, c, ship) > NEW_ENEMY_RULES.jackal.recoverReach + ship.radius) return false;
  c.state = 'recovered'; c.carrierId = null; c.claimId = null;
  world.emit('capsuleRecovered', { capsuleId: c.id, owner: c.owner });
  return true; // The owning quest adapter handles hand-in through the existing reward ledger.
}

export function endNewEnemySystems(world, reason = 'ended', encounterId = null) {
  for (const sys of systemsOf(world)) {
    if (!sys.closed && (!encounterId || sys.encounterId === encounterId)) endSystem(world, sys, reason);
  }
}
function endSystem(world, sys, reason) {
  sys.closed = true; sys.reason = reason; sys.mines.length = 0;
  const c = sys.capsule;
  if (c && !CAPSULE_KEPT.has(c.state)) {
    // A last carrier's death drops the same capsule before native clear calls this function.
    c.state = ENDED_KEEPING.has(reason) && c.state === 'available' ? 'available' : 'cancelled';
    c.carrierId = null; c.claimId = null;
  }
  for (const p of world.pirates) if (p.attack && roleSystemFor(world, p) === sys) p.attack.pressure = false;
  world.emit('newEnemySystemsEnded', { reason, encounterId: sys.encounterId });
}
