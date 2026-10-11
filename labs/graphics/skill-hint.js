// A skill's one-time hint, drawn (SX, 2026-10-09, on labs/graphics/sketches/teach-hints.html: «берем Т4 by the shift», T4 BY THE SHIP; when and
// what is src/skillHints.js). The key as the cockpit's keycap (a white letter in the structure blue, labs/graphics/ui-parts.js keycap, the
// one the deck's C, ?, L and P are) and the verb in white, right of the ship on its middle line, riding with it as the distances in space do;
// no reason words, the rock or the pirates are there to see. The interface's one type size, the text's shadow only (src/textShadow.js: the
// flight's labels group casts it). Where the mode has no key for the skill (MOUSE + HOTKEYS), its way is white words, as the controls
// window writes one (src/controls.js skillWay, labs/graphics/swiss-window.js keyTokens). Presentation only: nothing here is read by the world.
//
// Where: the first cap's left stroke the hull's radius right of the ship's middle (the sketch's 830 for a ship at 785, its radius 44), the
// row's middle on the ship's, which the keycap's rise and its row about it keep to a pixel. The caps of one way a cap's air apart, as the
// keycap leaves between a cap and its words; a way in words, and the verb after it, a step (UI.line.cols) on. A hint with a second way (the
// steering's reverse: [A] [D] STEER  [S] BACK) has it a group's step (UI.group.cols) after the first verb.
import { ROLES } from '../../src/roles.js';
import { UI } from '../../src/uiGrid.js';
import { clamp } from '../../src/util.js';
import { withAlpha } from '../../src/hover.js';
import { SKILLS, HINT, hintWords } from '../../src/skillHints.js';
import { keycap, KEYCAP_PAD } from './ui-parts.js';
import { unnoted } from './clicks.js';
import { keyTokens } from './swiss-window.js';

const W = ROLES.textPrimary;
// A cap on the sky is a legend, not a button: it answers no click (clicks.js unnoted), and its letter stands in its cap (no shadow).
const CAP = { reach: 0, ink: W, cap: ROLES.structure };

// How much of itself the hint shows: in over HINT.fade s as it comes, out as it goes (`s.out`), whole when it stands; whole always for
// reduced motion (the fade is none then, src/skillHints.js stepSkillHints).
export function hintAlpha(s, reducedMotion = false) {
  if (reducedMotion) return 1;
  return clamp(Math.min(s.age / HINT.fade, s.out < 0 ? 1 : 1 - s.out / HINT.fade), 0, 1);
}

// The hint `s` (src/skillHints.js: the one that stands) beside the ship, in `scheme`'s words. Returns the box it takes, or null.
const BOX = { x: 0, y: 0, w: 0, h: 0 };
const P = { r: null, x: 0, y: 0, tokens: null, cell: '', verb: '', tokens2: null, cell2: '', verb2: '' };
// A way, its caps or its words, from `x`; returns where its verb starts.
function paintWay(r, x, tokens, cell) {
  if (tokens) for (const key of tokens) x = keycap(r, key, x + KEYCAP_PAD, P.y, CAP);
  else { r.text(cell, x, P.y, W); x += (cell.length + UI.line.cols) * r.cellW; }
  return x;
}
function paintHint() {
  const r = P.r;
  let x = paintWay(r, P.x, P.tokens, P.cell);
  r.text(P.verb, x, P.y, W);
  x += P.verb.length * r.cellW;
  if (P.verb2) {
    x = paintWay(r, x + UI.group.cols * r.cellW, P.tokens2, P.cell2);
    r.text(P.verb2, x, P.y, W);
    x += P.verb2.length * r.cellW;
  }
  BOX.w = x - BOX.x;
}
const paintUnnoted = () => unnoted(paintHint);
export function drawSkillHint(r, world, s, { scheme, reducedMotion = false } = {}) {
  const alpha = hintAlpha(s, reducedMotion);
  if (alpha <= 0.01) return null;
  const ship = world.ship, at = world.project(r, ship.x, ship.y), words = hintWords(s, scheme);
  P.r = r; P.x = Math.round(at.x + ship.radius); P.y = Math.round(at.y - r.cellH / 2);
  const then = SKILLS[s.skill].then;
  P.tokens = keyTokens(words.cell); P.cell = words.cell; P.verb = SKILLS[s.skill].verb;
  P.tokens2 = words.cell2 ? keyTokens(words.cell2) : null; P.cell2 = words.cell2; P.verb2 = then && words.cell2 ? then.verb : '';
  BOX.x = P.x; BOX.y = P.y - 2; BOX.h = r.cellH + 3;
  withAlpha(r.ctx, alpha, paintUnnoted);
  return BOX;
}
