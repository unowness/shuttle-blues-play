// The looks of the pilot's own ship (SX, 2026-10-08, picking from labs/graphics/sketches/hero-ships-2.html: «HERO2: N5A, N5B, N12», «берем
// эти»; the round before, 2026-10-07: «HERO: H01, H03, H09, H10», whose four went with this one): which drawing the STANDARD hull wears,
// chosen on the pause's GRAPHICS page (labs/graphics/pause.js, the SHIP row) and kept in this browser with the other settings
// (src/prefs.js `ship`), never in the save. CLASSIC is SX's own ship, ships/spaceship.json, byte for byte, and the default; the three are
// the sketch's heroes as files of their own (ships/SCHEMA.md): THUNDER (N5A THUNDER+), EDGES (N5B THUNDER+ EDGES) and BLACKBIRD (N12).
//
// A look is a drawing, and its body. How the ship flies and what it can do are its chassis's (src/chassis.js `standard`) whatever the
// drawing; how big a target it is is the chassis's too, in a row of its own for each look (src/chassis.js LOOK_BODIES: SX, 2026-10-08,
// «боксы рисуй по их размеру», the hit box at the drawing's own size, its farthest painted point; checks/ship-looks.mjs holds each number
// to its file). CLASSIC keeps the STANDARD's 44 u. The COURIER, the HAULER and SCOOTY JR. keep their own drawings and bodies: the look is
// the STANDARD's (`HULL`), shown wherever the STANDARD is drawn (the flight, the pause's toy, the pilot card, the hangar).
// The drawings take the pilot's paints by their roles (src/paint.js paintedHull; labs/graphics/world-art.js shipInk) as SX's ship does.
//
// The page loads the files behind the title with the hangar's (labs/graphics/main.js loadShipModel) and registers the worn one as the
// STANDARD's drawing (src/hangar.js registerShipModel); a look whose file did not load is not offered.
import { registerShipModel } from './hangar.js';
import { flyingLoaner } from './loaner.js';
import { readShipLook, writeShipLook } from './prefs.js';

// CLASSIC ships/spaceship.json, SX's own; THUNDER N5A, a jet fighter from above with a pitot probe ahead of its nose and a double line down
// its back; EDGES N5B, THUNDER's spine and the wings' leading edges drawn as lines out from the shoulders; BLACKBIRD N12, a long
// reconnaissance jet (the SR-71) with two nacelles on a delta. The ids are the files' own (`id` in ships/<id>.json: the body table's key).
export const SHIP_LOOKS = Object.freeze([
  Object.freeze({ id: 'classic', label: 'CLASSIC', model: 'ships/spaceship.json' }),
  Object.freeze({ id: 'thunder', label: 'THUNDER', model: 'ships/thunder.json' }),
  Object.freeze({ id: 'edges', label: 'EDGES', model: 'ships/edges.json' }),
  Object.freeze({ id: 'blackbird', label: 'BLACKBIRD', model: 'ships/blackbird.json' }),
]);
export const SHIP_LOOK_IDS = Object.freeze(SHIP_LOOKS.map((l) => l.id));
export const DEFAULT_SHIP_LOOK = 'classic';
// The hangar's ship whose drawing a look is.
export const HULL = 'standard';
export const shipLookById = (id) => SHIP_LOOKS.find((l) => l.id === id) ?? null;

// The looks' drawings, once the page has loaded them (presentation only, as src/hangar.js keeps the ships').
const models = new Map();
export function registerShipLook(id, model) {
  if (model && shipLookById(id)) models.set(id, model); else models.delete(id);
}
export const shipLookModel = (id) => models.get(id) ?? null;
// The looks that can be worn: those whose drawing is here, in the list's order.
export const wearableShipLooks = () => SHIP_LOOKS.filter((l) => models.has(l.id));

// The page's part (labs/graphics/main.js game.shipLook; checks/lib/page-rig.mjs makes one too): what is worn, kept in `store` (the
// page's preferences backend); `world()` the world now, `apply(model)` puts a drawing on the flown ship (main.js applyModel).
//   shown()   the STANDARD is the ship flown (not SCOOTY JR., the COURIER or the HAULER): the look is the one on the screen
//   wear(id)  puts it on at once (the STANDARD's drawing, and the flown ship when that is the STANDARD) and keeps it; false when the
//             look's drawing is not here
export function createShipLook(store, { world, apply }) {
  return {
    worn: readShipLook(SHIP_LOOK_IDS, store),
    looks: () => wearableShipLooks(),
    shown() { const w = world(); return !!w && !flyingLoaner(w) && w.hangar?.flying === HULL; },
    wear(id) {
      const model = shipLookModel(id);
      if (!model) return false;
      this.worn = id;
      writeShipLook(id, store);                          // (a store that will not take it: this visit only)
      registerShipModel(HULL, model);
      if (this.shown()) apply(model);
      return true;
    },
  };
}
