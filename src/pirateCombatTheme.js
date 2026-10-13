// Readable combat cues in the world's glyph language. World distances are not UI spacing.
// The inks are the palette's (src/palette.js, through src/roles.js): until 2026-10-13 this file typed four hexes of its own, three
// of them outside the palette. A warning in the white, a committed attack in the caution orange of a pirate's guns and shots, a
// pirate resting in the gray, a repair in the green.
import { ROLES } from './roles.js';

export const PIRATE_CUES = {
  warning: ROLES.textPrimary, commit: ROLES.caution, recovery: ROLES.textSecondary, repair: ROLES.interactionActive,
  lineStep: 22, ringSteps: 12, ringGap: 18, labelGap: 24,
  mineScale: 1.2, capsuleScale: 1.3, cueAlpha: 0.85, ringAlpha: 0.55,
};
