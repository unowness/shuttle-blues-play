// Replace already allocated slots; never expand the global selector.
import { PIRATE_ROLES, PIRATE_ROLE_DONORS, BASE_PIRATE_TYPES } from './pirateRolesConfig.js';
export const DONORS = PIRATE_ROLE_DONORS;
export const OLD_TYPES = BASE_PIRATE_TYPES;

// Boundary: old type IDs and { restored, context, rng, allowScripted? }. The RNG is a seeded function.
export function replaceRoster(existing, { restored = 0, context = 'ordinary', rng, allowScripted = false } = {}) {
  if (!Array.isArray(existing) || existing.some((id) => !OLD_TYPES.includes(id))) {
    throw new TypeError('replaceRoster requires an existing old-type allocation');
  }
  if (typeof rng !== 'function') throw new TypeError('A seeded roster RNG is required');
  if (!Number.isFinite(restored) || restored < 0) throw new TypeError('Invalid restoration count');
  const result = [...existing];
  const { unlocks, chance } = PIRATE_ROLES.roster;
  if (restored < unlocks.needle || !result.length) return result;
  if (context === 'patrol') context = 'ordinary';
  if (['named', 'scripted'].includes(context)) {
    if (!allowScripted) return result;
    context = new Set(existing).size === 1 ? 'ordinary' : 'gather';
  }
  if (['ordinary', 'guard'].includes(context)) {
    // A homogeneous squad is replaced as a whole, retaining its donor and hull budget.
    if (new Set(existing).size !== 1) return result;
    const replacement = existing[0] === 'warlord' ? 'needle' :
      restored >= unlocks.weaver && existing[0] === 'brute' ? 'weaver' : null;
    return replacement && rng() < chance ? result.map(() => replacement) : result;
  }
  if (context === 'recovery') {
    // Authored recovery is a same-type DART allocation before replacement.
    return restored >= unlocks.jackal && existing.every((id) => id === 'dart') ? result.map(() => 'jackal') : result;
  }
  if (!['raid', 'gather'].includes(context)) return result;
  let tenderUsed = false;
  return result.map((id) => {
    if (id === 'brute' && restored >= unlocks.weaver && rng() < chance) return 'weaver';
    if (id !== 'warlord' || rng() >= chance) return id;
    if (restored >= unlocks.tender && !tenderUsed && result.some((other) => other !== 'warlord') && rng() < chance) {
      tenderUsed = true;
      return 'tender';
    }
    return 'needle';
  });
}

export function rosterBudget(types, config) {
  const C = config.pirates;
  return { count: types.length, hp: types.reduce((sum, id) => sum + (C.types[DONORS[id] ?? id].hp ?? C.hp), 0) };
}
