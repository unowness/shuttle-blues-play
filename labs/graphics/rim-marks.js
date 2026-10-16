// The marks at the edge of the flight, laid on one ellipse (src/rim.js; SX, 2026-10-07: «представь что есть вот такой овал и метки
// аккуратно крутятся вдоль его границы»): the routes' pointers (the cargo's or O-08's way out, the picked quest's, G's way home: src/
// interface.js guideOf), the gray distance marks of what is near (locator.js nearbyBearings: «REPAIR DROID 356», «HALCYON 2,443») and
// the pirates' arrows. Each was placed by a rule of its own until then, on a rectangle, jumping to a free slot where its place was
// taken. The map's flags have no mark at the edge (they stand in space and on the locator), nor does a ghost's label (only on the
// screen). The ellipse's walls (playArea): the locator's column and the quest list's, each on its side (the left one's inner edge, and the same distance in from the right), the helmet's floor, the deck's top.
import { UI, uiMetrics } from '../../src/uiGrid.js';
import { ROLES } from '../../src/roles.js';
import { Rim, rimOf, drawDiving } from '../../src/rim.js';
import { drawGuideAt, formatDistance } from '../../src/interface.js';
import { MARK_FOCUS, pingShare } from '../../src/tasks.js';
import { helmetOf } from './helmet.js';
import { deckTop } from './hud-place.js';

// The gray marks' alpha (SX, 2026-10-04: «серые метки по краям экрана вообще не нужны, или нужны прям сильно прозрачнее», then his
// pick E1 QUIET on labs/graphics/sketches/space-tones.html): 2.2:1 on black through the look NOW.
export const BEARING_ALPHA = 0.45;

// The play area the ellipse is inset in, on `r`'s screen: `boxes` the HUD's groups as last drawn (hud-place.js hudPlaceBoxes: the
// column and the quests under it, wherever LAYOUT put them), `layout` the deck's (hud.js). The column's inner edge on its side, the
// same distance in from the other side (so the ship flies in the ellipse's middle), the helmet's floor while the deck stands (its
// top, hud.js), else the view's edges.
export function playArea(r, { boxes = null, layout = null } = {}) {
  const v = r.view;
  let side = 0;
  for (const id of ['column', 'quests']) {
    const b = boxes?.[id];
    if (!b || !(b.w > 0)) continue;
    side = Math.max(side, b.x + b.w / 2 < v.x + v.w / 2 ? b.x + b.w - v.x : v.x + v.w - b.x);
  }
  side = Math.min(side, v.w / 3);
  const deck = layout?.deck ? deckTop(layout) : null;
  return { x0: v.x + side, x1: v.x + v.w - side,
    y0: layout?.deck ? Math.max(v.y, helmetOf(r).depth) : v.y, y1: deck == null ? v.y + v.h : Math.min(v.y + v.h, deck) };
}

// Eight compass glyphs, picked by heading (screen y downward).
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
export const compassArrow = (angle) => ARROWS[(Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8];

// The rim's marks and what each draws, kept from frame to frame (nothing made a frame, common rule 14): `slots` by key, a mark's kind,
// words and pointer, held while its mark lives on the rim, so a mark whose thing has left its list goes in its fade drawn as it was;
// `wishes` and `boxes` this frame's, the arrays kept; a gray mark's words made again only when its arrow, name or distance changes.
const rim = new Rim();
const slots = new Map(), wishes = [], boxes = [], placing = { time: 0, reducedMotion: false };
const nearKeys = new Map(), pirateKeys = new Map();
const seedOf = (key) => (Array.from(String(key)).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 628) / 100;
const keyOf = (keys, prefix, id) => { let key = keys.get(id); if (key === undefined) keys.set(id, (key = `${prefix}${id}`)); return key; };
function slotOf(key, kind) {
  let s = slots.get(key);
  if (!s) {
    s = { key, kind, angle: 0, w: 0, h: 0, at: null, seed: seedOf(key), guide: null, arrow: '', name: '', dist: -1, label: '', glyph: '',
      r: null, m: null, paint: null, pingAt: -Infinity, left: Infinity };
    s.paint = () => drawGuideAt(s.r, s.guide, s.m);
    slots.set(key, s);
    // A pointer come pings (MARK_FOCUS: one at a time, in the order they came).
    if (kind === 'guide') ping(key);
  }
  return s;
}

// The rim's marks as the last frame laid them (src/rim.js Rim.place: by key, each { x, y, alpha, phase, share, ... }), for the checks.
export const rimMarks = () => rim.marks;

// The pings waiting (keys, in the order they were asked for) and when the last one began, on the world's time (src/tasks.js MARK_FOCUS):
// a pointer come, the pointer of the quest selected, a clock passing MARK_FOCUS.ping.clock. One at a time, `gap` apart; a key already
// waiting or blinking is not asked twice. `drawn` the place a pointer is drawn at, its alpha times the focus's and the ping's (kept).
const pings = { queue: [], last: -Infinity, active: null };
function ping(key) {
  const s = slots.get(key);
  if (pings.queue.includes(key) || (s && kept.time - s.pingAt < MARK_FOCUS.ping.life)) return;
  pings.queue.push(key);
}
const drawn = { x: 0, y: 0, alpha: 1, scale: 1 };
// For the checks: the keys waiting, and when a key's ping began (-Infinity: never, or its mark has gone).
export const pingQueue = () => pings.queue;
export const pingedAt = (key) => slots.get(key)?.pingAt ?? -Infinity;

// Lays and draws this frame's marks. `guides` the routes' pointers (guideOf, each or null), `bearings` the distance marks
// ({ id, label, angle, dist }), `pirates` the arrows ({ id, at }: the pirate on the screen's plane, off the view), `time` the world's
// time (s): the marks move by it, as the windows do (context.js), so the frames drawn while the world stands (a page loading, the
// pause) move nothing and a replay draws the same frames (the page's own frame time made the lab's first frames differ run to run).
// Nothing pushes a mark off the ellipse: the interface and an object's window are drawn over it (labs/graphics/main.js). The gray
// marks show whatever the ship does (SX, 2026-10-07: «давай не скрывать их»; his B1 hid them while it flew, from that morning).
// Returns the boxes of the marks drawn (the array kept: read it before the next frame).
// The world's time of the last frame, and the text's drop under its row's top for the font it was measured for (uiMetrics keys its
// cache by a string it makes each call): fields of one object, kept.
const kept = { time: 0, timed: false, font: '', cellW: 0, textY: 0 };
const NONE = Object.freeze([]);
// `active` the key of the selected quest's pointer, or null (MARK_FOCUS: every other pointer at `dim` of its light), `clock` the
// pilot's clock (World.ledger.clock: a quest's `ends` is on it).
export function drawRimMarks(r, { area, guides = NONE, bearings = NONE, pirates = NONE, time = 0, reducedMotion = false,
  ship = { x: r.cx, y: r.cy }, active = null, clock = 0 } = {}) {
  const dt = kept.timed ? Math.min(0.1, Math.max(0, time - kept.time)) : 0;
  kept.time = time; kept.timed = true;
  if (active !== pings.active) { pings.active = active; if (active != null) ping(active); }
  if (kept.font !== r.font || kept.cellW !== r.cellW) { kept.font = r.font; kept.cellW = r.cellW; kept.textY = uiMetrics(r).textY; }
  const e = rimOf(area), cw = r.cellW, textY = kept.textY;
  wishes.length = 0;
  for (const g of guides) {
    if (!g) continue;
    const s = slotOf(g.key, 'guide');
    s.guide = g; s.at = g.at; s.w = g.w; s.h = g.h; s.angle = Math.atan2(g.at.y - e.cy, g.at.x - e.cx);
    // A quest's clock passing MARK_FOCUS.ping.clock seconds left pings its pointer.
    const ends = g.route?.quest?.ends, left = ends == null ? Infinity : ends - clock;
    if (s.left > MARK_FOCUS.ping.clock && left <= MARK_FOCUS.ping.clock && left > 0) ping(s.key);
    s.left = left;
    wishes.push(s);
  }
  for (const d of bearings) {
    const s = slotOf(keyOf(nearKeys, 'near:', d.id), 'near'), arrow = compassArrow(d.angle), dist = Math.round(d.dist);
    if (s.arrow !== arrow || s.name !== d.label || s.dist !== dist) {
      s.arrow = arrow; s.name = d.label; s.dist = dist; s.label = `${arrow} ${d.label}  ${formatDistance(d.dist)}`;
    }
    s.w = (s.label.length + 2) * cw; s.h = UI.row;
    const far = d.dist * (r.zoom ?? 1);              // (its units in px on the screen: the camera's height, src/zoom.js)
    s.angle = Math.atan2(ship.y + Math.sin(d.angle) * far - e.cy, ship.x + Math.cos(d.angle) * far - e.cx);
    wishes.push(s);
  }
  for (const p of pirates) {
    const s = slotOf(keyOf(pirateKeys, 'pirate:', p.id), 'pirate');
    s.glyph = compassArrow(Math.atan2(p.at.y - ship.y, p.at.x - ship.x));
    s.w = cw; s.h = r.cellH; s.angle = Math.atan2(p.at.y - e.cy, p.at.x - e.cx);
    wishes.push(s);
  }
  placing.time = time; placing.reducedMotion = reducedMotion;
  const placed = rim.place(e, wishes, dt, placing);
  // The next ping, once the one before has had its `gap` (a key whose mark has gone is dropped).
  while (pings.queue.length && time - pings.last >= MARK_FOCUS.ping.gap) {
    const s = slots.get(pings.queue.shift());
    if (!s) continue;
    s.pingAt = time; pings.last = time;
    break;
  }
  boxes.length = 0;
  const ctx = r.ctx;
  for (const s of slots.values()) {
    const m = placed.get(s.key);
    if (!m) { slots.delete(s.key); continue; }
    if (m.alpha <= 0.01) continue;
    if (s.kind === 'guide') {
      const focus = active != null && s.key !== active ? MARK_FOCUS.dim : 1;
      s.r = r; s.m = m;
      drawn.x = m.x; drawn.y = m.y; drawn.scale = m.scale ?? 1; drawn.alpha = m.alpha * focus * pingShare(time - s.pingAt, reducedMotion);
      drawDiving(ctx, drawn, s.paint);
    }
    else {
      const scaled = m.scale < 0.999 && typeof ctx?.save === 'function' && typeof ctx.scale === 'function';
      if (scaled) { ctx.save(); ctx.translate(m.x, m.y); ctx.scale(m.scale, m.scale); ctx.translate(-m.x, -m.y); }
      if (s.kind === 'near') r.text(s.label, m.x - s.w / 2 + cw, m.y - UI.row / 2 + textY, ROLES.textSecondary, BEARING_ALPHA * m.alpha);
      else r.glyphNow(s.glyph, m.x, m.y, ROLES.caution, m.alpha, 1);
      if (scaled) ctx.restore();
    }
    boxes.push(m.box);
  }
  return boxes;
}
