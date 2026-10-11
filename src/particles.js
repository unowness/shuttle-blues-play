import { CONFIG } from './config.js';
import { TAU, between, clamp } from './util.js';

// A turning piece drawn at the nearest of TURN_STEPS angles a turn (5.6 degrees apart), so
// each angle it is drawn at is one the browser has rasterised before (Chrome makes a glyph's mask per angle, Firefox keys its glyph
// cache by it): a blow's 40-odd sparks and chips, each turned anew every frame, cost Chrome's GPU 1.5-3.5 ms a frame while they flew
// (2026-10-06, measured behind the CRT's copy of the frame). A piece at rest keeps its own angle: it is drawn at one already. A lab
// switch until SX compared it by eye and took it into the game (2026-10-07).
export const TURN_STEPS = 64;
const TURN = TAU / TURN_STEPS;

// Debris is made of the glyphs the thing was drawn with, so a wreck is
// literally the ship's own characters coming apart.
//
// Two kinds share the list: sparks and short bits (gone in a second or two, at most `limit` at once), and pieces that hang (`hang`:
// a broken body's, about 40 s, src/debris.js), at most CONFIG.debris.max at once with the oldest going first when more come, so
// hanging pieces never crowd out a spark and sparks never cut a wreck short.
export class Particles {
  // `rng`: the stream the scatter is drawn from. A World gives it its 'fx' stream (src/world.js): sparks and debris are
  // presentation, nothing reads where a piece flew, so they have a stream of their own and never shift a draw the simulation makes.
  constructor(rng, limit = 900) {
    this.items = [];
    this.limit = limit;
    this.rng = rng;
    this.hanging = 0;
  }

  // `opts.hang`: the pieces hang (they count against CONFIG.debris.max, not `limit`), and stop turning (update). A glyph's
  // own `raw` keeps its ink as it is when drawn (a broken NPC's or station's own inks: Particles.draw).
  burst(x, y, glyphs, opts = {}) {
    const cfg = CONFIG.particles;
    const speed = opts.speed || cfg.speed;
    const life = opts.life || cfg.life;
    const rng = this.rng, hang = !!opts.hang;
    this.sync();
    if (hang) this.makeRoom(glyphs.length);
    for (const g of glyphs) {
      if (!hang && this.items.length - this.hanging >= this.limit) break;
      const dir = opts.aim !== undefined ? opts.aim + between(rng, -0.9, 0.9) : between(rng, 0, TAU);
      const v = between(rng, speed[0], speed[1]);
      this.items.push({
        x: x + (g.dx || 0), y: y + (g.dy || 0),
        vx: Math.cos(dir) * v + (opts.vx || 0),
        vy: Math.sin(dir) * v + (opts.vy || 0),
        ch: g.ch, color: g.color || '#c9cfd6', size: g.size || 1,
        angle: opts.angle || 0,
        angVel: opts.still ? 0 : between(rng, -cfg.spin, cfg.spin),
        life: between(rng, life[0], life[1]),
        maxLife: 1,
        // A piece may slow by its own `drag` and stay whole until its last `fade` s (a wreck's: CONFIG.debris).
        drag: opts.drag ?? null, fade: opts.fade ?? 0,
      });
      const p = this.items[this.items.length - 1];
      p.maxLife = p.life;
      if (g.raw) p.raw = true;
      if (hang) { p.hang = true; this.hanging++; }
    }
  }

  // The count of hanging pieces, made true again after the list was emptied or replaced from outside (a hole's passage into another
  // sector empties it, src/world.js transitHole; the lab's scenes replace it).
  sync() {
    if (this.hanging > this.items.length) this.hanging = this.items.reduce((n, p) => n + (p.hang ? 1 : 0), 0);
  }

  // Room for `n` more hanging pieces: the oldest hanging ones go (they were pushed first).
  makeRoom(n) {
    let over = this.hanging + n - CONFIG.debris.max;
    if (over <= 0) return;
    const kept = [];
    for (const p of this.items) {
      if (over > 0 && p.hang) { over--; this.hanging--; continue; }
      kept.push(p);
    }
    this.items = kept;
  }

  update(dt) {
    const drag = CONFIG.particles.drag, settle = CONFIG.debris.settle;
    this.sync();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) { if (p.hang) this.hanging--; this.items.splice(i, 1); continue; }
      const d = Math.max(0, 1 - (p.drag ?? drag) * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      // A hanging piece's turn dies away by `settle` a second and stops, the piece resting at its own tilt: a glyph turned anew each
      // frame is drawn afresh, a still one comes from the browser's cache (CONFIG.debris; tools/debris-cost.mjs), and these stay about
      // 40 s.
      if (p.hang && p.angVel !== 0) {
        p.angVel *= Math.max(0, 1 - settle * dt);
        if (Math.abs(p.angVel) < 0.06) p.angVel = 0;
      }
      p.angle += p.angVel * dt;
    }
  }

  // `raw`: the renderer for a piece whose ink is kept as it is (the page's draws every other ink through its roles,
  // labs/graphics/world-art.js); the same one when not given.
  draw(r, project, raw = r) {
    for (const p of this.items) {
      const s = project(p.x, p.y);
      if (!s) continue;
      const angle = p.angVel !== 0 ? Math.round(p.angle / TURN) * TURN : p.angle;
      (p.raw ? raw : r).glyphRot(p.ch, s.x, s.y, angle, p.color, clamp(p.life / (p.fade || p.maxLife), 0, 1) * 0.95, p.size);
    }
  }
}
