// The boss TOLLKEEPER drawn in the world (src/boss.js is its fight, CONFIG.boss its drawing and inks): its tethers, its two sleds and its
// core in Q7C SALVAGE, glyph by glyph at the pirates' scale, turned with each part; the warnings in the pirates' inks (src/pirateCombatTheme.js:
// the white while it warns, the guns' orange while it works, the gray and the pirates' dot while it rests); a charge's line warned dotted.
// No health bar and no phase's number (SX, 2026-10-14: «здоровье босса демонстрируем его постепенным разрушением как у станций»; «номер
// фазы тоже не нужно»): its hit points are read from it coming apart by the stations' rule (labs/graphics/world-art.js RUIN, handed in by
// the world's presentation): each cell has a fixed number (src/util.js cellNoise) and at `broken` (1 less the share of hit points left)
// those under broken * RUIN.gone are gone and a band of RUIN.loose more hang in the quiet ink. A cell that goes is thrown off as a piece,
// turning, and fades: those pieces are the page's look alone (Math.random), kept here per boss, never in the world.
import { CONFIG } from '../../src/config.js';
import { ROLES } from '../../src/roles.js';
import { PIRATE_CUES as CUE } from '../../src/pirateCombatTheme.js';
import { bossPoint, sledHook, bossCue, chargeLane } from '../../src/boss.js';
import { cellNoise, clamp } from '../../src/util.js';

const S = () => CONFIG.boss.scale;
const cueSets = new Map();
const cueSet = (name) => {
  if (!cueSets.has(name)) cueSets.set(name, new Set((CONFIG.boss.art.cues[name] ?? []).map(([j, i]) => j * 100 + i)));
  return cueSets.get(name);
};
// The page's memory of each boss drawn: which cells have gone (so each is thrown once) and the pieces in flight; and its last time.
const kept = new WeakMap();
const keep = (b) => { if (!kept.has(b)) kept.set(b, { gone: new Set(), bits: [], at: null, burst: false }); return kept.get(b); };

const pulse = (t) => 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 5));
const cueInk = (phase, t) => (phase === 'prepare' ? [CUE.warning, pulse(t)] : phase === 'commit' ? [CUE.commit, 1] : [CUE.recovery, 1]);

// A part (the core or a sled) with its middle at screen (x, y), its nose along `heading`; `ink(role, j, i)` a cell's [ink, alpha];
// `wear` { broken, k, lost } for a part coming apart (`lost(key, ch, x, y, angle, ink)` once a cell goes).
function drawPart(r, part, x, y, heading, ink, alpha, wear, RUIN) {
  const s = S(), a = heading + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), w = r.cellW * s, h = r.cellH * s;
  const rows = part.art, cols = rows[0].length;
  const gone = wear.broken * RUIN.gone, loose = gone + wear.broken * RUIN.loose;
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === ' ') continue;
      const lx = (i - (cols - 1) / 2) * w, ly = (j - (rows.length - 1) / 2) * h;
      const px = x + lx * ca - ly * sa, py = y + lx * sa + ly * ca;
      let c = ink(part.parts[j][i], j, i);
      if (wear.broken > 0) {
        const n = cellNoise(i, j, wear.k);
        if (n < gone) { wear.lost(wear.k * 1000 + j * 100 + i, ch, px, py, a, c[0]); continue; }
        if (n < loose && c[0] !== CONFIG.pirates.flash.ink) c = [ROLES.structure, c[1]];
      }
      r.glyphRot(ch, px, py, a, c[0], c[1] * alpha, s);
    }
  }
}

// The boss of `world` on renderer `r`, the stations' RUIN rule handed in by labs/graphics/world-art.js.
export function drawBossArt(r, world, RUIN) {
  const b = world.boss;
  if (!b) return;
  const A = CONFIG.boss.art, pal = A.palette, mem = keep(b), t = world.time, s = S();
  const P = (p) => world.project(r, p.x, p.y);
  const dt = mem.at === null ? 0 : clamp(t - mem.at, 0, 0.1);
  mem.at = t;
  const cue = bossCue(b), flashInk = CONFIG.pirates.flash.ink;
  // A cell gone: a piece thrown off it, once, with the part's way and a turn of its own.
  const lost = (vx, vy) => (key, ch, x, y, angle, ink) => {
    if (mem.gone.has(key)) return;
    mem.gone.add(key);
    throwPiece(mem, r, world, ch, x, y, angle, ink, vx, vy, s);
  };
  // Beaten: everything left of it goes at once.
  if (b.defeated && !mem.burst) {
    mem.burst = true;
    const c = P(b);
    drawPart({ glyphRot: (ch, x, y, angle, ink) => throwPiece(mem, r, world, ch, x, y, angle, ink, b.vx, b.vy, s, 2.2), cellW: r.cellW, cellH: r.cellH },
      A.core, c.x, c.y, b.heading, (role) => [pal[role] ?? pal.h, 1], 1, { broken: 0, k: 10, lost: () => {} }, RUIN);
  }
  if (!b.defeated) {
    // Tethers: a dotted line of the cargo's tether glyph in the trim's ink, from the hook to the sled.
    for (const sl of b.sleds) {
      if (!sl.on) continue;
      const hk = P(sledHook(b, sl)), q = P(sl);
      const len = Math.hypot(q.x - hk.x, q.y - hk.y), marks = clamp(Math.round(len / 18), 3, 16);
      for (let i = 1; i <= marks; i++) {
        const k = i / (marks + 1);
        r.glyph(CONFIG.cargo.tetherGlyph, hk.x + (q.x - hk.x) * k, hk.y + (q.y - hk.y) * k, pal.t, 0.9);
      }
    }
    // A charge warned: its line, dotted, from the nose.
    if (cue?.phase === 'prepare' && cue.kind === 'charge') {
      const nose = P(bossPoint(b, 0, -60)), lane = chargeLane(b);
      const far = P({ x: b.x + Math.cos(b.heading) * lane, y: b.y + Math.sin(b.heading) * lane });
      const dx = far.x - nose.x, dy = far.y - nose.y, len = Math.hypot(dx, dy);
      for (let at = CUE.lineStep; at < len; at += CUE.lineStep) r.glyph('·', nose.x + dx * at / len, nose.y + dy * at / len, CUE.warning, 0.5 + 0.35 * cue.u);
    }
  }
  // The sleds: a loose one drifts dimmer, its gun out.
  const spinning = cue?.kind === 'spiral' && cue.phase !== 'recover';
  for (const sl of b.sleds) {
    if (b.defeated && sl.on) continue;
    const q = P(sl), g = sl.gun;
    if (!r.onScreen(q.x, q.y, 80)) continue;
    drawPart(r, A.sled, q.x, q.y, sl.angle, (role) => {
      if (sl.flash > 0) return [flashInk, 1];
      // Its spiral (out of the sleds) warned and spun on the sled's mark cells.
      if (spinning && sl.on && role === 'm') return cueInk(cue.phase, t);
      if (role === 'g') return !sl.on ? [CUE.recovery, 1] : g.phase === 'prepare' ? [CUE.warning, pulse(t)] : [ROLES.caution, 1];
      return [pal[role] ?? pal.h, role === 'e' ? 0.7 : 1];
    }, sl.on ? 1 : 0.55, { broken: 1 - Math.max(0, sl.hp) / CONFIG.boss.body.sled.hp, k: sl.side > 0 ? 12 : 11, lost: lost(sl.vx, sl.vy) }, RUIN);
  }
  // The core.
  if (!b.defeated) {
    const c = P(b), lit = cue ? cueSet(cue.cue) : null;
    if (r.onScreen(c.x, c.y, 160)) {
      drawPart(r, A.core, c.x, c.y, b.heading, (role, j, i) => {
        if (b.flash > 0) return [flashInk, 1];
        if (lit?.has(j * 100 + i)) return cueInk(cue.phase, t);
        if (role === 'e') return [pal.e, cue?.kind === 'charge' && cue.phase === 'commit' ? 1 : 0.7];
        return [pal[role] ?? pal.h, 1];
      }, 1, { broken: 1 - b.hp / CONFIG.boss.hp, k: 10, lost: lost(b.vx, b.vy) }, RUIN);
      // Resting: the pirates' dot over it.
      if (cue?.phase === 'recover') r.glyph('·', c.x, c.y - CONFIG.boss.body.core.radius - CUE.ringGap, CUE.recovery);
    }
  }
  // The pieces in flight, in the world.
  for (let i = mem.bits.length - 1; i >= 0; i--) {
    const p = mem.bits[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 0.6 * dt; p.vy *= 1 - 0.6 * dt; p.angle += p.spin * dt; p.life -= dt;
    if (p.life <= 0) { mem.bits.splice(i, 1); continue; }
    const q = P(p);
    r.glyphRot(p.ch, q.x, q.y, p.angle, p.ink, clamp(p.life / p.fade, 0, 1), p.size);
  }
}

// A piece off the boss at screen (x, y): into the world (the projection's inverse), flying out at 40-160 u/s with half the part's way.
function throwPiece(mem, r, world, ch, x, y, angle, ink, vx, vy, size, life = 1) {
  const wx = world.cam.x + (x - r.cx), wy = world.cam.y + (y - r.cy);
  const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 120, l = (1.6 + Math.random() * 1.6) * life;
  mem.bits.push({ ch, ink, x: wx, y: wy, vx: vx * 0.5 + Math.cos(a) * sp, vy: vy * 0.5 + Math.sin(a) * sp, angle, spin: (Math.random() * 2 - 1) * 4,
    life: l, fade: Math.min(1, l), size });
}
