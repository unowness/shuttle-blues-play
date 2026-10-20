// New pirate roles replace old allocation slots; the donor owns hull, gun damage and bounty.
import { LEGACY_PIRATE_TYPES } from './pirateAttackConfig.js';
export const PIRATE_ROLE_DONORS = { needle: 'warlord', weaver: 'brute', jackal: 'dart', tender: 'warlord' };
export const BASE_PIRATE_TYPES = LEGACY_PIRATE_TYPES;

export const PIRATE_ROLES = {
  // The stations restored before each kind may take a slot (`chance` each time): NEEDLE and WEAVER after the first, JACKAL and TENDER after
  // the third since SX, 2026-10-20 (he had met none: «ни одного пирата, который кодекс рисовал, мне не встретилось»; asked, «Раньше»);
  // 1, 3, 5 and 5 until then.
  roster: { chance: 0.5, unlocks: { needle: 1, weaver: 1, jackal: 3, tender: 3 } },
  needle: { aim: 0.35, lock: 0.14, release: 0.55, reload: 2.2, obstacleAbort: 0.65, standoff: [620, 800] },
  weaver: { windup: 0.35, lay: 2.3, reload: 2, interval: 0.5, spacing: 180, minSpeed: 70,
    obstacleAbort: 0.65, laySpeed: 0.72, standoff: [400, 620],
    fallback: { prepare: 0.25, pass: 1.2, reset: 1.4, speed: 0.75, alignment: 0.2 } },
  mine: { activeCap: 3, encounterBudget: 6, arm: 1.2, life: 14, radius: 18, trigger: 78 },
  jackal: { secure: 1.4, reach: 110, recoverReach: 80, departReach: 95, announce: 3, loadedSpeed: 0.72,
    pickupSpeed: 0.75, pickupGain: 1.4, secureSpeed: 100, interrupt: 1, capsuleOffset: 180, departureDistance: 2200 },
  tender: { supply: 2, range: 235, windup: 1.5, withdraw: 2.5, meaningfulHit: 1, pulse: 1,
    connectSpeed: 90, approachSpeed: 0.6, stopRange: 0.7 },
};

// SX selected N2/W3/J3/T2, nose up. Paint roles use the existing hull/trim/mark/drive/gun grammar.
export const PIRATE_ROLE_ART = {
  needle: { label: 'NEEDLE', art: ['  ╿  ', '  ┃  ', ' ╱▲╲ ', '◢┴╋┴◣', ' ▴ ▴ '],
    parts: ['  g  ', '  t  ', ' hmh ', 'htmth', ' e e '] },
  weaver: { label: 'WEAVER', art: [' ╿   ╿ ', '◢━┬▲┬━◣', '▴└┤▼├┘▴', '  ▼ ▼  '],
    parts: [' g   g ', 'httmtth', 'etthtte', '  m m  '] },
  jackal: { label: 'JACKAL', art: [' ╿     ', '◢▲◣┌─┐ ', '│▼├┤ │ ', '╲│╱└─┘ ', ' ▴  ▴  '],
    parts: [' g     ', 'hmhttt ', 'hhtt t ', 'hthttt ', ' e  e  '] },
  tender: { label: 'TENDER', art: ['   ╿   ', '[━◢▲◣━]', ' ╲│▼│╱ ', '  ▴ ▴  '],
    parts: ['   g   ', 'mthmhtm', ' hthth ', '  e e  '] },
};
