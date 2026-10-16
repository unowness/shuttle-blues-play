// The ship at a station (cut out of src/world.js, PLAN D3, 2026-10-09): DOCK, the berth held, UNDOCK. World keeps a one-line method of
// each name the menus, the garage, the tools and the checks call.
//
// Since 2026-10-15 (SX: «когда докаешься, то наш корабль уходит вниз в глубину, а потом всплывает в доке встроенном в дизайн станции,
// когда корабль в доке, станция должна находится в центре экрана ... камера должна плавно и естественно приводить нас к центру экрана»;
// «Ныряет обратно» to leave; then «Нужна анимация, короче, как на респауне. Ныряет внутрь, выплывает снизу»): a ship docking dives where
// it is, is under the station a moment while its dock gets ready, and rises in the dock; leaving, it dives out of the dock and rises
// outside on the side it came from, nose out. A station's docks are its look's (CONFIG.station.docks): the pad, where the pilot's own
// ships stand, and the external dock, where a reference ship always hangs and every ship at a station without a pad. While the ship is
// docked the camera holds the station in the screen's middle (`dockView`, read by src/worldDraw.js). The garage HOME keeps its own docking
// (src/home.js). Nothing here is drawn: `stationDockState` and `dockLook` tell the page what to draw.
import { CONFIG } from './config.js';
import { isHome, startHomeDocking, berthPoint, dockRefusal, cellSize as homeCell, BOARD, BOARD_INK } from './home.js';
import { turnPoint, spinVelocity } from './float.js';
import { towSize, towBody, restLength } from './tow.js';

const D = () => CONFIG.station.docking;
const ARRIVE = () => D().arrive, LEAVE = () => D().leave;
const total = (p) => p.dive + p.under + p.rise;
const ease = (u) => { const c = Math.max(0, Math.min(1, u)); return c * c * (3 - 2 * c); };
const NOSE = { up: -Math.PI / 2, left: Math.PI, right: 0, down: Math.PI / 2 };
// A station's body is nine tenths of the station as drawn (CONFIG.station.bodies; checks/station-docks.mjs holds it): its drawn edge is
// its body's over this.
const BODY_SHARE = 0.9;

// Whether the pilot flies one of the six reference ships (src/specialShips.js, chassis `special-<id>` in its quest, `crew-<id>` from the
// hangar: src/chassis.js `reference`): it always docks outside.
const flyingReference = (world) => !!world.ship?.chassis?.reference;

// The ship's drawing's half width and half height in u, nose up: what a hanging ship needs beside the external dock. Measured off its
// model's cells at the game's cell, as the world measures a station's pieces (labs/graphics/world-art.js stationPieces); the hull's
// body is the chassis's, never this.
function shipHalf(ship) {
  const m = ship.model, cells = (m.frames && m.frames[m.idleFrame]) || m.cells || [];
  if (!cells.length) return { w: ship.radius, h: ship.radius };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of cells) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); }
  const R = CONFIG.render, s = m.scale ?? 1;
  return { w: (x1 - x0 + 1) * R.fontSize * 0.62 * s / 2, h: (y1 - y0 + 1) * R.fontSize * R.lineRatio * s / 2 };
}

// The docks of `station` (CONFIG.station.docks by its look), or a plain external dock off its body's right side for a station without.
function docksOf(station) {
  const d = station.look && CONFIG.station.docks[station.look];
  return d ?? { pad: null, ext: [station.body?.hx ?? station.hullRadius ?? 200, 0, 1, 136] };
}
// Which dock a ship takes at `station`: the external one for a reference ship and at a station with no pad, the pad otherwise.
export function dockKind(world, station) {
  return !docksOf(station).pad || flyingReference(world) ? 'ext' : 'pad';
}
// Where the ship is held at `station`'s dock `kind`, in the station's own frame (u from its place, unturned) and its heading there.
function dockLocal(world, station, kind) {
  const d = docksOf(station);
  if (kind === 'pad') { const [x, y, nose] = d.pad; return { x, y, angle: NOSE[nose] ?? NOSE.up }; }
  const [x, y, dir, face] = d.ext, half = shipHalf(world.ship);
  return { x: x + dir * (face + D().gap + half.w), y, angle: NOSE.up };
}
// The same in the world: turned and moved with the station as it floats (src/float.js).
export function dockPose(world, station, kind) {
  const l = dockLocal(world, station, kind), a = station.angle || 0, p = turnPoint(l.x, l.y, a);
  return { x: station.x + p.x, y: station.y + p.y, angle: l.angle + a };
}

// How far from a station's middle the station as drawn reaches along (ux, uy), in the world's frame: its body's box over BODY_SHARE,
// and on its external dock's side out to the dock's face (CONFIG.station.docks), so nothing is let go on the dock's module.
function drawnEdge(station, ux, uy) {
  const { hx, hy } = station.body, [x, , dir, face] = docksOf(station).ext;
  if (station.angle) { const c = Math.cos(station.angle), s = Math.sin(station.angle); [ux, uy] = [ux * c + uy * s, -ux * s + uy * c]; }
  const w = hx / BODY_SHARE, h = hy / BODY_SHARE, right = dir > 0 ? Math.max(w, x + face) : w, left = dir < 0 ? Math.max(w, face - x) : w;
  return Math.min(ux > 1e-6 ? right / ux : ux < -1e-6 ? left / -ux : Infinity, Math.abs(uy) > 1e-6 ? h / Math.abs(uy) : Infinity);
}
// Where a ship leaving `station` rises: outside the station as drawn on the side it came from (`from`, the station's frame at the
// docking), the ship's body and `exitAir` clear of it, nose out; towing a cargo, far enough out that the container hanging behind it is
// as clear.
function exitPose(world, station, from) {
  const a = station.angle || 0, l = Math.hypot(from.x, from.y) || 1, d = turnPoint(from.x / l, from.y / l, a);
  const T = CONFIG.cargo.tow, size = world.cargo ? towSize(world) : null;
  const behind = size ? T.anchor + restLength(size) + towBody(world).half : 0;
  const out = drawnEdge(station, d.x, d.y) + Math.max(world.ship.radius, behind) + D().exitAir;
  return { x: station.x + d.x * out, y: station.y + d.y * out, angle: Math.atan2(d.y, d.x) };
}

// ---- docking ---------------------------------------------------------------------------------------------------------------

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
  const ship = world.ship, d = world.delta(ship.x, ship.y, station.x, station.y), a = station.angle || 0;
  world.docked = station.id;
  // `from`: where the ship was, in the station's frame, for the way out; `at`: where it dives, held there as the station floats;
  // `v`: how it moved across the station then, which it coasts out of as it dives (no stop dead).
  world.berth = { stationId: station.id, kind: dockKind(world, station), leaving: false, t: 0,
    from: turnPoint(d.x, d.y, -a), at: { ...turnPoint(d.x, d.y, -a), angle: ship.angle - a },
    v: turnPoint(ship.vx - (station.vx ?? 0), ship.vy - (station.vy ?? 0), -a) };
  world.dockHeld = null;
  world.emit('docked', { stationId: station.id, label: station.label });
  // A docked ship is safe: pirates break off and fly away.
  world.endEncounter('docked', { leave: true });
}

// UNDOCK: the way out begins; the station lets the ship go once it has risen outside.
export function undock(world, station) {
  if (!world.docked || world.berth?.leaving) return;
  const kind = world.berth?.kind ?? world.dockHeld?.kind ?? dockKind(world, station);
  const from = world.berth?.from ?? world.dockHeld?.from ?? { x: 1, y: 0 };
  world.berth = { stationId: station.id, kind, leaving: true, t: 0, from };
  world.dockHeld = null;
  world.updateSelection();
}

// The way out of a berth that needs no menu (the page's forward thrust, pressed fresh): the docked station's UNDOCK, from
// whatever the menu holds. The home garage keeps its ship to the timeline's end and lets it go through the room (LEAVE).
export function leaveStation(world) {
  const station = world.docked && !world.home ? world.stations.find((s) => s.id === world.docked) : null;
  if (!station || isHome(station) || !world.ship.alive || world.berth) return false;
  undock(world, station);
  return true;
}

// The ship let go outside: the world's own flight again, a gentle push out, a moment untouchable while it clears the station.
function letGo(world, station, pose) {
  const ship = world.ship;
  world.docked = null;
  world.berth = null;
  world.dockHeld = null;
  ship.x = pose.x; ship.y = pose.y; ship.angle = pose.angle;
  ship.vx = Math.cos(pose.angle) * CONFIG.station.undockPush;
  ship.vy = Math.sin(pose.angle) * CONFIG.station.undockPush;
  // The container leaves the berth with the hull, not yanked out of it by the tether.
  if (world.cargo) { world.cargo.vx = ship.vx; world.cargo.vy = ship.vy; }
  world.leavingStation = station.id;
  ship.invuln = Math.max(ship.invuln, 1.2);
  world.emit('undocked', { stationId: station.id });
  world.updateSelection();
}

// Holds the ship at `pose`, carried with the station: no gravity, no drift, no weapon, its engines' presentation at rest. Its velocity
// is what it has across the station (`v`, none when held still), as it always was: the station's own slow float is not the ship's.
function hold(world, pose, dt = 0, v = null) {
  const ship = world.ship, k = dt > 0 ? Math.min(1, dt * 6) : 1;
  ship.x += (pose.x - ship.x) * k; ship.y += (pose.y - ship.y) * k;
  ship.angle = pose.angle;
  ship.vx = v?.x ?? 0; ship.vy = v?.y ?? 0;
  ship.angVel = 0;
  ship.thrusting = false; ship.retroing = false;
  ship.spool = 0; ship.retroSpool = 0;
  ship.animating = false; ship.wasAnimating = false;
  ship.animCursor = 0; ship.frameTimer = 0;
}

export function stepDocked(world, dt) {
  const ship = world.ship;
  const station = world.stations.find((s) => s.id === world.docked);
  if (!station) { world.docked = null; world.berth = null; world.dockHeld = null; return; }
  const B = world.berth;
  if (B) {
    B.t += dt;
    const P = B.leaving ? LEAVE() : ARRIVE();
    const under = B.t >= P.dive;
    if (!B.leaving) {
      // Diving where it was, coasting to rest across the station as it goes down (its speed falls evenly to none by the dive's end;
      // turned with the station as it floats), then in the dock from the moment it is under.
      if (!under) {
        const a = station.angle || 0, k = B.t / P.dive, s = B.t * (1 - k / 2), v = B.v ?? { x: 0, y: 0 };
        const p = turnPoint(B.at.x + v.x * s, B.at.y + v.y * s, a);
        hold(world, { x: station.x + p.x, y: station.y + p.y, angle: B.at.angle + a }, 0, turnPoint(v.x * (1 - k), v.y * (1 - k), a));
      } else hold(world, dockPose(world, station, B.kind));
      if (B.t >= total(P)) { world.berth = null; world.dockHeld = { stationId: station.id, kind: B.kind, from: B.from, at: world.time }; }
    } else {
      // Diving out of the dock, then outside on the side it came from, rising there; let go once risen.
      if (!under) hold(world, dockPose(world, station, B.kind));
      else hold(world, exitPose(world, station, B.from));
      if (B.t >= total(P)) letGo(world, station, exitPose(world, station, B.from));
    }
    return;
  }
  // Held in its dock, turning with a station that floats. Nothing hurts a docked ship (damageShip, the rocks, the planets and the
  // pirates all stand down while `docked`), so it is not held invulnerable: a timer held at 0.2 sat in the blink's dim phase and drew
  // the berthed ship at 32 % for as long as it stayed (QA, 2026-09-30). A ship held by a caller that is not its docking (a check, a
  // tool) is held in the station's dock all the same; the garage's is its berth.
  if (isHome(station)) { const at = berthPoint(station); hold(world, { x: at.x, y: at.y, angle: ship.angle + (station.spin || 0) * dt }, dt); return; }
  const kind = dockKind(world, station), held = world.dockHeld;
  if (!held) world.dockHeld = { stationId: station.id, kind, from: { x: 1, y: 0 }, at: world.time };
  else if (held.kind !== kind) {
    // Another ship taken out of the hangar while docked (src/world.js flyShip) that takes the other dock: it rises there, from under the
    // station, as a docking ship does; a reference ship so never stands on a pad. (One that takes the same dock is simply there.)
    const P = ARRIVE();
    world.berth = { stationId: station.id, kind, leaving: false, t: P.dive + P.under, from: held.from, at: null, v: null };
    world.dockHeld = null;
    hold(world, dockPose(world, station, kind));
    return;
  }
  hold(world, dockPose(world, station, kind), dt);
}

// A pose in the world of a pose planned in `station`'s frame when it was turned `plan.turn` (src/approach.js; the garage's way in):
// turned by how far the station has turned since, moved with it, its velocity the station's own and what the turn adds there.
export function onStation(station, p, plan) {
  const by = station.angle - (plan.turn ?? 0);
  if (!by && !station.spin) return { ...p, x: station.x + p.x, y: station.y + p.y, vx: p.vx + station.vx, vy: p.vy + station.vy };
  const q = turnPoint(p.x, p.y, by), v = turnPoint(p.vx, p.vy, by), w = spinVelocity(q.x, q.y, station.spin);
  return { ...p, x: station.x + q.x, y: station.y + q.y, vx: v.x + station.vx + w.x, vy: v.y + station.vy + w.y,
    angle: p.angle + by, ...(p.angVel !== undefined ? { angVel: p.angVel + station.spin } : {}) };
}

// ---- what the page draws ---------------------------------------------------------------------------------------------------

// A dock's step for the look's drawing (labs/graphics/station-art.js dockFrame, padFrame): its name, how far through it, how open
// the dock is, how closed its claws, whether a ship is in it. Idle docks: null.
function step(name, u, e, open, grip, present) { return { name, u, e, open, grip, present }; }
// The docks of `station` as the world has them now: { pad, ext } each a step or null. Only the station the ship is at works one.
export function stationDockState(world, station) {
  if (world.docked !== station.id || isHome(station)) return null;
  const B = world.berth, held = world.dockHeld;
  let kind, ph;
  if (B) {
    kind = B.kind;
    const P = B.leaving ? LEAVE() : ARRIVE(), t = B.t, inAt = P.dive + P.under;
    if (!B.leaving) ph = t < inAt ? step('ready', t / inAt, t, ease(t / inAt), 0, false) : step('rise', (t - inAt) / P.rise, t - inAt, 1, 0, true);
    else ph = t < P.dive ? step('dive', t / P.dive, t, 1, 0, true) : step('close', (t - P.dive) / (P.under + P.rise), t - P.dive, 1 - ease((t - P.dive) / P.under), 0, false);
  } else {
    kind = held?.kind ?? dockKind(world, station);
    const e = held ? world.time - held.at : 99;
    ph = step('held', 1, e, 1, ease(e / D().grip), true);
  }
  return { pad: kind === 'pad' ? ph : null, ext: kind === 'ext' ? ph : null, ship: null };
}

// Whether the towed cargo is stowed in the station, not drawn: while the ship stands on a pad (from the moment it is under the station
// arriving, to the moment it is under it leaving). At the external dock the container hangs below the ship.
export function cargoStowed(world) {
  if (!world.docked || world.home) return false;
  const B = world.berth;
  if (!B) return world.dockHeld?.kind === 'pad';
  if (B.kind !== 'pad') return false;
  const P = B.leaving ? LEAVE() : ARRIVE();
  return B.leaving ? B.t < P.dive + P.under : B.t >= P.dive;
}

// How the pilot's ship is drawn in a docking: null when it is drawn as itself, else `{ phase, u, e }` for the page's dive and rise
// (labs/graphics/dock-fx.js): `dive` where it is (u 0..1), `under` (not drawn), `rise` in the dock or outside (e: s since it began).
export function dockLook(world) {
  const B = world.berth;
  if (!B || world.home) return null;
  const P = B.leaving ? LEAVE() : ARRIVE(), t = B.t;
  if (t < P.dive) return { phase: 'dive', u: t / P.dive, e: t };
  if (t < P.dive + P.under) return { phase: 'under', u: (t - P.dive) / P.under, e: t - P.dive };
  return { phase: 'rise', u: (t - P.dive - P.under) / P.rise, e: t - P.dive - P.under };
}

// The point the camera holds in the screen's middle while the ship is docked (src/worldDraw.js updateCamera), or null to follow the ship:
// the station's own middle with a pad, the middle of the station and its hanging ship at the external dock; the garage HOME's drawn
// rock's middle (src/home.js BOARD_INK). Leaving, the camera goes back to the ship as it rises outside.
export function dockView(world) {
  if (!world.docked) return null;
  const station = world.stations.find((s) => s.id === world.docked);
  if (!station) return null;
  const B = world.berth;
  if (B?.leaving && B.t >= LEAVE().dive + LEAVE().under * 0.5) return null;
  const a = station.angle || 0;
  if (isHome(station)) {
    const c = homeCell(), I = BOARD_INK, mx = (I.x0 + I.x1) / 2 - (BOARD.W - 1) / 2, my = (I.y0 + I.y1) / 2 - (BOARD.H - 1) / 2;
    const p = turnPoint(mx * c.w, my * c.h, a);
    return { x: station.x + p.x, y: station.y + p.y };
  }
  const kind = B?.kind ?? world.dockHeld?.kind ?? dockKind(world, station);
  if (kind === 'pad') return { x: station.x, y: station.y };
  const l = dockLocal(world, station, 'ext'), dir = Math.sign(docksOf(station).ext[2]) || 1, half = shipHalf(world.ship);
  const far = l.x + dir * half.w, near = -dir * (station.body?.hx ?? 0) / BODY_SHARE;
  const p = turnPoint((far + near) / 2, 0, a);
  return { x: station.x + p.x, y: station.y + p.y };
}
