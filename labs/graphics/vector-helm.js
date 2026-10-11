import { helmPose } from '../../src/helm.js';
import { ROLES, PALETTE } from '../../src/roles.js';
import { mixHex, clamp } from '../../src/util.js';

// The control panel answering the drift and the trick (chat F1; SX, 2026-10-04: «панель управления тоже должна реагировать»): the
// page sets these each frame from labs/graphics/stunt-fx.js: `lean` rad more of tilt (harder in a drift, with the tail in the air),
// `pull` 0..1 of the lever drawn back (while the ship is up), and `gauge`, the warning over the lever (labs/graphics/hit-warning.js
// warnGauge), or null. At rest 0, 0 and null, and the lever is the one it always was. (The drift's and the trick's scale stood over
// the lever too; since S8 it is the helmet's, labs/graphics/helmet.js.)
// `lamp`: the BRAKES lamp under the lever lit by a warning before a heavy hit (labs/graphics/hit-warning.js warnLamp; hud.js drawBrake).
export const HELM_FX = { lean: 0, pull: 0, gauge: null, lamp: null };

// SX, 2026-09-25: first "no long stem", then "чуть подлиннее". A short stem of
// about 20 units shows between the boot and the socket (the original was 53).
//
// The drawing's own units. `top` leaves room above the grip for its forward
// travel and tilt; `bottom` is a unit under the base's front edge (`front`),
// which keeps that edge's line inside the bounds; `baseBack` is the back
// edge of the base plate, which the cockpit sets on the console's top line
// (SX, 2026-09-30: the panel's edging runs behind the helm); `plate` is the
// plate's widest span (35 to 115). The readout under the helm is the cockpit's
// row now, not a band inside these bounds.
export const HELM_DESIGN = Object.freeze({ width: 150, top: 26, bottom: 156, front: 155, baseBack: 120, gripTop: 48, plate: 80 });
const DESIGN_WIDTH = HELM_DESIGN.width;
const DESIGN_TOP = HELM_DESIGN.top;
const DESIGN_HEIGHT = HELM_DESIGN.bottom - HELM_DESIGN.top;

// Input bounds are CSS pixels. Geometry scales to fit, while drawing retains a
// one-CSS-pixel contour. Points are absolute Canvas coordinates; pose is the
// effective, smoothed state returned by the shared helmPose().
// What stands still (the base, its seams, the socket) is worked out once for the bounds, and what the lever carries (the shaft, the collar,
// the grip, its rim and ridges) once for the lean and the travel it is drawn at: the helm was built again every frame, ~15 KB of
// garbage, at rest as much as turning (2026-10-09). The very object comes back while the bounds, the lean and the travel stand; it is
// read and never written (drawVectorHelm and drawGauge only read it).
let seat = null;      // { x, y, w, h, scale, originX, originY, point, parts }: the bounds' part
let lever = null;     // { angle, travel, geometry }: the last answer
export function vectorHelmGeometry(bounds, pose) {
  // A helm at rest keeps its pose; a lever turned or pulled by the pilot, the drift or a jump makes these differ from frame to frame.
  const angle = pose.turn * 0.32 + HELM_FX.lean;
  const travel = pose.travel * 7 + HELM_FX.pull * 7;
  if (!seat || seat.x !== bounds.x || seat.y !== bounds.y || seat.w !== bounds.w || seat.h !== bounds.h) {
    const scale = Math.min(bounds.w / DESIGN_WIDTH, bounds.h / DESIGN_HEIGHT);
    const originX = bounds.x + (bounds.w - DESIGN_WIDTH * scale) / 2;
    // The control stands on the console: bottom-aligned, not centred.
    const originY = bounds.y + bounds.h - DESIGN_HEIGHT * scale;
    const point = ([x, y]) => [originX + x * scale, originY + (y - DESIGN_TOP) * scale];
    const fixed = points => points.map(point);
    seat = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, scale, point, parts: {
      scale,
      pivot: point(PIVOT),
      baseTop: fixed([[47, 120], [103, 120], [115, 128], [115, 139],
        [103, 147], [47, 147], [35, 139], [35, 128]]),
      baseFront: fixed([[35, 139], [47, 147], [103, 147], [115, 139],
        [115, 147], [103, 155], [47, 155], [35, 147]]),
      baseSeams: [fixed([[47, 147], [47, 155]]), fixed([[103, 147], [103, 155]])],
      socket: fixed([[64, 127], [69, 124], [81, 124], [86, 127],
        [86, 131], [81, 134], [69, 134], [64, 131]]),
      socketFront: fixed([[64, 131], [69, 134], [81, 134], [86, 131]]),
    } };
    lever = null;
  }
  if (lever && lever.angle === angle && lever.travel === travel) return lever.geometry;
  const { point, parts } = seat;
  const pivot = PIVOT;
  // A shorter lever needs a larger tilt for the same sideways reading. The drift and the trick lean it further and pull it back
  // (HELM_FX, below; 0 without them).
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const moving = points => points.map(([x, y]) => {
    const dx = x - pivot[0], dy = y - pivot[1];
    return point([pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos]);
  });
  const grip = points => moving(points.map(([x, y]) => [75 + x, 47 + y + travel]));
  const gripBottom = 103 + travel;

  const geometry = {
    scale: parts.scale,
    pivot: parts.pivot,
    baseTop: parts.baseTop,
    baseFront: parts.baseFront,
    baseSeams: parts.baseSeams,
    shaft: moving([[70, gripBottom], [80, gripBottom], [80, 130], [70, 130]]),
    collar: moving([[67, gripBottom - 2], [83, gripBottom - 2],
      [83, gripBottom + 8], [79, gripBottom + 11], [71, gripBottom + 11], [67, gripBottom + 8]]),
    grip: grip([[-17, 8], [-11, 1], [11, 1], [17, 8], [17, 49],
      [10, 56], [-10, 56], [-17, 49]]),
    rim: grip([[-17, 8], [-11, 1], [11, 1], [17, 8], [11, 15], [-11, 15]]),
    ridges: [grip([[-12, 22], [-12, 44]]), grip([[12, 22], [12, 44]])],
    socket: parts.socket,
    socketFront: parts.socketFront,
  };
  lever = { angle, travel, geometry };
  return geometry;
}
const PIVOT = Object.freeze([75, 130]);

function path(ctx, points, ink, { closed = false, fill = null } = {}) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  if (closed) ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = ink;
  ctx.stroke();
}

// The grip's contour by where the stick is (SX, 2026-10-01: «цвет контура штурвала менять именно самой ручки в
// зависимости от того куда он направлен ... вперед потемнее назад посветлее ... без анимации»): at rest the primary
// ink as it was, pushed forward a third darker, pulled back the palette's white lifted to pure white. Only the grip and
// its cap; the rest of the helm keeps its inks. It changes with the command, not with the travel: no tween.
// Then (SX, 2026-10-02: «вперед очень темный, посередине вроде обычный. И когда на себя тянешь ... слишком маленькая
// разница с серединой. Тут бы я нашел баланс»): forward a fifth darker than the white, not a third; at rest a step
// under the white, so pulled back, pure white, stands apart from it; the three a little over a tenth of the way apart
// and then a little under a quarter.
// The stem in the interface's blue, under the same three (SX: «ножку у штурвала попробуй покрасить в синий. Чтобы тень
// штурвала ощущалась лучше ... На ножку бы я тоже такое распределение затенения повесил»).
export const GRIP_INK = Object.freeze({ rest: mixHex(PALETTE.white, '#000000', 0.1), forward: mixHex(PALETTE.white, '#000000', 0.22), back: '#FFFFFF' });
export const STEM_INK = Object.freeze({ rest: PALETTE.blue, forward: mixHex(PALETTE.blue, '#000000', 0.25), back: mixHex(PALETTE.blue, PALETTE.white, 0.4) });

// The component paints only the physical control. Its returned state lets the
// cockpit place the native-font command labels once, on its own readout row.
export function drawVectorHelm(r, bounds, world, input, { reducedMotion = false } = {}) {
  const pose = helmPose(world, { reducedMotion });
  const state = {
    thrusting: pose.thrusting,
    retroing: pose.retroing,
    // (A drift is the brake held in a turn with the dampers off, src/drift.js: the brake's lamp stays dark.)
    braking: pose.live && input.damp && !world.drift,
    live: pose.live,
  };
  const geometry = vectorHelmGeometry(bounds, pose);
  const ctx = r.ctx;
  const body = { closed: true, fill: ROLES.backing };

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2;
  ctx.lineCap = 'butt';
  ctx.setLineDash([]);

  path(ctx, geometry.baseFront, ROLES.structure, body);
  path(ctx, geometry.baseTop, ROLES.textSecondary, body);
  for (const seam of geometry.baseSeams) path(ctx, seam, ROLES.structure);
  path(ctx, geometry.socket, ROLES.structure, body);
  const lean = state.thrusting ? 'forward' : state.retroing ? 'back' : 'rest';
  path(ctx, geometry.shaft, STEM_INK[lean], body);
  path(ctx, geometry.collar, ROLES.textSecondary, body);
  const grip = GRIP_INK[lean];
  path(ctx, geometry.grip, grip, body);
  path(ctx, geometry.rim, grip, body);
  for (const ridge of geometry.ridges) path(ctx, ridge, ROLES.textSecondary);
  path(ctx, geometry.socketFront, ROLES.textSecondary);
  ctx.restore();
  if (HELM_FX.gauge) drawGauge(r, geometry, HELM_FX.gauge);

  return { ...state, pose, geometry };
}

// ------------------------------------------------------------------------------------------------------------ the warning

// A heavy hit ahead over the lever (SX's 3B, W1 and W3; labs/graphics/hit-warning.js warnGauge): the blow's name and what it would
// cost, over a line `width` px wide `rise` px over the grip that runs out as the blow comes, the words `gap` px over the line. Line
// work in the caution's ink, the danger's for a wreck.
export const GAUGE_LOOK = Object.freeze({ width: 132, rise: 30, gap: 12 });
export function drawGauge(r, geometry, g) {
  if (g.kind !== 'warn') return;
  const ctx = r.ctx, G = GAUGE_LOOK;
  const ys = geometry.grip.map((p) => p[1]);
  const cx = geometry.pivot[0], top = Math.min(...ys), y = Math.round(top - G.rise) + 0.5;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  const ink = g.fatal ? ROLES.danger : ROLES.caution, W = G.width, x0 = Math.round(cx - W / 2) + 0.5;
  line(ctx, x0, y, x0 + W, y, ink);
  ctx.lineWidth = 2; line(ctx, x0, y, x0 + W * clamp(g.left / g.lead, 0, 1), y, ink); ctx.lineWidth = 1;
  const label = g.fatal ? `WRECK  -${g.damage}` : `IMPACT  -${g.damage}`;
  const w = Array.from(label).length * r.cellW;
  r.text(label, Math.round(cx - w / 2), Math.round(y - G.gap - r.cellH), ink, 1);
  ctx.restore();
}

function line(ctx, x1, y1, x2, y2, ink) { ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
