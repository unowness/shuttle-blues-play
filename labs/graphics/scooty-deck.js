// SCOOTY JR.'s own cockpit, while the opening's loaner is flown (src/loaner.js flyingLoaner): SX's pick P3+ CHARMS, PLAIN on
// labs/graphics/sketches/scooty-cockpit.html (2026-10-04: «у скутера из вступления должна быть своя упрощенная дурацкая панель, где
// штурвал это как у самоката рычаг, в цветах этого корабля»; then P3 CHARMS with «Звонок и тормоза изобрази попроще ... не космические»;
// «берем P3+»). No dashboard: a kick scooter's handlebar dressed as a child's, in the loaner's livery: streamers off the grips for the
// speed, the bell a signal lamp that lights on the brake, the brakes one line over each grip, the rental tag swinging under the bar
// with where SCOOTY JR. goes back to and a needle along the course there; HULL and FUEL bare where the pilot's left screen has them,
// CONTROLS bare at the right. No thrust, speed, PILOT CARD or LEAVE SIGN: boarding the pilot's own shuttle, the full cockpit comes
// (hud.js), which is the promotion the sketch aimed at. The wallet stands over the rail at the pilot's place (hud.js draws it for both
// cockpits since 2026-10-08, SX: «сейчас нет индикатора монет нигде»), and the HULL and FUEL bars run to the same text edge as the pilot's.
//
// The drawing is the sketch's, moved here as it stood (its handlebar, its plain levers and lamp, its streamers and tag, its HULL and
// FUEL rows and help item); what the game adds is only what the page has and the sketch did not: the course from the objective's
// bearing (src/course.js, as every arrow), the help a button (labs/graphics/clicks.js, src/hover.js), the panel's motion stepped on the
// world's clock, the springs of a jump on the bar (HELM_FX lean and pull, as on the pilot's lever), the scale over it (HELM_FX.gauge:
// a heavy hit ahead, the jump's), and the warning's lamp (HELM_FX.lamp) on the bell, as on BRAKES. Reduced motion stills the streamers'
// flutter and the tag's swing; their readings (the streamers' spread, the needle) stay.
import { helmPose } from '../../src/helm.js';
import { fitText } from '../../src/interface.js';
import { UI, uiMetrics } from '../../src/uiGrid.js';
import { keyName } from '../../src/controls.js';
import { PALETTE, ROLES } from '../../src/roles.js';
import { clamp } from '../../src/util.js';
import { LOANER } from '../../src/loaner.js';
import { stationDefById } from '../../src/sectors.js';
import { openingQuest } from '../../src/opening.js';
import { questNavigation } from '../../src/navigation.js';
import { courseOf } from '../../src/course.js';
import { hoverItem } from '../../src/hover.js';
import { hollowBar } from './cockpit-frame.js';
import { GRIP_INK, HELM_FX, drawGauge } from './vector-helm.js';
import { keycap, keycapBox, KEYCAP_PAD } from './ui-parts.js';
import { noteKeycap } from './clicks.js';
import { EDGE } from './hud-layout.js';
import { barLook, barStep, drawMeterBar, meterRow } from './meter-bar.js';

// ------------------------------------------------------------------------------------------------ the livery

// SCOOTY JR.'s colours (src/loaner.js LOANER.livery; ships/scooty-jr.json): HOME's warm hull and its lamp, the garage's own tones.
// Its handlebar `─` is the ship's gray; the grips take the pilot's grip inks (vector-helm.js GRIP_INK), so the hands read the same in
// both cockpits. The red of the brake, the green of the course and the bars' inks are the interface's, unchanged: what is learnt in the
// loaner holds in the pilot's own.
const [WARM, LAMP] = LOANER.livery;
export const SCOOTY_INK = Object.freeze({
  line: WARM,                 // the bell, the tag, the keycap
  lamp: LAMP,                 // the lamp in the middle of the bar (its drawing's `o`), a streamer
  bar: ROLES.material,        // the handlebar's tube: the gray of the ship's `─`
  lever: ROLES.textSecondary, // a brake lever at rest
  brake: ROLES.danger,        // a brake lever squeezed: the red of BRAKES (hud.js drawBrake)
  course: ROLES.routeActive,  // the needle to the station: the course's green
  label: ROLES.textSecondary,
  value: ROLES.textPrimary,
});
const INK = SCOOTY_INK;

// ------------------------------------------------------------------------------------------------ small painters (the sketch's)

function path(ctx, points, ink, { closed = false, fill = null, width = 1 } = {}) {
  ctx.beginPath();
  points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  if (closed) ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.lineWidth = width; ctx.strokeStyle = ink; ctx.stroke();
}
// A box with its corners cut at 45 degrees (labs/graphics/ANGLES.md: cuts of 4, 8 or 16), on the pixel grid.
function cutBox(x, y, w, h, cut) {
  x = Math.round(x) + 0.5; y = Math.round(y) + 0.5; w = Math.round(w); h = Math.round(h);
  return [[x + cut, y], [x + w - cut, y], [x + w, y + cut], [x + w, y + h - cut], [x + w - cut, y + h], [x + cut, y + h],
    [x, y + h - cut], [x, y + cut]];
}
// An octagon round (x, y): a lamp, a hole.
function octagon(x, y, radius) {
  const c = Math.round(radius * 0.41);
  return cutBox(x - radius, y - radius, 2 * radius, 2 * radius, radius - c);
}
// An arrow `length` px long through (x, y), pointing `a` rad off straight up (the nose), clockwise: the course to the station, as the
// pilot looks ahead. A 1 px shaft and a filled head.
function needle(ctx, x, y, a, length, ink) {
  const ux = Math.sin(a), uy = -Math.cos(a), px = -uy, py = ux, head = 5, half = 3;
  const tip = [x + ux * length / 2, y + uy * length / 2], tail = [x - ux * length / 2, y - uy * length / 2];
  const base = [tip[0] - ux * head, tip[1] - uy * head];
  path(ctx, [tail, base], ink);
  path(ctx, [tip, [base[0] + px * half, base[1] + py * half], [base[0] - px * half, base[1] - py * half]], ink, { closed: true, fill: ink });
}
// The capitals' middle of a text row drawn from its top `y`.
const capMid = (r, y) => { const m = uiMetrics(r); return y + (m.capTop + m.capBottom) / 2; };
const textWidth = (r, text) => Array.from(text).length * r.cellW;

// HULL over FUEL as the pilot's left screen draws them (hud.js drawFlightScreen: the same labels, steps, inks and columns, the bars
// stretched to the same text edge `end`, SX, 2026-10-08: «hp и fuel сделай просто подлинее полоски»). The wallet over the rail is the
// panel's (hud.js). `x` the rows' left, `rows` their tops.
function hullAndFuel(r, x, end, rows, world) {
  const cw = r.cellW;
  const max = world.hullMax, hull = clamp(Math.round(world.hull), 0, max);
  const tank = world.fuelTank, fuel = clamp(world.fuel, 0, tank);
  const unit = barStep(max, tank);
  const steps = Math.max(1, Math.round(max / unit)), fuelSteps = Math.max(1, Math.round(tank / unit));
  const { barX, valueX, pitch } = meterRow({ x, end, cw, count: Math.max(steps, fuelSteps), digits: Math.max(String(max).length, String(Math.ceil(tank)).length),
    capLeft: uiMetrics(r).capLeft });
  r.text('HULL', x, rows[0], INK.label, 1);
  drawMeterBar(r, barX, rows[0], (hull / max) * steps, steps, barLook(hull / max), pitch);
  r.text(`${hull}`, valueX, rows[0], INK.value, 1);
  r.text('FUEL', x, rows[1], INK.label, 1);
  drawMeterBar(r, barX, rows[1], (fuel / tank) * fuelSteps, fuelSteps, barLook(fuel / tank, 'fuel'), pitch);
  r.text(`${Math.ceil(fuel)}`, valueX, rows[1], INK.value, 1);
}

// The help's key and its word, as the pilot's right screen draws its items (hud.js drawPilotScreen: a button from its cap to the end
// of its words, coming up under the pointer), its cap in the livery. The key's name is read from the controls' table, never typed.
// `x` the cap's left edge.
function helpItem(r, x, y) {
  const key = keyName('help') || '?', capX = x + KEYCAP_PAD, after = capX + textWidth(r, key) + r.cellW;
  const cap = keycapBox(r, key, capX, y);
  const box = { ...cap, w: after + textWidth(r, 'CONTROLS') - cap.x + KEYCAP_PAD };
  noteKeycap(key, box, 0, r);
  hoverItem(r, 'deck:help', box, () => {
    keycap(r, key, capX, y, { cap: INK.line, reach: 0 });
    r.text('CONTROLS', after, y, INK.label, 1);
  });
}
const helpWidth = (r) => textWidth(r, keyName('help') || '?') + r.cellW + KEYCAP_PAD + textWidth(r, 'CONTROLS');

// ------------------------------------------------------------------------------------------------ the handlebar

// SCOOTY JR.'s helm: a kick scooter's T-bar, the lamp of the ship's own drawing (ships/scooty-jr.json `─o─`) in its middle, a grip at
// each end with a brake lever over it, the stem down from the lamp. In px at the game's size. It answers the hands as the pilot's lever
// does (vector-helm.js, on src/helm.js helmPose): pushed away on thrust and pulled in on retro (`travel` px), the grips' contour darker
// forward and white back (GRIP_INK); turned with the ship (the bar yaws round its stem, `yaw` rad at a full turn: the grip on the side
// turned to comes toward the pilot, lower, the other goes away, higher, `persp` of its run); and the brake squeezes both levers onto
// the grips, in the brake's red. Being a moving thing it keeps its own lines, as the pilot's helm does (ANGLES.md).
export const HANDLEBAR = Object.freeze({
  half: 150,     // the lamp to a grip's outer end
  grip: 46,      // a grip's length
  gripH: 12,     // and thickness
  cut: 4,        // its outer corners' cut
  lamp: 10,      // the lamp's radius
  stem: 10,      // the stem's width
  yaw: 0.5,
  persp: 0.36,
  travel: 6,
});
// P3+'s plain parts: a lever line `open` px over its grip at rest, `shut` squeezed; the signal lamp's half height.
export const PLAIN = Object.freeze({ open: 7, shut: 2, chime: 5 });
// Where the bar stands: its middle `rise` px over the screen's bottom, the stem down to the bottom (the sketch's H - 120).
export const SCOOTY_DECK = Object.freeze({ rise: 120 });

// `at` the bar's middle at rest ({ x, y }); `stemTo` where the stem ends below (y). `pose` { turn, travel, lean, squeeze, lamp }:
// `lamp` the bell's light (0..1) and its ink. `charms` { tag: { swing, text, bearing }, streamers: { speed, phase } }. Returns the
// bar's points.
function drawHandlebar(r, at, pose, { stemTo = null, charms = null } = {}) {
  const H = HANDLEBAR, ctx = r.ctx;
  const phi = pose.turn * H.yaw, cos = Math.cos(phi), sin = Math.sin(phi);
  const y0 = at.y + pose.travel * H.travel;
  // A point `u` px along the bar (right positive) and `h` px over its middle line, the bar yawed: the right end comes down when
  // the ship turns right.
  const P = (u, h = 0) => [at.x + u * cos, y0 + u * sin * H.persp - h];
  ctx.save();
  ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.lineJoin = 'miter'; ctx.miterLimit = 2; ctx.lineCap = 'butt'; ctx.setLineDash([]);

  // The stem, plumb under the lamp (the bar turns round it), from the clamp down.
  if (stemTo !== null) {
    const x0 = Math.round(at.x - H.stem / 2) + 0.5, top = Math.round(y0 + 6), bottom = Math.round(stemTo);
    r.fill(x0, top, H.stem, bottom - top, ROLES.backing);
    path(ctx, [[x0, top], [x0, bottom]], INK.line);
    path(ctx, [[x0 + H.stem, top], [x0 + H.stem, bottom]], INK.line);
  }

  // A turned bar's near end is drawn a little larger than its far end (`near`), so the turn reads as the bar turning on its stem.
  const near = (side) => 1 + side * sin * 0.14;
  const leverInk = pose.squeeze > 0.5 ? INK.brake : INK.lever;
  // A lever is one line along its grip, closing onto the grip as it is squeezed, red then.
  for (const side of [-1, 1]) {
    const k = near(side), h = (H.gripH / 2 + PLAIN.open + (PLAIN.shut - PLAIN.open) * pose.squeeze) * k;
    path(ctx, [P(side * (H.half - H.grip + 3), h), P(side * (H.half - H.cut - 1), h)], leverInk);
  }

  // The bar: the cockpit's own hollow bar (cockpit-frame.js), the tube, in the ship's gray, from grip to grip.
  hollowBar(ctx, [P(-(H.half - H.grip)), P(H.half - H.grip)], INK.bar, { open: true });

  // The bell: a signal lamp, a small diamond standing on the bar left of the lamp (ANGLES.md: 45 degrees). When the brake comes on it
  // rings: lit in the lamp's light, a second diamond round it, both fading as the ring does.
  {
    const u = -64, mid = 2.5 + PLAIN.chime, d = (half, h = mid) => [P(u, h + half), P(u + half, h), P(u, h - half), P(u - half, h)];
    const ring = clamp(pose.lamp * 1.5, 0, 1), ink = pose.lampInk ?? INK.lamp;
    path(ctx, d(PLAIN.chime), INK.line, { closed: true, fill: ROLES.backing });
    if (ring > 0.01) {
      ctx.globalAlpha = ring;
      path(ctx, d(PLAIN.chime), ink, { closed: true, fill: ink });
      path(ctx, d(PLAIN.chime + 4), ink, { closed: true });
      ctx.globalAlpha = 1;
    }
  }

  // The clamp where the stem meets the bar, and the lamp on it: the drawing's `o`, lit.
  const [cx, cy] = P(0);
  path(ctx, cutBox(cx - 9, cy + 2, 18, 8, 2), INK.line, { closed: true, fill: ROLES.backing });
  path(ctx, octagon(Math.round(cx), Math.round(cy - 2), H.lamp), INK.lamp, { closed: true, fill: ROLES.backing });
  path(ctx, octagon(Math.round(cx), Math.round(cy - 2), 4), INK.lamp, { closed: true, fill: INK.lamp });

  // The grips: their inner end square to the bar, the outer cut; the contour by the hands, as the pilot's grip (GRIP_INK); three
  // rings each.
  const gripInk = GRIP_INK[pose.lean];
  for (const side of [-1, 1]) {
    const ui = side * (H.half - H.grip), uo = side * H.half, g = (H.gripH / 2) * near(side), c = H.cut;
    const outline = [[ui, g], [uo - side * c, g], [uo, g - c], [uo, -g + c], [uo - side * c, -g], [ui, -g]].map(([u, h]) => P(u, h));
    path(ctx, outline, gripInk, { closed: true, fill: ROLES.backing });
    for (const k of [12, 23, 34]) path(ctx, [P(ui + side * k, g - 3), P(ui + side * k, -g + 3)], ROLES.textSecondary);
  }

  // The streamers, three from each grip's end: limp at rest, drooping as on a bike in a yard; with speed they straighten, splay out and
  // flutter faster. The scooter's only speedometer.
  if (charms?.streamers) {
    const { speed, phase } = charms.streamers;
    const inks = [INK.lamp, INK.line, PALETTE.white], lengths = [62, 72, 54];
    for (const side of [-1, 1]) {
      const [ex, ey] = P(side * (H.half - 2), 0);
      inks.forEach((ink, k) => {
        // Straight down is pi / 2; `splay` turns a ribbon outward (toward its own side), a little inward at rest.
        const splay = side * (-0.1 + 0.17 * k + speed * (0.5 + 0.28 * k));
        const dir = Math.PI / 2 - splay, ux = Math.cos(dir), uy = Math.sin(dir), px = -uy, py = ux;
        const amp = 1.5 + 6 * speed, n = 9, pts = [];
        for (let i = 0; i <= n; i++) {
          const s = i / n, along = s * lengths[k] * (0.8 + 0.2 * speed);
          const wave = Math.sin(phase * (1 + 0.2 * k) - s * 6 + k * 1.9) * amp * s;
          const curl = (1 - speed) * s * s * 9 * side * (k - 1);
          pts.push([ex + ux * along + px * wave + curl, ey + 3 + uy * along + py * wave]);
        }
        path(ctx, pts, ink, { width: 2 });
      });
    }
  }

  // The tag: a rental key tag on a string under the bar's right half, swinging with the turns: where SCOOTY JR. goes back to, a needle
  // on it along the course to that station. Kept upright so its words read.
  if (charms?.tag) {
    const { swing, text, bearing } = charms.tag;
    const [hx, hy] = P(64, -3), len = 22;
    const tx = hx + Math.sin(swing) * len, ty = hy + Math.cos(swing) * len;
    path(ctx, [[hx, hy], [tx, ty]], INK.label);
    const cw = r.cellW, w = Math.round(Math.max(textWidth(r, 'RETURN TO'), textWidth(r, text) + 2 * cw) + 2 * 9), h = 2 * UI.row + 12;
    const bx = Math.round(tx - w / 2), by = Math.round(ty - 3);
    path(ctx, cutBox(bx, by, w, h, 4), INK.line, { closed: true, fill: ROLES.backing });
    path(ctx, octagon(Math.round(tx), by + 6, 2), INK.line, { closed: true });
    r.text('RETURN TO', bx + 9, by + 9, INK.label, 1);
    if (bearing !== null) needle(ctx, bx + 9 + cw / 2, capMid(r, by + 9 + UI.row), bearing, 13, INK.course);
    r.text(text, bx + 9 + 2 * cw, by + 9 + UI.row, INK.value, 1);
  }
  ctx.restore();
  return { y0, left: P(-H.half), right: P(H.half), top: Math.min(P(-H.half)[1], P(H.half)[1]) - H.gripH };
}

// ------------------------------------------------------------------------------------------------ its motion

// The panel's own motion, kept per world (the page has one; a sketch or a check may have more) and stepped by the world's clock, so
// it rests while the world does (the pause) and a check steps it as the world steps: the levers squeezed by a hand (quick), the bell's
// ring, the tag's swing (a pendulum pushed out of the turn), the streamers' flutter (faster with speed).
const MOTION = new WeakMap();
const motionOf = (world) => {
  let m = MOTION.get(world);
  if (!m) MOTION.set(world, (m = { time: world.time ?? 0, squeeze: 0, ding: 0, braked: false, tag: { a: 0, v: 0 }, flap: 0 }));
  return m;
};
// Whole steps of at most a sim step's length, as the sketch stepped it (the pendulum is stiff).
const STEP = 1 / 60;
function stepMotion(m, world, braking, reducedMotion) {
  const now = world.time ?? 0;
  let left = clamp(now - m.time, 0, 1);
  m.time = now;
  const ship = world.ship;
  while (left > 1e-9) {
    const dt = Math.min(STEP, left);
    left -= dt;
    m.squeeze += ((braking ? 1 : 0) - m.squeeze) * (1 - Math.exp(-28 * dt));
    if (braking && !m.braked) m.ding = 1;
    m.braked = braking;
    m.ding = Math.max(0, m.ding - dt / 0.5);
    const target = reducedMotion ? 0 : clamp(-ship.angVel * 0.16, -0.75, 0.75);
    m.tag.v += (34 * (target - m.tag.a) - 2.6 * m.tag.v) * dt;
    m.tag.a += m.tag.v * dt;
    if (reducedMotion) { m.tag.a = 0; m.tag.v = 0; }
    const speed = Math.hypot(ship.vx, ship.vy) / ship.params().maxSpeed;
    if (!reducedMotion) m.flap += dt * (2.2 + 16 * clamp(speed, 0, 1));
  }
}

// Where the tag's needle points: along the course to the objective (src/course.js, as every arrow of the page), off the nose, clockwise;
// null with no way there. And the station the tag names: the opening's A (it is the loaner's to go back to).
function course(world) {
  const quest = openingQuest(world), way = quest ? courseOf(questNavigation(world, quest)) : null;
  const label = stationDefById(world.opening?.a)?.label ?? quest?.target?.label ?? '';
  if (!way || !Number.isFinite(way.dx) || !Number.isFinite(way.dy) || (way.dx === 0 && way.dy === 0)) return { bearing: null, label };
  const a = Math.atan2(way.dy, way.dx) - world.ship.angle;
  return { bearing: Math.atan2(Math.sin(a), Math.cos(a)), label };
}

// ------------------------------------------------------------------------------------------------ the panel

// SCOOTY JR.'s cockpit in place of the pilot's lower panel (hud.js drawLabCockpit, part 'deck'), over the flight. `layout` the deck's
// (hud-layout.js deckLayout: its two text rows); `input` the hands (its brake). Returns the help's box and the bar's top.
export function drawScootyDeck(r, world, input, layout, { reducedMotion = false } = {}) {
  const W = r.width, H = r.height, cx = W / 2;
  const p = helmPose(world, { reducedMotion });
  const braking = p.live && !!input?.damp && !world.drift && !world.docked;
  const m = motionOf(world);
  stepMotion(m, world, braking, reducedMotion);
  // A heavy hit ahead lights the bell as it lights BRAKES (hud.js drawBrake: the caution's ink, the danger's for a wreck), unless braking.
  const warned = !braking && !!HELM_FX.lamp?.level && HELM_FX.lamp.lit;
  const pose = { turn: p.turn + HELM_FX.lean / HANDLEBAR.yaw, travel: p.travel + HELM_FX.pull, lean: p.thrusting ? 'forward' : p.retroing ? 'back' : 'rest',
    squeeze: m.squeeze, lamp: warned ? 0.67 : m.ding, lampInk: warned ? (HELM_FX.lamp.level > 1 ? ROLES.danger : ROLES.caution) : null };
  const speed = Math.hypot(world.ship.vx, world.ship.vy) / world.ship.params().maxSpeed;
  const way = course(world);
  const bar = drawHandlebar(r, { x: cx, y: H - SCOOTY_DECK.rise }, pose, { stemTo: H, charms: {
    tag: { swing: m.tag.a, text: fitText(way.label, 11), bearing: way.bearing },
    streamers: { speed: clamp(speed, 0, 1), phase: m.flap },
  } });
  // The scale over the bar (vector-helm.js drawGauge): what the pilot's lever shows over its grip, a heavy hit ahead or the jump's.
  if (HELM_FX.gauge) drawGauge(r, { grip: [[cx, bar.top]], pivot: [cx, bar.top] }, HELM_FX.gauge);
  const [one, two] = layout?.left?.rows ?? [H - 64, H - 64 + UI.row];
  hullAndFuel(r, EDGE, layout?.left?.textEnd ?? EDGE + 6 * r.cellW + 11 * r.cellW, [one, two], world);
  helpItem(r, W - EDGE - helpWidth(r), two);
  return { braking, bar };
}
