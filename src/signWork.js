// The signs in the world (cut from src/world.js, PLAN D3's last pieces, 2026-10-17): every sign standing in a sector, where one may
// stand, and a sign left or taken down. The board and the authored signs are src/signs.js, the composer src/signPanel.js. Each takes the
// world first; World keeps a one-line method of each name (the page, the menus and the checks ask the world).
import { CONFIG } from './config.js';
import { sectorById } from './sectors.js';
import { wordDef } from './progression.js';
import { SIGN_WORDS_MAX, fixedSigns, captionOf } from './signs.js';

// Every sign standing in a sector, other pilots' and this pilot's, in that
// sector's coordinates. An own sign carries the pilot's current name. Read only:
// with none of the pilot's own in the sector the list is the kept, frozen one of
// the authored signs (src/signs.js fixedSigns), the same array every call.
export function signsIn(world, sectorId) {
  const own = world.signs.inSector(sectorId), fixed = fixedSigns(sectorId, world.width, world.height);
  if (!own.length) return fixed;
  return [...fixed, ...own.map((s) => ({ id: s.id, x: s.x, y: s.y, words: s.words, author: world.pilot.nickname, type: s.type, own: true }))];
}

// Why a sign cannot stand at (x, y) in this sector, or null when it can.
// Doc 03: never over a docking or interaction point. Also out of a planet's
// orbit and a hole's disc and pull, where nobody could stop to read it, off
// the sector's edges, so it never straddles a seam, and clear of other signs.
// `ignoreId` lets a standing sign be held to the rule without meeting itself.
export function signIssue(world, x, y, ignoreId = null) {
  const S = CONFIG.sign;
  const near = (ox, oy, need) => { const d = world.delta(x, y, ox, oy); return Math.hypot(d.x, d.y) < need; };
  if (x < S.edgeClear || y < S.edgeClear || x > world.width - S.edgeClear || y > world.height - S.edgeClear) {
    return 'TOO CLOSE TO THE SECTOR EDGE';
  }
  const thrust = world.ship.chassis.thrust;      // (the hull's own: a cup of coffee moves no sign's place)
  for (const h of world.holes) {
    const pull = Math.sqrt(h.mass / (thrust * CONFIG.stranded.gravityShare));
    if (near(h.x, h.y, Math.max(h.disc, pull) + S.wellMargin)) return 'TOO CLOSE TO A BLACK HOLE';
  }
  for (const p of world.planets) {
    if (near(p.x, p.y, p.radius + CONFIG.planet.orbit.height + S.wellMargin)) return 'TOO CLOSE TO A PLANET';
  }
  for (const s of world.stations) if (near(s.x, s.y, s.hullRadius + S.objectClear)) return 'TOO CLOSE TO A STATION';
  const objects = [
    ...world.caches.map((o) => [o, 'A CACHE']),
    ...world.paintCaches.map((o) => [o, 'A PAINT CACHE']),
    ...world.lookCaches.map((o) => [o, 'A LOOK CACHE']),
    ...world.signals.map((o) => [o, 'A SIGNAL']),
    ...world.lostCargo.map((o) => [o, 'CARGO']),
  ];
  for (const [o, name] of objects) if (near(o.x, o.y, S.objectClear)) return `TOO CLOSE TO ${name}`;
  for (const s of world.signsIn(world.sector.id)) {
    if (s.id !== ignoreId && near(s.x, s.y, S.spacing)) return 'TOO CLOSE TO ANOTHER SIGN';
  }
  return null;
}

// Whether a sign can be left where the ship is now: afloat, undocked, no
// faster than docking allows (SX: "как для стыковки"), and at a place
// signIssue allows. Asked when the composer opens and again when it places.
export function signCheck(world) {
  const ship = world.ship;
  if (!ship.alive) return { ok: false, reason: 'NOT WHILE WRECKED' };
  if (world.docked) return { ok: false, reason: 'UNDOCK FIRST' };
  const limit = CONFIG.station.dockSpeed;
  if (Math.hypot(ship.vx, ship.vy) > limit) return { ok: false, reason: `BRAKE BELOW ${limit}` };
  const issue = world.signIssue(ship.x, ship.y);
  return issue ? { ok: false, reason: issue } : { ok: true };
}

// Leaves a sign where the ship is, captioned with one to three words the
// pilot knows. On a full board the oldest sign is taken down to make room.
export function leaveSign(world, words, type = undefined) {
  const check = world.signCheck();
  if (!check.ok) { world.emit('actionRefused', { reason: check.reason }); return null; }
  const known = Array.isArray(words) && words.length >= 1 && words.length <= SIGN_WORDS_MAX &&
    words.every((id) => wordDef(id) && world.collection.words.has(id));
  if (!known) { world.emit('actionRefused', { reason: 'CHOOSE 1 TO 3 KNOWN WORDS' }); return null; }
  const { sign, replaced } = world.signs.add({
    sectorId: world.sector.id, x: Math.round(world.ship.x), y: Math.round(world.ship.y), words, type,
  });
  world.emit('signPlaced', {
    signId: sign.id, sectorId: sign.sectorId, x: sign.x, y: sign.y, text: captionOf(sign.words),
    replaced: replaced ? {
      signId: replaced.id, sectorId: replaced.sectorId, text: captionOf(replaced.words),
      sectorLabel: sectorById(replaced.sectorId)?.label || replaced.sectorId,
    } : null,
  });
  return sign;
}

// Only an own sign can be taken down; another pilot's has no such action.
export function removeSign(world, id) {
  const gone = world.signs.remove(id);
  if (!gone) { world.emit('actionRefused', { reason: 'SIGN IS GONE' }); return false; }
  if (world.selectedId === id) world.selectedId = null;
  world.emit('signRemoved', { signId: id, sectorId: gone.sectorId, x: gone.x, y: gone.y, text: captionOf(gone.words) });
  return true;
}
