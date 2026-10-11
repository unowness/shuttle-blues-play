// The mouse on the menus (SX, 2026-10-02: «по всем менюшкам можно кликнуть первой кнопкой мыши, поп апы закрываются кликом
// в пространство вне поп апа»).
//
// Every menu already says its keys: a keycap (an object's menu, labs/graphics/context.js) or a key in brackets in its text
// ("[0] CLOSE", "[1] BUY", "[TAB] CLOSE   [1-5] FLAG"). While a menu is drawn, the page turns `noting` on and each of those
// is noted with the box it is drawn in; a click in a box presses its key for one frame, as the keyboard would, so a click
// does exactly what the key does and nothing a menu does had to learn the mouse. Each key in brackets answers on its own
// characters ([← →]: each arrow its own), and the words after it answer for its first key.
//
// And the pop-ups' extent: `measure(r, draw)` runs a pop-up's drawing and returns the box round everything it put on the
// canvas (its fills, text, pictures and frames), so a click outside that box can close it.
//
// Each "[KEY] WORDS" that answers is an item under the pointer too (src/hover.js, SX 2026-10-03): from its bracket to
// the end of its words it comes up, a button, while the pointer is on it. A string with one is drawn in pieces then, cell by cell
// where it stood (the font is monospaced), and in one piece otherwise.
import { hoverItem, hoverLive, inItem, screenBox, STICK } from '../../src/hover.js';

let noting = null;   // the frame's list the menus' keys go to, or null
let open = false;    // a menu is being drawn now
let only = null;     // a set of key codes to keep, or null for all
let regions = [];    // the last frame's: { x, y, w, h, code }

const NAMED = { ESC: 'Escape', TAB: 'Tab', ENTER: 'Enter', SPACE: 'Space', BACKSPACE: 'Backspace', BKSP: 'Backspace', '←': 'ArrowLeft',
  '→': 'ArrowRight', '↑': 'ArrowUp', '↓': 'ArrowDown', '?': 'Slash' };
const ARROWS = new Set(['←', '→', '↑', '↓']);

// A key's name as drawn ("0", "P", "ESC", "←") to its KeyboardEvent code, or null.
export function keyCodeOf(name) {
  const k = String(name).trim().toUpperCase();
  if (NAMED[k]) return NAMED[k];
  if (/^[0-9]$/.test(k)) return `Digit${k}`;
  if (/^[A-Z]$/.test(k)) return `Key${k}`;
  return null;
}

// A frame's notes: begun before its menus are drawn and ended after; the last frame's answer the clicks meanwhile.
export function beginNotes() { noting = []; muted = false; }
export function endNotes() { if (noting) regions = noting; noting = null; muted = false; }
// While muted nothing is noted: the interface under a pop-up or the pause (its keys are not the pop-up's).
let muted = false;
export function muteNotes(on) { muted = !!on; }
// `draw()` with nothing it draws noted (a menu going away answers no click: labs/graphics/context.js), the mute put back after.
export function unnoted(draw) {
  const was = muted;
  muted = true;
  try { return draw(); } finally { muted = was; }
}

// Draws a menu with its keys noted: its keycaps (noteKeycap) and every "[KEY] WORDS" its text says. `keep`: only these
// key codes (the controls list names every key of the game, and only its CLOSE is a button).
export function noteDuring(r, draw, keep = null) {
  if (!noting) return draw();
  const was = { open, only };
  open = true;
  only = keep ? new Set(keep) : null;
  const own = Object.hasOwn(r, 'text') ? r.text : undefined, text = r.text;
  r.text = function (str, x, y, ...rest) {
    const spans = noteKeyText(str, x, y, r.cellW);
    if (!spans.length) return text.call(this, str, x, y, ...rest);
    return keyedText(this, text, str, x, y, rest, spans, r.cellW);
  };
  try { return draw(); } finally {
    if (own === undefined) delete r.text; else r.text = own;
    open = was.open; only = was.only;
  }
}

function note(box, code) {
  if (!noting || muted || !open || !code || (only && !only.has(code))) return;
  noting.push({ ...box, code });
}

// A thing of the interface that is no menu but answers a click as a key does (the locator opens the map as TAB does): its box,
// as `r` draws it now (through a group's move, labs/graphics/hud-place.js).
export function noteKey(key, box, r = null) {
  const code = keyCodeOf(key);
  if (noting && !muted && code) noting.push({ ...(r ? screenBox(r, box) : box), code });
}

// A keycap's box, and the words after it on its row, `reach` px on; as `r` draws it now, when given.
export function noteKeycap(key, box, reach = 0, r = null) {
  const b = { x: box.x, y: box.y, w: box.w + reach, h: box.h };
  note(r ? screenBox(r, b) : b, keyCodeOf(key));
}

// A string drawn at (x, y) (its text cell's top left), `cellW` a character: each "[KEYS] WORDS" in it. Returns the ones that
// answer as { from, to, code }, characters from the bracket to the end of the words, for the hover.
function noteKeyText(str, x, y, cellW) {
  const spans = [];
  if (!noting || !open || typeof str !== 'string' || str.indexOf('[') < 0) return spans;
  const chars = Array.from(str);
  const top = y - 4, h = 20;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '[') continue;
    const close = chars.indexOf(']', i + 1);
    if (close < 0) break;
    const inside = chars.slice(i + 1, close).join('');
    // Its keys: the words inside, split at spaces and dashes ([TAB], [← →], [1-5]), each that names a key on its own
    // characters; a word that names none ([CLICK], [WHEEL]) is not a key, and neither are its letters.
    let first = null;
    for (let j = i + 1; j < close;) {
      if (chars[j] === ' ' || chars[j] === '-') { j++; continue; }
      let k = j;
      while (k < close && chars[k] !== ' ' && chars[k] !== '-') k++;
      const word = chars.slice(j, k), code = keyCodeOf(word.join(''));
      if (code) {
        first ??= code;
        note({ x: x + j * cellW, y: top, w: (k - j) * cellW, h }, code);
      } else if (word.length > 1 && word.every((c) => ARROWS.has(c))) {
        // Arrows written together ([←→], [←↑↓→]): each its own.
        word.forEach((c, n) => {
          const each = keyCodeOf(c);
          first ??= each;
          note({ x: x + (j + n) * cellW, y: top, w: cellW, h }, each);
        });
      }
      j = k;
    }
    // The brackets themselves answer for the first.
    if (first) {
      note({ x: x + i * cellW, y: top, w: cellW, h }, first);
      note({ x: x + close * cellW, y: top, w: cellW, h }, first);
    }
    // The words after it, up to the next bracket (less the spaces before it), answer for its first key.
    let end = chars.indexOf('[', close + 1);
    if (end < 0) end = chars.length;
    while (end > close + 1 && chars[end - 1] === ' ') end -= 1;
    if (first && end > close + 1) note({ x: x + (close + 1) * cellW, y: top, w: (end - close - 1) * cellW, h }, first);
    if (first && (!only || only.has(first))) spans.push({ from: i, to: Math.max(close + 1, end), code: first });
    i = close;
  }
  return spans;
}

// A keyed string drawn by `text` (the renderer's own), its answering spans each an item of its own (src/hover.js) and
// the rest as it is, every piece at its own cells. In one piece while none is under the pointer or settling back.
const SPAN_TOP = 4, SPAN_H = 20;
function keyedText(self, text, str, x, y, rest, spans, cellW) {
  const boxes = spans.map((s) => ({ ...s, id: `key:${s.code}:${Math.round(y)}`,
    box: { x: x + s.from * cellW, y: y - SPAN_TOP, w: (s.to - s.from) * cellW, h: SPAN_H } }));
  if (inItem() || !boxes.some((b) => hoverLive(b.id, b.box))) return text.call(self, str, x, y, ...rest);
  const chars = Array.from(str);
  const piece = (a, b) => {
    const s = chars.slice(a, b).join('');
    if (s.trim()) text.call(self, s, x + a * cellW, y, ...rest);
  };
  let at = 0;
  for (const b of boxes) {
    piece(at, b.from);
    hoverItem(self, b.id, b.box, () => piece(b.from, b.to));
    at = b.to;
  }
  piece(at, chars.length);
}

// A button that is not a key (the pause's SAVE LAYOUT, labs/graphics/hud-place.js): its box and what a click on it runs; `rest`,
// where a pointer the keys park on it stands ({ x, y }: a pause row's, just after its words), else its middle.
export function noteAction(box, run, rest = null) {
  if (noting && !muted && typeof run === 'function') noting.push({ ...box, run, rest });
}

// The key under (x, y) in the last frame's menus, or null; the one drawn last wins. A point that misses every key by less than
// STICK px (src/hover.js) takes the nearest: a row is 20 px and moves with its window, and the pointer wavers (SX,
// 2026-10-03: «очень маленькая область нажатия ... трудно очень попасть»; a pointer's target is larger than it looks).
const gapTo = (b, x, y) => Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));
function regionAt(x, y, has) {
  let near = null, best = STICK;
  for (let i = regions.length - 1; i >= 0; i--) {
    const b = regions[i];
    if (!has(b)) continue;
    const d = gapTo(b, x, y);
    if (d === 0) return b;
    if (d < best) { best = d; near = b; }
  }
  return near;
}
export function keyAt(x, y) { return regionAt(x, y, (b) => !!b.code)?.code ?? null; }
// The buttons the last frame noted that are no key (a pause's rows, its plate, SAVE LAYOUT), as drawn: what the keyboard's focus walks
// (labs/graphics/key-focus.js).
export const actionBoxes = () => regions.filter((b) => !!b.run).map(({ x, y, w, h, rest }) => ({ x, y, w, h, rest: rest ?? null }));
// The button under (x, y), or null, as forgiving.
export function actionAt(x, y) { return regionAt(x, y, (b) => !!b.run)?.run ?? null; }

// The box round everything `draw()` puts on the canvas of `r`, or null when it drew nothing. A fill of the whole window
// (a dimming) is not the pop-up's.
export function measure(r, draw) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y, w, h) => {
    if (!(w > 0 && h > 0) || (w >= r.width - 1 && h >= r.height - 1)) return;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
  };
  const ctx = r.ctx;
  // What is patched is put back as it was: an own property as itself, one from the prototype by deleting the patch.
  const saved = [[r, 'fill'], [r, 'text'], [ctx, 'fillRect'], [ctx, 'strokeRect'], [ctx, 'drawImage']]
    .map(([o, k]) => [o, k, Object.hasOwn(o, k) ? o[k] : undefined]);
  const fill = r.fill, text = r.text, fillRect = ctx.fillRect, strokeRect = ctx.strokeRect, drawImage = ctx.drawImage;
  r.fill = function (x, y, w, h, ...rest) { grow(x, y, w, h); return fill.call(this, x, y, w, h, ...rest); };
  r.text = function (str, x, y, ...rest) {
    if (str) grow(x, y, Array.from(String(str)).length * r.cellW, r.cellH);
    return text.call(this, str, x, y, ...rest);
  };
  // The context's own: a pop-up's picture and its frames are drawn on it straight. Only the translation of its transform
  // is read (a pop-up is not turned), the pixel ratio taken out.
  const at = (x, y) => {
    const m = ctx.getTransform?.(), k = r.dpr || 1;
    return m ? { x: (m.a * x + m.e) / k, y: (m.d * y + m.f) / k, sx: m.a / k, sy: m.d / k } : { x, y, sx: 1, sy: 1 };
  };
  const ctxGrow = (x, y, w, h) => { const p = at(x, y); grow(p.x, p.y, w * p.sx, h * p.sy); };
  ctx.fillRect = function (x, y, w, h) { ctxGrow(x, y, w, h); return fillRect.call(this, x, y, w, h); };
  ctx.strokeRect = function (x, y, w, h) { ctxGrow(x, y, w, h); return strokeRect.call(this, x, y, w, h); };
  ctx.drawImage = function (img, ...a) {
    if (a.length === 2) ctxGrow(a[0], a[1], img.width, img.height);
    else if (a.length === 4) ctxGrow(a[0], a[1], a[2], a[3]);
    else if (a.length === 8) ctxGrow(a[4], a[5], a[6], a[7]);
    return drawImage.call(this, img, ...a);
  };
  try {
    draw();
  } finally {
    for (const [o, k, v] of saved) { if (v === undefined) delete o[k]; else o[k] = v; }
  }
  return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
