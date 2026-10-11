// Whole simulation steps from the browser's frame times.
//
// The world moves in equal slices (CONFIG.sim.step, 1/120 s). Feeding each frame's
// raw time into an accumulator makes the number of slices a frame runs depend on
// where the leftover happens to sit and on sub-millisecond jitter in the frame
// times: the leftover settles at a random point between 0 and one slice, and when
// it settles near an edge the jitter tips frames between n-1, n and n+1 slices.
// One slice at top speed is 12.5 px, so the ship's place on the screen jumps by
// that much from frame to frame while the sky, which follows the camera, stays
// smooth (measured 2026-09-30 on the M1 Pro at 60 Hz: identical runs gave exactly
// 2 slices on every frame, or 1, 2 and 3 on 17 %, 65 % and 17 % of them, with the
// ship 3.3 px rms and up to 10 px off its smoothed path). It comes and goes with
// the phase of the leftover, which is why it is "sometimes", and it grows with speed.
//
// A display's frame is a fixed period. The clock estimates it (the mean of recent
// frames that were on time) and, when it is a whole number of slices (30 Hz is 4, 60 Hz is 2, 120 Hz
// is 1) or a whole fraction of one (240 Hz), counts every frame that arrives on time
// as exactly that period, so every such frame runs the same number of slices. A frame
// that does not arrive on time is counted at its real length and the world catches up
// in real time. A display whose period is no such multiple (144 Hz) is left as it
// was: the accumulator on real frame times.
//
// Pure: no DOM, no clock of its own. The caller passes each frame's seconds.

const WINDOW = 24;            // frames the period is estimated from
const MIN_SAMPLES = 8;        // before this many, frames are counted as they came
const RELOCK_EVERY = 4;       // frames between two estimates
const LOCK_TOLERANCE = 0.015; // a display this close to a multiple of the step is taken to be one
const ON_TIME = 0.35;         // a frame within this share of the period from it is on time
const EPS = 1e-9;

// The exact period a measured one stands for, or null when it stands for none:
// n steps (n = 1..16) or step / n (n = 2..4), within LOCK_TOLERANCE of it.
export function lockedPeriod(period, step, tolerance = LOCK_TOLERANCE) {
  if (!(period > 0) || !(step > 0)) return null;
  const ratio = period / step;
  const whole = Math.round(ratio);
  if (whole >= 1 && whole <= 16 && Math.abs(ratio - whole) / whole <= tolerance) return whole * step;
  const parts = Math.round(1 / ratio);
  if (parts >= 2 && parts <= 4 && Math.abs(1 / ratio - parts) / parts <= tolerance) return step / parts;
  return null;
}

export class FrameClock {
  constructor(step, maxSteps = 8) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.acc = 0;                       // time not yet spent on a slice, always under one step
    this.simDt = 0;                     // seconds the last frame's slices covered
    this.locked = null;                 // the exact period frames on time are counted as, or null
    this.samples = new Float64Array(WINDOW);
    this.count = 0;
    this.cursor = 0;
    this.sinceEstimate = Infinity;      // frames since the period was last estimated
  }

  // Forget the leftover, not the period: after a menu, a pause or a resized window.
  reset() {
    this.acc = 0;
    this.simDt = 0;
  }

  // The frame took `rawDt` seconds. Returns how many slices to run.
  advance(rawDt) {
    if (!(rawDt > 0)) { this.simDt = 0; return 0; }
    this.samples[this.cursor] = rawDt;
    this.cursor = (this.cursor + 1) % WINDOW;
    if (this.count < WINDOW) this.count++;
    if (this.count >= MIN_SAMPLES && ++this.sinceEstimate >= RELOCK_EVERY) {
      this.locked = lockedPeriod(this.period(), this.step);
      this.sinceEstimate = 0;
    }

    const dt = this.locked && Math.abs(rawDt - this.locked) <= this.locked * ON_TIME ? this.locked : rawDt;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.step - EPS && steps < this.maxSteps) { this.acc -= this.step; steps++; }
    if (steps === this.maxSteps) this.acc = 0;
    else if (this.acc < 0) this.acc = 0;
    this.simDt = steps * this.step;
    return steps;
  }

  // The seconds the camera and anything else that follows the world should move
  // by this frame: the slices' own time when the frames are locked (so the ship and
  // the view advance together, exactly), the frame's real time otherwise.
  frameDt(rawDt) {
    return this.locked ? this.simDt : rawDt;
  }

  // The display's period as the browser has been delivering it: the mean of the
  // recent frames that were on time. A frame's timestamp is off by a bounded error
  // that does not build up, so over a run of frames the errors cancel and the mean
  // is far steadier than any one frame or the median; frames far from the median
  // (a hitch) are left out so one late frame cannot move it.
  period() {
    const a = this.samples.subarray(0, this.count);
    const sorted = Array.from(a).sort((x, y) => x - y);
    const mid = sorted[sorted.length >> 1];
    let sum = 0, n = 0;
    for (const v of a) if (Math.abs(v - mid) <= mid * ON_TIME) { sum += v; n++; }
    return sum / n;
  }
}
