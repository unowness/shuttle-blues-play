// Interface looks: colour schemes for the game's interface, to be collected (SX, 2026-10-02). Round four, after SX
// tuned round three: «Четыре типа. Now, Sunset, Spawn и Tyrell ... сейчас они просто как хуе ... искажают цвет ...
// наибольшее влияние должно происходить просто на интерфейс. Но настроение и color grading табличек, что все равно
// красные остаются около красными, зеленые около зелеными ... И цвета корабля ... тоже должны как-то оставаться, просто
// чуть-чуть обрабатываться ... нужно какое-то умное распределение».
//
// So a look reaches the game in three layers, each to its own degree:
//
//   1. the interface (chrome): the deep shadow, the structure, secondary and primary text, and everything near them.
//      The look's palette gives their final inks; SX's sliders reach them whole, the hue's turn too;
//   2. the signals: the route, caution, danger, the brake, the credits, and everything near them, the plates' tints
//      among it. The look may move their inks only within their families (red about red, green about green: 25°
//      either way at most); its mood (the atmosphere its palette has) and SX's sliders reach them at SIGNALS, the
//      hue's turn at an eighth of that;
//   3. the art: the ship paints (outright), souvenirs, planets, whatever is near no role. Never repainted; the mood and
//      the sliders reach them at ART, the hue's turn at a tenth of that.
//
// An ink's share of each layer comes from its closeness to the roles (Shepard weights in OKLab, a "stay" weight for
// belonging to none), so a colour between layers takes a blend, and nothing jumps.
//
// All of it in a log working space, as colourists grade (below, "the working space"): NOW is a look like the others,
// and the base under every look is LOG. A look is a function of one ink, like src/grade.js, so it can stand in for the
// grade's transform as it is (installGrade stays).
//
// labs/graphics/sketches/film-grade.html is the editor: the game running in it, the looks, the sliders, the export.

import { gradeHex, oklch, fromLch } from './grade.js';
import { SPAWN_FOLDS } from './lookFolds.js';
import { PAINT_INKS } from './paint.js';
import { PALETTE, ROLES } from './roles.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const RAD = Math.PI / 180;

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toCode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const hexOf = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function linToLab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// sRGB HEX to OKLab.
export const lab = (hex) => linToLab(parse(hex).map(toLinear));

// OKLab to linear sRGB, unclamped, so the gamut can be tested.
function labToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

// OKLab to HEX: lightness and hue kept, chroma given up until the colour fits sRGB.
function toHex(L, a, b) {
  L = clamp(L, 0, 1);
  let rgb = labToLinear(L, a, b);
  if (!inGamut(rgb)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 18; i++) {
      const k = (lo + hi) / 2;
      if (inGamut(labToLinear(L, a * k, b * k))) lo = k; else hi = k;
    }
    rgb = labToLinear(L, a * lo, b * lo);
  }
  return hexOf(rgb.map((v) => toCode(clamp(v, 0, 1))));
}

// The roles a look repaints: the game's palette (src/roles.js) and the credits' two inks, in two layers: the
// interface itself (chrome) and the signals.
export const ROLE_INKS = Object.freeze({
  depth: { ink: PALETTE.depth, layer: 'chrome', says: 'the deep shadow, empty tiles' },
  structure: { ink: PALETTE.blue, layer: 'chrome', says: 'the cockpit, the locator, far stars' },
  secondary: { ink: PALETTE.gray, layer: 'chrome', says: 'secondary text, materials' },
  primary: { ink: PALETTE.white, layer: 'chrome', says: 'primary text, focus' },
  route: { ink: PALETTE.green, layer: 'signal', says: 'the route, interaction, the drive, the plate' },
  caution: { ink: PALETTE.orange, layer: 'signal', says: 'caution, pirate guns' },
  danger: { ink: PALETTE.red, layer: 'signal', says: 'danger' },
  brake: { ink: PALETTE.amber, layer: 'signal', says: 'the brake, the route closing' },
  credits: { ink: ROLES.credits, layer: 'signal', says: 'the amount' },
  creditsLabel: { ink: ROLES.creditsLabel, layer: 'signal', says: 'CR' },
});

// How far a role's pull reaches: past `STAY` a colour belongs to no role and mostly keeps its own (a ship's paint, a
// planet, a souvenir: their own hues, not the interface's); `POWER` is how sharply the nearest role wins. Distance is
// OKLab with lightness counted at `BY_LIGHT`, so a dimmed or darker version of a role's ink (the hint and quiet greys,
// a plate's tint) is still that role and follows it whole.
const STAY = 0.06, POWER = 3, BY_LIGHT = 0.35;

// ------------------------------------------------------------ the working space ---
// The interface is graded the way a colourist grades log footage (SX, 2026-10-02: «создай интерфейсу по технологии
// лог ... как у фото перед цветокоррекцией. Или RAW ... чтобы я фильтры уже мог на них настраивать ... Более чисто»;
// «научись, как это правильно делать»). The ACES grading standard, in four steps:
//
//   1. in: the ink as written (sRGB) to linear light, to the AP1 primaries, to ACEScct, the log encoding colourists
//      grade in (logarithmic above 0.0078125 linear, a straight toe below it, like Cineon film scans);
//   2. the look (an LMT): the palette of roles, or NOW, today's grade, which is a look like the others;
//   3. SX's sliders, the primaries, where a colourist does them: in the log, EXPOSURE in stops (an offset), WARMTH
//      in printer points along blue-amber, CONTRAST a scale about 18 % grey; then in linear light SATURATION about
//      each colour's own luminance (which stays); HUE a turn in OKLab at the end, keeping lightness and chroma;
//   4. out: the exact inverse of step 1, so a look with its sliders at rest gives exactly its palette.
//
// LOG is the working encoding shown as it is, without step 4: flat, the whites grey, the colour faint, everything
// still there. STRENGTH runs from it (0 %) to the finished look (100 %), as a LUT's opacity over log footage.
// Sources: the ACEScct specification (docs.acescentral.com/encodings/acescct), ACES LMTs (acescentral.com).

const M_709_AP1 = [[0.6130974024, 0.3395231462, 0.0473794514], [0.0701937225, 0.9163538791, 0.0134523985], [0.0206155929, 0.1095697729, 0.8698146342]];
function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}
const M_AP1_709 = invert3(M_709_AP1);
const mul = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const AP1_Y = [0.2722287168, 0.6740817658, 0.0536895174];
const cctEncode = (v) => (v <= 0.0078125 ? 10.5402377416545 * v + 0.0729055341958355 : (Math.log2(v) + 9.72) / 17.52);
const cctDecode = (c) => (c <= 0.155251141552511 ? (c - 0.0729055341958355) / 10.5402377416545 : 2 ** (c * 17.52 - 9.72));
const PIVOT = 0.4135884;            // 18 % grey in ACEScct
const STOP = 1 / 17.52;             // one stop of exposure in ACEScct
const POINT = 0.025 * Math.log2(10) * STOP;   // one printer point: 0.025 log exposure

// Step 1 and step 4 (step 4 by way of OKLab, so a colour outside sRGB gives up chroma, never lightness or hue).
export const toLog = (hex) => mul(M_709_AP1, parse(hex).map(toLinear)).map(cctEncode);
const fromLogLab = (cct) => linToLab(mul(M_AP1_709, cct.map(cctDecode)));
// LOG, the working encoding seen as it is.
export function logView(hex) {
  const h0 = hex.toUpperCase();
  return h0 === '#000000' ? h0 : hexOf(toLog(h0).map((v) => clamp(v, 0, 1)));
}

// SX's sliders over a look: the grade (exposure to hue), and SIGNALS and ART, how much of the grade and of the look's
// mood the second and third layers take (the interface takes all of the grade; its palette is already the mood).
export const TUNE = Object.freeze({
  strength: { label: 'STRENGTH', min: 0, max: 150, step: 5, start: 100, unit: ' %', says: 'how much of the look over the raw LOG; 0 is LOG' },
  light: { label: 'EXPOSURE', min: -2, max: 2, step: 0.1, start: 0, unit: ' EV', says: 'stops of light' },
  warmth: { label: 'WARMTH', min: -8, max: 8, step: 0.5, start: 0, unit: ' PT', says: 'printer points: below 0 colder, above warmer' },
  contrast: { label: 'CONTRAST', min: -10, max: 10, step: 1, start: 0, unit: '', says: 'spread from 18 % grey, or drawn to it' },
  saturation: { label: 'SATURATION', min: 0, max: 200, step: 5, start: 100, unit: ' %', says: 'how much colour, each ink keeping its brightness' },
  hue: { label: 'HUE', min: -180, max: 180, step: 5, start: 0, unit: '°', says: 'turns the interface; the signals an eighth as far, the art hardly' },
  signals: { label: 'SIGNALS', min: 0, max: 100, step: 5, start: 60, unit: ' %', says: 'how much of the mood and the grade the plates and signals take' },
  art: { label: 'ART', min: 0, max: 100, step: 5, start: 30, unit: ' %', says: 'how much of the mood and the grade the ship paints, souvenirs and planets take' },
});
export const TUNE_START = Object.freeze(Object.fromEntries(Object.entries(TUNE).map(([k, t]) => [k, t.start])));

const PAINTS = new Set([...PAINT_INKS].map((ink) => ink.toUpperCase()));
// How far a signal's ink may turn from the hue it has today, in degrees: red stays about red, green about green.
const SIGNAL_TURN = 25;

const lchOfLab = ([L, a, b]) => [L, Math.hypot(a, b), (Math.atan2(b, a) / RAD + 360) % 360];
const labOfLch = (L, C, H) => [L, C * Math.cos(H * RAD), C * Math.sin(H * RAD)];
// A signal's ink as the look asks for it, its hue held within SIGNAL_TURN of today's.
function inFamily(source, wanted) {
  const [, , h0] = lchOfLab(lab(source));
  const [L, C, h] = lchOfLab(lab(wanted));
  const d = ((h - h0 + 540) % 360) - 180;
  return toHex(...labOfLch(L, C, h0 + clamp(d, -SIGNAL_TURN, SIGNAL_TURN)));
}

// The look's first step for one ink, in the log, and which layers the ink belongs to. NOW moves every ink to today's
// grade; a palette moves every role to its ink and the colours near a role along with it (the warp: weighted in OKLab,
// moved in the log). The layers come from the same weights: how much of an ink's pull is the interface's roles, how
// much the signals', and how much belongs to no role (the art; a ship paint is art outright).
function lookOf(look) {
  const anchors = [{ at: [0, 0, 0], layer: 'chrome', move: [0, 0, 0] }];
  const roles = new Map();
  for (const [role, { ink, layer }] of Object.entries(ROLE_INKS)) {
    const target = look?.palette ? (layer === 'signal' ? inFamily(ink, look.palette[role] ?? ink) : look.palette[role] ?? ink) : gradeHex(ink);
    const from = toLog(ink), to = toLog(target);
    anchors.push({ at: lab(ink), layer, move: to.map((v, i) => v - from[i]) });
    roles.set(ink.toUpperCase(), { to, layer });
  }
  const rest = (1 / STAY) ** POWER;
  return (hex) => {
    const role = roles.get(hex);
    if (role) return { cct: role.to, chrome: role.layer === 'chrome' ? 1 : 0, signal: role.layer === 'signal' ? 1 : 0, art: 0 };
    // Anything not a role starts from today's grade, so the art is what it is today until the grade reaches it.
    const base = toLog(gradeHex(hex));
    if (PAINTS.has(hex)) return { cct: base, chrome: 0, signal: 0, art: 1 };
    const c = lab(hex);
    let sw = rest, chrome = 0, signal = 0, m0 = 0, m1 = 0, m2 = 0;
    for (const { at, layer, move } of anchors) {
      const d = Math.hypot((c[0] - at[0]) * BY_LIGHT, c[1] - at[1], c[2] - at[2]);
      const w = 1 / Math.max(d, 1e-6) ** POWER;
      sw += w;
      if (layer === 'chrome') chrome += w; else signal += w;
      if (look?.palette) { m0 += w * move[0]; m1 += w * move[1]; m2 += w * move[2]; }
    }
    return { cct: [base[0] + m0 / sw, base[1] + m1 / sw, base[2] + m2 / sw], chrome: chrome / sw, signal: signal / sw, art: rest / sw };
  };
}

// A look's function, with SX's sliders on it, and the look's tidying over it when it has one (`tidy`, below).
export function makeLook(look, tune) {
  const base = lookBody(look, tune);
  return look?.tidy ? tidied(base, look.tidy) : base;
}

function lookBody(look, tune) {
  const t = { ...TUNE_START, ...(look?.tune || {}), ...(tune || {}) };
  const m = { light: 0, warmth: 0, contrast: 0, saturation: 100, hue: 0, ...(look?.mood || {}) };
  const toSignals = t.signals / 100, toArt = t.art / 100, strength = t.strength / 100;
  const first = lookOf(look);
  const cache = new Map();

  // `kept` inks (the notices, the quests, the pointers, the pilot's ship: film-grade-keep.js) are art whatever their
  // colour: today's grade, and only ART of the mood and the sliders.
  function full(hex, kept = false) {
    const { cct, chrome, signal, art } = kept ? { cct: toLog(gradeHex(hex)), chrome: 0, signal: 0, art: 1 } : first(hex);
    // How much of SX's grade this ink takes (k), how much of the look's mood (km), and of the hue's turn (kh).
    const km = signal * toSignals + art * toArt, k = chrome + km;
    const kh = chrome + signal * toSignals * 0.125 + art * toArt * 0.1;
    let c = cct;
    const ev = (t.light * k + m.light * km) * STOP, pt = (t.warmth * k + m.warmth * km) * POINT;
    if (ev || pt) c = c.map((v, i) => v + ev + pt * [0.5, 0.15, -0.5][i]);
    const spread = 1 + (t.contrast * k + m.contrast * km) * 0.04;
    if (spread !== 1) c = c.map((v) => PIVOT + (v - PIVOT) * spread);
    let lin = mul(M_AP1_709, c.map(cctDecode));
    const sat = (1 + (t.saturation / 100 - 1) * k) * (1 + (m.saturation / 100 - 1) * km);
    if (sat !== 1) {
      const ap1 = mul(M_709_AP1, lin), y = AP1_Y[0] * ap1[0] + AP1_Y[1] * ap1[1] + AP1_Y[2] * ap1[2];
      lin = mul(M_AP1_709, ap1.map((v) => y + sat * (v - y)));
    }
    let [L, a, b] = linToLab(lin.map((v) => Math.max(0, v)));
    const th = (t.hue * kh + m.hue * km * 0.125) * RAD;
    if (th) [a, b] = [a * Math.cos(th) - b * Math.sin(th), a * Math.sin(th) + b * Math.cos(th)];
    return toHex(L, a, b);
  }

  const keptCache = new Map();
  function ink(hex, kept) {
    const h0 = hex.toUpperCase();
    if (h0 === '#000000') return h0;
    const store = kept ? keptCache : cache;
    let out = store.get(h0);
    if (out) return out;
    out = full(h0, kept);
    if (strength !== 1) {
      // From the raw LOG to the look, ink by ink; past 100 % it runs further the same way.
      const from = lab(logView(h0)), to = lab(out);
      out = toHex(...from.map((v, i) => v + strength * (to[i] - v)));
    }
    if (store.size > 4096) store.clear();
    store.set(h0, out);
    return out;
  }
  const apply = (hex) => ink(hex, false);
  apply.keep = (hex) => ink(hex, true);
  return apply;
}

// A look tidied (SX, 2026-10-17, T4 on labs/graphics/sketches/spawn-tidy.html: «одну гамму ... прибранную, чтобы не было ненужных
// повторений ... не была прям супер яркая ... сами окна остаются черными ... с белыми рамками и серыми оттенками ... Если это серый
// оттенок с какой-то долей цвета из now, то просто сделай эту долю цвета из спауна»; «Вносим T4 в игру как новый SPAWN»), over what the
// look paints:
//
//   folds    { target: [written colours] }: each written colour painted as its target (src/lookFolds.js: near twins, one thing one ink);
//   greys    a look's code: an ink the look paints as a gray (under GREY_C of chroma) takes that look's lightness and share of colour, in
//            this look's hue: as quiet and as legible as there, tinted as here. The ship paints' own inks are left as they are;
//   kept     'interface': the kept layer (the plates, the notices, the quest list, the pointers, the pilot's ship and its picture) is
//            painted as the interface, so one role is one ink on the screen; the ship paints' own inks stay art;
//   frames   the windows' grays (src/frames.js, drawn as they are): which is drawn as which (`dash: 'rule'`, or `frame: <ink>` painted
//            by the look), and with `frameHue` their own small share of colour turned to this look's gray's hue.
//
// The roles' inks are the interface's even where a paint shares one (#D6DCE3 is the primary text and an EVA-02 ink).
export const GREY_C = 0.035;
const ROLE_SET = new Set([...Object.values(PALETTE), ...Object.values(ROLES)].filter((v) => typeof v === 'string' && v.startsWith('#')).map((h) => h.toUpperCase()));
const ART = new Set([...PAINTS].filter((h) => !ROLE_SET.has(h)));
function tidied(base, { folds = null, greys = null, kept = null, frames = null, frameHue = false }) {
  const into = new Map();
  for (const [to, from] of Object.entries(folds ?? {})) for (const h of from) if (h.toUpperCase() !== to.toUpperCase()) into.set(h.toUpperCase(), to.toUpperCase());
  let quiet = null, grayHue = null;
  const cache = new Map();
  const apply = (hex) => {
    const h = hex.toUpperCase();
    if (h === '#000000') return h;
    let out = cache.get(h);
    if (out) return out;
    if (into.has(h)) out = apply(into.get(h));
    else {
      out = base(h);
      if (greys && !ART.has(h)) {
        const [, C, H] = oklch(out);
        if (C < GREY_C) {
          quiet ??= makeLook(lookByCode(greys));
          grayHue ??= oklch(base(PALETTE.gray))[2];
          const [Lq, Cq] = oklch(quiet(h));
          out = fromLch(Lq, Cq, H ?? grayHue);
        }
      }
    }
    if (cache.size > 4096) cache.clear();
    cache.set(h, out);
    return out;
  };
  apply.keep = kept === 'interface' ? (hex) => (into.has(hex.toUpperCase()) || !ART.has(hex.toUpperCase()) ? apply(hex) : base.keep(hex)) : base.keep;
  apply.frames = frames;
  apply.frameHue = frameHue;
  return apply;
}

// The looks (SX, 2026-10-02: «Четыре типа. Now, Sunset, Spawn и Tyrell»). `palette` is each role's ink: the
// interface's four roles free and final, the signals' held to their families (inFamily); `mood` is the atmosphere the
// interface's palette has, as a grade, which the signals and the art take in part. `logic` says it in a line.
// SPAWN's and SUNSET's interfaces are SX's own tuning of round three, to the digit; `tune` is where SX set each look's
// sliders in round four (interface-looks-2026-10-02(1).json), the look as it stands, which RESET goes back to.
export const NOW = Object.freeze({ code: 'G0', name: 'NOW', palette: null, mood: null,
  film: "The game today: SX's grade of 2026-10-01, under SX's sliders",
  logic: 'A cool blue machine, a sage route, warm signals; a touch warmer and turned.',
  tune: { strength: 120, light: -0.1, warmth: 2, contrast: 0, saturation: 100, hue: 15, signals: 60, art: 60 } });

export const LOOKS = Object.freeze([
  {
    code: 'G1', name: 'SPAWN', film: 'Spawn, 1997: comic-book colour over a cold night (SX\'s tuning)',
    logic: 'A night-indigo machine, cold and a little dark; the signals keep their colours under the same cold light.',
    palette: { depth: '#0A1645', structure: '#3961A9', secondary: '#7185A0', primary: '#AEC4E0', route: '#5EAC8A',
      caution: '#F79043', danger: '#E5484A', brake: '#FDD383', credits: '#FDE7AA', creditsLabel: '#D5A23E' },
    mood: { light: -0.3, warmth: -4.5, saturation: 80 },
    // SPAWN SOFT (SX, 2026-10-17: «берем софт»): the colours one notch quieter, saturation 85 where SX's tune had 120, and tidied (above):
    // its grays as quiet as NOW's in its own hue, the kept layer in it, the near twins folded, the windows' dash the rule and their frame
    // the faint text, their grays in its hue. The game's default look since that day («спаун софт должен быть в умолчании»).
    tune: { strength: 110, light: 0.3, warmth: 4.5, contrast: -1, saturation: 85, hue: 5, signals: 55, art: 10 },
    tidy: { folds: SPAWN_FOLDS, greys: 'G0', kept: 'interface', frames: { dash: 'rule', frame: ROLES.textFaint }, frameHue: true },
  },
  {
    code: 'G2', name: 'SUNSET', film: 'The sky just after the sun: steel and lavender over the last warm light (SX\'s tuning)',
    logic: 'A steel-lavender machine, soft and cool; the signals stay warm, the sun still in them.',
    palette: { depth: '#1D343F', structure: '#4E7695', secondary: '#96A8C5', primary: '#CFDAF4', route: '#6FB592',
      caution: '#FF9A4C', danger: '#E5543C', brake: '#FFD07E', credits: '#FFE6A8', creditsLabel: '#E29E45' },
    mood: { warmth: 2, contrast: -2, saturation: 95 },
    tune: { strength: 135, light: -0.1, warmth: -4, contrast: -1, saturation: 90, hue: 10, signals: 60, art: 65 },
  },
  {
    code: 'G3', name: 'TYRELL', film: 'Blade Runner, 1982: brass rooms in smoke',
    logic: 'A warm brass machine and cream text in a soft haze; the signals keep their colours, the route a little teal.',
    palette: { depth: '#2A2014', structure: '#B18A52', secondary: '#B9A991', primary: '#F5EBD9', route: '#55C2A2',
      caution: '#F0874A', danger: '#DE473E', brake: '#F5D58E', credits: '#F7E8C8', creditsLabel: '#C9A160' },
    mood: { warmth: 1, contrast: -3, saturation: 88 },
    tune: { strength: 100, light: -1.2, warmth: -4, contrast: 1, saturation: 100, hue: -120, signals: 80, art: 55 },
  },
]);

export const ALL_LOOKS = Object.freeze([NOW, ...LOOKS]);
export const lookByCode = (code) => ALL_LOOKS.find((l) => l.code === code) || null;

// The screens the look is seen through (SX, 2026-10-02: «отдельно фильтры настроить ... Нужны как бы именно текстуры
// и эффекты»; colour is the looks' alone, so no screen shifts a hue or lifts black). CRT is the tube of 2026-09-30
// (src/crt.js) and the base; every screen but FLAT is curved, the LCD less; FLAT is kept for checks only. The starts
// are SX's own settings of 2026-10-02 («я уже вот так накрутил, сделать стандартом»). Lengths are CSS px;
// src/filmGradeScreen.js draws them. Since 2026-10-17 the three are SX's picks of the second round (labs/graphics/sketches/screens-v2.html,
// «C1 PSX, L2 BLEND, V1 FRINGE», his COPY's numbers): the CRT a PlayStation's ordered dither, halved scanlines, a stronger bend and a gain
// (BRIGHT); the LCD flat, its blend of frames drawn straight, a fine panel grid, square corners; the VHS bent more, red and cyan parting
// toward the sides (FRINGE). The VHS's colour split half as wide since SX, 2026-10-17 («в VHS что-то все-таки слишком сильная хроматическая
// аберрация. Я бы чуть убрал ее»): BLEED and FRINGE 1 -> 0.5 px.
const curve = (start) => ({ label: 'CURVE', min: 0, max: 200, step: 5, start, unit: ' %', says: '100 % is the tube of 2026-09-30' });
const vignette = (start) => ({ label: 'VIGNETTE', min: 0, max: 80, step: 2, start, unit: ' %', says: 'the light the rim takes' });
export const SCREENS = Object.freeze({
  crt: { label: 'CRT', says: "The game's tube: the bend, the rounded corners, the vignette, a PlayStation's dither, faint scanlines and glow. The base.", params: {
    curve: curve(52), vignette: vignette(8),
    corner: { label: 'CORNERS', min: 0, max: 8, step: 0.5, start: 3, unit: ' %', says: "how round the tube's corners" },
    scan: { label: 'SCANLINES', min: 0, max: 100, step: 5, start: 5, unit: ' %', says: 'dark rows between the lines, bent with the glass' },
    glow: { label: 'GLOW', min: 0, max: 100, step: 5, start: 15, unit: ' %', says: 'light spilling round what is bright' },
    dither: { label: 'DITHER', min: 0, max: 50, step: 2, start: 18, unit: ' %', says: 'the 4 x 4 ordered dither: how much its darkest cell takes' },
    dot: { label: 'DOT', min: 1, max: 3, step: 0.5, start: 1, unit: ' PX', says: "one dither cell, in the screen's points" },
    grille: { label: 'GRILLE', min: 0, max: 50, step: 2, start: 0, unit: ' %', says: 'how dark the gaps between the phosphor columns' },
    bright: { label: 'BRIGHT', min: 0, max: 25, step: 1, start: 14, unit: ' %', says: 'the picture this much brighter; black stays black' },
  } },
  lcd: { label: 'LCD', says: 'A flat panel: its pixels, the fine lines between them, and a slow response that smears what moves.', params: {
    lag: { label: 'LAG', min: 0, max: 80, step: 5, start: 55, unit: ' %', says: 'how much of the last frame each pixel keeps, at 60 a second' },
    grid: { label: 'GRID', min: 0, max: 50, step: 2, start: 14, unit: ' %', says: 'how dark the lines between the panel pixels' },
    pitch: { label: 'PITCH', min: 1, max: 3, step: 0.5, start: 2, unit: ' PX', says: 'one panel pixel of the grid' },
    pixel: { label: 'PIXEL', min: 0, max: 2, step: 1, start: 1, unit: ' PX', says: 'the picture snapped to panel pixels this big (0 off)' },
    vignette: vignette(24),
    corner: { label: 'CORNERS', min: 0, max: 8, step: 0.5, start: 0, unit: ' %', says: "how round the panel's corners" },
  } },
  vhs: { label: 'VHS', says: 'A tape on a tube: the picture itself sways and tears, red runs right and parts from cyan toward the sides, the head noise at the bottom.', params: {
    wobble: { label: 'WOBBLE', min: 0, max: 4, step: 0.25, start: 0.75, unit: ' PX', says: 'how far each line sways' },
    tracking: { label: 'TRACKING', min: 0, max: 100, step: 5, start: 10, unit: ' %', says: 'the band that rolls down tearing the picture' },
    bleed: { label: 'BLEED', min: 0, max: 8, step: 0.5, start: 0.5, unit: ' PX', says: 'how far red runs to the right' },
    soft: { label: 'SOFT', min: 0, max: 100, step: 5, start: 10, unit: ' %', says: "the tape's blur along the lines" },
    noise: { label: 'NOISE', min: 0, max: 100, step: 5, start: 25, unit: ' %', says: 'snow over the picture' },
    fringe: { label: 'FRINGE', min: 0, max: 4, step: 0.25, start: 0.5, unit: ' PX', says: 'how far red and cyan part at the sides; none at the middle' },
    breathe: { label: 'BREATHE', min: 0, max: 60, step: 5, start: 0, unit: ' %', says: 'the fringe swells and ebbs by this much over 7 s' },
    curve: curve(62), vignette: vignette(56),
  } },
  flat: { label: 'FLAT', says: 'No glass at all: for checks only.', params: {} },
});
export const SCREEN_START = Object.freeze(Object.fromEntries(Object.entries(SCREENS).map(([mode, s]) =>
  [mode, Object.fromEntries(Object.entries(s.params).map(([k, p]) => [k, p.start]))])));
