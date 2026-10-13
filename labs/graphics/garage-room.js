// The garage's room as a window over the game (SX, 2026-10-01: «Когда в него докаешься, открывается вот эта иллюстрация.
// Таким попапом ... С каким-то небольшим отступом от края экрана ... 48 пикселей»; 2026-10-02, after playing it: «рамку давай делать
// черную и с острыми углами, или цвета космоса просто»). The room (garage-room-art.js, B2 NIGHT) fills a frame with square corners,
// as large as fits 48 px in from the screen's edges, its cells at whatever size that takes.
//
// Since chat G (2026-10-04) it is SX's PICK of labs/graphics/sketches/garage-interior.html (S5): I3 BLUE EMBER, X3 LINE SCROLL, H2
// GROW with everything else dimmed 10 %, no outline at all («избавимся вообще от черного контура ... при ховере белого контура нет»),
// the room's windows black with no outer frame and 18 px of air on every side, the quests on the Rail plates with their heading at the
// bottom («квест сделай как today но современные плейты и подписан заголовком не сверху, а снизу с кнопочкой»). The scene (the
// things cut out on layers of their own over the room without them, the palette, the depths) is garage-room-scene.js; here the room
// is laid out, drawn, pointed at and opened and closed. And SX's two words for item 15 (2026-10-04): «анимация появления интерьера
// должна быть черная, и когда открывается интерьер, фон под ним закрашивается стопроцентным черным со звездами, то есть чисто фон со
// звездами»: under the open room the screen is space's black and its stars, nothing else; opening, the screen goes to that black
// first, then the room comes up out of it along a sweep from a corner picked at random; closing, it goes down into it from another
// corner, faster, and the black lets the flight back. At the sweep's front each cell is the room with a black glyph of the
// respawn's `01/:·_` over it, flickering at its tick (SX, 2026-10-04: «анимация появления комнаты и анимация смены экрана после
// смерти должна быть черными символами а не цветными»; labs/graphics/respawn-fx.js REBOOT): ahead of the front the black, behind
// it the room. The cells used to come up out of the black in their own colours.
//
// SX's answers on the picks hub (2026-10-04): the room's keys in the sketch's words (LOOK AROUND, USE: src/controls.js roomControls); a
// click on a quest's plate selects that task, as in flight (src/tasks.js); under the pointer a thing lights over the rest dimmed 30 %
// («нужно при ховере на предмет затемнять сильнее фон»; 10 % before), and as one solid cut-out (garage-room-scene.js solidPiece).
//
// The still layers are drawn once into caches; what lives (the panes' stars, the screen's flicker, the ship passing the window) is
// redrawn into its own ten times a second. Reduced motion: no sweep, no lean, no grow.

import { UI, uiMetrics } from '../../src/uiGrid.js';
import { CONFIG } from '../../src/config.js';
import { installGrade, gradeEpoch } from '../../src/grade.js';
import { PALETTE, ROLES } from '../../src/roles.js';
import { ROOM_VARIANT, read, drawRoom } from './garage-room-art.js';
import { buildScene, buildPalette, InkCtx, visitorCells, layerDepth, rowDepth, LINE_SCROLL, ACTIVE, ORDER } from './garage-room-scene.js';
import { SOUVENIR_LORE } from './souvenir-lore.js';
import { SPECIALS } from '../../src/specialShips.js';
import { keyCodeOf, unnoted, noteKeycap } from './clicks.js';
import { keycap, KEYCAP_PAD } from './ui-parts.js';
import { swiss, SWISS, W as SW, G as SG, Q as SQ, bar, onBar, keycapAt, keycapWidth } from './swiss.js';
import { sheet, headRow, partCols, keyTokens } from './swiss-window.js';
import { drawRail, railSize } from './rail.js';
import { roomControls, keyName, DEFAULT_SCHEME } from '../../src/controls.js';
import { HOVER, hoverItem, hoverScale, pointerOver, screenBox } from '../../src/hover.js';
import { glyphs, mulberry32, clamp, inBox, noise3 } from '../../src/util.js';
import { currentQuests, questTone } from '../../src/quests.js';
import { clockText as runClock } from '../../src/contracts.js';
import { deliveryNavigation, questNavigation } from '../../src/navigation.js';
import { courseOf } from '../../src/course.js';
import { cargoTaskId, selectTask } from '../../src/tasks.js';
import { QUEST_TONES, bearingGlyph, seen } from './quest-list.js';
import { REBOOT } from './respawn-fx.js';

export const ROOM = Object.freeze({
  inset: 48,          // px from every edge of the screen, at most (the binding side; SX: 48 or 56, a multiple of 4)
  band: 2,            // px, the frame: a band of space's black round the room, square at the corners
  cols: 166,          // the room's cells across (B2)
  dark: 0.16,         // s the screen takes to go to space's black and its stars before the room comes (and to come back after)
  open: 0.5,          // s of the sweep coming in, plus `jitter` and `fade` for the last cell
  close: 0.36,        // s of the sweep going out
  jitter: 0.14,       // s: each cell early or late by up to this, by its own roll
  fade: 0.16,         // s a cell stands at the sweep's front, the room under a black glyph (coming up out of the black, or going down into it)
  live: 0.1,          // s between redraws of what lives
  wrap: 32,           // a window's widest line, in columns (the object's menu's, labs/graphics/context.js)
});
// The room's windows (SX's PICK): every window is space's black with no line round it, the inset's air on whole px (18) from its
// edge to its first and last ink on all four sides, measured on the ink; the room's edge to a window's edge the same; the things
// dimmed 30 % round the one under the pointer (SX, 2026-10-04: «затемнять сильнее»; the PICK's 10 % read too weak); the quests'
// plates UI.pad apart, their heading UI.air.rule under the last.
export const ROOM_LOOK = Object.freeze({ dim: 0.3, air: Math.round(UI.air.inset), gap: UI.pad, rule: UI.air.rule });
const easeAim = (u) => { const a = Math.min(1, Math.abs(u)); return Math.sign(u) * (0.5 * a + 0.5 * a * a * (3 - 2 * a)); };

// What each thing in the room says, and what a click on it does. A find is a souvenir (src/progression.js ids): its name
// and lore once found, else that it has not been. The ship passing (VISITOR) is not a thing to point at.
const THINGS = Object.freeze({
  CONSOLE: { souvenir: 'handheld' },
  CARTRIDGE: { souvenir: 'floppy' },
  MANGA: { souvenir: 'manga' },
  PHOTO: { souvenir: 'instant-photo' },
  TELEVISION: { souvenir: 'crt-monitor' },
  GAMEPAD: { souvenir: 'gamepad' },
  RADIO: { souvenir: 'mixtape' },
  FIGURE: { souvenir: 'figurine' },
  // HOME's terms by CONFIG.home (Codex's text pass UI-01): the crane is free up to its share of the whole hull, then by the point.
  CRATE: { title: 'SPARE PARTS', text: `Repair stock for the berth crane. Free repairs up to ${Math.round(CONFIG.home.freeShare * 100)}% hull; then ${CONFIG.home.repairPrice} CR per hull point.` },
  ARMCHAIR: { title: 'ARMCHAIR', text: 'Click to open your pilot card.', action: 'pilot' },
  // The shuttle: the ship's choice (SX, 2026-10-13: «клик по кораблю ведет на выбор корабля»); the way out is LEAVE GARAGE, ESC.
  SHIP: { title: 'YOUR SHUTTLE', text: 'Click to change your starship.', action: 'hangar' },
  // The filing cabinet: the notes the reference ships leave when their quest is done (src/specials.js; SX, 2026-10-02: «памятную
  // записку какую-то оставлять, которая в гараже можно читать ... от их лица»). Pointing at it reads one; a click turns
  // to the next.
  CABINET: { notes: true, action: 'notes' },
});
// What a thing's window names on its action's row (SX's PICK: a thing that does something says it there, and its «Click to ...»
// sentence goes; the cabinet keeps its note, which is what it holds).
const ACTIONS = Object.freeze({ ARMCHAIR: 'PILOT CARD', SHIP: 'CHANGE STARSHIP', CABINET: 'NEXT NOTE' });

// ---- the art: read once, from the painted room ---------------------------------------------------------------------

let scene = null, loading = null;
export const roomReady = () => !!scene;
const SKETCH_URL = new URL('../../art and references/garage/interior-room-2026-10-01.webp', import.meta.url);
const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = url;
});
// The painted room, read into cells, and taken apart into its things by SX's line drawing of it (garage-room-scene.js).
export function loadRoomArt(url = new URL('../../art and references/garage/interior-room-color-2026-10-01.webp', import.meta.url)) {
  if (scene || loading) return loading ?? Promise.resolve(scene);
  loading = Promise.all([loadImage(url), loadImage(SKETCH_URL)]).then(([img, drawing]) => {
    const s = read(img, ROOM.cols);
    const sc = buildScene(s, drawing);
    sc.palette = buildPalette(sc);
    // Where the pointer parks on each thing (the keyboard's focus, labs/graphics/key-focus.js, parks on a thing's box's middle): the
    // middle of its own cell nearest the middle of its box, so a parked pointer is on the thing itself.
    sc.anchors = new Map(ACTIVE.map((id) => {
      const l = sc.layers.get(id), b = l.thingBox, mi = (b.i0 + b.i1 + 1) / 2, mj = (b.j0 + b.j1 + 1) / 2;
      let best = null, d = Infinity;
      for (const k of l.own) { const i = k % sc.cols, j = (k - i) / sc.cols, dd = (i + 0.5 - mi) ** 2 + (j + 0.5 - mj) ** 2; if (dd < d) { d = dd; best = { i: i + 0.5, j: j + 0.5 }; } }
      return [id, best ?? { i: mi, j: mj }];
    }));
    scene = sc;
    return scene;
  });
  return loading;
}

// ---- state ---------------------------------------------------------------------------------------------------------

export function createRoom() {
  return { open: false, openedAt: 0, closingAt: null, dir: 0, dirOut: 1, instant: false, focus: null, pointer: null,
    lean: { at: { x: 0, y: 0 }, v: { x: 0, y: 0 } }, hov: new Map(), drawnAt: null, caches: null, cacheKey: '', liveAt: -1,
    hits: { things: [] }, plates: [], note: 0 };
}
// The notes the pilot holds, in the ships' order: [{ id, title, text }].
export const notesOf = (world) => SPECIALS.filter((sp) => world?.pilot?.notes?.has(sp.id)).map((sp) => ({ id: sp.id, ...sp.note }));
// The next note to read (a click on the cabinet); returns how many there are.
export function nextNote(room, world) {
  const n = notesOf(world).length;
  room.note = n ? ((room.note ?? 0) + 1) % n : 0;
  return n;
}
export function openRoom(room, now, { reducedMotion = false, rng = Math.random } = {}) {
  Object.assign(room, { open: true, openedAt: now, closingAt: null, dir: Math.floor(rng() * 4), instant: reducedMotion,
    focus: null, drawnAt: null, lean: { at: { x: 0, y: 0 }, v: { x: 0, y: 0 } }, hov: new Map(), plates: [] });
}
export function closeRoom(room, now, { rng = Math.random } = {}) {
  if (!room.open || room.closingAt !== null) return;
  room.closingAt = now;
  room.dirOut = (room.dir + 1 + Math.floor(rng() * 3)) % 4;
}
const sweepOut = () => ROOM.close + ROOM.jitter + ROOM.fade;
// Whether the room has finished going (the page then hands the ship back).
export function roomGone(room, now) {
  if (room.closingAt === null) return false;
  return room.instant || now - room.closingAt >= sweepOut() + ROOM.dark;
}

// ---- where things stand ----------------------------------------------------------------------------------------------

function roomLayout(r) {
  const s = scene.s;
  const cw0 = r.cellW, ch0 = r.cellH;
  const availW = r.width - 2 * ROOM.inset, availH = r.height - 2 * ROOM.inset;
  const k = Math.min(availW / (s.cols * cw0), availH / (s.rows * ch0));
  const cw = cw0 * k, ch = ch0 * k;
  const w = Math.floor(s.cols * cw), h = Math.floor(s.rows * ch);
  return { x: Math.round((r.width - w) / 2), y: Math.round((r.height - h) / 2), w, h, cw, ch, k };
}

// When a point of the frame (u, v from 0 to 1 across and down) is reached by the sweep from corner `dir`: 0 from the top
// left, 1 from the bottom right, 2 from the top right, 3 from the bottom left. Across weighs more than down, so the sweep
// runs the room's long way.
const hash = (a, b, c = 0) => {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263) + Math.imul(c + 7, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function sweep(dir, u, v) {
  const a = dir === 1 || dir === 3 ? 1 - v : v, b = dir === 1 || dir === 2 ? 1 - u : u;
  return a * 0.3 + b * 0.7;
}
// How much of a point of the frame stands at `now`: 0 black, 1 itself, between it is coming up out of the black or going down
// into it. `n` its own roll.
function shownAt(room, now, u, v, n) {
  if (room.instant) return room.closingAt === null ? 1 : 0;
  const jitter = hash(n, 3) * ROOM.jitter;
  if (room.closingAt === null) {
    const start = ROOM.dark + sweep(room.dir, u, v) * ROOM.open + jitter;
    return clamp((now - room.openedAt - start) / ROOM.fade, 0, 1);
  }
  const start = sweep(room.dirOut, u, v) * ROOM.close + jitter;
  return 1 - clamp((now - room.closingAt - start) / ROOM.fade, 0, 1);
}
const settled = (room, now) => (room.instant ? room.closingAt === null
  : room.closingAt === null && now - room.openedAt >= ROOM.dark + ROOM.open + ROOM.jitter + ROOM.fade);
// How far the screen is space's black under the room: up over ROOM.dark as it opens, down over the last ROOM.dark as it goes.
function veilAt(room, now) {
  if (room.instant) return room.closingAt === null ? 1 : 0;
  if (room.closingAt === null) return clamp((now - room.openedAt) / ROOM.dark, 0, 1);
  return 1 - clamp((now - room.closingAt - sweepOut()) / ROOM.dark, 0, 1);
}

// ---- space behind the room ---------------------------------------------------------------------------------------------

// Space's black and three steps of stars under the open room, leaning with the pointer as one sky (LINE_SCROLL's BACKDROP), so the
// room's window reads as a screen against the stars. Seeded, made for the screen's size.
let sky = null;
function starsFor(r) {
  const M = 16, W = r.width + 2 * M, H = r.height + 2 * M, key = `${W}x${H}`;
  if (sky?.key === key) return sky;
  const rng = mulberry32(20261004), inks = [ROLES.starFar, ROLES.starMid, ROLES.starNear];
  const layers = [0, 1, 2].map((d) => {
    const n = Math.round((W * H) / [5200, 9000, 26000][d]), stars = [];
    for (let k = 0; k < n; k++) {
      const ch = d === 2 && rng() < 0.25 ? '+' : d === 0 ? '.' : '·';
      stars.push({ ch, x: rng() * W - M, y: rng() * H - M });
    }
    return { ink: inks[d], alpha: d === 0 ? 0.75 : 1, share: [1, 0.85, 0.7][d], stars };
  });
  sky = { key, layers };
  return sky;
}
function drawBackdrop(r, veil, lean) {
  if (veil <= 0) return;
  r.fill(0, 0, r.width, r.height, PALETTE.black, veil);
  const ctx = r.ctx, k = r.dpr || 1, f = LINE_SCROLL.layers.BACKDROP, V = CONFIG.depth.vertical;
  ctx.save();
  ctx.font = `${CONFIG.render.fontSize}px ${r.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const layer of starsFor(r).layers) {
    const ox = Math.round(-f * lean.x * layer.share * k) / k, oy = Math.round(-f * lean.y * V * layer.share * k) / k;
    ctx.fillStyle = layer.ink; ctx.globalAlpha = layer.alpha * veil * CONFIG.starfield.opacity;   // (the flight's sky's strength)
    for (const s of layer.stars) ctx.fillText(s.ch, s.x + ox, s.y + oy);
  }
  ctx.restore();
}

// ---- the caches: each layer on a canvas of its own ---------------------------------------------------------------------

// A layer's canvas, its corner on a whole device px (so a layer laid at rest is copied, never resampled), its cells drawn at their
// own places from that corner.
function layerCanvas(L, K, box) {
  const ax = Math.floor((L.x + box.i0 * L.cw) * K) / K - L.x, ay = Math.floor((L.y + box.j0 * L.ch) * K) / K - L.y;
  const w = (box.i1 + 1) * L.cw - ax, h = (box.j1 + 1) * L.ch - ay;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * K)); canvas.height = Math.max(1, Math.ceil(h * K));
  const ctx = installGrade(canvas.getContext('2d'));
  return { canvas, ctx, w, h, ox: -ax, oy: -ay, ax, ay };
}
// The painter on a layer: each cell's black (to whole device px, cell to cell, no overlap), then the cells, in the palette's inks.
// `mode`: how a room ink reads there ('room', 'sky' in the panes, 'visitor' the ship outside).
function paint(room, r, L, K, layer, cells, { live = false, t = 0, mode = 'room', clear = true, sprite = [] } = {}) {
  const c = layer.cache, ctx = c.ctx;
  ctx.setTransform(K, 0, 0, K, 0, 0);
  if (clear) ctx.clearRect(0, 0, c.w + 1, c.h + 1);
  if (layer.opaque) { ctx.fillStyle = PALETTE.black; ctx.fillRect(0, 0, c.w + 1, c.h + 1); }
  if (layer.backed) {
    ctx.fillStyle = PALETTE.black;
    const snap = (v) => Math.round(v * K) / K;
    for (const cell of cells) {
      const x0 = snap(c.ox + cell.i * L.cw), x1 = snap(c.ox + (cell.i + 1) * L.cw), y0 = snap(c.oy + cell.j * L.ch), y1 = snap(c.oy + (cell.j + 1) * L.ch);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  const target = new InkCtx(ctx, scene.palette, { ox: c.ox, oy: c.oy, cw: L.cw, ch: L.ch, cols: scene.cols, rows: scene.rows, cells: scene.s.cells, mode });
  drawRoom(target, { cols: scene.cols, rows: scene.rows, cells, sprite }, ROOM_VARIANT,
    { x: c.ox, y: c.oy, cw: L.cw, ch: L.ch, fontFamily: r.fontFamily, t, live, marks: false, sky: live && mode === 'sky' });
}
function cachesFor(room, r, L) {
  // The worn look moves the grade's epoch (src/grade.js), and the layers, which hold graded pixels, are made again.
  const K = r.dpr || 1, key = `${L.w}x${L.h}@${K}|${gradeEpoch()}`;
  if (room.cacheKey !== key) {
    room.cacheKey = key; room.liveAt = -1;
    room.caches = new Map();
    for (const [id, layer] of scene.layers) {
      const entry = { ...layer, cache: layerCanvas(L, K, layer.box) };
      room.caches.set(id, entry);
      if (id === 'PANES' || id === 'VISITOR') continue;
      paint(room, r, L, K, entry, layer.cells);
    }
  }
  return room.caches;
}
// What lives, ten times a second: the stars in the panes, the ship passing, the monitor's screen.
function liveRedraw(room, r, L, t) {
  const K = r.dpr || 1, panes = room.caches.get('PANES');
  paint(room, r, L, K, panes, panes.cells, { live: true, t, mode: 'sky' });
  paint(room, r, L, K, room.caches.get('VISITOR'), visitorCells(scene, t), { mode: 'visitor' });
  const tv = room.caches.get('TELEVISION');
  if (tv.screen?.length) paint(room, r, L, K, tv, tv.screen, { live: true, t, clear: false });
}

// ---- the lean (X3 LINE SCROLL) ----------------------------------------------------------------------------------------------

// The pointer's aim followed on the flight's damped spring (CONFIG.depth: a little swing, no jitter).
function stepLean(lean, aim, dt, { omega = CONFIG.depth.omega, zeta = CONFIG.depth.zeta } = {}) {
  for (let left = Math.min(dt, 0.1); left > 1e-6;) {
    const h = Math.min(left, 1 / 120);
    lean.v.x += (omega * omega * (aim.x - lean.at.x) - 2 * zeta * omega * lean.v.x) * h;
    lean.v.y += (omega * omega * (aim.y - lean.at.y) - 2 * zeta * omega * lean.v.y) * h;
    lean.at.x += lean.v.x * h; lean.at.y += lean.v.y * h;
    left -= h;
  }
}
// Every layer's offset now, px on whole device px: { id: { x, y } }, and the plate's by row.
function offsetsOf(lean, K) {
  const V = CONFIG.depth.vertical, at = lean.at, snap = (v) => Math.round(v * K) / K, offs = new Map();
  const put = (id, f) => offs.set(id, { x: snap(-f * at.x), y: snap(-f * at.y * V) });
  for (const id of ['PANES', 'VISITOR', ...ORDER]) put(id, layerDepth(id, scene));
  offs.set('PLATE_ROWS', (j) => { const f = rowDepth(clamp((j + 0.5) / scene.rows, 0, 1.04)); return { x: snap(-f * at.x), y: snap(-f * at.y * V) }; });
  return offs;
}
// A thing's own cells' box on the screen, with its offset.
function thingBox(L, id, o = { x: 0, y: 0 }) {
  const b = scene.layers.get(id).thingBox;
  return { x: L.x + b.i0 * L.cw + o.x, y: L.y + b.j0 * L.ch + o.y, w: (b.i1 - b.i0 + 1) * L.cw, h: (b.j1 - b.j0 + 1) * L.ch };
}
// The thing whose own cell is under (x, y), nearest first.
function thingAt(L, offs, x, y) {
  for (let k = ORDER.length - 1; k >= 0; k--) {
    const id = ORDER[k];
    if (!ACTIVE.includes(id)) continue;
    const o = offs.get(id), i = Math.floor((x - L.x - o.x) / L.cw), j = Math.floor((y - L.y - o.y) / L.ch);
    if (i >= 0 && j >= 0 && i < scene.cols && j < scene.rows && scene.layers.get(id).own.has(j * scene.cols + i)) return id;
  }
  return null;
}

// ---- the windows ------------------------------------------------------------------------------------------------------------

function wrapText(text, cols) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && (line + ' ' + word).length > cols) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

export function thingWords(world, name, room = null) {
  const T = THINGS[name];
  if (!T) return null;
  if (T.notes) {
    const notes = notesOf(world), at = notes.length ? (room?.note ?? 0) % notes.length : 0;
    return notes.length ? { title: `${notes[at].title} / ${at + 1} OF ${notes.length}`, text: notes.length > 1 ? `${notes[at].text} Click for the next note.` : notes[at].text }
      : { title: 'CREW NOTES', text: 'No notes yet. Complete special jobs for visiting crews.' };
  }
  if (T.souvenir) {
    const lore = SOUVENIR_LORE[T.souvenir];
    const owned = world?.collection?.instances?.some((i) => i.defId === T.souvenir);
    return owned ? { title: lore.name, text: lore.lore } : { title: name, text: 'Not found. Search the caches.' };
  }
  return { title: T.title, text: T.text };
}

// Where the ink of what `inside(r, ox, oy, measuring)` draws lies, from its origin: { left, top, right, bottom } (right and bottom past
// the last inked px), measured once on a canvas of its own at a px a px, kept by `key` (what the window holds).
const inks = new Map();
let inkCanvas = null;
function inkOf(r, key, inside) {
  const known = inks.get(key);
  if (known) return known;
  const W = 640, H = 420, O = 40;
  inkCanvas ??= document.createElement('canvas');
  inkCanvas.width = W; inkCanvas.height = H;
  const ctx = inkCanvas.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);
  ctx.font = r.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const m = Object.create(r);
  m.ctx = ctx; m.dpr = 1;
  unnoted(() => inside(m, O, O, true));
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4;
    if (d[k] > 24 || d[k + 1] > 24 || d[k + 2] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const box = x1 < 0 ? { left: 0, top: 0, right: 0, bottom: 0 } : { left: x0 - O, top: y0 - O, right: x1 + 1 - O, bottom: y1 + 1 - O };
  if (inks.size > 64) inks.clear();
  inks.set(key, box);
  return box;
}
// A window round what `inside` draws: its size, and where its insides start for the window's corner at (x, y).
function windowOf(r, key, inside) {
  const b = inkOf(r, key, inside), A = ROOM_LOOK.air;
  return { w: b.right - b.left + 2 * A, h: b.bottom - b.top + 2 * A, dx: A - b.left, dy: A - b.top };
}
// A row's key: in a keycap when it is a key (a click on it presses the key, src/hover.js grows it), as words when it is the mouse's
// (HOVER, CLICK).
function keyCell(r, key, x, ty, ink, { muted = false } = {}) {
  if (keyCodeOf(key)) return muted ? unnoted(() => keycap(r, key, x + KEYCAP_PAD, ty, { reach: 0 })) : keycap(r, key, x + KEYCAP_PAD, ty, { reach: 0 });
  r.text(key, x, ty, ink);
  return x + (glyphs(key).length + 1) * r.cellW;
}
// A list's insides from (ox, oy): its head (the first line primary, the rest secondary), half a row, then its rows, each a key and its
// words in a column after the widest key (the object's menu's grammar, labs/graphics/context.js). The head's ink starts where the
// caps' strokes do. A row whose key is a key is a button (`hot`: hoverItem's), noted unless `muted`.
function listInside(head, rows, { muted = false } = {}) {
  return (r, ox, oy, measuring = false) => {
    const m = uiMetrics(r), keyCols = Math.max(0, ...rows.map((row) => glyphs(row.key).length)), boxes = [];
    head.forEach((s, k) => r.text(s, ox - Math.round(m.capLeft), oy + k * UI.row + m.textY, k ? ROLES.textSecondary : ROLES.textPrimary));
    rows.forEach((row, k) => {
      const top = oy + (head.length + (head.length ? UI.space.rows : 0) + k) * UI.row, ty = top + m.textY;
      const labelX = ox + 2 * KEYCAP_PAD + (keyCols + 1) * r.cellW;
      const box = { x: ox, y: ty - 2, w: labelX - ox + glyphs(row.label).length * r.cellW + KEYCAP_PAD, h: r.cellH + 3 };
      const draw = () => { keyCell(r, row.key, ox, ty, ROLES.textSecondary, { muted: muted || measuring }); r.text(row.label, labelX, ty, ROLES.textSecondary); };
      if (!measuring && !muted && keyCodeOf(row.key)) hoverItem(r, `room:${row.key}`, box, draw);
      else draw();
      boxes.push(box);
    });
    return boxes;
  };
}
// The quests' insides from (ox, oy): the Rail plates of the quest family (labs/graphics/rail.js), ROOM_LOOK.gap apart, and under them
// the list's heading as the flight's column has it, its key in a cap and QUESTS (keyName('nextQuest')), ROOM_LOOK.rule from the last
// plate's ink to the cap's. `over` the id of the plate under the pointer (its sign comes up white, as on the flight's list); each
// plate's box is pushed on `boxes` with its task's id (a click on it selects that task).
function questsInside(plates, { over = null, boxes = null } = {}) {
  return (r, ox, oy, measuring = false) => {
    let y = oy;
    if (!plates.length) {
      const m = uiMetrics(r);
      r.text('NO ACTIVE QUESTS', ox - Math.round(m.capLeft), y + m.textY, ROLES.textQuiet);
      y += UI.row + ROOM_LOOK.gap;
    }
    for (const b of plates) {
      const size = railSize(r, b);
      drawRail(r, b, ox, y, { over: !measuring && over != null && b.id === over });
      if (!measuring && boxes && b.id != null) boxes.push({ id: b.id, x: Math.round(ox), y: Math.round(y), w: size.w, h: size.h });
      y += size.h + ROOM_LOOK.gap;
    }
    y -= ROOM_LOOK.gap;
    const ty = y + ROOM_LOOK.rule + 2;   // the cap's top stroke `rule` under the last plate's ink (a cap rises over its text)
    const next = keyCell(r, keyName('nextQuest') || 'R', ox, ty, ROLES.textSecondary, { muted: true });
    r.text('QUESTS', next, ty, ROLES.textSecondary);
    void measuring;
  };
}

// The quests the room's window lists, from the world: the open quests as the flight's list draws them (the banners' quest family:
// their ink and sign, the clock in the ink before what to do), and the cargo run on; each with its task's id (src/tasks.js). The task
// `selected` (the quest list's activeId) shows as on the flight's list: its sign the bearing arrow to it, the others' titles quiet.
export function roomQuests(world, selected = null) {
  const bearing = (route) => { const way = courseOf(route); return way ? bearingGlyph(Math.atan2(way.dy, way.dx)) : null; };
  const out = currentQuests(world).map((q) => {
    const tone = QUEST_TONES[questTone(q)] ?? QUEST_TONES.green;
    return { id: q.id, family: 'quest', ink: tone.ink, mark: (q.id === selected && bearing(questNavigation(world, q))) || tone.mark,
      title: q.title, sub: q.sub, clock: q.ends != null ? runClock(Math.ceil(Math.max(0, q.ends - world.ledger.clock))) : null, clockInk: tone.ink };
  });
  const job = world.ledger.activeJob?.();
  if (job) {
    const route = deliveryNavigation(world), id = world.ledger.active ? cargoTaskId(world.ledger.active.id) : null;
    const clock = route?.clock ? `${route.clock.left < 0 ? 'LATE ' : ''}${runClock(Math.abs(route.clock.left))}` : null;
    out.push({ id, family: 'quest', ink: PALETTE.green, mark: (id != null && id === selected && bearing(route)) || QUEST_TONES.green.mark,
      title: `DELIVER ${job.label}`, sub: `TO ${world.stationLabelOf(job.to)}`, clock, clockInk: route?.clock?.left < 0 ? PALETTE.red : PALETTE.green });
  }
  if (selected != null && out.some((b) => b.id === selected)) for (const b of out) if (b.id !== selected) b.titleInk = ROLES.textSecondary;
  return out;
}
// What a window's ink measure is kept by: the plates' words by their lengths (a clock ticking keeps its width).
const platesKey = (plates) => plates.map((b) => `${b.mark}|${b.title}|${glyphs(b.sub ?? '').length}|${glyphs(b.clock ?? '').length}`).join('/');

// A window comes up out of the black with the sweep, by the corner it stands in: black laid over it, less as it comes.
// A window at its sweep's moment (`shown` as shownAt has it): black before the front, a black glyph a cell over it at the front, itself
// after.
function veilWindow(r, box, shown, room, now, seed) {
  if (shown <= 0) { r.fill(box.x, box.y, box.w, box.h, PALETTE.black); return; }
  if (shown >= 1) return;
  const ctx = r.ctx, cw = r.cellW, ch = r.cellH, tick = sweepTick(room, now);
  blackGlyphs(ctx, `${CONFIG.render.fontSize}px ${r.fontFamily}`, (put) => {
    for (let j = 0; j < Math.ceil(box.h / ch); j++) for (let i = 0; i < Math.ceil(box.w / cw); i++) put(i, j + seed * 64, box.x + (i + 0.5) * cw, box.y + (j + 0.5) * ch);
  }, tick, box);
}
// The sweep's black glyphs: the respawn's flicker letters (REBOOT.glyphs), one a cell, each new every REBOOT.tick of the sweep, in
// space's black, `font` the cells' size, clipped to `clip` when given. `each(put)` calls put(i, j, x, y) for every cell at its front.
const sweepTick = (room, now) => Math.floor((now - (room.closingAt ?? room.openedAt)) / REBOOT.tick);
export function blackGlyphs(ctx, font, each, tick, clip = null) {
  const G = REBOOT.glyphs;
  ctx.save();
  if (clip) { ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = PALETTE.black; ctx.globalAlpha = 1;
  each((i, j, x, y) => ctx.fillText(G[Math.floor(noise3(i, j, tick) * G.length)], x, y));
  ctx.restore();
}

// ---- drawing -------------------------------------------------------------------------------------------------------------

// The place's window in the Swiss manner (SX's S9 on labs/graphics/sketches/windows-swiss-2.html, 2026-10-09: «берем»; the kit, labs/graphics/swiss.js, the
// chrome, labs/graphics/swiss-window.js): HOME at the left of its head and J-05 YOUR GARAGE at the right, a rule under it across to the frame, and under
// it the room's keys, a row each, its words at the left and its key flush right as the cockpit's keycap (a way that is no key, POINT or CLICK in the
// mouse's mode, the words themselves). A row with a key of its own is a button: under the pointer it is the inverted row, and a click presses its key.
// The room's black windows had no frame and no rule until then (the quests' plates and a thing's window are still those). Returns its size and how to
// draw it in a box of that size.
export function homeWindow(r, controls) {
  const sw = swiss(r), { cw, I } = sw, pad = SWISS.barPad;
  const head = { left: [['HOME', SW]], right: [['J-05', SG], ['YOUR GARAGE', SQ]] };
  const rows = controls.map((c) => ({ ...c, cap: !!keyTokens(c.key), press: !!keyCodeOf(c.key) }));
  const capPx = (c) => (c.cap ? keycapWidth(sw, c.key) : glyphs(c.key).length * cw);
  const headPx = [...head.left, ...head.right].reduce((n, p) => n + partCols(p), 0) * cw + 2 * SWISS.gap * cw;
  const inner = Math.max(headPx, ...rows.map((c) => (glyphs(c.label).length + SWISS.gap) * cw + capPx(c)));
  const w = Math.round(2 * I + inner), h = sw.boxHeight(SWISS.headGap + rows.length - 1);
  return { w, h, draw(box) {
    sheet(sw, box);
    headRow(sw, box, head.left, head.right);
    const L = box.x + I, R = box.x + box.w - I;
    rows.forEach((c, k) => {
      const top = sw.rowAt(box.y, SWISS.headGap + k), row = { x: L - pad, y: top, w: R - L + 2 * pad, h: UI.row };
      const paint = (on) => {
        if (on) bar(sw, row);
        sw.text(c.label, L, top, onBar(on, SW), on);
        if (c.cap) keycapAt(sw, c.key, R - keycapWidth(sw, c.key), top, SW, on);
        else sw.textEnd(c.key, R, top, onBar(on, SW), on);
      };
      if (!c.press) { unnoted(() => paint(false)); return; }
      // The whole row presses its key (a click on the words as on the cap), the cap's own box noted by the cap itself.
      noteKeycap(c.key, row, 0, r);
      const on = pointerOver(screenBox(r, row));
      hoverItem(r, `room:${c.key}`, row, () => paint(on), { over: on, kind: 'flat' });
    });
  } };
}

// Draws the room over the screen. `quests` as roomQuests gives them; `controls` this screen's keys (src/controls.js roomControls);
// `down` whether the pointer is pressed. The boxes a click and the keyboard's focus ask about are kept on `room.hits`.
export function drawRoomPopup(r, room, world, now, { quests = [], controls = roomControls(DEFAULT_SCHEME), down = false } = {}) {
  if (!room.open || !scene) return;
  const L = roomLayout(r), ctx = r.ctx, K = r.dpr || 1;
  const still = room.instant;
  const dt = room.drawnAt === null ? 0 : clamp(now - room.drawnAt, 0, 0.1);
  room.drawnAt = now;
  const caches = cachesFor(room, r, L);
  const tick = Math.floor(now / ROOM.live);
  if (tick !== room.liveAt) { room.liveAt = tick; liveRedraw(room, r, L, tick * ROOM.live); }
  // The lean follows the pointer (none for reduced motion).
  const p = room.pointer;
  const aim = still || !p ? { x: 0, y: 0 } : { x: easeAim(clamp((p.x - (L.x + L.w / 2)) / (L.w / 2), -1, 1)), y: easeAim(clamp((p.y - (L.y + L.h / 2)) / (L.h / 2), -1, 1)) };
  stepLean(room.lean, aim, dt);
  if (still) room.lean = { at: { x: 0, y: 0 }, v: { x: 0, y: 0 } };
  const offs = offsetsOf(room.lean, K);
  // What the pointer is on now (the layers move under a resting pointer), kept while the pointer stays within HOVER.stick of it.
  const at = (x, y) => thingAt(L, offs, x, y);
  const boxes = Object.fromEntries(ACTIVE.map((id) => [id, thingBox(L, id, offs.get(id))]));
  room.hits = { things: ACTIVE.map((id) => anchorBox(L, id, offs.get(id))), frame: L, at, boxes };
  if (p) room.focus = roomHit(room, p.x, p.y)?.kind === 'thing' ? hitAt(room, p.x, p.y) : null;
  const on = room.focus;
  // Every thing's grow (src/hover.js's rate and press), toward 1 for the one the pointer is on.
  for (const id of ACTIVE) {
    let st = room.hov.get(id);
    if (!st) { st = { h: 0, p: 0, pV: 0 }; room.hov.set(id, st); }
    const want = id === on ? 1 : 0, to = id === on && down ? 1 : 0, { omega, zeta } = HOVER.press;
    st.h = still ? want : st.h + (want - st.h) * (1 - Math.exp(-dt * HOVER.rate));
    for (let left = dt; left > 1e-6;) { const h = Math.min(left, 1 / 240); st.pV += (omega * omega * (to - st.p) - 2 * zeta * omega * st.pV) * h; st.p += st.pV * h; left -= h; }
    if (still) { st.p = to; st.pV = 0; }
  }
  // Space's black and its stars under everything; before the room has begun, or once it has gone, that alone.
  const veil = veilAt(room, now);
  drawBackdrop(r, veil, room.lean.at);
  const opening = room.closingAt === null && !still && now - room.openedAt < ROOM.dark;
  const gone = room.closingAt !== null && (still || now - room.closingAt >= sweepOut());
  if (opening || gone) return;

  // The room, cut square: the stars in the window, the ship passing, the room without its things row by row, the things far to near.
  ctx.save();
  ctx.beginPath(); ctx.rect(L.x, L.y, L.w, L.h); ctx.clip();
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.black; ctx.fillRect(L.x, L.y, L.w, L.h);
  const lay = (id, o, scale = 1, box = null) => {
    const c = caches.get(id).cache, x = L.x + c.ax + o.x, y = L.y + c.ay + o.y;
    if (scale !== 1 && box) {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
      ctx.drawImage(c.canvas, x, y, c.canvas.width / K, c.canvas.height / K);
      ctx.restore();
    } else ctx.drawImage(c.canvas, x, y, c.canvas.width / K, c.canvas.height / K);
  };
  lay('PANES', offs.get('PANES'));
  lay('VISITOR', offs.get('VISITOR'));
  {
    // Row by row: a run of rows that lands on the same device px is one band (at rest the room is one copy).
    const e = caches.get('PLATE'), c = e.cache, H = c.canvas.height, rowsOf = offs.get('PLATE_ROWS');
    const top = (j) => clamp(Math.round((j * L.ch + c.oy) * K), 0, H);
    let j0 = e.box.j0, o0 = rowsOf(j0);
    const band = (ja, jb, o) => {
      const sy = top(ja), sh = (jb >= e.box.j1 ? H : top(jb + 1)) - sy;
      if (sh > 0) ctx.drawImage(c.canvas, 0, sy, c.canvas.width, sh, L.x + c.ax + o.x, L.y + c.ay + sy / K + o.y, c.canvas.width / K, sh / K);
    };
    for (let j = e.box.j0 + 1; j <= e.box.j1 + 1; j++) {
      const o = j <= e.box.j1 ? rowsOf(j) : null;
      if (o && o.x === o0.x && o.y === o0.y) continue;
      band(j0, j - 1, o0);
      // Where two bands part downward, the upper one's last row runs a px longer, so no seam of black shows between them.
      if (o && o.y > o0.y) { const sy = top(j) - 1; ctx.drawImage(c.canvas, 0, sy, c.canvas.width, 2, L.x + c.ax + o0.x, L.y + c.ay + sy / K + o0.y, c.canvas.width / K, 2 / K); }
      j0 = j; o0 = o;
    }
  }
  const grow = (id) => {
    const st = room.hov.get(id);
    if (!st || still || st.h <= 0.004) return 1;
    return hoverScale(boxes[id], Math.max(0, st.h), st.p);
  };
  const hot = on ? room.hov.get(on) : null, dimming = !!(hot && hot.h > 0.004);
  for (const id of ORDER) {
    if (dimming && id === on) continue;
    const o = offs.get(id);
    if (!ACTIVE.includes(id)) { lay(id, o); continue; }
    lay(id, o, grow(id), boxes[id]);
  }
  // The one the pointer is on, grown, over the rest dimmed by ROOM_LOOK.dim (SX's H2 and the light H4).
  if (dimming) {
    ctx.save(); ctx.globalAlpha = ROOM_LOOK.dim * Math.min(1, hot.h); ctx.fillStyle = PALETTE.black;
    ctx.fillRect(L.x, L.y, L.w, L.h); ctx.restore();
    lay(on, offs.get(on), grow(on), boxes[on]);
  }
  // Coming or going, by the sweep: a cell not reached yet (or gone) black, one at the front the room under a black glyph (the
  // respawn's, labs/graphics/respawn-fx.js), one behind it the room.
  if (!settled(room, now)) {
    const s = scene.s, dark = new Path2D(), front = [];
    for (const c of s.cells) {
      const a = shownAt(room, now, (c.i + 0.5) / s.cols, (c.j + 0.5) / s.rows, c.j * s.cols + c.i);
      if (a >= 1) continue;
      if (a <= 0) dark.rect(Math.floor(L.x + c.i * L.cw), Math.floor(L.y + c.j * L.ch), Math.ceil(L.cw) + 1, Math.ceil(L.ch) + 1);
      else front.push(c);
    }
    ctx.fillStyle = PALETTE.black; ctx.globalAlpha = 1;
    ctx.fill(dark);
    if (front.length) {
      blackGlyphs(ctx, `${CONFIG.render.fontSize * L.k}px ${r.fontFamily}`, (put) => {
        for (const c of front) put(c.i, c.j, L.x + (c.i + 0.5) * L.cw, L.y + (c.j + 0.5) * L.ch);
      }, sweepTick(room, now));
    }
  }
  ctx.restore();
  // The frame: a band of space's black round the room.
  const B = ROOM.band;
  r.fill(L.x - B, L.y - B, L.w + 2 * B, B, ROLES.space); r.fill(L.x - B, L.y + L.h, L.w + 2 * B, B, ROLES.space);
  r.fill(L.x - B, L.y, B, L.h, ROLES.space); r.fill(L.x + L.w, L.y, B, L.h, ROLES.space);

  // The windows: the quests at the top left, the place's keys at the top right, each up out of the black as the sweep reaches it.
  const A = ROOM_LOOK.air;
  const plateBoxes = [], plateOver = p && room.plates ? room.plates.find((b) => inBox(b, p.x, p.y))?.id ?? null : null;
  const qIn = questsInside(quests, { over: plateOver, boxes: plateBoxes });
  const qw = windowOf(r, `quests:${platesKey(quests)}:${keyName('nextQuest')}`, questsInside(quests));
  const qBox = { x: L.x + A, y: L.y + A, w: qw.w, h: qw.h };
  r.fill(qBox.x, qBox.y, qBox.w, qBox.h, ROLES.backing);
  // The plates' own black runs to the rail's width: the window is cut to its own air.
  ctx.save(); ctx.beginPath(); ctx.rect(qBox.x, qBox.y, qBox.w, qBox.h); ctx.clip();
  qIn(r, qBox.x + qw.dx, qBox.y + qw.dy);
  ctx.restore();
  veilWindow(r, qBox, shownAt(room, now, (qBox.x - L.x) / L.w, (qBox.y - L.y) / L.h, 77), room, now, 1);
  const home = homeWindow(r, controls);
  const hBox = { x: L.x + L.w - A - home.w, y: L.y + A, w: home.w, h: home.h };
  home.draw(hBox);
  veilWindow(r, hBox, shownAt(room, now, (hBox.x + hBox.w - L.x) / L.w, (hBox.y - L.y) / L.h, 78), room, now, 2);
  room.hits.windows = { quests: qBox, home: hBox };
  // The plates a click selects, as drawn (cut to the window), once the room stands.
  room.plates = settled(room, now) ? plateBoxes.map((b) => ({ ...b, w: Math.min(b.w, qBox.x + qBox.w - b.x) })) : [];
  // The thing the pointer is on: its window beside it, on the side where it covers least of the other things and windows.
  if (on && settled(room, now)) drawThingWindow(r, room, world, L, on, boxes, [qBox, hBox]);
}
// A thing's box the size of its own cells' box, laid round the point the pointer parks on (its anchor, on the thing): the box the
// keyboard's walk reads (labs/graphics/key-focus.js: the things by their middles, the pointer parked on a middle).
function anchorBox(L, id, o) {
  const a = scene.anchors.get(id), b = scene.layers.get(id).thingBox, w = (b.i1 - b.i0 + 1) * L.cw, h = (b.j1 - b.j0 + 1) * L.ch;
  return { name: id, x: L.x + a.i * L.cw + o.x - w / 2, y: L.y + a.j * L.ch + o.y - h / 2, w, h };
}

function drawThingWindow(r, room, world, L, on, boxes, keep) {
  const words = thingWords(world, on, room) ?? { title: on, text: '' };
  const text = ACTIONS[on] && on !== 'CABINET' ? '' : words.text;
  const head = [words.title, ...wrapText(text, ROOM.wrap).slice(0, 5)];
  // Its action's row: the key the keyboard uses it by (labs/graphics/key-focus.js: Enter); a word, not a button (the window stands
  // beside the thing, not under the pointer).
  const rows = ACTIONS[on] ? [{ key: keyName('confirm'), label: ACTIONS[on] }] : [];
  const inside = listInside(head, rows, { muted: true });
  const sz = windowOf(r, `thing:${head.join('|')}:${rows.map((x) => x.key + x.label).join()}`, inside);
  const A = ROOM_LOOK.air, b = boxes[on], gap = 2 * UI.air.inset;
  const inner = { x0: L.x + A, x1: L.x + L.w - A, y0: L.y + A, y1: L.y + L.h - A };
  const mid = b.y + Math.min(b.h, 2 * UI.row) - sz.h / 2;
  const sides = [[b.x + b.w + gap, mid], [b.x - gap - sz.w, mid], [b.x + b.w / 2 - sz.w / 2, b.y - gap - sz.h], [b.x + b.w / 2 - sz.w / 2, b.y + b.h + gap]];
  const overlap = (a, c) => Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
  const others = ACTIVE.filter((id) => id !== on).map((id) => boxes[id]);
  let best = null;
  for (const [sx, sy] of sides) {
    const x = Math.round(clamp(sx, inner.x0, inner.x1 - sz.w)), y = Math.round(clamp(sy, inner.y0, inner.y1 - sz.h)), box = { x, y, w: sz.w, h: sz.h };
    const score = 4 * overlap(box, b) + others.reduce((n, c) => n + overlap(box, c), 0) + 4 * keep.reduce((n, c) => n + overlap(box, c), 0) + Math.hypot(x - sx, y - sy) * 20;
    if (!best || score < best.score - 1) best = { x, y, score };
  }
  r.fill(best.x, best.y, sz.w, sz.h, ROLES.backing);
  inside(r, best.x + sz.dx, best.y + sz.dy);
  room.hits.windows.thing = { x: best.x, y: best.y, w: sz.w, h: sz.h };
}

// What is under (x, y): the thing whose own cell it is (on the layers as last drawn), else the one the pointer was on while it is
// within HOVER.stick of it; without the drawn layers (a room laid out by hand), the smallest box under it.
function hitAt(room, x, y) {
  const h = room.hits;
  if (!h.at) return h.things.filter((b) => inBox(b, x, y)).sort((a, b) => a.w * a.h - b.w * b.h)[0]?.name ?? null;
  const id = h.at(x, y);
  if (id) return id;
  const b = room.focus ? h.boxes?.[room.focus] : null, m = HOVER.stick;
  return b && inBox({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }, x, y) ? room.focus : null;
}
// What the pointer is on: a quest's plate (a click selects its task), a thing, and what a click on it does; else nothing.
export function roomHit(room, x, y) {
  const plate = room.plates?.find((b) => inBox(b, x, y));
  if (plate) return { kind: 'plate', id: plate.id, action: 'select' };
  const id = hitAt(room, x, y);
  return id ? { kind: 'thing', id, action: THINGS[id]?.action ?? null } : null;
}
// Points the room at what is under (x, y). Returns whether a click would do something.
export function roomPoint(room, x, y) {
  room.pointer = { x, y };
  const hit = roomHit(room, x, y);
  room.focus = hit?.kind === 'thing' ? hit.id : null;
  return !!hit?.action;
}

// ---- the room as one of the page's screens -------------------------------------------------------------------------------

// The garage's room among the page's screens (labs/graphics/screens.js keeps it in POPUPS and HOLDS with the others): opened when the
// ship is inside its berth ('homeEntered', labs/graphics/notices.js), over a flight that goes on (the ship sits in its berth); ESC
// (LEAVE GARAGE) sends it away, and once it has gone the ship backs out (World.leaveHome). C, or a click on the armchair, opens the
// pilot card over it; S (CHANGE STARSHIP), or a click on the shuttle, the hangar (SX, 2026-10-13: «делаем в комнате кнопку change starship
// и выход, а клик по кораблю ведет на выбор корабля»). `?room` in the lab opens it at the start, to look at. `page` is what the registry
// lends it: the world, the renderer, the sound, the feedback (reduced motion), the page's clock, the screens' `open` flags, `key(action)`
// (tapped this frame), the controls list's `openHelp` / `closeHelp`, `openPilot`, `openHangar`, `controls()`, this screen's keys as the scheme reads
// them (src/controls.js roomControls), `pointerDown()`, and `questBoard()` (the flight's quest list, whose activeId is the selected task:
// src/tasks.js).
export function createRoomScreen(page) {
  const { world, renderer, sound, feedback, pageTime, open, key } = page;
  const room = createRoom();
  loadRoomArt().catch((error) => console.error('the garage room did not load', error));
  function openGarageRoom() {
    if (open.room) return;
    if (!roomReady()) { loadRoomArt().then(openGarageRoom, () => {}); return; }
    page.closeHelp(false);
    sound.play('panelOpen');
    open.room = true;
    openRoom(room, pageTime(), { reducedMotion: feedback.reducedMotion });
  }
  function leaveGarageRoom() {
    if (!open.room || room.closingAt !== null) return;
    page.closeHelp(false);
    sound.play('panelClose');
    closeRoom(room, pageTime());
  }
  // Once the room has gone: the flight as it was, and the ship backs out of the berth.
  function settleGarageRoom() {
    if (!open.room || !roomGone(room, pageTime())) return;
    open.room = false;
    room.open = false;
    world.leaveHome?.();
  }
  // The keys the room's window lists; ? still opens the flight's controls.
  function roomKeys() {
    if (key('help')) { if (open.help) page.closeHelp(); else page.openHelp(); return; }
    if (key('card') && !open.help && room.closingAt === null) { page.openPilot(); return; }
    if (key('changeShip') && !open.help && room.closingAt === null) { page.openHangar(); return; }
    if (key('back') || key('close')) { if (open.help) page.closeHelp(); else leaveGarageRoom(); }
  }
  // The room over the screen, as a pop-up draws it.
  function draw() {
    drawRoomPopup(renderer, room, world, pageTime(), { quests: roomQuests(world, page.questBoard?.()?.activeId ?? null), controls: page.controls(),
      down: !!page.pointerDown?.() });
  }
  // The pointer at (x, y): the canvas's cursor hint there.
  const point = (x, y) => (roomPoint(room, x, y) ? 'pointer' : '');
  // A click at (x, y): what the thing under it does. The room takes every click while it stands.
  function click(x, y) {
    const hit = roomHit(room, x, y);
    if (hit?.kind === 'plate') {
      // As a click on the flight's plate: that task selected, or let go when it was (src/tasks.js selectTask).
      const board = page.questBoard?.();
      if (board) { seen(board, hit.id); selectTask(board, board.activeId === hit.id ? null : hit.id); sound.play('blip'); }
    } else if (hit?.action === 'leave') leaveGarageRoom();
    else if (hit?.action === 'hangar') page.openHangar();
    else if (hit?.action === 'pilot') page.openPilot();
    else if (hit?.action === 'notes') { if (nextNote(room, world)) sound.play('blip'); }
    return true;
  }
  return { room, openGarageRoom, leaveGarageRoom, settleGarageRoom, roomKeys, draw, point, click };
}
