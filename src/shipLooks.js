// The looks of the pilot's own ship (SX, 2026-10-16, after his new drawing on labs/graphics/sketches/new-ship-paints.html: «quite хороший
// ... все можно добавлять в игру ... классический оставь в настройках как Clipper, этот пусть называется Modern и будет по умолчанию ...
// остальные которые через настройки удали. После вступления Клиппер и Самокат доступны в гараже, и у них все работает также как и у
// стандартного»): which drawing the STANDARD hull wears, chosen on the pause's GRAPHICS page (labs/graphics/pause.js, the SHIP row) and in
// the garage's hangar (src/hangarPanel.js FLEET), kept in this browser with the other settings (src/prefs.js `ship`), never in the save.
// MODERN is SX's new ship, ships/modern.json (his drawing of 2026-10-16 in the roles' colours by R1 QUIET, its brake pose a frame of its
// own), the STANDARD's own file and the default; CLIPPER his first, ships/spaceship.json, byte for byte; SCOOTY JR. the opening's loaner,
// ships/scooty-jr.json, worn by the STANDARD once the opening is over (`after`). THUNDER, EDGES and BLACKBIRD (2026-10-08) went with this.
//
// A look is a drawing, and its body. How the ship flies and what it can do are its chassis's (src/chassis.js `standard`) whatever the
// drawing; how big a target it is is the chassis's too, in a row of its own for each look (src/chassis.js LOOK_BODIES: SX, 2026-10-08,
// «боксы рисуй по их размеру», the hit box at the drawing's own size, its farthest painted point; checks/art.mjs holds each number
// to its file). CLIPPER keeps the STANDARD's 44 u. The COURIER, the HAULER and SCOOTY JR. as the loaner keep their own drawings and bodies:
// the look is the STANDARD's (`HULL`), shown wherever the STANDARD is drawn (the flight, the pause's toy, the pilot card, the hangar).
// The drawings take the pilot's paints by their roles (src/paint.js paintedHull; labs/graphics/world-art.js shipInk); SCOOTY JR. its own
// livery in STANDARD (world-art.js flownShipInks). Worn, SCOOTY JR. has its handlebar for a cockpit (labs/graphics/scooty-deck.js).
//
// The page loads the files behind the title with the hangar's (labs/graphics/page-boot.js loadShipModel) and registers the worn one as the
// STANDARD's drawing (src/hangar.js registerShipModel); a look whose file did not load is not offered.
import { registerShipModel } from './hangar.js';
import { flyingLoaner } from './loaner.js';
import { readShipLook, writeShipLook } from './prefs.js';
import { openingStage, REST } from './opening.js';

// MODERN ships/modern.json, the default; CLIPPER ships/spaceship.json, SX's first; SCOOTY JR. ships/scooty-jr.json, after the opening. The ids
// are the looks' own; the body table's key is the file's `id` (modern, spaceship, scooty-jr). `after`: the look is had once the opening is
// over, everywhere; `garage`: in the hangar only (CLIPPER stands in the SHIP row from the start, SX: «оставь в настройках»).
// A look may carry its own style of the flight's effects (SX, 2026-10-16: «видимо стиль трюков будем к кораблю привязывать»; his picks on
// labs/graphics/sketches/modern-stunts.html), put on its drawing when the drawing is registered (dress), presentation only:
//   nozzles  where the six nozzles of labs/graphics/ship-motion.js are, in the cells of the file's rows as written (as a file's own
//            `nozzles`, src/asciiModel.js readNozzles). Without it ship-motion.js nozzlesOf reads them from SX's first ship's arcs and
//            struts, which on MODERN are its shoulders: its nose's jets left from mid-body over the sides and wings. MODERN's (X1
//            PLACED): the nose's front corners (the outer ends of ◟ ◞), the wing tips (the outer ends of the flats ▔), the point of the
//            inner struts \/.
//   figures  how a jump's FLIP and ROLL turn it over (labs/graphics/stunt-fx.js drawAirShip): 'coin' (Y2 COIN), the glyphs mirrored with
//            the cells past the fold's edge and the belly shown; none (CLIPPER, SCOOTY JR.), the cells fold and the glyphs stay.
// The drift's smoke is every look's (Z0, SX: «такой же, как сейчас оставляем»).
export const SHIP_LOOKS = Object.freeze([
  Object.freeze({ id: 'modern', label: 'MODERN', model: 'ships/modern.json', figures: 'coin',
    nozzles: Object.freeze({ frontL: [1.72, 1.08], frontR: [5.28, 1.08], sideL: [0.44, 3.58], sideR: [6.56, 3.58], rearL: [3.34, 4.36], rearR: [3.66, 4.36] }) }),
  Object.freeze({ id: 'clipper', label: 'CLIPPER', model: 'ships/spaceship.json', garage: 'opening' }),
  Object.freeze({ id: 'scooty', label: 'SCOOTY JR.', model: 'ships/scooty-jr.json', after: 'opening' }),
]);
export const SHIP_LOOK_IDS = Object.freeze(SHIP_LOOKS.map((l) => l.id));
export const DEFAULT_SHIP_LOOK = 'modern';
// The hangar's ship whose drawing a look is.
export const HULL = 'standard';
export const shipLookById = (id) => SHIP_LOOKS.find((l) => l.id === id) ?? null;

// The looks' drawings, once the page has loaded them (presentation only, as src/hangar.js keeps the ships').
const models = new Map();
export function registerShipLook(id, model) {
  const look = shipLookById(id);
  if (model && look) { dress(model, look); models.set(id, model); } else models.delete(id);
}
// The look's style on its drawing (above): its nozzles from the file's cells to the pivot's (unless the file names its own), its figures.
function dress(model, look) {
  if (look.nozzles && !model.nozzles && model.anchor) {
    const a = model.anchor;
    model.nozzles = Object.freeze(Object.fromEntries(Object.entries(look.nozzles).map(([k, p]) => [k, Object.freeze({ x: p[0] - a.x, y: p[1] - a.y })])));
  }
  if (look.figures) model.figures = look.figures;
}
export const shipLookModel = (id) => models.get(id) ?? null;
// Whether the opening is over in `world` (src/opening.js): no chapter running (a veteran, a skipped start), or the chapter at rest.
const openingOver = (world) => { const s = openingStage(world); return s === null || s === REST; };
// Whether `look` can be worn in `world` now: SCOOTY JR. is the opening's loaner until the opening is over. With no world, every look.
// `garage`: whether the hangar offers it (CLIPPER and SCOOTY JR. after the opening).
export const lookOpen = (look, world, { garage = false } = {}) => !(look?.after || (garage && look?.garage)) || !world || openingOver(world);
// The looks that can be worn: those whose drawing is here and that `world` has opened, in the list's order.
export const wearableShipLooks = (world = null) => SHIP_LOOKS.filter((l) => models.has(l.id) && lookOpen(l, world));

// The page's part (labs/graphics/main.js game.shipLook; checks/lib/page-rig.mjs makes one too): what is worn, kept in `store` (the
// page's preferences backend); `world()` the world now, `apply(model)` puts a drawing on the flown ship (main.js applyModel).
//   shown()   the STANDARD is the ship flown (not SCOOTY JR., the COURIER or the HAULER): the look is the one on the screen
//   wear(id)  puts it on at once (the STANDARD's drawing, and the flown ship when that is the STANDARD) and keeps it; false when the
//             look's drawing is not here, or the world has not opened it
//   settle()  at a flight's start: a look kept that this world has not opened (SCOOTY JR. in a new pilot's opening) gives way to MODERN for
//             this visit, the one kept unchanged
//   scooter() the STANDARD flown in SCOOTY JR.'s drawing: its handlebar is the cockpit
export function createShipLook(store, { world, apply }) {
  return {
    worn: readShipLook(SHIP_LOOK_IDS, store),
    looks: () => wearableShipLooks(world()),
    shown() { const w = world(); return !!w && !flyingLoaner(w) && w.hangar?.flying === HULL; },
    wear(id, { keep = true } = {}) {
      const model = shipLookModel(id);
      if (!model || !lookOpen(shipLookById(id), world())) return false;
      this.worn = id;
      if (keep) writeShipLook(id, store);                // (a store that will not take it: this visit only)
      registerShipModel(HULL, model);
      if (this.shown()) apply(model);
      return true;
    },
    settle() {
      if (lookOpen(shipLookById(this.worn), world()) && shipLookModel(this.worn)) return;
      this.wear(DEFAULT_SHIP_LOOK, { keep: false });
    },
    scooter() { return this.worn === 'scooty' && this.shown(); },
  };
}
