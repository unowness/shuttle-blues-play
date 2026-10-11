// The interface's text casts its shadow, and nothing else of the interface does (SX, 2026-10-06: «давай еще вообще уберем наши эффекты
// тени, которые мы под интерфейсом рисуем, нужен явно простой оптимизированный шаг», then «нам по сути только тень тексту нужна»).
//
// Until then a group of the interface (the locator, the quests, the cockpit, the labels, a notice) was recorded and played twice, its
// every shape, line, frame, plate and string first in solid black 4 px toward the screen's middle, then as drawn (labs/graphics/sketches/hudShadow.js,
// on disk since and drawn by no game code). Now a group is drawn once, straight, and a string drawn in it (fillText, strokeText) is
// drawn twice, at once: its black copy DROP px toward the screen's middle, then itself. The copy is one more call of the same text in
// solid black (no shadowBlur, no canvas shadow: Firefox draws those apart from the text); its ink's alpha is the string's.
//
// What follows from drawing the copy just before its string, not under the whole group: the copy lies on what the group drew before
// that string (a plate under a label), so on a black plate it is unseen, as over empty space; and a string drawn a glyph at a time
// casts a glyph at a time, each copy under its own glyph and the ones after it. Which way: by where the string stands, toward the
// middle (`fallOf`, the old shadow's rule for a label of the flight), slid with the mouse's lean as the world behind it is.
//
// The copy goes through the context's own fillText and strokeText, put on the page's context once (`group` installs them): while no
// group is drawn they hand the call straight on.

export const TEXT_SHADOW = Object.freeze({ drop: 4, leanShare: 0.035 });
const BLACK = '#000000';

// Which way a mark at (x, y) of a screen width x height falls: toward the middle; in the middle band (MIDDLE of the half width or
// height either side) not along that axis, and straight down in the middle itself (labs/graphics/sketches/hudShadow.js fallOf, the same rule).
const MIDDLE = 0.25;
const fallAxis = (p, size) => { const u = (size / 2 - p) / (size / 2 || 1); return Math.abs(u) < MIDDLE ? 0 : Math.sign(u); };
export function fallOf(x, y, width, height) {
  const fx = fallAxis(x, width);
  let fy = fallAxis(y, height);
  if (!fx && !fy) fy = 1;
  return [fx, fy];
}

let leanX = 0, leanY = 0;
// The frame's lean of the world (labs/graphics/depth.js, World.lean): the copy slides by TEXT_SHADOW.leanShare of it.
export function setTextShadowLean(px) { leanX = Number(px?.x) || 0; leanY = Number(px?.y) || 0; }

// The group being drawn: the screen it falls across, or null between groups.
let active = null;
// The context's own setters and getters of the two inks, past the grade's accessors (src/grade.js): the black is solid black, never
// graded, and the ink set back is the one the canvas holds.
const installed = new WeakSet();
function inkAccess(ctx, key) {
  let owner = Object.getPrototypeOf(ctx), d = null;
  while (owner && !(d = Object.getOwnPropertyDescriptor(owner, key))) owner = Object.getPrototypeOf(owner);
  return d;
}

function install(ctx) {
  if (installed.has(ctx)) return;
  installed.add(ctx);
  const fill = inkAccess(ctx, 'fillStyle'), stroke = inkAccess(ctx, 'strokeStyle'), proto = Object.getPrototypeOf(ctx);
  if (typeof proto.fillText !== 'function' || !fill?.set || !stroke?.set) return;
  // The context's own method is looked up at each call, not kept: whatever wraps it later (H's profiler counting the calls,
  // src/frameProfile.js; a harness's spy) still sees both the copy and the string. The arguments are named, not `arguments` passed on:
  // every fillText of the page, a glyph of the world's included, comes through here, and an arguments object made for each was ~26 KB
  // of garbage a frame in flight (2026-10-09). A call is handed on with as many arguments as it came with (the maxWidth, when it
  // came with one).
  ctx.fillText = function (text, x, y, maxWidth) {
    if (active) cast(this, proto.fillText, fill, text, x, y, maxWidth);
    return maxWidth === undefined ? proto.fillText.call(this, text, x, y) : proto.fillText.call(this, text, x, y, maxWidth);
  };
  if (typeof proto.strokeText === 'function') {
    ctx.strokeText = function (text, x, y, maxWidth) {
      if (active) cast(this, proto.strokeText, stroke, text, x, y, maxWidth);
      return maxWidth === undefined ? proto.strokeText.call(this, text, x, y) : proto.strokeText.call(this, text, x, y, maxWidth);
    };
  }
}

// The string's black copy, on whole device px toward the middle from where the string's middle stands.
function cast(ctx, draw, ink, text, x, y, maxWidth) {
  const g = active, T = ctx.getTransform(), dpr = g.dpr;
  const width = String(text).length * g.cellW, align = ctx.textAlign;
  const mid = align === 'center' ? x : align === 'right' || align === 'end' ? x - width / 2 : x + width / 2;
  // fallOf's rule worked in place: the pair it returns was an array made for every string of the interface.
  const fx = fallAxis((T.a * mid + T.c * y + T.e) / dpr, g.width);
  let fy = fallAxis((T.b * mid + T.d * y + T.f) / dpr, g.height);
  if (!fx && !fy) fy = 1;
  const dx = Math.round((fx * TEXT_SHADOW.drop + leanX * TEXT_SHADOW.leanShare) * dpr);
  const dy = Math.round((fy * TEXT_SHADOW.drop + leanY * TEXT_SHADOW.leanShare) * dpr);
  const det = T.a * T.d - T.b * T.c;
  if ((!dx && !dy) || !det) return;
  // The device move in the painter's own units (its transform's inverse).
  const ux = (T.d * dx - T.c * dy) / det, uy = (T.a * dy - T.b * dx) / det;
  const was = ink.get.call(ctx);
  ink.set.call(ctx, BLACK);
  if (maxWidth !== undefined) draw.call(ctx, text, x + ux, y + uy, maxWidth);
  else draw.call(ctx, text, x + ux, y + uy);
  ink.set.call(ctx, was);
}

// `draw()` with its strings drawn once, inside a group too: a string on a plate or in a frame of its own (a keycap's letter, a flap
// plate's letters) stands on that, not on the sky. The old shadow lay under the plate, unseen; a copy drawn after the plate would lie
// on it, a dark ghost of the letters on a plate and a cut in a keycap's frame (measured on the page's pictures, 2026-10-06).
export function onPlate(draw) {
  const was = active;
  active = null;
  try { return draw(); } finally { active = was; }
}

// `draw(r)` as a group of the interface: its strings with their shadow; what `draw` returns.
export function textShadowed(r, draw) {
  const ctx = r?.ctx;
  if (!ctx || active) return draw(r);
  install(ctx);
  active = { width: r.width ?? 0, height: r.height ?? 0, dpr: r.dpr || 1, cellW: r.cellW || 9 };
  try { return draw(r); } finally { active = null; }
}
