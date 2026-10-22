// SHUTTLE BLUES, the title as SX set it on the study (the title-styles study, 2026-10-02; the study deleted 2026-10-04): «Смотри берем
// такое направление, нам нужен противовес на выбранном типе селектора справа иначе визуально выглядит не по центру с
// центральной выключкой, также убери пробелы в тройном многоточии чтобы визуально все смотрелось выключено по центру
// экрана, проследи за этим подготовь html файл который я потом загружу как титульник», then of the plate's side blocks:
// «стрелки не надо рисовать в них, можешь сделать их поуже ... именно цветные боковые блоки».
//
// What it is, read from SX's screen (1800 x 1046): the lettering T2 TUBE (sketches/title-styles-marks.js) in the DUSK roll
// of seed 853762588 (hue 277), SHUTTLE over BLUES, SHUTTLE's ink 60.7 % of the screen's width (×1.30 there); the
// game's stars as the title has them (title.js drawTitleSky), without its planets and rocks (SX: «давай звезды оставим
// наши, но объекты уберем»); the menu NEW GAME, CONTINUE, MANUAL,
// CREDITS (SAVES dropped: «раздела saves точно не будет»), centred, 32 px apart, the chosen item on the cargo plate F
// with a narrow coloured block on either side and no mark; the lore centred at 14 px on 80 columns (13 until SX's «кегль лора сделать +1», 2026-10-16), its first line
// «The year is 3000...»; the loading strip, its labels and the keycaps under it, the strip and the keycaps' frames in
// the lettering's accent.
//
// Where things stand, as a rule rather than in px (SX's screen showed it: about 115 px of air over the lettering, under
// it and under the menu): the lore's last line `group` (40 px) over the strip's labels; the lettering, the menu and the
// lore stacked above it with equal air between the screen's top, each of them and the next. Everything is centred on
// the screen's axis by its ink: the lettering's words each in its box, each item and each line by its own width, the
// chosen item's plate by its two blocks. A screen too short for the stack takes the lettering down until the air is
// at least `minAir`.
//
// Drawing only, as title.js: the state is a plain object the caller keeps (createTitleFinal), advanced with the real
// load (advanceTitleFinal) and the keys or the pointer (titleFinalKey, titleFinalPick); `onChoose` is the caller's.
import { UI, uiMetrics } from '../../src/uiGrid.js';
import { CONFIG } from '../../src/config.js';
import { Starfield } from '../../src/starfield.js';
import { STAR_ROLES, STAR_LIFT } from './world-art.js';
import { labStyle } from './style.js';
import { keptDraw } from '../../src/grade.js';
import { ROLES } from '../../src/roles.js';
import { keycap, haloText } from './ui-parts.js';
import { STORY, ESSENTIALS, wrapCopy } from './title.js';
import { titleMotion, loreLineFrame } from './title-motion.js';
import { FLAP, FLAP_BUILD, washOf } from './notice.js';
import { TUBE, tubeMark, rollScheme, uiInks, RULES } from './sketches/title-styles-marks.js';
import { noise3 as noise } from '../../src/util.js';
import { tr } from '../../src/lang.js';

export const TITLE_FINAL = Object.freeze({
  seed: 853762588,                                  // DUSK, hue 277: the lettering's colours, rolled on the study
  lettering: Object.freeze({ width: 0.607, align: 'centre' }),
  lore: Object.freeze({ size: 14, cols: 80, first: 'The year is 3000...' }),
  menu: Object.freeze({
    step: 32,
    items: Object.freeze([
      Object.freeze({ id: 'new', label: 'NEW GAME' }), Object.freeze({ id: 'continue', label: 'CONTINUE' }),
      Object.freeze({ id: 'manual', label: 'MANUAL' }), Object.freeze({ id: 'credits', label: 'CREDITS' }),
    ]),
  }),
  // The plate's coloured blocks, either side, px (the cargo plate's is 14; SX: «поуже»).
  block: 6,
  minAir: 28,
});
// In the interface's own blue (SX, 2026-10-03: «мне не нравится, в какой цвет покрашены цветные элементы ... на титульном
// скрине. Я хочу, чтобы они были ... цвета, который вот на интерфейсе ... приборной панели, какого цвета дым, какого цвета
// оттенки астероидов»): the roll of the study's seed (DUSK, hue 277, a lavender) at the hue of the palette's blue, #4980AF,
// 246 in OKLCH, the blue the cockpit's lines, the rocks and the edge's fog are drawn in; its lightnesses and chromas as they
// were. The worn look then paints it as it paints the cockpit (src/grade.js), so the title is the game's colour in every look.
const TITLE_HUE = 246;
const TITLE_COLORS = Object.freeze(rollScheme(TUBE, TITLE_FINAL.seed, { hue: TITLE_HUE }).colors);
const TITLE_INKS = Object.freeze(uiInks(TUBE, TITLE_COLORS));
// The lore as it is drawn: the story with its first line closed up.
const TITLE_LORE = Object.freeze([TITLE_FINAL.lore.first, ...STORY.slice(1)]);

// The title's state. `save`: there is a game to continue (CONTINUE can be chosen, and is chosen first).
export function createTitleFinal({ reducedMotion = false, save = true } = {}) {
  return { active: true, ready: false, progress: 0, label: '', reducedMotion, readyAt: null, openedAt: null,
    save, menu: 0, choseAt: 0, message: null, skyPointer: { x: 0, y: 0 } };
}
const items = () => TITLE_FINAL.menu.items;
const titleItemEnabled = (title, k) => !!items()[k] && !(items()[k].id === 'continue' && !title.save);
function firstChoice(title) {
  const cont = items().findIndex((it) => it.id === 'continue');
  if (title.save && cont >= 0) return cont;
  return Math.max(0, items().findIndex((_, k) => titleItemEnabled(title, k)));
}

// One frame of the load: `plan` { progress, label, done }. Returns whether it became ready now.
export function advanceTitleFinal(title, plan, now = 0) {
  title.progress = plan.progress;
  title.label = plan.label;
  if (plan.done && !title.ready) {
    title.ready = true; title.readyAt = now; title.menu = firstChoice(title); title.choseAt = now + 700;
    return true;
  }
  return false;
}

// ----------------------------------------------------------------------------------------------------- layout

function loreType(r, size) {
  const k = size / r.fontSize, cap = r.capInk();
  return { size, font: `${size}px ${r.fontFamily}`, cw: r.cellW * k, row: Math.round(UI.row * k), para: Math.round(UI.space.rows * UI.row * k),
    capTop: cap.capTop * k, capBottom: cap.capBottom * k, capH: (cap.capBottom - cap.capTop) * k };
}

// Every place on the screen, from its size alone.
function titleFinalLayout(r) {
  const W = r.width, H = r.height, m = uiMetrics(r), cap = r.capInk(), cw = r.cellW;
  const ink = { capTop: cap.capTop, capBottom: cap.capBottom, capH: cap.capBottom - cap.capTop };
  const edge = W < 900 ? 32 : 48;
  const bar = { x: edge, y: H - 76, w: W - edge * 2, h: 4, pitch: 144, gap: 3 };
  const clearance = 23;
  const labelTop = Math.round(bar.y - clearance - ink.capBottom);
  const keysTop = Math.round(bar.y + bar.h + clearance - ink.capTop);
  const floor = labelTop + ink.capTop - UI.group.rows * UI.row;          // the lore's last ink stands here

  const T = loreType(r, TITLE_FINAL.lore.size);
  const cols = Math.min(TITLE_FINAL.lore.cols, Math.floor((W - edge * 2) / T.cw));
  const paras = TITLE_LORE.map((p) => wrapCopy(tr(p), cols));
  const lines = paras.reduce((n, p) => n + p.length, 0);
  const loreH = (lines - 1) * T.row + (paras.length - 1) * T.para + T.capH;
  const step = TITLE_FINAL.menu.step, menuH = (items().length - 1) * step + ink.capH;

  // The lettering: SHUTTLE as wide as the rule's share, less if the stack would leave too little air.
  const base = Math.min(W * RULES.width, RULES.maxWidth);
  let scale = Math.round(W * TITLE_FINAL.lettering.width / base * 100) / 100, M;
  for (let pass = 0; pass < 4; pass++) {
    M = tubeMark(W, r, { scale, align: TITLE_FINAL.lettering.align });
    const air = (floor - M.ink.h - menuH - loreH) / 3;
    if (air >= TITLE_FINAL.minAir) break;
    const room = floor - menuH - loreH - 3 * TITLE_FINAL.minAir;
    scale = Math.max(0.3, Math.floor(scale * Math.max(0.3, room / M.ink.h) * 100) / 100);
  }
  const air = (floor - M.ink.h - menuH - loreH) / 3;
  const logoTop = Math.round(air), menuInk = Math.round(air + M.ink.h + air), loreInk = Math.round(floor - loreH);
  // The lettering's ink (not its box) on the axis: its words are centred in the box to a cell, the whole to a px.
  const markX = Math.round(W / 2 - (M.ink.x + M.ink.w / 2)), boxLeft = markX + M.box.x;
  return {
    W, H, m, ink, edge, bar, labelTop, keysTop, floor, air, M, scale,
    mark: { x: markX, y: logoTop - M.ink.y },
    logo: { x: boxLeft, y: logoTop, w: M.box.w, h: M.ink.h },
    menu: { top: menuInk - ink.capTop, step, h: menuH },
    lore: { top: loreInk - T.capTop, T, paras, cols, h: loreH },
    // Where each item answers a pointer: a step tall, as wide as the widest item's plate.
    items: items().map((it, k) => {
      const w = plateWidth(r, Math.max(...items().map((i) => Array.from(tr(i.label)).length)));
      return { x: Math.round(W / 2 - w / 2), y: menuInk - ink.capTop + k * step - (step - UI.row) / 2 - m.textY, w, h: step };
    }),
  };
}

// ----------------------------------------------------------------------------------------------------- the plate

// The cargo plate F (notice.js drawFlap: the same pitch, air, wash, grid and square-by-square coming), for one label,
// with a coloured block on either side instead of the strip and its mark on the left, so its middle is the label's.
const HEX = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%+/×-';
function plateWidth(r, n) {
  const pitch = r.cellW + 2;
  return 2 * TITLE_FINAL.block + 2 * FLAP.hair + 2 * Math.round(FLAP.pad * pitch) + n * pitch;
}
const drawTitlePlateCentred = keptDraw(function drawTitlePlateCentred(r, label, cx, top, { age = 1e6, instant = false, ink }) {
  const m = uiMetrics(r), cw = r.cellW, pitch = cw + 2, rowH = UI.row + 2 * UI.pad, half = Math.floor(rowH / 2);
  const chars = Array.from(label), n = chars.length, block = TITLE_FINAL.block, hair = FLAP.hair;
  const padW = Math.round(FLAP.pad * pitch), panelW = 2 * padW + n * pitch, width = plateWidth(r, n);
  const x0 = Math.round(cx - width / 2), px = x0 + block + hair;
  const edges = [px, ...Array.from({ length: n + 1 }, (_, i) => Math.round(px + padW + i * pitch)), px + panelW];
  const cols = edges.length - 1, squares = [];
  const add = (col, x, w, h) => {
    const along = (col + 1) / (cols + 1);
    squares.push({ col, h, x, w, y: top + (h ? half : 0), height: h ? rowH - half : half,
      rank: (1 - FLAP_BUILD.spread) * along + FLAP_BUILD.spread * noise(col + 7, h, 3) });
  };
  for (let h = 0; h < 2; h++) {
    add(-1, x0, block, h);
    for (let c = 0; c < cols; c++) add(c, edges[c], edges[c + 1] - edges[c], h);
    add(cols, px + panelW + hair, block, h);
  }
  const shown = new Set(), wash = washOf(ink);
  for (const sq of squares) {
    if (!instant && age < sq.rank * FLAP_BUILD.in) continue;
    shown.add(`${sq.col},${sq.h}`);
    if (sq.col < 0 || sq.col === cols) { r.fill(sq.x, sq.y, sq.w, sq.height, ink); continue; }
    r.fill(sq.x, sq.y, sq.w, sq.height, ROLES.backing, FLAP.back);
    if (wash) r.fill(sq.x, sq.y, sq.w, sq.height, wash, FLAP.wash); else r.fill(sq.x, sq.y, sq.w, sq.height, ink, FLAP.tint);
  }
  chars.forEach((ch, i) => {
    const col = i + 1;
    if (!shown.has(`${col},0`) || !shown.has(`${col},1`)) return;
    const came = squares.find((sq) => sq.col === col && sq.h === 1).rank * FLAP_BUILD.in;
    const settle = Math.max(came + 0.1, 0.08 + i * 0.028);
    const c = !instant && age < settle ? HEX[Math.floor(noise(i, 0, Math.floor(age / 0.045)) * HEX.length)] : ch;
    if (c !== ' ') r.text(c, edges[col] + (pitch - cw) / 2, top + UI.pad + m.textY, ROLES.textPrimary);
  });
  // The grid over the panel's squares: a seam at the left of every letter and after the last, the hinge across.
  for (const sq of squares) {
    if (sq.col < 0 || sq.col === cols || !shown.has(`${sq.col},${sq.h}`)) continue;
    if (sq.col >= 1 && sq.col <= n + 1) r.fill(sq.x, sq.y, 1, sq.height, ROLES.backing, FLAP.grid);
    if (sq.h === 1) r.fill(sq.x, sq.y, sq.w, 1, ROLES.backing, FLAP.grid);
  }
  return { x: x0, y: top, w: width, h: rowH };
});

// ----------------------------------------------------------------------------------------------------- the sky

// The game's title stars, as title.js drawTitleSky draws them (its three layers in the sky's three inks, the twinkle,
// the slow camera that leans with the pointer, the small blue halo, no stars under the lettering, the lore and the
// footer), and nothing else: no planets, no rocks.
let stars = null;
function drawStars(r, title, now, zones) {
  if (!stars) {
    stars = new Starfield();
    stars.layers.forEach(({ stars: list }, i) => list.forEach((star) => { star.color = STAR_ROLES[i]; }));
  }
  stars.layers.forEach((layer, i) => {
    layer.cfg = { ...CONFIG.starfield.layers[i], alpha: Math.min(1, CONFIG.starfield.layers[i].alpha * (labStyle.sky / 100) * STAR_LIFT[i]),
      twinkle: [0.12, 0.42, 0.66][i] };
  });
  const t = title.reducedMotion ? 0 : now / 1000;
  const pointer = title.reducedMotion ? { x: 0, y: 0 } : (title.skyPointer ?? { x: 0, y: 0 });
  stars.draw(r, t * 9 + pointer.x * 80, t * 2 + pointer.y * 55, t, zones);
  r.ctx.save(); r.ctx.shadowColor = ROLES.structure; r.ctx.shadowBlur = 6;
  r.flush(); r.ctx.restore();
}

// ----------------------------------------------------------------------------------------------------- drawing

// How far a line's ink stands off its cells' middle, px (a monospace cell is wider than most glyphs: a line ending in
// a dot has its ink end short of its last cell). Measured once per font and line; a line is centred by its ink.
const inkShift = new Map();
function inkOffset(r, text, font) {
  const key = `${font}|${text}`;
  let d = inkShift.get(key);
  if (d === undefined) {
    const ctx = r.ctx;
    ctx.save(); ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const m = ctx.measureText(text), advance = m.width;
    ctx.restore();
    const left = -(m.actualBoundingBoxLeft ?? 0), right = m.actualBoundingBoxRight ?? advance;
    d = Number.isFinite(left) && Number.isFinite(right) && right > left ? (left + right) / 2 - advance / 2 : 0;
    inkShift.set(key, d);
  }
  return d;
}
// Where a line starts so its ink is centred on `cx`.
const centredX = (r, text, cx, cw, font) => cx - Array.from(text).length * cw / 2 - inkOffset(r, text, font);

function typeText(r, text, x, y, ink, T) {
  const ctx = r.ctx;
  ctx.font = T.font; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.globalAlpha = 1; ctx.fillStyle = ink;
  ctx.fillText(text, Math.round(x), Math.round(y));
  ctx.font = r.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
}
// An opaque backing behind a line of text (text over the sky stands on black; black on black, it shows only as the
// stars it hides).
const backing = (r, x, y, w, h) => r.fill(Math.round(x - UI.pad / 2), Math.round(y - 1), Math.round(w + UI.pad), Math.round(h + 2), ROLES.backing);

function drawLore(r, L, title, now, loreY) {
  const { T, paras } = L.lore, elapsed = title.reducedMotion ? Infinity : now - title.openedAt;
  let y = L.lore.top + loreY, row = 0;
  paras.forEach((lines, i) => {
    const ink = i === 0 || i === paras.length - 1 ? ROLES.textPrimary : ROLES.textSecondary;
    lines.forEach((line) => {
      const shown = loreLineFrame(line, row++, elapsed), w = Array.from(line).length * T.cw, x = centredX(r, line, L.W / 2, T.cw, T.font);
      backing(r, x, y, w, T.size);
      if (i === 0 && shown === line && line.endsWith('...')) {
        // The year's three dots, closed up; only their halo breathes (as the game's title).
        const date = line.slice(0, -3);
        typeText(r, date, x, y, ink, T);
        const ctx = r.ctx;
        ctx.save();
        ctx.shadowColor = ROLES.textPrimary;
        ctx.shadowBlur = title.reducedMotion ? 0 : 3 + 4 * (0.5 + 0.5 * Math.sin(now / 1000 * Math.PI / 2));
        typeText(r, '...', x + Array.from(date).length * T.cw, y, ink, T);
        ctx.restore();
      } else typeText(r, shown, x, y, ink, T);
      y += T.row;
    });
    y += T.para;
  });
}

function drawMenu(r, L, title, now) {
  if (title.readyAt === null) return;
  const elapsed = title.reducedMotion ? Infinity : now - title.readyAt, cw = r.cellW, settled = elapsed > 700;
  items().forEach((it, k) => {
    const label = tr(it.label), len = Array.from(label).length, y = L.menu.top + k * L.menu.step, x = Math.round(centredX(r, label, L.W / 2, cw, r.font));
    if (settled && k === title.menu) {
      drawTitlePlateCentred(r, label, L.W / 2, y - UI.pad - L.m.textY,
        { age: (now - title.choseAt) / 1000, instant: title.reducedMotion, ink: TITLE_INKS.accent });
      return;
    }
    const ink = !titleItemEnabled(title, k) ? ROLES.textQuiet : ROLES.textSecondary;
    backing(r, x, y, len * cw, r.cellH);
    r.text(loreLineFrame(label, k, elapsed), x, y, ink);
  });
}

function drawFooter(r, L, title, now) {
  const { bar } = L, cw = r.cellW, progress = title.ready ? 1 : Math.min(1, Math.max(0, title.progress || 0));
  haloText(r, tr(title.ready ? 'READY' : title.label ? `LOADING / ${title.label}` : 'LOADING'), bar.x, L.labelTop, ROLES.textSecondary);
  const pct = `${Math.floor(progress * 100).toString().padStart(3, '0')}%`;
  haloText(r, pct, bar.x + bar.w - pct.length * cw, L.labelTop, ROLES.textSecondary);
  if (title.message && now - title.message.at < 2400) {
    const t = tr(title.message.text);
    haloText(r, t, Math.round(L.W / 2 - Array.from(t).length * cw / 2), L.labelTop, ROLES.textPrimary);
  }
  r.fill(bar.x, bar.y, bar.w, bar.h, TITLE_INKS.track);
  if (progress > 0) r.fill(bar.x, bar.y, bar.w * progress, bar.h, TITLE_INKS.accent);
  const segments = Math.max(1, Math.round(bar.w / bar.pitch));
  for (let i = 1; i < segments; i++) r.fill(Math.round(bar.x + i * bar.w / segments) - bar.gap, bar.y, bar.gap, bar.h, ROLES.space);
  // The four controls in the game's keycaps, their frames in the lettering's accent.
  const essentials = ESSENTIALS.map(([k, d]) => [k, tr(d)]);
  const widths = essentials.map(([k, d]) => Array.from(k).length * cw + 6 + cw + Array.from(d).length * cw);
  const gap = UI.group.cols * cw, total = widths.reduce((a, b) => a + b, 0) + gap * (ESSENTIALS.length - 1);
  // The row's ink runs from the first cap's frame to the last word's last glyph: centred by that, not by its cells. A
  // word starts 3 px nearer its cap than `widths` counts (keycap: the cap's frame is 3 px each side of its letters), and
  // the last glyph's ink ends short of its cell.
  const lastWord = essentials.at(-1)[1], ctx = r.ctx;
  ctx.save(); ctx.font = r.font; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const lastRight = ctx.measureText(lastWord).actualBoundingBoxRight ?? lastWord.length * cw;
  ctx.restore();
  const inkW = total - 3 - (Array.from(lastWord).length * cw - lastRight);
  let x = (L.W - inkW) / 2;
  essentials.forEach(([key, what], i) => {
    const next = keycap(r, key, Math.round(x + 3), L.keysTop, { cap: TITLE_INKS.accent });
    r.text(what, next, L.keysTop, ROLES.textSecondary);
    x += widths[i] + gap;
  });
}

// One frame. `sky: false` leaves the sky out (for measuring the ink). Returns the layout.
export function drawTitleFinal(r, title, now, { sky = true } = {}) {
  if (title.openedAt === null) title.openedAt = now;
  const L = titleFinalLayout(r);
  if (sky) {
    const lore = { x: L.W / 2 - L.lore.cols * L.lore.T.cw / 2, y: L.lore.top, w: L.lore.cols * L.lore.T.cw, h: L.lore.h };
    const zones = [L.logo, lore].map((a) => ({ x: a.x - 20, y: a.y - 16, w: a.w + 40, h: a.h + 32 }));
    zones.push({ x: L.edge - 12, y: L.labelTop - 12, w: L.W - L.edge * 2 + 24, h: L.H - L.labelTop + 12 });
    drawStars(r, title, now, zones);
  }
  r.flush();
  const motion = titleMotion(title, now);
  TUBE.draw(r.ctx, L.M, Math.round(L.mark.x + motion.logoX), Math.round(L.mark.y + motion.logoY), now, TITLE_COLORS,
    { r, opened: title.openedAt, reducedMotion: title.reducedMotion });
  r.flush();
  drawLore(r, L, title, now, motion.loreY);
  drawMenu(r, L, title, now);
  drawFooter(r, L, title, now);
  r.flush();
  return L;
}

// ------------------------------------------------------------------------------------------------------ input

// A key on the title: ↑ ↓ (W S) move the choice, skipping what cannot be chosen; ENTER or SPACE choose. Returns the
// chosen item's id, or null.
export function titleFinalKey(title, code, now) {
  if (!title.ready) return null;
  const n = items().length;
  const move = (d) => {
    let k = title.menu;
    for (let s = 0; s < n; s++) { k = (k + d + n) % n; if (titleItemEnabled(title, k)) break; }
    if (k !== title.menu) { title.menu = k; title.choseAt = now; }
  };
  if (code === 'ArrowUp' || code === 'KeyW') move(-1);
  else if (code === 'ArrowDown' || code === 'KeyS') move(1);
  else if ((code === 'Enter' || code === 'Space') && titleItemEnabled(title, title.menu)) { title.choseAt = now; return items()[title.menu].id; }
  return null;
}
// The pointer over the title at (x, y): the item under it becomes the choice; `press` chooses it. Returns the id
// chosen, or null; `over` says whether an item is under the pointer (for the cursor).
export function titleFinalPick(title, L, x, y, now, press = false) {
  if (!title.ready) return { id: null, over: false };
  const k = L.items.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (k < 0 || !titleItemEnabled(title, k)) return { id: null, over: false };
  if (k !== title.menu) { title.menu = k; title.choseAt = now; }
  if (press) { title.choseAt = now; return { id: items()[k].id, over: true }; }
  return { id: null, over: true };
}

// The title's keys and pointer on the game's page (SX, 2026-10-02: «Добавь новый титульник»). `title` is the page's load
// state (title.js: active, shown, ready), `final` this title's state. While it waits, ↑ ↓ (W S) move the choice and ENTER or
// SPACE choose; a click chooses the item under it; the pointer hovers. Every press is first handed to `wake` (the sound a
// browser holds back starts inside a press), then answered: `choose(id)` is the page's. A repeat, or a press with Cmd, Ctrl or
// Alt (a shortcut, not a choice), is not the title's. `unproject` maps a pointer through the screen's curve (src/display.js),
// `layout()` is the layout last drawn, `clock()` the clock the title is drawn with.
export function bindTitleMenu({ window, canvas, title, final, input, choose, wake = null, unproject = (x, y) => ({ x, y }), layout, clock }) {
  const waiting = () => title.active && title.show && title.ready;
  const answer = (id) => {
    if (!id) return;
    input.down.clear();
    input.pressed.clear();
    choose(id);
  };
  window.addEventListener('keydown', (event) => {
    if (!waiting() || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    wake?.();
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Space'].includes(event.code)) event.preventDefault?.();
    answer(titleFinalKey(final, event.code, clock()));
  });
  const at = (event) => {
    const box = canvas.getBoundingClientRect();
    return unproject(event.clientX - box.left, event.clientY - box.top);
  };
  canvas.addEventListener('pointerdown', () => { if (waiting()) wake?.(); });
  canvas.addEventListener('pointermove', (event) => {
    const L = layout();
    if (!waiting() || !L) return;
    const p = at(event);
    canvas.style.cursor = titleFinalPick(final, L, p.x, p.y, clock()).over ? 'pointer' : '';
  });
  canvas.addEventListener('click', (event) => {
    const L = layout();
    if (!waiting() || !L) return;
    const p = at(event);
    answer(titleFinalPick(final, L, p.x, p.y, clock(), true).id);
  });
}
