// Greeting a friendly ship, drawn (SX, 2026-10-07, on labs/graphics/sketches/npc-greeting.html: «берем g2 wave и нотч вставь ручку для
// переключения в настройки геймплея»; why: «мне не нравится название действия Hail, не нравится что на это действие такая огромная
// табличка выводится, и не очень нравится как палочка у диалогового бабла выглядит и он сам»). A friendly ship (the fleet's, O-08's
// traffic) opens no window: when its window would come (labs/graphics/context.js, the ship standing within its 460 u), the offer stands
// beside it, and its number key or a click on it greets (src/greetings.js greetCraft). The ships' own words (their hails at the pilot,
// their answers) and the pilot's greeting take the same style (`greet` on the hail: src/feedback.js drawGreet); the quests' ships keep
// their hails. Two styles, GAMEPLAY's GREETING row (labs/graphics/pause.js), kept in this browser with the other GAMEPLAY settings:
//
//   WAVE   (G2) the offer: the key and WAVE beside the ship, no frame. The answer stands in the same place: a vertical line in the
//          ship's hull ink grows down beside it, then its words. Since SX, 2026-10-08 («Когда у меня диалог с нпс фразы нашего корабля не
//          отображаются, а окна которые возле нпс возникают должны быть подальше от их центра, плюс они как бы всегда должны в сторону
//          нашего корабля тянуться, но не перекрывать его»): the offer and the words stand on the ship's side toward the pilot's ship,
//          `off` cells out from its drawing (one row right of it, a line's two cells, until then), above or below it where they would
//          lie on the pilot's hull; and the pilot's own greeting is written the same way beside the pilot's ship, on the side of the
//          craft greeted (it was not written: its key lit was its say)
//   NOTCH  (G4) the offer: SAY HI after the ship's name, one row, a hairline under the row. Each line said in a bubble over its ship: a
//          black sheet in the windows' frame, its tail a notch cut down out of its own bottom line, one line with the frame
// Since SX, 2026-10-17 («диалоги с NPC на палочках. Да, так же, как диалоги с планетами на палочках») the words of both stand on the hail's
// slash, as a planet's (src/feedback.js drawHail): the style picks the offer alone.
//
// A ship's name stands over its words, in the quiet ink, the words white under it, both flush on one edge (SX, 2026-10-16: «Имена NPC
// ... залезают на их рисунок и на их речь залезают. Имена NPC пусть появляются только когда вот я нажал поздороваться ... и пусть имя
// будет там сверху на два фразочкой то есть двойная линия выровненная ... имя там приглушенная фразочка белая»); the world writes no
// name under a ship since (src/worldDraw.js), so NOTCH's offer stands centred under it (the sketch's G4 had slid it after the name).
//
// State is kept (one record a craft, made the first time it is seen); the frame draws through scratch objects and module-level painters.
import { ROLES } from '../../src/roles.js';
import { UI } from '../../src/uiGrid.js';
import { clamp } from '../../src/util.js';
import { keyName } from '../../src/controls.js';
import { GREET, GREET_WORDS, PILOT_HAIL_ID } from '../../src/greetings.js';
import { drawHail } from '../../src/feedback.js';
import { readGameplay, writeGameplay } from '../../src/prefs.js';
import { hoverItem, withAlpha } from '../../src/hover.js';
import { keycap, KEYCAP_PAD, KEYCAP_RISE } from './ui-parts.js';
import { noteKeycap } from './clicks.js';
import { tr } from '../../src/lang.js';

export const GREETINGS = Object.freeze(['wave', 'notch']);
export const GREETING_NAMES = Object.freeze({ wave: 'WAVE', notch: 'NOTCH' });
export const DEFAULT_GREETING = 'wave';
export const fitGreeting = (v) => (GREETINGS.includes(v) ? v : DEFAULT_GREETING);

// Kept with the GAMEPLAY settings (src/prefs.js PREFS.gameplay, `greeting`): WAVE unless NOTCH was kept.
export const readGreeting = (store) => fitGreeting(readGameplay(store).greeting);
// The page's: { style }, read once at the start, changed by GAMEPLAY's row (setGreeting).
export const createGreeting = (store) => ({ style: readGreeting(store) });
export function setGreeting(greeting, style, store) {
  greeting.style = fitGreeting(style);
  writeGameplay({ greeting: greeting.style }, store);
  return greeting.style;
}

// The sketch's moments: the key lit `flash` s once pressed, the offer out in `fade` s (and back in as long once the craft may be greeted
// again, GREET.again); the offer kept out while the ship's words stand within `quiet` s (WAVE).
// `off` the cells between a ship's drawing and the offer beside it (SX, 2026-10-08: «подальше от их центра»).
export const GREETING = Object.freeze({ flash: 0.15, fade: 0.25, quiet: 0.1, off: 4 });

const W = ROLES.textPrimary, G = ROLES.textSecondary, QUIET = ROLES.textHint;
const px = (v) => Math.round(v) + 0.5;
function colsOf(rows) {
  let n = 0;
  for (const row of rows) n = Math.max(n, row.length);
  return n;
}

// Beside a ship drawn at (cx, cy) on the screen, `hw` x `hh` its half size: the box of `w` x `h` (its middle on the ship's middle row) on
// its side toward `to` (the other ship's place on the screen), GREETING.off cells out; where that lies on `hull` (the pilot's hull's box,
// when the words are a craft's), above the ship or below it, on the side away from the hull. Fills `out` ({ x, y, side }).
function besideToward(r, cx, cy, hw, hh, w, h, to, hull, out) {
  const side = to.x < cx ? -1 : 1, gap = GREETING.off * r.cellW;
  out.side = side;
  out.x = side > 0 ? cx + hw + gap : cx - hw - gap - w;
  out.y = cy - h / 2;
  if (hull && out.x < hull.x + hull.w && out.x + w > hull.x && out.y < hull.y + hull.h && out.y + h > hull.y) {
    const up = hull.y + hull.h / 2 > cy;
    out.y = up ? cy - hh - gap - h : cy + hh + gap;
  }
  return out;
}
// The pilot's hull on the screen: the square round its drawing (as the context windows keep off it, context.js).
const HULL = { x: 0, y: 0, w: 0, h: 0 };
function pilotHull(r, world) {
  const ship = world.ship, at = world.project(r, ship.x, ship.y);
  let half = 24;
  if (ship?.alive && ship.model) { const mt = ship.metrics || ship.measureDrawing(r.cellW, r.cellH); half = Math.max(ship.model.width * mt.w, ship.model.height * mt.h) / 2 * (r.zoom ?? 1); }
  HULL.x = at.x - half; HULL.y = at.y - half; HULL.w = 2 * half; HULL.h = 2 * half;
  return HULL;
}
const PLACE = { x: 0, y: 0, side: 1 };

// Each craft's offer, by its id: `a` its own presence (out while greeted, back once it may be again), `at` the world's time of its last
// step, `spoke` the world's time WAVE's answer last stood in its place, `box` where the offer stands (its click), `hover` its hover's id.
const offers = new Map();
function offerOf(id, t) {
  let s = offers.get(id);
  if (!s) offers.set(id, (s = { a: 1, at: t, spoke: -Infinity, box: { x: 0, y: 0, w: 0, h: 0 }, hover: `greet:${id}` }));
  return s;
}

// The offer's painter and what it reads (one frame's, set before it is called).
const O = { r: null, key: '', word: '', x: 0, y: 0, lit: false, ink: W, line: false, x0: 0, x1: 0, live: false, hover: '', box: null };
const CAP = { reach: 0, ink: W, cap: ROLES.structure };
function paintOffer() {
  const r = O.r;
  CAP.ink = O.ink === QUIET ? QUIET : W; CAP.cap = O.lit ? W : ROLES.structure;
  const next = keycap(r, O.key, O.x + KEYCAP_PAD, O.y, CAP);
  r.text(O.word, next, O.y, O.lit ? W : O.ink);
  if (!O.line) return;
  const c = r.ctx, y = O.y + r.cellH + UI.air.rule / 2;
  c.save(); c.strokeStyle = ROLES.frame; c.lineWidth = 1; c.beginPath(); c.moveTo(px(O.x0), px(y)); c.lineTo(px(O.x1), px(y)); c.stroke(); c.restore();
}
function paintOfferHovered() {
  if (O.live) return hoverItem(O.r, O.hover, O.box, paintOffer);
  return paintOffer();
}

// The offer about `target` (a friendly ship's candidate: src/menus.js craftCandidate, its `greet` the craft) at `presence` (0..1, the
// window's coming and going: context.js), in `style`. `live`: its key answers a click and it comes up under the pointer; `far`: out of
// reach (a pointed ship far off), in the quiet ink. Returns the box it takes, or null.
export function drawGreetOffer(r, world, target, presence, { live = true, far = false, style = DEFAULT_GREETING, reducedMotion = false } = {}) {
  const craft = target.greet, t = world.time ?? 0, s = offerOf(craft.id, t);
  const dt = clamp(t - s.at, 0, 0.1);
  s.at = t;
  const age = t - (world.greeted?.get(craft.id) ?? -Infinity);
  const lit = age >= 0 && age < GREETING.flash;
  const out = (age >= 0 && age < GREET.again) || (style === 'wave' && t - s.spoke < GREETING.quiet);
  if (lit || reducedMotion) s.a = lit || !out ? 1 : 0;
  else s.a = out ? Math.max(0, s.a - dt / GREETING.fade) : Math.min(1, s.a + dt / GREETING.fade);
  const alpha = presence * s.a;
  if (alpha <= 0.01) return null;
  // (`scale` the craft's drawing as the camera draws it: its zoom, src/zoom.js.)
  const C = world.project(r, target.x, target.y), rows = craft.rows, scale = (craft.scale ?? 1) * (r.zoom ?? 1);
  const word = tr(GREET_WORDS[style] ?? GREET_WORDS.wave), key = keyName('choices') || '1';
  const wide = KEYCAP_PAD * 2 + key.length * r.cellW + r.cellW + Array.from(word).length * r.cellW;
  O.r = r; O.key = key; O.word = word; O.lit = lit; O.ink = far ? QUIET : G; O.live = live; O.hover = s.hover;
  if (style === 'notch') {
    // Centred under the ship, a row down.
    O.y = C.y + rows.length * r.cellH * scale * 0.5 + r.cellH;
    O.x = C.x - wide / 2;
    O.line = true; O.x0 = O.x; O.x1 = O.x + wide;
  } else {
    // On the craft's side toward the pilot's ship, off its hull (the keycap's rise and its row about the craft's middle row).
    const hull = pilotHull(r, world), p = besideToward(r, C.x, C.y, colsOf(rows) * r.cellW * scale / 2, rows.length * r.cellH * scale / 2,
      wide, UI.row, { x: hull.x + hull.w / 2, y: hull.y + hull.h / 2 }, hull, PLACE);
    O.x = p.x;
    O.y = p.y + (UI.row - r.cellH) / 2;
    O.line = false;
  }
  const b = s.box;
  b.x = O.x; b.y = O.y - KEYCAP_RISE; b.w = wide; b.h = UI.row;
  O.box = b;
  if (live) noteKeycap(key, b);
  withAlpha(r.ctx, alpha, paintOfferHovered);
  return b;
}

// ------------------------------------------------------------------------------------------------ the words said

// A friendly ship's line or the pilot's greeting (`item`, src/feedback.js: a hail with `greet`) where its ship is now: on the hail's slash
// up from its shoulder, as a planet's words and a quest's ship's stand (src/feedback.js drawHail; SX, 2026-10-17: «диалоги с NPC на
// палочках. Да, так же, как диалоги с планетами на палочках»), whichever offer `style` draws. Until then WAVE wrote them behind a line in the
// ship's hull ink beside it and NOTCH in a bubble over it. The ship's name a row over its words (none over the pilot's own), in the danger
// ink for a curse or a rage; the offer keeps out while they stand (WAVE). Returns the box it takes, or null.
export function drawGreetAnswer(r, world, item, style = DEFAULT_GREETING, occupied = []) {
  const id = item.hail.craftId, pilot = id === PILOT_HAIL_ID;
  if (!pilot && style === 'wave') offerOf(id, world.time ?? 0).spoke = world.time ?? 0;
  return drawHail(r, world, item, occupied, pilot ? null : item.hail.name ?? null, item.hail.angry ? ROLES.danger : G);
}
