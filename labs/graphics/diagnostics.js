// The lab's H panel, cut from labs/graphics/main.js (PLAN D4, toward createGame): the last ten seconds of frames, the profiler's table and the
// panel that shows them. The page hands `game` (the page's parts, read when a function runs): `showDiag` (H, the lab only), `world`,
// `renderer`, `canvas`, `crt` and `framePace`. The frame calls `follow()` first (the profiler goes on and off with the panel), `tick(rawDt)`
// (the drawn rate, smoothed), `log(...)` at its end and `draw(...)` where the panel stands over the interface; the drawn rate (`fps`) and
// whether the profiler was left on (`profiling`) are kept here because nothing else of the page reads them.
//
// The last ten seconds of frames, for the H panel (lab only; 2026-10-01). SX plays in Firefox, where a
// fair bench put the world's drawing at 1-6 ms a frame, so a stutter has to be found in the running game:
// the interval between frames, and this code's own work in it, split into the simulation, the world, the
// cockpit and the CRT pass. A frame slower than SLOW_FRAME ms is one the eye can catch at 60 Hz.
// A hitch is what the eye catches, not the mean (chat R, 2026-10-04, SX: «тормоза как будто либо шейдеры либо тени»): the panel
// says how many frames came late (over 20 ms, over 33 ms: one and two frames missed at 60 Hz), and splits the worst gap of the ten
// seconds into this code's work in it (the frame before it, by part) and the rest, the browser's own (its collector, its compositing,
// the GPU). A worst gap that is mostly OUTSIDE is not
// the game's drawing.
// Under the even 60 (src/framePace.js; SX, 2026-10-07: «ровные 60») a gap is the time between two DRAWN frames, so FRAME reads 16.7
// on a 120 Hz display; the refresh skipped on purpose in it (`held`: from the first refresh after the last drawn frame to this one)
// is neither ours nor the browser's, and OUTSIDE leaves it out: the gap less our work and the held refresh, the wait the browser kept
// as it was without the pace. PACE says the display's measured rate and the rate drawn (the FPS, as before, is the drawn one).
import { CONFIG } from '../../src/config.js';
import { PROFILE, setProfiling } from '../../src/frameProfile.js';
import { UI } from '../../src/uiGrid.js';
import { asciiPanel, fitText } from '../../src/interface.js';

const FRAME_LOG = 600, SLOW_FRAME = 20, LOST_FRAME = 33;

// The costliest sections of the frame by H's profiler (src/frameProfile.js), averaged over its window: ms a frame, then the calls a
// frame: G glyphs queued for the world's flush, R of them turned, W rows laid, T text, F fills, S strokes, D images, on any canvas.
const PROFILE_ROWS = 8;
function profileRows() {
  if (!PROFILE.table.length) return [['EFFECTS', 'MEASURING']];
  const n = (v, w) => String(Math.round(v)).padStart(w);
  return [
    [`EFFECTS ${Math.round(PROFILE.windowMs / 1000)}S`, '   MS    G    R   W   T   F   S  D'],
    ...PROFILE.table.slice(0, PROFILE_ROWS).map((e) => [e.name.toUpperCase(),
      `${e.ms.toFixed(2).padStart(5)}${n(e.g, 5)}${n(e.r, 5)}${n(e.w, 4)}${n(e.t, 4)}${n(e.f, 4)}${n(e.s, 4)}${n(e.d, 3)}`]),
  ];
}

export function createDiagnostics(game) {
  const frameLog = { i: 0, count: 0, gap: new Float32Array(FRAME_LOG), sim: new Float32Array(FRAME_LOG),
    world: new Float32Array(FRAME_LOG), cockpit: new Float32Array(FRAME_LOG), crt: new Float32Array(FRAME_LOG),
    work: new Float32Array(FRAME_LOG), held: new Float32Array(FRAME_LOG) };
  let fps = 60, profiling = false;

  // H's per-effect profiler goes on and off with the diagnostics (the lab only; tools/flight-probe.mjs `--fx` turns it on by itself),
  // and costs one flag's test a section while it is off.
  function follow() {
    if (game.showDiag !== profiling) { profiling = game.showDiag; setProfiling(profiling, game.renderer); }
  }

  // The drawn rate, smoothed over the frames' raw time.
  function tick(rawDt) {
    fps += ((rawDt > 0 ? 1 / rawDt : 60) - fps) * 0.08;
  }

  function log(gap, sim, worldMs, cockpit, crtMs, work, held = 0) {
    const k = frameLog.i;
    frameLog.gap[k] = gap; frameLog.sim[k] = sim; frameLog.world[k] = worldMs; frameLog.cockpit[k] = cockpit; frameLog.crt[k] = crtMs;
    frameLog.work[k] = work; frameLog.held[k] = held;
    frameLog.i = (k + 1) % FRAME_LOG;
    frameLog.count = Math.min(FRAME_LOG, frameLog.count + 1);
  }
  function frameStats(values) {
    const v = Array.from(values.subarray(0, frameLog.count)).sort((a, b) => a - b);
    const at = (q) => v[Math.min(v.length - 1, Math.floor(q * v.length))] || 0;
    return { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: v[v.length - 1] || 0,
      slow: v.filter((x) => x > SLOW_FRAME).length, lost: v.filter((x) => x > LOST_FRAME).length };
  }
  // The worst gap of the log, and the frame whose work ran in it (the one before it in the log).
  function worstFrame() {
    if (frameLog.count < 2) return null;
    let worst = -1, at = 0;
    for (let n = 1; n < frameLog.count; n++) {
      const k = (frameLog.i - n + FRAME_LOG) % FRAME_LOG;
      if (frameLog.gap[k] > worst) { worst = frameLog.gap[k]; at = k; }
    }
    const before = (at - 1 + FRAME_LOG) % FRAME_LOG;
    return { gap: worst, held: frameLog.held[at], work: frameLog.work[before], sim: frameLog.sim[before], world: frameLog.world[before],
      cockpit: frameLog.cockpit[before], crt: frameLog.crt[before] };
  }

  // The share of the frame's gap that is not this code's work (the log's means): the browser's own, where Firefox replays the canvas;
  // the refresh the pace skipped on purpose left out (`held`).
  function outsideShare() {
    const n = frameLog.count;
    if (n < 2) return null;
    let gap = 0, work = 0, held = 0;
    for (let k = 0; k < n; k++) { gap += frameLog.gap[k]; work += frameLog.work[k]; held += frameLog.held[k]; }
    gap /= n; work /= n; held /= n;
    return { gap, held, outside: Math.max(0, gap - work - held) };
  }

  // Development readouts, behind H. These describe the build, not the flight,
  // and they are the numbers that were crowding the panel.
  function draw(r, locatorArea = null, hudLayout = null) {
    if (!game.showDiag) return;
    const { world, renderer, canvas, crt, framePace } = game;
    const m = CONFIG.hud.margin;
    const lh = r.cellH * CONFIG.hud.lineRatio;
    const ship = world.ship;
    const rows = [
      ['MODEL', ship.model.name],
      ['CHASSIS', ship.chassis.label],
      ['SIZE', ship.model.scale.toFixed(2)],
      ['GLYPHS', String(r.drawn)],
      ['FPS', String(Math.round(fps))],
      ['PACE', `${framePace.displayHz ? Math.round(framePace.displayHz) : '--'} HZ DISPLAY, ${Math.round(fps)} DRAWN, 1 IN ${framePace.every}`],
      ...(() => {
        const ms = (v) => v.toFixed(1);
        const gap = frameStats(frameLog.gap), p95 = (a) => ms(frameStats(a).p95), w = worstFrame();
        return [
          ['FRAME', `${ms(gap.p50)} / ${ms(gap.p95)} / ${ms(gap.p99)} / ${ms(gap.max)} MS`],
          ['SLOW', `${gap.slow} OVER ${SLOW_FRAME}, ${gap.lost} OVER ${LOST_FRAME} OF ${frameLog.count}`],
          ['WORK 95%', `SIM ${p95(frameLog.sim)} WORLD ${p95(frameLog.world)}`],
          ['', `COCKPIT ${p95(frameLog.cockpit)} CRT ${crt.enabled ? p95(frameLog.crt) : 'OFF'}`],
          ...((o) => (o ? [['OUTSIDE', `${ms(o.outside)} OF ${ms(o.gap)} MS, ${Math.round((100 * o.outside) / (o.gap || 1))}%${o.held >= 0.05 ? `, HELD ${ms(o.held)}` : ''}`]] : []))(outsideShare()),
          ...(w ? [
            ['WORST', `${ms(w.gap)} MS: OURS ${ms(w.work)}, OUTSIDE ${ms(Math.max(0, w.gap - w.work - w.held))}${w.held >= 0.05 ? `, HELD ${ms(w.held)}` : ''}`],
            ['', `SIM ${ms(w.sim)} WORLD ${ms(w.world)}`],
            ['', `COCKPIT ${ms(w.cockpit)} CRT ${ms(w.crt)}`],
          ] : []),
          ['CANVAS', `${canvas.width}x${canvas.height} AT ${renderer.dpr.toFixed(2)}`],
        ];
      })(),
      ...profileRows(),
      ['SCORE', String(world.score)],
      ['ROCK CR', String(world.rockCredits)],
      ['ROCK FUEL', String(Math.round(world.rockFuel))],
    ];
    const cols = Math.min(50, Math.floor((r.view.w - 2 * m) / r.cellW));
    const panelRows = Math.ceil(rows.length * CONFIG.hud.lineRatio) + 3;
    // Under the locator and its legend, not behind them (SX, 2026-10-01: «локатор закрывает таблицу»), and
    // never down into the cockpit. It is drawn after everything else, so whatever it still meets, it covers.
    const x = locatorArea ? locatorArea.x : r.view.x + m;
    let top = locatorArea ? locatorArea.y + locatorArea.h + UI.vector.group : r.view.y + m;
    if (hudLayout?.railY) top = Math.max(r.view.y + m, Math.min(top, hudLayout.railY - UI.vector.group - panelRows * r.cellH));
    asciiPanel(r, x, top, cols, panelRows, 'DIAGNOSTICS');
    // The values stand one column past the longest key (ROCK FUEL and WORK 95% ran into theirs).
    const valueCol = 2 + Math.max(...rows.map(([k]) => k.length)) + 1;
    rows.forEach(([k, v], i) => {
      const y = top + r.cellH * 1.7 + i * lh;
      r.text(k, x + r.cellW * 2, y, CONFIG.hud.color, 1);
      r.text(fitText(v, cols - valueCol - 2), x + r.cellW * valueCol, y, CONFIG.hud.hot, 1);
    });
  }

  return { follow, tick, log, draw };
}
