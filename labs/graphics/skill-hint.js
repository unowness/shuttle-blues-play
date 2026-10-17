// A skill's one-time hint, drawn (SX, 2026-10-09, on labs/graphics/sketches/teach-hints.html: «берем Т4 by the shift», T4 BY THE SHIP; when and
// what is src/skillHints.js). The key as the cockpit's keycap (a white letter in the structure blue, labs/graphics/ui-parts.js keycap, the
// one the deck's P, ?, L and ESC are) and the verb in white, right of the ship on its middle line, riding with it as the distances in space do;
// no reason words, the rock or the pirates are there to see. The interface's one type size, the text's shadow only (src/textShadow.js: the
// flight's labels group casts it). Where the mode has no key for the skill (MOUSE + HOTKEYS), its way is white words, as the controls
// window writes one (src/controls.js skillWay, labs/graphics/swiss.js keyTokens). Presentation only: nothing here is read by the world.
//
// Where: the first cap's left stroke the hull's reach and a step's air (`AIR` cells, UI.line) right of the ship's middle; the reach is the
// hull's radius, its drawing's farthest point however it is turned (SX, 2026-10-16: «посмотри чтобы отступ достаточный был от корабля,
// кажется маловат сейчас»: on the radius alone, MODERN's wing tips came up to the cap whenever the ship stood turned 45 degrees). The parts of
// a line one under the other, left-aligned, a row (UI.row) apart, as the deck's screens stack their keys, the column's middle on the ship's
// (SX, the same day: «лучше не две в строку, а столбиком друг под другом выровненная по левому краю»; a line's parts stood side by side, a
// group's step apart, until then); a row's middle on its text's, which the keycap's rise and its row about it keep to a pixel. The caps of
// one way a cap's air apart, as the keycap leaves between a cap and its words; a way in words, and the verb after it, a step (UI.line.cols)
// on. A way with a join (the trick from the ground) has its mark where a cap's letter would stand between its two caps: [Q] → [E].
//
// The first flight's cross (SX, 2026-10-16: «w внизу, s наверху a d слева и справа»): the four caps alone round the ship, on the screen's axes
// (the camera never turns), each its stroke as far off the ship's middle as the line's first cap is: W under, S over, A left, D right. A part
// answered dims to HINT.done over HINT.fade while the rest of its line stands («затухают, когда узер все кнопки нажал»).
import { ROLES } from '../../src/roles.js';
import { UI } from '../../src/uiGrid.js';
import { clamp } from '../../src/util.js';
import { withAlpha } from '../../src/hover.js';
import { HINTS, HINT, hintWords, partShown, partDone } from '../../src/skillHints.js';
import { keycap, KEYCAP_PAD, KEYCAP_RISE } from './ui-parts.js';
import { unnoted } from './clicks.js';
import { keyTokens } from './swiss.js';

const W = ROLES.textPrimary;
// A cap on the sky is a legend, not a button: it answers no click (clicks.js unnoted), and its letter stands in its cap (no shadow).
const CAP = { reach: 0, ink: W, cap: ROLES.structure };
// The cross's four, by the move line's parts (src/skillHints.js HINTS.move): the side of the ship each stands on, x and y on the screen.
export const CROSS = Object.freeze([[0, 1], [0, -1], [-1, 0], [1, 0]]);
// The air between the hull's reach and the hint, in cells: a step.
export const AIR = UI.line.cols;
// How far off the ship's middle a hint's nearest stroke stands, px: the hull's reach as the camera draws it (its zoom, src/zoom.js) and the air.
export const hintReach = (r, ship) => ship.radius * (r.zoom ?? 1) + AIR * r.cellW;

// How much of itself the hint shows: in over HINT.fade s as it comes, out as it goes (`s.out`), whole when it stands; whole always for
// reduced motion (the fade is none then, src/skillHints.js stepSkillHints).
export function hintAlpha(s, reducedMotion = false) {
  if (reducedMotion) return 1;
  return clamp(Math.min(s.age / HINT.fade, s.out < 0 ? 1 : 1 - s.out / HINT.fade), 0, 1);
}
// How much of itself a part shows within its line: whole, or dimming to HINT.done once answered (at once for reduced motion).
export function partAlpha(s, i, reducedMotion = false) {
  if (!partDone(s, i)) return 1;
  const u = reducedMotion ? 1 : clamp(s.since[i] / HINT.fade, 0, 1);
  return 1 - (1 - HINT.done) * u;
}

// The hint `s` (src/skillHints.js: the one that stands) beside the ship, in `scheme`'s words. Returns the box it takes, or null.
const BOX = { x: 0, y: 0, w: 0, h: 0 };
const P = { r: null, x: 0, y: 0, tokens: null, cell: '', verb: '', join: '' };
// A way, its caps (a join's mark between them) or its words, from `x`; returns where its verb starts.
function paintWay(r, x, tokens, cell, join) {
  if (tokens) {
    for (let i = 0; i < tokens.length; i++) {
      if (i && join) { r.text(join, x + KEYCAP_PAD, P.y, W); x += 2 * r.cellW; }
      x = keycap(r, tokens[i], x + KEYCAP_PAD, P.y, CAP);
    }
  } else { r.text(cell, x, P.y, W); x += (cell.length + UI.line.cols) * r.cellW; }
  return x;
}
function paintPart() {
  const r = P.r, x = paintWay(r, P.x, P.tokens, P.cell, P.join);
  if (P.verb) r.text(P.verb, x, P.y, W);
  P.x = x + P.verb.length * r.cellW;
}
const paintUnnoted = () => unnoted(paintPart);
const paintCapNow = () => keycap(P.r, P.cell, P.x, P.y, CAP);
const paintCap = () => unnoted(paintCapNow);
// The cross's caps (CROSS) about the ship's middle `at`, each its stroke `R` px off it.
function drawCross(r, s, words, at, R, alpha, reducedMotion) {
  const ch = r.cellH;
  BOX.x = at.x - R; BOX.y = at.y - R; BOX.w = BOX.h = 2 * R;
  for (let i = 0; i < CROSS.length; i++) {
    if (!partShown(s, i)) continue;
    const key = words.cells[i], w = Array.from(key).length * r.cellW, [sx, sy] = CROSS[i];
    // The letter's box from the cap's stroke (ui-parts.js keycap: KEYCAP_PAD either side, KEYCAP_RISE above, a pixel below).
    const x = sx < 0 ? at.x - R - KEYCAP_PAD - w : sx > 0 ? at.x + R + KEYCAP_PAD : at.x - w / 2;
    const y = sy < 0 ? at.y - R - 1 - ch : sy > 0 ? at.y + R + KEYCAP_RISE : at.y - ch / 2;
    P.r = r; P.cell = key; P.x = Math.round(x); P.y = Math.round(y);
    withAlpha(r.ctx, alpha * partAlpha(s, i, reducedMotion), paintCap);
    BOX.x = Math.min(BOX.x, P.x - KEYCAP_PAD); BOX.y = Math.min(BOX.y, P.y - KEYCAP_RISE);
    BOX.w = Math.max(BOX.w, P.x + w + KEYCAP_PAD - BOX.x); BOX.h = Math.max(BOX.h, P.y + ch + 1 - BOX.y);
  }
  return BOX;
}
export function drawSkillHint(r, world, s, { scheme, reducedMotion = false } = {}) {
  const alpha = hintAlpha(s, reducedMotion);
  if (alpha <= 0.01) return null;
  const ship = world.ship, at = world.project(r, ship.x, ship.y), words = hintWords(s, scheme), line = HINTS[s.id], R = hintReach(r, ship);
  if (line.cross) return drawCross(r, s, words, at, R, alpha, reducedMotion);
  let rows = 0;
  for (let i = 0; i < line.parts.length; i++) if (partShown(s, i)) rows++;
  const left = Math.round(at.x + R), top = Math.round(at.y - r.cellH / 2 - ((rows - 1) * UI.row) / 2);
  BOX.x = left; BOX.y = top - 2; BOX.w = 0; BOX.h = (rows - 1) * UI.row + r.cellH + 3;
  let row = 0;
  for (let i = 0; i < line.parts.length; i++) {
    if (!partShown(s, i)) continue;
    const p = line.parts[i];
    P.r = r; P.x = left; P.y = top + row * UI.row; row++;
    P.cell = words.cells[i]; P.tokens = keyTokens(P.cell); P.verb = p.verb; P.join = p.join;
    withAlpha(r.ctx, alpha * partAlpha(s, i, reducedMotion), paintUnnoted);
    BOX.w = Math.max(BOX.w, P.x - left);
  }
  return BOX;
}
