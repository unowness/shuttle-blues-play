import { ROLES } from '../../src/roles.js';
import { BAR } from './cockpit-bar.js';
import { COCKPIT_FX, drawWear, noteBars, cockpitLevel, cockpitLight, cockpitSeed, barLengths, glintPaths } from './cockpit-fx.js';

// The cockpit frame, after Metroid Prime's visor (SX's reference, 2026-09-25):
// structure is a hollow bar, two 1 px lines with a black core. Every line
// follows ANGLES.md: level, plumb, 2:1 for structure, 1:2 for marks that sit
// across a 2:1 line, 45 degrees for corner cuts. Nothing runs into an edge
// at an accidental angle.
// Its bar's measures are cockpit-bar.js's (PLAN D2, 2026-10-04: the wear, cockpit-fx.js, follows them too).
export { BAR };
// The depth lines: which corners of the side rail carry one (their indices in the rail: 1 the strut's foot, 3 the
// shoulder's foot, where the notch begins) and how far across each runs (on the 8 px grid).
const DEPTH = Object.freeze({ corners: [1, 3], run: 24 });

// Where the lower of a hollow bar's two lines turns at the corner `b` of a path a, b, c: the two lines' meeting point,
// BAR.outer / 2 - 0.5 px out on the bend's lower side.
function lowerCorner(a, b, c) {
  const unit = (p, q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
  const [u1, u2] = [unit(a, b), unit(b, c)], n1 = [-u1[1], u1[0]], n2 = [-u2[1], u2[0]];
  const k = (BAR.outer / 2 - 0.5) / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
  return [b[0] + (n1[0] + n2[0]) * k, b[1] + (n1[1] + n2[1]) * k];
}

// A hollow bar along a polyline: a wide stroke in ink, then a narrower black
// core pulled 1 px in at both ends, so each end is closed; `open` leaves the core
// the whole length, so the two lines simply stop (the cockpit's bars where they
// meet an instrument, SX 2026-10-01: «не нравится ... что закрывается линия, когда
// мы подходим к тяге и к скорости, и к штурвалу ... давай не будем их закрывать»).
// Miter joins keep both lines of the bar parallel to their segment through every
// bend; a bevel join would cut each corner at an angle that belongs to no rule.
export function hollowBar(ctx, points, ink = ROLES.structure, { open = false } = {}) {
  if (points.length < 2) return;
  // An open bar's core is the path itself (its two ends are not pulled in), so it is not copied.
  const core = open ? points : [inset(points[0], points[1]), ...points.slice(1, -1), inset(points.at(-1), points.at(-2))];
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 4;
  ctx.lineCap = 'butt';
  trace(ctx, points); ctx.lineWidth = BAR.outer; ctx.strokeStyle = ink; ctx.stroke();
  trace(ctx, core); ctx.lineWidth = BAR.inner; ctx.strokeStyle = ROLES.backing; ctx.stroke();
  ctx.restore();
}
// The end of a closed bar's core, pulled one px toward the other end so each end is shut.
function inset(a, b) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [a[0] + (b[0] - a[0]) / length, a[1] + (b[1] - a[1]) / length];
}
// A path of [x, y] points on the context: move to the first, line to the rest.
function trace(ctx, path) {
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
  }
}

function line(ctx, points, ink = ROLES.structure) {
  trace(ctx, points);
  ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.stroke();
}

// What the frame is made of, worked out from the deck alone, once for a deck: the body's outline, the bars (the side rails and the pieces of
// the console's top between the instruments), their straight lengths and the paths the glints ride (cockpit-fx.js), and every ruler tick and depth line
// as a polyline. They were mirrored, spread and rebuilt every frame, ~24 KB of garbage; hud-layout.js deckLayout keeps the deck while the
// canvas stands, so this is kept with its rail (a deck built again is another rail, and the frame is built again). Read only.
const frames = new WeakMap();
function frameOf(layout, W, H) {
  const known = frames.get(layout.rail);
  if (known && known.consoleTop === layout.consoleTop && known.W === W && known.H === H) return known;
  const rail = layout.rail;
  const [, kink] = rail;
  const { pieces, y: consoleY } = layout.consoleTop;
  const mirror = points => points.map(([x, y]) => [W - x, y]);
  const body = [...rail, ...mirror(rail).reverse(), [W, H], [0, H]];
  // Each side's rail runs on into the console's outer piece; the pieces
  // between the instruments are bars of their own.
  const { x0, x1 } = layout.consoleTop;
  const first = pieces[0]?.[0] === x0 ? pieces[0] : null;
  const last = pieces.at(-1)?.[1] === x1 && pieces.at(-1) !== first ? pieces.at(-1) : null;
  const bars = [first ? [...rail, [first[1], consoleY]] : rail, last ? [...mirror(rail), [last[0], consoleY]] : mirror(rail),
    ...pieces.filter((piece) => piece !== first && piece !== last).map((piece) => piece.map(x => [x, consoleY]))];
  const lengths = barLengths(bars);
  const lines = [];
  for (const flip of [points => points, mirror]) {
    // A ruler inside the strut, tilted with it: stations every 8 px of rise
    // on a line 2:1 like the strut, ticks across it at 1:2 (perpendicular).
    // Integer steps keep every tick on the same pixel pattern.
    for (let k = 1; kink[0] - 4 * k - 8 - 12 >= 0; k++) {
      const x = kink[0] - 4 * k - 8, y = kink[1] - 8 * k + 4;
      const long = k % 4 === 0;
      lines.push(flip([[x, y], [x - (long ? 12 : 6), y + (long ? 6 : 3)]]));
    }

    // Depth from a corner where a slanted length meets a level one, in place of the dots and lamps that were here
    // (SX, 2026-10-01: «диагонали ровные именно от ... сопряжения горизонтальной и вертикальной грани ... Чтобы такая
    // перспективка получилась»; then «они не продолжают углы ... неправильные по геометрии. И слишком близко стоят к
    // краю ... сделай только по бокам, не делай эти углы у близко к тяге и скорости ... только два»): one on each side,
    // at DEPTH.corner, a 45-degree line out of the very point where the bar's lower line turns, down and outward, as the
    // third edge of the corner coming toward the pilot; DEPTH.run px across, the right side mirrored (ANGLES.md: 1:1).
    // Both corners, the strut's foot and the notch (SX: «D1 и D2, я хочу, чтобы обе были ... проверь только углы ...
    // чтобы они параллельные были»): each starts on a pixel's middle, so every one is the same staircase of pixels.
    for (const at of DEPTH.corners) {
      const [fx, fy] = lowerCorner(rail[at - 1], rail[at], rail[at + 1]);
      const from = [Math.round(fx - 0.5) + 0.5, Math.round(fy - 0.5) + 0.5];
      lines.push(flip([from, [from[0] - DEPTH.run, from[1] + DEPTH.run]]));
    }
  }
  const made = { consoleTop: layout.consoleTop, W, H, body, bars, lengths, paths: glintPaths(lengths), lines };
  frames.set(rail, made);
  return made;
}
const OPEN = Object.freeze({ open: true });

export function drawCockpitFrame(r, layout) {
  if (!layout.deck) return;
  const { ctx } = r;
  const W = r.width, H = r.height;
  const frame = frameOf(layout, W, H);

  ctx.save();
  ctx.globalAlpha = 1;
  // One opaque body under the whole silhouette: both screens, the notches and
  // the console the helm stands on (SX, 2026-09-30). The instruments are drawn
  // over it, so its top line reads as passing behind them.
  trace(ctx, frame.body);
  ctx.closePath(); ctx.fillStyle = ROLES.backing; ctx.fill();

  const bars = frame.bars;
  for (const bar of bars) hollowBar(ctx, bar, ROLES.structure, OPEN);
  // labs/graphics/cockpit-fx.js: glints ride the bars as the ship turns, and the bars wear the hull's damage, a step
  // each fifth of it, dented and then broken through.
  const spots = noteBars(bars);
  if (COCKPIT_FX.wear) {
    drawWear(ctx, bars, spots, cockpitLevel(), { t: COCKPIT_FX.now, light: cockpitLight(COCKPIT_FX.now),
      motion: !COCKPIT_FX.reducedMotion, seed: cockpitSeed(), lengths: frame.lengths, paths: frame.paths });
  }

  for (const points of frame.lines) line(ctx, points);

  // Screens sit on the dash without boxes or headings (SX, 2026-09-25).
  r.fill(layout.left.x, layout.left.y, layout.left.w, layout.left.h, ROLES.backing);
  r.fill(layout.right.x, layout.right.y, layout.right.w, layout.right.h, ROLES.backing);
  ctx.restore();
}
