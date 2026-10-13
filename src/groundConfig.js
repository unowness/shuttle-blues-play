// One plane for the world's material things (SX, 2026-10-10, as Codex recorded it: ships, rocks, coins, parts, fuel, pirates and
// stations on one level, the jump the one way off it), the contact pass that holds it (src/groundPlane.js). Merged into CONFIG as
// `CONFIG.ground`, the same object.
//
// Rewritten on 2026-10-13 (SX: «Переписать дёшево»): one pass a step, no NPC steering round obstacles (an NPC keeps its route and
// shoves loose things aside), no pull gathering the coins into groups (the piles never came to rest).
export const GROUND = Object.freeze({
  // u: the cell of the pass's broad phase; rounds of the narrow phase a step; the gap kept between two bodies; the bounce of a
  // contact (a share of the closing speed given back).
  cell: 320, iterations: 2, gap: 1, bounce: 0.18,
  // A rock's envelope is its radius times this (its outline reaches past its middle radius); its mass grows with its radius
  // squared over `rockMassRadius` u. `actorDrag` 1/s: how fast a lost cargo nudged off its rest slows.
  rockEnvelope: 1.2, rockMassRadius: 40, actorDrag: 2,
  // Masses, relative: what yields to what. An NPC, the authored traffic and a quest's ship are fixed: they never leave their path.
  mass: { ship: 1, pirate: 1.2, droid: 0.6, cache: 0.5, cargo: 2, drop: 0.015 },
  // The NPC fleet's journeys between stations (src/npcFleet.js choose): a leg leans toward a free place within `gateRadius` u of a
  // station (`routeChance` of the legs), a new one picked once the ship is `gateArrival` u from it; a leg toward it must close at
  // least to `gateProgress` of the distance.
  traffic: { routeChance: 0.6, gateRadius: 1800, gateArrival: 900, gateProgress: 0.9 },
});
