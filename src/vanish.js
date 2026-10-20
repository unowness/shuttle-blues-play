// A pirate or a friendly ship that leaves the world without coming apart, beamed out where it was (SX, 2026-10-20: «мобы и NPC пропадают
// прямо на глазах ... пусть они пропадают с каким-нибудь эффектом ... иногда такие через символы как в матрице ... как будто бы они ...
// телепортировались»; of labs/graphics/sketches/vanish-fx.html he took G3 BEAM alone: «мне нравится только beam»). Until then a runner whose
// time was out (CONFIG.pirates.leave), the runners a fight's end swept out (src/encounters.js endEncounter), a pirate past the map's limit,
// a JACKAL away with its capsule and the visitor out of O-08 at the end of its pass (src/traffic.js stepVisitor) were there in one frame
// and gone in the next, on screen too.
//
// The rule still takes it out of the world at once: nothing of the simulation waits for the look. What it leaves is a record in
// `world.vanishing` (where it was, how it was going and pointing, what it looked like, when), dropped CONFIG.vanish.time s later
// (stepVanishing), moved with everything else at a seam and cleared with a sector's load, never saved. The world draws it (drawVanishing):
// its cells glitch to the code's glyphs, the drawing is squeezed into a column of them and the column into a point, a dot after. Its glyphs
// and its jitter are hashes of the record's serial, the cell and the tick: the same every run, no stream drawn, so a seed is still one world.
import { CONFIG } from './config.js';
import { clamp, noise3 } from './util.js';
import { piratePaint, partInk } from './pirates.js';

const V = () => CONFIG.vanish;
const smooth = (a, b, v) => { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

// A pirate taken out (`kind` 'pirate': its type and paint) or a craft (`kind` 'craft': its drawing as src/traffic.js drawCraft reads it).
export function noteVanish(world, kind, thing, { x = thing.x, y = thing.y, vx = thing.vx ?? 0, vy = thing.vy ?? 0, angle = thing.angle ?? 0 } = {}) {
  world.vanishSerial = (world.vanishSerial ?? 0) + 1;
  const rec = { kind, x, y, vx, vy, angle, at: world.time, serial: world.vanishSerial };
  if (kind === 'pirate') { rec.type = thing.type; rec.paint = thing.paint; } else rec.craft = thing.craft ?? thing;
  world.vanishing.push(rec);
  return rec;
}

// The records whose beam is over, dropped.
export function stepVanishing(world) {
  const list = world.vanishing, end = world.time - V().time;
  if (list.length && list[0].at <= end) world.vanishing = list.filter((v) => v.at > end);
}

// Every record moved by (dx, dy): a seam crossed (src/sectorPlane.js enterSector).
export function shiftVanishing(world, dx, dy) {
  for (const v of world.vanishing) { v.x += dx; v.y += dy; }
}

// A record's drawing as cells about its middle with the nose up, as its painter draws it (src/pirates.js drawPirate, src/traffic.js
// drawCraft): `lx`, `ly` in the layer's units, its glyph and ink; and its scale.
function cellsOf(r, v) {
  let rows, inkAt, scale;
  if (v.kind === 'pirate') {
    const C = CONFIG.pirates, T = C.types[v.type], paint = piratePaint(v.paint);
    rows = T.art; scale = C.scale; inkAt = (i, j) => partInk(T.parts?.[j]?.[i] ?? 'h', paint);
  } else {
    const c = v.craft;
    rows = c.rows; scale = c.scale; inkAt = (i, j, ch) => (c.colors ? c.palette[c.colors[j][i]] : (c.inks?.[ch] || c.ink));
  }
  const w = r.cellW * scale, h = r.cellH * scale, out = [];
  rows.forEach((row, j) => {
    const cells = Array.from(row);
    cells.forEach((ch, i) => {
      if (ch !== ' ') out.push({ i, j, ch, ink: inkAt(i, j, ch), lx: (i - (cells.length - 1) / 2) * w, ly: (j - (rows.length - 1) / 2) * h });
    });
  });
  return { cells: out, scale };
}

// Where a record is `age` s on: what was left drifts on at its velocity, slowing at `drag` a second.
function placeOf(v, age) {
  const k = (1 - Math.exp(-V().drag * age)) / V().drag;
  return { x: v.x + v.vx * k, y: v.y + v.vy * k };
}

// Every record beamed out, on `r` where World.project puts it: `age` s into its `time`. The glitch first (a share of the cells,
// growing, shows the code's glyphs, a few of them white, the drawing shaken across), then the squeeze into a column of `column`, its height
// half again, then the column into a point, white, and a dot growing as it goes out.
export function drawVanishing(world, r) {
  const B = V();
  for (const v of world.vanishing) {
    const age = world.time - v.at, u = age / B.time;
    if (u < 0 || u >= 1) continue;
    const at = placeOf(v, age), s = world.project(r, at.x, at.y);
    if (!r.onScreen(s.x, s.y, 160)) continue;
    const { cells, scale } = cellsOf(r, v), tick = Math.floor(age / B.tick);
    const [s0, s1] = B.squeeze, [c0, c1] = B.collapse;
    if (u >= c1) {
      const f = (u - c1) / (1 - c1);
      r.glyph('·', s.x, s.y, B.ink, 1 - f, scale * (1 + f));
      continue;
    }
    const squeeze = smooth(s0, s1, u), collapse = smooth(c0, c1, u);
    const jitter = u < B.glitch ? (noise3(v.serial, tick, 1) - 0.5) * B.jitter : 0;
    const turn = v.angle + Math.PI / 2, cs = Math.cos(turn), sn = Math.sin(turn);
    for (const c of cells) {
      const px = c.lx * cs - c.ly * sn, py = c.lx * sn + c.ly * cs;
      const x = s.x + px * (1 - squeeze) + jitter, y = s.y + py * (1 + 0.5 * squeeze) * (1 - collapse);
      const salt = v.serial * 977 + c.i * 31 + c.j;
      const glitch = noise3(salt, tick, 2) < Math.min(0.9, u * 2.2);
      const ink = collapse > 0.2 || (glitch && noise3(salt, tick, 3) < 0.3) ? B.ink : c.ink;
      if (squeeze > 0.6) r.glyph(B.column, x, y, ink, 1, scale);
      else r.glyphRot(glitch ? B.glyphs[Math.floor(noise3(salt, tick, 4) * B.glyphs.length)] : c.ch, x, y, turn, ink, 1, scale);
    }
  }
}
