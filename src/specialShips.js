import { CONFIG } from './config.js';
import { CRAFT_ART } from './trafficArt.js';
import { normalizeModel } from './asciiModel.js';
import { clamp } from './util.js';

// The reference ships of the rare quests (six, and the MYSTERY MACHINE since 2026-10-21) (QUESTS_V2_HANDOFF.md, round three; SX, 2026-10-02: «Специальные квесты
// награждаются каким-то цветом, или, возможностью применить этот корабль на себя ... они должны цветовую схему давать,
// как бы в стиле их корабля для штурвала, нижней части. Плюс подарить краску в для твоего кораблика в стиле их
// корабля, памятную записку какую-то оставлять, которая в гараже можно читать и смотреть об этой истории рассказывать
// от их лица»). They are O-08's character ships (src/traffic.js, Codex's drawings in src/trafficArt.js): one stands in
// a grid sector now and then, asking for a pilot, and the pilot borrows it for its quest (src/specials.js).
//
// Per ship, here: the drawing it is flown in (the same cells and colours the traffic is drawn with, as a Ship model,
// at its own scale), its chassis (src/chassis.js `special-<id>`), the rewards it leaves (a paint in src/paint.js, a
// cockpit scheme below, a memento note), and the words: the three lines it says over its head, the note.
//
// A cockpit scheme is three inks in the ship's own palette, for the cockpit's bars and the helm
// (labs/graphics/cockpit-scheme.js maps the interface's blue and grey, and the stick's, onto them): `line` the bars and
// the helm's base and stem, `accent` the console's grey parts, `grip` the stick's grip.

const note = (s) => s.replace(/\s+/g, ' ').trim();

export const SPECIALS = Object.freeze([
  {
    id: 'delorean', craft: 'delorean', label: 'DELOREAN', who: 'MARTY', scale: 1.35,
    paint: 'sp-delorean', cockpit: { label: 'DELOREAN', line: '#80909F', accent: '#5EA9D1', grip: '#C3CCD3' },
    note: { title: 'FROM MARTY', text: note(`We made it! Doc has the car, and now he wants the readings. I was just glad we got there in time. Thanks for driving. - M.`) },
  },
  {
    id: 'swordfish', craft: 'swordfish-ii', label: 'SWORDFISH II', who: 'SPIKE', scale: 0.8,
    paint: 'sp-swordfish', cockpit: { label: 'SWORDFISH', line: '#CD7063', accent: '#D8A25A', grip: '#A5ACB5' },
    note: { title: 'FROM SPIKE', text: note(`Swordfish is back in her berth. Bounty paid, paint with your gear. Nice to let someone else fly for once. - S.`) },
  },
  {
    id: 'express', craft: 'express', label: 'PLANET EXPRESS', who: 'THE CREW', scale: 1.15,
    paint: 'sp-express', cockpit: { label: 'P. EXPRESS', line: '#55A887', accent: '#CD7063', grip: '#DDCCA0' },
    note: { title: 'FROM THE CREW', text: note(`Three crates. All three signatures, too. Route sheet done. Your flight log is our plan for next time. - Planet Express`) },
  },
  {
    id: 'falcon', craft: 'falcon', label: 'MILLENNIUM FALCON', who: 'HAN', scale: 0.85,
    paint: 'sp-falcon', cockpit: { label: 'FALCON', line: '#A89B87', accent: '#5EA9D1', grip: '#B6BDC4' },
    note: { title: 'FROM HAN', text: note(`Dock's clear. Chewie's checking the Falcon. You got her in; that's what counts. Keep the paint. - H.`) },
  },
  {
    id: 'serenity', craft: 'serenity', label: 'SERENITY', who: 'THE CREW', scale: 0.9,
    paint: 'sp-serenity', cockpit: { label: 'SERENITY', line: '#789CB4', accent: '#D8A25A', grip: '#A5ACB5' },
    note: { title: 'FROM SERENITY', text: note(`She's in dock, and the hull crew's at work. Glad she's still here to mend. Cockpit colours are with your kit. - the crew`) },
  },
  {
    id: 'xwing', craft: 'x-wing', label: 'X-WING', who: 'RED FIVE', scale: 1.2,
    paint: 'sp-xwing', cockpit: { label: 'X-WING', line: '#CD7063', accent: '#789CB4', grip: '#D5D3C7' },
    note: { title: 'FROM RED FIVE', text: note(`Rendezvous reached. Flight logged. You held the course. That's what we needed. Red Five out. - R5`) },
  },
  // The seventh (SX, 2026-10-21: «давай добавим нового отсылочного NPC. Это фургончик Скуби-Ду. Квест у него будет. Ты садишься в
  // тачку»): the Mystery Machine, its drawing SX's V11 at the friendly ships' 1.5, its quest the Scooby snacks laid as trails
  // (src/specialQuests.js scooby, src/scoobySnacks.js).
  {
    id: 'scooby', craft: 'mystery-machine', label: 'MYSTERY MACHINE', who: 'THE GANG', scale: 1.5,
    paint: 'sp-scooby', cockpit: { label: 'MYSTERY', line: '#4FB3C2', accent: '#8BB33F', grip: '#F0913A' },
    note: { title: 'FROM THE GANG', text: note(`Like, thanks for driving! Scoob says every snack was worth it. Mystery solved, and the paint's in your kit. - Shaggy`) },
  },
]);

export const specialById = (id) => SPECIALS.find((s) => s.id === id) ?? null;
export const SPECIAL_IDS = Object.freeze(SPECIALS.map((s) => s.id));

// Every ink a reference ship is drawn in: its palette, passed through the page's colour resolver as it is.
export const SPECIAL_INKS = new Set(SPECIALS.flatMap((s) => Object.values(CRAFT_ART[s.craft].palette)));

// A ship's model for the world's Ship (src/ship.js): the traffic drawing's glyphs, each in its palette colour, pivoting
// on the middle of the drawing, nose up, drawn `scale` times the game's cell. `baseScale` is what the page's
// breathing scale (labs/graphics/main.js updateShipScale) goes from.
const models = new Map();
export function specialModel(id) {
  if (models.has(id)) return models.get(id);
  const sp = specialById(id), art = CRAFT_ART[sp.craft];
  const cells = [];
  art.glyphs.forEach((row, j) => Array.from(row).forEach((ch, i) => {
    if (ch === ' ') return;
    cells.push({ x: i, y: j, ch, color: art.palette[art.colors[j]?.[i]] ?? art.palette.b });
  }));
  const model = normalizeModel({ name: sp.label, cells, scale: sp.scale }, sp.id);
  model.baseScale = model.scale;
  models.set(id, model);
  return model;
}

// The rows the ship is drawn in at (cols x rows of its drawing), for the menu's marks and the hail's shoulder.
export const specialSize = (id) => ({ width: specialModel(id).width, height: specialModel(id).height });

// A model's cells at `heading`, glyph by glyph, as Ship.draw does: `skip(cell)` leaves a cell out, `ink` one colour for
// the lot. Used for the ship standing where it was met, the pilot's own ship parked, and the ship flown.
export function drawModel(r, model, sx, sy, heading, { alpha = 1, ink = null, skip = null, cells = null } = {}) {
  const w = r.cellW * model.scale, h = r.cellH * model.scale;
  const a = heading + Math.PI / 2 + (model.baseRotation || 0), ca = Math.cos(a), sa = Math.sin(a);
  const list = cells ?? (model.frames?.length > 1 ? model.frames[model.idleFrame] : model.cells);
  for (const c of list) {
    if (skip && skip(c)) continue;
    const lx = c.x * w, ly = c.y * h;
    r.glyphRot(c.ch, sx + lx * ca - ly * sa, sy + lx * sa + ly * ca, a, ink ?? c.color, alpha, model.scale);
  }
}

// ---- a ship coming apart ---------------------------------------------------------------------------------------------

// How much of a ship is gone for the share of hull it has left: nothing from `from` up, a growing part below it, at most
// `most` of its cells at the last (SERENITY's, src/specialQuests.js; SX: «ее спрайт как-то разрушается, ... искры
// начинают появляться»).
const BREAKUP = Object.freeze({ from: 0.7, most: 0.5 });
export const brokenShare = (hullShare) => clamp((BREAKUP.from - hullShare) / BREAKUP.from, 0, 1) * BREAKUP.most;

const hash = (a, b) => {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// Whether a cell is gone at `share`: each has a fixed place in the order it goes in (by its own hash), so a ship breaks
// the same way every time and a cell once gone stays gone as the hull falls.
export const cellGone = (c, share) => share > 0 && hash(Math.round(c.x * 4), Math.round(c.y * 4)) < share;

// The cells that are gone, for the sparks to come from.
export function goneCells(model, share) {
  const cells = model.frames?.length > 1 ? model.frames[model.idleFrame] : model.cells;
  return cells.filter((c) => cellGone(c, share));
}

// The flown ship: its cells in their colours (those gone left out, the rest flickering a little more the worse it is), the
// drive's flame behind it while the engine burns (unless `flame` is false: the MYSTERY MACHINE smokes instead), the respawn's blink. `share` is the broken share (brokenShare).
export function drawFlown(r, ship, sx, sy, { share = 0, time = 0, flame = true } = {}) {
  if (!ship.alive) return;
  const model = ship.model, m = ship.metrics || ship.measureDrawing(r.cellW, r.cellH);
  const blink = ship.invuln > 0 && (Math.floor(ship.invuln * 12) & 1) === 0;
  const alpha = blink ? 0.32 : 1;
  const a = ship.facing, ca = Math.cos(a), sa = Math.sin(a);
  if (flame && ship.thrusting) {
    let rear = 0;
    for (const c of ship.frameCells) if (c.y > rear) rear = c.y;
    const pal = CONFIG.ship.colors.flame, flicker = 0.55 + 0.45 * Math.sin(ship.flamePhase);
    [['v', 1], ['·', 2.1]].forEach(([ch, k], i) => {
      const ly = (rear + k) * m.h;
      r.glyphRot(ch, sx - ly * sa, sy + ly * ca, a, pal[(i + Math.floor(ship.flamePhase * 0.5)) % pal.length], alpha * flicker, model.scale);
    });
  }
  for (const c of ship.frameCells) {
    if (share && cellGone(c, share)) continue;
    // A worn ship's cells dim and come back at times, past a third of its cells gone.
    const dim = share > 0.15 && hash(Math.round(c.x * 4) + 7, Math.round(c.y * 4) + Math.floor(time * 3)) < share * 0.6 ? 0.45 : 1;
    const lx = c.x * m.w, ly = c.y * m.h;
    r.glyphRot(c.ch, sx + lx * ca - ly * sa, sy + lx * sa + ly * ca, a, c.color, alpha * dim, model.scale);
  }
}

// The pilot's own ship left where it was, dark and still: the model it flies, one quiet ink.
export function drawParked(r, parked, sx, sy) {
  const model = parked.model;
  const keep = model.scale;
  model.scale = model.baseScale ?? keep;
  drawModel(r, model, sx, sy, parked.angle, { ink: CONFIG.hud.hint, alpha: 0.85 });
  model.scale = keep;
}
