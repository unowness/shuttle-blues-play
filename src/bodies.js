import { CONFIG } from './config.js';
import { TAU, clamp, between, lerp, mulberry32, fbmWrapped, rampGlyph, mixHex } from './util.js';

const LON_PERIOD = 12; // integer, so the longitude noise meets itself at the seam

// ---------------------------------------------------------------- planet ---

export class Planet {
  // `rng`: where the spin's starting phase is drawn (a World's 'sky' stream, src/world.js; a lone planet of a sketch, a tool or a
  // check gives it the generator it wants, Math.random included).
  constructor(opts, rng) {
    Object.assign(this, {
      x: 0, y: 0, radius: 240, spin: 0.055, seed: 1,
      tint: '#7f9bb5', dark: '#141b22', bands: 0,
      // `style` and `tint2`: a look beyond the classic ramp (CONFIG.planet.styles); null is how it always was.
      style: null, tint2: null,
      mass: 0, pull: 0, name: 'planet',
    }, opts);
    this.phase = between(rng, 0, TAU);
    // Mass is the surface-gravity law (26 u/s^2 at the surface) for the radius the
    // planet PULLS like, which is its own unless the catalogue says otherwise: a
    // planet can be drawn bigger than it pulls (SX, 2026-09-30: "планеты можно и
    // покрупнее"), so flying past a bigger planet feels as it did.
    this.mass = this.mass || (this.pull || this.radius) ** 2 * 26;
  }

  // The outermost radius a planet is drawn to (its thin atmosphere), which its name
  // stands clear of. A ringed planet's is its ring's (CONFIG.planet.styles.ringed.outer), so the name stands clear of that.
  get rim() {
    return this.style === 'ringed' ? Math.max(this.radius * 1.045, this.radius * CONFIG.planet.styles.ringed.outer * 1.03) : this.radius * 1.045;
  }

  update(dt) { this.phase += this.spin * dt; }

  // The cells a planet's disc and thin atmosphere cover, in the order they are drawn (row by row), with everything
  // about a cell that does not change from frame to frame: where it is from the centre, the light on it, its
  // latitude and its longitude at phase 0. Made once per cell size and kept; what is left for a frame is the noise,
  // which moves with the spin. The arithmetic is what the loop used to do for every cell every frame, so the
  // queued glyphs are the same ones, call for call.
  cellsFor(r) {
    const c = this.cellCache;
    if (c && c.cw === r.cellW && c.ch === r.cellH) return c;
    const R = this.radius, rimR = this.rim, L = CONFIG.planet.light;
    const nx = Math.ceil(rimR / r.cellW), ny = Math.ceil(rimR / r.cellH);
    const total = (2 * nx + 1) * (2 * ny + 1);
    const kind = new Uint8Array(total), rim = new Uint8Array(total);
    const ox = new Float64Array(total), oy = new Float64Array(total), a = new Float64Array(total);
    const ty = new Float64Array(total), lat = new Float64Array(total), diffuse = new Float64Array(total);
    let n = 0;
    for (let j = -ny; j <= ny; j++) {
      const v = (j * r.cellH) / R;
      for (let i = -nx; i <= nx; i++) {
        const u = (i * r.cellW) / R;
        const d2 = u * u + v * v;
        if (d2 > 1) {
          // Thin atmosphere ring just outside the limb: kind 1, `a` its alpha, `rim` which of the two glyphs.
          if (d2 < 1.09) {
            const fall = 1 - (Math.sqrt(d2) - 1) / 0.045;
            kind[n] = 1; ox[n] = i * r.cellW; oy[n] = j * r.cellH; rim[n] = (i + j) & 1; a[n] = 0.16 * clamp(fall, 0, 1);
            n++;
          }
          continue;
        }
        const z = Math.sqrt(1 - d2);
        const l = Math.asin(clamp(v, -1, 1));
        // The body: kind 2, `a` its longitude at phase 0.
        kind[n] = 2; ox[n] = i * r.cellW; oy[n] = j * r.cellH;
        a[n] = Math.atan2(u, z);
        lat[n] = l; ty[n] = (l / Math.PI + 0.5) * 6;
        diffuse[n] = Math.max(0, u * L.x + v * L.y + z * L.z);
        n++;
      }
    }
    return (this.cellCache = { cw: r.cellW, ch: r.cellH, n, kind, rim, ox, oy, a, ty, lat, diffuse });
  }

  draw(r, sx, sy, t) {
    const rimR = this.rim;
    if (sx + rimR < -r.margin || sx - rimR > r.width + r.margin) return;
    if (sy + rimR < -r.margin || sy - rimR > r.height + r.margin) return;

    const ramp = CONFIG.planet.ramp;
    const { n, kind, rim, ox, oy, a, ty, lat, diffuse } = this.cellsFor(r);
    // What glyph() would keep, asked before the noise is made rather than after it.
    const lo = -r.margin, hiX = r.width + r.margin, hiY = r.height + r.margin;
    const bands = this.bands, phase = this.phase, seed = this.seed;
    // mixHex(dark, tint, t) for every cell, its channels made here and its string once per colour.
    const pd = parseInt(this.dark.slice(1), 16), pt = parseInt(this.tint.slice(1), 16);
    const dr = (pd >> 16) & 255, dg = (pd >> 8) & 255, db = pd & 255;
    const tr = (pt >> 16) & 255, tg = (pt >> 8) & 255, tb = pt & 255;
    for (let k = 0; k < n; k++) {
      const px = sx + ox[k], py = sy + oy[k];
      if (!(px > lo && px < hiX && py > lo && py < hiY)) continue;
      if (kind[k] === 1) {
        r.glyph(CONFIG.planet.rimGlyphs[rim[k]], px, py, this.tint, a[k]);
        continue;
      }
      const lon = a[k] + phase;
      const tx = (lon / TAU) * LON_PERIOD;
      let surface = fbmWrapped(tx, ty[k], LON_PERIOD, seed, 3);
      if (bands > 0) surface = lerp(surface, 0.5 + 0.5 * Math.sin(lat[k] * 7.5 + surface * 3.2), bands);
      const shade = clamp(0.09 + diffuse[k] * (0.46 + 0.62 * surface), 0, 0.999);
      const ch = rampGlyph(ramp, shade);
      if (ch === ' ') continue;
      const m = Math.round(clamp(0.34 + surface * 0.78, 0, 1) * CONFIG.planet.mixSteps) / CONFIG.planet.mixSteps;
      const code = (Math.round(dr + (tr - dr) * m) << 16) | (Math.round(dg + (tg - dg) * m) << 8) | Math.round(db + (tb - db) * m);
      let color = HEX.get(code);
      if (color === undefined) { color = '#' + ((1 << 24) | code).toString(16).slice(1); HEX.set(code, color); }
      r.glyph(ch, px, py, color, clamp(0.42 + shade * 0.9, 0, 1));
    }
  }
}

// #rrggbb strings by their 24-bit value: a planet's shading is a few hundred colours, made once.
const HEX = new Map();

// ------------------------------------------------------------ black hole ---

export class BlackHole {
  // `rng`: as a planet's, for the starting phase of the turn.
  constructor(opts, rng) {
    // `secret` marks the hole into the hidden sector, at either end of its passage (src/secretHole.js, sectors.js
    // `SECRET_HOLE`); its `tell` is how it is known by sight, 'glyphs' or 'ring' (CONFIG.blackHole.secret), the
    // config's own unless a sketch sets one. An ordinary hole has neither.
    Object.assign(this, {
      x: 0, y: 0, horizon: 46, disc: 250, mass: 2.4e7, spinDir: 1, name: 'anomaly', secret: false, tell: null,
    }, opts);
    this.phase = between(rng, 0, TAU);
  }

  update(dt) { this.phase += dt * 0.35 * this.spinDir; }

  draw(r, sx, sy, t) {
    const reach = this.disc * 1.12;
    if (sx + reach < 0 || sx - reach > r.width) return;
    if (sy + reach < 0 || sy - reach > r.height) return;

    const cfg = CONFIG.blackHole;
    // The secret hole is known by a tell in its drawing (SX, 2026-10-02: «внутри себя имеет кольцо другого цвета или
    // некоторые символы в ее рисунке розовые»): some of its glyphs pink, or a ring of glyphs pink inside it. It turns
    // the other way as well (`spinDir`, the twist mirrored below).
    const tell = this.tell ?? (this.secret ? cfg.secret.tell : null), S = cfg.secret;
    const armStep = TAU / cfg.armCount;
    // One sample per cell of radius: any denser and the glyphs overdraw into
    // a solid smear instead of reading as a disc.
    const inner = this.horizon * 1.15;
    const samples = clamp(Math.round((this.disc - inner) / r.cellW), 10, cfg.samples);

    for (let a = 0; a < cfg.armCount; a++) {
      for (let s = 0; s < samples; s++) {
        const f = s / (samples - 1);
        // Linear in radius keeps the glyph spacing even instead of clotting
        // into a white blob near the core.
        const rad = lerp(inner, this.disc, f);
        // Keplerian shear: the inner disc laps the outer one.
        const omega = 26000 / Math.pow(rad, 1.5);
        // The twist follows the spin, so a hole turning the other way (the hidden sector's) is the mirror image of
        // the others, its arms trailing as theirs do.
        const base = a * armStep + f * cfg.twist * this.spinDir + this.phase + t * omega * 0.02 * this.spinDir;
        const ch = rampGlyph(cfg.ramp, f);
        const pink = tell === 'glyphs' && (s + a * S.glyphs.stagger) % S.glyphs.every === 0;
        const tone = pink ? S.ink : mixHex('#ffffff', cfg.color, clamp(f * 1.4, 0, 1));
        const alpha = clamp(0.92 - f * 0.72, pink ? S.glyphs.floor : 0.12, 0.92);
        // Two strands per arm so the spiral reads as a band, not a dotted line.
        // The disc is a circle on the screen: cells are placed by pixel, so the
        // same radius in both axes is round (it was squashed to 0.9 in y, and SX,
        // 2026-09-30: "черные дыры стали овальными, сделай их круглыми").
        const spread = cfg.armWidth * (0.25 + f);
        for (let k = -1; k <= 1; k += 2) {
          const theta = base + k * spread;
          r.glyph(ch, sx + Math.cos(theta) * rad, sy + Math.sin(theta) * rad,
            tone, alpha * (k < 0 ? 1 : 0.6));
        }
      }
    }

    // Photon ring: a thin bright circle right at the horizon.
    const ringR = this.horizon * 1.04;
    const ringN = Math.max(12, Math.round((TAU * ringR) / r.cellW));
    for (let i = 0; i < ringN; i++) {
      const th = (i / ringN) * TAU + this.phase * 0.6;
      r.glyph('·', sx + Math.cos(th) * ringR, sy + Math.sin(th) * ringR, '#ffffff', 0.55);
    }

    // The secret hole's other tell: a ring of pink glyphs inside the disc, turning with it.
    if (tell === 'ring') {
      const R = lerp(inner, this.disc, S.ring.at);
      const n = Math.max(12, Math.round((TAU * R) / (r.cellW * S.ring.step)));
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU + this.phase * 0.6;
        r.glyph(S.ring.glyph, sx + Math.cos(th) * R, sy + Math.sin(th) * R, S.ink, S.ring.alpha);
      }
    }
  }
}

// -------------------------------------------------------------- asteroid ---

export class Asteroid {
  // `seed` fixes the outline and the surface marks (none: one is drawn); `rng` is where its size, heading, spin and that seed
  // come from: a World's 'field' stream (World.newRock), Math.random given for a rock a sketch, a tool or a check builds alone.
  constructor(x, y, tier, seed, rng) {
    seed ??= (rng() * 1e9) | 0;
    this.tier = tier;
    const t = CONFIG.asteroid.tiers[tier];
    this.x = x; this.y = y;
    this.radius = t.radius * between(rng, 0.82, 1.18);
    const dir = between(rng, 0, TAU);
    this.vx = Math.cos(dir) * t.speed * between(rng, 0.5, 1.4);
    this.vy = Math.sin(dir) * t.speed * between(rng, 0.5, 1.4);
    this.angle = between(rng, 0, TAU);
    this.angVel = between(rng, -0.5, 0.5) * (1 + tier * 0.5);
    this.glyph = t.glyph;
    this.dead = false;

    const outline = mulberry32(seed);
    const lobes = 6 + Math.floor(outline() * 5);
    this.profile = new Array(lobes);
    for (let i = 0; i < lobes; i++) this.profile[i] = 0.74 + outline() * 0.45;

    // Surface marks live in rock-local, radius-normalized coordinates. A
    // separate seed keeps future texture changes independent of the outline.
    const surfaceRng = mulberry32(seed ^ 0x51f15e);
    const patches = Array.from({ length: tier === 2 ? 1 : 3 }, () => {
      const angle = surfaceRng() * TAU;
      const reach = 0.2 + surfaceRng() * 0.35;
      return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
    });
    this.surface = [];
    const stepX = 18 / t.radius, stepY = 24 / t.radius;
    for (let y = -0.72; y <= 0.72; y += stepY) {
      for (let x = -0.72; x <= 0.72; x += stepX) {
        const depth = 1 - Math.min(...patches.map((p) =>
          Math.hypot((x - p.x) / 0.38, (y - p.y) / 0.3)));
        if (depth <= 0 || surfaceRng() > 0.82) continue;
        const edge = this.radiusAt(Math.atan2(y, x)) / this.radius;
        if (Math.hypot(x, y) > edge - 0.18) continue;
        this.surface.push({ x, y, ch: rampGlyph('.:+#', depth), alpha: 0.5 + depth * 0.35 });
      }
    }
    if (!this.surface.length) this.surface.push({ ...patches[0], ch: ':', alpha: 0.65 });
  }

  radiusAt(theta) {
    const n = this.profile.length;
    const f = ((theta / TAU) % 1 + 1) % 1 * n;
    const i = Math.floor(f);
    const frac = f - i;
    const a = this.profile[i % n], b = this.profile[(i + 1) % n];
    const s = frac * frac * (3 - 2 * frac);
    return this.radius * lerp(a, b, s);
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.angVel * dt;
  }

  draw(r, sx, sy) {
    if (sx + this.radius * 1.3 < 0 || sx - this.radius * 1.3 > r.width) return;
    if (sy + this.radius * 1.3 < 0 || sy - this.radius * 1.3 > r.height) return;
    const steps = clamp(Math.round((TAU * this.radius) / r.cellW), 14, 128);
    for (let i = 0; i < steps; i++) {
      const th = (i / steps) * TAU;
      const rad = this.radiusAt(th - this.angle);
      const px = sx + Math.cos(th) * rad;
      const py = sy + Math.sin(th) * rad * 0.94;
      const lit = 0.5 + 0.5 * Math.cos(th - 2.35);
      r.glyph(this.glyph, px, py, CONFIG.asteroid.color, 0.35 + lit * 0.65);
    }
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    for (const c of this.surface) {
      const x = (c.x * ca - c.y * sa) * this.radius;
      const y = (c.x * sa + c.y * ca) * this.radius * 0.94;
      r.glyphRot(c.ch, sx + x, sy + y, this.angle,
        CONFIG.asteroid.color, c.alpha);
    }
  }
}
