// The eight planet types SX picked on labs/graphics/sketches/planets-stations.html (2026-10-14, «N1 STORM ... Берем» to «N8 SHELL ... берем»),
// in the game as `CONFIG.planet.styles` of their own beside classic, blocks, split, ringed and cratered: each a painter on the planet's own
// cells (Planet.cellsFor), its lit tone and its second ink the catalogue's `tint` and `tint2` (src/sectors.js), its numbers the sheet's.
// SX's words on each, followed here: GLACIER without its caps, one even texture; FORGE's lava in a violet light (its `tint2`); FACETS much simpler, in
// metal (one ink); NIGHTSIDE's towns in a saturated blue of the planet's (its `tint2`); SHELL's lattice pink and its core as light (the
// catalogue's two inks). TIDEWATER and DUNES are painted here too; where they stand on the map is the next step (a map revision).
// Look only: the page's (labs/graphics/world-art.js paintPlanet), never the simulation's.
import { CONFIG } from '../../src/config.js';
import { planetHue } from '../../src/sectors.js';
import { TAU, clamp, mulberry32, fbmWrapped, rampGlyph, mixHex } from '../../src/util.js';
import { planetTones } from './art-tones.js';

const wrapAngle = (a) => a - TAU * Math.round(a / TAU);
const RAMP = CONFIG.planet.ramp;
// A step of a hue's ramp from its dark to its tint, in sixteenths (so a planet is a few dozen inks, as the game's are).
const inkCache = new Map();
function step(dark, tint, m) {
  const q = Math.round(clamp(m, 0, 1) * 16), k = `${dark}${tint}${q}`;
  let c = inkCache.get(k);
  if (c === undefined) inkCache.set(k, (c = mixHex(dark, tint, q / 16)));
  return c;
}
const hashCell = (i, j, s) => { let h = Math.imul(i * 374761393 + j * 668265263 + s * 2147483647, 1274126177); h ^= h >>> 13; return ((Math.imul(h, 1103515245) >>> 0) % 10007) / 10007; };
// A line's glyph for its direction on the screen (dx, dy; y down).
function lineGlyph(dx, dy) {
  let a = Math.atan2(dy, dx); if (a < 0) a += Math.PI; if (a >= Math.PI) a -= Math.PI;
  return a < Math.PI / 8 || a >= 7 * Math.PI / 8 ? '─' : a < 3 * Math.PI / 8 ? '╲' : a < 5 * Math.PI / 8 ? '│' : '╱';
}

// Every cell of `planet`'s disc and thin atmosphere at (sx, sy): the atmosphere as the classic planet draws it (or `atmo` ink, or
// none), each body cell handed to `cell(c)` with its longitude (turned by the spin), latitude, the light on it and its place.
function eachCell(r, sx, sy, planet, cell, { atmo = planet.tint } = {}) {
  if (!r.onScreen(sx, sy, planet.rim)) return;
  const { n, kind, rim, ox, oy, a, ty, lat, diffuse } = planet.cellsFor(r);
  const R = planet.radius, c = { r, planet, x: 0, y: 0, i: 0, j: 0, lon: 0, lat: 0, ty: 0, tx: 0, light: 0, u: 0, v: 0, a0: 0 };
  for (let k = 0; k < n; k++) {
    const px = sx + ox[k], py = sy + oy[k];
    if (kind[k] === 1) { if (atmo) r.glyph(CONFIG.planet.rimGlyphs[rim[k]], px, py, atmo, a[k]); continue; }
    c.x = px; c.y = py; c.i = Math.round(ox[k] / r.cellW); c.j = Math.round(oy[k] / r.cellH);
    c.a0 = a[k]; c.lon = a[k] + planet.phase; c.lat = lat[k]; c.ty = ty[k]; c.tx = (c.lon / TAU) * 12;
    c.light = diffuse[k]; c.u = ox[k] / R; c.v = oy[k] / R;
    cell(c);
  }
}
const tonesOf = (tint) => planetTones({ tint, dark: planetHue(tint).dark });

const TYPES = [
  {
    code: 'N1', name: 'STORM', ru: 'ГАЗОВЫЙ ГИГАНТ',
    idea: 'Полосы по широте, их края — тонкие линии ─; одно большое око бури, закрученное, плывёт с поверхностью. Две краски: пояса и зоны.',
    planet: { radius: 430, tint: '#D8B48E', tint2: '#B7A0C9', seed: 5101, spin: 0.05 },
    paint(r, sx, sy, p, t) {
      const T1 = tonesOf(p.tint), T2 = tonesOf(p.tint2), d1 = planetHue(p.tint).dark, d2 = planetHue(p.tint2).dark;
      // The eye stands on the near side when the sheet opens (its longitude fixed on the surface from the start's phase).
      const eye = { lon: (p.eyeLon ??= p.phase + 0.35), lat: 0.32, a: 0.5, b: 0.2 };
      eachCell(r, sx, sy, p, (c) => {
        const L = c.light;
        if (L < 0.05) { if ((c.i + c.j) % 4 === 0) r.glyph('·', c.x, c.y, T1.shadow, 0.8); return; }
        const warp = fbmWrapped(c.tx, c.ty, 12, p.seed, 3);
        const el = wrapAngle(c.lon - eye.lon) / eye.a, eb = (c.lat - eye.lat) / eye.b, e = el * el + eb * eb;
        const alpha = clamp(0.4 + L * 0.8, 0, 1);
        if (e < 1) {
          // The eye: a spiral of two arms turning against the surface.
          const arm = (Math.atan2(eb, el) + Math.sqrt(e) * 5.5 - t * 0.5) / TAU * 2;
          const on = arm - Math.floor(arm) < 0.42;
          r.glyph(e < 0.08 ? '@' : on ? '%' : ':', c.x, c.y, step(d2, p.tint2, 0.45 + 0.55 * L + (on ? 0.1 : 0)), alpha);
          return;
        }
        const band = Math.sin(c.lat * 9 + warp * 4.2);
        if (Math.abs(band) < 0.13) { r.glyph('─', c.x, c.y, step(d1, p.tint, 0.4 + 0.6 * L), alpha); return; }
        const shade = clamp(0.1 + L * (0.4 + 0.6 * warp), 0, 0.999);
        const ch = rampGlyph(' .:-=+*', shade);
        if (ch === ' ') return;
        if (band > 0) r.glyph(ch, c.x, c.y, step(d1, p.tint, 0.3 + 0.75 * warp), alpha);
        else r.glyph(ch, c.x, c.y, step(d2, p.tint2, 0.3 + 0.75 * warp), alpha);
      }, { atmo: T1.mid });
    },
  },
  {
    code: 'N2', name: 'GLACIER', ru: 'ЛЕДЯНАЯ',
    idea: 'Светлый лёд редкими точками, по нему сеть трещин тонкими линиями ─ │ ╱ ╲ во второй краске; полярные шапки блоками.',
    planet: { radius: 300, tint: '#DCEAF2', tint2: '#7FA6D9', seed: 5202, spin: -0.07 },
    paint(r, sx, sy, p) {
      const T1 = tonesOf(p.tint), d1 = planetHue(p.tint).dark, d2 = planetHue(p.tint2).dark;
      eachCell(r, sx, sy, p, (c) => {
        const L = c.light;
        if (L < 0.06) { if ((c.i + 2 * c.j) % 5 === 0) r.glyph('·', c.x, c.y, T1.shadow); return; }
        const alpha = clamp(0.45 + L * 0.7, 0, 1);
        // No polar caps (SX, 2026-10-14: «наверху 1 плотная линия нужно ее поправить сделать однородным»): at a planet's size the cap past
        // 1.25 rad of latitude was one row of blocks along the top, a dense line; the ice and its cracks go on to the edge, one texture.
        // Cracks: where a finer noise crosses its middle; the line follows the crossing.
        const X = (c.lon / TAU) * 24, Y = c.ty * 2, e = 0.04;
        const f = fbmWrapped(X, Y, 24, p.seed + 7, 3);
        if (Math.abs(f - 0.5) < 0.022) {
          const gx = fbmWrapped(X + e, Y, 24, p.seed + 7, 3) - f, gy = fbmWrapped(X, Y + e, 24, p.seed + 7, 3) - f;
          r.glyph(lineGlyph(-gy * Math.cos(c.lat), gx), c.x, c.y, step(d2, p.tint2, 0.55 + 0.45 * L), alpha);
          return;
        }
        const s = 0.15 + L * (0.55 + 0.5 * fbmWrapped(c.tx, c.ty, 12, p.seed, 2));
        const ch = s > 0.97 ? '░' : s > 0.55 ? ':' : s > 0.3 && (c.i + c.j) % 2 === 0 ? '·' : null;
        if (ch) r.glyph(ch, c.x, c.y, step(d1, p.tint, 0.45 + 0.55 * L), alpha);
      });
    },
  },
  {
    code: 'N3', name: 'FORGE', ru: 'ЛАВОВАЯ',
    idea: 'Пепельная кора блоками, по ней светящиеся трещины лавы во второй краске; они медленно дышат и светятся и на ночной стороне.',
    planet: { radius: 340, tint: '#A8A3B4', tint2: '#F2C46D', seed: 5303, spin: 0.06 },
    paint(r, sx, sy, p, t) {
      const T1 = tonesOf(p.tint), T2 = tonesOf(p.tint2), d1 = planetHue(p.tint).dark;
      eachCell(r, sx, sy, p, (c) => {
        const L = c.light;
        const X = (c.lon / TAU) * 24, Y = c.ty * 2;
        const g = Math.abs(fbmWrapped(X, Y, 24, p.seed + 11, 3) - 0.5);
        if (g < 0.05) {
          // Lava: its own light, a slow breath along the crack, whatever the sun.
          const breath = 0.72 + 0.28 * Math.sin(t * 1.4 + fbmWrapped(c.tx, c.ty, 12, p.seed + 3, 2) * 14);
          if (g < 0.02) r.glyph('▓', c.x, c.y, T2.lit, breath);
          else r.glyph('░', c.x, c.y, T2.mid, breath * 0.6);
          return;
        }
        if (L < 0.06) { if ((c.i + c.j) % 3 === 0) r.glyph('·', c.x, c.y, T1.shadow); return; }
        const n = fbmWrapped(c.tx, c.ty, 12, p.seed, 3);
        const ch = n > 0.56 ? '▒' : n > 0.46 ? '░' : (c.j % 2 === 0 ? '·' : null);
        if (ch) r.glyph(ch, c.x, c.y, step(d1, p.tint, 0.35 + 0.65 * L), clamp(0.5 + L * 0.6, 0, 1));
      }, { atmo: T2.mid });
    },
  },
  {
    code: 'N4', name: 'TIDEWATER', ru: 'ОКЕАН И ОБЛАКА',
    idea: 'Океан волнами ~ ≈, редкие острова блоками второй краски, сверху слой облаков, который идёт быстрее поверхности.',
    planet: { radius: 380, tint: '#7FB9D6', tint2: '#B9C48A', seed: 5404, spin: 0.045 },
    cloud: '#E6ECEF',
    paint(r, sx, sy, p, t) {
      const T1 = tonesOf(p.tint), d1 = planetHue(p.tint).dark, d2 = planetHue(p.tint2).dark, dc = planetHue(this.cloud).dark;
      eachCell(r, sx, sy, p, (c) => {
        const L = c.light;
        if (L < 0.05) return;
        const alpha = clamp(0.4 + L * 0.75, 0, 1);
        // The clouds: their own noise, turning a third faster than the ground.
        const cl = fbmWrapped(((c.lon + t * 0.025) / TAU) * 12, c.ty * 1.3, 12, p.seed + 31, 3);
        if (cl > 0.6) { r.glyph(cl > 0.68 ? '▒' : '░', c.x, c.y, step(dc, this.cloud, 0.45 + 0.55 * L), alpha); return; }
        const land = fbmWrapped(c.tx, c.ty, 12, p.seed, 4);
        if (land > 0.6) { r.glyph(land > 0.66 ? '▒' : '░', c.x, c.y, step(d2, p.tint2, 0.4 + 0.6 * L), alpha); return; }
        const s = 0.1 + L * 0.9;
        const ch = s > 0.7 ? '≈' : s > 0.4 ? '~' : (c.i + c.j) % 2 === 0 ? '-' : null;
        if (ch) r.glyph(ch, c.x, c.y, step(d1, p.tint, 0.35 + 0.65 * L), alpha);
      }, { atmo: T1.mid });
    },
  },
  {
    code: 'N5', name: 'DUNES', ru: 'ПУСТЫНЯ',
    idea: 'Гребни дюн тонкими волнами ~, между ними пустота; гребни изгибаются по шуму и идут вдоль широт. Одна краска.',
    planet: { radius: 280, tint: '#E2C59B', seed: 5505, spin: -0.09 },
    paint(r, sx, sy, p) {
      const T1 = tonesOf(p.tint), d1 = planetHue(p.tint).dark;
      eachCell(r, sx, sy, p, (c) => {
        const L = c.light;
        if (L < 0.06) { if ((c.i + c.j) % 4 === 0) r.glyph('·', c.x, c.y, T1.shadow); return; }
        const warp = fbmWrapped(c.tx, c.ty, 12, p.seed, 3);
        const f = (c.lat * 24 + warp * 9 + Math.sin(c.lon * 3) * 0.8) / TAU;
        const fr = f - Math.floor(f), alpha = clamp(0.4 + L * 0.75, 0, 1);
        if (fr < 0.2) r.glyph('~', c.x, c.y, step(d1, p.tint, 0.55 + 0.45 * L), alpha);
        else if (fr > 0.45 && fr < 0.55 && (c.i % 2 === 0)) r.glyph('.', c.x, c.y, step(d1, p.tint, 0.3 + 0.4 * L), alpha);
      }, { atmo: T1.mid });
    },
  },
  {
    code: 'N6', name: 'FACETS', ru: 'КРИСТАЛЛ',
    idea: 'Грани на поверхности: каждая — одна плоская заливка по свету, рёбра точками; каждая третья грань во второй краске. Как камень.',
    planet: { radius: 320, tint: '#B8E3E0', tint2: '#C9B6EA', seed: 5606, spin: 0.08 },
    paint(r, sx, sy, p) {
      const pts = p.facets ??= (() => {
        const rng = mulberry32(p.seed), out = [];
        for (let i = 0; i < 40; i++) { const lon = rng() * TAU, s = rng() * 2 - 1; out.push({ lon, lat: Math.asin(s) }); }
        return out;
      })();
      const Lt = CONFIG.planet.light, d1 = planetHue(p.tint).dark, T1 = tonesOf(p.tint);
      // Each facet's normal where it is now, and the light on it, once a frame.
      const lit = pts.map((q) => {
        const vl = q.lon - p.phase, cl = Math.cos(q.lat);
        const n = [Math.sin(vl) * cl, Math.sin(q.lat), Math.cos(vl) * cl];
        return { n, s: clamp(n[0] * Lt.x + n[1] * Lt.y + n[2] * Lt.z, 0, 1) };
      });
      eachCell(r, sx, sy, p, (c) => {
        const z = Math.sqrt(Math.max(0, 1 - c.u * c.u - c.v * c.v));
        let b1 = -2, b2 = -2, k1 = 0;
        for (let i = 0; i < lit.length; i++) {
          const n = lit[i].n, d = n[0] * c.u + n[1] * c.v + n[2] * z;
          if (d > b1) { b2 = b1; b1 = d; k1 = i; } else if (d > b2) b2 = d;
        }
        // Much simpler (SX, 2026-10-14: «делаем сильно проще раскраску, в металических оттенках»): one ink, the facet's flat light in
        // four steps, its edges a dot; no second ink.
        const s = lit[k1].s;
        if (b1 - b2 < 0.018) { if (s > 0.05 || c.light > 0.05) r.glyph('·', c.x, c.y, step(d1, p.tint, 0.9), 0.95); return; }
        if (s < 0.05) { if ((c.i + c.j) % 3 === 0) r.glyph('·', c.x, c.y, T1.shadow); return; }
        const ch = rampGlyph(' .:=#', 0.12 + 0.86 * s);
        if (ch !== ' ') r.glyph(ch, c.x, c.y, step(d1, p.tint, 0.3 + 0.7 * Math.round(s * 4) / 4), clamp(0.45 + s * 0.6, 0, 1));
      }, { atmo: null });
    },
  },
  {
    code: 'N7', name: 'NIGHTSIDE', ru: 'ОГНИ ГОРОДОВ',
    idea: 'Дневная сторона — классическая шкала ASCII; на ночной — огни городов точками во второй, тёплой краске, тихо мерцают. Обитаемый мир.',
    planet: { radius: 360, tint: '#9FB3C8', tint2: '#F3D9A0', seed: 5707, spin: 0.04 },
    paint(r, sx, sy, p, t) {
      const d1 = planetHue(p.tint).dark, T2 = tonesOf(p.tint2);
      eachCell(r, sx, sy, p, (c) => {
        const L = c.light;
        const surface = fbmWrapped(c.tx, c.ty, 12, p.seed, 3);
        if (L < 0.16) {
          // The night: towns where a finer noise gathers, a light a cell, faint in the twilight.
          const town = fbmWrapped((c.lon / TAU) * 24, c.ty * 2, 24, p.seed + 11, 3);
          const h = hashCell(Math.round(c.lon * 60), Math.round(c.lat * 60), p.seed);
          if (town > 0.55 && h > 0.25) {
            const tw = 0.65 + 0.35 * Math.sin(t * 1.8 + h * 40), dusk = L < 0.06 ? 1 : 0.45;
            r.glyph(town > 0.72 ? '*' : town > 0.66 ? '+' : '·', c.x, c.y, town > 0.68 ? T2.lit : T2.mid, tw * dusk);
          }
          if (L < 0.06) return;
        }
        const shade = clamp(0.09 + L * (0.46 + 0.62 * surface), 0, 0.999);
        const ch = rampGlyph(RAMP, shade);
        if (ch !== ' ') r.glyph(ch, c.x, c.y, step(d1, p.tint, 0.34 + surface * 0.78), clamp(0.42 + shade * 0.9, 0, 1));
      });
    },
  },
  {
    code: 'N8', name: 'SHELL', ru: 'ПОСТРОЕННАЯ',
    idea: 'Тусклое ядро внутри решётки-оболочки: меридианы и параллели тонкими линиями, узлы +; задняя половина решётки видна насквозь, тише. Мир, который кто-то построил.',
    planet: { radius: 400, tint: '#A9B7C4', tint2: '#E6D3A3', seed: 5808, spin: 0.035 },
    paint(r, sx, sy, p) {
      const d1 = planetHue(p.tint).dark, T1 = tonesOf(p.tint), d2 = planetHue(p.tint2).dark;
      const core = 0.8, meridian = TAU / 16, parallel = Math.PI / 8;
      // Whether the surface point (lon, lat) is on the lattice: 2 a node, 1 a meridian, 3 a parallel, 0 none.
      const on = (lon, lat, cw, ch) => {
        const m = Math.abs(wrapAngle(lon / meridian * TAU) / TAU) * meridian < cw / Math.max(0.15, Math.cos(lat)) * 0.55;
        const q = Math.abs(lat / parallel - Math.round(lat / parallel)) * parallel < ch * 0.55;
        return m && q ? 2 : m ? 1 : q ? 3 : 0;
      };
      eachCell(r, sx, sy, p, (c) => {
        const R = p.radius, cw = r.cellW / R, ch = r.cellH / R, L = c.light;
        const front = on(c.lon, c.lat, cw, ch);
        if (front) {
          const ink = step(d2, p.tint2, 0.45 + 0.55 * L), alpha = clamp(0.55 + L * 0.5, 0, 1);
          if (front === 2) r.glyph('+', c.x, c.y, ink, alpha);
          else if (front === 3) r.glyph('─', c.x, c.y, ink, alpha);
          else r.glyph(lineGlyph(-Math.sin(c.a0) * Math.sin(c.lat), Math.cos(c.lat)), c.x, c.y, ink, alpha);
          return;
        }
        const d2c = c.u * c.u + c.v * c.v;
        if (d2c < core * core) {
          // The core: the classic shading at its own smaller disc, quiet.
          const z = Math.sqrt(core * core - d2c) / core, cu = c.u / core, cv = c.v / core;
          const Lt = CONFIG.planet.light, lc = clamp(cu * Lt.x + cv * Lt.y + z * Lt.z, 0, 1);
          const surface = fbmWrapped(((Math.atan2(cu, z) + p.phase * 1.6) / TAU) * 12, (Math.asin(clamp(cv, -1, 1)) / Math.PI + 0.5) * 6, 12, p.seed, 3);
          const shade = clamp(0.09 + lc * (0.46 + 0.62 * surface), 0, 0.999), g = rampGlyph(RAMP, shade);
          if (g !== ' ') r.glyph(g, c.x, c.y, step(d1, p.tint, 0.3 + surface * 0.6), clamp(0.3 + shade * 0.6, 0, 0.8));
          return;
        }
        // Outside the core: the far half of the lattice, seen through.
        const back = on(Math.PI - c.a0 + p.phase, c.lat, cw, ch);
        if (back) r.glyph(back === 2 ? '+' : '·', c.x, c.y, T1.rim, 0.32);
      }, { atmo: null });
    },
  },
];

// The painters by style name (`storm`, `glacier`, ... `shell`): paint(r, sx, sy, planet, t).
export const PLANET_TYPES = Object.freeze(Object.fromEntries(TYPES.map((type) => [type.name.toLowerCase(), type])));
export function paintPlanetType(style, r, sx, sy, planet, t) {
  const type = PLANET_TYPES[style];
  if (!type) return false;
  type.paint(r, sx, sy, planet, t);
  return true;
}
