import { MAP_CONTENT } from './mapContentConfig.js';
import { sectorById, stationDefById, SECTOR_SIZE } from './sectors.js';
import { sectorOpen } from './frontier.js';

// Phase restricts a preference, never the existing system's eligibility. A sector's own
// restored station may open it ahead of the usual frontier; normal fallback still works there.
function available(p, ledger) {
  return p.phase <= (ledger?.restored?.size ?? 0) && sectorOpen(ledger, p.sectorId);
}

export function contentAreas(type, ledger, { sectorId, variant } = {}) {
  return MAP_CONTENT.filter(p => p.type === type && p.radius > 0 && available(p, ledger) &&
    (!sectorId || p.sectorId === sectorId) && (variant === undefined || !p.variant || p.variant === variant));
}

function endpoint(ref) {
  if (!ref) return null;
  const sector = sectorById(ref.sectorId);
  const current = ref.kind === 'station' ? stationDefById(ref.id) :
    ref.kind === 'planet' ? sector?.planets.find(p => p.label === ref.label) : ref;
  return current ? { ...ref, x: current.x, y: current.y } : null;
}

// Points (ruins/raid sites) and directed links share the same anchor convention.
// Working-station, reward, distance and quest-slot rules remain the caller's responsibility.
export function contentLinks(type, ledger) {
  return MAP_CONTENT.filter(p => p.type === type && p.anchor && available(p, ledger))
    .map(p => ({ ...p, anchor: endpoint(p.anchor), target: endpoint(p.target) }))
    .filter(p => p.anchor && sectorOpen(ledger, p.anchor.sectorId) &&
      (!p.targetId || (p.target && sectorOpen(ledger, p.target.sectorId))));
}

export function insideContentArea(point, areas, width = SECTOR_SIZE.width, height = SECTOR_SIZE.height) {
  return areas.some(a => Math.hypot((point.x - a.x) * width, (point.y - a.y) * height) <= a.radius);
}
