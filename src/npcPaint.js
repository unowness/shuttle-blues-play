import { CONFIG } from './config.js';
import { oklch, fromLch, gradeHex } from './grade.js';
import { contrastOnBlack } from './util.js';
import { PAINTS, paintById } from './paint.js';
import { npcShip, npcDrawScale } from './npcShips.js';
import { PIRATE_INKS } from './pirates.js';
import { counterweight, recentCount } from './pacing.js';
import { PALETTE, ROLES } from './roles.js';

// The NPC ships in the pilot's paints (SX, 2026-10-02: «По системе весов перекрашивай корабли нпс в разные цвета, ну примерно в
// наших палитрах»). An NPC wears one of the paints the pilot collects (src/paint.js), tamed by the rule SX's ships were picked
// under (labs/graphics/sketches/npc-ships.html, SX: «она всегда должна быть чуть обычнее чуть проще чем схема главного корабля»),
// or its own scheme as SX picked it (OWN). Which it wears is drawn by the counterweights (src/npcFleet.js `drawPaint`, the weights
// here in `paintWeights`); this module says what each paint looks like on each ship.
//
// ---- the rule (the sheet's, copied: the game never imports from sketches) --------------------------------------------
//
// Measured on the pilot's ship in STANDARD (its gray hull, white glass, the engine's blue at rest and green burning,
// labs/graphics/world-art.js shipInk): an NPC has three inks at most, one of them a gray; its coloured ink at most 0.70 of the
// ship's strongest chroma (0.85 for a small accent on a fifth of the cells at most); every ink under the ship's brightest by
// 0.05; readable on black after the grade (4.5:1, an accent 3:1); never a hue of danger, caution or the route (HUE_BANS) and
// never within colour distance 20 of a reserved interface ink or a pirate's colour (RESERVED).
//
// ---- a paint on a ship ---------------------------------------------------------------------------------------------
//
// SX's scheme of each ship is kept as its pattern: which parts carry the colour, which stay gray, where a small light is, and
// each part's lightness (`partsOf`). A paint gives the hues (`paintHues`):
//   main    its hull's colour, or when the hull is a gray (CARBON, the reference ships' steel) its first colour of the arcs,
//           the glass and the engine; a hue up to `shift` degrees inside a forbidden window is moved out to its edge (NEON's
//           pink to a rose, EVA-00's orange to an ochre); a paint whose main is forbidden or cannot be tamed is not worn
//   accent  its next colour of those four, `turn` degrees or more round from the main, on the ship's small light
// The coloured part takes the main at its own lightness and the rule's chroma; the light takes the accent (the main where the
// paint has none); the gray parts stay gray, tinted toward the main. An ink the rule refuses is nudged in lightness, then
// chroma (`tame`); a ship the paint still cannot pass leaves that paint out of its draw (none does today).

export const OWN = 'own';
const N = () => CONFIG.traffic.npcPaint;

// ---------------------------------------------------------------------------------------------------- the rule

const HUE_BANS = Object.freeze([[345, 360], [0, 66], [146, 180]]);
const hueBanned = (H) => HUE_BANS.some(([a, b]) => H >= a && H <= b);
const hueDistance = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// The pilot's ship in STANDARD, every ink it is drawn in at rest and burning (world-art.js shipInk: material, highlight, the
// engine at rest in the structure's blue, burning in the drive's green).
const REFERENCE = Object.freeze([ROLES.material, ROLES.highlight, ROLES.structure, ROLES.driveActive]);
function deriveRule() {
  const lch = [...new Set(REFERENCE.map((h) => h.toUpperCase()))].map((h) => oklch(h));
  const refC = Math.max(...lch.map((x) => x[1])), refL = Math.max(...lch.map((x) => x[0]));
  return Object.freeze({
    refC, refL, maxInks: Math.min(3, lch.length - 1), hullC: 0.70 * refC, accentC: 0.85 * refC, grayC: oklch(ROLES.material)[1],
    maxL: refL - 0.05, minL: 0.56, accentShare: 0.2, contrast: Object.freeze({ main: 4.5, accent: 3 }), distance: 20,
  });
}
export const RULE = deriveRule();

// Colour distance as checks/planets.mjs measures it (CIE 1976 Lab; 20 is "clearly different").
function labOf(h) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const colourDistance = (a, b) => { const A = labOf(a), B = labOf(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };

// The interface's reserved inks (route green, caution orange, danger red, the brake's amber, the coin's golds) and every pirate
// colour with colour in it. Made on first use (src/pirates.js is read then, not while the modules load).
let reserved = null;
function reservedInks() {
  reserved ??= [PALETTE.green, PALETTE.orange, PALETTE.red, PALETTE.amber, ROLES.credits, ROLES.creditsLabel,
    ...[...PIRATE_INKS].filter((hex) => /^#[0-9a-f]{6}$/i.test(hex) && oklch(hex)[1] >= 0.05)].map((h) => h.toUpperCase());
  return reserved;
}
const nearestReserved = (hex) => Math.min(...reservedInks().map((r) => colourDistance(hex, r)));

// A drawing's cells by role, and their count.
const cellsCache = new Map();
function shipCells(code) {
  if (cellsCache.has(code)) return cellsCache.get(code);
  const art = npcShip(code), count = { h: 0, t: 0, g: 0, e: 0, l: 0 };
  let total = 0;
  art.glyphs.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ' ') { count[art.colors[j][i]]++; total++; } }));
  const out = { count, total };
  cellsCache.set(code, out);
  return out;
}

// One ink measured against the rule, for a part of `share` of the cells: what is wrong with it (none: it passes).
function inkProblems(hex, share) {
  const [L, C, H] = oklch(hex), small = share <= RULE.accentShare, out = [];
  if (C > RULE.accentC) out.push(`${hex} chroma ${C.toFixed(3)} over ${RULE.accentC.toFixed(3)}`);
  else if (C > RULE.hullC && !small) out.push(`${hex} chroma ${C.toFixed(3)} on ${Math.round(share * 100)} % of the cells`);
  if (L > RULE.maxL) out.push(`${hex} lightness ${L.toFixed(2)} over ${RULE.maxL.toFixed(2)}`);
  const need = small ? RULE.contrast.accent : RULE.contrast.main, cr = contrastOnBlack(gradeHex(hex));
  if (cr < need) out.push(`${hex} contrast ${cr.toFixed(1)} under ${need}`);
  if (C >= 0.03 && H !== null && hueBanned(H)) out.push(`${hex} hue ${Math.round(H)} is reserved`);
  const d = nearestReserved(hex);
  if (d < RULE.distance) out.push(`${hex} too near a reserved ink (${d.toFixed(1)})`);
  return out;
}

// A whole palette on a ship against the rule: its inks, and every way it breaks the rule (none: it passes).
export function checkPalette(code, palette) {
  const { count, total } = shipCells(code), byInk = new Map(), problems = [];
  for (const role of Object.keys(count)) {
    if (!count[role]) continue;
    const hex = palette[role]?.toUpperCase();
    if (!hex) { problems.push(`role ${role} without an ink`); continue; }
    byInk.set(hex, (byInk.get(hex) ?? 0) + count[role]);
  }
  if (byInk.size > RULE.maxInks) problems.push(`${byInk.size} inks, the most is ${RULE.maxInks}`);
  let gray = false;
  for (const [hex, cells] of byInk) {
    problems.push(...inkProblems(hex, cells / total));
    if (oklch(hex)[1] <= RULE.grayC + 0.002) gray = true;
  }
  if (!gray) problems.push('no gray among the inks');
  return { inks: [...byInk.keys()], problems, ok: problems.length === 0 };
}

// ---------------------------------------------------------------------------------------------------- the pattern

// SX's scheme of a ship as parts: each ink of it with the roles that wear it (every role of the palette, drawn or not), its
// share of the cells, its lightness, and what it is: 'main' (where a paint's colour goes), 'accent' (a small light), 'gray'.
//   main    the coloured ink on a fifth of the cells or more (the most cells); else a gray off the hull on that much (N01's
//           containers); else the darker of the small coloured inks (N12)
//   accent  another coloured ink
const partsCache = new Map();
export function partsOf(code) {
  if (partsCache.has(code)) return partsCache.get(code);
  const art = npcShip(code), { count, total } = shipCells(code), byInk = new Map();
  for (const [role, hex] of Object.entries(art.palette)) {
    const key = hex.toUpperCase(), p = byInk.get(key) ?? { hex: key, roles: [], cells: 0 };
    p.roles.push(role); p.cells += count[role] ?? 0;
    byInk.set(key, p);
  }
  const parts = [...byInk.values()].map((p) => {
    const [L, C, H] = oklch(p.hex);
    return { ...p, share: p.cells / total, L, C, H: H ?? 0, gray: C <= RULE.grayC + 0.002 };
  }).sort((a, b) => b.cells - a.cells || a.L - b.L);
  const big = (p) => p.share >= RULE.accentShare;
  const main = parts.find((p) => !p.gray && big(p)) ?? parts.find((p) => p.gray && big(p) && !p.roles.includes('h'))
    ?? parts.find((p) => !p.gray && p.cells) ?? parts[0];
  const accent = parts.find((p) => p !== main && !p.gray && p.cells) ?? null;
  for (const p of parts) p.kind = p === main ? 'main' : p === accent ? 'accent' : 'gray';
  partsCache.set(code, Object.freeze(parts.map((p) => Object.freeze(p))));
  return partsCache.get(code);
}

// ---------------------------------------------------------------------------------------------------- the paint's hues

// Whether a hue at a chroma can be an NPC's ink at any lightness of its band (a main part's 4.5:1, never near a reserved ink).
function feasible(H, C, small = false) {
  for (let L = 0.58; L <= RULE.maxL + 1e-9; L += 0.02) if (!inkProblems(fromLch(L, C, H), small ? 0.1 : 0.5).length) return true;
  return false;
}
// A hue the rule allows, or a forbidden one moved out to its window's edge when it lies `shift` degrees or less inside it; null.
function allowedHue(H) {
  const win = HUE_BANS.find(([a, b]) => H >= a && H <= b);
  if (!win) return H;
  // The windows that touch 0 / 360 are one window: [345, 360] and [0, 66] are 345..66 round the circle.
  const lo = win[0] === 0 ? HUE_BANS.find(([, b]) => b === 360)?.[0] ?? 0 : win[0];
  const hi = win[1] === 360 ? HUE_BANS.find(([a]) => a === 0)?.[1] ?? 360 : win[1];
  const below = hueDistance(H, lo), above = hueDistance(H, hi);
  if (Math.min(below, above) > N().shift) return null;
  return below <= above ? (lo - N().margin + 360) % 360 : (hi + N().margin) % 360;
}

const ORDER = ['material', 'structure', 'highlight', 'engine'];
// A paint's hues for an NPC: { main: { H, C, from }, accent: { H, C, from } | null }, or null when it is not worn by NPCs.
const huesCache = new Map();
export function paintHues(paintId) {
  if (huesCache.has(paintId)) return huesCache.get(paintId);
  const inks = paintById(paintId)?.inks;
  let out = null;
  if (inks) {
    const coloured = ORDER.map((k) => { const [, C, H] = oklch(inks[k]); return { from: k, C, H }; }).filter((x) => x.C >= 0.03);
    const first = coloured[0], H = first ? allowedHue(first.H) : null;
    if (first && H !== null && feasible(H, Math.min(first.C, RULE.hullC))) {
      const main = { H, C: first.C, from: first.from };
      let accent = null;
      for (const x of coloured.slice(1)) {
        const h = allowedHue(x.H);
        if (h === null || hueDistance(h, H) < N().turn || !feasible(h, Math.min(x.C, RULE.accentC), true)) continue;
        accent = { H: h, C: x.C, from: x.from };
        break;
      }
      out = Object.freeze({ main: Object.freeze(main), accent: accent && Object.freeze(accent) });
    }
  }
  huesCache.set(paintId, out);
  return out;
}

// The paints an NPC can wear, in the catalogue's order (the rest: why, in `npcPaintsLeftOut`).
export const NPC_PAINTS = Object.freeze(PAINTS.filter((p) => p.id !== 'standard' && paintHues(p.id)).map((p) => p.id));

// ---------------------------------------------------------------------------------------------------- the palette

// An ink at `L`, `C`, `H` for a part of `share`, nudged until the rule takes it: lightness first (down, then up, by
// 0.03), then less chroma. Null when none passes.
const L_STEPS = [0, -0.03, 0.03, -0.06, 0.06, -0.09, 0.09, -0.12, 0.12];
function tame(L, C, H, share) {
  for (const k of [1, 0.8, 0.6, 0.4]) {
    for (const dL of L_STEPS) {
      const l = Math.min(RULE.maxL - 0.005, L + dL);
      if (l < RULE.minL) continue;
      const hex = fromLch(l, C * k, H);
      if (!inkProblems(hex, share).length) return hex;
    }
  }
  return null;
}

// The palette `code` wears in `key` (OWN or a paint's id), frozen, or null when that paint does not pass on that ship.
const MARGIN = 0.003;
const paletteCache = new Map();
export function paintedPalette(code, key) {
  const id = `${code}|${key}`;
  if (paletteCache.has(id)) return paletteCache.get(id);
  let out = null;
  if (key === OWN) out = Object.freeze({ ...npcShip(code).palette });
  else {
    const hues = paintHues(key);
    if (hues) {
      const palette = {};
      let ok = true;
      for (const p of partsOf(code)) {
        const { main, accent } = hues;
        let hex;
        if (p.kind === 'main') hex = tame(p.L, Math.min(main.C, RULE.hullC - MARGIN), main.H, Math.max(p.share, RULE.accentShare + 0.01));
        else if (p.kind === 'accent') {
          const a = accent ?? main;
          hex = tame(p.L, Math.min(a.C, RULE.accentC - MARGIN), a.H, p.share) ?? (accent ? tame(p.L, Math.min(main.C, RULE.accentC - MARGIN), main.H, p.share) : null);
        } else hex = tame(p.L, Math.min(p.C, RULE.grayC - MARGIN), main.H, Math.max(p.share, RULE.accentShare + 0.01));
        if (!hex) { ok = false; break; }
        for (const role of p.roles) palette[role] = hex;
      }
      if (ok && checkPalette(code, palette).ok) out = Object.freeze(palette);
    }
  }
  paletteCache.set(id, out);
  return out;
}
// What `code` is drawn in, `key` or, when that is not one it can wear, its own scheme.
export const npcPalette = (code, key) => paintedPalette(code, key ?? OWN) ?? paintedPalette(code, OWN);

// A ship as a craft src/traffic.js can draw, in the paint it was drawn in (its own scheme when none), made once for each ship and
// paint: the pestered ship (src/pester.js) and the wrecked one (src/wrecked.js), which had a copy each until PLAN D2 (2026-10-04).
const crafts = new Map();
export function paintedCraft(code, paint = null) {
  const key = `${code}|${paint}`;
  if (!crafts.has(key)) {
    const art = npcShip(code), palette = npcPalette(code, paint);
    crafts.set(key, { rows: art.glyphs, colors: art.colors, palette, ink: palette.h, inks: {}, name: art.name,
      get scale() { return npcDrawScale(); } });
  }
  return crafts.get(key);
}

// The keys `code` can wear: its own scheme and every NPC paint that passes on it; a rare ship (src/eggs.js) its own alone.
const keysCache = new Map();
export function paintKeysFor(code) {
  if (!keysCache.has(code)) {
    keysCache.set(code, Object.freeze(npcShip(code).rare ? [OWN] : [OWN, ...NPC_PAINTS.filter((id) => paintedPalette(code, id))]));
  }
  return keysCache.get(code);
}

// A key's look on a ship, to tell which look alike: the main part's ink taken to one lightness (0.70), so a light ship and a dark
// one in the same paint read as one colour.
const lookCache = new Map();
function lookOf(code, key) {
  const id = `${code}|${key}`;
  if (!lookCache.has(id)) {
    const main = partsOf(code).find((p) => p.kind === 'main'), pal = npcPalette(code, key);
    const [, C, H] = oklch(pal[main.roles[0]]);
    lookCache.set(id, fromLch(0.70, C, H ?? 0));
  }
  return lookCache.get(id);
}
// Two ships' paints look alike: their looks within `alike` of each other (the distance kept once worked out: a draw asks it often).
const apart = new Map();
export function alike(codeA, keyA, codeB, keyB) {
  const a = lookOf(codeA, keyA), b = lookOf(codeB, keyB), id = a < b ? a + b : b + a;
  if (!apart.has(id)) apart.set(id, colourDistance(a, b));
  return apart.get(id) < N().alike;
}

// ---------------------------------------------------------------------------------------------------- the weights

// The weight of each key `code` may be drawn in now: the counterweights of src/pacing.js on what the pilot has seen lately.
//   cands   the keys to weigh (the caller has taken out the ones worn about the pilot: src/npcFleet.js drawPaint)
//   recent  the memory (src/pacing.js), its 'paint' notes { key: `${code}|${key}` } made when the pilot met a ship in a paint
// A key's count is every note whose look is alike its own (the same paint, or one alike it, on any ship: a colour seen lately,
// not only a paint); its weight is counterweight(count): a colour seen lately weighs less, one not seen for 20 minutes the most.
// A ship's own scheme weighs `own` of that: SX asked for the ships repainted, and his thirteen schemes are thirteen looks of
// their own, seldom alike a paint's, so at a full weight they were met more than any colour (22 % of the meetings in a long
// run, each paint 6 to 10 %). Measured and left out: sharing a weight among the keys that look alike, and leaning on what is
// worn about the pilot; each moved the colours about the pilot by under a point (alike pairs 10.7 % -> 9.6 %, six flights).
export function paintWeights(code, cands, recent, now) {
  const seen = new Map();
  for (const note of recent ?? []) {
    if (note.kind !== 'paint' || seen.has(note.key)) continue;
    seen.set(note.key, recentCount(recent, 'paint', note.key, now));
  }
  return cands.map((key) => {
    let count = 0;
    for (const [id, n] of seen) { const [c, k] = id.split('|'); if (alike(code, key, c, k)) count += n; }
    return (key === OWN ? N().own : 1) * counterweight(count);
  });
}
export const paintNote = (code, key) => `${code}|${key}`;

// Why each paint of the catalogue is not worn by NPCs (for the checks and the sheet).
export function npcPaintsLeftOut() {
  return PAINTS.filter((p) => !NPC_PAINTS.includes(p.id)).map((p) => {
    if (p.id === 'standard') return { id: p.id, why: 'the pilot\'s own look' };
    if (!p.inks) return { id: p.id, why: 'no inks of its own yet' };
    const first = ORDER.map((k) => ({ k, lch: oklch(p.inks[k]) })).find((x) => x.lch[1] >= 0.03);
    if (!first) return { id: p.id, why: 'no colour, only grays' };
    return { id: p.id, why: `its ${first.k} ${p.inks[first.k]} (hue ${Math.round(first.lch[2])}) is a colour the NPC rule keeps for danger, caution, the route or pirates` };
  });
}
