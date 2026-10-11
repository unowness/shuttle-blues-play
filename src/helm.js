import { clamp } from './util.js';

// Presentation state only. Repainting the same world time never advances it.
const poses = new WeakMap();

export function helmPose(world, { reducedMotion = false } = {}) {
  const ship = world.ship;
  const live = ship.alive && !world.docked;
  const thrusting = live && ship.thrusting;
  const retroing = live && !thrusting && ship.retroing;
  const turnRate = ship.params().turnRate;
  const turn = live && turnRate > 0 ? clamp(ship.angVel / turnRate, -1, 1) : 0;
  const travel = thrusting ? -1 : retroing ? 1 : 0;
  let pose = poses.get(ship);
  if (!pose || !live || reducedMotion || world.time < pose.time) {
    pose = { time: world.time, turn, travel };
    poses.set(ship, pose);
  } else if (world.time > pose.time) {
    const blend = 1 - Math.exp(-14 * (world.time - pose.time));
    pose.turn += (turn - pose.turn) * blend;
    pose.travel += (travel - pose.travel) * blend;
    pose.time = world.time;
  }
  // The engine spools (src/ship.js, src/chassis.js), forward and retro, are
  // already smooth, physically-ramped values computed once per physics step,
  // so they are read straight from the ship rather than blended like
  // turn/travel above: there is no separate "ambient" version to smooth away,
  // and reduced motion (which exists to suppress that smoothing) has nothing
  // to do here either. Lab presentation (labs/graphics/instruments.js) reads
  // them; nothing writes them back.
  const spool = live ? ship.spool : 0;
  const retroSpool = live ? ship.retroSpool ?? 0 : 0;
  // How far each engaged side has climbed from its floor to full, 0..1. A
  // press snaps the spool to its floor, so this is how long the key has been
  // held on the engine's own clock (SX, 2026-09-29: the gauge should use its
  // whole scale for the climb, not jump to the floor and move only the top).
  const P = ship.params();
  const ramp = (value, floor) => floor < 1 ? clamp((value - floor) / (1 - floor), 0, 1) : 1;
  const thrustRamp = thrusting ? ramp(spool, P.spoolFloor) : 0;
  const retroRamp = retroing ? ramp(retroSpool, P.retroSpoolFloor) : 0;
  return { turn: pose.turn, travel: pose.travel, thrusting, retroing, live, spool, retroSpool, thrustRamp, retroRamp };
}
