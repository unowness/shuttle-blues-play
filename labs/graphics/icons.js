import { GAMEPAD_ICON } from '../../src/interface.js';

// Experimental lab drawings at the production font's native cell size.
// Each value is a rectangular array of BMP glyph rows, with one shared ink.
// The gamepad is copied intact; the other silhouettes are not approved art.
export const LAB_ICONS = {
  gamepad: [...GAMEPAD_ICON],
  basketball: [
    '▗█▌█▖',
    '▛▀▄▀▜',
    '▝█▌█▘',
  ],
  figurine: [
    ' ▐▀▌ ',
    '▐▜█▛▌',
    ' ▄▀▄ ',
  ],
  disc: [
    '▗▄▄▄▖',
    '██ ██',
    '▝▀▀▀▘',
  ],
};
