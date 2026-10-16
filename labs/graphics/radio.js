// The radio under the quests: SX's H1 SIDEWAYS on labs/graphics/sketches/radio-wide.html (2026-10-06: «берем sideways, прибавь ему чуть
// высоты прям 12-16 пикселей, стоит все хорошо, ты кружок увеличь, а поле с точками поуже»), his W1 POCKET of 2026-10-05 laid on its
// side as wide as the quest plates (radio-widget.html: «давай первую версию радио»; asked for on widgets.html: «графический виджет
// анимированный где изображено радио, небольшой, можно подставить под квесты»; docs/plans/picks.md). A picture of a radio, not a log:
// Braun's T3 (Dieter Rams, 1958) in the cockpit's line, the lamp at its left on the middle line, a field of holes over the speaker,
// the tuning wheel at its right end under a fixed index. It answers the game's radio:
//
//   a call       someone speaks (src/events.js `openingCall`, `trafficHail`): the lamp blinks amber while it tunes in, the wheel swings
//                to the caller and settles, the voice lights the holes from the field's middle out as loud as it is, and the sound
//                runs out through the holes as rings (the column has no free width beside the strip for W1's arcs); as long as the
//                notice stands (labs/graphics/notices.js)
//   a line       the radio's quest line (`guideHeard`): two short beeps in the radio's quest's ink (the story's purple), the wheel
//                clicks over
//   a quest      (SX, 2026-10-08: «Проверь что радио часто реагирует анимацией на квесты, зеленая волна (на сетке кружков) когда квест
//                сдан, желтая когда новый квест появился ... проваленный квест красный сигнал»): the quest list's plates as they come
//                and go (labs/graphics/quest-list.js syncQuestBoard): one come, two waves in yellow (the amber); one handed in, two in
//                green; one failed (late, or lost: a ship pestered, a reference ship, a planet's suitcase), three quick ones in red;
//                the lamp in the same ink, the wheel left to its scan. A call or a line that came the same frame plays first, the
//                quest's after it
//   silence      the lamp out, the wheel turning slowly over its band, a rare hole flickering in the speaker
//
// It hangs in the quests' column under the quests, on the side the locator is not (the top right, or the left where the pause's SIDES
// is turned: labs/graphics/hud-sides.js; on the column's top row when no quest stands), headed by a column button as the quests are:
// «T RADIO» with its chevron
// (labs/graphics/locator.js drawColumnButton), T or a click on the row hiding and showing it. Hidden, it is the row alone, and a call
// or a line lights the lamp a cell after the word, so it is still seen. Whether it is hidden is this browser's (src/prefs.js `radio`),
// not the save's; a new pilot sees it. It never covers the quests and never reaches the cockpit: where the picture does not fit
// between the list and the cockpit's line, it folds itself into its row (the page's own rule), and unfolds when there is room again.
//
// The page's drawing, copied, with SX's three changes: 72 px high (the page's 60 and 12 more: nine steps of the HUD's 8 px grid,
// UI.vector.space), the wheel as tall as that allows inside the rule's air (52 px across, 40 on the page), the holes' field a
// container's inset clear of the lamp and of the wheel (the rule's on the page), so narrower.
import { UI, uiMetrics } from '../../src/uiGrid.js';
import { PALETTE, ROLES, QUEST_INKS } from '../../src/roles.js';
import { QUEST_TONE } from '../../src/quests.js';
import { clamp, easeOut, noise3 } from '../../src/util.js';
import { readRadio, writeRadio } from '../../src/prefs.js';
import { keyName } from '../../src/controls.js';
import { COLUMN_GAPS, buttonInk, drawColumnButton, columnLayout } from './locator.js';
import { keyMarkLeft, KEYCAP_PAD } from './ui-parts.js';
import { NOTICE } from './notice.js';
import { QUEST_TIMES, QUEST_WIDTH } from './quest-list.js';
import { LORE_TIMES } from './rail.js';
import { noteKey } from './clicks.js';
import { installGrade, gradeEpoch, gradeKept } from '../../src/grade.js';

// The set: `h` high (nine steps of the HUD's 8 px grid), as wide as the quest plates (locator.js columnLayout `questW`); `under` the
// air from its row's keycap to its top line, ink to ink: a button's (COLUMN_GAPS.under) and a pad more, an optical compensation (SX,
// 2026-10-06: «оступ от кнопки радио, до радио, должен быть чуть больше ради компенсации»): the set's top is a solid line its whole
// width, which reads nearer than the same air over a plate's words (10 px until then, 14 now).
export const RADIO = Object.freeze({ h: 9 * UI.vector.space, under: COLUMN_GAPS.under + UI.pad });
export const radioSize = (r = null) => ({ w: (r && columnLayout(r)?.questW) || QUEST_WIDTH, h: RADIO.h });

// What each moment lights the lamp in, how long it lasts and where on the band the caller is: a call in amber, the warm light of a
// set warming up (the brake lamp's ink), as long as its notice stands (notices.js: an opening's call 4.2 s); the radio's line in its
// quest's ink, as long as a notice.
// A quest's signal (`beeps` of them, `gap` s apart; no `target`: the wheel goes on scanning) lasts `life`.
export const RADIO_MOMENTS = Object.freeze({
  call: Object.freeze({ life: NOTICE.life + 1, lamp: PALETTE.amber, target: 0.74 }),
  line: Object.freeze({ life: NOTICE.life, lamp: QUEST_INKS[QUEST_TONE.guide], target: 0.18, beeps: 2, gap: 0.15 }),
  come: Object.freeze({ life: 1.8, lamp: PALETTE.amber, target: null, beeps: 2, gap: 0.3 }),
  done: Object.freeze({ life: 1.8, lamp: PALETTE.green, target: null, beeps: 2, gap: 0.3 }),
  fail: Object.freeze({ life: 1.8, lamp: PALETTE.red, target: null, beeps: 3, gap: 0.12 }),
});
// The events that are each moment (src/events.js); a quest come or handed in is read off the quest list (listenQuests).
const HEARD = Object.freeze({ openingCall: 'call', trafficHail: 'call', guideHeard: 'line', pesterLost: 'fail', specialFailed: 'fail',
  suitcaseLost: 'fail' });
// A quest's plate gone by how it ended (quest-list.js `outcome`); one simply gone (the wallet fell short) says nothing.
const ENDED = Object.freeze({ done: 'done', late: 'fail' });
// The motion's own numbers (the page's): the wheel's slow scan in silence, its swing to a caller (a spring that overshoots), its hold
// and its way back; the voice (syllables a second, words a second, the share of words that are a pause); the beeps; the waves (one
// each `every` s of voice, each lives `life` s); the silence's static (a cell flickers on the lore's step this rarely).
const SCAN = Object.freeze({ home: 0.42, a: 0.05, b: 0.025, fa: 0.23, fb: 0.61 });
const SWING = Object.freeze({ lead: 0.5, damp: 5, ring: 7, hold: 2, back: 1.2 });
const VOICE = Object.freeze({ syllables: 4.4, words: 1.3, pause: 0.22, tail: 0.4 });
const BEEP = 0.15;
const WAVE = Object.freeze({ every: 0.34, life: 1.1 });
const STATIC = Object.freeze({ step: LORE_TIMES.step, share: 0.02 });
// The chevron's turn as the column's buttons turn theirs (locator.js LEGEND_TIMES.turn).
const TURN = 0.18;

// ------------------------------------------------------------------------------------------------ the radio's state

// `store`: the page's backend, where whether it is hidden is kept. `moment` the last thing heard ({ kind, at }), `after` a quest's
// signal waiting for a call or a line of the same frame to end (a kind, or null), `since` the page's time of the first quest list
// read (its plates were there before: none of them is a quest come), `open` whether the picture was shown last frame and `changed`
// since when (s, the page's clock).
export function createRadio(store) {
  return { hidden: readRadio(store), store, moment: null, after: null, since: null, open: null, changed: -Infinity, box: null, row: null };
}
// `kind` heard at `now`: a quest's signal waits behind a call or a line begun the same frame (they carry words), else the newest plays.
function hear(radio, kind, now) {
  const m = radio.moment, quest = RADIO_MOMENTS[kind].target === null;
  if (quest && m && m.at === now && RADIO_MOMENTS[m.kind].target !== null) { radio.after = kind; return; }
  radio.moment = { kind, at: now };
}
// The frame's events (World.events, before the notices drain them): the last call, line or loss heard, at `now` (s).
export function listenRadio(radio, events, now) {
  for (const e of events ?? []) if (HEARD[e.type]) hear(radio, HEARD[e.type], now);
}
// The quest list as syncQuestBoard left it this frame, at the same `now`: a plate born now is a quest come, one done now a quest
// ended (ENDED by its outcome). Then a signal waiting behind a call or a line plays once that has ended.
export function listenQuests(radio, board, now) {
  if (radio.since === null) radio.since = now;
  for (const p of board.plates) {
    if (p.born === now && now > radio.since) hear(radio, 'come', now);
    if (p.doneAt === now && ENDED[p.outcome]) hear(radio, ENDED[p.outcome], now);
  }
  const m = radio.moment;
  if (radio.after && (!m || now - m.at >= RADIO_MOMENTS[m.kind].life)) { radio.moment = { kind: radio.after, at: now }; radio.after = null; }
}
// T, or a click on its row: hidden or shown, kept in this browser.
export function toggleRadio(radio) {
  radio.hidden = !radio.hidden;
  writeRadio(radio.hidden, radio.store);
  return radio.hidden;
}

const scan = (t, reduced) => (reduced ? SCAN.home : SCAN.home + SCAN.a * Math.sin(t * SCAN.fa) + SCAN.b * Math.sin(t * SCAN.fb + 1));
const smooth = (u) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };
// The voice's loudness 0..1 at `u` s into a call: syllables on words, words with pauses, faded in and out.
function voiceAt(u, life) {
  const from = SWING.lead, to = life - VOICE.tail;
  if (u < from || u > to) return 0;
  const v = u - from, n = Math.floor(v * VOICE.syllables), f = v * VOICE.syllables - n;
  let env = Math.sin(Math.PI * f) ** 0.8 * (0.45 + 0.55 * noise3(n, 11, 3));
  if (noise3(Math.floor(v * VOICE.words), 23, 5) < VOICE.pause) env *= 0.15;
  return env * smooth((u - from) / 0.1) * smooth((to - u) / 0.1);
}
function beepAt(M, u) {
  for (let i = 0; i < M.beeps; i++) { const s = i * (BEEP + M.gap); if (u >= s && u < s + BEEP) return 0.9; }
  return 0;
}
const loudAt = (kind, u, life) => (kind === 'call' ? voiceAt(u, life) : beepAt(RADIO_MOMENTS[kind], u));

// A wave `age` s out, as loud as `amp` was when it left: on the state's list while it runs through the holes.
function wave(s, age, amp) {
  if (age >= 0 && age < WAVE.life && amp > 0.2) s.waves.push({ age, amp });
}

// The radio at `t` s with the moment `m` ({ kind, at } or null): what the picture reads.
//   kind   'rest', or the moment while it lasts (RADIO_MOMENTS)      tune   the wheel on the band, 0..1
//   lamp   { ink, k }: the lamp's ink and how lit, 0..1                voice  the loudness now, 0..1
//   waves  [{ age, amp }] the waves out                                t, reduced
export function radioState(t, m, reduced = false) {
  const s = { t, reduced, kind: 'rest', tune: scan(t, reduced), lamp: { ink: RADIO_MOMENTS.call.lamp, k: 0 }, voice: 0, waves: [] };
  if (!m || !RADIO_MOMENTS[m.kind]) return s;
  const M = RADIO_MOMENTS[m.kind], u = t - m.at, life = M.life, home = scan(t, reduced);
  if (u < 0) return s;
  // The wheel: to the caller's place (a call swings and settles, the line clicks over), held, then back to the scan; a quest's signal
  // leaves it scanning.
  if (M.target !== null) {
    let w;
    if (reduced) w = u < life ? 1 : 0;
    else if (u < life + SWING.hold) w = m.kind === 'call' ? 1 - Math.exp(-SWING.damp * u) * Math.cos(SWING.ring * u) : (u < BEEP / 2 ? 0 : 1);
    else w = 1 - smooth((u - life - SWING.hold) / SWING.back);
    s.tune = home + (M.target - home) * w;
  }
  s.lamp.ink = M.lamp;
  if (u >= life) return s;
  s.kind = m.kind;
  if (reduced) { s.lamp.k = 1; return s; }
  s.voice = loudAt(m.kind, u, life);
  // The lamp: a call blinks while it tunes in, then burns with the voice; a line or a quest's signal blinks with its beeps, then glows;
  // all go out at the end.
  const out = smooth((life - u) / 0.35);
  if (m.kind === 'call') s.lamp.k = (u < SWING.lead ? (Math.floor(u * 12) % 2 ? 0.15 : 1) : 0.75 + 0.25 * s.voice) * out;
  else s.lamp.k = (u < M.beeps * (BEEP + M.gap) ? (beepAt(M, u) ? 1 : 0.15) : 0.6) * out;
  // The waves: one each WAVE.every s of a call's voice (none in its pauses), one at each beep of a line or a quest's signal.
  if (m.kind === 'call') {
    for (let i = 0, te = SWING.lead; te < life - VOICE.tail; te = SWING.lead + ++i * WAVE.every) wave(s, u - te, voiceAt(te + 0.05, life));
  } else {
    for (let i = 0; i < M.beeps; i++) { const te = i * (BEEP + M.gap); wave(s, u - te, beepAt(M, te + 0.05)); }
  }
  return s;
}

// ------------------------------------------------------------------------------------------------ the picture

// Lines on whole pixels (1 px, the cockpit's detail weight).
const P = (v) => Math.round(v) + 0.5;
function path(ctx, pts, { stroke = null, fill = null, close = true } = {}) {
  ctx.save();
  ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.lineJoin = 'miter';
  ctx.beginPath();
  pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  if (close) ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  ctx.restore();
}
function disc(ctx, x, y, rad, { stroke = null, fill = null, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  ctx.restore();
}
// A box with its corners cut by `c` px (the cockpit's chamfer, small): its outline's points on whole pixels.
function chamfered(b, c) {
  const x0 = P(b.x), y0 = P(b.y), x1 = P(b.x + b.w - 1), y1 = P(b.y + b.h - 1);
  return [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
}
// The lamp, LAMP_R round: dark with the hint's ring when off, the moment's ink when lit.
const LAMP_R = UI.pad * 3 / 4;
function lamp(ctx, x, y, s) {
  disc(ctx, x, y, LAMP_R, { fill: ROLES.backing, stroke: s.lamp.k > 0.02 ? s.lamp.ink : ROLES.textHint });
  if (s.lamp.k > 0.02) disc(ctx, x, y, LAMP_R, { fill: s.lamp.ink, alpha: s.lamp.k });
}
// Whether a hole of the silence's static flickers now.
const flicker = (s, i, j) => !s.reduced && noise3(i, j, Math.floor(s.t / STATIC.step)) < STATIC.share;

// The holes over the speaker in the field `F`: a hole UI.pad / 2 square every 2 UI.pad, as many as fit, centred; the voice lights them
// from the field's middle out as loud as it is, and each wave runs out through them as a ring of lit holes, from the middle to the
// field's ends.
const PITCH = 2 * UI.pad, HOLE = UI.pad / 2;
// `part`: 'all' every hole (with no page to stamp on), 'still' the holes alone in their dark ink (the stamp's), 'live' only what
// lights or flickers over them.
// `gone` (i, j): a hole knocked dark (the modern radio's wear), drawn not at all.
function grille(r, F, s, part = 'all', gone = null) {
  const nx = Math.floor((F.w - HOLE) / PITCH) + 1, ny = Math.floor((F.h - HOLE) / PITCH) + 1;
  const ox = F.x + (F.w - ((nx - 1) * PITCH + HOLE)) / 2, oy = F.y + (F.h - ((ny - 1) * PITCH + HOLE)) / 2;
  const gx = ox + ((nx - 1) * PITCH + HOLE) / 2, gy = oy + ((ny - 1) * PITCH + HOLE) / 2, far = Math.hypot(gx - ox, gy - oy);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (gone && gone(i, j)) continue;
    const x = Math.round(ox + i * PITCH), y = Math.round(oy + j * PITCH), away = Math.hypot(x + HOLE / 2 - gx, y + HOLE / 2 - gy);
    if (part === 'still') { r.fill(x, y, HOLE, HOLE, ROLES.structure); continue; }
    let lit = clamp((s.voice * 0.8 - away / far) / 0.2, 0, 1);
    for (const w of s.waves) {
      const u = w.age / WAVE.life, off = Math.abs(away - easeOut(u) * far) / PITCH;
      if (off < 1) lit = Math.max(lit, (1 - off) * w.amp * (1 - u) ** 1.5);
    }
    const flick = flicker(s, i, j);
    if (part === 'all' || flick) r.fill(x, y, HOLE, HOLE, flick ? ROLES.textPrimary : ROLES.structure);
    if (lit > 0) r.fill(x, y, HOLE, HOLE, s.lamp.ink, lit);
  }
}
// The tuning wheel at (wx, wy), `R` round: its rim, ticks every 15 degrees turning with the tune over three quarters of a turn (the
// band), its own white mark, the hub; the index over it stands still and points down at its top. W1's, whose wheel is 1.5 rows round,
// its ticks, mark and hub scaled to `R`.
function wheel(ctx, wx, wy, R, s, mirror = false) {
  // Mirrored it turns the other way, as a picture reflected in a mirror does (its ticks are the same set, its mark the reflected one).
  const k = R / (1.5 * UI.row), turn = (mirror ? 1 : -1) * s.tune * 1.5 * Math.PI;
  disc(ctx, wx, wy, R, { fill: ROLES.backing, stroke: ROLES.structure });
  ctx.save(); ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.strokeStyle = ROLES.structure; ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = turn + i * Math.PI / 12, long = i % 6 === 0, r0 = R - 2, r1 = r0 - (long ? Math.max(3, 7 * k) : Math.max(UI.pad / 2, 3 * k));
    ctx.moveTo(wx + Math.cos(a) * r0, wy + Math.sin(a) * r0); ctx.lineTo(wx + Math.cos(a) * r1, wy + Math.sin(a) * r1);
  }
  ctx.stroke(); ctx.restore();
  const markA = turn - Math.PI / 2, markR = R - 13 * k;
  disc(ctx, wx + Math.cos(markA) * markR, wy + Math.sin(markA) * markR, Math.max(1, 1.5 * k), { fill: ROLES.textPrimary });
  disc(ctx, wx, wy, Math.max(UI.pad / 2, UI.pad * k), { fill: ROLES.backing, stroke: ROLES.structure });
  const iy = Math.round(wy - R) - 1;
  path(ctx, [[wx, iy], [wx - UI.pad, iy - UI.pad - 1], [wx + UI.pad, iy - UI.pad - 1]], { fill: ROLES.textPrimary });
}

// H1 SIDEWAYS in the box `B` at the state `s`: its outline chamfered, the lamp at the left on the middle line, the holes across, the
// wheel at the right end under its index, as tall as the strip allows inside the rule's air; the holes' field a container's inset
// clear of the lamp and of the wheel. `mirror`: the radio on the screen's right (SX, 2026-10-08, «Давай само радио тоже отзеркалим»;
// the pause's SIDES leaves it as it was on the left): the lamp at the right end, the wheel at the left, the holes between, the wheel
// turning the other way.
export function drawRadioPicture(r, B, s, mirror = false) {
  const ctx = r.ctx, M = UI.air.rule, I = Math.round(UI.air.inset), R = (B.h - 2 * M) / 2;
  const wy = B.y + B.h / 2, wx = mirror ? B.x + M + R : B.x + B.w - M - R, lx = mirror ? B.x + B.w - M - LAMP_R - 1 : B.x + M + LAMP_R + 1;
  const F = mirror ? { x: wx + R + I, y: B.y + M, w: lx - LAMP_R - I - (wx + R + I), h: B.h - 2 * M }
    : { x: lx + LAMP_R + I, y: B.y + M, w: wx - R - I - (lx + LAMP_R + I), h: B.h - 2 * M };
  if (stillRadio(r, B, F)) grille(r, F, s, 'live');
  else {   // no page to stamp on (Node's checks): drawn whole
    path(ctx, chamfered(B, UI.vector.space), { fill: ROLES.backing, stroke: ROLES.structure });
    grille(r, F, s);
  }
  wheel(ctx, wx, wy, R, s, mirror);
  lamp(ctx, lx, wy, s);
  return B;
}

// The radio's body and its dark holes, which never move, drawn once onto a canvas and laid as one picture (the effects audit of
// 2026-10-06, path #7: about 120 fills a frame as one; a lab switch until SX compared it by eye and took it into the game,
// 2026-10-07); the lit and flickering holes, the wheel and the lamp over it as ever. Painted again for another size, pixel ratio,
// place within a pixel or look. Under the pointer's press (a panel a little smaller) the picture is scaled as a picture, not drawn
// smaller. False with no page to make a canvas on.
const radioStamp = { canvas: null, key: '' };
function stillRadio(r, B, F) {
  if (typeof document === 'undefined') return false;
  const dpr = r.dpr || 1, ox = Math.floor(B.x) - 2, oy = Math.floor(B.y) - 2, w = Math.ceil(B.w) + 4, h = Math.ceil(B.h) + 4;
  const key = `${w}x${h}@${dpr}|${B.x - ox},${B.y - oy}|${F.x - B.x},${F.w}x${F.h}|${gradeEpoch()}|${gradeKept()}`;
  if (radioStamp.key !== key) {
    const canvas = radioStamp.canvas ?? (radioStamp.canvas = document.createElement('canvas'));
    canvas.width = Math.ceil(w * dpr); canvas.height = Math.ceil(h * dpr);
    const sr = Object.create(r);
    sr.ctx = installGrade(canvas.getContext('2d'));
    sr.ctx.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
    path(sr.ctx, chamfered(B, UI.vector.space), { fill: ROLES.backing, stroke: ROLES.structure });
    grille(sr, F, null, 'still');
    radioStamp.key = key;
  }
  r.ctx.drawImage(radioStamp.canvas, ox, oy, radioStamp.canvas.width / dpr, radioStamp.canvas.height / dpr);
  return true;
}

// ------------------------------------------------------------------------------------------------ in the column

// The cockpit's top under the column: the highest point of the deck's rail (labs/graphics/hud-layout.js, its left side and its
// mirror on a screen `width` across) between `x0` and `x1`, or the screen's bottom (`height`) with no deck.
export function deckFloor(layout, x0, x1, width, height) {
  if (!layout?.deck || !layout.rail?.length) return height;
  const W = width, pts = layout.rail;
  let top = height;
  const consider = (ax, ay, bx, by) => {
    const lo = Math.max(Math.min(ax, bx), x0), hi = Math.min(Math.max(ax, bx), x1);
    if (lo > hi) return;
    const at = (x) => (bx === ax ? Math.min(ay, by) : ay + (by - ay) * (x - ax) / (bx - ax));
    top = Math.min(top, at(lo), at(hi));
  };
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    consider(ax, ay, bx, by);
    consider(W - ax, ay, W - bx, by);
  }
  return top;
}

// Where the radio's row stands and whether its picture fits, in the screen's px: its row at `rowTop`, or under `over` (the ink over it:
// the quests' last plate, or the scope's ring) by the column's air; the picture fits when its bottom stands a container's inset over
// the cockpit's top (`floor`). `x0` and `edge` the column's left ink edge and right edge (its button's), `left` where the picture
// stands (the plates' left edge). Returns { x0, edge, left, rowTop, fits, rowFits, mirror }. The set under the row by RADIO.under.
// `mirror`: the radio on the screen's right, the row and the picture mirrored (drawRadio).
export function radioPlace(r, { x0, edge, left, over = null, rowTop = null, floor, mirror = false }) {
  const ink = buttonInk(r);
  const top = rowTop ?? Math.round(over + COLUMN_GAPS.block - ink.top);
  const room = floor - UI.air.inset;
  const fits = top + ink.bottom + RADIO.under + RADIO.h <= room;
  return { x0, edge, left, rowTop: top, fits, rowFits: top + ink.bottom <= room, mirror };
}

// The radio's row and picture at `place` (radioPlace), at the page's time `now`: its row a column button, «T RADIO» (HIDE RADIO
// while shown), and the picture unfolding under it as the quest plates ease (QUEST_TIMES.close). `over` the row as under the pointer
// (null: the pointer says). Returns the block's box, or null when nothing is drawn.
export function drawRadio(r, radio, place, now, { reducedMotion = false, over = null } = {}) {
  radio.box = null; radio.row = null;
  if (!place?.rowFits) return null;
  const open = !radio.hidden && place.fits;
  if (radio.open === null) radio.open = open;
  else if (radio.open !== open) { radio.open = open; radio.changed = now; }
  const s = radioState(now, radio.moment, reducedMotion);
  const ink = buttonInk(r), key = keyName('radio'), since = now - radio.changed, size = radioSize(r);
  const k = reducedMotion ? 1 : clamp(since / TURN, 0, 1);
  // Mirrored (the radio on the screen's right), the row and the picture about the plates' box, as the quests' head is.
  const axis = place.mirror ? 2 * place.left + size.w : null;
  const row = drawColumnButton(r, { x0: place.x0, edge: place.edge, rowTop: place.rowTop, key, word: open ? 'HIDE RADIO' : 'RADIO',
    turn: open ? easeOut(k) : 1 - easeOut(k), name: 'radio:button', over,
    note: (box) => noteKey(key, box, r), axis });
  radio.row = row;
  // Folded, a moment lights the lamp a cell after the word: the call is still seen.
  if (!open && s.lamp.k > 0.02) {
    const m = uiMetrics(r), capX = Math.round(keyMarkLeft(r, place.x0 + m.capLeft) - 0.5) + KEYCAP_PAD;
    const wordX = capX + (Array.from(key).length + 1) * r.cellW, lampX = wordX + m.capLeft + ('RADIO'.length + 1) * r.cellW + LAMP_R;
    lamp(r.ctx, axis === null ? lampX : axis - lampX, place.rowTop + m.textY + (m.capTop + m.capBottom) / 2, s);
  }
  const B = { x: place.left, y: Math.round(place.rowTop + ink.bottom + RADIO.under), w: size.w, h: size.h };
  const u = reducedMotion ? 1 : easeOut(clamp(since / QUEST_TIMES.close, 0, 1));
  const unfold = open ? u : 1 - u;
  let bottom = row.y + row.h;
  if (unfold > 0.001) {
    const ctx = r.ctx;
    ctx.save(); ctx.beginPath(); ctx.rect(B.x - UI.pad, B.y - UI.pad, B.w + 2 * UI.pad, Math.ceil(B.h * unfold) + UI.pad); ctx.clip();
    drawRadioPicture(r, B, s, place.mirror);
    ctx.restore();
    bottom = B.y + B.h * unfold;
  }
  const x = Math.min(row.x, B.x);
  radio.box = { x, y: row.y, w: Math.max(row.x + row.w, unfold > 0.001 ? B.x + B.w : 0) - x, h: Math.ceil(bottom - row.y) };
  return radio.box;
}

// ------------------------------------------------------------------------------------------------ the modern interface's radio

// The modern interface's radio (labs/graphics/hud-modern.js; SX's R1 ROUND of 2026-10-16: «R1 раунд нормально»): the same set laid
// again in a body with round corners, its parts on the windows' air (S from the long lines, C between the parts): the dial S from the line,
// as tall as that leaves, its index inside it under the ticks (SX: «треугольничек белый, он должен быть внутри диска»), the holes' field C
// clear of the dial and the lamp, the lamp at the far end. Its row («T HIDE RADIO») under it, on the interface's bottom line; the picture
// folds down into its row as the legacy one folds up into its own. `place` { box, rowTop, x0, edge, mirror }: the picture's box and the
// row's. `wear` ({ level, seed }, cockpit-fx.js damageLevel): at the hull's last fifths it breaks where it stands (SX, 2026-10-16: «радио не
// падает ... На последних десяти-двадцати хп радио на месте остается, у него просто контур ломается ... лампочки пропадают, некоторые»): its
// holes go dark here and there, then its line breaks in places. Returns the block's box, or null.
export const RADIO_MODERN = Object.freeze({ h: 9 * UI.vector.space, round: UI.vector.space, s: 9, c: 18,
  // At each wear level (0-4): the share of holes gone dark, the breaks in its line.
  dark: Object.freeze([0, 0, 0.04, 0.1, 0.22]), breaks: Object.freeze([0, 0, 0, 1, 4]) });
function bodyModern(ctx, B) {
  const x0 = Math.round(B.x) + 0.5, y0 = Math.round(B.y) + 0.5, x1 = Math.round(B.x + B.w) - 0.5, y1 = Math.round(B.y + B.h) - 0.5, rr = RADIO_MODERN.round;
  ctx.save(); ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(x0 + rr, y0); ctx.arcTo(x1, y0, x1, y1, rr); ctx.arcTo(x1, y1, x0, y1, rr); ctx.arcTo(x0, y1, x0, y0, rr); ctx.arcTo(x0, y0, x1, y0, rr);
  ctx.closePath(); ctx.fillStyle = ROLES.backing; ctx.fill(); ctx.strokeStyle = ROLES.structure; ctx.stroke(); ctx.restore();
}
function wheelModern(ctx, wx, wy, R, s, mirror) {
  const k = R / (1.5 * UI.row), turn = (mirror ? 1 : -1) * s.tune * 1.5 * Math.PI, long = Math.max(3, 7 * k), short = Math.max(2, 3 * k);
  disc(ctx, wx, wy, R, { fill: ROLES.backing, stroke: ROLES.structure });
  ctx.save(); ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.strokeStyle = ROLES.structure; ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = turn + i * Math.PI / 12, r0 = R - 2, r1 = r0 - (i % 6 === 0 ? long : short);
    ctx.moveTo(wx + Math.cos(a) * r0, wy + Math.sin(a) * r0); ctx.lineTo(wx + Math.cos(a) * r1, wy + Math.sin(a) * r1);
  }
  ctx.stroke(); ctx.restore();
  const hub = Math.max(UI.pad / 2, UI.pad * k), iy = Math.round(wy - R + 2 + long + 2), markR = (hub + (wy - (iy + UI.pad + 1))) / 2, markA = turn - Math.PI / 2;
  disc(ctx, wx + Math.cos(markA) * markR, wy + Math.sin(markA) * markR, Math.max(1, 1.5 * k), { fill: ROLES.textPrimary });
  disc(ctx, wx, wy, hub, { fill: ROLES.backing, stroke: ROLES.structure });
  path(ctx, [[wx, iy], [wx - UI.pad, iy + UI.pad + 1], [wx + UI.pad, iy + UI.pad + 1]], { fill: ROLES.textPrimary });
}
export function drawRadioModern(r, radio, place, now, { reducedMotion = false, over = null, wear = null } = {}) {
  radio.box = null; radio.row = null;
  if (!place) return null;
  const open = !radio.hidden;
  if (radio.open === null) radio.open = open;
  else if (radio.open !== open) { radio.open = open; radio.changed = now; }
  const s = radioState(now, radio.moment, reducedMotion), key = keyName('radio'), since = now - radio.changed, B = place.box;
  const k = reducedMotion ? 1 : clamp(since / TURN, 0, 1), axis = place.mirror ? 2 * B.x + B.w : null;
  const row = drawColumnButton(r, { x0: place.x0, edge: place.edge, rowTop: place.rowTop, key, word: open ? 'HIDE RADIO' : 'RADIO',
    turn: open ? 1 - easeOut(k) : easeOut(k), name: 'radio:button', over, note: (box) => noteKey(key, box, r), axis });
  radio.row = row;
  const u = reducedMotion ? 1 : easeOut(clamp(since / QUEST_TIMES.close, 0, 1)), unfold = open ? u : 1 - u;
  let top = row.y;
  if (unfold > 0.001) {
    const ctx = r.ctx, M = RADIO_MODERN, R = Math.floor(B.h / 2 - M.s), wy = Math.round(B.y + B.h / 2);
    const wx = Math.round(place.mirror ? B.x + M.s + R : B.x + B.w - M.s - R), lx = Math.round(place.mirror ? B.x + B.w - M.s - LAMP_R - 1 : B.x + M.s + LAMP_R + 1);
    const f0 = place.mirror ? wx + R + M.c : lx + LAMP_R + M.c, f1 = place.mirror ? lx - LAMP_R - M.c : wx - R - M.c;
    ctx.save();
    // Folding, it goes down into its row: the part still shown is its lower one.
    ctx.beginPath(); ctx.rect(B.x - UI.pad - 400, B.y + B.h * (1 - unfold) - UI.pad, B.w + 2 * UI.pad + 800, Math.ceil(B.h * unfold) + 2 * UI.pad + 2000); ctx.clip();
    const level = wear?.level ?? 0, seed = wear?.seed ?? 1, dark = M.dark[level] ?? 0;
    bodyModern(ctx, B);
    grille(r, { x: f0, y: B.y + M.s, w: f1 - f0, h: B.h - 2 * M.s }, s, 'all', dark > 0 ? (i, j) => noise3(seed + i, j, 13) < dark : null);
    wheelModern(ctx, wx, wy, R, s, place.mirror);
    lamp(ctx, lx, wy, s);
    // Its line broken: black over it in places along its long sides, a piece of it knocked a little out of line.
    for (let i = 0; i < (M.breaks[level] ?? 0); i++) {
      const t = noise3(seed, i, 17), len = 6 + 10 * noise3(seed, i, 19), onTop = i % 2 === 0;
      const x = B.x + M.round + t * (B.w - 2 * M.round - len), y = (onTop ? B.y : B.y + B.h) + (onTop ? 0.5 : -0.5);
      ctx.fillStyle = ROLES.backing; ctx.fillRect(Math.round(x), Math.round(y) - 2, Math.round(len), 4);
      if (level >= 4 && i % 2 === 1) { ctx.strokeStyle = ROLES.structure; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(x) + 2, Math.round(y) + 2.5); ctx.lineTo(Math.round(x + len) - 1, Math.round(y) + 1.5); ctx.stroke(); }
    }
    ctx.restore();
    top = Math.min(top, B.y + B.h * (1 - unfold));
  }
  const x = Math.min(row.x, B.x);
  radio.box = { x, y: Math.floor(top), w: Math.max(row.x + row.w, B.x + B.w) - x, h: Math.ceil(row.y + row.h - top) };
  return radio.box;
}
