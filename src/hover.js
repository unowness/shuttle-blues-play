// The interface under the pointer (SX, 2026-10-03). The first word had it the other way round; then: «Наведение ховера.
// Нотификейшн. Квесты. Локатор. Должны быть как будто продавливанием их, и они должны становиться типа чуть темнее ... А наведение
// на интерфейсные кнопки, сувениры, в настройках кнопки. Кнопки внутри контекстных окон. Кнопки на панели управления ... Они
// должны увеличиваться при ховере», and «надо придумать что-то, чтобы комфортным область нажатия сделать, это у нас все так
// двигается, трудно очень попасть».
//
// Two kinds of thing answer the pointer:
// - a PANEL, a thing that stands on its own over the flight and is touched as a whole (a notice, a find's notice, the cargo's
//   plate, a quest's plate, the locator's scope), gives under the pointer as if pressed: a little smaller and 15 % darker
//   (`kind: 'panel'`); a press presses it as far again.
// - a BUTTON, a thing a panel or a window holds that does one thing (a menu's row, a key, a souvenir's tile, a card's line, a
//   setting of the pause, a ship of the hangar, a word of a sign, the deck's keys), comes up to the pointer: a little larger,
//   no darker (`kind: 'button'`, by default); a press takes it down, past its rest as a key goes down under a finger.
//
// The numbers:
// - one depth for both, 3.5 % (1.035 up, 1 / 1.035 in): the size a find's notice lifted by when it was the lifting kind.
// - `edge`: no edge moves more than 3 px, so a wide row (a menu's, 280 px: it would move 4.9 px an edge at 3.5 %) moves no more
//   than a small tile (60 px: 1.05 px) is seen to; a small one keeps the whole 3.5 %.
// - `dim` 15 % for a panel (SX's 30 %, then «не так сильно»).
// - `rate`: the drawn pointer's own, 18 a second, so the thing and the pointer over it change together.
// - the press: dry, a mechanical key's (SX: «звук и отклик ... более сухой»): a critically damped spring at 70 a second, down in
//   about 50 ms; a button's down to 3.5 % under its rest (from its 3.5 % over), a panel's 3.5 % deeper.
// - Reduced motion keeps a panel's dim and drops every movement.
// - A FLAT thing (`kind: 'flat'`, SX's Swiss windows, 2026-10-09: «фокус и наведение — инверсия строки») neither moves nor darkens: it answers the
//   pointer by being drawn another way itself (a white bar, black text), and is still the thing under the pointer (the cursor, the stick).
//
// Easy to hit (Apple's way with a pointer: a target is larger than it looks, and it holds the pointer once it has it):
// - `stick`: a thing under the pointer keeps it while the pointer stays within STICK px round it (a row's 20 px is small, and
//   the pointer wavers), unless another is under the pointer outright;
// - labs/graphics/clicks.js answers a click that misses every key by less than STICK px with the nearest (its slop);
// - a dialog window does not move while the pointer is on it (labs/graphics/context.js dialogPlace): it follows its object
//   again, easing back, once the pointer has left it.
//
// Presentation only: what a thing does on a click is the caller's (labs/graphics/clicks.js keys and actions, the page's own hit
// tests). The box asked about is the thing's as laid out, never the scaled one, so its edge does not flicker under the pointer.

import { inBox } from './util.js';

export const HOVER = Object.freeze({ depth: 0.035, edge: 3, dim: 0.15, rate: 18, press: { omega: 70, zeta: 1 }, stick: 8 });
export const STICK = HOVER.stick;

// The frame's pointer ({ x, y, inside, down }, the page's labs/graphics/cursor.js state) and whether it reaches what is drawn now
// (a pop-up over the flight takes it from the interface under it).
let pointer = null, reach = true, still = false, dt = 1 / 60, frame = 0, under = null, exact = null, exactBefore = null;
// The button the pointer came onto outright in the last frame (not a panel), for its sound (U1, SX, 2026-10-16: «звуков кнопок не
// хватает»; src/audio.js `hover`): the page asks hoverEntered() once a frame.
let exactKind = null, entered = null;
const states = new Map();          // a thing's id -> { h, p, pV, frame }
const FORGET = 120;                // frames a thing not drawn keeps its state

// Once a frame, before the interface is drawn.
export function hoverFrame(p, frameDt, { reducedMotion = false } = {}) {
  entered = exact !== null && exact !== exactBefore && exactKind !== 'panel' ? exact : null;
  pointer = p ?? null;
  dt = Math.max(0, Math.min(0.05, Number(frameDt) || 0));
  still = !!reducedMotion;
  reach = true;
  under = null;
  exactBefore = exact;
  exact = null;
  frame += 1;
  if (frame % 60 === 0) for (const [id, s] of states) if (frame - s.frame > FORGET) states.delete(id);
}
// Whether the pointer reaches what is drawn next (false under a pop-up, true again for the pop-up itself).
export function hoverReach(on) { reach = !!on; }
// The frame's seconds and whether motion is reduced, as hoverFrame was told: for what eases with a hover (a window's dimming under
// the row that comes up: the LEDGER+ look of the sketch pages, labs/graphics/sketches/ledger.js).
export const hoverPace = () => ({ dt, still });
// The id of the thing under the pointer this frame, or null: the page's cursor reads it as a button (labs/graphics/cursor.js).
export const itemUnder = () => under;

export const inflate = (b, d) => (b ? { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d } : b);
// A box as `r` draws it now, on the screen: through its context's translation and scale (a group SX moved under the pause,
// labs/graphics/hud-place.js, is drawn translated), the pixel ratio taken out. Unturned contexts only, as the interface is.
export function screenBox(r, box) {
  const m = r?.ctx?.getTransform?.();
  if (!m || !box) return box;
  const k = r.dpr || 1;
  return { x: (m.a * box.x + m.e) / k, y: (m.d * box.y + m.f) / k, w: (m.a * box.w) / k, h: (m.d * box.h) / k };
}
// Whether the pointer is over `box` and may answer it now.
export function pointerOver(box) { return !!(reach && pointer?.inside && inBox(box, pointer.x, pointer.y)); }

function stateOf(id) {
  let s = states.get(id);
  if (!s) { s = { h: 0, p: 0, pV: 0, frame: -1 }; states.set(id, s); }
  return s;
}
function step(s, over, down) {
  if (s.frame === frame) return s;   // drawn twice in a frame (measured, then drawn): stepped once
  const first = s.frame < 0;
  s.frame = frame;
  if (first && !over) return s;
  s.h += ((over ? 1 : 0) - s.h) * (1 - Math.exp(-dt * HOVER.rate));
  const to = over && down ? 1 : 0, { omega, zeta } = HOVER.press;
  for (let left = dt; left > 1e-6;) {
    const t = Math.min(left, 1 / 240);
    s.pV += (omega * omega * (to - s.p) - 2 * zeta * omega * s.pV) * t;
    s.p += s.pV * t;
    left -= t;
  }
  return s;
}

// A thing of `box`'s scale at hover `h` and press `p` (0..1): a button up by the hover and down by twice the press (so pressed
// it stands as far under its rest as it stood over it), a panel in by both. No edge moves more than `edge` px a step.
export function hoverScale(box, h, p = 0, kind = 'button') {
  if (kind === 'flat') return 1;
  const side = Math.max(1, box.w, box.h), step = Math.min(HOVER.depth, (2 * HOVER.edge) / side);
  return kind === 'panel' ? 1 - step * (h + p) : 1 + step * (h - 2 * p);
}

// Whether a thing looks any different now: the pointer is on it, or it is still coming back. A painter that draws a thing in
// one piece while it rests asks this first (labs/graphics/clicks.js: a keyed string is cut into pieces only then).
export function hoverLive(id, box) {
  if (pointerOver(box)) return true;
  const s = states.get(id);
  return !!s && (s.h >= 0.004 || Math.abs(s.p) >= 0.004 || Math.abs(s.pV) >= 0.05);
}

// The context's alpha, multiplied by `f` while `draw` runs: whatever it draws and however it sets the alpha (a painter's text
// sets it for each string, a frame's line sets it to 1), it comes out `f` as bright. A context of the canvas, a recorder (the old
// shadow's, labs/graphics/sketches/hudShadow.js, in the sketch pages) and a check's plain object alike.
function dimmed(ctx, f, draw) {
  if (!ctx || f >= 0.999) return draw();
  const own = Object.getOwnPropertyDescriptor(ctx, 'globalAlpha');
  let base;
  if (own && !own.get) {
    let v = own.value;
    base = { get: () => v, set: (x) => { v = x; } };
  } else {
    let d = own;
    for (let o = Object.getPrototypeOf(ctx); !d && o; o = Object.getPrototypeOf(o)) d = Object.getOwnPropertyDescriptor(o, 'globalAlpha');
    if (!d?.get) return draw();
    base = { get: () => d.get.call(ctx), set: (x) => d.set.call(ctx, x) };
  }
  const was = base.get();
  Object.defineProperty(ctx, 'globalAlpha', { configurable: true, enumerable: true, get: () => base.get() / f, set: (v) => base.set(v * f) });
  base.set(was * f);
  try { return draw(); } finally {
    if (own) Object.defineProperty(ctx, 'globalAlpha', own); else delete ctx.globalAlpha;
    if (own && !own.get) ctx.globalAlpha = was; else base.set(was);
  }
}

// `draw()` at `k` of its own alpha, whatever alphas it sets (a dialog window coming and going: labs/graphics/context.js).
export const withAlpha = (ctx, k, draw) => dimmed(ctx, Math.max(0, Math.min(1, k)), draw);

// A thing inside a thing (a line's [K] inside the line that is the button) is the outer one's: it is drawn as it is.
let depth = 0;
const inside = (draw) => { depth += 1; try { return draw(); } finally { depth -= 1; } };

// Draws a thing: `draw()` inside its box `box`, a button grown or a panel pressed by how long the pointer has been on it. `over`:
// whether the pointer is on it now, when the caller knows better than the box (a quest plate's own pointer); else the box says.
// Once it has the pointer it keeps it within STICK px round it, while nothing else is under the pointer outright. Returns what
// `draw` returns.
export function hoverItem(r, id, box, draw, { over = null, disabled = false, kind = 'button' } = {}) {
  if (depth > 0) return draw();
  const s = stateOf(id), seen = screenBox(r, box);
  const outright = !disabled && reach && !!(over ?? pointerOver(seen));
  const held = !outright && !disabled && reach && s.h > 0.5 && (exactBefore === null || exactBefore === id)
    && pointerOver(inflate(seen, STICK));
  const on = outright || held;
  if (outright) { exact = id; exactKind = kind; }
  if (on) under = id;
  step(s, on, !!pointer?.down);
  if (s.h < 0.004 && Math.abs(s.p) < 0.004 && Math.abs(s.pV) < 0.05) return inside(draw);
  const ctx = r?.ctx, alpha = kind === 'panel' ? 1 - HOVER.dim * Math.max(0, Math.min(1, s.h)) : 1;
  const k = still ? 1 : hoverScale(box, Math.max(0, s.h), s.p, kind);
  const turn = k !== 1 && typeof ctx?.scale === 'function';
  if (turn) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
  }
  try { return dimmed(ctx, alpha, () => inside(draw)); } finally { if (turn) ctx.restore(); }
}
// The button the pointer came onto in the last frame, or null.
export const hoverEntered = () => entered;
// Whether a thing is being drawn now (its own keys are its own then, not things of their own).
export const inItem = () => depth > 0;
