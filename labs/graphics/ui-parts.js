import { hasDistanceMark, markRuns, traceDistanceMark } from '../../src/distanceMark.js';
import { ROLES } from '../../src/roles.js';
import { noteKeycap } from './clicks.js';
import { onPlate } from '../../src/textShadow.js';

// Small shared painters for the lab cockpit. Presentation only.

function backing(r, bounds) {
  r.fill(bounds.x, bounds.y, bounds.w, bounds.h, ROLES.backing);
}

export function backedText(r, value, x, y, ink = ROLES.textSecondary) {
  backing(r, { x, y, w: Array.from(value).length * r.cellW, h: r.cellH });
  r.text(value, x, y, ink);
}

// Text over open space: a thin black knockout outline around the letters
// instead of a black box, so no rectangle shows over stars or a planet
// (SX, 2026-09-26). The outline is space-black and hard-edged: not a glow.
const HALO = 3;
export function haloText(r, value, x, y, ink = ROLES.textSecondary) {
  if (!value) return;
  const { ctx } = r;
  ctx.save();
  ctx.font = r.font; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.globalAlpha = 1; ctx.lineJoin = 'round'; ctx.lineWidth = HALO; ctx.strokeStyle = ROLES.backing;
  if (hasDistanceMark(value)) {
    // A distance's mark gets its halo as lines; its two cells are blank to the font.
    const runs = markRuns(value), { capTop, capBottom } = r.capInk?.() ?? { capTop: 1.4, capBottom: 11.97 };
    for (const run of runs) if (!run.mark) ctx.strokeText(run.text, x + run.at * r.cellW, y);
    ctx.lineCap = 'square'; ctx.beginPath();
    for (const run of runs) if (run.mark) traceDistanceMark(ctx, x + run.at * r.cellW, y, r.cellW, capTop, capBottom);
    ctx.stroke();
  } else ctx.strokeText(value, x, y);
  ctx.restore();
  r.text(value, x, y, ink);
}

function strokeRect(r, x, y, w, h, ink) {
  const { ctx } = r;
  ctx.save();
  ctx.lineWidth = 1; ctx.globalAlpha = 1; ctx.strokeStyle = ink;
  ctx.beginPath(); ctx.rect(Math.round(x) + .5, Math.round(y) + .5, Math.round(w) - 1, Math.round(h) - 1);
  ctx.stroke(); ctx.restore();
}

// The legend's own key (locator.js `key-m`, the M of M LEGEND) is a mark 2 * KEY_MARK_HALF px wide, centred half a cell in
// from the scope's ink edge; `keyMarkLeft` is where its left stroke stands, for a key hint that must keep that edge: the
// quest list's Q QUEST under its plates (SX, 2026-10-02: «Q Point надо Q - Quest назвать и выровнять как на скриншоте»).
export const KEY_MARK_HALF = 4;
export const keyMarkLeft = (r, scopeInkLeft) => scopeInkLeft + r.cellW / 2 - KEY_MARK_HALF;

// A key drawn as a small vector cap around its native glyphs. Returns the x
// where the following label starts. The cap rises KEYCAP_RISE px above its
// text row; layouts that stack a cap under something read this, not a copy.
export const KEYCAP_RISE = 2;
// The cap's stroke stands this far left of its letter and as far right of it: a layout that must put the cap's left edge
// somewhere draws the key at `left + KEYCAP_PAD`.
export const KEYCAP_PAD = 3;
// `reach`: px after the cap that answer a click as its key too (its words); a row that notes its own box asks for none.
export function keycap(r, key, x, y, { ink = ROLES.textPrimary, cap = ROLES.structure, reach = 24 * r.cellW } = {}) {
  const w = Array.from(key).length * r.cellW;
  // One more pixel above than below: the caps' ink sits low in the cell, so
  // this centres the letter in its cap (measured 1.5 over 2.5 before).
  backing(r, { x: x - KEYCAP_PAD, y: y - KEYCAP_RISE, w: w + 2 * KEYCAP_PAD, h: r.cellH + KEYCAP_RISE + 1 });
  strokeRect(r, x - KEYCAP_PAD, y - KEYCAP_RISE, w + 2 * KEYCAP_PAD, r.cellH + KEYCAP_RISE + 1, cap);
  // Its letter stands in its cap, not on the sky: no shadow (src/textShadow.js onPlate).
  onPlate(() => r.text(key, x, y, ink));
  // A menu's row answers a click as its key (labs/graphics/clicks.js): the cap and the words after it.
  noteKeycap(key, keycapBox(r, key, x, y), reach);
  return x + w + r.cellW;
}

// The box a keycap at (x, y) answers a click in: its cap, a little taller than its stroke.
export function keycapBox(r, key, x, y) {
  const w = Array.from(key).length * r.cellW;
  return { x: x - KEYCAP_PAD, y: y - KEYCAP_RISE - 2, w: w + 2 * KEYCAP_PAD, h: r.cellH + KEYCAP_RISE + 5 };
}

// A tile marked by its four corners only, `arm` px along each side (SX,
// 2026-09-30, the souvenir inventory: a grid of corner marks, not boxes).
export function cornerTile(r, { x, y, w, h }, ink, arm = 8) {
  const { ctx } = r;
  const x0 = Math.round(x) + .5, y0 = Math.round(y) + .5;
  const x1 = Math.round(x + w) - .5, y1 = Math.round(y + h) - .5;
  ctx.save();
  ctx.lineWidth = 1; ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(x0, y0 + arm); ctx.lineTo(x0, y0); ctx.lineTo(x0 + arm, y0);
  ctx.moveTo(x1 - arm, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + arm);
  ctx.moveTo(x1, y1 - arm); ctx.lineTo(x1, y1); ctx.lineTo(x1 - arm, y1);
  ctx.moveTo(x0 + arm, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - arm);
  ctx.stroke(); ctx.restore();
}

