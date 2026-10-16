// The ship's kick on the screen (SX, 2026-10-02: «Когда мы кликаем во время полета корабль должен чуть чуть подрываться в
// сторону клика и медленно возвращаться на место, а при тормозе наоборот замедляется плавно назад отъезжает, и откатывается
// быстро ... то есть метод easy in easy out и наоборот»):
// - a press of the left button in flight: the ship darts `click.px` toward the pointer in `click.out` s, easing out (quick,
//   then slowing), and comes home in `click.back` s, easing in and out (slowly);
// - the brake (SPACE) at speed: the ship slides back against its way, up to `brake.px` at `brake.speed` and more, in
//   `brake.out` s, easing in and out (slowly), holds there while braking, and comes home in `brake.back` s (quickly) when the
//   brake is let go or the ship has all but stopped.
// Then the press's (SX, 2026-10-03: «сейчас это сделано очень резко, он очень странно дергается ... Он и отскакивает как-то
// быстро ... должен ... довольно медленно так как парусник с небольшим ускорением немного двинуться»; 12 px in 0.14 s easing
// out, home in 0.8 s, until then): `click.px` toward the pointer over `click.out` s and home over `click.back` s, both easing
// in and out, a sail filling and letting go.
// - the pause let go (main.js letPauseGo; SX: «очень неестественно корабль возвращается»): `carry` takes the world under the
//   pause's ship to where the toy's ship stands while the window flies off (carryKick), so the two meet with no jump, and
//   brings it back over `carry.back` s once the world plays on, as the camera catching the ship up.
// It is the camera that moves, by the kick and against it, only while the frame is drawn: the ship, its cargo, its shots
// and what it meets stay together on the screen, and the flight never sees it. None for reduced motion.
// - the drift (chat F1, src/drift.js, the M0 page: «занос — крен наружу»): the camera leans `drift.px` out of the turn and back as the
//   drift ends, on a critically damped spring at `drift.rate` 1/s, so it eases in and out with no step in its speed at either end (SX,
//   2026-10-05, «вот это думаю можно вносить»: it followed at 4/s on an exponential, which set off at 72 px/s in a frame); a jump's contact nods it `nod.px` down and back over `nod.time` s (the brief's
//   «the camera nods 3 px over 80 ms at contact», docs/plans/2026-10-04-jump-motion.md). Both only where the lab turned them on.
export const KICK = Object.freeze({
  click: { px: 7, out: 0.7, back: 1.5 },
  brake: { px: 26, out: 0.45, back: 0.18, speed: 600, least: 60 },
  carry: { back: 0.9 },
  drift: { px: 18, rate: 8.5 },
  nod: { px: 3, time: 0.08 },
});

const ZERO = Object.freeze({ x: 0, y: 0 });
const easeInOut = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (2 - 2 * u) ** 3 / 2);

const tween = (from, to, dur, ease, next = null) => ({ from: { x: from.x, y: from.y }, to, dur, ease, t: 0, next });
function valueOf(tw) {
  if (!tw) return ZERO;
  const e = tw.ease(Math.min(1, tw.t / tw.dur));
  return { x: tw.from.x + (tw.to.x - tw.from.x) * e, y: tw.from.y + (tw.to.y - tw.from.y) * e };
}

export function createKick() {
  return { click: null, brake: null, carry: null, held: false, sliding: false, x: 0, y: 0, applied: { x: 0, y: 0 }, cam: null,
    lean: { x: 0, y: 0 }, leanV: { x: 0, y: 0 }, nod: null };
}

// A jump's contact: the camera nods down and back (the ship then stands a little higher on the screen for a moment).
export function nodKick(kick) {
  const N = KICK.nod, peak = { x: 0, y: -N.px };
  kick.nod = tween(ZERO, peak, N.time / 2, easeInOut, () => tween(peak, ZERO, N.time / 2, easeInOut));
}

// A press in flight, (dx, dy) px from the ship on the screen to the pointer.
export function kickToward(kick, dx, dy) {
  const d = Math.hypot(dx, dy), C = KICK.click;
  if (d < 1) return;
  const peak = { x: (dx / d) * C.px, y: (dy / d) * C.px };
  kick.click = tween(valueOf(kick.click), peak, C.out, easeInOut, () => tween(peak, ZERO, C.back, easeInOut));
}
// The pause let go: the camera carried (dx, dy) px over `out` s (the ship then stands that far off its place), then home.
export function carryKick(kick, dx, dy, out) {
  const to = { x: dx, y: dy };
  kick.carry = tween(valueOf(kick.carry), to, Math.max(0.01, out), easeInOut, () => tween(to, ZERO, KICK.carry.back, easeInOut));
}

// One frame of `dt` s: `braking` whether the brake is held, (vx, vy) the ship's velocity, u/s (the screen's axes are the world's).
export function stepKick(kick, dt, { braking = false, vx = 0, vy = 0, still = false, drift = null } = {}) {
  if (still) { Object.assign(kick, { click: null, brake: null, carry: null, sliding: false, x: 0, y: 0, nod: null }); kick.lean = { x: 0, y: 0 }; kick.leanV = { x: 0, y: 0 }; kick.held = braking; return kick; }
  const B = KICK.brake, speed = Math.hypot(vx, vy);
  if (braking && !kick.held && speed > B.least) {
    const k = (B.px * Math.min(1, speed / B.speed)) / speed;
    kick.brake = tween(valueOf(kick.brake), { x: -vx * k, y: -vy * k }, B.out, easeInOut);
    kick.sliding = true;
  } else if (kick.sliding && (!braking || speed < B.least)) {
    kick.brake = tween(valueOf(kick.brake), ZERO, B.back, easeInOut);
    kick.sliding = false;
  }
  kick.held = braking;
  // The drift's lean, (dx, dy) a unit vector out of the turn, or none: the spring stepped exactly over the frame (whatever its length),
  // toward where the lean wants to be.
  if (drift || kick.lean.x || kick.lean.y) {
    const D = KICK.drift, w = D.rate, e = Math.exp(-w * dt);
    const want = drift ? { x: drift.x * D.px, y: drift.y * D.px } : ZERO, L = kick.lean, V = kick.leanV;
    const ax = L.x - want.x, ay = L.y - want.y, bx = V.x + w * ax, by = V.y + w * ay;
    kick.lean = { x: want.x + (ax + bx * dt) * e, y: want.y + (ay + by * dt) * e };
    kick.leanV = { x: (V.x - w * bx * dt) * e, y: (V.y - w * by * dt) * e };
    if (!drift && Math.hypot(kick.lean.x, kick.lean.y) < 0.05 && Math.hypot(kick.leanV.x, kick.leanV.y) < 0.5) { kick.lean = { x: 0, y: 0 }; kick.leanV = { x: 0, y: 0 }; }
  }
  for (const id of ['click', 'brake', 'carry', 'nod']) {
    const tw = kick[id];
    if (!tw) continue;
    tw.t += dt;
    if (tw.t < tw.dur) continue;
    // A finished tween hands over to the next (the dart's way home), or rests where it ended: the brake's slide is held.
    kick[id] = tw.next ? tw.next() : tw.to === ZERO ? null : { ...tw, t: tw.dur };
  }
  const a = valueOf(kick.click), b = valueOf(kick.brake), c = valueOf(kick.carry);
  kick.x = a.x + b.x + c.x;
  kick.y = a.y + b.y + c.y;
  // (Added only when there is one, so a kick without them is the same sum it always was.)
  if (kick.nod) { const n = valueOf(kick.nod); kick.x += n.x; kick.y += n.y; }
  if (kick.lean.x || kick.lean.y) { kick.x += kick.lean.x; kick.y += kick.lean.y; }
  return kick;
}

// The camera moved against the kick for the frame's drawing (the ship then stands `kick` px off its place), and back
// before the world steps. A camera replaced meanwhile (a respawn, a sector loaded) is not moved back.
// (`zoom` the camera's height, src/zoom.js: the kick is in the screen's px, a unit of the world `zoom` of them.)
export function putKick(world, kick, zoom = 1) {
  const x = kick.x / zoom, y = kick.y / zoom;
  world.cam.x -= x;
  world.cam.y -= y;
  kick.applied = { x, y };
  kick.cam = world.cam;
}
export function liftKick(world, kick) {
  if (kick.cam === world.cam) { world.cam.x += kick.applied.x; world.cam.y += kick.applied.y; }
  kick.applied = { x: 0, y: 0 };
  kick.cam = null;
}
