// The page's pace on a display faster than 60 Hz (SX, 2026-10-07, asked whether to hold 120 by giving detail away or to draw an
// even 60: «ровные 60»). His MacBook's ProMotion runs Firefox's frames at 120 Hz; a frame that misses its 8.3 ms then comes at 16.7,
// so the frames wandered between the two. Here the page draws (and steps) only on every `every`-th refresh, `every` the whole number
// of the display's periods that makes 60 Hz or the nearest rate above it (120 Hz: every 2nd; 240 Hz: every 4th; 144 Hz: every 2nd, an
// even 72; 60 Hz and anything up to about 114 Hz: every one, nothing changes). The frames between are callbacks that draw nothing, so the
// browser presents nothing new for them and the drawn frames come an even number of refreshes apart.
//
// Why here and not in src/frameClock.js: the frame clock turns the time between drawn frames into whole simulation steps (1/120 s);
// it cannot keep the browser from drawing a frame. The pace decides, before anything is drawn, whether this refresh is drawn at all;
// the frame clock then sees even 16.7 ms frames and counts each as exactly two steps, as it always did on a 60 Hz display. The steps
// themselves, and so the world, are untouched.
//
// The display's period is measured from every callback, drawn or not: a callback that draws nothing costs nothing, so they come one
// refresh apart even while drawn frames are heavy. The estimate is the mean of the recent intervals near their low quantile (`low`):
// a run of late frames (16.7 ms on a 120 Hz display) does not move it while a tenth of the intervals still shows the display's own;
// a display that really is 60 Hz (the window moved to another screen) is learned once the window has turned over.
//
// What the H panel reads (labs/graphics/main.js): `displayHz`, the rate drawn at, and `held` for each drawn frame, the time it was held
// back on purpose (from the first refresh after the last drawn frame to this one): the frame's gap less its work and `held` is the time
// the browser kept (OUTSIDE), without the refresh skipped on purpose.
//
// Pure: no DOM, no clock of its own. The caller passes each callback's timestamp (ms).

export const PACE = Object.freeze({
  target: 1000 / 60,   // ms: the slowest pace drawn at (60 Hz), whatever the display
  slack: 0.1,          // a display this share faster than a whole multiple of 60 Hz still counts as it (119 Hz is 2 refreshes)
  window: 90,          // callbacks the display's period is measured over
  minSamples: 12,      // before this many, every callback is drawn
  low: 0.1,            // the quantile of the intervals taken as the display's own
  near: 0.35,          // an interval within this share of it is one of the display's
  every: 8,            // callbacks between two estimates
});

// How many of the display's refreshes a drawn frame takes: the whole number that brings the pace to 60 Hz or the nearest rate above.
export function paceEvery(periodMs, target = PACE.target) {
  if (!(periodMs > 0)) return 1;
  return Math.max(1, Math.floor(target / periodMs + PACE.slack));
}

export class FramePace {
  constructor() {
    this.samples = new Float64Array(PACE.window);
    this.count = 0;
    this.cursor = 0;
    this.sinceEstimate = 0;
    this.prev = null;         // the last callback's timestamp
    this.period = null;       // ms, the display's, or null until measured
    this.every = 1;           // refreshes a drawn frame takes
    this.lastDrawn = null;    // the last drawn frame's timestamp
    this.firstHeld = null;    // the first callback held back since it
    this.held = 0;            // ms the frame just drawn was held back on purpose
  }

  get displayHz() { return this.period ? 1000 / this.period : 0; }

  // A callback at `now` (ms) noted: its interval, and every PACE.every callbacks the display's period and `every` again.
  see(now) {
    if (this.prev != null && now > this.prev) {
      this.samples[this.cursor] = now - this.prev;
      this.cursor = (this.cursor + 1) % PACE.window;
      if (this.count < PACE.window) this.count++;
      if (this.count >= PACE.minSamples && ++this.sinceEstimate >= PACE.every) {
        this.sinceEstimate = 0;
        this.period = this.measure();
        this.every = paceEvery(this.period);
      }
    }
    this.prev = now;
  }

  // The display's period: the mean of the intervals within `near` of their `low` quantile.
  measure() {
    const a = Array.from(this.samples.subarray(0, this.count)).sort((x, y) => x - y);
    const base = a[Math.min(a.length - 1, Math.floor(PACE.low * a.length))];
    let sum = 0, n = 0;
    for (const v of a) if (Math.abs(v - base) <= base * PACE.near) { sum += v; n++; }
    return n ? sum / n : base;
  }

  // Whether the callback at `now` draws a frame (noted either way). A drawn frame comes `every` refreshes after the last one, or later
  // when the refreshes between were missed: from half a refresh short of it on, the callback draws.
  draws(now) {
    this.see(now);
    if (this.every > 1 && this.lastDrawn != null && now - this.lastDrawn < (this.every - 0.5) * this.period) {
      if (this.firstHeld == null) this.firstHeld = now;
      return false;
    }
    this.held = this.firstHeld == null ? 0 : now - this.firstHeld;
    this.firstHeld = null;
    this.lastDrawn = now;
    return true;
  }

  // The next callback draws (the flight begins, or comes back): the display's period is kept.
  reset() {
    this.lastDrawn = null;
    this.firstHeld = null;
    this.held = 0;
  }
}
