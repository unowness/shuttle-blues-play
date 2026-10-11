// A find's notice: what was found and its picture, a gift card of the banners (labs/graphics/rail.js family 03; SX's pick of
// 2026-10-04, Codex's A / Rail revision 5: «EVA-01 / SHIP PAINT», «VHS TAPE / SOUVENIR», OPEN CARD gone: a click does it). This
// file keeps what a find says (giftWords) and each kind's picture (drawFindPicture); rail.js lays the card out and moves it.
//
// The pictures are SX's of N1 FRAME (2026-10-02, labs/graphics/sketches/item-notices.html): a souvenir's own, a paint's palette in a
// square («раздели квадратик на 4 ... или ... 3 на 3»), a look's palette, the signal's rings smaller than the world draws them («в
// сигнале слишком большая иконка»), a piece of the map with the cache marked («марк хороший»), the pointer pressed over and over.
import { PALETTE, ROLES } from '../../src/roles.js';
import { drawSouvenirPicture, PICTURE } from '../../src/souvenirPictures.js';
import { paintById } from '../../src/paint.js';
import { lookById } from '../../src/looks.js';
import { FREE_WORDS } from '../../src/rewards.js';
import { CONFIG } from '../../src/config.js';
import { UI } from '../../src/uiGrid.js';
import { createCursor, cursorMove, cursorDown, cursorUp, stepCursor, drawCursor } from './cursor.js';
import { px, clamp } from '../../src/util.js';

// The words' columns of a dialog's text (labs/graphics/context.js): as wide as a station's marking, RELAY 12 MARKED A CACHE, as the
// finds' notices were (SX, 2026-10-02: «они все должны быть такой ширины»).
export const FIND_COLS = 23;
// How long a find's card stands.
export const FIND_LIFE = 4.4;

// The words of each kind of find: the gift card's two rows, its name over what kind of thing it is (Codex's order, the title above
// the type), and its price when it was bought (a cost of the find, said with it: «SOUVENIR · -250 CR»).
export function giftWords(kind, e) {
  // The receipt: what it cost, or that it cost nothing when it was a free claim (World.openCache's `free`, src/rewards.js FREE_WORDS).
  const paid = (word) => (e.price > 0 ? `${word} · -${e.priceText ?? e.price} CR` : e.free ? `${word} · ${FREE_WORDS}` : word);
  switch (kind) {
    case 'souvenir': return { title: e.label, sub: paid('SOUVENIR') };
    case 'paint': return { title: e.label, sub: paid('SHIP PAINT') };
    case 'signal': return { title: e.text, sub: 'SIGN WORD' };
    case 'mark': return { title: e.label, sub: e.sector ? `CACHE MARKED · ${e.sector}` : 'CACHE MARKED' };
    case 'look': return { title: e.label, sub: 'INTERFACE LOOK' };
    case 'pointer': return { title: e.label, sub: 'CURSOR' };
    // The radio a quest gives (src/questHooks.js giveRadio): the set, and why it came.
    case 'radio': return { title: 'RADIO', sub: 'QUEST REWARD' };
    default: return { title: e.label ?? '', sub: 'FOUND' };
  }
}

// A palette in the square: 2 x 2 for four inks or fewer, else 3 x 3, the block a souvenir picture's size; a cell with no ink
// is an empty slot's dot.
function palette(r, inks, cx, cy, alpha) {
  const size = PICTURE.size, n = inks.length <= 4 ? 2 : 3, gap = 4, cell = (size - (n - 1) * gap) / n;
  const x0 = Math.round(cx - size / 2), y0 = Math.round(cy - size / 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const ink = inks[j * n + i], x = Math.round(x0 + i * (cell + gap)), y = Math.round(y0 + j * (cell + gap)), w = Math.round(cell);
    if (ink) r.fill(x, y, w, w, ink, alpha);
    else r.fill(Math.round(x + w / 2 - 1), Math.round(y + w / 2 - 1), 2, 2, ROLES.structure, alpha);
  }
}

// A piece of the map with the cache marked on it (SX: «марк хороший»).
function mapPiece(r, cx, cy, t, alpha) {
  const ctx = r.ctx, s = 20;
  const line = (pts, ink, a, dash = null) => {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = ink; ctx.lineWidth = 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](px(x), px(y))); ctx.stroke(); ctx.restore();
  };
  for (const d of [-s, 0, s]) {
    line([[cx + d, cy - s - 4], [cx + d, cy + s + 4]], ROLES.structure, 0.7 * alpha, [2, 3]);
    line([[cx - s - 4, cy + d], [cx + s + 4, cy + d]], ROLES.structure, 0.7 * alpha, [2, 3]);
  }
  const on = Math.floor(t * 2) % 2 === 0 ? 1 : 0.45;
  line([[cx + 7, cy + 4], [cx + 13, cy + 10], [cx + 7, cy + 16], [cx + 1, cy + 10], [cx + 7, cy + 4]], ROLES.textPrimary, alpha * on);
  line([[cx - 8, cy + 8], [cx - 8, cy - 14]], ROLES.textPrimary, alpha);
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = PALETTE.green;
  ctx.beginPath(); ctx.moveTo(cx - 7.5, cy - 14); ctx.lineTo(cx + 4 + Math.sin(t * 5) * 1.5, cy - 10.5); ctx.lineTo(cx - 7.5, cy - 7); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// The signal's rings, smaller than the world draws them (SX: «в сигнале слишком большая иконка»).
const SIGNAL_SCALE = 0.62;
function signal(r, cx, cy, t, alpha) {
  const C = CONFIG.signal, s = (C.scale || 1) * SIGNAL_SCALE;
  r.glyphNow('◦', cx, cy, C.color, alpha, s);
  for (let k = 0; k < 2; k++) {
    const f = (t * C.rate + k * 0.5) % 1, gap = (0.9 + f * 2.2) * r.cellW * s, a = 0.85 * (1 - f) * alpha;
    r.glyphNow('(', cx - gap, cy, C.color, a, s);
    r.glyphNow(')', cx + gap, cy, C.color, a, s);
  }
}

// The pointer as it is, 1:1, pressed over and over (labs/graphics/sketches/cursors.html).
const shown = createCursor('C2');
function pointer(ctx, id, cx, cy, alpha) {
  const ms = performance.now(), loop = ms % 1600;
  shown.code = id;
  cursorMove(shown, cx, cy, ms);
  if (loop < 220 && !shown.down) cursorDown(shown, ms); else if (loop >= 220 && shown.down) cursorUp(shown);
  stepCursor(shown, ms, { hint: loop > 800 && loop < 1500 ? 'pointer' : '' });
  shown.shown = alpha;
  drawCursor(ctx, shown, ms);
}

// The radio a quest gives: the set of the column (labs/graphics/radio.js, SX's W1 POCKET) at the picture's height, its 6 x 8 rows to
// PICTURE.size: the body with its corners cut, the speaker's holes lit from the middle out as a voice comes in, the wheel turning under
// its index, the lamp blinking amber as a call tunes in. Drawn here, not by radio.js: that module reads the rail's numbers as it loads,
// and the rail draws this picture.
const MINI = PICTURE.size / (8 * UI.row);
function radio(r, cx, cy, t, alpha) {
  const ctx = r.ctx, h = PICTURE.size, w = Math.round(6 * UI.row * MINI), x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  const m = Math.round(UI.air.rule * MINI), cut = Math.round(UI.vector.space * MINI), R = Math.round(1.5 * UI.row * MINI);
  const pitch = UI.pad, hole = UI.pad / 2, lampR = UI.pad / 2;
  const line = (pts, { fill = null, stroke = null } = {}) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineWidth = 1;
    ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    ctx.restore();
  };
  const disc = (x, y, rad, { fill = null, stroke = null, a = 1 } = {}) => {
    ctx.save(); ctx.globalAlpha = alpha * a; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    ctx.restore();
  };
  const L = px(x0), T = px(y0), RR = px(x0 + w - 1), B = px(y0 + h - 1);
  line([[L + cut, T], [RR - cut, T], [RR, T + cut], [RR, B - cut], [RR - cut, B], [L + cut, B], [L, B - cut], [L, T + cut]],
    { fill: ROLES.backing, stroke: ROLES.structure });
  // The speaker's holes over the wheel, lit from the middle out by a voice coming and going.
  const wx = x0 + w - m - R, wy = y0 + h - m - R;
  const field = { x: x0 + m, y: y0 + m, w: w - 2 * m, h: wy - R - m - (y0 + m) };
  const nx = Math.floor((field.w - hole) / pitch) + 1, ny = Math.floor((field.h - hole) / pitch) + 1;
  const ox = field.x + (field.w - ((nx - 1) * pitch + hole)) / 2, oy = field.y + (field.h - ((ny - 1) * pitch + hole)) / 2;
  const gx = ox + ((nx - 1) * pitch + hole) / 2, gy = oy + ((ny - 1) * pitch + hole) / 2, far = Math.hypot(gx - ox, gy - oy) || 1;
  const voice = 0.5 + 0.5 * Math.sin(t * 5);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = Math.round(ox + i * pitch), y = Math.round(oy + j * pitch), d = Math.hypot(x + hole / 2 - gx, y + hole / 2 - gy) / far;
    r.fill(x, y, hole, hole, ROLES.structure, alpha);
    const lit = clamp((voice - d) / 0.2, 0, 1);
    if (lit > 0) r.fill(x, y, hole, hole, PALETTE.amber, alpha * lit);
  }
  // The wheel and its ticks, turning slowly; the index over it stands still.
  disc(wx, wy, R, { fill: ROLES.backing, stroke: ROLES.structure });
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineWidth = 1; ctx.strokeStyle = ROLES.structure; ctx.beginPath();
  for (let k = 0; k < 12; k++) {
    const a = -t * 0.6 + k * Math.PI / 6, r0 = R - 1.5, r1 = R - (k % 3 === 0 ? 4.5 : 3);
    ctx.moveTo(wx + Math.cos(a) * r0, wy + Math.sin(a) * r0); ctx.lineTo(wx + Math.cos(a) * r1, wy + Math.sin(a) * r1);
  }
  ctx.stroke(); ctx.restore();
  const iy = Math.round(wy - R) - 1;
  line([[wx, iy], [wx - lampR, iy - lampR], [wx + lampR, iy - lampR]], { fill: ROLES.textPrimary });
  // The lamp, on the wheel's middle line: amber, blinking as a call tunes in.
  const on = Math.floor(t * 4) % 2 === 0 ? 1 : 0.15;
  disc(x0 + m + lampR + 1, wy, lampR, { fill: ROLES.backing, stroke: PALETTE.amber });
  disc(x0 + m + lampR + 1, wy, lampR, { fill: PALETTE.amber, a: on });
}

// A find's picture centred on (cx, cy), at `t` s of its own clock (the signal's rings, the map's blink), at `alpha`.
export function drawFindPicture(r, find, cx, cy, t, alpha = 1) {
  if (!find || alpha <= 0.01) return;
  switch (find.kind) {
    case 'souvenir': drawSouvenirPicture(r, find.id, cx - PICTURE.size / 2, cy - PICTURE.size / 2, PICTURE.size, alpha); break;
    case 'paint': { const inks = paintById(find.id)?.inks; if (inks) palette(r, Object.values(inks), cx, cy, alpha); break; }
    case 'look': { const p = lookById(find.id)?.def?.palette; palette(r, p ? Object.values(p).slice(0, 9) : [ROLES.structure, ROLES.textSecondary, ROLES.textPrimary, PALETTE.green], cx, cy, alpha); break; }
    case 'signal': signal(r, cx, cy, t, alpha); break;
    case 'mark': mapPiece(r, cx, cy, t, alpha); break;
    case 'pointer': pointer(r.ctx, find.id, cx, cy, alpha); break;
    case 'radio': radio(r, cx, cy, t, alpha); break;
    default: break;
  }
}
