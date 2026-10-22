// The ship back from a wreck, its parts mixed up and put back in place (SX, 2026-10-16: «Когда корабль взрывается, то после возрождения он
// мигает, конкретно так не делай, лучше типо покажи его символы по тому же силуэту но перепутаные местами (все в своих цветах) и через 2
// секунды он постепенно собирается как надо, переставляет типо детали по соседним клеткам, как пятнашки»). It stood blinking while it could
// not be hurt until then (world-art.js shipAlpha, which still blinks a ship given its grace another way: a new flight, the way out of a dock).
//
// The drawing's own cells, each in its own colours, on the cells of its own silhouette: a plan of `rounds` rounds of swaps, each swap two
// cells a side apart (the fifteen puzzle's move), the swaps of a round apart from each other, `pairs` of the silhouette's cells in each. Mixed
// by playing the rounds from the whole drawing; put back by playing them backwards, a round at a time, its pieces sliding to their neighbours'
// cells together. Mixed it stands `hold` s from the moment it comes up (labs/graphics/respawn-fx.js: the rise starts mixed), then it is put
// back over `put` s, a little before the time it cannot be hurt ends (CONFIG.ship.respawnInvuln, untouched): read off the ship's own `invuln`,
// on the world's clock, so the pause holds it. Until SX's «на 30% быстрее, чтобы корабль собирался» (2026-10-21) it stood mixed 2 s and was
// put back over the rest of its grace (1.5 s), whole the moment it could be hit again; both are 0.7 of that now, the grace as it was. Presentation only, made from the page's seed (Math.random), never the
// world's; reduced motion has none (no return is played, and the ship stands whole and steady).
import { CONFIG } from '../../src/config.js';
import { clamp, mulberry32 } from '../../src/util.js';
import { REBOOT } from './reboot.js';

export const SCRAMBLE = Object.freeze({ hold: 1.4, put: 1.05, rounds: 12, pairs: 0.3 });
// Seconds the putting back takes, never more than what is left of CONFIG.ship.respawnInvuln once the ship has come up (the sweep up to the
// rise) and stood mixed for `hold`.
export const assembleTime = () => Math.min(SCRAMBLE.put, Math.max(0, riseGrace() - SCRAMBLE.hold));
// The grace left as the ship comes up.
const riseGrace = () => CONFIG.ship.respawnInvuln - REBOOT.sweep * REBOOT.rise.start;

const keyOf = (x, y) => `${x},${y}`;

// The plan for a pose's `cells` ({ x, y } a whole cell apart), from `seed`: the slots (each cell's place), `slotOf` a place's slot, the
// rounds as pairs of slots, and the arrays a frame works in (made here, so a frame makes nothing).
export function scramblePlan(cells, seed, S = SCRAMBLE) {
  const slots = cells.map((c) => ({ x: c.x, y: c.y }));
  const slotOf = new Map(slots.map((s, i) => [keyOf(s.x, s.y), i]));
  const edges = [];
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    if (Math.abs(slots[i].x - slots[j].x) + Math.abs(slots[i].y - slots[j].y) === 1) edges.push([i, j]);
  }
  const rng = mulberry32(seed >>> 0), per = Math.max(1, Math.round((S.pairs * slots.length) / 2)), rounds = [];
  for (let k = 0; k < S.rounds && edges.length; k++) {
    for (let i = edges.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [edges[i], edges[j]] = [edges[j], edges[i]]; }
    const used = new Set(), round = [];
    for (const [a, b] of edges) {
      if (round.length >= per) break;
      if (used.has(a) || used.has(b)) continue;
      used.add(a); used.add(b); round.push([a, b]);
    }
    rounds.push(round);
  }
  const n = slots.length;
  return { seed, cells, slots, slotOf, rounds, at: new Int16Array(n), before: new Int16Array(n), places: slots.map(() => ({ x: 0, y: 0 })),
    byCell: new Map() };
}

// Where the piece of each slot stands after the first `m` rounds (`into`[piece] = slot).
function played(plan, m, into) {
  for (let i = 0; i < into.length; i++) into[i] = i;
  for (let k = 0; k < m; k++) for (const [a, b] of plan.rounds[k]) {
    // The pieces on slots a and b change places.
    for (let i = 0; i < into.length; i++) {
      if (into[i] === a) into[i] = b; else if (into[i] === b) into[i] = a;
    }
  }
  return into;
}

// Where each piece is drawn at `u` (0 mixed, 1 whole): `plan.places[piece]` in the pose's cells, a piece of a round under way between its two
// cells (smoothstep). Returns the places.
export function scrambledPlaces(plan, u) {
  const total = plan.rounds.length, m = total * (1 - clamp(u, 0, 1));
  const hi = Math.ceil(m - 1e-9), f = hi - m, t = f * f * (3 - 2 * f);
  const to = played(plan, hi, plan.at), from = hi > 0 ? played(plan, hi - 1, plan.before) : to;
  for (let i = 0; i < plan.slots.length; i++) {
    const a = plan.slots[to[i]], b = plan.slots[from[i]], p = plan.places[i];
    p.x = a.x + (b.x - a.x) * t; p.y = a.y + (b.y - a.y) * t;
  }
  return plan.places;
}

// The slot of a drawn cell of any pose (its place's), -1 for a cell off the silhouette: kept by the cell, the drawings' cells being the same
// objects every frame.
export function slotOfCell(plan, c) {
  let i = plan.byCell.get(c);
  if (i === undefined) { i = plan.slotOf.get(keyOf(c.x, c.y)) ?? -1; plan.byCell.set(c, i); }
  return i;
}

// How far put back the ship is (0 mixed .. 1 whole) at `invuln` s of grace left: mixed for `hold` s after it comes up, then put back over
// the putting back's time.
export function assembled(invuln) {
  const A = assembleTime(), since = riseGrace() - invuln - SCRAMBLE.hold;
  return A > 0 ? clamp(since / A, 0, 1) : 1;
}
