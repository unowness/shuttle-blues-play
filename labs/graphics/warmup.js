// Glyph warm-up: every character at every size the game draws, before the first
// flight frame.
//
// The first time a font size is used, and the first time a glyph is drawn at a
// fractional position of it, the browser makes the glyph's mask. Measured in Chrome on
// the M1 Pro (2026-09-30): a size seen for the first time costs about 20 us a glyph
// (120 glyphs in 2.5-3.3 ms against 0.2 ms once warm); a glyph at a position within
// the pixel it has not been at before costs the same again, because the mask is made
// per quarter-pixel of x (y is snapped to a whole pixel); the colour makes no
// difference (a warm-up in black warms every ink); a rotated glyph at an angle it has
// not had is a new mask too, so that cannot be warmed and is left alone. A character
// the primary font lacks costs more, once: a system fallback lookup (8-20 ms for a
// rare one; none of the game's own comes near a millisecond).
//
// What is drawn is black on the black background, inside the canvas (a glyph outside
// it is culled before any mask is made), and before anything else in the frame, so
// the title is drawn over it. The lists are checked against everything the game
// draws (checks/preload.mjs), so a new character or size fails a check instead of
// costing a stutter.

import { PUFF_SIZES } from './ship-motion.js';
import { CONFIG } from '../../src/config.js';

// Every non-ASCII character the game draws on the canvas: text, art, ramps, sprites.
// checks/preload.mjs finds the ones the source and the art use and holds this list to them.
export const WARM_EXTRA = [
  '¤«°·»×–—’…',                          // coin, quotes, degree, dot, times, dashes
  '←↑→↓↖↗↘↙',                            // bearings
  '─│┊┈┌┐└┘├┤┬┴┼╌═║╧╨╭╮╯╰╱╲╴╵╶╷',        // lines and joins, the seams, the COURIER's tail
  '┄┆━┃┏┓┗┛',                            // the pilot card's dashed tiles and heavy selection (2026-09-30)
  '▀▄█▌▐░▒▓▖▗▘▙▚▛▜▝▞▟▪▮▰▱',              // blocks
  '▲▶▸◀◂◇○●◉◦▣▴▾◜◝◞◟◢◣◤◥✦',              // shapes, the edge arrows, the signal, the COURIER's nose, the pod's porthole
  '∙˙╎◠◡',                               // the ship's motion options (ship-motion.js, 2026-09-30)
  '•╳◆',                                 // the station looks' lights, braces and hubs (station-art.js, 2026-09-30)
  '✳╋',                                  // pirate mine cue and NEEDLE hull
  '╿▼',                                  // the pirates' guns and the TALON's and HOOK's keels (2026-09-30)
  '╽',                                   // THUNDER's and BLACKBIRD's pitot probe (ships/thunder.json, ships/blackbird.json, 2026-10-08)
  '╬╪╫',                                 // a repair droid's parts on their way (CONFIG.droids.part, 2026-10-01)
  '╻╡╞╸',                                // the home garage's crane, bridge and hose (garage-art.js, 2026-10-02)
  '›',                                   // the picked flag's mark on the map's column (map-screen.js, 2026-10-02)
  '‹',                                   // the pause menu's BACK (pause-menu.js, 2026-10-02)
  '⊂∩',                                  // the repair droid SPANNER's wrench, open and turned (src/droidArt.js, 2026-10-04)
  'Ψψ¥☘⚘',                               // the home garage's greenhouse plants (garage-art.js, chat G, 2026-10-04)
  '俺の名はキャプテン・ウソップ！',              // Usopp's caption, including non-star sign previews (2026-10-03)
].join('');

// The letters art is drawn with (a station's beacon, and the NPC ships' portholes and masts, src/npcShips.js: o, v, Y; LEARNER's
// L plate, 2026-10-06); every other letter and digit is text, which is only ever drawn at the base size.
const ART_LETTERS = 'oOvYL';

// The characters of the plain keyboard, which text and ramps are made of.
export const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');

const LETTERS = /[A-Za-z0-9]/;

// The four places within a device pixel a glyph's mask is made for, in CSS pixels.
export function subpixels(dpr = 1) {
  return [0, 1, 2, 3].map((k) => (k * 0.25) / (dpr || 1));
}

// Bucket sizes, as Renderer.bucket rounds them: steps of 0.05 of the font.
const bucket = (size) => Math.round(size * 20) / 20;

// Every glyph size (a multiple of the base font) the game draws at, from the models
// and the configuration, so a change to a scale follows by itself.
//   models: the ship models in play (their base scale, breathing to the slow scale)
//   stations: station models (drawn at half their scale in the lab's art, whole in the old)
export function warmSizes({ models = [], stations = [], config = CONFIG, extra = [] } = {}) {
  const sizes = new Set([1]);
  const add = (s) => { if (Number.isFinite(s) && s > 0.2 && s < 8) sizes.add(bucket(s)); };

  // The ship breathes from its base scale to the slow one in bucket steps, up or down (smaller since 2026-10-05); a wreck's
  // debris keeps whatever it had, which is one of these.
  const v = config.ship.visualScale;
  const ratio = v.slow / v.cruise;
  for (const model of models) {
    const base = model.baseScale ?? model.scale;
    const ends = [Math.round(base * 20), Math.round(base * ratio * 20)];
    for (let k = Math.min(...ends); k <= Math.max(...ends); k++) add(k / 20);
    // The thrusters' puffs, at the ship's base scale (ship-motion.js).
    for (const f of PUFF_SIZES) add(base * f);
  }
  for (const model of stations) { add(model.scale); add(model.scale / 2); }

  // Every `scale` the configuration names: sprites, signals, pirates, drops.
  const walk = (object) => {
    for (const [key, value] of Object.entries(object)) {
      if (typeof value === 'number' && /scale$/i.test(key)) add(value);
      else if (value && typeof value === 'object' && !Array.isArray(value)) walk(value);
    }
  };
  walk(config);
  for (const s of extra) add(s);
  return [...sizes].sort((a, b) => a - b);
}

// The characters worth warming at a size: the whole set at the base size (text,
// ramps, planets), and at a larger one what art is made of: no letters or digits.
export function warmChars(size, extra = WARM_EXTRA) {
  const all = Array.from(new Set(ASCII + extra));
  return size === 1 ? all : all.filter((ch) => !LETTERS.test(ch) || ART_LETTERS.includes(ch));
}

// Draws one size's characters at the four quarter pixels, in the background colour,
// in the top left of the canvas. Returns how many glyphs it drew.
export function warmSize(renderer, size, chars, config = CONFIG) {
  const { ctx } = renderer;
  const px = renderer.fontSize * size;
  const dpr = renderer.dpr || 1;
  const columnStep = Math.max(px * 0.7, 6);
  const rowStep = Math.max(px * 1.25, 8);
  const perRow = Math.max(1, Math.floor((renderer.width - 8) / columnStep));
  const rows = Math.max(1, Math.floor((renderer.height - 8) / rowStep));
  ctx.save();
  ctx.font = size === 1 ? renderer.font : `${px}px ${renderer.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = config.render.background;
  ctx.globalAlpha = 1;
  let n = 0;
  for (const dx of subpixels(dpr)) {
    for (let i = 0; i < chars.length; i++) {
      // The same cell in every pass, so a glyph is drawn again at exactly dx further on.
      const cell = i % (perRow * rows);
      ctx.fillText(chars[i], 4 + columnStep / 2 + (cell % perRow) * columnStep + dx, 4 + rowStep / 2 + Math.floor(cell / perRow) * rowStep);
      n++;
    }
  }
  ctx.restore();
  return n;
}
