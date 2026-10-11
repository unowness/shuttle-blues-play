// The HULL and FUEL bars, one kind for both, as the pilot's left screen (labs/graphics/hud.js) and SCOOTY JR.'s deck
// (labs/graphics/scooty-deck.js) draw them: the steps, their inks and their pitch. Moved out of hud.js as they were (2026-10-05, SX's
// hygiene list: the deck imported them from hud.js while hud.js imported the deck, a cycle); hud.js re-exports the names the sketch
// pages and the checks read there.
import { PALETTE } from '../../src/roles.js';
import { UI } from '../../src/uiGrid.js';
import { dimToContrast } from '../../src/util.js';
import { washOf } from './rail.js';
import { TANK_OIL } from '../../src/tankOil.js';

// SX's pick S4 (labs/graphics/sketches/hud-inks.html, 2026-10-04: C2 BANNER, K3 SIGN): «здоровье ярко зеленое желтое и красное,
// яркозеленое как комбинация цветов в баннере при доставке груза ... Топливо, одна система цвета тоже, также линейка топлива по
// длине не соответствует линейке здоровья хотя в обоих по 100 поинтов». One rule for both bars: the delivery plate's pair, a step
// in the ink on the step's own deep wash (labs/graphics/rail.js washOf), an empty step its wash and an edge of the ink dimmed to
// BAR_EDGE; green over half, the brake's amber from half, the red from a quarter; the number white, as the plate's title. A step
// is the same points on both bars (HULL_STEP; a ship whose larger store would pass BAR_STEPS steps takes twice the points, the
// HAULER's 20), so the same points are the same length. The wallet's CR is the coin's sign (K3: «по монете я бы вот эту иконку
// использовал. Можно ее раскрасить в желтенький»), the amount in the coin's rim gold, as every amount of money is.
// The count the fuel bar had until S4 (eighths of the tank), kept for the S4 page's own copy of today's screen.
export const FUEL_SEGMENTS = 8;
// Points a ten of both bars stands for, and the cubes it is drawn in (SX, 2026-10-09: «сделай прям в три раза больше делений должна
// быть такие мелкие кубики»; one step a ten until then): a cube is HULL_STEP / BAR_CUBES points.
export const HULL_STEP = 10;
export const BAR_CUBES = 3;
// The most cubes either bar takes before a cube stands for twice the points (it was the wallet's room on the FUEL row: at 1280 px
// the screen held 30 columns; the wallet stands over the rail since 2026-10-08, the cap keeps the bars' pace), three a ten of the 12.
export const BAR_STEPS = 12 * BAR_CUBES;
// An empty step's edge: the step's ink dimmed to this contrast on black (about 3 : 1 under the grade, a line's least).
export const BAR_EDGE = 3.5;
// The points a cube stands for: a third of a ten, or twice that for a ship whose larger store would pass BAR_STEPS cubes.
export const barStep = (hullMax, tank) => (HULL_STEP / BAR_CUBES) * Math.max(1, Math.ceil(Math.max(hullMax, tank) / (BAR_STEPS * HULL_STEP / BAR_CUBES)));
// The fuel's own ink: the oil's light blue as a tank holds it (src/tankOil.js TANK_OIL's heart; SX, 2026-10-09: «пусть полоска
// горючего будет не зеленая а ну как бы цвета горючего только когда его мало она становится красная как и зеленая»): FUEL keeps it
// down to a quarter, then the red, as HULL does; HULL keeps S4's green, amber from half, red from a quarter.
export const FUEL_INK = TANK_OIL.heartCell.ink;
// A bar's inks for `share` of it left (`kind` 'hull' or 'fuel'): the ink, its empty step's edge and wash.
const barInks = new Map();
export function barLook(share, kind = 'hull') {
  const ink = share <= 0.25 ? PALETTE.red : kind === 'fuel' ? FUEL_INK : share <= 0.5 ? PALETTE.amber : PALETTE.green;
  let look = barInks.get(ink);
  if (!look) barInks.set(ink, (look = Object.freeze({ ink, edge: dimToContrast(ink, BAR_EDGE), wash: washOf(ink) })));
  return look;
}

// One small vector cube a step, in the text row: filled for what is left. `level` may be fractional; the cube it falls inside
// fills partly, from the left. `look` { ink, edge, wash }: every cube on its wash, a filled one in the ink, an empty one's edge.
export const BAR_PITCH = 5;
// A cube: 3 of a pitch of 5 wide and as high (4 px with its stroke, a px between two), its middle 7 px under the text row's top `y`
// it is drawn in, where the 8 px steps' middle was (SX, 2026-10-09: «сделай их по вертикали уже гораздо»; 6 x 8 px until then).
const METER = Object.freeze({ mid: 7, w: 3 });
// A row's bars stretched over the room a deck leaves them (SX, 2026-10-08, with the wallet gone from beside FUEL: «hp и fuel сделай
// просто подлинее полоски»): the cubes keep their number and their share of the pitch (3 of 5), so a cube is as many points as it was
// and both bars keep one length for one number of points; only the pitch grows, to whole px, and the cube with it, square.
export const meterWidth = (pitch) => Math.round((pitch * METER.w) / BAR_PITCH);
// The pitch at which `count` steps (the longer bar's) fill `room` px, from the first step's left stroke to the last step's right one,
// never under BAR_PITCH.
export const meterPitch = (room, count) => Math.max(BAR_PITCH, Math.floor((room - 1) / (Math.max(1, count) - 1 + METER.w / BAR_PITCH)));
// Where a deck's row puts its pieces: `x` the label's left, `end` the right text edge the number's last ink stands on, `cw` the cell,
// `count` the longer bar's steps, `digits` the widest number's, `lead` the cells before the bar (the label's and its line's step),
// `capLeft` the capitals' left bearing. The last step's ink stands a cell (UI.space: one statement) from the number's first. Returns
// { barX, pitch, valueX }: the bar's left, its pitch, the numbers' column.
export function meterRow({ x, end, cw, count, digits, lead = 4 + UI.line.cols, capLeft = 0 }) {
  const valueX = end + capLeft - digits * cw, barX = x + lead * cw;
  return { barX, valueX, pitch: meterPitch(valueX + capLeft - UI.space.cols * cw - barX, count) };
}
export function drawMeterBar(r, x, y, level, count, look, pitch = BAR_PITCH) {
  const { ctx } = r, w = meterWidth(pitch), h = w;
  const sy = Math.round(y + METER.mid - (h + 1) / 2) + .5;
  ctx.save();
  ctx.lineWidth = 1; ctx.globalAlpha = 1;
  for (let i = 0; i < count; i++) {
    const sx = Math.round(x + i * pitch) + .5;
    const fill = Math.max(0, Math.min(1, level - i));
    if (look.wash) { ctx.beginPath(); ctx.rect(sx, sy, w, h); ctx.fillStyle = look.wash; ctx.fill(); }
    if (fill > 0) {
      ctx.beginPath(); ctx.rect(sx, sy, w * fill, h);
      ctx.fillStyle = look.ink; ctx.fill();
    }
    ctx.beginPath(); ctx.rect(sx, sy, w, h);
    ctx.strokeStyle = fill > 0 ? look.ink : look.edge; ctx.stroke();
  }
  ctx.restore();
}
