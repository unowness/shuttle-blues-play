// A black hole's passage (cut from src/world.js, PLAN D3's last pieces, 2026-10-17): the ship thrown out of another hole, on the
// heading it fell in with or the nearest one whose coast is clear. Each takes the world first; World keeps a one-line method of each name
// (the tools and the checks ask the world), and they call each other through it.
import { CONFIG } from './config.js';
import { TAU } from './util.js';
import { PLANE } from './topology.js';
import { sectorById, sectorTitle, holeDef } from './sectors.js';
import { SECRET_HOLE_ID, SECRET_EXIT_ID, moveSecretHole } from './secretHole.js';
import { sectorOpen } from './frontier.js';
import { towBehind } from './tow.js';

// Where each hole leads: the ring (SX, 2026-10-19: «в черных дырах черные дыры все выкидывают в другие сектора ... Придумай
// распределение кто куда кидает»; his pick, «Да, строй кольцо с новой дырой в K-05»). The grid's holes stand in a ring in the
// order their sectors open (CONFIG.frontier.order, a sector's own holes in catalogue order), and a hole throws the ship out of the
// next open one; the last open one throws it home, out of the first (J-05's, HOME's sector). With the whole grid open:
//   J-05 -> K-05 -> K-04 -> J-04 -> K-06 -> J-05   (J-06 has no hole, so the ring passes it by)
// A hole in a closed sector is not on the ring and no passage leads into one: each sector opened changes one exit, the last
// one's, from home to the new sector. A hole off the ring (O-08's) leads to the ring's first, home. Before 2026-10-19 the exit
// was rolled at random among the other open holes on every passage.

// The open holes of the ring, in its order, each with its sector (sectors.js holeDef).
export function holeRing(ledger) {
  return CONFIG.frontier.order.filter((id) => sectorOpen(ledger, id))
    .flatMap((id) => (sectorById(id)?.holes ?? []).map((h) => holeDef(h.id)));
}

// The hole a passage from `holeId` comes out of, or null when the ring holds that hole alone (the start's J-05 before K-05 had
// one): the ship is then thrown back out of the hole it fell into.
export function holeExit(holeId, ledger) {
  const ring = holeRing(ledger), at = ring.findIndex((h) => h.id === holeId);
  const next = at < 0 ? ring[0] : ring[(at + 1) % ring.length];
  return next && next.id !== holeId ? next : null;
}

// A black hole is a passage, not a death (SX, 2026-09-24). The ship comes out
// of another hole, the ring's next (holeExit), on the heading it fell in with,
// just outside the exit's strong pull and fast enough to leave it, and that
// hole cannot take it again for a moment. Cargo, camera and follower keep their
// offsets from the ship. The trace starts again: a ghost never slides across the map.
export function transitHole(world, hole) {
  const ship = world.ship;
  const B = CONFIG.blackHole;
  const from = world.sector;
  // Pirates never follow through a hole: the fight is over, and they lose the
  // trail (SX: "убежать от них можно прыгая через черные дыры"). The event is
  // held back until the ship is out, because arriving in a sector wipes the
  // feedback lines and this one is meant to be read there.
  const ended = world.endEncounter('hole', { deferEvent: true });
  // The secret hole (its way shut since 2026-10-19, src/secretHole.js) leads to O-08's own, the only way in; every other hole,
  // O-08's among them, to the ring's next (holeExit), never into a closed sector, or back out of itself when there is none.
  const exitDef = hole.id === SECRET_HOLE_ID ? holeDef(SECRET_EXIT_ID) : holeExit(hole.id, world.ledger);
  const to = exitDef ? sectorById(exitDef.sectorId) : from;
  const oldX = ship.x, oldY = ship.y;

  const speed = Math.hypot(ship.vx, ship.vy);
  const ux = speed > 1 ? ship.vx / speed : Math.cos(ship.angle);
  const uy = speed > 1 ? ship.vy / speed : Math.sin(ship.angle);

  if (to.id !== from.id) world.loadSector(to);
  const exit = world.holes.find((h) => h.id === exitDef?.id) || hole;
  // Out of O-08 the secret hole moves, away from where the pilot comes out, and before the heading is chosen, so that
  // the coast is checked against it too (SX: «а секретная переезжает»).
  // Under the lure it has gone already (met, and the pilot far off in O-08), and comes again as the lure says.
  if (hole.id === SECRET_EXIT_ID && !world.secretLure) moveSecretHole(world, { sectorId: to.id, x: exit.x, y: exit.y });
  // Surface where the pull falls below a share of the engine's thrust, but
  // never past the disc: the ship comes out of the swirl, not out of empty
  // space. A weaker engine (2026-09-26: thrust 1150 -> 540) needs no further
  // reach, because the ejection below already beats the escape speed there.
  const thrust = ship.params().thrust;
  const pull = Math.sqrt(exit.mass / (thrust * CONFIG.stranded.gravityShare));
  const reach = Math.max(exit.horizon * 3, Math.min(exit.disc * 0.95, Math.max(exit.disc * 0.7, pull)));
  const escape = Math.sqrt((2 * exit.mass) / reach);
  const leave = Math.min(ship.params().maxSpeed, Math.max(speed, escape * B.ejectMargin));
  // On the heading it fell in with, or the nearest one from which a coast is not
  // taken by a hole or a planet again (World.exitHeading).
  const fell = Math.atan2(uy, ux);
  const heading = world.exitHeading(exit, reach, leave, fell);
  const hx = Math.cos(heading), hy = Math.sin(heading);
  ship.x = exit.x + hx * reach;
  ship.y = exit.y + hy * reach;
  ship.vx = hx * leave;
  ship.vy = hy * leave;
  ship.angle = heading;
  ship.angVel = 0;
  ship.holeGrace = B.grace;

  world.cam.x += ship.x - oldX;
  world.cam.y += ship.y - oldY;
  // The container comes out behind the hull on its new heading, moving with it.
  if (world.cargo) world.cargo = towBehind(world);
  if (to.id !== from.id) {
    world.bullets.length = 0;
    world.particles.items.length = 0;
    world.spawnField(to);
  }
  world.recorder.reset();
  // Thrown out: a ring of the hole's own light where the ship surfaced.
  world.particles.burst(ship.x, ship.y, Array.from({ length: 12 }, (_, k) => ({
    dx: Math.cos((k * TAU) / 12) * 18, dy: Math.sin((k * TAU) / 12) * 18,
    ch: k % 2 ? '·' : '*', color: k % 3 ? B.color : '#ffffff',
  })), { vx: ship.vx * 0.2, vy: ship.vy * 0.2, speed: [80, 260], life: [0.4, 1.0] });
  world.emit('holeTransit', {
    from: from.id, to: to.id, label: to.label, title: sectorTitle(to),
    holeId: hole.id || null, exitId: exit.id || null,
    // Degrees the exit heading was turned from the one it fell in with; 0 when straight.
    turned: Math.round(Math.abs(Math.atan2(Math.sin(heading - fell), Math.cos(heading - fell))) * 180 / Math.PI),
  });
  if (ended) world.emit('encounterEnded', { ...ended, sectorId: world.sector.id });
}

// The heading a ship thrown out of `exit` leaves on: the one it fell in with, or
// the nearest to it, turning a step at a time either way, from which a coast
// with no input is not taken by a hole or a planet again within `exitClear`
// seconds. Thrown straight at a dead edge's current or a planet's cushion, a ship
// came back down the same line into the hole, and no speed could help: the wall
// turned it at any speed (QA, 2026-09-30: 21 of 150 coasting exits from O-08,
// whose hole lies 700-900 u from two dead edges, and 2-4 % elsewhere).
export function exitHeading(world, exit, reach, leave, heading) {
  const B = CONFIG.blackHole;
  const step = (B.exitTurnStep * Math.PI) / 180;
  for (let k = 0; k * step <= Math.PI + 1e-9; k++) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const a = heading + sign * k * step;
      const ux = Math.cos(a), uy = Math.sin(a);
      if (world.coastsClear(exit.x + ux * reach, exit.y + uy * reach, ux * leave, uy * leave, B.exitClear)) return a;
    }
  }
  return heading;
}

// Whether a ship left to coast from (x, y) at (vx, vy) stays out of every hole's
// horizon (a hole's own grace aside) and every planet's surface for `seconds`.
// The ship's own forces as a point, stepped coarsely: gravity, the planets'
// cushion, a dead edge's current, drag. Leaving the sector through an open edge
// ends it: what lies beyond is not known here.
export function coastsClear(world, x, y, vx, vy, seconds) {
  const dt = 1 / 20;
  const drag = Math.max(0, 1 - world.ship.params().drag * dt);
  const grace = CONFIG.blackHole.grace;
  for (let t = 0; t < seconds; t += dt) {
    const g = world.gravityAt(x, y), o = world.orbitAccel(x, y, vx, vy), b = world.boundaryAccel(x, y, vx, vy);
    vx = (vx + (g.x + o.ax + b.ax) * dt) * drag;
    vy = (vy + (g.y + o.ay + b.ay) * dt) * drag;
    x += vx * dt; y += vy * dt;
    // Across a live seam the coast is another sector's business; past a dead edge the rope throws it back
    // (boundaryAccel above), so it is followed on.
    if (world.topology.mode === PLANE && (x < 0 || y < 0 || x > world.width || y > world.height)) {
      const dx = x < 0 ? -1 : x > world.width ? 1 : 0, dy = y < 0 ? -1 : y > world.height ? 1 : 0;
      if ((dx && world.openNeighbour(world.sector, dx, 0)) || (dy && world.openNeighbour(world.sector, 0, dy))) return true;
    }
    // Half a step of travel is added to a horizon, so a fast coast cannot step over it.
    const slack = Math.hypot(vx, vy) * dt * 0.5;
    for (const a of world.attractors) {
      if (a.kind === 'hole' && t < grace) continue;
      const d = world.delta(x, y, a.x, a.y);
      if (Math.hypot(d.x, d.y) < a.kill + slack) return false;
    }
  }
  return true;
}
