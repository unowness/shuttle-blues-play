import { CONFIG } from './config.js';
import { clamp, fitText } from './util.js';
import { UI, uiMetrics, uiPanel, centredWindow, frameInk } from './uiGrid.js';
import { deliveryNavigation } from './navigation.js';
import { courseOf } from './course.js';
import { DISTANCE_MARK } from './distanceMark.js';
import { clockText } from './contracts.js';
import { questPointerLabel, questTone } from './quests.js';
import { keepBegin, keepEnd } from './grade.js';
import { QUEST_INKS } from './roles.js';
import { helpColumns, helpIntro, keyName, SCHEMES, SCHEME_NAMES, DEFAULT_SCHEME } from './controls.js';
import { rimOf, viewArea, rimPoint, insideRim } from './rim.js';
import { tr } from './lang.js';

// Presentation only. Cell-positioned line art uses the renderer's measured
// metrics; UI leading never changes the world/Blockmode cell ratio.
const ink = () => CONFIG.hud.hot;
const muted = () => CONFIG.hud.color;
const accent = () => CONFIG.hud.accent;
export { fitText };

// One format for every distance the interface prints (design review, 2026-09-30:
// `9,447 u` in the header, `1600 u` on the locator): whole units, thousands
// grouped, the mark after. The mark was the unit `u` until SX asked for an icon in its place (2026-10-01:
// «букву «Ю» надо убрать ... Туда нужна какая-то иконка»; «нарисуй просто флажок»): a flag, src/distanceMark.js.
export function formatDistance(units) {
  return `${Math.round(units).toLocaleString('en-US')} ${DISTANCE_MARK}`;
}

function text(r, value, x, y, color = muted()) {
  r.text(tr(String(value)), x, y, color, 1);
}

export function lineArt(r, rows, x, y, color = muted()) {
  rows.forEach((row, j) => Array.from(row).forEach((ch, i) => {
    r.glyphNow(ch, x + (i + 0.5) * r.cellW, y + (j + 0.5) * r.cellH, color);
  }));
}

// Flat plate, framed with actual box-drawing glyphs rather than CSS borders.
export function asciiPanel(r, x, y, cols, rows, title = '') {
  const w = cols * r.cellW, h = rows * r.cellH;
  r.fill(x, y, w, h, CONFIG.view.panel);
  lineArt(r, ['┌' + '─'.repeat(cols - 2) + '┐'], x, y, CONFIG.hud.frame);
  for (let j = 1; j < rows - 1; j++) {
    lineArt(r, ['│'], x, y + j * r.cellH, CONFIG.hud.frame);
    lineArt(r, ['│'], x + (cols - 1) * r.cellW, y + j * r.cellH, CONFIG.hud.frame);
  }
  lineArt(r, ['└' + '─'.repeat(cols - 2) + '┘'], x, y + (rows - 1) * r.cellH, CONFIG.hud.frame);
  if (title) {
    const label = ` ${fitText(title, cols - 8)} `;
    r.fill(x + 2 * r.cellW, y, label.length * r.cellW, r.cellH, CONFIG.view.panel);
    text(r, label, x + 2 * r.cellW, y, muted());
  }
}

export function overlaps(a, b, gap = 6) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

// Labels share one placement rule and yield to actionable panels. Edge slots
// are a fallback for crowded approaches, ranked by distance from the object.
export function drawLocalLabel(r, value, anchor, avoid = [], color = accent(), clearance = r.cellH, plate = null) {
  // On the interface's row (spacing system, 2026-09-30): the box is one row
  // tall with its capitals centred, `line` of the vector grid from the view's
  // edge, and edge slots a row and `space` apart. A `plate` ({ size(r, text),
  // draw(r, text, x, y, ink) }) draws the label on a plate of its own instead
  // of the black box, as large as it says.
  // No box under the plain label since 2026-10-02: its letters cast their shadow (src/textShadow.js, since 2026-10-06; SX: «на
  // тексте ... в тех местах, где не надо прям заливку делать»). The box it takes is still its place, for what it avoids.
  const v = r.view, cw = r.cellW, m = UI.vector.line;
  const label = fitText(value, Math.floor((v.w - 2 * m) / cw) - 2);
  const { w, h } = plate ? plate.size(r, label) : { w: (label.length + 2) * cw, h: UI.row };
  const candidates = [
    { x: anchor.x - w / 2, y: anchor.y + clearance },
    { x: anchor.x - w / 2, y: anchor.y - h - clearance },
    { x: anchor.x + clearance, y: anchor.y - h / 2 },
    { x: anchor.x - w - clearance, y: anchor.y - h / 2 },
  ];
  const edges = [];
  for (let y = v.y + m; y + h <= v.y + v.h - m; y += h + UI.vector.space) {
    edges.push({ x: v.x + m, y }, { x: v.x + v.w - w - m, y });
  }
  const bottom = v.y + v.h - h - m;
  edges.push({ x: v.x + m, y: bottom }, { x: v.x + v.w - w - m, y: bottom });
  edges.sort((a, b) => Math.hypot(a.x + w / 2 - anchor.x, a.y - anchor.y)
    - Math.hypot(b.x + w / 2 - anchor.x, b.y - anchor.y));
  for (const p of [...candidates, ...edges]) {
    const box = { x: clamp(p.x, v.x + m, v.x + v.w - w - m),
      y: clamp(p.y, v.y + m, v.y + v.h - h - m), w, h };
    if (avoid.some(other => overlaps(box, other))) continue;
    if (plate) { plate.draw(r, label, Math.round(box.x), Math.round(box.y), color); return box; }
    text(r, label, box.x + cw, box.y + uiMetrics(r).textY, color);
    return box;
  }
  return null;
}

// Corner marks remain legible over both dark space and bright planets without sampling the background or changing the
// object's artwork: each stood on the shadow of the group it was drawn in, not on a box (2026-10-02); since 2026-10-06 only the
// interface's text casts one (src/textShadow.js), so a mark of lines stands on nothing.
export function drawTargetBrackets(r, box, color = accent(), spread = 0, avoid = []) {
  const corners = [
    ['┌', box.x - spread, box.y - spread],
    ['┐', box.x + box.w + spread, box.y - spread],
    ['└', box.x - spread, box.y + box.h + spread],
    ['┘', box.x + box.w + spread, box.y + box.h + spread],
  ];
  for (const [glyph, x, y] of corners) {
    const foot = { x: x - r.cellW / 2 - 2, y: y - r.cellH / 2 - 2, w: r.cellW + 4, h: r.cellH + 4 };
    if (foot.x < r.view.x || foot.y < r.view.y || foot.x + foot.w > r.view.x + r.view.w
      || foot.y + foot.h > r.view.y + r.view.h || avoid.some(b => overlaps(foot, b, 0))) continue;
    r.glyphNow(glyph, x, y, color);
  }
}

// The box round the chosen object, its drawing grown by FOCUS_GAP on every side: a rule's air. Its menu stands clear of it by `inset`
// (labs/graphics/context.js). Four corner marks stood at its corners, and at the cargo's on its tether, until SX, 2026-10-19 («нам надо
// вырезать вот эти метки. И у грузов, и у станции, и у NPC. Они только мешают»): drawObjectFocus went with them.
export const FOCUS_GAP = UI.air.rule;

// The box in screen px: the object's drawing grown by FOCUS_GAP.
export function focusBox(r, world, target) {
  const anchor = world.projectTarget ? world.projectTarget(r, target) : world.project(r, target.x, target.y);
  // Art drawn off its anchor (a sign stands above its diamond) says by how
  // many cells, so the box frames the drawing rather than the anchor. (Its cells as the camera draws them: `zoom`, src/zoom.js.)
  const z = r.zoom ?? 1;
  const p = { x: anchor.x + (target.art?.dx || 0) * r.cellW * z, y: anchor.y + (target.art?.dy || 0) * r.cellH * z };
  let w = (target.art?.model?.width || 4) * r.cellW * (target.art?.scale || 1) * z;
  let h = (target.art?.model?.height || 4) * r.cellH * (target.art?.scale || 1) * z;
  // Art that turns in place needs the square that holds it at any angle.
  if (target.art?.turns) w = h = Math.hypot(w, h);
  return { x: p.x - w / 2 - FOCUS_GAP, y: p.y - h / 2 - FOCUS_GAP, w: w + 2 * FOCUS_GAP, h: h + 2 * FOCUS_GAP };
}

const BEARINGS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
function bearing(dx, dy) {
  return BEARINGS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
}

export const GAMEPAD_ICON = ['▟▛██▛█▙', '▜▖▟██▙▛', '▝▀   ▀▘'];

export const SOUVENIR_ART = {
  gamepad: ['         ', ...GAMEPAD_ICON.map(row => ` ${row} `), '         '],
  basketball: ['  ╭─┬─╮  ', ' ╱  │  ╲ ', ' ├──┼──┤ ', ' ╲  │  ╱ ', '  ╰─┴─╯  '],
  figurine: ['   ╭─╮   ', '   ╰┬╯   ', '  ╭─┼─╮  ', '    │    ', '   ╱ ╲   '],
  // A disc with its label hub: the ball's outline, a ring inside it.
  disc: ['  ╭───╮  ', ' ╱ ╭─╮ ╲ ', ' │ │·│ │ ', ' ╲ ╰─╯ ╱ ', '  ╰───╯  '],
};

export const COMPACT_SOUVENIR_ART = {
  gamepad: ['       ', ...GAMEPAD_ICON, '       '],
  basketball: [' ╭─┬─╮ ', '╱  │  ╲', '├──┼──┤', '╲  │  ╱', ' ╰─┴─╯ '],
  figurine: ['  ╭─╮  ', '  ╰┬╯  ', ' ╭─┼─╮ ', '   │   ', '  ╱ ╲  '],
  disc: [' ╭───╮ ', '╱ ╭─╮ ╲', '│ │·│ │', '╲ ╰─╯ ╱', ' ╰───╯ '],
};
// Names of seven letters at most, for the cockpit slots and the pilot card's
// denser collection (src/pilotPanel.js).
export const COMPACT_NAMES = {
  gamepad: 'GAMEPAD', basketball: 'BALL', figurine: 'FIGURE', disc: 'CD',
  mixtape: 'MIXTAPE', videotape: 'VHS', 'instant-photo': 'PHOTO', manga: 'MANGA',
  handheld: 'CONSOLE', floppy: 'FLOPPY', 'virtual-pet': 'PET', 'crt-monitor': 'MONITOR',
};

// A persistent cargo bearing, independent of nearby discovery markers. Clamp
// the ray to the safe flight rectangle, so neither instrument cases nor the
// edge of a short window can hide it. The bearing is a destination direction,
// not a hazard-avoiding path or an autopilot.
// One ink for the whole of a route, the header's title, its timer and the pointer with its
// label alike (design review, 2026-09-30). Since 2026-10-01 the ink is the clock's state (SX:
// «указатель карго вместе с таймером меняет стейты Зеленый/Желтый/Красный когда уже идет
// Late»): green while the fast bonus is whole (CONFIG.delivery.fastShare of par or less on
// the clock), yellow while it melts away towards par, red once late. A route without a
// clock stays green.
export function routeState(route) {
  const c = route?.clock;
  if (!c) return 'onTime';
  if (c.left < 0) return 'late';
  return c.left < c.par * (1 - CONFIG.delivery.fastShare) ? 'closing' : 'onTime';
}
export function routeInk(route) {
  const H = CONFIG.hud;
  return { late: H.danger ?? accent(), closing: H.warning ?? accent(), onTime: accent() }[routeState(route)];
}

// A quest's ink (src/quests.js; P3 of labs/graphics/sketches/quests.html, SX's pick): the quest's own colour, as the
// quest list draws it (labs/graphics/quest-list.js QUEST_TONES), red, yellow, green or blue by its tone, the story's
// purple (src/roles.js QUEST_INKS, SX's Q1 P1), its clock in the pointer's words (SX, 2026-10-02: «давай указатель будет цвета
// квеста»; a raid's went green, yellow under 40 % of its time, red under 15 %, as a cargo's does).
export function questInk(quest) {
  const H = CONFIG.hud;
  return { red: H.danger, yellow: H.warning, blue: H.edge, green: accent(), story: QUEST_INKS.story, special: QUEST_INKS.special }[questTone(quest)] ?? accent();
}

// How far the route's arrow travels along its bearing, in cells, and in how many seconds there and back.
export const GUIDE_PULSE = Object.freeze({ reach: 0.45, period: 0.9 });

// `plate`: the plate the pointer is (the lab's GUIDE_PLATE, labs/graphics/notice.js), or an arrow with a plain label beside it.
// `route`: another bearing drawn the same way (src/navigation.js exitNavigation), in place of the delivery's.
// Since 2026-10-07 a pointer rides the rim (src/rim.js) with every other mark: the page asks `guideOf` what it is, lays it with the
// others (labs/graphics/rim-marks.js) and draws it with `drawGuideAt`. drawDeliveryGuide does the three at once on the view's own
// ellipse, with no memory (what a check reads of one pointer).
export function drawDeliveryGuide(r, world, options = {}) {
  const g = guideOf(r, world, options);
  if (!g) return undefined;
  const e = rimOf(viewArea(r.view));
  const at = insideRim(e, g.at, g.w, g.h) ? { ...g.at, inside: true } : { ...rimPoint(e, Math.atan2(g.at.y - e.cy, g.at.x - e.cx), g.w, g.h), inside: false };
  return drawGuideAt(r, g, at, options.avoid ?? []);
}

// What a route's pointer is: { key, route, label, tint, plate, w, h (the box it takes), at (where its thing is on the screen, along
// the course as far as the route runs), way (the course: src/course.js), pulse (cells the arrow travels now) }, or null for none.
// It stands with its thing's menu open too (it hid there until SX, 2026-10-07: «пока не сдать ... не скрывать их»): by its thing on
// the screen, as ◇ once arrived.
export function guideOf(r, world, { reducedMotion = false, plate = null, route: given = null } = {}) {
  const route = given ?? deliveryNavigation(world);
  if (!route) return null;
  const cw = r.cellW, ch = r.cellH;
  const ship = world.project(r, world.ship.x, world.ship.y);
  const recovery = route.kind === 'recovery', exit = route.kind === 'exit', home = route.kind === 'home';
  const quest = route.kind === 'quest';
  // The way out of O-08 in the hole's own violet (SX, 2026-10-02: «пусть табличка черная дыра будет фиолетовая»); the
  // way home (src/navigation.js homeNavigation, the page's G) in the interface's white, which no route is; a quest's in
  // its own (questInk).
  const tint = exit ? CONFIG.blackHole.color : home ? CONFIG.hud.hot : quest ? questInk(route.quest) : routeInk(route);
  const narrow = r.strip.h < ch * 3;
  let label = narrow ? `${recovery ? 'LOST ' : ''}${route.label} / ${route.sectorLabel}`
    : exit || home ? route.label : quest ? questPointerLabel(route.quest, world.ledger.clock)
    : route.arrived ? (recovery ? 'TAKE' : 'DELIVER') : (recovery ? 'LOST CARGO' : 'CARGO');
  // The cargo's clock rides in its pointer, off the header (P3 KIND + CLOCK, SX's pick of 2026-10-02): CARGO  1:42.
  if (!narrow && route.clock) {
    const left = route.clock.left;
    label = `${label}  ${left < 0 ? `LATE ${clockText(Math.ceil(-left))}` : clockText(Math.ceil(left))}`;
  }
  // A plate's box, or the arrow's (the label is laid round it).
  const size = plate ? plate.size(r, label) : { w: 2 * cw, h: ch * 1.5 };
  // The arrow leads along the route's course (src/course.js): round a rock, a pirate or a body in the way, else straight at it.
  const way = courseOf(route);
  const angle = Math.atan2(way.dy, way.dx);
  const far = route.distance * (r.zoom ?? 1);       // (in px on the screen: the camera's height, src/zoom.js)
  const at = { x: ship.x + Math.cos(angle) * far, y: ship.y + Math.sin(angle) * far };
  // The arrow travels a little along its bearing and back, so it is seen (SX, 2026-10-01:
  // «стрелку там анимированной, а то его сложно заметить»); still under reduced motion.
  const pulse = reducedMotion || route.arrived ? 0 : GUIDE_PULSE.reach * (0.5 - 0.5 * Math.cos(world.time * Math.PI * 2 / GUIDE_PULSE.period));
  return { key: `guide:${route.kind ?? 'cargo'}:${route.targetId ?? route.label}`, route, label, tint, plate, w: size.w, h: size.h,
    at, way, angle, pulse, arrived: !!route.arrived };
}

// The pointer `g` (guideOf) drawn at `at` ({ x, y, inside: its thing on the screen and the pointer by it }), in the kept layer
// (src/grade.js): a look filters the pointers as art and never repaints them (a quest's pointer is its tone's blue or green, which the
// cockpit's own colours share, so only where it is drawn can tell them apart). `avoid`: what the plain label keeps off. Returns its box.
export function drawGuideAt(r, g, at, avoid = []) {
  const was = keepBegin();
  try { return paintGuide(r, g, at, avoid); } finally { keepEnd(was); }
}
function paintGuide(r, g, { x, y, inside = false }, avoid) {
  const cw = r.cellW, ch = r.cellH, ux = Math.cos(g.angle), uy = Math.sin(g.angle);
  const mark = g.arrived && inside ? '◇' : bearing(g.way.dx, g.way.dy);
  if (g.plate) {
    // The plate is the pointer: its strip holds the arrow, moving there and back about its middle, centred where it stands.
    const travel = g.arrived ? 0 : (g.pulse - GUIDE_PULSE.reach / 2) * cw;
    const style = { mark, shift: { x: ux * travel, y: uy * travel } };
    const box = { x: Math.round(x - g.w / 2), y: Math.round(y - g.h / 2), w: g.w, h: g.h };
    g.plate.draw(r, g.label, box.x, box.y, g.tint, style);
    return box;
  }
  const marker = { x: x - cw, y: y - ch / 2, w: 2 * cw, h: ch * 1.5 };
  const hidden = avoid.some(b => overlaps(marker, b));
  const labelBox = drawLocalLabel(r, hidden ? `${bearing(g.way.dx, g.way.dy)} ${g.label}` : g.label,
    { x, y }, hidden ? avoid : [...avoid, marker], g.tint, r.cellH);
  // The arrow itself, on no box of its own (SX, 2026-10-02: «должен быть не блок, в
  // который стрелочка расположен ... а прям сама стрелочка»).
  if (hidden) return labelBox;
  r.glyphNow(mark, x + ux * g.pulse * cw, y + ch * 0.2 + uy * g.pulse * cw, g.tint, 1, 1.35);
  return labelBox;
}

// What a new pilot needs, and nothing from the workshop (SX, 2026-09-30:
// «сделай на старте инструкцию по управлению, поп-апом, скоро будем скидывать
// попробовать другим игрокам»). On ? in the game, and on the title while the
// game loads (labs/graphics/title.js; SX, 2026-09-30, the start pop-up retired),
// and in the lab. Two columns of two groups each, the same for every row: key,
// then what it does. Every key's name is the bindings table's (src/controls.js helpColumns, chat C): a page for each mode, KEYS +
// CLICKS and MOUSE + HOTKEYS, the mode in use first, ← → to the other (the list from before chat C, its `today` page, went with
// `?controls=old` on 2026-10-08).
// A key cell's width in cells: its name's.
const keyCells = (k) => Array.from(String(k)).length;

// The look before SX's S4 (2026-10-09, labs/graphics/sketches/windows-swiss-2.html): the game draws the controls list in the Swiss manner now
// (labs/graphics/windows.js drawControlsWindow); this painter stays only for the stale sketch page that shows the old look
// (labs/graphics/sketches/popups-v2.html). BACKLOG: remove it with that page.
// The panel, centred, on the interface's rows (src/uiGrid.js; SX, 2026-09-30:
// «Все вот эти отступы ... должны быть в системе»): a row for every line, one
// blank row between groups, `line` between a key and what it does, `group`
// between the columns, the footer the last row of the content. `footer` is that
// last line: how to leave it. Returns the panel's box.
// `page`: a mode (K, M), its name white and underlined in the row of the modes' names under the intro, as the pause's choices are,
// each a button (the box returns `tabs`: [{ page, box }]); `can` what the flown hull can do (src/chassis.js; SCOOTY JR. neither
// drifts nor fires, and the list does not offer either); `steering` how the keys steer (src/steering.js, GAMEPLAY's STEERING: 'tank',
// the default, or 'screen', whose FLY rows say so).
export function drawControls(r, footer = `[${keyName('close')}] CLOSE`, { page = DEFAULT_SCHEME, can = null, steering = 'tank' } = {}) {
  const cw = r.cellW, ROW = UI.row;
  const LIST = helpColumns(page, can, steering), INTRO = helpIntro(page);
  // Each column is as wide as its own keys and descriptions: `line` after its
  // longest key, then its longest description.
  const measure = (groups) => {
    const rows = groups.flatMap(([, list]) => list);
    const key = Math.max(...rows.map(([k]) => keyCells(k))) + UI.line.cols;
    return { key, cells: key + Math.max(...rows.map(([, d]) => d.length), ...groups.map(([h]) => h.length - key)) };
  };
  const room = Math.floor((r.view.w - 2 * UI.vector.line) / cw);
  const pair = LIST.map(measure);
  // The panel's width: the columns with `group` between them and a `line` inset at each
  // end, and one `space` more. Text is drawn `textX` into its column (so its ink starts
  // where the rule's does), which carries the widest line past its last column by as much:
  // with `line` only, the right side had 11 px of air against the left's 17 (design
  // review, 2026-09-30). The extra column gives the right its inset; the widest line then
  // ends a few px short of the rule, never past it.
  const widthOf = (list) => list.reduce((n, c) => n + c.cells, 0) + UI.group.cols * (list.length - 1) + 2 * UI.line.cols + UI.space.cols;
  const two = room >= widthOf(pair);
  const columns = two ? LIST : [LIST.flat()];
  const sizes = two ? pair : [measure(LIST.flat())];
  // The schemes' row, its names `group` apart: never wider than the panel's content.
  const tabCells = SCHEMES.reduce((n, s) => n + Array.from(SCHEME_NAMES[s]).length, 0) + UI.group.cols * (SCHEMES.length - 1);
  const cols = Math.min(room, Math.max(widthOf(sizes), tabCells + 2 * UI.line.cols + UI.space.cols));
  // The intro, wrapped at word boundaries to the panel's width.
  const wrapped = [''];
  for (const word of INTRO.split(' ')) {
    const line = wrapped[wrapped.length - 1];
    if (line && line.length + 1 + word.length > cols - 2 * UI.line.cols - UI.space.cols) wrapped.push(word);
    else wrapped[wrapped.length - 1] = line ? `${line} ${word}` : word;
  }
  // Every column's lines: a heading and its rows per group, a blank between groups.
  const tallest = Math.max(...columns.map((groups) => groups.reduce((n, [, rows]) => n + 1 + rows.length, 0) + groups.length - 1));
  // The frame, the intro, the schemes' row, its rule, the lists, a blank row, the footer, the frame.
  const rows = 1 + wrapped.length + 1 + 1 + tallest + 1 + 1 + 1;
  // In the middle at the optical centre, as every centred window (src/uiGrid.js centredWindow), kept on the screen in a short window.
  const { x, y } = centredWindow(r, cols * cw, rows * ROW, { ink: frameInk(r) });
  const g = uiPanel(r, x, y, cols, rows, 'CONTROLS');
  wrapped.forEach((line, i) => g.text(line, UI.line.cols, 1 + i, muted()));
  const tabs = [], tabRow = 1 + wrapped.length, { textY, capBottom } = uiMetrics(r);
  let tabCol = UI.line.cols;
  for (const s of SCHEMES) {
    const name = SCHEME_NAMES[s], n = Array.from(name).length, on = s === page;
    g.text(name, tabCol, tabRow, on ? ink() : muted());
    if (on) r.fill(Math.round(g.X(tabCol) + uiMetrics(r).textX), Math.round(g.Y(tabRow) + textY + capBottom + 2), Math.round(n * cw), 1, ink(), 0.7);
    tabs.push({ page: s, box: { x: g.X(tabCol), y: g.Y(tabRow), w: n * cw, h: ROW } });
    tabCol += n + UI.group.cols;
  }
  const ruleRow = tabRow + 1;
  g.rule(UI.line.cols, cols - 1 - UI.line.cols, ruleRow, CONFIG.hud.frame);
  columns.forEach((groups, c) => {
    const keyWidth = sizes[c].key;
    const col = UI.line.cols + (c ? sizes[0].cells + UI.group.cols : 0);
    let row = ruleRow + 1;
    groups.forEach(([heading, list], gi) => {
      if (gi) row++;
      g.text(heading, col, row++, accent());
      for (const [key, description] of list) {
        g.text(key, col, row, ink());
        g.text(description, col + keyWidth, row++, muted());
      }
    });
  });
  g.text(footer, UI.line.cols, rows - 2, ink());
  return { x, y, w: cols * cw, h: rows * ROW, tabs };
}
