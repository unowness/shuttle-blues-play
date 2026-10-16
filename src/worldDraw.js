// The world's drawing: the camera, the dead edges' fog and rope, the planets' names, the seams and what is drawn beyond them, the
// signals, and World.draw itself. Moved out of src/world.js as it was (chat W, 2026-10-04, the roadmap's refactoring piece: the
// world's drawing out of src/world.js): the methods are the World's own, written here as a class and put on World.prototype
// (addDrawing), so every `this` in them is the world as before and every caller (the page's frame, the lab's scenes, the checks)
// calls them where it always did; the golden master (tools/golden.mjs) holds the move to the same frames and the same world.
import { drawAliens } from './aliens.js';
import { CONFIG } from './config.js';
import { TAU, clamp, wrapTo, dimToContrast, hashId, glyphCount, hypot2 } from './util.js';
import { leanLook } from './starfield.js';
import { PLANE, WRAP } from './topology.js';
import { neighbourOf, sectorTitle } from './sectors.js';
import { contractById, cargoOf, cargoSize } from './contracts.js';
import { signalsIn } from './progression.js';
import { signText, drawSign, signCoverBox } from './signs.js';
import { sprite, drawSprite, halfHeight } from './sprites.js';
import { openStrangersIn } from './strangers.js';
import { drawPaintTin, drawTin } from './paint.js';
import { lookFindsIn, lookTinInks } from './looks.js';
import { availableIn } from './rewards.js';
import { craftPose, drawCraft, craftReach, craftSize, HAIL_REACH, visitorPose } from './traffic.js';
import { npcCraft } from './npcShips.js';
import { drawPestered } from './pester.js';
import { drawWreck } from './wrecked.js';
import { drawSuitcase, PLANET_ID } from './errands.js';
import { drawRecorderLying, drawRecorderAboard } from './chorusArt.js';
import { drawSpecial, drawFlownShip, boarded } from './specials.js';
import { dockView } from './docking.js';
import { towSize, anchorOf } from './tow.js';
import { liftOffset, cargoHeight, passedOver, underShip } from './trick.js';
import { drawDroid, drawServiceFx, DROID_INKS, DROID_CAPTION, droidFootprint } from './droids.js';
import { drawOil } from './oil.js';
import { fogHash, FOG_EDGE, wakeHoles, stampHoles } from './fogCells.js';
import { drawClouds } from './cloudDraw.js';
import { lap } from './frameProfile.js';
import { drawPirateCues, drawPirateFields } from './pirateCombatDraw.js';

// The ink of a planet's name, worked out once per tint (World.planetLabelInk).
const labelInks = new Map();

// A stable number from a stable id, so an authored rock has the same outline
// on every visit instead of a new random one (src/util.js hashId).
export const seedOf = hashId;

// The fog's noise (fogHash) and its outline's strokes (FOG_EDGE): src/fogCells.js, shared with the smoke clouds.
export { fogHash };
// How much its two blocks of noise weigh in the fog's thickness (World.drawDeadEdges): each a hash in [0, 1) less a half, times this.
const FOG_NOISE = Object.freeze({ big: 0.36, mid: 0.12 });

// A fog cell's level for its outline (World.drawDeadEdges `levAt`): 0 no fog, 1 inside the front.
// FOG_LEVEL_DEEP is a deep cell the band left unworked, of whatever level is round it.
const FOG_LEVEL_DEEP = 255;
// A run of the fog's shade (Renderer.glyphRow), cell by cell where a renderer keeps no buckets (a check's recorder).
function fogRow(r, ch, x, y, n, ink, a) {
  if (r.buckets) r.glyphRow(ch, x, y, n, ink, a);
  else for (let c = 0; c < n; c++) r.glyph(ch, x + c * r.cellW, y, ink, a);
}
// A stroke met at the corner `key` (World.drawFogShade): its bit added, the corner listed the first time; returns how many are listed.
function fogJoin(edgeAt, edgeOrder, edges, key, bits) {
  if (!edgeAt[key]) edgeOrder[edges++] = key;
  edgeAt[key] |= bits;
  return edges;
}

// The list of what stands in front of the sky and the discs in it (World.skyOccluders), kept from frame to frame.
const SKY = [], SKY_DISCS = [];
let skyDiscs = 0;
function skyDisc(world, r, k, x, y, radius) {
  const d = SKY_DISCS[skyDiscs] ?? (SKY_DISCS[skyDiscs] = { x: 0, y: 0, r: 0 });
  skyDiscs++;
  d.x = world.projectX(r, x) + world.lean.x * k; d.y = world.projectY(r, y) + world.lean.y * k; d.r = radius;
  SKY.push(d);
}

class WorldDrawing {
  // -------------------------------------------------------------- camera ---

  updateCamera(r, dt) {
    const ship = this.ship;
    // Docked, the camera holds the station in the screen's middle (SX, 2026-10-15: «когда корабль в доке, станция должна находится в
    // центре экрана, как и гараж ... камера должна плавно и естественно приводить нас к центру экрана»), easing there and back at the
    // follow's own pace: the point src/docking.js dockView names. It stood at the middle of the sky (Renderer.view) until SX flew it the
    // same day: «нужно точно центр космоса определить пониже, сейчас когда мы докаемся в станцию она висит чуть выше чем нужно»; the
    // screen's middle is 83 px lower at 1512 x 982 (491 against 408), 80 at 1280 x 960, and under the ship's own place (r.cy, 424).
    const held = dockView(this);
    if (held) {
      const midY = r.height ? r.height / 2 : r.cy, midX = r.width ? r.width / 2 : r.cx;
      const to = this.delta(held.x + (r.cx - midX), held.y + (r.cy - midY), this.cam.x, this.cam.y);
      const kh = clamp(CONFIG.camera.follow * dt * 60, 0, 1);
      this.cam.x += to.x * kh; this.cam.y += to.y * kh;
      if (this.topology.mode === WRAP) { this.cam.x = wrapTo(this.cam.x, this.width); this.cam.y = wrapTo(this.cam.y, this.height); }
      return;
    }
    const d = this.delta(ship.x, ship.y, this.cam.x, this.cam.y);
    const lead = CONFIG.camera.lead;
    let lx = clamp(ship.vx * lead, -CONFIG.camera.leadMax, CONFIG.camera.leadMax);
    let ly = clamp(ship.vy * lead, -CONFIG.camera.leadMax, CONFIG.camera.leadMax);
    // In the boss's fight the camera leans toward it (CONFIG.boss.camera): at its range it would stand at the edge of a 1280 x 960 view.
    const boss = this.boss && !this.boss.defeated ? this.boss : null;
    if (boss) {
      const C = CONFIG.boss.camera, to = this.delta(boss.x, boss.y, ship.x, ship.y), len = Math.hypot(to.x, to.y);
      const k = len > C.far ? 0 : Math.min(C.lean, C.max / (len || 1));
      lx += to.x * k; ly += to.y * k;
    }
    const k = clamp(CONFIG.camera.follow * dt * 60, 0, 1);
    this.cam.x += (d.x + lx) * k;
    this.cam.y += (d.y + ly) * k;
    if (this.topology.mode === WRAP) {
      this.cam.x = wrapTo(this.cam.x, this.width);
      this.cam.y = wrapTo(this.cam.y, this.height);
    }
    void r;
  }

  // The 3 x 3 sectors round the ship's, [dy + 1][dx + 1], this one in the middle and a closed or missing one null.
  openRing() {
    return [-1, 0, 1].map((dy) => [-1, 0, 1].map((dx) => (!dx && !dy ? this.sector : this.openNeighbour(this.sector, dx, dy))));
  }

  // A dead edge (SX, 2026-10-02): its line, and past it the fog (CONFIG.sector.boundary.fog), thin at the line and
  // thick where the rope holds hardest. For the whole grid in view, not only this sector's edges: across a seam the
  // next sector's dead edge is the same line. The fog sits on the world's cells counted from the grid's corner, so it
  // does not jump when the ship crosses a seam; it drifts slowly, and parts round the ship, the way it came closing
  // behind it. Then, the same night: «контуры тумана ... должен быть более угловатым ... неоднородно, имитируя как бы
  // рельефы как на астероидах, только обратные ... более прозрачные квадраты ... как будто ямки показывают. И они тоже
  // двигаются ... И край более рваный, более такой квадратный. И полоска, которая границу карты показывает слишком
  // яркая ... пустить ее точками разряженными. Сильно разряженными ... Белыми»: the fog's thickness is noise in square
  // blocks (no smoothing between them), two sizes over its depth, so its front is ragged and stepped; small square pits
  // drift through it, thinner than round them; the way the ship cuts is square too; the line is a white dot every
  // `dots` cells, faint.
  drawDeadEdges(r) {
    if (this.topology.mode !== PLANE) return;
    const C = CONFIG.sector.seam, B = CONFIG.sector.boundary, F = B.fog;
    const W = this.width, H = this.height, t = this.time, m = r.margin;
    const left = this.cam.x - r.cx - m, right = this.cam.x + (r.width - r.cx) + m;
    const top = this.cam.y - r.cy - m, bottom = this.cam.y + (r.height - r.cy) + m;
    const gx = this.sector.col * W, gy = this.sector.row * H;
    // The sectors round this one, a closed one as none (src/frontier.js): looked up once a frame, read for every cell of the fog.
    const ring = this.openRing();
    const at = (dx, dy) => (Math.abs(dx) > 1 || Math.abs(dy) > 1 ? null : ring[dy + 1][dx + 1]);
    const light = (u) => C.alpha + C.pulse * (0.5 + 0.5 * Math.sin(u / C.wave - t * C.speed)) ** 3;

    // The lines: every side of a sector in view with nothing across it.
    const rects = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!at(dx, dy)) continue;
        rects.push([dx * W, dy * H, (dx + 1) * W, (dy + 1) * H]);
        for (const side of [-1, 1]) {
          if (!at(dx + side, dy)) {
            const x = (side < 0 ? dx : dx + 1) * W;
            if (x >= left && x <= right) {
              const y0 = Math.max(dy * H, top), y1 = Math.min((dy + 1) * H, bottom), step = r.cellH * F.dots;
              for (let y = Math.ceil((y0 + gy) / step) * step - gy; y <= y1; y += step) {
                const s = this.project(r, x, y);
                r.glyph('\u00b7', s.x, s.y, F.dotColor, F.dotAlpha);
              }
            }
          }
          if (!at(dx, dy + side)) {
            const y = (side < 0 ? dy : dy + 1) * H;
            if (y >= top && y <= bottom) {
              const x0 = Math.max(dx * W, left), x1 = Math.min((dx + 1) * W, right), step = r.cellW * F.dots * 1.6;
              for (let x = Math.ceil((x0 + gx) / step) * step - gx; x <= x1; x += step) {
                const s = this.project(r, x, y);
                r.glyph('\u00b7', s.x, s.y, F.dotColor, F.dotAlpha);
              }
            }
          }
        }
      }
    }

    // In the boss's fight its smoke's square is the one open place (src/bossQuest.js world.bossArena; SX, 2026-10-14: «буквально нашим
    // туманом»): the fog is the world's own everywhere outside it, its line dotted along its four sides.
    const A = this.bossArena;
    if (A) {
      rects.length = 0;
      rects.push([A.x - A.half, A.y - A.half, A.x + A.half, A.y + A.half]);
      const stepY = r.cellH * F.dots, stepX = r.cellW * F.dots * 1.6;
      for (const x of [A.x - A.half, A.x + A.half]) if (x >= left && x <= right)
        for (let y = Math.ceil((Math.max(A.y - A.half, top) + gy) / stepY) * stepY - gy; y <= Math.min(A.y + A.half, bottom); y += stepY) {
          const s = this.project(r, x, y); r.glyph('\u00b7', s.x, s.y, F.dotColor, F.dotAlpha);
        }
      for (const y of [A.y - A.half, A.y + A.half]) if (y >= top && y <= bottom)
        for (let x = Math.ceil((Math.max(A.x - A.half, left) + gx) / stepX) * stepX - gx; x <= Math.min(A.x + A.half, right); x += stepX) {
          const s = this.project(r, x, y); r.glyph('\u00b7', s.x, s.y, F.dotColor, F.dotAlpha);
        }
    }
    // The fog: only where the view reaches a grid square with no sector (or, in the boss's fight, past its square).
    const sq = (v, size) => Math.floor(v / size);
    let open = true;
    if (A) open = left >= A.x - A.half && right <= A.x + A.half && top >= A.y - A.half && bottom <= A.y + A.half;
    else for (let j = sq(top, H); j <= sq(bottom, H) && open; j++) for (let i = sq(left, W); i <= sq(right, W); i++) if (!at(i, j)) { open = false; break; }
    if (open) return;
    // Where the fog parts: the puffs the hull and the exhaust left (stepFogWake), each widening as it ages and closing from
    // its `closeFrom` on, and the ship's own, `bow` heaped before it. Each is stamped onto the cells in view once a frame:
    // a cell inside a puff's lumpy outline is clear, one in the ring round it gets the heap.
    // (src/fogCells.js wakeHoles, stampHoles: the clouds' way through them is the same.)
    const K = F.cone, [L3, L5] = F.lobes, RW = F.rimWidth;
    const holes = [];
    holes.length = wakeHoles(this.fogWake, t, holes);
    if (this.ship.alive) holes.push({ x: this.ship.x, y: this.ship.y, r: K.near * 1.15, rim: K.bow, phase: t * 0.6 });
    const cw = r.cellW, ch = r.cellH, drift = F.drift * t;
    const i0 = Math.floor((left + gx) / cw), i1 = Math.ceil((right + gx) / cw);
    const j0 = Math.floor((top + gy) / ch), j1 = Math.ceil((bottom + gy) / ch);
    const ni = i1 - i0 + 1, nj = j1 - j0 + 1;
    const buf = this.fogCells && this.fogCells.clear.length >= ni * nj ? this.fogCells
      : (this.fogCells = { clear: new Uint8Array(ni * nj * 2), heap: new Float32Array(ni * nj * 2) });
    const clearAt = buf.clear, heapAt = buf.heap;
    clearAt.fill(0, 0, ni * nj); heapAt.fill(0, 0, ni * nj);
    stampHoles(holes, holes.length, i0, i1, j0, j1, ni, cw, ch, gx, gy, clearAt, heapAt, L3, L5, RW);
    // How deep a cell is in the fog: its distance from the nearest square of an open sector (`rects`, the 3 x 3 round this one). It
    // was a closure called for every cell of the view, destructuring each rect and boxing its result (the code review of 2026-10-03,
    // Chrome at the map's edge: 454 of 994 KB allocated a frame, 0.24 ms at 1512 px and 0.75 ms at 2560 for the depth alone). Now it
    // is worked inline with the very same arithmetic in the same order, so every depth is the same double to the last bit (1.12
    // million cells compared with the closure, none differing; the floats of a Math.sqrt(ex * ex + ey * ey) in its place differ on
    // 3 % of them): a rect's x gap depends on the column only and its y gap on the row only, so each is worked once per column and
    // once per row, not once per cell; and the distance is the longer gap alone where the other is 0, which is most cells (a hypot
    // of x and 0 is |x| exactly: checks/fog-stream.mjs holds it in this engine), so only the cells past a corner of a square pay for
    // a hypot (src/util.js hypot2: V8's own sum written out, as the fog's own fogHypot was from 2026-10-07; Math.hypot boxed its
    // arguments). tools/stream-identity.mjs fog
    // draws 200 camera positions along and across the edges and corners, and every glyph and canvas call comes out as before.
    const nr = rects.length;
    const exCol = buf.exCol && buf.exCol.length >= nr * ni ? buf.exCol : (buf.exCol = new Float64Array(Math.max(9, nr) * ni * 2));
    const eyRow = buf.eyRow ?? (buf.eyRow = new Float64Array(9));
    for (let k = 0; k < nr; k++) {
      const x0 = rects[k][0], x1 = rects[k][2];
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * cw - gx;
        exCol[k * ni + i - i0] = Math.max(x0 - x, 0, x - x1);
      }
    }
    // Painted as the rocks are (SX, 2026-10-03: «Он вот прям выглядит, что что-то он забиткрашился, что там эффекты друг на друга
    // наложились, прозрачностью ... какой-то заскейленный, какой-то огромный ... у нас сейчас астероиды по-другому покрашены.
    // Может, как-то их покраску просто применишь»): it was every cell a shade glyph of five strengths over square blocks of noise,
    // with solid blocks where it was thick and the heaps a denser glyph, translucent over one another. Now its front is one
    // thin outline in the rocks' box-drawing strokes (labs/graphics/world-art.js drawAsteroid, ROCK_EDGE), stepped where the
    // thickness crosses `front`, round the way the ship cuts too; past a black gap of a cell inside it, one step of shade, the
    // rocks' '░', where it is `shadeFrom` thick or more. The thickness is the same noise as before, in blocks half as large. The
    // outline and its gap went on 2026-10-07 (below): the stepped front is the shade's own edge.
    const fieldAt = buf.field && buf.field.length >= ni * nj ? buf.field : (buf.field = new Float32Array(ni * nj * 2));
    // The band (`this.fogBand`, the game's since 2026-10-04; off, the whole field, only for a check; SX, 2026-10-03, late: «туман надо придумать попроще, хотя анимация мне нравится,
    // может там можно не генерить полный туман ... после какого-то момента просто сделать пнг заливку ... а только края на необходимую
    // дальность нарисовать»). Past `cut` u from the open squares every cell is the shade, whatever the noise (its two blocks take at
    // most half of FOG_NOISE's weights off the depth's share, and the heaps only add), a cell clear of the outline every way: there the work of a cell
    // is skipped and its shade laid as rows of a baked tile (Renderer.glyphRow). The cells worked as before are, row by row, those
    // nearer than `cut` (the front, its outline and its moving shade) and those round the fog's puffs, two cells past each (the way
    // the ship cuts: a cleared cell changes its neighbours, no further). What is drawn is what the whole field would draw, cell for
    // cell; only the deep shade's letters come from the tile. Measured 2026-10-04 (chat R): the hull gets 441 u in at most, thrust
    // held at full speed into the rope, so its puffs stay in the first ~850 u, and the front's noise ends at ~437 u.
    const band = this.fogBand ? this.fogBandRows({ rects, holes, cw, ch, gx, gy, i0, i1, j0, j1, nj, buf }) : null;
    const workN = band?.count, work = band?.runs, RUNS = band?.stride ?? 0, DEEP = 2, NOISE_BIG = FOG_NOISE.big, NOISE_MID = FOG_NOISE.mid;
    // Each cell's level for the outline (`levAt`): 0 no fog, 1 the fog inside its front (its three contours deeper in went on
    // 2026-10-08: SX, «один контур только внешний»). A deep cell the band leaves unworked is FOG_LEVEL_DEEP: as deep as whatever is
    // round it (no line reaches it: the band works every cell near the front). Kept with a border of a cell of 0 all round (no fog past
    // the view), `ps` a row, so a cell's neighbours are read with no test: cell (i, j) at (j - j0 + 1) ps + i - i0 + 1.
    const ps = ni + 2;
    const levAt = buf.lev && buf.lev.length >= ps * (nj + 2) ? buf.lev : (buf.lev = new Uint8Array(ps * (nj + 2) * 2));
    levAt.fill(0, 0, ps * (nj + 2));
    // The sector square under each column, worked once a column (`at` asked once a row and a column, not once a cell: the same
    // answer; 2026-10-07, the smoke's cost pass).
    const colSq = buf.colSq && buf.colSq.length >= ni ? buf.colSq : (buf.colSq = new Int32Array(ni * 2));
    for (let i = i0; i <= i1; i++) colSq[i - i0] = sq((i + 0.5) * cw - gx, W);
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * ch - gy, row = sq(y, H), line = (j - j0) * ni, pl = (j - j0 + 1) * ps + 1 - i0;
      const ringRow = row < -1 || row > 1 ? null : ring[row + 1];
      for (let k = 0; k < nr; k++) eyRow[k] = Math.max(rects[k][1] - y, 0, y - rects[k][3]);
      if (band) { fieldAt.fill(DEEP, line, line + ni); levAt.fill(FOG_LEVEL_DEEP, pl + i0, pl + i0 + ni); }
      for (let run = 0, runs = band ? workN[j - j0] : 1; run < runs; run++) {
        const lo = band ? work[(j - j0) * RUNS + 2 * run] : i0, hi = band ? work[(j - j0) * RUNS + 2 * run + 1] : i1;
        for (let i = lo; i <= hi; i++) {
          const x = (i + 0.5) * cw - gx, cell = line + i - i0;
          fieldAt[cell] = -1; levAt[pl + i] = 0;
          const cs = colSq[i - i0];
          if ((ringRow !== null && cs >= -1 && cs <= 1 && ringRow[cs + 1]) || clearAt[cell]) continue;
          let depth = Infinity;
          for (let k = 0; k < nr; k++) {
            const ex = exCol[k * ni + i - i0], ey = eyRow[k];
            depth = Math.min(depth, ex === 0 ? ey : ey === 0 ? ex : hypot2(ex, ey));
          }
          if (depth < F.start) continue;
          const q = Math.min(1, (depth - F.start) / (F.full - F.start));
          // Square blocks of noise, a large and a middle size, sliding with the drift: the fog's body and its stepped front.
          const fx = x + gx + drift, fy = y + gy - drift * 0.4;
          const big = fogHash(Math.floor(fx / (cw * F.blocks[1])), Math.floor(fy / (ch * F.blocks[1] * 0.6)));
          const mid = fogHash(Math.floor(fx / (cw * F.blocks[0])) + 7919, Math.floor(fy / (ch * F.blocks[0] * 0.6)) - 104729);
          // The fog pushed aside heaps round the way through it: thicker there, so its shade runs up to the way's outline.
          // (the middle blocks at half their old say: at their full they threw small islands off the front)
          fieldAt[cell] = q + (big - 0.5) * NOISE_BIG + (mid - 0.5) * NOISE_MID + heapAt[cell];
          levAt[pl + i] = 1;
        }
      }
    }
    // A cell is fog when it is thick enough and has two of its four sides on fog, or is thin but has three (no lone squares off
    // the front and no lone holes in it, no strokes a cell thin: the outline in steps as a rock's). The way the ship cuts stays
    // open whatever is round it. (In the band a deep cell is thick and fog, as the whole field would have it.)
    // (A cell's four sides read straight from the field, the view's own edge counting as no fog: no closure called five times a cell.)
    const FRONT = F.front;
    const solidAt = buf.solid && buf.solid.length >= ni * nj ? buf.solid : (buf.solid = new Uint8Array(ni * nj * 2));
    for (let j = j0; j <= j1; j++) {
      if (band) solidAt.fill(1, (j - j0) * ni, (j - j0 + 1) * ni);
      for (let run = 0, runs = band ? workN[j - j0] : 1; run < runs; run++) {
        const lo = band ? work[(j - j0) * RUNS + 2 * run] : i0, hi = band ? work[(j - j0) * RUNS + 2 * run + 1] : i1;
        for (let i = lo; i <= hi; i++) {
          const cell = (j - j0) * ni + i - i0;
          const round = (i > i0 && fieldAt[cell - 1] >= FRONT) + (i < i1 && fieldAt[cell + 1] >= FRONT)
            + (j > j0 && fieldAt[cell - ni] >= FRONT) + (j < j1 && fieldAt[cell + ni] >= FRONT);
          solidAt[cell] = !clearAt[cell] && fieldAt[cell] > -1 && (fieldAt[cell] >= FRONT ? round >= 2 : round >= 3) ? 1 : 0;
          if (!solidAt[cell]) levAt[(j - j0 + 1) * ps + 1 + i - i0] = 0;
        }
      }
    }
    this.drawFogShade(r, levAt, band, i0, i1, j0, j1, ni, nj, cw, ch, gx, gy, buf);
  }

  // The fog's cells drawn (drawDeadEdges, its last pass): its outlines and its shade. A method of its own, the same sums in the same
  // order, so its glyphs are the same doubles to the last bit: inside drawDeadEdges the optimizing compiler had spent its inlining
  // budget before it reached `r.glyph` (V8, measured 2026-10-07), so each cell's x and y were boxed into two new numbers on the heap to
  // cross the call, about 100 KB of garbage a frame at the map's edge. Here the renderer's glyph is inlined and nothing is made. Only
  // typed arrays, whole numbers and a few doubles come in, once a frame.
  drawFogShade(r, levAt, band, i0, i1, j0, j1, ni, nj, cw, ch, gx, gy, buf) {
    // In the smoke's ink and strengths (CONFIG.smoke, the clouds' own: SX, 2026-10-04, «Сиреневый, как облака»).
    const F = CONFIG.sector.boundary.fog, ink = CONFIG.smoke.ink, shadeA = CONFIG.smoke.shade, edgeA = CONFIG.smoke.edge;
    const workN = band?.count, work = band?.runs, RUNS = band?.stride ?? 0, DEEP = FOG_LEVEL_DEEP;
    // The outline (SX, 2026-10-07, evening: «верни контур»; it went that morning, «контур у внешнего дыма тоже убери»), the front's
    // alone since 2026-10-08 (the three contours inside it went: «один контур только внешний, в глубине простая заливка»): where a
    // cell of the fog meets one that is not (drawDeadEdges `levAt`), the rocks' box-drawing strokes along their side
    // (labs/graphics/world-art.js drawAsteroid, ROCK_EDGE), and a cell of black inside them. The strokes meet at the corners where four cells meet, each corner one glyph of the strokes met
    // there, in the order the corners were first met. Typed arrays kept between frames (buf.edge, buf.edgeOrder).
    const corners = (ni + 2) * (nj + 2);
    if (!buf.edge || buf.edge.length < corners) { buf.edge = new Uint8Array(corners * 2); buf.edgeOrder = new Int32Array(corners * 2); }
    const edgeAt = buf.edge, edgeOrder = buf.edgeOrder, stride = ni + 2;   // a corner's index is its cell's in levAt (its top left)
    if (buf.edgeLeft) edgeAt.fill(0);             // a frame that failed half way left its corners
    buf.edgeLeft = true;
    let edges = 0;
    // Where a cell's centre and a corner stand on the screen: World.project's sum, worked here (no two objects a glyph).
    const camX = this.cam.x, camY = this.cam.y;
    for (let j = j0; j <= j1; j++) {
      // The deep runs between the worked ones: the shade laid as rows (Renderer.glyphRow, its tile baked on the game's canvas, so the
      // fog is one colour to its depths: SX, 2026-10-07, «сделай дым однородного цвета как скраю»).
      if (band) {
        for (let run = 0, runs = workN[j - j0], from = i0; run <= runs; run++) {
          const to = run < runs ? work[(j - j0) * RUNS + 2 * run] - 1 : i1;
          if (to >= from) {
            fogRow(r, F.shade.ch, r.cx + ((from + 0.5) * cw - gx - camX), r.cy + ((j + 0.5) * ch - gy - camY), to - from + 1, ink, shadeA);
          }
          if (run < runs) from = work[(j - j0) * RUNS + 2 * run + 1] + 1;
        }
      }
      const pl = (j - j0 + 1) * stride + 1 - i0, y = r.cy + ((j + 0.5) * ch - gy - camY);
      for (let run = 0, runs = band ? workN[j - j0] : 1; run < runs; run++) {
        const lo = band ? work[(j - j0) * RUNS + 2 * run] : i0, hi = band ? work[(j - j0) * RUNS + 2 * run + 1] : i1;
        // The worked cells' shade laid as rows too: `from` the first of the shaded cells running up to this one, or `none` (a cell's
        // index may be below 0: the grid is counted from the map's corner).
        const none = lo - 1;
        let from = none;
        for (let i = lo; i <= hi + 1; i++) {
          const p = pl + i, L = i <= hi ? levAt[p] : 0;
          if (L === 0) {
            if (from !== none) { fogRow(r, F.shade.ch, r.cx + ((from + 0.5) * cw - gx - camX), y, i - from, ink, shadeA); from = none; }
            continue;
          }
          // The strokes on its sides that meet a lower level (each side once: from its higher cell).
          const up = levAt[p - stride], down = levAt[p + stride], left = levAt[p - 1], right = levAt[p + 1], key = p;
          if (up !== DEEP && up < L) { edges = fogJoin(edgeAt, edgeOrder, edges, key, 2); edges = fogJoin(edgeAt, edgeOrder, edges, key + 1, 8); }
          if (down !== DEEP && down < L) { edges = fogJoin(edgeAt, edgeOrder, edges, key + stride, 2); edges = fogJoin(edgeAt, edgeOrder, edges, key + stride + 1, 8); }
          if (left !== DEEP && left < L) { edges = fogJoin(edgeAt, edgeOrder, edges, key, 4); edges = fogJoin(edgeAt, edgeOrder, edges, key + stride, 1); }
          if (right !== DEEP && right < L) { edges = fogJoin(edgeAt, edgeOrder, edges, key + 1, 4); edges = fogJoin(edgeAt, edgeOrder, edges, key + stride + 1, 1); }
          // The shade: a cell whose eight neighbours are all of its level, clear of every line.
          let gap = false;
          for (let q = p - stride - 1; q <= p + stride - 1 && !gap; q += stride) {
            for (let n = q; n <= q + 2; n++) if (levAt[n] !== L && levAt[n] !== DEEP) { gap = true; break; }
          }
          if (gap) {
            if (from !== none) { fogRow(r, F.shade.ch, r.cx + ((from + 0.5) * cw - gx - camX), y, i - from, ink, shadeA); from = none; }
            continue;
          }
          if (from === none) from = i;
        }
      }
    }
    // The outlines' corners: each where four cells meet, the strokes that meet there one box-drawing glyph.
    for (let e = 0; e < edges; e++) {
      const key = edgeOrder[e], bits = edgeAt[key];
      edgeAt[key] = 0;
      const i = (key % stride) - 1 + i0, j = Math.floor(key / stride) - 1 + j0;
      r.glyph(FOG_EDGE[bits] ?? '\u00b7', r.cx + (i * cw - gx - camX), r.cy + (j * ch - gy - camY), ink, edgeA);
    }
    buf.edgeLeft = false;
  }

  // The fog's band (drawDeadEdges with `fogBand`): for each row of cells in view, the runs of its columns worked cell by cell, apart
  // and in order, as (from, to) pairs in `runs`, `stride` a row, and how many in `count`; the rest of the row is deep. Worked: what is
  // nearer than `cut` to an open square (found from each square's distance to the row, no cell asked), two cells round each puff's
  // reach (as far as drawDeadEdges stamps it). (The rings the three contours inside the fog could lie in were worked too, until they
  // went on 2026-10-08.) A row of more runs than fit is worked whole. Nothing allocated after the first frame.
  fogBandRows({ rects, holes, cw, ch, gx, gy, i0, i1, j0, j1, nj, buf }) {
    const F = CONFIG.sector.boundary.fog, [L3, L5] = F.lobes, RW = F.rimWidth;
    // The most the noise takes off the depth's share; a cell this deep is the shade whatever the noise, and its neighbours fog.
    const low = (FOG_NOISE.big + FOG_NOISE.mid) / 2, span = F.full - F.start, diag = Math.hypot(cw, ch);
    const shadeAt = F.start + (F.shadeFrom + low) * span, thickAt = F.start + (F.front + low) * span;
    const cut = F.shadeFrom + low < 1 ? Math.max(shadeAt, thickAt + 2 * diag) + diag : Infinity;
    const MAX = 24, stride = 2 * MAX, PUFFS = 256, SPANS = 2 + 9 + PUFFS;
    let band = buf.band;
    if (!band || band.count.length < nj || band.lo.length < SPANS) {
      band = buf.band = { count: new Int32Array(nj * 2), runs: new Int32Array(nj * 2 * stride), stride, cut,
        box: new Int32Array(4 * PUFFS), lo: new Int32Array(SPANS), hi: new Int32Array(SPANS) };
    }
    band.cut = cut;
    const { count, runs, box, lo, hi } = band;
    let puffs = 0;
    for (const h of holes) {
      if (puffs === PUFFS) break;
      const out = h.r * (1 + L3 + L5) * (1 + RW);
      box[4 * puffs] = Math.floor((h.x - out + gx) / cw) - 2; box[4 * puffs + 1] = Math.ceil((h.x + out + gx) / cw) + 2;
      box[4 * puffs + 2] = Math.floor((h.y - out + gy) / ch) - 2; box[4 * puffs + 3] = Math.ceil((h.y + out + gy) / ch) + 2;
      puffs++;
    }
    const whole = puffs < holes.length || cut === Infinity;
    for (let j = j0; j <= j1; j++) {
      const row = j - j0, y = (j + 0.5) * ch - gy;
      // The view's own edge, in the margin past the screen, is worked too: the field leaves the shade off a cell there (its
      // neighbour out of view is not fog), and the band leaves it as the field does.
      let n = 2;
      lo[0] = hi[0] = i0; lo[1] = hi[1] = i1;
      if (!whole && j > j0 && j < j1) {
        for (let k = 0; k < rects.length; k++) {
          const R = rects[k], ey = Math.max(R[1] - y, 0, y - R[3]);
          if (ey >= cut) continue;
          const wx = Math.sqrt(cut * cut - ey * ey);
          const a = Math.max(i0, Math.floor((R[0] - wx + gx) / cw - 0.5) - 1), b = Math.min(i1, Math.ceil((R[2] + wx + gx) / cw - 0.5) + 1);
          if (b >= a) { lo[n] = a; hi[n] = b; n++; }
        }
        for (let p = 0; p < puffs; p++) {
          if (j < box[4 * p + 2] || j > box[4 * p + 3]) continue;
          const a = Math.max(i0, box[4 * p]), b = Math.min(i1, box[4 * p + 1]);
          if (b >= a) { lo[n] = a; hi[n] = b; n++; }
        }
      }
      // In order of their starts, then joined where they meet or touch.
      for (let k = 1; k < n; k++) {
        const a = lo[k], b = hi[k];
        let m = k - 1;
        while (m >= 0 && lo[m] > a) { lo[m + 1] = lo[m]; hi[m + 1] = hi[m]; m--; }
        lo[m + 1] = a; hi[m + 1] = b;
      }
      let out = 0;
      for (let k = 0; k < n; k++) {
        if (out && lo[k] <= runs[row * stride + 2 * out - 1] + 1) runs[row * stride + 2 * out - 1] = Math.max(runs[row * stride + 2 * out - 1], hi[k]);
        else if (out < MAX) { runs[row * stride + 2 * out] = lo[k]; runs[row * stride + 2 * out + 1] = hi[k]; out++; }
        else { out = -1; break; }
      }
      if (whole || out < 0 || j === j0 || j === j1) { runs[row * stride] = i0; runs[row * stride + 1] = i1; out = 1; }
      count[row] = out;
    }
    return band;
  }

  // There is no orbit line: SX (2026-09-30, "убери полоски орбит вокруг планет")
  // took the dotted ring away. The cushion above a planet's surface still pushes a
  // ship back out (stepOrbits, CONFIG.planet.orbit), unchanged and now unmarked.

  // A named planet says its name below its body, quietly (SX, 2026-09-30: every
  // planet has a name), clear of the rim it is drawn to. The ink is the planet's
  // own tint dimmed to the contrast the grey label it replaced had
  // (CONFIG.planet.label), so the name belongs to the planet, every name weighs the
  // same whatever the hue, and none is louder than the interface's text. A
  // neighbouring sector's planets say theirs too, in drawNeighbour, so a name does
  // not pop in at a seam.
  planetLabelInk(p) {
    const key = p.tint + '|' + CONFIG.planet.label.contrast;
    let ink = labelInks.get(key);
    if (!ink) { ink = dimToContrast(p.tint, CONFIG.planet.label.contrast); labelInks.set(key, ink); }
    return ink;
  }

  drawPlanetLabel(r, p, s) {
    if (!p.label) return;
    const { x, y } = this.planetLabelAt(r, p, s);
    const w = p.label.length * r.cellW;
    if (!r.onScreen(x + w / 2, y + r.cellH / 2, w / 2)) return;
    r.text(p.label, x, y, this.planetLabelInk(p), 1);
  }

  // Where a planet's name stands now (its top left on screen), going round the planet (CONFIG.planet.label):
  // the text's box is pushed out along its angle by half its width and height, so the side of it nearest
  // the planet is always `gap` rows off the rim, at the bottom as at the sides.
  planetLabelAt(r, p, s, t = this.time) {
    const L = CONFIG.planet.label;
    const seed = seedOf(p.label);
    const dir = seed % 2 ? 1 : -1;
    const a = Math.PI / 2 + ((seed % 628) / 100) + dir * (t / L.period) * TAU;
    const w = p.label.length * r.cellW, h = r.cellH;
    const ux = Math.cos(a), uy = Math.sin(a);
    const reach = p.rim + L.gap * r.cellH;
    const cx = s.x + ux * reach + (w / 2) * ux, cy = s.y + uy * reach + (h / 2) * uy;
    return { x: cx - w / 2, y: cy - h / 2, angle: a };
  }

  // The seams between sectors that exist, around this one: faint dashes with a
  // slow light running along them (SX, 2026-09-24: "minor, barely noticeable,
  // animated"), and the next sector's name beside a seam the ship is near.
  // Positions along a line are measured globally, so the light does not jump
  // when the ship crosses.
  drawSeams(r) {
    if (this.topology.mode !== PLANE) return;
    const C = CONFIG.sector.seam;
    const W = this.width, H = this.height, t = this.time;
    const m = r.margin;
    const left = this.cam.x - r.cx - m, right = this.cam.x + (r.width - r.cx) + m;
    const top = this.cam.y - r.cy - m, bottom = this.cam.y + (r.height - r.cy) + m;
    // A closed sector has no seam, only the dead edge's dots (drawDeadEdges).
    const ring = this.openRing();
    const at = (dx, dy) => ring[dy + 1][dx + 1];
    const light = (u) => C.alpha + C.pulse * (0.5 + 0.5 * Math.sin(u / C.wave - t * C.speed)) ** 3;
    for (let k = 0; k <= 1; k++) {
      for (let d = -1; d <= 1; d++) {
        // A vertical seam at x = kW between columns k-1 and k, in row d.
        if (at(k - 1, d) && at(k, d)) {
          const x = k * W;
          if (x >= left && x <= right) {
            const y0 = Math.max(d * H, top), y1 = Math.min((d + 1) * H, bottom);
            const step = r.cellH;
            for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
              const s = this.project(r, x, y);
              r.glyph('\u250a', s.x, s.y, C.color, light(y + this.sector.row * H));
            }
          }
        }
        // A horizontal seam at y = kH between rows k-1 and k, in column d.
        if (at(d, k - 1) && at(d, k)) {
          const y = k * H;
          if (y >= top && y <= bottom) {
            const x0 = Math.max(d * W, left), x1 = Math.min((d + 1) * W, right);
            const step = r.cellW;
            for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
              const s = this.project(r, x, y);
              r.glyph('\u2508', s.x, s.y, C.color, light(x + this.sector.col * W));
            }
          }
        }
      }
    }
    // The next sector's name, just across the nearest point of a close seam. Space
    // runs on behind the cockpit, so a seam can lie under the instruments; the name
    // is nudged into the safe view, off the strip and the cockpit, where it would
    // be drawn over an instrument with no backing (QA, 2026-09-30: 21 px above the helm).
    const ship = this.ship;
    const name = (label, x, y) => {
      const s = this.project(r, x, y);
      const half = (label.length * r.cellW) / 2;
      if (!r.onScreen(s.x, s.y, half)) return;
      const v = r.view;
      const sx = clamp(s.x, v.x + half + r.cellW * 2, Math.max(v.x + half + r.cellW * 2, v.x + v.w - half - r.cellW * 2));
      const sy = clamp(s.y, v.y + r.cellH * 2, Math.max(v.y + r.cellH * 2, v.y + v.h - r.cellH * 2));
      for (let i = 0; i < label.length; i++) {
        r.glyph(label[i], sx + (i - (label.length - 1) / 2) * r.cellW, sy, CONFIG.hud.color, 1);
      }
    };
    for (const n of this.neighbours) {
      if (n.dx && n.dy) continue;
      const gap = n.dx > 0 ? W - ship.x : n.dx < 0 ? ship.x : n.dy > 0 ? H - ship.y : ship.y;
      if (gap > C.labelRange) continue;
      const label = sectorTitle(n.sector);
      if (n.dx) {
        const x = n.dx > 0 ? W + r.cellW * (label.length / 2 + 2) : -r.cellW * (label.length / 2 + 2);
        name(label, x, clamp(ship.y, 0, H));
      } else {
        const y = n.dy > 0 ? H + r.cellH * 2 : -r.cellH * 2;
        name(label, clamp(ship.x, 0, W), y);
      }
    }
  }

  // A signal: a quiet dot with a pair of brackets breathing out from it, the
  // way a broadcast is drawn in the thin family. Presentation only.
  drawSignal(r, sx, sy, t, phase = 0) {
    const C = CONFIG.signal;
    const s = C.scale || 1;
    r.glyph('\u25e6', sx, sy, C.color, 1, s);
    for (let k = 0; k < 2; k++) {
      const f = ((t * C.rate + phase + k * 0.5) % 1);
      const gap = (0.9 + f * 2.2) * r.cellW * s;
      const alpha = 0.85 * (1 - f);
      r.glyph('(', sx - gap, sy, C.color, alpha, s);
      r.glyph(')', sx + gap, sy, C.color, alpha, s);
    }
  }

  // The friendly ships go where they like, past a closed border too (src/npcFleet.js; src/frontier.js): nothing of a closed
  // sector is drawn, so one that flies across the border fades into the fog over the fog's depth (CONFIG.sector.boundary.fog
  // `full`) instead of going out at the line, and one coming out of it fades in. Not hailed, not met: only seen going.
  drawFogTraffic(r, t) {
    if (this.topology.mode !== PLANE) return;
    const W = this.width, H = this.height, F = CONFIG.sector.boundary.fog, ring = this.openRing();
    let open = null;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const s = ring[dy + 1][dx + 1] ? null : neighbourOf(this.sector, dx, dy);
        if (!s || s.hidden) continue;
        // How far past the open sectors' squares a point is: the fog's own depth (drawDeadEdges).
        open ??= ring.flatMap((row, j) => row.map((o, i) => (o ? [(i - 1) * W, (j - 1) * H, i * W, j * H] : null))).filter(Boolean);
        for (const craft of this.fleet.in(s.id, t)) {
          const pose = craftPose(craft, t, W, H), x = pose.x + dx * W, y = pose.y + dy * H;
          const at = this.project(r, x, y);
          if (!r.onScreen(at.x, at.y, craftReach(r, craft))) continue;
          let depth = Infinity;
          for (const [x0, y0, x1, y1] of open) depth = Math.min(depth, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1)));
          const alpha = 1 - depth / F.full;
          if (alpha > 0.02) drawCraft(r, craft, at.x, at.y, pose.angle, alpha);
        }
      }
    }
  }

  // A neighbouring sector, drawn in place beyond the seam: its bodies, its
  // caches that can be opened, its signals, and any cargo
  // lost there. Only a picture: nothing over there acts on the ship until it
  // crosses (no body sits within reach of a seam today).
  drawNeighbour(r, n, t) {
    const b = this.sectorBodies(n.sector);
    const W = this.width, H = this.height;
    const at = (x, y) => this.project(r, x + n.ox, y + n.oy);
    for (const p of b.planets) {
      const s = this.projectBody(r, p.x + n.ox, p.y + n.oy);
      p.draw(r, s.x, s.y, t);
      this.drawPlanetLabel(r, p, s);
    }
    for (const h of b.holes) { const s = this.projectBody(r, h.x + n.ox, h.y + n.oy); h.draw(r, s.x, s.y, t); }
    for (const st of b.stations) { const s = at(st.x, st.y); st.draw(r, s.x, s.y); }
    // Its traffic too (the NPC ships, src/npcShips.js), so none pops in at the seam.
    for (const craft of this.trafficHere(n.sector.id, t)) {
      const pose = craftPose(craft, t, W, H), s = at(pose.x, pose.y);
      if (r.onScreen(s.x, s.y, craftReach(r, craft))) drawCraft(r, craft, s.x, s.y, pose.angle, underShip(this, r, craft, s.x, s.y, craftSize(r, craft)));
    }
    const cacheArt = sprite('cache-sealed');
    for (const def of availableIn(n.sector.id, this.ledger)) {
      const s = at(def.x * W, def.y * H);
      if (def.kind === 'paint') drawPaintTin(r, s.x, s.y, def.content, t);
      else if (cacheArt) drawSprite(r, cacheArt, t, s.x, s.y, { scale: CONFIG.cache.scale });
    }
    for (const def of lookFindsIn(n.sector.id, this.pilot.looks)) {
      const s = at(def.x * W, def.y * H);
      drawTin(r, s.x, s.y, lookTinInks(def.content), t);
    }
    for (const def of signalsIn(n.sector.id)) {
      if (this.ledger.heard.has(def.id)) continue;
      const s = at(def.x * W, def.y * H);
      this.drawSignal(r, s.x, s.y, t, (seedOf(def.id) % 97) / 97);
    }
    this.drawSigns(r, n.sector.id, n.ox, n.oy);
    for (const [contractId, rec] of this.ledger.stranded) {
      const art = rec.sectorId === n.sector.id ? containerArt(this, rec.job) : null;
      if (!art) continue;
      const s = at(rec.x, rec.y);
      drawSprite(r, art.model, t, s.x, s.y, { scale: art.scale, angle: (seedOf(contractId) % 628) / 100 + t * CONFIG.stranded.spin, inks: art.inks });
    }
    // Other pilots' cargo over there, too, while it lies untaken: its sending station's, as it is once in tow.
    for (const s of openStrangersIn(n.sector.id, this.ledger)) {
      const art = containerArt(this, s.contract);
      if (!art) break;
      const p = at(s.x * W, s.y * H);
      drawSprite(r, art.model, t, p.x, p.y, { scale: art.scale, angle: (seedOf(s.contract.id) % 628) / 100 + t * CONFIG.stranded.spin, inks: art.inks });
    }
  }

  // Where a point of the world is on the screen: the camera's way to it (Topology.dx and dy, so no {x, y} is made of it first) from the
  // screen's middle. A loop over many things asks the axes (projectX, projectY) and makes nothing; this makes the one object.
  projectX(r, x) { return r.cx + this.topology.dx(x, this.cam.x); }
  projectY(r, y) { return r.cy + this.topology.dy(y, this.cam.y); }
  project(r, x, y) {
    return { x: this.projectX(r, x), y: this.projectY(r, y) };
  }

  // The camera the sky is placed by: the global position, sector offset included, so the sky does not jump by a
  // sector's worth of parallax when the ship crosses. The dust in front (labs/graphics/depth.js) reads it too.
  skyCamera() {
    const gx = this.topology.mode === PLANE ? this.sector.col * this.width : 0;
    const gy = this.topology.mode === PLANE ? this.sector.row * this.height : 0;
    return { x: this.cam.x + gx, y: this.cam.y + gy };
  }

  // Where a planet or a black hole is drawn: its place, leaned by the mouse as a body behind the flight's plane
  // (CONFIG.depth.bodies). Its occluding disc, its name and its aliens go with it.
  projectBody(r, x, y) {
    const k = leanLook(CONFIG.depth?.bodies ?? 0, this.lean.layers);
    return { x: this.projectX(r, x) + this.lean.x * k, y: this.projectY(r, y) + this.lean.y * k };
  }

  // Where a chosen thing is drawn, for its marks and its menu: a planet's menu stands on its limb, so it leans with it.
  projectTarget(r, target) {
    return target?.id === PLANET_ID ? this.projectBody(r, target.x, target.y) : this.project(r, target.x, target.y);
  }

  // The signs of a sector, drawn in this sector's frame shifted by (ox, oy):
  // zero for this sector, one sector's width or height for a neighbour.
  drawSigns(r, sectorId, ox = 0, oy = 0) {
    const put = (ch, x, y, color, a = 1, ang = 0) => (ang ? r.glyphRot(ch, x, y, ang, color, a) : r.glyph(ch, x, y, color, a));
    for (const s of this.signsIn(sectorId)) {
      const p = this.project(r, s.x + ox, s.y + oy);
      if (!r.onScreen(p.x, p.y, Math.max(30 * r.cellW, glyphCount(signText(s)) * 20))) continue;
      drawSign(put, r, p.x, p.y, signText(s), s.author, CONFIG.sign, s.type, this.time);
    }
  }

  // What stands in front of the sky, in the order the lists give it: the discs of this sector's planets and holes as they are drawn, then the
  // neighbours', then the plate of every sign in view (a star behind its letters would sit among them). One list and its discs are the
  // module's, refilled each frame, and the starfield reads them at once: a frame made a list, a copy of each disc and a closure.
  skyOccluders(r) {
    SKY.length = 0; skyDiscs = 0;
    const k = leanLook(CONFIG.depth?.bodies ?? 0, this.lean.layers);
    for (const p of this.planets) skyDisc(this, r, k, p.x, p.y, p.radius);
    for (const h of this.holes) skyDisc(this, r, k, h.x, h.y, h.horizon);
    for (const n of this.neighbours) {
      const b = this.sectorBodies(n.sector);
      for (const p of b.planets) skyDisc(this, r, k, p.x + n.ox, p.y + n.oy, p.radius);
      for (const h of b.holes) skyDisc(this, r, k, h.x + n.ox, h.y + n.oy, h.horizon);
    }
    this.coverSigns(r, this.sector.id, 0, 0);
    for (const n of this.neighbours) this.coverSigns(r, n.sector.id, n.ox, n.oy);
    return SKY;
  }

  coverSigns(r, sectorId, ox, oy) {
    for (const s of this.signsIn(sectorId)) {
      const x = this.projectX(r, s.x + ox), y = this.projectY(r, s.y + oy);
      if (r.onScreen(x, y, Math.max(30 * r.cellW, glyphCount(signText(s)) * 20))) SKY.push(signCoverBox(r, x, y, signText(s), s.author, s.type));
    }
  }

  // Each part a section of the lab's H profiler (src/frameProfile.js `lap`: one flag's test while it is off).
  draw(r) {
    lap('stars');
    const t = this.time;
    const body = (x, y) => this.projectBody(r, x, y);
    const sky = this.skyCamera();
    this.starfield.draw(r, sky.x, sky.y, t, this.skyOccluders(r), this.lean);
    lap('fog');
    this.drawDeadEdges(r);
    lap('seams');
    this.drawSeams(r);
    lap('neighbours');
    for (const n of this.neighbours) this.drawNeighbour(r, n, t);

    lap('planets');
    for (const p of this.planets) {
      const s = body(p.x, p.y);
      p.draw(r, s.x, s.y, t);
      if (p.aliens) drawAliens(r, p, s.x, s.y, t);
      this.drawPlanetLabel(r, p, s);
    }
    lap('holes');
    for (const h of this.holes) {
      const s = body(h.x, h.y);
      h.draw(r, s.x, s.y, t);
    }
    lap('stations');
    for (const st of this.stations) {
      const s = this.project(r, st.x, st.y);
      st.draw(r, s.x, s.y);
    }
    // The smoke clouds (src/cloudDraw.js; the lab's ?clouds=), under the rocks and the ship.
    lap('clouds');
    drawClouds(this, r);
    lap('rocks');
    for (const a of this.asteroids) a.draw(r, this.projectX(r, a.x), this.projectY(r, a.y));

    // Caches float and turn (CONFIG.cache.float), drawn a little up or down of where they are.
    lap('finds');
    const cacheArt = sprite('cache-sealed'), bob = CONFIG.cache.float.bob;
    const float = (c) => Math.sin((t * TAU) / bob.period + c.bobPhase) * bob.amount;
    for (const c of this.caches) {
      const s = this.project(r, c.x, c.y);
      if (cacheArt) drawSprite(r, cacheArt, t, s.x, s.y + float(c), { scale: CONFIG.cache.scale, angle: c.angle });
      else r.glyph('\u25a3', s.x, s.y + float(c), CONFIG.cache.sparkColor, 1, 2);
    }

    for (const c of this.paintCaches) {
      const s = this.project(r, c.x, c.y);
      drawPaintTin(r, s.x, s.y + float(c), c.paint, t, 1, c.angle);
    }
    for (const c of this.lookCaches) {
      const s = this.project(r, c.x, c.y);
      drawTin(r, s.x, s.y + float(c), lookTinInks(c.def.content), t, 1, c.angle);
    }

    // Friendly traffic (src/traffic.js): each craft where the clock puts it. No name under it since 2026-10-16 (SX: «Имена NPC ... залезают
    // на их рисунок и на их речь залезают. Имена NPC пусть появляются только когда вот я нажал поздороваться»): a ship's name stands over
    // its words (labs/graphics/greeting.js, src/feedback.js drawHail).
    lap('ships');
    for (const craft of this.trafficHere(this.sector.id, t)) {
      const pose = craftPose(craft, t, this.width, this.height);
      const s = this.project(r, pose.x, pose.y);
      if (!r.onScreen(s.x, s.y, craftReach(r, craft))) continue;
      // Under the pointer it stays its size: the pointer shows its window instead (SX, 2026-10-04; labs/graphics/world-pointer.js).
      // Darker a moment while the ship is up over it in a jump (src/trick.js underShip).
      drawCraft(r, craft, s.x, s.y, pose.angle, underShip(this, r, craft, s.x, s.y, craftSize(r, craft)));
    }
    this.drawFogTraffic(r, t);

    // A pilot out of fuel (src/quests.js): a ship like the pilot's own, dark, turning slowly, its light blinking amber;
    // refuelled, it lights up and flies off along its nose, fading.
    this.drawDrifter(r, t);
    // The second round: a ship held by pirates, a wreck sparking (src/pester.js, src/wrecked.js).
    drawPestered(this, r);
    drawWreck(this, r, t);
    // A voice's recorder where it lies (src/chorus.js, COMMONS's chain).
    drawRecorderLying(this, r, t);
    drawSpecial(this, r, t);

    // A visitor out of O-08 (src/traffic.js), on its pass (its name over its words, as a friendly ship's).
    if (this.visitor) {
      const v = this.visitor, craft = v.craft, pose = visitorPose(v);
      const s = this.project(r, pose.x, pose.y);
      if (r.onScreen(s.x, s.y, craftReach(r, craft))) drawCraft(r, craft, s.x, s.y, pose.angle, underShip(this, r, craft, s.x, s.y, craftSize(r, craft)));
    }

    // Service droids (src/droids.js), upright over their bob, and what one sold on its way to the hull; under each, while the pilot
    // is near, what it serves (FUEL, REPAIR), as a friendly ship's name stands under it.
    lap('droids');
    for (const dr of this.droids) {
      const s = this.project(r, dr.x, dr.y);
      if (!r.onScreen(s.x, s.y, 120)) continue;
      drawDroid(passedOver(this, r, dr, s.x, s.y, dr.radius), dr, s.x, s.y, t);
      if (Math.hypot(dr.x - this.ship.x, dr.y - this.ship.y) < HAIL_REACH * 2.5) {
        const label = DROID_CAPTION[dr.kind], w = label.length * r.cellW;
        r.text(label, s.x - w / 2, s.y + droidFootprint(dr).model.height * r.cellH * CONFIG.droids.scale * 0.5 + r.cellH, CONFIG.hud.color, 0.9);
      }
    }
    drawServiceFx(r, this, t, (x, y) => this.project(r, x, y));

    // A lost container turns slowly where it came to rest. No tether: nothing
    // is towing it.
    lap('cargo');
    for (const c of this.lostCargo) {
      const s = this.project(r, c.x, c.y);
      const angle = c.spin + t * CONFIG.stranded.spin;
      const art = containerArt(this, c.stranger ? contractById(c.contractId) : this.ledger.job(c.contractId));
      if (art) drawSprite(r, art.model, t, s.x, s.y, { scale: art.scale, angle, inks: art.inks });
      else r.glyph(CONFIG.cargo.glyph, s.x, s.y, CONFIG.cargo.color, 1, 1.6);
    }

    lap('signs');
    const coinArt = sprite('credit');
    for (const sig of this.signals) {
      const s = this.project(r, sig.x, sig.y);
      this.drawSignal(r, s.x, s.y, t, (seedOf(sig.id) % 97) / 97);
    }

    this.drawSigns(r, this.sector.id);

    // Loose credits from broken rocks: smaller coins, fading at the end. Fuel lies loose as oil, drawn
    // all together through its field (src/oil.js), so drops that near each other run together on screen.
    lap('drops');
    const D = CONFIG.asteroid.drops;
    const oil = [];
    for (const d of this.drops) {
      if (d.kind === 'fuel') { oil.push(d); continue; }
      const s = this.project(r, d.x, d.y);
      const alpha = clamp((D.life - d.age) / D.fadeFrom, 0.2, 1);
      // A part of a pirate's hull, tumbling, in the repair ink (as a droid's parts are drawn, src/droids.js): it mends as they do.
      if (d.kind === 'part') { r.glyphRot(d.glyph, s.x, s.y, d.spin * (t + d.phase * 7), DROID_INKS.repair, alpha, 1.2); continue; }
      // A pirate's 5 CR coin (src/encounters.js dropPirateLoot) is the same coin, the same size (SX, 2026-10-09).
      if (coinArt) drawSprite(r, coinArt, t + d.phase, s.x, s.y, { scale: D.coinScale, alpha });
      else r.glyph('\u00a4', s.x, s.y, CONFIG.pickup.sparkColor, alpha, 1.2);
    }
    drawOil(r, oil, (x, y) => this.project(r, x, y), t);

    // Pirates, over the rocks and under the shots.
    lap('pirates');
    // The boss under its escort (src/boss.js; drawn by the page, labs/graphics/boss-art.js: a world without a page draws none), and the
    // NPC ships watching its fight from the smoke's edges (src/bossQuest.js), each in its own scheme.
    if (this.boss) this.drawBoss?.(r);
    for (const w of this.bossCrowd) {
      const s = this.project(r, w.x, w.y), craft = npcCraft(w.code);
      if (r.onScreen(s.x, s.y, craftReach(r, craft))) drawCraft(r, craft, s.x, s.y, w.angle);
    }
    drawPirateFields(this, r);
    for (const p of this.pirates) {
      const s = this.project(r, p.x, p.y);
      drawPirateCues(this, r, p, s);
      p.draw(r, s.x, s.y);
    }

    lap('shots');
    const bc = CONFIG.bullet;
    for (const b of this.bullets) {
      const s = this.project(r, b.x, b.y);
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const heading = Math.atan2(b.vy, b.vx);
      const alpha = clamp(b.life / bc.life + 0.4, bc.minAlpha, 1);
      // A pirate's shot is the same double stroke in its own colour, so the two
      // sides can be told apart at a glance.
      const color = b.owner === 'pirate' ? CONFIG.pirates.bullet.color : bc.color;
      r.glyphRot(bc.glyph, s.x, s.y, heading, color, alpha);
      // One cell behind the head, so the two strokes join into one bolt.
      const back = r.cellW * 0.95;
      r.glyphRot(bc.trailGlyph, s.x - (b.vx / speed) * back, s.y - (b.vy / speed) * back,
        heading, color, alpha * bc.trailAlpha);
    }

    lap('cargo');
    // Diving into a station's dock and rising with the hull (src/docking.js; the page's `cargoShade`, labs/graphics/world-art.js): as
    // faint as the hull is drawn, unseen while it is under the station.
    const cargoShade = this.cargo ? (this.cargoShade?.() ?? 1) : 0;
    if (this.cargo && cargoShade > 0.01) {
      const c = CONFIG.cargo;
      const size = towSize(this);
      const tow = this.cargo;
      const a = this.project(r, tow.x, tow.y);
      // Lifted after the hull in a jump (src/trick.js cargoHeight), toward the light and grown as the hull is (LIFT).
      const up = this.stunts?.trick ? liftOffset(cargoHeight(this), this.ship.radius) : null;
      if (up) { a.x += up.dx; a.y += up.dy; }
      const job = this.ledger.activeJob(), drawn = containerArt(this, job);
      const art = drawn?.model, scale = (drawn?.scale ?? c.spriteScale * size.scale) * (up ? up.grow : 1);
      // The container is drawn pointing up, like a hull, with its pull end on top; turned by
      // its heading (src/tow.js: toward the anchor while it pulls) plus a quarter turn.
      const ux = Math.cos(tow.angle), uy = Math.sin(tow.angle);
      const half = art ? halfHeight(r, art, scale) : 0;
      // A dotted tether from the container's pull end to the back of the DRAWN hull (it reaches
      // further back than the anchor): straight while it pulls, sagging to one side by what it
      // has to spare while slack, so a load running up on the hull is seen before it hits.
      const ship = this.project(r, this.ship.x, this.ship.y);
      if (this.ship.airborne) { const lift = liftOffset(this.ship.air, this.ship.radius); ship.x += lift.dx; ship.y += lift.dy; }
      const rear = this.ship.drawnRear();
      const from = { x: a.x + ux * half, y: a.y + uy * half };
      const to = { x: ship.x - Math.cos(this.ship.angle) * rear, y: ship.y - Math.sin(this.ship.angle) * rear };
      const at = anchorOf(this.ship);
      const spare = Math.max(0, tow.length - Math.hypot(tow.x - at.x, tow.y - at.y));
      const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
      const sag = Math.min(spare * 0.5, 36);
      const side = (ux * dy - uy * dx) >= 0 ? 1 : -1;
      const mx = (from.x + to.x) / 2 + (len > 1 ? (-dy / len) * sag * side : 0);
      const my = (from.y + to.y) / 2 + (len > 1 ? (dx / len) * sag * side : 0);
      const marks = clamp(Math.round(len / 18), 3, 8);
      for (let i = 1; i <= marks; i++) {
        const k = i / (marks + 1), q = 1 - k;
        r.glyph(c.tetherGlyph, q * q * from.x + 2 * q * k * mx + k * k * to.x, q * q * from.y + 2 * q * k * my + k * k * to.y, c.color, 0.9 * cargoShade);
      }
      if (art) drawSprite(r, art, t, a.x, a.y, { scale, angle: tow.angle + Math.PI / 2, alpha: cargoShade, inks: drawn.inks });
      else r.glyph(c.glyph, a.x, a.y, c.color, cargoShade, 1.6);
    }

    lap('sparks');
    this.particles.draw(r, (x, y) => this.project(r, x, y));

    lap('ship');
    const s = this.project(r, this.ship.x, this.ship.y);
    if (boarded(this)) drawFlownShip(this, r, s.x, s.y, t); else this.ship.draw(r, s.x, s.y);
    drawSuitcase(this, r);
    drawRecorderAboard(this, r, t);
    lap(null);
  }
}

// Puts the drawing's methods on `World` (src/world.js), as its own: not enumerable, as a class's methods are.

// A container in the hue of the station it was taken from (SX, 2026-10-15: «грузы ... должен быть оформлен в цветах. Этой станции. Чтобы
// разные по цвету грузы были»; then, 2026-10-16, after the destination's hue: «грузы должны быть в цвете откуда ты их забираешь это же по
// сути у нас задача одна станция просит отнести другой что-то»): the crate's body (its file's most used ink) drawn in the sending station's
// look's own light tone (`world.stationHue`, lent by the page: labs/graphics/world-art.js), its bands and marks as they are; a job towed, a
// lost one and a stranded one alike; a station without a look (HOME) or a world without the page's hue keeps the file's. One Map a hue.
const crateInks = new Map();
let crateBody = null;
// A job's container as drawn: its sending station's own cargo (SX's twelve of 2026-10-16, lent by the page as `world.cargoArt`,
// labs/graphics/cargo-art.js), built at its size and drawn at the sprites' scale; else the plain container, scaled by its size, its body
// in the sending station's light tone; null with neither (a world without its sprites).
function containerArt(world, job) {
  const own = job?.from ? world.cargoArt?.(job.from, cargoSize(job)) : null;
  if (own) return { model: own, scale: CONFIG.cargo.spriteScale, inks: null };
  const crate = sprite('cargo-container');
  return crate ? { model: crate, scale: CONFIG.cargo.spriteScale * cargoOf(job).scale, inks: cargoInks(world, crate, job?.from) } : null;
}
function cargoInks(world, crate, stationId) {
  const hue = stationId ? world.stationHue?.(stationId) : null;
  if (!hue || !crate) return null;
  if (crateBody === null) {
    const count = new Map();
    for (const c of crate.frames ? crate.frames[0] : crate.cells) count.set(c.color, (count.get(c.color) ?? 0) + 1);
    crateBody = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }
  let inks = crateInks.get(hue);
  if (!inks) { inks = new Map([[crateBody, hue]]); crateInks.set(hue, inks); }
  return inks;
}

export function addDrawing(World) {
  for (const name of Object.getOwnPropertyNames(WorldDrawing.prototype)) {
    if (name !== 'constructor') Object.defineProperty(World.prototype, name, Object.getOwnPropertyDescriptor(WorldDrawing.prototype, name));
  }
}
