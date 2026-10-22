import { CONFIG } from './config.js';

// Paint for the pilot's ship (SX, 2026-09-30: «там должны быть особые сундуки где
// можно вскрыть новый цветовой скин на корабль»).
//
// Paints are found in paint caches (src/rewards.js since the v1 economy, 2026-10-01:
// four in the first sectors, one for each restored ruin; the hidden sector's three
// rotating caches are gone). Opening one (it costs credits, like a souvenir cache)
// unlocks its paint for good and puts it on the ship at once; the pilot card's [P]
// steps through the paints unlocked, STANDARD among them. A paint is presentation only: it recolours the ship's roles
// as the lab draws them (labs/graphics/world-art.js shipInk), never the artwork
// (ships/spaceship.json stays SX's own) and never anything that decides play.
// Which paints are unlocked and which is worn are the pilot's (Pilot.paints,
// Pilot.paint), saved with the card.

// A paint is eight inks (SX, 2026-09-30, choosing from the twelve of
// labs/graphics/sketches/ship-paints.html: «гамма корабля на 1-2 цвета сложнее»,
// «нужно еще менять цвет движков и дыма из движка», then «добавляем все»):
//   material      the hull: the nose and the wings
//   structure     the two front arcs
//   highlight     the cockpit's glass and the outer struts
//   engine        the inner struts at rest; engineActive while the drive burns
//   smoke         the drive and retro puffs; jets the turning puffs
//   glassDark     the pane of the glass a turn swings away from
// STANDARD is none: the lab's own roles. The EVAs after SX's references (the
// Unit-01 sheet for its balance, the blue Unit for EVA-02), muted: «чуть более
// приглушенные и не такие насыщенные»; EVA-00 is the orange prototype, in the
// place SUNSET had («sunset заменяем на eva-proto alternative»).
// Seven repainted on 2026-10-08 (SX on labs/graphics/sketches/paints-inventory.html: «PAINTS REDO: P02, P03, P06, P07, P11, P14, P16,
// P18», «у многих мне просто не нравятся гаммы подобранных оттенков, плохо сочетаются или мало контраста», then «PAINTS NEW: P02C, P03D,
// P06E, P07C, P12B, P14A, P16C, P18A»): EVA-01 PLUGSUIT, EVA-02 SKY (blue and yellow: «у евы 02 надо переделать голубовато желтый
// вариант»), NEON MIAMI (Vice City), ARCTIC POLAR, SWORDFISH RED («красный должен быть поярче»), FALCON SMUGGLER, X-WING RED FIVE. The
// rule they were picked by: one hull hue, one accent of another, the glass neutral or the complement; the hull against its arcs and
// against its glass 2:1 or more, every ink 3:1 on black, through the grade. DUNE kept («dune старая версия первая самая была лучше»).
export const PENDING_PAINT = 'paint-12';
// `marks`: some glyphs of a role in an ink of their own, by the role the drawing authored them in ({ material: { '◢': ink } }), or a glyph at
// one row of the drawing only (`'◞@0.5'`, its cell's y): SUPRA's.
const paint = (id, label, inks, marks = null) => Object.freeze({ id, label, inks: inks && Object.freeze(inks), ...(marks ? { marks: Object.freeze(marks) } : null) });
// Sixteen inks moved on 2026-10-01 by the palette consolidation SX chose (codex/reports/palette/
// PALETTE_HANDOFF_FOR_CLAUDE.md, section 5): near-equal glass darks, highlights, jets and engines across
// paints share one colour (EVA-00, ROYAL and DUNE glass #94918A; EXPRESS and CARBON glass #8A928B; and the
// rest). What a paint is drawn in on screen is then graded once, at the canvas (src/grade.js).
export const PAINTS = Object.freeze([
  paint('standard', 'STANDARD', null),
  paint('eva00', 'EVA-00', { material: '#F5872B', structure: '#FFD447', highlight: '#F6F1E6',
    engine: '#C05A1C', engineActive: '#FFB84D', smoke: '#FFC58A', jets: '#F6F1E6', glassDark: '#94918A' }),
  paint('eva01', 'EVA-01', { material: '#7048C8', structure: '#52E06A', highlight: '#F6F1E6',
    engine: '#4E9A5A', engineActive: '#8CF59C', smoke: '#9CEFA8', jets: '#EDE4FF', glassDark: '#94918A' }),
  paint('eva02', 'EVA-02', { material: '#4A90E0', structure: '#FFE14D', highlight: '#F2F4F7',
    engine: '#3E6FB8', engineActive: '#FFE88A', smoke: '#FFF0A8', jets: '#DCEBFF', glassDark: '#94918A' }),
  paint('eva03', 'EVA-03', { material: '#E5383B', structure: '#FF8A1E', highlight: '#F6F1E6',
    engine: '#2FAE5E', engineActive: '#9CF07A', smoke: '#FFA23D', jets: '#F6F1E6', glassDark: '#94918A' }),
  paint('express', 'EXPRESS', { material: '#7CC27F', structure: '#3F8A63', highlight: '#E6F4E8',
    engine: '#C8503F', engineActive: '#FF7A55', smoke: '#F0705A', jets: '#E6F4E8', glassDark: '#8A928B' }),
  paint('neon', 'NEON', { material: '#F2F4F7', structure: '#E8409A', highlight: '#1F9A98',
    engine: '#A0A8B0', engineActive: '#FF7AC8', smoke: '#FFC2E2', jets: '#FFFFFF', glassDark: '#257A79' }),
  paint('arctic', 'ARCTIC', { material: '#F0F6FA', structure: '#E8503A', highlight: '#2E7FC0',
    engine: '#8A9AB0', engineActive: '#FF9A6A', smoke: '#F2E0D6', jets: '#FFFFFF', glassDark: '#3274B4' }),
  paint('carbon', 'CARBON', { material: '#666C75', structure: '#A5ACB5', highlight: '#E6E9ED',
    engine: '#B5501C', engineActive: '#FF7A1F', smoke: '#FF8A3D', jets: '#B6BDC4', glassDark: '#8A928B' }),
  paint('patina', 'PATINA', { material: '#45B8A6', structure: '#C97B3F', highlight: '#E6F4E8',
    engine: '#A05A2C', engineActive: '#FFB070', smoke: '#82DCC8', jets: '#CFEDE4', glassDark: '#8A928B' }),
  paint('royal', 'ROYAL', { material: '#5B6EF0', structure: '#F0BE4A', highlight: '#F3ECD2',
    engine: '#B8892E', engineActive: '#FFD86B', smoke: '#A9B9FF', jets: '#DDE3FF', glassDark: '#94918A' }),
  paint('dune', 'DUNE', { material: '#CDB784', structure: '#7F9C4F', highlight: '#F3ECD2',
    engine: '#A05A2C', engineActive: '#C6E85A', smoke: '#B7C48A', jets: '#EFE8CF', glassDark: '#94918A' }),
  // The twelfth paint to find (ECONOMY_V1_HANDOFF.md: 4 + 8 caches need twelve, and STANDARD is not one of them); only HOIST's paint
  // cache holds it. It had no inks of its own and wore like STANDARD until SX chose its look (2026-10-08, of eight on
  // labs/graphics/sketches/paints-inventory.html: P12I OLIVE, «берем этот но подбери вместо голубого белый или серый»): olive, cream arcs,
  // white glass (hull/glass 2.6:1; a light grey would fall under 2:1). Its id stays `paint-12`.
  paint(PENDING_PAINT, 'OLIVE', { material: '#8A9A4A', structure: '#F2EAD0', highlight: '#F2F4F7',
    engine: '#6A7A3A', engineActive: '#FFC24A', smoke: '#E0E6C0', jets: '#F6F2E2', glassDark: '#94918A' }),
  // The six reference ships' paints, left by their rare quests (src/specials.js; SX, 2026-10-02: «подарить краску для
  // твоего кораблика в стиле их корабля»): each the ship's own palette (src/trafficArt.js) as the eight inks, found in
  // no cache. DELOREAN is its steel and its blue glow; SWORDFISH II Spike's red, brighter since 2026-10-08, with light grey
  // arcs and amber glass; PLANET EXPRESS its green and brick; the FALCON graphite with pale blue arcs and amber glass (2026-10-08);
  // SERENITY its pale grey and rust-gold; the X-WING its white and red (RED FIVE, 2026-10-08).
  paint('sp-delorean', 'DELOREAN', { material: '#C3CCD3', structure: '#80909F', highlight: '#E6EEF3',
    engine: '#5EA9D1', engineActive: '#9BD6F2', smoke: '#B6DDF0', jets: '#E6EEF3', glassDark: '#5C6B78' }),
  paint('sp-swordfish', 'SWORDFISH', { material: '#F0483A', structure: '#D0D6DC', highlight: '#FFC94D',
    engine: '#A84A3A', engineActive: '#FFA35A', smoke: '#FFB89A', jets: '#F2E6DC', glassDark: '#9A7A30' }),
  paint('sp-express', 'P. EXPRESS', { material: '#55A887', structure: '#CD7063', highlight: '#DDCCA0',
    engine: '#B05A4D', engineActive: '#E8907A', smoke: '#8FD0B3', jets: '#E6F4E8', glassDark: '#8A7F5E' }),
  paint('sp-falcon', 'FALCON', { material: '#8A929C', structure: '#9CEBFF', highlight: '#FFD86B',
    engine: '#6A7A8A', engineActive: '#9CEBFF', smoke: '#D6F2FF', jets: '#E6EEF3', glassDark: '#9A8A30' }),
  paint('sp-serenity', 'SERENITY', { material: '#A5ACB5', structure: '#789CB4', highlight: '#E6D2A8',
    engine: '#B07E3E', engineActive: '#F0C070', smoke: '#D8B070', jets: '#D6DCE3', glassDark: '#6F7F8C' }),
  paint('sp-xwing', 'X-WING', { material: '#EEF1F4', structure: '#E8503A', highlight: '#7A8A9A',
    engine: '#A0A8B0', engineActive: '#FF7A5A', smoke: '#FFB8A0', jets: '#FFFFFF', glassDark: '#5A6670' }),
  // The MYSTERY MACHINE's (2026-10-21): its turquoise, its lime wave, its orange flowers.
  paint('sp-scooby', 'MYSTERY', { material: '#4FB3C2', structure: '#8BB33F', highlight: '#F0913A',
    engine: '#3E8C98', engineActive: '#F0B05A', smoke: '#C9E07A', jets: '#E8F4F2', glassDark: '#5C6B78' }),
  // CLIPPER's (2026-10-22): SX's G8 TWIN NOS, ORANGE SIDES on labs/graphics/sketches/clipper-beta.html, after Paul Walker's Supra of the
  // first Fast & Furious: the candy orange hull, the whiskers ◝ ◜ a light gray, the outer struts / \ lime (`struts`), the glass @@ and the
  // inner struts white (`glass`), white on the drive too («когда он летит белый хвост не надо делать голубым»). CLIPPER wears it in its
  // quest (src/clipper.js); a pilot who led its crew wears it on any ship. On MODERN, which has no struts of the glass's colour, the lime
  // lies on its wings ◢ ◣ and its inner whiskers ◝ ◜ (`marks`; SX's S2 WHISKERS LIME on labs/graphics/sketches/supra-modern.html, «берем
  // этот», after «она не имеет в себе зеленого цвета»), its glass ╭╮╰╯ white; CLIPPER's whiskers, its hull's, stay the light gray. In
  // MODERN's brake pose its wings turned ◤ ◥ and its inner whiskers turned ◞ ◟ (their row, not the top whiskers') silver (SX, 2026-10-22:
  // «когда он тормозит ... покрасим перевернутые крылья и перевернутые палочки ... при тормозе в серый. Серебристый такой цвет»).
  paint('sp-clipper', 'SUPRA', { material: '#F07B1F', structure: '#8E959E', highlight: '#D9DEE3', struts: '#86DC32', glass: '#EEF1F4',
    engine: '#EEF1F4', engineActive: '#EEF1F4', smoke: '#FFC488', jets: '#F4F6F8', glassDark: '#59626B', silver: '#B9C0C8' },
  { material: { '◢': '#86DC32', '◣': '#86DC32', '◤': '#B9C0C8', '◥': '#B9C0C8' },
    structure: { '◝': '#86DC32', '◜': '#86DC32', '◞@0.5': '#B9C0C8', '◟@0.5': '#B9C0C8' } }),
]);

// The eight paints the reference ships leave (found in no cache): the pilot card's PAINTS count and the caches' twelve are the others.
export const SPECIAL_PAINTS = Object.freeze(PAINTS.filter((p) => p.id.startsWith('sp-')).map((p) => p.id));

// Paints of an older save, by what they became (2026-09-30): SUNSET's place went to
// EVA-00, VIOLET's to ROYAL.
export const PAINT_RENAMED = Object.freeze({ sunset: 'eva00', violet: 'royal' });

// Every ink any paint has: a page's colour resolver passes these through as they are.
export const PAINT_INKS = new Set(PAINTS.flatMap((p) => (p.inks ? Object.values(p.inks) : [])));

// The ink one cell of the pilot's ship takes in a paint, from the colour it was
// authored in (ships/spaceship.json: #6f74c0 the hull, #b9a5f0 the glass and
// outer struts, #5ce422 the inner struts) and its glyph (the front arcs are
// the hull's colour in the file and `structure` in a paint). The hero looks of the
// ship (src/shipLooks.js, 2026-10-07) write their trim in the file's Detail, #f0a5c0,
// the paint's `structure`, and a lamp or a pod in LAMP, the paint's `jets` (ships/SCHEMA.md).
// Null for a colour or a paint the paint does not cover: the caller's own ink then.
export const LAMP = '#ffa66b';
// SCOOTY JR.'s livery (src/loaner.js LOANER.livery, ships/scooty-jr.json) read as roles too, its warm hull the material and its lamp the
// jets: worn by the STANDARD once the opening is over (src/shipLooks.js), it takes a paint as the others do (SX, 2026-10-16: «у них все
// работает также как и у стандартного»). The loaner itself is never painted, so it keeps them.
const AUTHORED = Object.freeze({ '#6f74c0': 'material', '#b9a5f0': 'highlight', '#5ce422': 'engine', '#f0a5c0': 'structure', [LAMP]: 'jets',
  '#bd9c5e': 'material', '#ffd27f': 'jets' });
// A paint may give the glass's cells (@) and the struts' (/ \) of the highlight inks of their own (`glass`, `struts`: SUPRA's lime legs and
// white glass); one that does not paints both its highlight.
const ARCS = new Set(['◝', '◜']), GLASS = new Set(['@', '╭', '╮', '╰', '╯']), STRUTS = new Set(['/', '\\']);
export function paintedHull(paintId, cell, engineOn = false) {
  const p = paintById(paintId), inks = p?.inks;
  const part = inks && AUTHORED[String(cell?.color).toLowerCase()];
  if (!part) return null;
  const mark = p.marks?.[part]?.[`${cell.ch}@${cell.y}`] ?? p.marks?.[part]?.[cell.ch];
  if (mark) return mark;
  if (part === 'material') return ARCS.has(cell.ch) ? inks.structure : inks.material;
  if (part === 'engine') return engineOn ? inks.engineActive : inks.engine;
  if (part === 'highlight') return (GLASS.has(cell.ch) && inks.glass) || (STRUTS.has(cell.ch) && inks.struts) || inks.highlight;
  return inks[part];
}

// The inks the ship's motion draws in (labs/graphics/ship-motion.js) under a paint,
// over `base` (MOTION_INKS): its smoke for the drive and retro, its jets for turns,
// its glass and the darker step. `base` itself for STANDARD.
export function paintedMotion(paintId, base) {
  const inks = paintById(paintId)?.inks;
  if (!inks) return base;
  return { ...base, drive: inks.smoke, retro: inks.smoke, turn: inks.jets, glassBase: inks.highlight, glassDark: inks.glassDark };
}

const byId = new Map(PAINTS.map((p) => [p.id, p]));
export const paintById = (id) => byId.get(id) || null;

// The ink a paint gives one of its roles (material, highlight, engine ...), or `fallback`.
export function paintInk(paintId, role, fallback) {
  const inks = paintById(paintId)?.inks;
  return (inks && inks[role]) || fallback;
}

// The next paint the pilot owns after the one worn, in catalogue order.
export function nextPaint(owned, worn) {
  const list = PAINTS.filter((p) => p.id === 'standard' || owned.has(p.id));
  const at = list.findIndex((p) => p.id === worn);
  return list[(at + 1) % list.length].id;
}

// A paint cache is a crate (SX, 2026-09-30, choosing F of eight on
// labs/graphics/sketches/paint-caches.html: «Хранилища нравятся F»): the cache
// family's gray frame with a seal, and only its stripes wear the paint it holds,
// the paint's hull colour above the seal and its second colour (the arcs') below.
// Now and then a shimmer runs along the stripes, left to right, in its highlight.
// `role`: g the frame's gray, m / s / h the paint's material, structure, highlight.
export const PAINT_TIN = Object.freeze({
  // Rounded corners, as every cache has since SX, 2026-09-30: «Сделай всем сундукам закругленные края».
  // Then «Сундуки крупноваты, и углы ты забыл сделать закругленными»: a corner arc is half a cell whatever
  // the scale, so on a crate seven cells wide it read as square. Five cells wide, the arc is a tenth of
  // the width, as on the TIN SX pointed at, and at 1.15 the crate stood as tall as the ship. 1.25 with every cache since SX's scales of
  // 2026-10-17 (CONFIG.cache.scale).
  rows: Object.freeze(['╭───╮', '│╱╱╱│', '├─◇─┤', '│╱╱╱│', '╰───╯']),
  roles: Object.freeze(['ggggg', 'gmmmg', 'gghgg', 'gsssg', 'ggggg']),
  scale: 1.25,
  // The shimmer: every `every` seconds it crosses the three stripes, `step` s each.
  shimmer: Object.freeze({ every: 2.6, step: 0.1 }),
});

// `angle` turns the tin about its middle (a cache turns slowly as it floats, CONFIG.cache.float).
export function drawPaintTin(r, sx, sy, paintId, t = 0, alpha = 1, angle = 0) {
  drawTin(r, sx, sy, paintById(paintId)?.inks, t, alpha, angle);
}

// The same crate in any three inks ({ material, structure, highlight }): a paint's, or a look's (src/looks.js lookTinInks,
// SUNSET's cache); the interface's own when there are none.
export function drawTin(r, sx, sy, inks, t = 0, alpha = 1, angle = 0) {
  inks = inks || { material: CONFIG.hud.hot, structure: CONFIG.hud.color, highlight: '#FFFFFF' };
  const ink = { g: CONFIG.hud.color, m: inks.material, s: inks.structure, h: inks.highlight };
  const { rows, roles, scale, shimmer } = PAINT_TIN;
  const w = r.cellW * scale, h = r.cellH * scale;
  const since = ((t % shimmer.every) + shimmer.every) % shimmer.every;
  const lit = Math.floor(since / shimmer.step) + 1;          // the stripe column lit now (1..3), or past them
  const ca = Math.cos(angle), sa = Math.sin(angle);
  rows.forEach((row, j) => Array.from(row).forEach((ch, i) => {
    if (ch === ' ') return;
    const role = ch === '╱' && i === lit ? 'h' : roles[j][i];
    const lx = (i - (row.length - 1) / 2) * w, ly = (j - (rows.length - 1) / 2) * h;
    const px = sx + lx * ca - ly * sa, py = sy + lx * sa + ly * ca;
    if (angle && r.glyphRot) r.glyphRot(ch, px, py, angle, ink[role], alpha, scale);
    else r.glyph(ch, px, py, ink[role], alpha, scale);
  }));
}
