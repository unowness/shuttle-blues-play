// The modern interface (SX, 2026-10-16, after a day of boards on labs/graphics/sketches/front-tryon.html, his V14 RAILS: «Короче, да, окей
// ... сделай в настройках переключение интерфейса Modern. Это вот этот Modern, он по умолчанию. Legacy — это старый интерфейс. И сделай там же
// возможность переключать карту с круглой на квадратную. По умолчанию квадратную»). The flight's interface worn as a helmet's: no deck, two
// notches at the screen's top and bottom, the gauges running on from their shoulders, the corners holding the rest.
//
// Two lines a side. The edge line, the margin in from the screen's top and bottom edges (28, SX's): the notches' shoulders, the gauges'
// cubes, the charm's mount, the key rows' keycaps. The text line, S inside the cubes: every word along the edge on it (the task's line in
// the top notch, the gauges' words, BRAKES in the bottom notch, the key rows B, M, R and T). The air is the windows' (labs/graphics/
// organism.js ORG: S from a line to its words, C from a line to content and from a block to the next).
//   The notches: each a floor C past its words' capitals and C past their ends, its walls S curves to the edge line, its line ending there,
//     open; black inside; worn as the deck wears (cockpit-fx.js). The top one holds the task's line (helmet.js NOTCH_MODE: the notices draw
//     it there and the banners hang under it); the bottom one BRAKES.
//   The gauges: as wide as the bottom notch stands at its words' height, S past the notches' line, rows of cubes as tall as the notch's line,
//     no line of their own: HULL and FUEL beside the top notch, RET and THR (from a zero mark at its middle) and SPD beside the bottom one;
//     each its word at its outer end and its number by the notch (THR and SPD by it); in colour sections.
//   The stations being built (tracker.js, its rows hanging down: each its bar, S, its words, C to the next) in the top left corner under
//     their B row, as wide as the locator; the locator (locator.js drawModernScope, round or square) in the bottom left corner, its M row and
//     the wallet under it, its legend's rows over it while shown; the radio (radio.js drawRadioModern) in the bottom right corner, its T row
//     under it, the quests over it under their R row; the charm on a reel in a small mount on the edge line at the right column's axis.
//
// It breaks as the deck did (SX: «новый интерфейс тоже как бы ломаться должен ... Вниз отрывается брелок, падает под квесты. Куда-то в бок
// экрана улетает, в зависимости от того, поворачиваем мы или нет ... локатор тоже внешний край ломается с внутренним ... при столкновениях
// весь интерфейс трясется»; then «радио не падает ... радио на месте остается, у него просто контур ломается ... лампочки пропадают»;
// «учелок изгибы тоже сломать»; «на последних 30% из шкал пропадают квадратики рандомные ... как будто ... погасшие»): under BREAK.at of the
// hull the charm tears off its cord and falls (under the quests), thrown aside by the ship's turn, whole again above BREAK.mend or back from a
// wreck; the radio's holes go dark and its line breaks where it stands (radio.js), the locator's rings break, the notches wear and their
// walls break too, under BREAK.dead the gauges' cubes go out here and there; the page shakes all of it. Since 2026-10-16 (SX: «локатор во
// время аварии разрушался побольше. Ну и радио в целом тоже. Например, вот этот диск может отвалиться да, в какой-то момент на 10%»): the
// radio's wheel tears off with the charm under BREAK.at and falls, hopping off its socket, whole again with it; at a wreck (the deck's break
// standing, cockpit-fx.js cockpitCrack) a crack runs across the locator's glass and its contour breaks all round (locator.js), the radio's
// lamp goes out and most of its holes, its line broken all along (radio.js).
import { ROLES } from '../../src/roles.js';
import { PALETTE } from '../../src/palette.js';
import { UI, uiMetrics } from '../../src/uiGrid.js';
import { clamp, dimToContrast, noise3 } from '../../src/util.js';
import { keyName } from '../../src/controls.js';
import { readInterface, writeInterface, readMapShape, writeMapShape } from '../../src/prefs.js';
import { drawSouvenirPicture } from '../../src/souvenirPictures.js';
import { ORG } from './organism.js';
import { BAR } from './cockpit-bar.js';
import { drawWear, cockpitSpots, cockpitSeed, cockpitLevel, cockpitLight, cockpitCrack, barLengths, glintPaths } from './cockpit-fx.js';
import { barLook, BAR_EDGE } from './meter-bar.js';
import { drawBrake, BRAKE_LABEL, BRAKE_OPEN } from './hud.js';
import { buttonInk, columnLayout, drawColumnButton, drawModernScope, drawLegendRowsAt, LEGEND_ROW_COUNT, MODERN_SCOPE } from './locator.js';
import { drawQuestBoard, questGeometry, QUEST_FRAME } from './quest-list.js';
import { drawRadioModern, RADIO_MODERN, radioSize, wheelModern } from './radio.js';
import { drawTracker } from './tracker.js';
import { drawWallet } from './souvenir-shelf.js';
import { drawCharm, hungCharm, CHARM, HANG, charmPlace } from './charm.js';
import { KEY_MARK_HALF, KEYCAP_PAD } from './ui-parts.js';
import { sidePlaces } from './hud-sides.js';
import { NOTCH_MODE } from './helmet.js';
import { noteKey } from './clicks.js';

// ------------------------------------------------------------------------------------------------ the choice

export const INTERFACES = Object.freeze(['modern', 'legacy']);
export const INTERFACE_NAMES = Object.freeze({ modern: 'MODERN', legacy: 'LEGACY' });
export const MAP_SHAPES = Object.freeze(['square', 'round']);
export const MAP_SHAPE_NAMES = Object.freeze({ square: 'SQUARE', round: 'ROUND' });
// The page's one choice (kept in this browser, src/prefs.js), every field declared here.
export function createInterface(store) {
  return { style: readInterface(INTERFACES, store), map: readMapShape(MAP_SHAPES, store) };
}
export function setInterface(ui, style, store) {
  if (!INTERFACES.includes(style)) return;
  ui.style = style;
  writeInterface(style, store);
}
export function setMapShape(ui, shape, store) {
  if (!MAP_SHAPES.includes(shape)) return;
  ui.map = shape;
  writeMapShape(shape, store);
}

// ------------------------------------------------------------------------------------------------ the numbers

// `margin` the edge line from the screen's top and bottom (SX: «сделай отступ пожалуйста 28»); `side` the corners' blocks (the stations,
// the locator, the radio, the quests, the charm's mount and their key rows) from the screen's sides, a level in from the gauges on the edge
// line (SX, 2026-10-17: «у текста и локатора по бокам побольше отступы ... 36»); `wide` the bottom notch's floor wider than BRAKES needs,
// each side, the gauges keeping the width the narrower notch gave them (SX: «Добавь ... по 28 по бокам нижней челки»); `s` and `c` the windows' air; a gauge's
// cube as tall as the notch's line, the windows' squares' gap between two; a wall's S `run` times its drop; the fade at the edges, as high as
// the margin, black at the edge to none; the mount's box, its reel and holes; `cord` the charm's chain from the reel's edge to the charm's
// ring at rest, in the game's hangs (charm.js HANG). It was twice the game's (SX: «на 50% длиннее цепочку», then lower again on his
// picture), drawn as a straight run of beads, an eyelet and the game's chain under it; one chain off the reel, a third shorter, since SX,
// 2026-10-16: «у сувенира какая-то двойная цепочка, ты ее укороти на 1/3 и сделай просто без дополнительного скрепления в середине».
export const MODERN = Object.freeze({
  margin: 28, side: 36, wide: 28, s: ORG.S, c: ORG.C, cube: BAR.outer, gap: ORG.squareGap, run: 1.5, samples: 24,
  fade: Object.freeze([[0, 1], [0.3, 0.6], [0.65, 0.2], [1, 0]]),
  mount: Object.freeze({ w: 64, round: 8, reel: 7, hub: 1.5, holes: 2, hole: 2, holePitch: 4 }), cord: (2 * 2) / 3,
});
// What the charm hangs from in MODERN (charm.js stepCharm, drawCharm): the reel, its chain `cord` hangs long from the reel's edge at rest.
export const MODERN_HOLD = Object.freeze({
  cord: MODERN.mount.reel + MODERN.cord * HANG - CHARM.pull / CHARM.stretch, from: MODERN.mount.reel, eyelet: false,
});
// The gauges' colour sections from their zero outward, as shares of their run (SX: «покрасить на цветовые секции ... в сторону ред ...
// желтый и красный ... в самом конце. В сторону тяги ... белый и зеленый, потом ... зеленый»): RET amber, its last cubes red; THR white,
// green, then the flame's orange at full; SPD white, amber, then red. The words' inks while their gauge works.
const SECTIONS = Object.freeze({
  ret: [[0.85, PALETTE.amber], [1, PALETTE.red]],
  thr: [[0.4, PALETTE.white], [0.8, PALETTE.green], [1, PALETTE.orange]],
  spd: [[0.6, PALETTE.white], [0.85, PALETTE.amber], [1, PALETTE.red]],
});
const WORKING = Object.freeze({ thrust: PALETTE.orange, retro: PALETTE.amber });
const inkAt = (sections, share) => sections.find(([to]) => share < to + 1e-9)?.[1] ?? sections.at(-1)[1];
// The breaking: under `at` of the hull the charm tears off, above `mend` it hangs again; its fall: gravity (px/s²), its first hop, its throw
// by the ship's turn (px/s for a rad/s) and its most. Under `dead` the gauges' cubes go out, up to `deadMost` of them at an empty hull, each
// an out lamp (`deadInk`: the white at 5 %). A wall's breaks at each wear level (0-4).
// The radio's wheel hops off its socket `wheelHop` px/s up, `wheelOff` px/s toward the screen's middle, and rolls `wheelRoll` rad a px/s.
export const BREAK = Object.freeze({ at: 0.1, mend: 0.25, gravity: 1500, hop: -90, throwBy: 260, throwMax: 700, wheelHop: -420, wheelOff: 70, wheelRoll: 0.03,
  dead: 0.3, deadMost: 0.4, deadInk: 'rgba(255, 255, 255, 0.05)', walls: Object.freeze([0, 0, 1, 2, 3]) });

// ------------------------------------------------------------------------------------------------ the lines

const kept = { key: '', value: null };
// The two lines of each side and the key rows on them, for this renderer's size and font (kept while they hold).
export function modernLines(r) {
  const key = `${r.width}x${r.height}|${r.cellW}|${r.cellH}|${r.font}`;
  if (kept.key === key) return kept.value;
  const m = uiMetrics(r), ink = buttonInk(r), M = MODERN.margin, cube = MODERN.cube;
  const textT = Math.round(M + cube + MODERN.s - m.capTop), textB = Math.round(r.height - M - cube - MODERN.s - m.capBottom);
  const value = Object.freeze({ M, cube, pitch: cube + MODERN.gap, ink, capH: m.capBottom - m.capTop,
    railT: M + cube / 2, railB: r.height - M - cube / 2, textT, textB, capsT: textT + m.capTop, capsB: textB + m.capBottom,
    keyRowT: textT - m.textY, keyRowB: textB - m.textY });
  kept.key = key; kept.value = value;
  return value;
}
// The helmet's geometry follows the modern notch while the page wears it (helmet.js NOTCH_MODE): the task's line on the top text line, the
// floor C under it and the notices under the floor. Null under LEGACY.
export function wearNotch(r, modern) {
  NOTCH_MODE.modern = modern ? { capsTop: modernLines(r).capsT, air: MODERN.c } : null;
}

// An S from (x0, y0) to (x1, y1), flat at both ends, onto `out` (its first point left out: the path's last).
function sWall(out, x0, y0, x1, y1) {
  const h = (x1 - x0) / 2;
  for (let i = 1; i <= MODERN.samples; i++) {
    const t = i / MODERN.samples, u = 1 - t;
    out.push([u * u * u * x0 + 3 * u * u * t * (x0 + h) + 3 * u * t * t * (x1 - h) + t * t * t * x1, u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1]);
  }
}
// A notch from its floor's ends at `floor` to the rail's line `rail`: its points, its shoulders.
function notch(left, right, floor, rail) {
  const run = MODERN.run * Math.abs(floor - rail), points = [[left - run, rail]];
  sWall(points, left - run, rail, left, floor);
  points.push([right, floor]);
  sWall(points, right, floor, right + run, rail);
  return { points, shoulders: [left - run, right + run], run };
}
// The notches by their four numbers: they hold while the layout and the task's line do, so a frame builds none again (the garbage a frame,
// 2026-10-17: their points, the wear's places and the fill were made anew every frame). A few kept; a run of new ones empties the store.
const NOTCHES = new Map();
function notchOf(left, right, floor, rail) {
  const key = `${left}|${right}|${floor}|${rail}`;
  let n = NOTCHES.get(key);
  if (!n) { if (NOTCHES.size >= 32) NOTCHES.clear(); NOTCHES.set(key, (n = notch(left, right, floor, rail))); }
  return n;
}
// What the wear draws on a notch with `seed` (src: cockpit-fx.js cockpitSpots, barLengths, glintPaths) and its fill down to `edge`, kept on it.
function wearOf(n, seed, edge) {
  if (n.wear?.seed === seed && n.wear.edge === edge) return n.wear;
  const bars = [n.points], lengths = barLengths(bars);
  return (n.wear = { seed, edge, bars, spots: cockpitSpots(bars, seed), lengths, paths: glintPaths(lengths),
    fill: [[n.shoulders[0], edge], ...n.points, [n.shoulders[1], edge]] });
}
// The x where the left wall of `n` stands at height `y`.
function wallAt(n, y) {
  const pts = n.points;
  for (let i = 1; i <= MODERN.samples; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
    if ((ay - y) * (by - y) <= 0 && ay !== by) return ax + ((y - ay) / (by - ay)) * (bx - ax);
  }
  return pts[MODERN.samples][0];
}
function tube(ctx, points) {
  const trace = () => { ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]); };
  ctx.save(); ctx.globalAlpha = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  trace(); ctx.lineWidth = BAR.outer; ctx.strokeStyle = ROLES.structure; ctx.stroke();
  trace(); ctx.lineWidth = BAR.inner; ctx.strokeStyle = ROLES.backing; ctx.stroke();
  ctx.restore();
}
function fillPoly(ctx, points) {
  ctx.save(); ctx.fillStyle = ROLES.backing; ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function roundedRect(ctx, x, y, w, h, rr) {
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}
const union = (a, b) => (!a ? b : !b ? a : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
  h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) });

// ------------------------------------------------------------------------------------------------ the breaking

// The page's state of what tore off, every field declared here: the charm's fall (`at` since when, null: hanging), the ship's last heading
// and its turn (which throws the charm).
export function createModernFx() {
  return { charm: { at: null, x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, id: null }, wheel: { at: null, x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, R: 0 },
    heading: null, turn: 0 };
}
// A piece torn off flying: gravity, its throw, its turn; gone off the screen for reduced motion.
function fly(P, step, reducedMotion) {
  P.at += step;
  if (reducedMotion) { P.y = 1e5; return; }
  P.vy += BREAK.gravity * step; P.y += P.vy * step; P.x += P.vx * step; P.a += P.va * step;
}
// The wheel as it stands still, turned by its roll alone (radio.js wheelModern's state).
const STILL_WHEEL = Object.freeze({ tune: 0 });
// One frame of it: `share` the hull's (0 when wrecked), `angle` the ship's heading, `dt` the page's seconds, `charmAt` where the charm
// hangs now (its picture's middle, when one hangs and is drawn), `wheelAt` where the radio's wheel stands (radio.js `wheel`).
export function stepModernFx(fx, { share, angle, dt, charmAt = null, charmId = null, wheelAt = null, reducedMotion = false }) {
  const step = Math.min(0.05, Math.max(0, dt));
  if (fx.heading != null && step > 0) {
    const d = Math.atan2(Math.sin(angle - fx.heading), Math.cos(angle - fx.heading));
    fx.turn += (d / step - fx.turn) * Math.min(1, step / 0.08);
  }
  fx.heading = angle;
  const C = fx.charm, D = fx.wheel, thrown = clamp(-fx.turn * BREAK.throwBy, -BREAK.throwMax, BREAK.throwMax);
  if (share >= BREAK.mend) C.at = D.at = null;
  if (share <= BREAK.at && C.at == null && charmAt) {
    C.at = 0; C.x = charmAt.x; C.y = charmAt.y; C.vx = thrown; C.vy = BREAK.hop * 0.6; C.a = 0; C.va = thrown / 180; C.id = charmId;
  }
  if (share <= BREAK.at && D.at == null && wheelAt?.on) {
    D.at = 0; D.x = wheelAt.x; D.y = wheelAt.y; D.R = wheelAt.R; D.vx = thrown * 0.5 + wheelAt.dir * BREAK.wheelOff; D.vy = BREAK.wheelHop;
    D.a = 0; D.va = D.vx * BREAK.wheelRoll;
  }
  if (C.at != null) fly(C, step, reducedMotion);
  if (D.at != null) fly(D, step, reducedMotion);
}

// A notch's walls broken (its floor wears as the deck does, drawWear): black over its line in places along the two S curves, the broken
// piece knocked a little out of line from the second level of breaks on.
function breakWalls(ctx, n, level, seed) {
  const k = BREAK.walls[level] ?? 0, pts = n.points, wall = MODERN.samples;
  for (let i = 0; i < k * 2; i++) {
    const right = i % 2 === 1, at = 3 + Math.floor(noise3(seed, i, 23) * (wall - 8)), span = 2 + Math.floor(noise3(seed, i, 29) * 3);
    const from = right ? wall + 1 + at : at, seg = pts.slice(from, from + span + 1);
    if (seg.length < 2) continue;
    const trace = (dx = 0, dy = 0) => { ctx.beginPath(); seg.forEach(([x, y], j) => (j ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy))); };
    ctx.save(); ctx.lineCap = 'butt'; trace(); ctx.lineWidth = BAR.outer + 2; ctx.strokeStyle = ROLES.backing; ctx.stroke();
    if (level >= 3 && i >= 2) {
      const off = 2 + noise3(seed, i, 31) * 2;
      trace(off, off * 0.5); ctx.lineWidth = BAR.outer; ctx.strokeStyle = ROLES.structure; ctx.stroke();
      trace(off, off * 0.5); ctx.lineWidth = BAR.inner; ctx.strokeStyle = ROLES.backing; ctx.stroke();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ the frame

// The modern interface this frame. `game` the page's parts (its renderer's context under the page's shake), `args`: `given` what the
// opening has given (src/opening.js interfaceGiven), `brake` and `lamp` the brake's state and the heavy hit's warning, `speed`, `maxSpeed`,
// `input` the controls the world was stepped with (thrust, retro), `now` the page's seconds, `scopeArgs` the locator's (its flags, quests,
// task), `markedIds`, `bearingOf`, `pointer`, `attached` (the keys hold the quest list), `focusId`, `level` the wear's step. Returns what the
// page keeps of it: the boxes the page lays its groups and windows by, the rim marks' area, the radio's box.
export function drawModernHud(r, game, args) {
  const { world, tracker, radio, questBoard, charm } = game, fx = game.modernFx, ui = game.interface;
  const { given, brake, lamp, speed, maxSpeed, input, now, scopeArgs, reducedMotion, level } = args;
  const ctx = r.ctx, W = r.width, H = r.height, mid = W / 2, cw = r.cellW, m = uiMetrics(r), L = modernLines(r), ink = L.ink, S = MODERN.s, C = MODERN.c;
  const X = MODERN.side;
  const out = { modern: true, deck: false, column: null, quests: null, radioArea: null, avoid: [], area: null, charm: null, wheelAt: null };

  // The notches: the top one round the task's line (helmet.js, its floor and row in NOTCH_MODE), the bottom one round BRAKES.
  const h = game.notices.notch(r);
  const top = notchOf(h.left, h.right, h.y, L.railT);
  const brakeW = (4 + BRAKE_LABEL.length) * cw + 2 * BRAKE_OPEN * cw, floorB = L.capsB - L.capH - C - BAR.outer / 2;
  const fit = notchOf(Math.round(mid - brakeW / 2 - S), Math.round(mid + brakeW / 2 + S), floorB, L.railB);
  const bottom = notchOf(Math.round(mid - brakeW / 2 - S - MODERN.wide), Math.round(mid + brakeW / 2 + S + MODERN.wide), floorB, L.railB);
  // The fades at both edges, under the notches.
  for (const [y0, y1] of [[0, L.M], [H, H - L.M]]) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    for (const [stop, a] of MODERN.fade) g.addColorStop(stop, `rgba(0, 0, 0, ${a})`);
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), W, L.M); ctx.restore();
  }
  for (const [n, edge, seed] of [[top, 0, 5], [bottom, H, 6]]) {
    if (!given.deck) break;
    const kept = wearOf(n, cockpitSeed() + seed, edge);
    fillPoly(ctx, kept.fill);
    tube(ctx, n.points);
    drawWear(ctx, kept.bars, kept.spots, cockpitLevel(), { t: now, light: cockpitLight(now), motion: !reducedMotion, seed: kept.seed, lengths: kept.lengths, paths: kept.paths });
    breakWalls(ctx, n, level, cockpitSeed() + seed * 7);
  }
  if (given.deck) drawBrake(r, { y: L.textB, h: UI.row }, brake, lamp);

  // The corners' widths: the locator's (round or square, the radio's width when square) and the radio's.
  const sq = ui.map === 'square', Lc = columnLayout(r), R0 = Lc ? Lc.radius : 119;
  const side = sq ? radioSize(r).w : 2 * (R0 + MODERN_SCOPE.apart + 0.5), Wm = radioSize(r).w;
  // The gauges: as wide as the bottom notch fitted to BRAKES at their capitals' middle (`fit`, before it was widened), S past the notches' line,
  // and no nearer the bottom corners' blocks than C (a narrow screen: the widened notch pushes the bottom ones out toward them).
  const room = Math.min(bottom.shoulders[0] - S - (X + Math.round(side) + C), W - X - Wm - C - (bottom.shoulders[1] + S));
  const wx = wallAt(fit, L.capsB - L.capH / 2), n = Math.max(4, Math.min(Math.floor((2 * (mid - wx) + MODERN.gap) / L.pitch), Math.floor((room - L.cube) / L.pitch) + 1));
  const gw = (n - 1) * L.pitch + L.cube;
  const at = {
    hull: { x: Math.round(top.shoulders[0] - S - gw), y: L.railT, row: L.textT },
    fuel: { x: Math.round(top.shoulders[1] + S), y: L.railT, row: L.textT },
    thr: { x: Math.round(bottom.shoulders[0] - S - gw), y: L.railB, row: L.textB },
    spd: { x: Math.round(bottom.shoulders[1] + S), y: L.railB, row: L.textB },
  };
  const dark = (hex) => dimToContrast(hex, BAR_EDGE);
  // Under BREAK.dead of the hull some cubes are out, the same ones each frame (the hull's share decides how many), more as it falls.
  const hullNow = world.ship.alive && world.hullMax > 0 ? world.hull / world.hullMax : 0;
  const deadShare = hullNow < BREAK.dead ? BREAK.deadMost * (1 - hullNow / BREAK.dead) : 0, deadSeed = cockpitSeed() + 41;
  const cubes = (g, inkOf, which) => {
    const y0 = Math.round(g.y - L.cube / 2);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = deadShare > 0 && noise3(deadSeed + which, i, 37) < deadShare ? BREAK.deadInk : inkOf(i);
      ctx.fillRect(Math.round(g.x + i * L.pitch), y0, L.cube, L.cube);
    }
  };
  const word = (g, text, wordInk, end = false) => r.text(text, Math.round(end ? g.x + gw + m.capLeft - Array.from(text).length * cw : g.x - m.capLeft), g.row, wordInk, 1);
  const lit = (share) => Math.ceil(clamp(share, 0, 1) * n - 1e-6);
  if (given.deck) {
    ctx.save();
    const hullShare = world.hullMax > 0 ? world.hull / world.hullMax : 1, fuelShare = world.fuelTank > 0 ? world.fuel / world.fuelTank : 1;
    const hl = barLook(hullShare), fl = barLook(fuelShare, 'fuel');
    cubes(at.hull, (i) => (i < lit(hullShare) ? hl.ink : hl.edge), 1);
    word(at.hull, 'HULL', ROLES.textSecondary); word(at.hull, String(Math.max(0, Math.round(world.hull))), ROLES.textPrimary, true);
    cubes(at.fuel, (i) => (i < lit(fuelShare) ? fl.ink : fl.edge), 2);
    word(at.fuel, String(Math.ceil(world.fuel)), ROLES.textPrimary); word(at.fuel, 'FUEL', ROLES.textSecondary, true);
    // RET and THR from a zero mark at the middle: retro's half lit from it toward RET's end, thrust's toward THR's by the notch.
    const half = Math.floor(n / 2), thrN = n - half, thrLit = Math.round(clamp(input.thrust, 0, 1) * thrN), retLit = Math.round(clamp(input.retro, 0, 1) * half);
    cubes(at.thr, (i) => {
      const far = i < half ? half - 1 - i : i - half, each = i < half ? half : thrN, c = inkAt(i < half ? SECTIONS.ret : SECTIONS.thr, (far + 0.5) / each);
      return far < (i < half ? retLit : thrLit) ? c : dark(c);
    }, 3);
    const zx = at.thr.x + half * L.pitch - MODERN.gap / 2, tip = Math.round(at.thr.y - L.cube / 2) - 2;
    ctx.fillStyle = ROLES.textPrimary; ctx.beginPath(); ctx.moveTo(zx, tip); ctx.lineTo(zx - UI.pad, tip - UI.pad - 1); ctx.lineTo(zx + UI.pad, tip - UI.pad - 1); ctx.closePath(); ctx.fill();
    word(at.thr, 'RET', input.retro > 0 ? WORKING.retro : ROLES.textSecondary); word(at.thr, 'THR', input.thrust > 0 ? WORKING.thrust : ROLES.textSecondary, true);
    const spdLit = lit(maxSpeed > 0 ? speed / maxSpeed : 0);
    cubes(at.spd, (i) => { const c = inkAt(SECTIONS.spd, (i + 0.5) / n); return i < spdLit ? c : dark(c); }, 4);
    word(at.spd, brake ? 'BRAKE' : 'SPD', brake ? ROLES.danger : ROLES.textSecondary); word(at.spd, String(Math.round(speed)), ROLES.textPrimary, true);
    ctx.restore();
    out.avoid.push({ x: at.hull.x, y: 0, w: at.fuel.x + gw - at.hull.x, h: L.capsT + L.capH + S }, { x: at.thr.x, y: L.capsB - L.capH - S, w: at.spd.x + gw - at.thr.x, h: H });
  }

  // The locator in the bottom left corner (round or square, the radio's width when square), N LEGEND (its key from the table) and the wallet under it.
  const locBox = { x: X, y: Math.round(L.keyRowB + ink.top - S - side), w: Math.round(side), h: Math.round(side) };
  if (given.column) {
    drawModernScope(r, world, { ...scopeArgs, box: locBox, shape: sq ? 'square' : 'round', reducedMotion, level, seed: cockpitSeed() + 11, wreck: cockpitCrack() });
    // The legend's button on the bottom line under the locator's edge; its rows over the locator while they show.
    const phase = Lc?.phase, open = !!phase?.open, key = keyName('legend'), wordL = open ? 'HIDE LEGEND' : 'LEGEND';
    const x0 = X + 1, edge = x0 + KEYCAP_PAD + (Array.from(key).length + 1 + wordL.length + 1) * cw + 2 * KEY_MARK_HALF + 1;
    const legendRow = drawColumnButton(r, { x0, edge, rowTop: L.keyRowB, key, word: wordL, turn: phase ? 1 - phase.turn : 0, name: 'locator:legend', note: (box) => noteKey(key, box, r) });
    let column = union(locBox, legendRow);
    if (Lc && phase?.rows) {
      const listTop = locBox.y - C - LEGEND_ROW_COUNT * UI.row;
      drawLegendRowsAt(r, { ...Lc, legendX: X, listTop, colW: locBox.w - (Lc.right - Lc.x0 - Lc.colW) }, phase.lore);
      column = union(column, { x: X, y: listTop, w: locBox.w, h: LEGEND_ROW_COUNT * UI.row });
    }
    out.column = column;
  }
  drawWallet(r, { wallet: { x: locBox.x + locBox.w + m.capLeft - 240, y: L.keyRowB, w: 240, h: UI.row, alone: false } }, world.ledger.credits ?? 0);

  // The stations in the top left corner under their B row, as wide as the locator.
  const place = { x0: X, x1: X + locBox.w, rowTop: L.keyRowT, ink, capH: L.capH, down: true, under: S,
    rowsTop: Math.round(L.keyRowT + ink.bottom + C), pitch: Math.round(UI.pad + S + L.capH + C), floor: (given.column ? locBox.y : H - L.M) - C,
    rowsBottom: 0, wallet: null, foot: null };
  const stations = drawTracker(r, tracker, place);
  if (stations) out.avoid.push(stations);

  // The charm's mount on the edge line at the right column's axis (the charm's right edge on the quests'), the charm on its reel's cord;
  // torn off, it falls (under the quests: drawn before them).
  const right = W - X, charmId = given.shelf ? hungCharm(world) : null, art = charmId ? charmPlace(r).inks.get(charmId) : null;
  const hx = Math.round(right - (art ? (art.x1 - art.x0) / 2 : CHARM.size / 2)) + 0.5;
  const mount = { x: Math.round(hx - MODERN.mount.w / 2), y: L.M, w: MODERN.mount.w, h: Math.round(L.capsT + L.capH - L.M) };
  let charmAt = null;
  if (charmId) {
    const reelY = mount.y + mount.h / 2, mn = MODERN.mount;
    ctx.save(); ctx.lineWidth = 1;
    roundedRect(ctx, mount.x + 0.5, mount.y + 0.5, mount.w - 1, mount.h - 1, mn.round); ctx.fillStyle = ROLES.backing; ctx.fill(); ctx.strokeStyle = ROLES.structure; ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, reelY, mn.reel, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = ROLES.structure; ctx.beginPath(); ctx.arc(hx, reelY, mn.hub, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = ROLES.textPrimary; ctx.beginPath(); ctx.arc(hx + mn.reel * 0.55, reelY - mn.reel * 0.35, 1, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = ROLES.structure;
    for (const dir of [-1, 1]) for (let i = 0; i < mn.holes; i++) for (let j = 0; j < mn.holes; j++) {
      const gx = hx + dir * (mn.reel + S + i * mn.holePitch) - (dir < 0 ? mn.hole : 0), gy = reelY - mn.holePitch / 2 + j * mn.holePitch - mn.hole / 2;
      ctx.fillRect(Math.round(gx), Math.round(gy), mn.hole, mn.hole);
    }
    ctx.restore();
    out.avoid.push(mount);
    // The charm on its one chain off the reel, swinging from it.
    if (fx.charm.at == null) {
      drawCharm(r, { id: charmId, x: hx, y: reelY }, charm, MODERN_HOLD);
      if (charm.shown && charm.box) { charmAt = { x: charm.box.x + charm.box.w / 2, y: charm.box.y + charm.box.h / 2 }; out.charm = charm.box; }
    }
  }
  out.charmAt = charmAt;
  // A torn charm falling, thrown aside by the ship's turn.
  const fall = fx.charm;
  if (fall.at != null && fall.id && fall.y < H + CHARM.size) {
    const half = CHARM.size / 2;
    ctx.save(); ctx.translate(fall.x, fall.y); ctx.rotate(fall.a);
    drawSouvenirPicture(r, fall.id, -half, -half, CHARM.size, 1, { whole: true });
    ctx.restore();
  }

  // The radio in the bottom right corner, its T row on the bottom line, broken where it stands as the hull goes (radio.js).
  const sides = sidePlaces(r, 'left'), q = sides.quests, left = W - X - Wm, dx = left - q.left;
  let radioArea = null;
  if (given.radio) {
    const box = { x: left, y: L.keyRowB + ink.top - S - RADIO_MODERN.h, w: Wm, h: RADIO_MODERN.h };
    radioArea = drawRadioModern(r, radio, { box, rowTop: L.keyRowB, x0: q.x0 + dx, edge: q.edge + dx, mirror: q.mirror }, now,
      { reducedMotion, wear: { level, seed: cockpitSeed() + 53, wreck: !!cockpitCrack() }, torn: fx.wheel.at != null });
  }
  out.radioArea = radioArea;
  out.wheelAt = given.radio ? radio.wheel : null;
  // The wheel torn off, hopping off its socket and falling, rolling.
  const D = fx.wheel;
  if (D.at != null && D.y < H + D.R) {
    ctx.save(); ctx.translate(D.x, D.y); ctx.rotate(D.a); wheelModern(ctx, 0, 0, D.R, STILL_WHEEL, false); ctx.restore();
  }
  // The quests over it under their R row: the row C over the radio's top (or on the bottom line with none), the plates S over the row.
  if (given.quests) {
    const qx = q.x + dx, qRow = Math.round((radioArea ? radioArea.y : L.keyRowB + ink.top + C) - C - ink.bottom);
    const g = questGeometry(r, q.width), count = questBoard.plates.length, listH = count ? count * (g.height + QUEST_FRAME.gap) - QUEST_FRAME.gap : 0;
    const listTop = Math.round(qRow + ink.top - S - listH);
    drawQuestBoard(r, questBoard, qx, listTop, now, world.ledger.clock, { reducedMotion, button: null, attached: args.attached, width: q.width,
      focusId: args.focusId, markedIds: args.markedIds, mirror: q.mirror, bearingOf: args.bearingOf, pointer: args.pointer });
    const head = drawColumnButton(r, { x0: qx + q.button.inset, edge: qx + q.button.edge, rowTop: qRow, key: keyName('nextQuest'), word: 'QUESTS', turn: 1,
      name: 'quests:button', over: args.attached ? true : null, axis: q.mirror ? 2 * qx + Math.round(q.width) : null });
    questBoard.hintBox = head;
    if (questBoard.box) questBoard.box = union(questBoard.box, head);
    out.quests = union(questBoard.box ?? head, radioArea);
  } else out.quests = radioArea;

  // The marks on the rim keep inside what the corners and the notches leave.
  const leftCol = Math.max(stations ? stations.x + stations.w : 0, given.column ? locBox.x + locBox.w : 0);
  out.area = { x0: leftCol + UI.vector.space, x1: left - L.M, y0: h.y + BAR.outer / 2 + UI.vector.group, y1: floorB - BAR.outer / 2 - UI.vector.group };
  out.locator = given.column ? locBox : null;
  out.stations = stations;
  return out;
}
