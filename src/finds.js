// The finds where the world meets them: what a find costs this pilot, a cache's one row, a cache opened, and a look given or a look cache
// opened. The first three moved out of src/world.js as they were (2026-10-08, chat N2's refactoring piece: the one reward ledger and one
// settlement boundary), the looks with PLAN D3 (2026-10-09), so that the ledger's settlement (src/rewards.js settleFind,
// src/rewardLedger.js) is the only thing this file calls to change what the pilot owns or owes. World keeps a one-line method for each:
// the menus, the map and the page ask the world.
import { CONFIG } from './config.js';
import { TAU } from './util.js';
import { formatCR } from './ruins.js';
import { paintById } from './paint.js';
import { collectibleDef } from './progression.js';
import { nextFindOf, settleFind, collectionCount } from './rewards.js';
import { priceFor } from './rewardLedger.js';
import { lookById, lookTinInks } from './looks.js';

// What this pilot pays to open find `def` now: its price, or 0 under a waiver he has earned (src/rewardLedger.js; the opening's first
// cache is the first one, SX's 9A). The ledger decides it, here and in settleFind alike.
export function findPrice(world, def) {
  return priceFor(world.ledger, def);
}

// One action. The price is in the subtitle; the note only appears when the
// action cannot run, and says what is missing rather than just "no".
export function cacheActions(world, cache) {
  const price = world.findPrice(cache.def);
  const short = world.ledger.credits < price;
  return [{
    label: 'OPEN',
    disabled: short,
    note: short ? `NEED ${formatCR(price)} CR, HAVE ${formatCR(world.ledger.credits)}` : null,
    run: () => world.openCache(cache),
  }];
}

// A find opened (src/rewards.js settleFind): paid for (its price for this pilot, findPrice) and owned in one step. A
// souvenir takes the first free slot, a paint goes on the ship at once. `free` on the event: it cost nothing, a free claim.
export function openCache(world, cache) {
  const wasMarked = world.ledger.marked === cache.def.id;
  const res = settleFind(world.ledger, world.collection, world.pilot, cache.def);
  if (!res.ok) { world.emit('actionRefused', { reason: res.reason }); return; }
  // The bearing moves on to the station's other find, if it is still closed.
  if (wasMarked && cache.def.station) world.ledger.marked = nextFindOf(cache.def.station, world.ledger)?.id ?? null;
  world.buildFinds();
  world.selectedId = null;
  const paint = cache.def.kind === 'paint' ? paintById(cache.def.content) : null;
  // The burst shows a result that is already committed; it does not issue it.
  const inks = paint?.inks;
  world.particles.burst(cache.x, cache.y, Array.from({ length: 16 }, (_, k) => ({
    dx: Math.cos(k * TAU / 16) * 20, dy: Math.sin(k * TAU / 16) * 14,
    ch: paint ? ['◇', '·', '◦', '·'][k % 4] : ['─', '│', '┊', '◇'][k % 4],
    color: inks ? inks[['material', 'highlight', 'structure', 'material'][k % 4]]
      : k % 4 ? CONFIG.cache.shardColor : CONFIG.cache.sparkColor,
  })), { vx: 0, vy: 0, speed: [50, 170], life: [0.5, 1.3] });
  const at = { x: cache.x, y: cache.y, sectorId: world.sector.id };
  if (paint) {
    world.emit('paintFound', { cacheId: cache.id, paintId: paint.id, label: paint.label, price: res.price, free: res.price === 0,
      credits: res.credits, alreadySettled: res.alreadySettled, ...at });
  } else {
    const def = collectibleDef(res.content);
    world.emit('cacheOpened', {
      cacheId: cache.id, defId: res.content, label: def ? def.label : res.content,
      isNew: res.isNew, slot: res.slot, price: res.price, free: res.price === 0, credits: res.credits,
      alreadySettled: res.alreadySettled, ...at,
    });
  }
  // A collection finished is a milestone of its own, said once, when it happens.
  if (!res.alreadySettled) {
    const count = collectionCount(world.ledger, cache.def.kind);
    if (count.have === count.of) world.emit('collectionComplete', { kind: cache.def.kind, of: count.of, ...at });
  }
}

// A look given (src/looks.js): the pilot's from now, said once as `lookFound`; true when it is new. It is not put on: a
// look recolours the whole interface, so the pilot wears it from the card (C), the LOOK line.
export function giveLook(world, id, source, at = null) {
  if (!world.pilot.grantLook(id)) return false;
  world.emit('lookFound', { lookId: id, label: lookById(id).name, source, ...(at ?? { sectorId: world.sector.id }) });
  return true;
}

// A look cache opened (src/looks.js LOOK_FINDS): free, the look the pilot's, and the cache is gone from the next build. Its
// tin bursts in the look's own inks, as a paint cache's does in the paint's.
export function openLookCache(world, cache) {
  const at = { x: cache.x, y: cache.y, sectorId: world.sector.id };
  giveLook(world, cache.def.content, 'cache', at);
  world.buildFinds();
  world.selectedId = null;
  const inks = lookTinInks(cache.def.content);
  world.particles.burst(cache.x, cache.y, Array.from({ length: 16 }, (_, k) => ({
    dx: Math.cos(k * TAU / 16) * 20, dy: Math.sin(k * TAU / 16) * 14,
    ch: ['◇', '·', '◦', '·'][k % 4],
    color: inks ? inks[['material', 'highlight', 'structure', 'material'][k % 4]] : CONFIG.cache.sparkColor,
  })), { vx: 0, vy: 0, speed: [50, 170], life: [0.5, 1.3] });
}
