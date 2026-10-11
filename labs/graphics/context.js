import { CONFIG } from '../../src/config.js';
import { STAND, shipStands } from '../../src/interaction.js';
import { fitText, overlaps, focusBox } from '../../src/interface.js';
import { UI, FLOAT, floatOffset } from '../../src/uiGrid.js';
import { keycap, KEYCAP_PAD, KEYCAP_RISE } from './ui-parts.js';
import { noteKeycap, unnoted } from './clicks.js';
import { pointerOver, inflate, STICK, withAlpha } from '../../src/hover.js';
import { clamp, easeOut, wrapPi, shownShare } from '../../src/util.js';
import { liftOffset } from '../../src/trick.js';
import { wrap } from '../../src/pilotPanel.js';
import { keyName } from '../../src/controls.js';
import { QUEST_INKS } from '../../src/roles.js';
import { rowTones } from '../../src/menus.js';
import { FIND_COLS } from './find-notice.js';
import { moneyRuns, drawRuns } from '../../src/money.js';
import { W, G, QT, ledger, finish, layoutWindow, paintWindow, lines, leaf, col, sec, len } from './ledger.js';
import { drawGreetOffer, DEFAULT_GREETING } from './greeting.js';

// A menu with words (`target.talk` { name, lines }: an NPC's thanks once its quest is done, src/world.js) is a dialog window:
// the name in the first row, then what it says, as wide as a find's notice's words (SX, 2026-10-02: «в диалоговом окне ...
// что он сказал у него подписан в окошке имя и текст в таком же стиле как нотификация»), then its actions; a click anywhere on
// it does its first, HAND IN («кликом можно закрыть диалог и сдать заданее»).
const TALK_LINES = 5;
function talkLines(talk, columns) {
  const said = talk.lines ?? [];
  return (said.length === 1 ? wrap(said[0], Math.min(FIND_COLS, columns), TALK_LINES) : said.slice(0, TALK_LINES).map((l) => fitText(l, columns))).filter(Boolean);
}

// The widest line a callout holds, in columns: the longest menu line in the game,
// a delivery's subtitle, is 31 (QA, 2026-09-30: COOLANT CELLS -> RELAY 12 / J-05).
const MAX_COLUMNS = 32;

// ------------------------------------------------------------------------------------------------ where a window stands
//
// A dialog window (an object's menu, an NPC's words) stands on an arc round its object: its marks' edge, two insets of air (the gap a
// window keeps from what it is about), then the window, at an angle of its own round the object (SX, 2026-10-07: «сами окна, они не
// летят за нашим кораблем, они аккуратно двигаются во круг элемента с небольшим отступом, причем по такой же дугообразной зоне, и они
// очень медленные, скорее вынуждают корабль подлететь к ним»). Until then (SX's M5+ of 2026-10-04 and his word of 2026-10-06) its
// angle was the bearing from its object to the ship, so it turned round its object as the ship passed; from then until 2026-10-08 it
// was chosen once, as it came, toward the view's middle. Since SX's word of 2026-10-08 (PLATE, below) its goal is again toward the
// ship, every frame: the nearest angle to the bearing from its object to the ship, 10° at a time, where it is whole in the view, off
// what `avoid` holds (the locator's column, the shelf, a notice) and off the hull; where none is off the hull, the nearest that fits.
// It turns there at `drift` rad/s at most (critically damped at `turn`): about 26° a second, 11° a station's. Its place in its object's frame follows on a critically damped spring (`follow`), so it goes where its object
// goes at once, and leaves the view with it (held inside the view, it rode across its object with the camera); its path has no corner
// and no frame jumps. While the hull is under it
// (`under` px deep at least) it keeps its place, opaque, the ship under it; in a jump (the ship's `airborne`, src/trick.js) the same,
// the ship drawn over it (`shipOverPlate`, the page draws the ship again). It comes once its object has been chosen `dwell` s (the
// ship within its menu's reach: src/interaction.js pickCandidate, which keeps it out to CONFIG.interaction.exitTolerance times the
// reach, so it does not flicker at the edge) or the pointer has rested on it as long, in `fadeIn` s sliding `slide` px out from its
// object; a menu closed, or a pause, takes it at once. It floats a row across about its place (src/uiGrid.js FLOAT.window), and holds
// still while the pointer is on it, so a row is not carried out from under the pointer. Its object's marks are read where the object
// is drawn now (src/interface.js focusBox), a station's in its float too (src/float.js).
//
// SX flew it the same day: «рамки слишком далего от объектов, и почему то пролетают над интерфейсом, интерфейс у нас выше всех / и
// вообще они должны пропадать уже к этому моменту». So, since 2026-10-07, evening:
// - Close: its place is the one that keeps it `gap` clear of its marks all round, a slant included (the marks' box grown by its own
//   half and rounded by the gap at the corners). Its reach was the box's support along the bearing, which on a slant past a large
//   box (HOME's marks are 984 x 727 px at 1440 x 900) stood it 46 to 155 px off the marks, and 650 to 760 px from HOME's middle.
// - Under the interface: while its object is on the screen, its place is held inside the room it may stand in (between the helmet's
//   floor and the deck's top, off the column, the quests, the shelf, the radio, the notch's line and a notice), not only when no
//   angle fitted and its object's middle was in the room: HOME's middle above the helmet's floor let it down onto the deck. And the
//   page draws the windows and the marks before the interface (main.js), so the interface is over them whatever they do.
// - Only while the ship stands: it comes once its object has been chosen (or pointed) `dwell` s on end with the ship at or under the
//   dock's speed (`stand`, CONFIG.station.dockSpeed, 200 u/s: the speed a station takes the ship at, its DOCK greyed above it), and
//   goes in `fadeOut` s as soon as the ship is past it by the selection's band (CONFIG.interaction.exitTolerance, 236 u/s) or out of
//   its object's reach by that band (731 u for a station). It lingered 0.6 s, whatever the ship did, until then.
//
// A station's window, HOME's too, is steadier still (SX, 2026-10-07, after flying them: «РАмки неплохо вокруг станций летают сейчас ...
// контекстное меню вокруг станции может быть еще менее подвижным»): `station` holds its own turn, drift and follow, the others' as they
// are. Whether a window is a station's is read once, as it comes (its memory's `steady`).
//
// Whether the ship stands is the one rule the quest list's fold and the marks of what is near read too (src/interaction.js shipStands,
// SX's «MARKS: A1, B1, C0», 2026-10-07): `stand` and `dwell` are its numbers, read here, not copied.
// SX, 2026-10-08, after greeting a ship: «окна которые возле нпс возникают должны быть подальше от их центра, плюс они как бы всегда должны
// в сторону нашего корабля тянуться, но не перекрывать его, тоже самое стоит сделать с логикой других контекстных окон». So every window
// leans toward the ship again, kept off its hull: its angle's goal is, every frame, the nearest angle to the bearing from its object to
// the ship where it fits off the hull (it was chosen once as it came, toward the view's middle, 2026-10-07), turning there at `drift`
// (0.45 rad/s, 0.2 a station's: 0.15 and 0.06 until then, too slow to follow a ship that went round); and a window that is not a
// station's stands `far` gaps off its object's marks (two; a station's one).
export const PLATE = Object.freeze({ gap: 2 * UI.air.inset, far: 2, margin: 12, dwell: STAND.dwell, turn: 1.2, drift: 0.45, follow: 3, under: 8, clear: 4,
  tries: 36, fadeIn: 0.25, fadeOut: 0.25, slide: 12, stand: STAND.speed,
  station: Object.freeze({ turn: 0.6, drift: 0.2, follow: 2, far: 1 }) });
const BEARING_STEP = Math.PI / 18;
const soft = (v) => Math.sqrt(v * v + 0.0025);      // |v|, rounded at 0 so the reach along the bearing has no corner at an axis
const seedOf = (id) => Array.from(String(id)).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// Each window's memory, by its object's id: its bearing and its turn's rate, its place and velocity, when it came, what it drew, and
// whether it is a station's (`steady`: PLATE.station's motion).
const plates = new Map();
// Whether `id` is one of the sector's stations (HOME and a ruin among them).
function isStation(world, id) {
  for (const s of world.stations ?? []) if (s.id === id) return true;
  return false;
}
const FORGET = 2;                                   // s of the world's time a window not drawn keeps its memory

// The ship's hull on the screen, as the windows keep off it: the square round its drawing.
function hullBox(r, world) {
  const ship = world.ship, at = world.project(r, ship.x, ship.y);
  let half = 24;
  if (ship?.alive && ship.model) {
    const mt = ship.metrics || ship.measureDrawing(r.cellW, r.cellH);
    half = Math.max(ship.model.width * mt.w, ship.model.height * mt.h) / 2;
  }
  return { at, box: { x: at.x - half, y: at.y - half, w: 2 * half, h: 2 * half } };
}
// A box off what `avoid` holds: pushed past it sideways, away from the side of the view it stands at.
function offAvoid(view, b, avoid, m = PLATE.margin) {
  const out = { ...b };
  for (const a of avoid) {
    if (!overlaps(out, a, 0)) continue;
    out.x = a.x + a.w / 2 < view.x + view.w / 2 ? Math.max(out.x, a.x + a.w + m) : Math.min(out.x, a.x - m - out.w);
  }
  return out;
}

// One step of the window about `target`, `w` x `h`: where it stands now. `t` the world's time.
function stepPlace(r, world, target, w, h, avoid, { live = true, still = false, area = null } = {}) {
  const t = world.time ?? 0, v = r.view;
  let it = plates.get(target.id);
  if (!it) plates.set(target.id, (it = { a: null, av: 0, goal: null, rel: null, relV: null, pos: null, at: t, born: t, box: null, marks: null, held: false,
    steady: isStation(world, target.id) }));
  const M = it.steady ? PLATE.station : PLATE;
  const dt = clamp(t - it.at, 0, 0.1);
  it.at = t; it.seen = t;
  const marks = focusBox(r, world, target), { box: hull, at: shipAt } = hullBox(r, world);
  it.marks = marks; it.hull = hull;
  const f = floatOffset(t - it.born, FLOAT.window, seedOf(target.id));
  // The pointer on it: it holds still where it was drawn, and is kept there in its object's frame, so the spring brings it back from
  // there once the pointer has left.
  if (live && it.box && it.box.w === w && it.box.h === h && pointerOver(inflate(it.box, STICK))) {
    it.rel = { x: it.box.x - f.x - marks.x, y: it.box.y - f.y - marks.y }; it.relV = { x: 0, y: 0 };
    return { ...it.box, held: true };
  }
  const c = { x: marks.x + marks.w / 2, y: marks.y + marks.h / 2 };
  // Its place at angle `a` round its object: out along the bearing past the marks' extent that way, the gap, then its own half (the
  // reach it always had, smooth as the bearing turns), then drawn in to stand `gap` clear of the marks, its nearest place that is:
  // its middle `gap` off the marks' box grown by its own half. Straight out the two are one; on a slant past a large box the reach
  // alone overshot the box's corner (HOME's marks are 984 x 727 px at 1440 x 900: 46 to 155 px off them). Drawn in, it moves no
  // faster than its reach does, and its path has no corner.
  const hx = (marks.w + w) / 2, hy = (marks.h + h) / 2, g = PLATE.gap * M.far;
  const along = (a) => {
    const ux = Math.cos(a), uy = Math.sin(a), reach = soft(ux) * hx + soft(uy) * hy + g;
    const qx = ux * reach, qy = uy * reach, px = clamp(qx, -hx, hx), py = clamp(qy, -hy, hy), d = Math.hypot(qx - px, qy - py) || 1;
    return { x: c.x + px + (qx - px) * g / d - w / 2, y: c.y + py + (qy - py) * g / d - h / 2, w, h };
  };
  // Whether its place at angle `a` fits: whole in the room it may stand in (the view, between the helmet's floor and the deck's top
  // where the page says: rim-marks.js playArea), off `avoid`, and (as it comes) off the hull.
  const room = area ? { x: v.x, y: area.y0, w: v.w, h: area.y1 - area.y0 } : v;
  const fits = (a, offHull) => {
    const b = along(a);
    return shownShare(room, b, PLATE.margin) > 0.999 && !avoid.some((q) => overlaps(b, q)) && !(offHull && overlaps(b, hull, PLATE.clear));
  };
  const nearest = (from, offHull) => {
    for (let k = 0; k <= PLATE.tries; k++) {
      const a = from + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * BEARING_STEP;
      if (fits(a, offHull)) return a;
    }
    return null;
  };
  // Toward the ship, off its hull: the nearest angle to the bearing from its object to the ship that fits clear of the hull; where none
  // does, the nearest that fits at all, from where it stands; where nothing fits, its goal stays.
  const toShip = Math.atan2(shipAt.y - c.y, shipAt.x - c.x);
  const g0 = nearest(toShip, true) ?? (it.goal != null && fits(it.goal, false) ? it.goal : nearest(it.a ?? toShip, false));
  it.stuck = g0 == null;
  if (g0 != null) it.goal = g0; else if (it.goal == null) it.goal = toShip;
  if (it.a == null || still) { it.a = it.goal; it.av = 0; }
  const W = M.turn, err = wrapPi(it.goal - it.a);
  it.av = clamp(it.av + (W * W * err - 2 * W * it.av) * dt, -M.drift, M.drift);
  it.a += it.av * dt;
  // Its place kept in its object's frame (`rel`, from the marks' top left, and its rate `relV`), so it goes where its object goes at once.
  // Where its place lies on what `avoid` holds (its object behind the column, no angle round it clear), pushed past it sideways. While
  // its object's marks are on the screen at all, it is held between the room's top and bottom (the helmet's floor, the deck's top: the
  // renderer's view stops at the top strip and the cockpit's band in any case), so it never stands on the deck or the helmet: HOME,
  // its middle above the helmet's floor and no angle round it whole in the room, let it down onto the deck. Across, it goes out of the
  // view with its object, as before, unless no angle fits and its object's middle is in the room (a station the size of the screen,
  // docked in): held there as the ship flew on, it rode over its object with the camera.
  let goal = offAvoid(v, along(it.a), avoid);
  if (overlaps(marks, v, 0)) {
    const m = PLATE.margin, across = it.stuck && c.x > room.x && c.x < room.x + room.w && c.y > room.y && c.y < room.y + room.h;
    goal = offAvoid(v, { ...goal, x: across ? clamp(goal.x, room.x + m, room.x + room.w - m - w) : goal.x,
      y: clamp(goal.y, room.y + m, Math.max(room.y + m, room.y + room.h - m - h)) }, avoid);
  }
  const to = { x: goal.x - marks.x, y: goal.y - marks.y };
  if (!it.rel || still) { it.rel = to; it.relV = { x: 0, y: 0 }; }
  // Under the hull (`under` px deep, not a corner grazing it), or the ship up in a jump: it keeps its place by its object.
  it.held = !!world.ship?.airborne || overlaps({ x: marks.x + it.rel.x, y: marks.y + it.rel.y, w, h }, hull, -PLATE.under);
  if (it.held) it.relV = { x: 0, y: 0 };
  else if (!still) {
    // The offset from the marks eased toward its place's.
    const F = M.follow, rel = it.rel, relV = it.relV;
    relV.x += (F * F * (to.x - rel.x) - 2 * F * relV.x) * dt;
    relV.y += (F * F * (to.y - rel.y) - 2 * F * relV.y) * dt;
    rel.x += relV.x * dt; rel.y += relV.y * dt;
  }
  it.pos = { x: marks.x + it.rel.x, y: marks.y + it.rel.y };
  return { x: it.pos.x + f.x, y: it.pos.y + f.y, w, h, held: false, a: it.a };
}

// The selected object's actions as a window, in the menus' look (labs/graphics/ledger.js; SX's V2 on labs/graphics/sketches/
// menus-ledger.html, 2026-10-05, the station and NPC menus included: «ты не добавил вариант как выглядят менюшки станций и нпс»): the
// sheet, its head the title over what the object is (the subtitle's parts a middle dot apart), or a talk's name over its words, a
// hairline, then the actions, each a keycap with its number and its words, CLOSE last. A row of a quest has its keycap's frame, and only
// its frame, in the quest's ink (src/menus.js rowTones, src/roles.js QUEST_INKS; SX, 2026-10-06: «рамочку кнопки подписывать в цвет типа
// квеста», then «покрасить в цвет квестов только рамки цифр остальное белым оставить, суммы можно желтым»): its number and its words
// stay white, gray when the row is greyed; a row of none keeps the cap's structure blue (so a blue quest's errand reads as today's).
//
// One row an action (SX, 2026-10-01: «в такой менюшке ... все действия должны быть в одну строку,
// принимаю только исключения для грузов»): what an action's note says stands on its own row, after its
// words in the quieter ink (REFUEL  59 FUEL / 59 CR), cut to the window's width. A note that only says the
// wallet is short (NEED 500 CR, HAVE 430; SX struck them) is not shown: the action is greyed, its price is
// in its words, and pressing it says what is missing. A cargo's action (`cargo`) keeps its note on the row
// under its words: a cargo's size, pay and time, or where it is bound. Every amount of money, in a row's words or its note, in the coin's
// rim gold (S4, src/money.js); a greyed action's price stays grey (the wallet cannot cover it).
//
// `live`: its keys answer clicks and its rows come up under the pointer; a window going away does neither. `far`: its object is out
// of the ship's reach, and its rows, which act only beside it, stand in the quiet ink (SX on a hovered station far off, 2026-10-04:
// its «1 DOCK» grey until the ship is near enough). Returns the window's context and its layout, measured before it is placed.
const shortOfCredits = (note) => /^NEED [\d,]+ CR, HAVE /.test(note || '');
function plateLayout(r, world, target, { live = true, far = false } = {}) {
  const w = ledger(r, { id: `menu:${target.id ?? target.title}`, live }), { cw } = w, v = r.view, m = PLATE.margin;
  const columns = Math.min(MAX_COLUMNS, Math.floor((v.w - 2 * m) / cw) - 4);
  const rows = [], tones = rowTones(world, target);
  target.actions.slice(0, CONFIG.interaction.maxActions).forEach((action, i) => {
    const note = action.note && !shortOfCredits(action.note) ? action.note : null;
    rows.push({ key: String(i + 1), label: action.label, disabled: action.disabled, inline: action.cargo ? null : note, cap: QUEST_INKS[tones[i]] });
    if (note && action.cargo) rows.push({ key: '', label: note });
  });
  // A docked ship's menu is its way out and cannot be dismissed (labs/graphics/input-router.js), so it offers no CLOSE.
  if (!world.docked) rows.push({ key: keyName('close') || '0', label: 'CLOSE', quiet: true });
  // Each row's words cut to the window's measure: the keycap and a cell after it, then the words, the note two cells on.
  const room = columns - 2;
  for (const rw of rows) {
    rw.label = fitText(rw.label, room);
    const left = room - len(rw.label) - 2;
    rw.inline = rw.inline && left >= 4 ? fitText(rw.inline, left) : null;
  }
  const colsOf = (rw) => 2 + len(rw.label) + (rw.inline ? 2 + len(rw.inline) : 0);
  const actions = leaf('keys', KEYCAP_PAD + Math.max(...rows.map(colsOf)) * cw, (rows.length - 1) * UI.row + r.cellH + KEYCAP_RISE + 1, (x, y, ww) => {
    rows.forEach((rw, k) => {
      const textTop = y + KEYCAP_RISE + k * UI.row;
      const muted = rw.disabled || rw.quiet, plain = !muted && !far, noteInk = far ? QT : G;
      const runs = (text) => (plain ? moneyRuns(text, noteInk) : [[text, noteInk]]);
      if (!rw.key) { drawRuns(w.r, runs(rw.label), x + KEYCAP_PAD + 2 * cw, textTop); return; }
      const under = rows[k + 1] && !rows[k + 1].key ? 1 : 0;
      // Each action is a button from its keycap to the window's text edge, a cargo's note under it with it (SX, 2026-10-03: the
      // mouse reaches every element): it answers a click as its key, and comes up under the pointer (src/hover.js).
      const box = { x, y: textTop - KEYCAP_RISE, w: ww, h: (1 + under) * UI.row };
      if (live) noteKeycap(rw.key, box);
      w.item(`act:${rw.key}`, box, (on) => {
        // The quest's ink on the cap's frame only (a repair the story asks for, src/menus.js litRepair, is the story's purple there too).
        const ink = far ? QT : muted && !on ? G : W;
        const next = keycap(w.r, rw.key, x + KEYCAP_PAD, textTop, { reach: 0, ink, ...(rw.cap ? { cap: rw.cap } : {}) });
        drawRuns(w.r, plain ? moneyRuns(rw.label, ink) : [[rw.label, ink]], next, textTop);
        if (rw.inline) drawRuns(w.r, runs(rw.inline), next + (len(rw.label) + 2) * cw, textTop);
        if (under) drawRuns(w.r, runs(rows[k + 1].label), next, textTop + UI.row);
      });
    });
  });
  const head = target.talk
    ? { title: fitText(target.talk.name, columns) }
    : { title: fitText(target.title, columns), sub: moneyRuns(fitText(String(target.subtitle ?? '').replace(/\s{2,}/g, ' · '), columns), G) };
  if (head.sub && !head.sub.some(([s]) => s.trim())) delete head.sub;
  const said = target.talk ? lines(w, talkLines(target.talk, columns).map((s) => ({ l: [[s, G]] }))) : null;
  const laid = layoutWindow(w, { ...head, tree: col(sec(said), sec(actions)) });
  return { w, laid, rows, blockW: laid.w, blockH: laid.h };
}

// The window drawn at (x, y), on whole px: a talk answers a click anywhere on it as its first action (its rows, noted after, answer
// as themselves). Returns its rect at its place as eased, not rounded (what the window's path and the pointer's hold read).
function paintPlate(r, target, L, x, y, live) {
  if (live && target.talk && L.rows[0]?.key) noteKeycap(L.rows[0].key, { x: Math.round(x), y: Math.round(y), w: L.laid.w, h: L.laid.h });
  const box = paintWindow(L.w, L.laid, x, y);
  finish(L.w);
  return { ...box, x, y };
}

// The window about `target` drawn now, whole, at its place on the bearing (its memory stepped by the world's time). Returns the
// occupied rect.
export function drawLabContext(r, world, target, avoid = []) {
  const L = plateLayout(r, world, target);
  const at = stepPlace(r, world, target, L.blockW, L.blockH, avoid);
  const box = paintPlate(r, target, L, at.x, at.y, true);
  plates.get(target.id).box = box;
  return box;
}

// ------------------------------------------------------------------------------------------------ the windows, coming and going

// The hull as it is drawn up in a jump: lifted toward the light and grown (src/trick.js liftOffset, the page's stunt-fx.js).
function liftedHull(ship, hull) {
  const lift = liftOffset(ship.air ?? 0, ship.radius ?? 0), cx = hull.x + hull.w / 2 + lift.dx, cy = hull.y + hull.h / 2 + lift.dy;
  return { x: cx - hull.w / 2 * lift.grow, y: cy - hull.h / 2 * lift.grow, w: hull.w * lift.grow, h: hull.h * lift.grow };
}

// Whether the ship is within `target`'s reach (its menu's: src/interaction.js pickCandidate's `interactRadius`); a window with no reach
// of its own always is.
function inReach(world, target) {
  const ship = world.ship;
  if (!ship || !Number.isFinite(target?.interactRadius)) return true;
  const d = world.delta ? world.delta(target.x, target.y, ship.x, ship.y) : { x: target.x - ship.x, y: target.y - ship.y };
  return Math.hypot(d.x, d.y) <= target.interactRadius;
}

// Each window's presence by its object's id: { target, p (0..1 shown), born, at }.
const shown = new Map();
// Since when each object is wanted whose window has not come yet (PLATE.dwell), by its id.
const waiting = new Map();
let over = false;
// Whether the ship, up in a jump, is drawn over a window this frame (the page draws it again over the window: main.js).
export const shipOverPlate = () => over;

// The game's windows: the one about `target` (the chosen object whose menu is open, or null) comes and stays while the ship stands, the
// one before it goes. `hover`: the window of what the pointer is over (labs/graphics/world-pointer.js pointedMenu; SX, 2026-10-04:
// «давай просто при ховере контекстное окно показывать»), or null: it comes and stays as the menu's does, and goes as the windows go
// once the pointer has left or the ship moves, but it is shown, not used (its rows answer no click), and keeps off the menu's window when
// both stand.
// `dismissed`: the menu was closed (or a pause stands): every window but the hover's goes at once. `reducedMotion`: they come and
// go at once and stand at their place. A friendly ship's (its candidate's `greet`) is no window: its offer in `greeting`'s style
// (labs/graphics/greeting.js, GAMEPLAY's GREETING) comes and goes as a window would. Returns the rects they occupy.
export function drawContextPlates(r, world, target, avoid = [], { dismissed = false, reducedMotion = false, hover = null, area = null, greeting = DEFAULT_GREETING } = {}) {
  const t = world.time ?? 0, out = [];
  over = false;
  if (hover && target && hover.id === target.id) hover = null;           // the open menu is that window already
  if (dismissed) for (const id of [...shown.keys()]) if (id !== hover?.id) { shown.delete(id); plates.delete(id); }
  // A window not standing comes once its object has been wanted (chosen, or under the pointer) PLATE.dwell s on end ...
  for (const id of [...waiting.keys()]) if (id !== target?.id && id !== hover?.id) waiting.delete(id);
  const ripe = (want) => {
    if (!want || shown.has(want.id)) return want;
    if (!waiting.has(want.id)) waiting.set(want.id, t);
    return t - waiting.get(want.id) >= PLATE.dwell - 1e-9 ? want : null;
  };
  target = ripe(target); hover = ripe(hover);
  // ... and only while the ship stands (SX, 2026-10-07: «только если ты 0,5 секунды в непосредственной близости к предмету контакта
  // стоишь»): src/interaction.js shipStands, the moment the corners on what is near close in (B1).
  if (!shipStands(world).on) { target = null; hover = null; }
  for (const want of [target, hover]) if (want && !shown.has(want.id)) shown.set(want.id, { target: want, p: 0, born: t, at: t });
  for (const [id, s] of shown) {
    const live = !!target && target.id === id, hovered = !live && !!hover && hover.id === id, chosen = live || hovered;
    if (chosen) s.target = live ? target : hover;
    const dt = clamp(t - s.at, 0, 0.1);
    s.at = t;
    if (chosen) s.p = reducedMotion ? 1 : Math.min(1, s.p + Math.max(dt, s.p ? 0 : 1 / 60) / PLATE.fadeIn);
    else s.p = reducedMotion ? 0 : Math.max(0, s.p - dt / PLATE.fadeOut);
    if (s.p <= 0) { shown.delete(id); plates.delete(id); continue; }
    const far = hovered && !inReach(world, s.target);           // (a window lingering after its menu keeps its ink as it goes)
    if (s.target.greet) {
      const box = drawGreetOffer(r, world, s.target, reducedMotion ? 1 : easeOut(s.p), { live, far, style: greeting, reducedMotion });
      if (box) out.push(box);
      continue;
    }
    const L = plateLayout(r, world, s.target, { live, far });
    // The hover's window keeps off the others where they were last drawn (the menu's among them), as it keeps off the column.
    const keepOff = hovered ? [...avoid, ...[...shown.keys()].filter((o) => o !== id).map((o) => plates.get(o)?.box).filter(Boolean)] : avoid;
    const at = stepPlace(r, world, s.target, L.blockW, L.blockH, keepOff, { live, still: reducedMotion, area });
    // Coming, it slides out from its object along its bearing.
    const it = plates.get(id), slide = reducedMotion || at.held ? 0 : PLATE.slide * (1 - easeOut(clamp((t - s.born) / PLATE.fadeIn, 0, 1)));
    const x = at.x - Math.cos(it.a ?? 0) * slide, y = at.y - Math.sin(it.a ?? 0) * slide;
    const alpha = reducedMotion ? 1 : easeOut(s.p);
    const box = withAlpha(r.ctx, alpha, () => (live ? paintPlate(r, s.target, L, x, y, true) : unnoted(() => paintPlate(r, s.target, L, x, y, false))));
    it.box = box;
    if (world.ship?.airborne && overlaps(box, liftedHull(world.ship, it.hull), 0)) over = true;
    out.push(box);
  }
  for (const [id, it] of plates) if (!shown.has(id) && t - (it.seen ?? t) > FORGET) plates.delete(id);
  return out;
}
