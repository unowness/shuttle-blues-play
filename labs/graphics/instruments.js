import { ROLES } from '../../src/roles.js';
import { fitText } from '../../src/interface.js';
import { speedStep } from '../../src/chassis.js';
import { clamp } from '../../src/util.js';

// SAFE / CRUISE / DANGER inks (SX, 2026-09-26: "последние два деления могут
// означать уже опасную, красную скорость, средний диапазон нормальную
// зелёную"). The steps themselves are src/chassis.js's speedStep(); this is
// only the presentation side of that one shared boundary.
const STEP_INK = { safe: ROLES.textPrimary, cruise: ROLES.driveActive, danger: ROLES.danger };

// Each side's climb from its spool floor to full (src/helm.js, thrustRamp and
// retroRamp, from the engine's own spools in src/ship.js) reaches this gauge
// through helmPose's returned pose: nested at state.pose when state comes from
// vector-helm.js's drawVectorHelm(), or flat when a caller (a check, most
// often) passes a bare helmPose() result. A side whose key is not held reads
// 0, because thrust is only applied while it is held; a caller that reports
// no ramp at all gets the old all-or-none reading. Nothing here ever assigns
// to a ship.
const rampOf = (state, key, engaged) => {
  if (!engaged) return 0;
  const raw = state.pose ? state.pose[key] : state[key];
  return typeof raw === 'number' ? clamp(raw, 0, 1) : 1;
};

// The part of a polygon on one side of a horizontal line (Sutherland-Hodgman
// against a single edge): `keepBelow` keeps y >= cut, otherwise y <= cut.
// Used for partly filled gauge steps, so a step fills inside its own contour.
function clipY(points, cut, keepBelow) {
  const inside = ([, y]) => keepBelow ? y >= cut : y <= cut;
  const out = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (cut - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, cut]);
    }
  });
  return out;
}

// How many steps each gauge has, and the air between two of them (SX, 2026-10-01: «в тяге сделаем 4 стрелки
// сверху, 4 снизу, а в скорости ну, чуть-чуть уменьшим ... толщина вот стрелок в тяге и прямоугольников в скорости
// слишком разная, и количество слишком различается»; it was three a side and nine). In the same height, an arrow
// and a bar now come out about as thick, about 10 px of ink to 4 of air at the console's 112 px rail.
export const GAUGE = Object.freeze({ speedSteps: 8, driveSteps: 4, gap: 4 });
// How wide THR's arrows are by the neutral line, as a share of its widest (the outermost): they widen from it outward,
// less than they did (0.625), so THR weighs about what SPD's bars do (SX, 2026-10-01: «у тяги ... Она сужается ...
// Попробуй ее в серединке чуть пошире ... скорость у нас такая топорная, прямоугольная, а тяга такая тоненькая»; then,
// of the sheet's T0 and T1: «Т1 берем»).
const THR_MIDDLE = 0.82;

// Shared vector rail: GAUGE.speedSteps steps, independent of font glyph metrics.
// `level` runs 0..steps and may be fractional: the step it falls inside fills
// partly, from the rail's low end, so the rail rises with the value instead of
// jumping a whole step. `ink(i)` returns the colour for segment i (0 at the
// bottom); a plain colour keeps every segment the same.
function drawSegmentRail(r, bounds, level, { vertical = false, ink = ROLES.textPrimary, steps = GAUGE.speedSteps } = {}) {
  const { ctx } = r;
  const inkAt = typeof ink === 'function' ? ink : () => ink;
  ctx.save(); ctx.lineWidth = 1;
  const step = (vertical ? bounds.h : bounds.w) / steps;
  for (let i = 0; i < steps; i++) {
    const x = Math.round(vertical ? bounds.x : bounds.x + i * step) + .5;
    const y = Math.round(vertical ? bounds.y + (steps - 1 - i) * step : bounds.y) + .5;
    const w = Math.floor(vertical ? bounds.w : Math.max(1, step - GAUGE.gap));
    const h = Math.floor(vertical ? Math.max(1, step - GAUGE.gap) : bounds.h);
    const segmentInk = inkAt(i);
    const fill = clamp(level - i, 0, 1);
    if (fill > 0) {
      ctx.beginPath();
      if (vertical) ctx.rect(x, y + h * (1 - fill), w, h * fill);
      else ctx.rect(x, y, w * fill, h);
      ctx.fillStyle = segmentInk; ctx.fill();
    }
    ctx.beginPath(); ctx.rect(x, y, w, h);
    ctx.strokeStyle = fill > 0 ? segmentInk : ROLES.structure;
    ctx.stroke();
  }
  ctx.restore();
}

function gaugeLabel(r, bounds, value, y, ink) {
  const text = fitText(value, Math.floor(bounds.w / r.cellW));
  const width = Array.from(text).length * r.cellW;
  const x = bounds.x + (bounds.w - width) / 2;
  const left = Math.max(bounds.x, x - r.cellW / 4);
  const right = Math.min(bounds.x + bounds.w, x + width + r.cellW / 4);
  r.fill(left, y, right - left, r.cellH, ROLES.backing);
  r.text(text, x, y, ink, 1);
  return { value: text, x, y, w: width, h: r.cellH };
}

function gaugePath(ctx, points, ink, fill = null) {
  ctx.beginPath();
  points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  if (fill !== null) {
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = ink;
  ctx.stroke();
}

// Segment i's own step, read at the centre of the speed band it represents
// (never at its edge, so one rounding choice cannot flip a segment's colour).
// The same function classifies the physics taper (src/ship.js), so the
// gauge's white/green/red bands always agree with where thrust actually
// starts costing more.
const segmentStep = (i, maxSpeed) => speedStep((i + 0.5) / GAUGE.speedSteps * maxSpeed, maxSpeed);

// The speed rail is continuous too (SX, 2026-09-29: the gauges should rise
// with the ship's speed as it builds, not jump): `level` is speed in steps of
// maxSpeed (GAUGE.speedSteps), and the step it is inside fills partly. `count` is how many steps
// hold any ink at all. The value stands on the console's readout row, level
// with RET and the brake; SX struck the "u/s" under it (2026-09-30).
function drawSpeedGauge(r, bounds, speed, maxSpeed) {
  const { cellW: cw, cellH: ch } = r;
  const steps = GAUGE.speedSteps;
  const level = Math.max(0, Math.min(1, maxSpeed > 0 ? speed / maxSpeed : 0)) * steps;
  const count = Math.max(0, Math.ceil(level - 1e-9));
  const pad = bounds.foot ?? ch * .4;   // air between the rail and its labels
  const rail = { x: bounds.x + cw, y: bounds.y + ch + pad,
    w: bounds.w - 2 * cw, h: bounds.h - 2 * ch - 2 * pad };
  const step = rail.h / steps;
  const segments = Array.from({ length: steps }, (_, i) => ({
    x: Math.round(rail.x) + .5,
    y: Math.round(rail.y + (steps - 1 - i) * step) + .5,
    w: Math.floor(rail.w), h: Math.floor(Math.max(1, step - GAUGE.gap)),
    fill: clamp(level - i, 0, 1),
    active: level - i > 1e-9,
    ink: STEP_INK[segmentStep(i, maxSpeed)],
  }));
  // The rail stands on black, bars and the spaces between them: since the console rose (2026-10-01) its upper half
  // stands over the sky, which showed through (SX: «я бы закрасил черным вот эти секции чтобы под ними мир не
  // отображался»). No scale beside it any more (SX, 2026-10-01: «у скорости шкалу нафиг убери, боковую ... лучше
  // меньше шума»).
  r.fill(Math.round(rail.x), Math.round(rail.y), Math.ceil(rail.w) + 1, Math.ceil(rail.h) + 1, ROLES.backing);
  drawSegmentRail(r, rail, level, { vertical: true, ink: (i) => STEP_INK[segmentStep(i, maxSpeed)] });
  const labels = [
    gaugeLabel(r, bounds, 'SPD', bounds.y, ROLES.textSecondary),
    gaugeLabel(r, bounds, Math.round(speed), bounds.y + bounds.h - ch, ROLES.textPrimary),
  ];
  return { bounds, rail, segments, level, count, labels };
}

function drawCommandGauge(r, bounds, state) {
  const { ctx, cellW: cw, cellH: ch } = r;
  // The command (which side, if either) still comes from helmPose; raw keys
  // and velocity are not consulted. Each side fills with its engine's climb
  // (SX, 2026-09-29: "повышались в зависимости от того как долго юзер держит
  // кнопку", then "использовал всю шкалу а не только последнее деление"): the
  // whole scale, GAUGE.driveSteps steps continuously, innermost first, from the
  // press to full thrust.
  const command = state.thrusting ? -1 : state.retroing ? 1 : 0;
  const thrustRamp = rampOf(state, 'thrustRamp', command === -1);
  const retroRamp = rampOf(state, 'retroRamp', command === 1);
  const x = Math.round(bounds.x + bounds.w / 2) + .5;
  const pad = bounds.foot ?? ch * .4;   // air between the steps and THR / RET
  const top = bounds.y + ch + pad;
  const bottom = bounds.y + bounds.h - ch - pad;
  const middle = (top + bottom) / 2;
  const gap = ch * .4;
  const reach = (bottom - top - gap) / 2;
  const steps = GAUGE.driveSteps;
  const step = reach / steps;
  const width = bounds.w - 2 * cw;
  // An arrow is a bent bar: its ink is `thick` deep everywhere, as deep as a speed bar, and `GAUGE.gap` of air
  // lies between two of them, as between the bars; its outline is `thick + tip` tall.
  const tip = Math.min(ch * .16, step / 4);
  const thick = Math.max(1, step - GAUGE.gap);
  // The steps stand on black, the spaces between them too (SX, 2026-10-01, as the speed rail).
  r.fill(Math.round(x - width / 2) - 1, Math.round(top) - 1, Math.ceil(width) + 3, Math.ceil(bottom - top) + 2, ROLES.backing);
  // No line down its middle any more (SX, 2026-10-01: «у тяги ... вертикальную линию. Посередине ... меньше шума»).
  const segments = [];
  for (const direction of [-1, 1]) {
    const level = direction === -1 ? thrustRamp : retroRamp;
    for (let i = 0; i < steps; i++) {
      const y = middle + direction * (gap / 2 + (i + .5) * step);
      const halfWidth = (width / 2) * (THR_MIDDLE + (1 - THR_MIDDLE) * i / (steps - 1));
      const halfHeight = (thick + tip) / 2;
      const points = [
        [x - halfWidth, y - halfHeight + (direction < 0 ? tip : 0)],
        [x, y - halfHeight + (direction > 0 ? tip : 0)],
        [x + halfWidth, y - halfHeight + (direction < 0 ? tip : 0)],
        [x + halfWidth, y + halfHeight - (direction > 0 ? tip : 0)],
        [x, y + halfHeight - (direction < 0 ? tip : 0)],
        [x - halfWidth, y + halfHeight - (direction > 0 ? tip : 0)],
      ];
      // A step fills from the side nearest the neutral line outward.
      const fill = clamp(level * steps - i, 0, 1);
      const active = fill > 1e-9;
      const lo = y - halfHeight, hi = y + halfHeight;
      const part = fill >= 1 ? points : !active ? [] : direction < 0
        ? clipY(points, hi - fill * (hi - lo), true)
        : clipY(points, lo + fill * (hi - lo), false);
      gaugePath(ctx, points, active ? ROLES.driveActive : ROLES.structure, ROLES.backing);
      if (part.length > 2) {
        gaugePath(ctx, part, ROLES.driveActive, ROLES.driveActive);
        gaugePath(ctx, points, ROLES.driveActive);
      }
      segments.push({ direction, active, fill, points, part });
    }
  }
  gaugePath(ctx, [[x - width / 2, middle], [x + width / 2, middle]], ROLES.textSecondary);
  // A separate cursor makes neutral, forward and reverse distinct by position.
  const cursorY = command === 0 ? middle : middle + command * (gap / 2 + reach - step / 2);
  const cursorX = bounds.x + cw * .35;
  const cursor = [[cursorX, cursorY - ch * .25], [cursorX + cw * .45, cursorY], [cursorX, cursorY + ch * .25]];
  gaugePath(ctx, cursor, command === 0 ? ROLES.textSecondary : ROLES.driveActive,
    command === 0 ? ROLES.backing : ROLES.driveActive);
  const labels = [
    gaugeLabel(r, bounds, 'THR', bounds.y, command < 0 ? ROLES.driveActive : ROLES.textSecondary),
    gaugeLabel(r, bounds, 'RET', bounds.y + bounds.h - ch, command > 0 ? ROLES.driveActive : ROLES.textSecondary),
  ];
  return { bounds, command, thrustRamp, retroRamp, segments, cursor, labels };
}

// layout.drive and layout.velocity are separate instrument bounds in CSS
// pixels (desktop: 6 native columns wide, from the grip's top at rest down to
// the readout row). State is the effective helm result. Return painted
// geometry for composition checks, without mutating it.
export function drawFlightGauges(r, layout, state, speed, maxSpeed) {
  const { ctx } = r;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2;
  ctx.lineCap = 'butt';
  ctx.setLineDash([]);
  const drive = drawCommandGauge(r, layout.drive, state);
  const velocity = drawSpeedGauge(r, layout.velocity, speed, maxSpeed);
  ctx.restore();
  return { drive, velocity };
}
