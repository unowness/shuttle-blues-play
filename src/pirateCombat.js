// Campaign adapters for the attack controllers. Post records own finite supplies across re-entry and saves.
import { PIRATE_ROLES } from './pirateRolesConfig.js';
import { CONFIG } from './config.js';
import { beginNewEnemySystems, endNewEnemySystems, onNewPirateRemoved, recoverCapsule } from './pirateRoles.js';

export function attachPirateCombat(world, made, record = null) {
  if (!made.length) return;
  const p = made[0];
  const id = record ? `${p.post.kind}:${p.post.stationId}:${record.startedAt ?? record.at ?? 0}` : p.squad;
  const budget = record ? (record.combat ??= {}) : {};
  budget.mineRemaining ??= PIRATE_ROLES.mine.encounterBudget;
  budget.supplyRemaining ??= PIRATE_ROLES.tender.supply;
  let sys = world.pirateRoleSystems?.get(id);
  if (sys?.closed) world.pirateRoleSystems.delete(id);
  sys = beginNewEnemySystems(world, { encounterId: id, budget, capsule: budget.capsule ?? null });
  sys.posted = !!record;
  sys.sectorId = world.sector.id;
  if (record && sys.capsule) record.combat.capsule = sys.capsule;
  for (const q of made) q.roleSystemId = id;
}

export function suspendPirateCombat(world) {
  for (const p of world.pirates ?? []) onNewPirateRemoved(world, p, 'sector');
  endNewEnemySystems(world, 'suspended');
  world.pirateRoleSystems = new Map();
  world.newEnemySystems = null;
}

export function finishPirateCombat(world, reason) {
  for (const [id, sys] of world.pirateRoleSystems ?? []) {
    // A refuge only ends the attack. A posted squad retains its resources and objective.
    if (sys.posted && world.pirates.some((p) => p.roleSystemId === id && p.hp > 0)) {
      sys.mines.length = 0;
      continue;
    }
    endNewEnemySystems(world, sys.capsule ? 'cleared' : reason, id);
    if (!sys.capsule) world.pirateRoleSystems.delete(id);
  }
}

// Whether a pirate is near enough to warn and attack: within the guns' range of the ship. A rule of the world, never of the
// page's window: until 2026-10-13 the page handed in its canvas's view, so the window's size and the camera's easing decided
// the fight (one seed was not one world), and squads held their range just outside the frame and never attacked.
export function pirateVisible(world, p) {
  const dx = world.topology.dx(p.x, world.ship.x), dy = world.topology.dy(p.y, world.ship.y);
  return dx * dx + dy * dy <= CONFIG.pirates.weapon.range * CONFIG.pirates.weapon.range;
}

export function recoverPesterCapsule(world) {
  const p = world.pester, c = p?.combat?.capsule;
  if (!c || p.sectorId !== world.sector.id || c.state !== 'available') return;
  // The last pirate can have died before a reload: reconstruct the objective, never its defeated squad.
  let sys = [...(world.pirateRoleSystems?.values() ?? [])].find((s) => s.capsule === c);
  if (!sys) sys = beginNewEnemySystems(world, { encounterId: `pester:${p.id}:0`, budget: p.combat, capsule: c });
  p.combat.capsule = sys.capsule;
  recoverCapsule(world, sys.encounterId);
}

// A mission terminal outcome retires its world objective and every remaining attacker.
export function cleanupPesterCombat(world, p, reason) {
  const ids = new Set(world.pirates.filter((q) => q.post?.stationId === p.id).map((q) => q.roleSystemId));
  for (const q of world.pirates) {
    if (q.post?.stationId !== p.id) continue;
    onNewPirateRemoved(world, q, reason);
    q.post = null; q.mode = 'leave'; q.leaveTimer = CONFIG.pirates.leave.time;
  }
  for (const [id, sys] of world.pirateRoleSystems ?? []) {
    if (!ids.has(id) && (!sys.capsule || sys.capsule !== p.combat?.capsule)) continue;
    endNewEnemySystems(world, reason, id);
    world.pirateRoleSystems.delete(id);
    if (world.newEnemySystems === sys) world.newEnemySystems = null;
  }
}
