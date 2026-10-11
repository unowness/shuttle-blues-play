// The pilot's wreck and the way back from it: what a wreck does to the ship, its cargo and the wallet, the rescue's bill, and the
// return near the wreck. Moved out of src/world.js as it was (chat W, 2026-10-04, the roadmap's refactoring piece: the wreck and
// the debris out of src/world.js); World.wreckShip and World.chargeRescue call these, World.step calls respawnShip at the same place,
// and the golden master (tools/golden.mjs) holds the move to the same frames and the same world. The pieces it leaves are
// src/debris.js's.
import { CONFIG } from './config.js';
import { sanitizeObstacle } from './trace.js';
import { failSpecial } from './specials.js';
import { courtesyWreck } from './opening.js';
import { wreckDebris } from './debris.js';

// `cause` is what ended the flight (trace.js WRECK_CAUSES); `obstacle` is a
// sketch of the rock that did it, because free rocks do not survive a visit.
export function wreckShip(world, cause = 'reset', obstacle = null) {
  const ship = world.ship;
  if (!ship.alive) return;
  // A borrowed ship's wreck is a quest lost, not the pilot's (src/specials.js): its own ship comes back.
  if (failSpecial(world, cause)) return;
  // The ghost is taken before anything about the ship changes.
  const trace = world.recorder.freeze(world.time, world.sector, ship,
    { width: world.width, height: world.height, delta: world.delta.bind(world) });
  ship.alive = false;
  ship.respawnIn = CONFIG.ship.respawnDelay;
  world.lastWreckCause = cause;
  world.wrecks++;
  const wreckedAt = { x: ship.x, y: ship.y };
  world.docked = null;
  wreckDebris(world, ship.x, ship.y, ship.debris(), ship.vx, ship.vy);
  world.chipDebt = 0;              // the parts a blow had still to knock off went with the rest (src/debris.js chipHull)
  ship.vx = 0; ship.vy = 0;

  // Wreck policy since 2026-09-24: the cargo stays where it fell, with the
  // last seconds of the flight that lost it, and waits in this sector for the
  // pilot to come back (doc 03). Credits and delivery history are never lost.
  //
  // Pirates take it instead (SX, 2026-09-29: "они отбирают груз и все деньги"):
  // it comes to rest at their den (World.pirateDen), thousands of units from
  // the wreck, and the bearing leads there like it leads to any lost cargo.
  // The trace goes with it (SX, 2026-09-30: «у нас пропали призраки игроков»,
  // after pirates had become the usual way to lose a cargo and left no ghost):
  // the den is too far from the wreck to watch it from, so REPLAY FLIGHT there
  // plays the chase ending beside the cargo (src/lostCargo.js viewTrace).
  //
  // Except in the hidden sector (SX, 2026-09-30): no bearing leads into it from
  // outside, so a cargo left there could never be found again and its contract
  // would stay locked. A wreck there sends the cargo back to its station instead.
  let stranded = null, returned = null;
  if (world.ledger.active && world.sector.hidden) {
    returned = world.ledger.returnActive();
  } else if (world.ledger.active) {
    const from = world.cargo || ship;
    const taken = cause === 'pirate';
    const at = world.clearOfStrangers(taken ? world.pirateDen(from) : world.restingPoint(from.x, from.y));
    stranded = world.ledger.strandActive({
      sectorId: world.sector.id, x: at.x, y: at.y, cause, trace,
      obstacle: cause === 'asteroid' ? sanitizeObstacle(obstacle) : null,
    });
    // The newest thing to go back for is the cargo: the bearing leads to it, not to
    // a find a station marked before (a restored station marks it again).
    world.ledger.marked = null;
    world.buildLostCargo(world.sector);
  }
  world.cargo = null;
  world.recorder.reset();
  world.emit('shipWrecked', {
    sectorId: world.sector.id, cause,
    strandedContract: stranded ? stranded.label : null,
    // The hidden sector's wreck: the cargo is back at its sending station.
    returnedContract: returned ? returned.label : null,
    returnedTo: returned ? world.stationLabelOf(returned.from) : null,
  });
  // A fifth of the wallet goes with the cargo, at most 250 CR (CONFIG.economy.pirates;
  // it was every coin), after the wreck event so the loss is still shown. Once: a
  // wrecked ship cannot be wrecked again.
  // The fifth comes out of the wreck as loose coins, and the pirates are seen to gather them before they
  // go (SX, 2026-10-01: «Пираты после того как тебя убили должны подбирать твои монеты, то есть ты
  // успеваешь заметить это»): the camera stays on the wreck a little longer for it (`seized.watch`).
  let seized = 0;
  if (cause === 'pirate') {
    seized = world.ledger.pirateLoss();
    if (seized > 0) {
      world.emit('creditsSeized', {
        sectorId: world.sector.id, x: wreckedAt.x, y: wreckedAt.y, amount: seized, credits: world.ledger.credits,
      });
      world.scatterSeized(wreckedAt.x, wreckedAt.y, seized);
      ship.respawnIn = Math.max(ship.respawnIn, CONFIG.pirates.loot.seized.watch);
    }
  }
  // Whatever the cause, the fight is over: a pilot who comes back is not met
  // by the same pirates, and pirates that made the kill gather the coins and leave.
  world.endEncounter('wrecked', { leave: true, loot: seized > 0 });
  // A crash into a rock or a planet knocks coins out as well, after the
  // wreck event so the loss is still shown. The R key is not a collision.
  // SCOOTY JR.'s wreck costs nothing (src/opening.js courtesyWreck): no coins knocked out, no rescue bill.
  const courtesy = courtesyWreck(world);
  if (!courtesy && CONFIG.asteroid.bump.spillOnWreck && (cause === 'asteroid' || cause === 'planet')) {
    world.spillReadyAt = -Infinity;
    world.spillCoins(wreckedAt.x, wreckedAt.y);
  }
  // Last, out of what the wreck left in the wallet: the rescue. The R key is not a wreck.
  if (cause !== 'reset' && !courtesy) chargeRescue(world, wreckedAt);
}

// The rescue is paid for (SX, 2026-10-02, of the free tow back, worth about 129 CR to a pilot with no cargo to lose:
// «давай брать деньги»): the hull given back up to its respawn share and the fuel up to the respawn minimum, at
// CONFIG.hull.rescueShare of the shop's prices («самопочинка дешевле будет чем та что в магазе»), as far as the wallet goes; whatever it cannot pay is free, so an empty wallet
// is still rescued. Charged at the wreck, not at the respawn, so the save made at the wreck holds it (snapshot).
export function chargeRescue(world, at) {
  const hull = Math.max(0, world.respawnHull - Math.max(0, world.hull));
  const fuel = Math.max(0, CONFIG.fuel.respawnMin - world.fuel);
  const cost = Math.ceil((hull * CONFIG.hull.repairPrice + fuel * CONFIG.fuel.price) * CONFIG.hull.rescueShare);
  if (cost <= 0) return;
  const paid = Math.min(cost, Math.max(0, world.ledger.credits));
  world.ledger.credits -= paid;
  world.emit('rescueCharged', { cost, paid, hull, fuel, credits: world.ledger.credits, sectorId: world.sector.id, x: at.x, y: at.y });
}

// The ship comes back once its wreck's time is up (World.step, every step while it is down): near the wreck, or anywhere for the
// workshop's R, with a whole hull and the tank's minimum after a real wreck.
export function respawnShip(world) {
  const ship = world.ship;
  if (ship.alive || !(ship.respawnIn <= 0)) return;
  // Back near the wreck (CONFIG.ship.wreck.near), where its pieces drift; the workshop's R anywhere.
  const near = CONFIG.ship.wreck.near;
  world.placeShip(world.lastWreckCause === 'reset' ? null : { x: ship.x, y: ship.y, min: near[0], max: near[1] });
  // Untouchable as long as the return takes and the blink after it, for every pilot (the page used to add the return's time
  // itself, and only when it played the return, so reduced motion got less).
  ship.invuln = Math.max(ship.invuln, CONFIG.ship.respawnInvuln);
  world.recorder.reset();
  // A real wreck is the rescue a pilot cannot be stranded without: a whole hull and
  // the tank's respawn minimum, and not a credit minted. The workshop's R
  // (cause 'reset') only moves the ship: ECONOMY_V1_HANDOFF.md, «R must not refill
  // fuel or repair hull for free».
  if (world.lastWreckCause !== 'reset') {
    world.hull = world.respawnHull;
    world.fuel = Math.max(world.fuel, CONFIG.fuel.respawnMin);
  } else world.hull = Math.max(1, world.hull);
}
