// The map as a panel over the flight (SX, 2026-10-02: «Про редактор в виде карты в игре это надо отредактировать и
// сделать плюс минус статичную версию редактора с мелкими анимациями, без расположения нпс, с планетами станциями
// информацией про открытые сектора (секретный там не показываем) можно поставить разноцветные флажки метки, которые будут
// в локаторе отображаться, но указателя не будет, метку надо снять в ручную когда подлетишь, она ставится в реале не
// прямо на цель а рядом»). His answers: TAB opens it over the flight; the sectors the pilot has been in are shown
// whole, the others dark with their name only, the hidden one not at all; a flag lands 200-500 u from where it was put;
// five flags, one of each colour, a flag put again moves.
//
// Then, on the first look (2026-10-02): «давай поближе сектора поставим и чуть больше интерактива, и рамка должна быть
// внешняя как у карточки пилота, но между секторами внутри потоньше и каким-то типом пунктира», and «сектор должен быть
// подписан внутри квадрата в левом верхнем углу». So the map is one panel on the interface's grid (src/uiGrid.js
// uiPanel, the card's frame in CONFIG.hud.edge): the six sectors side by side on the left, a dashed line between two,
// each named inside at its top left; a column on the right, past a divider joined to the frame as the card's, with the
// flags, what the pointer is on, and the keys.
//
// And then: «давай дадим возможность открывать нашу карту, прям версию из редактора» (his pick: «Только известное»). What
// stands inside a sector is the map editor's picture, painted by the editor's own functions (labs/map-editor/view.js
// `paintObject`, `objectMetrics`, `glyph`) from the editor's own reading of the catalogues (data.js `gameLayout`): the
// planets as discs in their hue at true size, the holes' rings, the stations' boxes at true size with their letter, a ruin
// dashed and orange, HOME, the caches. View only, and only what the pilot knows: the sectors he has been in whole (the
// others their outline and name), the caches he has opened, come up to, or that a station marked; O-08 never; no NPC ships,
// signals or signs. Beside each ruin, how much has been put into it («на карте отмечать в какой станции сколько вкинуто»).
// A marked cache blinks on the map as on the locator («покажи его мигающем на радаре и на общей карте»).
//
// What moves: the holes' rings turn, the ship and a marked cache blink, a flag drifts to where it lands and its pennant
// stirs. What answers the pointer: the sector under it lights, the thing under it gets the card's corners and its words in
// the column, and the picked flag waits at the pointer with the ring it can land in. The wheel zooms about the pointer, a
// drag moves the picture, W A S D / the arrows move it, Q E zoom, F shows the whole map again (the editor's keys: the
// ship's controls are let go under a pop-up, so none is taken from the flight).
//
// Cheap per frame (SX: the map must stay cheap): what does not move (the grids, the bodies, the names, the dashes) is drawn once
// into a canvas of its own and blitted, and drawn again only when something it shows changed (`stampOf`); each frame draws only
// what moves or blinks, the sector names, and the window round it.
//
// The window round the picture is in the Swiss manner since SX's S5 of 2026-10-09 (labs/graphics/sketches/windows-swiss-2.html:
// «берем но наши текущие контекстные окна не трогаем мы сейчас поп апами занимаемся»; «Держись минимализма»; the kit,
// labs/graphics/swiss.js, the chrome, labs/graphics/swiss-window.js): black in a gray frame, a head (MAP THE GRID, the sector the
// ship is in and how many are open) over a rule, the sectors' box at the left and the column at the right in hanging heads, 01 HERE
// (the sector's figures, or what the pointer is on), 02 FLAGS (a key, the flag in its colour, its name and where it stands: the picked
// one and the one under the pointer the inverted row) and 03 LEGEND, a rule and the foot's keys as the cockpit's caps. The picture
// in the box is the game's own, as it was (the dashed lines in the interface's blue, the blue grid, the editor's bodies); no rule
// down between the box and the column, space keeps them apart.

import { UI, uiAir, uiMetrics, centredWindow } from '../../src/uiGrid.js';
import { CONFIG } from '../../src/config.js';
import { FLAG_NAMES, flagSpot, flagInFrame } from '../../src/flags.js';
import { SECTORS, SECTOR_SIZE, stationDefById, stationsOf, startRuinOf } from '../../src/sectors.js';
import { WORLD_SCALE } from '../../src/worldScale.js';
import { isRestored, invested, formatCR } from '../../src/ruins.js';
import { sectorOpen } from '../../src/frontier.js';
import { CATALOGUE, findsFor, findDef, findLabel, findTitle, placeOf } from '../../src/rewards.js';
import { authoredWaiting } from '../../src/contracts.js';
import { openingHoldsOffers } from '../../src/opening.js';
import { lookById } from '../../src/looks.js';
import { stationLoreNow } from '../../src/stationInfo.js';
import { installGrade, gradeEpoch } from '../../src/grade.js';
import { gameLayout } from '../map-editor/data.js';
import { glyph, paintObject, objectMetrics, INK } from '../map-editor/view.js';
import { markBlinkAlpha } from './locator.js';
import { PALETTE, ROLES } from '../../src/roles.js';
import { glyphs, fitText } from '../../src/util.js';
import { keyName, keyText } from '../../src/controls.js';
import { sectorLine } from './swiss.js';
import { Win, ORG, INK as TONE } from './organism.js';
import { unnoted } from './clicks.js';

export const MAP = Object.freeze({
  side: 30,             // columns of the right-hand column's text, a group's step (`gap`) from the sectors' box
  gap: UI.group.cols,   // columns between the sectors' box and the column
  under: 1.5,           // rows from a group's head to its first row: a row and the half of one (the pilot card's columns)
  hereRows: 6,          // rows of 01 HERE under its head (a sector's figures, or what the pointer is on in words)
  grid: 1200,           // u between the faint lines inside a sector
  dash: [3, 3],         // px, the dashed line round a sector, in the frame's blue
  gridHere: 0.55,       // the light of the blue grid inside the sector the ship is in (its name white too)
  gridThere: 0.3,       // and inside the others
  turn: 0.6,            // rad/s a hole's ring turns
  landing: 0.6,         // s a flag drifts from where it was put to where it lands
  scatter: [200, 500],  // u: how far from where it was put a flag lands (SX's pick)
  corner: 6,            // px, the arms of the corners round the thing under the pointer
  cache: 5,             // px, half a cache's diamond
  legend: 4,            // px, half a legend's mark: a station's box 8 x 6, its lines on whole px
  goal: 9,              // px, the ring round where the task the top banner shows leads (two cache diamonds and its air)
  crate: 3,             // px, half the square of an authored cargo waiting, on its station's box (SX's K2, 2026-10-14)
  zoomMax: 10 * WORLD_SCALE,   // times the whole-map scale (a planet of 300 u is then a disc about 80 px across, in a world of any scale)
  wheel: 0.0018,        // zoom per px of wheel: a notch (120) is a fifth
  keyZoom: 1.6,         // zoom a second while Q / E is held (e-folds)
  keyPan: 0.7,          // the picture a second while a move key is held, at the whole-map scale
  dragFrom: 4,          // px the pointer must travel with the button down before it is a drag and not a click
});

// The five flags (SX: five colours, one of each). Inks the quests and the locator's own marks do not use for a kind; a
// flag is told on the locator by its shape as much as by its colour. The names are src/flags.js's (what the save and the
// menu say); the inks are drawn here.
const FLAG_INKS = [PALETTE.white, '#8EE3DA', '#EC9AC8', '#C6DA6E', '#F2B89A'];
export const FLAGS = Object.freeze(FLAG_NAMES.map((name, i) => ({ name, ink: FLAG_INKS[i] })));
const NO_FLAGS = Object.freeze(FLAG_NAMES.map(() => null));

const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
const shown = () => SECTORS.filter((s) => !s.hidden);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const EMPTY_LEDGER = { restored: new Set(), invested: new Map(), found: new Map(), reached: new Set(), visited: new Set(), placed: new Map(), told: new Set(), marked: null };
const FIT = Object.freeze({ z: 1, cx: 0.5, cy: 0.5 });
const WHEEL_NOTCH = 120;                      // px of wheel a notch is (MAP.wheel is a zoom a px)

// The flags themselves are the world's (world.flags, src/flags.js: they stand in space, are taken down there and are saved); the
// map puts them down and draws them, and keeps only how a flag just put drifts to where it lands (`landing`, by the flag).
export function createMap() {
  return { open: false, openedAt: 0, pick: 0, landing: new WeakMap(), visited: new Set(), pointer: null, hits: [],
    rows: [], hover: null, layout: null, view: { ...FIT }, press: null, moved: false, heldAt: null, cache: null };
}
export function openMap(map, now) { Object.assign(map, { open: true, openedAt: now, hover: null, view: { ...FIT }, press: null, moved: false, heldAt: null }); }
// Closed, it lets go of the canvas of its static picture (a few MB at a high pixel ratio); opening draws it again.
export function closeMap(map) { map.open = false; map.hover = null; map.press = null; map.cache = null; }
// The sector the pilot is in has been visited (the hidden one is never shown). Kept in the ledger too when it is given
// (the save): the map has to know the sectors again after a reload.
export function noteVisit(map, sectorId, ledger = null) {
  if (!sectorId) return;
  map.visited.add(sectorId);
  ledger?.visited?.add(sectorId);
}

// How a sector is shown, the one place that says (SX, 2026-10-02: sectors will open one by one, a restored ruin opening the
// next, and the map must show that): 'seen' is drawn whole, 'unseen' by its outline and its name only, 'closed' (past the
// frontier, src/frontier.js) by its outline, its name in the quiet ink and CLOSED under it, whether it was visited or not.
// Everything below reads it. Without a world (the editor's own reading) nothing is closed.
export function sectorShown(map, s, world = null) {
  if (world?.ledger && !sectorOpen(world.ledger, s)) return 'closed';
  return map.visited.has(s.id) || world?.ledger?.visited?.has(s.id) ? 'seen' : 'unseen';
}

function wrapText(text, cols) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > cols) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

// ---- what the map reads ----------------------------------------------------------------------------------------------

// The editor's reading of the catalogues, once: its objects by sector and kind (planets, holes, stations, caches, the look
// cache). The map draws them as the editor does; what the pilot knows decides which of them it draws.
let catalogue = null;
function catalogueOf(sectorId) {
  if (!catalogue) {
    catalogue = new Map();
    for (const o of gameLayout().objects) {
      if (!['planet', 'hole', 'station', 'cache', 'look'].includes(o.kind)) continue;
      if (!catalogue.has(o.sector)) catalogue.set(o.sector, { planet: [], hole: [], station: [], cache: [], look: [] });
      catalogue.get(o.sector)[o.kind].push(o);
    }
  }
  return catalogue.get(sectorId) ?? { planet: [], hole: [], station: [], cache: [], look: [] };
}

// A station's kind, what a ruin becomes and its price as this pilot's catalogue has them (src/sectors.js: the start's broken
// station is each pilot's own roll), not as the editor read them when the map first asked.
const liveStation = (o, ledger) => stationDefById(o.id, ledger) ?? { kind: o.props.stationKind, becomes: o.props.becomes, cost: o.props.cost };
// A ruin not yet restored; a restored one is drawn as the station it became, a working one as what it is.
const isRuin = (o, ledger) => liveStation(o, ledger).kind === 'ruin' && !ledger?.restored?.has(o.id);
function stationShape(o, ledger) {
  const def = liveStation(o, ledger), kind = def.kind === 'ruin' && !isRuin(o, ledger) ? def.becomes ?? 'freight' : def.kind;
  if (kind === o.props.stationKind && def.cost === o.props.cost) return o;
  const props = { ...o.props, stationKind: kind };
  if (kind === 'ruin') Object.assign(props, { becomes: def.becomes, cost: def.cost }); else { delete props.becomes; delete props.cost; }
  return { ...o, props };
}
// What is put into a ruin, in the game's number format (SX: «на карте отмечать в какой станции сколько вкинуто»).
export const fundedText = (ledger, o) => `FUNDED ${formatCR(invested(ledger, o.id))} / ${formatCR(liveStation(o, ledger).cost ?? 0)} CR`;
// The same under a ruin's name, as long as the sector's room allows: the whole words when they take no more than half the
// sector's width, else the sum alone, with its unit or without (the column always has the whole words).
export function fundedLabel(ledger, o, room, cellW) {
  const put = formatCR(invested(ledger, o.id)), cost = formatCR(liveStation(o, ledger).cost ?? 0);
  const tiers = [`FUNDED ${put} / ${cost} CR`, `${put} / ${cost} CR`, `${put} / ${cost}`];
  return tiers.find((t) => glyphs(t).length * cellW <= room / 2) ?? tiers[tiers.length - 1];
}

// The caches the pilot knows in a sector (SX: «caches shown only when found or marked»): opened ('taken', a hollow diamond), come
// up to or marked and not opened ('known', filled, in its kind's ink), and the marked one apart ('marked': it blinks).
// The look cache only once its look is the pilot's.
// Each cache as this pilot has it: the editor reads the catalogue's own deal, and a pilot's deal holds another find in the same slot
// (src/rewards.js findsFor, in the slots' order), where it lies for him (src/cachePlaces.js lays a find, when it opens, in any open
// sector): the editor's object with that find in it, moved there, made once per find and place.
let everyCache = null;
const SLOT = new Map(CATALOGUE.map((f, i) => [f.id, i]));
const moved = new Map();
function cacheAt(o, L) {
  const slot = SLOT.get(o.id), def = findsFor(L)[slot];
  if (!def) return o;
  const p = placeOf(def, L);
  if (def === CATALOGUE[slot] && p === def) return o;
  const at = p === def ? o : p, key = `${at.sector}|${at.x}|${at.y}`, was = moved.get(o.id);
  if (was && was.key === key && was.from === def) return was.o;
  const made = { ...o, id: def.id, label: findTitle(def), sector: at.sector, x: at.x, y: at.y,
    props: { ...o.props, cacheKind: def.kind, content: def.content, price: def.price, station: def.station } };
  moved.set(o.id, { key, from: def, o: made });
  return made;
}
export function knownCaches(world, sectorId) {
  const L = world?.ledger ?? EMPTY_LEDGER, cat = catalogueOf(sectorId), out = [];
  if (!everyCache) everyCache = gameLayout().objects.filter((o) => o.kind === 'cache');
  for (const base of everyCache) {
    const o = cacheAt(base, L);
    if (o.sector !== sectorId) continue;
    const taken = L.found.has(o.id), marked = !taken && L.marked === o.id && !!findDef(o.id, L);
    if (taken) out.push({ o, state: 'taken' });
    else if (marked) out.push({ o, state: 'marked' });
    else if (L.reached.has(o.id)) out.push({ o, state: 'known' });
    // One a sector's opening laid, which the pilot was told of (World.openFrontier).
    else if (L.told?.has(o.id)) out.push({ o, state: 'told' });
  }
  for (const o of cat.look) if (world?.pilot?.looks?.has(o.props.look)) out.push({ o, state: 'taken' });
  return out;
}

// ---- where things stand ----------------------------------------------------------------------------------------------

export function clampView(v) {
  const z = clamp(v.z, 1, MAP.zoomMax), m = 0.5 / z;
  return { z, cx: clamp(v.cx, m, 1 - m), cy: clamp(v.cy, m, 1 - m) };
}

// The window, on the organism (labs/graphics/organism.js; SX, 2026-10-16: «легенду слева. А справа карту ... там можно ж крупнее окно взять, но
// выбрать так, чтобы карта хорошо помещалась и стояла также за одной вертикальной полоской только. Но там уже внутри нее сектора разделены»): two
// panes, the column of what the map says at the left (`MAP.side` columns of content), the sectors at the right filling their pane edge to edge
// behind the one upright, as the pause's space fills its own. Each sector a square of whole px (SX: «у карты постоянно теряются контура внутренние.
// Строй ее в таком размере, чтобы они не терялись»): the dashed lines between them stand on whole px, and the sectors' outer lines are the
// window's own (the head's rule, the foot's, the frame's, the upright). As large as the screen allows, an even number of px: the screen's width
// less the column and the windows' inset at its sides, its height less the pad; the window may stand over the cockpit's band as the pilot card
// does. `view` (zoom z, and the middle cx, cy of what shows, as shares of the whole map) moves and scales the sectors inside their pane; the whole
// map is the default. Returns the window (`win`), its `box`, the sectors' `area`, the `sectors` and the `column`'s place.
export function mapLayout(r, view = FIT) {
  const E = ORG.S + 1;                                          // (the screen's edge to the window: the windows' inset)
  const list = shown();
  const across = Math.max(...list.map((s) => s.col)) + 1, down = Math.max(...list.map((s) => s.row)) + 1;
  const probe = new Win(r, { panes: [MAP.side, { px: 1 }] }), colSpan = probe.panes[0].right;
  const fits = Math.min((r.width - 2 * E - colSpan - 2) / across, (r.height - 2 * UI.pad - probe.headRule - 1 - probe.footBand) / down);
  const side = Math.max(2, 2 * Math.floor(fits / 2));
  const win = new Win(r, { panes: [MAP.side, { px: across * side + 1 }], id: 'map' }).body(down * side);
  win.place((w, h) => {
    const at = centredWindow(r, w, h, { clear: false });
    return { x: Math.max(E, Math.min(r.width - w - E, at.x)), y: Math.max(UI.pad, Math.min(r.height - h - UI.pad, at.y)) };
  });
  const inside = win.panes[1].inside, ax0 = inside.x, ay0 = inside.y, ax1 = ax0 + across * side, ay1 = ay0 + down * side;
  const gw = ax1 - ax0, gh = ay1 - ay0, sw_ = gw / across, sh = gh / down, v = clampView(view);
  const sectors = list.map((s) => ({
    s, x: ax0 + gw / 2 + (s.col * sw_ - v.cx * gw) * v.z, y: ay0 + gh / 2 + (s.row * sh - v.cy * gh) * v.z,
    w: sw_ * v.z, h: sh * v.z, kx: sw_ * v.z / W, ky: sh * v.z / H,
  }));
  const col = win.panes[0];
  return { win, x: win.box.x, y: win.box.y, box: win.box, side, across, down, view: v, area: { x0: ax0, y0: ay0, x1: ax1, y1: ay1 }, sectors,
    column: { x: col.cx, w: col.cxr - col.cx } };
}

const at = (cell, ux, uy) => ({ x: cell.x + ux * cell.kx, y: cell.y + uy * cell.ky });
const inArea = (G, x, y) => !!G && x >= G.area.x0 && x < G.area.x1 && y >= G.area.y0 && y < G.area.y1;
const cellAt = (G, x, y) => (inArea(G, x, y) ? G.sectors.find((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) ?? null : null);
// The part of a sector that shows inside the sectors' box, or null.
function visibleOf(cell, area) {
  const x0 = Math.max(cell.x, area.x0), y0 = Math.max(cell.y, area.y0), x1 = Math.min(cell.x + cell.w, area.x1), y1 = Math.min(cell.y + cell.h, area.y1);
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}
const clipTo = (ctx, v) => { ctx.beginPath(); ctx.rect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0); ctx.clip(); };

// ---- moving the picture ----------------------------------------------------------------------------------------------

// The wheel: zoom about the pointer, the point of the map under it staying under it (about the middle when it is off the
// sectors' box).
export function mapWheel(map, x, y, deltaY) {
  const G = map.layout;
  if (!G) return;
  const v = map.view, z2 = clamp(v.z * Math.exp(-deltaY * MAP.wheel), 1, MAP.zoomMax);
  if (z2 === v.z) return;
  const { x0, y0, x1, y1 } = G.area, gw = x1 - x0, gh = y1 - y0;
  const px = inArea(G, x, y) ? x - (x0 + gw / 2) : 0, py = inArea(G, x, y) ? y - (y0 + gh / 2) : 0;
  const gx = px / v.z + v.cx * gw, gy = py / v.z + v.cy * gh;       // the map's point under the pointer, in the whole map's px
  map.view = clampView({ z: z2, cx: (gx - px / z2) / gw, cy: (gy - py / z2) / gh });
}
// Held keys: `x`, `y` -1..1 move the picture, `zoom` -1..1 zooms about its middle; called once a frame (it keeps its own dt).
export function mapMove(map, { x = 0, y = 0, zoom = 0 } = {}, now) {
  const dt = clamp(now - (map.heldAt ?? now), 0, 0.1);
  map.heldAt = now;
  if (!x && !y && !zoom) return;
  const v = map.view, z = zoom ? v.z * Math.exp(zoom * MAP.keyZoom * dt) : v.z;
  map.view = clampView({ z, cx: v.cx + x * MAP.keyPan * dt / z, cy: v.cy + y * MAP.keyPan * dt / z });
}
export function mapFit(map) { map.view = { ...FIT }; }
// A step of the picture for a tap of a move or zoom key, a click on the foot's keys among them (a click presses its key for one frame, which a
// glide turns into next to nothing: SX, 2026-10-16, «все ... кнопки ... кликабельны курсором тоже и выполняли свои действия»): a sixth of what
// shows across or down, or a wheel's notch about the middle; held, the keys glide on (mapMove).
export function mapStep(map, { x = 0, y = 0, zoom = 0 } = {}) {
  const v = map.view, z = zoom ? clamp(v.z * Math.exp(zoom * WHEEL_NOTCH * MAP.wheel), 1, MAP.zoomMax) : v.z;
  map.view = clampView({ z, cx: v.cx + x / (6 * z), cy: v.cy + y / (6 * z) });
}
// The button down on the sectors' box may start a drag; up again ends it. A press that travelled `dragFrom` px is a drag and
// its click puts no flag.
export function mapPress(map, x, y) {
  map.moved = false;
  map.press = inArea(map.layout, x, y) ? { x, y, view: { ...map.view }, moved: false } : null;
}
export function mapRelease(map) { map.press = null; }

// ---- flags -----------------------------------------------------------------------------------------------------------

// Puts the picked flag down near (x, y) on the screen, into `flags` (the world's): where it lands is 200-500 u off in a
// direction of its own, kept inside the sector. Returns the flag, or null when the point is on no sector.
function putFlag(map, flags, x, y, now, rng = Math.random) {
  const cell = cellAt(map.layout, x, y);
  if (!cell) return null;
  const ux = (x - cell.x) / cell.kx, uy = (y - cell.y) / cell.ky;
  const a = rng() * Math.PI * 2, d = MAP.scatter[0] + rng() * (MAP.scatter[1] - MAP.scatter[0]);
  const flag = { sector: cell.s.id, ...flagSpot(ux + Math.cos(a) * d, uy + Math.sin(a) * d) };
  map.landing.set(flag, { from: { x: ux, y: uy }, at: now });
  flags[map.pick] = flag;
  return flag;
}

// A flag: its pole standing on (x, y), its pennant stirring on the clock `t` (s), in `ink`. The map's, the column's and space's (and
// a pop-up's column in another system: labs/graphics/sketches/popups-v2.js).
export function drawFlag(ctx, x, y, ink, t, alpha = 1) {
  const stir = Math.sin(t * 4.2) > 0 ? 1 : 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1;
  const px = Math.round(x) + 0.5, py = Math.round(y);
  ctx.beginPath(); ctx.moveTo(px, py + 0.5); ctx.lineTo(px, py - 11.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px + 0.5, py - 12); ctx.lineTo(px + 8, py - 9 + stir); ctx.lineTo(px + 0.5, py - 6); ctx.closePath(); ctx.fill();
  ctx.fillRect(px - 2.5, py, 5, 1);
  ctx.restore();
}

// ---- drawing ---------------------------------------------------------------------------------------------------------

// Text on a black of its own (the editor's names), `pad` px round it; returns its box.
function labelText(r, s, x, y, ink, pad = 2) {
  const w = glyphs(s).length * r.cellW;
  r.fill(Math.round(x - pad), Math.round(y - pad), Math.round(w + 2 * pad), Math.round(r.cellH + 2 * pad), CONFIG.view.panel);
  r.text(s, Math.round(x), Math.round(y), ink, 1);
  return { x: x - pad, y: y - pad, w: w + 2 * pad, h: r.cellH + 2 * pad };
}

// Where a sector's name stands: inside it, at its top left (SX), the ink of its capitals the air's `inset` in from the
// sector's lines as text in any box; of a sector part off the box (zoomed), at the top left of what shows.
function titleAt(r, vis, s) {
  const m = uiMetrics(r), air = uiAir(r);
  const lx = vis.x0 + air.afterLine(0) - m.capLeft, ly = vis.y0 + air.afterLine(0) - m.capTop;
  const w = glyphs(`${s.label} ${s.name}`).length * r.cellW, pad = 2;
  return { lx, ly, box: { x: lx - pad, y: ly - pad, w: w + 2 * pad, h: r.cellH + 2 * pad } };
}

// The sector's name over its bodies, on its black. The sector the ship is in: its grid lighter and its name white (SX first
// asked for a white frame and a white grid, then: «сделай выделение фрагмента в котором игрок находится как ты сначала
// сделал с белым я переборщил»: the first highlight, the lit grid and the white name); the one under the pointer: its
// name white. NOT VISITED under it when it has not been.
function drawTitle(r, cell, vis, state) {
  const { s } = cell, ctx = r.ctx, seen = state.shown === 'seen', t = titleAt(r, vis, s);
  // A sector zoomed so far off the box that its name does not fit in what shows of it goes without one (a fragment of a name reads as noise).
  if (t.box.x + t.box.w > vis.x1 || t.box.y + t.box.h > vis.y1) return;
  ctx.save();
  clipTo(ctx, vis);
  labelText(r, `${s.label} ${s.name}`, t.lx, t.ly, seen ? CONFIG.hud.color : CONFIG.hud.hint);
  if (seen) r.text(s.label, Math.round(t.lx), Math.round(t.ly), state.lit || state.here ? CONFIG.hud.hot : CONFIG.hud.color, 1);
  if (seen && state.here) r.text(s.name, Math.round(t.lx + (glyphs(s.label).length + 1) * r.cellW), Math.round(t.ly), CONFIG.hud.hot, 1);
  if (!seen) r.text(state.shown === 'closed' ? 'CLOSED' : 'NOT VISITED', Math.round(t.lx), Math.round(t.ly + UI.row), CONFIG.hud.hint, 1);
  ctx.restore();
}

// Where a label `lw` x `lh` may stand by a thing at `p`, its top left corner for each side, `gapX` off the thing across and `gapY`
// up or down: beside it centred (right, left), under or over it centred (below, above), and beside it running down from the
// thing's level or ending at it (right-down, right-up, left-down, left-up).
export function labelSpots(p, lw, lh, gapX, gapY) {
  return {
    right: { x: p.x + gapX, y: p.y - lh / 2 }, left: { x: p.x - gapX - lw, y: p.y - lh / 2 },
    below: { x: p.x - lw / 2, y: p.y + gapY }, above: { x: p.x - lw / 2, y: p.y - gapY - lh },
    'right-down': { x: p.x + gapX, y: p.y }, 'right-up': { x: p.x + gapX, y: p.y - lh },
    'left-down': { x: p.x - gapX - lw, y: p.y }, 'left-up': { x: p.x - gapX - lw, y: p.y - lh },
  };
}

// One label, placed after the bodies so none sits on a disc, a box, the sector's name or another name, and none leaves its
// sector: it tries its own side first (a station's right, a planet's underside), then the others, then the one that covers
// least. `lines` are lines of parts ({ text, ink }); the box taken is kept so the next label keeps off it.
function placeLabel(r, S, lines, p, gapX, gapY, prefer, owner) {
  const { bounds, taken, title } = S;
  const widths = lines.map((parts) => (parts.reduce((n, q) => n + glyphs(q.text).length, 0) + parts.length - 1) * r.cellW);
  const lw = Math.max(...widths), lh = (lines.length - 1) * UI.row + r.cellH;
  const c = labelSpots(p, lw, lh, gapX, gapY);
  const order = prefer === 'below'
    ? ['below', 'above', 'right', 'left', 'right-down', 'left-down', 'right-up', 'left-up']
    : ['right', 'left', 'right-down', 'right-up', 'left-down', 'left-up', 'below', 'above'];
  const inside = (b) => b.x >= bounds.x0 && b.x + b.w <= bounds.x1 && b.y >= bounds.y0 && b.y + b.h <= bounds.y1;
  const overlap = (b) => taken.reduce((n, o) => n + Math.max(0, Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x))
    * Math.max(0, Math.min(b.y + b.h, o.y + o.h) - Math.max(b.y, o.y)), 0);
  // Never over the sector's own name (the first thing taken), unless nowhere else is inside.
  const offTitle = (b) => !(b.x < title.x + title.w && b.x + b.w > title.x && b.y < title.y + title.h && b.y + b.h > title.y);
  const all = order.map((n) => ({ x: Math.round(c[n].x), y: Math.round(c[n].y), w: lw, h: lh })).filter(inside);
  // Nowhere clear beside it (a body under the sector's name): further down, a row at a time.
  if (!all.some((b) => overlap(b) === 0)) {
    for (let k = 1; k <= 3; k++) for (const n of ['below', 'right-down', 'left-down']) {
      const b = { x: Math.round(c[n].x), y: Math.round(c[n].y + k * UI.row), w: lw, h: lh };
      if (inside(b)) all.push(b);
    }
  }
  const boxes = all.some(offTitle) ? all.filter(offTitle) : all;
  const box = boxes.find((b) => overlap(b) === 0) ?? boxes.sort((a2, b2) => overlap(a2) - overlap(b2))[0]
    ?? { x: Math.round(c[order[0]].x), y: Math.round(c[order[0]].y), w: lw, h: lh };
  taken.push({ x: box.x - r.cellW, y: box.y - 1, w: box.w + 2 * r.cellW, h: box.h + 2 });   // a cell's air either side
  const first = [];
  lines.forEach((parts, li) => {
    let x0 = box.x;
    for (const q of parts) {
      labelText(r, q.text, x0, box.y + li * UI.row, q.ink);
      if (li === 0) first.push({ text: q.text, x: x0, y: box.y });
      x0 += (glyphs(q.text).length + 1) * r.cellW;
    }
  });
  S.labels.push({ owner, first });
}

const cacheInk = (o) => (o.props.cacheKind === 'paint' ? INK.amber : INK.souvenir);
const cacheGlyph = (o, state) => (o.kind === 'look' ? 'look' : state === 'taken' ? 'taken' : o.props.cacheKind === 'paint' ? 'paint' : 'souvenir');

// What a sector holds that does not move, drawn on `T` (the canvas of its own, or the screen's when there is none) inside
// the part of the sector that shows: its grid, the bodies, the names. Fills `S.hits` with what the pointer can be on and
// `S.labels` with the names placed.
function paintSector(T, map, world, cell, area, S) {
  const { s } = cell, ctx = T.ctx, ledger = world?.ledger ?? EMPTY_LEDGER;
  const state = sectorShown(map, s, world), seen = state === 'seen', vis = visibleOf(cell, area);
  if (!vis) return;
  S.hits.push({ kind: 'sector', s, seen, shown: state, cell });
  if (!seen) return;
  const here = world?.sector?.id === s.id, cat = catalogueOf(s.id);
  ctx.save();
  clipTo(ctx, vis);
  ctx.lineWidth = 1;
  ctx.strokeStyle = CONFIG.hud.edge;
  ctx.globalAlpha = here ? MAP.gridHere : MAP.gridThere;
  ctx.beginPath();
  for (let u = MAP.grid; u < W; u += MAP.grid) {
    const px = Math.round(cell.x + u * cell.kx) + 0.5, py = Math.round(cell.y + u * cell.ky) + 0.5;
    ctx.moveTo(px, vis.y0); ctx.lineTo(px, vis.y1); ctx.moveTo(vis.x0, py); ctx.lineTo(vis.x1, py);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = T.font; ctx.textBaseline = 'middle';
  const near = (p, e) => p.x + e >= vis.x0 && p.x - e <= vis.x1 && p.y + e >= vis.y0 && p.y - e <= vis.y1;
  const title = titleAt(T, vis, s);
  const taken = [title.box];
  const S2 = { bounds: { x0: vis.x0 + 2, y0: vis.y0 + 2, x1: vis.x1 - 2, y1: vis.y1 - 2 }, taken, title: title.box, labels: S.labels };
  const placed = [];
  // The bodies, as the editor draws them, at true size on this sector's scale.
  for (const o of cat.planet) {
    const p = at(cell, o.x * W, o.y * H), m = objectMetrics(o, cell.kx);
    if (!near(p, m.r + 2)) continue;
    paintObject(ctx, o, p.x, p.y, m, { k: cell.kx });
    taken.push({ x: p.x - m.r, y: p.y - m.r, w: 2 * m.r, h: 2 * m.r });
    S.hits.push({ kind: 'planet', s, def: o, x: p.x, y: p.y, r: m.r });
    placed.push({ kind: 'planet', o, p, m });
  }
  for (const o of cat.hole) {
    const p = at(cell, o.x * W, o.y * H), m = objectMetrics(o, cell.kx);
    if (!near(p, m.r + 2)) continue;
    taken.push({ x: p.x - m.r, y: p.y - m.r, w: 2 * m.r, h: 2 * m.r });   // the ring itself turns each frame (drawSky)
    S.hits.push({ kind: 'hole', s, def: o, x: p.x, y: p.y, r: m.r });
  }
  for (const o of cat.station) {
    const p = at(cell, o.x * W, o.y * H), shape = stationShape(o, ledger), m = objectMetrics(shape, cell.kx, undefined, { lettered: true });
    if (!near(p, Math.max(m.hw, m.hh) + 2)) continue;
    paintObject(ctx, shape, p.x, p.y, m, { k: cell.kx });
    taken.push({ x: p.x - m.hw, y: p.y - m.hh, w: 2 * m.hw, h: 2 * m.hh });
    S.hits.push({ kind: 'station', s, def: o, ruin: isRuin(o, ledger), x: p.x, y: p.y, r: Math.max(m.hw, m.hh) + 2 });
    placed.push({ kind: 'station', o, p, m });
  }
  for (const { o, state: cs } of knownCaches(world, s.id)) {
    const p = at(cell, o.x * W, o.y * H);
    if (!near(p, MAP.cache + 2)) continue;
    taken.push({ x: p.x - MAP.cache, y: p.y - MAP.cache, w: 2 * MAP.cache, h: 2 * MAP.cache });
    S.hits.push({ kind: 'cache', s, def: o, state: cs, x: p.x, y: p.y, r: MAP.cache + 2 });
    if (cs === 'marked') { placed.push({ kind: 'marked', o, p }); continue; }   // blinks: drawn each frame
    glyph(ctx, cacheGlyph(o, cs), p.x, p.y, MAP.cache, o);
  }
  // The names, after the bodies: a station's right, a planet's underside, a marked cache's.
  for (const q of placed) {
    if (q.kind === 'station') {
      const ruin = isRuin(q.o, ledger), home = q.o.props.stationKind === 'home';
      const lines = [[{ text: q.o.label, ink: ruin ? ROLES.caution : home ? PALETTE.green : ROLES.textPrimary }]];
      if (ruin) lines.push([{ text: fundedLabel(ledger, q.o, vis.x1 - vis.x0, T.cellW), ink: PALETTE.amber }]);
      placeLabel(T, S2, lines, q.p, q.m.hw + T.cellW, q.m.hh + 2, 'right', q.o);
    } else if (q.kind === 'planet') {
      placeLabel(T, S2, [[{ text: q.o.label ?? '', ink: ROLES.textSecondary }]], q.p, q.m.r + T.cellW, q.m.r + 2, 'below', q.o);
    } else {
      placeLabel(T, S2, [[{ text: findTitle(findDef(q.o.id, ledger)), ink: cacheInk(q.o) }]], q.p, MAP.cache + T.cellW, MAP.cache + 2, 'right', q.o);
    }
  }
  ctx.restore();
}

// Everything that does not move, once: the grids, the bodies, the names, the dashed lines between the sectors. Drawn on `T` through the same
// renderer calls the screen is.
function paintStatic(T, r, map, world, G, S) {
  const edge = CONFIG.hud.edge, ctx = T.ctx;
  for (const cell of G.sectors) paintSector(T, map, world, cell, G.area, S);
  // Every sector's lines dashed in the frame's blue, at its whole light (SX: «яркость границ секторов можешь оставить»).
  const { x0, y0, x1, y1 } = G.area;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.setLineDash(MAP.dash);
  ctx.beginPath();
  const gw = x1 - x0, gh = y1 - y0, v = G.view;
  // (Only those inside the pane: its edges are the window's own lines, the head's rule, the foot's, the upright and the frame.)
  for (let i = 0; i <= G.across; i++) {
    const x = Math.round(x0 + gw / 2 + (i * gw / G.across - v.cx * gw) * v.z) + 0.5;
    if (x > x0 + 1 && x < x1 - 1) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  }
  for (let j = 0; j <= G.down; j++) {
    const y = Math.round(y0 + gh / 2 + (j * gh / G.down - v.cy * gh) * v.z) + 0.5;
    if (y > y0 + 1 && y < y1 - 1) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  }
  ctx.stroke();
  ctx.restore();
}

// What the static picture shows, as a string: when it changes, the picture is drawn again (the size and place of the panel,
// the view, the sector the ship is in, what each sector shows, the ruins' restoring and funding, the caches opened, come up
// to and marked, the looks owned, the screen's colour look).
function stampOf(r, map, world, G) {
  const L = world?.ledger ?? EMPTY_LEDGER;
  let funds = 0;
  for (const v of L.invested.values()) funds += v;
  return [r.dpr, r.cellW, r.font, G.area.x0, G.area.y0, G.area.x1, G.area.y1, G.view.z.toFixed(4), G.view.cx.toFixed(4), G.view.cy.toFixed(4),
    world?.sector?.id, shown().map((s) => sectorShown(map, s, world)[0]).join(''), L.restored.size, funds, L.found.size, L.reached.size, L.placed?.size ?? 0, L.told?.size ?? 0,
    L.marked, world?.pilot?.looks?.size ?? 0, gradeEpoch(), startRuinOf(L)].join('|');
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return null;
}

// The static picture, blitted from its canvas (drawn again first if its stamp changed); with no canvas to draw on (a Node
// check) it is drawn on the screen's own, every time. Returns what the pointer can be on and the names placed.
function staticPicture(r, map, world, G) {
  const stamp = stampOf(r, map, world, G), { x0, y0, x1, y1 } = G.area, panel = { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 2, h: y1 - y0 + 2 };
  const dpr = r.dpr || 1, ox = Math.floor(panel.x * dpr) / dpr, oy = Math.floor(panel.y * dpr) / dpr;
  const wpx = Math.ceil((panel.x + panel.w - ox) * dpr), hpx = Math.ceil((panel.y + panel.h - oy) * dpr);
  let c = map.cache;
  if (c && c.stamp === stamp) {
    r.ctx.drawImage(c.canvas, ox, oy, wpx / dpr, hpx / dpr);
    return c;
  }
  const canvas = c?.canvas && c.canvas.width === wpx && c.canvas.height === hpx ? c.canvas : makeCanvas(wpx, hpx);
  const S = { hits: [], labels: [] };
  if (!canvas) {
    paintStatic(r, r, map, world, G, S);
    map.cache = null;
    return { hits: S.hits, labels: S.labels };
  }
  const octx = canvas.getContext('2d');
  installGrade(octx);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, canvas.width, canvas.height);
  octx.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
  // The renderer's own calls (fill, text, glyphNow), on this canvas instead of the screen's.
  const T = Object.create(r);
  T.ctx = octx;
  paintStatic(T, r, map, world, G, S);
  map.cache = c = { stamp, canvas, hits: S.hits, labels: S.labels };
  r.ctx.drawImage(canvas, ox, oy, wpx / dpr, hpx / dpr);
  return c;
}

// HOME's terms as CONFIG.home has them (the economy of 2026-10-04): fuel by the CR, the crane free up to its share of the chassis'
// whole hull, then by the point (Codex's text pass UI-01, SX 2026-10-07: «берем все»; it said «10 fuel for 1 CR. Free hull repairs.»).
const homeTerms = () => {
  const H = CONFIG.home;
  return [`Fuel: ${Number((1 / H.fuelPrice).toFixed(2))} units per CR.`, `Free repairs up to ${Math.round(H.freeShare * 100)}% hull.`,
    `Then ${formatCR(H.repairPrice)} CR per hull point.`];
};
// What opening a cache costs this pilot (World.findPrice: nothing for a free claim, the opening's first cache).
const costLine = (price) => (price > 0 ? `Opening it costs ${formatCR(price)} CR.` : 'Opening it costs nothing.');
// What a thing on the map says, for the column: a title in its ink and lines of text.
export function mapWords(hit, world, map = null) {
  const L = world?.ledger ?? EMPTY_LEDGER;
  switch (hit?.kind) {
    case 'sector': {
      const s = hit.s;
      if (hit.shown === 'closed') return { title: `${s.label} ${s.name}`, lines: ['Closed. Restore a ruin to open the next sector.'] };
      if (!hit.seen) return { title: `${s.label} ${s.name}`, lines: ['Unvisited. Enter this sector to reveal its contents.'] };
      const sts = stationsOf(s, world?.ledger);
      const ruins = sts.filter((st) => st.kind === 'ruin' && !isRestored(world?.ledger, st)).map((st) => st.label);
      const working = sts.filter((st) => st.kind !== 'home' && !ruins.includes(st.label)).map((st) => st.label);
      const here = world?.sector?.id === s.id ? ['You are here.'] : [];
      const garage = sts.some((st) => st.kind === 'home');
      // `facts` are the same as rows, for the column's 01 HERE (the window in the Swiss manner); `lines` as they were, for the words.
      return { title: `${s.label} ${s.name}`, lines: [...here, `${s.asteroids ?? 0} asteroids.`,
        working.length ? `Stations: ${working.join(', ')}.` : 'No stations in service.', ...(ruins.length ? [`Ruins: ${ruins.join(', ')}.`] : []),
        ...(garage ? ['Your garage is here.'] : [])],
        facts: [['ASTEROIDS', String(s.asteroids ?? 0)], ['STATIONS', working.length ? working.join(', ') : 'NONE'], ...(ruins.length ? [['RUINS', ruins.join(', ')]] : []),
          ...(garage ? [['GARAGE', 'HERE']] : [])] };
    }
    case 'planet': return { title: hit.def.label ?? 'PLANET', lines: ['Gravity pulls you in. Approach slowly.'] };
    case 'hole': return { title: 'BLACK HOLE', ink: CONFIG.blackHole.color, lines: ['Transit to an open sector. The exit varies.'] };
    case 'station': {
      const st = hit.def, kind = liveStation(st, L).kind;
      if (kind === 'home') return { title: 'HOME', ink: PALETTE.green, lines: homeTerms() };
      // A station a wreck or a raid broke (src/stationService.js) says so and its bill, as its INFO does (UI-03).
      const bill = L.broken?.get(st.id);
      const status = hit.ruin ? `A ruin. ${fundedText(L, st)}.` : bill ? `Damaged. Repair for ${formatCR(bill)} CR.` : kind === 'ruin' ? 'Rebuilt.' : 'Working.';
      return { title: st.label, ink: hit.ruin ? ROLES.caution : ROLES.textPrimary, lines: [status, stationLoreNow(st.id, hit.ruin)] };
    }
    case 'cache': {
      const o = hit.def, def = findDef(o.id, L);
      if (o.kind === 'look') return { title: `${lookById(o.props.look)?.name ?? 'LOOK'} LOOK`, ink: INK.text, lines: ['Look collected. Change it in Graphics or on the pilot card.'] };
      if (hit.state === 'taken') return { title: findLabel(def), ink: cacheInk(o), lines: [`Opened. A ${o.props.cacheKind} cache.`] };
      return { title: findTitle(def), ink: cacheInk(o),
        lines: [hit.state === 'marked' ? 'Cache marked by a station. Approach to open.' : hit.state === 'told' ? 'Cache revealed in this sector. Approach to open.'
          : 'Cache discovered. Not opened.', costLine(world?.findPrice ? world.findPrice(def) : def.price)] };
    }
    case 'ship': return { title: 'YOU', lines: ['Your current position.'] };
    case 'flag': return { title: `FLAG ${hit.i + 1}  ${FLAGS[hit.i].name}`, ink: FLAGS[hit.i].ink,
      lines: ['Fly to this flag to remove it.'] };
    default: return null;
  }
}

// The thing under the pointer: the nearest mark within reach, a flag or the ship before a cache, a station or a body; else
// the sector under it.
function hoverOf(map, G, hits) {
  const p = map.pointer;
  if (!p || !inArea(G, p.x, p.y)) return null;
  const order = ['flag', 'ship', 'cache', 'station', 'hole', 'planet'];
  const near = hits.filter((h) => order.includes(h.kind) && Math.hypot(h.x - p.x, h.y - p.y) <= Math.max(8, h.r ?? 0))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  if (near[0]) return near[0];
  return hits.find((h) => h.kind === 'sector' && p.x >= h.cell.x && p.x < h.cell.x + h.cell.w && p.y >= h.cell.y && p.y < h.cell.y + h.cell.h) ?? null;
}

// The ship, where it is, blinking; a triangle along its heading.
function drawShip(ctx, p, angle, t) {
  ctx.save();
  ctx.globalAlpha = markBlinkAlpha(t);
  ctx.fillStyle = ROLES.textPrimary;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(angle) * 7, p.y + Math.sin(angle) * 7);
  ctx.lineTo(p.x + Math.cos(angle + 2.5) * 5, p.y + Math.sin(angle + 2.5) * 5);
  ctx.lineTo(p.x + Math.cos(angle - 2.5) * 5, p.y + Math.sin(angle - 2.5) * 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// What 03 LEGEND shows: the editor's glyphs (labs/map-editor/view.js glyph), and the ship's own mark.
const LEGEND = Object.freeze([['station', 'STATION'], ['ruin', 'RUIN'], ['planet', 'PLANET'], ['hole', 'HOLE'], ['souvenir', 'CACHE'], ['you', 'YOU'],
  ['cargo', 'CARGO WAITING']]);
// An authored cargo waiting at its station (src/contracts.js authoredWaiting): a square in the cargo pointer's amber (src/palette.js; on the
// map orange is a ruin's), at the station box's top right corner and before each row of 04 CARGO (SX's K2 on
// labs/graphics/sketches/last-cargo.html, 2026-10-14: his friend finished the game with HONEY JARS never taken).
const crate = (r, x, y) => r.fill(Math.round(x - MAP.crate), Math.round(y - MAP.crate), 2 * MAP.crate, 2 * MAP.crate, PALETTE.amber);
// Read again only when the ledger moves on: what is delivered, carried, lost or restored (a row of a menu, never the map, changes them).
function cargoWaiting(map, ledger) {
  const stamp = `${ledger.completed.size}|${ledger.active?.id ?? ''}|${ledger.stranded.size}|${ledger.restored.size}`;
  if (map.cargo?.stamp !== stamp) map.cargo = { stamp, list: authoredWaiting(ledger) };
  return map.cargo.list;
}

export function drawMap(r, map, world, now, { reducedMotion = false, target = null, scheme = 'MK' } = {}) {
  if (!map.open) return;
  const G = mapLayout(r, map.view), ctx = r.ctx;
  map.layout = G;
  map.view = G.view;
  const t = now - map.openedAt;
  const win = G.win.sheet();
  const pic = staticPicture(r, map, world, G);
  const p = map.pointer;
  const under = p ? cellAt(G, p.x, p.y) : null;
  const ledger = world?.ledger ?? EMPTY_LEDGER;
  const flags = world?.flags ?? NO_FLAGS;
  const hits = [...pic.hits];

  // What moves, over the sectors' box only.
  const { x0, y0, x1, y1 } = G.area;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  ctx.font = r.font; ctx.textBaseline = 'middle';
  for (const cell of G.sectors) {
    const vis = visibleOf(cell, G.area);
    if (!vis) continue;
    const state = sectorShown(map, cell.s, world), seen = state === 'seen';
    if (seen) {
      ctx.save();
      clipTo(ctx, vis);
      // The holes' rings turn (the editor's ring, dashed and moving); the marked cache blinks.
      for (const o of catalogueOf(cell.s.id).hole) {
        const q = at(cell, o.x * W, o.y * H), m = objectMetrics(o, cell.kx);
        paintObject(ctx, o, q.x, q.y, m, { k: cell.kx, turn: -(t * MAP.turn * m.r) * (o.props.spinDir ?? 1) });
      }
      for (const { o, state: cs } of knownCaches(world, cell.s.id)) {
        if (cs !== 'marked') continue;
        const q = at(cell, o.x * W, o.y * H);
        ctx.globalAlpha = markBlinkAlpha(t, reducedMotion);
        glyph(ctx, cacheGlyph(o, cs), q.x, q.y, MAP.cache, o);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    drawTitle(r, cell, vis, { shown: state, lit: under === cell, here: world?.sector?.id === cell.s.id });
    // The ship.
    if (seen && world?.sector?.id === cell.s.id && world.ship) {
      const q = at(cell, world.ship.x, world.ship.y);
      if (q.x >= x0 && q.x < x1 && q.y >= y0 && q.y < y1) {
        ctx.save(); clipTo(ctx, vis); drawShip(ctx, q, world.ship.angle ?? -Math.PI / 2, t); ctx.restore();
        hits.push({ kind: 'ship', s: cell.s, x: q.x, y: q.y, r: 8 });
      }
    }
  }
  // The stations an authored cargo waits at: the square on the box.
  // (None while the opening holds the stations' own offers: its menus give only the chapter's freight.)
  const waiting = world?.ledger && !openingHoldsOffers(world) ? cargoWaiting(map, world.ledger) : [], senders = new Set(waiting.map((c) => c.from));
  for (const h of pic.hits) if (h.kind === 'station' && senders.has(h.def.id)) crate(r, h.x + h.r, h.y - h.r);
  // The flags, over every sector, drifting to where they land (one loaded with the save, or put long ago, has landed).
  flags.forEach((f, i) => {
    if (!f) return;
    const cell = G.sectors.find((c) => c.s.id === f.sector);
    if (!cell) return;
    const land = map.landing.get(f), from = land?.from ?? f;
    const u = land ? Math.min(1, (now - land.at) / MAP.landing) : 1, e = 1 - (1 - u) ** 3;
    const q = at(cell, from.x + (f.x - from.x) * e, from.y + (f.y - from.y) * e);
    if (q.x < x0 || q.x >= x1 || q.y < y0 || q.y >= y1) return;
    if (u < 1) {
      const o = at(cell, from.x, from.y);
      ctx.save(); ctx.strokeStyle = FLAGS[i].ink; ctx.globalAlpha = 0.5; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.restore();
    }
    drawFlag(ctx, q.x, q.y, FLAGS[i].ink, now + i);
    hits.push({ kind: 'flag', i, x: q.x, y: q.y - 6, r: 8 });
  });
  // Where the task the top banner shows leads (labs/graphics/screens.js mapTarget, src/tasks.js taskTarget): a ring in the task's ink
  // that breathes as a marked cache blinks, over its sector (chat N1, 2026-10-04: the opening's one objective is on the map as it is on
  // the locator and in the sky; codex/start-and-narrative/ALIGNMENT.md, one selected target).
  const goal = target && G.sectors.find((c) => c.s.id === target.sectorId);
  if (goal) {
    const q = at(goal, target.x * W, target.y * H);
    if (q.x >= x0 && q.x < x1 && q.y >= y0 && q.y < y1) {
      ctx.save(); clipTo(ctx, visibleOf(goal, G.area) ?? G.area);
      ctx.strokeStyle = target.ink ?? ROLES.textPrimary; ctx.lineWidth = 1; ctx.globalAlpha = markBlinkAlpha(t, reducedMotion);
      ctx.beginPath(); ctx.arc(q.x, q.y, MAP.goal, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  map.hits = hits;
  map.hover = hoverOf(map, G, hits);
  const hover = map.hover;
  // The name of the thing under the pointer lights (the editor's: the one hovered is white).
  if (hover?.def) {
    const lab = pic.labels.find((l) => l.owner === hover.def);
    if (lab) for (const q of lab.first) labelText(r, q.text, q.x, q.y, ROLES.textPrimary);
  }
  // The thing under the pointer: the card's corners round it.
  if (hover && hover.kind !== 'sector') {
    const a = MAP.corner, rr = Math.max(6, (hover.r ?? 6) + 3);
    const bx0 = Math.round(hover.x - rr), by0 = Math.round(hover.y - rr), bx1 = Math.round(hover.x + rr), by1 = Math.round(hover.y + rr);
    for (const [px, py, dx, dy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx1, by1, -1, -1], [bx0, by1, 1, -1]]) {
      r.fill(px, py, dx * a, 1, ROLES.textPrimary); r.fill(px, py, 1, dy * a, ROLES.textPrimary);
    }
  }
  // On open space of a sector: the picked flag waits at the pointer, with the ring it can land in.
  if (under && (!hover || hover.kind === 'sector')) {
    const ink = FLAGS[map.pick].ink, vis = visibleOf(under, G.area);
    ctx.save();
    clipTo(ctx, vis);
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.35; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    for (const d of MAP.scatter) { ctx.beginPath(); ctx.arc(p.x, p.y, d * under.kx, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    drawFlag(ctx, p.x, p.y, ink, now + map.pick, 0.6);
  }
  ctx.restore();

  // The window round the picture. The head: MAP, and at the right the sector the ship is in and how many are open.
  const open = world?.ledger ? shown().filter((q) => sectorOpen(world.ledger, q)).length : shown().length, place = sectorLine(world);
  win.head([['MAP', TONE.text]], { meta: [...(place ? [[place, TONE.label]] : []), [`${open}/${shown().length} OPEN`, TONE.faint]] });
  // The column at the left, its parts at fixed rows so it does not jump as the pointer moves: HERE, FLAGS, LEGEND, CARGO, each its name `C` over
  // its rows (the pilot card's way).
  const col = win.panes[0], colX = col.cx, colR = col.cxr, cw = r.cellW, cap = win.cap, tc = col.cols;
  const cx0 = Math.round(colX + cw / 2) + 0.5;                  // a mark's middle in the column's first cell, on the half px its 1 px lines want
  // HERE, or what the pointer is on (its name, in its ink, for a thing; the sector's own figures for a sector).
  const here = G.sectors.find((c) => c.s.id === world?.sector?.id);
  const hereShown = here && sectorShown(map, here.s, world);
  const hit = hover ?? (here ? { kind: 'sector', s: here.s, seen: hereShown === 'seen', shown: hereShown, cell: here } : null);
  const words = mapWords(hit, world, map);
  const mine = !hover || (hover.kind === 'sector' && hover.s.id === world?.sector?.id);
  const kHere = 0, kHereRows = col.next(col.yb(kHere));
  if (words) {
    const facts = words.facts ? (mine ? [['SECTOR', words.title], ...words.facts] : words.facts) : null;
    win.text(mine ? 'HERE' : fitText(words.title, tc), colX, col.y(kHere), mine ? TONE.label : words.ink ?? TONE.text);
    const rows = (facts ?? words.lines.flatMap((l) => wrapText(l, tc))).slice(0, MAP.hereRows);
    rows.forEach((row, i) => {
      const Y = col.y(kHereRows + i);
      if (facts) {
        win.text(row[0], colX, Y, TONE.label);
        win.text(fitText(String(row[1]), tc - glyphs(row[0]).length - 1), colR, Y, TONE.text, { right: true });
      } else win.text(row, colX, Y, TONE.text);
    });
  } else win.text('HERE', colX, col.y(kHere), TONE.label);
  // FLAGS: how many are set, and the five: a key, the flag in its colour, its name and the sector it stands in or NOT SET; the picked one (the
  // keys' choice) and the one under the pointer on the focus bar, a click picks it.
  const kFlags = col.next(col.yb(kHereRows + MAP.hereRows - 1)), set = flags.filter(Boolean).length;
  col.label(kFlags, 'FLAGS', `${set}/${FLAGS.length}`);
  const kFlagRows = col.next(col.yb(kFlags)), rows = [], capW = win.keyWidth('1', null);
  FLAGS.forEach((f, i) => {
    const Y = col.y(kFlagRows + i), box = win.rowBox(colX, colR, Y);
    const where = flags[i] ? SECTORS.find((q) => q.id === flags[i].sector)?.label ?? '' : 'NOT SET';
    rows.push({ kind: 'flag-row', i, box });
    win.item(`flag:${i}`, box, (over) => {
      const lit = over || i === map.pick;
      if (lit) win.bar(colX, colR, Y);
      unnoted(() => win.key(colX, Y, String(i + 1), { plate: lit }));
      drawFlag(ctx, Math.round(colX + capW + cw), Math.round(Y + cap + 1), f.ink, now + i, 1);
      win.text(f.name, colX + capW + 3 * cw, Y, TONE.text, { plate: lit });
      win.text(where, colR, Y, flags[i] ? TONE.text : TONE.faint, { right: true, plate: lit });
    });
  });
  map.rows = rows;
  // LEGEND: what the picture's marks are, as many as the pane has room for (its marks on whole px: SX, «контура ... не терялись»).
  const kLegend = col.next(col.yb(kFlagRows + FLAGS.length - 1)), kLegendRows = col.next(col.yb(kLegend));
  const bottom = win.y0 + win.footRule - ORG.C, fitsRows = (k0) => Math.max(0, Math.floor((bottom - col.yb(k0)) / UI.row) + 1);
  const room = Math.min(LEGEND.length, fitsRows(kLegendRows));
  if (room >= 2) {
    win.text('LEGEND', colX, col.y(kLegend), TONE.label);
    LEGEND.slice(0, room).forEach(([variant, name], i) => {
      const Y = col.y(kLegendRows + i), cy = Math.round(Y + cap / 2) + 0.5;
      if (variant === 'you') drawShip(ctx, { x: cx0, y: cy }, -Math.PI / 2, 0);
      else if (variant === 'cargo') crate(r, cx0, cy);
      else glyph(ctx, variant, cx0, cy, MAP.legend);
      win.text(name, colX + 3 * cw, Y, TONE.label);
    });
  }
  // CARGO: how many authored jobs wait, and each one, its cargo and the station it waits at, as many as the pane has room for.
  const kCargo = col.next(col.yb(kLegendRows + LEGEND.length - 1)), kCargoRows = col.next(col.yb(kCargo)), cargoRoom = Math.min(waiting.length, fitsRows(kCargoRows));
  if (room === LEGEND.length && cargoRoom >= 1) {
    col.label(kCargo, 'CARGO', String(waiting.length));
    waiting.slice(0, cargoRoom).forEach((c, i) => {
      const Y = col.y(kCargoRows + i), from = stationDefById(c.from, ledger)?.label ?? '', n = glyphs(from).length;
      crate(r, cx0, Math.round(Y + cap / 2) + 0.5);
      win.text(fitText(c.label, tc - 3 - n - 1), colX + 3 * cw, Y, TONE.text);
      win.text(from, colR, Y, TONE.label, { right: true });
    });
  }
  // The foot: ESC CLOSE first (TAB, which opens the map, closes it too), then the keys the picture answers to, as the cockpit's caps, each with
  // its words. The keyboard alone (`scheme` K, the hints' scheme, labs/graphics/schemes.js) reads the keys that work for it from the table
  // (Codex's text pass UI-04, SX 2026-10-07: it was taught CLICK, WHEEL and DRAG); the mouse's and MK's say what a click, the wheel and a drag do
  // (words, not keys).
  const capOf = (action) => keyName(action) || action;
  const items = scheme === 'K'
    ? [{ key: keyText(['choices'], { range: FLAGS.length }), words: 'FLAG', id: 'key:flag' }, { key: capOf('confirm'), words: 'PLACE', id: 'key:place' },
      { key: `${keyName('zoomOut')} ${keyName('zoomIn')}`, words: 'ZOOM', id: 'key:zoom' }, { key: ['←', '→', '↑', '↓'].join(' '), words: 'MOVE', id: 'key:move' },
      { key: capOf('fit'), words: 'FIT', id: 'key:fit' }]
    : [{ key: '1-5', words: 'FLAG', id: 'key:flag' }, { key: 'CLICK', words: 'PLACE FLAG NEARBY', plain: true }, { key: 'WHEEL', words: 'ZOOM', plain: true },
      { key: 'DRAG', words: 'MOVE', plain: true }];
  win.foot([{ key: keyName('back') || 'ESC', words: 'CLOSE', id: 'key:back' }], items);
}

// Where the pointer is; what a click there would do: 'pick' on a flag's row, 'flag' on a sector, 'drag' while the picture
// is being moved, else null.
export function mapPoint(map, x, y) {
  map.pointer = { x, y };
  const pr = map.press;
  if (pr && map.layout) {
    if (!pr.moved && Math.hypot(x - pr.x, y - pr.y) >= MAP.dragFrom) pr.moved = true;
    if (pr.moved) {
      map.moved = true;
      const { x0, y0, x1, y1 } = map.layout.area, z = pr.view.z;
      map.view = clampView({ z, cx: pr.view.cx - (x - pr.x) / ((x1 - x0) * z), cy: pr.view.cy - (y - pr.y) / ((y1 - y0) * z) });
      return 'drag';
    }
  }
  const inBox = (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  if ((map.rows ?? []).some((rw) => inBox(rw.box))) return 'pick';
  return cellAt(map.layout, x, y) ? 'flag' : null;
}

// A click: a flag's row picks that flag; a sector puts the picked one down near the point, into `flags` (the world's; the end
// of a drag is no click). Returns what it did.
export function mapClick(map, flags, x, y, now, rng = Math.random) {
  if (map.moved) { map.moved = false; return null; }
  const inBox = (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  const row = (map.rows ?? []).find((rw) => inBox(rw.box));
  if (row) { map.pick = row.i; return 'pick'; }
  return putFlag(map, flags, x, y, now, rng) ? 'flag' : null;
}

// The flags in space (SX, 2026-10-02: «она ставится в реале не прямо на цель а рядом»; 2026-10-03: «Сделать как обещано»): each
// flag of the sector the ship is in, or of a neighbour drawn in place, stands where the map landed it, as the map and the locator
// draw it (the same pole and pennant, the same ink), so the pilot who flies up to take it down sees what he is flying to. Drawn
// over the world, once its glyphs are flushed; the pennant stirs as it does on the map, still with reduced motion.
export function drawWorldFlags(r, world, now, { reducedMotion = false } = {}) {
  world.flags.forEach((f, i) => {
    const at = f && flagInFrame(world, f);
    if (!at) return;
    const p = world.project(r, at.x, at.y);
    if (r.onScreen(p.x, p.y, 24)) drawFlag(r.ctx, p.x, p.y, FLAGS[i].ink, reducedMotion ? 0 : now + i);
  });
}
