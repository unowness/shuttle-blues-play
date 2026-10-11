// What the ship is next to, chosen each physics step, and the row pressed in its menu (cut out of src/world.js, PLAN D3, 2026-10-09; the
// rules are as they were, the menus now built lazily). The world's glue between the pure selection rule (src/interaction.js: stickiness,
// the re-check at the moment an action runs) and the menus (src/menus.js): the step finds what is near without building a menu, chooses
// one, and builds that one alone, for the page to show as `world.selected`. World.updateSelection and World.runAction stay as one-line
// methods of those names: the step, the page's keys and clicks, and the checks call them on the world.
import { pickCandidate, stillEligible } from './interaction.js';
import { candidatesNear } from './menus.js';

// Chooses what the ship is next to now: its id in `selectedId`, its menu built in `selected`; both null when there is none.
export function updateSelection(world) {
  const list = candidatesNear(world);
  // A berthed ship's menu is its station's whatever else comes nearer (a droid, a cache, a ship that passes): it is the
  // way out (SX, 2026-10-02: «Когда ты докнулся в станцию нет способа вылететь из нее»).
  const berth = world.docked ? list.find((c) => c.id === world.docked) : null;
  const chosen = berth ?? pickCandidate(world.selectedId, list, world.ship.x, world.ship.y, world.delta.bind(world));
  world.selectedId = chosen ? chosen.id : null;
  world.selected = chosen ? chosen.menu() : null;
}

// Presses row `index` of the selected menu, if the ship is still within reach of it: re-checked now, not when the menu opened.
// Returns whether a row ran.
export function runAction(world, index) {
  const list = candidatesNear(world);
  const target = list.find((c) => c.id === world.selectedId);
  if (!stillEligible(target, list, world.ship.x, world.ship.y, world.delta.bind(world))) {
    world.emit('actionRefused', { reason: 'MOVE CLOSER' });
    world.selectedId = null;
    return false;
  }
  const action = target.menu().actions[index];
  if (!action) return false;
  if (action.disabled) {
    world.emit('actionRefused', { reason: action.reason || action.note || 'UNAVAILABLE' });
    return false;
  }
  action.run();
  // The action may have removed what the menu stood beside (a cache opened,
  // a sign taken down). Choose again now: on pause there is no next step to
  // do it, and the old menu would stay on screen, offering a gone object.
  world.updateSelection();
  return true;
}
