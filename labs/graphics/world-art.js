import { CONFIG } from '../../src/config.js';
import { TAU, clamp, fbmWrapped, hypot2, lerp, mixHex, mulberry32, rampGlyph, cellNoise } from '../../src/util.js';
import { chorusVoice } from '../../src/chorus.js';
import { Planet } from '../../src/bodies.js';
import { planetHue, stationDefById } from '../../src/sectors.js';
import { registerSprite } from '../../src/sprites.js';
import { Pirate, PIRATE_INKS } from '../../src/pirates.js';
import { rebuiltShare } from '../../src/ruins.js';
import { floatOf, floatPhases, floatPose } from '../../src/float.js';
import { drawBossArt } from './boss-art.js';
import { paintInk, paintedHull, paintedMotion, LAMP } from '../../src/paint.js';
import { SPECIAL_INKS } from '../../src/specialShips.js';
import { keptDraw } from '../../src/grade.js';
import { ROLES } from '../../src/roles.js';
import { createShipMotion, stepShipMotion, drawShipMotion, glassDraws, bankDraws, wingFlip, WING_GLYPHS, MOTION_INKS } from './ship-motion.js';
import { scrambledPlaces, slotOfCell } from './ship-scramble.js';
import { BLOCK_TONES, planetTones, ROCK_EDGE, ROCK_INKS, ROCK_LIT, ROCK_SHADE, SHADE_GAP, ROCK_RELIEF } from './art-tones.js';
import { stationLook, stationCells, lookOrigin, LOOK_SCALE, MAX_CELLS } from './station-art.js';
import { cargoArt } from './cargo-art.js';
import { paintPlanetType } from './planet-types.js';
import { prepareHome, drawHome, homeLive } from './garage-art.js';
import { BOARD, BOARD_INK, dockState, homeDockState } from '../../src/home.js';
import { stationDockState, dockLook, cargoStowed } from '../../src/docking.js';
import { shipDockLook } from './dock-fx.js';
import { flyingLoaner, LOANER, LOANER_LIVERY } from '../../src/loaner.js';
import { airLook, drawAirShip } from './stunt-fx.js';
import { passedOver, underShip } from '../../src/trick.js';

// The planets' tones and the rocks' outline and shading steps live in art-tones.js (PLAN D2, 2026-10-04: station-art.js and
// garage-art.js need them, and this file needs theirs); here as before for the sketches and checks that read them here.
export { BLOCK_TONES, planetTones, ROCK_EDGE, ROCK_INKS, ROCK_LIT, ROCK_SHADE, SHADE_GAP, ROCK_RELIEF };

// Unknown imported materials are visible in lab diagnostics, not guessed from
// brightness. They use neutral material until an explicit asset role is authored.
export const unassignedMaterials = new Set();
// The palette's inks as a set: a lookup per glyph, not an array made per glyph (perf audit, 2026-09-30).
export const ROLE_INKS = new Set(Object.values(ROLES));
const shipMaterials = new Map([
  ['#6f74c0', 'material'], ['#b9a5f0', 'highlight'], ['#f0a5c0', 'structure'],
  ['#5ce422', 'engine'], ['#f576c7', 'structure'], ['#eacbee', 'highlight'],
  ['#e8edf2', 'material'], ['#7fd1c8', 'structure'],
  ['#ffd27f', 'caution'], ['#ff9d4d', 'caution'], ['#e2603a', 'danger'],
  // A hero look's lamp or pod (src/shipLooks.js, src/paint.js LAMP): the paint's jets, the highlight in STANDARD.
  [LAMP, 'lamp'],
]);
// `paint` is the pilot's paint (src/paint.js): it recolours the hull, the glass,
// the structure and the engine at rest and burning; the warning inks stay. `livery`: a set of colours (lower case) that pass as
// they are, the ship's own: SCOOTY JR.'s (src/loaner.js LOANER_LIVERY), whose lamp is a colour the roles would read as caution.
export function shipInk(color, active = false, paint = null, livery = null) {
  if (livery?.has(color?.toLowerCase())) return color;
  const role = shipMaterials.get(color?.toLowerCase());
  if (role === 'engine') return active ? paintInk(paint, 'engineActive', ROLES.driveActive) : paintInk(paint, 'engine', ROLES.structure);
  if (role === 'lamp') return paintInk(paint, 'jets', ROLES.highlight);
  if (role) return paintInk(paint, role, ROLES[role]);
  // The reference ships' own colours (src/specialShips.js), a borrowed ship's debris among them, pass as they are.
  if (ROLE_INKS.has(color) || SPECIAL_INKS.has(color)) return color;
  unassignedMaterials.add(`ship:${color}`);
  return ROLES.material;
}

// The glass of the pilot's ship: a cell in a glass colour (the role `highlight`) that is no strut (SX's CLIPPER writes its outer struts in
// the glass's colour too).
const STRUTS = new Set(['/', '\\']);
const isGlass = (c) => shipMaterials.get(String(c.color).toLowerCase()) === 'highlight' && !STRUTS.has(c.ch);

// The pilot's paint and the ink resolver of the ship flown now (`active`: its engine burning): the pilot's own ships in the pilot's
// paint; SCOOTY JR. (src/loaner.js) in its own livery and never in the pilot's paint. Every painter of the flown ship reads it (the
// world's, the dive's, the return's, the pause's toy).
// SCOOTY JR. worn by the STANDARD (src/shipLooks.js, after the opening) keeps its livery in STANDARD, and a paint dresses it by its roles
// (src/paint.js paintedHull reads the livery's two as material and jets).
export function flownShipInks(world, active = false) {
  const loaner = flyingLoaner(world);
  const paint = loaner ? null : world?.pilot?.paint ?? null;
  const livery = loaner || world?.ship?.model?.id === LOANER.id ? LOANER_LIVERY : null;
  return { paint, ink: (color) => shipInk(color, active, paint, livery) };
}

// A painter-scoped adapter, never a global glyph/Unicode/brightness classifier.
export function inkRenderer(r, resolve, alphaScale = 1) {
  const scoped = Object.create(r);
  scoped.glyph = (c, x, y, ink, a = 1, s = 1) => r.glyph(c, x, y, resolve(ink), a * alphaScale, s);
  scoped.glyphRot = (c, x, y, angle, ink, a = 1, s = 1) => r.glyphRot(c, x, y, angle, resolve(ink), a * alphaScale, s);
  scoped.glyphNow = (c, x, y, ink, a = 1, s = 1) => r.glyphNow(c, x, y, resolve(ink), a * alphaScale, s);
  scoped.text = (text, x, y, ink, a = 1) => r.text(text, x, y, resolve(ink), a * alphaScale);
  return scoped;
}

// Art cells carry their own semantic role. Box joins combine their directions;
// colour is chosen by the authoring operation, not by the resulting character.
const edges = { '╵': 1, '╶': 2, '╷': 4, '╴': 8, '─': 10, '│': 5, '┌': 6, '┐': 12, '└': 3, '┘': 9,
  '├': 7, '┤': 13, '┬': 14, '┴': 11, '┼': 15 };
const edgeGlyph = Object.fromEntries(Object.entries(edges).map(([ch, bits]) => [bits, ch]));
function board(width, height) {
  const cells = Array.from({ length: height }, () => Array(width).fill(null));
  const put = (x, y, ch, role = 'structure') => {
    const old = cells[y]?.[x];
    if (x < 0 || x >= width || y < 0 || y >= height) throw new RangeError('Lab art exceeds its envelope');
    cells[y][x] = { ch: edges[ch] && edges[old?.ch] ? edgeGlyph[edges[ch] | edges[old.ch]] : ch, role };
  };
  const box = (x, y, w, h, role = 'material') => {
    for (let i = 1; i < w - 1; i++) { put(x + i, y, '─', role); put(x + i, y + h - 1, '─', role); }
    for (let j = 1; j < h - 1; j++) { put(x, y + j, '│', role); put(x + w - 1, y + j, '│', role); }
    for (const [dx, dy, ch] of [[0, 0, '┌'], [w - 1, 0, '┐'], [0, h - 1, '└'], [w - 1, h - 1, '┘']]) put(x + dx, y + dy, ch, role);
  };
  const rib = (x, y, length, vertical = false) => {
    for (let i = 0; i < length; i++) {
      const bits = i === 0 ? (vertical ? 4 : 2) : i === length - 1 ? (vertical ? 1 : 8) : (vertical ? 5 : 10);
      put(x + (vertical ? 0 : i), y + (vertical ? i : 0), edgeGlyph[bits]);
    }
  };
  return { width, height, cells, put, box, rib };
}
function stationArt(kind) {
  const b = board(42, kind === 'garage' ? 20 : 18);
  const pod = (x, y, w, h) => {
    b.box(x, y, w, h);
    b.rib(x + 3, y, h, true); b.rib(x + w - 4, y, h, true);
    b.put(x + Math.floor(w / 2), y + 2, '░', 'structure');
    if (h > 5) b.put(x + Math.floor(w / 2), y + 3, '░', 'structure');
  };
  if (kind === 'garage') {
    b.box(16, 0, 8, 20);
    for (const y of [4, 8, 12, 16]) b.rib(16, y, 8);
    for (const [x, y, w] of [[0, 1, 12], [1, 7, 11], [2, 13, 10]]) {
      pod(x, y, w, 5);
      b.rib(x + w - 1, y + 1, 17 - (x + w - 1));
      b.rib(x + w - 1, y + 3, 17 - (x + w - 1));
    }
    for (const y of [1, 13]) {
      pod(29, y, 13, 6);
      b.rib(23, y + 2, 7); b.rib(23, y + 4, 7);
    }
    // A short service head on a twin rail, not a passable berth.
    b.rib(23, 8, 11); b.rib(23, 10, 11); b.box(33, 7, 9, 5);
    b.box(36, 8, 4, 3, 'structure'); b.put(37, 9, 'o', 'highlight');
    b.put(19, 2, '▰', 'highlight'); b.put(20, 17, '·');
  } else {
    b.box(18, 0, 6, 18);
    for (const y of [4, 8, 13]) b.rib(18, y, 6);
    for (const x of [0, 28]) for (const y of [1, 10]) {
      pod(x, y, 14, 7);
      b.rib(x === 0 ? 13 : 23, y + 2, 6);
      b.rib(x === 0 ? 13 : 23, y + 4, 6);
    }
    b.put(20, 9, '◇', 'highlight'); b.put(21, 2, '·');
  }
  return b;
}
const stations = { garage: stationArt('garage'), freight: stationArt('freight') };

// A fixed number in 0..1 for a cell of a drawing (src/util.js cellNoise), so a ruin is broken the same way on every frame and every visit.

// A station, or a ruin (src/ruins.js): the station it was, drawn from the same
// board, with `rebuilt` (0..1) of it in place. At 0 about three fifths of its
// strokes are gone and a few of them drift beside it, turning slowly, and a
// band more hang loose in the quiet ink; each credit put in brings pieces back,
// in the same order every time, and at 1 it is whole and its light comes on.
export const RUIN = Object.freeze({ gone: 0.6, loose: 0.14, debris: 0.3, drift: 5, float: { sway: 0.45, bob: 0.6, rate: [0.35, 0.8], spin: [0.25, 0.9] } });

// Where a drifting piece of a ruin is now, and how it is turned (SX, 2026-10-01: «у сломанных станций
// диагональные палочки пусть двигаются немного и мб крутятся»; until then they bobbed a quarter of a cell
// over fifteen seconds and turned 0.15 rad/s, and read as still). Each piece floats round its own place,
// up to `sway` cells sideways and `bob` up and down, at its own rate, and turns at its own speed, either
// way. Everything comes from the cell's noise, so a piece moves the same way on every visit.
function floating(x, y, n, t) {
  const F = RUIN.float;
  const rate = F.rate[0] + (F.rate[1] - F.rate[0]) * cellNoise(x, y, 5);
  const spin = (F.spin[0] + (F.spin[1] - F.spin[0]) * cellNoise(x, y, 6)) * (cellNoise(x, y, 7) < 0.5 ? -1 : 1);
  const p = n * 40;
  return {
    dx: (cellNoise(x, y, 3) - 0.5) * RUIN.drift * 2 + Math.sin(t * rate * 0.7 + p) * F.sway,
    dy: (cellNoise(x, y, 4) - 0.5) * RUIN.drift + Math.sin(t * rate + p * 1.3) * F.bob,
    angle: t * spin + n * 20,
  };
}
// `angle`: the station's turn in the float (src/float.js), drawn in steps of CONFIG.float.step degrees. `dock`: the home garage's docking
// state (src/home.js homeDockState), or a look's (src/docking.js stationDockState: which of its docks works and at what step).
export function drawStation(r, sx, sy, station, active = false, rebuilt = 1, t = 0, lookScale = LOOK_SCALE, dock = null, angle = 0) {
  if (station.kind === 'home') { drawHomeLook(r, sx, sy, rebuilt, t, lookScale, dock, dock ? station : null); return; }
  const look = station.look ? stationLook(station.look) : null;
  if (look) { drawLook(r, sx, sy, look, active, rebuilt, t, lookScale, angle, dock); return; }
  const art = stations[station.becomes || station.kind] || stations.garage;
  const scale = station.model.scale / 2;
  const w = r.cellW * scale, h = r.cellH * scale;
  const broken = 1 - Math.max(0, Math.min(1, rebuilt));
  const gone = broken * RUIN.gone, loose = gone + broken * RUIN.loose;
  for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width; x++) {
    const cell = art.cells[y][x];
    if (!cell) continue;
    const px = sx + (x - (art.width - 1) / 2) * w, py = sy + (y - (art.height - 1) / 2) * h;
    const n = broken ? cellNoise(x, y, 1) : 1;
    if (n < gone) {
      // A missing piece; some of them float beside the hull.
      if (cellNoise(x, y, 2) < RUIN.debris) {
        const f = floating(x, y, n, t);
        r.glyphRot(cell.ch, px + f.dx * w, py + f.dy * h, f.angle, ROLES.structure, 0.7, scale);
      }
      continue;
    }
    if (cell.ch === 'o' && broken) { r.glyph('·', px, py, ROLES.structure, 1, scale); continue; }   // no light in a ruin
    const ink = n < loose ? ROLES.structure : cell.ch === 'o' && active ? ROLES.interactionActive : ROLES[cell.role];
    r.glyph(cell.ch, px, py, ink, 1, scale);
  }
}

// A station in its look (station-art.js, SX's twelve), by the same rules as the
// boards above: a ruin keeps `rebuilt` of its cells, the rest gone (some of them
// drifting beside it) or hanging loose in the quiet ink, and nothing in it moves
// or lights until it is whole. Docked or selected, its lights are the
// interaction's green. Drawn about its own middle (station-art.js lookOrigin): the
// board holds its external dock and a docked ship beside it. `dock`: its docks'
// steps (src/docking.js stationDockState), idle without.
function drawLook(r, sx, sy, st, active, rebuilt, t, sc, angle = 0, dock = null) {
  const w = r.cellW * sc, h = r.cellH * sc, o = lookOrigin(st);
  const reach = Math.hypot(Math.max(o.x, st.W - 1 - o.x) * w, Math.max(o.y, st.H - 1 - o.y) * h);
  if (r.onScreen && !r.onScreen(sx, sy, reach + (RUIN.drift + RUIN.float.sway) * w)) return;
  st.S.dockState = dock;
  const broken = 1 - Math.max(0, Math.min(1, rebuilt));
  const gone = broken * RUIN.gone, loose = gone + broken * RUIN.loose;
  // Turned in the float: each cell about the middle, each glyph by the turn, held to its steps (CONFIG.float.step).
  const step = (CONFIG.float.step * Math.PI) / 180, a = angle && step ? Math.round(angle / step) * step : angle;
  const ca = Math.cos(a), sa = Math.sin(a);
  if (a) r = turnedGlyphs(r, sx, sy, ca, sa, a);
  stationCells(st, broken ? 0 : t, (x, y, ch, ink, alpha, moving) => {
    const px = sx + (x - o.x) * w, py = sy + (y - o.y) * h;
    if (broken) {
      const n = cellNoise(x, y, 1);
      if (n < gone) {
        if (!moving && cellNoise(x, y, 2) < RUIN.debris) {
          const f = floating(x, y, n, t);
          r.glyphRot(ch, px + f.dx * w, py + f.dy * h, f.angle, ROLES.structure, 0.7, sc);
        }
        return;
      }
      if (ink === ROLES.highlight) { r.glyph('·', px, py, ROLES.structure, 1, sc); return; }   // no light in a ruin
      if (n < loose) ink = ROLES.structure;
    } else if (active && ink === ROLES.highlight) ink = ROLES.interactionActive;
    r.glyph(ch, px, py, ink, alpha, sc);
  });
  st.S.dockState = null;
}

// A renderer whose glyphs are turned by `a` about (sx, sy) (cosine `ca`, sine `sa`): a station's cells in the float.
function turnedGlyphs(r, sx, sy, ca, sa, a) {
  const turned = Object.create(r);
  // A cell's turned place is worked in the call, not made an {x, y} first: every cell of a floating station was an object and a pair
  // of boxed numbers a frame (11 KB of garbage a frame in a first profile with one in view, 2026-10-09).
  turned.glyph = (ch, x, y, ink, alpha = 1, size = 1) => r.glyphRot(ch, sx + (x - sx) * ca - (y - sy) * sa, sy + (x - sx) * sa + (y - sy) * ca, a, ink, alpha, size);
  turned.glyphRot = (ch, x, y, angle, ink, alpha = 1, size = 1) => r.glyphRot(ch, sx + (x - sx) * ca - (y - sy) * sa, sy + (x - sx) * sa + (y - sy) * ca, angle + a, ink, alpha, size);
  return turned;
}

// The pilot's home garage (labs/graphics/garage-art.js, src/home.js), by the same rules as the looks: `dock` is what it
// is doing (src/home.js homeDockState), at rest without one; a garage a wreck broke is as far broken as a station's
// (CONFIG.station.brokenLook), the stone still and its lights out. Its own lights go green by themselves while a
// ship is in the berth, so being selected changes nothing. `station`, drawn in the world: its greenhouse and its tank's oil live
// (garage-art.js homeLive), moved by where it is off its place and how it is turned; without one (the INFO panel) they rest.
let homeArt = null;
const HOME_REST = dockState('away', 0);
function drawHomeLook(r, sx, sy, rebuilt, t, sc, dock, station = null) {
  const g = (homeArt ||= prepareHome());
  const broken = 1 - Math.max(0, Math.min(1, rebuilt));
  const pose = station ? { ox: station.x - station.homeX, oy: station.y - station.homeY, a: station.angle || 0 } : null;
  if (!broken) { drawHome(r, sx, sy, g, dock || HOME_REST, t, sc, null, station ? { live: homeLive(station), pose } : {}); return; }
  const gone = broken * RUIN.gone, loose = gone + broken * RUIN.loose;
  drawHome(r, sx, sy, g, HOME_REST, 0, sc, (x, y, px, py, ch, ink, alpha, moving) => {
    const n = cellNoise(x, y, 1);
    if (n < gone) {
      if (!moving && cellNoise(x, y, 2) < RUIN.debris) {
        const f = floating(x, y, n, t);
        r.glyphRot(ch, px + f.dx * r.cellW * sc, py + f.dy * r.cellH * sc, f.angle, ROLES.structure, 0.7, sc);
      }
      return;
    }
    if (ink === ROLES.highlight) { r.glyph('·', px, py, ROLES.structure, 1, sc); return; }
    r.glyph(ch, px, py, n < loose ? ROLES.structure : ink, alpha, sc);
  });
}

// A station's look in a window (src/stationPanel.js): drawn at once rather than
// queued behind the world, at CONFIG.station.panelScale, one scale for every
// look so their sizes compare; a ruin as broken as it is.
export function drawStationNow(r, cx, cy, station, rebuilt = 1, t = 0, fit = null) {
  const now = Object.create(r);
  now.onScreen = () => true;
  now.glyph = (ch, x, y, ink, a = 1, s = 1) => r.glyphNow(ch, x, y, ink, a, s);
  now.glyphRot = (ch, x, y, angle, ink, a = 1, s = 1) => {
    const ctx = r.ctx;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    r.glyphNow(ch, 0, 0, ink, a, s);
    ctx.restore();
  };
  // The home garage's board is wider than any look's: its scale is the one that gives it the width of the widest look. A look is drawn at
  // the panel's own scale; one grown past it (the looks of 2026-10-15) a whole px less a cell till its station (its `core`, without the
  // dock) fits: in `fit` ({ w, h } px, the box it is shown in less its air) when the caller gives one, else in the old largest look's
  // cells (42 x 22) at that scale. So the picture keeps to its box and its rows still fall on whole px.
  const R = CONFIG.render, core = station.look ? stationLook(station.look)?.core : null, most = Math.floor(R.fontSize * CONFIG.station.panelScale + 1e-9);
  const px = !core ? most : fit ? Math.min(most, Math.floor(Math.min(fit.w * R.fontSize / (core.W * r.cellW), fit.h * R.fontSize / (core.H * r.cellH)) + 1e-9))
    : Math.floor(R.fontSize * CONFIG.station.panelScale * Math.min(1, MAX_CELLS.w / core.W, MAX_CELLS.h / core.H) + 1e-9);
  const scale = station.kind === 'home' ? CONFIG.station.panelScale * MAX_CELLS.w / BOARD.W : Math.max(4, px) / R.fontSize;
  drawStation(now, cx, cy, station, false, rebuilt, t, scale);
}

// A station as the world draws it, at its own size (LOOK_SCALE), on `r` now, the point (dx, dy) px off its look's middle at `box`'s middle:
// the windows' shots of it (SX, 2026-10-16, the organism: «брал в реальном размере шот ... рандомный фрагмент станции один к одному, но в этом
// квадрате заключен»; labs/graphics/windows.js drawStationInfo, labs/graphics/talk-beat.js), each a fragment masked by its square. At `t` (s)
// its parts move as they do outside, and it floats as a station floats (src/float.js, the world's numbers, 1 u a px; SX, 2026-10-16: «должен
// быть флоутинг, медленный»): its orbit, and its turn about the shot's middle rather than its own, so the fragment stays in the square. Only the
// glyphs near the square are drawn (a look's every cell turned was a canvas turn each).
export function drawStationTrue(r, box, station, dx = 0, dy = 0, rebuilt = 1, t = 0) {
  const pose = floatPose(floatPhases(station.id), t, floatOf(station));
  const step = (CONFIG.float.step * Math.PI) / 180, a = station.kind === 'home' ? 0 : Math.round(pose.angle / step) * step;
  const c = Math.cos(a), s = Math.sin(a);
  const cx = box.x + box.w / 2 + pose.dx - (dx * c - dy * s), cy = box.y + box.h / 2 + pose.dy - (dx * s + dy * c);
  drawStation(glyphsIn(r, box), cx, cy, station, false, rebuilt, t, LOOK_SCALE, null, a);
}
// `r`'s glyphs drawn now (glyphsNow), only those within a cell of `box`.
function glyphsIn(r, box) {
  const m = r.cellH * LOOK_SCALE, x0 = box.x - m, x1 = box.x + box.w + m, y0 = box.y - m, y1 = box.y + box.h + m;
  const now = glyphsNow(r), near = Object.create(now), inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  near.glyph = (ch, x, y, ink, a, s) => { if (inside(x, y)) now.glyph(ch, x, y, ink, a, s); };
  near.glyphRot = (ch, x, y, angle, ink, a, s) => { if (inside(x, y)) now.glyphRot(ch, x, y, angle, ink, a, s); };
  return near;
}
// `r` with its glyphs drawn at once rather than queued for the world's flush (what a window draws over the world must be drawn in its turn:
// a ship's drawing in a talk's picture was queued and came out under the window's black, an empty box).
export function glyphsNow(r) {
  const now = Object.create(r);
  now.onScreen = () => true;
  now.glyph = (ch, x, y, ink, a = 1, s = 1) => r.glyphNow(ch, x, y, ink, a, s);
  now.glyphRot = (ch, x, y, angle, ink, a = 1, s = 1) => {
    const ctx = r.ctx;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    r.glyphNow(ch, 0, 0, ink, a, s);
    ctx.restore();
  };
  return now;
}

// Where a shot `side` px square of a station is taken (labs/graphics/windows.js drawStationShot): the px from its look's middle (its origin,
// lookOrigin) to the shot's. `SHOT.tries` squares round cells of its look drawn by the shares `u`, `v`; of them those at least `SHOT.full` as
// full as the fullest (a station's edges and its open spans are sparse: a shot of them showed a line or two), then those holding a part that
// moves (a lamp, a wheel, a dish: SX, 2026-10-16, «какие-то анимации у станции»), then those `SHOT.apart` of a side off the last shot of that
// look, each kept only while one is left; one of the rest drawn by the same shares. (The fullest alone was the look's dense heart: one opening
// in four within 60 px of another's; SX: «всегда должен быть рандомный фрагмент, если мы заново открываем диалог».) { dx: 0, dy: 0 } where it
// has no look (the home garage's board). Kept per look, side and pick.
const SHOT = Object.freeze({ tries: 32, full: 0.5, apart: 0.5, times: [0, 0.4, 1.1, 1.9, 2.8, 4.3, 6.1] });
const shotPicks = new Map(), lastShot = new Map();
export function stationShotAt(r, station, side, u = 0.5, v = 0.5) {
  const look = station?.look ? stationLook(station.look) : null;
  if (!look) return { dx: 0, dy: 0 };
  const key = `${station.look}|${side}|${r.cellW}|${u}|${v}`;
  if (shotPicks.has(key)) return shotPicks.get(key);
  // Its cells, and the cells that move at a few moments (a part's cells are the frame's own, `moving`).
  const cells = [], moves = [], moved = new Set();
  stationCells(look, 0, (x, y) => cells.push(x, y));
  for (const t of SHOT.times) stationCells(look, t, (x, y, ch, ink, alpha, moving) => {
    if (moving && !moved.has(y * look.W + x)) { moved.add(y * look.W + x); moves.push(x, y); }
  });
  const w = r.cellW * LOOK_SCALE, h = r.cellH * LOOK_SCALE, hx = side / 2 / w, hy = side / 2 / h, o = lookOrigin(look), n = cells.length / 2;
  const count = (list, cx, cy) => {
    let k = 0;
    for (let j = 0; j < list.length; j += 2) if (Math.abs(list[j] - cx) <= hx && Math.abs(list[j + 1] - cy) <= hy) k += 1;
    return k;
  };
  const rng = mulberry32(((u * 1e9) ^ (v * 7e8)) >>> 0), tries = [];
  for (let t = 0; t < SHOT.tries && n; t++) {
    const i = Math.floor(rng() * n), cx = cells[2 * i], cy = cells[2 * i + 1];
    tries.push({ dx: (cx - o.x) * w, dy: (cy - o.y) * h, full: count(cells, cx, cy), moving: count(moves, cx, cy) });
  }
  const most = tries.reduce((m, c) => Math.max(m, c.full), 0), last = lastShot.get(`${station.look}|${side}`);
  const narrow = (pool, keep) => { const kept = pool.filter(keep); return kept.length ? kept : pool; };
  let pool = tries.filter((c) => c.full >= SHOT.full * most);
  pool = narrow(pool, (c) => c.moving > 0);
  if (last) pool = narrow(pool, (c) => Math.hypot(c.dx - last.dx, c.dy - last.dy) >= SHOT.apart * side);
  const pick = pool.length ? pool[Math.floor(rng() * pool.length)] : null;
  const at = pick ? { dx: pick.dx, dy: pick.dy } : { dx: 0, dy: 0 };
  // The oldest pick goes first: a shot standing now is among the latest, so it is never worked out again (and moved) mid-way.
  if (shotPicks.size > 64) shotPicks.delete(shotPicks.keys().next().value);
  shotPicks.set(key, at);
  lastShot.set(`${station.look}|${side}`, at);
  return at;
}

// How much of its ink the pilot's ship is drawn in. A ship given a grace (a new flight, the way out of a dock)
// blinks while it is invulnerable: it changes phase INVULN_TOGGLES times a second
// (it was 12, which at that rate is a flicker; three or fewer is the most a page may flash),
// and steady with reduced motion. One docked, or invulnerable with no timer (Infinity,
// as docking sets it), is drawn whole: it was drawn at the dim phase, for as long as it sat there. One back from a wreck does not
// blink: it stands mixed and is put back (labs/graphics/ship-scramble.js; SX, 2026-10-16).
export const INVULN_TOGGLES = 3;
export const INVULN_DIM = 0.32;
export function shipAlpha(invuln, { docked = false, reducedMotion = false } = {}) {
  if (docked || reducedMotion || !Number.isFinite(invuln) || invuln <= 0) return 1;
  return Math.floor(invuln * INVULN_TOGGLES) % 2 === 0 ? INVULN_DIM : 1;
}

// The pilot's ship as the game draws it since SX chose the motion (2026-09-30): frame 0
// of the model only, the two @ of the cockpit darkened on the side of a turn (a glint
// sliding off the glass), and the puffs from the nozzles (variant A). Blinks while
// invulnerable, as Ship.draw does. `ink` resolves the model's colours; `paint` is the
// pilot's paint, whose glass darkens to its own glass's darker step.
// Drawn in the kept layer (src/grade.js keptDraw): a look filters the pilot's ship as art and never repaints it
// (INTERFACE_LOOKS_HANDOFF.md, SX: «центровой кораблик» must not change).
// `options.shade`: the hull's cells this much as opaque (the brake's, src/visualScale.js brakeShade; the puffs keep theirs); `options.brake`
// the brake's own share of it, which the glass does not take (SX, 2026-10-16: «при тормозе стекло кабины не делай прозрачнее»).
// `options.braking`: the brake held, as the scale reads it (labs/graphics/flight-frame.js): a drawing with a brake pose (ships/modern.json
// `brake`, src/asciiModel.js brakeFrame) is drawn in it. Its side of a turn darkens from the nose back, each row's outermost glyph
// (ship-motion.js bankDraws), and in reverse its wings take their brake pose (wingFlip).
// `options.scramble`: the ship back from a wreck, mixed ({ plan, u }, labs/graphics/ship-scramble.js): each cell drawn at its piece's place,
// whole and steady (no blink) while it is.
// The canopy seen from below, a hatch: its rounded corners straight (SX, 2026-10-16: «это дно с точками. Они накладываются на стыке друг
// на друга, и там крест образуется или полоска ... Можно просто там какой-нибудь прямой ... не сильно груженно»; the rocks' ░ until then,
// whose dots met at the cells' seams).
const BELLY_HATCH = Object.freeze({ '╭': '┌', '╮': '┐', '╰': '└', '╯': '┘' });
// An ink `k` of the way toward black (the belly's), made once an ink and a share.
const bellies = new Map();
function bellyInk(ink, k) {
  if (!k || typeof ink !== 'string' || ink.length !== 7) return ink;
  const key = `${ink}|${k}`;
  let dark = bellies.get(key);
  if (!dark) { dark = mixHex(ink, '#000000', k); bellies.set(key, dark); }
  return dark;
}
export const drawPilotShip = keptDraw(function drawPilotShip(r, ship, sx, sy, motion, ink, paint = null, options = {}) {
  const model = ship.model;
  const m = ship.metrics || ship.measureDrawing(r.cellW, r.cellH);
  const a = ship.facing, ca = Math.cos(a), sa = Math.sin(a);
  const mix = options.scramble ?? null, places = mix ? scrambledPlaces(mix.plan, mix.u) : null;
  const alpha = (mix ? 1 : shipAlpha(ship.invuln, options)) * (options.shade ?? 1);
  const glassAlpha = alpha / Math.max(0.01, options.brake ?? 1);
  // A paint (src/paint.js) gives each part its ink, the front arcs theirs, the
  // engine its rest and burn; the puffs its smoke and jets; the glass its darker step.
  const burning = ship.thrusting || ship.retroing;
  const inks = paintedMotion(paint, MOTION_INKS);
  const pose = options.braking && model.brakeFrame != null ? model.brakeFrame : model.idleFrame;
  const cells = (model.frames && model.frames[pose]) || model.cells;
  // `ship.belly`: the hull seen from below, a jump's figure turning it over (labs/graphics/stunt-fx.js drawAirShip, a drawing whose look
  // carries it, SX's Y2 COIN): every ink that much of the way toward black, the canopy closed by a hatch of straight lines (BELLY_HATCH).
  const belly = ship.belly ?? 0;
  for (const c of cells) {
    const slot = places ? slotOfCell(mix.plan, c) : -1;
    const lx = (slot >= 0 ? places[slot].x : c.x) * m.w, ly = (slot >= 0 ? places[slot].y : c.y) * m.h;
    const x = sx + lx * ca - ly * sa, y = sy + lx * sa + ly * ca;
    const base = bellyInk(paintedHull(paint, c, burning) ?? ink(c.color), belly);
    const cellAlpha = isGlass(c) ? glassAlpha : alpha;
    const wing = WING_GLYPHS.has(c.ch);
    const ch = belly && isGlass(c) ? BELLY_HATCH[c.ch] ?? c.ch : wing && pose !== model.brakeFrame ? wingFlip(motion, model, c) : c.ch;
    const draws = bankDraws(motion, cells, c, base) ?? glassDraws(motion, c, base, inks);
    for (const d of draws) r.glyphRot(ch, x, y, a, d.ink, cellAlpha * d.alpha, model.scale);
  }
  drawShipMotion(r, motion, model, sx, sy, a, model.scale, inks, model.baseScale ?? model.scale);
});

// The authored seed is a stable body identity in the current sector catalogue.
// Terrestrial bodies use block strata; the others retain native shading.
// 101 and 113 are the hidden sector's alien planets, in the block family of the
// accepted sketch (labs/graphics/sketches/aliens.html). 163 is BERYL, the block
// planet among the three added with the colour pass (2026-09-30); 181 and 197 the
// second planets of J-06 and K-06 (the two sectors east, the same day).
const blockPlanetSeeds = new Set(CONFIG.planet.styles.blocks.seeds);      // the list is CONFIG.planet.styles.blocks.seeds
// A planet's record may name its own `style` (CONFIG.planet.styles: split, ringed, cratered, or classic / blocks to say
// which of the first two); without one it is what its seed has always made it.
export function planetSurfaceStyle(planet) {
  if (planet.style && Object.hasOwn(CONFIG.planet.styles, planet.style)) return planet.style;
  return blockPlanetSeeds.has(planet.seed) ? 'blocks' : 'classic';
}

// What a block planet's cells are that does not change from frame to frame (offset,
// depth, latitude, longitude at rest, light), made once per cell size with the same
// arithmetic the loop used to do every frame, so the picture is bit for bit the same
// (perf audit, 2026-09-30: a planet is 1700-4250 glyphs a frame).
function blockCells(r, planet) {
  const c = planet.blockCells;
  if (c && c.cw === r.cellW && c.ch === r.cellH) return c;
  const R = planet.radius, L = CONFIG.planet.light;
  const nx = Math.ceil(R / r.cellW), ny = Math.ceil(R / r.cellH);
  const total = (2 * nx + 1) * (2 * ny + 1);
  const ox = new Float64Array(total), oy = new Float64Array(total), d = new Float64Array(total);
  const lon0 = new Float64Array(total), lat = new Float64Array(total), light = new Float64Array(total);
  const row = new Int32Array(total);
  let n = 0;
  for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) {
    const u = i * r.cellW / R, v = j * r.cellH / R, dd = u * u + v * v;
    if (dd > 1) continue;
    const z = Math.sqrt(1 - dd);
    ox[n] = i * r.cellW; oy[n] = j * r.cellH; d[n] = dd; row[n] = j;
    lat[n] = Math.asin(v); lon0[n] = Math.atan2(u, z);
    light[n] = u * L.x + v * L.y + z * L.z;
    n++;
  }
  return (planet.blockCells = { cw: r.cellW, ch: r.cellH, n, ox, oy, d, lon0, lat, light, row });
}

export function drawPlanet(r, sx, sy, planet) {
  const R = planet.radius;
  if (!r.onScreen(sx, sy, R * 1.05)) return;
  const cached = planet.blockTones;
  const tone = cached && cached.tint === planet.tint && cached.dark === planet.dark ? cached.tone
    : (planet.blockTones = { tint: planet.tint, dark: planet.dark, tone: planetTones(planet) }).tone;
  const { n, ox, oy, d, lon0, lat, light, row } = blockCells(r, planet);
  // A cell the renderer would drop (Renderer.onScreen) is skipped before its noise is worked out.
  const view = r.worldView, m = r.margin;
  const x0 = view.x - m, x1 = view.x + view.w + m, y0 = view.y - m, y1 = view.y + view.h + m;
  const phase = planet.phase, seed = planet.seed, bands = planet.bands;
  for (let k = 0; k < n; k++) {
    const x = sx + ox[k], y = sy + oy[k];
    if (!(x > x0 && x < x1 && y > y0 && y < y1)) continue;
    const lon = lon0[k] + phase;
    let land = fbmWrapped(lon / TAU * 12, (lat[k] / Math.PI + .5) * 6, 12, seed, 3);
    if (bands) land = lerp(land, .5 + .5 * Math.sin(lat[k] * 7.5 + land * 3.2), bands);
    const lt = light[k];
    let glyph, step;
    if (d[k] > .94) { glyph = '·'; step = lt > .1 ? 'mid' : 'shadow'; }
    else if (lt < .1) { glyph = land > .54 ? '░' : '·'; step = 'shadow'; }
    else if (land > .55) { glyph = '▒'; step = lt > .55 ? 'lit' : 'mid'; }
    else if (land > .48) { glyph = '░'; step = 'mid'; }
    else { glyph = row[k] % 3 === 0 ? '·' : ' '; step = 'mid'; }
    r.glyph(glyph, x, y, tone[step]);
  }
  const rimSteps = Math.max(24, Math.round(TAU * R / (r.cellW * 1.05)));
  for (let i = 0; i < rimSteps; i++) {
    const angle = i / rimSteps * TAU;
    r.glyph('·', sx + Math.cos(angle) * R, sy + Math.sin(angle) * R, tone.rim);
  }
}

// ----------------------------------------------------------------------------------- the new looks
// SX, 2026-10-02 (map editor): «генерировать ... внешний вид ... в стилях, которые мы применили ... Двухцветные
// планеты». Three looks beyond the first two, in the same thin cell language (CONFIG.planet.styles has the numbers):
// every one is made of glyphs of the game's own cell, drawn at the planet's radius, so a bigger planet is MORE cells,
// never bigger ones. Their second hue is `planet.tint2`, stepped like the first.

// The second hue's tones: its own dark end (planetHue), the block family's shares.
function secondTones(planet) {
  const c = planet.secondTones;
  if (c && c.tint2 === planet.tint2) return c.tone;
  const t2 = planet.tint2 || planet.tint;
  return (planet.secondTones = { tint2: planet.tint2, tone: planetTones({ tint: t2, dark: planetHue(t2).dark }) }).tone;
}
function firstTones(planet) {
  const c = planet.blockTones;
  return c && c.tint === planet.tint && c.dark === planet.dark ? c.tone
    : (planet.blockTones = { tint: planet.tint, dark: planet.dark, tone: planetTones(planet) }).tone;
}

// #rrggbb by 24-bit value, for the ramps the split look steps through.
const STYLE_HEX = new Map();
const hexOf = (code) => {
  let c = STYLE_HEX.get(code);
  if (c === undefined) { c = '#' + ((1 << 24) | code).toString(16).slice(1); STYLE_HEX.set(code, c); }
  return c;
};
const channels = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// TWO-TONE: the classic shading (the density ramp, the bands, the spin) in two hues. The second is a zone: its edge is the
// planet's latitude line, wobbled by noise that turns with the surface and leaned so it rises and falls as the planet
// spins; a one-cell seam of the two hues' middle lies on it. Neither hue is a gradient: each cell takes one ramp.
function drawSplit(r, sx, sy, planet) {
  const rimR = planet.rim;
  if (sx + rimR < -r.margin || sx - rimR > r.width + r.margin) return;
  if (sy + rimR < -r.margin || sy - rimR > r.height + r.margin) return;
  const S = CONFIG.planet.styles.split, ramp = CONFIG.planet.ramp;
  const { n, kind, rim, ox, oy, a, ty, lat, diffuse } = planet.cellsFor(r);
  const lo = -r.margin, hiX = r.width + r.margin, hiY = r.height + r.margin;
  const { bands, phase, seed } = planet;
  const t2 = planet.tint2 || planet.tint;
  const d1 = channels(planet.dark), c1 = channels(planet.tint), d2 = channels(planetHue(t2).dark), c2 = channels(t2);
  const dm = d1.map((v, i) => (v + d2[i]) / 2), cm = c1.map((v, i) => (c1[i] + c2[i]) / 2);
  const ramps = [[d1, c1], [d2, c2], [dm, cm]];
  const lean = ((Math.imul(seed, 2654435761) >>> 0) / 4294967296 * 2 - 1) * S.lean;
  const seam = mixHex(planet.tint, t2, 0.5);
  for (let k = 0; k < n; k++) {
    const px = sx + ox[k], py = sy + oy[k];
    if (!(px > lo && px < hiX && py > lo && py < hiY)) continue;
    if (kind[k] === 1) { r.glyph(CONFIG.planet.rimGlyphs[rim[k]], px, py, seam, a[k]); continue; }
    const lon = a[k] + phase;
    const tx = (lon / TAU) * 12;
    let surface = fbmWrapped(tx, ty[k], 12, seed, 3);
    if (bands > 0) surface = lerp(surface, 0.5 + 0.5 * Math.sin(lat[k] * 7.5 + surface * 3.2), bands);
    const shade = clamp(0.09 + diffuse[k] * (0.46 + 0.62 * surface), 0, 0.999);
    const ch = rampGlyph(ramp, shade);
    if (ch === ' ') continue;
    const edge = 0.5 + S.wobble * (fbmWrapped(tx, ty[k], 12, seed + 977, 2) - 0.5) + lean * Math.sin(lon);
    const q = ((lat[k] / Math.PI + 0.5) - edge) / S.seam;
    const [dk, ck] = ramps[q < -1 ? 0 : q > 1 ? 1 : 2];
    const m = clamp(0.34 + surface * 0.78, 0, 1);
    const code = (Math.round(dk[0] + (ck[0] - dk[0]) * m) << 16) | (Math.round(dk[1] + (ck[1] - dk[1]) * m) << 8) | Math.round(dk[2] + (ck[2] - dk[2]) * m);
    r.glyph(ch, px, py, hexOf(code), clamp(0.42 + shade * 0.9, 0, 1));
  }
}

// RINGED: the classic body, and a thin ring of dots round it: an ellipse of 2-3 lines tilted from the seed, its far half
// hidden behind the body. The ring is tint2 if there is one, else the planet's own hue, a step quieter.
function ringPoints(r, planet) {
  const c = planet.ringCache;
  const R = planet.radius;
  if (c && c.cw === r.cellW && c.R === R && c.seed === planet.seed) return c.pts;
  const S = CONFIG.planet.styles.ringed;
  const rng = mulberry32(planet.seed * 31 + 7);
  const tilt = (rng() * 2 - 1) * S.tilt, open = lerp(S.open[0], S.open[1], rng());
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const pts = [];
  S.lines.forEach((ratio, li) => {
    const A = R * ratio, B = A * open;
    const steps = Math.max(24, Math.round(TAU * Math.sqrt((A * A + B * B) / 2) / (r.cellW * S.step)));
    for (let i = 0; i < steps; i++) {
      const th = i / steps * TAU, ex = A * Math.cos(th), ey = B * Math.sin(th);
      const x = ex * cos - ey * sin, y = ex * sin + ey * cos, far = ey < 0;
      if (far && x * x + y * y < R * R) continue;            // behind the body
      pts.push({ x, y, far, line: li });
    }
  });
  return (planet.ringCache = { cw: r.cellW, R, seed: planet.seed, pts }).pts;
}
function drawRinged(r, sx, sy, planet, t) {
  if (!r.onScreen(sx, sy, planet.rim)) return;
  Planet.prototype.draw.call(planet, r, sx, sy, t);
  const tone = planet.tint2 ? secondTones(planet) : firstTones(planet);
  const inks = [tone.mid, tone.mid, tone.rim];
  for (const p of ringPoints(r, planet)) r.glyph('·', sx + p.x, sy + p.y, inks[p.line] ?? tone.rim, p.far ? 0.55 : 0.95);
}

// CRATERED: a moon. The block family's strata in one hue, dulled; bowls (empty, or `tint2` floors) with rims of the
// brightest block, fixed to the surface so they turn with it. The craters come from the seed: one to every
// `perRadius` u of radius, their angular radius from `rho`.
function craterSet(planet) {
  const c = planet.craters;
  if (c && c.R === planet.radius && c.seed === planet.seed) return c;
  const S = CONFIG.planet.styles.cratered;
  const rng = mulberry32(planet.seed * 17 + 3);
  const count = Math.max(S.least, Math.round(planet.radius / S.perRadius));
  const list = [];
  for (let i = 0; i < count; i++) {
    const lon = rng() * TAU, sinLat = rng() * 1.7 - 0.85;
    const rho = Math.min(S.maxRho, lerp(S.size[0], S.size[1], rng() * rng()) / planet.radius);    // a crater is so many u across, whatever the planet
    const cosLat = Math.sqrt(1 - sinLat * sinLat);
    list.push({ x: Math.sin(lon) * cosLat, y: sinLat, z: Math.cos(lon) * cosLat, rho, reach: Math.cos(rho * S.rim[1]) });
  }
  return (planet.craters = { R: planet.radius, seed: planet.seed, list });
}
function drawCratered(r, sx, sy, planet) {
  const R = planet.radius;
  if (!r.onScreen(sx, sy, R * 1.05)) return;
  const tone = firstTones(planet);
  const floor = planet.tint2 ? secondTones(planet).mid : null;
  const { n, ox, oy, d, lon0, lat, light, row } = blockCells(r, planet);
  const craters = craterSet(planet).list, S = CONFIG.planet.styles.cratered;
  const view = r.worldView, m = r.margin;
  const x0 = view.x - m, x1 = view.x + view.w + m, y0 = view.y - m, y1 = view.y + view.h + m;
  const { phase, seed } = planet;
  for (let k = 0; k < n; k++) {
    const x = sx + ox[k], y = sy + oy[k];
    if (!(x > x0 && x < x1 && y > y0 && y < y1)) continue;
    const lt = light[k];
    if (d[k] > 0.94) { r.glyph('·', x, y, lt > 0.1 ? tone.mid : tone.shadow); continue; }
    const lon = lon0[k] + phase, cl = Math.cos(lat[k]);
    const px = Math.sin(lon) * cl, py = Math.sin(lat[k]), pz = Math.cos(lon) * cl;
    let where = 0;                                           // 0 ground, 1 a bowl's floor, 2 its rim
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i], dot = px * c.x + py * c.y + pz * c.z;
      if (dot < c.reach) continue;
      const a = Math.acos(dot > 1 ? 1 : dot) / c.rho;
      if (a < S.rim[0]) { where = 1; break; }
      if (a < S.rim[1]) where = 2;
    }
    // A bowl is empty (a few dots, or `tint2` floors); its rim is the brightest block there is; the ground is dull.
    if (where === 1) { if (planet.tint2) r.glyph('░', x, y, floor); else if (row[k] % 3 === 0) r.glyph('·', x, y, tone.shadow); continue; }
    if (where === 2) { r.glyph(lt > 0.1 ? '▓' : '▒', x, y, lt > 0.1 ? tone.lit : tone.mid); continue; }
    const land = fbmWrapped(lon / TAU * 12, (lat[k] / Math.PI + 0.5) * 6, 12, seed, 3);
    if (lt < 0.1) r.glyph(land > 0.54 ? '░' : '·', x, y, tone.shadow);
    else r.glyph(land > 0.5 ? '▒' : '░', x, y, tone.mid);
  }
}

// What a planet is drawn with, by its look: the one place the game's painters are chosen. The game attaches this to every
// planet whose look is not the classic one (createWorldPresentation); the map editor's preview calls it too.
export function paintPlanet(r, sx, sy, planet, t = 0) {
  switch (planetSurfaceStyle(planet)) {
    case 'blocks': return drawPlanet(r, sx, sy, planet);
    case 'split': return drawSplit(r, sx, sy, planet);
    case 'ringed': return drawRinged(r, sx, sy, planet, t);
    case 'cratered': return drawCratered(r, sx, sy, planet);
    default: if (paintPlanetType(planetSurfaceStyle(planet), r, sx, sy, planet, t)) return;
      return Planet.prototype.draw.call(planet, r, sx, sy, t);
  }
}

// A planet's surface on a refresh tier (the effects audit of 2026-10-06, path #6; a lab switch until SX compared it by eye and took
// it into the game, 2026-10-07): the painter is run PLANET_TIER_HZ times a second of the world's clock, each planet on its own beat
// (its seed staggers them, so two do not work on one frame), into a list of the glyphs it queues; the frames between lay that list
// where the planet now stands. It is run over the screen and PLANET_TIER_MARGIN px round it, and again as soon as the planet has moved
// half that on the screen, so a cell coming in at an edge is never missing. The spin moves one noise unit in 6 to 12 s, so a cell's
// glyph changes a few times a second at most: a surface change lands up to 1/PLANET_TIER_HZ s late, the whole disc at once. A frame
// that works it out draws exactly what the painter draws.
export const PLANET_TIER_HZ = 15;
const PLANET_TIER_MARGIN = 160;
export function tieredPlanet(r, sx, sy, planet, t) {
  if (!r.onScreen(sx, sy, planet.rim * 1.05)) return;
  const beat = Math.floor(t * PLANET_TIER_HZ + ((planet.seed * 0.618034) % 1));
  let c = planet.tier;
  const moved = c ? Math.max(Math.abs(sx - c.sx), Math.abs(sy - c.sy)) : Infinity;
  if (!c || c.beat !== beat || moved > PLANET_TIER_MARGIN / 2 || c.cw !== r.cellW || c.ch !== r.cellH || c.w !== r.width || c.h !== r.height
    || c.look !== planet.style || c.tint !== planet.tint || c.tint2 !== planet.tint2) {
    c = planet.tier ??= { chs: [], xs: [], ys: [], inks: [], alphas: [], sizes: [], n: 0 };
    Object.assign(c, { beat, sx, sy, cw: r.cellW, ch: r.cellH, w: r.width, h: r.height, look: planet.style, tint: planet.tint, tint2: planet.tint2, n: 0 });
    // The painter where the planet is, over the screen grown by the margin; what it queues is drawn now and kept from the planet's place.
    const at = Object.create(r), M = PLANET_TIER_MARGIN;
    at.margin = r.margin + M;
    at.onScreen = (x, y, pad = 0) => r.onScreen(x, y, pad + M);
    at.glyph = (ch, x, y, ink, alpha = 1, size = 1) => {
      if (ch === ' ' || alpha <= 0.02) return;
      const k = c.n++;
      c.chs[k] = ch; c.xs[k] = x - sx; c.ys[k] = y - sy; c.inks[k] = ink; c.alphas[k] = alpha; c.sizes[k] = size;
      r.glyph(ch, x, y, ink, alpha, size);
    };
    paintPlanet(at, sx, sy, planet, t);
    return;
  }
  const { chs, xs, ys, inks, alphas, sizes, n } = c;
  for (let k = 0; k < n; k++) r.glyph(chs[k], sx + xs[k], sy + ys[k], inks[k], alphas[k], sizes[k]);
}

let ringIn = new Uint8Array(0), ringBits = new Uint8Array(0), ringOrder = new Int32Array(0);
let ringW = 0, ringOx = 0, ringOy = 0, ringCount = 0;
// An edge `bits` of the corner (i, j) of the grid above: the corner is listed the first time one meets it.
function ringJoin(i, j, bits) {
  const corner = (j + ringOy) * ringW + i + ringOx;
  if (!ringBits[corner]) ringOrder[ringCount++] = corner;
  ringBits[corner] |= bits;
}
// `fill: false` draws the outline alone (the fills sheet, labs/graphics/sketches/rock-fills.html). `over`: the rocks
// in front of this one that overlap it, each { dx, dy, rock } from this rock's middle in screen px (rocksOver); no
// cell of this rock is drawn inside them, so where two rocks overlap one stands in front of the other (SX, 2026-10-01,
// late: «они некрасиво стали накладываться друг на друга»). `angle`: the turn it is drawn at, the rock's own unless asked.
export function drawAsteroid(r, sx, sy, rock, { fill = true, over = null, angle = rock.angle } = {}) {
  const R = rock.radius;
  if (!r.onScreen(sx, sy, R * 1.3)) return;
  const hidden = over?.length ? (x, y) => over.some((o) => coveredBy(o, x, y, r.cellW)) : null;
  // Drawn from its kept steps; what follows is the step worked out (drawRockSteps, its renderer `keepingRock`).
  if (!r.keepingRock) return drawRockSteps(r, sx, sy, rock, fill, hidden);
  const nx = Math.ceil(R * 1.2 / r.cellW), ny = Math.ceil(R * 1.2 / r.cellH);
  // Which cells of the grid are inside the rock, once each (the ring of one cell round the rock's own grid, for its neighbours), and
  // at each corner the edges that meet there, in the order the corners are first met. A rock's step is worked out as it turns to the
  // next degree, several a frame in a field, and each time this made a closure, a Map of corners and four more closures; the grids
  // are kept between calls (ringIn, ringBits, ringOrder) and read by ringJoin.
  ringW = 2 * nx + 3; ringOx = nx + 1; ringOy = ny + 1;
  const cells = ringW * (2 * ny + 3);
  if (cells > ringIn.length) { ringIn = new Uint8Array(cells); ringBits = new Uint8Array(cells); ringOrder = new Int32Array(cells); }
  for (let j = -ny - 1; j <= ny + 1; j++) for (let i = -nx - 1; i <= nx + 1; i++) {
    const x = i * r.cellW, y = j * r.cellH / .94;
    ringIn[(j + ringOy) * ringW + i + ringOx] = hypot2(x, y) <= rock.radiusAt(Math.atan2(y, x) - angle) ? 1 : 0;
  }
  ringBits.fill(0, 0, cells);
  ringCount = 0;
  for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) {
    const at = (j + ringOy) * ringW + i + ringOx;
    if (!ringIn[at]) continue;
    if (!ringIn[at - ringW]) { ringJoin(i, j, 2); ringJoin(i + 1, j, 8); }
    if (!ringIn[at + ringW]) { ringJoin(i, j + 1, 2); ringJoin(i + 1, j + 1, 8); }
    if (!ringIn[at - 1]) { ringJoin(i, j, 4); ringJoin(i, j + 1, 1); }
    if (!ringIn[at + 1]) { ringJoin(i + 1, j, 4); ringJoin(i + 1, j + 1, 1); }
  }
  for (let n = 0; n < ringCount; n++) {
    const corner = ringOrder[n], bits = ringBits[corner];
    const i = (corner % ringW) - ringOx, j = Math.floor(corner / ringW) - ringOy;
    const x = (i - .5) * r.cellW, y = (j - .5) * r.cellH;
    if (hidden && hidden(x, y)) continue;
    r.glyph(edgeGlyph[bits], sx + x, sy + y, i + j < 0 ? ROCK_INKS.lit : ROCK_INKS.shade, ROCK_INKS.edge);
  }
  if (fill) shadeAsteroid(r, sx, sy, rock, hidden, angle);
}

// A rock's outline and shade worked out once per ROCK_STEP of its turn (the effects audit of 2026-10-06, path #9; a lab switch until
// SX compared it by eye and took it into the game, 2026-10-07): drawn at the nearest step's angle, its cells kept from the rock's
// middle until it turns to the next one, and laid where it is every frame; the rocks in front of it (`hidden`) are still asked each
// frame, they move. A degree moves a 130 u rim by under a cell: the outline and the shade turn in whole degrees, a cell flipping up
// to half a degree early or late.
const ROCK_STEP = Math.PI / 180;
function drawRockSteps(r, sx, sy, rock, fill, hidden) {
  const step = Math.round(rock.angle / ROCK_STEP);
  let c = rock.steps;
  if (!c || c.step !== step || c.cw !== r.cellW || c.ch !== r.cellH || c.R !== rock.radius || c.fill !== fill) {
    c = rock.steps ??= { chs: [], xs: [], ys: [], inks: [], alphas: [], n: 0 };
    Object.assign(c, { step, cw: r.cellW, ch: r.cellH, R: rock.radius, fill, n: 0 });
    const at = Object.create(r);
    at.keepingRock = true;
    at.onScreen = () => true;
    at.glyph = (ch, x, y, ink, alpha = 1) => {
      const k = c.n++;
      c.chs[k] = ch; c.xs[k] = x; c.ys[k] = y; c.inks[k] = ink; c.alphas[k] = alpha;
    };
    drawAsteroid(at, 0, 0, rock, { fill, angle: step * ROCK_STEP });
  }
  const { chs, xs, ys, inks, alphas, n } = c;
  for (let k = 0; k < n; k++) {
    if (hidden && hidden(xs[k], ys[k])) continue;
    r.glyph(chs[k], sx + xs[k], sy + ys[k], inks[k], alphas[k]);
  }
}
// Whether a point (x, y) from a rock's middle lies inside the rock `o` in front of it, with `OVER_MARGIN` of a cell
// more, so the outline behind stops short of the one in front instead of running into it.
export const OVER_MARGIN = 0.7;
function coveredBy(o, x, y, cw) {
  const px = x - o.dx, py = (y - o.dy) / .94;
  const d = hypot2(px, py);
  if (d > o.rock.radius * 1.25 + cw) return false;
  return d <= o.rock.radiusAt(Math.atan2(py, px) - o.rock.angle) + OVER_MARGIN * cw;
}

// The rocks in front of `rock` that overlap it, from its own middle in px: the smaller one in front, and of two
// alike the later in the list. `delta(a, b)` is the way from a to b (the world's, across a seam).
export function rocksOver(rock, rocks, delta) {
  const out = [];
  const at = rocks.indexOf(rock);
  for (let k = 0; k < rocks.length; k++) {
    const b = rocks[k];
    if (b === rock || b.radius > rock.radius || (b.radius === rock.radius && k < at)) continue;
    const d = delta(rock, b);
    if (hypot2(d.x, d.y) > (rock.radius + b.radius) * 1.25) continue;
    out.push({ dx: d.x, dy: d.y, rock: b });
  }
  return out;
}

const ROCK_LIGHT = (() => {
  const L = CONFIG.planet.light, n = Math.hypot(L.x, L.y, L.z);
  return { x: L.x / n, y: L.y / n, z: L.z / n };
})();
// The rough surface (SX, 2026-10-02: «шейдинг у астероидов должен быть не одна сплошная дуга с края, она должна
// рандомно имитировать скорее средние и мелкие шероховатости на его поверхности и приблизительно двигаться так чтобы
// соответствовать изменению контура в этот момент ... имитация освещения, просто условно микро движок ... чтобы на это
// вообще особо ресурсов не требовалось»). A rock's own dents and knobs: `bumps` medium ones (craters mostly, a few
// knobs) in the rock's own frame, so they turn with its outline, and a fine grain of value noise `grain` radii across,
// also the rock's own. Each tilts the ball's surface under the sky's fixed light: a crater's near wall goes dark and its
// far wall catches the light, a knob the other way round, the grain breaks the terminator. The light's change from all
// of them is added to the ball's (`lit`) and the cell takes the one '░' step under ROCK_LIT as before, so the shaded side
// breaks into patches and the lit side carries the craters' small shadows, all moving as the rock turns. A rock's bumps
// are made once, from its outline's numbers; a cell costs the ball's sum plus `bumps` short sums, no allocation.
// Then (SX, the same night: «в астероидах все еще большой банан, вот эта тени. Я бы хотел, чтобы они еще по мельче были.
// И подробнее ... этот банан большой тени закругляющий, как-то неправильно выглядит ... не иммерсивно и не чисто»): the
// ball's own light kept at `ball` of itself, pulled toward `level`, so the crescent goes and the dark side only leans
// darker; the bumps smaller and more of them, the grain finer (four settings compared side by side; this one kept the
// rock's roundness in where the patches gather and lost the banana).
// (ROCK_RELIEF, the numbers, is in art-tones.js since chat G, 2026-10-04: the garage's stone takes them too.)
const relief = new WeakMap();
function reliefOf(rock, RR = ROCK_RELIEF) {
  let f = relief.get(rock);
  if (f && f.RR === RR) return f;
  // Seeded by the outline (a rock keeps it whole life), so a rock's surface is its own and stays.
  let seed = 2166136261;
  for (const p of rock.profile) seed = Math.imul(seed ^ Math.round(p * 1e6), 16777619) >>> 0;
  const rng = mulberry32(seed);
  const R = RR, n = R.bumps[0] + Math.floor(rng() * (R.bumps[1] - R.bumps[0] + 1));
  const bumps = [];
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, at = Math.sqrt(rng()) * 0.78;
    bumps.push({ x: Math.cos(a) * at, y: Math.sin(a) * at, s: lerp(R.size[0], R.size[1], rng()),
      h: (rng() < R.knobs ? 1 : -1) * (0.6 + 0.4 * rng()) });
  }
  f = { bumps, gx: rng() * 64, gy: rng() * 64, RR };
  relief.set(rock, f);
  return f;
}
function grainHash(a, b) {
  let q = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  q = Math.imul(q ^ (q >>> 13), 1274126177) >>> 0;
  return ((q ^ (q >>> 16)) >>> 0) / 4294967296;
}
function grainAt(x, y) {
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const p = grainHash(i, j), q = grainHash(i + 1, j), w = grainHash(i, j + 1), z = grainHash(i + 1, j + 1);
  return p + (q - p) * su + (w - p) * sv + (p - q - w + z) * su * sv;
}
function shadeAsteroid(r, sx, sy, rock, hidden = null, angle = rock.angle) {
  const step = ROCK_SHADE.half, RR = ROCK_RELIEF;
  const cw = r.cellW, ch = r.cellH, R = rock.radius;
  const nx = Math.ceil(R * 1.2 / cw), ny = Math.ceil(R * 1.2 / ch);
  // The sky's light in the rock's own frame, where its bumps are: turned back by the rock's angle.
  const { bumps, gx, gy } = reliefOf(rock, RR);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const lx = ROCK_LIGHT.x * ca + ROCK_LIGHT.y * sa, ly = -ROCK_LIGHT.x * sa + ROCK_LIGHT.y * ca;
  for (let j = -ny; j <= ny + 1; j++) for (let i = -nx; i <= nx + 1; i++) {
    const x = (i - .5) * cw, y = (j - .5) * ch, yy = y / .94;
    const dist = hypot2(x, yy);
    if (dist > R * 1.2) continue;
    const edge = rock.radiusAt(Math.atan2(yy, x) - angle);
    const ux = dist > 1e-6 ? x / dist : 0, uy = dist > 1e-6 ? yy / dist : 0;
    if (dist > edge - SHADE_GAP * hypot2(cw * ux, ch * uy)) continue;
    const q = dist / edge, z = Math.sqrt(Math.max(0, 1 - q * q));
    const ball = dist > 1e-6 ? Math.max(0, (x / dist) * q * ROCK_LIGHT.x + (yy / dist) * q * ROCK_LIGHT.y + z * ROCK_LIGHT.z) : ROCK_LIGHT.z;
    let lit = RR.level + (ball - RR.level) * RR.ball;
    // Where the cell is on the rock itself, in radii of the rock's own frame (scaled to its outline here, so the bumps
    // keep to the surface as a lobe swells or shrinks past).
    const k = q / Math.max(dist, 1e-6);
    const px = (x * ca + yy * sa) * k, py = (-x * sa + yy * ca) * k;
    // A bump of height h and radius s: (1 - d^2)^2 inside it; its slope toward the light lights it, away darkens it.
    let tilt = 0;
    for (const b of bumps) {
      const dx = (px - b.x) / b.s, dy = (py - b.y) / b.s, d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      tilt += b.h * 4 * (1 - d2) * (dx * lx + dy * ly) / b.s * 0.1;
    }
    lit += (tilt * RR.strength + (grainAt(px / RR.grain + gx, py / RR.grain + gy) - 0.5) * 2 * RR.grit) * (0.35 + 0.65 * z);
    if (lit > ROCK_LIT) continue;
    if (hidden && hidden(x, y)) continue;
    r.glyph(step.ch, sx + x, sy + y, ROCK_INKS.shade, ROCK_INKS.fill);
  }
}

const SPRITE_ART = {
  // Rounded corners and a lighter strap (SX, 2026-09-30: «Сделай всем сундукам
  // закругленные края», «чуть тогда преобразил наши базовые сундуки еще»): the
  // same crate, its lock still pulsing in the middle of the lid's seam. Then
  // «Сундуки крупноваты, и углы ты забыл сделать закругленными»: a corner arc is
  // half a cell, so on nine cells it read as square; the crate is seven cells
  // wide inside the sprite's nine (its bounds are the asset's), and smaller
  // (CONFIG.cache.scale).
  'cache-sealed': {
    rows: [' ╭─┬─┬─╮ ', ' │:│ │:│ ', ' ├─┤▪├─┤ ', ' │:│ │:│ ', ' ╰─┴─┴─╯ '],
    roles: [' mmmmmmm ', ' mss ssm ', ' msssssm ', ' mss ssm ', ' mmmmmmm '],
  },
  // The cargo container is a chest too, and rounds its corners with the caches.
  'cargo-container': {
    rows: ['╭─┬─╮', '│ ╧ │', '├─┬─┤', '│:│:│', '├─┴─┤', '│ · │', '╰───╯'],
    roles: ['mmhmm', 'm h m', 'msssm', 'msssm', 'msssm', 'm s m', 'mmmmm'],
  },
};
const spriteRoles = { m: ROLES.material, s: ROLES.structure, h: ROLES.highlight };
export function spriteVariant(id, original) {
  const art = SPRITE_ART[id];
  if (!art) return original;
  const variant = structuredClone(original);
  if (art.rows.length !== original.height || art.rows.some(row => row.length !== original.width)) throw new RangeError(`${id}: lab sprite bounds changed`);
  variant.palette = Object.entries(spriteRoles).map(([key, color]) => ({ key, color }));
  variant.frames = original.frames.map((_, frame) => {
    const colors = [...art.roles];
    // The sealed cache keeps its existing two-pose lock pulse and file rate.
    if (id === 'cache-sealed') colors[2] = ` mss${frame % 2 ? 's' : 'h'}ssm `;
    return { glyphs: [...art.rows], colors, accent_mask: art.rows.map(row => ' '.repeat(row.length)) };
  });
  // Keep the active-frame mirror and original frame timing/pivot metadata.
  Object.assign(variant, variant.frames[original.active || 0]);
  return variant;
}

// The sky's inks by depth layer, far to near (the order of CONFIG.starfield.layers).
// Each layer's own alpha, the lab's `sky` scale and the whole sky's CONFIG.starfield.opacity come on top of these; roles.js
// says why they sit where they do, and checks/planets.mjs holds the steps they
// make on black (visible, ordered by depth, quieter than the interface's text).
export const STAR_ROLES = Object.freeze([ROLES.starFar, ROLES.starMid, ROLES.starNear]);
// How much each layer is lifted over its authored alpha, far to near (SX,
// 2026-09-30, again: «Фоновые звезды и их паралакс опять слишком тусклые видно
// только первый слой звезд»). The far dust and the middle layer were 1.95 and
// 2.92 to 1 on black at their peaks, under the near stars' 6.04, and read as
// nothing: lifted, they sit near 2.8 and 4.6, and the near layer stays where it
// is, under the interface's grey text (checks/planets.mjs holds the steps).
export const STAR_LIFT = Object.freeze([1.48, 1.32, 1]);
// The hidden sector's sky is pink (SX, 2026-10-01: «покрась в секретной локации звезды в розовый оттенок»): each
// layer's ink turned to a pink of the same OKLab lightness (hue 350, chroma 0.11 / 0.09 / 0.06, far to near), so
// the sky keeps its depth steps on black: 4.7, 7.2 and 14.8 to 1 against the blues' and greys' 5.0, 7.5 and 15.2.
export const STAR_PINK = Object.freeze(['#AB5E84', '#C684A3', '#FBCCE1']);

export function createWorldPresentation(world, settings) {
  const attached = new WeakSet(), originals = new Map();
  const attach = (object, draw) => {
    if (attached.has(object)) return object;
    object.draw = draw;
    attached.add(object);
    return object;
  };
  const bodies = group => {
    // SX chose a stable mix of both planet families; black holes stay native.
    // Every planet, the classic ones too, is drawn from its list on the refresh tier (tieredPlanet), its look's painter
    // (paintPlanet: blocks, as before, the looks of 2026-10-02, the classic's own draw) run on the planet's beat.
    group.planets.forEach(p => attach(p, function (r, x, y, t) { tieredPlanet(r, x, y, this, t); }));
    group.stations.forEach(s => {
      // A look is drawn at its own size: the menus stand clear of that, not of the model's.
      const look = s.look ? stationLook(s.look) : null;
      // The station itself, without its external dock and the ship it holds (station-art.js `core`, its middle the look's origin).
      if (look) s.footprint = { model: { width: look.core?.W ?? look.W, height: look.core?.H ?? look.H }, scale: LOOK_SCALE };
      else if (s.kind === 'home') {
        // The drawing's own box (BOARD_INK), off the board's middle by as much (`dx`, `dy` are screen cells: scaled here).
        const I = BOARD_INK;
        s.footprint = { model: { width: I.x1 - I.x0 + 1, height: I.y1 - I.y0 + 1 }, scale: LOOK_SCALE,
          dx: ((I.x0 + I.x1) / 2 - (BOARD.W - 1) / 2) * LOOK_SCALE, dy: ((I.y0 + I.y1) / 2 - (BOARD.H - 1) / 2) * LOOK_SCALE };
      }
      attach(s, function (r, x, y) {
        // A ruin as far rebuilt as it is; a working station a wreck broke a little broken (CONFIG.station), one a raid
        // was lost at as much as the raid took (src/raids.js), a restored ruin among them.
        const broken = world.ledger.broken?.has(this.id) ? world.ledger.brokenLook?.get(this.id) ?? CONFIG.station.brokenLook : 1;
        const rebuilt = Math.min(broken, this.kind === 'ruin' ? rebuiltShare(world.ledger, this) : 1);
        // COMMONS's AI speaking (src/chorus.js): its look's lamps answer each piece (the RING look reads `S.voice`).
        if (look) look.S.voice = chorusVoice(world, this.id);
        // Under the pointer it stays its size: the pointer shows its window instead (SX, 2026-10-04; labs/graphics/world-pointer.js).
        drawStation(r, x, y, this, world.docked === this.id || world.selected?.id === this.id, rebuilt, world.time, LOOK_SCALE,
          this.kind === 'home' ? homeDockState(world, this) : stationDockState(world, this), this.angle);
      });
    });
    return group;
  };
  const rockDelta = (a, b) => world.delta(b.x, b.y, a.x, a.y);   // from a to b: the world's delta is its first point less its second
  // A rock or a pirate the ship is up over in a jump darkens a little (src/trick.js passedOver).
  const asteroid = rock => attach(rock, function (r, x, y) {
    // A rock off the screen draws nothing (drawAsteroid's own cull, the same test): its overlaps with the sector's other rocks and the
    // hull's shade over it are not worked out for it either (the effects audit of 2026-10-06, path #4: rocksOver ran for every rock
    // of the sector, about 10k objects a frame in a field). The shade's memory (src/trick.js underShip) waits for it unchanged: off the
    // screen a rock is never under the hull, so it only fades, and a fade is the same in one step as in many (a step is held to a
    // second, by which the fade is gone in either way).
    if (!r.onScreen(x, y, this.radius * 1.3)) return;
    drawAsteroid(passedOver(world, r, this, x, y, this.radius), x, y, this, { over: rocksOver(this, world.asteroids, rockDelta) });
  });
  // A pirate keeps its own drawing (src/pirates.js drawPirate, SX's BRUTE, MAW,
  // WARLORD and DART in their squads' paints); the paints and the guns' orange pass
  // through, anything else resolves by role as the ship's does, so a colour that
  // is neither would show in the unassigned-materials diagnostics.
  const pirateDraw = Pirate.prototype.draw;
  const pirate = craft => attach(craft, function (r, ...args) {
    return pirateDraw.call(this, inkRenderer(r, ink => (ink === CONFIG.pirates.ink ? ROLES.caution
      : PIRATE_INKS.has(ink) ? ink : shipInk(ink)), underShip(world, r, this, args[0], args[1], this.radius)), ...args);
  });
  // A station's own light tone, for what goes to it (the containers' bodies, src/worldDraw.js cargoInks): its look's `lit`, or null.
  world.stationHue = (id) => { const def = stationDefById(id); const look = def?.look ? stationLook(def.look) : null; return look?.tone?.lit ?? null; };
  // A station's own cargo, SX's twelve (labs/graphics/cargo-art.js), at a job's size; null for a station without one (HOME).
  world.cargoArt = (id, size) => { const look = stationDefById(id)?.look; return look ? cargoArt(look, size) : null; };
  const sectorBodies = world.sectorBodies;
  world.sectorBodies = function (...args) { return bodies(sectorBodies.apply(this, args)); };
  for (const group of world.bodyCache.values()) bodies(group);
  // The pilot's ship: SX's frame 0 and the motion SX chose (2026-09-30: A, the puffs,
  // with the cockpit glass; labs/graphics/ship-motion.js) in place of the exhaust loop,
  // in the roles' inks and the pilot's paint. The motion steps by the world's own clock,
  // so it holds still while the game is paused.
  const motion = createShipMotion();
  let motionAt = null;
  attach(world.ship, function (r, sx, sy) {
    if (!this.alive) { motionAt = null; return; }
    if (api.shipHidden) return;
    const now = world.time, dt = motionAt === null ? 0 : Math.min(0.1, Math.max(0, now - motionAt));
    motionAt = now;
    const speed = Math.hypot(this.vx, this.vy);
    // The home garage flies the ship in and out (src/home.js): the burns it asks of the engines are drawn, the pilot's stick and
    // brake are not. A station's dive and rise (src/docking.js) ask none.
    const driven = !!world.home || !!world.berth;
    const flying = !world.docked || driven;
    stepShipMotion(motion, {
      thrust: flying && this.thrusting, retro: flying && this.retroing, turn: flying && !driven ? this.turnInput || 0 : 0,
      brake: flying && !driven && this.braking && speed > 30, speed,
    }, dt);
    const paint = (ship, x, y) => {
      const inks = flownShipInks(world, ship.thrusting || ship.retroing);
      drawPilotShip(r, ship, x, y, motion, inks.ink, inks.paint, { docked: !!world.docked, reducedMotion: api.reducedMotion, shade: api.shipShade,
        brake: api.shipShade, braking: api.shipBraking, scramble: api.shipScramble });
    };
    // Diving into a station's dock or out of it, and rising (src/docking.js, labs/graphics/dock-fx.js): grown or shrunk, sunk, faded;
    // not drawn at all while it is under the station.
    const docking = world.berth && !world.home ? shipDockLook(dockLook(world), { reducedMotion: api.reducedMotion }) : null;
    if (docking) {
      if (docking.hidden || docking.alpha <= 0.01) return;
      const m = this.metrics || this.measureDrawing(r.cellW, r.cellH), model = Object.create(this.model);
      model.scale = this.model.scale * docking.grow;
      const ship = Object.create(this, { model: { value: model }, metrics: { value: { ...m, w: m.w * docking.grow, h: m.h * docking.grow } } });
      const inks = flownShipInks(world, false);
      drawPilotShip(r, ship, sx, sy + docking.dy, motion, inks.ink, inks.paint, { docked: true, reducedMotion: api.reducedMotion, shade: (api.shipShade ?? 1) * docking.alpha,
        brake: api.shipShade });
      return;
    }
    // Up in a jump, or squashed by its contact (src/trick.js): lifted, grown, folded by a figure.
    const look = world.stunts?.trick ? airLook(world, { reducedMotion: api.reducedMotion }) : null;
    if (look) drawAirShip(this, sx, sy, look, paint); else paint(this, sx, sy);
  });
  // The cargo dives and rises with the hull (src/worldDraw.js draws it this faint): unseen while the hull is under the station, and
  // stowed in the station while the ship stands on a pad (src/docking.js cargoStowed).
  world.cargoShade = () => {
    if (!world.docked || world.home) return 1;
    if (cargoStowed(world)) return 0;
    const d = world.berth ? shipDockLook(dockLook(world), { reducedMotion: api.reducedMotion }) : null;
    return !d ? 1 : d.hidden ? 0 : d.alpha;
  };
  const starsDraw = world.starfield.draw;
  const starInk = new Map();
  world.starfield.layers.forEach(({ stars }, i) => stars.forEach(s => starInk.set(s.color, STAR_ROLES[i])));
  const lift = new Map(STAR_ROLES.map((role, i) => [role, STAR_LIFT[i]]));
  const pink = new Map(STAR_ROLES.map((role, i) => [role, STAR_PINK[i]]));
  // The sky is drawn through one adapter kept for the renderer, its `glyph` one closure that reads `skyHidden` as it stands: a new adapter
  // and a new glyph closure each frame were a call V8 could not inline, so each star's numbers were boxed (~15 KB of garbage a frame
  // in flight, 2026-10-09).
  let skyOf = null, skyAdapter = null, skyHidden = false;
  attach(world.starfield, function (r, camX, camY, t, occluders, lean) {
    if (skyOf !== r) {
      skyOf = r;
      skyAdapter = Object.create(r);
      skyAdapter.glyph = (c, x, y, ink, a = 1, s = 1) => {
        const role = starInk.get(ink) || ROLES.starFar;
        r.glyph(c, x, y, skyHidden ? pink.get(role) : role, Math.min(1, a * (settings.sky / 100) * (lift.get(role) ?? 1)) * CONFIG.starfield.opacity, s);
      };
    }
    skyHidden = !!world.sector?.hidden;
    return starsDraw.call(this, skyAdapter, camX, camY, t, occluders, lean);
  });
  const particlesDraw = world.particles.draw;
  const effectInk = new Map([
    ['#ffffff', ROLES.highlight], ['#ffe7a3', ROLES.caution], ['#ffd27f', ROLES.caution], ['#ff9d4d', ROLES.caution], ['#e2603a', ROLES.danger],
    ['#8c8579', ROLES.material], ['#98a1ab', ROLES.material], ['#b6f5ee', ROLES.interactionActive], ['#c9cfd6', ROLES.material], ['#b79bff', ROLES.structure],
  ]);
  attach(world.particles, function (r, project) {
    // A pirate's chips keep its paint (src/pirates.js PIRATE_INKS), its guns' orange the caution role. A piece of
    // the pilot's own hull (src/debris.js chipHull, bumps) is in the hull's paint, as the ship is drawn (SX, 2026-10-01:
    // «деталь цвета нашего корабля отлетает»). A broken NPC's or station's pieces (`raw`, src/debris.js) keep the inks they were
    // drawn in, as the NPC and the station are: the plain renderer.
    return particlesDraw.call(this, inkRenderer(r, ink => ROLE_INKS.has(ink) ? ink
      : ink === CONFIG.pirates.ink ? ROLES.caution : PIRATE_INKS.has(ink) ? ink
        : effectInk.get(ink?.toLowerCase()) || shipInk(ink, false, world.pilot?.paint)), project, r);
  });
  // A station's own cells for the pieces a wreck knocks off it (src/debris.js stationDebris): its look's cells as drawn now, about
  // its middle in world units at the game's size, its inks kept. The home garage and a station without a look: none (the world's own
  // box strokes then).
  world.stationPieces = (station) => {
    const look = station.kind !== 'home' && station.look ? stationLook(station.look) : null;
    if (!look) return null;
    const w = CONFIG.render.fontSize * 0.62 * LOOK_SCALE, h = CONFIG.render.fontSize * CONFIG.render.lineRatio * LOOK_SCALE, out = [];
    const c = Math.cos(station.angle ?? 0), s = Math.sin(station.angle ?? 0);   // turned with it in the float (src/float.js)
    const o = lookOrigin(look);
    stationCells(look, world.time, (x, y, ch, ink, alpha) => {
      if (ch === ' ' || alpha < 0.3) return;
      const dx = (x - o.x) * w, dy = (y - o.y) * h;
      out.push({ ch, color: ink, dx: dx * c - dy * s, dy: dx * s + dy * c, size: LOOK_SCALE, raw: true });
    });
    return out;
  };
  // The boss (src/boss.js), drawn with the stations' rule for what has come off it (RUIN).
  world.drawBoss = (r) => drawBossArt(r, world, RUIN);
  const api = {
    // Set by the page from prefers-reduced-motion: the respawn blink holds steady.
    reducedMotion: false,
    // Set by the page while the pause's toy ship stands in for the pilot's (labs/graphics/pause-toy.js): it is not drawn.
    shipHidden: false,
    // Set by the page each frame with the ship's scale (src/visualScale.js brakeShade): its hull this much as opaque.
    shipShade: 1,
    // Set by the page each frame: the brake held, as the scale reads it (a drawing's brake pose, drawPilotShip).
    shipBraking: false,
    // Set by the page each frame: the ship back from a wreck, mixed (labs/graphics/respawn-fx.js scrambleOf), or null.
    shipScramble: null,
    prepare() { world.asteroids.forEach(asteroid); world.pirates.forEach(pirate); },
    captureSprite(id, raw) { if (SPRITE_ART[id]) originals.set(id, structuredClone(raw)); },
    refresh() {
      // The credit registry entry is never captured, replaced or recoloured.
      for (const [id, raw] of originals) registerSprite(id, spriteVariant(id, raw));
    },
  };
  return api;
}
