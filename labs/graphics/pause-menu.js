// The pause's menu (SX, 2026-10-02: «в паузе так: пауза (если кликнуть снимется пауза), настройки изображения, настройки звука,
// сохранить, выйти на главный экран (перед выходом сохраняется) ... у них есть свой ховер и клик», and for the picture's settings:
// «можно покликать новые фильтры цвета интерфейса и скины корабля, а также курсоры и выбрать конфиг, когда что-то новое появляется у
// этого пункта меню нотификация зеленая слева кружочек»).
//
// The pause's window (SX, 2026-10-02: «окноп паузы посередине всего экрана, все вокруг него затемняется»; a pop-up like the others since
// his word of 2026-10-06, «пауза – это тоже поп-ап»): plain black in a frame, in the middle of the screen (`above` px over it), the rest of the
// screen dimmed as under a pop-up. In it, on the main page, the pause's little space (labs/graphics/pause-toy.js: the ship dives in from where
// it stood, wants out, then pesters the PAUSED plate; a click on the plate plays on).
//
// On the organism's kit since SX's sketch W-ORG (2026-10-16, labs/graphics/organism.js: the frame, the service `S` off its lines, the content `C`
// off any line; R1 and R2 on labs/graphics/sketches/windows-organism-pairs.html):
//   MAIN: two panes, the menu's rows and the pause's space, the space a square as tall as the body, its stars and ship at 1:1 between its
//        lines (SX: «сделай в паузе ... все пространство ... тонкую рамку ... космос один к одному»). The rows from GRAPHICS (SX, 2026-10-16:
//        «убери ... резюм сверху ... повторение не нужно. Начинай сразу с графикс»: ESC RESUME is the foot's first key), in groups a blank row
//        apart; the head PAUSE and, at the right, the last save (SX, the same day: «убери таймер и оставь Save Two Minutes Ago ... справа»).
//   a settings page: one pane, as large; the head its name (SX: «название страницы»; its BACK went with his «escape назад ... без цикла»);
//        the groups' names at the content's axis on their first row, the labels `labelCols` in, a choice's count faint after its name, the
//        values flush right on one axis with ‹ › after them (the sketch's A1 PAIR), on and off a choice of two, a level a hairline with ticks and
//        its mark and its value flush right (SX, 2026-10-16: no ‹ › beside a slider); groups an empty row apart.
//   the MAIN MENU's step back: the menu's rows across the window.
//   the foot: ESC first at the left in the gray of the way back, its words what it does on the page (RESUME, BACK), DEFAULTS after it where a
//        page has it (`foot` item), the other keys at the right in their order (labs/graphics/pause.js hintsOf).
// The row under the pointer, or the keyboard's focus (the same pointer parked, labs/graphics/key-focus.js), stands on the half-clear focus bar,
// its words in their own inks (SX: «выбранная строка не белая ... попрозрачнее»): on the main page as wide as its words. Something new (not yet
// seen on its page) has a dot in the interface's blue by its row, and so does the row that leads to it. A row is a button
// (labs/graphics/clicks.js noteAction; the press sounds the interface's click). The page is drawn from what labs/graphics/pause.js hands it; the
// menu keeps only which page is open.
import { UI, centredWindow } from '../../src/uiGrid.js';
import { installGrade } from '../../src/grade.js';
import { ROLES } from '../../src/roles.js';
import { noteAction } from './clicks.js';
import { hoverItem } from '../../src/hover.js';
import { easeOut, clamp, inBox } from '../../src/util.js';
import { levelAt } from './swiss.js';
import { Win, ORG, INK, SIZES, len } from './organism.js';

export function createPauseMenu() { return { page: 'main' }; }

const DOT = 4;

// The window's geometry since the organism (SX, 2026-10-16, labs/graphics/organism.js; his sketch W-ORG R1 and R2): the ladder's S, 640 x 480, every
// page; the main page two panes, the menu's rows and the pause's space, a square as tall as the body, its stars and ship at 1:1 (SX: «сделай в
// паузе ... все пространство ... космос один к одному»); a settings page one pane, its groups' names at the content's axis, its labels `labelCols`
// in (past its widest group's name, «PARALLAX», and the gutter), its values flush right on one axis with ‹ › after them, a level's line from
// `trackCols` past the labels (its widest label, «INTERFACE», and the gutter) to `levelCols` short of the right axis, its value flush right there,
// no ‹ › (the line is its own control). A page too long for it grows down.
// Where it stands (SX, 2026-10-06, 2026-10-08): in the middle of the screen, `above` px over it, and there it stays, floated only by the toy's
// blows (`shake`, pause-toy.js). It comes over `appear` s, `drop` px from above and `scale` larger; it goes (SX: «когда ты выключаешь
// меню, оно как бы вверх взлетает») over `leave` s, `rise` px up. `dim`: the 10 % the rest of a window darkened under a hovered row, until
// the inverted row (the sketch pages' LEDGER+ look reads it still, labs/graphics/sketches/ledger.js).
export const PAUSE_WINDOW = Object.freeze({ size: 'S', labelCols: 10, trackCols: 11, levelCols: 6, w: SIZES.S[0],
  appear: 0.32, drop: 12, scale: 0.06, leave: 0.36, rise: 36, dim: 0.1, above: 36 });

// `rows`: what the window holds, top to bottom, a row of UI.row each (the head and the foot are the window's own),
//   { kind: 'item', label, run, dot, value, valueInk, quiet, dim, group, foot }   a button row (`value` words at its right; `group` the
//                                                          interface group a LAYOUT row stands for; `foot`: it stands in the foot, after ESC)
//   { kind: 'back', label, run }                       a page's: its name, said in the head (the way back is ESC, the foot's first key)
//   { kind: 'choices', label, options: [{ label, worn, dot, run }], count, dim, run, group }   a choice of several: VALUE ‹ › and which of how
//                                                          many after its name, «2/7» (`count: false` leaves it out);
//                                                          `run` what its name and Enter do instead of stepping (a LAYOUT group taken)
//   { kind: 'toggle', label, on, set(on) }             on and off: ON ‹ › or OFF ‹ ›, a choice of two
//   { kind: 'volume', label, level (0..1), steps, least, def, value, set(level), dim }   a level: a hairline with ticks and its mark, its value
//                                                          flush right; `steps` stops (10), the lowest `least` of them (0)
//   { kind: 'note', label, ink } · { kind: 'heading', title } · { kind: 'blank' }    a quiet line (in `ink`), a group's name (at the content's
//                                                          axis on its first row), a group's air (nothing is drawn in it)
// `pointer` the page's ({ x, y, inside, down, parked }); `drawView(view, r, landed)` draws the square's inside on `r` (the main page's only);
// `dim` the dimming's alpha; `over()` is drawn over the dimming and under the window (the layout's outlines on its page); `age` the seconds
// since the pause began; `shake` ({ x, y }) px it is jolted by (the ship's blows, pause-toy.js); `leave` how far it has gone (0 to 1) once the
// pause is let go; `above(view, frac)` is drawn over the window while it is coming or going (the ship); `page` the page's name (the rows'
// hover ids); `dt` the frame's seconds; `still` reduced motion. `drawView` and `above` get `frac`, the px the window stands off its drawn (whole
// px) place. `head` { title, meta: [{ text, ink }] } (the main page's title and what the game knows);
// `hints` [{ side: 'left' | 'right', key, words, dim }] the foot's keys, the left ones after ESC's place (ESC is a left one), the right ones in
// their order of importance.
// Returns { box, view } on the screen as drawn this frame, `at`, the window's place unshaken and unrounded, and `rows`, each row's box as laid
// out with what ← → do on it ({ box, step(d) }: a choice, a switch, a level), for the keys (labs/graphics/pause.js).
export function drawPauseWindow(r, rows, pointer, drawView, { dim = 0.5, over = null, age = Infinity, above = null,
  shake = null, leave = 0, page = 'main', dt = 1 / 60, still = false, head = null, hints = [] } = {}) {
  const P = PAUSE_WINDOW, E = Math.round(UI.air.inset), ctx = r.ctx;
  const lit = (b) => !leave && !!pointer?.inside && inBox(b, pointer.x, pointer.y);
  const plan = planRows(rows);
  const size = layoutWin(r, plan, page), base = SIZES[P.size][1], w = size.w, h = size.h;
  // In the middle of the screen, `above` px over it, the main page's place (a longer page grows down from it): SX, 2026-10-08, «меню
  // паузы, опусти на вниз немного чтобы она визуально была в центре экрана но + 36px вверх». Across, the middle of the screen. Never off
  // the screen, the windows' inset from its edge (a page too long for what is under it lifts the window, never past the top).
  const mid = centredWindow(r, w, base, { clear: false }), midY = Math.round((r.height - base) / 2 - P.above);
  const at = { x: clamp(mid.x, E, r.width - w - E), y: Math.max(E, Math.min(midY, r.height - h - E)) };
  const fx = at.x + (shake?.x ?? 0), fy = at.y + (shake?.y ?? 0), x = Math.round(fx), y = Math.round(fy);
  const frac = { x: fx - x, y: fy - y };
  // The pause's space: the main page's second pane inside its lines.
  const view = plan.head ? null : layoutWin(r, plan, page).place(() => ({ x, y })).panes[1].inside;
  // It plops onto the screen out of a fade (SX: «из фейда с небольшим скейлом плюхается на экран, пока тот затемняется ... довольно
  // быстро должно происходить и плавно»): over `appear` s, easing out, from nothing to whole, from `scale` larger to its size and
  // from `drop` px above, while the rest darkens; let go, it flies up `rise` px and fades, easing in, while the rest brightens. Drawn
  // on a layer of its own meanwhile, so it fades as one; its keys answer only while it stands.
  const come = easeOut(Math.min(1, Math.max(0, age) / P.appear)), go = Math.min(1, Math.max(0, leave)) ** 2;
  const e = come * (1 - go), lift = leave > 0 ? go * P.rise : (1 - come) * P.drop;
  r.fill(0, 0, r.width, r.height, ROLES.backing, dim * e);
  if (over) over();
  const note = leave > 0 ? () => {} : noteAction;
  const geo = { x, y, w, h, view, frac, plan, lit, drawView, note, pointer, page, dt, still, going: leave > 0, head, hints };
  const layer = e < 1 ? windowLayer(r, x - 1, y - 1, w + 2, h + 2) : null;
  let laid;
  if (layer) {
    laid = drawWindow(layer.r, { ...geo, landed: false });
    const k = 1 + (leave > 0 ? go * P.scale / 2 : (1 - come) * P.scale), cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate(cx, cy - lift); ctx.scale(k, k); ctx.translate(-cx, -cy);
    ctx.drawImage(layer.canvas, x - 1, y - 1, w + 2, h + 2);
    ctx.restore();
    if (above && view) above(view, frac);
  } else laid = drawWindow(r, { ...geo, landed: true });
  return { box: { x, y, w, h }, view: view ?? { x, y, w: 0, h: 0 }, at: { x: at.x, y: at.y }, rows: laid };
}

// The window as the organism lays it out for `plan` (labs/graphics/organism.js Win): S, the main page's two panes or a page's one, grown down
// for a page longer than it holds. Not placed.
function layoutWin(r, plan, page) {
  const win = new Win(r, { size: PAUSE_WINDOW.size, panes: plan.head ? [{ fill: true }] : [{ fill: true }, { square: true }], id: `pause:${page}` });
  if (plan.count) win.fit(win.p.yb(plan.count - 1));
  return win;
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

// The window itself on the organism's kit (labs/graphics/organism.js): its sheet, the head (PAUSE and what the game knows, or the page's name),
// the rows, the pause's space (the main page's), the foot. Returns each row's box as laid out.
function drawWindow(r, g) {
  const { x, y, plan } = g;
  const win = layoutWin(r, plan, g.page).place(() => ({ x, y })).sheet();
  const laid = [];
  // The pause's space on the main page, its second pane whole between its lines (SX: «сделай в паузе все пространство ... тонкую рамку»).
  if (!plan.head && g.drawView) g.drawView(win.panes[1].inside, r, g.landed, g.frac);
  layHead(win, g, plan);
  laid.push(...layBody(win, g, plan));
  laid.push(...layFoot(win, g, plan));
  for (const l of laid) l.draw();
  return laid.filter((l) => l.box).map(({ box, step, row }) => ({ box, step, kind: row.kind, label: row.label, group: row.group ?? null }));
}

// Draws one button: its box, the focus bar when the pointer (or the keys' focus) is on it, then `paint(on)`. A hover item of src/hover.js,
// flat: it answers the pointer by being drawn so, and is the thing under the pointer for the cursor.
const button = (r, id, box, on, paint) => () => hoverItem(r, id, box, () => paint(on), { over: on, kind: 'flat' });

// Where the keys' pointer stands on a row (labs/graphics/key-focus.js; SX's pick of C0's FOCUS 4 on labs/graphics/sketches/controls.html, «курсор
// встаёт за словами строки»): a cell and a half past its words, at the middle of the row's box.
const restAfter = (win, words, ix, box) => ({ x: ix - win.m.capLeft + (len(words) + 1.5) * win.cw, y: box.y + box.h / 2 });

// ---- the head --------------------------------------------------------------------------------------------------------------------

// The main page: PAUSE, and what the game knows at the right (the last save: SX, 2026-10-16, «убери таймер и оставь Save Two Minutes Ago ...
// справа»); a page: its name (the way back is the foot's ESC: SX, «escape назад ... без цикла»).
function layHead(win, g, plan) {
  const meta = (g.head?.meta ?? []).filter((t) => t?.text).map((t) => [t.text, t.ink ?? INK.label]);
  if (!plan.head) win.head([[g.head?.title ?? 'PAUSE', INK.text]], { meta });
  else win.head([[plan.head.label, INK.text]]);
}

// ---- the foot ------------------------------------------------------------------------------------------------------------------------

// ESC first at the left (its words what it does here), then DEFAULTS and the like, each a button; the other keys at the right in their order.
function layFoot(win, g, plan) {
  const hints = g.hints ?? [], left = hints.filter((h) => h.side === 'left'), right = hints.filter((h) => h.side !== 'left');
  const item = (h) => ({ key: h.key, words: h.words, dim: h.dim, tier: h.side === 'left' ? 'back' : 'key', id: `key:${h.key}` });
  const foot = plan.foot.map((row) => ({ noKey: true, words: row.label, dim: row.dim, run: g.going ? null : row.run, quiet: g.going || !row.run, id: `item:${row.label}`, row }));
  let Y = null;
  const out = [{ row: { kind: 'hints' }, draw: () => { Y = win.foot([...left.map(item), ...foot], right.map(item)); } }];
  // DEFAULTS' box for the checks and the keys (the foot drew it as a button; its box is the window's record of it).
  for (const f of foot) out.push({ row: f.row, get box() { return win.boxes.get(f.id) ?? null; }, draw: () => {} });
  void Y;
  return out;
}

// ---- the body ------------------------------------------------------------------------------------------------------------------------

// Each row laid on its row from the body's first: its box, whether the pointer is on it, what ← → do on it, and how it is drawn.
function layBody(win, g, plan) {
  const { note, pointer, page, lit } = g, p = win.p, cw = win.cw, P = PAUSE_WINDOW, r = win.r;
  const parked = () => !!pointer?.parked;
  const menu = plan.menu;
  // The columns: a menu's words at the content's axis; a settings page's group names there, its labels `labelCols` in, its values ending
  // `4` cells short of the content's right axis (their ‹ › after them), a level's line from `trackCols` past the labels to `levelCols` short of
  // the right axis.
  const A = p.x(menu ? 0 : P.labelCols), R = p.cxr, valueAt = R - 4 * cw;
  const trackX0 = A + P.trackCols * cw, trackX1 = R - P.levelCols * cw;
  const out = [];
  plan.slots.forEach((slot, i) => {
    const { row, k } = slot, Y = p.y(k);
    const hung = () => slot.hung && win.text(slot.hung.title, p.cx, Y, INK.label);
    if (row.kind === 'blank') return;                   // a group's air: nothing is drawn in it
    if (row.kind === 'note') {
      out.push({ row, on: false, draw: () => { hung(); win.text(row.label, A, Y, row.ink ?? INK.faint); } });
      return;
    }
    const box = win.rowBox(A, R, Y), id = `pause:${page}:${row.kind}:${row.label ?? i}`, on = lit(box);
    // Something new on its page: a dot in the interface's blue, a menu's in the margin at the left, a settings row's in the gap before its label.
    const dot = () => {
      const dx = menu ? win.x0 + 1 + ORG.C / 2 : A - 1.5 * cw;
      r.fill(Math.round(dx - DOT / 2), Math.round(Y + win.cap / 2 - DOT / 2), DOT, DOT, INK.blue);
    };
    // The focus bar: on a menu as wide as its words (SX: «по ширине слова»), on a settings row from its label to its arrows.
    const barTo = (ix) => (menu ? ix : R);
    const label = (o, ink) => win.text(row.label, A, Y, ink, { plate: o });
    if (row.kind === 'item') {
      if (row.run) note(box, row.run, restAfter(win, row.label, A, box));
      out.push({ row, on, box, draw: button(r, id, box, on, (o) => {
        if (o) win.bar(A, barTo(A + len(row.label) * cw - 2 * win.m.capLeft), Y);
        hung();
        label(o, row.quiet ? INK.label : row.dim ? INK.faint : INK.text);
        if (row.value) win.text(row.value, menu ? R : valueAt, Y, row.valueInk ?? INK.label, { right: true, plate: o });
        if (row.dot) dot();
      }) });
      return;
    }
    if (row.kind === 'choices' || row.kind === 'toggle') {
      const options = row.kind === 'toggle' ? [{ label: 'OFF', worn: !row.on }, { label: 'ON', worn: !!row.on }] : row.options ?? [];
      const at = Math.max(0, options.findIndex((o) => o.worn)), value = options[at]?.label ?? '';
      const count = row.kind === 'choices' && row.count !== false && options.length > 1 ? `${at + 1}/${options.length}` : null;
      const pick = row.kind === 'toggle' ? () => row.set?.(!row.on)
        : (d) => { if (options.length < 2) return; const o = options[(at + d + options.length) % options.length]; o?.run?.(); };
      // The whole row is the button: a click on ‹ steps back, anywhere else forward (Enter, where the keys are, forward too). A row with a `run`
      // of its own (a LAYOUT group: take it) runs it from its name, and from Enter; the choice is its VALUE ‹ ›.
      const valueLeft = valueAt + 2 * win.m.capLeft - len(value) * cw;
      const back = { x: R - 3 * cw + win.m.capLeft - cw / 2, w: 2 * cw };
      const onBack = () => !parked() && !!pointer && pointer.x >= back.x && pointer.x < back.x + back.w;
      const onName = () => !!row.run && !!pointer && (parked() || pointer.x < valueLeft - cw);
      const named = count ? `${row.label}  ${count}` : row.label;
      note(box, () => (onName() ? row.run() : pick(onBack() ? -1 : 1)), restAfter(win, named, A, box));
      out.push({ row, on, box, step: pick, draw: button(r, id, box, on, (o) => {
        if (o) win.bar(A, R, Y);
        hung();
        const end = win.text(row.label, A, Y, row.dim ? INK.faint : INK.text, { plate: o });
        if (count) win.text(count, end + 2 * cw + 2 * win.m.capLeft, Y, INK.faint, { plate: o });
        win.choice(R, Y, value, { ends: options.length > 1 ? [true, true] : [false, false], valueInk: row.dim ? INK.label : INK.text, plate: o });
        if (options.some((opt) => opt.dot)) dot();
      }) });
      return;
    }
    if (row.kind === 'volume') {
      const steps = row.steps ?? 10, least = row.least ?? 0, level = clamp(row.level ?? 1, 0, 1);
      const track = { x: Math.round(trackX0) - UI.pad, y: box.y, w: Math.round(trackX1) - Math.round(trackX0) + 2 * UI.pad, h: box.h };
      const stepOf = (lv) => clamp(Math.round(lv * steps), least, steps);
      const setStep = (n) => { const v = clamp(n, least, steps); if (v !== stepOf(level)) row.set?.(v / steps); };
      const atX = (px0) => Math.round(levelAt(trackX0, trackX1, px0) * steps);
      // A click on the line sets its level there (from the mouse; the keys step it by ← →); held down, the mark follows the pointer. No ‹ ›:
      // the line is its own control (SX, 2026-10-16: «у аудио ... не нужны стрелки слева-справа. Там есть ... слайдер»).
      note(track, () => { if (!parked() && pointer) setStep(atX(pointer.x)); }, restAfter(win, row.label, A, box));
      if (!g.going && pointer?.down && !parked() && pointer.inside && inBox(track, pointer.x, pointer.y)) setStep(atX(pointer.x));
      out.push({ row, on, box, step: (d) => setStep(stepOf(level) + d), draw: button(r, id, box, on, (o) => {
        if (o) win.bar(A, R, Y);
        hung();
        label(o, row.dim ? INK.faint : INK.text);
        win.level(trackX0, trackX1, Y, level);
        win.text(row.value ?? `${Math.round(level * 100)}%`, R, Y, INK.text, { right: true, plate: o });
      }) });
      return;
    }
    out.push({ row, on: false, draw: () => {} });
  });
  return out;
}
