// The first flight's keys in the top left corner (SX, 2026-10-21: «давай до того как пользователь открыл первую станцию и начал в нее
// вкладывать деньги, то вот эти пункты управления компактно написаны в левом верхнем углу», with his marks on the controls list: thrust,
// reverse, turn, brake, fire, jump, trick, the map, the pilot card and the way home). Shown while the opening has not had the pilot's first
// money in its ruin (src/opening.js beforeFirstMoney) and the ruins' tracker shows nothing (SX, 2026-10-22, on a screenshot with RELAY 12 at
// 0 % under the keys: «уже появилась шкала восстановления станции, но управление не пропало. Должно уже пропасть»), under MODERN where the
// stations being built hang later (hud-modern.js: the tracker's corner) and over SCOOTY JR.'s handlebar alike; the rows the bindings table has for the mode and the hull
// (src/controls.js starterRows: SCOOTY JR. neither fires nor drifts). Each row's keys as the interface's column buttons draw theirs (the
// keycap, its letter in the secondary ink) flush right on one axis, the words after it in the buttons' hint ink, a row (UI.row) apart, the
// first row on the top line of the interface (hud-modern.js modernLines keyRowT), the widest row's first cap on MODERN's side margin.
// A legend, not buttons: the caps answer no click (clicks.js unnoted). Presentation only: nothing here is read by the world.
import { ROLES } from '../../src/roles.js';
import { UI, uiMetrics } from '../../src/uiGrid.js';
import { starterRows } from '../../src/controls.js';
import { beforeFirstMoney } from '../../src/opening.js';
import { keycap, haloText, KEYCAP_PAD, KEYCAP_RISE } from './ui-parts.js';
import { unnoted } from './clicks.js';
import { keyTokens } from './swiss.js';
import { modernLines, MODERN } from './hud-modern.js';
import { tr } from '../../src/lang.js';

export const starterKeysShown = (world, tracker = null) => beforeFirstMoney(world) && !tracker?.rows.length;
// How many rows the list has for the mode, the hull and the steering (hud-modern.js hangs the stations being built under them).
export const starterKeysRows = (scheme, can = null, steering = 'tank') => starterRows(scheme, can, steering).length;

const CAP = { ink: ROLES.textSecondary, reach: 0 };
const len = (s) => Array.from(s).length;
// A row's caps, from the left stroke of the first to the right stroke of the last (keycap: its letters, KEYCAP_PAD either side, the next
// letter a cell past the last's end and a pad).
function capsWidth(r, tokens) {
  let x = 0;
  for (let i = 0; i < tokens.length; i++) x += (i ? r.cellW - KEYCAP_PAD : 0) + len(tokens[i]) * r.cellW + 2 * KEYCAP_PAD;
  return x;
}
const cellWidth = (r, cell) => { const t = keyTokens(cell); return t ? capsWidth(r, t) : len(String(cell).trim()) * r.cellW; };

// The list for `scheme` (src/controls.js SCHEMES), the hull's `can` and the keys' `steering`. Returns the box it takes.
export function drawStarterKeys(r, { scheme, can = null, steering = 'tank' }) {
  // (Their words in the pilot's language, src/lang.js tr; a key's letters as they are.)
  const rows = starterRows(scheme, can, steering).map(([cell, words]) => [keyTokens(cell) ? cell : tr(String(cell)), tr(words)]);
  if (!rows.length) return null;
  const { textY } = uiMetrics(r), L = modernLines(r), top = L.keyRowT;
  const axis = MODERN.side + Math.max(...rows.map(([cell]) => cellWidth(r, cell)));
  let right = axis;
  unnoted(() => rows.forEach(([cell, words], i) => {
    const y = Math.round(top + i * UI.row + textY), tokens = keyTokens(cell);
    if (tokens) {
      let x = axis - capsWidth(r, tokens) + KEYCAP_PAD;
      for (const t of tokens) x = keycap(r, t, x, y, CAP) + KEYCAP_PAD;
    } else haloText(r, String(cell).trim(), axis - cellWidth(r, cell), y, ROLES.textSecondary);
    const at = axis + r.cellW;
    haloText(r, words, at, y, ROLES.textHint);
    right = Math.max(right, at + len(words) * r.cellW);
  }));
  const y0 = Math.round(top + textY) - KEYCAP_RISE;
  return { x: MODERN.side - KEYCAP_PAD, y: y0, w: right - MODERN.side + KEYCAP_PAD, h: (rows.length - 1) * UI.row + r.cellH + KEYCAP_RISE + 1 };
}
