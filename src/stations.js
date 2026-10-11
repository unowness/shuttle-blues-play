import { normalizeModel } from './asciiModel.js';
import { CONFIG } from './config.js';
import { hashId } from './util.js';
import { floatPhases, floatPose } from './float.js';
import { stationsOf } from './sectors.js';

// Stations are artificial structures, not celestial bodies: no lethal radius,
// no gravity well of their own.
//
// Their artwork goes through the same loader the ships use, so there is one
// ASCII model format in the project rather than two. They are never rotated, but for the float (src/float.js, SX's item 17; the
// game's since 2026-10-04; a check may hold the old drift): then a station turns a few degrees either way (`angle`, `spin`) and goes round its place.
//
// Thin hull ribs repeat the delivery container motif. Garage arms leave an
// open approach on the right; the freight hub joins four modular containers.
// Footprints and silhouettes stay within the existing station artwork values.

const ART = {
  garage: {
    name: 'dry-dock',
    // Box-drawing strokes join across cells at lineRatio 1.0. Sparse hatching
    // suggests plated bays without turning the hull into a solid block mass.
    art: [
      '┌──┬──┬──┬──┐        ',
      '│: ┊: ┊: ┊: ├───────┐',
      '├──┴──┴──┴──┤ · · · │',
      '│ ┌╌╌╌╌╌╌╌┐ └───────o',
      '│ ┊ :   : ┊          ',
      '│ ┊   ◇   ┊          ',
      '│ ┊ :   : ┊ ┌───────┐',
      '├─┴╌╌╌╌╌╌╌┴─┤ · · · │',
      '│: ┊: ┊: ┊: ├───────┘',
      '└──┴──┴──┴──┘        ',
    ],
    colors: {
      '┌┐└┘─│├┤┬┴┼': CONFIG.hud.color,
      '┊╌:·o': CONFIG.hud.frame,
      '◇': CONFIG.hud.accent,
    },
    heading: 'up',
    scale: 2.6,
  },

  freight: {
    name: 'freight-hub',
    art: [
      '┌─┬─┐           ┌─┬─┐',
      '│:┊:├───┐   ┌───┤:┊:│',
      '└─┴─┘   │   │   └─┴─┘',
      '        ├───┤        ',
      '        │ ◇ │        ',
      '        ├───┤        ',
      '┌─┬─┐   │   │   ┌─┬─┐',
      '│:┊:├───┘   └───┤:┊:│',
      '└─┴─┘           └─┴─┘',
    ],
    colors: {
      '─│┌┐└┘├┤┬┴┼': CONFIG.hud.color,
      '┊:': CONFIG.hud.frame,
      '◇': CONFIG.hud.accent,
    },
    heading: 'up',
    scale: 2.4,
  },
};

export class Station {
  constructor(def, sectorId, worldSize) {
    this.id = def.id;
    this.kind = def.kind || 'garage';
    this.label = def.label || 'STATION';
    this.sectorId = sectorId;
    // Its drawing (labs/graphics/station-art.js), by name; without one, the ART below.
    this.look = typeof def.look === 'string' ? def.look : null;
    // A ruin (src/ruins.js) keeps its kind for good; what it is rebuilt into, and
    // what the rebuilding costs, come with it. The pilot's investment is in the
    // ledger, not here.
    this.becomes = this.kind === 'ruin' ? (ART[def.becomes] ? def.becomes : 'garage') : null;
    this.cost = this.kind === 'ruin' && Number.isInteger(def.cost) && def.cost > 0 ? def.cost : 0;
    // Catalogue positions are fractions of the sector, so a sector can be
    // resized without rewriting every address.
    this.x = def.x * worldSize.width;
    this.y = def.y * worldSize.height;
    // Where it drifts round (CONFIG.station.drift), and how: two periods and two phases from its id.
    this.homeX = this.x;
    this.homeY = this.y;
    this.vx = 0;
    this.vy = 0;
    // Its turn (rad, 0 but in the float) and the turn's rate, rad/s; the float's phases from its id (src/float.js).
    this.angle = 0;
    this.spin = 0;
    this.floatPhases = floatPhases(this.id);
    this.clock = 0;
    const seed = hashId(String(this.id));
    const [p0, p1] = CONFIG.station.drift.period;
    this.drift = {
      wx: (2 * Math.PI) / (p0 + (p1 - p0) * ((seed & 1023) / 1023)),
      wy: (2 * Math.PI) / (p0 + (p1 - p0) * (((seed >>> 10) & 1023) / 1023)),
      px: ((seed >>> 20) & 1023) / 1023 * 2 * Math.PI,
      py: ((seed >>> 5) & 1023) / 1023 * 2 * Math.PI,
    };

    this.model = normalizeModel(ART[this.becomes || this.kind] || ART.garage, this.kind);
    // Where its beacon is in its blink: from its id, like its drift, so a station has the same one wherever and whenever it is
    // built (a rebuilt one does not jump) and nothing here asks a die. A look only, nothing reads it.
    this.beaconPhase = ((seed >>> 13) & 1023) / 1023 * 2 * Math.PI;

    const s = CONFIG.station;
    // The soft hull is the same for every station but the home garage, whose rock is wider (CONFIG.station.hulls).
    this.hullRadius = (this.look && s.hulls[this.look]) || s.hullRadius;
    this.interactRadius = s.interactRadius;
    this.discoverRadius = s.discoverRadius;
    // The solid body (CONFIG.station.bodies): half extents of a box with rounded corners.
    const body = this.look && s.bodies[this.look];
    this.body = body ? { hx: body[0], hy: body[1], r: Math.min(body[0], body[1]) * (s.corners[this.look] ?? s.corner) }
      : { hx: this.hullRadius, hy: this.hullRadius, r: this.hullRadius };
    // How far any point of the body is from its middle, whatever the float's turn: a thing farther than this and its own size on either
    // axis does not touch it, so the hit warning (src/hitWarning.js) does not ask `contact` about it at each of its 48 steps.
    this.far = Math.hypot(this.body.hx, this.body.hy);
  }

  // Where a circle of radius `radius` at (x, y) meets this station's body, or null: the normal out of the
  // body (nx, ny) at the nearest point and how deep the circle is in (`depth`), and the distance from the
  // body's middle along that normal to where the circle's centre must stand (`touch`, used to hold it out).
  // A station turned by the float is met in its own frame: the point turned back by its turn, the answer turned on by it.
  contact(x, y, radius, delta) {
    if (this.angle) {
      const d = delta(x, y, this.x, this.y), c = Math.cos(this.angle), s = Math.sin(this.angle);
      const hit = this.contactLocal({ x: d.x * c + d.y * s, y: -d.x * s + d.y * c }, radius);
      if (!hit) return null;
      const px = hit.px - this.x, py = hit.py - this.y;
      return { ...hit, nx: hit.nx * c - hit.ny * s, ny: hit.nx * s + hit.ny * c, px: this.x + px * c - py * s, py: this.y + px * s + py * c };
    }
    return this.contactLocal(delta(x, y, this.x, this.y), radius);
  }

  // `d`: the point from the body's middle, in the body's own frame.
  contactLocal(d, radius) {
    const { hx, hy, r } = this.body;
    const ix = hx - r, iy = hy - r;                     // the box the corners are rounded round
    const cx = Math.max(-ix, Math.min(ix, d.x)), cy = Math.max(-iy, Math.min(iy, d.y));
    let ox = d.x - cx, oy = d.y - cy;
    let dist = Math.hypot(ox, oy);
    const reach = r + radius;
    if (dist >= reach) return null;
    if (dist < 1e-6) {
      // The centre inside the inner box: out through the nearest side.
      const fx = ix - Math.abs(d.x), fy = iy - Math.abs(d.y);
      if (fx < fy) { ox = Math.sign(d.x) || 1; oy = 0; } else { ox = 0; oy = Math.sign(d.y) || 1; }
      return { nx: ox, ny: oy, depth: reach + Math.min(fx, fy), px: this.x + cx, py: this.y + cy, inside: true };
    }
    return { nx: ox / dist, ny: oy / dist, depth: reach - dist, px: this.x + cx, py: this.y + cy, inside: false };
  }

  // `time` is the world's clock (a station seen across a seam is another instance, and has to stand where
  // this one does); without it the station keeps a clock of its own.
  // `float` (CONFIG.float, its `home` for the home garage, or null): the float in place of the drift (src/float.js floatOf; World.floating,
  // off only for a check). The home garage's board, bay, berth and way in turn with it (src/home.js).
  update(dt, time = null, float = null) {
    this.beaconPhase += dt * CONFIG.station.beaconRate;
    this.clock = time ?? this.clock + dt;
    if (float) {
      const p = floatPose(this.floatPhases, this.clock, float);
      this.x = this.homeX + p.dx; this.y = this.homeY + p.dy;
      this.vx = p.vx; this.vy = p.vy;
      this.angle = p.angle; this.spin = p.spin;
      return;
    }
    if (this.angle) { this.angle = 0; this.spin = 0; }
    const A = CONFIG.station.drift.amount, d = this.drift, t = this.clock;
    this.x = this.homeX + A * (Math.sin(d.wx * t + d.px) - Math.sin(d.px));
    this.y = this.homeY + A * 0.7 * (Math.sin(d.wy * t + d.py) - Math.sin(d.py));
    this.vx = A * d.wx * Math.cos(d.wx * t + d.px);
    this.vy = A * 0.7 * d.wy * Math.cos(d.wy * t + d.py);
  }

  // Placeholder for docking: the hull pushes a ship out instead of letting it
  // fly through, and never captures or damages it. Real docking replaces this.
  repel(ship, delta, dt) {
    const d = delta(ship.x, ship.y, this.x, this.y);
    const dist = Math.hypot(d.x, d.y);
    if (dist >= this.hullRadius || dist < 0.001) return false;
    const push = (1 - dist / this.hullRadius) * CONFIG.station.repelAccel;
    ship.vx += (d.x / dist) * push * dt;
    ship.vy += (d.y / dist) * push * dt;
    return true;
  }

  draw(r, sx, sy) {
    const m = this.model;
    const w = r.cellW * m.scale, h = r.cellH * m.scale;
    for (const c of m.cells) {
      r.glyph(c.ch, sx + c.x * w, sy + c.y * h, c.color, 1, m.scale);
    }
    // Approach light. The only moving part, and it only changes alpha.
    const lit = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.beaconPhase));
    const beacon = m.cells.find((c) => c.ch === 'o');
    if (beacon) {
      r.glyph('o', sx + beacon.x * w, sy + beacon.y * h, CONFIG.hud.accent, lit, m.scale);
    }
  }
}

// A sector's stations as the pilot whose ledger this is has them (his start ruin, src/sectors.js stationsOf).
export function buildStations(sector, worldSize, ledger = null) {
  return stationsOf(sector, ledger).map((def) => new Station(def, sector.id, worldSize));
}
