import { CONFIG } from './config.js';

// A quiet thing for pilots who fly exactly right. SX asked (2026-09-26) not to
// be told where it is; please keep it out of reports and release notes.
// Presentation only: nothing here changes flight, credits or saves, and it
// happens at most once per world. Held long enough, a certain speed in a
// straight line leaves two lines of fire behind the ship, a flash, one word.
const HOLD = 2.0;           // seconds held
const LOW = 86, HIGH = 90;  // u/s: the readout says the number, give or take a finger
const STRAIGHT = 0.25;      // rad/s of turn still counted as straight

export function stepEggs(world, dt) {
  const egg = world.egg;
  const ship = world.ship;
  if (egg.done || !ship.alive || world.docked) { egg.held = 0; return; }
  const speed = Math.hypot(ship.vx, ship.vy);
  const steady = speed >= LOW && speed <= HIGH && Math.abs(ship.angVel) < STRAIGHT;
  egg.held = steady ? egg.held + dt : 0;
  if (egg.held < HOLD) return;
  egg.done = true;

  const heading = Math.atan2(ship.vy, ship.vx);
  const back = { x: -Math.cos(heading), y: -Math.sin(heading) };
  const side = { x: -back.y, y: back.x };
  const flame = CONFIG.ship.colors.flame;
  const tracks = [];
  for (let k = 0; k < 18; k++) {
    for (const s of [-1, 1]) {
      const d = 30 + k * 11;
      tracks.push({ dx: back.x * d + side.x * 12 * s, dy: back.y * d + side.y * 12 * s,
        ch: '─', color: flame[(k + (s > 0 ? 1 : 0)) % flame.length] });
    }
  }
  world.particles.burst(ship.x, ship.y, tracks, { speed: [0, 2], life: [2.4, 3.2], angle: heading, still: true });
  world.particles.burst(ship.x, ship.y, Array.from({ length: 14 }, (_, k) => ({
    dx: Math.cos((k * Math.PI) / 7) * 16, dy: Math.sin((k * Math.PI) / 7) * 16,
    ch: k % 2 ? '·' : '*', color: '#ffffff',
  })), { speed: [90, 240], life: [0.3, 0.8] });
  world.emit('outatime', { x: ship.x, y: ship.y });
}

// Another quiet thing: one more ship. SX asked not to be shown it; please keep it out of reports, release notes, sketch pages
// and lab switches. It is one of the fleet's ships (src/npcShips.js NPC_SHIPS) in every way but three: it is not out with the
// others but comes out now and then (`rare`, src/npcFleet.js), it is never a quest's ship, and it wears only its own colours.
//   rare     out first after `first` s of the world's clock, then `every` s apart (a range), each time for `stay` s, where the
//            pilot is going: `ahead` u past the edge of sight along its way, or within `ring` u past it round a pilot standing
//   replies  what it answers when the pilot greets it, in place of the others' (src/greetings.js CRAFT_REPLIES)
export const QUIET_SHIP = Object.freeze({
  code: 'N47', name: 'MR. SATURN', scheme: 0,
  glyphs: [
    "   >v<   ",
    "    |    ",
    "  .-'-.  ",
    " (·(o)·) ",
    "=(     )=",
    "  '---'  ",
    "   \" \"   ",
  ],
  colors: [
    "   lll   ",
    "    h    ",
    "  hhhhh  ",
    " htgggth ",
    "th     ht",
    "  hhhhh  ",
    "   e e   ",
  ],
  palette: { h: '#B5ADA2', t: '#8C8781', g: '#BA8FAB', e: '#B5ADA2', l: '#BA8FAB' },
  route: { sector: 'sector-j05', path: { kind: 'orbit', at: 'planet:SORREL', radius: 250, phase: 4, dir: 1 } }, speed: 70,
  rare: Object.freeze({ first: 1500, every: Object.freeze([2700, 4500]), stay: 240, ahead: 600, ring: 2000 }),
  replies: Object.freeze(['BOING!', 'ZOOM!', 'DING. HELLO.', 'YOU WANT BUY, ZOOM?']),
});
