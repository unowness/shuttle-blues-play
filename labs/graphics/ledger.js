// The menus and windows' one look (SX's final for them, picks.md 2026-10-04: «the menus (Q), SX's final»; his pick V2 on
// labs/graphics/sketches/menus-ledger.html, 2026-10-05: «окна V2»): LEDGER+, its sheet plain black in a white hairline frame since SX's
// word of 2026-10-06 («поп-апам давай возвращать белые рамочки, не видно так их, черный фон и белые рамочки надо вернуть»; src/roles.js
// WINDOW). Every window is one sheet, 18 px of air (src/uiGrid.js uiAir's inset, on whole px) from its edge, where its frame stands, to
// its ink on every side; its rows read as a ledger (a label at the left, leader dots, its value at the right); its keys at the foot,
// each a keycap and its words; the chosen thing in a white hairline square `MARK` off it; under the pointer (or the keys' focus, the
// same pointer parked) a thing comes up and everything else in its window dims 10 % (the pause's P2, S5's H2). The inner separators
// are kept (SX: «ты в леджере слишком много убераешь внутренних полосок»): a hairline in the rules' ink with the rule's air over and
// under it between two groups, an upright with a container's inset each side between two columns, under the head and over the keys.
// From V2 until 2026-10-06 the sheet was frameless and its black, and a keycap's, had a veil laid over it (SX: «леджер на черном
// космосе не заметен ... чуть чуть светлее тон черного»; graphite since his T2 of 2026-10-05): the pause kept that veil (src/roles.js
// SHEET) until it became a pop-up too, the same day («пауза – это тоже поп-ап»: labs/graphics/pause-menu.js).
//
// The code is the page's (menus-ledger.js, which copied popups-v2.js's Q1 LEDGER with Q3 RULED's separators), its systems' switches
// fixed to LEDGER+'s; what the game adds is said where it stands: the hover eased as the pause's is, the keys and buttons noted for a
// click (labs/graphics/clicks.js), a window measured before it is placed (a dialog stands by its object: labs/graphics/context.js).
// The windows that wear it: the pilot card, a station's INFO, the hangar, the sign composer (labs/graphics/windows.js), an object's
// menu and an NPC's words (labs/graphics/context.js), the window about two tabs (labs/graphics/tabs-window.js); the pause keeps its
// own rows (labs/graphics/pause-menu.js). The find's notice is a banner, another kind (labs/graphics/rail.js).
import { CONFIG } from '../../src/config.js';
import { PALETTE, ROLES, WINDOW } from '../../src/roles.js';
import { UI, uiMetrics, uiAir, centredWindow } from '../../src/uiGrid.js';
import { hoverItem, hoverPace, pointerOver, screenBox, HOVER } from '../../src/hover.js';
import { keyName } from '../../src/controls.js';
import { MONEY_INK, drawCoin } from '../../src/money.js';
import { glyphs, px, fitText } from '../../src/util.js';
import { keycap, KEYCAP_PAD, KEYCAP_RISE } from './ui-parts.js';
import { noteKeycap, unnoted } from './clicks.js';
import { PAUSE_WINDOW } from './pause-menu.js';

// The inks a window writes in: the head and values white, labels gray, the quiet rows the hint's, what is not there yet quieter
// still, money the coin's rim gold.
export const W = ROLES.textPrimary;
export const G = ROLES.textSecondary;
export const H = ROLES.textHint;
export const QT = ROLES.textQuiet;
export const GOLD = MONEY_INK;

// ================================================================================================================================
// The tokens and the context a window is drawn in.
// ================================================================================================================================

export function tokensOf(r) {
  const m = uiMetrics(r), air = uiAir(r), cw = r.cellW;
  return {
    m, air, cw,
    I: air.I,                                   // an edge to the ink inside it, every side (uiAir's inset on whole px: 18)
    CAP: air.CAP,                               // the capitals' height, measured from the font
    GROUP: UI.group.rows * UI.row - air.CAP,    // text to text across a group: one blank row (P2's group step), ink to ink
    COL: UI.group.cols * cw,                    // a column to the next: the group's four columns
    RULED: 2 * air.RA + 1,                      // a group to the next across a hairline: the rule's air over and under it
    UPRIGHT: 2 * air.I + 1,                     // a column to the next across an upright hairline: a container's inset each side
    MARK: UI.pad,                               // a chosen thing's mark off its ink: a mark and its own ink
    RULE: air.RA,                               // a picture to its caption; a hairline to the text over and under it
    DIM: PAUSE_WINDOW.dim,                      // the rest under a hover (P2, S5's H2)
  };
}

// The context a window is drawn in: its tokens, its renderer, the thing under the pointer kept for last.
// `id`: the window's (its hovers' ids are under it, and its dimming eases on its own); `live`: its things answer the pointer (a window
// going away, or shown and not used, answers nothing: labs/graphics/context.js).
const dims = new Map();
export function ledger(r, { id = 'window', live = true } = {}) {
  const t = tokensOf(r);
  const ui = { ...t, r, base: r, id, live, deferred: null, windows: [], boxes: new Map() };
  ui.rowTop = (inkTop) => inkTop - (t.m.textY + t.m.capTop);
  ui.capMid = (rowTop) => rowTop + t.m.textY + (t.m.capTop + t.m.capBottom) / 2;
  // A thing that answers the pointer (`key` its name in the window, `box` its box as laid out): drawn now, or, while the pointer
  // is on it, kept for last (drawn over the rest dimmed, grown, src/hover.js). `draw(on)`: `on` lights its gray words white.
  ui.item = (key, box, draw, kind = 'button') => {
    if (key != null) ui.boxes.set(key, box);
    if (key == null || !ui.live) { draw(false); return; }
    const on = !ui.deferred && pointerOver(screenBox(r, box));
    if (on) ui.deferred = { key, box, draw, kind };
    else hoverItem(r, `${id}:${key}`, box, () => draw(false), { over: false, kind });
  };
  return ui;
}

// The thing under the pointer last: everything else in the window a step darker (P2's dim, eased in and out at the hover's own
// rate as the pause's is, so the dimming and the thing coming up go together), the thing grown as a button (src/hover.js). Returns
// its box, or null.
export function finish(ui) {
  const d = ui.deferred, r = ui.r, { dt, still } = hoverPace();
  const target = d ? 1 : 0, was = dims.get(ui.id) ?? 0;
  const now = still ? target : was + (target - was) * (1 - Math.exp(-Math.max(0, dt) * HOVER.rate));
  if (now > 0.004 || target) dims.set(ui.id, now); else dims.delete(ui.id);
  if (now > 0.004) for (const w of ui.windows) r.fill(w.x, w.y, w.w, w.h, ROLES.backing, ui.DIM * now);
  if (!d) return null;
  hoverItem(r, `${ui.id}:${d.key}`, d.box, () => d.draw(true), { over: true, kind: d.kind });
  return d.box;
}

// ---- words ------------------------------------------------------------------------------------------------------------------

export const len = (s) => glyphs(String(s ?? '')).length;
export const partsLen = (parts) => (parts ?? []).reduce((n, p) => n + len(p[0]), 0);
export const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - len(s)));
// `parts`: [[text, ink]] from a text origin; a part that starts with ¤ is money (the coin's sign, src/money.js drawCoin, the amount in
// the rim's gold). Under the pointer the gray words light white, as P2's do. Returns the origin past the last part.
export function drawParts(ui, parts, origin, rowTop, on = false) {
  const { r, cw, m } = ui;
  let x = origin;
  for (const [s, ink] of parts ?? []) {
    const str = String(s);
    if (str.startsWith('¤')) {
      drawCoin(r.ctx, x + cw / 2, ui.capMid(rowTop));
      if (str.length > 1) r.text(str.slice(1), x + cw, rowTop + m.textY, GOLD);
    } else if (str.trim()) r.text(str, x, rowTop + m.textY, on && (ink === G || ink === H || ink === QT) ? W : ink);
    x += len(str) * cw;
  }
  return x;
}
export const money = (n, format = String) => `¤ ${format(n)}`;
// The pilot card's leader: a dot every other cell counted from the value, a free cell at both ends (src/uiGrid.js leader).
function leaders(ui, a, b, rowTop) {
  for (let lx = b - 2 * ui.cw; lx >= a + ui.cw - 0.01; lx -= 2 * ui.cw) ui.r.text('.', lx, rowTop + ui.m.textY, CONFIG.hud.hint);
}

// A chosen thing's mark: a white hairline square `MARK` off it (the pause's square).
export function selectMark(ui, box, off = ui.MARK) {
  const ctx = ui.r.ctx;
  ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = W; ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.rect(px(box.x - off), px(box.y - off), Math.round(box.w + 2 * off) - 1, Math.round(box.h + 2 * off) - 1); ctx.stroke();
  ctx.restore();
}
export function hairline(ui, box, ink = W) {
  const ctx = ui.r.ctx;
  ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.rect(px(box.x), px(box.y), Math.round(box.w) - 1, Math.round(box.h) - 1); ctx.stroke(); ctx.restore();
}

// ---- rows ---------------------------------------------------------------------------------------------------------------------
// A ledger's row (P2): `l` its parts at the left, `r` at the right, `lead` dots between, `step` a choice of several ({ value,
// count }: ‹ VALUE ›, S2), `more` a › (it opens a page), `dot` something new (P2's green dot in the inset), `id` a button (the whole
// row), `extra(x, rowTop, on)` drawn over it.
function rowCols(rw) {
  if (!rw) return 0;
  return partsLen(rw.l) + (rw.r ? UI.line.cols + partsLen(rw.r) : 0) + (rw.more ? UI.line.cols : 0)
    + (rw.step ? UI.line.cols + len(rw.step.value) + 4 + (rw.step.count ? len(rw.step.count) + 1 : 0) : 0);
}
function paintRow(ui, rw, x, inkTop, w) {
  const { r, m, cw } = ui, top = ui.rowTop(inkTop);
  const box = { x, y: top, w, h: UI.row };
  const draw = (on) => {
    const end = drawParts(ui, rw.l, x - m.capLeft, top, on);
    let right = x + w + m.capLeft;
    if (rw.more) { right -= cw; r.text('›', right, top + m.textY, on ? W : G); right -= cw; }
    if (rw.step) {
      const { value, count } = rw.step, n = len(value) + 4, o = right - n * cw;
      r.text('‹', o, top + m.textY, on ? W : H); r.text(value, o + 2 * cw, top + m.textY, W); r.text('›', o + (n - 1) * cw, top + m.textY, on ? W : H);
      right = o;
      if (count) { right -= (len(count) + 1) * cw; r.text(count, right, top + m.textY, on ? G : H); }
    }
    if (rw.r) { right -= partsLen(rw.r) * cw; drawParts(ui, rw.r, right, top, on); }
    if (rw.lead) leaders(ui, end, right, top);
    if (rw.dot) r.fill(Math.round(x - ui.I / 2 - UI.pad / 2), Math.round(ui.capMid(top) - UI.pad / 2), UI.pad, UI.pad, PALETTE.green);
    rw.extra?.(x, top, on);
  };
  if (rw.id) ui.item(rw.id, box, draw); else draw(false);
}

// ---- the layout's nodes --------------------------------------------------------------------------------------------------------
// A leaf has its ink's size and paints from its ink's top left (`kind`: 'text' rows, 'box' a picture or a grid, 'keys' a row of
// keycaps); a col stacks, a row sets side by side; a sec is a group: a hairline stands between two groups.
export const col = (...items) => ({ dir: 'col', items: items.flat().filter(Boolean) });
export const row = (...items) => ({ dir: 'row', items: items.flat().filter(Boolean) });
export const sec = (child, extra = {}) => (child ? { sec: child, ...extra } : null);
export const leaf = (kind, w, h, paint, extra = {}) => ({ leaf: kind, w, h, paint, ...extra });
// Rows of text, `cols` wide (else as wide as the widest); a null is a blank row.
export function lines(ui, rows, cols = null) {
  const n = rows.length, w = (cols ?? Math.max(0, ...rows.map(rowCols))) * ui.cw;
  return leaf('text', w, (n - 1) * UI.row + ui.CAP, (x, y, ww) => rows.forEach((rw, k) => { if (rw) paintRow(ui, rw, x, y + k * UI.row, ww); }));
}
// A row of keycaps (labs/graphics/ui-parts.js keycap) and their words: each a button that answers a click as its key (the cap and its
// words, labs/graphics/clicks.js). `items`: [{ key, words: parts, id, dim }].
// A `quiet` item is said, not pressed (the keys of a field being typed in): it answers neither a click nor the pointer.
export function keysLeaf(ui, items) {
  const { r, cw } = ui, gap = UI.line.cols * cw;
  const itemW = (it) => KEYCAP_PAD + (len(it.key) + 1 + partsLen(it.words)) * cw;
  const w = items.reduce((s, it) => s + itemW(it), 0) + gap * (items.length - 1), h = r.cellH + KEYCAP_RISE + 1;
  return leaf('keys', w, h, (x, y) => {
    const textTop = y + KEYCAP_RISE;
    let cx = x;
    for (const it of items) {
      const x0 = cx, iw = itemW(it), box = { x: x0, y, w: iw, h };
      const draw = (on) => {
        const next = keycap(r, it.key, x0 + KEYCAP_PAD, textTop, { reach: 0, ink: it.dim && !on ? G : W });
        drawParts(ui, it.words, next, textTop - ui.m.textY, on);
      };
      if (it.quiet) unnoted(() => draw(false));
      else {
        if (ui.live) noteKeycap(it.key, box, 0, ui.base);
        ui.item(it.id ?? `key:${it.key}`, box, draw);
      }
      cx += iw + gap;
    }
  });
}
// A foot key by its action (src/controls.js names its key): `words` a string in the label's gray, or parts.
export const key = (action, words, extra = {}) => ({ key: keyName(action) || action, words: typeof words === 'string' ? [[words, G]] : words, id: `key:${action}`, ...extra });

const plated = (n) => !!n && (!!n.sec || (n.items ?? []).some(plated));
const edgeOf = (ui, n, end) => (n.leaf ? n.leaf : n.sec ? edgeOf(ui, n.sec, end)
  : n.dir === 'col' ? edgeOf(ui, end === 'first' ? n.items[0] : n.items.at(-1), end) : 'box');
// The air between two neighbours: across a hairline between two groups (a group's rule, a column's upright); across, a column;
// down, a group's blank row between rows of text, else the inset (a container's edge to what is next: uiAir). A node may name its
// own (`gap`, `gapBefore`).
const ruledBetween = (a, b) => plated(a) && plated(b);
function gapsOf(ui, n) {
  return n.items.slice(1).map((b, i) => {
    const a = n.items[i];
    if (ruledBetween(a, b)) return n.dir === 'col' ? ui.RULED : ui.UPRIGHT;
    if (b.gapBefore != null) return b.gapBefore;
    if (n.gap != null) return n.gap;
    if (n.dir === 'row') return ui.COL;
    return edgeOf(ui, a, 'last') === 'text' && edgeOf(ui, b, 'first') === 'text' ? ui.GROUP : ui.I;
  });
}
export function sizeOf(ui, n) {
  if (n.size) return n.size;
  let s;
  if (n.leaf) s = { w: n.w, h: n.h };
  else if (n.sec) s = { ...sizeOf(ui, n.sec) };
  else {
    const kids = n.items.map((k) => sizeOf(ui, k)), gaps = gapsOf(ui, n).reduce((t, g) => t + g, 0);
    s = n.dir === 'col' ? { w: Math.max(0, ...kids.map((k) => k.w)), h: kids.reduce((t, k) => t + k.h, 0) + gaps }
      : { w: kids.reduce((t, k) => t + k.w, 0) + gaps, h: Math.max(0, ...kids.map((k) => k.h)) };
  }
  n.size = s;
  return s;
}
// Places `n` with its ink's top left at (x, y), `w` wide (a col's children take its width: right-aligned words end at one edge),
// `h` tall (a row's height, for its uprights). The hairlines in the card's rule ink (CONFIG.hud.hint), in the middle of their gap.
function place(ui, n, x, y, w = null, h = null) {
  const s = sizeOf(ui, n);
  if (n.leaf) return n.paint(x, y, w ?? s.w, h ?? s.h);
  if (n.sec) return place(ui, n.sec, x, y, w, h);
  const gaps = gapsOf(ui, n), r = ui.r, cw = w ?? s.w, ch = h ?? s.h;
  let at = n.dir === 'col' ? y : x;
  n.items.forEach((k, i) => {
    const ks = sizeOf(ui, k), next = n.items[i + 1], ruled = next && ruledBetween(k, next);
    if (n.dir === 'col') {
      place(ui, k, x, at, n.stretch === false ? null : cw, null);
      if (ruled) r.fill(Math.round(x), Math.round(at + ks.h + ui.RULE), Math.round(cw), 1, CONFIG.hud.hint);
      at += ks.h + (gaps[i] ?? 0);
    } else {
      place(ui, k, at, y, null, ch);
      if (ruled) r.fill(Math.round(at + ks.w + ui.I), Math.round(y), 1, Math.round(ch), CONFIG.hud.hint);
      at += ks.w + (gaps[i] ?? 0);
    }
  });
}

// ---- a window --------------------------------------------------------------------------------------------------------------------
// `spec`: { title, subject (words at the head's right), sub (the head's second row), mark and ink with `titleMark` (the kind's mark
// before the title: the two-tabs window), tree (what it holds), keys (the foot: keycap buttons), note ({ text, ink }: the last
// action's words at the foot's right end, cut to the room the keys leave), head (false: none), footGap }. Laid out first
// (`layoutWindow`: its size), then painted at a place (`paintWindow`); `drawWindow` does both, centred as every centred window is
// (src/uiGrid.js centredWindow) unless `at(w, h)` says where its top left goes.
function headLeaf(ui, spec) {
  const title = [...(spec.titleMark ? [[spec.mark, spec.ink], [' ', W]] : []), [spec.title, W]];
  const subject = typeof spec.subject === 'string' ? [[spec.subject, G]] : spec.subject ?? null;
  const second = spec.sub ?? null;
  const head = second ? [{ l: title, r: subject }, { l: typeof second === 'string' ? [[second, G]] : second }] : [{ l: title, r: subject }];
  return lines(ui, head);
}
function noted(ui, keys, note) {
  if (!note?.text) return keys;
  return leaf('keys', keys.w, keys.h, (x, y, w) => {
    keys.paint(x, y);
    const room = Math.floor((w - keys.w) / ui.cw) - UI.group.cols;
    if (room < 4) return;
    const text = fitText(note.text, room);
    ui.r.text(text, x + w + ui.m.capLeft - len(text) * ui.cw, y + KEYCAP_RISE, note.ink ?? W);
  });
}
export function layoutWindow(ui, spec) {
  const head = spec.head === false ? null : headLeaf(ui, spec);
  const foot = spec.keys?.length ? noted(ui, keysLeaf(ui, spec.keys), spec.note) : null;
  if (foot && spec.footGap != null) foot.gapBefore = spec.footGap;
  const root = col(sec(head), spec.tree, sec(foot));
  const s = sizeOf(ui, root), I = ui.I;
  return { root, head, w: Math.round(s.w + 2 * I), h: Math.round(s.h + 2 * I) };
}
// The sheet, its white frame on the box's own edge (a 1 px line inside it: the inset is measured from the box's edge, as for every
// window whose edge is its box, src/uiGrid.js uiAir), then what it holds.
export function paintWindow(ui, laid, x, y) {
  const box = { x: Math.round(x), y: Math.round(y), w: laid.w, h: laid.h };
  ui.r.fill(box.x, box.y, box.w, box.h, ROLES.backing);
  hairline(ui, box, WINDOW.frame);
  ui.windows.push(box);
  place(ui, laid.root, box.x + ui.I, box.y + ui.I, box.w - 2 * ui.I);
  return box;
}
export function drawWindow(ui, spec, at = null) {
  const laid = layoutWindow(ui, spec);
  const p = at ? at(laid.w, laid.h) : centredWindow(ui.r, laid.w, laid.h);
  return paintWindow(ui, laid, p.x, p.y);
}
// The head's first row in a window drawn at `box`: its row's top, and the origin its title's text is drawn from.
export const headRow = (ui, box) => ({ top: ui.rowTop(box.y + ui.I), origin: box.x + ui.I - ui.m.capLeft });

// A grid of cells (souvenir tiles, ships): rows of `per`.
export function grid(ui, cells, per, gapX, gapY) {
  const rows = [];
  for (let i = 0; i < cells.length; i += per) {
    const r0 = row(cells.slice(i, i + per).map((c) => c.node));
    r0.gap = gapX;
    rows.push(r0);
  }
  const g = col(rows);
  g.gap = gapY;
  return g;
}
