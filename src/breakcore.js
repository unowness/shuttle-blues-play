import { CONFIG } from './config.js';
import { Music, SCORE, hz } from './music.js';
import { mulberry32 } from './util.js';

// The fight's music: a light, dry breakcore under the game's ambient (SX, 2026-10-16: «под наш эмбиент, в стиле нашего эмбиента,
// какой-то легкий такой сухой брейк-кор»; six rounds on labs/graphics/sketches/breakcore.html, S1 there; «Вносим в игру брейк с
// дирижёром»). The conductor (src/score.js) engages it when a fight begins and releases it when the fight is over; it plays nothing
// by itself.
//
// Its pads are the ambient's own (src/music.js: the same voice and numbers; SX: «пэды ... красивые, всем нравятся»), in another
// key and walk (A minor, Am F C G and their neighbours, where the ambient is D minor), a chord every eight bars; its stars too, in
// this key. Under them a soft sub on the kicks, and the drums: a break played and recorded as a drummer would (every hit its own,
// the snare a little late, the hats leaning, a ride, a small room, two takes of every bar), synthesised once behind the title
// (prepareBreak; nothing is recorded), and every bar plays slices of it: in order, or cut and reordered with the one kept a kick and
// the two and four kept snares, a slice stuttered, a snare rolled, the last beats slowed to a stop, a snare reversed into the
// downbeat. Dry, under a lowpass, under the pads (SX: «громковатые брейки ... чуть-чуть более эмбиентным ... щетки»).
//
// A fight is phrases of eight bars, BREAK and HALF time drawn by chance, never a pause in the drums while it lasts. It comes in on
// ARRIVE, one bar (the groove through an opening filter, a roll, a crash on the next downbeat), on the chord the conductor names;
// it goes on LEAVE (four bars, the drums closing and falling away, a tape stop) and LINGER (four bars of pads on a chord the
// ambient shares), its second bar the ambient's handoff. Scheduled `lookahead` s ahead of the audio clock, as the ambient is.
// Presentation only: it reads nothing of the world.

const F = () => CONFIG.sound.score.fight;
const any = (rng, list) => list[Math.floor(rng() * list.length)];
// A key of `weights` ({ name: weight }) drawn by weight.
function choose(rng, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let r = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) if ((r -= w) < 0) return key;
  return entries[0][0];
}

// The harmony. Chords as MIDI numbers, never below G2 (the ambient's rule); `next` the chords each may go to, the walk Am F C G
// three times as likely as a turn to Em or Dm (Dm the ambient's own key). The stars are the pentatonic's A D E G two octaves up,
// no C: a C over the B of G6 or Em7 is a minor ninth.
export const KEY = Object.freeze({
  chords: Object.freeze([
    Object.freeze({ name: 'Am7', notes: Object.freeze([45, 52, 55, 60]) }),     // A E G C
    Object.freeze({ name: 'Fmaj9', notes: Object.freeze([53, 57, 64, 67]) }),   // F A E G
    Object.freeze({ name: 'Cadd9', notes: Object.freeze([48, 55, 62, 64]) }),   // C G D E
    Object.freeze({ name: 'G6', notes: Object.freeze([43, 50, 59, 64]) }),      // G D B E
    Object.freeze({ name: 'Em7', notes: Object.freeze([52, 55, 59, 62]) }),     // E G B D
    Object.freeze({ name: 'Dm9', notes: Object.freeze([50, 53, 57, 64]) }),     // D F A E
  ]),
  next: Object.freeze([[1, 1, 1, 5], [2, 2, 2, 3], [3, 3, 3, 4], [0, 0, 0, 4], [1, 1, 0, 0], [2, 2, 3]].map(Object.freeze)),
  stars: Object.freeze([81, 86, 88, 91, 93]),
});

// The phrases. `drums` true, 'half', 'arrive' or 'leave'; `sub` whether the sub plays on the kicks.
export const SECTIONS = Object.freeze({
  arrive: { name: 'ARRIVE', drums: 'arrive', sub: false },
  break: { name: 'BREAK', drums: true, sub: true },
  half: { name: 'HALF', drums: 'half', sub: true },
  leave: { name: 'LEAVE', drums: 'leave', sub: true },
  linger: { name: 'LINGER', drums: false, sub: false },
});
// What follows what in a fight.
const NEXT_PHRASE = Object.freeze({ break: { break: 3, half: 1 }, half: { break: 2, half: 0.5 } });

// ------------------------------------------------------------------- the break ---

// The break, a bar an entry, in sixteenths. Rows: k the kick (K, k softer); s the snare (S, s a ghost, f a flam); h the hats (H, h
// softer, x a whisper, O open); r the ride (R on the beat, r between); t the toms (1 high, 2 middle, 3 low). `role`: `main` a groove
// (`weight` how often it is picked), `half` half time, `fill` a phrase's end (`fill` its name). Every bar is played twice into the
// buffer, two takes, each its own.
const BARS = Object.freeze([
  { role: 'main', weight: 3, k: 'K.K.......KK....', s: '..s.S..S.S..S.sS', r: 'R.r.R.r.R.r.R.r.' },   // A: the classic figure on the ride
  { role: 'main', weight: 2, k: 'K.K.......K..k..', s: '....S..S.S.sS.S.', r: 'R.r.R.r.R.r.R.r.' },   // A2: its answer
  { role: 'main', weight: 2, k: 'K..k......K.....', s: '.s..S.s..s..S.s.', h: 'H.hxH.h.H.hxH.O.' },   // B: on the hats, ghosts between
  { role: 'main', weight: 1, k: 'K..k......K.k...', s: '.s..S.s..s..S..S', h: 'H.hxH.h.H.hxH.h.' },   // B2: its answer
  { role: 'main', weight: 1, k: 'K.........K.K..k', s: '....S.sS.s..S..f', h: 'H.h.H.h.H.h.H.h.' },   // C: kicks pushed, a flam
  { role: 'fill', fill: 'toms', k: 'K.K.....K......K', s: '....S..S..s..s..', r: 'R.r.R.r.........', t: '........11.22.33' },
  { role: 'fill', fill: 'drag', k: 'K.K.......K.....', s: '....S..S.S.sSsSS', h: 'H.h.H.h.H.h.....' },
  { role: 'half', k: 'K.........K.....', s: '...s....S....s..', h: 'H.h.H.h.H.h.H.O.' },               // H: the snare on the three
  { role: 'half', k: 'K......k..K.....', s: '.s......S..s..s.', r: 'R.r.R.r.R.r.R.r.' },               // H2: its answer on the ride
]);
const TAKES = 2;
const VEL = Object.freeze({ K: 1, k: 0.7, S: 1, s: 0.3, H: 1, h: 0.55, x: 0.3, O: 0.8, R: 0.8, r: 0.55, 1: 0.85, 2: 0.85, 3: 0.85 });
// The pitched drums in the key: the toms end on G3, D3 and A2; the snare's body is G3 and E4; the kick's tail G1.
const TOMS = Object.freeze([[235, 196], [176, 147], [131, 110]]);
const SNARE = Object.freeze([196, 330]);
const KICK = 49;
// The ride's and the crash's metal: six square waves at a cymbal's inharmonic ratios (the 808's), raised.
const METAL = Object.freeze([205.3, 304.4, 369.6, 522.7, 540, 800]);
// The kit is made once at this rate; a context at another plays the buffer at its own rate, resampled by the browser.
export const BREAK_RATE = 48000;

// Runs a generator of pieces to its end and gives what it returns.
const finish = (steps) => { let r; while (!(r = steps.next()).done); return r.value; };

// The kit, a piece at a time (a generator: it yields between pieces so that the plan behind the title spreads the work over
// frames; a piece is a bar of the break, or a span of the room's and the curve's samples): every bar of both takes in one buffer,
// a snare with a long tail reversed, a crash, the hits of every sixteenth, and the cues (where a slice may start: on a hit).
function* kitSteps(rate = BREAK_RATE) {
  const step = 15 / F().bpm, top = F().top, sat = F().sat;
  const rng = mulberry32(1610);
  const noise = () => rng() * 2 - 1;
  const ms = (x) => Math.round((x * rate) / 1000);
  // A played hit: its level and colour `amount` either way, its place up to `most` ms late (a drummer behind the beat; never early,
  // so a slice that starts on the grid keeps the hit whole).
  const vary = (amount) => 1 + (rng() * 2 - 1) * amount;
  const late = (most) => ms(rng() * most);
  const hp = (fc) => { const rc = 1 / (2 * Math.PI * fc); return rc / (rc + 1 / rate); };
  // A decay e^(-t / tau) as a running factor, one multiplication a sample (Math.exp a sample made a bar with a ride 60 ms).
  const fall = (tau) => Math.exp(-1 / (tau * rate));
  // A hit's last 10 ms faded to nothing: the kick's body was still at 4.7 % when its 0.26 s ran out, a tom's at 11 %, a ride's at
  // 6 %, and the cut was a tick after each (SX, 2026-10-16: «чекни, что звуки без шума накладываются друг на друга»).
  const TAPER = ms(10);
  const taper = (j, m) => (j > m - TAPER ? (m - j) / TAPER : 1);
  const count = BARS.length * TAKES;
  const data = new Float32Array(Math.ceil(rate * (step * 16 * count + 0.3)));

  const kick = (out, at, v, pitch = 1) => {
    const kSweep = fall(0.028), kBody = fall(0.085), kClick = fall(0.0011);
    let phase = 0, sweep = 1, body = 1, click = 1;
    for (let j = 0, m = Math.floor(0.26 * rate); j < m && at + j < out.length; j++) {
      phase += (2 * Math.PI * pitch * (KICK + 118 * sweep)) / rate;
      out[at + j] += v * taper(j, m) * (0.95 * Math.sin(phase) * body + 0.3 * noise() * click);
      sweep *= kSweep; body *= kBody; click *= kClick;
    }
  };
  const snare = (out, at, v, tail = 0.085, tune = 1) => {
    const a = hp(1400), k1 = fall(0.05), k2 = fall(0.028), kTail = fall(tail);
    const w1 = (2 * Math.PI * SNARE[0] * tune) / rate, w2 = (2 * Math.PI * SNARE[1] * tune) / rate;
    let y = 0, prev = 0, e1 = 1, e2 = 1, eTail = 1;
    for (let j = 0, m = Math.floor(tail * 6 * rate); j < m && at + j < out.length; j++) {
      const x = noise();
      y = a * (y + x - prev); prev = x;
      out[at + j] += v * (0.5 * Math.sin(w1 * j) * e1 + 0.28 * Math.sin(w2 * j) * e2 + 0.65 * y * eTail);
      e1 *= k1; e2 *= k2; eTail *= kTail;
    }
  };
  const hat = (out, at, v, open, length = 1) => {
    const decay = (open ? 0.12 : 0.02) * length, a = hp(7000), k = fall(decay);
    let y1 = 0, y2 = 0, p1 = 0, p2 = 0, e = v * 0.32 * top;
    for (let j = 0, m = Math.floor(decay * 6 * rate); j < m && at + j < out.length; j++) {
      const x = noise();
      y1 = a * (y1 + x - p1); p1 = x;
      y2 = a * (y2 + y1 - p2); p2 = y1;
      out[at + j] += y2 * e;
      e *= k;
    }
  };
  // Metal: the squares and a share of noise through two high-passes, a ping and a wash.
  const metal = (out, at, v, { raise, cut, hiss, ping, wash, seconds }) => {
    const a = hp(cut), phases = METAL.map(() => rng()), steps = METAL.map((f) => (f * raise) / rate);
    const kPing = fall(0.012), kWash = fall(wash), n = METAL.length;
    let y1 = 0, y2 = 0, p1 = 0, p2 = 0, ePing = ping, eWash = 1;
    for (let j = 0, m = Math.floor(seconds * rate); j < m && at + j < out.length; j++) {
      let sq = 0;
      for (let q = 0; q < n; q++) {
        let ph = phases[q] + steps[q];
        if (ph >= 1) ph -= 1;
        phases[q] = ph;
        sq += ph < 0.5 ? 1 : -1;
      }
      const x = sq / n + hiss * noise();
      y1 = a * (y1 + x - p1); p1 = x;
      y2 = a * (y2 + y1 - p2); p2 = y1;
      out[at + j] += v * taper(j, m) * y2 * (ePing + eWash);
      ePing *= kPing; eWash *= kWash;
    }
  };
  const ride = (out, at, v) => metal(out, at, v * 0.2 * top, { raise: 1.7, cut: 5000, hiss: 0.4, ping: 0.6, wash: 0.32, seconds: 0.9 });
  const tom = (out, at, v, which) => {
    const [f0, f1] = TOMS[which], kSweep = fall(0.06), kBody = fall(0.16), kHit = fall(0.01);
    let phase = 0, sweep = 1, body = 1, hit = 1;
    for (let j = 0, m = Math.floor(0.35 * rate); j < m && at + j < out.length; j++) {
      phase += (2 * Math.PI * (f1 + (f0 - f1) * sweep)) / rate;
      out[at + j] += v * taper(j, m) * (0.8 * Math.sin(phase) * body + 0.12 * noise() * hit);
      sweep *= kSweep; body *= kBody; hit *= kHit;
    }
  };

  const hits = [];
  for (let index = 0; index < count; index++) {
    const bar = BARS[index % BARS.length];
    for (let i = 0; i < 16; i++) {
      const at = Math.round((index * 16 + i) * step * rate);
      const k = bar.k?.[i], s = bar.s?.[i], h = bar.h?.[i], r = bar.r?.[i], t = bar.t?.[i];
      // Played: the beat strongest, the eighths a little under, the sixteenths under them and leaning late.
      const lilt = i % 4 === 0 ? 1 : i % 2 === 0 ? 0.92 : 0.85;
      const lean = i % 2 ? ms(5) : 0;
      if (h === 'H' || h === 'h' || h === 'x') hat(data, at + lean + late(3), VEL[h] * lilt * vary(0.1), false, vary(0.15));
      else if (h === 'O') hat(data, at + lean + late(3), VEL.O * vary(0.1), true, vary(0.15));
      if (r === 'R' || r === 'r') ride(data, at + late(3), VEL[r] * lilt * vary(0.08));
      if (s === 'S') snare(data, at + late(6), vary(0.06), 0.085 * vary(0.12), vary(0.015));
      else if (s === 's') snare(data, at + late(10), 0.2 + 0.14 * rng(), 0.085 * vary(0.15), vary(0.02));
      else if (s === 'f') { snare(data, at + late(3), 0.35, 0.06); snare(data, at + ms(18) + late(3), vary(0.05)); }
      if (t === '1' || t === '2' || t === '3') tom(data, at + late(5), VEL[t] * vary(0.08), Number(t) - 1);
      if (k === 'K' || k === 'k') kick(data, at + late(2), VEL[k] * vary(0.05), vary(0.03));
      hits.push({ kick: k === 'K' || k === 'k', snare: s === 'S' || s === 'f', ghost: s === 's', tom: t === '1' || t === '2' || t === '3' });
      if (i === 7 || i === 15) yield;
    }
  }
  // The reversed snare, a long tail so it swells; the crash.
  const rev = new Float32Array(Math.ceil(0.5 * rate));
  snare(rev, 0, 1, 0.16);
  const crash = new Float32Array(Math.ceil(2.2 * rate));
  metal(crash, 0, 0.5 * top, { raise: 1.45, cut: 3500, hiss: 0.8, ping: 0.4, wash: 0.75, seconds: 2.2 });
  yield;
  // The room the break was played in, the top a recording takes off and its hiss, a span at a time.
  for (const arr of [data, rev, crash]) yield* room(arr, rate, 0.16);
  const a = 1 - Math.exp((-2 * Math.PI * 9500) / rate), b = 1 - Math.exp((-2 * Math.PI * 6000) / rate);
  let y = 0, z = 0;
  for (let from = 0; from < data.length; from += SPAN) {
    for (let i = from, end = Math.min(data.length, from + SPAN); i < end; i++) {
      z += b * (noise() - z);
      y += a * (data[i] + 0.0025 * z - y);
      data[i] = y;
    }
    yield;
  }
  rev.reverse();
  // A soft curve over the peak: a little weight on the ghosts, nothing that reads as distortion.
  for (const arr of [data, rev, crash]) yield* shape(arr, sat);

  const cues = { kick: [], snare: [], hit: [], half: [] };
  hits.forEach((h, g) => {
    const role = BARS[Math.floor(g / 16) % BARS.length].role;
    const struck = h.kick || h.snare || h.ghost || h.tom;
    if (role === 'half') { if (struck) cues.half.push(g); return; }
    if (role === 'main') { if (h.kick) cues.kick.push(g); if (h.snare) cues.snare.push(g); }
    if (struck) cues.hit.push(g);
  });
  const main = {}, half = [], fills = {};
  BARS.forEach((bar, i) => {
    if (bar.role === 'main') main[i] = bar.weight;
    else if (bar.role === 'half') half.push(i);
    else fills[bar.fill] = i;
  });
  return { rate, data, rev, crash, hits, cues, main, half, fills, step };
}
// Samples a piece of the room's and the curve's work.
const SPAN = 48000;

// A small room put into `arr` in place: four combs and two all-passes (Schroeder's), about a third of a second, its low end left
// dry; `mix` the room's share.
function* room(arr, rate, mix) {
  const combs = [0.0213, 0.0247, 0.0279, 0.0307].map((s) => ({ buf: new Float32Array(Math.round(s * rate)), at: 0, low: 0 }));
  const passes = [0.005, 0.0017].map((s) => ({ buf: new Float32Array(Math.round(s * rate)), at: 0 }));
  const rc = 1 / (2 * Math.PI * 250), a = rc / (rc + 1 / rate);
  let hi = 0, prev = 0;
  for (let from = 0; from < arr.length; from += SPAN) {
    for (let i = from, end = Math.min(arr.length, from + SPAN); i < end; i++) {
      const x = arr[i];
      let y = 0;
      for (const c of combs) {
        const d = c.buf[c.at];
        c.low = d * 0.65 + c.low * 0.35;
        c.buf[c.at] = x + c.low * 0.62;
        c.at = (c.at + 1) % c.buf.length;
        y += d;
      }
      y *= 0.25;
      for (const p of passes) {
        const d = p.buf[p.at], o = -0.6 * y + d;
        p.buf[p.at] = y + 0.6 * o;
        p.at = (p.at + 1) % p.buf.length;
        y = o;
      }
      hi = a * (hi + y - prev); prev = y;
      arr[i] = x + mix * hi;
    }
    yield;
  }
}

function* shape(arr, sat) {
  let peak = 0;
  for (let from = 0; from < arr.length; from += SPAN) {
    for (let i = from, end = Math.min(arr.length, from + SPAN); i < end; i++) { const x = arr[i] < 0 ? -arr[i] : arr[i]; if (x > peak) peak = x; }
    yield;
  }
  const norm = Math.tanh(sat);
  for (let from = 0; from < arr.length; from += SPAN) {
    for (let i = from, end = Math.min(arr.length, from + SPAN); i < end; i++) arr[i] = (0.9 * Math.tanh((sat * arr[i]) / peak)) / norm;
    yield;
  }
}

let kit = null;
// Makes the kit a piece at a time (the plan behind the title calls this a frame at a time; src/audio.js prepareSound): yields
// the share done.
export function* prepareBreak() {
  if (kit) { yield 1; return; }
  const spans = (seconds) => Math.ceil(Math.ceil(BREAK_RATE * seconds) / SPAN);
  const count = BARS.length * TAKES, length = (15 / F().bpm) * 16 * count + 0.3;
  // The pieces kitSteps yields: half a bar each, the rev and the crash, then the room, the recording's top, the curve's peak and
  // the curve over the break (four passes) and the room, the peak and the curve over the rev and the crash (three each).
  const steps = kitSteps(), total = 2 * count + 1 + 4 * spans(length) + 3 * spans(0.5) + 3 * spans(2.2);
  let pieces = 0, r;
  while (!(r = steps.next()).done) yield Math.min(0.99, ++pieces / total);
  kit = r.value;
  yield 1;
}
// The kit, made now if it was not prepared.
export function breakKit() {
  if (!kit) finish(prepareBreak());
  return kit;
}

// ------------------------------------------------------------------- the piece ---

export class Breakcore {
  // `ctx` the AudioContext, `out` the node it goes to (the music bus), `room` the conductor's reverb to send the wet share to,
  // `rng` a random source (seeded in checks).
  constructor(ctx, out, { room = null, rng = Math.random } = {}) {
    const f = F();
    this.ctx = ctx;
    this.rng = rng;
    this.bar = 240 / f.bpm;
    this.step = this.bar / 16;
    this.lookahead = f.lookahead;
    this.own = 0;                   // its own sources sounding (the pads' are counted by the pads)

    this.kit = breakKit();
    const buffer = (data) => { const b = ctx.createBuffer(1, data.length, BREAK_RATE); b.getChannelData(0).set(data); return b; };
    this.buffer = buffer(this.kit.data);
    this.rev = buffer(this.kit.rev);
    this.crash = buffer(this.kit.crash);
    this.revSteps = this.kit.rev.length / BREAK_RATE / this.step;

    // The piece's level (`master`), dry to `out`, wet to the room.
    this.mix = ctx.createGain();
    this.mix.gain.value = f.master;
    this.mix.connect(out);
    this.toRoom = ctx.createGain();
    this.toRoom.gain.value = f.master;
    if (room) this.toRoom.connect(room);
    // The pads and the stars: the ambient's voice (a Music of its own whose chords this lays).
    this.pads = new Music(ctx, this.mix, { rng, room: room ? this.toRoom : null, stars: KEY.stars });
    // The sub, under its lowpass.
    this.sub = ctx.createBiquadFilter();
    this.sub.type = 'lowpass';
    this.sub.frequency.value = f.subTop;
    this.sub.Q.value = f.subQ;
    this.sub.connect(this.mix);
    // The drums: a high-pass under the kick, the lowpass ARRIVE opens and LEAVE closes, their level; dry and a share to the room.
    this.drums = ctx.createBiquadFilter();
    this.drums.type = 'highpass';
    this.drums.frequency.value = 32;
    this.drumTone = ctx.createBiquadFilter();
    this.drumTone.type = 'lowpass';
    this.drumTone.frequency.value = f.tone.open;
    this.drumTone.Q.value = 0.5;
    this.drumLevel = ctx.createGain();
    this.drumLevel.gain.value = f.drums;
    this.drums.connect(this.drumTone); this.drumTone.connect(this.drumLevel); this.drumLevel.connect(this.mix);
    if (room) {
      const wet = ctx.createGain();
      wet.gain.value = f.wet;
      this.drumLevel.connect(wet); wet.connect(this.toRoom);
    }

    // Where it stands.
    this.mode = 'idle';             // idle, fight, outro (LEAVE and LINGER)
    this.nextBar = null;
    this.nextStar = null;
    this.queue = [];                // phrases asked for ({ section, length }), played before any drawn by chance
    this.section = 'linger';
    this.upcoming = 'break';
    this.phraseBar = 0;
    this.phraseLength = 8;
    this.chord = 0;
    this.chordsPlayed = 0;
    this.sinceChord = f.chordBars;  // bars since the last chord: the first bar lays one
    this.forceChord = null;         // the chord the next bar must lay
    this.subRoot = 45;
    this.crashNext = 0;             // a fill has just been played: the next bar opens on a crash this loud
    this.handoff = null;            // when and on which of the ambient's chords it takes over ({ at, chord }), set by LINGER
  }

  between([a, b]) { return a + (b - a) * this.rng(); }

  // Notes and slices sounding now, the pads' included (the checks').
  get playing() { return this.own + this.pads.playing; }

  // A fight. From silence: an ARRIVE bar at once, on `chord` (an index of KEY.chords), then BREAK. On the way out (LEAVE, LINGER):
  // ARRIVE at the next bar not yet scheduled, then BREAK. In a fight already: nothing.
  engage(now, chord = null) {
    if (this.mode === 'fight') return;
    if (this.mode === 'idle') {
      this.nextBar = now + 0.05;
      this.nextStar = null;
      this.forceChord = chord ?? this.chord;
    }
    this.mode = 'fight';
    this.handoff = null;
    this.queue = [{ section: 'arrive', length: 1 }, { section: 'break', length: 8 }];
    this.phraseBar = 0;
  }

  // The fight is over: from the next bar not yet scheduled, LEAVE and LINGER; then idle.
  release() {
    if (this.mode !== 'fight') return;
    this.mode = 'outro';
    this.queue = [{ section: 'leave', length: 4 }, { section: 'linger', length: 4 }];
    this.phraseBar = 0;
  }

  update(now) {
    if (this.mode === 'idle') return;
    const S = CONFIG.sound.music.stars;
    if (this.nextBar === null || this.nextBar < now - 1) this.nextBar = now + 0.15;
    if (this.nextStar === null || this.nextStar < now - 1) this.nextStar = now + this.between(S.first);
    while (this.nextBar < now + this.lookahead) {
      this.playBar(this.nextBar);
      if (this.mode === 'idle') { this.nextBar = null; this.nextStar = null; return; }
      this.nextBar += this.bar;
    }
    while (this.nextStar < now + this.lookahead) { this.pads.playStar(this.nextStar); this.nextStar += this.between(S.every); }
  }

  playBar(t0) {
    if (this.phraseBar === 0) this.startPhrase(t0);
    if (this.forceChord !== null || this.sinceChord >= F().chordBars) this.playChord(t0);
    this.sinceChord += 1;
    this.shapeDrums(t0);
    const sec = SECTIONS[this.section];
    const last = this.phraseBar === this.phraseLength - 1;
    if (sec.drums) this.drumBar(t0, sec, last);
    this.phraseBar = (this.phraseBar + 1) % this.phraseLength;
    if (this.section === 'linger' && last) this.mode = 'idle';
  }

  startPhrase(t0) {
    const asked = this.queue.shift();
    if (asked) { this.section = asked.section; this.phraseLength = asked.length; } else { this.section = this.upcoming; this.phraseLength = 8; }
    this.upcoming = this.queue[0]?.section ?? (this.section === 'linger' ? 'linger' : choose(this.rng, NEXT_PHRASE[this.section] || { break: 1 }));
    if (this.section === 'linger') {
      // The way out ends on the chord, of this one and those it may go to, that the ambient's chords meet best; the ambient comes
      // back on its partner two bars before the end, its slow swell under these pads' release.
      const options = [this.chord, ...KEY.next[this.chord]];
      const end = options.reduce((best, c) => (PIVOT_OUT[c].score > PIVOT_OUT[best].score ? c : best), options[0]);
      this.forceChord = end;
      this.handoff = { at: t0 + (this.phraseLength - 2) * this.bar, chord: PIVOT_OUT[end].chord };
    }
  }

  // The drums' filter and level over this bar: a ramp a bar, so that a phrase cut short (a fight back on the way out) leaves nothing
  // scheduled behind it. ARRIVE opens the filter over its bar, LEAVE closes it and lets the level fall.
  shapeDrums(t0) {
    const f = F(), freq = this.drumTone.frequency, g = this.drumLevel.gain, end = t0 + this.bar;
    const a = this.phraseBar / this.phraseLength, b = (this.phraseBar + 1) / this.phraseLength;
    const sweep = (from, to) => {
      freq.setValueAtTime(from * (to / from) ** a, t0);
      freq.exponentialRampToValueAtTime(from * (to / from) ** b, end);
    };
    if (this.section === 'arrive') sweep(f.tone.arrive, f.tone.open);
    else if (this.section === 'leave') sweep(f.tone.open, f.tone.closed);
    else freq.setValueAtTime(f.tone.open, t0);
    if (this.section === 'leave') {
      g.setValueAtTime(f.drums * (1 - (1 - f.leaveLevel) * a), t0);
      g.linearRampToValueAtTime(f.drums * (1 - (1 - f.leaveLevel) * b), end);
    } else g.setValueAtTime(f.drums, t0);
  }

  // ------------------------------------------------------------------ harmony ---

  // A chord: the ambient's pads, each note held to the next chord and released over it.
  playChord(t0) {
    const M = CONFIG.sound.music;
    if (this.forceChord !== null) { this.chord = this.forceChord; this.forceChord = null; }
    else if (this.chordsPlayed > 0) this.chord = any(this.rng, KEY.next[this.chord]);
    this.chordsPlayed += 1;
    this.sinceChord = 0;
    const notes = KEY.chords[this.chord].notes;
    let root = notes[0];
    while (root > 44) root -= 12;
    this.subRoot = root;
    const span = F().chordBars * this.bar;
    const attack = this.between(M.attack), release = this.between(M.release);
    notes.forEach((note, i) => {
      const delay = i * this.between(M.stagger);
      const pan = (i / (notes.length - 1) - 0.5) * M.spread * (this.rng() < 0.5 ? -1 : 1);
      this.pads.voice(hz(note), t0 + delay, attack, Math.max(0.3, span - delay - attack), release, pan);
    });
  }

  // -------------------------------------------------------------------- drums ---

  // A bar of the break: its slices as events, in sixteenths: `at` where it starts in the bar, `src` where in the break, `len` how
  // much of the break, `rate` its playback rate (and `to` a rate it slows to), `gain`, `rev` the reversed snare.
  drumBar(t0, sec, last) {
    const f = F(), rng = this.rng;
    const half = sec.drums === 'half';
    const into = SECTIONS[this.upcoming].drums;
    // After a fill the bar opens on a crash.
    if (this.crashNext && sec.drums !== 'leave') this.crashAt(t0, this.crashNext);
    this.crashNext = 0;
    let events;
    if (sec.drums === 'arrive') {
      // A fight comes in: the groove through the opening filter, a roll over the last beat, a crash on the downbeat after.
      events = this.cut(this.straight(this.take(this.pickBar())), 12);
      const snare = any(rng, this.kit.cues.snare), n = 8;
      for (let k = 0; k < n; k++) events.push({ at: 12 + k / 2, src: snare, len: 0.5, gain: 0.35 + (0.65 * k) / (n - 1) });
      this.crashNext = f.arriveCrash;
      this.playEvents(t0, events, false);
      return;
    }
    if (sec.drums === 'leave') {
      // On the way out the drummer plays the groove plainly, and stops the tape at the end.
      events = this.straight(this.take(this.pickBar()));
      this.playEvents(t0, last ? this.fill(events, 'out') : events, sec.sub);
      return;
    }
    if (rng() < (half ? f.shuffle * 0.4 : f.shuffle)) events = this.shuffled(half);
    else events = this.straight(this.take(half ? any(rng, this.kit.half) : this.pickBar()));
    if (last) events = into ? (rng() < f.fill8 ? this.fill(events, 'end') : events) : this.fill(events, 'out');
    else if (this.phraseBar % 4 === 3 && rng() < f.fill4) events = this.fill(events, 'small');
    this.playEvents(t0, events, sec.sub);
  }

  pickBar() { return Number(choose(this.rng, this.kit.main)); }

  // A bar's place in the buffer: one of its takes.
  take(bar) { return bar + BARS.length * Math.floor(this.rng() * TAKES); }

  straight(index) { return [{ at: 0, src: index * 16, len: 16 }]; }

  shuffled(half) {
    const f = F(), rng = this.rng, cues = this.kit.cues, out = [];
    // A slice is kept inside the bar it starts in.
    const inBar = (src, len) => { const start = Math.floor(src / 16) * 16; return Math.max(start, Math.min(src, start + 16 - len)); };
    let pos = 0;
    while (pos < 16) {
      let len = Number(choose(rng, f.cut));
      if (len === 4 && pos % 4 !== 0) len = 2;
      len = Math.min(len, 16 - pos);
      let src;
      if (pos === 0) src = this.take(half ? any(rng, this.kit.half) : this.pickBar()) * 16;   // the one stays a kick
      else if (!half && (pos === 4 || pos === 12)) src = any(rng, cues.snare);                // the two and four stay snares
      else src = any(rng, half ? cues.half : cues.hit);
      if (pos > 0 && rng() < f.stutter) {
        const size = len >= 2 && rng() < 0.5 ? 1 : 0.5;
        const n = Math.round(len / size);
        src = inBar(src, size);
        for (let k = 0; k < n; k++) out.push({ at: pos + k * size, src, len: size, gain: 0.6 + (0.4 * k) / Math.max(1, n - 1) });
      } else out.push({ at: pos, src: inBar(src, len), len });
      pos += len;
    }
    return out;
  }

  // The events before sixteenth `from`, the one that crosses it shortened.
  cut(events, from) {
    const kept = [];
    for (const e of events) {
      if (e.at >= from) continue;
      const rate = e.rate || 1;
      kept.push(e.at + e.len / rate > from ? { ...e, len: (from - e.at) * rate } : e);
    }
    return kept;
  }

  // The end of a phrase (`end`), a small fill in its fourth bar (`small`), or the drums leaving (`out`).
  fill(events, mode) {
    const f = F(), rng = this.rng;
    const type = mode === 'out' ? choose(rng, { stop: 2, gap: 1 }) : mode === 'small' ? choose(rng, { stutter: 2, roll: 1 }) : choose(rng, f.fills);
    const snare = any(rng, this.kit.cues.snare);
    if (type === 'roll') {
      const from = mode === 'small' ? 12 : any(rng, [8, 12, 12]);
      const kept = this.cut(events, from), d = f.roll, n = (16 - from) * d;
      for (let k = 0; k < n; k++) {
        const share = k / Math.max(1, n - 1), rate = 1 + (f.rollPitch - 1) * share;
        kept.push({ at: from + k / d, src: snare, len: rate / d, rate, gain: 0.4 + 0.6 * share });
      }
      return kept;
    }
    if (type === 'stutter') {
      const kept = this.cut(events, 12), src = any(rng, this.kit.cues.hit);
      for (let k = 0; k < 2; k++) kept.push({ at: 12 + k, src, len: 1 });
      for (let k = 0; k < 4; k++) kept.push({ at: 14 + k * 0.5, src, len: 0.5, gain: 0.7 + 0.1 * k });
      return kept;
    }
    if (type === 'stop') {
      const from = any(rng, [8, 12]);
      const kept = this.cut(events, from);
      kept.push({ at: from, src: this.take(this.pickBar()) * 16 + from, len: 16 - from, out: 16 - from, to: 0.22 });
      return kept;
    }
    if (type === 'reverse') {
      const kept = this.cut(events, Math.floor(16 - this.revSteps));
      kept.push({ at: 16 - this.revSteps, rev: true, len: this.revSteps });
      return kept;
    }
    return this.cut(events, 8);                                                  // gap: the last two beats rest
  }

  playEvents(t0, events, withSub) {
    const step = this.step;
    let lastSub = -Infinity;
    for (const e of events) {
      const rate = e.rate || 1;
      const at = t0 + e.at * step, end = at + (e.out ?? e.len / rate) * step;
      this.slice(e, at, end);
      if (!withSub || e.rev || e.to || rate !== 1 || e.len < 1) continue;
      // The kicks in the slice: the sub sounds, at most every other sixteenth.
      for (let s = Math.ceil(e.src); s < e.src + e.len; s++) {
        if (!this.kit.hits[s]?.kick) continue;
        const kt = at + (s - e.src) * step;
        if (kt - lastSub >= 2 * step - 1e-6) { this.subAt(kt); lastSub = kt; }
      }
    }
  }

  // A slice's level wanders a little: the same slice is never twice the same.
  level(gain = 1) {
    return gain * (1 + (this.rng() - 0.5) * F().jitter);
  }

  slice(e, at, end) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = e.rev ? this.rev : this.buffer;
    src.playbackRate.setValueAtTime(e.rate || 1, at);
    if (e.to) src.playbackRate.exponentialRampToValueAtTime(e.to, end);
    const g = ctx.createGain(), v = this.level(e.gain ?? 1);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v, at + 0.0015);
    g.gain.setValueAtTime(v, Math.max(at + 0.002, end - 0.004));
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(g); g.connect(this.drums);
    src.start(at, e.rev ? 0 : e.src * this.kit.step);
    src.stop(end + 0.005);
    this.hold(src, [src, g]);
  }

  crashAt(t, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.crash;
    const g = this.ctx.createGain();
    g.gain.value = this.level(gain);
    src.connect(g); g.connect(this.drums);
    src.start(t);
    src.stop(t + this.kit.crash.length / BREAK_RATE + 0.01);
    this.hold(src, [src, g]);
  }

  subAt(t) {
    const ctx = this.ctx, f = hz(this.subRoot), peak = F().sub;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.004);
    env.gain.setTargetAtTime(0, t + 0.02, 0.08);
    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.value = f;
    const up = ctx.createOscillator();
    up.type = 'sine';
    up.frequency.value = f * 2;
    const upGain = ctx.createGain();
    upGain.gain.value = 0.3;
    low.connect(env); up.connect(upGain); upGain.connect(env); env.connect(this.sub);
    low.start(t); up.start(t);
    low.stop(t + 0.6); up.stop(t + 0.6);
    this.hold(low, [low, up, upGain, env]);
  }

  // Everything a slice or a note made is let go when its source ends.
  hold(source, nodes) {
    this.own += 1;
    source.onended = () => {
      for (const n of nodes) n.disconnect();
      this.own -= 1;
    };
  }
}

// ------------------------------------------------------------- the two pieces ---

// The ambient's chords (SCORE.chords), named after their comments in src/music.js.
export const AMBIENT_NAMES = Object.freeze(['Dm7', 'Bbmaj7', 'Fadd9', 'C6/9', 'Gm9']);

// How well chord `b` takes over from chord `a` while both sound (a crossfade): the pitch classes they share, less two for every
// semitone their sounding together makes that neither makes alone, and a half more when their roots are the same (the fewest
// voices move).
export function pivotScore(a, b) {
  const A = new Set(a.map((n) => n % 12)), B = new Set(b.map((n) => n % 12)), U = new Set([...A, ...B]);
  const semis = (S) => new Set([...S].filter((p) => S.has((p + 1) % 12)));
  const own = new Set([...semis(A), ...semis(B)]);
  const fresh = [...semis(U)].filter((p) => !own.has(p)).length;
  return [...A].filter((p) => B.has(p)).length - 2 * fresh + (a[0] % 12 === b[0] % 12 ? 0.5 : 0);
}
const bestOf = (from, chords) => chords.reduce((best, c, i) => {
  const score = pivotScore(from, c);
  return score > best.score ? { chord: i, score } : best;
}, { chord: 0, score: -Infinity });
// The fight's first chord after each of the ambient's, and the ambient's first after each of the fight's (with how well).
export const PIVOT_IN = Object.freeze(SCORE.chords.map((a) => bestOf(a, KEY.chords.map((c) => c.notes)).chord));
export const PIVOT_OUT = Object.freeze(KEY.chords.map((c) => Object.freeze(bestOf(c.notes, SCORE.chords))));
