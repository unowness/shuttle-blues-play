// Geometry for the one plane (src/groundPlane.js): no random draws, rendering, saves or changes to the world. Nothing is made per call:
// asked for every loose thing near the ship every step (until 2026-10-13 each test made an {x, y} and a bound function).
import { GROUND } from './groundConfig.js';

// The distance from a point (dx, dy) to the segment from the origin to (vx, vy).
export function segmentDistance(dx, dy, vx, vy) {
  const length2 = vx * vx + vy * vy;
  const t = length2 > 1e-9 ? Math.max(0, Math.min(1, (dx * vx + dy * vy) / length2)) : 0;
  return Math.hypot(dx - vx * t, dy - vy * t);
}

// Each World's own delta, bound once, for a station's contact (src/stations.js contact takes the topology's delta).
const deltas = new WeakMap();
export function boundDelta(world) {
  let d = deltas.get(world);
  if (!d) deltas.set(world, d = world.delta.bind(world));
  return d;
}

// Whether a short link between two things (a pickup's reach, the magnet's pull, two drops of oil running together) is clear of
// opaque hulls: no rock, planet or station body across it. A pull does not act through a hull, though both ends are in range.
export function clearGroundPath(world, a, b, pad = 0) {
  const T = world.topology, lx = T.dx(b.x, a.x), ly = T.dy(b.y, a.y);
  const rocks = world.asteroids ?? [];
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    if (segmentDistance(T.dx(r.x, a.x), T.dy(r.y, a.y), lx, ly) < r.radius * GROUND.rockEnvelope + pad) return false;
  }
  const planets = world.planets ?? [];
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (segmentDistance(T.dx(p.x, a.x), T.dy(p.y, a.y), lx, ly) < p.radius + pad) return false;
  }
  const stations = world.stations ?? [];
  if (!stations.length) return true;
  const length = Math.hypot(lx, ly), steps = Math.max(1, Math.ceil(length / 12)), delta = boundDelta(world);
  for (let k = 0; k < stations.length; k++) {
    const st = stations[k];
    if (segmentDistance(T.dx(st.x, a.x), T.dy(st.y, a.y), lx, ly) > (st.hullRadius ?? Math.hypot(st.body.hx, st.body.hy)) + pad) continue;
    for (let i = 0; i <= steps; i++) {
      const hit = st.contact(a.x + lx * i / steps, a.y + ly * i / steps, pad, delta);
      if (hit && !hit.inside) return false;
    }
  }
  return true;
}
