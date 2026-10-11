// The pointer, drawn by the game (SX, 2026-10-02: «сделай курсор просто каким-то в тему нашей игре, например крестик или
// маленький кружок с тактильным откликом, дай мне варианты»). Four, and the browser's own; since SX's word the same night
// («курсоры будем дарить за случайные квесты ... по умолчанию берем квадратик») they are collectibles, CORNERS from the start
// (src/cursors.js says which are owned and how the others are given):
//   C1 CROSS    a sight's four arms round an open middle
//   C2 RING     a small ring with a dot
//   C3 CORNERS  the four corner marks the game frames a chosen thing with, small
//   C4 DIAMOND  the caches' diamond
// Each is thin vector line on a black backing (legible over a planet as over space), in the interface's white. Over what answers
// a click (the page's `cursor` hint: 'pointer' or 'grab') it closes in a little and casts a solid black shadow 2 px down and
// right, as if it rose off what it is over (SX, 2026-10-03: «он наоборот должен сужаться, уменьшаться. И начинать иметь такую
// какую-то тень»; it grew and turned green there until then). The touch: on a press the shape closes in
// and an echo of it flies out; on the release it springs back past its rest and settles (a bouncy spring), with a tick
// on the press (src/audio.js `tick`). It is drawn into the frame, so the tube bends it with everything else and the
// worn look only filters it (the kept layer, src/grade.js). It fades after a while unmoved in open flight.
import { ROLES } from '../../src/roles.js';
import { keepBegin, keepEnd } from '../../src/grade.js';
import { START_CURSOR } from '../../src/cursors.js';

export const CURSORS = Object.freeze([
  { code: 'C1', name: 'CROSS' },
  { code: 'C2', name: 'RING' },
  { code: 'C3', name: 'CORNERS' },
  { code: 'C4', name: 'DIAMOND' },
  { code: 'C0', name: 'SYSTEM' },
]);
const CURSOR_START = START_CURSOR;
export const cursorLabel = (code) => CURSORS.find((v) => v.code === code)?.name ?? code;

const PRESS = { omega: 46, zeta: 0.32 };
const SHADOW = 2;                         // px down and right its shadow falls over what answers a click   // closes in about 40 ms, swings past its rest by a third on the release
const ECHO = 0.34;                        // s an echo flies out for
const IDLE = 2.4;                         // s unmoved before it fades in open flight
const FADE = 5;                           // its fade, per s

export function createCursor(code = CURSOR_START) {
  return { code, x: 0, y: 0, inside: false, movedAt: -Infinity, down: false, press: 0, pressV: 0, hover: 0, shown: 0, echoes: [],
    steppedAt: null, parked: null };
}

// The mouse moved: the pointer is where it is, and a focus the keys parked it on is let go.
export function cursorMove(c, x, y, now) { c.x = x; c.y = y; c.inside = true; c.movedAt = now; c.parked = null; }
// The keyboard's focus (chat C, SX's F2 on labs/graphics/sketches/controls.html: «фокус — это наш курсор, припаркованный на
// вещи»): the keys park the drawn pointer on what they chose, `by` saying what parked it (the nose, a pause's row, a quest), and
// what is under it answers exactly as under the mouse (src/hover.js, World.pointed). Let go, it sleeps where it is: unseen, and
// pointing at nothing, until the mouse moves it (C0 conflict 5: a sleeping pointer holds no hover).
export function cursorPark(c, x, y, now, by) { c.x = x; c.y = y; c.inside = true; c.movedAt = now; c.parked = by; }
export function cursorSleep(c) { c.parked = null; c.inside = false; c.down = false; }
// The mouse's pointer faded by its own rule (unmoved `IDLE` s in open flight, over nothing that answers a click: stepCursor), at `now`
// (ms, the page's clock): KEYS + CLICKS puts it to sleep then, for the keys' focus (labs/graphics/schemes.js).
export const cursorFaded = (c, now) => c.inside && !c.parked && !c.down && c.shown === 0 && now - c.movedAt > IDLE * 1000;
export function cursorLeave(c) { c.inside = false; c.down = false; }
export function cursorDown(c, now) {
  c.down = true;
  c.movedAt = now;
  c.echoes.push(now);
  if (c.echoes.length > 4) c.echoes.shift();
}
export function cursorUp(c) { c.down = false; }

// One frame at `now` (ms, the page's clock). `hint` is what the page says is under the pointer (a CSS cursor name),
// `flying`: open flight, where an unmoved pointer fades out of the way.
export function stepCursor(c, now, { hint = '', flying = false } = {}) {
  const dt = c.steppedAt === null ? 0 : Math.max(0, Math.min(0.05, (now - c.steppedAt) / 1000));
  c.steppedAt = now;
  const target = c.down ? 1 : 0;
  for (let left = dt; left > 1e-6;) {
    const h = Math.min(left, 1 / 240);
    c.pressV += (PRESS.omega ** 2 * (target - c.press) - 2 * PRESS.zeta * PRESS.omega * c.pressV) * h;
    c.press += c.pressV * h;
    left -= h;
  }
  const answers = hint === 'pointer' || hint === 'grab' || hint === 'grabbing';
  c.hover += ((answers ? 1 : 0) - c.hover) * (1 - Math.exp(-dt * 18));
  const idle = flying && !answers && !c.down && now - c.movedAt > IDLE * 1000;
  const want = c.inside && !idle ? 1 : 0;
  c.shown = want > c.shown ? want : Math.max(0, c.shown - dt * FADE);
  c.echoes = c.echoes.filter((t) => now - t < ECHO * 1000);
}

// The shape's path at `scale`, hover `h` (0..1) and press `p` (0 at rest, 1 pressed, below 0 while it swings back).
function shape(ctx, code, h, p, scale = 1) {
  ctx.beginPath();
  if (code === 'C1') {
    const gap = Math.max(0.5, 3 - 1.2 * h - 2 * p) * scale, len = Math.max(2, 5 - 1.2 * h - 1.5 * p);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(dx * gap, dy * gap);
      ctx.lineTo(dx * (gap + len), dy * (gap + len));
    }
  } else if (code === 'C2') {
    ctx.arc(0, 0, Math.max(1.5, 5 - 1.6 * h - 2.5 * p) * scale, 0, Math.PI * 2);
  } else if (code === 'C3') {
    const s = Math.max(2, 6 - 1.8 * h - 3 * p) * scale, a = 3 - 0.5 * h;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(sx * s, sy * (s - a));
      ctx.lineTo(sx * s, sy * s);
      ctx.lineTo(sx * (s - a), sy * s);
    }
  } else if (code === 'C4') {
    // Pressed, it squashes like a soft key: wider and lower; swinging back, taller.
    const d = (5 - 1.4 * h) * scale, sx = 1 + 0.4 * p, sy = Math.max(0.3, 1 - 0.5 * p);
    ctx.moveTo(0, -d * sy); ctx.lineTo(d * sx, 0); ctx.lineTo(0, d * sy); ctx.lineTo(-d * sx, 0);
    ctx.closePath();
  }
}

// Drawn at once on the frame's context, last, over everything.
export function drawCursor(ctx, c, now) {
  if (c.code === 'C0' || c.shown <= 0.02) return;
  const was = keepBegin();
  ctx.save();
  try {
    ctx.translate(Math.round(c.x) + 0.5, Math.round(c.y) + 0.5);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    const h = c.hover, p = c.press;
    const ink = ROLES.textPrimary;
    // The echoes: the shape flying out from where it was pressed, thin and fading.
    for (const t of c.echoes) {
      const k = (now - t) / (ECHO * 1000);
      ctx.globalAlpha = c.shown * 0.75 * (1 - k) ** 2;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      shape(ctx, c.code, h, 0, 1 + 1.8 * k);
      ctx.stroke();
    }
    // Its shadow over what answers a click, the shape in solid black SHADOW px down and right, coming with the hover.
    if (h > 0.02) {
      ctx.save();
      ctx.translate(SHADOW, SHADOW);
      ctx.globalAlpha = c.shown * Math.min(1, h);
      shape(ctx, c.code, h, p);
      ctx.strokeStyle = ROLES.backing ?? '#000000';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (c.code === 'C4') { ctx.fillStyle = ROLES.backing ?? '#000000'; ctx.fill(); }
      ctx.restore();
    }
    ctx.globalAlpha = c.shown;
    shape(ctx, c.code, h, p);
    ctx.strokeStyle = ROLES.backing ?? '#000000';
    ctx.lineWidth = 3;
    ctx.stroke();
    // The diamond fills as it is pressed, and a little over what answers.
    if (c.code === 'C4') {
      ctx.fillStyle = ink;
      ctx.globalAlpha = c.shown * Math.min(1, Math.max(0, p) + 0.3 * h);
      ctx.fill();
      ctx.globalAlpha = c.shown;
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    // The middle's dot, but in the diamond: on its black for the cross and the corners, lit while pressed.
    if (c.code !== 'C4' && (c.code === 'C2' || p > 0.3)) {
      ctx.fillStyle = ROLES.backing ?? '#000000';
      ctx.fillRect(-1.5, -1.5, 3, 3);
      ctx.fillStyle = ink;
      ctx.fillRect(-0.5, -0.5, 1, 1);
    }
  } finally {
    ctx.restore();
    keepEnd(was);
  }
}
