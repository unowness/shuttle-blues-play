import { CONFIG } from './config.js';
import { resolveChassis } from './chassis.js';
import { SPECIALS } from './specialShips.js';

// Ships to buy (E4; SX, 2026-09-29: «покупные корабли с характеристиками»; the
// looks SX chose: COURIER B and HAULER B). A hangar at every garage station
// holds the pilot's ships: the STANDARD from the start, the others bought with
// credits. One is flown at a time; the rest wait with the hull and fuel they
// were left with, so changing ships repairs and refuels nothing. How a ship
// moves is its chassis (src/chassis.js); how it looks is its model file, which
// the page loads (registerShipModel) and the world never reads. Prices are the v1
// economy's (ECONOMY_V1_HANDOFF.md, 2026-10-01): 1,200 and 1,800, were 600 and 900; twice that since E1 LIGHT (SX, 2026-10-17:
// «по экономике давай пока Е1 возьмем»; docs/decisions/2026-10.md, "E1 LIGHT…"): a ship a goal of its own, not a few minutes' pay.
export const SHIPS = [
  { id: 'standard', label: 'STANDARD', chassis: 'standard', model: 'ships/modern.json', price: 0,
    note: 'ALL-ROUND' },
  { id: 'courier', label: 'COURIER', chassis: 'courier', model: 'ships/courier.json', price: 2400,
    note: 'FAST / HIGH BURN' },
  { id: 'hauler', label: 'HAULER', chassis: 'hauler', model: 'ships/hauler.json', price: 3600,
    note: 'TOUGH / LOW BURN' },
];
const STARTER_SHIP = 'standard';

// The reference ships' own (SX, 2026-10-13: «Я хочу чтобы после квеста с отсылочным персонажем ты мог брать в гараже его корабль в полет»;
// how it flies, «Со своей физикой»): each one the pilot's once its crew's run is done, which the pilot's record already says (src/pilot.js
// `notes`: a quest won leaves its note), so the save holds nothing new for it; never bought or sold. It flies on its quest's chassis with the
// STANDARD's tank and gun (src/chassis.js `crew-<id>`: its speed, turn, body and hull; SX's W6, 2026-10-15) in its quest's drawing
// (src/specialShips.js specialModel, made in code, in its own colours, never the pilot's paint). `note` is what its chassis is, in the
// hangar's words: SWORDFISH II's TWIN GUN and the FALCON's QUICK GUN stay in their quests.
const CREW_NOTES = Object.freeze({
  delorean: 'FAST / FRAGILE', swordfish: 'NIMBLE / FIGHTER', express: "SLOW / TOUGH",
  falcon: 'TOUGH / SLOW TURN', serenity: 'BIG / THIN HULL', xwing: 'AGILE / SMALL',
});
export const CREW_SHIPS = Object.freeze(SPECIALS.map((sp) => Object.freeze({
  id: sp.id, label: sp.label, chassis: `crew-${sp.id}`, note: CREW_NOTES[sp.id], who: sp.who, crew: true,
})));

export const shipById = (id) => SHIPS.find((s) => s.id === id) || CREW_SHIPS.find((s) => s.id === id) || null;

// What a ship holds at its fullest: its chassis's own hull and tank, or the
// standard's (CONFIG) for a chassis without them.
export function shipLimits(id) {
  const chassis = resolveChassis(shipById(id)?.chassis);
  return { hull: chassis.hull ?? CONFIG.hull.max, tank: chassis.tank ?? CONFIG.fuel.tank };
}

// The pilot's ships: which are owned, which is flown, and how the others were
// left. Saved with the world; read back like everything else in a save.
// `crews` is the crews whose ships the pilot has: the pilot's notes themselves (the World hands its Pilot's `notes` over and keeps it so:
// src/world.js, src/worldSave.js), read, never written or saved here; `owned` holds only what was bought or given at the start.
export class Hangar {
  constructor(crews = new Set()) {
    this.owned = new Set([STARTER_SHIP]);
    this.flying = STARTER_SHIP;
    this.stored = new Map();   // id -> { hull, fuel } of an owned ship not being flown
    this.crews = crews;
  }

  owns(id) {
    return this.owned.has(id) || (!!shipById(id)?.crew && this.crews.has(id));
  }

  toJSON() {
    return {
      owned: [...this.owned],
      flying: this.flying,
      stored: [...this.stored].map(([id, s]) => ({ id, hull: s.hull, fuel: s.fuel })),
    };
  }

  // Untrusted: unknown ships are dropped, the starter is always owned, the
  // flown one must be owned, and a stored ship's hull and fuel are held to what
  // it can hold. A save from before the hangar reads as the starter alone. A crew's
  // ship is never among the bought, and is had only while `crews` (the pilot's notes, read
  // from the same save) has its crew: flown without, the starter is flown.
  static fromJSON(raw, crews = new Set()) {
    const h = new Hangar(crews);
    if (!raw || typeof raw !== 'object') return h;
    for (const id of Array.isArray(raw.owned) ? raw.owned : []) if (shipById(id) && !shipById(id).crew) h.owned.add(id);
    if (h.owns(raw.flying)) h.flying = raw.flying;
    for (const s of Array.isArray(raw.stored) ? raw.stored : []) {
      if (!s || !h.owns(s.id) || s.id === h.flying) continue;
      const max = shipLimits(s.id);
      const hull = Number.isFinite(s.hull) ? Math.min(max.hull, Math.max(1, Math.round(s.hull))) : max.hull;
      const fuel = Number.isFinite(s.fuel) ? Math.min(max.tank, Math.max(0, s.fuel)) : max.tank;
      h.stored.set(s.id, { hull, fuel });
    }
    return h;
  }
}

// The ships' drawings, once the page has loaded them (presentation only: a check
// or the simulation never needs one).
const models = new Map();
export function registerShipModel(id, model) {
  if (model) models.set(id, model); else models.delete(id);
}
export function shipModel(id) {
  return models.get(id) || null;
}
