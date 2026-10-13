import { PIRATE_ATTACKS as PATTERNS, LEGACY_PIRATE_TYPES } from './pirateAttackConfig.js';
export { PIRATE_ATTACKS as PATTERNS } from './pirateAttackConfig.js';

// The answer of a pattern with nothing to do: no gun, no hold on the motion. One frozen object, not one a step.
const IDLE = Object.freeze({ fire: false, steady: false });

// Attack phases request motion through the shared craft integrator; they never change damage or HP.
const OLD_TYPES = new Set(LEGACY_PIRATE_TYPES);
const PREPARING = new Set(['prepare', 'order', 'ordered']);
const COMMITTED = new Set(['charge', 'pass', 'burst', 'volley']);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const angleGap = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const active = (p) => p.hp > 0 && (p.mode === 'hunt' || p.mode === 'break');
const visible = (world, p) => world.patternVisible?.(p) !== false;
const now = (world) => world.time ?? 0;

export function attackCommitted(p) { return p.attack?.committed === true || COMMITTED.has(p.attack?.phase); }

// Nearby squads share a bounded pool of attack slots. A leader and its ordered
// partner count once; two threats can act together instead of the whole fight queuing.
// The attackers counted, kept between calls: asked by every pirate every step, it makes nothing.
const occupied = [];
export function pressureAvailable(world, p, partnerId = null) {
  occupied.length = 0;
  const T = world.topology, ship = world.ship;
  for (const q of world.pirates) {
    if (q === p || q.id === partnerId || !active(q)) continue;
    if (p.attackOrder?.leaderId === q.id || q.attackOrder?.leaderId === p.id) continue;
    const a = q.attack;
    if (!a?.pressure && !(a?.pressureUntil > now(world))) continue;
    const dx = T.dx(q.x, ship.x), dy = T.dy(q.y, ship.y);
    if (Math.hypot(dx, dy) <= Math.max(q.W?.range ?? 0, q.K?.maxSpeed ?? 0) * PATTERNS.pressureRangeScale) {
      const id = q.attackOrder?.leaderId ?? q.id;
      if (!occupied.includes(id)) occupied.push(id);
    }
  }
  return occupied.length < PATTERNS.pressureSlots;
}

function state(p) {
  return p.attack ??= { phase: 'approach', time: 0, duration: 0, progress: 0,
    heading: p.angle, shots: 0, pressure: false, reason: null, lastAttackAt: -Infinity };
}

function phase(world, p, name, duration, reason = null) {
  const a = state(p);
  a.phase = name; a.time = 0; a.duration = duration; a.progress = 0; a.reason = reason;
  a.pressure = PREPARING.has(name) || COMMITTED.has(name);
  if (a.pressure) a.lastAttackAt = now(world);
  world.emit('pirateAttackPhase', { pirateId: p.id, kind: p.type, phase: name,
    heading: a.heading, reason, partnerId: a.partnerId ?? null });
  return a;
}

function recoveryDuration(p) {
  return PATTERNS[p.type].recover;
}

function releaseOrder(world, p) {
  for (const q of world.pirates) if (q.attackOrder?.leaderId === p.id) delete q.attackOrder;
  state(p).partnerId = null;
}

function recover(world, p, reason = 'complete') {
  releaseOrder(world, p);
  delete p.attackOrder;
  const name = p.type === 'brute' ? 'reload' : p.type === 'dart' ? 'reset' : 'recover';
  return phase(world, p, name, recoveryDuration(p), reason);
}

export function cancelAttack(world, p, reason = 'cancelled') {
  if (!OLD_TYPES.has(p.type) || !p.attack) return;
  releaseOrder(world, p);
  delete p.attackOrder;
  if (p.attack.phase === 'approach' && p.attack.reason === reason) return;
  phase(world, p, 'approach', 0, reason);
  p.attack.pressureUntil = 0;
}

function minDistance(world, p) {
  return p.radius + (world.ship.radius ?? PATTERNS.playerRadiusFallback) + PATTERNS.minimumClearance;
}

function ready(world, p, ctx) {
  // A MAW's charge is not its gun: the gun's cooldown does not hold the charge back.
  return p.mode === 'hunt' && ctx.targetable && visible(world, p) && !(p.lapse > 0) &&
    (p.type === 'maw' || p.cooldown <= 0) && ctx.dist > minDistance(world, p) && ctx.dist <= p.W.range * PATTERNS.startRangeShare &&
    ctx.avoidUrgency < PATTERNS.obstacleAbort && pressureAvailable(world, p);
}

function locked(p, speed, fire = false, cooldown) {
  const a = p.attack;
  return { aim: a.heading, want: a.heading, vdx: Math.cos(a.heading) * speed,
    vdy: Math.sin(a.heading) * speed, fire, steady: true, cooldown };
}

// Aim from the latest sensed intercept until the gun fires. The craft still has
// to turn into its firing cone, and a DART keeps the path of its committed pass.
function gunMotion(p, ctx, share, fire = false, cooldown) {
  const passing = p.type === 'dart' && p.attack.phase === 'pass';
  if (!passing) p.attack.heading = ctx.aim;
  return { aim: ctx.aim, want: ctx.aim,
    vdx: passing ? Math.cos(p.attack.heading) * p.K.maxSpeed * share : ctx.vdx * share,
    vdy: passing ? Math.sin(p.attack.heading) * p.K.maxSpeed * share : ctx.vdy * share,
    fire, steady: true, cooldown };
}

function outward(p, ctx) {
  const a = p.attack;
  const heading = a.heading + p.orbitDir * PATTERNS.recoveryTurn;
  return { aim: a.heading, want: heading, vdx: Math.cos(heading) * p.K.maxSpeed * PATTERNS.recoverySpeedShare + (ctx.separateX ?? 0),
    vdy: Math.sin(heading) * p.K.maxSpeed * PATTERNS.recoverySpeedShare + (ctx.separateY ?? 0), fire: false, steady: false, avoid: true };
}

function approach(p, ctx) {
  if (p.type !== 'maw') return IDLE;
  // Waiting MAWs hold room for the charge instead of quietly ramming while queued, and keep their gun on the pilot as they did
  // before the charge was theirs (SX, 2026-10-13: «Вернуть пушку»; from 2026-10-09 to then a MAW only rammed).
  const close = clamp((ctx.dist - p.W.range * PATTERNS.maw.holdingRangeShare) * p.B.approachGain,
    -p.B.backSpeed, p.B.approachMax);
  return { want: ctx.aim, vdx: (p.seen?.vx ?? 0) + ctx.rx * close + (ctx.separateX ?? 0),
    vdy: (p.seen?.vy ?? 0) + ctx.ry * close + (ctx.separateY ?? 0), fire: true, steady: false };
}

function leaderOf(world, p) {
  const list = world.pirates.filter((q) => q.type === 'warlord' && q.squad === p.squad && active(q));
  return list.find((q) => q.role === 'lead') ?? list[0] ?? null;
}

function warlord(world, p, dt, ctx) {
  const a = state(p), t = PATTERNS.warlord, leader = leaderOf(world, p);
  const leaderId = leader?.id ?? null;
  if (a.leaderId === undefined) a.leaderId = leaderId;
  if (a.leaderId !== leaderId) {
    a.leaderId = leaderId;
    delete p.attackOrder;
    if (attackCommitted(p)) a.regroupAfter = true;
    else { releaseOrder(world, p); phase(world, p, 'regroup', t.regroup, 'leader-lost'); }
  }
  if (a.phase === 'regroup') {
    if (a.time >= a.duration) phase(world, p, 'approach', 0);
    return IDLE;
  }

  const order = p.attackOrder;
  if (order && (!leader || order.leaderId !== leader.id || order.expires < now(world))) {
    delete p.attackOrder;
    if (!attackCommitted(p)) phase(world, p, 'regroup', t.regroup, 'order-lost');
    return IDLE;
  }
  if (order && a.phase === 'approach') {
    a.heading = ctx.aim; a.shots = 0;
    phase(world, p, 'ordered', t.prepare);
  }
  if (a.phase === 'ordered') {
    if (!p.attackOrder) { phase(world, p, 'regroup', t.regroup, 'order-cancelled'); return IDLE; }
    a.heading = ctx.aim;
    if (order.phase === 'go' && a.time >= a.duration) {
      if (Math.abs(angleGap(p.angle, a.heading)) <= PATTERNS.alignment) phase(world, p, 'volley', t.commit);
      else if (a.time > a.duration + PATTERNS.alignmentGrace) recover(world, p, 'alignment');
    }
    return gunMotion(p, ctx, t.prepareSpeedShare);
  }
  if (a.phase === 'order') {
    const partner = world.pirates.find((q) => q.id === a.partnerId && active(q));
    if (!partner || !partner.attackOrder) { recover(world, p, 'partner-lost'); return IDLE; }
    if (a.time >= a.duration) {
      partner.attackOrder.phase = 'go';
      a.shots = 0;
      phase(world, p, 'cover', t.prepare + t.commit + PATTERNS.alignmentGrace);
    }
    return IDLE;
  }
  if (a.phase === 'cover') {
    const partner = world.pirates.find((q) => q.id === a.partnerId && active(q));
    if (!partner || !PREPARING.has(partner.attack?.phase) && !COMMITTED.has(partner.attack?.phase) || a.time > a.duration) {
      releaseOrder(world, p); phase(world, p, 'recover', recoveryDuration(p));
      return IDLE;
    }
    // The leader covers its partner's volley with its own (until 2026-10-13 it held its fire, and a WARLORD pair hit half as
    // often as before the patterns: SX, 2026-10-13, «Как до Кодекса, ±15 %»).
    return gunMotion(p, ctx, t.prepareSpeedShare, a.shots < t.shots && ctx.dist > minDistance(world, p), p.W.interval * t.cadence);
  }
  if (a.phase !== 'approach' || leader !== p || !ready(world, p, ctx)) return null;
  // The partner: the squad's ready WARLORD that attacked longest ago (by id on a tie).
  let partner = null;
  for (const q of world.pirates) {
    if (q === p || q.type !== 'warlord' || q.squad !== p.squad || q.mode !== 'hunt' || !(q.hp > 0) || !visible(world, q)) continue;
    if ((q.attack && q.attack.phase !== 'approach') || q.cooldown > 0 || q.lapse > 0) continue;
    const gap = Math.hypot(world.topology.dx(q.x, world.ship.x), world.topology.dy(q.y, world.ship.y));
    if (gap <= minDistance(world, q) || gap > q.W.range * PATTERNS.startRangeShare) continue;
    if (!partner || (q.attack?.lastAttackAt ?? -Infinity) - (partner.attack?.lastAttackAt ?? -Infinity) < 0 ||
        ((q.attack?.lastAttackAt ?? -Infinity) === (partner.attack?.lastAttackAt ?? -Infinity) && q.id.localeCompare(partner.id) < 0)) partner = q;
  }
  if (!partner) {
    // An unavailable partner must not leave a ready leader waiting indefinitely.
    a.heading = ctx.aim; a.shots = 0; phase(world, p, 'prepare', t.prepare);
    return gunMotion(p, ctx, t.prepareSpeedShare);
  }
  a.heading = ctx.aim; a.partnerId = partner.id;
  partner.attackOrder = { leaderId: p.id, phase: 'prepare', expires: now(world) + t.prepare * 2 + t.commit + PATTERNS.orderGrace };
  phase(world, p, 'order', t.prepare);
  return IDLE;
}

export function stepAttack(world, p, dt, ctx) {
  if (!OLD_TYPES.has(p.type)) return world.stepNewPiratePattern?.(world, p, dt, ctx) ?? IDLE;
  const a = state(p), t = PATTERNS[p.type];
  a.time += dt; a.progress = a.duration > 0 ? Math.min(1, a.time / a.duration) : 0;
  if (!active(p) || !ctx.targetable || world.inSafeZone(world.ship.x, world.ship.y)) {
    cancelAttack(world, p, !ctx.targetable ? 'no-target' : p.mode !== 'hunt' ? p.mode : 'refuge');
    return IDLE;
  }
  if ((a.pressure || attackCommitted(p)) && (!visible(world, p) || ctx.avoidUrgency >= PATTERNS.obstacleAbort ||
      p.rockGrace > 0 || p.ramGrace > 0 || p.bumpGrace > 0 || p.lapse > 0 || (PREPARING.has(a.phase) && ctx.dist <= minDistance(world, p)))) {
    recover(world, p, !visible(world, p) ? 'offscreen' : ctx.avoidUrgency >= PATTERNS.obstacleAbort ? 'obstacle' :
      p.lapse > 0 ? 'lapse' : ctx.dist <= minDistance(world, p) ? 'too-close' : 'contact');
  }
  if (p.type === 'warlord') {
    const result = warlord(world, p, dt, ctx);
    if (result) return result;
  }
  if (a.phase === 'approach') {
    if (p.type === 'warlord') return approach(p, ctx);
    if (ready(world, p, ctx)) {
      a.heading = ctx.aim; a.shots = 0;
      phase(world, p, 'prepare', t.prepare);
      return p.type === 'maw' ? locked(p, p.K.maxSpeed * t.prepareSpeedShare) : gunMotion(p, ctx, t.prepareSpeedShare);
    }
    return approach(p, ctx);
  }
  if (a.phase === 'prepare') {
    a.heading = ctx.aim;
    if (a.time >= a.duration) {
      if (Math.abs(angleGap(p.angle, a.heading)) <= PATTERNS.alignment) {
        phase(world, p, { maw: 'charge', dart: 'pass', brute: 'burst', warlord: 'volley' }[p.type], t.commit);
      } else if (a.time > a.duration + PATTERNS.alignmentGrace) recover(world, p, 'alignment');
    }
    return p.type === 'maw' ? locked(p, p.K.maxSpeed * t.prepareSpeedShare) : gunMotion(p, ctx, t.prepareSpeedShare);
  }
  if (COMMITTED.has(a.phase)) {
    if (a.time >= a.duration) {
      if (a.regroupAfter) { a.regroupAfter = false; phase(world, p, 'regroup', PATTERNS.warlord.regroup, 'leader-lost'); }
      else recover(world, p);
      return outward(p, ctx);
    }
    const speed = p.K.maxSpeed * t.commitSpeedShare;
    const maxShots = t.shots ?? 0;
    const fire = p.type !== 'maw' && a.shots < maxShots && visible(world, p) && ctx.dist > minDistance(world, p);
    return p.type === 'maw' ? locked(p, speed) : gunMotion(p, ctx, t.commitSpeedShare, fire, p.W.interval * (t.cadence ?? 1));
  }
  if (a.time >= a.duration) phase(world, p, 'approach', 0);
  // Recovering, reloading, regrouping: it dodges and weaves as any pirate does. Only lining up and the committed attack hold it
  // steady (until 2026-10-13 a BRUTE was steady about 93 % of its time and stood still for the pilot's shots).
  return p.type === 'brute' || p.type === 'warlord' ? { fire: false, steady: false, avoid: true } : outward(p, ctx);
}

export function attackShot(world, p) {
  if (!OLD_TYPES.has(p.type)) { world.onNewPirateShot?.(world, p); return; }
  const a = state(p); a.shots++;
  a.pressureUntil = now(world) + Math.min(p.W.life, p.W.range / p.W.muzzleSpeed);
  if ((p.type === 'brute' || p.type === 'warlord') && a.phase !== 'cover' && a.shots >= PATTERNS[p.type].shots) {
    if (a.regroupAfter) {
      a.regroupAfter = false; delete p.attackOrder;
      phase(world, p, 'regroup', PATTERNS.warlord.regroup, 'leader-lost');
    } else recover(world, p);
  }
}
