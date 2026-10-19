// The drift and the trick, drawn (chat F1, 2026-10-04; the step is src/drift.js and src/trick.js): the ship grown with its height
// (no shadow: SX, F1d), the figures folding it, the impact's squash; the drift's few clumps of smoke as it is thrown in and let go,
// with a light train of small ones while it skids (SMOKE below; no sparks under the hull since SX, 2026-10-05: «искры заносу под
// кораблем не нужны»);
// the rings of a contact and a planet's pinball, the streaks of a drift's push; and the control panel on springs (SX: «панель управления
// тоже должна реагировать»): the console's offset and the lever's lean, read by the page and labs/graphics/vector-helm.js. The scale of
// a jump or a drift (S8 V1+, SX's pick of 2026-10-04 on labs/graphics/sketches/helmet-top.html) is kept here (`fx.scale`) and drawn
// in the helmet's notch by labs/graphics/helmet.js; the scale over the lever and its CLEAN / OFF THE MARK went with it. (The praise
// words a zone earned, hidden in the game since SX's word of 2026-10-05, went with the lab's `?praise=on` on 2026-10-07.)
// Presentation only: nothing here is read by the world, and the look-only scatter may use Math.random.
// None of it runs where the drift and the trick are off (a check's world without them).
import { FLIGHT } from '../../src/flightConfig.js';
import { ROLES, PALETTE } from '../../src/roles.js';
import { clamp, smoothstep, TAU } from '../../src/util.js';
import { figureAt, figureTurn, liftOffset, airZones, abortTurn } from '../../src/trick.js';
import { readGameplay, writeGameplay } from '../../src/prefs.js';
import { driftPreset } from '../../src/drift.js';
import { ROCK_SHADE } from './art-tones.js';

const M = FLIGHT.trick.motion;

// The drift and the jump the game flies: the drift G1 GLIDE (SX, 2026-10-06, after flying it: «да по заносу это то что я хотел») and the
// jump J2 (SX, the same day, after flying it); the lab's `?drift=`, `?trick=` and `?jump=` to fly the others beside them went once he
// had picked, 2026-10-07, and its `?figure=` that compared the figures' pace once SX had picked 1.5 (2026-10-15, FLIGHT.trick.figures.pace).
// `&driftMode=pro | normal` puts the pilot's own setting aside. The game reads no switch (`params` empty). NORMAL or PRO
// is the pilot's, kept in this browser with the GAMEPLAY settings (`driftPro`, the pause's DRIFT row).
export function readStuntSwitches(params, store) {
  const drift = FLIGHT.drift.presets.G1, trick = FLIGHT.trick.presets.J2;
  const mode = (params.get('driftMode') || '').toLowerCase();
  const pro = mode === 'pro' || (mode !== 'normal' && readGameplay(store).driftPro === true);
  return { drift, trick, pro };
}
// The pause's DRIFT row: NORMAL or PRO, kept.
export const writeDriftPro = (pro, store) => writeGameplay({ driftPro: !!pro }, store);

// The drift's tiers, by ink: white, amber, orange (the M0 page's; the push's streaks).
const TIER_INK = [PALETTE.white, PALETTE.white, PALETTE.amber, PALETTE.orange];
// The skid's smoke (SX, 2026-10-04, F1c: «Слишком много дыма от заноса. Этого не надо. Надо небольшое облачко дыма. Как похожее на
// тот дым, что снаружи. Секции. Можно даже без заливки. Можно только вот эту полоску. Но его очень немного надо сгенерировать. Он
// не по форме как банан. Это такие пару выхлопов прикольных»; it was a trail of ▓▒░· laid along the tail's whole way and clumps
// coming in from the screen's edge): `puffs` clumps from the tail as it is thrown out and as many as the drift is let go, `gap` s
// apart, and while it skids on a light train of smaller ones, one every `trail.every` s (give or take `trail.vary` of it) from the
// tail, `trail.size` of a clump's size and living `trail.life` s, so the skid is accompanied and leaves no long trail behind (F1d:
// «дым нужен сопровождающий занос как бы»; it was none while the skid went on). Each drawn as the clouds are (src/cloudDraw.js): the
// cells inside it on the world's own grid, each one shade glyph, laid as rows, no outline (SX, 2026-10-05: «дым при дрифте ... не
// контурным ... А заливкой. Без контура»; it was the fog's outline alone, and read as one more rock's rim). The glyph is the rocks'
// half-light ('░', ROCK_SHADE.half), in the rocks' gray (ROLES.material, SX's «серый дым»).
// A clump, round and billowy, fewer and paler (SX, 2026-10-05: «дым пусть будет более клубистым круглым, можно поменьше его и
// побледнее»; it was three sections in a line back along the exhaust, two clumps in and two out, a train's every 0.2 s, at the rocks'
// 0.85): a `core` of `size` u round its middle, `lobes` lobes round it, each `lobe` of the core's radius (give or take `vary`),
// their middles `reach` of it out at even turns, the whole turned at random, so the clump's edge is scalloped and round, not a
// sausage; the core pops out first and the lobes after it, each `stagger` s after the one before, over `grow` s with an overshoot,
// larger by `perTier` for each tier the drift had at the let-go. The clump lies `behind` of its size back from the tail, takes `carry`
// of the hull's way and `kick` u/s back along the exhaust, and closes from `close` of `life` on, as the fog's puffs do, the shade at
// `alpha` fading in `fades` steps (so a few glyph buckets, not one a clump). A train's clump grows with the tier the drift has charged.
export const SMOKE = Object.freeze({
  puffs: 1, gap: 0.07, carry: 0.35, kick: 70, life: 0.8, close: 0.5, grow: 0.2, stagger: 0.05,
  size: 19, core: 1, lobes: 5, lobe: 0.6, vary: 0.15, reach: 0.75, behind: 0.6, perTier: 0.12,
  trail: Object.freeze({ every: 0.45, vary: 0.25, size: 0.6, life: 0.5 }),
  lift: Object.freeze({ size: 1, life: 1, alpha: 0.5 }),
  ink: ROLES.material, ch: ROCK_SHADE.half.ch, alpha: 0.55, fades: 3,
});
const backOut = (u, k = 1.7) => { const v = clamp(u, 0, 1) - 1; return 1 + v * v * ((k + 1) * v + k); };

export function createStuntFx() {
  return {
    puffs: [], due: [], drifting: false, tier: 0, trailAt: null, rings: [], streaks: [], seen: null,
    // The console's edge (x, y, px) and the lever's lean (a, rad) on springs, the lever's pull, a shake's time left.
    panel: { x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, pull: 0, shake: 0 },
    // The scale in the helmet's notch (the stunt under way or just ended).
    scale: null,
    time: 0,
  };
}

// ------------------------------------------------------------------------------------------------------------ the ship

// A figure's side (SX, 2026-10-05: «смени зеркально в направлении кнопок, в направлении трюков ... флип влево когда делаешь трюк с
// помощью Q, флип вправо, когда делаешь флип с помощью E. И так далее»): the side of the key that played it (src/trick.js `side`: -1
// the left, 1 the right, 0 none, the mouse's). A SPIN turns and a PLAIN tips to it (with no side to the right, clockwise, as they
// always did); a FLIP and a ROLL, folds that read the same either way from above, carry the hull `shift` of its radius out to that side
// and back over the figure (most at its middle), so it is seen going over to the left or the right. With no side they are as before.
export const FIGURE_SIDE = Object.freeze({ shift: 0.5 });

// The hull's look this frame: its height drawn (with the top's bob), where the lift puts it (and a figure's side), its scale along and
// across (the push-off and the impact squash, a figure's fold), its turn (a spin, a grab, the tail's swing, the soft abort's swing,
// which goes on over the ground after a contact). null on the ground with nothing to show. A figure turns on src/trick.js figureTurn (SX's pick of T1 SLOW, 2026-10-05): at an even speed, eased in and out,
// never past its end, the hull drawn in every frame of it (the blink F1d gave its start went with the back-out that made it needed:
// the figure did nearly all its turn inside the blink, «глючная и не читается»).
export function airLook(world, { reducedMotion = false } = {}) {
  const ship = world.ship, air = world.air, L = world.landing, nudge = world.trickAbort ? abortTurn(world) : 0;
  if (!ship.alive || (!air && !(L && L.t < M.impact.hold + M.impact.back) && !nudge)) return null;
  let h = air ? ship.air : 0, across = 1, along = 1, rot = nudge, aside = 0;
  if (air) {
    // At the top, alive and not frozen: a bob of the brief's ±1.2 % at about 1.1 Hz (until the fall begins: after a let-go while a
    // figure turns, the figure's end less the fall).
    if (air.t > M.rise && (air.release === null || air.t < air.release)) h *= 1 + 0.012 * Math.sin((air.t - M.rise) * 1.1 * TAU);
    if (!reducedMotion && air.t < M.push) { const s = 0.8 * (1 - air.t / M.push); across *= 1 + M.impact.across * s; along *= 1 - M.impact.along * s; }
    const f = figureAt(air);
    if (f) {
      // The turn's share done, and its arc (none at either end, most at the middle) on the same curve, so the side's carry and a
      // PLAIN's tip move with the turn.
      const p = figureTurn(f.u), side = f.side ?? 0, turn = side || 1, arc = Math.sin(p * Math.PI);
      if (f.kind === 'FLIP') along *= Math.cos(p * TAU);
      if (f.kind === 'ROLL') across *= Math.cos(p * TAU);
      if (f.kind === 'SPIN') rot += turn * p * TAU;
      if (f.kind === 'PLAIN') rot += turn * arc * FLIGHT.trick.figures.tip;
      if (f.kind === 'FLIP' || f.kind === 'ROLL') aside = side * FIGURE_SIDE.shift * arc;
    }
    rot += air.swing || 0;
  } else if (L && !reducedMotion) {
    // The impact: held two frames, then back with no bounce and no dip below the ground size.
    const s = L.t < M.impact.hold ? 1 : 1 - smoothstep((L.t - M.impact.hold) / M.impact.back);
    across *= 1 + M.impact.across * s; along *= 1 - M.impact.along * s;
  }
  // The side across the nose on the screen (y down): the nose's right is (-sin, cos) of its angle.
  const lift = liftOffset(h, ship.radius), off = aside * ship.radius;
  return { h, dx: lift.dx - Math.sin(ship.angle) * off, dy: lift.dy + Math.cos(ship.angle) * off, grow: lift.grow, across, along, rot,
    under: across < 0 || along < 0 };
}

// A figure turning a drawing that carries it over (src/shipLooks.js `figures`: 'coin', MODERN's, SX's pick of Y2 COIN on
// labs/graphics/sketches/modern-stunts.html, 2026-10-16: «Прыжок и фигуры. Берем y2»): past the fold's edge (a ROLL's `across` or a FLIP's
// `along` below zero) its cells stand mirrored, and its glyphs are mirrored with them, each to its twin (MIRROR: across ◢ ◣, ◟ ◞, ╭ ╮,
// ◀ ▶; along ◢ ◥, ◟ ◜, ╭ ╰, ▔ ▁), so the outline stays the ship's all the way round (the cells alone left MODERN's wings pointing in,
// its canopy in pieces and its nose ▶◀); and while it is over, its belly is seen: `FIGURE_BELLY.dark` of the way toward black, no
// canopy (the painter's, world-art.js drawPilotShip `ship.belly`). A drawing without it (CLIPPER, SCOOTY JR.) folds as before.
const twins = (list) => { const m = new Map(); for (const p of list.split(' ')) { const [a, b] = [...p]; m.set(a, b); m.set(b, a); } return m; };
export const MIRROR = Object.freeze({ across: twins('◢◣ ◤◥ ◟◞ ◝◜ ╭╮ ╰╯ /\\ ◀▶ ▞▚'), along: twins('◢◥ ◣◤ ◟◜ ◞◝ ╭╰ ╮╯ /\\ ▔▁ ▞▚') });
export const FIGURE_BELLY = Object.freeze({ dark: 0.42 });
// The drawing with its glyphs mirrored across, along or both (every frame, the brake pose's too; the rest of it, its scale breathing
// included, its own through the prototype), made once a drawing and a way.
const turnedModels = new WeakMap();
export function turnedModel(model, across, along) {
  if (!across && !along) return model;
  const key = across && along ? 'both' : across ? 'across' : 'along';
  let made = turnedModels.get(model);
  if (!made) { made = {}; turnedModels.set(model, made); }
  if (made[key]) return made[key];
  const maps = [across && MIRROR.across, along && MIRROR.along].filter(Boolean);
  const turn = (c) => ({ ...c, ch: maps.reduce((ch, map) => map.get(ch) ?? ch, c.ch) });
  const out = Object.create(model);
  out.frames = model.frames ? model.frames.map((cells) => cells.map(turn)) : null;
  out.cells = out.frames ? out.frames[model.idleFrame] : model.cells.map(turn);
  return (made[key] = out);
}

// The hull drawn by the look: `draw(ship, x, y)` is the page's own painter (world-art.js drawPilotShip), handed a stand-in whose
// drawing metrics are folded by the figure, whose facing is turned, and whose glyphs are grown with the height (and, on a drawing that
// carries it, mirrored past the fold's edge with its belly seen: the coin above).
export function drawAirShip(ship, sx, sy, look, draw) {
  const m = ship.metrics, model = ship.model;
  if (!m) { draw(ship, sx, sy); return; }
  const coin = model.figures === 'coin' && (look.across < 0 || look.along < 0);
  const scaled = Object.create(coin ? turnedModel(model, look.across < 0, look.along < 0) : model);
  scaled.scale = model.scale * look.grow;
  scaled.baseScale = (model.baseScale ?? model.scale) * look.grow;
  const stand = Object.create(ship, {
    model: { value: scaled },
    metrics: { value: { w: m.w * look.grow * look.across, h: m.h * look.grow * look.along } },
    facing: { value: ship.facing + look.rot },
    ...(coin ? { belly: { value: FIGURE_BELLY.dark } } : null),
  });
  draw(stand, sx + look.dx, sy + look.dy);
}

// ------------------------------------------------------------------------------------------------------------ the effects

const ring = (fx, x, y, ink, time, from, to) => fx.rings.push({ x, y, ink, t: 0, time, from, to });

// One frame of `dt` s: what the world did since the last frame (its stunt counters), the smoke and the sparks' lives, the panel.
export function stepStuntFx(fx, world, r, dt, { reducedMotion = false } = {}) {
  fx.time += dt;
  const ship = world.ship, log = world.stuntLog ?? { drifts: 0, boosts: 0, jumps: 0, landings: 0, bounces: 0 };
  const seen = fx.seen ?? (fx.seen = { ...log });
  const P = fx.panel;
  if (log.jumps > seen.jumps) {
    P.vy += 160;                                                             // the panel drops as the ship leaves the ground
    if (ship.alive) fx.puffs.push(liftPuff(ship));                           // and a cloud is left where it left it
  }
  if (log.landings > seen.landings && world.landing) {
    const clean = world.landing.clean;
    ring(fx, ship.x, ship.y, clean ? ROLES.highlight : ROLES.caution, 0.15, 24, 46);
    P.vy -= clean ? 260 : 420;                                               // the contact takes the panel from below
    if (!clean) P.shake = 0.35;
  }
  if (log.bounces > seen.bounces) { P.vx += (Math.random() < 0.5 ? -1 : 1) * 420; P.shake = 0.3; ring(fx, ship.x, ship.y, ROLES.structure, 0.3, 30, 80); }
  if (log.boosts > seen.boosts && world.lastBoost) {
    const b = world.lastBoost, ink = TIER_INK[clamp(b.tier, 1, 3)];
    fx.streaks.push({ x: ship.x, y: ship.y, angle: ship.angle, t: 0, ink });
    P.vy += 180;                                                             // the push kicks the panel
  }
  stepScale(fx, world);
  // The drift's puffs: a couple as the tail is thrown out, a light train of small ones while it skids on (the first after the entry's
  // couple), a couple as it is let go (larger by the tier it had then).
  const d = world.drift, T = SMOKE.trail;
  if (log.drifts > seen.drifts) { P.vx -= 60; puffsDue(fx, 0); }
  if (fx.drifting && !d) puffsDue(fx, fx.tier);
  if (!d) fx.trailAt = null;
  else if (fx.trailAt === null) fx.trailAt = fx.time + (SMOKE.puffs - 1) * SMOKE.gap + T.every;
  else if (fx.time >= fx.trailAt) {
    if (ship.alive) fx.puffs.push(smokePuff(ship, d.tier, T.size, T.life));
    fx.trailAt = fx.time + T.every * (1 + (Math.random() * 2 - 1) * T.vary);
  }
  fx.drifting = !!d;
  if (d) fx.tier = d.tier;
  Object.assign(seen, log);

  for (let i = 0; i < fx.due.length;) {
    if (fx.due[i].at > fx.time) { i++; continue; }
    if (ship.alive) fx.puffs.push(smokePuff(ship, fx.due[i].tier));
    fx.due.splice(i, 1);
  }
  for (const p of fx.puffs) { p.x += p.vx * dt; p.y += p.vy * dt; p.t += dt; }
  for (const list of [fx.rings, fx.streaks]) for (const p of list) p.t += dt;
  fx.puffs = fx.puffs.filter((p) => p.t < p.life);
  fx.rings = fx.rings.filter((p) => p.t < p.time);
  fx.streaks = fx.streaks.filter((p) => p.t < 0.6);

  // The panel follows on springs, snappy with an overshoot (stiffness 300, damping 15: about a quarter past): the console slides out
  // of a drift's turn and drops while the ship is up, bobbing; the lever leans harder in a drift, follows the tail in the air, and is
  // pulled back while the ship is up.
  const air = world.air;
  const tx = d && d.side ? -d.side * 7 : 0, ty = air ? 9 + Math.sin(air.t * 9) * 1.5 : 0;
  const ta = air ? (air.swing || 0) * 0.6 : d && d.side ? d.side * 0.3 : 0;
  const K = 300, C = 15, h = Math.min(dt, 1 / 30);
  P.vx += (K * (tx - P.x) - C * P.vx) * h; P.vy += (K * (ty - P.y) - C * P.vy) * h;
  P.va += (K * (ta - P.a) - C * P.va) * h;
  P.x += P.vx * h; P.y += P.vy * h; P.a += P.va * h;
  P.pull += ((air ? 1 : 0) - P.pull) * Math.min(1, dt * 14);
  P.shake = Math.max(0, P.shake - dt);
  if (reducedMotion) { P.x = 0; P.y = 0; P.vx = 0; P.vy = 0; P.shake = 0; }
}

// The console's offset this frame, px (with the drift's tremble by tier and a contact's shake off the mark).
export function deckShift(fx, world, { reducedMotion = false } = {}) {
  if (reducedMotion) return { x: 0, y: 0 };
  const P = fx.panel, d = world.drift;
  const jit = P.shake > 0 ? (Math.random() - 0.5) * 6 * P.shake / 0.35 : 0;
  const tremble = d ? (Math.random() - 0.5) * [0, 0.6, 1.2, 2][d.tier] : 0;
  return { x: P.x + jit + tremble, y: P.y + jit * 0.6 };
}

// What the world's queued glyphs carry of it (between the world's draw and the flush): the smoke, the rings, the streaks. (The kart's
// dots on the arc ahead went with KART, 2026-10-07.)
export function drawStuntFx(r, world, fx) {
  drawSmoke(r, world, fx.puffs);
  for (const g of fx.rings) {
    const s = world.project(r, g.x, g.y), u = g.t / g.time, rad = g.from + (g.to - g.from) * u, n = Math.max(12, Math.round(rad / 4));
    for (let i = 0; i < n; i++) r.glyph('·', s.x + Math.cos((i / n) * TAU) * rad, s.y + Math.sin((i / n) * TAU) * rad, g.ink, 1 - u);
  }
  for (const k of fx.streaks) {
    const s = world.project(r, k.x, k.y), u = k.t / 0.6, ux = Math.cos(k.angle), uy = Math.sin(k.angle);
    for (let lane = -1; lane <= 1; lane++) {
      for (let j = 0; j < 4; j++) {
        const back = 40 + u * 60 + j * 9;
        r.glyph('·', s.x - ux * back - uy * lane * 10, s.y - uy * back + ux * lane * 10, k.ink, 1 - u);
      }
    }
  }
}

// `SMOKE.puffs` puffs to leave the tail, `SMOKE.gap` s apart from now.
function puffsDue(fx, tier) {
  for (let k = 0; k < SMOKE.puffs; k++) fx.due.push({ at: fx.time + k * SMOKE.gap, tier });
}

// A clump at the hull's tail (SMOKE): its core and its lobes round it, a share of the hull's way and a kick back; `size` of a clump's
// size (a train's are smaller), living `life` s. `rand` the look's chance (the page's Math.random).
export function smokePuff(ship, tier, size = 1, life = SMOKE.life, rand = Math.random) {
  const back = ship.angle + Math.PI, bx = Math.cos(back), by = Math.sin(back), k = size * (1 + SMOKE.perTier * tier), core = SMOKE.size * SMOKE.core * k;
  const turn = rand() * TAU, sections = [{ dx: 0, dy: 0, r: core, delay: 0 }];
  for (let i = 0; i < SMOKE.lobes; i++) {
    const a = turn + (i / SMOKE.lobes) * TAU, share = SMOKE.lobe * (1 + (rand() * 2 - 1) * SMOKE.vary);
    sections.push({ dx: Math.cos(a) * core * SMOKE.reach, dy: Math.sin(a) * core * SMOKE.reach, r: core * share, delay: (i + 1) * SMOKE.stagger });
  }
  const tail = ship.radius * 0.9 + core * SMOKE.behind;
  return { x: ship.x + bx * tail, y: ship.y + by * tail, vx: ship.vx * SMOKE.carry + bx * SMOKE.kick, vy: ship.vy * SMOKE.carry + by * SMOKE.kick,
    t: 0, life, sections };
}

// The cloud a jump leaves where the ship left the ground (SX, 2026-10-06: «когда прыжок происходит рисуй под кораблем облако дыма как при
// дрифте»): a clump as the drift's, round and pale, `SMOKE.lift.size` of a clump's size under the hull's middle, standing where it was
// left (none of the hull's way), living `SMOKE.lift.life` s, its shade `SMOKE.lift.alpha` of the drift's (`share`). A side effect that
// does not catch the eye (SX, the same day: «Облачко после прыжка должно быть поменьше. И в целом более прозрачным ... Это такой
// дополнительный эффект. Он сейчас бросается в глаза слишком»): the drift's own clump size, 1.5 of it until then, and half its shade.
export function liftPuff(ship, rand = Math.random) {
  const L = SMOKE.lift, p = smokePuff({ x: ship.x, y: ship.y, vx: 0, vy: 0, angle: ship.angle, radius: 0 }, 0, L.size, L.life, rand);
  // (smokePuff lays a clump behind the tail and kicks it back along the exhaust: this one lies under the hull's middle, still.)
  return { ...p, x: ship.x, y: ship.y, vx: 0, vy: 0, share: L.alpha };
}

// The puffs this frame as one field, as a cloud is one (so two puffs that meet are one cloud): the cells of the world's grid, counted
// from the grid's corner as the fog's and the clouds' are, whose centres lie in a section of a puff, each at the step of the
// strongest puff over it (a puff's step times its `share` of the shade, 1 but the jump's cloud's); laid as rows, a row broken where
// the step changes (src/cloudDraw.js paint). Returns [x, y, count, alpha,
// ...]: a row's first cell's middle in world units, its cells, their strength.
const KEY = 1e6, MID = 5e5;
export function smokeRows(puffs, cw, ch, gx, gy) {
  const field = new Map();
  for (const p of puffs) {
    const u = p.t / p.life, open = 1 - smoothstep((u - SMOKE.close) / (1 - SMOKE.close)), step = Math.ceil(open * SMOKE.fades) * (p.share ?? 1);
    if (step <= 0) continue;
    for (const s of p.sections) {
      const t = p.t - s.delay;
      if (t <= 0) continue;
      const rad = s.r * backOut(t / SMOKE.grow) * open, x = p.x + s.dx, y = p.y + s.dy, r2 = rad * rad;
      if (rad < 1) continue;
      const i0 = Math.floor((x - rad + gx) / cw), i1 = Math.floor((x + rad + gx) / cw);
      const j0 = Math.floor((y - rad + gy) / ch), j1 = Math.floor((y + rad + gy) / ch);
      for (let j = j0; j <= j1; j++) {
        const dy = (j + 0.5) * ch - gy - y;
        for (let i = i0; i <= i1; i++) {
          const dx = (i + 0.5) * cw - gx - x;
          if (dx * dx + dy * dy >= r2) continue;
          const key = (j + MID) * KEY + i + MID;
          if (!(field.get(key) >= step)) field.set(key, step);
        }
      }
    }
  }
  const keys = [...field.keys()].sort((a, b) => a - b), out = [];
  for (let k = 0; k < keys.length;) {
    const key = keys[k], step = field.get(key);
    let n = 1;
    while (k + n < keys.length && keys[k + n] === key + n && field.get(keys[k + n]) === step) n++;
    const j = Math.floor(key / KEY) - MID, i = key - (j + MID) * KEY - MID;
    out.push((i + 0.5) * cw - gx, (j + 0.5) * ch - gy, n, SMOKE.alpha * step / SMOKE.fades);
    k += n;
  }
  return out;
}

// The smoke drawn: the field's rows of shade in the material ink, placed by the first puff's projection (one World.project a frame);
// as one row each where the renderer lays rows, else a glyph a cell.
function drawSmoke(r, world, puffs) {
  if (!puffs.length) return;
  const gx = (world.sector?.col ?? 0) * world.width, gy = (world.sector?.row ?? 0) * world.height, cw = r.cellW;
  const g = smokeRows(puffs, cw, r.cellH, gx, gy), ref = puffs[0], at = world.project(r, ref.x, ref.y);
  for (let k = 0; k < g.length; k += 4) {
    const x = at.x + g[k] - ref.x, y = at.y + g[k + 1] - ref.y, n = g[k + 2], a = g[k + 3];
    if (r.glyphRow) r.glyphRow(SMOKE.ch, x, y, n, SMOKE.ink, a);
    else for (let c = 0; c < n; c++) r.glyph(SMOKE.ch, x + c * cw, y, SMOKE.ink, a);
  }
}

// ------------------------------------------------------------------------------------------------------------ the scale

// The scale in the helmet's notch (S8 V1+; drawn by labs/graphics/helmet.js), the page's script made the world's: a jump's axis is
// its hang (s since the press, the rise included; src/trick.js lateZones: J2's one green from 0.1 s, the yellow of a late let-go, the
// red the hang's last 12 %); a drift's is its charge in shares of tier III (the
// angle its course turned), to `DRIFT_SCALE.max`: the ground to tier III, the green from it to
// the red, the red the last two cells (the same share of the scale as the jump's). The scale comes in from the middle over `in` s as
// the stunt begins, stands `hold` s after it ends, and folds back over `out` s; under reduced motion it stands whole while it is wanted.
export const SCALE_TIMES = Object.freeze({ in: 0.18, hold: 0.25, out: 0.25 });
export const DRIFT_SCALE = Object.freeze({ max: 1.3 });
export function driftZones() {
  const A = DRIFT_SCALE.max, red = A * (1 - FLIGHT.trick.scale.red);
  return { trick: null, letgo: [1, red], red };
}
// A drift's charge now, in shares of its tier III.
function driftCharge(world) {
  const d = world.drift, P = driftPreset(world);
  if (!d || !P) return 0;
  return d.swept / P.tiers[2];
}

// One frame of the scale: a stunt begun takes it (a jump over a drift); while it lasts its zones and its now (where Q was let go, it
// stops there; a drift's charge); a figure pressed in the trick's green, a let-go in the let-go green, each lights its zone for good;
// ended, it holds and folds.
function stepScale(fx, world) {
  const sw = world.stunts, air = sw?.trick ? world.air : null, d = sw?.drift ? world.drift : null;
  let s = fx.scale;
  if (air && !(s?.kind === 'jump' && s.start === air.start)) {
    s = fx.scale = { kind: 'jump', start: air.start, born: fx.time, end: null, kept: new Set(), figs: 0, release: null };
  } else if (d && !air && !(s?.kind === 'drift' && s.ref === d)) {
    s = fx.scale = { kind: 'drift', ref: d, born: fx.time, end: null, kept: new Set() };
  }
  if (!s) return;
  if (s.kind === 'jump' && air && air.start === s.start) {
    // The cursor stops, and the let-go is judged, where the hand let go (`letGo`), not where the fall began: let go while a figure
    // turns, the ship stays up until the figure's end less the fall (src/trick.js stepAir), and that is not the pilot's timing.
    const z = airZones(world);
    Object.assign(s, { A: air.hang, zones: z, now: Math.min(air.t, air.letGo ?? air.t), release: air.letGo });
    for (; s.figs < air.figs.length; s.figs++) {
      const at = air.figs[s.figs].at ?? air.figs[s.figs].start;
      if (!s.kept.has('trick') && z.trick && at >= z.trick[0] && at < z.trick[1]) s.kept.add('trick');
    }
  } else if (s.kind === 'drift' && d === s.ref) {
    Object.assign(s, { A: DRIFT_SCALE.max, zones: driftZones(), now: Math.min(DRIFT_SCALE.max, driftCharge(world)) });
  } else if (s.end === null) {
    // Ended: a jump on its contact (not a wreck, not the way in taking the ship), a drift let go with the ship whole.
    s.end = fx.time;
    const at = s.kind === 'jump' ? s.release : s.now, z = s.zones;
    const ended = s.kind === 'jump' ? !!world.landing : world.ship.alive;
    if (ended && z?.letgo && at != null && at >= z.letgo[0] && at < z.letgo[1]) s.kept.add('letgo');
  }
  if (s.end !== null && fx.time - s.end > SCALE_TIMES.hold + SCALE_TIMES.out) fx.scale = null;
}

// What the notch's scale shows now (labs/graphics/helmet.js drawScale), or null: its zones, its axis, the now, how far it has come
// in from the middle (`p`, 0..1), the zones hit and kept.
export function scaleOf(fx, { reducedMotion = false } = {}) {
  const s = fx.scale;
  if (!s || !s.zones) return null;
  const age = fx.time - s.born, gone = s.end === null ? -Infinity : fx.time - s.end - SCALE_TIMES.hold;
  const p = reducedMotion ? (gone <= 0 ? 1 : 0) : clamp(age / SCALE_TIMES.in, 0, 1) * (1 - clamp(gone / SCALE_TIMES.out, 0, 1));
  if (p <= 0) return null;
  return { kind: s.kind, zones: s.zones, A: s.A, now: s.now, p, kept: s.kept };
}
