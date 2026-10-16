import { CONFIG } from './config.js';
import { mulberry32 } from './util.js';

// A quiet generative score of space (SX, 2026-09-30: «Убери шум движка ...
// попробуй сделать фоновую тихую эмбиент мелодию космоса»). The research behind
// it is Obsidian note 15, "Web audio and ambient music".
//
// Slow chords from one mode (D minor pentatonic and its neighbours), each note
// a pair of slightly detuned voices under a lowpass that opens as the note
// swells and closes as it fades. Chords overlap, so there is never a gap and
// never a hard edge; now and then a single high note sounds, like a star. All
// of it goes through a long reverb made from decaying noise, most of the stars
// wet, the chords half and half. Now and then it rests, and the room is quiet
// for a while before the next chord. Nothing loops: which chord comes next, how
// long each lasts and where the stars fall are drawn at random inside fixed
// bounds, so the score never repeats and never surprises (after Eno's tape
// loops of unequal lengths and generative.fm's random walks).
//
// It is scheduled from the frame (Sound.update) a couple of seconds ahead of
// the audio clock, so a slow frame never delays a note (Chris Wilson's "A Tale
// of Two Clocks"). Presentation only; it reads nothing of the world.
//
// Since 2026-10-16 it is one of two pieces under the conductor (src/score.js): in a fight the breakcore (src/breakcore.js)
// plays and this is paused (`pause`, what sounds rings out), and it comes back on a chord the conductor names (`resume`). The
// breakcore's pads are this score's own voice: it keeps a Music of its own and lays its chords with `voice`. Both send their
// wet share to one room (`room`) the conductor makes, under a soft lowpass.

export const hz = (note) => 440 * 2 ** ((note - 69) / 12);

// The notes, as MIDI numbers. Every chord keeps to D F G A C with one colour
// tone (E, Bb), voiced in the middle register, never below G2: long tones low
// down fatigue over a long session and fight the explosions for room.
export const SCORE = Object.freeze({
  chords: Object.freeze([
    Object.freeze([50, 57, 60, 65]),   // D A C F: D minor seventh
    Object.freeze([46, 53, 57, 62]),   // Bb F A D: B flat major seventh
    Object.freeze([53, 60, 64, 67]),   // F C E G: F major, ninth on top
    Object.freeze([48, 55, 62, 69]),   // C G D A: C with sixth and ninth
    Object.freeze([55, 62, 65, 69]),   // G D F A: G minor ninth
  ]),
  // The stars: the pentatonic two octaves up.
  stars: Object.freeze([74, 77, 79, 81, 84, 86, 89]),
});

// Which chords a chord may go to: its neighbours by shared notes, never itself.
const NEXT = [[1, 2, 4], [0, 2, 3], [0, 3, 4], [1, 2, 4], [0, 2, 3]];

export class Music {
  // `ctx` the AudioContext, `out` the node the score goes to (the music bus),
  // `rng` a random source (seeded in checks), `reverb` the impulse's samples at
  // the context's rate, [left, right] (reverbFor(ctx.sampleRate) when not given);
  // `room` a reverb made elsewhere to send the wet share to (the conductor's, shared with the breakcore), instead of one of its
  // own; `stars` the notes its stars are drawn from (SCORE.stars by default; the breakcore's are in its key).
  constructor(ctx, out, { rng = Math.random, reverb = null, room = null, stars = SCORE.stars } = {}) {
    this.ctx = ctx;
    this.rng = rng;
    this.stars = stars;
    this.chord = Math.floor(rng() * SCORE.chords.length);
    this.nextChord = null;
    this.nextStar = null;
    this.playing = 0;               // notes sounding now, for the checks
    this.stilled = false;           // the conductor's: nothing new is scheduled while it is (not `paused`: that word is the world's)
    this.forced = null;             // the chord the next one must be (the conductor's), an index of SCORE.chords
    this.after = null;              // when the chord after a forced one comes, with no rest between
    const M = CONFIG.sound.music;
    this.dry = ctx.createGain();
    this.dry.gain.value = 1;
    this.dry.connect(out);
    // The reverb: a stereo impulse of noise decaying over `seconds`. Its samples
    // are made before the context exists (prepareReverb, behind the title) and only
    // wrapped here; what was not prepared for this rate is made now.
    // No convolver (an old browser, the checks' stand-in) means dry only.
    this.wet = null;
    if (room) {
      this.wet = ctx.createGain();
      this.wet.gain.value = 1;
      this.wet.connect(room);
    } else if (ctx.createConvolver) {
      const verb = ctx.createConvolver();
      verb.buffer = impulse(ctx, reverb || reverbFor(ctx.sampleRate));
      this.wet = ctx.createGain();
      this.wet.gain.value = 1;
      this.wet.connect(verb);
      verb.connect(out);
      this.verb = verb;
    }
  }

  between([a, b]) { return a + (b - a) * this.rng(); }

  // Nothing new from now: what sounds rings out (a fight has begun: src/score.js).
  pause() { this.stilled = true; }

  // Again from `at`, on `chord` (an index of SCORE.chords) with its own swell, and the chord after it with no rest between (a rest
  // drawn there was 6-16 s of silence just after the fight's pads had gone).
  resume(at, chord) {
    this.stilled = false;
    this.forced = chord;
    this.nextChord = at;
    this.nextStar = at + this.between(CONFIG.sound.music.stars.first);
  }

  // One frame: whatever falls within the look-ahead is scheduled now. A context
  // that slept (a hidden page) does not replay what it missed.
  update(now) {
    if (this.stilled) return;
    const M = CONFIG.sound.music;
    if (this.nextChord === null || this.nextChord < now - 1) this.nextChord = now + 0.3;
    if (this.nextStar === null || this.nextStar < now - 1) this.nextStar = now + this.between(M.stars.first);
    while (this.nextChord < now + M.lookahead) {
      const long = this.playChord(this.nextChord);
      // Now and then the score rests: the chord is left to fade out whole and
      // the next one waits, so the music breathes and is never wallpaper
      // (Outer Wilds; generative.fm's Eno Machine leaves room between notes).
      this.nextChord += this.rng() < M.rest.chance
        ? long + this.between(M.rest.length)
        : Math.min(long - 2, this.between(M.chordEvery));
      if (this.after !== null) { this.nextChord = this.after; this.after = null; }
    }
    while (this.nextStar < now + M.lookahead) {
      this.playStar(this.nextStar);
      this.nextStar += this.between(M.stars.every);
    }
  }

  // The next chord, its notes entering a little apart (the forced one, if the conductor named it). Returns how long it lasts.
  playChord(t0) {
    const M = CONFIG.sound.music;
    const forced = this.forced !== null;
    if (forced) { this.chord = this.forced; this.forced = null; } else {
      const options = NEXT[this.chord];
      this.chord = options[Math.floor(this.rng() * options.length)];
    }
    const notes = SCORE.chords[this.chord];
    const attack = this.between(M.attack), hold = this.between(M.hold), release = this.between(M.release);
    let longest = 0;
    notes.forEach((note, i) => {
      const at = t0 + i * this.between(M.stagger);
      // Spread across the field, low notes near the middle.
      const pan = (i / (notes.length - 1) - 0.5) * M.spread * (this.rng() < 0.5 ? -1 : 1);
      this.voice(hz(note), at, attack, hold, release, pan);
      longest = Math.max(longest, at - t0 + attack + hold + release);
    });
    if (forced) this.after = t0 + Math.min(longest - 2, this.between(M.chordEvery));
    return longest;
  }

  // One note of a chord: two voices a few cents apart (their slow beating is
  // the shimmer), a lowpass that opens with the swell, a pan, a send to both.
  voice(f, t0, attack, hold, release, pan) {
    const ctx = this.ctx, M = CONFIG.sound.music;
    const end = t0 + attack + hold + release;
    const nodes = [];
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.4;
    filter.frequency.setValueAtTime(M.cutoff[0], t0);
    filter.frequency.linearRampToValueAtTime(M.cutoff[1], t0 + attack);
    filter.frequency.setValueAtTime(M.cutoff[1], t0 + attack + hold);
    filter.frequency.linearRampToValueAtTime(M.cutoff[0], end);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(M.pad, t0 + attack);
    env.gain.setValueAtTime(M.pad, t0 + attack + hold);
    env.gain.linearRampToValueAtTime(0, end);
    filter.connect(env);
    const panner = this.pan(pan);
    env.connect(panner);
    this.send(panner, M.reverb.chords);
    nodes.push(filter, env, panner);
    const oscs = [['triangle', -M.detune], ['sine', M.detune]].map(([type, cents]) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * 2 ** (cents / 1200);
      osc.connect(filter);
      osc.start(t0);
      osc.stop(end + 0.05);
      nodes.push(osc);
      return osc;
    });
    this.hold(oscs[0], nodes);
  }

  // A star: one high note, struck softly and left to ring into the reverb.
  playStar(t0) {
    const ctx = this.ctx, M = CONFIG.sound.music, S = M.stars;
    const note = this.stars[Math.floor(this.rng() * this.stars.length)];
    const decay = this.between(S.decay);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz(note);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(S.gain, t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02 + decay);
    osc.connect(env);
    const panner = this.pan((this.rng() * 2 - 1) * S.spread);
    env.connect(panner);
    this.send(panner, M.reverb.stars);
    osc.start(t0);
    osc.stop(t0 + 0.05 + decay);
    this.hold(osc, [osc, env, panner]);
  }

  pan(value) {
    const ctx = this.ctx;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = Math.max(-1, Math.min(1, value));
    return p;
  }

  // Dry and wet shares of one source: [dry, wet] gains.
  send(node, [dry, wet]) {
    const ctx = this.ctx;
    const d = ctx.createGain();
    d.gain.value = dry;
    node.connect(d);
    d.connect(this.dry);
    node._sends = [d];
    if (this.wet) {
      const w = ctx.createGain();
      w.gain.value = wet;
      node.connect(w);
      w.connect(this.wet);
      node._sends.push(w);
    }
  }

  // Everything a note made is let go when its source ends.
  hold(source, nodes) {
    this.playing += 1;
    source.onended = () => {
      for (const n of nodes) { for (const s of n._sends || []) s.disconnect(); n.disconnect(); }
      this.playing -= 1;
    };
  }
}

// ------------------------------------------------------------------ reverb ---

// A reverb's impulse is stereo noise under an exponential decay that falls by 60
// dB in `decay` seconds (e^(-6.9 t / decay)), each channel its own noise so the
// tail is wide. It used to be fresh noise every session, and a convolution with
// noise is a random filter: each pitch of the score came out of the reverb at its
// own level, 9.5 to 16.6 dB apart from the quietest pitch to the loudest, and a
// different set of them each time the game was opened (measured 2026-09-30, 19
// pitches, ten sessions). Now the noise is seeded, so the room is the same every
// session, and the seed is the one of the first 4000 whose room answers the
// score's pitches most evenly (tools/reverb-seed.mjs does the choosing and
// prints the table; checks/audio.mjs holds the result). Choose again whenever the
// score's pitches, the impulse's length or its decay change.
export const REVERB_SEED = 2478;
// The rate the impulse is made at; a lower rate is this one resampled, which keeps
// the room (its decay in seconds, its response at the score's pitches).
export const REVERB_RATE = 48000;
// The rates a device is likely to run at, made ahead of the context.
const REVERB_RATES = Object.freeze([48000, 44100]);

// Runs a generator of pieces to its end and gives what it returns.
const finish = (steps) => { let r; while (!(r = steps.next()).done); return r.value; };

// The impulse's samples, [left, right], and no context needed, a channel at a time
// (a generator: it yields between them so that the plan behind the title can spread
// the work over frames). The decay is a running factor, one multiplication a sample
// (Math.exp a sample cost 20 ms on an M1: 308 thousand calls on the key that starts
// the flight).
function* impulseSteps(seconds, decay, rate, seed) {
  const length = Math.max(1, Math.floor(rate * seconds));
  const fall = Math.exp(-6.9 / (decay * rate));
  const rng = mulberry32(seed);
  const out = [];
  for (let c = 0; c < 2; c++) {
    const data = new Float32Array(length);
    let level = 1;
    for (let i = 0; i < length; i++) { data[i] = (rng() * 2 - 1) * level; level *= fall; }
    out.push(data);
    yield;
  }
  return out;
}

export function impulseData(seconds, decay, { rate = REVERB_RATE, seed = REVERB_SEED } = {}) {
  return finish(impulseSteps(seconds, decay, rate, seed));
}

// `data` taken from one rate to another: a windowed-sinc resampler (8 zero crossings
// either side, Blackman), low-passed at 0.97 of the lower Nyquist when going down, so
// the same waveform over the same seconds and as white as noise at that rate can be.
// Linear interpolation was tried first and left the response alone but made the noise
// 1.8 dB quieter overall, and a convolver normalises its impulse by RMS: the room came
// out 1.7 dB louder at 44.1 kHz than at 48 (measured in Chrome, 2026-09-30).
export function resample(data, from, to) {
  if (from === to) return data;
  const length = Math.max(1, Math.round((data.length * to) / from));
  const step = from / to;
  const cut = Math.min(1, 0.97 / step);
  const half = Math.ceil(8 / cut), taps = 2 * half, phases = 256;
  const table = new Float32Array(phases * taps);
  for (let p = 0; p < phases; p++) {
    let sum = 0;
    for (let j = 0; j < taps; j++) {
      const x = j - half + 1 - p / phases;          // the source sample's distance from the output's place
      const window = 0.42 + 0.5 * Math.cos((Math.PI * x) / half) + 0.08 * Math.cos((2 * Math.PI * x) / half);
      const v = (x === 0 ? cut : Math.sin(Math.PI * cut * x) / (Math.PI * x)) * window;
      table[p * taps + j] = v;
      sum += v;
    }
    for (let j = 0; j < taps; j++) table[p * taps + j] /= sum;     // unit gain at zero frequency in every phase
  }
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const at = i * step;
    let k = Math.floor(at), p = Math.round((at - k) * phases);
    if (p === phases) { p = 0; k++; }
    const base = k - half + 1, row = p * taps;
    let acc = 0;
    if (base >= 0 && base + taps <= data.length) for (let j = 0; j < taps; j++) acc += data[base + j] * table[row + j];
    else for (let j = 0; j < taps; j++) { const n = base + j; if (n >= 0 && n < data.length) acc += data[n] * table[row + j]; }
    out[i] = acc;
  }
  return out;
}

// What has been made, by rate, so that the context only has to wrap it.
const reverbs = new Map();

export function reverbReady(rate) {
  return reverbs.has(`${rate}`);
}

// The impulse at `rate`, a piece at a time: from the store, or made (and kept).
// Down from the reference rate is resampled, which keeps the chosen room. A rate above
// it (a 96 kHz interface) is made at that rate from the same seed instead: resampling
// up would leave the top half of the band empty, which the convolver's RMS
// normalisation turns into a room 3 dB louder. That room is steady but not the evened
// one.
function* reverbSteps(rate) {
  const { seconds, decay } = CONFIG.sound.music.reverb;
  const key = `${rate}`;
  const kept = reverbs.get(key);
  if (kept && kept.seconds === seconds && kept.decay === decay) return kept.data;
  let data;
  if (rate >= REVERB_RATE) data = yield* impulseSteps(seconds, decay, rate, REVERB_SEED);
  else {
    const reference = yield* reverbSteps(REVERB_RATE);
    data = [];
    for (const channel of reference) { data.push(resample(channel, REVERB_RATE, rate)); yield; }
  }
  reverbs.set(key, { seconds, decay, data });
  return data;
}

// The impulse at `rate`, from the store or made now (and kept).
export function reverbFor(rate) {
  return finish(reverbSteps(rate));
}

// Makes the impulse for every likely rate, a channel at a time (yields the share
// done): the plan behind the title calls this a frame at a time.
export function* prepareReverb(rates = REVERB_RATES) {
  let pieces = 0;
  for (const rate of rates) {
    for (const _ of reverbSteps(rate)) yield Math.min(0.99, ++pieces / (2 * rates.length));
  }
  yield 1;
}

// The data wrapped as a buffer of `ctx`.
function impulse(ctx, data) {
  const buffer = ctx.createBuffer(2, data[0].length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) buffer.getChannelData(c).set(data[c]);
  return buffer;
}
