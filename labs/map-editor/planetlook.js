// Map editor: the look of a planet, made by chance from the game's own colours and held to the game's colour rules. No
// DOM: Node imports it (checks/planet-styles.mjs holds the generator to the rules, so the numbers have one home:
// CONFIG.planet.colour).
//
// A planet's look is `{ style, seed, tint, tint2, bands, spin }` (plus its radius): the game draws it from those alone
// (labs/graphics/world-art.js paintPlanet), so "seed 1234" with the same style and hues is the same picture.
//
// COLOURS are not free (SX, 2026-10-02: «не свободный выбор, любых цветов планеты делать ... А из нашей гаммы»): a planet's
// hue is one of the PALETTE's swatches, the sixteen hues the game's planets already wear plus a few in between (see
// planetPalette). The generator, SHUFFLE and every ROLL choose only from those; the picker shows only those.
// Each parameter of a look can be rolled on its own (rollParams); GENERATE rolls the ones that are not locked.

import { CONFIG } from '../../src/config.js';
import { SECTORS } from '../../src/sectors.js';
import { contrastOnBlack, mixHex } from '../../src/util.js';
import { PALETTE } from '../../src/roles.js';

export const STYLE_IDS = Object.freeze(Object.keys(CONFIG.planet.styles));
export const styleName = (id) => CONFIG.planet.styles[id]?.name ?? String(id).toUpperCase();
export const secondOf = (id) => CONFIG.planet.styles[id]?.two ?? null;         // 'zone' | 'ring' | 'dust' | null
export const usesSecond = (id) => !!secondOf(id);
export const SECOND_NAME = Object.freeze({ zone: 'ZONE', ring: 'RING', dust: 'FLOORS' });
// The look a record has when it names none (the seeds of the block planets are in CONFIG), and the one it has.
export const impliedStyle = (seed) => (CONFIG.planet.styles.blocks.seeds || []).includes(seed) ? 'blocks' : 'classic';
export const styleOfProps = (p) => (p.style && STYLE_IDS.includes(p.style) ? p.style : impliedStyle(p.seed));

// What a style is picked with when chance chooses (a calm spread: the first two are what the sky already holds).
const WEIGHTS = { classic: 0.26, blocks: 0.22, split: 0.18, ringed: 0.18, cratered: 0.16 };

// The parameters a look is made of, in the order chance settles them (the style first: stripes and the second hue depend on
// it). `radius` is the size; its pull follows (model.setProps).
export const PARAMS = Object.freeze(['style', 'bands', 'tint', 'tint2', 'spin', 'seed', 'radius']);
export const PARAM_NAME = Object.freeze({ style: 'STYLE', bands: 'BANDS', tint: 'COLOUR', tint2: 'COLOUR 2', spin: 'SPIN', seed: 'TEXTURE', radius: 'SIZE' });
// Kept as it is when GENERATE rolls, until SX unlocks it: a planet's size is a decision about the sector (its room, its pull),
// not a matter of taste for chance.
export const LOCKED_AT_FIRST = Object.freeze(['radius']);

// --------------------------------------------------------------------------------- colour (CIE 1976 Lab)
// The same arithmetic checks/planets.mjs measures the catalogue with.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function lab(h) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = hex(h).map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const deltaE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
export function saturation(h) {
  const [r, g, b] = hex(h).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

const RESERVED = () => [['ROUTE GREEN', PALETTE.green], ['CAUTION ORANGE', PALETTE.orange], ['DANGER RED', PALETTE.red]];

// ----------------------------------------------------------------------------------------------- the rules
// `ctx`: { sector: id, hidden: bool, style?, others: [{ label, tint, style, sector, hidden }] } the OTHER planets of the layout. When
// `ctx.style` is given (lookIssues gives it), a neighbour of another look is not held apart by colour: the look tells them apart
// (checks/planets.mjs, as of SX's map layout of 2026-10-02: two greens, one cratered and one ringed).
// What is wrong with a hue, as faults: { kind: dark | loud | reserved | sector | grid, text, label?, d? }. An empty list is
// a hue the game's checks accept. `primary`: the planet's own tint (also held apart from its neighbours); the second hue is
// only held to be legible, quiet and clear of the UI.
export function hueFaults(tint, ctx, { primary = true } = {}) {
  const C = CONFIG.planet.colour, out = [];
  const c = contrastOnBlack(tint);
  if (c < C.legible) out.push({ kind: 'dark', text: `TOO DARK: ${c.toFixed(1)} TO 1 ON BLACK, NEEDS ${C.legible}` });
  const s = saturation(tint);
  if (s > C.saturation) out.push({ kind: 'loud', text: `TOO LOUD: SATURATION ${s.toFixed(2)}, AT MOST ${C.saturation}` });
  for (const [name, ink] of RESERVED()) {
    const d = deltaE(tint, ink);
    if (d < C.reserved) out.push({ kind: 'reserved', label: name, d, text: `TOO CLOSE TO THE ${name}: ${d.toFixed(0)}, NEEDS ${C.reserved}` });
  }
  if (primary && ctx) {
    for (const o of ctx.others || []) {
      if (ctx.style && o.style && ctx.style !== o.style) continue;
      const d = deltaE(tint, o.tint);
      if (o.sector === ctx.sector && d < C.sector) out.push({ kind: 'sector', label: o.label, d, text: `TOO CLOSE TO ${o.label} IN THIS SECTOR: ${d.toFixed(0)}, NEEDS ${C.sector}` });
      else if (!o.hidden && !ctx.hidden && d < C.grid) out.push({ kind: 'grid', label: o.label, d, text: `TOO CLOSE TO ${o.label} ON THE GRID: ${d.toFixed(0)}, NEEDS ${C.grid}` });
    }
  }
  return out;
}
export const hueIssues = (tint, ctx, opts) => hueFaults(tint, ctx, opts).map((f) => f.text);

// Everything to say about a planet's look: its hues against the rules, its two hues against each other, its size.
export function lookIssues(look, ctx) {
  const C = CONFIG.planet.colour, Z = CONFIG.planet.size, out = [];
  ctx = ctx && { ...ctx, style: styleOfProps(look) };
  for (const t of hueIssues(look.tint, ctx)) out.push(`HUE: ${t}`);
  if (usesSecond(styleOfProps(look)) && look.tint2) {
    for (const t of hueIssues(look.tint2, ctx, { primary: false })) out.push(`HUE 2: ${t}`);
    const d = deltaE(look.tint, look.tint2);
    if (d < C.pair) out.push(`THE TWO HUES ARE TOO ALIKE: ${d.toFixed(0)}, NEEDS ${C.pair}`);
  }
  // The size the game allows (`max`, 520), not `wall` (500): checks/planets.mjs holds planets to `max` since SX's map layout of
  // 2026-10-02, which has two of 520.
  if (look.radius > Z.max) out.push(`SIZE ${look.radius} IS PAST ${Z.max}: A WALL, NOT A BODY`);
  if (look.pull > 0) {
    const k = look.radius / look.pull;
    // Whole-number pulls: the bounds are the nearest whole numbers (checks/planets.mjs), as the size takes its pull rounded.
    if (look.pull > Math.round(look.radius / 1.5) || look.pull < Math.round(look.radius / 1.85)) out.push(`SIZE OVER PULL IS ${k.toFixed(2)}: THE CATALOGUE HOLDS IT BETWEEN 1.5 AND 1.85`);
  }
  return out;
}

// The planets of a layout as the rules see them, for the one at `selfKey` (it is not its own neighbour). `layout` is
// { sectors, objects }; a planet on the shelf has no neighbours to be near.
export function layoutContext(layout, sectorId, selfKey = null) {
  const sectors = new Map(layout.sectors.map((s) => [s.id, s]));
  return {
    sector: sectorId, hidden: !!sectors.get(sectorId)?.hidden,
    others: layout.objects.filter((q) => q.kind === 'planet' && q.sector != null && `${q.kind}:${q.id}` !== selfKey)
      .map((q) => ({ label: q.label, tint: q.props.tint, style: styleOfProps(q.props), sector: q.sector, hidden: !!sectors.get(q.sector)?.hidden })),
  };
}

// ---------------------------------------------------------------------------------------------- the palette
// The gamut a planet's hue comes from. Its core is the game's own: the sixteen tints of src/sectors.js (the grid's thirteen
// and the hidden sector's three), the hues the sky already holds and the rules already accept. Added to them are at most
// `EXTRA` hues in between, found like this: the quarter, third, middle, two thirds and three quarters of the way between two
// game hues that are near each other in colour (colour distance 20 to 110), so a hue stays in the family the game's hues
// span; kept only if it is as light as the game's lightest and darkest allow, no greyer than their greyest, and passes the UI
// rules (legible, quiet, clear of the three reserved inks, with a margin);
// then, one at a time, the one farthest from everything already in the palette, until the farthest is less than the grid
// rule's distance (`CONFIG.planet.colour.grid`, 15) from it: an extra is a hue of its own, not a shade of a game hue, and
// can stand on the grid beside any game planet. The result is the same every time.
const EXTRA = 12;                       // at most this many hues in between

function derivePalette() {
  const C = CONFIG.planet.colour;
  const game = SECTORS.flatMap((s) => s.planets.map((p) => ({ hex: p.tint, name: p.label, hidden: !!s.hidden, source: 'game' })));
  const Ls = game.map((g) => lab(g.hex)[0]), lo = Math.min(...Ls) - 2, hi = Math.max(...Ls) + 2;
  const minSat = Math.min(...game.map((g) => saturation(g.hex))) - 0.02;      // no greyer than the game's greyest
  const candidates = [];
  for (let i = 0; i < game.length; i++) for (let j = i + 1; j < game.length; j++) {
    const d = deltaE(game[i].hex, game[j].hex);
    if (d < 20 || d > 110) continue;
    for (const t of [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4]) {
      const h = mixHex(game[i].hex, game[j].hex, t);
      const L = lab(h)[0];
      if (L < lo || L > hi || contrastOnBlack(h) < C.legible + 0.4 || saturation(h) > C.saturation - 0.02 || saturation(h) < minSat) continue;
      if (RESERVED().some(([, ink]) => deltaE(h, ink) < C.reserved + 4)) continue;
      candidates.push({ hex: h, name: `BETWEEN ${game[i].name} AND ${game[j].name}`, hidden: false, source: 'derived' });
    }
  }
  const palette = [...game];
  for (let n = 0; n < EXTRA; n++) {
    let best = null;
    for (const c of candidates) {
      const d = Math.min(...palette.map((p) => deltaE(c.hex, p.hex)));
      if (!best || d > best.d) best = { c, d };
    }
    if (!best || best.d < C.grid) break;       // each extra is as far from every hue as the grid rule asks of two planets
    palette.push(best.c);
    candidates.splice(candidates.indexOf(best.c), 1);
  }
  return palette.map((p) => ({ ...p, hex: p.hex.toLowerCase() }));
}
let paletteCache = null;
export const planetPalette = () => (paletteCache ||= Object.freeze(derivePalette().map(Object.freeze)));
export const swatchName = (s) => (s.source === 'game' ? `${s.name}'S HUE (THE GAME'S)` : s.name);

// What a swatch is to this planet: free, or taken by a neighbour (in its sector, or on the grid), or too near a reserved ink.
// `flag`: 'reserved' > 'taken' > null; `why` says it in words.
export function swatchStatus(swatch, ctx, { primary = true } = {}) {
  const faults = hueFaults(swatch.hex, ctx, { primary });
  const reserved = faults.find((f) => f.kind === 'reserved');
  const taken = faults.filter((f) => f.kind === 'sector' || f.kind === 'grid');
  const flag = reserved ? 'reserved' : taken.length ? 'taken' : faults.length ? 'weak' : null;
  const why = reserved ? reserved.text : taken.length ? `TAKEN: ${taken[0].text}` : faults.length ? faults[0].text : 'FREE';
  return { flag, why, faults };
}

// The swatches a hue may be chosen from, for this planet: those with no fault; if there are none (the palette is used up in
// this sector), the ones with the fewest, so a choice is still made from the palette and the inspector says what it costs.
// `against`: a hue the choice must be unlike by `pair` (the second hue); `not`: a hue to leave out when anything else will do.
function eligible(ctx, { primary = true, against = null, not = null } = {}) {
  const C = CONFIG.planet.colour;
  const rated = planetPalette().map((s) => {
    let faults = hueFaults(s.hex, ctx, { primary }).length;
    if (against && deltaE(s.hex, against) < C.pair + 4) faults += 1;
    return { s, faults };
  });
  const least = Math.min(...rated.map((r) => r.faults));
  let pool = rated.filter((r) => r.faults === least).map((r) => r.s);
  if (not && pool.length > 1) pool = pool.filter((s) => !same(s.hex, not));
  return pool;
}
const pickFrom = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

// The first swatch of the palette that is free for a planet standing here: the colour a new planet starts in.
export const freeSwatch = (ctx) => eligible(ctx)[0].hex;

// ------------------------------------------------------------------------------------------------ rolling
const lerp = (a, b, t) => a + (b - a) * t;

function pickStyle(rng, not) {
  const ids = Object.keys(WEIGHTS).filter((id) => id !== not);
  let t = rng() * ids.reduce((a, id) => a + WEIGHTS[id], 0);
  for (const id of ids) { t -= WEIGHTS[id]; if (t <= 0) return id; }
  return ids[0];
}
const bandsFor = (style, rng) => {
  const u = rng(), v = rng();
  if (style === 'cratered') return 0;
  if (style === 'ringed') return u < 0.7 ? Math.round(lerp(0.2, 0.62, v) * 100) / 100 : 0;
  return u < 0.5 ? 0 : Math.round(lerp(0.08, 0.5, v) * 100) / 100;
};

// Roll some parameters of a look and nothing else. `current`: the planet's props; `which`: the parameters to roll (all of
// them minus the locked ones for GENERATE, one for a ROLL button, the two colours for SHUFFLE). Returns the PATCH: only
// what changed, ready for model.setProps. Where one parameter needs another (a style with a second hue wants one) the
// missing one is filled, even if it is locked; a locked one that exists is never touched. `ctx.usedSeeds`: seeds not to
// repeat (a planet's seed is its identity).
export function rollParams(rng, current, ctx, which, { anyStyle = false } = {}) {
  const set = new Set(which);
  const patch = {};
  const next = { ...current };
  // A ROLL of the style gives another one; GENERATE may land on the same (any style, by the spread of WEIGHTS).
  if (set.has('style')) { patch.style = next.style = pickStyle(rng, anyStyle ? null : styleOfProps(current)); }
  const style = styleOfProps(next);
  if (set.has('bands')) patch.bands = next.bands = bandsFor(style, rng);
  if (set.has('tint')) patch.tint = next.tint = pickFrom(rng, eligible(ctx, { not: current.tint })).hex;
  if (usesSecond(style) && (set.has('tint2') || !next.tint2)) {
    patch.tint2 = next.tint2 = pickFrom(rng, eligible(ctx, { primary: false, against: next.tint, not: current.tint2 })).hex;
  }
  if (set.has('spin')) patch.spin = Math.round((rng() < 0.5 ? -1 : 1) * lerp(0.045, 0.12, rng()) * 1000) / 1000;
  if (set.has('seed')) {
    let s;
    do { s = 1000 + Math.floor(rng() * 98000); } while (ctx?.usedSeeds?.has(s) || s === current.seed);
    patch.seed = s;
  }
  if (set.has('radius')) {
    const Z = CONFIG.planet.size;
    patch.radius = Math.round(lerp(Z.min + 40, Z.wall - 20, rng()) / 5) * 5;
  }
  return patch;
}

export const swapColours = (look) => ({ tint: look.tint2 || look.tint, tint2: look.tint2 ? look.tint : null });

// The pull a size takes: its own ratio kept, so a bigger planet is not a stronger one than it was meant to be.
export const pullFor = (radius, oldRadius, oldPull) => Math.max(1, Math.round(oldPull * radius / oldRadius));
