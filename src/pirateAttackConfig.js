// The old allocation pool stays in its historical order for seeded encounter selection.
// New hulls replace selected slots later, under encounter/progression eligibility rules.
export const LEGACY_PIRATE_TYPES = Object.freeze(['brute', 'maw', 'warlord', 'dart']);

// SX, 2026-10-09: change old attacks first, keeping HP, damage, loot and counts.
// Cadence and steering belong here; weapon damage and hull data remain in piratesConfig.
// SX, 2026-10-13: «Как до Кодекса, ±15 %», the pressure of each type as it was before the patterns: the hull a run of 24 s of three
// of one type takes from a target parked, circling and weaving (seeds 31, 811, 2026), against 6cb7e4b: MAW 147 of 166 (-11 %),
// DART 147 of 165 (-11 %), BRUTE 106 of 110 (-4 %), WARLORD 144 of 146 (-1 %). Until then MAW recover 0.7; DART commit 1.15, recover
// 0.8, one shot, speed shares 0.85 and 0.9; BRUTE recover 3, three shots; WARLORD recover 1.5 (BRUTE took 47 % more, DART 69 % less).
export const PIRATE_ATTACKS = {
  maw: { prepare: 0.28, commit: 1.1, recover: 0.4, prepareSpeedShare: 0.45,
    commitSpeedShare: 0.98, holdingRangeShare: 0.72 },
  dart: { prepare: 0.18, commit: 0.7, recover: 0.3, shots: 2, cadence: 0.4,
    prepareSpeedShare: 0.6, commitSpeedShare: 0.55 },
  brute: { prepare: 0.28, commit: 1.6, recover: 3.5, shots: 2, cadence: 0.25,
    prepareSpeedShare: 0.75, commitSpeedShare: 0.85 },
  warlord: { prepare: 0.25, commit: 1.2, recover: 0.8, shots: 2, cadence: 0.4, regroup: 0.6,
    prepareSpeedShare: 0.85, commitSpeedShare: 0.9 },
  alignment: 0.2, alignmentGrace: 0.65, orderGrace: 1,
  obstacleAbort: 0.55, minimumClearance: 80, pressureSlots: 2,
  playerRadiusFallback: 30, startRangeShare: 0.95, pressureRangeScale: 1.7,
  recoveryTurn: Math.PI * 0.65, recoverySpeedShare: 0.65,
};
