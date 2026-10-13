import { CONFIG } from './config.js';
import { clamp, easeOut } from './util.js';

// Choosing what the player is standing next to.
//
// This is a selection rule, not an entity framework. A candidate is any object
// that can describe itself with an id, a title, a world anchor, an eligibility
// radius and a short list of actions.
//
// The rule that matters is stickiness: once a target is chosen, it is kept
// until the ship is clearly away from it. Without that the menu flickers at the
// radius boundary and the numbers renumber under the player's fingers.

export function pickCandidate(previousId, candidates, shipX, shipY, delta) {
  const keep = CONFIG.interaction.exitTolerance;
  let held = null;
  let nearest = null;
  let nearestDist = Infinity;

  for (const c of candidates) {
    const d = delta(c.x, c.y, shipX, shipY);
    const dist = Math.hypot(d.x, d.y);

    // The current target keeps its claim over a slightly larger radius.
    if (c.id === previousId && dist <= c.interactRadius * keep) held = c;

    // Passing traffic's greeting must not capture a repair, delivery or quest
    // window the pilot has actually reached. Keep stickiness within each group.
    if (dist <= c.interactRadius && (!nearest || (nearest.ambient && !c.ambient) || (!!nearest.ambient === !!c.ambient && dist < nearestDist))) {
      nearest = c;
      nearestDist = dist;
    }
  }

  if (held && (!held.ambient || !nearest || nearest.ambient)) return held;
  return nearest || null;
}

// Whether the selected target's menu stands open. Esc and 0 dismiss it for a target the ship flies past (the page keeps
// that, `menu.closed`, until the selection changes); a docked ship is held where it is and its menu is its way out
// (UNDOCK), and the selection cannot change while it is held, so nothing dismisses a docked menu (SX, 2026-10-02:
// «Когда ты докнулся в станцию нет способа вылететь из нее»).
export function menuOpen(target, dismissed, docked) {
  return Boolean(target) && (!dismissed || Boolean(docked));
}

// Re-checked at the moment an action runs, never only when the menu opened.
// Between those two moments the ship may have drifted, or the object may be
// gone entirely.
export function stillEligible(candidate, candidates, shipX, shipY, delta) {
  if (!candidate) return false;
  const live = candidates.find((c) => c.id === candidate.id);
  if (!live) return false;
  const d = delta(live.x, live.y, shipX, shipY);
  return Math.hypot(d.x, d.y) <= live.interactRadius * CONFIG.interaction.exitTolerance;
}

// ------------------------------------------------------------------------------------------------ whether the ship stands
//
// One rule for everything that answers the ship slowing by a thing (SX, 2026-10-07: «только если ты 0,5 секунды в непосредственной
// близости к предмету контакта стоишь», for the context windows; then «MARKS: A1, B1, C0» on labs/graphics/sketches/marks-strategy.html,
// «один голос»): the ship stands once it has been at or under `speed` (CONFIG.interaction.standSpeed, 350; the dock's 200 until 2026-10-08) `dwell` s on
// end, and flies again as soon as it is past that speed by the selection's band (`band`: 236 u/s). An object's window comes only while
// it stands (labs/graphics/context.js); the corners on the thing in reach show only then (labs/graphics/main.js drawInteraction, B1).
// Both read this, so they answer at the same moment. Until SX flew it the same day the quest list folded to the quest followed while the
// ship did not stand (A1) and the gray marks on the rim went with the corners: «еще вот это скрывание квестов ... нужно убрать это не
// помогает», «метки плохо, они моргают, давай не скрывать их».
export const STAND = Object.freeze({ speed: CONFIG.interaction.standSpeed, band: CONFIG.interaction.exitTolerance, dwell: CONFIG.interaction.standDwell });

// Each world's state, one object a world made at its first read: `on` whether the ship stands, `at` the world's time it last changed
// (-Infinity: as found), `slowSince` since when it has been at or under the speed (null: it is not), `time` the world's time of the last
// read. On the world's clock (World.time), so it holds while the world is paused, and every reader of a frame gets the same answer.
const standing = new WeakMap();
const speedOf = (ship) => (ship ? Math.hypot(ship.vx ?? 0, ship.vy ?? 0) : 0);

// The ship's standing now: { on, at }. A ship found at or under the speed (the first read; the world's time gone back, a new pilot)
// stands at once.
export function shipStands(world) {
  const t = world.time ?? 0, v = speedOf(world.ship);
  let s = standing.get(world);
  if (!s || t < s.time) {
    if (!s) standing.set(world, (s = { on: false, at: -Infinity, slowSince: null, time: t }));
    s.on = v <= STAND.speed; s.at = -Infinity; s.slowSince = s.on ? t : null; s.time = t;
    return s;
  }
  if (t === s.time) return s;
  s.time = t;
  if (s.on) {
    if (v > STAND.speed * STAND.band) { s.on = false; s.at = t; s.slowSince = null; }
  } else if (v <= STAND.speed) {
    if (s.slowSince === null) s.slowSince = t;
    if (t - s.slowSince >= STAND.dwell - 1e-9) { s.on = true; s.at = t; }
  } else s.slowSince = null;
  return s;
}

// How far what shows only while the ship stands has come in (1) or gone (0): eased over `fade` s of the world's time from the moment
// the standing changed; under reduced motion at once.
export function standShare(world, fade, reducedMotion = false) {
  const s = shipStands(world);
  if (reducedMotion) return s.on ? 1 : 0;
  const u = easeOut(clamp(((world.time ?? 0) - s.at) / fade, 0, 1));
  return s.on ? u : 1 - u;
}
