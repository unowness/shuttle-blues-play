// CLIPPER as its crew flies it (src/clipper.js), lent to the world as `world.clipperArt` (labs/graphics/world-art.js, as the stations' cargo
// art is): SX's own drawing (ships/spaceship.json, the STANDARD's look CLIPPER, src/shipLooks.js), never redrawn, its cells painted by their
// roles in its paint SUPRA (src/paint.js `sp-clipper` paintedHull: SX's G8 TWIN NOS, ORANGE SIDES on labs/graphics/sketches/clipper-beta.html,
// 2026-10-21/22), at the friendly ships' 1.5. On the drive two blue flames, one under each outer strut («выхлоп двойной, типа слева и справа.
// Синего цвета»); in flight, now and then, the drift's clump of smoke out of one window or the other, in white («клубы белого дыма иногда
// вылетают из @@ то слева то справа, типо там сиги курят»; then «такие же облачка ... как от дрифта. Вот, только из окон»: labs/graphics/stunt-fx.js
// smokePuff). Look only: the flame and the smoke are hashes of the page's clock `t`, no stream drawn.
import { CONFIG } from '../../src/config.js';
import { shipLookModel } from '../../src/shipLooks.js';
import { paintedHull } from '../../src/paint.js';
import { SMOKE, smokePuff, smokeRows } from './stunt-fx.js';

// `paint` its paint; `twin` the flames' x in cells off its middle, `flame` their two inks; `puff` the smoke: a slot of `every` s, a quarter of
// them clear, a pair `pair` s apart, each `life` s and `size` of a drift's clump, out `out` cells to its side and `back` cells back, in `ink`.
export const CLIPPER_LOOK = Object.freeze({
  paint: 'sp-clipper', twin: Object.freeze([-1.5, 1.5]), flame: Object.freeze(['#5CC4FF', '#A8E4FF']),
  puff: Object.freeze({ every: 2.3, life: 0.9, size: 0.7, pair: 0.16, out: 1.6, back: 1.2, ink: '#F2F4F6' }),
});
const SCALE = () => CONFIG.ship.visualScale.cruise;
const model = () => shipLookModel('clipper');
const cellsOf = (m) => (m.frames?.length > 1 ? m.frames[m.idleFrame] : m.cells);
const hash = (k) => { const v = Math.sin(k * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

// CLIPPER at (x, y) of `r`, its nose along `angle`, its cells turned with it as a ship's are: the drive's flames while `engine`, the smoke
// while `fly`.
export function drawClipper(r, x, y, angle, { engine = false, fly = false, alpha = 1, t = 0 } = {}) {
  const m = model();
  if (!m) return;
  const L = CLIPPER_LOOK, scale = SCALE(), a = angle + Math.PI / 2 + (m.baseRotation || 0), ca = Math.cos(a), sa = Math.sin(a);
  const w = r.cellW * scale, h = r.cellH * scale, cells = cellsOf(m);
  if (engine) {
    const rear = Math.max(...cells.map((c) => c.y));
    L.twin.forEach((nx, n) => [['v', 1], ['·', 2.1]].forEach(([ch, k], i) => {
      const lx = nx * w, ly = (rear + k) * h;
      r.glyphRot(ch, x + lx * ca - ly * sa, y + lx * sa + ly * ca, a, L.flame[(i + n + Math.floor(t * 11)) % L.flame.length], alpha * (0.6 + 0.4 * Math.sin(t * 23 + n * 2)), scale);
    }));
  }
  for (const c of cells) {
    const lx = c.x * w, ly = c.y * h;
    r.glyphRot(c.ch, x + lx * ca - ly * sa, y + lx * sa + ly * ca, a, paintedHull(L.paint, c, engine) ?? c.color, alpha, scale);
  }
  if (fly) drawPuffs(r, x, y, ca, sa, w, h, t, alpha);
}

// The smoke out of the windows: in the slot now and the one before, a pair of the drift's clumps out of one side, drifting out and back.
function drawPuffs(r, x, y, ca, sa, w, h, t, alpha) {
  const P = CLIPPER_LOOK.puff, puffs = [], k = Math.floor(t / P.every);
  for (const slot of [k - 1, k]) {
    if (hash(slot) > 0.75) continue;
    const side = hash(slot + 0.5) < 0.5 ? -1 : 1, start = slot * P.every + hash(slot + 0.25) * 0.6;
    for (let n = 0; n < 2; n++) {
      const age = t - start - n * P.pair;
      if (age < 0 || age >= P.life) continue;
      let seed = slot * 7 + n;
      const p = smokePuff({ x: 0, y: 0, vx: 0, vy: 0, angle: 0, radius: 0 }, 0, P.size * (n ? 0.75 : 1), P.life, () => hash(seed += 0.37));
      const u = age / P.life, lx = side * (1.1 + P.out * u) * w, ly = (P.back * u + n * 0.3) * h;
      puffs.push({ ...p, x: x + lx * ca - ly * sa, y: y + lx * sa + ly * ca, t: age });
    }
  }
  if (!puffs.length) return;
  const g = smokeRows(puffs, r.cellW, r.cellH, 0, 0);
  for (let i = 0; i < g.length; i += 4) for (let c = 0; c < g[i + 2]; c++) r.glyph(SMOKE.ch, g[i] + c * r.cellW, g[i + 1], P.ink, g[i + 3] * alpha);
}

// CLIPPER as a craft (its rows, each cell's ink in a palette: src/traffic.js drawCraft, src/vanish.js), in its paint at rest: the talk's
// picture and the beam that takes it. Null before its look is loaded.
let made = null;
export function clipperCraft() {
  const m = model();
  if (!m) return null;
  if (made?.model === m) return made.craft;
  const cells = cellsOf(m), xs = cells.map((c) => c.x), ys = cells.map((c) => c.y), x0 = Math.min(...xs), y0 = Math.min(...ys);
  const cols = Math.round(Math.max(...xs) - x0) + 1, rows = Math.round(Math.max(...ys) - y0) + 1;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(' ')), colors = Array.from({ length: rows }, () => Array(cols).fill(0)), palette = [];
  for (const c of cells) {
    const i = Math.round(c.x - x0), j = Math.round(c.y - y0), ink = paintedHull(CLIPPER_LOOK.paint, c, false) ?? c.color;
    let k = palette.indexOf(ink);
    if (k < 0) { k = palette.length; palette.push(ink); }
    grid[j][i] = c.ch; colors[j][i] = k;
  }
  made = { model: m, craft: Object.freeze({ rows: grid.map((row) => row.join('')), colors, palette, scale: SCALE() }) };
  return made.craft;
}

// What the world is lent.
export const clipperArt = Object.freeze({ draw: drawClipper, craft: clipperCraft });
