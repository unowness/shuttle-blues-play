// What a bearing may lead to from afar (World.discoveries): every station, find, lost cargo, signal, quest's ship and droid of the
// sector farther than its reach (its menu's: closer, the menu is the instruction) and within its `discoverRadius`. Moved out of
// src/world.js as it was (2026-10-07, refactor on touch); World.discoveries() hands its world here.
import { CONFIG } from './config.js';
import { workingKind } from './ruins.js';
import { findTitle } from './rewards.js';
import { questDiscoveries } from './questHooks.js';

// Stations far enough to be worth a direction marker but not yet in range. Each says its `reach` and its `range` (its interactRadius and
// discoverRadius); `band` (1 by default) lets in what is out past its range by up to that factor, so a mark already shown keeps its
// place a little past it (labs/graphics/locator.js nearbyBearings).
export function discoveries(world, { band = 1 } = {}) {
  const out = [];
  const known = [
    ...world.stations.map((s) => ({ ...s, label: workingKind(world.ledger, s) === 'ruin' ? `${s.label} / RUIN` : s.label })),
    ...world.caches.map((c) => ({ ...c, label: findTitle(c.def) })),
    ...world.paintCaches.map((c) => ({ ...c, label: findTitle(c.def) })),
    ...world.lookCaches.map((c) => ({ ...c, label: findTitle(c.def) })),
    ...world.lostCargo.map((c) => ({ ...c, label: c.stranger ? 'LOST CARGO' : 'STRANDED CARGO' })),
    ...world.signals.map((c) => ({ ...c, label: 'SIGNAL' })),
    ...questDiscoveries(world),
    ...world.droids.map((d) => ({ id: d.id, x: d.x, y: d.y, label: d.label,
      interactRadius: CONFIG.droids.interactRadius, discoverRadius: CONFIG.droids.discoverRadius })),
  ];
  for (const s of known) {
    const d = world.delta(s.x, s.y, world.ship.x, world.ship.y);
    const dist = Math.hypot(d.x, d.y);
    if (dist <= s.interactRadius || dist > s.discoverRadius * band) continue;
    out.push({ id: s.id, label: s.label, angle: Math.atan2(d.y, d.x), dist, reach: s.interactRadius, range: s.discoverRadius });
  }
  return out;
}
