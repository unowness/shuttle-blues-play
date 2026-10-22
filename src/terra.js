import { CONFIG } from './config.js';
import { sectorById, neighbourOf, planetHue } from './sectors.js';
import { Planet } from './bodies.js';
import { sectorOpen } from './frontier.js';
import { clearSpot, gridPoint } from './spots.js';

// TERRA, the Earth-like planet CLIPPER's crew is led to (src/clipper.js; SX, 2026-10-22, asked where it stands: «Планета только во время
// квеста появляется и остается потом»). No catalogue's planet: the look SX took for the secret sector and never placed (TIDEWATER, the ocean
// with green islands and clouds, labs/graphics/planet-types.js; «N4 TIDEWATER ОКЕАН И ОБЛАКА: Берем, в тайную комнату», 2026-10-14), its name
// a placeholder (labs/graphics/sketches/clipper-beta.html). Its place is drawn when the escort begins, in a clear spot of an open grid sector a
// sector or two from where CLIPPER was met (out of sight, so it never comes into view out of nothing), and it stays: the ledger keeps it as
// it keeps a laid find's place (src/contracts.js `terra`, an optional field of the save), its sector holds it as a body from then
// (src/sectorPlane.js sectorBodies), the caches laid later keep off it (src/cachePlaces.js), the quests keep apart from it as from an open
// quest's place (src/questHooks.js questPlaces), and the map draws it (labs/graphics/map-screen.js).
//
// Its place is { sector, x, y }, x and y fractions of its sector.
export const TERRA = Object.freeze({ label: 'TERRA', radius: 380, pull: 228, spin: 0.045, seed: 5404, bands: 0, style: 'tidewater',
  ...planetHue('#7FB9D6'), tint2: '#B9C48A' });

// Where this game's TERRA stands, or null (the ledger's).
export const terraOf = (world) => world?.ledger?.terra ?? null;

// The catalogue record of TERRA in sector `sectorId` for this world, as a sector's `planets` holds one (its place in fractions), or null.
export function terraRecord(world, sectorId) {
  const at = terraOf(world);
  return at && at.sector === sectorId ? { ...TERRA, x: at.x, y: at.y } : null;
}

// A place for it: an open grid sector a sector or two from `from` (the grid's rows and columns), never the pilot's own, in a drawn order; in
// it a clear spot as far from the catalogue's bodies as its cushion and `clear` u more, and from the open quests' places and the caches laid
// (CONFIG.quests.apart from each). Null when none has one.
export function terraSpot(world, from, rng) {
  const s0 = sectorById(from);
  if (!s0) return null;
  const C = CONFIG.quests.special.clipper.terra;
  const near = [];
  for (const d of C.sectors) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
    const s = neighbourOf(s0, dx, dy);
    if (s && !s.hidden && sectorOpen(world.ledger, s)) near.push(s);
  }
  for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [near[i], near[j]] = [near[j], near[i]]; }
  // (And off the caches laid for this pilot already: a place drawn for one is no catalogue's.)
  const avoid = [...world.questPlaces(), ...[...world.ledger.placed.values()].map((p) => gridPoint(p.sector, p.x, p.y)).filter(Boolean)];
  for (const s of near) {
    const spot = clearSpot(s.id, rng, { clear: TERRA.radius + CONFIG.planet.orbit.height + C.clear, edge: C.edge, avoid });
    if (spot) return { sector: s.id, x: spot.x, y: spot.y };
  }
  return null;
}
// TERRA comes to stand at `at` for good: kept in the ledger, and put into its sector's bodies where they are built already.
export function placeTerra(world, at) {
  if (!at || terraOf(world)) return terraOf(world);
  world.ledger.terra = { sector: at.sector, x: at.x, y: at.y };
  const b = world.bodyCache?.get(at.sector);
  if (b && !b.planets.some((p) => p.label === TERRA.label)) {
    b.planets.push(terraPlanet(world, at.sector));
    // (Its pull where it is the pilot's sector: never, as drawn, but a lab's or a check's place may be.)
    if (world.sector?.id === at.sector) world.rebuildAttractors();
  }
  return world.ledger.terra;
}
// Its body, for its sector's (src/sectorPlane.js), at its place in that sector's units.
export function terraPlanet(world, sectorId) {
  const rec = terraRecord(world, sectorId);
  return rec && new Planet({ ...rec, x: rec.x * world.width, y: rec.y * world.height }, world.rng(`sky:${sectorId}:terra`));
}
// Its place as a quest's would be (src/questHooks.js questPlaces): a target in fractions of its sector.
export const terraTarget = (world) => { const at = terraOf(world); return at ? { sectorId: at.sector, x: at.x, y: at.y } : null; };
