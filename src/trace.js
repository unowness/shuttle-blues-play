import { CONFIG } from './config.js';
import { TAU } from './util.js';
import { SECTOR_SIZE } from './sectors.js';

// The last few seconds of a flight, kept so that a wreck can leave a ghost of
// how it happened beside the cargo it lost (doc 03: "near lost cargo, a player
// should be able to see how the former carrier crashed").
//
// A trace is presentation. It never collides, collects, repels or pulls. It is
// a replay of recorded poses, not old inputs re-run in a world that has since
// changed, so it cannot come out differently the second time.
//
// Samples are short arrays, [t, x, y, angle, flags], because a trace is written
// into the save next to its cargo. `t` counts back from the end of the trace in
// seconds, so the last sample is always 0.

export const THRUST = 1;
const RETRO = 2;
export const ANIMATING = 4;

// What ended the flight. `reset` is the pilot's own R key: the cargo was left,
// nothing hit it. `pirate` (2026-09-29): destroyed by pirates, who took the
// cargo to their den. A build from before it reads a saved `pirate` as an
// unknown cause (contracts.js readStranded), so the save version did not move.
// 'cargo', 'droid' and 'station' since 2026-10-01: a hull at its last point can be ended by its own load
// running up on it (src/tow.js), by flying into a service droid (src/droids.js) or into a station's body. 'npc' (2026-10-02):
// into a friendly NPC ship (src/npcFleet.js), which can break too.
export const WRECK_CAUSES = ['asteroid', 'planet', 'hole', 'reset', 'pirate', 'cargo', 'droid', 'station', 'npc'];
const CAUSE_LABELS = {
  asteroid: 'ASTEROID', planet: 'PLANET', hole: 'BLACK HOLE', reset: 'ABANDONED', pirate: 'PIRATES',
  cargo: 'OWN CARGO', droid: 'DROID', station: 'STATION', npc: 'ANOTHER SHIP',
};
export const causeLabel = (cause) => CAUSE_LABELS[cause] || 'UNKNOWN';

// Room for a full trace plus the pose at the moment of the wreck.
export const MAX_SAMPLES = Math.ceil(CONFIG.trace.rate * CONFIG.trace.seconds) + 2;

const round = (v, per) => Math.round(v * per) / per;

function poseOf(time, sector, ship) {
  return {
    t: time, col: sector.col, row: sector.row,
    x: ship.x, y: ship.y, a: ship.angle,
    f: (ship.thrusting ? THRUST : 0) | (ship.retroing ? RETRO : 0) | (ship.animating ? ANIMATING : 0),
  };
}

export class TraceRecorder {
  constructor({ rate = CONFIG.trace.rate, seconds = CONFIG.trace.seconds } = {}) {
    this.rate = rate;
    this.seconds = seconds;
    this.samples = [];
    this.nextAt = -Infinity;
  }

  // A new life, a reload or a teleport starts a new trace: a ghost must never
  // slide across the map between two unrelated positions.
  reset() {
    this.samples.length = 0;
    this.nextAt = -Infinity;
  }

  // Called every simulation step. Keeps one sample per 1/rate seconds, and
  // only as many seconds as a ghost will show.
  sample(time, sector, ship) {
    if (time < this.nextAt) return;
    // The epsilon absorbs floating-point drift in the summed step time, which
    // would otherwise stretch every interval by one physics step.
    this.nextAt = time + 1 / this.rate - 1e-6;
    this.samples.push(poseOf(time, sector, ship));
    while (this.samples.length && this.samples[0].t < time - this.seconds) this.samples.shift();
  }

  // The finished record: it ends at the ship's pose right now, the moment of
  // the wreck, in the coordinates of the sector it ended in. A sample taken in
  // a neighbouring sector is moved by the grid offset, and each step is then
  // measured with the world's own delta, which unwraps a torus and changes
  // nothing on a plane. Null when there is too little to replay.
  freeze(time, sector, ship, { width, height, delta }) {
    const all = [...this.samples, poseOf(time, sector, ship)]
      .filter((s) => s.t >= time - this.seconds);
    if (all.length < 2) return null;
    const end = all[all.length - 1];
    const out = [];
    let later = null;
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      let x = s.x + (s.col - end.col) * width;
      let y = s.y + (s.row - end.row) * height;
      if (later) {
        const d = delta(x, y, later.x, later.y);
        x = later.x + d.x;
        y = later.y + d.y;
      }
      later = { x, y };
      out.push([round(s.t - time, 100), round(x, 10), round(y, 10), round(s.a, 1000), s.f]);
    }
    return out.reverse();
  }
}

// A trace from a save is untrusted. Bounded length, finite numbers, times that
// rise to zero within the recorded window, positions near the sector. Anything
// malformed drops the whole trace; a cargo without a ghost is still a cargo.
export function sanitizeTrace(raw, limit = 3 * Math.max(SECTOR_SIZE.width, SECTOR_SIZE.height)) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_SAMPLES) return null;
  const out = [];
  let prev = -Infinity;
  for (const s of raw) {
    if (!Array.isArray(s) || s.length !== 5) return null;
    const [t, x, y, a, f] = s;
    if (![t, x, y, a].every(Number.isFinite) || !Number.isInteger(f)) return null;
    if (t < prev || t > 0 || t < -(CONFIG.trace.seconds + 1)) return null;
    if (Math.abs(x) > limit || Math.abs(y) > limit) return null;
    prev = t;
    out.push([t, x, y, a, f & (THRUST | RETRO | ANIMATING)]);
  }
  return out[out.length - 1][0] === 0 ? out : null;
}

// What an asteroid wreck hit. Free rocks are respawned on every visit, so the
// ghost carries a sketch of its own obstacle; otherwise it would crash into
// empty space (doc 03).
export function sanitizeObstacle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { x, y, r } = raw;
  if (![x, y, r].every(Number.isFinite) || r <= 0 || r > 1000) return null;
  return { x: round(x, 10), y: round(y, 10), r: round(r, 10) };
}

export const traceDuration = (trace) => trace[trace.length - 1][0] - trace[0][0];

// The pose `t` seconds after the trace starts. Linear between samples; the
// heading turns the short way round.
export function poseAt(trace, t) {
  const at = trace[0][0] + t;
  const pose = (s) => ({ x: s[1], y: s[2], angle: s[3], flags: s[4] });
  if (at <= trace[0][0]) return pose(trace[0]);
  for (let i = 1; i < trace.length; i++) {
    const b = trace[i];
    if (b[0] < at) continue;
    const a = trace[i - 1];
    const k = b[0] > a[0] ? (at - a[0]) / (b[0] - a[0]) : 1;
    const turn = ((b[3] - a[3] + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return {
      x: a[1] + (b[1] - a[1]) * k,
      y: a[2] + (b[2] - a[2]) * k,
      angle: a[3] + turn * k,
      flags: k < 0.5 ? a[4] : b[4],
    };
  }
  return pose(trace[trace.length - 1]);
}
