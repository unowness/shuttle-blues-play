// The fog's primitives, shared by the edge's fog (src/worldDraw.js drawDeadEdges) and the smoke clouds (src/cloudDraw.js). Its noise
// and its outline's strokes moved out of src/worldDraw.js as they were (chat W2, 2026-10-04), so the clouds draw with the fog's own and
// no module imports back; its way through the smoke (the puffs, their holes) out of src/world.js and src/worldDraw.js as it was
// (2026-10-04, evening), so a hull cuts a cloud as it cuts the fog.

// The fog past a dead edge (World.drawDeadEdges): smooth value noise in 0..1 over a lattice of whole units, and the
// steps of its density, a shade glyph and its light each.
export function fogHash(i, j) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The fog's outline, as a rock's (labs/graphics/world-art.js drawAsteroid): where four cells meet, the strokes along their sides
// that meet there, up 1, right 2, down 4, left 8, as one box-drawing glyph.
export const FOG_EDGE = Object.freeze({ 3: '└', 5: '│', 6: '┌', 7: '├', 9: '┘', 10: '─', 11: '┴', 12: '┐',
  13: '┤', 14: '┬', 15: '┼', 1: '╵', 2: '╶', 4: '╷', 8: '╴' });

// ------------------------------------------------------------------------------------------------------------ the way through it

// The puffs a hull and its exhaust leave in the smoke (CONFIG.sector.boundary.fog `cone` and `jet`; World.stepFogWake, and the clouds'
// src/clouds.js): each { x, y, t, life, near, spread, rim, closeFrom, phase, size }, a jet's flying on { vx, vy }. A puff is a round
// hole with lumpy sides, `near` u across at first and widening by `spread` u a second (`size` of it), closing from `closeFrom` of its
// `life` on; the smoke it pushes aside is heaped `rim` thicker round it.

// A puff of `P` (the fog's `cone` or `jet`) laid at `t`, its jitter from `rnd` (a counter's hash: the same flight leaves the same
// puffs), and `more`: its place, a jet's speed and spread.
export const wakePuff = (P, t, rnd, more) => ({ t, life: P.life, near: P.near, spread: P.spread, rim: P.rim, closeFrom: P.closeFrom,
  phase: rnd() * Math.PI * 2, size: 1 + (rnd() - 0.5) * P.jitter, ...more });

// One step of the puffs at `t`: the closed dropped, in place; a jet's flies on, slowing by `drag` a second.
export function stepWake(wake, dt, t, drag) {
  let n = 0;
  for (const p of wake) {
    if (t - p.t >= p.life) continue;
    if (p.vx !== undefined) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.max(0, 1 - drag * dt);
      p.vx *= k; p.vy *= k;
    }
    wake[n++] = p;
  }
  wake.length = n;
}

// How hard the engine blows into the smoke, 0 when it does not: the throttle by its spool, the retro `J.retro` of that by its own.
export const enginePower = (ship, J) => (ship.thrusting ? 0.5 + 0.5 * ship.spool : ship.retroing ? J.retro * (0.5 + 0.5 * ship.retroSpool) : 0);

// A puff of the exhaust (`J`, the fog's `jet`) at `power`: the engine blows out of the hull's rear, the retro out of its nose, `cone`
// rad either side of the way it blows, the puff flying on at `speed` u/s on the ship's own.
export function jetPuff(ship, J, t, rnd, power) {
  const a = ship.angle + (ship.thrusting ? Math.PI : 0) + (rnd() - 0.5) * 2 * J.cone;
  const from = ship.thrusting ? ship.drawnRear() : ship.radius;
  const ux = Math.cos(a), uy = Math.sin(a);
  return wakePuff(J, t, rnd, { x: ship.x + ux * from, y: ship.y + uy * from, spread: J.spread * power,
    vx: ship.vx + ux * J.speed * power, vy: ship.vy + uy * J.speed * power });
}

// The holes the puffs make at `t`, each { x, y, r, rim, phase }, written into `out` from its `n`th on (an object found there is
// refilled, so a kept list allocates nothing); returns how many there are then.
export function wakeHoles(wake, t, out, n = 0) {
  for (const p of wake) {
    const age = t - p.t, k = age / p.life;
    if (k >= 1) continue;
    const c = Math.min(1, Math.max(0, (k - p.closeFrom) / (1 - p.closeFrom)));
    const r = (p.near + p.spread * age) * p.size * (1 - c * c * (3 - 2 * c));
    if (r > 3) {
      const h = out[n] ?? (out[n] = {});
      h.x = p.x; h.y = p.y; h.r = r; h.rim = p.rim * (1 - k); h.phase = p.phase;
      n++;
    }
  }
  return n;
}

// The first `n` holes stamped onto the cells i0..i1, j0..j1 (`ni` a row; cell (i, j)'s middle at ((i + 0.5) cw - gx, (j + 0.5) ch - gy)
// in the sector's units): a cell inside a hole's lumpy outline (the 3rd and 5th harmonics of its radius, `L3` and `L5`, turning with
// its phase) is clear, `clearAt` 1; one in the ring `RW` of its radius round it gets the heap, its `rim` falling off across the ring,
// the most of every hole in `heapAt`. No trigonometry per cell.
// A clear cell's heap is never read (World.drawDeadEdges, src/cloudDraw.js), so what makes a cell clear is all that counts once it is:
// a hole whose whole reach (`out`) lies inside another's sure clear disc (`inner`) is passed over, a cell already cleared is not worked
// again, and each row is worked only across the columns the reach crosses; the cells come out the same, bit for bit. The hull held
// still in the smoke leaves about 30 puffs one over another, each up to ~1,500 cells: 0.29 ms a frame stamped (2026-10-07).
export function stampHoles(holes, n, i0, i1, j0, j1, ni, cw, ch, gx, gy, clearAt, heapAt, L3, L5, RW) {
  for (let q = 0; q < n; q++) {
    const h = holes[q];
    const out = h.r * (1 + L3 + L5) * (1 + RW), inner = h.r * (1 - L3 - L5), out2 = out * out, inner2 = inner * inner;
    let covered = false;
    for (let p = 0; p < n && !covered; p++) {
      const o = holes[p], room = o.r * (1 - L3 - L5) - out - 1e-6;
      if (p === q || room <= 0) continue;
      const dx = o.x - h.x, dy = o.y - h.y;
      covered = dx * dx + dy * dy < room * room;
    }
    if (covered) continue;
    // The outline's lobes, sin(3a + p) and sin(5a - 1.7p), from the direction's cosine and sine: no trigonometry per cell.
    const p3c = Math.cos(h.phase), p3s = Math.sin(h.phase), p5c = Math.cos(1.7 * h.phase), p5s = -Math.sin(1.7 * h.phase);
    const ia = Math.max(i0, Math.floor((h.x - out + gx) / cw)), ib = Math.min(i1, Math.ceil((h.x + out + gx) / cw));
    const ja = Math.max(j0, Math.floor((h.y - out + gy) / ch)), jb = Math.min(j1, Math.ceil((h.y + out + gy) / ch));
    for (let j = ja; j <= jb; j++) {
      const dy = (j + 0.5) * ch - gy - h.y, line = (j - j0) * ni;
      // Only the columns the reach crosses on this row, a cell of slack either side (a cell outside is far past `out2`: the same cells).
      if (dy * dy > out2) continue;
      const wo = Math.sqrt(out2 - dy * dy);
      const ra = Math.max(ia, Math.floor((h.x - wo + gx) / cw - 0.5) - 1), rb = Math.min(ib, Math.ceil((h.x + wo + gx) / cw - 0.5) + 1);
      for (let i = ra; i <= rb; i++) {
        const dx = (i + 0.5) * cw - gx - h.x, d2 = dx * dx + dy * dy;
        if (d2 > out2) continue;
        const idx = line + i - i0;
        if (clearAt[idx]) continue;               // cleared by a hole before: its heap is never read
        if (d2 < inner2) { clearAt[idx] = 1; continue; }
        const d = Math.sqrt(d2), c = dx / d, sn = dy / d, c2 = c * c, s2 = sn * sn;
        const sin3 = sn * (3 - 4 * s2), cos3 = c * (4 * c2 - 3);
        const sin5 = sn * (16 * s2 * s2 - 20 * s2 + 5), cos5 = c * (16 * c2 * c2 - 20 * c2 + 5);
        const u = d / (h.r * (1 + L3 * (sin3 * p3c + cos3 * p3s) + L5 * (sin5 * p5c + cos5 * p5s)));
        if (u < 1) clearAt[idx] = 1;
        else if (u < 1 + RW) heapAt[idx] = Math.max(heapAt[idx], h.rim * (1 - (u - 1) / RW));
      }
    }
  }
}
