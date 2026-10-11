// Desktop only (SX, 2026-09-25: no mobile version). One cockpit derived from
// the canvas size. Every line follows labs/graphics/ANGLES.md: horizontals,
// verticals, 2:1 structure diagonals and 45-degree corner cuts, with vertices
// on an 8 px grid measured from the canvas bottom. Values are CSS pixels; text
// keeps the native 15 px cell.

import { HELM_DESIGN } from './vector-helm.js';
import { BAR } from './cockpit-frame.js';
import { UI, uiMetrics } from '../../src/uiGrid.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const GRID = 8;

// The spacing system's steps (src/uiGrid.js, 2026-09-30) on this grid: the screens'
// row is the interface row, the canvas inset is `line` of the vector's 8 px grid.
export const SCREEN_ROW = UI.row;
// The HUD's canvas inset and the top line of the upper groups; other modules
// (the souvenir shelf) read them from here.
export const EDGE = UI.vector.line;
export const TOP = 14;
// The air round the deck's two screens' words (SX, 2026-10-06, four airs marked in red on the cockpit's lower bar: «красные отступы
// приведи в одинаковое усредненное состояние»): from the canvas's left edge to HULL, from the right screen's last word (LEAVE SIGN) to
// the canvas's right edge, and from the rail's ink where the shoulder meets the ledge to the right screen's first key («?»), ink to
// ink. They were 17, 36 and 37 px, and 41 from the wallet's count to the left shoulder (the count went to the souvenirs the same
// day); their average, 32.8, on the vector grid's nearest step: two of its lines, 32 (the canvas inset EDGE is one).
export const SCREEN_AIR = 2 * UI.vector.line;
// The route's header in the middle (hud.js drawMission) stands a row under TOP, and the notice under it by the same air
// as over it (notice.js noticeTop): both moved down, apart from the corners' line (SX, 2026-10-01: «Notification слишком
// маленьком расстоянии от информации по дороге. Надо и notification, и информацию по грузу перенести»; the air over
// the route and under it was 15 px, it is 35).
export const MISSION_TOP = TOP + UI.row;

// Structure diagonals are 2:1 (two down for one across). These are their runs. The chamfer climbs
// from the ledge to the console, 56 px since the console rose to 104 (2026-10-01; it was 48, a run of 24).
export const DIAGONAL = Object.freeze({ strut: 56, shoulder: 24, chamfer: 28 });

// How high the console's top stands over the canvas bottom, on the 8 px grid: a step over the side
// rails (96), so its bar's lower line passes through the middle of THR and SPD (SX, 2026-10-01: «панель
// в том месте где я обрисовал она должна проходить через центр тяги и скорости»). The helm stands on
// it and rose the same 8 px («чуть чуть ... приподнимем»); a second step would put it against the
// pilot card at 1512 x 860.
export const CONSOLE_RISE = 104;

// The console's top line stops `gap` short of the helm's plate and `gauge` short of THR and SPD (ANGLES.md: lines
// stop short of each other by a scale step; SX, 2026-10-01: «у самого штурвала хорошие отступ, но вот у тяги
// слева-справа маленький очень отступ, и у скорости также впритык»: a gauge's ink meets the line at its own height,
// the plate's lies lower, so a gauge takes twice the step to read as the same air), and every piece of it that shows,
// beside the gauges and between them and the helm, is `segment` long (SX, 2026-10-01: «я хочу чтобы вот эти отрезки
// были одинаковых размеров»). The gauges are placed to make it so (deckLayout).
export const CONSOLE = Object.freeze({ gap: 8, gauge: 16, segment: 48 });

// How far the helm stands under the line its grip's top kept with the top of THR and SPD (SX, 2026-10-01: «сам
// джойстик штурвала чуть пониже к брейкс опусти»).
export const HELM_DROP = 6;

// The height of a gauge's rail, in px (SX, 2026-10-01: «хотя бы до 112», then «тяга и скорость, давай
// сделаем им высоту 100»).
export const GAUGE_RAIL = 100;

// The deck is a function of the canvas, its cell and the interface's metrics and nothing else, and the cockpit asked for it every frame (and
// built its rail, its pieces and its screens again, and everything drawn from them): the last answer is kept while those stand, as the
// tracker's shoulder is (tracker.js shoulderOf). Nothing writes into it: the page copies it (`{ ...deck, ... }`, hud.js) and
// what it draws from it it only reads, so one stands for many frames, and what is made of it once (cockpit-frame.js) is kept with it.
const kept = { w: 0, h: 0, cw: 0, ch: 0, m: null, value: null };
export function deckLayout(r) {
  const m = uiMetrics(r);
  if (kept.value !== null && kept.w === r.width && kept.h === r.height && kept.cw === r.cellW && kept.ch === r.cellH && kept.m === m) return kept.value;
  const value = buildDeck(r);
  kept.w = r.width; kept.h = r.height; kept.cw = r.cellW; kept.ch = r.cellH; kept.m = m; kept.value = value;
  return value;
}

function buildDeck(r) {
  const { width: W, height: H, cellW: cw, cellH: ch } = r;
  const cx = W / 2;
  const helmW = 160;
  const gaugeW = 6 * cw;
  // A gauge's body runs from a cell in to a cell short of its right side (instruments.js: THR's widest arrows, SPD's
  // bars; THR's cursor stands in the air left of it); the helm's plate is what of the helm stands on the console.
  // Every piece of the console's top line is CONSOLE.segment long and stops CONSOLE.gap short of the plate and
  // CONSOLE.gauge short of a gauge's body, so THR's body ends, and SPD's begins, a gauge's gap, a piece and a gap from
  // the plate, and the console reaches a gauge's gap and a piece beyond each body: the two sides even.
  const thrIn = cw, spdIn = cw, inkOut = cw;
  const plateHalf = (HELM_DESIGN.plate * helmW / HELM_DESIGN.width) / 2;
  const { gap, gauge: gaugeGap, segment } = CONSOLE;
  const driveX = cx - plateHalf - gap - segment - gaugeGap - gaugeW + inkOut;
  const velocityX = cx + plateHalf + gap + segment + gaugeGap - spdIn;
  const minHalf = cx - (driveX + thrIn - gaugeGap - segment);
  // Past the screen: 16 of rail, then the shoulder and the chamfer runs.
  const beyond = 16 + DIAGONAL.shoulder + DIAGONAL.chamfer;
  // Screens are as wide as their longest row needs, never wider; rounded
  // down, so the grid step comes out of a screen, not out of the console.
  const screenW = clamp(Math.floor((W / 2 - minHalf - EDGE - beyond) / GRID) * GRID, 208, 272);
  const wellHalf = Math.max(Math.min(W / 2 - EDGE - screenW - beyond, minHalf), 0);

  // The silhouette SX drew, left side (mirrored on the right): a 2:1 strut
  // rises to the canvas edge, the rail runs level over the screen, a 2:1
  // shoulder drops to the ledge, and a 2:1 chamfer climbs back to the console
  // (SX, 2026-09-30: "за штурвалом нарисовать окантовку панели"), whose top
  // runs behind the gauges and the helm, since 2026-10-01 8 px over the rails
  // (CONSOLE_RISE). The ledge is the notch between a screen and the console; on a
  // narrow window it closes to a V.
  const railY = H - 96, ledgeY = H - 48, consoleY = H - CONSOLE_RISE;
  const kinkX = DIAGONAL.strut;
  const bendX = EDGE + screenW + 16;
  const shoulderX = bendX + DIAGONAL.shoulder;
  const chamferX = Math.max(shoulderX, cx - wellHalf - DIAGONAL.chamfer);
  const consoleX = chamferX + DIAGONAL.chamfer;
  const rail = [[0, railY - 2 * kinkX], [kinkX, railY], [bendX, railY],
    [shoulderX, ledgeY], [chamferX, ledgeY], [consoleX, consoleY]];

  // Screens have no box and no heading: two rows of text on the dash, centred
  // between the rail and the canvas bottom (SX removed the third, 2026-09-26).
  const rowsTop = H - 64;
  // The words SCREEN_AIR in from the canvas's edges and from the rails' feet, ink to ink (it was EDGE at both edges, one left edge
  // with the locator's column above them, spacing system 2026-09-30): `textX` where a screen's words start (the left's capitals, the
  // right's first keycap's stroke), `textEnd` where the right screen's last ink ends. The screens' boxes (their black backings) grow
  // inward, mirrored, as far as the right's first keycap now reaches past its box.
  const m = uiMetrics(r);
  const screen = x => ({ x, y: rowsTop - 6, w: screenW, h: 2 * SCREEN_ROW + 6, pad: 0,
    rows: [rowsTop, rowsTop + SCREEN_ROW] });
  const left = screen(EDGE);
  left.textX = Math.round(SCREEN_AIR - m.capLeft);
  // Where the left screen's words end: SCREEN_AIR short of the rail's ink where the shoulder meets the ledge (the right screen's first
  // key stands the same air past it, mirrored), the bars of HULL and FUEL running to it with their numbers (hud.js, SX, 2026-10-08).
  left.textEnd = shoulderX - BAR.outer / 2 - SCREEN_AIR;
  const right = screen(W - EDGE - screenW);
  right.textX = Math.round(W - (EDGE + screenW + 16 + DIAGONAL.shoulder) + BAR.outer / 2 + SCREEN_AIR);
  right.textEnd = W - SCREEN_AIR;
  const reach = Math.max(0, right.x - right.textX);
  left.w += reach; right.x -= reach; right.w += reach;
  // The last cell of the left's numbers stands on its black backing, a pixel past the text edge (the cell's own bearing): both screens grow
  // by it, so they stay one width.
  const more = Math.max(0, Math.ceil(left.textEnd + m.capLeft - left.x - left.w));
  left.w += more; right.x -= more; right.w += more;

  // One readout row for the console, the screens' second row (SX, 2026-09-30:
  // room under the panel; RET, the brake and the speed on one level). The helm
  // sets the back edge of its base on the console's top line, so the gap from
  // its base down to the row follows from the drawing, not from a number.
  // `line` is the lower of the two lines of the console's hollow top bar.
  // Three things sit on it: the back edge of the helm's plate (the plate
  // stands on the console, in front of its rim) and, below, the neutral line
  // of the THR gauge, where SX drew the edging through it.
  const readout = { y: rowsTop + SCREEN_ROW, h: ch };
  const line = consoleY + (BAR.outer + BAR.inner) / 4;
  const scale = helmW / HELM_DESIGN.width;
  const helmH = (HELM_DESIGN.bottom - HELM_DESIGN.top) * scale;
  // The helm a little lower, toward BRAKES, the top of its grip at rest level with the top of THR and SPD (SX,
  // 2026-10-01: «опусти, чтобы верхушка штурвала была выровнена по верхушке текста у скорости и тяги», then «чуть
  // ниже ... к надписи брейкс опустить не менять высоту ручки»); its plate stood on the console's line, 6 px higher.
  const gaugeTop = line - (readout.y + readout.h - line);
  const helmY = gaugeTop + uiMetrics(r).capTop - (HELM_DESIGN.gripTop - HELM_DESIGN.top) * scale + HELM_DROP;
  const plate = HELM_DESIGN.plate * scale;
  const helm = { bounds: { x: cx - helmW / 2, y: helmY, w: helmW, h: helmH },
    gripTop: helmY + (HELM_DESIGN.gripTop - HELM_DESIGN.top) * scale,
    plate: { x: cx - plate / 2, w: plate } };

  // The gauges stand on the console (SX, 2026-09-30: "опустить на её уровень тягу и
  // скорость"): centred on its line, so THR's neutral mark is on it, their last rows on the
  // readout row, their rails GAUGE_RAIL tall (SX, 2026-10-01: the rails read squashed at
  // 75 px; «тяга и скорость, давай сделаем им высоту 100»). `foot` is the air between a rail
  // and its labels, what is left of the height once the rail and the two rows are in.
  // The helm stands on the same line and so rose with the console, 8 px further from BRAKES
  // (SX: «джойстик мы чуть чуть оторвем от breaks и приподнимем»).
  const gaugeH = 2 * (readout.y + readout.h - line);
  const foot = (gaugeH - GAUGE_RAIL - 2 * ch) / 2;
  const gaugeY = line - gaugeH / 2;
  const drive = { x: driveX, y: gaugeY, w: gaugeW, h: gaugeH, foot };
  const velocity = { x: velocityX, y: gaugeY, w: gaugeW, h: gaugeH, foot };

  // The console's top line in pieces: it passes behind the gauges and the
  // helm's plate, stopping short of what each one draws (CONSOLE.gauge, CONSOLE.gap). A gauge's
  // stop is its ink (instruments.js), not its box, so the air reads the same on both sides
  // (QA, 2026-09-30). The first and the last piece continue the side rails. Below the desktop
  // target the console can be narrower than the cluster; pieces never leave it, and one left
  // shorter than a gap is not drawn at all, rather than as a stub.
  const stops = [[drive.x + thrIn, drive.x + drive.w - inkOut], [helm.plate.x, helm.plate.x + helm.plate.w],
    [velocity.x + spdIn, velocity.x + velocity.w - inkOut]];
  const gaps = [gaugeGap, gap, gaugeGap];
  const pieces = [];
  let from = consoleX;
  for (const [k, [a, b]] of stops.entries()) {
    const end = Math.min(a - gaps[k], W - consoleX);
    if (end - from >= CONSOLE.gap) pieces.push([from, end]);
    from = Math.max(from, b + gaps[k]);
  }
  if (W - consoleX - from >= CONSOLE.gap) pieces.push([from, W - consoleX]);
  const consoleTop = { y: consoleY, line, x0: consoleX, x1: W - consoleX, pieces, stops, gaps };

  const header = { x: cx - 15 * cw, y: MISSION_TOP, w: 30 * cw, h: 3 * ch };

  return { mode: 'desktop', deck: true, rail, railY, ledgeY, consoleTop, left, right,
    helm, drive, velocity, readout, header };
}
