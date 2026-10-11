import { CONFIG } from './config.js';
import { sectorById, SECTOR_SIZE } from './sectors.js';

// The map's flags (labs/graphics/map-screen.js), as the world holds them and the save keeps them (PLAN C1, 2026-10-03). SX,
// 2026-10-02: «можно поставить разноцветные флажки метки, которые будут в локаторе отображаться, но указателя не будет, метку
// надо снять в ручную когда подлетишь, она ставится в реале не прямо на цель а рядом»; and, asked whether to build that or drop
// the promise the map's hint made («Fly to it to remove it»): «Сделать как обещано». So a flag stands in the world where the map
// landed it (the map draws it, the locator marks it, labs/graphics/map-screen.js drawWorldFlags shows it in space), the pilot
// takes it down by hand when he flies up to it (the menu's REMOVE FLAG, as a sign has REMOVE SIGN), and it is in the save.
//
//   world.flags = [flag | null] x 5, by colour    flag = { sector, x, y }   (x, y in the sector's units, as a sign's)
//
// Five colours, one flag of each; a flag put again moves. The save keeps them as a list of what is put, by the colour's name
// (JSON a person can read): [{ colour: 'PINK', sector: 'sector-j05', x: 3100, y: 2210 }].

// The colours, in the order of the keys 1 to 5 on the map. Their inks are the map's (FLAGS in map-screen.js): a name is what
// is saved and said, an ink is how it is drawn.
export const FLAG_NAMES = Object.freeze(['WHITE', 'CYAN', 'PINK', 'LIME', 'PEACH']);

// How far from a sector's edge a flag stands, u: a flag never straddles a seam, and the menu's reach (a sign's, below) is the
// less, so a flag is always taken down from the sector it stands in.
export const FLAG = Object.freeze({ margin: 240 });

export const emptyFlags = () => FLAG_NAMES.map(() => null);

// A place held inside its sector, off the edge by `margin`, in whole units (what is live is what is saved).
const keep = (v, max) => Math.round(Math.max(FLAG.margin, Math.min(max - FLAG.margin, v)));
export const flagSpot = (x, y) => ({ x: keep(x, SECTOR_SIZE.width), y: keep(y, SECTOR_SIZE.height) });

// What the save keeps: the flags that are put.
export function flagsToJSON(flags) {
  return flags.flatMap((f, i) => (f ? [{ colour: FLAG_NAMES[i], sector: f.sector, x: f.x, y: f.y }] : []));
}

// A save is untrusted input. A flag survives as a known colour, once (the first of a colour is kept), in a sector of the grid
// (the hidden one is never on the map), at a finite place, which is held inside its sector, off the edge by `margin`.
export function readFlags(raw) {
  const out = emptyFlags();
  for (const r of Array.isArray(raw) ? raw : []) {
    const slot = FLAG_NAMES.indexOf(r?.colour);
    const sector = typeof r?.sector === 'string' ? sectorById(r.sector) : null;
    if (slot < 0 || out[slot] || !sector || sector.hidden || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    out[slot] = { sector: sector.id, ...flagSpot(r.x, r.y) };
  }
  return out;
}

// Where a flag is in the frame of the sector the ship is in (a neighbour's, shifted by where it lies), or null when it is
// further than the neighbours drawn in place.
export function flagInFrame(world, flag) {
  if (flag.sector === world.sector.id) return { x: flag.x, y: flag.y };
  const n = (world.neighbours ?? []).find((q) => q.sector.id === flag.sector);
  return n ? { x: flag.x + n.ox, y: flag.y + n.oy } : null;
}

// The flag's footprint for its menu's marks: the pole and its pennant (labs/graphics/map-screen.js drawFlag) are about 10 px by
// 13, the pole's foot on the place. `dx` and `dy` (in cells, the way a sign's are) move the marks from the foot to the middle.
const ART = Object.freeze({ model: Object.freeze({ width: 1, height: 1 }), scale: 1, dx: 0.3, dy: -0.37 });

// The menus of the flags in the ship's sector, one each, a sign's way: REMOVE FLAG within the sign's reach. Candidates of
// World.candidates; the action re-checks identity and range when it runs (World.runAction).
export function flagCandidates(world) {
  const out = [];
  world.flags.forEach((f, i) => {
    if (!f || f.sector !== world.sector.id) return;
    out.push({
      id: `flag:${i}`, title: `${FLAG_NAMES[i]} FLAG`, subtitle: 'YOUR MARK',
      x: f.x, y: f.y, interactRadius: CONFIG.sign.interactRadius, art: ART,
      actions: [{ label: 'REMOVE FLAG', run: () => takeDownFlag(world, i) }],
    });
  });
  return out;
}

// The flag taken down by hand: gone from the map and the locator with it (both read world.flags). Returns whether it was.
export function takeDownFlag(world, slot) {
  const gone = world.flags[slot];
  if (!gone) { world.emit('actionRefused', { reason: 'FLAG IS GONE' }); return false; }
  world.flags[slot] = null;
  if (world.selectedId === `flag:${slot}`) world.selectedId = null;
  world.emit('flagRemoved', { slot, colour: FLAG_NAMES[slot], sectorId: gone.sector, x: gone.x, y: gone.y });
  return true;
}
