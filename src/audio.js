import { CONFIG } from './config.js';
import { Music, prepareReverb } from './music.js';
import { readSound, writeSound } from './prefs.js';
import { mulberry32, clamp, lerp, smoothstep } from './util.js';
import { resolveChassis } from './chassis.js';
import { surfing, driftPreset } from './drift.js';

// Sound (SX, 2026-09-30: «Сделай звуки в игре»). Everything is synthesised in
// the browser with the Web Audio API: no sound files, nothing to load or to
// license, and a palette that belongs with the glyphs and the tube. A sound is
// a few layers, each an oscillator or a breath of noise under an envelope, its
// pitch sliding, its colour filtered; the engine, the retro and the brake are
// voices that run while the ship flies and follow its spool.
//
// Presentation only, like Feedback: it hears the world's events and reads the
// ship's state, and never writes to either. Nothing plays before the first key
// or click (a browser starts audio only on a gesture); O turns it all off and
// on, a display choice kept apart from the save.
//
// SX, 2026-09-30: «Убери шум движка то есть именно когда летишь, попробуй
// сделать фоновую тихую эмбиент мелодию космоса», then «простой звук полета
// пусть останется». The engine's noise is gone (the breath of forward thrust
// and the retro's thinner breath, both filtered noise), and so is the low room
// tone (two sines at 55 and 82 Hz: a drone that low tires the ear over a long
// flight). The engine's plain hum stays, one soft tone that follows the spool,
// and under the flight runs a quiet generative score (src/music.js). The
// brake's hiss stays too: it is heard only while SPACE is held. SX, 2026-10-07: «нужно чуть громче звук мотора сделать и сделать
// его нарастающим в зависимости от скорости + отдельный звук нужен для дрифта»: the hum 2 to 6 dB over its old level, louder and
// higher as the ship gathers speed, and the drift its own soft slide (CONFIG.sound.engine: `rise`, `slide`).
//
// And: «когда начинаешь стрелять например или врезаешься звуки заменяют друг
// друга, они должны скорее параллелиться». Nothing cut a sound off; the mix's
// compressor did: at -14 dB and 4:1 it pulled the whole mix down under every
// shot and crash, so what was already sounding dipped away as the new sound
// came, heard as one replacing the other. It is a peak limiter now, set above
// what the sounds reach together (CONFIG.sound.limiter), so sounds stack.

// ------------------------------------------------------------------ sounds ---

// Notes the chimes are made of: one major pentatonic, so any two of them heard
// together agree. It is the score's key as well (SX, 2026-10-16: «надо проверить, что все сейчас с саундтреком вместе в одной
// гамме было»; labs/graphics/sketches/sound-edit.html): the ambient is in D minor, and C D E G A rub against none of its chords
// (the fight's breakcore in A minor, which they fitted too, was taken out on 2026-10-20). Every tone a sound holds, and every
// slide where it lands, is on one of them, and so is every pitch an event plays a sound at (EVENT_SOUNDS); a sweep over an octave in under a quarter second (a shot,
// an explosion, a click) is a gesture, not a pitch. checks/audio.mjs holds it.
const N = { E1: 41.2, A1: 55, C2: 65.41, D2: 73.42, E2: 82.41, A2: 110, C3: 130.81, D3: 146.83, A3: 220, C4: 261.63, D4: 293.66,
  E4: 329.63, A4: 440, G4: 392, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66,
  E6: 1318.51, G6: 1567.98, A6: 1760, C7: 2093, E7: 2637, A7: 3520 };

// A layer: `wave` (sine, triangle, square, sawtooth) or 'noise'; `f` its
// frequency in Hz, or [from, to] slid exponentially over `slide` s (the whole
// layer by default); `at` when it starts within the sound; `a` its attack and
// `d` its decay, in s; `g` its peak gain; `filter` { type, f: Hz or [from, to],
// q }; `vib` [rate, depth Hz] a vibrato. A sound: its layers, how many may
// sound at once (`max`), its bus ('sfx' or 'ui') and a random `jitter` in cents,
// so a shot fired ten times is not ten copies.
const chime = (notes, { wave = 'sine', step = 0.08, d = 0.32, g = 0.07, at = 0 } = {}) =>
  notes.map((f, i) => ({ wave, f, at: at + i * step, a: 0.004, d, g }));

export const SOUNDS = {
  // Flight and combat.
  shot: { max: 4, jitter: 40, layers: [
    { wave: 'triangle', f: [1250, 300], a: 0.001, d: 0.09, g: 0.16 },
    { wave: 'noise', filter: { type: 'highpass', f: 4200 }, a: 0.001, d: 0.02, g: 0.05 },
  ] },
  // F1 (SX, 2026-10-16: «не хватает разных звуков стрельбы»): the pilot's shot in three takes played in turn (TAKES), each a
  // little apart in its sweep and its hiss, over the jitter.
  shotB: { max: 4, jitter: 40, layers: [
    { wave: 'triangle', f: [1180, 320], a: 0.001, d: 0.085, g: 0.16 },
    { wave: 'noise', filter: { type: 'highpass', f: 4700 }, a: 0.001, d: 0.022, g: 0.05 },
  ] },
  shotC: { max: 4, jitter: 40, layers: [
    { wave: 'triangle', f: [1330, 280], a: 0.001, d: 0.095, g: 0.15 },
    { wave: 'noise', filter: { type: 'highpass', f: 3800 }, a: 0.001, d: 0.018, g: 0.055 },
  ] },
  // A pirate's shot when its kind has none of its own.
  pirateShot: { max: 4, jitter: 60, layers: [
    { wave: 'square', f: [560, 170], a: 0.001, d: 0.11, g: 0.07, filter: { type: 'lowpass', f: 2400 } },
    { wave: 'noise', filter: { type: 'bandpass', f: 1300, q: 1.2 }, a: 0.001, d: 0.04, g: 0.05 },
  ] },
  // F2-F10: each pirate's own (PIRATE_SHOTS, by shotFired's `kind`), one family, a short sweep and a breath, so a fight is heard as
  // who fires: MAW barks, DART zips, BRUTE thuds, the WARLORD fires a fifth, NEEDLE a thin wire, WEAVER warbles, JACKAL snaps,
  // TENDER is soft (it mends), the boss is heavy.
  shotMaw: { max: 4, jitter: 60, layers: [
    { wave: 'square', f: [420, 120], a: 0.001, d: 0.12, g: 0.07, filter: { type: 'lowpass', f: 1800 } },
    { wave: 'noise', filter: { type: 'bandpass', f: 900, q: 1 }, a: 0.001, d: 0.05, g: 0.05 },
  ] },
  shotDart: { max: 4, jitter: 60, layers: [
    { wave: 'triangle', f: [980, 360], a: 0.001, d: 0.06, g: 0.08 },
    { wave: 'noise', filter: { type: 'highpass', f: 3600 }, a: 0.001, d: 0.02, g: 0.035 },
  ] },
  shotBrute: { max: 4, jitter: 50, layers: [
    { wave: 'sawtooth', f: [300, 85], a: 0.001, d: 0.14, g: 0.06, filter: { type: 'lowpass', f: 1300 } },
    { wave: 'noise', filter: { type: 'lowpass', f: [1600, 300] }, a: 0.001, d: 0.08, g: 0.06 },
  ] },
  shotWarlord: { max: 4, jitter: 40, layers: [
    { wave: 'square', f: [560, 170], a: 0.001, d: 0.11, g: 0.05, filter: { type: 'lowpass', f: 2200 } },
    { wave: 'square', f: [840, 255], a: 0.001, d: 0.11, g: 0.035, filter: { type: 'lowpass', f: 2200 } },
    { wave: 'noise', filter: { type: 'bandpass', f: 1300, q: 1.2 }, a: 0.001, d: 0.04, g: 0.04 },
  ] },
  shotNeedle: { max: 4, jitter: 40, layers: [
    { wave: 'sine', f: [2400, 700], a: 0.001, d: 0.05, g: 0.06 },
    { wave: 'noise', filter: { type: 'bandpass', f: 5200, q: 3 }, a: 0.0005, d: 0.006, g: 0.05 },
  ] },
  shotWeaver: { max: 4, jitter: 50, layers: [
    { wave: 'triangle', f: [720, 300], a: 0.002, d: 0.13, g: 0.07, vib: [24, 40] },
    { wave: 'noise', filter: { type: 'bandpass', f: 1100, q: 1.5 }, a: 0.001, d: 0.03, g: 0.03 },
  ] },
  shotJackal: { max: 4, jitter: 60, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: 1700, q: 1.4 }, a: 0.0005, d: 0.035, g: 0.08 },
    { wave: 'square', f: [520, 200], a: 0.001, d: 0.06, g: 0.04, filter: { type: 'lowpass', f: 2600 } },
  ] },
  shotTender: { max: 4, jitter: 40, layers: [
    { wave: 'triangle', f: [520, 260], a: 0.002, d: 0.1, g: 0.06 },
    { wave: 'noise', filter: { type: 'lowpass', f: 1400 }, a: 0.001, d: 0.03, g: 0.03 },
  ] },
  shotBoss: { max: 4, jitter: 30, layers: [
    { wave: 'square', f: [300, 80], a: 0.001, d: 0.18, g: 0.07, filter: { type: 'lowpass', f: 1600 } },
    { wave: 'sine', f: [90, 40], a: 0.002, d: 0.2, g: 0.12 },
    { wave: 'noise', filter: { type: 'lowpass', f: [2400, 300] }, a: 0.001, d: 0.12, g: 0.07 },
  ] },
  rockBreak: { max: 5, jitter: 80, layers: [
    { wave: 'noise', filter: { type: 'lowpass', f: [1900, 280] }, a: 0.002, d: 0.3, g: 0.22 },
    { wave: 'sine', f: [115, 45], a: 0.002, d: 0.22, g: 0.18 },
  ] },
  bump: { max: 2, jitter: 50, layers: [
    { wave: 'sine', f: [95, 50], a: 0.002, d: 0.13, g: 0.22 },
    { wave: 'noise', filter: { type: 'lowpass', f: 800 }, a: 0.001, d: 0.05, g: 0.08 },
  ] },
  // The tether snapping taut on a load that ran out of slack (src/tow.js): a low twang.
  tether: { max: 2, jitter: 40, layers: [
    { wave: 'triangle', f: [210, 95], a: 0.002, d: 0.16, g: 0.12 },
    { wave: 'noise', filter: { type: 'bandpass', f: 520, q: 2 }, a: 0.001, d: 0.05, g: 0.05 },
  ] },
  orbitBrush: { max: 1, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: [420, 140], q: 0.8 }, a: 0.03, d: 0.4, g: 0.09 },
  ] },
  hit: { max: 2, jitter: 30, layers: [
    { wave: 'square', f: [190, 60], a: 0.002, d: 0.18, g: 0.1, filter: { type: 'lowpass', f: 1400 } },
    { wave: 'noise', filter: { type: 'lowpass', f: [2600, 400] }, a: 0.002, d: 0.22, g: 0.2 },
  ] },
  // K8 (the key): its ring lands on A5 and its tick is E5 (they were near A5 + 39 cents and F#5).
  pirateHit: { max: 3, jitter: 50, layers: [
    { wave: 'triangle', f: [N.G6, N.A5], a: 0.001, d: 0.07, g: 0.1 },
    { wave: 'square', f: N.E5, a: 0.001, d: 0.03, g: 0.03 },
  ] },
  explosion: { max: 1, layers: [
    { wave: 'noise', filter: { type: 'lowpass', f: [2400, 70] }, a: 0.004, d: 1.5, g: 0.42 },
    { wave: 'sine', f: [92, 28], a: 0.004, d: 1.1, g: 0.34 },
    { wave: 'noise', filter: { type: 'bandpass', f: 3200, q: 1.5 }, at: 0.07, a: 0.01, d: 0.35, g: 0.06 },
  ] },
  explosionSmall: { max: 3, jitter: 60, layers: [
    { wave: 'noise', filter: { type: 'lowpass', f: [2800, 150] }, a: 0.003, d: 0.62, g: 0.28 },
    { wave: 'sine', f: [140, 42], a: 0.003, d: 0.42, g: 0.2 },
  ] },
  // K16: down to A1 and up again to A4 (the rise landed on G#4).
  warp: { max: 1, layers: [
    { wave: 'sine', f: [N.A4, N.A1], a: 0.05, d: 0.85, g: 0.14, vib: [7, 22] },
    { wave: 'noise', filter: { type: 'lowpass', f: [900, 90] }, a: 0.05, d: 0.9, g: 0.12 },
    { wave: 'sine', f: [N.A1, N.A4], at: 0.8, a: 0.05, d: 0.5, g: 0.07 },
  ] },
  // The rope past a dead edge throwing the ship back (World.stepBoundary): a soft, low twang that rises, once a dive.
  // K15: D2 to D3 (it landed on D3 + 37 cents).
  rope: { max: 1, layers: [
    { wave: 'triangle', f: [N.D2, N.D3], a: 0.03, d: 0.32, g: 0.08 },
    { wave: 'noise', filter: { type: 'bandpass', f: [260, 520], q: 1.5 }, a: 0.02, d: 0.18, g: 0.03 },
  ] },

  // Alerts.
  alarm: { max: 1, layers: [660, 880, 660, 880].map((f, i) => (
    { wave: 'square', f, at: i * 0.15, a: 0.004, d: 0.12, g: 0.06, filter: { type: 'lowpass', f: 2400 } })) },
  allClear: { max: 1, layers: chime([N.G5, N.E5, N.C5], { step: 0.1, g: 0.07 }) },
  loss: { max: 1, layers: [
    { wave: 'square', f: [392, 196], a: 0.004, d: 0.3, g: 0.06, filter: { type: 'lowpass', f: 1600 } },
    { wave: 'square', f: [330, 165], at: 0.16, a: 0.004, d: 0.34, g: 0.05, filter: { type: 'lowpass', f: 1400 } },
  ] },
  fuelLow: { max: 1, layers: [
    { wave: 'triangle', f: N.A5, a: 0.003, d: 0.08, g: 0.06 },
    { wave: 'triangle', f: N.A5, at: 0.16, a: 0.003, d: 0.08, g: 0.06 },
  ] },
  // K11: A3 down to A2 (it landed on F#2).
  fuelEmpty: { max: 1, layers: [
    { wave: 'sawtooth', f: [N.A3, N.A2], a: 0.01, d: 0.55, g: 0.05, filter: { type: 'lowpass', f: 900 } },
  ] },
  hullCritical: { max: 1, bus: 'ui', layers: [
    { wave: 'triangle', f: N.D6, a: 0.003, d: 0.06, g: 0.035 },
    { wave: 'triangle', f: N.A5, at: 0.08, a: 0.003, d: 0.08, g: 0.035 },
  ] },

  // Finds.
  // Six at once, not three: a rock's scatter is gathered in one pass of the hull and a
  // pirate's scoop shares the name, and at three a tenth of the coins in a ten minute
  // flight were refused (6 of 33, measured 2026-09-30). A sound over its cap is not
  // played (nothing sounding is ever cut short), so the cap must clear a scatter.
  // `max` 6 until 2026-10-01, when a rock's coins doubled (CONFIG.asteroid.drops.coins: up to 7 a break), and 9 until
  // 2026-10-02, when they went half as many again (up to 10 a break).
  // K1-K3 (the key): the coin's fourth is A5 to D6, where it was B5 to E6 (a B rubs against the ambient's B flat); a handful A5 D6
  // G6; a spill down the pentatonic, C6 where B5 was. Every coin the same two notes: a run of coins climbing the key was tried and
  // taken out the same day (SX, 2026-10-16: «верни пожалуйста монетки без прогрессии»).
  coin: { max: 12, jitter: 20, layers: [
    { wave: 'square', f: N.A5, a: 0.001, d: 0.05, g: 0.045, filter: { type: 'lowpass', f: 5000 } },
    { wave: 'square', f: N.D6, at: 0.05, a: 0.001, d: 0.13, g: 0.045, filter: { type: 'lowpass', f: 5000 } },
  ] },
  // A Scooby snack taken (src/specialQuests.js scooby; SX, 2026-10-21: «звук такой хрустящий, типа хрк, не как у монет»): no note, a
  // crunch: a rasp of noise falling from high to low through a narrow band, two cracks in it, a dull break at the end; the jitter makes no
  // two alike. Rendered offline (Firefox, 2026-10-21): 0.09 s, its energy a little under the coin's, its peak at the cargo link's.
  crunch: { max: 6, jitter: 120, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: [3600, 1500], q: 2.5 }, a: 0.001, d: 0.06, g: 0.14 },
    { wave: 'noise', filter: { type: 'highpass', f: 4300 }, at: 0.022, a: 0.001, d: 0.018, g: 0.09 },
    { wave: 'noise', filter: { type: 'bandpass', f: 2300, q: 4 }, at: 0.04, a: 0.001, d: 0.03, g: 0.11 },
    { wave: 'noise', filter: { type: 'bandpass', f: [1300, 600], q: 2 }, at: 0.068, a: 0.001, d: 0.07, g: 0.1 },
  ] },
  coins: { max: 2, layers: [N.A5, N.D6, N.G6].map((f, i) => (
    { wave: 'square', f, at: i * 0.05, a: 0.001, d: i === 2 ? 0.2 : 0.06, g: 0.045, filter: { type: 'lowpass', f: 5200 } })) },
  spill: { max: 1, layers: [N.E6, N.D6, N.C6, N.A5, N.G5].map((f, i) => (
    { wave: 'square', f, at: i * 0.045, a: 0.001, d: 0.05, g: 0.035, filter: { type: 'lowpass', f: 4000 } })) },
  // K6: a gulp from C4 to C5, then C5 to E5 (it landed on F#5).
  fuel: { max: 3, jitter: 30, layers: [
    { wave: 'sine', f: [N.C4, N.C5], a: 0.004, d: 0.13, g: 0.12 },
    { wave: 'sine', f: [N.C5, N.E5], at: 0.08, a: 0.004, d: 0.08, g: 0.05 },
  ] },
  tankFull: { max: 1, layers: [
    { wave: 'triangle', f: 330, a: 0.003, d: 0.07, g: 0.04 },
    { wave: 'triangle', f: 330, at: 0.1, a: 0.003, d: 0.07, g: 0.03 },
  ] },
  word: { max: 1, layers: [
    ...chime([N.C6, N.E6, N.G6], { d: 0.4, g: 0.07 }),
    ...chime([N.C6, N.E6, N.G6], { wave: 'triangle', d: 0.3, g: 0.02, at: 0.004 }),
  ] },
  cache: { max: 1, layers: [
    ...chime([N.G6, N.C7, N.E7], { step: 0.05, d: 0.3, g: 0.045 }),
    { wave: 'noise', filter: { type: 'highpass', f: 6500 }, a: 0.02, d: 0.3, g: 0.02 },
  ] },
  souvenir: { max: 1, layers: [
    ...chime([N.C6, N.E6, N.G6, N.C7, N.E7], { step: 0.06, d: 0.35, g: 0.05 }),
    { wave: 'triangle', f: N.C7, at: 0.3, a: 0.01, d: 0.9, g: 0.035 },
  ] },

  // Work.
  cargoLinked: { max: 1, layers: [
    { wave: 'noise', filter: { type: 'highpass', f: 2200 }, a: 0.001, d: 0.02, g: 0.09 },
    { wave: 'square', f: 196, at: 0.02, a: 0.002, d: 0.06, g: 0.06, filter: { type: 'lowpass', f: 1200 } },
    { wave: 'sine', f: N.C5, at: 0.09, a: 0.004, d: 0.18, g: 0.06 },
  ] },
  delivered: { max: 1, layers: [
    ...chime([N.C5, N.E5, N.G5, N.C6], { wave: 'triangle', step: 0.09, d: 0.3, g: 0.08 }),
    { wave: 'sine', f: N.C6, at: 0.27, a: 0.01, d: 0.7, g: 0.05 },
  ] },
  thanks: { max: 1, layers: chime([N.E6, N.G6], { at: 0.5, step: 0.1, d: 0.45, g: 0.05 }) },
  // K12, K13: the dock's thump C3 to C2, the undock's lift C2 to C3 (they landed on C#2 and B2).
  dock: { max: 1, layers: [
    { wave: 'sine', f: [N.C3, N.C2], a: 0.002, d: 0.16, g: 0.2 },
    { wave: 'noise', filter: { type: 'lowpass', f: 1200 }, a: 0.001, d: 0.05, g: 0.12 },
    { wave: 'square', f: 440, at: 0.2, a: 0.002, d: 0.05, g: 0.03, filter: { type: 'lowpass', f: 2000 } },
  ] },
  undock: { max: 1, layers: [
    { wave: 'noise', filter: { type: 'highpass', f: [1800, 600] }, a: 0.02, d: 0.35, g: 0.07 },
    { wave: 'sine', f: [N.C2, N.C3], a: 0.01, d: 0.22, g: 0.1 },
  ] },
  // K5: three rises a fourth each, D-G, E-A, G-C (they landed on F#, A + 39 cents, C + 47 cents); K4: the repair's taps on A6 (39
  // cents over it).
  refuel: { max: 1, layers: [[N.D4, N.G4], [N.E4, N.A4], [N.G4, N.C5]].map((f, i) => (
    { wave: 'sine', f, at: i * 0.07, a: 0.004, d: 0.07, g: 0.08 })) },
  repair: { max: 1, layers: [0, 0.12, 0.24].flatMap((at) => [
    { wave: 'triangle', f: N.A6, at, a: 0.001, d: 0.04, g: 0.05 },
    { wave: 'noise', filter: { type: 'bandpass', f: 3000, q: 2 }, at, a: 0.001, d: 0.02, g: 0.04 },
  ]) },
  purchase: { max: 1, layers: [
    { wave: 'square', f: N.E6, a: 0.001, d: 0.04, g: 0.04, filter: { type: 'lowpass', f: 5000 } },
    { wave: 'square', f: N.A6, at: 0.05, a: 0.001, d: 0.12, g: 0.04, filter: { type: 'lowpass', f: 5000 } },
  ] },
  purchaseShip: { max: 1, layers: [
    { wave: 'square', f: N.E6, a: 0.001, d: 0.04, g: 0.045, filter: { type: 'lowpass', f: 5000 } },
    { wave: 'square', f: N.A6, at: 0.06, a: 0.001, d: 0.12, g: 0.045, filter: { type: 'lowpass', f: 5000 } },
    ...chime([N.C5, N.E5, N.G5, N.C6], { wave: 'triangle', at: 0.18, step: 0.07, d: 0.35, g: 0.06 }),
  ] },
  // K14: E1 to E2 (it landed on D#2).
  engineStart: { max: 1, layers: [
    { wave: 'noise', filter: { type: 'lowpass', f: [200, 1300] }, a: 0.2, d: 0.45, g: 0.1 },
    { wave: 'triangle', f: [N.E1, N.E2], a: 0.2, d: 0.45, g: 0.12 },
  ] },
  chalk: { max: 1, layers: [0, 0.08, 0.17].map((at) => (
    { wave: 'noise', filter: { type: 'bandpass', f: 2600, q: 3 }, at, a: 0.005, d: 0.05, g: 0.06 })) },
  chalkErase: { max: 1, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: [1900, 1100], q: 2 }, a: 0.02, d: 0.22, g: 0.05 },
  ] },
  sector: { max: 1, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: [300, 1500], q: 0.9 }, a: 0.12, d: 0.4, g: 0.05 },
    { wave: 'sine', f: N.E5, at: 0.22, a: 0.01, d: 0.45, g: 0.035 },
  ] },
  // A friendly craft's horn (src/traffic.js): two soft notes, up a fourth.
  hail: { max: 1, layers: [
    { wave: 'triangle', f: N.G4, a: 0.01, d: 0.18, g: 0.07, vib: [5, 3] },
    { wave: 'triangle', f: N.C5, at: 0.16, a: 0.01, d: 0.3, g: 0.07, vib: [5, 3] },
  ] },
  ghost: { max: 1, layers: [
    { wave: 'sine', f: [880, 440], a: 0.4, d: 0.5, g: 0.05 },
    { wave: 'sine', f: [889, 444], a: 0.4, d: 0.5, g: 0.04 },
  ] },

  // The interface.
  panelOpen: { max: 1, bus: 'ui', layers: [{ wave: 'triangle', f: [660, 880], a: 0.002, d: 0.06, g: 0.04 }] },
  panelClose: { max: 1, bus: 'ui', layers: [{ wave: 'triangle', f: [880, 660], a: 0.002, d: 0.06, g: 0.035 }] },
  // A menu's move and a toggle, from the keyboard: the same dry key as a click (clickUi below), a little lower for a toggle; they
  // were a triangle's D6 and a sine's C6, tones twice as loud as the click that read as a soft «флоп» after it (SX, 2026-10-03).
  menu: { max: 2, bus: 'ui', jitter: 40, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: 4400, q: 3 }, a: 0.0002, d: 0.003, g: 0.07 },
    { wave: 'noise', filter: { type: 'bandpass', f: 3000, q: 2.2 }, at: 0.006, a: 0.0002, d: 0.005, g: 0.06 },
  ] },
  // K7: D3 (it was C#3).
  refuse: { max: 1, bus: 'ui', layers: [
    { wave: 'square', f: N.D3, a: 0.003, d: 0.12, g: 0.05, filter: { type: 'lowpass', f: 1200 } },
  ] },
  blip: { max: 2, bus: 'ui', jitter: 40, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: 3800, q: 3 }, a: 0.0002, d: 0.003, g: 0.07 },
    { wave: 'noise', filter: { type: 'bandpass', f: 2600, q: 2.2 }, at: 0.007, a: 0.0002, d: 0.005, g: 0.06 },
  ] },
  // The pointer's press (labs/graphics/cursor.js): what is pressed says itself (SX, 2026-10-02: «в разных сущностях должны быть
  // разного типа щелчки и звуки ... клик по диалогу тоже другой более приветливый, интерфейс и каждый курсор имеют свой
  // ненавязчивый системный стиль»), all short and quiet, on the interface's bus. Over open space each pointer has its own:
  // CROSS `tick` a dry switch, RING `tickRing` a soft round pip, CORNERS `tickCorners` two light clicks, DIAMOND `tickDiamond`
  // a glassy ping.
  tick: { max: 2, bus: 'ui', jitter: 30, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: 3600, q: 2.5 }, a: 0.0005, d: 0.014, g: 0.05 },
    { wave: 'triangle', f: [2400, 1500], a: 0.0005, d: 0.018, g: 0.012 },
  ] },
  // K9, K10: RING's pip C6 to G5, DIAMOND's ping E7 and A7 (they landed on F#5 and B7).
  tickRing: { max: 2, bus: 'ui', jitter: 25, layers: [{ wave: 'sine', f: [N.C6, N.G5], a: 0.002, d: 0.045, g: 0.035 }] },
  tickCorners: { max: 2, bus: 'ui', jitter: 30, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: 4200, q: 3 }, a: 0.0005, d: 0.008, g: 0.04 },
    { wave: 'noise', filter: { type: 'bandpass', f: 3400, q: 3 }, at: 0.028, a: 0.0005, d: 0.008, g: 0.03 },
  ] },
  tickDiamond: { max: 2, bus: 'ui', jitter: 20, layers: [
    { wave: 'triangle', f: N.E7, a: 0.001, d: 0.06, g: 0.02 },
    { wave: 'sine', f: N.A7, a: 0.001, d: 0.03, g: 0.01 },
  ] },
  // What a press lands on: a find's notice a light two-note chime; a plate (the cargo's split flaps, the quest list) a flap's
  // dull clack; a conversation, the friendliest, a warm rising pair (kept for the NPCs' dialogs); every menu item and button of
  // the interface the system's click, a mechanical keyboard's key (SX, 2026-10-03: «сухой ... щелчок, типа ... как набор по
  // механической клавиатуре», then «нет никаких сухих щелчков ... какие-то просто флопы. А я хочу, чтобы были высокие щелчки»):
  // the switch's click at 5.2 kHz with a 2 ms edge, then 7 ms on the cap meeting the plate at 3.3 kHz, 23 ms in all and no
  // tail, nothing under 700 Hz. Measured offline: its spectrum's middle at 4.3 kHz, its loudness the old one's (RMS 0.0032).
  // The first take, with a case's knock at 560 Hz, put 39 % of its energy under 700 Hz: the «флоп».
  clickFind: { max: 2, bus: 'ui', layers: chime([N.E6, N.A6], { step: 0.05, d: 0.12, g: 0.03 }) },
  // A beat of the opening coming in after it waited its turn (labs/graphics/opening-focus.js): its event's own sound played as it
  // happened, so this is only a soft rising pair, under the find's, to turn the eye to the notice.
  beat: { max: 1, bus: 'ui', layers: chime([N.A5, N.E6], { step: 0.09, d: 0.22, g: 0.035 }) },
  clickPlate: { max: 2, bus: 'ui', jitter: 60, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: 1400, q: 1.6 }, a: 0.001, d: 0.03, g: 0.07 },
    { wave: 'sine', f: [220, 140], a: 0.001, d: 0.04, g: 0.04 },
  ] },
  clickDialog: { max: 2, bus: 'ui', layers: [
    { wave: 'triangle', f: N.C5, a: 0.004, d: 0.09, g: 0.04 },
    { wave: 'triangle', f: N.G5, at: 0.05, a: 0.004, d: 0.14, g: 0.04 },
  ] },
  // U2 (SX, 2026-10-16: «звуков кнопок не хватает»): the same click with a body, a soft E6 under it for 50 ms, nothing under 700
  // Hz still, so a button is heard as pressed, not only touched.
  clickUi: { max: 3, bus: 'ui', jitter: 40, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: 5200, q: 3 }, a: 0.0002, d: 0.003, g: 0.09 },
    { wave: 'square', f: 2900, a: 0.0002, d: 0.0025, g: 0.012, filter: { type: 'highpass', f: 2000 } },
    { wave: 'noise', filter: { type: 'bandpass', f: 3300, q: 2.2 }, at: 0.007, a: 0.0002, d: 0.006, g: 0.08 },
    { wave: 'sine', f: N.E6, at: 0.003, a: 0.002, d: 0.05, g: 0.016 },
  ] },
  // U1: the pointer come onto a button or a row (src/hover.js hoverEntered): a breath of a click, half the press's level, a third
  // of its length.
  hover: { max: 2, bus: 'ui', jitter: 40, layers: [
    { wave: 'noise', filter: { type: 'bandpass', f: 6200, q: 4 }, a: 0.0003, d: 0.004, g: 0.035 },
  ] },
  // T1 (SX: «посмотри обучение, какие звуки в игре желательны»): a skill's hint ended by the deed itself (src/skillHints.js
  // `learned`), not by its time running out: a soft rising A5 E6 A6, once a skill, the game saying «yes, that».
  learned: { max: 1, bus: 'ui', layers: [
    { wave: 'sine', f: N.A5, a: 0.004, d: 0.3, g: 0.03 },
    { wave: 'sine', f: N.E6, at: 0.07, a: 0.004, d: 0.32, g: 0.03 },
    { wave: 'sine', f: N.A6, at: 0.14, a: 0.004, d: 0.5, g: 0.028 },
    { wave: 'triangle', f: N.A6, at: 0.14, a: 0.02, d: 0.9, g: 0.01 },
  ] },
  start: { max: 1, bus: 'ui', layers: [
    ...chime([N.G4, N.C5, N.E5, N.G5], { step: 0.06, d: 0.3, g: 0.06 }),
    { wave: 'sine', f: [55, 110], a: 0.02, d: 0.35, g: 0.12 },
  ] },
  soundOn: { max: 1, bus: 'ui', layers: chime([N.C6, N.E6], { step: 0.08, d: 0.14, g: 0.05 }) },
  // The tube's degaussing coil as the filter comes on, a collapsing dot as it goes.
  crtOn: { max: 1, bus: 'ui', layers: [
    { wave: 'noise', filter: { type: 'highpass', f: 5000 }, a: 0.001, d: 0.02, g: 0.05 },
    { wave: 'square', f: 50, a: 0.01, d: 0.8, g: 0.1, filter: { type: 'lowpass', f: 380 }, vib: [9, 6] },
    { wave: 'noise', filter: { type: 'lowpass', f: 300 }, a: 0.005, d: 0.3, g: 0.08 },
  ] },
  crtOff: { max: 1, bus: 'ui', layers: [
    { wave: 'noise', filter: { type: 'highpass', f: 5000 }, a: 0.001, d: 0.03, g: 0.04 },
    { wave: 'sine', f: [1000, 90], a: 0.002, d: 0.16, g: 0.05 },
  ] },
};

// Sounds played as takes in turn (F1): the name played and the names it plays.
export const TAKES = Object.freeze({ shot: Object.freeze(['shot', 'shotB', 'shotC']) });

// How long a sound lasts, from its layers.
export function soundLength(def) {
  return Math.max(...def.layers.map((l) => (l.at || 0) + (l.a ?? 0.002) + (l.d ?? 0.1)));
}

// ------------------------------------------------------------------ events ---

// What the world's events sound like. Each entry takes the event and gives a
// sound's name, or options { name, gain, pitch }, or nothing; the pan and the
// fall-off with distance are worked out from where it happened (soundsFor).
// Every event the world emits is either here or in SILENT, with the reason,
// so a new event has to be given a sound or a reason (checks/audio.mjs).
// A pirate's shot by its kind (shotFired's `kind`: its type, or 'boss').
export const PIRATE_SHOTS = Object.freeze({ maw: 'shotMaw', dart: 'shotDart', brute: 'shotBrute', warlord: 'shotWarlord',
  needle: 'shotNeedle', weaver: 'shotWeaver', jackal: 'shotJackal', tender: 'shotTender', boss: 'shotBoss' });
// Pitches in the key (K17-K24): a fourth (4/3, 3/4), a fifth (2/3), two fourths down (9/16), a whole tone and two (DRIFT_STEPS).
const FOURTH = 4 / 3, DOWN_FOURTH = 3 / 4;
const DRIFT_STEPS = Object.freeze([1, 2 ** (2 / 12), 2 ** (4 / 12)]);

export const EVENT_SOUNDS = {
  shotFired: (e) => (e.owner === 'pirate' ? PIRATE_SHOTS[e.kind] ?? 'pirateShot' : 'shot'),
  rockBroken: (e) => ({ name: 'rockBreak', pitch: [0.75, 1, 1.35][e.tier] ?? 1, gain: [1, 0.8, 0.6][e.tier] ?? 0.6 }),
  shipBumped: () => 'bump',
  // The container meeting something (src/tow.js): the bump, lower and heavier, louder the harder.
  cargoBumped: (e) => ({ name: 'bump', pitch: 0.72, gain: Math.min(1, 0.35 + (e.speed || 0) / 400) }),
  tetherSnapped: (e) => ({ name: 'tether', gain: Math.min(1, 0.4 + (e.pull || 0) / 200) }),
  droidArrived: () => 'blip',
  stationBroken: () => 'loss',
  // A station worn to a tenth by hard blows (CONFIG.station.wear.warn): the loss's sound, lighter than its breaking, a fourth up
  // (K22: it was 1.2, A#4 and G4 + 17 cents).
  stationWorn: () => ({ name: 'loss', gain: 0.5, pitch: FOURTH }),
  stationRepaired: () => 'repair',
  droidServed: (e) => (e.kind === 'fuel' ? 'refuel' : 'repair'),
  // A friendly ship's favor (src/npcTalk.js giveFavor): fuel or hull sound as a droid's service does; a tip as the find marked or the word.
  npcFavor: (e) => (e.kind === 'fuel' ? 'refuel' : e.kind === 'hull' ? 'repair' : 'blip'),
  orbitContact: () => 'orbitBrush',
  // The drift and the trick (src/drift.js, src/trick.js), on sounds the game has until SX hears them: the push out of a drift the
  // undock's lift, higher by tier; a jump the same, low and soft; a clean contact a light tap (the M0 page: «чисто — мягкий щелчок»),
  // one off the mark the bump; a planet's pinball the bump, brighter.
  // K24: a tier a whole tone up, C D E (it was 1.12 and 1.24 a tier).
  driftBoost: (e) => ({ name: 'undock', pitch: DRIFT_STEPS[Math.min(2, e.tier || 0)], gain: 0.7 }),
  jumped: () => ({ name: 'undock', pitch: DOWN_FOURTH, gain: 0.45 }),
  landed: (e) => (e.clean ? { name: 'bump', pitch: 1.7, gain: 0.45 } : { name: 'bump', pitch: 0.85, gain: 0.9 }),
  jumpBounced: () => ({ name: 'bump', pitch: 1.3, gain: 0.9 }),
  shipDamaged: () => 'hit',
  shipWrecked: () => 'explosion',
  pirateHit: () => 'pirateHit',
  pirateDown: () => 'explosionSmall',
  npcDown: () => 'explosionSmall',
  piratesEngaged: () => 'alarm',
  // The boss (src/boss.js), on the game's sounds until SX hears it: it reacts with a squad's alarm, its escort out of the bay the same
  // alarm lower, a hit a pirate's, a sled shot off a pirate's breaking, and beaten the big explosion.
  bossWoke: () => 'alarm',
  bossLaunch: () => ({ name: 'alarm', gain: 0.6, pitch: 2 / 3 }),
  bossHit: () => ({ name: 'pirateHit', gain: 0.7 }),
  bossSledOff: () => 'explosionSmall',
  bossDefeated: () => 'explosion',
  // Its quest come: the radio's word, as a signal heard (the quest is the story's, not an alarm); its waking is its own `bossSpawned`.
  bossQuestOffered: () => 'word',
  // COMMONS's chain (src/chorus.js): begun, the radio's word; a recorder taken, the cargo's link; a voice back, the coins it pays; the four
  // back, the all-clear.
  chorusBegun: () => 'word',
  chorusTaken: () => 'cargoLinked',
  chorusVoiceBack: () => 'coins',
  chorusDone: () => 'allClear',
  encounterEnded: (e) => (e.cause === 'wrecked' ? null : 'allClear'),
  creditsSeized: () => 'loss',
  pickupClaimed: (e) => (e.drop ? 'coin' : 'coins'),
  snackTaken: () => 'crunch',
  coinsSpilled: () => 'spill',
  fuelClaimed: () => 'fuel',
  // A pirate's part mends the hull (World.collectPickups): the repair's own sound.
  partClaimed: () => 'repair',
  tankFull: () => 'tankFull',
  signalHeard: (e) => (e.kind === 'word' ? 'word' : 'coins'),
  // A find's notice sounds as N8 QUIET did on labs/graphics/sketches/item-notices.html (SX's pick, 2026-10-02): the word's chime.
  cacheOpened: (e) => (e.isNew ? 'word' : 'cache'),
  contractAccepted: () => 'cargoLinked',
  cargoRecovered: () => 'cargoLinked',
  cargoReturned: () => 'blip',
  delivered: (e) => (e.alreadySettled ? 'refuse' : 'delivered'),
  docked: () => 'dock',
  undocked: () => 'undock',
  refueled: () => 'refuel',
  hullRepaired: () => 'repair',
  coffeeDrunk: () => 'purchase',
  shipBought: () => 'purchaseShip',
  shipChanged: () => 'engineStart',
  signPlaced: () => 'chalk',
  signRemoved: () => 'chalkErase',
  // A flag of the map taken down by hand (src/flags.js): the sign's sound, a mark rubbed out.
  flagRemoved: () => 'chalkErase',
  sectorEntered: () => 'sector',
  holeTransit: () => 'warp',
  boundaryBlocked: () => 'rope',
  fuelLow: () => 'fuelLow',
  fuelEmpty: () => 'fuelEmpty',
  traceRequested: () => 'ghost',
  hangarRequested: () => 'panelOpen',
  // The home garage's door opens on the room (src/home.js), a screen like the hangar's.
  homeEntered: () => 'panelOpen',
  findMarked: () => 'word',
  stationInvested: () => 'coins',
  networkComplete: () => 'purchaseShip',
  collectionComplete: () => 'souvenir',
  paintFound: () => 'word',
  // A look given (src/looks.js): the find's chime, as a paint's.
  lookFound: () => 'word',
  // A pointer given for random quests (src/cursors.js).
  cursorFound: () => 'word',
  // The radio a quest gives (src/questHooks.js giveRadio): a find's chime, as a pointer's.
  radioGiven: () => 'word',
  // (A ship the pilot rammed swearing, or enraged, `angry`: the horn lower, as a pirate's shout is.)
  // K17-K20: a hail a fourth down when angry, two fourths down from a pirate, a coin of loot a fourth down (0.7, 0.6, 0.8 and 0.7
  // were off the key: C#4 F#4, A#3 D#4, D#4 G#4, F5 A#5); K21 the boss's launch a fifth down.
  trafficHail: (e) => (e.angry ? { name: 'hail', pitch: DOWN_FOURTH, gain: 0.8 } : 'hail'),
  // A named craft out of O-08 come into the sector (src/traffic.js): the arrival's blip; its horn is the hail.
  visitorArrived: () => 'blip',
  stationRestored: () => 'purchaseShip',
  actionRefused: () => 'refuse',
  stationLog: () => 'blip',
  // A pirate scooping the pilot's coins: the coin sound, from where it is, lower.
  pirateLoot: () => ({ name: 'coin', pitch: DOWN_FOURTH, gain: 0.7 }),
  // A pirate's shout (src/pirates.js): the hail's horn, low and short, from where it is.
  pirateShout: () => ({ name: 'hail', pitch: DOWN_FOURTH * DOWN_FOURTH, gain: 0.55 }),
  // Raids (src/raids.js): one begun is an alarm, one won the all-clear, one lost a loss; a ruin's guards beaten, the
  // all-clear's chime.
  raidStarted: () => 'alarm',
  raidWon: () => 'allClear',
  raidLost: () => 'loss',
  ruinCleared: () => 'allClear',
  // A pilot out of fuel helped (src/quests.js): the refuel's sound, then the pay's coins are the plate's.
  drifterHelped: () => 'refuel',
  // The second round of quests (QUESTS_V2_HANDOFF.md): a call for help is a radio call, the hail's horn, heard in the
  // middle and low; a ship freed is the all-clear and one lost the loss, as a raid's are; money given to a wreck is the
  // coins' sound, lower, going out; a suitcase taken is the cargo's link, delivered the delivery's chime, lost the loss.
  pesterStarted: () => ({ name: 'hail', pitch: DOWN_FOURTH, gain: 0.8 }),
  pesterFreed: () => 'allClear',
  pesterLost: () => 'loss',
  wreckHelped: () => ({ name: 'coins', pitch: 0.75 }),
  errandTaken: () => 'blip',
  suitcaseTaken: () => 'cargoLinked',
  suitcaseDelivered: () => 'delivered',
  suitcaseLost: () => 'loss',
  // The reference ships' rare quests (src/specials.js): a ship boarded is an engine starting, a quest won the souvenir's
  // fanfare, one lost the loss; a train loaded is the cargo's link and a crate unloaded the delivery's chime.
  specialBoarded: () => 'engineStart',
  specialDone: () => 'souvenir',
  specialFailed: () => 'loss',
  specialStage: (e) => (e.stage === 'unloaded' ? 'delivered' : 'cargoLinked'),
  // The radio's line (src/guide.js): a step heard is the blip of a signal coming in; a step paid is the coins' sound.
  guideHeard: () => 'blip',
  // The opening chapter (src/opening.js): a line on the radio as the guide's is heard; the locator and the map fitted as a find marked;
  // SCOOTY JR. handed back as a ship changed (its own shuttle's engine starting); the braking practice done, a blip.
  openingCall: () => 'blip',
  openingPractice: () => 'blip',
  openingFitted: () => 'word',
  loanerReturned: () => 'engineStart',
  guidePaid: () => 'coins',
  // The first-dock support (src/starterSupport.js): the offer a signal coming in, the run done the same, the building the fanfare of a
  // station restored (what it adds to the construction is seen on the station).
  starterSupport: (e) => (e.stage === 'built' ? 'purchaseShip' : 'blip'),
};

export const SILENT = {
  openingNote: 'a word of where the pilot is, with no voice (src/opening.js NOTES): the notch says it, nothing calls',
  suitcaseAmbush: 'its squad comes with the pirates\' own sounds (piratesEngaged); the notch says the case is to be brought',
  coffeeWoreOff: 'a quiet end: the notch says it, and the ship flies as it always did (the cup had its sound, coffeeDrunk)',
  bossPattern: 'its warnings are its glyph cues, as a pirate\'s are; its shots and its escort keep their own sounds',
  bossPhase: 'its phase is read from what it does and how far it has come apart (SX, 2026-10-14: «номер фазы тоже не нужно»)',
  bossHealed: 'it heals as the pilot is wrecked: the wreck\'s own sounds are playing',
  bossSpawned: 'it comes lying in wait at its quest\'s mark (or in the lab): the alarm is for when it reacts (bossWoke)',
  bossMoved: 'it moves as the pilot is wrecked: the wreck\'s own sounds are playing; its banner says it',
  bossQuestDone: 'its end is bossDefeated\'s explosion, the same step; the window says the rest',
  chorusLine: 'its pieces are seen over the station, the ring\'s lamps answering each (SX\'s V1 HAIL); no voice is synthesised',
  chorusDropped: 'it drops as the pilot is wrecked: the wreck\'s own sounds are playing; its banner says it',
  pirateAttackPhase: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  piratePattern: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  mineLaid: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  mineRemoved: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  repairPulse: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  repairInterrupted: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  repairSupplySpent: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  capsuleSecured: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  capsuleEscaped: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  capsuleDropped: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  capsuleRecovered: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',
  newEnemySystemsEnded: 'combat is signalled by its world glyph cue; shots and impacts keep their own sound',

  sectorLeft: 'the sector entered right after it has the sound',
  outatime: 'an Easter egg keeps its own counsel',
  pirateGreed: 'a pirate turning for coins is seen, not heard',
  pirateGreedEnd: 'nor its turning back',
  pirateBoost: 'a pirate\'s burst is seen by its puff (src/pirateStyles.js); a squad of five would make it a constant noise',
  pirateFled: 'a pirate running is seen and says so (its shout); the fight ending is the sound',
  questOffered: 'a side quest is seen coming in the list, quietly: it is an offer, not an alarm',
  droidLeft: 'a droid going is seen on the locator, not heard',
  rescueCharged: 'said in the wreck, whose explosion is the sound',
  specialSeen: 'a reference ship standing is seen by its marker on the screen\'s edge, and heard when it speaks (its hail)',
  specialGone: 'a reference ship that goes unmet goes without a sound',
  homeDocking: 'the ship\'s own thrusters are the sound of the way in, and `docked` clunks when it stops in the berth',
  homeLeaving: 'the door and the bridge are seen, and `undocked` is the sound of being let go',
  sectorOpened: 'it comes with the restoration that opened it, whose fanfare is the sound; its notice says it',
  openingStage: 'the objective\'s plate is seen turning green; the act that moved the chapter on has its own sound',
  // The smoke clouds (src/clouds.js), a prototype on the lab's ?clouds= until SX picks: seen, not heard, for now.
  cloudEntered: 'a cloud is flown into in silence; the way the hull cuts through it, its wisp and the smoke at the view\'s sides are the effect',
  cloudLeft: 'nor out of it',
  cloudSplash: 'the landing in it is heard (`landed`); the way it cuts on through the smoke is seen',
};

// Sounds that belong to a place in the world: panned by where it is on the
// screen and quieter with distance past the view's edge, silent past `hearing`.
// The rest (the interface, alarms, a delivery) are heard in the middle.
const PLACED = new Set(['shot', 'pirateShot', ...Object.values(PIRATE_SHOTS), 'rockBreak', 'bump', 'tether', 'orbitBrush', 'pirateHit', 'explosion',
  'explosionSmall', 'coin', 'coins', 'spill', 'fuel', 'tankFull', 'chalk', 'chalkErase', 'hail']);

// The sounds one event makes: [{ name, pan, gain, pitch }], or none. `r` is the
// renderer, for where on the screen a place in the world is.
export function soundsFor(event, world, r) {
  const map = EVENT_SOUNDS[event.type];
  if (!map) return [];
  const got = map(event);
  if (!got) return [];
  const one = typeof got === 'string' ? { name: got } : got;
  const out = [{ pan: 0, gain: 1, pitch: 1, ...one }];
  // A rescue's delivery ends with the pilot's thanks.
  if (event.type === 'delivered' && event.rescued) out.push({ name: 'thanks', pan: 0, gain: 1, pitch: 1 });
  const S = CONFIG.sound;
  if (PLACED.has(one.name) && Number.isFinite(event.x) && Number.isFinite(event.y) && r && world?.project) {
    if (event.sectorId && world.sector && event.sectorId !== world.sector.id) return [];
    const p = world.project(r, event.x, event.y);
    const cx = r.cx ?? r.width / 2, cy = r.cy ?? r.height / 2;
    const half = Math.max(1, r.width / 2);
    const pan = Math.max(-1, Math.min(1, (p.x - cx) / half)) * S.panWidth;
    // How far past the edge of the screen, in world units (a unit is `zoom` px: the camera's height, src/zoom.js).
    const past = Math.max(0, Math.abs(p.x - cx) - half, Math.abs(p.y - cy) - r.height / 2) / (r.zoom ?? 1);
    if (past > S.hearing) return [];
    const fall = 1 - past / S.hearing;
    for (const s of out) { s.pan = pan; s.gain *= fall * fall; }
  }
  return out;
}

// Whether a fight is on (the skills' hints wait for peace, src/skillHints.js): a squad's or a raid's encounter, or the boss awake and
// not yet beaten.
export const inFight = (world) => !!world?.encounter || !!(world?.boss && !world.boss.dormant && !world.boss.defeated);

// ------------------------------------------------------------- preference ---

// A display choice, not progress: its own key (src/prefs.js), never part of the save. Missing, broken or junk storage means sound
// on.
export const readSoundPreference = (store) => readSound(store);
export const writeSoundPreference = (on, store) => writeSound(on, store);

// ------------------------------------------------------------ preparation ---

// The noise every noise layer plays, seeded and made once, and no context needed:
// 96000 samples, two seconds at 48 kHz (a context at another rate plays the same
// samples at its own: white noise is white at any rate).
const NOISE_LENGTH = 96000;
let noiseSamples = null;
export function noiseData() {
  if (!noiseSamples) {
    const rng = mulberry32(0x5eed);
    noiseSamples = new Float32Array(NOISE_LENGTH);
    for (let i = 0; i < NOISE_LENGTH; i++) noiseSamples[i] = rng() * 2 - 1;
  }
  return noiseSamples;
}

// Everything the sound needs that an AudioContext is not needed to make: the noise
// and the score's reverb. The first call to unlock() is on a key press, in front
// of the first frames of the flight, and made these then (20 ms of it the reverb's
// 308 thousand exponentials); the plan behind the title (labs/graphics/boot.js)
// runs this a piece a frame instead. Yields the share done.
export function* prepareSound() {
  noiseData();
  yield 0.1;
  for (const share of prepareReverb()) yield 0.1 + 0.9 * share;
}

// ------------------------------------------------------------------ voices ---

// A running voice's level follows the ship: it heads for `target` with time
// constant `tau` from now, and is also set heading for nothing a little later
// (CONFIG.sound.deadman). Every frame cancels that fall and sets it again, so
// while frames come it never starts; if they stop, a thrown error in the frame, a
// hang, the page's loop dying, the audio clock carries on without them and the
// voice fades itself out instead of droning at its last level for good.
function follow(param, target, tau, t) {
  const D = CONFIG.sound.deadman;
  param.cancelScheduledValues(t);
  param.setTargetAtTime(target, t, tau);
  param.setTargetAtTime(0, t + D.after, D.fall);
}

// How the engine's hum sits for each chassis: a COURIER's is higher and
// quicker, a HAULER's lower (src/chassis.js).
const ENGINE_PITCH = { standard: 1, courier: 1.28, hauler: 0.78 };
// Seconds from the sound going silent (off, or the master at 0) to its context's sleep: the mix's fade, five times its glide.
const SILENT_AFTER = 0.15;

export class Sound {
  // `createContext` makes the AudioContext (a fake in checks); nothing is made
  // until unlock(), which a key or a click calls.
  constructor({ createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)() } = {}) {
    this.createContext = createContext;
    this.ctx = null;
    this.enabled = true;
    this.voices = new Map();       // sound name -> end times of the ones playing
    this.error = null;
    this.alarmIn = 0;              // seconds to the next low-hull beep
    this.musicOn = true;           // the score (src/music.js), under O's switch
    this.sleeping = new Set();     // why the context sleeps: 'hidden', 'paused' (sleep)
    this.sleepTimer = 0;
    // The player's volumes, 0..1 each (SX, 2026-10-02: «настройки в меню паузы и дать там настроить громкости музыки, общий мастер,
    // звуки системы, эффекты в космосе»; labs/graphics/volume-panel.js): the whole mix, the score, the interface's sounds and the
    // space's (the world's sounds and the engine). They scale the levels of CONFIG.sound; O still turns it all off.
    this.volumes = { ...CONFIG.sound.volumes };
    this.turns = {};               // F1: the take a sound with takes played last
  }

  // One of the volumes, `v` 0..1, heard at once.
  setVolume(name, v) {
    if (!(name in this.volumes)) return;
    this.volumes[name] = Math.max(0, Math.min(1, Number(v) || 0));
    this.applyVolumes();
    this.hushWhenSilent();
  }
  // Off (O) or the whole mix at nothing, the context sleeps (the effects audit of 2026-10-06, path #16): the gain at 0 alone left the
  // hum, the brake's hiss and the score's reverb (a 3.5 s stereo convolver, the dearest node there is) running on the audio thread for
  // nothing. It sleeps `SILENT_AFTER` s after, when the mix has faded (applyVolumes glides in 0.03 s), so it is not cut off loud.
  hushWhenSilent() {
    this.sleep(!this.enabled || this.volumes.master <= 0, 'silent', { after: SILENT_AFTER });
  }
  // The gains the switches and the volumes make, set over a moment.
  applyVolumes(glide = 0.03) {
    if (!this.ready) return;
    const S = CONFIG.sound, V = this.volumes, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? S.master * V.master : 0, t, glide);
    for (const [name, level] of Object.entries(S.buses)) {
      const v = name === 'music' ? (this.musicOn ? V.music : 0) : name === 'ui' ? V.ui : V.space;
      this.buses[name]?.gain.setTargetAtTime(level * v, t, name === 'music' ? Math.max(glide, 0.03) : glide);
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  // Whether the browser is holding the sound back: the context is made, but no key or press has yet let it run (the
  // autoplay rule of Firefox, Chrome and Safari). Not so while the page itself put it to sleep (sleep).
  get held() {
    return !!this.ctx && this.ctx.state === 'suspended' && this.awake;
  }

  // The first gesture makes the context and the voices that always run; a later
  // one only wakes it. Failing (no Web Audio) leaves the game silent, never broken.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && this.enabled && this.awake) this.ctx.resume?.(); return this.ready; }
    try {
      this.ctx = this.createContext();
    } catch (error) {
      this.error = String(error?.message || error);
      return false;
    }
    const ctx = this.ctx, S = CONFIG.sound;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? S.master * this.volumes.master : 0;
    // A peak limiter, so an explosion over a volley never clips, and nothing
    // more: below its threshold it does not compress, so a new sound adds to what
    // is playing instead of pushing it down. It is not silent below the threshold,
    // though: Chrome's compressor adds make-up gain, about +1.7 dB on everything
    // under 0.5 of full scale (measured on a steady tone, 2026-09-30: in 0.5, out
    // 0.605; +1.4 dB at 0.7; -1.0 dB at 1.0), so the mix leaves it a little louder
    // than the sum of its buses. `master` was set by ear with that included.
    const L = S.limiter;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = L.threshold; limit.knee.value = L.knee; limit.ratio.value = L.ratio;
    limit.attack.value = L.attack; limit.release.value = L.release;
    this.master.connect(limit);
    limit.connect(ctx.destination);
    this.buses = {};
    for (const [name, level] of Object.entries(S.buses)) {
      const bus = ctx.createGain();
      bus.gain.value = level * (name === 'music' ? (this.musicOn ? this.volumes.music : 0) : name === 'ui' ? this.volumes.ui : this.volumes.space);
      bus.connect(this.master);
      this.buses[name] = bus;
    }
    // White noise, shared by every noise layer and voice: made before the context
    // (prepareSound, behind the title), so the key that starts the flight only
    // copies it in.
    const noise = noiseData();
    this.noise = ctx.createBuffer(1, noise.length, ctx.sampleRate);
    this.noise.getChannelData(0).set(noise);
    this.noiseSpan = (0.75 * noise.length) / ctx.sampleRate;      // where a voice may start in it
    this.buildVoices();
    this.music = new Music(ctx, this.buses.music);
    if (ctx.state === 'suspended' && this.awake) ctx.resume?.();
    else if (!this.awake) ctx.suspend?.();
    return this.ready;
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.hushWhenSilent();
    if (this.ready) {
      this.applyVolumes();
      if (this.enabled && this.awake && this.ctx.state === 'suspended') this.ctx.resume?.();
    }
    return this.enabled;
  }

  // The score alone, on or off (the sound board's switch): it fades, and no
  // new note is scheduled while it is off.
  setMusic(on) {
    this.musicOn = !!on;
    if (this.ready) this.buses.music.gain.setTargetAtTime(this.musicOn ? CONFIG.sound.buses.music * this.volumes.music : 0, this.ctx.currentTime, 0.5);
    return this.musicOn;
  }

  // A hidden page stops drawing frames, so nothing would quiet the engine:
  // the context sleeps with the page instead. A paused game sleeps it too, the
  // score as well (SX, 2026-10-01: «сделай так, чтобы при паузе звук тоже
  // останавливался. А то там фоновая мелодия играет»): `reason` names why, and the
  // context wakes only when no reason is left. A pause sleeps it `after` a moment,
  // so the key's own tick is heard first.
  sleep(on, reason = 'hidden', { after = 0 } = {}) {
    if (on === this.sleeping.has(reason)) return;
    if (on) this.sleeping.add(reason); else this.sleeping.delete(reason);
    clearTimeout(this.sleepTimer);
    if (!this.ready) return;
    if (!this.sleeping.size) { if (this.enabled) this.ctx.resume?.(); return; }
    if (after > 0) this.sleepTimer = setTimeout(() => { if (this.sleeping.size) this.ctx.suspend?.(); }, after * 1000);
    else this.ctx.suspend?.();
  }

  get awake() {
    return !this.sleeping.size;
  }

  // The voices that run while the ship flies, each silent until update() opens
  // it: the engine's hum, the brake's hiss and the drift's slide. Made once, here; a frame only moves their parameters.
  buildVoices() {
    const ctx = this.ctx;
    // One draw of the page's chance for both noise voices, as there was for the brake alone: the golden master runs the page on a
    // seeded Math.random, and a second draw would move every look-only effect after it.
    const from = Math.random() * this.noiseSpan;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 2600; filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(this.buses.engine);
    src.start(0, from);
    this.brake = { src, filter, gain };
    // The drift's slide (CONFIG.sound.engine.slide): the same noise, half the buffer on, so it never doubles the brake's grain.
    const SL = CONFIG.sound.engine.slide;
    const slideSrc = ctx.createBufferSource();
    slideSrc.buffer = this.noise; slideSrc.loop = true;
    const slideFilter = ctx.createBiquadFilter();
    slideFilter.type = 'lowpass'; slideFilter.frequency.value = SL.cutoff[0]; slideFilter.Q.value = SL.q;
    const slideGain = ctx.createGain();
    slideGain.gain.value = 0;
    slideSrc.connect(slideFilter); slideFilter.connect(slideGain); slideGain.connect(this.buses.engine);
    slideSrc.start(0, (from + this.noiseSpan / 2) % this.noiseSpan);
    this.slide = { src: slideSrc, filter: slideFilter, gain: slideGain };
    const osc = ctx.createOscillator();
    osc.type = 'triangle'; osc.frequency.value = 48;
    const hum = ctx.createGain();
    hum.gain.value = 0;
    osc.connect(hum); hum.connect(this.buses.engine);
    osc.start();
    this.engine = { hum: { osc, gain: hum } };
  }

  // One frame: the hum and the brake follow the ship, and the score is
  // scheduled ahead. `active` is false while the game is paused, a panel is
  // open or the title is up: the ship's voices fade then, and under a panel the
  // score plays on (it is the room, not the ship). P's pause sleeps all of it (sleep).
  update(world, input, dt, { active = true } = {}) {
    if (!this.ready || !this.brake) return;
    const S = CONFIG.sound, t = this.ctx.currentTime;
    const ship = world.ship;
    const live = active && ship.alive && !world.docked;
    const spool = live && ship.thrusting ? ship.spool * (ship.limp ?? 1) : 0;
    const speed = Math.hypot(ship.vx, ship.vy);
    const pitch = ENGINE_PITCH[ship.chassis?.id] ?? 1;
    const hum = this.engine.hum, E = S.engine, R = E.rise;
    // The speed's share of the hull's own top (1,500 u/s for every hull until the top speeds went to two thirds, 2026-10-04), on a
    // smoothstep: the hum grows louder and higher with it, evenly through the middle, with no step at rest or at the top (SX,
    // 2026-10-07: «чуть громче ... нарастающим в зависимости от скорости»).
    const share = smoothstep(speed / resolveChassis(ship.chassis?.id).maxSpeed);
    const loud = 10 ** (lerp(R.db[0], R.db[1], share) / 20);
    follow(hum.gain.gain, E.hum * loud * (spool > 0 ? 0.35 + 0.65 * spool : 0), 0.06, t);
    hum.osc.frequency.setTargetAtTime((R.hz + R.spoolHz * spool + R.speedHz * share) * pitch, t, 0.12);
    // The glide (G1: src/drift.js surfing) is no brake, and has no brake's hiss.
    const braking = live && input?.damp && speed > 30 && !surfing(world) ? Math.min(1, speed / 400) : 0;
    follow(this.brake.gain.gain, E.brake * braking, 0.04, t);
    // The drift's own slide (SX, the same day: «отдельный звук нужен для дрифта»): in with the drift, its cutoff and level following
    // the nose's angle off the course, out over `release` once it is let go.
    const SL = E.slide, d = live ? world.drift : null;
    if (d) {
      const wide = clamp(Math.abs(d.slide) / (driftPreset(world)?.maxSlide || 1), 0, 1);
      this.slide.filter.frequency.setTargetAtTime(SL.cutoff[0] * (SL.cutoff[1] / SL.cutoff[0]) ** wide, t, SL.attack);
      follow(this.slide.gain.gain, SL.level * lerp(SL.angle[0], SL.angle[1], wide) * lerp(SL.speed[0], SL.speed[1], share), SL.attack, t);
    } else follow(this.slide.gain.gain, 0, SL.release, t);
    if (this.enabled && this.musicOn) this.music?.update(t);

    // A hull down to a quarter beeps now and then, while flying.
    const low = live && world.hull <= Math.floor((world.hullMax ?? CONFIG.hull.max) / 4);
    if (!low) this.alarmIn = 0;
    else if ((this.alarmIn -= dt) <= 0) {
      this.play('hullCritical');
      this.alarmIn = S.hullAlarmEvery;
    }
  }

  // The world's events, as they are drained each frame.
  handle(event, world, r) {
    for (const s of soundsFor(event, world, r)) this.play(s.name, s);
  }

  // Plays a sound now: panned (-1..1), scaled in gain and pitch. False when it
  // did not play (locked, off, unknown, or as many already sounding as it allows).
  // A press of the mouse that clicked says itself once: the interface's own tones the action plays after it (a menu's move, a
  // panel's opening) are let go for `seconds` (labs/graphics/main.js; SX, 2026-10-03: «одно нажатие ... сухой щелчок»).
  hush(names, seconds) {
    this.hushed = new Set(names);
    this.hushedUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + seconds * 1000;
  }

  play(name, { pan = 0, gain = 1, pitch = 1 } = {}) {
    if (!this.ready || !this.enabled) return false;
    // A sound with takes plays them in turn (F1), the voices counted for all its takes together under its own name.
    const asked = name;
    if (TAKES[name]) { const takes = TAKES[name]; this.turns[name] = ((this.turns[name] ?? -1) + 1) % takes.length; name = takes[this.turns[name]]; }
    const def = SOUNDS[name];
    if (!def) return false;
    if (this.hushed?.has(asked) && (typeof performance !== 'undefined' ? performance.now() : Date.now()) < this.hushedUntil) return false;
    const ctx = this.ctx, now = ctx.currentTime;
    const playing = (this.voices.get(asked) || []).filter((end) => end > now);
    if (playing.length >= (def.max ?? 3)) { this.voices.set(asked, playing); return false; }
    const t0 = now + 0.004;
    const cents = def.jitter ? (Math.random() * 2 - 1) * def.jitter : 0;
    const scale = pitch * 2 ** (cents / 1200);
    const out = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (out.pan) out.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(this.buses[def.bus || 'sfx']);
    let open = def.layers.length, end = t0;
    const done = () => { if (--open === 0) out.disconnect(); };
    for (const layer of def.layers) end = Math.max(end, this.layer(layer, t0, out, gain, scale, done));
    playing.push(end);
    this.voices.set(asked, playing);
    return true;
  }


  // One layer, scheduled at `t0`; returns when it ends and calls `done` then.
  layer(L, t0, out, gain, scale, done) {
    const ctx = this.ctx;
    const start = t0 + (L.at || 0);
    const a = L.a ?? 0.002, d = L.d ?? 0.1, end = start + a + d;
    const nodes = [];
    let src;
    if (L.wave === 'noise') {
      src = ctx.createBufferSource();
      src.buffer = this.noise; src.loop = true;
    } else {
      src = ctx.createOscillator();
      src.type = L.wave;
      const [f0, f1] = Array.isArray(L.f) ? L.f : [L.f, L.f];
      src.frequency.setValueAtTime(f0 * scale, start);
      if (f1 !== f0) src.frequency.exponentialRampToValueAtTime(f1 * scale, start + (L.slide ?? a + d));
      if (L.vib) {
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = L.vib[0]; depth.gain.value = L.vib[1] * scale;
        lfo.connect(depth); depth.connect(src.frequency);
        lfo.start(start); lfo.stop(end + 0.02);
        nodes.push(lfo, depth);
      }
    }
    nodes.push(src);
    let tail = src;
    if (L.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = L.filter.type;
      const [g0, g1] = Array.isArray(L.filter.f) ? L.filter.f : [L.filter.f, L.filter.f];
      filter.frequency.setValueAtTime(g0, start);
      if (g1 !== g0) filter.frequency.exponentialRampToValueAtTime(g1, end);
      if (L.filter.q) filter.Q.value = L.filter.q;
      tail.connect(filter);
      tail = filter;
      nodes.push(filter);
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, L.g * gain), start + a);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    tail.connect(env);
    env.connect(out);
    nodes.push(env);
    src.onended = () => { for (const n of nodes) n.disconnect(); done(); };
    if (L.wave === 'noise') src.start(start, Math.random() * this.noiseSpan); else src.start(start);
    src.stop(end + 0.02);
    return end;
  }
}
