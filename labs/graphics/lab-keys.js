// The lab's workshop keys (SX, 2026-09-30: H and R are for the lab only), off the game's frame (chat C, 2026-10-04, the roadmap's
// refactoring piece "the lab drawer off the game's hot paths"): the lab page sets `game.labKeys` (labs/graphics/lab-drawer.js), the
// game has none, and the input router calls it where it read them (input-router.js flightKeys). Their bindings are src/controls.js's
// (`diagnostics`): H shows the build's diagnostics. The respawn (the ship wrecked and brought back, only on the lab's own save, never on
// the pilot's game) is the drawer's button, R being the quests (labs/graphics/lab-drawer.js).
import { tapped } from './input-router.js';

export function respawnNow(game) {
  if (!game.LAB_SAVE) return false;
  game.world.wreckShip('reset');
  game.world.ship.respawnIn = 0.35;
  return true;
}

export function createLabKeys(game) {
  return () => {
    const { input } = game;
    if (tapped(input, 'diagnostics')) game.showDiag = !game.showDiag;
    if (game.pirateWaves) stepWaves(game);
  };
}

// Fights in a row, to fly a pirate style (`?pirateStyle=P1&pirates=4`, labs/graphics/lab-drawer.js applyReviewLinks): `delay` s after a
// fight is over and its last pirate gone, with the ship flying, another squad of the same size comes, and the hull is mended first, so
// each fight starts as the last one did. The lab's own save only: the game never runs it.
const WAVES = { delay: 4 };
export function stepWaves(game) {
  const { world } = game, waves = game.pirateWaves;
  if (!game.LAB_SAVE) return;
  if (world.encounter || world.reinforcement || world.pirates.length || !world.ship.alive || world.docked) { waves.at = null; return; }
  if (waves.at === null) { waves.at = world.time + WAVES.delay; return; }
  if (world.time < waves.at) return;
  waves.at = null;
  world.hull = world.hullMax;
  world.spawnPirates(waves.count, { reinforce: true });
}
