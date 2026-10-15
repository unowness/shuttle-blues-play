// The souvenir that hangs from the locator (SX, 2026-10-08). The shelf's grid of tiles is gone: ONE souvenir hangs as a charm on a cord,
// from an eyelet on the scope's ring, into the legend's row. SX, on the eight widgets' W6 CHARMS: «нравится charms, но я бы вешал 1 и не
// делал широкую палку как его держатель куда то пристроить бы аккуратнее»; picking from the four places (labs/graphics/sketches/
// souvenir-charm.html): «берем RoW но шнурок в 1.5 раз длинее, и можно отключить отображание сувенира в карточке пилота (то есть сделать
// стейт) не выбран ни один, но после получения первого он сразу появляется на локаторе». That is C2 ROW with the cord 1.5 times longer;
// which souvenir hangs is the pilot's state (src/pilot.js `charm`: not chosen yet, NONE, or a kind; the card's CHARM line, J).
//
// The look, from the sketch (labs/graphics/sketches/souvenir-widget.js, C1-C4 ONE CHARM):
//   - the eyelet: a ring of CHARM.ring on the scope's ring, CHARM.row degrees off its bottom toward the legend's chevron, in the
//     cockpit's line ink. The locator is moved whole on the mirrored side (not mirrored), so it is on the same side of the bottom on both.
//   - the charm: the souvenir's own picture (src/souvenirPictures.js), CHARM.size px, never redrawn and never turned, under its own ring
//     at the end of a cord (three pads, CHARM.cord times, between the two rings); it hangs in the legend's row, between the word and the
//     chevron. A weight on a cord in zero g: pulled taut by the cord's weak pull, thrown the other way by the ship's acceleration as the
//     cargo on its tether is, drifting a little, slowed. A new one drops onto the cord as the old one drifts off and fades.
//   - the shelf's box a container's inset under the tallest picture's ink (the lowest any of the twelve reaches at rest), so it never
//     jumps between souvenirs; with nothing hung (not chosen yet, or NONE) there is no eyelet and the box has no height. The wallet stood
//     under the charm until the evening of 2026-10-08, when it went to the deck's left shoulder (labs/graphics/tracker.js).
//
// The look is the page's: its own clock (the frame's), no world.rng, no Math.random; reduced motion hangs it still. Made once: the
// state (createCharm, the page's `game.charm`), the places per screen (charmPlace); a frame makes nothing. What the pointer finds is the
// state's `box`, the picture's ink as drawn this frame.
import { UI } from '../../src/uiGrid.js';
import { ROLES } from '../../src/roles.js';
import { clamp } from '../../src/util.js';
import { COLLECTIBLES } from '../../src/progression.js';
import { CHARM_NONE } from '../../src/pilot.js';
import { artOf, artInk, wholeCells } from '../../src/souvenirArt.js';
import { drawSouvenirPicture } from '../../src/souvenirPictures.js';
import { hoverItem } from '../../src/hover.js';
import { columnLayout, COLUMN_GAPS, SCOPE_RADIUS } from './locator.js';

// `size` the picture's square; `ring` the eyelet's and the charm's ring radius; `row` the degrees off the scope's bottom; `cord` the
// cord's length in three pads (SX: 1.5 times, then a quarter more); `pull` .. `damp` the weight (u/s², the ship's acceleration `gain` times, a drift of
// `drift`, the air slowing it `damp` a second); `swap` the old one's fade and `come` the new one's, s; `step` the physics' sub-step, s;
// `accel` the most of the ship's acceleration it feels on an axis, u/s²: the sketch's flight pushes it with 177 at most (a lean of 26
// degrees), the game's thrust is 600 and a turn at speed more, which would lay it flat, and a blow's jump of speed is no push to swing by;
// `smooth` the s over which the ship's acceleration is averaged (the world's fixed step and the frame's do not meet).
// SX, 2026-10-08, after flying it: «сделай сувенир побольше на 25% а цепочку ему сделай маленькими кружочками и на 25% длинее чем сейчас»:
// `size` 90 (72), `cord` 1.875 (1.5), the cord a chain of `link` rings `pitch` px apart along it (a line until then). Then (2026-10-09,
// «заскейли ... чтобы не портилась пиксельная сетка ... если будешь менять размер то можно в большую сторону») `size` 96, the art's
// cells on whole device pixels in it (src/souvenirArt.js wholeCells: 90 or 96 px across, as the art's grid allows). Then (2026-10-09,
// «Крупнее цепочку. Чуть длиннее еще. Крупнее процентов на 30. И добавь ей эффект резиновости еще небольшой ... Но слегка»): the links
// `link` 2 (1.5) `pitch` 5 (4) apart, 30 % larger; `cord` 2.25 (1.875), a fifth longer; and the chain gives like rubber past its
// length: `stretch` the pull back per px it is drawn out (u/s²; the weight's own pull draws it 3 px at rest, the ring still in the
// legend's row), `rubber` the bounce its give loses a second, `give` the most px it is drawn out before it stops hard as the cord did.
// Then (SX, 2026-10-15, on the Firefox checks' FC7: «у брелок надо приблизительно на 15-20% меньше, посмотри как ровнее будет по символам,
// цепочку надо другую придумать, может просто ряд бусин из символов точек типо»; again after a flight: «брелок на другого типа цепочки
// должен быть. И меньше размером процентов на 15-20 ... чтобы ровно остался»): the chain a row of beads, `bead` glyphs `pitch` px apart in a
// font of `beadPx` px (it was rings of `link` 2 px). The picture went to 80 for a night (80 to 84 px at 2x, whole cells) and back to 96 on
// SX's «Брелок верни к 96, бусины оставь» (2026-10-16), after «брелок чуть побольше»: on whole cells a 32-cell art is 80 or 96 px at 2x,
// nothing between.
export const CHARM = Object.freeze({ size: 96, ring: 3, row: 16, cord: 2.25, pull: 80, gain: 0.22, drift: 6, damp: 0.8, swap: 0.35, come: 0.2,
  step: 0.008, accel: 200, smooth: 0.06, bead: '•', beadPx: 9, pitch: 5, stretch: 80 / 3, rubber: 2, give: 8 });
// The cord from the eyelet's centre to the charm's ring's centre unstretched, and the nearest the two rings come (where a new one
// starts). The push the ship's acceleration gives at most (gain x accel, 44) and the drift (6) are under the pull (80): the weight never
// rises past its eyelet, and no clamp stands there (checks/charm.mjs holds the three numbers apart).
export const CORD = 2 * CHARM.ring + CHARM.cord * UI.pad * 3;
// Where the charm hangs at rest: the cord drawn out by the weight's pull (36 px, the ring on a half pixel as the eyelet is).
export const HANG = CORD + CHARM.pull / CHARM.stretch;
const NEAR = 2 * CHARM.ring;
// The most of a frame the physics integrates (a stalled frame is not a flight).
const MAX_DT = 0.05;
const NOBODY = null;

// ------------------------------------------------------------------------------------------------ the state

// The page's one charm: what hangs (`id`) at (`x`, `y`) from the eyelet, its velocity and since when (the page's clock); the one let go
// (`gone`, fading); the ship's velocity last seen and its acceleration averaged; `shown` whether it was drawn this frame, `box` its
// picture's ink as drawn (screen px; the pointer's); `paint` made once for hoverItem. Every field declared here.
export function createCharm() {
  const c = {
    id: NOBODY, x: 0, y: HANG, vx: 0, vy: 0, since: -Infinity,
    gone: { id: NOBODY, x: 0, y: 0, vx: 0, vy: 0, at: -Infinity },
    started: false, now: 0, pvx: 0, pvy: 0, ptime: 0, ax: 0, ay: 0,
    shown: false, box: { x: 0, y: 0, w: 0, h: 0 },
    r: null, px: 0, py: 0, pid: NOBODY, palpha: 1, paint: null,
  };
  c.paint = () => picture(c.r, c.pid, c.px, c.py, c.palpha);
  return c;
}

// Which kind hangs for `world`: the pilot's choice if it is a kind still owned, else none (not chosen yet, or taken off).
export function hungCharm(world) {
  const id = world?.pilot?.charm;
  return id && id !== CHARM_NONE && world.collection?.discovered?.has(id) ? id : null;
}

// Once a frame, before it is drawn: `hung` what hangs now (hungCharm, once the opening has fitted the shelf), `ship` the world's ship
// (its velocity gives the push), `worldTime` the world's clock, `t` and `dt` the page's. Reduced motion: it hangs still.
export function stepCharm(c, ship, worldTime, hung, t, dt, reducedMotion = false) {
  c.now = t;
  // The ship's acceleration, averaged over `smooth` s of the world's time; a world that has not moved (the pause) lets it go.
  if (!c.started) { c.started = true; c.id = hung; c.pvx = ship.vx; c.pvy = ship.vy; c.ptime = worldTime; }
  const dw = worldTime - c.ptime;
  if (dw > 1e-6) {
    const k = 1 - Math.exp(-dw / CHARM.smooth), A = CHARM.accel;
    c.ax += (clamp((ship.vx - c.pvx) / dw, -A, A) - c.ax) * k;
    c.ay += (clamp((ship.vy - c.pvy) / dw, -A, A) - c.ay) * k;
    c.pvx = ship.vx; c.pvy = ship.vy; c.ptime = worldTime;
  } else {
    if (dw < -1e-6) { c.pvx = ship.vx; c.pvy = ship.vy; c.ptime = worldTime; }    // the world's clock went back: a new world
    const k = Math.exp(-Math.max(0, dt) / CHARM.smooth);
    c.ax *= k; c.ay *= k;
  }
  // What hangs changed: the one before is let go (it drifts off along its cord's way and fades), the new one drops onto the cord.
  if (hung !== c.id) {
    const g = c.gone;
    if (reducedMotion) { g.id = NOBODY; c.x = 0; c.y = HANG; c.vx = 0; c.vy = 0; c.since = -Infinity; }
    else {
      g.id = c.id; g.x = c.x; g.y = c.y; g.vx = c.vx; g.vy = 60; g.at = t;
      c.x = 0; c.y = NEAR; c.vx = 0; c.vy = 0; c.since = t;
    }
    c.id = hung;
  }
  if (reducedMotion) { c.x = 0; c.y = HANG; c.vx = 0; c.vy = 0; c.gone.id = NOBODY; return; }
  const span = Math.min(Math.max(dt, 0), MAX_DT);
  if (!(span > 0)) return;
  const n = Math.max(1, Math.ceil(span / CHARM.step)), h = span / n, g = c.gone;
  const hanging = c.id !== NOBODY, letGo = g.id !== NOBODY && t - g.at < CHARM.swap;
  if (!hanging && !letGo) { g.id = NOBODY; return; }
  for (let s = 0; s < n; s++) {
    if (letGo) { g.x += g.vx * h; g.y += g.vy * h; }
    if (!hanging) continue;
    const tt = t - span + s * h;
    const fx = -CHARM.gain * c.ax + CHARM.drift * Math.sin(tt * 0.61 + 0.4);
    const fy = CHARM.pull - CHARM.gain * c.ay + CHARM.drift * Math.cos(tt * 0.47 + 0.8);
    c.vx += (fx - CHARM.damp * c.vx) * h; c.vy += (fy - CHARM.damp * c.vy) * h;
    c.x += c.vx * h; c.y += c.vy * h;
    const d = Math.sqrt(c.x * c.x + c.y * c.y);
    if (d > CORD) {
      // Past its length the chain gives like rubber: it pulls back by how far it is drawn out and loses some of its bounce. Drawn out
      // to its `give` it stops hard: the weight stops at its end and loses what pulled it out (the cargo's tether does the same).
      const nx = c.x / d, ny = c.y / d, vr = c.vx * nx + c.vy * ny, back = (CHARM.stretch * (d - CORD) + CHARM.rubber * vr) * h;
      c.vx -= back * nx; c.vy -= back * ny;
      if (d > CORD + CHARM.give) {
        const far = CORD + CHARM.give, out = c.vx * nx + c.vy * ny;
        c.x = nx * far; c.y = ny * far;
        if (out > 0) { c.vx -= 1.35 * out * nx; c.vy -= 1.35 * out * ny; }
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------ the places

// The places on `r`'s screen, kept while its measures are the same (nothing is made a frame): in the shelf's frame, `top` the line the
// shelf begins on (a container's inset under the locator's last ink, hud-sides.js `under`), `x` the box's left (the column's left ink edge). `laid` false below the size the column is laid out for (no charm there).
//   width  the column's ink width, on whole px: the shelf's box, as the scope's ring spans it
//   ex, ey the eyelet's centre from the box's left and from `top` (the ring: CHARM.row degrees off its bottom, toward the chevron)
//   drop   how far the shelf's box reaches down with a charm hung: a container's inset under the tallest picture at rest, 0 where the
//          legend's button already reaches lower
//   inks   each kind's drawn cells in its square of CHARM.size ({ x0, y0, x1, y1 }, its art's margins left out)
const kept = { w: -1, h: -1, cw: 0, ch: 0, dpr: 0, font: null, value: null };
export function charmPlace(r) {
  const k = kept;
  if (k.value !== null && k.w === r.width && k.h === r.height && k.cw === r.cellW && k.ch === r.cellH && k.dpr === r.dpr && k.font === r.font) return k.value;
  const value = lay(r);
  k.w = r.width; k.h = r.height; k.cw = r.cellW; k.ch = r.cellH; k.dpr = r.dpr; k.font = r.font; k.value = value;
  return value;
}
function lay(r) {
  const L = columnLayout(r);
  if (!L) return { laid: false, width: Math.round(2 * SCOPE_RADIUS), ex: 0, ey: 0, drop: 0, inks: new Map() };
  const R = CHARM.ring, a = (CHARM.row * Math.PI) / 180, rr = L.radius + 0.5 + R;
  const top = Math.round(L.blockBottom + COLUMN_GAPS.block);
  const hy = Math.round(L.cy + rr * Math.cos(a)) + 0.5;
  const inks = new Map();
  let tallest = 0;
  for (const def of COLLECTIBLES) {
    const b = inkBox(r, def.id);
    inks.set(def.id, b);
    tallest = Math.max(tallest, b.y1 - b.y0);
  }
  // The ring of the charm at rest ends at hy + HANG + R; the picture's ink under it.
  const lowest = hy + HANG + R + tallest;
  return { laid: true, width: Math.round(L.edge - L.x0), ex: L.radius + rr * Math.sin(a), ey: hy - top,
    drop: Math.max(0, Math.round(Math.max(L.blockBottom, lowest) + UI.air.inset) - top), inks };
}
// Where a souvenir's drawn cells stand in its square of CHARM.size (its art's own margins left out), as src/souvenirArt.js lays them.
function inkBox(r, id) {
  const size = CHARM.size, art = artOf(id);
  if (!art) return { x0: 0, y0: 0, x1: size, y1: size };
  const { cw, ch, left, top } = wholeCells(r, art, size), { i0, i1, j0, j1 } = artInk(id);
  return { x0: left + i0 * cw, x1: left + (i1 + 1) * cw, y0: top + j0 * ch, y1: top + (j1 + 1) * ch };
}

// ------------------------------------------------------------------------------------------------ drawing

const TAU = Math.PI * 2;
function ring(ctx, x, y, ink, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.lineWidth = 1; ctx.strokeStyle = ink;
  ctx.beginPath(); ctx.arc(x, y, CHARM.ring - 0.5, 0, TAU); ctx.stroke();
  ctx.restore();
}
// The souvenir's own picture (src/souvenirPictures.js), CHARM.size across, centred on (cx, cy), on whole device pixels.
function picture(r, id, cx, cy, alpha) {
  if (id === NOBODY || alpha <= 0.01) return;
  const d = r.dpr || 1, half = CHARM.size / 2;
  drawSouvenirPicture(r, id, Math.round((cx - half) * d) / d, Math.round((cy - half) * d) / d, CHARM.size, Math.min(1, alpha), { whole: true });
}

// The charm of `spot` ({ id, x, y }: the layout's, hud.js; `id` null with nothing hung, `x`, `y` the eyelet's centre) on its cord: the
// eyelet, the one let go while it fades, the one that hangs. `c` the page's state (createCharm); without one it hangs still, at rest
// (the sketch pages and the checks). Draws nothing for nothing hung once the one let go has faded.
export function drawCharm(r, spot, c = null) {
  if (c !== null) c.shown = false;
  const g = c !== null ? c.gone : null, now = c !== null ? c.now : 0;
  const fading = g !== null && g.id !== NOBODY && now - g.at < CHARM.swap, fade = fading ? 1 - (now - g.at) / CHARM.swap : 0;
  if (spot.id === NOBODY && !fading) return;
  const hx = Math.round(spot.x - 0.5) + 0.5, hy = Math.round(spot.y - 0.5) + 0.5;
  ring(r.ctx, hx, hy, ROLES.structure, spot.id === NOBODY ? fade : 1);
  if (fading) charm(r, g, g.id, hx, hy, fade, null);
  if (spot.id !== NOBODY) charm(r, c !== null ? c : REST, spot.id, hx, hy, c !== null ? clamp((now - c.since) / CHARM.come, 0, 1) : 1, c);
}
// The position a charm drawn without a state hangs at: at rest, straight down the cord.
const REST = Object.freeze({ x: 0, y: HANG });
// How many links the chain has past its first: its length at rest between the two rings' edges over the pitch.
const LINKS = Math.max(1, Math.round((HANG - 2 * CHARM.ring) / CHARM.pitch));
// One charm at `p` ({ x, y } from the eyelet (hx, hy)): the cord to its ring (the live one's; the one let go has none), its ring, its
// picture under the ring with the art's top edge on it. The live one (`c` the state) records its picture's box and is a button, the
// pointer coming up under it (src/hover.js); the one let go is only drawn.
function charm(r, p, id, hx, hy, alpha, c) {
  const ink = charmPlace(r).inks.get(id);
  if (!ink || alpha <= 0.01) return;
  const ctx = r.ctx, R = CHARM.ring, ringX = hx + p.x, ringY = hy + p.y;
  if (c !== null || p === REST) {
    const d = Math.sqrt(p.x * p.x + p.y * p.y), slack = Math.max(0, CORD - d);
    const ux = d > 0 ? p.x / d : 0, uy = d > 0 ? p.y / d : 1;
    // The chain: beads along the cord from the eyelet's edge to the charm's ring's (its sag a curve while it is slack), as many as fit
    // `pitch` apart at rest and always that many (drawn out, they part: the rubber), each a `bead` glyph centred on a whole device pixel.
    const x0 = hx + ux * R, y0 = hy + uy * R, x1 = ringX - ux * R, y1 = ringY - uy * R;
    const bx = slack > 1 ? (x0 + x1) / 2 + slack * 0.35 : (x0 + x1) / 2, by = slack > 1 ? (y0 + y1) / 2 + slack * 0.2 : (y0 + y1) / 2;
    const n = LINKS;
    const size = CHARM.beadPx / r.fontSize, dpr = r.dpr || 1, snap = (v) => Math.round(v * dpr) / dpr;
    for (let i = 0; i <= n; i++) {
      const t = (i + 0.5) / (n + 1), u = 1 - t;
      r.glyphNow(CHARM.bead, snap(u * u * x0 + 2 * u * t * bx + t * t * x1), snap(u * u * y0 + 2 * u * t * by + t * t * y1), ROLES.textSecondary, alpha, size);
    }
  }
  ring(ctx, ringX, ringY, ROLES.textSecondary, alpha);
  const sx = ringX - (ink.x0 + ink.x1) / 2, sy = ringY + R - ink.y0, half = CHARM.size / 2;
  if (c === null) { picture(r, id, sx + half, sy + half, alpha); return; }
  const box = c.box;
  box.x = Math.round(sx + ink.x0); box.y = Math.round(sy + ink.y0); box.w = Math.round(ink.x1 - ink.x0); box.h = Math.round(ink.y1 - ink.y0);
  c.shown = true;
  c.r = r; c.pid = id; c.px = sx + half; c.py = sy + half; c.palpha = alpha;
  hoverItem(r, 'charm', box, c.paint);
}
