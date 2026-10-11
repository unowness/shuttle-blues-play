import { CONFIG } from './config.js';

// A course, never an autopilot (SX's answer 3B on labs/graphics/sketches/economy-decisions.html, 2026-10-04: the cautious novice is
// helped «by skill, not money ... a course around rocks and pirates as a bearing»). Every bearing the game points along (the
// cargo's, a lost cargo's, a quest's, the way home: src/navigation.js) leads straight at its target. Where that straight line meets
// something in the next stretch of flight (a rock, a pirate, a planet's orbit, a black hole's disc, another station's body), the
// arrow leads past it instead: along the line that just grazes the thing's keep-off circle, on the side the turn from the true
// bearing is smaller. Once the thing is behind the ship, or off the line, the arrow points at the target again. Nothing here
// touches the ship: the pilot still flies every metre (the way in, src/approach.js, is the only thing that takes the ship over,
// and only to dock it).
//
// `COURSE.look` is how far ahead the line is read, u (about three seconds at a cruise); `COURSE.clear` the air kept round a thing,
// u, on top of its own size and the hull's; a pirate keeps `COURSE.pirate` u (a squad turns toward a ship that flies through it), and
// one within `COURSE.gathered` u of the target is the target's own (a raid's squad round its station, a ruin's guards): a bearing to
// them is a bearing to the fight.
export const COURSE = Object.freeze({ look: 3000, clear: 140, pirate: 650, gathered: 1600, hole: 300 });

// What the line from the ship is read against, each { x, y, r, key, near }: (x, y) from the ship (World.delta), `r` the circle to
// keep out of with the hull's radius in it, `near` how close to the target it is the target's own (else `r`), `key` the thing itself (a side once chosen for it is kept while it is in the way). Only what is in
// the ship's own sector: across a seam the line is read again when the ship is there.
// The array and its entries are the same ones every call, grown as the field grows: every route of the frame asks (the task banner, the
// locator, the map), and each call made an object and a pair of numbers for every rock, pirate and body of the sector (~35 KB of garbage
// a frame in J-05, 2026-10-09). Read them before asking again; a caller that keeps one copies it.
const obstacles = [];
let obstacleCount = 0;
function put(x, y, r, key, near) {
  const i = obstacleCount++;
  const o = obstacles[i] ?? (obstacles[i] = { x: 0, y: 0, r: 0, key: null, near: 0 });
  o.x = x; o.y = y; o.r = r; o.key = key; o.near = near;
}
export function courseObstacles(world) {
  const ship = world.ship, R = (ship?.radius ?? 0) + COURSE.clear;
  obstacleCount = 0;
  if (!ship) { obstacles.length = 0; return obstacles; }
  // The way from the ship to a thing, an axis at a time (Topology.dx): nothing is made for each.
  const topo = world.topology, sx = ship.x, sy = ship.y;
  const at = (thing, r, near = r) => put(topo.dx(thing.x, sx), topo.dy(thing.y, sy), r, thing, near);
  for (const a of world.asteroids ?? []) at(a, a.radius + R);
  for (const p of world.pirates ?? []) if (p.mode !== 'leave') at(p, COURSE.pirate + R, COURSE.gathered);
  for (const p of world.planets ?? []) at(p, p.radius + CONFIG.planet.orbit.height + R);
  for (const h of world.holes ?? []) at(h, (h.disc ?? h.horizon + COURSE.hole) + R);
  for (const s of world.stations ?? []) if (s.body) at(s, Math.max(s.body.hx, s.body.hy) + R);
  obstacles.length = obstacleCount;
  return obstacles;
}

// The sides chosen, by the thing: a course that has started round a rock on one side keeps that side while the rock is in the way,
// so the arrow does not flip when the line passes near the rock's middle. Presentation's memory, never saved; a thing gone is let go.
const sides = new WeakMap();

// The way to steer along `leg` ({ dx, dy, distance }: the bearing from the ship to its target) past `obstacles` (courseObstacles):
// { dx, dy, around } where the bearing should lead now (a direction, `distance` long), and the thing it leads round, or null when the
// straight line is clear (then `dx`, `dy` are the leg's own). A thing at the target itself (the station a cargo goes to, the guards
// of a ruin it leads to) is not in the way: it is where the line ends.
export function courseAround(leg, obstacles, { look = COURSE.look } = {}) {
  const straight = { dx: leg.dx, dy: leg.dy, around: null };
  const dist = leg.distance ?? Math.hypot(leg.dx, leg.dy);
  if (!(dist > 1)) return straight;
  const ux = leg.dx / dist, uy = leg.dy / dist, reach = Math.min(dist, look);
  let hit = null;
  for (const o of obstacles) {
    const t = o.x * ux + o.y * uy;                       // how far along the line the thing's middle lies
    const c = ux * o.y - uy * o.x;                       // and how far off it, signed (positive: clockwise of it, right on screen)
    if (t <= 0 || t > reach || Math.abs(c) >= o.r) continue;
    if (Math.hypot(leg.dx - o.x, leg.dy - o.y) < (o.near ?? o.r)) continue;   // at the target: it is the target's own
    if (!hit || t < hit.t) hit = { o, t, c };
  }
  if (!hit) return straight;
  const { o, c } = hit, d = Math.hypot(o.x, o.y);
  // The side: away from where the thing lies off the line (the smaller turn), or the one chosen before while the line runs near its
  // middle. -1 turns the arrow counter-clockwise of the thing's bearing, 1 clockwise.
  const kept = o.key ? sides.get(o.key) : undefined;
  const side = Math.abs(c) < o.r * 0.25 && kept ? kept : c >= 0 ? -1 : 1;
  if (o.key) sides.set(o.key, side);
  // The line from the ship that grazes the circle on that side (inside the circle already: straight across it, out of it).
  const toward = Math.atan2(o.y, o.x), off = d > o.r ? Math.asin(o.r / d) : Math.PI / 2;
  const a = toward + side * off;
  return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, around: o.key ?? o };
}

// A route (src/navigation.js) with the course it should be flown on: `course` ({ dx, dy }) when it leads round something, else the
// route as it was. The world's own obstacles; nothing is added for a route that leads out of O-08 (its hole is the target).
export function withCourse(world, route) {
  if (!route || route.kind === 'exit') return route;
  const c = courseAround(route, courseObstacles(world));
  return c.around ? { ...route, course: { dx: c.dx, dy: c.dy } } : route;
}

// The direction a route's arrow points: its course when it has one, else straight at its target.
export const courseOf = (route) => route?.course ?? route;
