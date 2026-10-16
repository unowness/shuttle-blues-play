// Each freight station's own cargo (SX, 2026-10-16: «у каждой станции должен быть груз своего внешнего вида ... уникальный груз у каждой
// станции был в стиле этой станции ... размеры растягиваются не скейлингом, а наращиванием»), the twelve he picked over three rounds on
// labs/graphics/sketches/station-cargo.html, station-cargo-round2.html and station-cargo-round3.html (his notes there, verbatim; the
// rounds' every proposal in labs/graphics/sketches/station-cargo-looks.js), brought in on his «пуляй впрод».
//
// A cargo is drawn as a sprite (src/sprites.js drawSprite): cells of a glyph and an ink, no alpha of their own, a few frames looped at
// `fps`; a cell may sit between columns or rows where whole cells cannot hold an even margin (SX: «одинаковый отступ слева и снизу»,
// measured in SF Mono, the font both browsers find here). Its three sizes are built, not scaled: the glyphs stay the game's size and the
// drawing gains cells (a belt of cabins, a fold, a cassette, a bed, a pair of pods, a bay, a row, a section, a belt, a cell, a capsule).
// It hangs from its eye at the top middle, where the tether pulls. Its inks are its station's: the hue's four tones (`stationLook(look)
// .tone`), the boards' MAT, STR, HI and DIM. The body the world gives it is CONFIG.cargo.bodies (src/config.js), held to these drawings
// by checks/cargo-art.mjs. A station with no design here (HOME) sends the plain container (sprites/cargo-container.json).

import { Layer, MAT, STR, HI, DIM, tint, dirGlyph, stationLook } from './station-art.js';
import { fbmWrapped, clamp } from '../../src/util.js';

const TAU = Math.PI * 2, A = 0.6;
export const CARGO_SIZES = ['small', 'medium', 'large'];
const MODULES = { small: 1, medium: 2, large: 3 };

// ---- helpers -------------------------------------------------------------------------------------------------------------------

// A noise offset that comes back to itself at the loop's end (fbmWrapped wraps every 12 along x).
const wrap = (f, F) => (f / F) * 12;
const nz = (x, y, seed, o = 0, fx = 0.5, fy = 0.7) => fbmWrapped(x * fx + o, y * fy, 12, seed, 3);
// The stations' fill without alpha: about half the cells stay empty, the densest a half-block, never a solid.
function tex(B, x, y, v, tone, peak = false) {
  if (v >= 0.64) B.put(x, y, peak ? '▒' : '░', peak ? tone.mid : tone.lit);
  else if (v >= 0.56) B.put(x, y, '░', tone.mid);
  else if (v >= 0.48) B.put(x, y, '·', tone.rim);
}
// The tether's eye: a stub over a top edge, the edge taking it as a joint.
function eye(B, x, y, ink) { B.edge(x, y + 1, 1, ink); B.edge(x, y, 4, MAT); }
const blink = (f, period, on = 2, phase = 0) => ((f + phase) % period + period) % period < on;
const isNode = (c) => '┼┬┴├┤┌┐└┘╳'.includes(c);
const near = (a, b) => Math.abs(((a - b) % TAU + TAU + Math.PI) % TAU - Math.PI);

// The rim of DRY DOCK's wheel by hand a size, round corners stepping out a cell or two a row, every stroke joined to the next.
const WHEEL_RIM = [
  [' ╭─────╮ ', '╭╯     ╰╮', '│       │', '╰╮     ╭╯', ' ╰─────╯ '],
  ['   ╭─────╮   ', ' ╭─╯     ╰─╮ ', '╭╯         ╰╮', '│           │', '╰╮         ╭╯', ' ╰─╮     ╭─╯ ', '   ╰─────╯   '],
  ['     ╭─────╮     ', '  ╭──╯     ╰──╮  ', ' ╭╯           ╰╮ ', '╭╯             ╰╮', '│               │', '╰╮             ╭╯', ' ╰╮           ╭╯ ',
    '  ╰──╮     ╭──╯  ', '     ╰─────╯     '],
];
const BAYS = [[1, 1], [1, 2], [2, 2]];
const COMB = [[2], [2, 1], [2, 1, 2]];
const REEL = ['◐', '◓', '◑', '◒'];
// SPOOL 8's mill in one row: its blade flat, leaning, edge on (nothing beside the hub: no upright line in the mill's row, SX: «вентиляторы
// оставляем без полосок»), leaning back.
const BLADE = ['─', '╲', null, '╱'];
const PLANT = ['♣', '✿', 'ψ'];
// SF Mono at the game's 15 px (cell 9.27 x 15): a frame's line is 0.56 px off its column's middle; '▪' reaches 2.91 px to its left and
// 3.48 px under its middle; '║' reaches 1.69 px to either side and 10.62 px under its middle (box strokes run past their row), a line's
// ink starts 0.22 px over its row's middle. So G03E's lamp, a row over the line under it, is 11.3 px clear of it, and stands 1.59 columns
// in to be as clear of the side; G10B's rods are 4.16 px clear of the lines over and under them, and stand 0.69 columns in to be as
// clear of the sides, the middle one on the middle column, three evenly.
const LAMP_IN = 1.59, ROD_IN = 0.69;

// ---- the twelve, by the look of the station that sends them ---------------------------------------------------------------------
// Each: { code, look, F (frames), fps, size(n) -> { W, H }, draw(B, n, f, tone) -> cells between the board's (optional) }, n the
// modules (1 small, 2 medium, 3 large).

const DESIGNS = [
  // G01A DRY DOCK, the wheel: a still hub, spokes turning, a belt of cabins turning with them, a port light stepping round the rim. A
  // size gains a belt: S 9 x 5, M 13 x 7, L 17 x 9.
  {
    code: 'G01A', look: 'wheel', F: 24, fps: 6,
    size: (n) => ({ W: 4 * (n + 1) + 1, H: 2 * (n + 1) + 2 }),
    draw(B, n, f, tone) {
      const R = n + 1, cx = (B.w - 1) / 2, cy = 1 + R, rim = WHEEL_RIM[n - 1], inside = [];
      rim.forEach((row, j) => {
        const y = 1 + j, chars = [...row], first = chars.findIndex((c) => c !== ' '), last = chars.length - 1 - [...chars].reverse().findIndex((c) => c !== ' ');
        chars.forEach((c, x) => { if (c !== ' ') B.put(x, y, c, tone.lit); });
        if (j > 0 && j < rim.length - 1) for (let x = first + 1; x < last; x++) if (chars[x] === ' ') inside.push([x, y]);
      });
      eye(B, cx, 0, tone.lit);
      const spin = (f / this.F) * TAU / 6, turn = (f / this.F) * TAU, lamp = (f / this.F) * TAU * 2;
      const spokeR = [1.55, 2.0, 2.6][n - 1], mid = (spokeR + R) / 2 + 0.2;
      for (const [x, y] of inside) {
        const dx = (x - cx) * A, dy = y - cy, r = Math.hypot(dx, dy), phi = Math.atan2(dy, dx);
        if (r < 0.5) { B.put(x, y, '◆', HI); continue; }
        if (r < spokeR) {
          let best = 9;
          for (let k = 0; k < 6; k++) best = Math.min(best, near(phi, spin + k * TAU / 6));
          if (best < 0.42) B.put(x, y, dirGlyph(Math.cos(phi), Math.sin(phi)), STR);
          continue;
        }
        if (Math.abs(r - mid) < 0.7 && near(phi, lamp) < 0.3) { B.put(x, y, '▪', HI); continue; }
        tex(B, x, y, fbmWrapped(((phi - turn) / TAU + 0.5) * 12, r * 0.9, 12, 55, 3) + 0.06, tone, true);
      }
    },
  },
  // G02C HOIST, the bellows: the station's corrugated tube between two cabins, the corrugation white (SX: «гофра сама белая»), breathing;
  // two walk the corridor. A size gains two folds.
  {
    code: 'G02C', look: 'spire', F: 24, fps: 8,
    size: (n) => ({ W: 7, H: 5 + 2 * n }),
    draw(B, n, f, tone) {
      const H = B.h, ph = Math.floor(f / 6) % 2;
      B.box(0, 1, 7, H - 1, tone.lit, true);
      eye(B, 3, 0, tone.lit);
      for (let y = 3; y <= H - 3; y++) {
        const odd = (y + ph) % 2;
        B.put(0, y, odd ? '╱' : '╲', HI); B.put(6, y, odd ? '╲' : '╱', HI);
        B.put(3, y, '·', DIM);
      }
      for (const [k, y] of [[0, 2], [1, H - 2]]) for (const [j, x] of [[0, 2], [1, 4]]) {
        const on = (Math.floor(f / 8) + k * 2 + j * 3 + x) % 3 !== 0;
        B.put(x, y, on ? '▪' : '·', on ? tone.lit : DIM);
      }
      const len = H - 5;
      for (const [rate, off] of [[1, 0], [1.5, 7]]) {
        const s = (f * rate + off) % (2 * len), i = Math.floor(s < len ? s : 2 * len - 1 - s);
        B.put(3, 3 + clamp(i, 0, len - 1), '•', tone.lit);
      }
    },
  },
  // G03E RELAY 12, the archive: a cassette a module, its two reels turning, the tape between; under the left reel the signal lamp, as
  // clear of the side as of the line under it (SX: «в левый нижний угол с одинаковыми отступами слева и снизу»); an even band of
  // hatching from under the tape to under the right reel; a muted dashed line between two cassettes. A size gains a cassette.
  {
    code: 'G03E', look: 'array', F: 16, fps: 6,
    size: (n) => ({ W: 9, H: 2 + 3 * n }),
    draw(B, n, f, tone) {
      const H = B.h, lamps = [];
      B.box(0, 1, 9, H - 1, tone.lit, true);
      for (let k = 1; k < n; k++) for (let x = 1; x <= 7; x++) B.put(x, 1 + 3 * k, '┄', tone.mid);
      eye(B, 4, 0, tone.lit);
      for (let k = 0; k < n; k++) {
        const ya = 2 + 3 * k, yb = ya + 1, r = REEL[(f + k) % 4], on = blink(f, 8, 2, k * 3);
        B.put(2, ya, r, tone.lit); B.put(6, ya, r, tone.lit);
        for (const x of [3, 4, 5]) B.put(x, ya, '─', tone.mid);
        for (const x of [4, 5, 6]) B.put(x, yb, '░', tone.mid);
        lamps.push({ x: LAMP_IN, y: yb, ch: '▪', ink: on ? HI : tone.mid });
      }
      return lamps;
    },
  },
  // G04C HALCYON, the glass box: beds of clover, flowers and sprouts on soil, a glint gliding across the glass, its frame white (SX: «лучше
  // белую»). A size gains a bed.
  {
    code: 'G04C', look: 'greenhouse', F: 24, fps: 8,
    size: (n) => ({ W: 9, H: 3 + 2 * n }),
    draw(B, n, f, tone) {
      const H = B.h;
      B.box(0, 1, 9, H - 1, HI, true);
      eye(B, 4, 0, HI);
      for (let k = 0; k < n; k++) {
        const yp = 2 + 2 * k, ys = yp + 1;
        for (const x of [2, 4, 6]) B.put(x, yp, PLANT[(k + x / 2) % 3], (f + x * 3) % 12 < 6 ? tone.lit : tone.mid);
        for (let x = 1; x <= 7; x++) {
          const v = nz(x, ys, 700 + k);
          if (v > 0.6) B.put(x, ys, '▒', tone.mid); else if (v > 0.46) B.put(x, ys, '░', tone.shadow); else B.put(x, ys, '·', tone.rim);
        }
      }
      const g = f - 3;
      for (let y = 2; y <= H - 2; y++) for (let x = 1; x <= 7; x++) if (x + y - 2 === g) B.put(x, y, '╱', HI);
    },
  },
  // G06C DEPOT 7, the pods on a rail: the yard's belt, pods in pairs either side of a spine, a light running down from pod to pod; no
  // thrusters under it (SX: «снизу не надо хвосты»). A size gains a pair.
  {
    code: 'G06C', look: 'depot', F: 24, fps: 8,
    size: (n) => ({ W: 9, H: 3 + 2 * n }),
    draw(B, n, f, tone) {
      B.box(0, 1, 9, 2 * n + 2, tone.lit, true);
      eye(B, 4, 0, tone.lit);
      const lit = Math.floor(f / 2) % (2 * n + 2);
      for (let k = 0; k < n; k++) {
        const yp = 2 + 2 * k, yb = yp + 1;
        for (const [s, x0] of [[0, 1], [1, 5]]) {
          const on = lit === 2 * k + s;
          B.put(x0, yp, '[', MAT); B.put(x0 + 1, yp, '▪', on ? HI : tone.mid); B.put(x0 + 2, yp, ']', MAT);
        }
        for (let x = 1; x <= 7; x += 2) if (x !== 4) B.put(x, yb, '·', DIM);
        B.put(4, yp, '║', MAT); B.put(4, yb, '║', MAT);
      }
    },
  },
  // G07A FOUNDRY 2, the crucible: the melt breathing inside, a wave of heat running down the radiator's fins either side. A size gains
  // two rows of melt.
  {
    code: 'G07A', look: 'foundry', F: 24, fps: 8,
    size: (n) => ({ W: 9, H: 3 + 2 * n }),
    draw(B, n, f, tone) {
      const H = B.h, u = f / this.F, p = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(u * TAU));
      const rim = tint(tone.mid, tone.lit, p);
      B.box(1, 1, 7, H - 1, rim, true);
      eye(B, 4, 0, rim);
      const wave = u * (H + 2) - 1;
      for (let y = 2; y <= H - 2; y++) {
        const heat = clamp(p * (0.4 + 0.8 * Math.max(0, 1 - Math.abs(y - 1 - wave) / 2)), 0, 1), ink = tint(tone.shadow, tone.lit, 0.35 + 0.65 * heat);
        B.edge(1, y, 8, rim); B.put(0, y, '─', ink);
        B.edge(7, y, 2, rim); B.put(8, y, '─', ink);
        for (let x = 2; x <= 6; x++) {
          const g = p * (0.5 + 0.8 * (fbmWrapped(x * 0.8 + wrap(f, this.F), y * 0.9, 12, 17, 2) - 0.45));
          if (g > 0.85) B.put(x, y, '▒', tone.lit); else if (g > 0.66) B.put(x, y, '░', tone.lit);
          else if (g > 0.48) B.put(x, y, '░', tone.mid); else if (g > 0.3) B.put(x, y, '·', tone.mid);
        }
      }
    },
  },
  // G08A YARD 3, the truss: posts and crossed bays, a wave of light running down it from the eye, joint by joint. A size gains a bay: one,
  // two down, then a square of four.
  {
    code: 'G08A', look: 'lattice', F: 24, fps: 10,
    size: (n) => { const [c, r] = BAYS[n - 1]; return { W: 1 + 4 * c, H: 2 + 4 * r }; },
    draw(B, n, f, tone) {
      const [c, r] = BAYS[n - 1], W = B.w, H = B.h, cx = (W - 1) / 2;
      for (let i = 0; i <= c; i++) B.vline(4 * i, 1, H - 1, tone.lit);
      for (let j = 0; j <= r; j++) B.hline(0, W - 1, 1 + 4 * j, tone.lit);
      for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) {
        const x0 = 4 * i + 1, y0 = 2 + 4 * j;
        [[0, 0, '╲'], [2, 0, '╱'], [1, 1, '╳'], [0, 2, '╱'], [2, 2, '╲']].forEach(([dx, dy, g]) => B.put(x0 + dx, y0 + dy, g, tone.mid));
      }
      eye(B, cx, 0, tone.lit);
      const front = (f / this.F) * (H + 8) - 2;
      for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
        const ch = B.at(x, y);
        if (ch === null) continue;
        const d = y + Math.abs(x - cx) * 0.3, i = front >= d ? Math.max(0, 1 - (front - d) / 3.2) : 0;
        if (i < 0.1) continue;
        if (isNode(ch) && i > 0.72) B.put(x, y, '◆', HI); else B.put(x, y, ch, tint(B.ink[B.index(x, y)], HI, i * 0.8));
      }
    },
  },
  // G09B COMMONS, the parcel: bread in paper tied with string, a light running down the string as round the ring. A size gains a row.
  {
    code: 'G09B', look: 'ring', F: 16, fps: 8,
    size: (n) => ({ W: 9, H: 2 + 3 * n }),
    draw(B, n, f, tone) {
      const H = B.h;
      B.box(0, 1, 9, H - 1, tone.lit, true);
      B.vline(4, 1, H - 1, STR);
      for (let k = 1; k < n; k++) B.hline(0, 8, 1 + 3 * k, STR);
      eye(B, 4, 0, STR);
      for (let k = 0; k < n; k++) for (const [j, y] of [[0, 2 + 3 * k], [1, 3 + 3 * k]]) for (const x0 of [1, 5]) {
        B.put(x0, y, '(', tone.mid); B.put(x0 + 2, y, ')', tone.mid);
        B.put(x0 + 1, y, j === 0 ? '▒' : '░', j === 0 ? tone.lit : tone.mid);
      }
      B.put(4, 1 + (f % (H - 1)), '•', HI);
    },
  },
  // G10B SPOOL 8, the rods: fuel rods in a cassette, a glow running down them, the station's mill turning over them. Each section's rods
  // stop clear of the lines over and under them, as clear of the sides (SX: «полоски, чтобы не торчали до вентиляторов ... низ был
  // оформлен так же, как и верх ... одинаковый отступ слева и снизу»); the mill's row has none. A size gains a section.
  {
    code: 'G10B', look: 'spindle', F: 16, fps: 8,
    size: (n) => ({ W: 7, H: 4 + 3 * n }),
    draw(B, n, f, tone) {
      const H = B.h, rods = [];
      B.box(0, 1, 7, H - 1, tone.lit, true);
      eye(B, 3, 0, tone.lit);
      const blade = BLADE[f % 4];
      B.put(3, 2, '◦', HI);
      if (blade) { B.put(2, 2, blade, tone.lit); B.put(4, 2, blade, tone.lit); }
      for (let k = 0; k < n; k++) {
        const ys = 3 + 3 * k;
        B.hline(0, 6, ys, tone.lit);
        for (const y of [ys + 1, ys + 2]) for (const x of [ROD_IN, 3, 6 - ROD_IN]) {
          const g = 0.5 + 0.5 * Math.cos((y - 4) * 0.9 - (f / this.F) * TAU + x * 0.2);
          rods.push({ x, y, ch: '║', ink: g > 0.85 ? tint(tone.lit, HI, 0.5) : tint(tone.mid, tone.lit, g) });
        }
      }
      return rods;
    },
  },
  // G11E PHAROS, the turning lens: bullseyes in their rings passing along its belts as it turns; the belts from edge to edge, one line
  // between two (SX: «палки ... по бокам ... не надо и секции раздели равномерно»). A size gains a belt.
  {
    code: 'G11E', look: 'beacon', F: 24, fps: 8,
    size: (n) => ({ W: 9, H: 2 * n + 2 }),
    draw(B, n, f, tone) {
      const bot = B.h - 1, x1 = 8, cx = 4, spin = (f / this.F) * TAU / 4;
      for (let x = 0; x <= x1; x++) {
        B.put(x, 1, x === 0 ? '╱' : x === x1 ? '╲' : '─', tone.lit);
        B.put(x, bot, x === 0 ? '╲' : x === x1 ? '╱' : '─', tone.lit);
      }
      eye(B, cx, 0, tone.lit);
      for (let y = 2; y < bot; y++) { B.put(0, y, '│', tone.lit); B.put(x1, y, '│', tone.lit); }
      for (let j = 0; j < 2 * n - 1; j++) {
        const y = 2 + j;
        if (j % 2) {
          for (let x = 1; x < x1; x++) { const u = (x - cx) / 4, lit = Math.sqrt(Math.max(0, 1 - u * u)) * (0.8 - 0.3 * u); B.put(x, y, '─', tint(STR, tone.lit, lit * 0.8)); }
          continue;
        }
        const k = j / 2;
        for (let x = 1; x < x1; x++) if ((x + k) % 2 === 0) B.put(x, y, '·', tone.rim);
        for (let q = 0; q < 4; q++) {
          const a = spin + q * TAU / 4 + k * 0.7, c = Math.cos(a);
          if (c < 0.15) continue;
          const x = Math.round(cx + Math.sin(a) * 3.4);
          if (c > 0.75) { B.put(x - 1, y, '(', tone.mid); B.put(x + 1, y, ')', tone.mid); }
          B.put(x, y, c > 0.94 ? '◆' : '◇', c > 0.94 ? HI : tone.lit);
        }
      }
    },
  },
  // G12C APIARY, the comb: round cells packed wall to wall, each breathing honey on its own beat, a drone flying between them. A size
  // gains cells: 2, 3, 5.
  {
    code: 'G12C', look: 'hive', F: 30, fps: 8,
    size: (n) => ({ W: 9, H: 2 + 2 * COMB[n - 1].length }),
    draw(B, n, f, tone) {
      const cells = [];
      COMB[n - 1].forEach((count, r) => (count === 2 ? [0, 4] : [2]).forEach((x0) => cells.push({ x0, y0: 1 + 2 * r })));
      cells.forEach(({ x0, y0 }) => B.box(x0, y0, 5, 3, tone.lit, true));
      eye(B, 4, 0, tone.lit);
      const u = f / this.F;
      cells.forEach(({ x0, y0 }, i) => {
        const act = 0.5 + 0.5 * Math.sin(u * TAU + i * 1.9), y = y0 + 1;
        for (let x = x0 + 1; x <= x0 + 3; x++) {
          const v = nz(x, y, 100 + i * 13, wrap(f, this.F) * 0.4, 0.9, 0.9) + (act - 0.5) * 0.3 + 0.08;
          if (v > 0.62) B.put(x, y, act > 0.7 ? '▒' : '░', tone.lit); else if (v > 0.5) B.put(x, y, '░', tone.mid); else B.put(x, y, '·', tone.rim);
        }
        if (act > 0.85) B.put(x0 + 2, y, '◇', HI);
      });
      const tour = cells.map((c) => [c.x0 + 2, c.y0 + 1]);
      if (tour.length > 1) {
        const s = u * tour.length, i = Math.floor(s), k = s - i, a = tour[i % tour.length], b = tour[(i + 1) % tour.length];
        const e = k * k * (3 - 2 * k);
        B.put(Math.round(a[0] + (b[0] - a[0]) * e), Math.round(a[1] + (b[1] - a[1]) * e), '•', HI);
      }
    },
  },
  // G13A WHARF 9, the capsules: water capsules off the station's davit on one chain, the lower lagging and swinging, the water sloshing
  // against the swing, a glint on the glass. A size gains a capsule.
  {
    code: 'G13A', look: 'anchor', F: 24, fps: 8,
    size: (n) => ({ W: 9, H: 4 * n }),
    draw(B, n, f, tone) {
      const ph = (f / this.F) * TAU, at = [];
      for (let k = 0; k < n; k++) at.push(4 + (k === 0 ? 0 : Math.round(Math.sin(ph - k * 0.7) * Math.min(1, k * 0.6))));
      for (let k = 0; k < n; k++) {
        const cx = at[k], y0 = 4 * k, lean = Math.sin(ph - k * 0.7 - 0.9);
        B.put(cx, y0, 'o', MAT);
        B.box(cx - 3, y0 + 1, 7, 3, STR, true);
        B.edge(cx, y0 + 1, 1, STR);
        if (k < n - 1) B.edge(cx, y0 + 3, 4, STR);
        for (let i = -2; i <= 2; i++) B.put(cx + i, y0 + 2, i * lean > 0.4 ? '~' : '≈', i * lean > 0.4 ? tone.mid : tone.lit);
        if (blink(f, 24, 4, k * 7)) B.put(cx + 2, y0 + 2, '╱', HI);
      }
    },
  },
];

export const CARGO_DESIGNS = Object.freeze(Object.fromEntries(DESIGNS.map((d) => [d.look, d])));

// ---- a design made into the sprite drawSprite draws ------------------------------------------------------------------------------

// Every frame of one size: `{ frames: [[{ x, y, ch, color }]], fps, cols, rows }`, its cells about its pivot (src/sprites.js): across, the
// board's middle column, where every design has its eye (a swinging part never pulls the tether off it); down, the middle of frame 0's
// drawn rows. `cols` and `rows` are its drawn extent in cells.
export function buildCargo(design, size, tone) {
  const n = MODULES[size], { W, H } = design.size(n), frames = [];
  for (let f = 0; f < design.F; f++) {
    const B = new Layer(W, H), between = design.draw(B, n, f, tone) || [], cells = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, ch = B.ch[i];
      if (ch !== null && ch !== ' ') cells.push({ x, y, ch, color: B.ink[i] });
    }
    for (const c of between) cells.push({ x: c.x, y: c.y, ch: c.ch, color: c.ink });
    frames.push(cells);
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of frames[0]) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
  const px = (W - 1) / 2, py = (y0 + y1) / 2;
  return {
    code: design.code, fps: design.fps, cols: x1 - x0 + 1, rows: y1 - y0 + 1,
    frames: frames.map((cells) => cells.map((c) => ({ ...c, x: c.x - px, y: c.y - py }))),
  };
}

// A station look's cargo of one size, built once in the look's own tones; null for a look with none (the plain container then).
const built = new Map();
export function cargoArt(look, size) {
  const design = CARGO_DESIGNS[look];
  if (!design || !MODULES[size]) return null;
  const key = look + ':' + size;
  if (!built.has(key)) built.set(key, buildCargo(design, size, stationLook(look).tone));
  return built.get(key);
}
