// The radio's lamps played as pictures (SX, 2026-10-21: «проработать вот анимацию вот этих лампочек, чтобы она была прям интересная,
// типа предупреждение перед тем, как пираты прилетели. Черепок на них, когда ты разрушился. Можно абстрактные анимации, но как бы супер
// много разных хочется»). His picks of labs/graphics/sketches/radio-lamps.html, one a moment: «A1 X3 I3 V2 Q2 F4 M3 D1 B2 W1 K3 Z2 L1 R2 T2 ·
// лампа 2 px», and his rule over all of them: «все было ... с равными отступами ... либо как бы не оставаться свободной полосы, либо оставаться
// сверху и снизу по одной ... чтобы равномерно было». Every picture here stands centred on the grid of holes: the whole height, or the
// same rows free above and below, the same columns free left and right (the grid's 17 columns are odd: a split leaves the middle one out).
//
// The MODERN radio (radio.js drawRadioModern) plays them on its holes as on a grid of lamps (radio.js lampGrid), a lit lamp the hole's own
// 2 px. Each show is { code, ink, paint(g, u, I), over, lamp(u, I), still }: the lamps lit `u` s into its moment with what the radio was
// told (`I`); `over` lit over holes a wreck knocked dark; `lamp` the round lamp's { ink, k } (none: the moment's ink, glowing and going out
// with it; a call's and a quest's keep the radio's own); `still` the moment shown standing for reduced motion (none: nothing played).
import { PALETTE } from '../../src/palette.js';
import { clamp, noise3 } from '../../src/util.js';

const RED = PALETTE.red, AMBER = PALETTE.amber, GREEN = PALETTE.green, WHITE = PALETTE.white, BLUE = PALETTE.blue,
  PURPLE = PALETTE.purple, ORANGE = PALETTE.orange;
const COLOURS = [RED, AMBER, GREEN, BLUE, PURPLE, ORANGE, WHITE];

const hash = (a, b = 0, c = 0) => noise3(a, b, c);
const wrap = (v, n) => ((v % n) + n) % n;
const ease = (u) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };
const blink = (u, hz, duty = 0.5) => (wrap(u * hz, 1) < duty ? 1 : 0);
const mid = (g) => ({ x: (g.nx - 1) / 2, y: (g.ny - 1) / 2 });
const dot = (g, x, y, k, ink) => g.put(Math.round(x), Math.round(y), k, ink);
const all = (g, k, ink) => { for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) g.put(i, j, k, ink); };
// A picture of rows of '#' with its top left at (x, y).
function stamp(g, rows, x, y, k, ink) {
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') g.put(x + i, y + j, k, ink); });
}
// Rows `h` high stood in the middle of the grid's height: the same rows free above and below (the grid's six take a picture of six or four).
const topFor = (g, h) => Math.floor((g.ny - h) / 2);
const leftFor = (g, w) => Math.floor((g.nx - w) / 2);

// The skull, seven by six: the grid's whole height.
const SKULL = ['.#####.', '#######', '#..#..#', '###.###', '.#####.', '.#.#.#.'];
// The figures, three holes wide and six high (the grid's whole height), and the plus with its bar two rows thick to stand in the middle.
const FIGURES = Object.fromEntries(Object.entries({
  0: '###/#.#/#.#/#.#/#.#/###', 1: '.#./##./.#./.#./.#./###', 2: '###/..#/..#/###/#../###', 3: '###/..#/.##/..#/..#/###',
  4: '#.#/#.#/#.#/###/..#/..#', 5: '###/#../###/..#/..#/###', 6: '###/#../###/#.#/#.#/###', 7: '###/..#/..#/.#./.#./.#.',
  8: '###/#.#/###/#.#/#.#/###', 9: '###/#.#/#.#/###/..#/###', '+': '.../.#./###/###/.#./...',
}).map(([ch, rows]) => [ch, rows.split('/')]));
const FIGURE_H = 6;
const widthOf = (text) => Math.max(0, Array.from(text).length * 4 - 1);
function write(g, text, x, y, k, ink) {
  Array.from(text).forEach((ch, n) => { if (FIGURES[ch]) stamp(g, FIGURES[ch], x + n * 4, y, k, ink); });
}
// The heart of a wide sum: run right to left across the lamps, `speed` holes a second, from off the right edge.
function marquee(g, text, u, k, ink, speed = 10) {
  const span = g.nx + widthOf(text) + 2;
  write(g, text, Math.round(g.nx - wrap(u * speed, span)), topFor(g, FIGURE_H), k, ink);
}

// How long each moment plays (s) and how it ranks: a higher one heard cuts in, a lower one waits behind it (radio.js hear). The call's,
// the line's and a quest's are the radio's own (radio.js RADIO_MOMENTS); `life` Infinity: as long as what it says lasts (the warning
// till the pirates are in view and `tail` after, at most `most`; the wreck till the ship is back, at most `most` where no MODERN radio
// is drawn to see it back).
export const SHOW_TIMES = Object.freeze({
  wreck: Object.freeze({ life: Infinity, rank: 4, most: 30 }),
  warn: Object.freeze({ life: Infinity, rank: 3, tail: 0.9, most: 8 }),
  boss: Object.freeze({ life: 4.4, rank: 2 }),
  find: Object.freeze({ life: 2.4, rank: 1 }),
  pay: Object.freeze({ life: 2.2, rank: 1 }),
  dock: Object.freeze({ life: 2, rank: 1 }),
  undock: Object.freeze({ life: 1.8, rank: 1 }),
  clear: Object.freeze({ life: 2, rank: 1 }),
  big: Object.freeze({ life: 3.4, rank: 1 }),
  hole: Object.freeze({ life: 2.2, rank: 1 }),
  fuel: Object.freeze({ life: 3.2, rank: 1 }),
  raid: Object.freeze({ life: 3.4, rank: 1 }),
});

// The events each moment is (src/events.js), with what it tells the radio. Money once paid (`alreadySettled` pays nothing); a sum is
// the pay and the fee a job's delivery carries.
const paid = (e) => (e.alreadySettled ? null : { amount: Math.round((e.reward ?? e.pay ?? 0) + (e.fee ?? 0)) });
export const SHOW_EVENTS = Object.freeze({
  shipWrecked: (e) => (e.cause === 'reset' ? null : ['wreck', {}]),
  piratesEngaged: (e) => ['warn', { count: e.count, bearing: e.bearing, distance: e.distance }],
  bossWoke: () => ['boss', {}], bossSpawned: () => ['boss', {}],
  cacheOpened: (e) => (e.alreadySettled ? null : ['find', {}]), paintFound: (e) => (e.alreadySettled ? null : ['find', {}]),
  lookFound: () => ['find', {}], cursorFound: () => ['find', {}],
  docked: () => ['dock', { out: false }], undocked: () => ['undock', { out: true }],
  encounterEnded: (e) => (e.cause === 'cleared' ? ['clear', {}] : null),
  stationRestored: () => ['big', {}], sectorOpened: () => ['big', {}], networkComplete: () => ['big', {}],
  holeTransit: () => ['hole', {}],
  fuelLow: () => ['fuel', {}], fuelEmpty: () => ['fuel', {}],
  raidStarted: () => ['raid', {}],
  ...Object.fromEntries(['delivered', 'guidePaid', 'drifterHelped', 'pesterFreed', 'suitcaseDelivered', 'specialDone', 'raidWon',
    'chorusVoiceBack', 'chorusDone'].map((type) => [type, (e) => { const I = paid(e); return I && I.amount > 0 ? ['pay', I] : null; }])),
});

// ------------------------------------------------------------------------------------------------ the shows

export const SHOWS = Object.freeze({
  // A1 SIREN: the halves red by turns (the middle column between them), quicker the nearer they are; in view, the whole grid flashes.
  warn: { code: 'A1', ink: RED,
    lamp: (u, I) => ({ ink: RED, k: blink(u, 3 + 4 * (1 - I.share)) }),
    still: { u: 0.2, I: { share: 0.5, arrived: -1 } },
    paint(g, u, I) {
      if (I.arrived >= 0) { all(g, Math.max(0, 1 - I.arrived / SHOW_TIMES.warn.tail) * blink(I.arrived, 8), RED); return; }
      const side = Math.floor(u * (3 + 3 * (1 - I.share))) % 2, half = g.nx / 2, middle = g.nx % 2 ? Math.floor(half) : -1;
      for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
        if (i === middle) continue;
        g.put(i, j, (i < half) === (side === 0) ? 1 : 0.06, RED);
      }
    } },
  // X3 SCANLINE: the skull shown by a scan line from the top down, then torn by its rows now and then; over the wreck's dark holes.
  wreck: { code: 'X3', ink: RED, over: true, lamp: () => null,   // the lamp dead, as the wreck leaves it (radio.js DEAD)
    still: { u: 3, I: {} },
    paint(g, u) {
      const x0 = leftFor(g, 7), y0 = topFor(g, SKULL.length), scan = u * 4, row = Math.floor(scan);
      SKULL.forEach((line, j) => {
        if (j > scan) return;
        const tick = Math.floor(u * 5), tear = u > 2 && hash(j, tick, 3) < 0.25 ? Math.round((hash(j, tick, 4) - 0.5) * 6) : 0;
        stamp(g, [line], x0 + tear, y0 + j, j === row ? 1 : 0.8, j === row ? WHITE : RED);
      });
      if (scan < g.ny) for (let i = 0; i < g.nx; i++) g.put(i, y0 + row, 0.3, WHITE);
    } },
  // I3 RAIN: silence, a sparse dim rain falling down the columns.
  rest: { code: 'I3', ink: GREEN, lamp: () => null,
    paint(g, u) {
      for (let i = 0; i < g.nx; i++) {
        const v = 1.6 + 2 * hash(i, 1), P = g.ny + 5 + Math.floor(8 * hash(i, 2)), head = Math.floor(wrap(u * v + 20 * hash(i, 3), P) - 2);
        for (let t = 0; t < 3; t++) g.put(i, head - t, [0.6, 0.3, 0.12][t], t ? GREEN : WHITE);
      }
    } },
  // V2 EQUALIZER: a call's voice as bars from the middle row up and down, taller in the middle.
  call: { code: 'V2', ink: AMBER, keepLamp: true,
    paint(g, u, I) {
      const c = mid(g), tick = Math.floor(u * 14);
      for (let i = 0; i < g.nx; i++) {
        const h = I.voice * (0.35 + 0.65 * hash(i, tick, 2)) * (1 - 0.6 * Math.abs(i - c.x) / c.x) * (c.y + 1);
        for (let j = 0; j < g.ny; j++) if (Math.abs(j - c.y) <= h) g.put(i, j, 0.9, AMBER);
      }
    } },
  // Q2 FILL: a quest come, a block falling in from above to stand in the middle (a row free above and below); handed in, a bar filling
  // from the left; failed, the grid crumbling down. In the quest's ink.
  quest: { code: 'Q2', keepLamp: true,
    still: { u: 1, I: null },
    paint(g, u, I) {
      if (I.kind === 'come') {
        const h = g.ny - 2, w = 5, x0 = leftFor(g, w), y = Math.min(topFor(g, h), Math.round(-h + u * 14));
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.put(x0 + i, y + j, u > 1.2 ? blink(u, 4) : 1, I.ink);
      } else if (I.kind === 'done') {
        const x = u * 18;
        for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (i <= x) g.put(i, j, x > g.nx + 4 ? 0.5 + 0.5 * blink(u, 5) : i > x - 1.5 ? 1 : 0.6, I.ink);
      } else {
        for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
          const drop = Math.max(0, u - 0.3 - 0.6 * hash(i, j, 4)) * 10;
          if (j + drop < g.ny) dot(g, i, j + drop, 0.9, I.ink);
        }
      }
    } },
  // F4 GEM: diamonds running out of the middle, their colours changing.
  find: { code: 'F4', ink: AMBER,
    paint(g, u) {
      const c = mid(g);
      for (let w = 0; w < 4; w++) {
        const r = wrap(u * 7 - w * 3, 12);
        for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
          const d = Math.abs(i - c.x) * 0.6 + Math.abs(j - c.y);
          if (Math.abs(d - r) < 0.6) g.put(i, j, Math.max(0, 1 - r / 12), COLOURS[w % 4]);
        }
      }
    } },
  // M3 AMOUNT: the sum in figures the grid's whole height, rising into place; one too wide for the grid runs across it.
  pay: { code: 'M3', ink: AMBER,
    lamp: (u) => ({ ink: AMBER, k: Math.max(0, 1 - u / SHOW_TIMES.pay.life) }),
    still: { u: 1, I: null },
    paint(g, u, I) {
      const text = `+${I.amount}`, w = widthOf(text), k = u > 1.6 ? Math.max(0, 1 - (u - 1.6) / 0.6) : 1;
      if (w <= g.nx) write(g, text, leftFor(g, w), topFor(g, FIGURE_H) + Math.round(Math.max(0, 1 - u / 0.25) * 4), k, AMBER);
      else marquee(g, text, u, 1, AMBER);
    } },
  // D1 CLAMPS: two halves sliding in from the ends and locking in the middle; undocked, parting.
  dock: { code: 'D1', ink: GREEN,
    paint(g, u, I) {
      const c = mid(g), shut = I.out ? 1 - ease(u / 0.8) : ease(u / 0.8), w = shut * (c.x + 0.5), click = !I.out && u > 0.8 && u < 1.1;
      for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (i < w || g.nx - 1 - i < w) g.put(i, j, click ? 1 : 0.55, click ? WHITE : GREEN);
    } },
  // B2 HITS: the fight's embers, dim red here and there; each blow to the hull a flash of noise.
  fight: { code: 'B2', ink: RED,
    lamp: (u, I) => ({ ink: RED, k: I.since < 0.5 ? 1 - I.since / 0.5 : 0 }),
    paint(g, u, I) {
      const tick = Math.floor(u * 15);
      for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
        const h = hash(i, j * 13 + tick, 29);
        if (I.since < 0.5 && h < 0.8 * (1 - I.since / 0.5)) g.put(i, j, 1, h < 0.2 ? WHITE : RED);
        else if (hash(i, j, Math.floor(u * 2)) < 0.12) g.put(i, j, 0.25, RED);
      }
    } },
  // W1 ALL CLEAR: the last pirate down, a green wave from the left out to the right.
  clear: { code: 'W1', ink: GREEN,
    paint(g, u) {
      const x = u * 14 - 2;
      for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const d = x - i; if (d > 0) g.put(i, j, Math.max(0, 1 - d / 6), d < 1 ? WHITE : GREEN); }
    } },
  // K3 FLAG: a restoration, a sector opened: a green flag waving.
  big: { code: 'K3', ink: GREEN,
    paint(g, u) {
      const out = u > 2.6 ? 1 - (u - 2.6) / 0.8 : 1;
      for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
        const w = Math.sin(i * 0.55 - u * 5 + j * 0.2);
        g.put(i, j, (0.35 + 0.45 * (0.5 + 0.5 * w)) * Math.min(1, u * 2) * out, w > 0.75 ? WHITE : GREEN);
      }
    } },
  // Z2 WARP: through a hole, stars drawn out from the middle as a jump.
  hole: { code: 'Z2', ink: BLUE,
    paint(g, u) {
      const c = mid(g);
      for (let n = 0; n < 14; n++) {
        const a = hash(n, 1) * 2 * Math.PI, t = wrap(u * 1.6 + hash(n, 2), 1), r = t * t * 1.2;
        for (let s = 0; s < 3; s++) dot(g, c.x + Math.cos(a) * (r - s * 0.08 * t) * c.x * 1.4, c.y + Math.sin(a) * (r - s * 0.08 * t) * c.y * 1.4, (1 - s / 3) * t, s ? BLUE : WHITE);
      }
    } },
  // L1 DRAIN: fuel low, the orange running out from both ends to the middle columns, which blink.
  fuel: { code: 'L1', ink: ORANGE,
    lamp: (u) => ({ ink: ORANGE, k: blink(u, 2) }),
    paint(g, u) {
      const c = mid(g), left = Math.max(1, (1 - 0.88 * ease(u / 1.2)) * (c.x + 0.5)), k = u > 1.2 ? 0.1 + 0.9 * blink(u, 2) : 0.7;
      for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (Math.abs(i - c.x) < left) g.put(i, j, k, ORANGE);
    } },
  // R2 SOS: a ruin raided somewhere, the whole grid blinking S O S in amber.
  raid: { code: 'R2', ink: AMBER,
    paint(g, u) {
      const code = [1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0];
      all(g, code[Math.floor(u * 9) % code.length] ? 0.9 : 0.05, AMBER);
    } },
  // T2 JAWS: the boss awake, jaws of teeth biting.
  boss: { code: 'T2', ink: RED,
    paint(g, u) {
      const bite = Math.round(Math.max(0, Math.sin(u * 4)) * (g.ny / 2 - 1.2));
      for (let i = 0; i < g.nx; i++) {
        const fang = i % 2 === 0, topTo = bite + (fang ? 1 : 0), botFrom = g.ny - 1 - bite - (fang ? 0 : 1);
        for (let j = 0; j <= topTo; j++) g.put(i, j, 0.9, j === topTo ? WHITE : RED);
        for (let j = botFrom; j < g.ny; j++) g.put(i, j, 0.9, j === botFrom ? WHITE : RED);
      }
    } },
});
// The moments the quest's show plays (the radio's come, done and fail), and the dock's two.
export const SHOW_OF = Object.freeze({ come: 'quest', done: 'quest', fail: 'quest', undock: 'dock' });
