// The pause's menu (SX, 2026-10-02: «в паузе так: пауза (если кликнуть снимется пауза), настройки изображения, настройки звука,
// сохранить, выйти на главный экран (перед выходом сохраняется) ... у них есть свой ховер и клик», and for the picture's settings:
// «можно покликать новые фильтры цвета интерфейса и скины корабля, а также курсоры и выбрать конфиг, когда что-то новое появляется у
// этого пункта меню нотификация зеленая слева кружочек»).
//
// The pause's window (SX, 2026-10-02: «окноп паузы посередине всего экрана, все вокруг него затемняется»; a pop-up like the others since
// his word of 2026-10-06, «пауза – это тоже поп-ап. Поэтому надо черный с белой рамкой и повесил в центр экрана с небольшой компенсацией
// наверх»): plain black in a frame, in the middle of the screen (`above` px over it), the rest of the screen dimmed as under a pop-up.
// In it, on the main page, the pause's little space (labs/graphics/pause-toy.js: the ship dives in from where it stood, wants out, then
// pesters the PAUSED plate; a click on the plate plays on).
//
// In the Swiss manner since SX's pick of 2026-10-09 (labs/graphics/sketches/windows-swiss.html, S1 and S2: «делаем вот это»; the kit and its
// rules are labs/graphics/swiss.js): a head line over a rule, a body, a rule and a foot of key hints; the frame and the rules in the quiet
// grays of src/frames.js (the white frame it wore until then, and the square's white line, went with them).
//   MAIN: two equal cells side by side (SX's marks on a screenshot, 2026-10-14, and «ее можно сделать уже»): the menu's rows in groups a
//        blank row apart, their words flush left, nothing at their right (the numbers 01-07, the › of a row that opens a page and RESUME's
//        keycap went with those marks); the toy ship's square the right cell whole, from the head's rule to the foot's and to the frame's
//        line, a rule down its left (the class and look under it went). The head: PAUSE, and at the right what the game knows: the last
//        save, then the flight's time (the sector went).
//   every other page as wide as the main one (SX, the same day: «все надо страницы подогнать ... на внутренних страницах можешь уже
//        скрывать квадрат с кораблем»), with no square: the toy is the main page's.
//   the MAIN MENU's step back: the menu's rows across the window.
//   a settings page: the head a BACK button, and nothing more (SX, the same day: «убери ненужные стрелочки и подписи 01 02 ... это
//        бутафория, сверху вместо паузы должна быть кнопка back»: the head's ‹, `PAUSE / NAME` and the page's number went, and the groups'
//        numbers); the groups hang their name at the left (`heading` rows), the rows at the label column `labelCols` in, the values flush
//        right on one axis, the window's right inset (a choice's count after its name, «SHIP 1/4», so the right edge is one line: SX, the
//        same day, «1/4 1/2 перенеси после названия ... чтобы правый край весь выровнять»), groups kept apart by a blank row. The ‹ › of a
//        choice stay (SX: the head's only).
//   the foot: DEFAULTS where a page has it (`foot` item), the keys' hints (`hints`).
// Two rules only, the head's and the foot's, each across to the frame's lines (SX, 2026-10-09: «Держись минимализма»); what is pressed wears the
// interface's own colour, ROLES.structure: the keys are the cockpit's caps (ui-parts.js keycap), the arrows of a choice, a switch's square
// and a page's back arrow are blue.
// A thing under the pointer, or the keyboard's focus (the same pointer parked, labs/graphics/key-focus.js), is the inverted row: a white bar,
// black words (src/hover.js 'flat': it neither moves nor darkens the rest; the dimming of the rest, 10 %, went with it). The switches (S2): a
// choice of several is ‹ VALUE › (a collection says which of how many, «2/7»; ← → or a click on ‹ or on the value steps it), on and off a
// square and its word, a level a hairline with ticks at 0, 50 and 100 % and a mark. Something new (not yet seen on its page) has a green dot
// by its row, and so does the row that leads to it. A row is a button (labs/graphics/clicks.js noteAction; the press sounds the interface's
// click). The page is drawn from what labs/graphics/pause.js hands it; the menu keeps only which page is open.
import { UI, centredWindow } from '../../src/uiGrid.js';
import { installGrade } from '../../src/grade.js';
import { PALETTE, ROLES } from '../../src/roles.js';
import { noteAction } from './clicks.js';
import { hoverItem } from '../../src/hover.js';
import { easeOut, clamp, inBox } from '../../src/util.js';
import { swiss, SWISS, W, G, Q, len, edgeRule, ruleV, frameBox, bar, onBar, keyWords, keyWidth, drawStep, drawToggle,
  drawSlider, levelAt } from './swiss.js';

export function createPauseMenu() { return { page: 'main' }; }

const DOT = 4;

// The window's geometry: two of the main page's squares across, every page (`mainSquare`; some 49 columns inside the inset at the game's
// cell). A settings page's labels `labelCols` in (past its widest group's name, «PARALLAX», and a group's gap), its values flush right at
// the inset, a level's line from `trackCols` past the labels (its widest label, «INTERFACE», and a gap) to a value's width short of them:
// so its widest choice, «CONTROLS 1/2 ‹ MOUSE + HOTKEYS ›», keeps a gap between its name and its value.
// `bodyRows`: the main page's body, whose height is its square's side; a longer page grows down. `w` and `view` are the 2026-10-09
// window's, 78 columns at the game's 9.27 px cell and its square of 200 px, for the sketch pages that read them.
// Where it stands (SX, 2026-10-06, 2026-10-08): in the middle of the screen, `above` px over it, and there it stays, floated only by the toy's
// blows (`shake`, pause-toy.js). It comes over `appear` s, `drop` px from above and `scale` larger; it goes (SX: «когда ты выключаешь
// меню, оно как бы вверх взлетает») over `leave` s, `rise` px up. `dim`: the 10 % the rest of a window darkened under a hovered row, until
// the inverted row (the other windows read it still, labs/graphics/ledger.js).
export const PAUSE_WINDOW = Object.freeze({ labelCols: 12, trackCols: 11, view: 200, bodyRows: 11.5, mainRows: 9,
  w: Math.round(2 * (SWISS.air + 1) + 78 * 9.2725),
  appear: 0.32, drop: 12, scale: 0.06, leave: 0.36, rise: 36, dim: 0.1, above: 36 });

// `rows`: what the window holds, top to bottom, a row of UI.row each (the head and the foot are the window's own),
//   { kind: 'item', label, run, dot, value, valueInk, quiet, dim, group, foot }   a button row (`value` words at its right; `group` the
//                                                          interface group a LAYOUT row stands for; `foot`: it stands in the foot, at the left)
//   { kind: 'back', label, run }                       a page's first row: its head, BACK (a click goes back; `label` names the page)
//   { kind: 'choices', label, options: [{ label, worn, dot, run }], count, dim, run, group }   a choice of several: ‹ VALUE › and which of how
//                                                          many after its name, «2/7» (the sketch's steppers all count; `count: false`
//                                                          leaves it out);
//                                                          `run` what its name and Enter do instead of stepping (a LAYOUT group taken)
//   { kind: 'toggle', label, on, set(on) }             on and off: a square and its word
//   { kind: 'volume', label, level (0..1), steps, least, def, value, set(level), dim }   a level: a hairline with ticks, its mark; `steps`
//                                                          stops (10), the lowest `least` of them (0); `def` is DEFAULTS' (not drawn since
//                                                          2026-10-09: the line says its ends and its middle)
//   { kind: 'note', label, ink } · { kind: 'heading', title } · { kind: 'blank' }    a quiet line (in `ink`), a group's name (hung at the left of
//                                                          its first row), a group's air (nothing is drawn in it)
// `pointer` the page's ({ x, y, inside, down, parked }); `drawView(view, r, landed)` draws the square's inside on `r` (the main page's only);
// `dim` the dimming's alpha; `over()` is drawn over the dimming and under the window (the layout's outlines on its page); `age` the seconds
// since the pause began; `shake` ({ x, y }) px it is jolted by (the ship's blows, pause-toy.js); `leave` how far it has gone (0 to 1) once the
// pause is let go; `above(view, frac)` is drawn over the window while it is coming or going (the ship); `page` the page's name (the rows'
// hover ids); `dt` the frame's seconds; `still` reduced motion. `drawView` and `above` get `frac`, the px the window stands off its drawn (whole
// px) place. `head` { title, meta: [{ text, ink }] } (the main page's title and what the game knows);
// `hints` [{ side: 'left' | 'right', key, words, dim }] the foot's keys.
// Returns { box, view } on the screen as drawn this frame, `at`, the window's place unshaken and unrounded, and `rows`, each row's box as laid
// out with what ← → do on it ({ box, step(d) }: a choice, a switch, a level), for the keys (labs/graphics/pause.js).
export function drawPauseWindow(r, rows, pointer, drawView, { dim = 0.5, over = null, age = Infinity, above = null,
  shake = null, leave = 0, page = 'main', dt = 1 / 60, still = false, head = null, hints = [] } = {}) {
  const ui = swiss(r), P = PAUSE_WINDOW, E = Math.round(UI.air.inset), ctx = r.ctx;
  const lit = (b) => !leave && !!pointer?.inside && inBox(b, pointer.x, pointer.y);
  const plan = planRows(rows);
  // The body's rows (the main page's square and its caption the least), then the foot a blank row under it with its rule across the blank row.
  const body = Math.max(P.bodyRows, plan.count);
  const tall = (n) => ui.heightWithKeys(SWISS.headGap + n + SWISS.footRows);
  // The main page's square's side, then the window two of them across, a hairline each for the frame's two lines and the rule between the
  // cells: every page (a longer one grows down, never across).
  const side = mainSquare(ui, P.bodyRows);
  const base = tall(P.bodyRows), h = tall(body), w = 2 * side + 3;
  // In the middle of the screen, `above` px over it, the main page's place (a longer page grows down from it): SX, 2026-10-08, «меню
  // паузы, опусти на вниз немного чтобы она визуально была в центре экрана но + 36px вверх». Across, the middle of the screen, over the
  // HUD's columns where the screen is narrow (the window is wider than the room between them at 1280): it dims everything round it. Never off
  // the screen, the windows' inset from its edge (a page too long for what is under it lifts the window, never past the top).
  const mid = centredWindow(r, w, base, { clear: false }), midY = Math.round((r.height - base) / 2 - P.above);
  const at = { x: clamp(mid.x, E, r.width - w - E), y: Math.max(E, Math.min(midY, r.height - h - E)) };
  const fx = at.x + (shake?.x ?? 0), fy = at.y + (shake?.y ?? 0), x = Math.round(fx), y = Math.round(fy);
  const frac = { x: fx - x, y: fy - y };
  // The square: the right cell inside its lines, the head's rule over it, the foot's under it, the frame's at its right.
  const view = { x: x + w - 1 - side, y: ui.headRule(y) + 1, w: side, h: side };
  // It plops onto the screen out of a fade (SX: «из фейда с небольшим скейлом плюхается на экран, пока тот затемняется ... довольно
  // быстро должно происходить и плавно»): over `appear` s, easing out, from nothing to whole, from `scale` larger to its size and
  // from `drop` px above, while the rest darkens; let go, it flies up `rise` px and fades, easing in, while the rest brightens. Drawn
  // on a layer of its own meanwhile, so it fades as one; its keys answer only while it stands.
  const come = easeOut(Math.min(1, Math.max(0, age) / P.appear)), go = Math.min(1, Math.max(0, leave)) ** 2;
  const e = come * (1 - go), lift = leave > 0 ? go * P.rise : (1 - come) * P.drop;
  r.fill(0, 0, r.width, r.height, ROLES.backing, dim * e);
  if (over) over();
  const note = leave > 0 ? () => {} : noteAction;
  const geo = { x, y, w, h, body, view, frac, ui, plan, lit, drawView, note, pointer, page, dt, still, going: leave > 0, head, hints };
  const layer = e < 1 ? windowLayer(r, x - 1, y - 1, w + 2, h + 2) : null;
  let laid;
  if (layer) {
    laid = drawWindow(layer.r, { ...geo, ui: swiss(layer.r), landed: false });
    const k = 1 + (leave > 0 ? go * P.scale / 2 : (1 - come) * P.scale), cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate(cx, cy - lift); ctx.scale(k, k); ctx.translate(-cx, -cy);
    ctx.drawImage(layer.canvas, x - 1, y - 1, w + 2, h + 2);
    ctx.restore();
    if (above) above(view, frac);
  } else laid = drawWindow(r, { ...geo, landed: true });
  return { box: { x, y, w, h }, view, at: { x: at.x, y: at.y }, rows: laid };
}

// The main page's square: its side, px, from under the head's rule to over the foot's (a window's rules stand at the same px from its top
// wherever it is).
function mainSquare(ui, body) {
  return ui.footRule(0, SWISS.headGap + body + SWISS.footRows) - ui.headRule(0) - 1;
}

// A canvas the window is drawn on while it comes, kept between frames: at the frame's pixel ratio, its own colour grade, and a
// renderer drawing on it in the screen's px.
let layerCache = null;
function windowLayer(r, x, y, w, h) {
  if (typeof document === 'undefined' || !r.ctx?.drawImage) return null;
  const dpr = r.dpr || 1, pw = Math.ceil(w * dpr), ph = Math.ceil(h * dpr);
  if (!layerCache || layerCache.canvas.width !== pw || layerCache.canvas.height !== ph) {
    const canvas = document.createElement('canvas');
    canvas.width = pw; canvas.height = ph;
    layerCache = { canvas, ctx: installGrade(canvas.getContext('2d')) };
  }
  const { canvas, ctx } = layerCache;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  ctx.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr);
  ctx.font = r.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lr = Object.create(r);
  lr.ctx = ctx;
  return { canvas, r: lr };
}

// ------------------------------------------------------------------------------------------------------------ the plan

// The rows told into places: which are the head (a `back` row), the foot's (`foot` items), and which stand in the body at which row `k` (a
// `heading` takes none: it hangs at the next row it finds; a blank row straight under the head is the head's own gap, and one at the end
// is the foot's). `menu`: a page of plain rows (no heading in it), the main page and the MAIN MENU's.
function planRows(rows) {
  const slots = [], foot = [];
  let head = null, hung = null, k = 0;
  const menu = !rows.some((row) => row.kind === 'heading');
  for (const row of rows) {
    if (row.kind === 'back') { head = row; continue; }
    if (row.kind === 'heading') { hung = row; continue; }
    if (row.foot) { foot.push(row); continue; }
    if (row.kind === 'blank') {
      if (k === 0) continue;
      slots.push({ row, k }); k += 1;
      continue;
    }
    slots.push({ row, k, hung });
    hung = null; k += 1;
  }
  while (slots.length && slots.at(-1).row.kind === 'blank') { slots.pop(); k -= 1; }
  return { head, slots, foot, count: k, menu };
}

// ------------------------------------------------------------------------------------------------------------ the window

// The window itself: plain black in its frame on its box's edge, the head and its rule, the rows, the square (the main page's), the foot.
// (Its body's rows are the main page's square's height: bodyK and the body's count as drawPauseWindow measured them.)
function drawWindow(r, g) {
  const { x, y, w, h, view, ui, plan } = g, P = PAUSE_WINDOW, I = ui.I;
  r.fill(x, y, w, h, ROLES.backing);
  frameBox(ui, { x, y, w, h });
  const L = x + I, R = x + w - I, box = { x, y, w, h };
  const headTop = ui.rowAt(y, 0), bodyK = SWISS.headGap, footK = SWISS.headGap + g.body + SWISS.footRows;
  const laid = [];
  // The two rules, and no more (SX, 2026-10-09: «Что-то очень много полосок ты начертил ... Они должны доходить до ближайшей поперечной ...
  // Держись минимализма»): under the head across the empty rows there, over the foot across the blank row, each to the nearest crossing line,
  // the frame's, at both sides. Groups and columns are kept apart by space.
  edgeRule(ui, box, ui.headRule(y));
  edgeRule(ui, box, ui.footRule(y, footK));
  laid.push(...layHead(r, g, plan, L, R, headTop));
  // The square on the main page, the right cell: its lines are the window's (the head's rule, the foot's, the frame's) and one rule down its
  // left between the two (SX's «именно у иконки, куда кораблик залетает, обрамление белое» was the old square's; the white line went with the
  // white frames, the square's own frame with SX's marks of 2026-10-14).
  if (!plan.head) {
    if (g.drawView) g.drawView(view, r, g.landed, g.frac);
    ruleV(ui, view.x - 1, view.y, view.h);
  }
  // The body's rows, then the foot's.
  laid.push(...layBody(r, g, plan, L, R, ui.rowAt(y, bodyK)));
  laid.push(...layFoot(r, g, plan, L, R, ui.rowAt(y, footK)));
  for (const l of laid) l.draw();
  return laid.filter((l) => l.box).map(({ box, step, row }) => ({ box, step, kind: row.kind, label: row.label, group: row.group ?? null }));
}

// Draws one button: its box, the bar when the pointer (or the keys' focus) is on it, then `paint(on)` in the inks the bar asks for. A hover
// item of src/hover.js, flat: it answers the pointer by being drawn so, and is the thing under the pointer for the cursor.
const button = (r, g, id, box, on, paint) => () => hoverItem(r, id, box, () => {
  if (on) bar(g.ui, box);
  paint(on);
}, { over: on, kind: 'flat' });

// Where the keys' pointer stands on a row (labs/graphics/key-focus.js; SX's pick of C0's FOCUS 4 on labs/graphics/sketches/controls.html, «курсор
// встаёт за словами строки»): a cell and a half past its words, at the row's middle.
const restAfter = (ui, words, ix, top) => ({ x: ix - ui.m.capLeft + (len(words) + 1.5) * ui.cw, y: top + UI.row / 2 });

// ---- the head --------------------------------------------------------------------------------------------------------------------

function layHead(r, g, plan, L, R, top) {
  const { ui, head, note, page } = g, cw = ui.cw, pad = SWISS.barPad;
  const meta = (head?.meta ?? []).filter((t) => t?.text);
  if (!plan.head) {
    // The main page: PAUSE, and what the game knows at the right, a group's step between.
    return [{ row: { kind: 'head' }, on: false, draw: () => {
      ui.text(head?.title ?? 'PAUSE', L, top, W);
      let right = R;
      for (const t of [...meta].reverse()) {
        ui.textEnd(t.text, right, top, t.ink ?? G);
        right -= len(t.text) * cw + SWISS.gap * cw;
      }
    } }];
  }
  // A page's head: BACK, a button (a click goes back).
  const row = plan.head, words = 'BACK';
  const box = { x: L - pad, y: top, w: len(words) * cw + 2 * pad, h: UI.row };
  if (row.run) note(box, row.run, restAfter(ui, words, L, top));
  const on = g.lit(box);
  return [{ row, on, box, draw: button(r, g, `pause:${page}:back:${row.label}`, box, on, (o) => ui.text(words, L, top, onBar(o, W), o)) }];
}

// ---- the foot ------------------------------------------------------------------------------------------------------------------------

function layFoot(r, g, plan, L, R, top) {
  const { ui, note, page } = g, cw = ui.cw, pad = SWISS.barPad, out = [];
  let at = L;
  // DEFAULTS and the like, white, at the left; each a button.
  for (const row of plan.foot) {
    const box = { x: at - pad, y: top, w: len(row.label) * cw + 2 * pad, h: UI.row };
    if (row.run) note(box, row.run, restAfter(ui, row.label, at, top));
    const on = g.lit(box), ix = at;
    out.push({ row, on, box, draw: button(r, g, `pause:${page}:item:${row.label}`, box, on, (o) => ui.text(row.label, ix, top, onBar(o, row.quiet ? G : W), o)) });
    at += len(row.label) * cw + SWISS.gap * cw;
  }
  // The keys' hints: the left ones after them, the right ones flush right.
  const hints = g.hints ?? [], gap = SWISS.gap * cw;
  out.push({ row: { kind: 'hints' }, on: false, draw: () => {
    for (const hint of hints.filter((s) => s.side !== 'right')) {
      const done = keyWords(ui, hint.key, hint.words, at, top, { dim: hint.dim });
      at = done.end + gap;
    }
    let right = R;
    for (const hint of [...hints.filter((s) => s.side === 'right')].reverse()) {
      right -= keyWidth(ui, hint.key, hint.words);
      keyWords(ui, hint.key, hint.words, right, top, { dim: hint.dim });
      right -= gap;
    }
  } });
  return out;
}

// ---- the body ------------------------------------------------------------------------------------------------------------------------

// Each row laid on its UI.row from the body's first row: its box, whether the pointer is on it, what ← → do on it, and how it is drawn.
function layBody(r, g, plan, L, R, bodyTop) {
  const { ui, note, pointer, page, lit } = g, cw = ui.cw, m = ui.m, pad = SWISS.barPad, P = PAUSE_WINDOW;
  const parked = () => !!pointer?.parked;
  const menu = plan.menu;
  // The columns: a menu's words at the inset, to the inset short of the square's rule on the main page (across the window on the MAIN MENU's);
  // a settings page's labels `labelCols` in, its values on the axis (the inset), a level's line from `trackCols` in to a value's width short of
  // the axis.
  const menuLeft = L, menuRight = plan.head ? R : g.view.x - 1 - ui.I, A = L + P.labelCols * cw, axis = R;
  const trackX0 = A + P.trackCols * cw, trackX1 = axis - 6 * cw;
  const out = [];
  const slots = plan.slots;
  slots.forEach((slot, i) => {
    const { row, k } = slot, top = Math.round(bodyTop + k * UI.row);
    const hung = () => slot.hung && ui.text(slot.hung.title, L, top, G);
    if (row.kind === 'blank') return;                   // a group's air: nothing is drawn in it
    if (row.kind === 'note') {
      out.push({ row, on: false, draw: () => { hung(); ui.text(row.label, menu ? L : A, top, row.ink ?? Q); } });
      return;
    }
    const ix = menu ? menuLeft : A, left = menu ? L : A, right = menu ? menuRight : R;
    const box = { x: left - pad, y: top, w: right - left + 2 * pad, h: UI.row };
    const id = `pause:${page}:${row.kind}:${row.label ?? i}`;
    const on = lit(box);
    const dot = () => {
      const dx = menu ? ui.I / 2 : A - 2 * cw;            // a menu's in the margin at the left, a settings row's in the gap before its label
      r.fill(Math.round(menu ? g.x + dx - DOT / 2 : dx - DOT / 2), Math.round(ui.capMid(top) - DOT / 2), DOT, DOT, PALETTE.green);
    };
    const label = (o, ink) => ui.text(row.label, ix, top, onBar(o, ink), o);
    if (row.kind === 'item') {
      if (row.run) note(box, row.run, restAfter(ui, row.label, ix, top));
      out.push({ row, on, box, draw: button(r, g, id, box, on, (o) => {
        hung();
        label(o, row.quiet ? G : row.dim ? Q : W);
        if (row.value) ui.textEnd(row.value, menu ? right : axis, top, onBar(o, row.valueInk ?? G), o);
        if (row.dot) dot();
      }) });
      return;
    }
    if (row.kind === 'choices') {
      const options = row.options ?? [];
      const at = Math.max(0, options.findIndex((o) => o.worn)), worn = options[at], value = worn?.label ?? '';
      const count = row.count !== false && options.length > 1 ? `${at + 1}/${options.length}` : null;
      const n = len(value) + 4, origin = axis + m.capLeft - n * cw;
      const pick = (d) => { if (options.length < 2) return; const o = options[(at + d + options.length) % options.length]; o?.run?.(); };
      // The whole row is the button: a click on ‹ steps back, anywhere else forward (Enter, where the keys are, forward too). A row with a `run`
      // of its own (a LAYOUT group: take it) runs it from its name, and from Enter; the choice is its ‹ VALUE ›.
      const onBack = () => !parked() && !!pointer && pointer.x >= origin - cw / 2 && pointer.x < origin + 1.5 * cw;
      const onName = () => !!row.run && !!pointer && (parked() || pointer.x < origin - cw / 2);
      const named = count ? `${row.label} ${count}` : row.label;
      note(box, () => (onName() ? row.run() : pick(onBack() ? -1 : 1)), restAfter(ui, named, ix, top));
      out.push({ row, on, box, step: pick, draw: button(r, g, id, box, on, (o) => {
        hung();
        label(o, row.dim ? Q : W);
        drawStep(ui, { right: axis, top, value, on: o });
        if (count) ui.text(count, ix + (len(row.label) + 1) * cw, top, onBar(o, Q), o);
        if (options.some((opt) => opt.dot)) dot();
      }) });
      return;
    }
    if (row.kind === 'toggle') {
      const flip = () => row.set?.(!row.on);
      note(box, flip, restAfter(ui, row.label, ix, top));
      out.push({ row, on, box, step: flip, draw: button(r, g, id, box, on, (o) => {
        hung();
        label(o, W);
        drawToggle(ui, { right: axis, top, isOn: !!row.on, on: o });
      }) });
      return;
    }
    if (row.kind === 'volume') {
      const steps = row.steps ?? 10, least = row.least ?? 0, level = clamp(row.level ?? 1, 0, 1);
      const track = { x: Math.round(trackX0) - UI.pad, y: top, w: Math.round(trackX1) - Math.round(trackX0) + 2 * UI.pad, h: UI.row };
      const stepOf = (lv) => clamp(Math.round(lv * steps), least, steps);
      const setStep = (n) => { const v = clamp(n, least, steps); if (v !== stepOf(level)) row.set?.(v / steps); };
      const atX = (px0) => Math.round(levelAt(trackX0, trackX1, px0) * steps);
      // A click on the line sets its level there (from the mouse; the keys step it by ← →); held down, the mark follows the pointer.
      note(track, () => { if (!parked() && pointer) setStep(atX(pointer.x)); }, restAfter(ui, row.label, ix, top));
      if (!g.going && pointer?.down && !parked() && pointer.inside && inBox(track, pointer.x, pointer.y)) setStep(atX(pointer.x));
      out.push({ row, on, box, step: (d) => setStep(stepOf(level) + d), draw: button(r, g, id, box, on, (o) => {
        hung();
        label(o, row.dim ? Q : W);
        drawSlider(ui, { x0: trackX0, x1: trackX1, top, level, on: o });
        const value = row.value ?? `${Math.round(level * 100)}%`;
        ui.textEnd(value, axis, top, onBar(o, W), o);
      }) });
      return;
    }
    out.push({ row, on: false, draw: () => {} });
  });
  return out;
}
