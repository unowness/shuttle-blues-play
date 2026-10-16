// The banners above the top of the screen, one system: SX's pick of 2026-10-04, Codex's package A / Rail revision 5
// (codex/top-banners-2026-10-03: CLAUDE_HANDOFF.md the layout, rail.js its outline, ANIMATION_BRIEF.md the motion, to be finished
// from the game's own animations). Chat B, 2026-10-04.
//
// Four families, one painter (`drawRail`), every one a full-card button:
//   01 task and event   black, a 3 px rail on the left in the kind's ink, the sign centred in its field, the title (white) over
//                       the detail (gray; a timer first, in its own ink, then a spaced middle dot), a short corner top right
//                       and a plain L bottom right in the kind's ink (white under the pointer). The task slot (labs/graphics/
//                       notices.js) and the notices under it.
//   02 cargo            the same on the cargo plates' material: the kind's deep wash under a black grid (a column a character
//                       and 2 px, a row the hinge's 14 px), the rail painted over the grid, a white sign; the L in the grid's last
//                       full cell.
//   03 gift             a white frame, a square field on the left holding the find's own picture with equal air on four sides,
//                       a perforation in place of its divider (a coupon's: SX's F1a, 2026-10-06), the name over the kind. Under the
//                       pointer its lower right corner folds in, white edges, no fill.
//   04 quest            the quest list's plates (labs/graphics/quest-list.js): the rail and the sign, no corner.
//
// The motion is the quest list's (SX, 2026-10-04, on the economy build: «они реально красиво пропадают ... к вопросам об анимации
// ... опираться на продовую версию ... в боковой панели квестов»): a banner comes square by square from a corner picked by its seed,
// each cell showing 0.18 s of `01/:·_` before its letter (the quest plates' A2 LORE), and goes the same way from another corner
// (D3's way out, without its light); the corners' arms run out of and back into their vertex as the sweep reaches them. A gift comes
// and goes as a coupon, SX's F1a COUPON FALL on labs/graphics/sketches/find-motion.html (2026-10-06; `drawGift` below). Under the
// pointer, or with the keyboard's
// focus, a banner presses in as every panel does (src/hover.js, kind 'panel'), and its one detail turns white; a click presses it
// deeper, then it goes, then its action runs (labs/graphics/notices.js). Reduced motion: no sweep, no press, no tear.
import { UI, uiMetrics } from '../../src/uiGrid.js';
import { PALETTE, ROLES } from '../../src/roles.js';
import { oklch, fromLch } from '../../src/grade.js';
import { mixHex, glyphs, px, noise3 as noise, clamp } from '../../src/util.js';
import { withAlpha } from '../../src/hover.js';
import { PICTURE } from '../../src/souvenirPictures.js';
import { drawFindPicture } from './find-notice.js';

// The rail's measures (Codex's, CLAUDE_HANDOFF.md "Geometry", on the interface's steps where they come from one). One size for every
// banner (SX, 2026-10-04: «очень плохо сверстаны баннеры, у кодекса вроде было аккуратно ... все разного размера и с кривыми
// уголками»): 336 x 56, a gift 336 x 86; words longer than the row are cut with an ellipsis, as Codex's painter cuts them
// (checks/banners.mjs lists the game's words that are; labs/graphics/sketches/banners-fidelity.html shows each kind beside his).
export const RAIL = Object.freeze({
  width: 336,                                // the outer width of every banner: four fit at 1440 px
  air: 2 * UI.pad,                           // over the first row and under the last (Y8 / Y28: the rows centred in 56)
  strip: 3,                                  // the semantic rail, the quest plates' Q3 LINE strip
  sign: UI.row,                              // the sign's centre, X20
  textX: Math.round(UI.row + UI.air.inset),  // the words' origin, X38: the inset's air past the sign's field
  corner: 2 * UI.pad,                        // the corners' arm (the top right's runs a pixel longer across, as Codex drew it)
  reserve: 40,                               // right of the words where a corner stands: its 28 px field and 12 px of air
  trailing: UI.vector.line,                  // right of the words where none does (a quest)
  hinge: (UI.row + 2 * UI.pad) / 2,          // 14: a band of the squares, the cargo grid's row (the plates' hinge)
  gift: Object.freeze({ margin: 15, gap: UI.vector.line, fold: UI.vector.line }),   // SX: equal air round the art, 16 px to the words
});
export const giftField = () => PICTURE.size + 2 * RAIL.gift.margin;   // 86: the picture's square, and the gift's height
// A banner's height: its rows of words and RAIL.air over and under them (56 for two rows).
export const railHeight = (rows = 2) => rows * UI.row + 2 * RAIL.air;
// A banner's rows: always two, its title on the first (Codex: «Every text block is two rows centered by (height - 2 × rowPitch) / 2»;
// SX's H2 for the task slot), the second empty when it has no detail (Codex's ALL CLEAR).

// What a split-flap cell shows as it turns over before it settles on its letter (the cargo plates', notice.js; the helmet's notch
// line, helmet.js).
export const FLAP_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%+/×-';
// The quest list's lore (quest-list.js A2 / D3): its cells' characters and its times, in seconds.
export const LORE = '01/:·_';
export const LORE_TIMES = Object.freeze({ cell: 0.18, step: 0.055, sweep: 0.48, scatter: 0.15 });
// The press a click gives before the banner goes, and how fast a gift's corner folds; the tear's length (the brief's, «as it rises
// back»: the press let go while the corner leads the tear across).
export const RAIL_TIMES = Object.freeze({ press: 0.09, fold: 0.18, tear: 0.52, arm: 0.15 });
// How long a banner takes to come and to go (A2's sweep and its cells; D3's way out), and a gift's tear with its press.
export const railInTime = () => LORE_TIMES.sweep + LORE_TIMES.scatter + LORE_TIMES.cell;
export const railOutTime = (family) => (family === 'gift' ? GIFT_TIMES.out : LORE_TIMES.sweep * 0.94 + LORE_TIMES.cell + LORE_TIMES.scatter);
// A gift's (F1a): its coupon fed out of its stub, and torn off and fallen with the stub after it.
export const GIFT_TIMES = Object.freeze({ in: 0.64, out: 0.92 });   // (out: the tear's 0.26 s and the pieces' 0.62)

// ------------------------------------------------------------------------------------------------ the wash

// The plates' wash (moved here from labs/graphics/notice.js, chat B): the kind's hue at the lightness and chroma the red's wash
// has (the red at `tint` over black, OKLCH 0.30 / 0.066), laid over the black (SX, 2026-10-02: «фоновые закраски ... темнее и
// оттенки брать насыщеннее как у красного»).
export const WASH = Object.freeze({ tint: 0.32 });
const RED_WASH = oklch(mixHex('#000000', PALETTE.red, WASH.tint).toUpperCase());
const washes = new Map();
export function washOf(ink) {
  if (!/^#[0-9a-f]{6}$/i.test(ink)) return null;
  let w = washes.get(ink);
  if (!w) {
    const [, , hue] = oklch(ink.toUpperCase());
    w = hue === null ? mixHex('#000000', ink, WASH.tint) : fromLch(RED_WASH[0], RED_WASH[1], hue);
    washes.set(ink, w);
  }
  return w;
}

// ------------------------------------------------------------------------------------------------ money

// Every amount of money in the coin's rim gold (SX's pick S4): src/money.js since chat H (2026-10-04), so the flight's labels read it.
import { MONEY_INK, moneyRuns } from '../../src/money.js';
export { MONEY_INK, moneyRuns };

// ------------------------------------------------------------------------------------------------ the sweep (the quest list's)

// Where in a sweep a point (u across, v down, 0..1) is reached: from the top left (0), the bottom right (1), the top right (2) or
// the bottom left (3). The quest list's own (quest-list.js).
export const sweepAt = (dir, u, v) => {
  const a = dir === 1 || dir === 3 ? 1 - v : v, b = dir === 1 || dir === 2 ? 1 - u : u;
  return a * 0.3 + b * 0.7;
};
// The squares of a box `w` x `h` cut at `edges` across (x, from its left; the first [0, edges[0]) a column of its own, the rail's,
// col -1 when `rail`) and into bands of RAIL.hinge down; each with its `start` (ms) in a sweep from the corner `seed` picks, for the
// way in, and from another for the way out (`out`).
export function railSquares(edges, h, seed, out, { rail = true } = {}) {
  const bandsY = [0];
  while (bandsY.at(-1) < h) bandsY.push(Math.min(h, bandsY.at(-1) + RAIL.hinge));
  const bands = bandsY.length - 1, n = edges.length - 1, list = [];
  const dir = Math.floor(noise(seed, 7, 9) * 4), dirOut = Math.floor(noise(seed, 8, 11) * 4);
  for (let k = 0; k < bands; k++) for (let c = 0; c < n; c++) {
    const col = rail ? c - 1 : c, u = rail ? (c === 0 ? 0 : c / (n - 1)) : (c + 0.5) / n, v = (k + 0.5) / bands, hash = noise(col + 3, k + 5, 17 + seed);
    list.push({ col, k, x: edges[c], y: bandsY[k], w: edges[c + 1] - edges[c], h: bandsY[k + 1] - bandsY[k], hash,
      start: sweepAt(out ? dirOut : dir, u, v) * LORE_TIMES.sweep * 1000 + hash * LORE_TIMES.scatter * 1000 });
  }
  return { list, bandsY };
}
// What a square shows at `inMs` since the banner came (null once it has settled) and `outMs` since it began to go (null while it
// stays): whether it stands, and what a cell's character is. The quest list's plateFx without its light.
export function loreFx(inMs, outMs) {
  const T = LORE_TIMES, cell = T.cell * 1000, step = T.step * 1000;
  const flick = (ms, sq) => LORE[(Math.floor(ms / step) + Math.floor(sq.hash * 151)) % LORE.length];
  if (outMs != null) {
    return {
      shown: (sq) => outMs < sq.start * 0.94 + cell,
      char: (ch, sq) => (outMs < sq.start * 0.94 ? ch : outMs < sq.start * 0.94 + cell ? flick(outMs, sq) : ' '),
      arm: (sq) => 1 - clamp((outMs - (sq.start * 0.94 - RAIL_TIMES.arm * 1000)) / (RAIL_TIMES.arm * 1000), 0, 1),
      settled: false,
    };
  }
  if (inMs == null) return { shown: () => true, char: (ch) => ch, arm: () => 1, settled: true };
  return {
    shown: (sq) => inMs >= sq.start,
    char: (ch, sq) => (inMs < sq.start ? ' ' : inMs < sq.start + cell ? flick(inMs, sq) : ch),
    arm: (sq) => clamp((inMs - sq.start) / (RAIL_TIMES.arm * 1000), 0, 1),
    settled: inMs >= (T.sweep + T.scatter + T.cell) * 1000,
  };
}
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const easeInOut = (u) => { const t = clamp(u, 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ geometry

// A banner: { family: 'task' | 'event' | 'cargo' | 'gift', ink, mark, title, sub, clock (a timer's text, or null), clockInk,
// find: { kind, id } for a gift, align: 'centre' (each row on the banner's axis) or left (by default, from RAIL.textX) }. Its size:
// Codex's, whatever its words: RAIL.width x 56, a gift RAIL.width x 86.
export function railSize(r, b) {
  return { w: RAIL.width, h: b.family === 'gift' ? giftField() : railHeight(2) };
}
// How many characters a banner's row holds from its words' origin to the corner's reserve (Codex's `fit`: past it, an ellipsis).
export const railColumns = (r, b) => Math.max(1, Math.floor((RAIL.width - RAIL.reserve - (b.family === 'gift' ? giftField() + RAIL.gift.gap : RAIL.textX)) / r.cellW));
// Whether a banner's words fit its rows uncut (its title, and its timer, dot and detail).
export function railFits(r, b) {
  const cols = railColumns(r, b), detail = (b.clock ? glyphs(b.clock).length + 3 : 0) + glyphs(b.sub ?? '').length;
  return glyphs(b.title ?? '').length <= cols && detail <= cols;
}

// The x edges of a banner's squares: the rail, then columns of a character's width set on the words' columns (on the grid's for
// cargo), to its right edge.
function squareEdges(r, b, w) {
  if (b.family === 'cargo') {
    const pitch = r.cellW + 2, out = [0, RAIL.strip];
    for (let x = pitch; x < w - 0.5; x += pitch) out.push(Math.round(x));
    return [...new Set([...out, w])].sort((a, c) => a - c);
  }
  const left = b.family === 'gift' ? 0 : RAIL.strip, out = [0];
  if (left) out.push(left);
  const xs = [];
  for (let x = RAIL.textX; x > left + 0.5; x -= r.cellW) xs.unshift(Math.round(x));
  for (let x = RAIL.textX + r.cellW; x < w - 0.5; x += r.cellW) xs.push(Math.round(x));
  return [...new Set([...out, ...xs, w])].sort((a, c) => a - c);
}

// The lower right corner's L (Codex's click cue, its diagonal shaft gone): a 10 px box's two arms, set in the grid's last full cell
// on cargo.
function lowCorner(r, b, w, h) {
  if (b.family === 'cargo') {
    const pitch = r.cellW + 2, last = Math.floor((w - 1) / pitch), cx = Math.round((last - 1) * pitch);
    const cell = { x: cx, y: h - RAIL.hinge, w: Math.round(last * pitch) - cx, h: RAIL.hinge };
    const x = Math.round(cell.x + (cell.w - 10) / 2), y = Math.round(cell.y + (cell.h - 10) / 2);
    return { vx: x + 9, vy: y + 9, arm: RAIL.corner - 1 };
  }
  return { vx: w - 1 - RAIL.strip, vy: h - 1 - RAIL.strip, arm: RAIL.corner - 1 };
}

// ------------------------------------------------------------------------------------------------ drawing

// `half`: on the pixels' middles (a line on the grid), else at the points as given (a torn edge's teeth).
function stroke(r, pts, ink, half = true) {
  const ctx = r.ctx, at = half ? px : (v) => v;
  ctx.save();
  ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.globalAlpha = 1; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; ctx.setLineDash?.([]);
  ctx.beginPath();
  pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](at(x), at(y)));
  ctx.stroke();
  ctx.restore();
}

// Shared cargo material, also clipped to the lit cells of outgoing quest plates.
export function drawRailGrid(r, x, y, w, h, mirror = false) {
  const pitch = r.cellW + 2;
  for (let gx = 0; gx < w; gx += pitch) {
    const at = x + (mirror ? w - 1 - gx : gx);
    stroke(r, [[at, y], [at, y + h - 1]], ROLES.backing);
  }
  for (let gy = RAIL.hinge; gy < h; gy += RAIL.hinge) {
    stroke(r, [[x, y + gy], [x + w - 1, y + gy]], ROLES.backing);
  }
}
// An L at its vertex (vx, vy), its arms `a` across (signed) and `b` down (signed), each run out to `k` of its length.
function arms(r, vx, vy, a, b, ink, k = 1) {
  if (k <= 0.01) return;
  stroke(r, [[vx + a * k, vy], [vx, vy], [vx, vy + b * k]], ink);
}

// Words cut to `n` characters, the last an ellipsis when they are longer (Codex's rail.js `fit`).
export const railFit = (s, n) => { const g = glyphs(s ?? ''); return g.length <= n ? g.join('') : g.slice(0, Math.max(0, n - 1)).join('') + '…'; };

// The text a banner writes, cell by cell: [{ ch, x, row, ink }], its rows at `rowTop` and a row on, from `textX`; with `centre` (the
// banner's width) each row on the banner's axis instead (SX, 2026-10-05, on the notices under the helmet's notch: «они плохо
// выравниваются рядом с челкой, потому что там выключка по левому краю, давай попробуем по ценгтру»), never left of `textX`.
function textCells(r, b, textX, cols, centre = null) {
  const out = [];
  const put = (runs, row) => {
    const n0 = Math.min(cols, runs.reduce((n, [s]) => n + glyphs(s).length, 0));
    let x = centre == null ? textX : Math.max(textX, Math.round(centre / 2 - (n0 * r.cellW) / 2)), n = 0;
    for (const [s, ink] of runs) for (const ch of glyphs(s)) {
      if (n++ >= cols) return;
      out.push({ ch, x, row, ink });
      x += r.cellW;
    }
  };
  const fit = railFit;
  put(moneyRuns(fit(b.title, cols), b.titleInk ?? ROLES.textPrimary), 0);   // (`titleInk`: quiet while another task is selected, the room's list)
  const detail = [];
  if (b.clock) { detail.push([b.clock, b.clockInk ?? ROLES.textPrimary], [' · ', ROLES.textSecondary]); }
  if (b.sub) {
    const room = cols - (b.clock ? glyphs(b.clock).length + 3 : 0);
    detail.push(...moneyRuns(fit(b.sub, room), ROLES.textSecondary));
  }
  if (detail.length) put(detail, 1);
  return out;
}

// The gift's tear until SX's F1a (2026-10-06), no longer drawn by the game: kept for labs/graphics/sketches/find-motion.html's F0 TODAY.
// The card is kept on the near side of a crease x + y = S that runs from the folded corner to the top left; the band of `fold` px beyond
// the crease is turned back over it (its outline only, no fill), the rest is gone. `progress` 0..1.
function clipPoly(poly, keep) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length], ka = keep(a), kc = keep(c);
    if (ka >= 0) out.push(a);
    if ((ka >= 0) !== (kc >= 0)) { const t = ka / (ka - kc); out.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]); }
  }
  return out;
}
export function tearShape(w, h, progress, fold = RAIL.gift.fold) {
  const s0 = (w - 1) + (h - 1) - fold, s1 = -fold;
  const S = s0 + (s1 - s0) * easeInOut(progress);
  const rect = [[0, 0], [w, 0], [w, h], [0, h]];
  const kept = clipPoly(rect, ([x, y]) => S - (x + y));
  const band = clipPoly(clipPoly(rect, ([x, y]) => (x + y) - S), ([x, y]) => S + fold - (x + y));
  const flap = band.map(([x, y]) => [S - y, S - x]);
  return { S, kept, flap };
}

// A banner's press about its middle (a panel's, src/hover.js: in by up to 3.5 %, no edge more than 3 px), where the context can scale.
function pressed(ctx, box, press, run) {
  if (press <= 0 || typeof ctx?.scale !== 'function') return run();
  const k = 1 - Math.min(0.035, 6 / Math.max(box.w, box.h)) * press, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
  try { return run(); } finally { ctx.restore(); }
}

// Draws banner `b` with its top left at (x, y). `m`: its motion now, { inMs (since it came; null once settled), outMs (since it
// began to go; null while it stays), seed, over (the pointer on it, or the keyboard's focus), press (0..1, the click's deeper
// press), fold (0..1, a gift's corner), age (s, a picture's own clock), reduced }. Returns its rectangle, or null once it has gone.
export function drawRail(r, b, x, y, m = {}) {
  if (b.family === 'gift') return drawGift(r, b, Math.round(x), Math.round(y), m);
  const { w, h } = railSize(r, b);
  const family = b.family, ctx = r.ctx;
  const outMs = m.outMs ?? null;
  if (outMs != null && (m.reduced || outMs >= railOutTime(family) * 1000)) return null;
  // On whole pixels, so its lines and corners are crisp (Codex's painter draws at a whole origin).
  x = Math.round(x); y = Math.round(y);
  const metrics = uiMetrics(r), cw = r.cellW;
  const rowTop = Math.round((h - 2 * UI.row) / 2);
  const textX = RAIL.textX;
  const right = family === 'quest' ? RAIL.trailing : RAIL.reserve;
  const cols = Math.max(1, Math.floor((w - right - textX) / cw));
  // At rest (come, not going: most frames) nothing is cut into squares; while it comes or goes, every square has its time.
  const resting = outMs == null && (m.reduced || m.inMs == null || m.inMs >= railInTime() * 1000);
  const fx = resting ? loreFx(null, null) : loreFx(m.reduced ? null : m.inMs ?? null, outMs);
  const sq = resting ? { list: [] } : railSquares(squareEdges(r, b, w), h, m.seed ?? 0, outMs != null);
  const shown = new Set(sq.list.filter((s) => fx.shown(s)).map((s) => `${s.col},${s.k}`));
  if (!shown.size && outMs != null) return null;
  const whole = shown.size === sq.list.length;
  const at = (lx, ly) => sq.list.find((s) => lx >= s.x && lx < s.x + s.w && ly >= s.y && ly < s.y + s.h) ?? sq.list.at(-1) ?? null;
  const X = (lx) => x + lx, Y = (ly) => y + ly, P = (pts) => pts.map(([a, c]) => [x + a, y + c]);
  const box = { x, y, w, h };
  // The click's deeper press.
  const press = m.reduced ? 0 : clamp(m.press ?? 0, 0, 1);
  const ink = b.ink ?? ROLES.textPrimary, over = !!m.over;
  pressed(ctx, box, press, () => {
    // What is drawn is what stands: the squares come and go.
    const clip = !whole;
    if (clip) {
      ctx.save(); ctx.beginPath();
      for (const s of sq.list) if (shown.has(`${s.col},${s.k}`)) ctx.rect(X(s.x), Y(s.y), s.w, s.h);
      ctx.clip();
    }
    r.fill(x, y, w, h, ROLES.backing);
    if (family === 'cargo') {
      const wash = washOf(ink);
      r.fill(x, y, w, h, wash ?? ink, wash ? 1 : WASH.tint);
      drawRailGrid(r, x, y, w, h);
    }
    r.fill(x, y, RAIL.strip, h, ink);
    // The corners, each run out of its vertex as the sweep reaches it (and back into it as it goes).
    if (family !== 'quest') {
      const low = lowCorner(r, b, w, h);
      if (family !== 'cargo') arms(r, X(w - 1), Y(0), -(RAIL.corner + 1), RAIL.corner, ink, fx.arm(at(w - 1, 0)));
      arms(r, X(low.vx), Y(low.vy), -low.arm, -low.arm, over ? ROLES.textPrimary : ink, fx.arm(at(low.vx, low.vy)));
    }
    // The words and the sign, cell by cell: a cell stands once the squares under its capitals do, and flickers as they come and go.
    const cells = textCells(r, b, textX, cols, b.align === 'centre' ? w : null);
    if (b.mark) {
      const markInk = family === 'cargo' || (family === 'quest' && over) ? ROLES.textPrimary : (b.markInk ?? ink);
      cells.push({ ch: b.mark, x: RAIL.sign - cw / 2, row: 0, ink: markInk });
    }
    const rowY = (row) => rowTop + row * UI.row + metrics.textY;
    if (fx.settled && whole) {
      // At rest each run of one ink is one string (the cells' places are the monospace's own).
      let run = null;
      const flush = () => { if (run) r.text(run.s, X(run.x), Y(rowY(run.row)), run.ink); run = null; };
      for (const c of cells) {
        if (run && run.row === c.row && run.ink === c.ink && Math.abs(run.x + glyphs(run.s).length * cw - c.x) < 0.01) run.s += c.ch;
        else { flush(); run = { s: c.ch, x: c.x, row: c.row, ink: c.ink }; }
      }
      flush();
    } else {
      for (const c of cells) {
        if (c.ch === ' ') continue;
        const ty = rowY(c.row);
        const midX = c.x + cw / 2, s1 = at(midX, ty + metrics.capTop), s2 = at(midX, ty + metrics.capBottom - 1);
        if (!(shown.has(`${s1.col},${s1.k}`) && shown.has(`${s2.col},${s2.k}`))) continue;
        const ch = fx.char(c.ch, s2);
        if (ch !== ' ') r.text(ch, X(c.x), Y(ty), c.ink);
      }
    }
    if (clip) ctx.restore();
  });
  return box;
}

// ------------------------------------------------------------------------------------------------ the gift (F1a COUPON FALL)
//
// SX's pick on labs/graphics/sketches/find-motion.html (2026-10-06: «F1a COUPON FALL»), the page's code copied: the card is a coupon on
// its stub. A perforation stands in place of the divider. It comes stub first: the stub's frame runs out of its top left corner, the
// perforation down it, the picture prints top to bottom; the coupon is fed out from behind the perforation in three jerks (a
// stepper's feed), its letters flapping in as the notch's row does (FLAP_GLYPHS). It goes on a click or its time out: pulled 2 px,
// torn down the perforation faster and faster (the coupon turned a little about its lower left corner, still held), then the coupon
// falls turning slightly and fades, the stub holds 0.2 s and falls and fades after it. Reduced motion: whole, and gone at once. Until
// then a gift came in the banners' squares and went by a 45° tear, which drew it whole for its last frames (SX: «сначала пропадает,
// потом 1 раз мигает как баг»): nothing of a piece is drawn once it has faded. Since 2026-10-16 (SX: «когда он разрывается, пусть по
// яркости одинаковые две половинки будут»; «в ту сторону ... бумажка и улетает»): the two pieces go together, at one light, and a gift that
// landed somewhere of its own (labs/graphics/notice.js placePaper: `m.away`, the way off in its own turn) flies off that way, the pieces
// drawing apart, turning, growing as they come nearer (`PIECES`), instead of falling.
const GIFT_IN = Object.freeze({ arms: 0.14, edge: [0.06, 0.12], picture: [0.08, 0.16], feed: [0.18, 0.32], settle: 0.4 });
const GIFT_OUT = Object.freeze({ pull: 0.06, tear: [0.04, 0.22] });
// The pieces' flight off: seconds, px along the way off (eased in: the wind takes them), px apart, rad each turns, how much larger at its end.
const PIECES = Object.freeze({ fly: 0.62, reach: 520, apart: 40, turn: 0.35, grow: 0.6 });
const easeIn = (u) => clamp(u, 0, 1) ** 2;
// How a piece goes once it is free, `s` s after the tear has run its length: { dx, dy } moved, `turn` (rad) about its middle, `k` its
// scale, `alpha`, the same for both pieces; `side` 1 the coupon, -1 the stub; `away` the way off, or none: they fall.
function pieceGoes(s, side, away) {
  if (!away) {
    const u = clamp(s / 0.5, 0, 1);
    return side > 0 ? { dx: 12 * u, dy: 46 * u * u, turn: 0.16 * easeIn(u), k: 1, alpha: 1 - easeIn(u) }
      : { dx: -2 * u, dy: 30 * u * u, turn: -0.07 * easeIn(u), k: 1, alpha: 1 - easeIn(u) };
  }
  const u = clamp(s / PIECES.fly, 0, 1), e = easeIn(u), d = PIECES.reach * e;
  return { dx: away.x * d + side * PIECES.apart * u, dy: away.y * d, turn: side * PIECES.turn * u, k: 1 + PIECES.grow * e, alpha: 1 - e };
}
// The coupon's three jerks out of the stub, each eased and held.
const feed = (u) => { u = clamp(u, 0, 1); const j = Math.min(2, Math.floor(u * 3)), f = u * 3 - j; return (j + easeOut(Math.min(1, f / 0.55))) / 3; };

// The card at rest, at (x, y): its black, the picture in its field, the white frame (its corner folded in by `fold` 0..1), the words
// (`words` false: none, the coupon's as they flap in are drawn by the caller). The divider's place is the perforation's.
function giftCard(r, b, x, y, { age = 1e6, fold = 0, words = true } = {}) {
  const w = RAIL.width, h = giftField(), field = h, white = ROLES.textPrimary, cw = r.cellW;
  const P = (pts) => pts.map(([a, c]) => [x + a, y + c]);
  r.fill(x, y, w, h, ROLES.backing);
  drawFindPicture(r, b.find, x + field / 2, y + h / 2, age, 1);
  const f = Math.round(RAIL.gift.fold * easeOut(fold));
  if (!f) stroke(r, P([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1], [0, 0]]), white);
  else {
    // Codex's fold (his rail.js giftFrame): the frame cut at the corner, the corner turned in, its outline only.
    const R = w - 1, B = h - 1, fxp = R - f, fyp = B - f;
    stroke(r, P([[0, 0], [R, 0], [R, fyp], [fxp, B], [0, B], [0, 0]]), white);
    stroke(r, P([[R, fyp], [fxp, fyp], [fxp, B]]), white);
  }
  if (!words) return;
  const textX = field + RAIL.gift.gap, cols = Math.max(1, Math.floor((w - RAIL.reserve - textX) / cw));
  const rowTop = Math.round((h - 2 * UI.row) / 2), textY = uiMetrics(r).textY;
  let run = null;
  const flush = () => { if (run) r.text(run.s, x + run.x, y + rowTop + run.row * UI.row + textY, run.ink); run = null; };
  for (const c of textCells(r, b, textX, cols)) {
    if (run && run.row === c.row && run.ink === c.ink && Math.abs(run.x + glyphs(run.s).length * cw - c.x) < 0.01) run.s += c.ch;
    else { flush(); run = { s: c.ch, x: c.x, row: c.row, ink: c.ink }; }
  }
  flush();
}
// The coupon's words flapping in at `t` s of its way in, each cell turning over FLAP_GLYPHS until its own settle (later along its row,
// the detail after the title), at (x, y).
function giftWords(r, b, x, y, t) {
  const w = RAIL.width, h = giftField(), cw = r.cellW, textX = h + RAIL.gift.gap;
  const cols = Math.max(1, Math.floor((w - RAIL.reserve - textX) / cw)), rowTop = Math.round((h - 2 * UI.row) / 2), textY = uiMetrics(r).textY;
  for (const c of textCells(r, b, textX, cols)) {
    const i = Math.round((c.x - textX) / cw), settle = GIFT_IN.settle + 0.011 * i + 0.05 * c.row, cy = y + rowTop + c.row * UI.row + textY;
    if (t >= settle) { if (c.ch !== ' ') r.text(c.ch, x + c.x, cy, c.ink); continue; }
    r.text(FLAP_GLYPHS[Math.floor(noise(i + 3, c.row * 7 + 1, Math.floor(t / 0.045)) * FLAP_GLYPHS.length)], x + c.x, cy, ROLES.textSecondary);
  }
}
// The perforation in place of the divider: its column black, a dash of the frame's gray every 4 px, the frame broken over it (the
// coupon's punch). Above `front` (px from the top) it is torn: a white zigzag on the stub's side.
function perforation(r, x, y, front = 0) {
  const h = giftField(), X = x + h;
  r.fill(X, y + 1, 1, h - 2, ROLES.backing);
  r.fill(X - 1, y, 3, 1, ROLES.backing); r.fill(X - 1, y + h - 1, 3, 1, ROLES.backing);
  for (let yy = 3; yy < h - 3; yy += 4) if (yy >= front) r.fill(X, y + yy, 1, 2, ROLES.frame);
  if (front > 0) stroke(r, zigzag(X - 1, y, Math.min(front, h - 1), -1), ROLES.textPrimary, false);
}
// A torn edge down from (X, y): teeth of 2 px every 3 px, toward `side` (-1 left, 1 right).
function zigzag(X, y, len, side) {
  const out = [];
  for (let k = 0, yy = 0; yy <= len; k++, yy += 3) out.push([X + 0.5 + side * (k % 2 ? 2 : 0), y + Math.min(yy, len)]);
  return out;
}
// The gift `b` at (x, y) in its motion `m` (drawRail's): coming, standing, or torn off and falling. Returns its rectangle, or null once
// it has gone.
function drawGift(r, b, x, y, m) {
  const w = RAIL.width, h = giftField(), box = { x, y, w, h }, outMs = m.outMs ?? null;
  if (outMs != null) {
    if (m.reduced || outMs >= GIFT_TIMES.out * 1000) return null;
    giftOut(r, b, x, y, outMs / 1000, m);
    return box;
  }
  const t = m.reduced || m.inMs == null ? Infinity : m.inMs / 1000;
  if (t < GIFT_TIMES.in) { giftIn(r, b, x, y, t, m); return box; }
  const press = m.reduced ? 0 : clamp(m.press ?? 0, 0, 1);
  pressed(r.ctx, box, press, () => { giftCard(r, b, x, y, { age: m.age, fold: m.fold ?? 0 }); perforation(r, x, y); });
  return box;
}
function giftIn(r, b, x, y, t, m) {
  const ctx = r.ctx, T = GIFT_IN, W = RAIL.width, H = giftField(), FIELD = H, white = ROLES.textPrimary;
  const a = easeOut(t / T.arms), e = easeOut((t - T.edge[0]) / T.edge[1]);
  if (a <= 0) return;
  // The stub: its frame runs out of its top left corner, then its bottom and the perforation; the picture prints top to bottom.
  r.fill(x, y, Math.round(FIELD * a), Math.round(H * a), ROLES.backing);
  const rows = 2 * Math.floor((H * easeOut((t - T.picture[0]) / T.picture[1])) / 2);
  if (rows > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(x + 1, y + 1, FIELD - 1, rows); ctx.clip();
    giftCard(r, b, x, y, { age: m.age, words: false });
    ctx.restore();
  }
  stroke(r, [[x + FIELD * a, y], [x, y], [x, y + (H - 1) * a]], white);
  if (e > 0) {
    stroke(r, [[x, y + H - 1], [x + (FIELD - 1) * e, y + H - 1]], white);
    for (let yy = 3; yy < (H - 3) * e; yy += 4) r.fill(x + FIELD, y + yy, 1, 2, ROLES.frame);
  }
  // The coupon fed out from behind the perforation, its words turning over as they come.
  const span = W - FIELD - 1, shown = Math.round(span * feed((t - T.feed[0]) / T.feed[1])), dx = shown - span;
  if (shown <= 0) return;
  ctx.save(); ctx.beginPath(); ctx.rect(x + FIELD + 1, y - 2, span + 4, H + 4); ctx.clip();
  giftCard(r, b, x + dx, y, { age: m.age, words: false });
  giftWords(r, b, x + dx, y, t);
  ctx.restore();
  r.fill(x + FIELD - 1, y, 3, 1, ROLES.backing); r.fill(x + FIELD - 1, y + H - 1, 3, 1, ROLES.backing);
}
// A piece moved by a fall `f` about its middle (mx, my), clipped to `clip` ([x, y, w, h]), drawn at f.alpha.
function piece(r, f, mx, my, clip, paint) {
  if (f.alpha <= 0.01) return;
  const ctx = r.ctx;
  ctx.save();
  ctx.translate(mx + f.dx, my + f.dy); ctx.rotate(f.turn); if (f.k !== 1) ctx.scale(f.k, f.k); ctx.translate(-mx, -my);
  ctx.beginPath(); ctx.rect(...clip); ctx.clip();
  withAlpha(ctx, f.alpha, paint);
  ctx.restore();
}
function giftOut(r, b, x, y, t, m) {
  const ctx = r.ctx, T = GIFT_OUT, W = RAIL.width, H = giftField(), FIELD = H, tearEnd = T.tear[0] + T.tear[1];
  const box = { x, y, w: W, h: H }, press = clamp(m.press ?? 0, 0, 1) * (1 - easeOut(t / 0.1));
  const f = easeIn((t - T.tear[0]) / T.tear[1]), front = Math.round(f * H), free = t >= tearEnd, s = Math.max(0, t - tearEnd);
  // The tear: the coupon pulled 2 px, turned about its lower left corner (still held) as the tear runs down the perforation, faster and
  // faster; then the fall takes it from where the tear left it.
  const pX = x + FIELD + 1, pY = y + H;
  ctx.save();
  ctx.translate(pX + 2 * easeOut(t / T.pull), pY); ctx.rotate(0.035 * f); ctx.translate(-pX, -pY);
  piece(r, pieceGoes(s, 1, m.away), x + (FIELD + 1 + W) / 2, y + H / 2, [x + FIELD + 1, y - 2, W - FIELD + 2, H + 4], () => {
    pressed(ctx, box, press, () => giftCard(r, b, x, y, { age: m.age }));
    if (front > 0) stroke(r, zigzag(x + FIELD + 1, y, Math.min(front, H - 1), 1), ROLES.textPrimary, false);
  });
  ctx.restore();
  piece(r, pieceGoes(s, -1, m.away), x + FIELD / 2, y + H / 2, [x - 2, y - 2, FIELD + 3, H + 4], () => {
    pressed(ctx, box, press, () => giftCard(r, b, x, y, { age: m.age }));
    perforation(r, x, y, free ? H : front);
  });
}
