import { CONFIG } from './config.js';
import { poseAt, traceDuration, causeLabel, THRUST, ANIMATING } from './trace.js';
import { drawLocalLabel } from './interface.js';

// Replays the trace left beside a stranded cargo: the pilot's own hull glyphs
// in one quiet colour, following the recorded poses to the wreck, then coming
// apart where it happened.
//
// Presentation only, like Feedback. It reads a record the world handed over;
// it never collides, collects, pulls or grants anything, and it cannot change
// the outcome it shows. Doc 06: a ghost is drawn distinctly and labelled, so it
// is never mistaken for a live pilot.
export class GhostReplay {
  constructor() {
    this.active = null;
    this.reducedMotion = false;
  }

  // `event.shift`, when there is one, moves the whole replay (src/lostCargo.js viewTrace:
  // a cargo the pirates carried off is watched from their den).
  start(event) {
    if (!event?.trace || event.trace.length < 2) return;
    const C = CONFIG.ghost;
    const dx = event.shift?.x || 0, dy = event.shift?.y || 0;
    const moved = dx !== 0 || dy !== 0;
    const trace = moved ? event.trace.map(([t, x, y, a, f]) => [t, x + dx, y + dy, a, f]) : event.trace;
    const obstacle = moved && event.obstacle ? { ...event.obstacle, x: event.obstacle.x + dx, y: event.obstacle.y + dy } : event.obstacle;
    const end = trace[trace.length - 1];
    let first = trace.length - 2;
    while (first > 0 && Math.hypot(trace[first - 1][1] - end[1], trace[first - 1][2] - end[2]) <= C.reach) first--;
    const shown = trace.slice(first);
    const span = traceDuration(shown);
    this.active = {
      ...event, obstacle, shown, span, age: 0,
      duration: Math.max(span, C.minReplay),        // wall-clock seconds
      rate: span > 0 ? Math.min(1, span / C.minReplay) : 1,
    };
  }

  stop() { this.active = null; }

  get playing() { return !!this.active; }

  step(dt) {
    const g = this.active;
    if (!g) return;
    g.age += Math.max(0, dt);
    if (g.age > g.duration + CONFIG.ghost.hold) this.active = null;
  }

  // Seconds into the shown part of the trace. Slower than the clock only for a
  // crash too fast to read (see CONFIG.ghost.minReplay).
  traceTime() {
    const g = this.active;
    return Math.min(g.age, g.duration) * g.rate;
  }

  // Where the ghost is now, in world units. Null when nothing is playing here.
  pose(world) {
    const g = this.active;
    if (!g || g.sectorId !== world.sector.id) return null;
    return poseAt(g.shown, this.traceTime());
  }

  // World layer: queued glyphs, so the instruments still cover it.
  draw(r, world) {
    const g = this.active;
    const p = this.pose(world);
    if (!p) return;
    const C = CONFIG.ghost;
    const t = this.traceTime();
    const after = Math.max(0, g.age - g.duration);   // seconds since the wreck

    // The path flown so far, as sparse dots.
    const upTo = g.shown[0][0] + t;
    for (let i = 0; i < g.shown.length; i += C.pathEvery) {
      const s = g.shown[i];
      if (s[0] > upTo) break;
      const at = world.project(r, s[1], s[2]);
      r.glyph('·', at.x, at.y, C.color, C.alpha * 0.55);
    }

    // What an asteroid wreck hit: free rocks are gone by now, so the replay
    // brings a sketch of its own, fading in over the last second.
    if (g.obstacle) {
      const fade = Math.min(1, Math.max(0, t - (g.span - 1))) * (1 - after / C.hold);
      if (fade > 0.05) {
        const o = world.project(r, g.obstacle.x, g.obstacle.y);
        const steps = Math.max(8, Math.round((Math.PI * 2 * g.obstacle.r) / (r.cellW * 1.6)));
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          r.glyph(':', o.x + Math.cos(a) * g.obstacle.r, o.y + Math.sin(a) * g.obstacle.r * 0.94,
            C.color, C.alpha * 0.8 * fade);
        }
      }
    }

    const ship = world.ship;
    const model = ship.model;
    const m = ship.metrics || ship.measureDrawing(r.cellW, r.cellH);
    const at = world.project(r, p.x, p.y);
    const a = p.angle + Math.PI / 2 + model.baseRotation;
    const ca = Math.cos(a), sa = Math.sin(a);

    if (after > 0) {
      // The wreck: the hull glyphs drift apart from where it happened. Under
      // reduced motion the hull simply fades where it stopped.
      const spread = this.reducedMotion ? 1 : 1 + after * 2.2;
      const alpha = C.alpha * (1 - after / C.hold);
      for (const c of idleCells(model)) {
        const lx = c.x * m.w * spread, ly = c.y * m.h * spread;
        r.glyphRot(c.ch, at.x + lx * ca - ly * sa, at.y + lx * sa + ly * ca,
          a + (this.reducedMotion ? 0 : after * (c.x - c.y) * 0.6), C.color, alpha, model.scale);
      }
      return;
    }

    if (p.flags & THRUST && model.flame) {
      for (const c of model.flame) {
        const lx = c.x * m.w, ly = c.y * m.h;
        r.glyphRot(c.ch, at.x + lx * ca - ly * sa, at.y + lx * sa + ly * ca, a, C.color, C.alpha * 0.6, model.scale);
      }
    }
    for (const c of cellsFor(model, p.flags, t)) {
      const lx = c.x * m.w, ly = c.y * m.h;
      r.glyphRot(c.ch, at.x + lx * ca - ly * sa, at.y + lx * sa + ly * ca, a, C.color, C.alpha, model.scale);
    }
  }

  // UI layer: what the ghost is, in readable text beside it. Returns the box.
  drawLabel(r, world, avoid = []) {
    const g = this.active;
    const p = this.pose(world);
    if (!p) return null;
    const at = world.project(r, p.x, p.y);
    // A label pinned to the screen edge for a ghost that is not on screen
    // would point at nothing.
    const v = r.view;
    if (at.x < v.x || at.x > v.x + v.w || at.y < v.y || at.y > v.y + v.h) return null;
    // Another pilot's ghost says whose it is (src/lostCargo.js viewStrangerTrace).
    const text = g.age > g.duration ? `WRECK / ${causeLabel(g.cause)}` : g.author ? `TRACE / ${g.author}` : 'TRACE';
    return drawLocalLabel(r, text, at, avoid, CONFIG.hud.color, r.cellH * 2.2);
  }
}

function idleCells(model) {
  return model.frames && model.frames.length > 1 ? model.frames[model.idleFrame] : model.cells;
}

// The exhaust loop while a key was held, the idle pose otherwise: the same rule
// a live hull follows, driven by replay time instead of a frame timer.
function cellsFor(model, flags, t) {
  if (!(flags & ANIMATING) || !model.frames || model.frames.length < 2) return idleCells(model);
  return model.frames[model.loop[Math.floor(t * model.fps) % model.loop.length]];
}
