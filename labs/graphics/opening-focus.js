// A beat of focus for each of the opening's events (SX, 2026-10-04, after playing slices 1-2: «как-то все быстро, не успеваешь обратить
// внимание что события сменяются, не хватает какого-то фокуса на происходящем ... ощущается ни как история, а как спидран»).
//
// What was wrong, measured on the chapter as built: its events came in bursts and each notice took the place of the one before in the
// same frame. Boarding at A said YOUR SHUTTLE / RADIO REPAIRED and, in that frame, A's dispatch's call over it; the cache marked at B
// was a card that B's radio line replaced at once; a pilot quick in A's menu had the locator and the map fitted while the first call
// still stood. And a panel given (the cockpit, the locator) simply was there the next frame.
//
// Three ways to give each event its beat, for SX to compare in Firefox on the lab's `?focus=` (each load a new pilot in the opening,
// on the lab's own save: labs/graphics/main.js); today's as F0:
//   F0 TODAY          as it was: a notice in place of the one before, as soon as it comes
//   F1 ONE AT A TIME  the opening's beats one after another, in the order they happened: none takes another's place nor is put out by
//                     a lesser notice; each stands FOCUS.hold s longer (FOCUS.least at least); FOCUS.calm s of nothing new between two;
//                     one that had to wait comes in with a soft chime (`beat`), the event's own sound having played as it happened. A
//                     beat that waited past FOCUS.stale s (a pilot quick through A's menu) stands its own time with no calm before it,
//                     so the line catches up
//   F2 REVEAL         F1, and a panel the chapter gives comes in with the beat that says so, as an event of its own: kept back until
//                     that beat stands (no calm before it), then wiped in (the pilot's cockpit from the middle out, the locator's column
//                     and the shelf from the top down) with four corner marks round it that blink and go, and the screen's power-on
//                     sound (`crtOn`)
//   F3 SLOW BEAT      F2, and the world eases to half its pace for a moment as each beat comes in, the flight behind it a step darker;
//                     play never stops (the keys fly the ship all through)
// The game takes FOCUS_DEFAULT. Nothing here changes what the world does or saves: which notice stands when, what the page draws when,
// and (F3) how many of the world's own steps a frame runs.
import { isOpeningJob } from '../../src/contracts.js';
import { noticeDone } from './notice.js';

export const FOCUS_VARIANTS = Object.freeze({
  F0: Object.freeze({ code: 'F0', name: 'TODAY', queue: false, reveal: false, slow: false }),
  F1: Object.freeze({ code: 'F1', name: 'ONE AT A TIME', queue: true, reveal: false, slow: false }),
  F2: Object.freeze({ code: 'F2', name: 'REVEAL', queue: true, reveal: true, slow: false }),
  F3: Object.freeze({ code: 'F3', name: 'SLOW BEAT', queue: true, reveal: true, slow: true }),
});
// The game's: the one that only orders and holds what is said (nothing new is drawn), the safe one.
export const FOCUS_DEFAULT = 'F1';

// Seconds. `hold` more a beat stands than its notice would, `least` at least; `calm` of nothing new between two beats; a beat that
// waited more than `cue` comes in with the chime, one that waited past `stale` without the hold or the calm. The reveals' wipes; the corner marks' life (`marks`) and their blink (on, off, on);
// the slow beat: the pace it eases to, in `in`, held `hold`, back in `out`; the flight's darkening at its slowest.
export const FOCUS = Object.freeze({
  hold: 1.6, least: 4.4, calm: 1.4, cue: 0.25, stale: 10,
  wipe: Object.freeze({ cockpit: 0.8, column: 0.7, shelf: 0.5 }),
  marks: 1.4, blink: Object.freeze([0.18, 0.32]),
  slow: Object.freeze({ pace: 0.5, in: 0.25, hold: 0.8, out: 0.6, dim: 0.22 }),
});

// `?focus=F2` (the lab; anything else, or the game: the default).
export function readFocusSwitch(params) {
  const asked = String(params?.get?.('focus') ?? '').toUpperCase();
  return FOCUS_VARIANTS[asked] ? asked : FOCUS_DEFAULT;
}

const running = (world) => world?.opening?.status === 'active';
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// `game`: the page's (labs/graphics/main.js; notices.js and sound are read when a function runs). `variant`: a FOCUS_VARIANTS code.
export function createOpeningFocus(game, variant = FOCUS_DEFAULT) {
  const v = FOCUS_VARIANTS[variant] ?? FOCUS_VARIANTS[FOCUS_DEFAULT];
  // `time` the focus's own seconds (a notice's: they run while the game does); `queue` the beats waiting, each { notice, at, reveal };
  // `standing` the beat's notice standing now; `pending` the panels kept back until their beat stands; `revealAt` when each came in;
  // `slowAt` when the last slow beat began; `carry` the fraction of a world step owed by the slow pace.
  const state = { variant: v, time: 0, queue: [], standing: null, calmUntil: 0, pending: new Set(), revealAt: {}, slowAt: null, carry: 0 };

  // Whether a world event is one of the opening's beats, and the panel it gives ({ reveal }), or null. Read as the event is said.
  function beatOf(e, world) {
    if (!running(world)) return null;
    switch (e.type) {
      case 'openingPractice': case 'openingCall': case 'openingNote': return { reveal: null };
      case 'loanerReturned': return { reveal: 'cockpit' };
      // The locator's column comes with the details, the shelf with its fitting at B (src/opening.js interfaceGiven).
      case 'openingFitted': return { reveal: e.what === 'shelf' ? 'shelf' : e.what === 'ruin' ? null : 'column' };
      case 'contractAccepted': return isOpeningJob(e.contractId) ? { reveal: null } : null;
      case 'delivered': return isOpeningJob(e.contractId) && !e.alreadySettled ? { reveal: null } : null;
      case 'findMarked': return world.opening.stage === 'cache' ? { reveal: null } : null;
      case 'cacheOpened': return e.alreadySettled ? null : { reveal: null };
      default: return null;
    }
  }

  // notices.js hands over the notice it built for a beat: kept to stand in its turn (true), or, with no queue (F0), not taken.
  function hold(notice, beat) {
    if (!v.queue || !beat) return false;
    const item = { notice, at: state.time, reveal: v.reveal ? beat.reveal : null };
    // In the order they happened (the story's); a panel it gives waits for it.
    if (item.reveal) state.pending.add(item.reveal);
    state.queue.push(item);
    return true;
  }

  // Each frame the notices age (notices.js age, while the game runs): the beat standing is watched to its end, then the calm, then the
  // next beat stands, once the notice's place is free.
  function step(dt) {
    state.time += Math.max(0, dt);
    if (!v.queue) return;
    const notices = game.notices, now = notices.state.notice;
    const busy = !!now && !noticeDone(now);
    if (state.standing && (!busy || now !== state.standing)) { state.standing = null; state.calmUntil = state.time + FOCUS.calm; }
    if (state.standing || busy || !state.queue.length) return;
    const next = state.queue[0], stale = state.time - next.at > FOCUS.stale;
    if (!next.reveal && !stale && state.time < state.calmUntil) return;
    state.queue.shift();
    const n = next.notice;
    if (!stale) n.life = Math.max(n.life + FOCUS.hold, FOCUS.least);
    n.age = 0;
    n.beat = true;
    notices.stand(n);
    state.standing = n;
    if (next.reveal) {
      state.pending.delete(next.reveal);
      state.revealAt[next.reveal] = state.time;
      game.sound?.play?.('crtOn');
    } else if (state.time - next.at > FOCUS.cue) game.sound?.play?.('beat');
    if (v.slow) state.slowAt = state.time;
  }

  // What the page draws of what the chapter has given (src/opening.js interfaceGiven): a panel whose beat has not stood yet is kept
  // back (F2, F3). `deck`: whether the lower panel is drawn at all (the pilot's cockpit kept back while its beat waits).
  function shown(given) {
    if (!state.pending.size) return { ...given, deck: true };
    return { ...given, deck: !state.pending.has('cockpit'), column: given.column && !state.pending.has('column'),
      map: given.map, shelf: given.shelf && !state.pending.has('shelf') };
  }

  // A panel's wipe, 0..1 eased, while it runs (null before and after); and whether its corner marks show now.
  function wipe(panel) {
    const at = state.revealAt[panel];
    if (at === undefined) return null;
    const t = (state.time - at) / FOCUS.wipe[panel];
    return t >= 1 ? null : ease(t);
  }
  function marks(panel, { reducedMotion = false } = {}) {
    const at = state.revealAt[panel];
    if (at === undefined) return false;
    const t = state.time - at;
    if (t >= FOCUS.marks) return false;
    return reducedMotion || !(t >= FOCUS.blink[0] && t < FOCUS.blink[1]);
  }

  // F3: the world's pace now (1 out of a beat), and how dark the flight is drawn behind the interface.
  function pace() {
    if (state.slowAt === null) return 1;
    const S = FOCUS.slow, t = state.time - state.slowAt;
    const k = t < S.in ? ease(t / S.in) : t < S.in + S.hold ? 1 : 1 - ease((t - S.in - S.hold) / S.out);
    return 1 - (1 - S.pace) * Math.max(0, k);
  }
  const dim = () => (1 - pace()) / (1 - FOCUS.slow.pace) * FOCUS.slow.dim;
  // Of `steps` world steps the frame's clock gives, how many run at the pace now; the fraction is carried to the next frame.
  function steps(n) {
    const p = pace();
    if (p >= 1 && state.carry === 0) return n;
    state.carry += n * p;
    const k = Math.floor(state.carry + 1e-9);
    state.carry -= k;
    if (p >= 1 && state.carry < 1e-6) state.carry = 0;
    return k;
  }

  return { state, variant: v, beatOf, hold, step, shown, wipe, marks, pace, dim, steps };
}
