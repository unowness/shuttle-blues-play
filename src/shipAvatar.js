// The ship's drawing in its framed box: the pilot card's (src/pilotPanel.js) and the hangar's showcase (src/hangarPanel.js). It lived
// in pilotPanel.js until PLAN D2 (2026-10-04), where it made the two panels import each other.
import { CONFIG } from './config.js';
import { UI, uiGrid } from './uiGrid.js';
import { keepBegin, keepEnd } from './grade.js';
import { paintedHull } from './paint.js';

// The ship's own drawing, upright, fitted into a box of `cols` columns x `rows`
// rows whose first cell is at (x, y), at most `largest` times its cell size,
// `pad` clear of the frame's ink. The card fits the model's whole canvas (its
// exhaust rows too); `pose` fits the drawing itself, as large as the box allows
// (the hangar's showcase). The frame is on the grid; the ship keeps the world's
// cells.
export function drawAvatar(r, model, x, y, cols, rows, { largest = 1.6, pose = false, fill = 1, paint = null, line = CONFIG.hud.frame } = {}) {
  const cw = r.cellW, ch = r.cellH;
  uiGrid(r, x, y).box(0, 0, cols - 1, rows - 1, line);
  const cells = model.frames && model.frames.length > 1 ? model.frames[model.idleFrame] : model.cells;
  if (!cells || !cells.length) return;
  const span = (key) => Math.max(...cells.map((c) => c[key])) - Math.min(...cells.map((c) => c[key])) + 1;
  const w = Math.max(1, pose ? span('x') : model.width), h = Math.max(1, pose ? span('y') : model.height);
  // `fill`: the share of the box's inside the drawing may take, so there is air round it.
  const s = Math.min(largest, fill * ((cols - 1) * cw - 2 * UI.pad) / (w * cw), fill * ((rows - 1) * UI.row - 2 * UI.pad) / (h * ch));
  const cx = x + (cols * cw) / 2, cy = y + (rows * UI.row) / 2;
  const b = model.baseRotation || 0, cb = Math.cos(b), sb = Math.sin(b);
  // The ship is art wherever it is drawn: a worn look (src/looks.js) filters it here as it does in flight (the kept layer).
  const was = keepBegin();
  for (const c of cells) {
    const lx = c.x * cw * s, ly = c.y * ch * s;
    // A paint's own ink per part (src/paint.js), the front arcs theirs; else the model's colour.
    r.glyphNow(c.ch, cx + lx * cb - ly * sb, cy + lx * sb + ly * cb, paintedHull(paint, c) ?? c.color, 1, s);
  }
  keepEnd(was);
}

// A ship's drawing centred in `box` on its painted cells rather than its pivot, upright, no frame: the hangar's squares and its chosen ship
// (labs/graphics/windows.js drawHangar, SX's H1 SHELF). At `scale` times the font's cell where it is given, else as large as the box holds
// (`fill` of it, at most `largest` times its cell). The pilot's own ships in its paint (`paint`), a crew's in its own colours (paint null);
// a ship not had in one `ink` at `alpha`.
export function drawShipIn(r, model, box, { paint = null, ink = null, alpha = 1, fill = 1, largest = 6, scale = null } = {}) {
  const cells = drawnCells(model);
  if (!cells) return;
  const { x0, x1, y0, y1 } = cellSpan(cells);
  const cw = r.cellW, ch = r.cellH;
  const s = scale ?? Math.min(largest, fill * box.w / ((x1 - x0 + 1) * cw), fill * box.h / ((y1 - y0 + 1) * ch));
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const b = model.baseRotation || 0, cb = Math.cos(b), sb = Math.sin(b);
  const was = keepBegin();
  for (const c of cells) {
    const lx = (c.x - mx) * cw * s, ly = (c.y - my) * ch * s;
    r.glyphNow(c.ch, cx + lx * cb - ly * sb, cy + lx * sb + ly * cb, ink ?? paintedHull(paint, c) ?? c.color, alpha, s);
  }
  keepEnd(was);
}

// The cells a model is drawn in at rest (its idle frame), or null.
const drawnCells = (model) => {
  const cells = model?.frames && model.frames.length > 1 ? model.frames[model.idleFrame] : model?.cells;
  return cells && cells.length ? cells : null;
};
const cellSpan = (cells) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of cells) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); }
  return { x0, x1, y0, y1 };
};

// One scale for several ships drawn side by side (SX, 2026-10-14, of the hangar's CLASSIC: «должен быть меньше, ... он совсем с другими не
// совпадает в масштабах»): each at its size in the game (its cells times its model's own scale, `baseScale`, never the breathing one), the
// largest of them as large as `box` holds (`fill` of it). Returns the factor; a ship is drawn at it times its model's scale (drawShipIn's
// `scale`).
export function sharedScale(r, models, box, fill = 1) {
  let k = Infinity;
  for (const model of models) {
    const cells = drawnCells(model);
    if (!cells) continue;
    const { x0, x1, y0, y1 } = cellSpan(cells), m = modelScale(model);
    k = Math.min(k, fill * box.w / ((x1 - x0 + 1) * r.cellW * m), fill * box.h / ((y1 - y0 + 1) * r.cellH * m));
  }
  return Number.isFinite(k) ? k : 1;
}
// A model's own scale: the one it was made at, not the flown ship's breathing one (src/visualScale.js).
export const modelScale = (model) => model?.baseScale ?? model?.scale ?? 1;
