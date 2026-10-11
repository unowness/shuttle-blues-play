import { CONFIG } from './config.js';
import { resolveChassis } from './chassis.js';

// Ships to buy (E4; SX, 2026-09-29: «покупные корабли с характеристиками»; the
// looks SX chose: COURIER B and HAULER B). A hangar at every garage station
// holds the pilot's ships: the STANDARD from the start, the others bought with
// credits. One is flown at a time; the rest wait with the hull and fuel they
// were left with, so changing ships repairs and refuels nothing. How a ship
// moves is its chassis (src/chassis.js); how it looks is its model file, which
// the page loads (registerShipModel) and the world never reads. Prices are the v1
// economy's (ECONOMY_V1_HANDOFF.md, 2026-10-01): 1,200 and 1,800, were 600 and 900.
export const SHIPS = [
  { id: 'standard', label: 'STANDARD', chassis: 'standard', model: 'ships/spaceship.json', price: 0,
    note: 'ALL-ROUND' },
  { id: 'courier', label: 'COURIER', chassis: 'courier', model: 'ships/courier.json', price: 1200,
    note: 'FAST / HIGH BURN' },
  { id: 'hauler', label: 'HAULER', chassis: 'hauler', model: 'ships/hauler.json', price: 1800,
    note: 'TOUGH / LOW BURN' },
];
const STARTER_SHIP = 'standard';

export const shipById = (id) => SHIPS.find((s) => s.id === id) || null;

// What a ship holds at its fullest: its chassis's own hull and tank, or the
// standard's (CONFIG) for a chassis without them.
export function shipLimits(id) {
  const chassis = resolveChassis(shipById(id)?.chassis);
  return { hull: chassis.hull ?? CONFIG.hull.max, tank: chassis.tank ?? CONFIG.fuel.tank };
}

// The pilot's ships: which are owned, which is flown, and how the others were
// left. Saved with the world; read back like everything else in a save.
export class Hangar {
  constructor() {
    this.owned = new Set([STARTER_SHIP]);
    this.flying = STARTER_SHIP;
    this.stored = new Map();   // id -> { hull, fuel } of an owned ship not being flown
  }

  owns(id) {
    return this.owned.has(id);
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
  // it can hold. A save from before the hangar reads as the starter alone.
  static fromJSON(raw) {
    const h = new Hangar();
    if (!raw || typeof raw !== 'object') return h;
    for (const id of Array.isArray(raw.owned) ? raw.owned : []) if (shipById(id)) h.owned.add(id);
    if (h.owned.has(raw.flying)) h.flying = raw.flying;
    for (const s of Array.isArray(raw.stored) ? raw.stored : []) {
      if (!s || !h.owned.has(s.id) || s.id === h.flying) continue;
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
