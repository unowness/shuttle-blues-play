// The smoke clouds' drawing (src/clouds.js; behind the lab's ?clouds= until SX picks). A cloud is drawn on the edge fog's cells
// (src/worldDraw.js drawDeadEdges): on the same cells of the grid, its thickness its sections' depth with the fog's two blocks of
// noise drifting through it, a cell smoke where it is thick enough and has the neighbours for it (no lone cells, no strokes a cell
// thin), and every such cell one step of the fog's shade '░', laid as rows; in an ink of its own (CLOUD_INK), never the rocks'. No
// outline (SX, 2026-10-04, after flying ?clouds=on: «дым слишком неотличим от камней ... дым брали без контура»): it had the fog's
// box-drawing outline round its shade, the rocks' own stroke, and read as one more rock. Its wisps, where a hull goes in and comes
// out, are smoke of the same cloud: laid into its thickness, never a second layer of shade over it. The hull's way through a cloud is
// the fog's (src/fogCells.js: the puffs src/clouds.js lays, the hull's own hole and its bow): holes with lumpy sides, the smoke they
// push aside heaped round them, a cone behind the hull that closes after it. A jump over a cloud dims it a little under the hull, as
// it dims the rocks (src/trick.js underShip), section by section. The view's side smoke is the same cells laid in from the screen's
// four edges, streaming past with the ship's way, as far in as `world.cloudSide` (in a cloud or in the fog past a dead edge).
import { CONFIG } from './config.js';
import { easeOut } from './util.js';
import { fogHash, wakeHoles, stampHoles } from './fogCells.js';
import { CLOUDS, cloudsOf, placeCloud, partRadius } from './clouds.js';
import { underShip } from './trick.js';

// The clouds' ink, the smoke's (CONFIG.smoke: SX's K4 HEATHER, a cool lilac; the fog past a dead edge wears it too). They were in the
// fog's blue, the rocks' blue then. The cloud, its wisps and the view's side smoke all wear it.
export const CLOUD_INK = CONFIG.smoke.ink;

// The look's numbers beside the fog's (CONFIG.sector.boundary.fog): how thick a cell is to be smoke (`front`, where the outline ran
// when there was one), the noise's blocks in cells (the fog's 2 and 6) and its weights. The shade is the smoke's (CONFIG.smoke.shade,
// SX's V1 FAINT: 0.28; it was 0.34 inside an outline of 0.62, then 0.28 inside one of 0.35), the side smoke's too (it was 0.25).
const LOOK = Object.freeze({ front: 0.06, blocks: [2, 6], noise: [0.26, 0.1], drift: 9, side: { share: 0.12, rate: 0.9 } });

let buf = null;
// Fills the cells i0..i1, j0..j1 of a field with the shade, `thick(i, j)` a cell's thickness. Cell (i, j)'s middle stands on the
// screen at (ox + (i + 0.5) cw, oy + (j + 0.5) ch). A cell is smoke where it is `front` thick and two of its four neighbours are, or
// thinner but with three (no lone cells off the body, no lone pits in it); its shade is laid as rows, `alpha` strong, or, where
// `dimOf(i, j)` says a cell keeps less of it (the hull passing over in a jump), that share less, a row broken where the strength (in
// the renderer's sixteenths) changes. Typed arrays kept between calls; nothing allocated a cell.
function paint(r, i0, i1, j0, j1, thick, ox, oy, color, alpha, dimOf = null) {
  const ni = i1 - i0 + 1, nj = j1 - j0 + 1;
  if (ni <= 0 || nj <= 0) return;
  const n = ni * nj, cw = r.cellW, ch = r.cellH, front = LOOK.front;
  if (!buf || buf.field.length < n) buf = { field: new Float32Array(n * 2) };
  const F = buf.field;
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) F[j * ni + i] = thick(i + i0, j + j0);
  const on = (i, j) => (i >= 0 && i < ni && j >= 0 && j < nj && F[j * ni + i] >= front ? 1 : 0);
  const shadeCh = CONFIG.sector.boundary.fog.shade.ch;
  for (let j = 0; j < nj; j++) {
    let run = -1, runQ = -1;                        // the first cell of the row's run under way, and its strength (-1: `alpha`)
    for (let i = 0; i <= ni; i++) {
      let smoke = false, q = -1;
      if (i < ni) {
        const round = on(i - 1, j) + on(i + 1, j) + on(i, j - 1) + on(i, j + 1);
        smoke = F[j * ni + i] >= front ? round >= 2 : round >= 3;
        if (smoke && dimOf) q = Math.round(alpha * (1 - dimOf(i + i0, j + j0)) * 16);
      }
      if (run >= 0 && (!smoke || q !== runQ)) {
        const x = ox + (run + i0 + 0.5) * cw, y = oy + (j + j0 + 0.5) * ch, count = i - run, a = runQ < 0 ? alpha : runQ / 16;
        if (r.glyphRow) r.glyphRow(shadeCh, x, y, count, color, a);
        else for (let k = 0; k < count; k++) r.glyph(shadeCh, x + k * cw, y, color, a);
        run = -1;
      }
      if (smoke && run < 0) { run = i; runQ = q; }
    }
  }
}

// The view in the sector's units, with a margin of a few cells.
function view(world, r) {
  const m = r.margin;
  return { left: world.cam.x - r.cx - m, right: world.cam.x + (r.width - r.cx) + m, top: world.cam.y - r.cy - m, bottom: world.cam.y + (r.height - r.cy) + m };
}

// Kept between frames, grown when a cloud has more: its sections' middles and radii, its wisps' middles, radii and ages; the cells of
// its box the way through it clears and heaps.
const kept = { px: new Float64Array(8), py: new Float64Array(8), pr: new Float64Array(8), pk: new Float64Array(8),
  wx: new Float64Array(8), wy: new Float64Array(8), wr: new Float64Array(8), wk: new Float64Array(8),
  clear: new Uint8Array(1024), heap: new Float32Array(1024) };
const room = (n, cells) => {
  if (kept.px.length < n) for (const k of ['px', 'py', 'pr', 'pk', 'wx', 'wy', 'wr', 'wk']) kept[k] = new Float64Array(n * 2);
  if (kept.clear.length < cells) { kept.clear = new Uint8Array(cells * 2); kept.heap = new Float32Array(cells * 2); }
};
const NONE = Object.freeze([]);

// The way through the clouds this frame: the holes of the puffs a hull and its exhaust left in them (src/clouds.js `cloudWake`), and
// the hull's own while it is on the ground, `bow` heaped before it, as in the fog past a dead edge (src/worldDraw.js drawDeadEdges).
// Up in a jump it cuts nothing: it is over the smoke. Kept between frames; `holes.n` of them this one.
const holes = [];
holes.n = 0;
function wayThrough(world) {
  const ship = world.ship, K = CONFIG.sector.boundary.fog.cone, t = world.time;
  let n = wakeHoles(world.cloudWake ?? NONE, t, holes);
  if (ship.alive && !ship.airborne && !world.docked) {
    const h = holes[n] ?? (holes[n] = {});
    h.x = ship.x; h.y = ship.y; h.r = K.near * 1.15; h.rim = K.bow; h.phase = t * 0.6;
    n++;
  }
  holes.n = n;
}

// A wisp's thickness at `u` of its radius out, `k` through its life: a round lump growing (from `puff.from` to `puff.to` u over its
// life) and thinning away from its rim inward as it ages, the cloud's noise fraying it.
const wispThick = (u, k) => 1 - u - k * k;

// One cloud of the sector (ox, oy) off this one, and its wisps: the cells in view, the way through it cleared and heaped.
function drawCloud(world, r, c, ox, oy, V) {
  const cx = c.x + ox, cy = c.y + oy, reach = c.reach, t = world.time;
  // Its wisps: only in the ship's sector, where they were laid (src/clouds.js stepClouds).
  let W = 0, wl = cx - reach, wr = cx + reach, wt = cy - reach, wb = cy + reach;
  const puffs = ox === 0 && oy === 0 ? world.cloudPuffs ?? NONE : NONE;
  room(Math.max(c.parts.length, puffs.length), 0);
  for (const p of puffs) {
    if (p.cloudId !== c.id || p.sectorId !== world.sector.id) continue;
    const P = CLOUDS.puff, k = (t - p.t) / P.life;
    if (k < 0 || k >= 1) continue;
    const R = (P.from + (P.to - P.from) * easeOut(k)) * p.size;
    kept.wx[W] = p.x; kept.wy[W] = p.y; kept.wr[W] = R; kept.wk[W] = k; W++;
    wl = Math.min(wl, p.x - R); wr = Math.max(wr, p.x + R); wt = Math.min(wt, p.y - R); wb = Math.max(wb, p.y + R);
  }
  const x0 = Math.max(wl, V.left), x1 = Math.min(wr, V.right), y0 = Math.max(wt, V.top), y1 = Math.min(wb, V.bottom);
  if (x0 >= x1 || y0 >= y1) return;
  const cw = r.cellW, ch = r.cellH;
  const gx = world.sector.col * world.width, gy = world.sector.row * world.height;
  const i0 = Math.floor((x0 + gx) / cw), i1 = Math.ceil((x1 + gx) / cw), j0 = Math.floor((y0 + gy) / ch), j1 = Math.ceil((y1 + gy) / ch);
  const ni = i1 - i0 + 1, nj = j1 - j0 + 1;
  // The way through it, stamped on its cells as the fog's is, where a hole reaches them.
  const F = CONFIG.sector.boundary.fog, [L3, L5] = F.lobes, RW = F.rimWidth;
  let cut = false;
  for (let q = 0; q < holes.n && !cut; q++) {
    const h = holes[q], o = h.r * (1 + L3 + L5) * (1 + RW);
    cut = h.x + o > x0 && h.x - o < x1 && h.y + o > y0 && h.y - o < y1;
  }
  if (cut) {
    room(0, ni * nj);
    kept.clear.fill(0, 0, ni * nj); kept.heap.fill(0, 0, ni * nj);
    stampHoles(holes, holes.n, i0, i1, j0, j1, ni, cw, ch, gx, gy, kept.clear, kept.heap, L3, L5, RW);
  }
  const drift = LOOK.drift * t, bigB = LOOK.blocks[1], midB = LOOK.blocks[0], bigW = LOOK.noise[0], midW = LOOK.noise[1];
  const P = c.parts.length, { px, py, pr, pk, wx, wy, wr: wR, wk, clear, heap } = kept;
  for (let k = 0; k < P; k++) { const p = c.parts[k]; px[k] = cx + p.dx; py[k] = cy + p.dy; pr[k] = partRadius(p, t); }
  // What the hull passes over in a jump dims a little under it, briefly and smoothly, as the rocks do (src/trick.js underShip: SX,
  // F1d, «если корабль пролетает над чем-то, то ... затемняется»; then «кстати тень не доделал»: the clouds did not). Each section is
  // a thing passed over by itself (its middle and radius on the screen), and its dim falls off from its middle to none at its edge, so
  // where two sections meet the smoke has no seam.
  let dims = 0;
  for (let k = 0; k < P; k++) {
    pk[k] = 1 - underShip(world, r, c.parts[k], r.cx + px[k] - world.cam.x, r.cy + py[k] - world.cam.y, pr[k]);
    if (pk[k] > 0) dims++;
  }
  const dimOf = !dims ? null : (i, j) => {
    const x = (i + 0.5) * cw - gx, y = (j + 0.5) * ch - gy;
    let most = 0;
    for (let k = 0; k < P; k++) {
      if (pk[k] <= 0) continue;
      const dx = x - px[k], dy = y - py[k], R = pr[k], d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      const v = pk[k] * Math.min(1, 2 * (1 - Math.sqrt(d2) / R));
      if (v > most) most = v;
    }
    return most;
  };
  const thick = (i, j) => {
    let pushed = 0;
    if (cut) {
      const idx = (j - j0) * ni + i - i0;
      if (clear[idx]) return -1;
      pushed = heap[idx];
    }
    const x = (i + 0.5) * cw - gx, y = (j + 0.5) * ch - gy;
    let f = -1;
    for (let k = 0; k < P; k++) {
      const dx = x - px[k], dy = y - py[k], R = pr[k], d2 = dx * dx + dy * dy;
      if (d2 >= 1.96 * R * R) continue;                // past 1.4 R: under -0.4 whatever the noise adds
      const v = 1 - Math.sqrt(d2) / R;
      if (v > f) f = v;
    }
    for (let k = 0; k < W; k++) {
      const dx = x - wx[k], dy = y - wy[k], R = wR[k], d2 = dx * dx + dy * dy;
      if (d2 >= 1.96 * R * R) continue;
      const v = wispThick(Math.sqrt(d2) / R, wk[k]);
      if (v > f) f = v;
    }
    if (f <= -0.4) return f;
    const fx = x + gx + drift, fy = y + gy - drift * 0.4;
    f += (fogHash(Math.floor(fx / (cw * bigB)), Math.floor(fy / (ch * bigB * 0.6))) - 0.5) * bigW;
    f += (fogHash(Math.floor(fx / (cw * midB)) + 7919, Math.floor(fy / (ch * midB * 0.6)) - 104729) - 0.5) * midW;
    // The smoke the way through it pushed aside, heaped round it.
    return f + pushed;
  };
  paint(r, i0, i1, j0, j1, thick, r.cx - gx - world.cam.x, r.cy - gy - world.cam.y, CLOUD_INK, CONFIG.smoke.shade, dimOf);
}

// The clouds of the ship's sector and of those drawn round it, with their wisps and the way through them: under the rocks, the
// stations' bodies and the ship.
export function drawClouds(world, r) {
  if (!world.clouds) return;
  const V = view(world, r), t = world.time;
  wayThrough(world);
  drawSector(world, r, world.sector, 0, 0, V);
  for (const n of world.neighbours) {
    for (const c of cloudsOf(world, n.sector)) placeCloud(c, t);
    drawSector(world, r, n.sector, n.ox, n.oy, V);
  }
}
function drawSector(world, r, sector, ox, oy, V) {
  for (const c of cloudsOf(world, sector)) drawCloud(world, r, c, ox, oy, V);
}

// The view's side smoke while the hull is in a cloud or in the fog past a dead edge (`world.cloudSide`, src/clouds.js stepClouds):
// the smoke's shade laid in from the screen's four edges, `side.share` of its width deep at the most (the same depth at the top and
// bottom), their fronts ragged by the noise and streaming past with the ship's way. Over everything of the world, under the interface.
// It was the left and right alone, and in a cloud alone (SX, 2026-10-07: «когда мы пролетаем в дыму по бокам под интервейсом слева и
// справа у нас эффект дыма, он должен быть еще сверху и снизу тоже под интерфейсом и когда в дым скраю влетаем тоже»). Each side's
// ragged front is one number a line (a row for the left and right, a column for the top and bottom), worked once a frame into kept
// arrays; a row's shade is then laid as runs (Renderer.glyphRow): its left side's, its right side's, and between them the cells the
// top or the bottom reach, so no cell is laid twice and the corners are filled. A cell is smoke `front` thick or more, as in a cloud.
const SIDE = { lumps: [new Float32Array(64), new Float32Array(64), new Float32Array(64), new Float32Array(64)] };
// A side's lump at line `n`, `along` lines streamed past: two sizes of blocks of the fog's noise, salted by side.
const SALT = [[-31, 17, -57, 29], [31, 17, 57, 29], [101, 41, 131, 43], [151, 53, 173, 59]];
// A run of the shade (Renderer.glyphRow), cell by cell where a renderer has no rows (a check's).
const sideRow = (r, ch, x, y, n, ink, a) => { if (r.glyphRow) r.glyphRow(ch, x, y, n, ink, a); else for (let c = 0; c < n; c++) r.glyph(ch, x + c * r.cellW, y, ink, a); };
const sideLump = (n, along, salt) => fogHash(Math.floor((n + along) / 3) + salt[0], salt[1]) * 0.45 + fogHash(Math.floor((n + along) / 1.5) + salt[2], salt[3]) * 0.2;
export function drawCloudSides(world, r) {
  const k = world.cloudSide ?? 0;
  if (k <= 0.01 || world.cockpitSmoke === false) return;
  const S = LOOK.side, cw = r.cellW, ch = r.cellH, t = world.time, deep = r.width * S.share * easeOut(k);
  const nx = Math.ceil(r.width / cw), ny = Math.ceil(r.height / ch);
  const cols = Math.max(1, Math.min(nx >> 1, Math.ceil(deep / cw))), rows = Math.max(1, Math.min(ny >> 1, Math.ceil(deep / ch)));
  if (SIDE.lumps[0].length < Math.max(nx, ny)) for (let q = 0; q < 4; q++) SIDE.lumps[q] = new Float32Array(Math.max(nx, ny) * 2);
  // The smoke streams along the ship's way: the lines slide past by the ship's speed (in cells), as the fog's blocks slide.
  const speed = Math.hypot(world.ship.vx, world.ship.vy) * S.rate * t, alongY = speed / ch, alongX = speed / cw;
  const [L0, L1, L2, L3] = SIDE.lumps, keep = 1 - LOOK.front;
  for (let j = 0; j < ny; j++) { L0[j] = sideLump(j, alongY, SALT[0]); L1[j] = sideLump(j, alongY, SALT[1]); }
  for (let i = 0; i < nx; i++) { L2[i] = sideLump(i, alongX, SALT[2]); L3[i] = sideLump(i, alongX, SALT[3]); }
  const a = CONFIG.smoke.shade * k, shadeCh = CONFIG.sector.boundary.fog.shade.ch;
  for (let j = 0; j < ny; j++) {
    // A side's depth is 1 at the screen's edge and 0 at its front, `deep` cells times 0.55 and its lump in: smoke where it is `front`
    // or more, the cells nearer the edge than `deep (0.55 + lump) (1 - front)`.
    const y = (j + 0.5) * ch;
    const nL = Math.min(cols, Math.max(0, Math.ceil(cols * (0.55 + L0[j]) * keep)));
    const nR = Math.min(cols, Math.max(0, Math.ceil(cols * (0.55 + L1[j]) * keep)));
    if (nL > 0) sideRow(r, shadeCh, 0.5 * cw, y, nL, CLOUD_INK, a);
    if (nR > 0) sideRow(r, shadeCh, (nx - nR + 0.5) * cw, y, nR, CLOUD_INK, a);
    if (j >= rows && j < ny - rows) continue;
    let from = -1;
    for (let i = nL; i <= nx - nR; i++) {
      const on = i < nx - nR && ((j < rows && j < rows * (0.55 + L2[i]) * keep) || (ny - 1 - j < rows && ny - 1 - j < rows * (0.55 + L3[i]) * keep));
      if (on && from < 0) from = i;
      else if (!on && from >= 0) { sideRow(r, shadeCh, (from + 0.5) * cw, y, i - from, CLOUD_INK, a); from = -1; }
    }
  }
}
