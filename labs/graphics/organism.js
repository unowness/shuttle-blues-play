// The windows as one organism (SX, 2026-10-16, on labs/graphics/sketches/windows-organism.html, W-ORG: «очень важная часть – это чтобы это был
// как будто бы один организм ... У него набор правил, строгий ... сетка ответвлений и как бы компонентов широкая, но это один организм»; after
// eight passes of the sketch, «остальное все принимаем, вноси»). Every window of the game is built from this one kit: the pause, the pilot card,
// a station's INFO, the hangar, the sign composer, the controls list, the map, a talk's beat, the two-tabs window, the finale, an object's menu,
// the garage's place. It is the sketch's engine (windows-organism.js Win and Pane) on the canvas, number for number.
//
// Three layers, two distances (SX: «3 слоя: рамка, служебные тексты/контролы окна, содержание окна ... стиль важен, но он как исключения, а
// удобство это база»):
//   the frame    the window's line, the head's rule and the foot's, frame to frame, an upright between two panes;
//   the service  what the window says of itself and what it answers to: the head's title and what the game knows at its right, the foot's
//                keys. It stands `ORG.S` off the line it belongs to, every side (his yellow marks: «шапки ... должны остаться супер узкими»);
//   the content  everything the window holds, `ORG.C` off any line round it, the frame's and an upright's alike, every side (his red marks).
// Down a pane: the lines of one block a row apart, a name to its things and a block to the next `C` ink to ink, the groups of a list an empty
// row apart. Inks, monochrome (SX: «давай делать монохромный ... синенький, который был раньше ... Также на кнопки назначим. Но все равно надо
// выделять важные кнопки квестовые ... фиолетовым. Какие-то диалоги красным»): the text white; a label gray (ROLES.textLabel, «гораздо
// прозрачнее»); what is not there yet quieter (ROLES.textFaint); the interface's blue for keys, progress and what is in hand; the story's
// purple for a quest's key; the red for a warning; money gold. The keys in three tiers (SX: «градацию рамочек управления»): the window's own
// blue from the foot's left in their order of importance (SX: «идем по важности слева направо»), a quest's purple, and the way back, ESC,
// gray and last, in the foot's right corner (SX, 2026-10-22, E1 SWAP on labs/graphics/sketches/esc-side.html: «давай свап везде. Принимаю»;
// from 2026-10-16 it stood first at the left, «Escape ... в левом нижнем углу ... чтобы соответствовать клавиатуре»). A share is a row of identical squares across
// its column, the had ones filled blue, the rest a gray line (SX: «все квадратики одинаковые, просто не заполненные серые, а заполненные
// цветные ... на всю ширину»). The thing in focus stands on a half-clear gray bar, its words in their own inks (SX: «не должна быть белая»,
// «попрозрачнее»). Nothing inside a window leans (SX: «я бы не делал параллакс внутри окон. Он не нужен»).
//
// The sizes (SX: «рассчитывай окна так ... чтобы они геометрично красиво смотрелись относительно дисплея ... по размерам была примерная
// система»): the least screen, 1280 x 960, in eighths, a window k x k of them, the display made smaller: S 640 x 480 (the pause, the controls,
// the sign), M 800 x 600 (the hangar), L 960 x 720 (the pilot card); a dialog takes a width of the ladder and its words' height (XS 480: the two
// tabs, the finale; S 640: INFO, a talk); an object's menu and the map are as large as what they hold.
//
// A window is laid out on its own px from its top left (`Win`, its panes `Pane`), measured before it is placed when its content gives its
// height (`fit`), placed (`place`, the middle of the flight's view as every centred window: src/uiGrid.js centredWindow), its sheet drawn
// (`sheet`), then what it holds, whose x and y are the screen's from then on.
import { ROLES, WINDOW } from '../../src/roles.js';
import { UI, uiMetrics, centredWindow } from '../../src/uiGrid.js';
import { frameInk, onFrame } from '../../src/frames.js';
import { onPlate } from '../../src/textShadow.js';
import { MONEY_INK, moneyRuns } from '../../src/money.js';
import { hoverItem, pointerOver, screenBox } from '../../src/hover.js';
import { px, glyphs, fitText } from '../../src/util.js';
import { keycap, KEYCAP_PAD, KEYCAP_RISE } from './ui-parts.js';
import { noteKey, noteAction, unnoted, keyCodeOf } from './clicks.js';
import { swiss, SWISS, drawSlider } from './swiss.js';

export const ORG = Object.freeze({
  S: SWISS.air,                      // px, a line to the service's ink: the head's band, the foot's keys
  C: Math.round(UI.air.inset),       // px, a line to the content's ink, every side (uiAir's inset on whole px)
  row: UI.row,                       // px, the lines of a block
  gutter: UI.line.cols,              // cells between two columns of content in one pane
  keyWord: UI.space.cols,            // cells from a keycap's letters to its words
  hintGap: 3,                        // cells between two keys of the foot
  meta: 3,                           // cells between two parts of the head's right
  under: 6,                          // px from a name's capitals to its row of squares
  square: 5, squareGap: 2,           // px: a square of a share, and the least gap between two
  focus: 0.11,                       // the focus bar: the text's white at this share
  dash: Object.freeze([3, 3]),       // px: an empty place's dashes
  cross: 5,                          // px: the arms of an empty place's cross
});
export const SIZES = Object.freeze({ XS: Object.freeze([480, null]), S: Object.freeze([640, 480]), M: Object.freeze([800, 600]), L: Object.freeze([960, 720]) });

export const INK = Object.freeze({
  text: ROLES.textPrimary, label: ROLES.textLabel, faint: ROLES.textFaint, black: ROLES.backing,
  blue: ROLES.structure, purple: ROLES.story, red: ROLES.danger, gold: MONEY_INK,
});
// The keycaps' tiers: the way back, every other key, a quest's.
export const TIER = Object.freeze({ back: ROLES.textQuiet, key: ROLES.structure, quest: ROLES.story });
export const tierInk = (tier) => TIER[tier] ?? tier ?? TIER.key;
// A chosen thing's mark: a white hairline square `off` (the context's MARK) off its box, the pause's square (here since 2026-10-17, from the
// LEDGER+ look before the organism, labs/graphics/sketches/ledger.js).
export function selectMark(ui, box, off = ui.MARK) {
  const ctx = ui.r.ctx;
  ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = ROLES.textPrimary; ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.rect(px(box.x - off), px(box.y - off), Math.round(box.w + 2 * off) - 1, Math.round(box.h + 2 * off) - 1); ctx.stroke();
  ctx.restore();
}

export const len = (s) => glyphs(String(s ?? '')).length;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// A part of a head or a row: [text, ink], { runs: [[text, ink], ...] }, or a string (white). Its cells.
const runsOf = (p) => (typeof p === 'string' ? [[p, INK.text]] : Array.isArray(p) ? [p] : p?.runs ?? []);
export const partLen = (p) => runsOf(p).reduce((n, [s]) => n + len(s), 0);
// Words with every amount of money in them in the coin's gold (src/money.js), the rest in `ink`.
export const money = (text, ink = INK.text) => ({ runs: moneyRuns(String(text), ink) });

// ------------------------------------------------------------------------------------------------------------------- a pane

// A column of a window between two lines (the frame's, an upright's), from `left` to `right`, the px of those lines from the window's left.
// Its rows are counted from its first: `top0`, its capitals' top from the window's top. Its axes are the screen's once the window is placed.
export class Pane {
  constructor(win, left, right, top0, i) { Object.assign(this, { win, left, right, top0, i }); }
  get cx() { return this.win.x0 + this.left + 1 + ORG.C; }           // the content's left axis (ink)
  get sx() { return this.win.x0 + this.left + 1 + ORG.S; }           // the service's left axis (ink)
  get cxr() { return this.win.x0 + this.right - ORG.C; }             // the content's right axis
  get sxr() { return this.win.x0 + this.right - ORG.S; }             // the service's right axis
  get cols() { return Math.floor((this.right - this.left - 1 - 2 * ORG.C + 2 * this.win.m.capLeft) / this.win.cw); }
  get top() { return this.win.y0 + this.top0; }
  // The inside between its lines (a picture that fills the pane: the pause's space, the map).
  get inside() {
    const w = this.win, y0 = w.y0 + w.headRule + 1;
    return { x: w.x0 + this.left + 1, y: y0, w: this.right - this.left - 1, h: w.y0 + (w.footRule ?? w.h - 1) - y0 };
  }
  x(c) { return this.cx + c * this.win.cw; }
  // (a string ending at the last column ends on the content's right axis exactly, whatever the cells leave over)
  xr(c) { return c >= this.cols ? this.cxr : this.cx + c * this.win.cw - 2 * this.win.m.capLeft; }
  y(k) { return this.top + k * ORG.row; }
  yb(k) { return this.y(k) + this.win.cap; }
  // The row whose capitals' top stands `C` under `px` (a block's ink bottom): the next block; or `gap` px under it.
  next(px0) { return this.kAfter(px0, ORG.C); }
  kAfter(px0, gap) { return (px0 + gap - this.top) / ORG.row; }
  text(c, k, s, ink = INK.text, o = {}) { return this.win.text(s, o.right ? this.xr(c) : this.x(c), this.y(k), ink, o); }
  // A group's name on row `k` at column `c`, in the label's gray, its count in the faint gray two cells after it (SX: «слева пиши ангар и
  // сереньким 4 дробь 6»). Returns the row's ink bottom: its things stand `C` under it.
  label(k, s, count = null, c = 0) {
    const end = this.text(c, k, s, INK.label);
    if (count != null) this.win.text(count, end + 2 * this.win.cw + 2 * this.win.m.capLeft, this.y(k), INK.faint);
    return this.yb(k);
  }
  // `n` boxes across the content, `gap` apart (the variants of one thing closer to each other than to the lines round them: SX, «в два раза
  // меньше отступ»), square or `h` px, their top at `y`: each the same whole px wide, the first on the content's left axis and the last ending on
  // its right, the gaps taking what the px leave over. Returns their boxes.
  cells(n, y, { gap = ORG.S, h = null } = {}) {
    const side = Math.floor((this.cxr - this.cx - (n - 1) * gap) / n), step = n > 1 ? (this.cxr - this.cx - side) / (n - 1) : 0, top = Math.round(y);
    this.tile = side;
    return Array.from({ length: n }, (_, i) => ({ x: Math.round(this.cx + i * step), y: top, w: side, h: Math.round(h ?? side) }));
  }
}

// ------------------------------------------------------------------------------------------------------------------- a window

// `size`: 'XS' | 'S' | 'M' | 'L' (SIZES) or [w, h] (h null: by its content); `width` instead, for one sized by its content's columns. `panes`,
// left to right, an upright between each two: a number (its content's columns), { fill: true } (the rest of a sized window, shared), or
// { square: true } (as wide as the body is tall: the pause's space). `keyFirst`: panes whose first row starts with a keycap (it stands lower by
// the keycap's rise, so its line, not its letters, is `C` under the head's rule). `headLines`: the head's lines (2: a small menu's visit under
// its name). `sky`: the frame white (a small window over open space, as an object's menu). `id` names its hover items; `live`: they answer.
export class Win {
  constructor(r, { size = null, width = null, panes = [{ fill: true }], keyFirst = [], headLines = 1, head = true, sky = false, id = 'window', live = true } = {}) {
    const m = uiMetrics(r);
    Object.assign(this, { r, m, cw: r.cellW, cap: m.capBottom - m.capTop, id, live, sky, hasHead: head, x0: 0, y0: 0, boxes: new Map(), placed: false });
    this.sw = swiss(r);
    this.keyH = r.cellH + KEYCAP_RISE + 1;                 // a keycap's line, top to bottom
    this.keyTop = m.capTop + KEYCAP_RISE;                  // its top over its letters' capitals
    const [W, H] = typeof size === 'string' ? SIZES[size] : Array.isArray(size) ? size : [width, null];
    this.size = typeof size === 'string' ? size : null;
    this.titleTop = 1 + ORG.S;
    this.headRule = head ? Math.round(this.titleTop + (headLines - 1) * ORG.row + this.cap + ORG.S) : 0;
    this.footRule = H ? H - this.footBand : null;
    this.h = H;
    const bodyH = H ? this.footRule - this.headRule - 1 : 0;
    const inkW = (cols) => cols * this.cw - 2 * m.capLeft;
    const specs = panes.map((p) => (typeof p === 'number' ? { cols: p } : { ...p }));
    let fixed = 0;
    for (const sp of specs) {
      sp.span = sp.cols != null ? Math.round(1 + 2 * ORG.C + inkW(sp.cols)) : sp.square ? bodyH + 1 : sp.px ?? null;
      fixed += sp.span ?? 0;
    }
    const fills = specs.filter((sp) => sp.span == null);
    for (const sp of fills) sp.span = Math.floor(((W ?? 0) - 1 - fixed) / fills.length);
    this.panes = [];
    let left = 0;
    specs.forEach((sp, i) => {
      const top0 = (head ? this.headRule + 1 : 1) + ORG.C + (keyFirst[i] ? this.keyTop : 0);
      this.panes.push(new Pane(this, left, left + sp.span, top0, i));
      left += sp.span;
    });
    this.w = W ?? left + 1;
  }
  get p() { return this.panes[0]; }
  // The foot's band: its rule, the air, the keycaps, the air, the frame's line.
  get footBand() { return 1 + ORG.S + this.keyH + ORG.S + 1; }
  // The window's height from its content's lowest ink `low` (px from its top), where its size does not give it, or where the content runs
  // past it (the window grows down, never over its foot): the foot's rule `C` under it, at least `atLeast`; with no foot, the frame `C` under it.
  fit(low, { foot = true, atLeast = 0 } = {}) {
    if (this.footRule != null && low + ORG.C <= this.footRule + 0.5) return this;
    if (foot) { this.footRule = Math.max(Math.round(low + ORG.C), atLeast); this.h = this.footRule + this.footBand; }
    else { this.footRule = null; this.h = Math.round(low + ORG.C + 1); }
    return this;
  }
  // The body exactly `h` px tall between the head's rule and the foot's (a picture that fills a pane edge to edge: the map's sectors).
  body(h) { this.footRule = this.headRule + 1 + Math.round(h); this.h = this.footRule + this.footBand; return this; }
  // Placed: at `at(w, h)`'s top left, or in the middle of the flight's view as every centred window. Its box from then on.
  place(at = null) {
    const p = at ? at(this.w, this.h) : centredWindow(this.r, this.w, this.h, { clear: false });
    this.x0 = Math.round(p.x); this.y0 = Math.round(p.y); this.placed = true;
    this.box = { x: this.x0, y: this.y0, w: this.w, h: this.h };
    return this;
  }
  // The sheet: the black on its box, its frame on the box's own edge (white over open space, else the frames' gray), the head's rule and the
  // foot's frame to frame, an upright between each two panes from rule to rule.
  sheet() {
    const { r, box } = this, ctx = r.ctx;
    r.fill(box.x, box.y, box.w, box.h, ROLES.backing);
    const line = (ink) => { ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.globalAlpha = 1; ctx.beginPath(); ctx.rect(px(box.x), px(box.y), box.w - 1, box.h - 1); ctx.stroke(); ctx.restore(); };
    if (this.sky) line(WINDOW.frame); else onFrame(() => line(frameInk('frame')));
    onFrame(() => {
      const ink = frameInk('rule');
      if (this.hasHead) r.fill(box.x + 1, box.y + this.headRule, box.w - 2, 1, ink);
      if (this.footRule != null) r.fill(box.x + 1, box.y + this.footRule, box.w - 2, 1, ink);
      const y0 = box.y + (this.hasHead ? this.headRule + 1 : 1), y1 = box.y + (this.footRule ?? box.h - 1);
      for (const p of this.panes.slice(0, -1)) r.fill(box.x + p.right, y0, 1, y1 - y0, ink);
    });
    return this;
  }

  // ---- text ------------------------------------------------------------------------------------------------------------------

  // Text whose ink starts at `ix` (or, `right`, ends there), its capitals' top at `Y`; `plate`: on a bar or in a box, so no shadow. Returns
  // the far edge of its ink (its right; with `right`, its left).
  text(s, ix, Y, ink = INK.text, { right = false, plate = false } = {}) {
    const str = String(s ?? ''), n = len(str), { m, cw, r } = this;
    const x = right ? ix + m.capLeft - n * cw : ix - m.capLeft;
    if (str.trim()) { const draw = () => r.text(str, x, Y - m.capTop, ink); if (plate) onPlate(draw); else draw(); }
    return right ? x + m.capLeft : x + n * cw - m.capLeft;
  }
  // A part ([text, ink], { runs }, a string) from `ix`, or ending there with `right`. Returns its far edge as `text` does.
  part(p, ix, Y, { right = false, plate = false } = {}) {
    const runs = runsOf(p), n = partLen(p), { m, cw } = this;
    let x = right ? ix + 2 * m.capLeft - n * cw : ix;
    for (const [s, ink] of runs) { this.text(s, x, Y, ink, { plate }); x += len(s) * cw; }
    return right ? ix + 2 * m.capLeft - n * cw : x - 2 * m.capLeft;
  }
  // The row top a swiss.js painter wants for capitals at `Y`.
  rowTop(Y) { return Y - this.m.textY - this.m.capTop; }

  // ---- the head ---------------------------------------------------------------------------------------------------------------

  // The head: `title` parts one after another at the service's left axis, `sub` two cells after it in the label's gray, `under` its second line
  // in the label's gray (a small menu's visit); `meta` parts ending at the service's right axis, `ORG.meta` cells apart, the first the farthest
  // left. Returns the capitals' top of its first line.
  head(title, { sub = null, under = null, meta = [] } = {}) {
    const Y = this.y0 + this.titleTop, first = this.panes[0], last = this.panes.at(-1), { cw, m } = this;
    let x = first.sx;
    for (const p of [].concat(title ?? [])) x = this.part(p, x, Y) + 2 * m.capLeft;
    if (sub) this.part(typeof sub === 'string' ? [sub, INK.label] : sub, x - 2 * m.capLeft + 2 * cw, Y);
    if (under) this.part(typeof under === 'string' ? [under, INK.label] : under, first.sx, Y + ORG.row);
    let rx = last.sxr;
    for (const p of [...meta].reverse()) rx = this.part(p, rx, Y, { right: true }) - ORG.meta * cw;
    return Y;
  }
  // What the head's right says, its cells, for a title that must leave it room.
  metaLen(meta) { return meta.reduce((n, p) => n + partLen(p), 0) + ORG.meta * Math.max(0, meta.length - 1); }

  // ---- keys --------------------------------------------------------------------------------------------------------------------

  // A keycap (labs/graphics/ui-parts.js keycap: its letters white in a cap of its tier's ink on the black) with its line's left edge at `lx`, its
  // letters' capitals' top at `Y`, its words `ORG.keyWord` cells after its letters in `wordsInk` (a part). Returns { cap (its line's box),
  // end (its words' ink right, or where they would start), words (their ink left) }.
  key(lx, Y, key, { words = null, wordsInk = INK.text, tier = 'key', plate = false } = {}) {
    const { r, m, cw } = this, n = len(key), x = lx + KEYCAP_PAD, y = Y - m.capTop;
    keycap(r, key, x, y, { ink: INK.text, cap: tierInk(tier), reach: 0 });
    const cap = { x: Math.round(lx), y: Math.round(y - KEYCAP_RISE), w: n * cw + 2 * KEYCAP_PAD, h: this.keyH };
    const wx = x + (n + ORG.keyWord) * cw + m.capLeft;
    const end = words == null ? wx : this.part(typeof words === 'string' ? [words, wordsInk] : words, wx, Y, { plate });
    return { cap, end, words: wx };
  }
  // A keycap and its words, measured: px from its line's left edge to its words' ink right.
  keyWidth(key, words) {
    const n = len(key), w = words == null ? 0 : partLen(typeof words === 'string' ? [words] : words);
    return n * this.cw + 2 * KEYCAP_PAD + (w ? (ORG.keyWord * this.cw - KEYCAP_PAD) + w * this.cw - this.m.capLeft : 0);
  }
  // Keycaps side by side (the controls list's legends), their letters a cell apart, the last one's line ending at `rx`: not buttons.
  keysWidth(keys) { return keys.reduce((n, k) => n + len(k) * this.cw + 2 * KEYCAP_PAD, 0) + (keys.length - 1) * (this.cw - 2 * KEYCAP_PAD); }
  keysEndingAt(rx, Y, keys, { tier = 'key' } = {}) {
    let x = rx - this.keysWidth(keys);
    unnoted(() => { for (const k of keys) { this.key(x, Y, k, { tier }); x += len(k) * this.cw + this.cw; } });
  }

  // ---- what answers --------------------------------------------------------------------------------------------------------

  // A thing that answers the pointer (`key` its name in the window, `box` the screen's): `draw(on)` now, `on` while the pointer is on it
  // (src/hover.js, flat: it neither grows nor dims the rest). Returns `on`.
  item(key, box, draw, kind = 'flat') {
    if (key != null) this.boxes.set(key, box);
    if (!this.live) { draw(false); return false; }
    const on = pointerOver(screenBox(this.r, box));
    hoverItem(this.r, `${this.id}:${key}`, box, () => draw(on), { over: on, kind });
    return on;
  }
  // The focus bar behind a thing whose ink runs from `x0` to `x1` with its capitals' top at `Y` (a keycap's line counts as ink): `UI.pad` past
  // it each side, a keycap's height and a px over and under.
  bar(x0, x1, Y) {
    const top = Math.round(Y - this.keyTop - 1);
    this.r.fill(Math.round(x0 - UI.pad), top, Math.round(x1 - x0 + 2 * UI.pad), this.keyH + 2, INK.text, ORG.focus);
  }
  // The box a row answers the pointer in: from `x0` to `x1` of ink, the bar's height.
  rowBox(x0, x1, Y) { return { x: Math.round(x0 - UI.pad), y: Math.round(Y - this.keyTop - 1), w: Math.round(x1 - x0 + 2 * UI.pad), h: this.keyH + 2 }; }

  // The foot: `back`, the way back (ESC first, what goes with it after: the pause's DEFAULTS), ending on the service's right axis with ESC last in
  // its corner (SX's E1 SWAP, 2026-10-22); `keys`, the window's own, from the service's left axis in their order. Each item a button: its keycap
  // and its words answer a click as its key (a cap of several keys, ← →, each on its own characters and its words for the first), and stand on
  // the focus bar under the pointer. An item: { key, words, tier ('back' for the way back's, 'key' for the window's, unless it says),
  // id, dim (its words faint: not now), quiet (said, not pressed), plain (a way that is no key: the key's words white, then its own), run (a
  // button with no key: a click runs it), noKey (only its words) }. `message` { text, ink, money }: the last action's words in the room between,
  // at the window's keys' end (`side: 'left'`) or against the way back. Returns the foot's capitals' top.
  foot(back = [], keys = [], { gap = ORG.hintGap, message = null } = {}) {
    // (Laid as the left group and the right one: the window's keys at the left, the way back at the right, ESC in the corner.)
    const left = keys.map((it) => ({ ...it, tier: it.tier ?? 'key' })), right = [...back.slice(1), ...back.slice(0, 1)].map((it) => ({ ...it, tier: it.tier ?? 'back' }));
    const first = this.panes[0], last = this.panes.at(-1), { cw, m } = this;
    const Y = this.y0 + this.footRule + 1 + ORG.S + this.keyTop;
    const widthOf = (it) => (it.plain ? (len(it.key) + ORG.keyWord + len(it.words)) * cw - 2 * m.capLeft
      : it.noKey ? len(it.words) * cw - 2 * m.capLeft : this.keyWidth(it.key, it.words));
    const put = (it, x, tier) => {
      const w = widthOf(it), box = this.rowBox(x, x + w, Y);
      const paint = (on) => {
        if (on) this.bar(x, x + w, Y);
        if (it.plain) { const end = this.text(it.key, x, Y, INK.text, { plate: on }); this.text(it.words, end + 2 * m.capLeft + ORG.keyWord * cw, Y, INK.label, { plate: on }); return; }
        if (it.noKey) { this.text(it.words, x, Y, it.dim ? INK.faint : INK.text, { plate: on }); return; }
        this.key(x, Y, it.key, { words: it.words, wordsInk: it.dim ? INK.faint : INK.text, tier: it.tier ?? tier, plate: on });
      };
      if (it.quiet || it.plain) { unnoted(() => paint(false)); return w; }
      // (Noted as the key itself, not as a keycap: a window drawn outside a menu's noting, the pause and a talk's beat, answers too.)
      if (it.run) noteAction(box, it.run);
      else if (keyCodeOf(it.key)) noteKey(it.key, box, this.r);
      else {
        // Several keys in one cap: each answers on its own characters, the words for the first.
        const tokens = String(it.key).split(' '), origin = x + KEYCAP_PAD - m.capLeft;
        let at = 0;
        for (const t of tokens) { noteKey(t, { x: origin + at * cw, y: box.y, w: len(t) * cw, h: box.h }, this.r); at += len(t) + 1; }
        const head = tokens.find((t) => keyCodeOf(t)), wx = x + this.keyWidth(it.key, null);
        if (head) noteKey(head, { x: wx, y: box.y, w: Math.max(1, box.x + box.w - wx), h: box.h }, this.r);
      }
      this.item(it.id ?? `key:${it.key ?? it.words}`, box, paint);
      return w;
    };
    let lx = first.sx;
    for (const it of left) lx += put(it, lx, 'key') + gap * cw;
    const widths = right.map(widthOf), total = widths.reduce((n, w) => n + w, 0) + gap * cw * Math.max(0, right.length - 1);
    let x = last.sxr - total;
    const edge = x;
    right.forEach((it, i) => { put(it, x, 'back'); x += widths[i] + gap * cw; });
    if (message?.text) {
      const room = Math.floor(((right.length ? edge - gap * cw : last.sxr) - lx) / cw);
      if (room >= 4) {
        const text = fitText(message.text, room), runs = message.money ? moneyRuns(text, message.ink ?? INK.label) : [[text, message.ink ?? INK.label]];
        if (message.side === 'left') this.part({ runs }, lx, Y); else this.part({ runs }, (right.length ? edge - gap * cw : last.sxr), Y, { right: true });
      }
    }
    return Y;
  }

  // ---- marks -----------------------------------------------------------------------------------------------------------------

  // A share as a row of squares from `x0` to `x1` (a pane's content axes), their top at `y`: as many `ORG.square` px squares as fit
  // `ORG.squareGap` apart at least, the last one's right on x1; of them `share` filled in `ink` (one at least where there is any, all only when
  // it is whole), the rest a hollow line in the final layer's gray. Returns their bottom.
  squares(y, share, { x0, x1, ink = INK.blue } = {}) {
    const size = ORG.square, gap = ORG.squareGap, n = Math.max(1, Math.floor((x1 - x0 + gap) / (size + gap)));
    const step = n > 1 ? (x1 - x0 - size) / (n - 1) : 0, s = clamp01(share), top = Math.round(y), ctx = this.r.ctx;
    const on = s <= 0 ? 0 : s >= 1 ? n : Math.min(n - 1, Math.max(1, Math.round(n * s)));
    if (on) {
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.beginPath();
      for (let i = 0; i < on; i++) ctx.rect(Math.round(x0 + i * step), top, size, size);
      ctx.fill(); ctx.restore();
    }
    if (on < n) onFrame(() => {
      ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = frameInk('hollow'); ctx.globalAlpha = 1; ctx.beginPath();
      for (let i = on; i < n; i++) ctx.rect(Math.round(x0 + i * step) + 0.5, top + 0.5, size - 1, size - 1);
      ctx.stroke(); ctx.restore();
    });
    return top + size;
  }
  // A small square of a list's item at (x, y) (its capitals' top): filled, a thing had; hollow, a thing offered.
  dot(x, Y, filled, ink = INK.blue) {
    const size = ORG.square, top = Math.round(Y + (this.cap - size) / 2), left = Math.round(x), ctx = this.r.ctx;
    if (filled) this.r.fill(left, top, size, size, ink);
    else { ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.globalAlpha = 1; ctx.beginPath(); ctx.rect(left + 0.5, top + 0.5, size - 1, size - 1); ctx.stroke(); ctx.restore(); }
  }
  // A collection's box: the one chosen a whole white line, the others dashes in the quietest gray (SX: «только селектор пусть будет сплошная
  // рамочка, остальные не сплошные»), or none (`line: false`: the large one, «там вообще не должно быть квадратика»); `cross` the plain cross
  // in its middle of a place still empty (SX: «без кружочка было лучше»).
  cell(box, { chosen = false, cross = false, line = true } = {}) {
    const ctx = this.r.ctx, b = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) };
    if (line && chosen) {
      ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = INK.text; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.rect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); ctx.stroke(); ctx.restore();
    } else if (line) onFrame(() => {
      ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = frameInk('dash'); ctx.globalAlpha = 1; ctx.setLineDash(ORG.dash);
      ctx.beginPath(); ctx.rect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); ctx.stroke(); ctx.restore();
    });
    if (cross) onFrame(() => {
      const cx = Math.round(b.x + b.w / 2), cy = Math.round(b.y + b.h / 2), a = ORG.cross;
      this.r.fill(cx - a, cy, 2 * a + 1, 1, frameInk('frame'));
      this.r.fill(cx, cy - a, 1, 2 * a + 1, frameInk('frame'));
    });
  }
  // A choice of several on the axis `rx` (the sketch's A1 PAIR): its value flush right, then ‹ › in the last three cells, the arrows blue, the
  // faint gray where there is no step past an end (`ends`). Returns { back (the ‹'s box: a click there steps back), left (the value's ink left) }.
  choice(rx, Y, value, { ends = [true, true], valueInk = INK.text, plate = false } = {}) {
    const { cw } = this;
    this.text('›', rx, Y, ends[1] ? INK.blue : INK.faint, { right: true, plate });
    this.text('‹', rx - 2 * cw, Y, ends[0] ? INK.blue : INK.faint, { right: true, plate });
    const left = this.text(value, rx - 4 * cw, Y, valueInk, { right: true, plate });
    return { back: this.choiceBack(rx, Y), left };
  }
  // The box of a choice's ‹ on the axis `rx`, its row's capitals at `Y`: a cell and a half round it.
  choiceBack(rx, Y) {
    const { cw, m } = this;
    return { x: Math.round(rx - 3 * cw + m.capLeft - cw / 2), y: Math.round(Y - this.keyTop - 1), w: Math.round(2 * cw), h: this.keyH + 2 };
  }
  // The cells a choice takes: its value, a cell, ‹ ›.
  static choiceLen(value) { return len(value) + 4; }
  // A level from `x0` to `x1` (labs/graphics/swiss.js drawSlider: a hairline with its ends' and middle's ticks, the mark) on the row of `Y`.
  level(x0, x1, Y, value) { return drawSlider(this.sw, { x0, x1, top: this.rowTop(Y), level: value, on: false }); }
  // A picture `paint()` drawn inside `box` only (a shot at its own size, never scaled, masked by the box, no frame: SX, «брал в реальном размере
  // шот ... рандомный фрагмент станции один к одному, но в этом квадрате заключен ... безрамочно»).
  clip(box, paint) {
    const ctx = this.r.ctx;
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    try { paint(); } finally { ctx.restore(); }
  }
}
