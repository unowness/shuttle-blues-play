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
