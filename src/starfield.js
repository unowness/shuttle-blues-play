import { CONFIG } from './config.js';
import { mulberry32, wrapCentered } from './util.js';
import { Renderer } from './renderer.js';

// Parallax star layers.
//
// Each layer lives in a square tile larger than the viewport. The camera
// offset, scaled by the layer's parallax, shifts every star inside that tile,
// and a star that leaves one side re-enters on the other while off screen.
// A far layer moves little, a near one a lot: that difference is the only cue
// to speed and direction in empty space, so it has to be exactly right.
//
// There is deliberately no rotation. The layers used to turn slowly about the
// screen centre, and because the turn was applied AFTER the parallax shift, it
// turned the direction of motion as well. Measured 2026-09-23: flying right,
// the far layer drifted up-right, the middle one straight up, the near one
// down-left, 129, 93 and 41 degrees off. Flight read as being carried about.
// The camera never rotates, so neither does the sky.
// The player's LAYERS (labs/graphics/depth.js; `layers` 1 as CONFIG has it): how far apart the depths stand. A layer behind
// the flight's plane (look 0..1) leans look ** layers, so the far stars keep the whole reach and the nearer ones part from
// them as it grows; one before it (look below 0) leans `layers` times as far; a star's own depth spreads `layers` times.
export const leanLook = (look, layers = 1) => (look < 0 ? look * layers : (look ?? 0) ** layers);
export const leanDepth = (depth = 1, layers = 1) => 1 + (depth - 1) * layers;

export class Starfield {
  constructor(seed = 20260923) {
    const rng = mulberry32(seed);
    // Each star's own depth in its layer, from a stream of its own, so the stars stand where they always stood.
    const deep = mulberry32(seed ^ 0x5bd1e995);
    const spread = CONFIG.starfield.lookSpread ?? 0;
    this.layers = CONFIG.starfield.layers.map((cfg) => {
      const stars = new Array(cfg.count);
      for (let i = 0; i < cfg.count; i++) {
        stars[i] = {
          nx: rng() - 0.5,
          ny: rng() - 0.5,
          ch: cfg.glyphs[(rng() * cfg.glyphs.length) | 0],
          color: cfg.colors[(rng() * cfg.colors.length) | 0],
          phase: rng() * Math.PI * 2,
          rate: 0.6 + rng() * 2.2,
          depth: 1 + (deep() - 0.5) * spread,
        };
      }
      return { cfg, stars };
    });
  }

  // `occluders` are screen discs, {x, y, r}: solid bodies in front of the sky.
  // A star behind one is not drawn, so a planet's night side reads as a body
  // rather than as a window onto the stars behind it. A rectangle, {x, y, w,
  // h}, is a sign's plate: a star inside it would sit among the letters.
  // `lean` ({x, y} px, CONFIG.depth) is the mouse's: each layer slides by its `look` share of it, each star by its own depth.
  draw(r, camX, camY, t, occluders = [], lean = null) {
    const tile = r.diagonal * CONFIG.starfield.tileScale;
    const count = occluders.length;
    // The tile is wider than the screen, so most stars are off it: each one is placed, asked whether it is on the
    // screen (the test glyph() would make), and only then against the bodies in front of the sky. The renderer's box is read
    // once here (its `worldView` and `margin`, as Renderer.onScreen reads them) and every star is held to it in this loop:
    // asked of `onScreen` a star at a time, the star's two numbers crossed a call V8 did not always inline and were boxed
    // (32.7 -> 22 KB of garbage a frame in flight at 900 u/s with the sky's adapter kept, 2026-10-09). A renderer whose `onScreen` is not the class's
    // (a check's stand-in, an adapter that draws everything) is asked as before.
    const view = r.onScreen === Renderer.prototype.onScreen ? r.worldView : undefined, onScreen = view ? null : r.onScreen, m = r.margin;
    const x0 = view ? view.x - m : 0, x1 = view ? view.x + view.w + m : 0, y0 = view ? view.y - m : 0, y1 = view ? view.y + view.h + m : 0;
    for (const { cfg, stars } of this.layers) {
      const parallax = cfg.parallax, twinkle = cfg.twinkle, base = cfg.alpha;
      const look = leanLook(cfg.look ?? 0, lean?.layers), spread = lean?.layers ?? 1;
      const lx = lean ? lean.x * look : 0, ly = lean ? lean.y * look : 0;
      for (let k = 0; k < stars.length; k++) {
        const s = stars[k];
        const depth = leanDepth(s.depth ?? 1, spread);
        const x = r.cx + wrapCentered(s.nx * tile - camX * parallax, tile) + lx * depth;
        const y = r.cy + wrapCentered(s.ny * tile - camY * parallax, tile) + ly * depth;
        if (view ? !(x > x0 && x < x1 && y > y0 && y < y1) : onScreen && !onScreen.call(r, x, y)) continue;
        let hidden = false;
        for (let q = 0; q < count; q++) {
          const o = occluders[q];
          if (o.w !== undefined ? (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h)
            : ((x - o.x) ** 2 + (y - o.y) ** 2 < o.r * o.r)) { hidden = true; break; }
        }
        if (hidden) continue;
        let alpha = base;
        if (twinkle > 0) alpha *= 1 - twinkle * (0.5 + 0.5 * Math.sin(t * s.rate + s.phase));
        r.glyph(s.ch, x, y, s.color, alpha);
      }
    }
  }
}
