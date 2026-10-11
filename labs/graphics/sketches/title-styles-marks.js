// SHUTTLE BLUES drawn eight ways for the title study (title-styles.html, deleted 2026-10-04; the final title draws T2 from here; SX, 2026-10-02: «8
// вариантов в других стилях, типо как будто это разные шрифты и подходы, разные эстетики, в основном сайфай, какой-то
// гротеск, какой-то около граффити, какой-то хакерский терминальный ... Цвета ... белый синий, блики контура но без особо
// цветных разноцветных, скорее меланхоличный должен быть вайб»), plus 0 NOW, the game's wordmark as it is.
//
// One pipeline for all of them: a letter (a baked face, tools/bake-title-letters.mjs, or a drawing of our own) is read
// into cells of the style's size, the letters of a word are packed by their ink row by row (optical kerning, as the
// game's wordmark is), the two words are stacked by their ink column by column, and a painter draws the cells. The
// lettering rules of the game's wordmark (RULES) are the default every style starts from; where a style leaves one, its
// `departs` says which and why. Colours are named roles; each role has a kind, and rolling a scheme draws every role of
// its kind round one hue (rollScheme), so a roll stays one cool family.
import { LETTER_FACES } from './title-styles-letters.generated.js';
import { fromLch } from '../../../src/grade.js';
import { mixHex, mulberry32 } from '../../../src/util.js';
import { TITLE_ART, drawTitleArt } from '../title-art.js';
import { drawTitleDepth } from '../title-depth.js';
import { drawTitleSheen } from '../title-sheen.js';

// The game's wordmark, measured (labs/graphics/title-art.js TITLE_TYPE at 1440 x 900): the upper word's ink is 58 % of
// the screen's width (830 px, kept under 840), its capitals 11.1 % of that (92 px), a stem 22 % of the capitals (8-9 of
// 40 mask rows), 10 % of the capitals between letters ink to ink, and as little between SHUTTLE's lowest ink and BLUES'
// capitals. SX: «толщины, близость, размер леттеринга на экране ... как довольно настойчивую рекомендацию».
export const RULES = Object.freeze({ width: 0.58, maxWidth: 840, cap: 0.111, stem: 0.22, gap: 0.10, lead: 0.10 });
export const ruleCap = (W) => Math.min(W * RULES.width, RULES.maxWidth) * RULES.cap;

// ----------------------------------------------------------------------------------------------- colours and rolls

// A role's kind: where its lightness and chroma may fall (OKLCH), and how far its hue leans off the roll's (the deep
// inks lean towards violet, as the game's depth #202C48 does from its blue #4980AF: 266 against 246 degrees).
export const KINDS = Object.freeze({
  glint: { L: [0.97, 1.0], C: [0, 0.008] },
  white: { L: [0.86, 0.93], C: [0.006, 0.02] },
  pale: { L: [0.74, 0.83], C: [0.025, 0.05] },
  steel: { L: [0.6, 0.7], C: [0.012, 0.03] },
  blue: { L: [0.52, 0.65], C: [0.07, 0.115] },
  low: { L: [0.4, 0.47], C: [0.06, 0.095], lean: 6 },
  deep: { L: [0.26, 0.32], C: [0.045, 0.07], lean: 14 },
  night: { L: [0.15, 0.2], C: [0.025, 0.045], lean: 16 },
});
// The moods a roll draws its hue from: mostly the interface's own blues (the palette's blue is 246), some colder, some
// dusk, and now and then nearly grey. Never a second family: SX, «без особо цветных разноцветных».
const MOODS = [
  { p: 0.56, name: 'BLUE', hue: [234, 258], chroma: 1 },
  { p: 0.16, name: 'COLD', hue: [208, 232], chroma: 1 },
  { p: 0.16, name: 'DUSK', hue: [258, 284], chroma: 0.9 },
  { p: 0.12, name: 'SLATE', hue: [220, 270], chroma: 0.35 },
];
// `hue`: the roll's own hue in its place (the game's title takes the interface's blue, labs/graphics/title-final.js), every
// other draw as the seed has it, so the lightnesses and the chromas stay the roll's.
export function rollScheme(style, seed, { hue: at = null } = {}) {
  const rng = mulberry32(seed >>> 0);
  let u = rng(), mood = MOODS[MOODS.length - 1];
  for (const m of MOODS) { if (u < m.p) { mood = m; break; } u -= m.p; }
  const rolled = mood.hue[0] + rng() * (mood.hue[1] - mood.hue[0]);
  const hue = at ?? rolled;
  const colors = {};
  for (const [role, kind] of Object.entries(style.kinds)) {
    const K = KINDS[kind];
    const L = K.L[0] + rng() * (K.L[1] - K.L[0]);
    const C = (K.C[0] + rng() * (K.C[1] - K.C[0])) * mood.chroma;
    colors[role] = fromLch(L, C, hue + (K.lean ?? 0) + (rng() - 0.5) * 8);
  }
  return { colors, mood: mood.name, hue: Math.round(hue) };
}

// ------------------------------------------------------------------------------------------------- letters to cells

const letterCache = new Map();
// A baked letter: its ink box from the pen (x right, y down, capitals `cap` px tall) and its ink as bits.
function bakedLetter(face, ch) {
  const key = face + ch;
  let L = letterCache.get(key);
  if (L) return L;
  const f = LETTER_FACES[face], d = f.letters[ch];
  const bits = new Uint8Array(d.w * d.h);
  d.rows.split('|').forEach((row, y) => {
    if (!row) return;
    for (const span of row.split(' ')) {
      const [a, b] = span.split('-').map((s) => parseInt(s, 36));
      bits.fill(1, y * d.w + a, y * d.w + b + 1);
    }
  });
  L = { ...d, cap: f.cap, bits };
  letterCache.set(key, L);
  return L;
}

// A letter read into cells `cw` x `ch` px, the pen at the grid's origin on the baseline, its capitals `cap` px tall,
// leaned (`lean` px right per px up) and turned (`turn` radians about its ink's middle). Each cell keeps how much of it
// is ink, from `ss` x `ss` samples. Returns the grid's first cell (i0, j0), its size and the coverage.
function readLetter(L, cap, cw, ch, { lean = 0, turn = 0, ss = 4 } = {}) {
  const s = cap / L.cap;
  const cx = (L.x + L.w / 2) * s, cy = (L.y + L.h / 2) * s;
  const c1x = cx - lean * cy, cos = Math.cos(turn), sin = Math.sin(turn);
  const fwd = (fx, fy) => {
    const x0 = fx * s, y0 = fy * s, x1 = x0 - lean * y0 - c1x, y1 = y0 - cy;
    return [c1x + x1 * cos - y1 * sin, cy + x1 * sin + y1 * cos];
  };
  const corners = [[L.x, L.y], [L.x + L.w, L.y], [L.x, L.y + L.h], [L.x + L.w, L.y + L.h]].map(([x, y]) => fwd(x, y));
  const i0 = Math.floor(Math.min(...corners.map((p) => p[0])) / cw) - 1, i1 = Math.ceil(Math.max(...corners.map((p) => p[0])) / cw) + 1;
  const j0 = Math.floor(Math.min(...corners.map((p) => p[1])) / ch) - 1, j1 = Math.ceil(Math.max(...corners.map((p) => p[1])) / ch) + 1;
  const cols = i1 - i0, rows = j1 - j0, cov = new Float32Array(cols * rows);
  for (let b = 0; b < rows; b++) for (let a = 0; a < cols; a++) {
    let hit = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const X = (i0 + a + (sx + 0.5) / ss) * cw - c1x, Y = (j0 + b + (sy + 0.5) / ss) * ch - cy;
      const x1 = c1x + X * cos + Y * sin, y1 = cy - X * sin + Y * cos;
      const fx = (x1 + lean * y1) / s, fy = y1 / s;
      const px = Math.floor(fx - L.x), py = Math.floor(fy - L.y);
      if (px >= 0 && py >= 0 && px < L.w && py < L.h && L.bits[py * L.w + px]) hit++;
    }
    cov[b * cols + a] = hit / (ss * ss);
  }
  return { i0, j0, cols, rows, cov };
}

// TUBE's own letters (after Super R-Type, SNES 1991): centrelines on a cap of 10 units, a stroke 2.5 units wide (25 % of
// the cap, the rule's heavy stem), corners rounded. A letter is its width and its strokes (polylines).
const TUBE_HW = 1.25;
function tubeLetters() {
  const t = TUBE_HW, T = t, B = 10 - t, M = 5;
  const box = (w) => ({ L: t, R: w - t });
  const def = {};
  { const w = 10.4, { L, R } = box(w); def.S = { w, lines: [[[R, T], [L, T], [L, M], [R, M], [R, B], [L, B]]] }; }
  { const w = 10.4, { L, R } = box(w); def.H = { w, lines: [[[L, T], [L, B]], [[R, T], [R, B]], [[L, M], [R, M]]] }; }
  { const w = 10.4, { L, R } = box(w); def.U = { w, lines: [[[L, T], [L, B], [R, B], [R, T]]], round: 3.2 }; }
  { const w = 10.2, { L, R } = box(w); def.T = { w, lines: [[[L, T], [R, T]], [[w / 2, T], [w / 2, B]]] }; }
  { const w = 8.9, { L, R } = box(w); def.L = { w, lines: [[[L, T], [L, B], [R, B]]] }; }
  { const w = 9.4, { L, R } = box(w); def.E = { w, lines: [[[R, T], [L, T], [L, B], [R, B]], [[L, M], [R - 0.9, M]]] }; }
  { const w = 10.4, { L, R } = box(w); def.B = { w, lines: [[[L, B], [L, T], [R - 1.1, T], [R - 1.1, M], [L, M]], [[L, M], [R, M], [R, B], [L, B]]] }; }
  return def;
}
const TUBES = tubeLetters();
// A polyline with every corner rounded, as dense points: each corner's arc as large as `round` and as half the
// shorter of its two sides allow.
function roundedLine(points, round) {
  const out = [points[0]];
  for (let k = 1; k < points.length - 1; k++) {
    const P = points[k], A = points[k - 1], C = points[k + 1];
    const l1 = Math.hypot(P[0] - A[0], P[1] - A[1]), l2 = Math.hypot(C[0] - P[0], C[1] - P[1]);
    const d1 = [(P[0] - A[0]) / l1, (P[1] - A[1]) / l1], d2 = [(C[0] - P[0]) / l2, (C[1] - P[1]) / l2];
    const r = Math.min(round, l1 / 2, l2 / 2);
    const a = [P[0] - d1[0] * r, P[1] - d1[1] * r], c = [a[0] + d2[0] * r, a[1] + d2[1] * r];
    const from = Math.atan2(a[1] - c[1], a[0] - c[0]);
    let to = Math.atan2(d1[1], d1[0]);
    let sweep = to - from;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    for (let n = 0; n <= 10; n++) { const q = from + sweep * n / 10; out.push([c[0] + Math.cos(q) * r, c[1] + Math.sin(q) * r]); }
  }
  out.push(points[points.length - 1]);
  return out;
}
// A TUBE letter read into cells: its coverage from the distance to its centrelines, and for each cell inside, the
// tube's surface there (the normal across it, nx and ny, and how high the tube stands, h), for the light to shade.
function readTube(chr, cap, cw, ch) {
  const def = TUBES[chr], u = cap / 10, hw = TUBE_HW * u;
  const segs = [];
  for (const line of def.lines) {
    const pts = roundedLine(line, def.round ?? 2.4).map(([x, y]) => [x * u, (y - 10) * u]);
    for (let k = 0; k < pts.length - 1; k++) segs.push([pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]]);
  }
  const i0 = -1, j0 = Math.floor(-cap / ch) - 1, cols = Math.ceil(def.w * u / cw) + 2, rows = Math.ceil(cap / ch) + 3;
  const n = cols * rows, cov = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n), h = new Float32Array(n);
  for (let b = 0; b < rows; b++) for (let a = 0; a < cols; a++) {
    const X = (i0 + a + 0.5) * cw, Y = (j0 + b + 0.5) * ch;
    let best = Infinity, qx = 0, qy = 0;
    for (const [x1, y1, x2, y2] of segs) {
      const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((X - x1) * dx + (Y - y1) * dy) / L2)) : 0;
      const px = x1 + t * dx, py = y1 + t * dy, d = Math.hypot(X - px, Y - py);
      if (d < best) { best = d; qx = px; qy = py; }
    }
    const k = b * cols + a;
    cov[k] = Math.max(0, Math.min(1, (hw - best) / Math.min(cw, ch) + 0.5));
    if (best < hw) {
      const r = best / hw;
      nx[k] = best ? (X - qx) / best * r : 0;
      ny[k] = best ? (Y - qy) / best * r : 0;
      h[k] = Math.sqrt(Math.max(0, 1 - r * r));
    }
  }
  return { i0, j0, cols, rows, cov, nx, ny, h };
}

// The rows where a grid has ink (coverage over a half): row -> [first col, last col], in the word's cells.
function inkRows(g, col, row) {
  const m = new Map();
  for (let b = 0; b < g.rows; b++) {
    let first = -1, last = -1;
    for (let a = 0; a < g.cols; a++) if (g.cov[b * g.cols + a] >= 0.5) { if (first < 0) first = a; last = a; }
    if (first >= 0) m.set(row + g.j0 + b, [col + g.i0 + first, col + g.i0 + last]);
  }
  return m;
}

// The letters of one word, each read by `read(ch, k)` and packed by its ink row by row: every row of a letter keeps
// `gap` cells (may be negative: overlapping) from every earlier letter's ink in that row. `lift[k]` raises letter k
// by whole rows. Returns the letters at their places, the pen's baseline at row 0.
function packWord(text, read, { gap, lift = [] }) {
  const letters = [], right = new Map();
  [...text].forEach((c, k) => {
    const g = read(c, k), row = -(lift[k] ?? 0);
    const rows = inkRows(g, 0, row);
    let col = 0;
    if (k) {
      col = -Infinity;
      for (const [r, [first]] of rows) if (right.has(r)) col = Math.max(col, right.get(r) - first + 1 + gap);
      if (col === -Infinity) col = Math.max(...right.values()) - Math.min(...[...rows.values()].map((v) => v[0])) + 1 + gap;
    } else col = -Math.min(...[...rows.values()].map((v) => v[0]));
    for (const [r, [, last]] of inkRows(g, col, row)) right.set(r, Math.max(right.get(r) ?? -Infinity, last));
    letters.push({ ch: c, k, g, col, row });
  });
  return letters;
}

// The ink's extent of a word's letters, in its cells: per column its top and bottom, and the whole box.
function wordInk(letters) {
  const top = new Map(), bottom = new Map();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const { g, col, row } of letters) for (let b = 0; b < g.rows; b++) for (let a = 0; a < g.cols; a++) {
    if (g.cov[b * g.cols + a] < 0.5) continue;
    const i = col + g.i0 + a, j = row + g.j0 + b;
    top.set(i, Math.min(top.get(i) ?? Infinity, j)); bottom.set(i, Math.max(bottom.get(i) ?? -Infinity, j));
    x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j);
  }
  return { top, bottom, x0, x1, y0, y1 };
}

// Two words to one mark: BLUES under SHUTTLE (centred on its ink, or flush with its left ink), as close as `lead` cells
// between SHUTTLE's ink and BLUES' in every column they share. The grid gets `pad` cells round the ink for outlines,
// blocks and drips. Returns the mark: cells, coverage (the top letter's), which letter owns a cell, the letters with
// their grids at their places, and each word's capitals' rows.
function stack(words, { cw, ch, cap, lead, align = 'centre', pad = 6 }) {
  const [upper, lower] = words, A = wordInk(upper), B = wordInk(lower);
  const dx = align === 'left' ? A.x0 - B.x0 : Math.round((A.x0 + A.x1) / 2 - (B.x0 + B.x1) / 2);
  let dy = -Infinity;
  for (const [i, t] of B.top) { const b = A.bottom.get(i + dx); if (b !== undefined) dy = Math.max(dy, b - t + 1 + lead); }
  if (dy === -Infinity) dy = A.y1 - B.y0 + 1 + lead;
  const capRows = Math.round(cap / ch);
  const placed = [
    ...upper.map((l) => ({ ...l, word: 0 })),
    ...lower.map((l) => ({ ...l, word: 1, col: l.col + dx, row: l.row + dy })),
  ];
  const x0 = Math.min(A.x0, B.x0 + dx) - pad, y0 = Math.min(A.y0, B.y0 + dy) - pad;
  const x1 = Math.max(A.x1, B.x1 + dx) + pad, y1 = Math.max(A.y1, B.y1 + dy) + pad;
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1, cov = new Float32Array(cols * rows), owner = new Int16Array(cols * rows).fill(-1);
  const letters = placed.map((l, n) => {
    const at = { ...l, n, ox: l.col + l.g.i0 - x0, oy: l.row + l.g.j0 - y0 };
    for (let b = 0; b < l.g.rows; b++) for (let a = 0; a < l.g.cols; a++) {
      const v = l.g.cov[b * l.g.cols + a];
      if (v <= 0) continue;
      const k = (at.oy + b) * cols + at.ox + a;
      cov[k] = Math.max(cov[k], v);
      if (v >= 0.5) owner[k] = n;    // a later letter lies over an earlier one
    }
    return at;
  });
  const wordsAt = [0, 1].map((w) => {
    const base = (w ? dy : 0) - y0;
    return { base, capTop: base - capRows, capRows };
  });
  // The ink's box, px from the grid's top left.
  const inkBox = { x: (Math.min(A.x0, B.x0 + dx) - x0) * cw, y: (Math.min(A.y0, B.y0 + dy) - y0) * ch };
  inkBox.w = (Math.max(A.x1, B.x1 + dx) - x0 + 1) * cw - inkBox.x;
  inkBox.h = (Math.max(A.y1, B.y1 + dy) - y0 + 1) * ch - inkBox.y;
  return { cw, ch, cap, cols, rows, cov, owner, letters, words: wordsAt, ink: inkBox, w: cols * cw, h: rows * ch,
    upperW: (A.x1 - A.x0 + 1) * cw };
}

// Words set into a box `boxCols` cells wide (SX, 2026-10-02: «выключку, размер, ширину бокса (чтобы можно было в одну
// строку сделать»): a word stays on the line if it fits there after a word space, else it starts the next line; each line
// sits in the box flush left, centred or flush right by its ink; lines stand `lead` rows apart under the capitals. Returns
// a mark as `stack` does, with the box (`box.x` from the grid's left, `box.w`, px) and how many lines it took.
function flow(words, { cw, ch, cap, boxCols, align = 'centre', space, lead, pad = 6 }) {
  const inks = words.map(wordInk), capRows = Math.round(cap / ch), lines = [];
  let line = null;
  words.forEach((_, w) => {
    const width = inks[w].x1 - inks[w].x0 + 1;
    if (line && line.width + space + width <= boxCols) { line.items.push({ w, at: line.width + space }); line.width += space + width; }
    else { line = { items: [{ w, at: 0 }], width }; lines.push(line); }
  });
  const shift = [];
  lines.forEach((l, k) => {
    const start = align === 'left' ? 0 : align === 'right' ? boxCols - l.width : Math.round((boxCols - l.width) / 2);
    for (const it of l.items) shift[it.w] = { dx: start + it.at - inks[it.w].x0, dy: k * (capRows + lead) };
  });
  let x0 = Math.min(0, ...words.map((_, w) => inks[w].x0 + shift[w].dx)) - pad;
  let x1 = Math.max(boxCols - 1, ...words.map((_, w) => inks[w].x1 + shift[w].dx)) + pad;
  const y0 = Math.min(...words.map((_, w) => inks[w].y0 + shift[w].dy)) - pad;
  const y1 = Math.max(...words.map((_, w) => inks[w].y1 + shift[w].dy)) + pad;
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1, cov = new Float32Array(cols * rows), owner = new Int16Array(cols * rows).fill(-1);
  const placed = words.flatMap((letters, w) => letters.map((l) => ({ ...l, word: w, col: l.col + shift[w].dx, row: l.row + shift[w].dy })));
  const letters = placed.map((l, n) => {
    const at = { ...l, n, ox: l.col + l.g.i0 - x0, oy: l.row + l.g.j0 - y0 };
    for (let b = 0; b < l.g.rows; b++) for (let a = 0; a < l.g.cols; a++) {
      const v = l.g.cov[b * l.g.cols + a];
      if (v <= 0) continue;
      const k = (at.oy + b) * cols + at.ox + a;
      cov[k] = Math.max(cov[k], v);
      if (v >= 0.5) owner[k] = n;
    }
    return at;
  });
  const wordsAt = words.map((_, w) => { const base = shift[w].dy - y0; return { base, capTop: base - capRows, capRows }; });
  const ix0 = Math.min(...words.map((_, w) => inks[w].x0 + shift[w].dx)), ix1 = Math.max(...words.map((_, w) => inks[w].x1 + shift[w].dx));
  const iy0 = Math.min(...words.map((_, w) => inks[w].y0 + shift[w].dy)), iy1 = Math.max(...words.map((_, w) => inks[w].y1 + shift[w].dy));
  const ink = { x: (ix0 - x0) * cw, y: (iy0 - y0) * ch, w: (ix1 - ix0 + 1) * cw, h: (iy1 - iy0 + 1) * ch };
  return { cw, ch, cap, cols, rows, cov, owner, letters, words: wordsAt, ink, w: cols * cw, h: rows * ch,
    box: { x: -x0 * cw, w: boxCols * cw }, lines: lines.length, wordW: inks.map((i) => (i.x1 - i.x0 + 1) * cw) };
}

// ---------------------------------------------------------------------------------------------- masks and fields

const inside = (M, thr = 0.5) => { const m = new Uint8Array(M.cols * M.rows); for (let k = 0; k < m.length; k++) m[k] = M.cov[k] >= thr ? 1 : 0; return m; };
// A mask grown by `r` cells (a disc).
function grow(mask, cols, rows, r) {
  const out = new Uint8Array(mask.length), offs = [];
  for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (a * a + b * b <= r * r + r * 0.6) offs.push([a, b]);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (!mask[j * cols + i]) continue;
    for (const [a, b] of offs) { const x = i + a, y = j + b; if (x >= 0 && y >= 0 && x < cols && y < rows) out[y * cols + x] = 1; }
  }
  return out;
}
// Exact Euclidean distance (in cells) from every cell to the nearest cell where `mask` is `want` (Felzenszwalb and
// Huttenlocher's two passes of the lower envelope of parabolas).
function distance(mask, cols, rows, want = 1) {
  const INF = 1e12, f = new Float64Array(Math.max(cols, rows)), d = new Float64Array(Math.max(cols, rows));
  const v = new Int32Array(Math.max(cols, rows)), z = new Float64Array(Math.max(cols, rows) + 1);
  const grid = new Float64Array(cols * rows);
  for (let k = 0; k < grid.length; k++) grid[k] = mask[k] === want ? 0 : INF;
  const pass = (n, get, set) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
    for (let q = 0; q < n; q++) set(q, d[q]);
  };
  for (let i = 0; i < cols; i++) pass(rows, (q) => grid[q * cols + i], (q, val) => { grid[q * cols + i] = val; });
  for (let j = 0; j < rows; j++) pass(cols, (q) => grid[j * cols + q], (q, val) => { grid[j * cols + q] = val; });
  for (let k = 0; k < grid.length; k++) grid[k] = Math.sqrt(grid[k]);
  return grid;
}

// --------------------------------------------------------------------------------------------------- painting

// One frame of cells: `colorAt(i, j)` names a colour (or null) per cell; runs of one colour on a row are one rect,
// every edge on a whole px, so neighbouring cells never leave a seam.
// `box` ({ i0, i1, j0, j1 }, ends excluded) keeps the pass to part of the grid.
function paintCells(ctx, M, ox, oy, colorAt, alpha = 1, box = null) {
  const row = new Array(M.cols);
  const i0 = box?.i0 ?? 0, i1 = box?.i1 ?? M.cols, j0 = box?.j0 ?? 0, j1 = box?.j1 ?? M.rows;
  ctx.globalAlpha = alpha;
  for (let j = j0; j < j1; j++) {
    const y0 = Math.round(oy + j * M.ch), y1 = Math.round(oy + (j + 1) * M.ch);
    if (y1 <= y0) continue;
    for (let i = i0; i < i1; i++) row[i] = colorAt(i, j);
    let i = i0;
    while (i < i1) {
      const c = row[i];
      let e = i + 1;
      while (e < i1 && row[e] === c) e++;
      if (c) { const x0 = Math.round(ox + i * M.cw), x1 = Math.round(ox + e * M.cw); ctx.fillStyle = c; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
      i = e;
    }
  }
  ctx.globalAlpha = 1;
}
// Black under the mark, `r` cells round its ink: the sky's stars never touch a letter.
function knockout(ctx, M, ox, oy, r, key = 'knock' + r) {
  M[key] ??= grow(inside(M), M.cols, M.rows, r);
  const k = M[key];
  paintCells(ctx, M, ox, oy, (i, j) => (k[j * M.cols + i] ? '#000000' : null));
}
// A four-point star, `a` px to each side, on whole px: the sparkle 16-bit logos put on a letter's corner.
function sparkle(ctx, x, y, a, color) {
  if (a < 1) return;
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = color;
  ctx.fillRect(x - Math.round(a), y, Math.round(a) * 2 + 1, 1);
  ctx.fillRect(x, y - Math.round(a), 1, Math.round(a) * 2 + 1);
  const s = Math.round(a * 0.28);
  if (s >= 1) { ctx.fillRect(x - s, y - 1, 2 * s + 1, 3); ctx.fillRect(x - 1, y - s, 3, 2 * s + 1); }
  for (let d = 1; d <= Math.round(a * 0.3); d++) {
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x + d, y + d, 1, 1); ctx.fillRect(x - d, y - d, 1, 1); ctx.fillRect(x + d, y - d, 1, 1); ctx.fillRect(x - d, y + d, 1, 1);
    ctx.globalAlpha = 1;
  }
}
// A letter's corner cell: the inked cell furthest towards (dx, dy) (+1, -1 is its top right).
function cornerOf(M, n, dx, dy) {
  let best = null, score = -Infinity;
  for (let k = 0; k < M.cov.length; k++) {
    if (M.owner[k] !== n || M.cov[k] < 0.5) continue;
    const i = k % M.cols, j = (k / M.cols) | 0, s = i * dx * M.cw + j * dy * M.ch;
    if (s > score) { score = s; best = { i, j }; }
  }
  return best;
}
const hash = (a, b = 0, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t) => t * t * (3 - 2 * t);

// A cell's place down its word's capitals: 0 at their top, 1 at the baseline.
const capV = (M, word, j) => (j + 0.5 - M.words[word].capTop) / M.words[word].capRows;

// --------------------------------------------------------------------------------------------------- the styles

const baked = (face, cap, cw, ch, opts = {}) => (c, k) => readLetter(bakedLetter(face, c), cap, cw, ch,
  { lean: opts.lean ?? 0, turn: opts.turns?.[k] ?? 0, ss: opts.ss ?? 4 });
function buildFace(face, cap, { cellsPerCap, aspect = 1, gap = RULES.gap, lead = RULES.lead, lean = 0, turns, lifts, align, pad, ss } = {}) {
  const ch = cap / cellsPerCap, cw = ch * aspect;
  const words = ['SHUTTLE', 'BLUES'].map((text, w) => packWord(text, baked(face, cap, cw, ch, { lean, turns: turns?.[w], ss }),
    { gap: Math.round(gap * cap / cw), lift: (lifts?.[w] ?? []).map((v) => Math.round(v * cap / ch)) }));
  return stack(words, { cw, ch, cap, lead: Math.round(lead * cap / ch), align, pad });
}

const glintClock = (now, period, count) => {
  const cycle = Math.floor(now / period), t = (now % period) / period;
  return { which: Math.floor(hash(cycle, 7) * count), t, cycle };
};

// T1 CHROME. After Super E.D.F. (SNES 1991), Thunder Force III and IV (Mega Drive 1990, 1992) and Life Force (NES 1988):
// extended heavy italic capitals filled with chrome bands, a sky going down to a hard dark horizon a little under the
// middle and the ground's light coming back under it, a thin dark rim, and a four-point sparkle that lights one letter's
// corner at a time.
const CHROME = {
  code: 'T1', name: 'CHROME', face: 'Saira Expanded Black Italic',
  after: 'Super E.D.F. (SNES 1991), Thunder Force III / IV (MD 1990 / 92), Life Force (NES 1988)',
  idea: 'chrome bands with a horizon under the middle; a sparkle walks the corners',
  departs: 'none: the face is italic of its own, so no lean is added; no stagger (a chrome lockup stands level)',
  colors: { lip: '#F4F7FA', sky1: '#D6DCE3', sky2: '#A9BFD6', sky3: '#6F93BC', horizon: '#121A2E', ground1: '#2B4670',
    ground2: '#4980AF', ground3: '#93B3D3', rim: '#202C48', word2: '#4980AF', glint: '#FFFFFF' },
  kinds: { lip: 'glint', sky1: 'white', sky2: 'pale', sky3: 'blue', horizon: 'night', ground1: 'low', ground2: 'blue',
    ground3: 'pale', rim: 'deep', word2: 'blue', glint: 'glint' },
  ui: ['ground2', 'rim'],
  build: (cap) => buildFace('saira', cap, { cellsPerCap: 34, aspect: 1.12, gap: 0.09, lead: 0.16, pad: 4 }),
  draw(ctx, M, ox, oy, now, C) {
    knockout(ctx, M, ox, oy, 3);
    M.rim1 ??= grow(inside(M), M.cols, M.rows, 1);
    const bands = [[0.07, 'lip'], [0.24, 'sky1'], [0.38, 'sky2'], [0.47, 'sky3'], [0.535, 'horizon'], [0.6, 'ground1'],
      [0.74, 'ground2'], [0.88, 'ground3'], [2, 'sky1']];
    const lower = Object.fromEntries(Object.keys(C).map((k) => [k, mixHex(C[k], C.word2, k === 'horizon' ? 0.2 : 0.42)]));
    paintCells(ctx, M, ox, oy, (i, j) => {
      const k = j * M.cols + i;
      if (M.cov[k] < 0.5) return M.rim1[k] ? C.rim : null;
      const w = M.letters[M.owner[k]].word, v = capV(M, w, j), set = w ? lower : C;
      for (const [edge, role] of bands) if (v < edge) return set[role];
      return set.sky1;
    });
    const n = M.letters.length, g = glintClock(now, 2100, n);
    M.corners ??= M.letters.map((_, k) => cornerOf(M, k, 1, -1.4));
    const c = M.corners[g.which];
    if (c && g.t < 0.4) sparkle(ctx, ox + (c.i + 0.5) * M.cw, oy + (c.j + 0.5) * M.ch, Math.sin(g.t / 0.4 * Math.PI) * M.cap * 0.2, C.glint);
  },
};

// T2 TUBE. After Super R-Type (SNES 1991): round tubes of one stroke, wide letters with soft corners, shaded in one blue
// ramp from the night to a white highlight, on pure black. The light leans slowly from the left to the right and back,
// so the highlight slides along every tube.
const TUBE = {
  code: 'T2', name: 'TUBE', face: 'own tubes (centrelines, 25 % stroke)',
  after: 'Super R-Type (SNES 1991), R-Type III (SNES 1993)',
  idea: 'one stroke, rounded, a single blue ramp; the highlight slides as the light leans',
  departs: 'none',
  colors: { night: '#0E1424', deep: '#202C48', low: '#34557E', blue: '#4980AF', pale: '#8FB0D2', white: '#D6DCE3', glint: '#F6F8FB' },
  kinds: { night: 'night', deep: 'deep', low: 'low', blue: 'blue', pale: 'pale', white: 'white', glint: 'glint' },
  ui: ['blue', 'deep'],
  // `boxW` px wide (none: as wide as SHUTTLE, so BLUES goes under it), the lines set `align` in it. A word space is
  // half the capitals.
  build(cap, r, { boxW = null, align = 'centre' } = {}) {
    const ch = cap / 40, cw = ch;
    const words = ['SHUTTLE', 'BLUES'].map((text) => packWord(text, (c) => readTube(c, cap, cw, ch), { gap: Math.round(0.11 * cap / cw) }));
    const upper = wordInk(words[0]), boxCols = boxW ? Math.max(1, Math.round(boxW / cw)) : upper.x1 - upper.x0 + 1;
    return flow(words, { cw, ch, cap, boxCols, align, space: Math.round(0.5 * cap / cw), lead: Math.round(0.13 * cap / ch), pad: 3 });
  },
  draw(ctx, M, ox, oy, now, C) {
    knockout(ctx, M, ox, oy, 2);
    const ramps = [['night', 'deep', 'low', 'blue', 'pale', 'white', 'glint'], ['night', 'night', 'deep', 'low', 'blue', 'pale', 'white']]
      .map((r) => r.map((role) => C[role]));
    // The light: from the upper left, leaning to the upper right and back over 18 s.
    const q = -2.1 + 0.55 * Math.sin(now / 18000 * Math.PI * 2), lx = Math.cos(q) * 0.62, ly = Math.sin(q) * 0.62, lz = 0.79;
    const hx = lx, hy = ly, hz = lz + 1, hn = Math.hypot(hx, hy, hz);
    M.surface ??= (() => {
      const nx = new Float32Array(M.cols * M.rows), ny = new Float32Array(M.cols * M.rows), h = new Float32Array(M.cols * M.rows);
      for (const l of M.letters) for (let b = 0; b < l.g.rows; b++) for (let a = 0; a < l.g.cols; a++) {
        const s = b * l.g.cols + a, k = (l.oy + b) * M.cols + l.ox + a;
        if (l.g.h[s] > h[k]) { h[k] = l.g.h[s]; nx[k] = l.g.nx[s]; ny[k] = l.g.ny[s]; }
      }
      return { nx, ny, h };
    })();
    const S = M.surface;
    paintCells(ctx, M, ox, oy, (i, j) => {
      const k = j * M.cols + i;
      if (M.cov[k] < 0.5) return null;
      const nx = S.nx[k], ny = S.ny[k], nz = S.h[k];
      const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
      const spec = Math.max(0, (nx * hx + ny * hy + nz * hz) / hn) ** 40;
      const ramp = ramps[M.letters[M.owner[k]].word];
      const level = Math.min(5, Math.floor((0.12 + 0.86 * diffuse) * 5.6));
      return spec > 0.6 ? ramp[6] : ramp[level];
    });
  },
};

// T3 RASTER. After Life Force (NES 1988), Solar Jetman (NES 1990) and the Amiga's copper bars: extended black capitals
// cut into horizontal lines that thin towards the baseline, white at the top going down into blue, a hairline horizon
// between the words with a light running along it, the lines creeping slowly up, and now and then a bright bar sweeping
// down through the letters.
const RASTER = {
  code: 'T3', name: 'RASTER', face: 'Archivo Expanded Black',
  after: 'Life Force (NES 1988), Solar Jetman (NES 1990), Amiga copper bars',
  idea: 'letters cut into lines that thin downwards; a hairline horizon with a running light',
  departs: 'the stems are cut into lines, so the weight reads lighter than the rule at the bottom of each word, on purpose',
  colors: { white: '#D6DCE3', pale: '#A9BFD6', blue: '#4980AF', low: '#33557F', rule: '#202C48', glint: '#FFFFFF' },
  kinds: { white: 'white', pale: 'pale', blue: 'blue', low: 'low', rule: 'deep', glint: 'glint' },
  ui: ['blue', 'rule'],
  build: (cap) => buildFace('archivo', cap, { cellsPerCap: 46, aspect: 1, gap: 0.085, lead: 0.24, pad: 3 }),
  draw(ctx, M, ox, oy, now, C) {
    knockout(ctx, M, ox, oy, 2);
    const P = 4, phase = Math.floor(now / 520) % P;
    const bar = (now % 7000) / 1400;
    const rampOf = [['white', 'white', 'pale', 'blue'], ['pale', 'blue', 'blue', 'low']];
    paintCells(ctx, M, ox, oy, (i, j) => {
      const k = j * M.cols + i;
      if (M.cov[k] < 0.5) return null;
      const w = M.letters[M.owner[k]].word, v = Math.max(0, Math.min(0.999, capV(M, w, j)));
      const thick = Math.max(1, Math.round((P - 1) * (1.12 - 0.8 * v)));
      if (((j + phase) % P + P) % P >= thick) return null;
      if (bar < 1 && Math.abs(v - bar) < 0.05) return C.glint;
      return C[rampOf[w][Math.floor(v * 4)]];
    });
    // The horizon between the words, a little wider than the lockup, and its running light.
    const y = Math.round(oy + (M.words[0].base + (M.words[1].capTop - M.words[0].base) / 2 + 0.5) * M.ch);
    const x0 = Math.round(ox + M.ink.x - M.cap * 0.6), x1 = Math.round(ox + M.ink.x + M.ink.w + M.cap * 0.6);
    ctx.fillStyle = C.rule; ctx.fillRect(x0, y, x1 - x0, 1);
    const run = (now % 9000) / 3000;
    if (run < 1) {
      const x = x0 + (x1 - x0) * smooth(run);
      for (let d = 0; d < 40; d++) { ctx.globalAlpha = (1 - d / 40) ** 2; ctx.fillStyle = d < 3 ? C.glint : C.pale; ctx.fillRect(Math.round(x - d * 2), y, 2, 1); }
      ctx.globalAlpha = 1;
    }
  },
};

// T4 CONTOUR. After the vector screens (Asteroids, Star Wars, Tempest) and Elite's wireframes (BBC 1984): chamfered
// capitals as contour lines, the edge and a line inside it, a dim one round the outside; a pulse of light runs once
// round one letter's edge at a time. The game's cockpit is drawn in vector lines too.
const CONTOUR = {
  code: 'T4', name: 'CONTOUR', face: 'Oxanium ExtraBold',
  after: 'vector arcades (Asteroids 1979, Tempest 1981), Elite (BBC 1984), the game\'s own vector cockpit',
  idea: 'a chamfered face as lines: its edge, a line inside, a dim one round it; a pulse of light runs round one letter at a time',
  departs: 'drawn in lines, so the stem is the space between them, not ink: the weight is read from the silhouette',
  colors: { edge: '#D6DCE3', inner: '#4980AF', core: '#3A5F8C', halo: '#1E2A44', body: '#0B1120', word2: '#4980AF', glint: '#FFFFFF' },
  kinds: { edge: 'white', inner: 'blue', core: 'low', halo: 'deep', body: 'night', word2: 'blue', glint: 'glint' },
  ui: ['inner', 'halo'],
  build(cap) {
    const M = buildFace('oxanium', cap, { cellsPerCap: 48, aspect: 1, gap: 0.12, lead: 0.2, pad: 8 });
    const mask = inside(M), din = distance(mask, M.cols, M.rows, 0), dout = distance(mask, M.cols, M.rows, 1);
    // Signed distance (negative inside), smoothed twice so the lines inside do not step with the cells.
    let sd = new Float32Array(M.cols * M.rows);
    for (let k = 0; k < sd.length; k++) sd[k] = mask[k] ? -(din[k] - 0.5) : dout[k] - 0.5;
    for (let pass = 0; pass < 2; pass++) sd = blur3(sd, M.cols, M.rows);
    // The edge from the coverage itself (0.5 is the edge), which is smooth to a fraction of a cell.
    const edge = new Float32Array(M.cols * M.rows);
    for (let k = 0; k < edge.length; k++) edge[k] = 0.5 - M.cov[k];
    const unit = M.cap * 0.06 / M.ch;   // the inner line's and the outer one's distance from the edge, cells
    M.lines = [[edge, 0], [sd, -unit], [sd, unit * 1.2]].map(([field, level]) => ({ level, loops: contour(field, M.cols, M.rows, level, M) }));
    return M;
  },
  draw(ctx, M, ox, oy, now, C) {
    knockout(ctx, M, ox, oy, 1);
    // The letters' body, just off black: the silhouette keeps the rule's weight under its lines.
    paintCells(ctx, M, ox, oy, (i, j) => (M.cov[j * M.cols + i] >= 0.5 ? C.body : null));
    const ink = [[C.edge, C.inner, C.halo], [mixHex(C.edge, C.word2, 0.6), C.core, C.halo]];
    const widths = [1.5, 1, 1];
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(ox, oy);
    M.lines.forEach(({ loops }, n) => {
      ctx.lineWidth = widths[n];
      for (const loop of loops) {
        if (!loop.path) {
          loop.path = new Path2D();
          loop.pts.forEach(([x, y], k) => loop.path[k ? 'lineTo' : 'moveTo'](x, y));
          if (loop.closed) loop.path.closePath();
        }
        ctx.strokeStyle = ink[loop.word][n];
        ctx.stroke(loop.path);
      }
    });
    // The pulse: once round one letter's outer edge, 2.6 s, then the next letter.
    const edges = M.lines[0].loops.filter((l) => l.closed && l.outer);
    if (edges.length) {
      const g = glintClock(now, 3200, edges.length), loop = edges[g.which];
      if (g.t < 0.82) {
        const at = (g.t / 0.82) * loop.length;
        ctx.strokeStyle = C.glint; ctx.lineWidth = 1.6;
        ctx.setLineDash([M.cap * 0.45, loop.length]);
        ctx.lineDashOffset = -at;
        ctx.stroke(loop.path);
      }
    }
    ctx.restore();
  },
};
// A field averaged over each cell's 3 x 3 neighbours.
function blur3(f, cols, rows) {
  const out = new Float32Array(f.length);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let sum = 0, n = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const x = i + a, y = j + b;
      if (x >= 0 && y >= 0 && x < cols && y < rows) { sum += f[y * cols + x]; n++; }
    }
    out[j * cols + i] = sum / n;
  }
  return out;
}
// Marching squares on a field at `level`, chained into polylines in px; each closed loop knows its word (by the letter
// nearest its first point), its length, and whether it is a letter's outside (its area's sign).
function contour(field, cols, rows, level, M) {
  const segs = [];
  const at = (i, j) => field[j * cols + i] - level;
  const lerpPt = (i1, j1, i2, j2) => {
    const a = at(i1, j1), b = at(i2, j2), t = a / (a - b);
    return [((i1 + (i2 - i1) * t) + 0.5) * M.cw, ((j1 + (j2 - j1) * t) + 0.5) * M.ch];
  };
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const c = (at(i, j) < 0 ? 8 : 0) | (at(i + 1, j) < 0 ? 4 : 0) | (at(i + 1, j + 1) < 0 ? 2 : 0) | (at(i, j + 1) < 0 ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = () => lerpPt(i, j, i + 1, j), R = () => lerpPt(i + 1, j, i + 1, j + 1);
    const B = () => lerpPt(i, j + 1, i + 1, j + 1), L = () => lerpPt(i, j, i, j + 1);
    const table = { 1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: [[L, T], [B, R]], 6: [[T, B]], 7: [[L, T]],
      8: [[L, T]], 9: [[T, B]], 10: [[T, R], [L, B]], 11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]] };
    for (const [f, g] of table[c]) segs.push([f(), g()]);
  }
  // Chain by shared ends.
  const key = ([x, y]) => `${Math.round(x * 64)},${Math.round(y * 64)}`;
  const ends = new Map();
  segs.forEach((s, n) => { for (const p of s) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(n); } });
  const used = new Uint8Array(segs.length), loops = [];
  for (let n = 0; n < segs.length; n++) {
    if (used[n]) continue;
    used[n] = 1;
    const pts = [segs[n][0], segs[n][1]];
    let grew = true;
    while (grew) {
      grew = false;
      const tail = key(pts[pts.length - 1]);
      for (const m of ends.get(tail) ?? []) {
        if (used[m]) continue;
        used[m] = 1; grew = true;
        const [a, b] = segs[m];
        pts.push(key(a) === tail ? b : a);
        break;
      }
    }
    const closed = key(pts[0]) === key(pts[pts.length - 1]);
    if (pts.length < 6) continue;
    let length = 0, area = 0;
    for (let k = 1; k < pts.length; k++) { length += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); area += pts[k - 1][0] * pts[k][1] - pts[k][0] * pts[k - 1][1]; }
    // Which word: the owner of the nearest inked cell to the loop's first point.
    const [px, py] = pts[0];
    let word = 0, best = Infinity;
    for (const l of M.letters) {
      const cx = (l.ox + l.g.cols / 2) * M.cw, cy = (l.oy + l.g.rows / 2) * M.ch, d = Math.hypot(px - cx, py - cy);
      if (d < best) { best = d; word = l.word; }
    }
    loops.push({ pts, closed, length, word, outer: area > 0 });
  }
  // The outer loops are the ones that wind the way the largest does.
  const largest = loops.reduce((a, b) => (!a || b.length > a.length ? b : a), null);
  if (largest) { const sign = largest.outer; loops.forEach((l) => { l.outer = l.outer === sign; }); }
  return loops;
}

// T5 GROTESK. A Swiss poster's move: a grotesque's black weight, upright and set tight, both words flush left; SHUTTLE
// solid, BLUES the same letters as an outline only. A light passes along the outline now and then.
const GROTESK = {
  code: 'T5', name: 'GROTESK', face: 'Inter Tight Black',
  after: 'Swiss posters (Müller-Brockmann, Ruder); Wing Commander\'s letterboxed calm (SNES 1992)',
  idea: 'a grotesque set tight and flush left; the second word only an outline, a light passing along it',
  departs: 'tighter than the rule (3 % of the cap between letters, 6 % between the words), upright, flush left: the grotesque\'s own way',
  colors: { fill: '#D6DCE3', line: '#4980AF', pale: '#A9BFD6', glint: '#FFFFFF' },
  kinds: { fill: 'white', line: 'blue', pale: 'pale', glint: 'glint' },
  ui: ['line', null],
  build(cap) {
    const M = buildFace('inter', cap, { cellsPerCap: 42, aspect: 1, gap: 0.03, lead: 0.06, align: 'left', pad: 3 });
    const mask = inside(M);
    const din = distance(mask, M.cols, M.rows, 0);
    // The outline: the inked cells within its width of the edge.
    const width = Math.max(2, Math.round(M.cap * 0.045 / M.ch));
    M.outline = new Uint8Array(mask.length);
    for (let k = 0; k < mask.length; k++) if (mask[k] && din[k] <= width) M.outline[k] = 1;
    return M;
  },
  draw(ctx, M, ox, oy, now, C) {
    knockout(ctx, M, ox, oy, 2);
    const run = (now % 8000) / 3200, sweep = run < 1 ? (smooth(run) * 1.3 - 0.15) * M.cols : -1e9;
    paintCells(ctx, M, ox, oy, (i, j) => {
      const k = j * M.cols + i;
      if (M.cov[k] < 0.5) return null;
      if (M.letters[M.owner[k]].word === 0) return C.fill;
      if (!M.outline[k]) return null;
      const d = Math.abs(i - (sweep - j * 0.35));
      return d < 2.5 ? C.glint : d < 9 ? C.pale : C.line;
    });
  },
};

// T6 TAG. Near graffiti: a piece in the blues. Chunky capitals turned this way and that, bouncing, overlapping; each
// filled white going down into blue, a dark outline, a block of depth down to the right, a pale line round the whole
// piece; shines on the letters and sparkles on their corners; BLUES drips, and now and then a drop falls.
const TAG = {
  code: 'T6', name: 'TAG', face: 'Bungee (turned, bounced, overlapped)',
  after: 'graffiti pieces (wildstyle-lite), Jet Set Radio (Dreamcast 2000); the shines and stars of a piece',
  idea: 'a piece in two colours: block, outline, cloud line, shines; BLUES drips and lets a drop fall',
  departs: 'letters overlap (-5 % of the cap) and bounce (up to 16 %) and turn (up to 7 degrees): a piece does not keep a line',
  colors: { top: '#E8EDF2', mid: '#A9BFD6', low: '#4980AF', outline: '#0E1626', block: '#202C48', cloud: '#6F93BC', shine: '#FFFFFF' },
  kinds: { top: 'white', mid: 'pale', low: 'blue', outline: 'night', block: 'deep', cloud: 'blue', shine: 'glint' },
  ui: ['cloud', 'block'],
  build(cap) {
    const deg = Math.PI / 180;
    const M = buildFace('bungee', cap, { cellsPerCap: 30, aspect: 1, gap: -0.05, lead: 0.1, pad: 12,
      turns: [[-6, 4, -3, 6, -4, 3, -5].map((d) => d * deg), [5, -4, 6, -3, 4].map((d) => d * deg)],
      lifts: [[0.02, 0.14, 0.04, 0.12, 0.0, 0.1, 0.03], [0.1, 0.0, 0.14, 0.02, 0.12]] });
    const mask = inside(M);
    M.cloud = grow(mask, M.cols, M.rows, 5);
    M.cloudIn = grow(mask, M.cols, M.rows, 4);
    // Each letter's own masks, in the mark's cells: its ink, its outline (grown 1), its block (the outline pushed
    // down and right 1 to `depth` cells).
    const depth = Math.max(3, Math.round(M.cap * 0.07 / M.ch));
    M.parts = M.letters.map((l) => {
      const own = new Uint8Array(M.cols * M.rows);
      for (let b = 0; b < l.g.rows; b++) for (let a = 0; a < l.g.cols; a++) if (l.g.cov[b * l.g.cols + a] >= 0.5) own[(l.oy + b) * M.cols + l.ox + a] = 1;
      const ring = grow(own, M.cols, M.rows, 1), block = new Uint8Array(own.length);
      for (let k = 0; k < own.length; k++) {
        if (!ring[k]) continue;
        const i = k % M.cols, j = (k / M.cols) | 0;
        for (let d = 1; d <= depth; d++) if (i + d < M.cols && j + d < M.rows) block[(j + d) * M.cols + i + d] = 1;
      }
      // A shine: a short slash and a dot near the top left, inside by two cells.
      const din = distance(own, M.cols, M.rows, 0);
      let best = null, score = Infinity;
      for (let k = 0; k < own.length; k++) if (own[k] && din[k] >= 2.2) { const i = k % M.cols, j = (k / M.cols) | 0, s = i * 0.8 + j; if (s < score) { score = s; best = { i, j }; } }
      // The cells this letter's layers can touch: its grid, grown by the outline and pushed by the block.
      const box = { i0: Math.max(0, l.ox - 1), j0: Math.max(0, l.oy - 1),
        i1: Math.min(M.cols, l.ox + l.g.cols + depth + 2), j1: Math.min(M.rows, l.oy + l.g.rows + depth + 2) };
      return { own, ring, block, shine: best, box };
    });
    // Drips under BLUES: from bottom edge cells, seeded.
    M.drips = [];
    M.letters.forEach((l, n) => {
      if (l.word !== 1) return;
      const own = M.parts[n].own, bottoms = [];
      for (let i = 0; i < M.cols; i++) for (let j = M.rows - 2; j >= 0; j--) if (own[j * M.cols + i]) { if (!own[(j + 1) * M.cols + i]) bottoms.push({ i, j }); break; }
      const picks = 1 + Math.floor(hash(n, 3) * 2);
      for (let p = 0; p < picks && bottoms.length; p++) {
        const b = bottoms[Math.floor(hash(n, p, 11) * bottoms.length)];
        M.drips.push({ i: b.i, j: b.j, len: Math.round(3 + hash(n, p, 5) * 9), n, seed: hash(n, p, 9) });
      }
    });
    return M;
  },
  draw(ctx, M, ox, oy, now, C) {
    // The piece's cloud: black inside a pale line, round everything.
    paintCells(ctx, M, ox, oy, (i, j) => { const k = j * M.cols + i; return M.cloud[k] ? (M.cloudIn[k] ? '#000000' : C.cloud) : null; });
    // SHUTTLE white going down into blue, BLUES a step deeper (the game's white word over its blue one).
    const inks = [[C.top, C.mid, C.low], [C.mid, C.low, mixHex(C.low, C.block, 0.45)]];
    const fill = (j, w) => {
      const v = capV(M, w, j), [a, , c] = inks[w];
      return v < 0.36 ? a : v < 0.5 ? null : v < 0.7 ? inks[w][1] : v < 0.82 ? null : c;
    };
    M.letters.forEach((l, n) => {
      const P = M.parts[n];
      paintCells(ctx, M, ox, oy, (i, j) => (P.block[j * M.cols + i] && !P.ring[j * M.cols + i] ? C.block : null), 1, P.box);
      paintCells(ctx, M, ox, oy, (i, j) => {
        const k = j * M.cols + i;
        if (!P.ring[k]) return null;
        if (!P.own[k]) return C.outline;
        const c = fill(j, l.word);
        if (c) return c;
        // Between two bands the two colours alternate cell by cell.
        const v = capV(M, l.word, j), [hi, mid, lo] = inks[l.word];
        return ((i + j) & 1) ? (v < 0.6 ? hi : mid) : (v < 0.6 ? mid : lo);
      }, 1, P.box);
    });
    // The drips, after the letters, with their outline; and a drop now and then.
    for (const d of M.drips) {
      for (let s = 1; s <= d.len; s++) {
        const y = d.j + s, wide = s === d.len ? 2 : 1;
        for (let x = 0; x < wide; x++) {
          ctx.fillStyle = C.outline; ctx.fillRect(Math.round(ox + (d.i - 1 + x) * M.cw), Math.round(oy + y * M.ch), Math.round(M.cw * 3), Math.round(M.ch + 1));
        }
      }
      for (let s = 1; s <= d.len; s++) {
        const y = d.j + s, wide = s >= d.len - 1 ? 2 : 1;
        ctx.fillStyle = C.low; ctx.fillRect(Math.round(ox + d.i * M.cw), Math.round(oy + y * M.ch), Math.round(M.cw * wide), Math.round(M.ch));
      }
      const period = 5200 + d.seed * 4000, t = ((now + d.seed * 9000) % period) / 1400;
      if (t < 1) {
        const y = oy + (d.j + d.len + 1.5 + t * t * 26) * M.ch;
        ctx.globalAlpha = 1 - t; ctx.fillStyle = C.low;
        ctx.fillRect(Math.round(ox + d.i * M.cw), Math.round(y), Math.round(M.cw * 2), Math.round(M.ch * 2));
        ctx.globalAlpha = 1;
      }
    }
    // Shines: a slash and a dot on every letter.
    M.letters.forEach((l, n) => {
      const s = M.parts[n].shine;
      if (!s) return;
      ctx.fillStyle = C.shine;
      for (let d = 0; d < 3; d++) ctx.fillRect(Math.round(ox + (s.i + d) * M.cw), Math.round(oy + (s.j + 2 - d) * M.ch), Math.ceil(M.cw), Math.ceil(M.ch));
      ctx.fillRect(Math.round(ox + (s.i + 4) * M.cw), Math.round(oy + s.j * M.ch), Math.ceil(M.cw), Math.ceil(M.ch));
    });
    // Sparkles: three corners, each in its turn.
    M.sparks ??= [1, 4, 8].filter((n) => n < M.letters.length).map((n) => cornerOf(M, n, 1, -1.2));
    M.sparks.forEach((c, k) => {
      const t = ((now + k * 1300) % 3900) / 900;
      if (c && t < 1) sparkle(ctx, ox + (c.i + 1.5) * M.cw, oy + (c.j - 1) * M.ch, Math.sin(t * Math.PI) * M.cap * 0.22, C.shine);
    });
  },
};

// T7 TERMINAL. A hacker's terminal: the words as figlet's ANSI Shadow prints them (the logo of a thousand command-line
// tools), solid blocks with a box-drawn shadow, in the game's monospace at one and a half times its cells. Printed line
// by line as a terminal prints, a block cursor running along and then blinking on the line under it, a brighter line
// passing down like the beam, a few bits flipping now and then.
const ANSI = {
  S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
  H: ['██╗  ██╗', '██║  ██║', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  U: ['██╗   ██╗', '██║   ██║', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  T: ['████████╗', '╚══██╔══╝', '   ██║   ', '   ██║   ', '   ██║   ', '   ╚═╝   '],
  L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
};
const TERMINAL = {
  code: 'T7', name: 'TERMINAL', face: 'figlet ANSI Shadow in the game\'s monospace, cells 1.5 times the game\'s',
  after: 'figlet\'s ANSI Shadow (the command-line logo), BBS / ANSI screens, Uplink (2001), Hacknet (2015)',
  idea: 'blocks with a box-drawn shadow, printed line by line; a cursor, a beam, flipping bits',
  departs: 'on a grid of the game\'s cells at 1.5 times: no lean, no stagger, letters touching as figlet sets them; the stem is two cells (20 % of the cap)',
  colors: { text: '#D6DCE3', text2: '#4980AF', shade: '#2E4466', shade2: '#22324E', glint: '#FFFFFF', cursor: '#A9BFD6' },
  kinds: { text: 'white', text2: 'blue', shade: 'low', shade2: 'deep', glint: 'glint', cursor: 'pale' },
  ui: ['text2', 'shade2'],
  cells: true,
  build(cap, r) {
    // One and a half of the game's cells, so the lockup stands near the rule's width.
    const size = 1.5, cw = r.cellW * size, ch = r.cellH * size;
    const lineOf = (word) => ANSI[word[0]].map((_, y) => [...word].map((c) => ANSI[c][y]).join(''));
    const upper = lineOf('SHUTTLE'), lower = lineOf('BLUES');
    const cols = Math.max(...upper.map((l) => Array.from(l).length));
    const lowerLeft = Math.round((cols - Array.from(lower[0]).length) / 2);
    const lines = [...upper.map((t) => ({ t, x: 0, word: 0 })), { t: '', x: 0, word: 0 }, ...lower.map((t) => ({ t, x: lowerLeft, word: 1 }))];
    const rows = lines.length + 1;
    return { cw, ch, size, cap: 5 * ch, cols, rows, lines, ink: { x: 0, y: 0, w: cols * cw, h: lines.length * ch }, w: cols * cw, h: rows * ch };
  },
  draw(ctx, M, ox, oy, now, C, { r, opened = 0, reducedMotion = false }) {
    const age = reducedMotion ? 1e9 : now - opened, perLine = 110, perChar = 2.2;
    ctx.fillStyle = '#000000';
    ctx.fillRect(Math.round(ox - M.cw), Math.round(oy - M.ch * 0.5), Math.round(M.w + 2 * M.cw), Math.round(M.h + M.ch * 0.5));
    ctx.font = `${r.fontSize * M.size}px ${r.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const beam = (now % 7000) / 1600, flipCycle = Math.floor(now / 2600);
    const flips = new Set();
    if (!reducedMotion && (now % 2600) < 140) for (let f = 0; f < 4; f++) flips.add(Math.floor(hash(flipCycle, f) * M.lines.length * M.cols));
    let cursor = null;
    M.lines.forEach((line, j) => {
      const chars = Array.from(line.t), start = 200 + j * perLine;
      const shown = Math.max(0, Math.min(chars.length, Math.floor((age - start) / perChar)));
      if (age >= start && shown < chars.length) cursor = { i: line.x + shown, j };
      const lit = beam < 1 && Math.abs((j + 0.5) / M.lines.length - beam) < 0.06;
      for (let n = 0; n < shown; n++) {
        const c = chars[n], i = line.x + n;
        if (c === ' ') continue;
        const x0 = Math.round(ox + i * M.cw), x1 = Math.round(ox + (i + 1) * M.cw);
        const y0 = Math.round(oy + j * M.ch), y1 = Math.round(oy + (j + 1) * M.ch);
        const flip = flips.has(j * M.cols + i);
        if (c === '█' && !flip) {
          ctx.fillStyle = lit ? C.glint : line.word ? C.text2 : C.text;
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          continue;
        }
        ctx.fillStyle = flip ? C.glint : lit ? C.cursor : line.word ? C.shade2 : C.shade;
        ctx.fillText(flip ? '01/\\|#%'[(i + j) % 7] : c, (x0 + x1) / 2, (y0 + y1) / 2);
      }
    });
    // The cursor runs along the line being printed; once all is printed it blinks on the line under the last.
    if (!cursor && (reducedMotion || Math.floor(now / 530) % 2 === 0)) cursor = { i: M.lines.at(-1).x, j: M.lines.length };
    if (cursor) {
      ctx.fillStyle = C.cursor;
      ctx.fillRect(Math.round(ox + cursor.i * M.cw), Math.round(oy + cursor.j * M.ch), Math.round(M.cw), Math.round(M.ch));
    }
    ctx.font = r.font;
  },
};

// T8 STENCIL. A cargo crate's stencil, sprayed: tall condensed stencil capitals in shade glyphs (░ ▒ ▓ █) by how much
// of a cell the paint covers, an overspray of dots round them, worn patches; a work lamp's light passing slowly over
// the paint lifts it one shade. The game is about hauling; its plates are flaps and crates.
const SHADES = [' ', '░', '▒', '▓', '█'];
const STENCIL = {
  code: 'T8', name: 'STENCIL', face: 'Big Shoulders Stencil Display Black',
  after: 'Silpheed (Mega-CD 1993) stencil-cut caps; Alien\'s Nostromo crates (1979); Xenon 2 (Amiga 1989)',
  idea: 'a crate\'s stencil in shade glyphs, overspray and wear; a work lamp passes over it',
  departs: 'a condensed face: its capitals are taller than the rule\'s, so the lockup keeps the rule\'s width',
  colors: { paint: '#C9D1DA', paint2: '#4980AF', spray: '#2B3A55', lamp: '#F2F5F8' },
  kinds: { paint: 'white', paint2: 'blue', spray: 'deep', lamp: 'glint' },
  ui: ['paint2', 'spray'],
  glyphs: true,
  build(cap) {
    const M = buildFace('stencil', cap, { cellsPerCap: 15, aspect: 0.62, gap: 0.07, lead: 0.12, pad: 3, ss: 5 });
    const mask = inside(M, 0.12), dout = distance(mask, M.cols, M.rows, 1);
    M.spray = new Uint8Array(M.cols * M.rows);
    M.shade = new Uint8Array(M.cols * M.rows);
    M.word = new Int8Array(M.cols * M.rows).fill(-1);
    for (let k = 0; k < M.cov.length; k++) {
      const i = k % M.cols, j = (k / M.cols) | 0, v = M.cov[k];
      // The nearest letter's word, for the spray as for the paint.
      if (v > 0) M.word[k] = M.owner[k] >= 0 ? M.letters[M.owner[k]].word : (j > M.words[1].capTop - 1 ? 1 : 0);
      let s = v >= 0.82 ? 4 : v >= 0.56 ? 3 : v >= 0.3 ? 2 : v >= 0.1 ? 1 : 0;
      // Wear: a cell's paint thinner where a slow noise says, a step or two.
      const wear = hash(Math.floor(i / 3), Math.floor(j / 2), 5) * 0.6 + hash(i, j, 6) * 0.4;
      if (s >= 3 && wear < 0.09) s -= wear < 0.04 ? 2 : 1;
      M.shade[k] = s;
      if (!s && dout[k] <= 2.6 && hash(i, j, 8) < 0.42 * (1 - dout[k] / 3)) {
        M.spray[k] = 1;
        let best = Infinity;
        for (const l of M.letters) { const d = Math.abs((l.oy + l.g.rows / 2) - j) + Math.abs((l.ox + l.g.cols / 2) - i) * 0.3; if (d < best) { best = d; M.word[k] = l.word; } }
      }
    }
    return M;
  },
  draw(ctx, M, ox, oy, now, C, { r }) {
    knockout(ctx, M, ox, oy, 1);
    const size = M.ch / r.cellH;
    const run = (now % 11000) / 5000, lamp = run < 1 ? (smooth(run) * 1.5 - 0.25) * M.cols : -1e9;
    const litAt = (i, j) => Math.max(0, 1 - Math.abs(i - lamp + j * 0.9) / 16);
    const inkAt = (k, lit) => { const ink = M.word[k] ? C.paint2 : C.paint; return lit > 0.75 ? mixHex(ink, C.lamp, 0.35) : ink; };
    const level = (i, j) => { const k = j * M.cols + i; return M.shade[k] ? Math.min(4, M.shade[k] + (litAt(i, j) > 0.45 ? 1 : 0)) : 0; };
    // Full paint as solid cells (a font's █ leaves a hair between neighbours); the thinner shades as their glyphs.
    paintCells(ctx, M, ox, oy, (i, j) => (level(i, j) === 4 ? inkAt(j * M.cols + i, litAt(i, j)) : null));
    for (let j = 0; j < M.rows; j++) for (let i = 0; i < M.cols; i++) {
      const k = j * M.cols + i, x = ox + (i + 0.5) * M.cw, y = oy + (j + 0.5) * M.ch, lit = litAt(i, j);
      const s = level(i, j);
      if (s && s < 4) r.glyph(SHADES[s], x, y, inkAt(k, lit), 1, size);
      else if (!s && M.spray[k]) r.glyph(hash(i, j, 2) < 0.5 ? '·' : '.', x, y, lit > 0.3 ? mixHex(C.spray, C.lamp, 0.4) : C.spray, 1, size);
    }
  },
};

// 0 NOW. The game's wordmark as it is (labs/graphics/title-art.js, Codex's revision 19), its Broken Signal depth and
// sheen, for comparison.
const NOW = {
  code: 'T0', name: 'NOW', face: 'the game\'s own (polygons on half cells)',
  after: 'the title in the game today (revision 19)',
  idea: 'as it is, for comparison',
  departs: 'none: this is where the rules were measured',
  colors: { white: '#D6DCE3', blue: '#4980AF', edge: '#4980AF', rib: '#202C48' },
  kinds: { white: 'white', blue: 'blue', edge: 'blue', rib: 'deep' },
  ui: ['blue', 'rib'],
  build(cap) {
    // The game's mask: SHUTTLE's capitals are 40 of its rows (TITLE_TYPE: 18 units x 1.11 x 2 samples).
    const rows = TITLE_ART.height, cols = TITLE_ART.width, capRows = 40;
    const h = cap * rows / capRows, w = h / TITLE_ART.heightRatio;
    let x0 = cols, x1 = -1, y0 = rows, y1 = -1;
    TITLE_ART.rows.forEach((line, y) => [...line].forEach((c, x) => {
      if (c !== ' ') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }));
    const cw = w / cols, ch = h / rows;
    return { cw, ch, cap, w, h, ink: { x: x0 * cw, y: y0 * ch, w: (x1 - x0 + 1) * cw, h: (y1 - y0 + 5) * ch } };
  },
  draw(ctx, M, ox, oy, now, C, { r, reducedMotion = false }) {
    const at = { x: ox, y: oy, w: M.w, h: M.h };
    drawTitleDepth(r, at, { edge: C.edge, rib: C.rib }, { now, reducedMotion });
    drawTitleArt(r, at, { w: C.white, b: C.blue, g: C.blue }, { now, reducedMotion });
    drawTitleSheen(r, at, { w: C.white, b: C.blue }, { now, reducedMotion });
  },
};

export const STYLES = Object.freeze([NOW, CHROME, TUBE, RASTER, CONTOUR, GROTESK, TAG, TERMINAL, STENCIL]);
// SX's pick (2026-10-02, the screenshot: «леттеринг оставляем только тот что я на скрине скидывал»). The page shows it
// alone; the other seven stay in this file, off the page, until SX says to drop them.
export { TUBE };

// TUBE's mark for a screen `W` wide at `scale` times its size by the rules (the upper word as wide as the rule's 58 % at
// 1), set in a box `boxW` px wide (null: as wide as SHUTTLE) and aligned `align`. Cached by its inputs.
const tubeBuilt = new Map();
export function tubeMark(W, r, { scale = 1, boxW = null, align = 'centre' } = {}) {
  const key = `${W}|${scale}|${boxW}|${align}|${r.cellW}`;
  let M = tubeBuilt.get(key);
  if (M) return M;
  const fitKey = `fit|${W}`;
  let fit = tubeBuilt.get(fitKey);
  if (!fit) {
    const probe = TUBE.build(ruleCap(W), r);
    fit = Math.max(0.8, Math.min(1.7, Math.min(W * RULES.width, RULES.maxWidth) / probe.wordW[0]));
    tubeBuilt.set(fitKey, fit);
  }
  M = TUBE.build(ruleCap(W) * fit * scale, r, { boxW, align });
  if (tubeBuilt.size > 80) tubeBuilt.clear();
  tubeBuilt.set(key, M);
  return M;
}

// The two inks the title's own interface takes from a wordmark's colours, so they roll with it (SX, 2026-10-02:
// «полоска загрузки и отметка пункта меню должны роллиться вместе с цветом текста»): `accent`, the loading strip's fill
// and the chosen item's mark, from the role each style names first in `ui`; `track`, the strip's empty part, from the
// second, or the accent laid two thirds of the way to black where a style has no dark of its own.
export function uiInks(style, colors) {
  const [a, b] = style.ui ?? [];
  const accent = colors[a] ?? '#4980AF';
  return { accent, track: colors[b] ?? mixHex('#000000', accent, 0.36) };
}

// The mark of `style` for a screen `W` wide: built at the rule's capitals (times the style's own scale), then once more
// so its ink is no wider than `maxW` and no taller than `maxH`. Cached by its inputs.
const built = new Map();
// The rule's size is read as the upper word's width (58 % of the screen, at most 840 px): a narrow face gets taller
// capitals and a wide one shorter, within 0.8 to 1.7 times the rule's capitals, so every style stands as large on the
// screen as the game's wordmark does. A style on the game's own cells (TERMINAL) keeps its size.
export function markFor(style, W, maxW, maxH, r) {
  const key = `${style.code}|${W}|${Math.round(maxW)}|${Math.round(maxH)}|${r.cellW}`;
  let M = built.get(key);
  if (M) return M;
  let cap = ruleCap(W);
  M = style.build(cap, r);
  if (!style.cells) {
    const target = Math.min(W * RULES.width, RULES.maxWidth) * (style.widthScale ?? 1);
    const fit = Math.max(0.8, Math.min(1.7, target / (M.upperW ?? M.ink.w)));
    const scale = Math.min(fit, maxW / M.ink.w, maxH / M.ink.h);
    if (Math.abs(scale - 1) > 0.01) { cap *= scale; M = style.build(cap, r); }
  }
  built.set(key, M);
  return M;
}
