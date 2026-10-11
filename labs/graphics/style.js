import { CONFIG } from '../../src/config.js';
import { Renderer } from '../../src/renderer.js';
import { SOUVENIR_ART, COMPACT_SOUVENIR_ART } from '../../src/interface.js';
import { LAB_ICONS } from './icons.js';
import { PALETTE, ROLES } from '../../src/roles.js';

// Eight interface/material inks. Native celestial shading and protected credits
// keep their existing colour ramps; this is not an eight-colour frame limit.
export const PALETTES = {
  cobalt: { label: 'Blue deck', black: PALETTE.black, depth: PALETTE.depth, frame: PALETTE.blue, muted: PALETTE.gray, ink: PALETTE.white, accent: PALETTE.green, warm: PALETTE.orange, danger: PALETTE.red },
};
export const DEFAULT_SETTINGS = { palette: 'cobalt', sky: 65 };
export function cleanSettings(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return {
    palette: Object.hasOwn(PALETTES, value.palette) ? value.palette : 'cobalt',
    sky: Number.isFinite(Number(value.sky)) ? Math.max(25, Math.min(100, Number(value.sky))) : 65,
  };
}
export const labStyle = { ...DEFAULT_SETTINGS };
// Explicit configuration roles used by the unchanged legacy painters. These
// bindings affect colours only, never simulation settings or source assets.
const bindings = [
  [CONFIG.sector.seam, 'color', 'structure'], [CONFIG.sector.boundary, 'edgeColor', 'caution'],
  [CONFIG.cargo, 'color', 'structure'], [CONFIG.signal, 'color', 'interactionActive'],
  // Signs are station plating (option B): grey plating, blue hatching, the
  // place's diamond in the active green SX saw on the sketch.
  [CONFIG.sign, 'frame', 'material'], [CONFIG.sign, 'hatch', 'structure'],
  [CONFIG.sign, 'text', 'textPrimary'],
  [CONFIG.sign, 'seal', 'interactionActive'],
  // CONFIG.sign.author is not bound: since 2026-10-01 it is the keys' quieter gray of src/config.js (SX: «сделай
  // везде подпись никнейма чуть темнее, а то слишком совпадает по оттенку с текстом»), which is not a palette ink.
  [CONFIG.ghost, 'color', 'material'], [CONFIG.bullet, 'color', 'highlight'],
  // Pirates (2026-09-29): one hostile ink, the palette's caution orange, for the
  // craft and for their shots, which the player's white shots are not mistaken for.
  // A hit that leaves one alive flashes it in the palette's white (highlight).
  [CONFIG.pirates, 'ink', 'caution'], [CONFIG.pirates.bullet, 'color', 'caution'],
  [CONFIG.pirates.flash, 'ink', 'highlight'],
  // The alarm inks of a label: a loss or a hit, the lost-cargo route (src/feedback.js, src/interface.js).
  [CONFIG.hud, 'caution', 'caution'], [CONFIG.hud, 'danger', 'danger'], [CONFIG.hud, 'warning', 'routeClosing'],
  // A panel's outer frame, the interface's blue (the pilot card, SX 2026-10-01). Bound to the role, not left as the
  // config's spelling: the card's ink resolver knows the palette's inks by their exact strings, and '#4980af' is not
  // '#4980AF', so the rim came out in the material gray (SX: «У меня рамочка не стала голубой»).
  [CONFIG.hud, 'edge', 'structure'],
].map(([object, key, role]) => ({ object, key, role }));
function palette() { return PALETTES.cobalt; }
function padIcon(rows, width) {
  const blank = ' '.repeat(width);
  const top = Math.floor((5 - rows.length) / 2);
  const result = Array(top).fill(blank);
  for (const row of rows) {
    const left = Math.floor((width - row.length) / 2);
    result.push(' '.repeat(left) + row + ' '.repeat(width - row.length - left));
  }
  while (result.length < 5) result.push(blank);
  return result;
}
// The inks the style gives CONFIG's colour fields: [object, key, ink], the bound roles and the HUD's four from the palette.
function configInks() {
  const p = palette();
  return [
    ...bindings.map(({ object, key, role }) => [object, key, ROLES[role]]),
    ...Object.entries({ color: p.muted, hot: p.ink, accent: p.accent, frame: p.frame }).map(([key, ink]) => [CONFIG.hud, key, ink]),
  ];
}
// The lab's settings, and the inks into CONFIG. The page calls it once at boot and then freezes CONFIG (labs/graphics/main.js; the code
// review's architecture finding 6, 2026-10-05): CONFIG takes its inks that once, and a later call (the lab drawer's palette or reset)
// finds them so and writes nothing. There is one palette, so its inks never change after boot; a second palette whose inks differ
// would throw here on the frozen CONFIG, and its inks would then belong outside CONFIG (read from the roles where they are drawn).
export function applyStyle(settings = labStyle) {
  Object.assign(labStyle, cleanSettings(settings));
  for (const [object, key, ink] of configInks()) if (object[key] !== ink) object[key] = ink;
  // The drawings of the four kinds that have a block icon stand on the icon's own rows.
  for (const id of Object.keys(SOUVENIR_ART)) {
    if (!LAB_ICONS[id]) continue;
    SOUVENIR_ART[id] = padIcon(LAB_ICONS[id], 9);
    COMPACT_SOUVENIR_ART[id] = padIcon(LAB_ICONS[id], 7);
  }
}
export class LabRenderer extends Renderer {
  resize() {
    super.resize();
    // A wide desktop reserves real space for the drawer. Canvas glyphs stay
    // at the native font size; CSS never scales the finished game frame.
    if (document.documentElement.dataset.labOpen === 'true' && window.innerWidth >= 1172) {
      this.width = window.innerWidth - 352;
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.style.width = this.width + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.font = this.font;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.layout();
    }
  }
}
