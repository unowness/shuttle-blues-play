import { CONFIG } from './config.js';
import { sectorById, SECTOR_SIZE, SECRET_HOLE } from './sectors.js';
import { SIGNALS } from './progression.js';
import { CATALOGUE } from './rewards.js';
import { secretHoleAt } from './secretHole.js';
import { sectorOpen, openSectorIds } from './frontier.js';

// Where a quest may put something in the open, worked out from the catalogue alone so it can be chosen for a sector the
// pilot is not in (the pilot out of fuel, QUESTS_V2_HANDOFF.md: a ship in trouble, a ship pestered, a planet's errand).

// A draw from `list` by a [0, 1) stream.
export const pickOf = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

// Where a side quest may put something: every sector open to the pilot of `ledger` (the frontier, src/frontier.js), the one
// he is in first, never O-08 (SX, 2026-10-02: «квесты тоже раздаются всегда чем больше мир тем в более широких и рандомных
// местах они генерятся не всегда в секторе где ты находишься»). It was this sector and the ones beside it; now the wider the
// frontier, the wider the draw, and the pilot's own sector is one of them, not the rule.
export function questSectors(sector, ledger) {
  const out = sector && !sector.hidden && sectorOpen(ledger, sector) ? [sector] : [];
  for (const id of openSectorIds(ledger)) if (id !== sector?.id) out.push(sectorById(id));
  return out.filter((x) => x && !x.hidden);
}

// The open quests stand apart (SX's item 5, 2026-10-04: side quests were put too close together; chat W): every place a quest
// puts in the open keeps CONFIG.quests.apart u from every other open quest's place (its target, read from the quest list,
// src/quests.js currentQuests, through World.questPlaces), across the seams too; and a side quest whose place the catalogue fixes
// (a cache, a signal, a stranger's cargo, a ruin, a planet) is not offered while another open quest stands that near it
// (src/quests.js offerSideQuest). checks/quest-spacing.mjs holds both.
const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;

// A place in a sector (fractions of it) as a point of the whole grid, in world units; null for a sector there is not.
export function gridPoint(sectorId, fx, fy) {
  const s = sectorById(sectorId);
  return s ? { x: (s.col + fx) * W, y: (s.row + fy) * H } : null;
}
// The places of a list of quests (their `target`, { sectorId, x, y } in fractions), as grid points.
export const questPlaces = (quests) => quests.map((q) => q?.target && gridPoint(q.target.sectorId, q.target.x, q.target.y)).filter(Boolean);
// Whether a place in a sector stands nearer than `apart` u to one of `places` (grid points).
export function nearPlaces(sectorId, fx, fy, places, apart = CONFIG.quests.apart) {
  const p = gridPoint(sectorId, fx, fy);
  return !!p && places.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < apart);
}

// A clear place in a sector, as fractions of it: inside the middle (`edge` of the sector off each side), `clear` u from
// its stations (their safe radius, 900 u, counts as theirs), planets (and their cushion), holes, caches and signals. With
// `away` ({ x, y, by } in this sector's units) also `by` u from that point, the pilot's, so what is made does not
// appear in view; with `avoid` (grid points: the open quests' places, World.questPlaces) CONFIG.quests.apart u from each.
// Null when 80 tries find nothing.
export function clearSpot(sectorId, rng, { clear, edge = 0.12, away = null, avoid = null } = {}) {
  const sector = sectorById(sectorId);
  if (!sector) return null;
  const things = [
    ...(sector.stations ?? []).map((t) => ({ x: t.x * W, y: t.y * H, r: 900 })),
    ...(sector.planets ?? []).map((t) => ({ x: t.x * W, y: t.y * H, r: t.radius + CONFIG.planet.orbit.height })),
    ...(sector.holes ?? []).map((t) => ({ x: t.x * W, y: t.y * H, r: (t.disc ?? 250) * 2 })),
    // The secret hole roams, so it is not in the catalogue (src/secretHole.js): where the world has it now, if here.
    ...[secretHoleAt(sectorId)].filter(Boolean).map((t) => ({ x: t.x * W, y: t.y * H, r: SECRET_HOLE.disc * 2 })),
    ...CATALOGUE.filter((f) => f.sector === sectorId).map((f) => ({ x: f.x * W, y: f.y * H, r: 0 })),
    ...SIGNALS.filter((g) => g.sector === sectorId).map((g) => ({ x: g.x * W, y: g.y * H, r: 0 })),
  ];
  for (let i = 0; i < 80; i++) {
    const x = (edge + (1 - 2 * edge) * rng()) * W, y = (edge + (1 - 2 * edge) * rng()) * H;
    if (away && Math.hypot(away.x - x, away.y - y) <= away.by) continue;
    if (avoid?.length && nearPlaces(sectorId, x / W, y / H, avoid)) continue;
    if (things.every((t) => Math.hypot(t.x - x, t.y - y) > t.r + clear)) return { x: x / W, y: y / H };
  }
  return null;
}
