// The ship at a station (cut out of src/world.js, PLAN D3, 2026-10-09; the code is as it was, `this` now `world`): DOCK takes the ship in along
// the way planned to the station's gate (src/approach.js plays it; the garage's is its own, src/home.js), the berth holds it there, turning
// and moving with a station that floats (src/float.js), and UNDOCK lets it go. World keeps a one-line method of each name the menus, the
// garage, the tools and the checks call.
import { CONFIG } from './config.js';
import { isHome, startHomeDocking, berthPoint, dockRefusal, homeWayIn } from './home.js';
import { planWay, wayAt, WAY } from './approach.js';
import { turnPoint, spinVelocity } from './float.js';

export function dock(world, station) {
  if (world.docked) return;
  if (Math.hypot(world.ship.vx, world.ship.vy) > CONFIG.station.dockSpeed) {
    world.emit('actionRefused', { reason: 'BRAKE TO DOCK' });
    return;
  }
  // The home garage takes the ship in along its timeline, from wherever its menu stands, round the rock (src/home.js).
  if (isHome(station)) {
    const why = dockRefusal(world, station);
    if (why) world.emit('actionRefused', { reason: why });
    else startHomeDocking(world, station);
    return;
  }
  berthAt(world, station);
}

// Docked at a station, the ship glides the way in from where it is into the station's middle.
function berthAt(world, station) {
  world.docked = station.id;
  world.berth = { stationId: station.id, plan: wayIn(world, station), t: 0 };
  world.emit('docked', { stationId: station.id, label: station.label });
  // A docked ship is safe: pirates break off and fly away.
  world.endEncounter('docked', { leave: true });
}

// The way in (src/approach.js) to `station` from where the ship is and how it moves, in the station's frame. A station's:
// to its gate, on the line from its middle toward where the ship will be in a moment, outside its body by the hull and
// WAY.gateAir, then straight in. The garage's is its own (src/home.js homeWayIn).
function wayIn(world, station) {
  const ship = world.ship, d = world.delta(ship.x, ship.y, station.x, station.y);
  const v = { x: ship.vx - station.vx, y: ship.vy - station.vy };
  if (isHome(station)) return homeWayIn(world, station);
  const lead = { x: d.x + v.x * WAY.lead, y: d.y + v.y * WAY.lead }, l = Math.hypot(lead.x, lead.y) || 1;
  const ux = lead.x / l, uy = lead.y / l;
  const gate = bodyEdge(station, ux, uy) + ship.radius + WAY.gateAir;
  const far = Math.hypot(d.x, d.y) > gate + WAY.gateAir;
  const points = far ? [d, { x: ux * gate, y: uy * gate }, { x: 0, y: 0 }] : [d, { x: 0, y: 0 }];
  // `turn`: the station's turn the way was planned at (the float, src/float.js): it is flown turned by how far it has turned since.
  const plan = planWay({ points, gate: far ? 1 : -1, v, angle: ship.angle });
  plan.turn = station.angle;
  return plan;
}

// How far from a station's middle its body's box reaches along the direction (ux, uy), in the world's frame: the box turns with the
// station's float (src/float.js).
function bodyEdge(station, ux, uy) {
  const { hx, hy } = station.body;
  if (station.angle) { const c = Math.cos(station.angle), s = Math.sin(station.angle); [ux, uy] = [ux * c + uy * s, -ux * s + uy * c]; }
  return Math.min(Math.abs(ux) > 1e-6 ? hx / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? hy / Math.abs(uy) : Infinity);
}

// A pose of the way in (src/approach.js wayAt), planned in `station`'s frame when it was turned `plan.turn`, as a
// pose in the world now: turned by how far the station has turned since, moved with it, its velocity the station's own and what
// the turn adds there (src/float.js). A station that does not float is only moved, as it always was.
export function onStation(station, p, plan) {
  const by = station.angle - (plan.turn ?? 0);
  if (!by && !station.spin) return { ...p, x: station.x + p.x, y: station.y + p.y, vx: p.vx + station.vx, vy: p.vy + station.vy };
  const q = turnPoint(p.x, p.y, by), v = turnPoint(p.vx, p.vy, by), w = spinVelocity(q.x, q.y, station.spin);
  return { ...p, x: station.x + q.x, y: station.y + q.y, vx: v.x + station.vx + w.x, vy: v.y + station.vy + w.y,
    angle: p.angle + by, ...(p.angVel !== undefined ? { angVel: p.angVel + station.spin } : {}) };
}

export function undock(world, station) {
  world.docked = null;
  world.berth = null;
  const angle = world.ship.angle;
  world.ship.vx = Math.cos(angle) * CONFIG.station.undockPush;
  world.ship.vy = Math.sin(angle) * CONFIG.station.undockPush;
  // The container leaves the berth with the hull, not yanked out of it by the tether.
  if (world.cargo) { world.cargo.vx = world.ship.vx; world.cargo.vy = world.ship.vy; }
  // Out of the berth through the station's body, which holds it again once it is clear.
  world.leavingStation = station.id;
  world.ship.invuln = Math.max(world.ship.invuln, 1.2);
  world.emit('undocked', { stationId: station.id });
}

// The way out of a berth that needs no menu (the page's forward thrust, pressed fresh): the docked station's UNDOCK, from
// whatever the menu holds. The home garage keeps its ship to the timeline's end and lets it go through the room (LEAVE).
export function leaveStation(world) {
  const station = world.docked && !world.home ? world.stations.find((s) => s.id === world.docked) : null;
  if (!station || isHome(station) || !world.ship.alive) return false;
  undock(world, station);
  world.updateSelection();
  return true;
}

export function stepDocked(world, dt) {
  const ship = world.ship;
  const station = world.stations.find((s) => s.id === world.docked);
  if (!station) { world.docked = null; return; }
  // Gliding in to its middle (src/approach.js): where the way in says, its burns drawn, then held there.
  if (world.berth) {
    const B = world.berth;
    B.t += dt;
    const p = onStation(station, wayAt(B.plan, B.t), B.plan);
    ship.flyTo(dt, p);
    if (!p.done) return;
    world.berth = null;
  }
  // Held at the berth: no gravity, no drift, no weapon; turning with a station that floats (src/float.js).
  ship.vx = 0; ship.vy = 0;
  if (station.spin) ship.angle += station.spin * dt;
  // Ship.step is skipped while docked. Clear its presentation state too,
  // otherwise the arrival's exhaust pose and helm response freeze in place.
  ship.angVel = 0;
  ship.thrusting = false; ship.retroing = false;
  ship.spool = 0; ship.retroSpool = 0;
  ship.animating = false; ship.wasAnimating = false;
  ship.animCursor = 0; ship.frameTimer = 0;
  // To its station's middle; the home garage's is solid rock, so a ship held there by a caller that is not its
  // docking (a check, a tool) is held in its berth.
  const at = isHome(station) ? berthPoint(station) : station;
  ship.x += (at.x - ship.x) * Math.min(1, dt * 6);
  ship.y += (at.y - ship.y) * Math.min(1, dt * 6);
  // Nothing hurts a docked ship (damageShip, the rocks, the planets and the
  // pirates all stand down while `docked`), so it is not held invulnerable: a
  // timer held at 0.2 sat in the blink's dim phase and drew the berthed ship
  // at 32 % for as long as it stayed (QA, 2026-09-30).
}
