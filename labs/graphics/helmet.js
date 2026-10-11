// The top of the helmet (S8, SX's pick of 2026-10-04 on labs/graphics/sketches/helmet-top.html: «Да, вот этот билд нравится», V1+
// as it stands; the page draws it and is the reference): the lower panel's hollow bar (cockpit-frame.js hollowBar) run across the
// top of the screen with a notch down from the top edge, its walls 2:1 as the chamfer by the helm (ANGLES.md), its glints, sparks
// and breaks the deck's own (cockpit-fx.js: the same light and the same wear), shaking with the deck. In the notch one line of the
// task the pilot follows (the task slot, labs/graphics/notices.js): since SX's N3 FITTED (2026-10-05, below) one phrase on the notch's
// axis, the notch as wide as it; with no task the notch alone (SX: «не всегда должен быть какой-то контент ... скорее такая
// idle-штука»). The notices stand a group's step under the line (notice.js noticeTop).
//
// SX's words, round by round (docs/plans/picks.md): «челки шлема, она должна быть сильно меньше ... только текст со стрелочкой»;
// «челку на 1/3 уже ... тексты стояли равно друг над другом а поля можно небольшие (не центральная выключка)»; «по ширине немного
// посвободней, еще один отступ ... от верха экрана до текста ... [и] от низа текста до нижней панели ... должны быть одинаковые»;
// «давай делать там одну строку ... чтобы она примерно всю ширину строки занимала ... Челка плюс текст. Совсем небольшая ... чуть
// пошире ... в одну строку только самое важное. Стрелочку оставляем». The page's code is copied here as it is (its V1+ alone).
// Round five, on labs/graphics/sketches/helmet-notch.html (the page measured the notch on the 61 lines the game puts in it): «Берем
// Fitted, но я думаю там надо направление таймер и действие писать а что конкретно за квест выбран будет подсвечено слева в списке
// квестов ... остальное в широкой верссии норм». So the notch fits its line (helmetOf's `cols`, between today's width and HELMET.widest)
// and the line says the arrow, what to do and the clock (notchLine); which quest it is, the quest list marks (quest-list.js `focusId`).
// Since 2026-10-06 only a timed task stands in it, and since 2026-10-07 with its title (SX: «выводи пожалуйста сверху все таки какой-то
// текст о чем речь, а не только таймер со стрелкой»): the arrow, the title, the clock (labs/graphics/notices.js).
//
// In the notch's floor the scale of a jump or a drift (the page's: «Нижняя панель трюков хорошо работает»; its state is
// labs/graphics/stunt-fx.js scaleOf), the floor parting for it. (The praise plate a zone earned, hidden in the game since SX's word of
// 2026-10-05 and drawn by the lab's `?praise=on`, went 2026-10-07: labs/graphics/sketches/praise-plate.js keeps it for the sketch pages.)
import { UI, uiMetrics } from '../../src/uiGrid.js';
import { PALETTE, ROLES } from '../../src/roles.js';
import { clamp, dimToContrast, glyphs, noise3 } from '../../src/util.js';
import { TOP, CONSOLE } from './hud-layout.js';
import { hollowBar, BAR } from './cockpit-frame.js';
import { COCKPIT_FX, cockpitSpots, drawWear, cockpitLevel, cockpitLight, cockpitSeed } from './cockpit-fx.js';
import { RAIL, railColumns, railFit, moneyRuns, FLAP_GLYPHS } from './rail.js';
import { actionOf } from '../../src/questLines.js';

// ------------------------------------------------------------------------------------------------ the notch

// The line in the notch stands on the upper groups' top line (notice.js TASK_TOP, hud-layout.js TOP). A row of `cols` columns: the
// arrow's two, then the words; the floor exactly as wide as that row and the side margin `margin` (UI.air.inset, a container's edge to
// what it holds) at the nearest point of each wall (the walls lean out as they rise: the nearest point is the row's lower outer
// corner, measured square to the wall). The floor's upper line as far under the row's capitals as the screen's top edge stands over
// them, ink to ink. The walls run on past the screen's top edge (`top`), so a shake never shows their ends. In the middle of the
// screen, as the banners stood (RAIL.width centred).
//
// N3 FITTED (SX, 2026-10-05): `cols` the line's own (notchLine `need`), never fewer than today's (notchColumns: the arrow's two and as
// many characters as a notice's title row holds, rail.js railColumns; the empty notch, and the trick's scale in its floor, keep it)
// and never more than `widest`, the longest line the game made on the page's day under N3's rule (BATTLE AT FOUNDRY 2 · CLEAR THE
// PIRATES, 2 + 39 columns: 291 to 402 px of floor at 1280 x 960); a longer one is cut (notchLine).
export const HELMET = Object.freeze({ margin: UI.air.inset, widest: 41 });
export const notchColumns = (r) => 2 + railColumns(r, { family: 'event' });
export function helmetOf(r, cols = null) {
  const bw = RAIL.width, bx = Math.round(r.width / 2 - bw / 2), cx = bx + bw / 2, top = -4 * BAR.outer;
  const m = uiMetrics(r), cw = r.cellW, home = notchColumns(r);
  const textTop = TOP, below = textTop + m.textY + m.capBottom;
  const topGap = textTop + m.textY + m.capTop;
  const floorInk = Math.round(below + topGap), y = floorInk + BAR.outer / 2;
  // The notices a group's step under the floor's lower line (UI.vector.group, 40: the notch with its task and the notice are two
  // groups; SX: «остальные уведомления нужно двигать от нее на больший отступ»).
  const noticeTop = y + BAR.outer / 2 + UI.vector.group;
  // A point (px, py) is `(2 (px - left) - (py - y)) / √5` from the left wall's path (2:1 through the corner) and its ink BAR.outer / 2
  // nearer: the row's first and last ink, on its capitals' bottom, stand `lean` px in from the floor's corners to be `margin` off.
  const n = cols == null ? home : clamp(Math.round(cols), home, Math.max(home, HELMET.widest)), words = n - 2;
  const lean = (Math.sqrt(5) * (HELMET.margin + BAR.outer / 2) - (y - below)) / 2;
  const floorOf = (c) => Math.round(c * cw - 2 * m.capLeft + 2 * lean);
  const floor = floorOf(n), left = Math.round(cx - floor / 2), right = left + floor, run = (y - top) / 2;
  const textX = Math.round(left + lean - m.capLeft), wordsX = textX + Math.round(2 * cw);
  // Today's floor, where the trick's scale is laid whatever the line's width (scaleGeom): a task's words never change its timing.
  const homeLeft = Math.round(cx - floorOf(home) / 2), scale = { left: homeLeft, right: homeLeft + floorOf(home) };
  return { cx, top, textTop, below, y, noticeTop, left, right, textX, wordsX, words, cols: n, scale, tl: [left - run, top], tr: [right + run, top],
    depth: y + BAR.outer / 2, opening: floor + y, gap: noticeTop - (y + BAR.outer / 2), topGap, bottomGap: floorInk - below };
}

// The helmet's wear: the deck's own (cockpit-fx.js), on fewer places, as the line is about a third of the deck's bars long: of the
// twenty places laid on it, every third is kept, the others stand off the canvas, so a step of wear breaks it as it breaks the deck.
const HELMET_WEAR = Object.freeze({ every: 3 });
const OFF = (k) => ({ id: 9e5 + k, length: -1, s: 0, x: -1e4, y: -1e4, ux: 1, uy: 0, size: 8, order: 1 });
const spotCache = new Map();
function helmetSpots(whole, seed, hide = null) {
  const key = `${seed}|${whole.flat().join(',')}`;
  let base = spotCache.get(key);
  if (!base) {
    if (spotCache.size > 8) spotCache.clear();
    spotCache.set(key, (base = cockpitSpots([whole], seed).map((s, k) => (k % HELMET_WEAR.every === 0 ? s : OFF(k)))));
  }
  if (!hide) return base;
  // Where the scale stands in the floor, no place breaks (it would cut the steps).
  return base.map((s, k) => (s.length >= 0 && Math.abs(s.uy) < 0.1 && s.x > hide[0] - 2 * s.size && s.x < hide[1] + 2 * s.size ? OFF(k) : s));
}

// ------------------------------------------------------------------------------------------------ the scale

// The scale: hud.js drawMeterBar's pitch (one cell every 9 px), 6 px cells as tall as the line they sit in (BAR.outer), flush with its
// two lines; as many as today's floor holds (`h.scale`: a wider notch for a long line keeps the scale it had), the floor keeping a piece
// either side (CONSOLE.gap and 4 px, as the console's bar stops short of the helm's plate).
export const STEP = Object.freeze({ w: 6, pitch: 9 });
const FLOOR_KEEP = CONSOLE.gap + 4;
export function scaleGeom(h) {
  const { left, right } = h.scale ?? h;
  const room = right - left - 2 * FLOOR_KEEP;
  const n = Math.floor((room + STEP.pitch - STEP.w) / STEP.pitch);
  const span = n * STEP.pitch - (STEP.pitch - STEP.w);
  const x0 = Math.round(h.cx - span / 2), cellH = BAR.outer;
  return { n, span, x0, x1: x0 + span, top: h.y - cellH / 2, cellH };
}

// SX: «она должна быть тоньше, у квадратиков не должно быть еще отдельных контуров и цвета спокойнее, давай есть только фон, зеленые
// зоны, и после второй зеленой красная зона сразу»: the cells filled, no outline; three things only: the ground (the line's own blue),
// the green zones, the red right after the second green. Calm: each ink dimmed to a contrast on black (src/util.js dimToContrast),
// what is still ahead at `ahead`, what has passed at `passed`; a zone hit lights to its full ink and stays.
// J2's scale (src/trick.js lateZones) adds the yellow of a late let-go between its one green and the red, in the
// palette's amber at the green's calm.
export const CALM = Object.freeze({ ahead: Object.freeze({ ground: 2.4, green: 4.2, yellow: 4.2, red: 3.8 }), passed: 1.45 });
const CALM_INK = Object.freeze({ ground: PALETTE.blue, green: PALETTE.green, yellow: PALETTE.amber, red: PALETTE.red });
const calmCache = new Map();
export function calmInk(tone, state) {
  const key = `${tone}|${state}`;
  if (!calmCache.has(key)) {
    const ink = CALM_INK[tone];
    calmCache.set(key, state === 'hit' ? ink : dimToContrast(ink, state === 'passed' ? CALM.passed : CALM.ahead[tone]));
  }
  return calmCache.get(key);
}
const calmTone = (tone) => (tone === 'green' || tone === 'red' || tone === 'yellow' ? tone : 'ground');

// A scale's zones (src/trick.js lateZones, stunt-fx.js driftZones) as the page's plan: which act a point of the axis is, and its tone.
export function planOf(zones) {
  const { trick, letgo, late } = zones;
  if (late) {
    // J2's: the gray rise, the one green for the figure, the yellow, the red at the end.
    const act = (s) => (trick && s >= trick[0] && s < trick[1] ? 'trick' : null);
    return { trick, letgo: null, act, tone: (s) => (act(s) ? 'green' : s >= zones.red ? 'red' : s >= late[0] ? 'yellow' : 'ground') };
  }
  const act = (s) => (s >= letgo[0] && s < letgo[1] ? 'letgo' : trick && s >= trick[0] && s < trick[1] ? 'trick' : null);
  return { trick, letgo, act, tone: (s) => (act(s) ? 'green' : s >= letgo[1] ? 'red' : 'ground') };
}
// Each cell's tone: the zone at its middle; a green narrower than a cell still shows (every cell it covers by `cover` turns green, and
// the one it covers most at least).
const GREEN_COVER = 0.35;
function stepTones(plan, A, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * A, b = ((i + 1) / n) * A, m = (a + b) / 2;
    out.push({ a, b, tone: plan.tone(m), act: plan.act(m) });
  }
  for (const [act, z] of [['trick', plan.trick], ['letgo', plan.letgo]]) {
    if (!z) continue;
    let best = -1, most = 0;
    out.forEach((s, i) => {
      const cover = Math.max(0, Math.min(s.b, z[1]) - Math.max(s.a, z[0])) / (s.b - s.a);
      if (cover >= GREEN_COVER) { s.tone = 'green'; s.act = act; }
      if (cover > most) { most = cover; best = i; }
    });
    if (best >= 0) { out[best].tone = 'green'; out[best].act = act; }
  }
  return out;
}

// The cells for `sc` (stunt-fx.js scaleOf), the half width come in so far from the middle out, each split where the cursor stands:
// passed on its left, still ahead on its right. The cursor (SX: «белый курсор бежит, показывает как бы твой трекинг, и ты должен
// нажимать кнопки в тайминг»): a 1 px white line `reach` px over and under the line, gliding with the now, not stepping cell by cell;
// it stops where Q was let go.
export const CURSOR = Object.freeze({ reach: BAR.outer / 2 + 2 });
function drawScale(ctx, h, sg, sc) {
  const shown = sc.p * (sg.span / 2) + 0.5;
  const tones = stepTones(planOf(sc.zones), sc.A, sg.n), u = (sc.now / sc.A) * sg.n;
  const cursorX = clamp(sg.x0 + u * STEP.pitch, sg.x0, sg.x1 - 1);
  ctx.save(); ctx.lineWidth = 1; ctx.globalAlpha = 1;
  tones.forEach((st, i) => {
    const x = sg.x0 + i * STEP.pitch;
    if (Math.abs(x + STEP.w / 2 - h.cx) > shown) return;
    const hit = !!(st.act && sc.kept.has(st.act));
    const tone = calmTone(st.tone), ahead = hit ? 0 : clamp(x + STEP.w - cursorX, 0, STEP.w);
    ctx.fillStyle = calmInk(tone, hit ? 'hit' : 'passed'); ctx.fillRect(x, sg.top, STEP.w, sg.cellH);
    if (ahead > 0) { ctx.fillStyle = calmInk(tone, 'ahead'); ctx.fillRect(x + STEP.w - ahead, sg.top, ahead, sg.cellH); }
  });
  if (sc.p > 0.5) { ctx.fillStyle = ROLES.highlight; ctx.fillRect(Math.round(cursorX), h.y - CURSOR.reach, 1, 2 * CURSOR.reach); }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the helmet drawn

// The helmet's line with its wear (the deck's, while COCKPIT_FX.wear is on), in the cockpit's structure ink, its notch black inside,
// and the scale `sc` in it
// (stunt-fx.js scaleOf, or null): the floor parts for the cells (the bar stops CONSOLE.gap short of them, as the console's stops short
// of the helm's plate). Drawn by the page inside the deck's shake, a group of its own (main.js `group`).
export function drawHelmet(r, h = helmetOf(r), sc = null) {
  const ctx = r.ctx, sg = scaleGeom(h);
  const whole = [h.tl, [h.left, h.y], [h.right, h.y], h.tr];
  // The notch's inside black behind its line work, from its walls and floor up past the screen's top (SX, 2026-10-06: «у челки кстати
  // должна быть черная фоновая заливка»): the line in it reads on black, as every panel's words do.
  ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = ROLES.backing; ctx.beginPath();
  whole.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  ctx.closePath(); ctx.fill(); ctx.restore();
  const parted = sc && sc.p > 0;
  let bars = [whole], hide = null;
  if (parted) {
    const cut = sc.p * (sg.span / 2) + CONSOLE.gap;
    const a = Math.max(h.left + 1, h.cx - cut), b = Math.min(h.right - 1, h.cx + cut);
    bars = [[h.tl, [h.left, h.y], [a, h.y]], [[b, h.y], [h.right, h.y], h.tr]];
    hide = [h.cx - cut, h.cx + cut];
  }
  for (const bar of bars) hollowBar(ctx, bar, ROLES.structure, { open: true });
  if (COCKPIT_FX.wear) {
    drawWear(ctx, bars, helmetSpots(whole, cockpitSeed() + 1, hide), cockpitLevel(), { t: COCKPIT_FX.now, light: cockpitLight(COCKPIT_FX.now),
      motion: !COCKPIT_FX.reducedMotion, seed: cockpitSeed() + 1 });
  }
  if (parted) drawScale(ctx, h, sg, sc);
  return { x: h.tl[0], y: 0, w: h.tr[0] - h.tl[0], h: h.depth };
}

// ------------------------------------------------------------------------------------------------ the task's line

// The row from a task slot's banner (labs/graphics/notices.js: { mark, ink, markInk?, title, sub?, clock?, clockInk? }), SX's N3 FITTED
// with his words of 2026-10-05: the arrow in the task's ink, then one phrase: what to do, in white, and its one key fact after a spaced
// middle dot (money in the coin's rim gold, S4). What to do is the detail's action where the quest's words mark one (src/questLines.js actionOf: GET YOUR SHUTTLE /
// BRAKE TO A STOP says BRAKE TO A STOP, BATTLE AT FOUNDRY 2 / CLEAR THE PIRATES says CLEAR THE PIRATES), the quest's name then left
// to the quest list; else the title (DELIVER COOLANT CELLS, FIND CD). The fact: the timer in its own ink when the task has one, else,
// beside a title, the place (the detail's first part) gray; beside an action, nothing more. `need` the columns it takes with the
// arrow's, a timer counted at `clockRoom` characters at least (notices.js keeps the widest a task's timer has shown, so the notch does
// not twitch as 10:00 becomes 9:59); past `cols` the first words are cut with an ellipsis (rail.js railFit), the fact never.
// No banner: null, the notch alone.
const DOT = ' · ';
// A timed task comes with its title and no `sub` (notices.js, SX's words of 2026-10-06 and 2026-10-07): the arrow, its title, the
// clock (← DEFEND GERTY · 2:32); the title is a plate's (src/questLines.js), which fits the widest notch uncut with any clock
// (checks/helmet-notch.mjs). A banner with no words at all is its sign and its clock.
export function notchLine(b, { cols = Infinity, clockRoom = 0 } = {}) {
  if (!b) return null;
  const act = actionOf(b.sub);
  const fact = b.clock ?? (!act && b.sub ? b.sub.split(' / ')[0] : null), factInk = b.clock ? (b.clockInk ?? b.ink) : ROLES.textSecondary;
  const head = act ?? b.title ?? '', dot = head ? DOT : '';
  const tail = fact ? glyphs(dot).length + Math.max(glyphs(fact).length, b.clock ? clockRoom : 0) : 0;
  const runs = head ? moneyRuns(railFit(head, Math.max(1, cols - 2 - tail)), ROLES.textPrimary).map(([text, ink]) => ({ text, ink })) : [];
  if (fact) runs.push(...(dot ? [{ text: dot, ink: ROLES.textSecondary }] : []), { text: fact, ink: factInk });
  return { mark: b.mark, markInk: b.markInk ?? b.ink, runs, need: 2 + glyphs(head).length + tail };
}
// The row drawn in the notch `h` (helmetOf at the line's columns), the arrow and the phrase as one run of columns centred on the notch's
// axis (the sketch page's N3: equal margins to the walls); its box (taskLineBox), or null. `turn` ({ age, seed }) while the line turns
// over (a notice taking the notch, or the task coming back after it: labs/graphics/notices.js): drawNotchRow's.
export function drawNotchLine(r, b, h = helmetOf(r), { clockRoom = 0, turn = null } = {}) {
  const line = notchLine(b, { cols: h.cols ?? h.words + 2, clockRoom });
  return line ? drawNotchRow(r, line, h, { turn }) : null;
}
// A row `line` ({ mark, markInk, runs }) in the notch. At rest, each run one string. Turning over (`turn`: { age, seed, gone }), it is a
// split-flap board's row (SX, 2026-10-05: the notch flips to an event and back): every cell shows other letters (rail.js FLAP_GLYPHS,
// in the quiet gray, a new one each FLIP.step s) until it settles on its own, the first `FLIP.lead` s in and the last at FLIP.turn,
// left to right; `gone`: they settle on nothing (the notch empties).
export const FLIP = Object.freeze({ turn: 0.36, lead: 0.04, step: 0.045 });
export function drawNotchRow(r, line, h, { turn = null } = {}) {
  const cw = r.cellW, cols = h.cols ?? h.words + 2;
  const y = h.textTop + uiMetrics(r).textY, width = 2 + line.runs.reduce((n, run) => n + glyphs(run.text).length, 0);
  const x0 = h.textX + Math.round(((cols - width) * cw) / 2), wordsX = x0 + Math.round(2 * cw);
  if (!turn || turn.age >= FLIP.turn) {
    if (turn?.gone) return taskLineBox(r, h);
    if (line.mark) r.text(line.mark, x0, y, line.markInk);
    let col = 0;
    for (const run of line.runs) { r.text(run.text, wordsX + col * cw, y, run.ink); col += glyphs(run.text).length; }
    return taskLineBox(r, h);
  }
  const cells = line.mark ? [{ ch: line.mark, x: x0, ink: line.markInk }] : [];
  let col = 0;
  for (const run of line.runs) for (const ch of glyphs(run.text)) { cells.push({ ch, x: wordsX + col * cw, ink: run.ink }); col += 1; }
  const last = Math.max(1, cells.length - 1), tick = Math.floor(turn.age / FLIP.step);
  cells.forEach((c, i) => {
    const settled = turn.age >= FLIP.lead + ((FLIP.turn - FLIP.lead) * i) / last;
    if (settled) { if (!turn.gone && c.ch !== ' ') r.text(c.ch, c.x, y, c.ink); return; }
    r.text(FLAP_GLYPHS[Math.floor(noise3(i + 3, (turn.seed ?? 0) % 997, tick) * FLAP_GLYPHS.length)], c.x, y, ROLES.textSecondary);
  });
  return taskLineBox(r, h);
}
// Where the row answers the pointer: the notch's inside over its floor, wall to wall at the row (a click selects the task).
export function taskLineBox(r, h = helmetOf(r)) {
  return { x: h.left, y: 0, w: h.right - h.left, h: Math.round(h.y - BAR.outer / 2) };
}

// S8 V1+'s row until 2026-10-05 (the title flush left, its one key fact flush right, in today's notch): no longer drawn by the game;
// kept as labs/graphics/sketches/helmet-notch.html draws it, its N0 TODAY, the reference the N3 pick was made against.
export function taskLine(b, words) {
  if (!b) return null;
  const fact = b.clock ?? (b.sub ? b.sub.split(' / ')[0] : null), factInk = b.clock ? (b.clockInk ?? b.ink) : ROLES.textSecondary;
  const room = fact ? words - glyphs(fact).length - 2 : words;
  return { mark: b.mark, markInk: b.markInk ?? b.ink, title: railFit(b.title, room), fact, factInk };
}
export function drawTaskLine(r, b, h = helmetOf(r)) {
  const line = taskLine(b, h.words), cw = r.cellW;
  if (!line) return null;
  const y = h.textTop + uiMetrics(r).textY;
  if (line.mark) r.text(line.mark, h.textX, y, line.markInk);
  r.text(line.title, h.wordsX, y, ROLES.textPrimary);
  if (line.fact) r.text(line.fact, h.wordsX + (h.words - glyphs(line.fact).length) * cw, y, line.factInk);
  return taskLineBox(r, h);
}
