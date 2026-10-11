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
  };
}
