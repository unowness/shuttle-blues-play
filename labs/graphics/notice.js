import { UI, uiMetrics } from '../../src/uiGrid.js';
import { PALETTE, ROLES } from '../../src/roles.js';
import { keptDraw } from '../../src/grade.js';
import { onPlate } from '../../src/textShadow.js';
import { glyphs, noise3 as noise, mixHex, contrastOnBlack } from '../../src/util.js';
import { TOP } from './hud-layout.js';
import { helmetOf } from './helmet.js';
import { WASH, RAIL_TIMES, washOf, drawRail, railSize, railOutTime, FLAP_GLYPHS } from './rail.js';
import { tr } from '../../src/lang.js';
export { washOf };

// The game's notices, one at a time under the task slot at the top of the screen: SX's pick of 2026-10-04, Codex's banners A / Rail
// revision 5, drawn by labs/graphics/rail.js (its head says the families and the motion). A notice about cargo is a cargo banner
// (family 02, the plates' grid), a find a gift card (03), every other an event banner (01); its kind is told by one ink and its sign:
// news the interface's blue (◇), a refusal the caution orange (×), danger red (!), a gain green (+). The coupon (06 PERFORATED,
// 2026-10-01) and the find's frame (N1, 2026-10-02) are gone with it; the split-flap plate (11 FLAP as F) stays for the pause, a
// window's title and the route's pointer in the sky.
//
// A notice is { title, sub?, kind, cargo?, mark?, find?, life }: `life` the seconds it is shown (it then takes `out` to leave:
// rail.js railOutTime), `age` the seconds since it appeared, counted by the page; `mark` what a cargo banner's sign holds
// (CARGO_MARKS). `clicked`: the age a click pressed it at (it goes after the press, then its action runs: labs/graphics/notices.js).

export const NOTICE_KINDS = Object.freeze({
  news: { ink: PALETTE.blue, mark: '◇' },
  refusal: { ink: PALETTE.orange, mark: '×' },
  danger: { ink: PALETTE.red, mark: '!' },
  gain: { ink: PALETTE.green, mark: '+' },
});

// How long a notice stands by default, and how long it takes to leave.
export const NOTICE = Object.freeze({ life: 3.2, out: 0.3 });
// A notice that tells a quest is done (its cache opened, its signal tuned in, its ruin restored, its cargo taken: src/quests.js
// endsQuest) stands this many seconds longer than the same notice otherwise does (SX, 2026-10-02: «в конце квестов нужно чуть
// помедленнее говорить о том что он выполнен»).
export const QUEST_NOTICE = Object.freeze({ extra: 1.4 });

// The cargo plate (SX, 2026-10-01, three rounds on labs/graphics/sketches/cargo-plates.html: «берем ... вариант
// F ... фоновый черной подложки сделать ... 80%»). Left to right: a strip `strip` px wide in the kind's ink with the
// mark of what happened in its middle, `hair` px of sky, then the panel: the space's black at `back`, one wash of
// the kind's ink at `tint`, the text with `pad` characters of air either side, and over everything the flap's grid
// (a seam between every two characters and the hinge across each row) in black at `grid`. The wash went from 0.2
// to 0.32 and the grid from 0.5 to 0.85 the same evening (SX, in the game: «в нотификациях по грузу сделай чуть
// поярче сетку. Что-то она слишком, видимо, слабая. И они какие-то темноватые»): a lighter plate, and the black
// seams read on it.
export const FLAP = Object.freeze({ strip: 14, hair: 2, pad: 1.5, back: 0.8, tint: WASH.tint, grid: 0.85, wash: 0.9 });
// The wash is the kind's own colour (labs/graphics/rail.js washOf, moved there with the banners).
// How a plate comes and goes: square by square, a square being a character's half (between two seams and the
// hinge), not a panel sliding open (SX, the same evening: «они как бы должны по символьно собираться, то есть по
// квадратикам вот так собраться, разобраться»). The squares come over `in` seconds, left to right, each early or late
// by up to `spread` of that by its own roll; they leave in the same order over NOTICE.out.
export const FLAP_BUILD = Object.freeze({ in: 0.32, spread: 0.45 });
// The strip's mark by what happened to the cargo (SX: «Если потерян восклицательный знак, если доставлен, то плюсик
// если только взял, то стрелочка»), and a refusal's cross; a plate with none takes its kind's.
export const CARGO_MARKS = Object.freeze({ taken: '→', delivered: '+', lost: '!', refused: '×' });
const KIND_MARK = { news: CARGO_MARKS.taken, gain: CARGO_MARKS.delivered, danger: CARGO_MARKS.lost, refusal: CARGO_MARKS.refused };

const count = (s) => glyphs(s).length;

// Where a notice's top edge stands: a group's step (UI.vector.group, 40 px) under the line of the helmet's top, whose notch holds the
// task slot's one line on the upper groups' top line (labs/graphics/helmet.js; S8 V1+, SX: «остальные уведомления нужно двигать от
// нее на больший отступ»). It was the inset's air under a two-row task banner (Codex: «separated by UI.air.inset»). The same place
// whether the slot holds a task or not, so nothing jumps.
export const TASK_TOP = TOP;
export function noticeTop(r) {
  return helmetOf(r).noticeTop;
}

// A notice's clock, from its age: `k` how open it is (0 to 1 on the way in, 1, then back to 0 on
// the way out), `q` how far the way out has gone. `out` is the notice's own (a banner's), else NOTICE.out (the plates').
export const noticeOut = (notice) => notice.out ?? NOTICE.out;
export function noticeClock(notice, inTime) {
  const age = notice.age ?? 0, life = notice.life ?? NOTICE.life, out = noticeOut(notice);
  if (age < life) return { age, k: Math.min(1, age / inTime), q: 0 };
  const q = out > 0 ? Math.min(1, (age - life) / out) : 1;
  return { age, k: 1 - q, q };
}
export const noticeDone = (notice) => (notice.age ?? 0) >= (notice.life ?? NOTICE.life) + noticeOut(notice);

// 11 FLAP as F: the plate's place, from the canvas and its words alone (for noticeRect and the drawing).
const HEX = FLAP_GLYPHS;
export const flapInTime = (notice) => 0.08 + (Math.max(...[notice.title, notice.sub].filter(Boolean).map(count)) + 3) * 0.028 + 0.2;

function flapPlace(r, notice, cx) {
  const pitch = r.cellW + 2, rowH = UI.row + 2 * UI.pad;
  const lines = [notice.title, notice.sub].filter(Boolean).map(tr);
  const text = Math.max(...lines.map(count));
  const strip = notice.pause ? 0 : FLAP.strip, hair = strip ? FLAP.hair : 0;
  const padW = Math.round(FLAP.pad * pitch), panelW = 2 * padW + text * pitch;
  const width = Math.round(strip + hair + panelW), x0 = Math.round(cx - width / 2);
  return { pitch, rowH, lines, text, strip, padW, panelW, width, x0, px: x0 + strip + hair, height: lines.length * rowH };
}

// The plate's squares: the strip's (column -1), then each column of the panel, the air at either end included, each
// cut by the hinge into an upper and a lower half on every row; `rank` (0 to 1) is when it comes, left to right.
function flapSquares(g, top) {
  const edges = [g.px, ...Array.from({ length: g.text + 1 }, (_, i) => Math.round(g.px + g.padW + i * g.pitch)), g.x0 + g.width];
  const cols = edges.length - 1, half = Math.floor(g.rowH / 2), out = [];
  const add = (col, x, w, j, h) => {
    const y = top + j * g.rowH + (h ? half : 0), height = h ? g.rowH - half : half;
    const along = (col + 1) / cols;
    out.push({ col, j, h, x, y, w, height, rank: (1 - FLAP_BUILD.spread) * along + FLAP_BUILD.spread * noise(col + 7, j * 2 + h, 3) });
  };
  for (let j = 0; j < g.lines.length; j++) for (let h = 0; h < 2; h++) {
    if (g.strip) add(-1, g.x0, g.strip, j, h);
    for (let c = 0; c < cols; c++) add(c, edges[c], edges[c + 1] - edges[c], j, h);
  }
  return out;
}

// Whether a square stands at clock `c`: it has come (by its rank of FLAP_BUILD.in) and not yet left (by its rank
// of the way out). An `instant` plate (reduced motion) stands whole, and goes at once halfway out.
function squareShown(notice, c, sq) {
  if (notice.instant) return c.q < 0.5;
  if (c.q > 0) return sq.rank >= c.q;
  return c.age >= sq.rank * FLAP_BUILD.in;
}

// A `calm` plate (the route's pointer, GUIDE_PLATE) wears the praise plate's look (helmet.js drawPraise; SX, 2026-10-05, on a picture of
// it: «метки квеста вот такие должны быть ... там оттенки фона ярче, нужны так быть только со стрелкой»): the ink's deep wash opaque,
// the strip too, the grid in full black, the letters and the arrow in the ink itself, paled (`paleInk`) where the ink alone would read
// worse on its wash than the praise's green does on its own.
const paleCache = new Map();
const onWash = (text, wash) => contrastOnBlack(text) / contrastOnBlack(wash);
// The praise's green on its wash, as written, and a margin: the pointers stand in the kept layer, whose grade paints a wash a shade
// lighter than the praise's (measured under NOW: 5.57 to 5.65 : 1 painted for 5.70 without it). The green it was measured on, sage: the
// green became HALCYON's on 2026-10-20 (src/palette.js), darker on its wash, and the other kinds' pointers keep the paleness they had.
export const PRAISE_READ = onWash(PALETTE.sage, washOf(PALETTE.sage)) * 1.04;
export function paleInk(ink) {
  if (!/^#[0-9a-f]{6}$/i.test(ink)) return ink;
  if (paleCache.has(ink)) return paleCache.get(ink);
  const wash = washOf(ink);
  let out = ink;
  if (wash && onWash(ink, wash) < PRAISE_READ) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (onWash(mixHex(ink, '#ffffff', mid), wash) < PRAISE_READ) lo = mid; else hi = mid; }
    out = mixHex(ink, '#ffffff', hi).toUpperCase();
  }
  paleCache.set(ink, out);
  return out;
}

// The plate assembles square by square as its letters riffle in and land, and comes apart the same way. A `pause`
// plate has no strip. `kind.ink` washes it and colours the strip; a letter stands once both halves of its square do.
// Its letters stand on its squares, not on the sky: they cast no shadow (src/textShadow.js onPlate).
function drawFlap(r, notice, kind, cx, top) {
  return onPlate(() => drawFlapPlate(r, notice, kind, cx, top));
}
function drawFlapPlate(r, notice, kind, cx, top) {
  const c = noticeClock(notice, flapInTime(notice));
  if (c.q >= 1) return null;
  const g = flapPlace(r, notice, cx), m = uiMetrics(r), cw = r.cellW;
  const squares = flapSquares(g, top);
  const shown = new Set();
  const calm = !!notice.calm, calmWash = calm ? washOf(kind.ink) ?? ROLES.backing : null, pale = calm ? paleInk(kind.ink) : null;
  // Standing whole, the squares tile the strip and the panel: each laid as one rectangle of each ink (the effects audit of 2026-10-06,
  // path #7; a lab switch until SX compared it by eye and took it into the game, 2026-10-07), so no faint seam shows where two
  // squares' edges fall between pixels (a plate on its float). Coming together or apart, square by square. The grid and the letters
  // over them as ever.
  const still = squares.every((sq) => squareShown(notice, c, sq));
  if (still) {
    for (const sq of squares) shown.add(`${sq.col},${sq.j},${sq.h}`);
    const H = g.lines.length * g.rowH, pw = g.x0 + g.width - g.px, wash = washOf(kind.ink);
    if (g.strip) r.fill(g.x0, top, g.strip, H, calm ? calmWash : kind.ink);
    if (calm) r.fill(g.px, top, pw, H, calmWash);
    else {
      r.fill(g.px, top, pw, H, ROLES.backing, FLAP.back);
      if (wash) r.fill(g.px, top, pw, H, wash, FLAP.wash);
      else r.fill(g.px, top, pw, H, kind.ink, FLAP.tint);
    }
  }
  for (const sq of still ? [] : squares) {
    if (!squareShown(notice, c, sq)) continue;
    shown.add(`${sq.col},${sq.j},${sq.h}`);
    if (calm) { r.fill(sq.x, sq.y, sq.w, sq.height, calmWash); continue; }
    if (sq.col < 0) { r.fill(sq.x, sq.y, sq.w, sq.height, kind.ink); continue; }
    r.fill(sq.x, sq.y, sq.w, sq.height, ROLES.backing, FLAP.back);
    const wash = washOf(kind.ink);
    if (wash) r.fill(sq.x, sq.y, sq.w, sq.height, wash, FLAP.wash);
    else r.fill(sq.x, sq.y, sq.w, sq.height, kind.ink, FLAP.tint);
  }
  if (!shown.size) return null;
  const whole = (col, j) => shown.has(`${col},${j},0`) && shown.has(`${col},${j},1`);
  if (g.strip && g.lines.every((_, j) => whole(-1, j))) {
    const mark = notice.mark ?? KIND_MARK[notice.kind] ?? null;
    // A mark may move inside its strip (`markShift`, px; the route's arrow), never out of it.
    const shift = notice.markShift ?? { x: 0, y: 0 };
    if (mark) {
      const ctx = r.ctx, moves = shift.x || shift.y;
      if (moves) { ctx.save(); ctx.beginPath(); ctx.rect(g.x0, top, g.strip, g.height); ctx.clip(); }
      r.text(mark, g.x0 + (g.strip - cw) / 2 + shift.x, top + (g.height - UI.row) / 2 + m.textY + shift.y, calm ? pale : ROLES.backing);
      if (moves) ctx.restore();
    }
  }
  g.lines.forEach((s, j) => {
    const pad = Math.floor((g.text - count(s)) / 2), cells = glyphs(s);
    for (let i = 0; i < g.text; i++) {
      // Text column i is the panel's column i + 1 (the left air is column 0).
      if (!whole(i + 1, j)) continue;
      let ch = cells[i - pad] ?? ' ';
      const came = squares.find((sq) => sq.col === i + 1 && sq.j === j && sq.h === 1).rank * FLAP_BUILD.in;
      const settle = Math.max(came + 0.1, 0.08 + i * 0.028 + j * 0.1);
      if (!notice.instant && c.q === 0 && c.age < settle) ch = HEX[Math.floor(noise(i, j, Math.floor(c.age / 0.045)) * HEX.length)];
      if (ch === ' ') continue;
      r.text(ch, g.px + g.padW + i * g.pitch + (g.pitch - cw) / 2, top + j * g.rowH + UI.pad + m.textY, calm ? pale : j ? ROLES.textSecondary : ROLES.textPrimary);
    }
  });
  // The grid over it all, on the squares that stand: a seam at the left of every text column and after the last,
  // the hinge across each row.
  for (const sq of squares) {
    if (sq.col < 0 || !shown.has(`${sq.col},${sq.j},${sq.h}`)) continue;
    const grid = calm ? 1 : FLAP.grid;
    if (sq.col >= 1 && sq.col <= g.text + 1) r.fill(sq.x, sq.y, 1, sq.height, ROLES.backing, grid);
    if (sq.h === 1) r.fill(sq.x, sq.y, sq.w, 1, ROLES.backing, grid);
  }
  return { x: g.x0, y: top, w: g.width, h: g.height };
}

// P's pause as a small plate in the cargo plate's way, without the strip (SX, 2026-10-01: «Паузу сделай небольшим
// блоком посередине и сделай его в стиле табличек как у нас нотификации по грузам ... только маленькая, без ...
// боковой детали»), its top edge at `top`, centred on `cx`. It assembles as the cargo plates do: `age` the seconds
// since the pause began, `gone` the age the pause ended at, or null while it lasts; `instant` under reduced motion.
// Returns the rectangle it holds, or null once it has gone. In the green of the game's good news (`gain`) since SX's word of 2026-10-14
// («сделай также метку pause зеленой ... как наши зеленые метки»); the blue of `news` until then.
export const PAUSE_PLATE = Object.freeze({ title: 'PAUSED', kind: 'gain', pause: true });
export function pausePlateRect(r, cx, top) {
  const g = flapPlace(r, PAUSE_PLATE, cx);
  return { x: g.x0, y: top, w: g.width, h: g.height };
}
// The three plates and the notice below are drawn in the kept layer (src/grade.js keptDraw): a look filters them as art and
// never repaints them (INTERFACE_LOOKS_HANDOFF.md, SX: «notification полностью перекрашиваются, не хотелось бы»).
export const drawPausePlate = keptDraw(function drawPausePlate(r, cx, top, { age = 1e6, gone = null, instant = false } = {}) {
  const notice = { ...PAUSE_PLATE, age, life: gone ?? Infinity, instant };
  return drawFlap(r, notice, NOTICE_KINDS[PAUSE_PLATE.kind], cx, top);
});

// A window's title on the cargo plate, one line with its strip (labs/graphics/tabs-window.js): `kind` names its ink
// (NOTICE_KINDS), `mark` what the strip holds; `age` the seconds since it appeared, for it to assemble.
export function titlePlateRect(r, title, cx, top) {
  const g = flapPlace(r, { title }, cx);
  return { x: g.x0, y: top, w: g.width, h: g.height };
}
export const drawTitlePlate = keptDraw(function drawTitlePlate(r, title, kind, mark, cx, top, { age = 1e6, instant = false } = {}) {
  return drawFlap(r, { title, kind, mark, age, life: Infinity, instant }, NOTICE_KINDS[kind] ?? NOTICE_KINDS.news, cx, top);
});

// The cargo route's pointer as a cargo plate, one line, in the route's ink: the strip holds the arrow towards it,
// moving along its way, and the label stands on the panel (SX, 2026-10-01: «направляющая по грузу, она была на такой
// подложке, как у нас пауза», then «стрелка должна быть не под надписью, а слева должна быть цветная секция, и в ней
// двигающаяся стрелка»). For src/interface.js drawDeliveryGuide: `size` is the box a text takes, `draw` paints it with
// its top left at (x, y), `mark` in the strip moved by `shift` ({ x, y } px, kept inside the strip).
export const GUIDE_PLATE = Object.freeze({
  size: (r, text) => { const g = flapPlace(r, { title: text }, 0); return { w: g.width, h: g.height }; },
  draw: (r, text, x, y, ink, { mark = null, shift = null } = {}) => {
    const { w } = GUIDE_PLATE.size(r, text);
    return drawFlap(r, { title: text, kind: 'news', mark, markShift: shift, instant: true, age: 0, life: Infinity, calm: true },
      { ink }, x + w / 2, y);
  },
});

// How a notice's words stand in it: centred on the banner's axis, the helmet's notch's (SX, 2026-10-05: «давай попробуем по
// ценгтру»), each row of an event's and a cargo's banner; a gift's stay flush left beside its picture (its words are a column next to
// the picture, not the banner's whole content). (Flush left until then; the lab's `?notices=left` to compare went 2026-10-07.)
// What a notice is as a banner (labs/graphics/rail.js): a find's gift card, a cargo's banner on the grid, or an event's.
export function noticeBanner(notice) {
  if (!notice) return null;
  const kind = NOTICE_KINDS[notice.kind] ?? NOTICE_KINDS.news, align = 'centre';
  if (notice.find) return { family: 'gift', title: notice.find.name ?? notice.title, sub: notice.find.tag ?? notice.sub, find: notice.find };
  if (notice.cargo) return { family: 'cargo', ink: kind.ink, mark: notice.mark ?? KIND_MARK[notice.kind] ?? null, title: notice.title, sub: notice.sub, align };
  return { family: 'event', ink: kind.ink, mark: notice.mark ?? kind.mark, title: notice.title, sub: notice.sub, align };
}

// The rectangle a notice holds, from the canvas and its words alone: for the labels to keep off it and the status under it, before
// it is drawn. Centred under the task slot.
export function noticeRect(r, notice) {
  if (!notice || noticeDone(notice)) return null;
  const { w, h } = railSize(r, noticeBanner(notice));
  return { x: Math.round(r.width / 2 - w / 2), y: noticeTop(r), w, h };
}

// ------------------------------------------------------------------------------------------------ a find's paper

// A find's card stands where it lands, a paper blown onto the camera on the ship's nose (SX, 2026-10-16: «оповещение о том, что ты получил
// предмет. Пусть он, короче, как будто появляется на экране в рандомном месте с углом плюс-минус 30 градусов ... Если в левой части экрана
// ... левый угол вниз наклоняет. Если в правой части, то правый угол вниз ... Если левый нижний квадрат, то у него правый нижний угол вниз
// ... Если правый нижний квадрат ... правый верхний угол вверх ... клик по нему разрывает его, и он уносится ... когда он разрывается, пусть
// по яркости одинаковые две половинки будут ... делим экран на квадраты ... в ту сторону ... бумажка и улетает ... камера на носу нашего
// корабля ... Можно кликнуть, можно дождаться»): anywhere on the flight's view, off the interface's boxes and `clear` px round the ship; turned `tilt` degrees, more or less, as if laid on a ring round the screen's middle: the outer end down in the
// upper quarters, up in the lower ones (in the upper left the left end down, in the upper right the right one, in the lower left the right
// one, in the lower right the left one). Torn, by a click or at the end of its time, its two pieces fly off away from the screen's middle,
// toward its quarter's corner, as the sky does past the nose (rail.js giftOut, `away`), growing as they come nearer, the same light both.
// Torn while the ship stands, slower than `still` u/s, its pieces fall down out of the screen instead (SX, 2026-10-17: «Если корабль стоит на
// месте, то они падают вниз»; rail.js PIECES). Both on arcs since 2026-10-20 (SX's P1 ARC, labs/graphics/sketches/paper-flight.html): out
// toward the nearer side edge first and round to the corner, or slid aside and bent down (`paperBend`). Turned 2-8° since 2026-10-20 (SX,
// 2026-10-19: «она под каким-то сильным углом всегда»; his T2 on the same sheet, «2-8 давай»; 8-30° until then).
export const PAPER = Object.freeze({ tilt: Object.freeze([2, 8]), clear: 110, edge: 24, tries: 40, still: 60 });

// Where a find's paper lands on a screen `r` (its middle `cx`, `cy`), how it is turned (`angle`, rad: positive turns its right end down),
// and the way it flies off (`away`, a unit on the screen). `area` { x0, x1, y0, y1 } where it may stand (the flight's view under the
// notch by default), `avoid` the interface's boxes it keeps off (the locator's column, the quests, the gauges ...), `rng` the look's own
// dice (Math.random: nothing of the world's). A place that keeps off everything is taken; with none in `PAPER.tries`, the one that
// covers least.
export function placePaper(r, notice, { area = null, avoid = [], rng = Math.random } = {}) {
  const { w, h } = railSize(r, noticeBanner(notice)), W = r.width, H = r.height, mx = W / 2, my = H / 2, E = PAPER.edge;
  const view = r.view ?? { x: 0, y: 0, w: W, h: H };
  const A = area ?? { x0: E, x1: W - E, y0: Math.max(noticeTop(r), view.y + E), y1: view.y + view.h - E };
  const shipX = r.cx ?? mx, shipY = r.cy ?? my, C = PAPER.clear;
  const ship = { x: shipX - C, y: shipY - C, w: 2 * C, h: 2 * C }, keep = [ship, ...avoid.filter(Boolean)];
  const covered = (b) => keep.reduce((n, k) => n + Math.max(0, Math.min(b.x + b.w, k.x + k.w) - Math.max(b.x, k.x)) * Math.max(0, Math.min(b.y + b.h, k.y + k.h) - Math.max(b.y, k.y)), 0);
  let best = null;
  for (let i = 0; i < PAPER.tries; i++) {
    const deg = PAPER.tilt[0] + rng() * (PAPER.tilt[1] - PAPER.tilt[0]), a = (deg * Math.PI) / 180;
    const hw = (Math.cos(a) * w + Math.sin(a) * h) / 2, hh = (Math.sin(a) * w + Math.cos(a) * h) / 2;
    const cx = A.x0 + hw + rng() * Math.max(0, A.x1 - A.x0 - 2 * hw), cy = A.y0 + hh + rng() * Math.max(0, A.y1 - A.y0 - 2 * hh);
    const n = covered({ x: cx - hw, y: cy - hh, w: 2 * hw, h: 2 * hh });
    if (!best || n < best.n) best = { cx, cy, deg, hw, hh, n };
    if (n === 0) break;
  }
  const { cx, cy } = best, sign = (cx < mx) === (cy < my) ? -1 : 1, angle = sign * (best.deg * Math.PI) / 180;
  const dx = cx - mx, dy = cy - my, d = Math.hypot(dx, dy);
  const away = d > 1 ? { x: dx / d, y: dy / d } : { x: Math.SQRT1_2 * (sign < 0 ? -1 : 1), y: -Math.SQRT1_2 };
  return Object.freeze({ cx, cy, angle, away: Object.freeze(away), w, h, hw: best.hw, hh: best.hh });
}
// The paper's box on the screen (its turned corners' bounds), and whether (x, y) is on the paper itself.
export const paperBox = (p) => ({ x: Math.round(p.cx - p.hw), y: Math.round(p.cy - p.hh), w: Math.round(2 * p.hw), h: Math.round(2 * p.hh) });
export function onPaper(p, x, y) {
  if (!p) return false;
  const c = Math.cos(p.angle), s = Math.sin(p.angle), dx = x - p.cx, dy = y - p.cy;
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return Math.abs(u) <= p.w / 2 && Math.abs(v) <= p.h / 2;
}
// The way off in the paper's own turn (rail.js reads its pieces' flight in the paper's frame): toward its quarter's corner, or down (`fall`).
export const paperAway = (p, fall = false) => {
  const c = Math.cos(p.angle), s = Math.sin(p.angle), ax = fall ? 0 : p.away.x, ay = fall ? 1 : p.away.y;
  return { x: ax * c + ay * s, y: -ax * s + ay * c };
};
// The way the pieces' arcs bend out first, in the paper's own turn (rail.js PIECES, SX's P1 ARC): square to the way off, turned the way the
// paper is (toward the screen's nearer side edge in every quarter); or, falling, the screen's level (the coupon's way, the stub the other).
export const paperBend = (p, fall = false) => {
  const c = Math.cos(p.angle), s = Math.sin(p.angle);
  const [bx, by] = fall ? [1, 0] : p.angle > 0 ? [-p.away.y, p.away.x] : [p.away.y, -p.away.x];
  return { x: bx * c + by * s, y: -bx * s + by * c };
};

// The motion a notice is drawn with now (rail.js drawRail's `m`), from its clock: the sweep in, the press of a click, the way out.
export function noticeMotion(notice, { over = false, fold = 0, seed = 0 } = {}) {
  const age = notice.age ?? 0, life = notice.life ?? NOTICE.life;
  const pressed = notice.clicked != null ? Math.min(1, (age - notice.clicked) / RAIL_TIMES.press) : 0;
  return { inMs: notice.instant ? null : age * 1000, outMs: age >= life ? (age - life) * 1000 : null, seed: notice.seed ?? seed,
    over, fold, press: notice.instant ? 0 : Math.max(0, pressed), reduced: !!notice.instant, age };
}

// Draws a banner `notice` (a notice, or the task slot's: labs/graphics/notices.js) with its top left at (x, y), in the kept layer
// (src/grade.js keptDraw: a look filters it as art and never repaints it, INTERFACE_LOOKS_HANDOFF.md). `m` its motion (noticeMotion).
// Returns the rectangle it holds, or null when there is nothing to draw.
// Without (x, y) it stands at the notices' place (noticeRect).
export const drawNotice = keptDraw(function drawNotice(r, notice, x = null, y = null, m = null) {
  if (!notice || noticeDone(notice)) return null;
  const at = x == null || y == null ? noticeRect(r, notice) : { x, y };
  return drawRail(r, notice.banner ?? noticeBanner(notice), at.x, at.y, m ?? noticeMotion(notice));
});
// The out time a notice is given as it is made: its banner's way out (none under reduced motion).
export const bannerOut = (notice) => (notice.instant ? 0 : railOutTime(noticeBanner(notice).family));
