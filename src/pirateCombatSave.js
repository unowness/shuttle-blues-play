// Durable encounter resources, not a save of projectiles or flight state.
import { CONFIG } from './config.js';
import { stationDefById } from './sectors.js';
import { PIRATE_ROLES as NEW_ENEMY_RULES } from './pirateRolesConfig.js';

export function readPirateRoster(raw, count) {
  return Array.isArray(raw) && raw.length === count && raw.every((id) => Object.hasOwn(CONFIG.pirates.types, id)) ? [...raw] : null;
}
export function readPirateCombat(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const finiteCount = (n, max) => Number.isInteger(n) ? Math.max(0, Math.min(max, n)) : max;
  const out = {
    mineRemaining: finiteCount(raw.mineRemaining, NEW_ENEMY_RULES.mine.encounterBudget),
    supplyRemaining: finiteCount(raw.supplyRemaining, NEW_ENEMY_RULES.tender.supply),
  };
  const c = raw.capsule;
  if (c && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 160 && [c.x, c.y, c.exit?.x, c.exit?.y].every(Number.isFinite) &&
      ['available', 'carried', 'recovered', 'escaped', 'cancelled'].includes(c.state)) {
    // Actors are not saved. A carried capsule rests at its last position after a load; terminal outcomes stay terminal.
    out.capsule = { id: c.id, owner: 'npc', x: c.x, y: c.y, exit: { x: c.exit.x, y: c.exit.y },
      state: c.state === 'carried' ? 'available' : c.state, carrierId: null, claimId: null, loadedAt: null,
      drops: Number.isInteger(c.drops) && c.drops >= 0 ? c.drops : 0, rewardPaid: false };
  }
  return out;
}
export const writePirateCombat = (combat) => readPirateCombat(combat);

export function readPiratePosts(raw, ledger) {
  const posts = new Map();
  if (!Array.isArray(raw)) return posts;
  for (const entry of raw) {
    if (!Array.isArray(entry)) continue;
    const [id, p] = entry, s = stationDefById(id, ledger);
    if (!s || !p || !Number.isInteger(p.size) || p.size < 1 || p.size > Math.max(...CONFIG.raids.guards.map(([, n]) => n), CONFIG.raids.regather.size[1]) ||
        !Number.isInteger(p.down) || p.down < 0 || p.down >= p.size || !Number.isFinite(p.at) || p.at < 0 || p.at > ledger.clock) continue;
    if (p.kind !== 'gather' && (s.kind !== 'ruin' || ledger.restored.has(id))) continue;
    const mix = readPirateRoster(p.mix, p.size - p.down);
    if (!mix) continue;
    posts.set(id, { ...(p.kind === 'gather' ? { kind: 'gather' } : {}), size: p.size, down: p.down, at: p.at,
      mix, paint: CONFIG.pirates.paints.some((q) => q.id === p.paint) ? p.paint : null, combat: readPirateCombat(p.combat) });
  }
  return posts;
}
